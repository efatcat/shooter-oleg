const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const startButton = document.getElementById("startButton");
const devConsole = document.getElementById("devConsole");
const devConsoleInput = document.getElementById("devConsoleInput");
const devConsoleHint = document.getElementById("devConsoleHint");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const HALF_HEIGHT = HEIGHT / 2;
const FOV = Math.PI / 3;
const HALF_FOV = FOV / 2;
const RAYS = 240;
const MAX_DEPTH = 32;
const MOVE_SPEED = 2.8;
const SPRINT_SPEED = 4.1;
const ROT_SPEED = 2.6;
const ENEMY_PROJECTILE_SPEED = 4.6;
const TAU = Math.PI * 2;

const map = [
  "################",
  "#......#.......#",
  "#......#..##...#",
  "#...............#",
  "#..##.....#.....#",
  "#...............#",
  "#......#........#",
  "#..#.......##...#",
  "#...............#",
  "#....##.........#",
  "#...........#...#",
  "#..#............#",
  "#......##.......#",
  "#...............#",
  "#.......#.......#",
  "################",
];

const wallColors = ["#8ec5ff", "#6da7ff", "#63f3ff", "#99f6e4"];
const keys = new Set();

const ASSET_PATHS = {
  pistol: "./1gan.png",
  auto: "./2gan.png",
  grenadeLauncher: "./3gan.png",
  rifle: "./4gan.png",
  ak: "./5gan.png",
  bomb: "./bomb.png",
  monster: "./monster.png",
  hp: "./hp.png",
  terUp: "./ter_up.png",
  timeUp: "./time_up.png",
  wall: "./stena.png",
  floor: "./pol.png",
};
const assets = {};
let cachedSkyGradient = null;
let cachedFloorPattern = null;

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}

for (const [key, src] of Object.entries(ASSET_PATHS)) {
  assets[key] = loadImage(src);
}

const WEAPONS = [
  {
    id: "pistol",
    slot: 1,
    name: "Pistol",
    imageKey: "pistol",
    kind: "hitscan",
    damage: 34,
    spread: 0.01,
    aimCone: 0.08,
    range: 10,
    cooldown: 0.4,
    automatic: false,
    color: "#cbd5e1",
    glow: "#f8fafc",
    dropScale: 0.62,
    viewScale: 0.62,
  },
  {
    id: "auto",
    slot: 2,
    name: "Auto",
    imageKey: "auto",
    kind: "hitscan",
    damage: 13,
    spread: 0.03,
    aimCone: 0.1,
    range: 9.5,
    cooldown: 0.08,
    automatic: true,
    color: "#60a5fa",
    glow: "#bfdbfe",
    dropScale: 0.74,
    viewScale: 0.78,
  },
  {
    id: "rifle",
    slot: 3,
    name: "Rifle",
    imageKey: "rifle",
    kind: "hitscan",
    damage: 120,
    spread: 0.004,
    aimCone: 0.035,
    range: 16,
    cooldown: 0.6,
    automatic: false,
    color: "#d8b4fe",
    glow: "#f3e8ff",
    dropScale: 0.76,
    viewScale: 0.9,
  },
  {
    id: "ak",
    slot: 4,
    name: "AK",
    imageKey: "ak",
    kind: "hitscan",
    damage: 24,
    spread: 0.02,
    aimCone: 0.085,
    range: 12,
    cooldown: 0.11,
    automatic: true,
    color: "#f59e0b",
    glow: "#fde68a",
    dropScale: 0.8,
    viewScale: 0.88,
  },
  {
    id: "grenadeLauncher",
    slot: 5,
    name: "Grenade Launcher",
    imageKey: "grenadeLauncher",
    kind: "grenade",
    damage: 999,
    splashRadius: 2.5,
    baseSplashRadius: 2.5,
    cooldown: 1.5,
    baseCooldown: 1.5,
    automatic: false,
    projectileSpeed: 5.2,
    projectileLife: 1.1,
    color: "#f97316",
    glow: "#fdba74",
    dropScale: 0.82,
    viewScale: 0.94,
  },
];

const GRENADE_WEAPON_INDEX = WEAPONS.findIndex((weapon) => weapon.id === "grenadeLauncher");
const GRENADE_BOOST_TYPES = {
  reload: {
    label: "Reload",
    shortLabel: "RL",
    imageKey: "timeUp",
    color: "#38bdf8",
    glow: "#7dd3fc",
    maxStacks: 5,
    chance: 0.05,
    multiplier: 0.8,
  },
  radius: {
    label: "Blast Radius",
    shortLabel: "AOE",
    imageKey: "terUp",
    color: "#f97316",
    glow: "#fdba74",
    maxStacks: 5,
    chance: 0.05,
    multiplier: 1.15,
  },
};

const player = {
  x: 3.5,
  y: 3.5,
  angle: 0,
  hp: 100,
  score: 0,
  kills: 0,
  weaponBob: 0,
  hurtTimer: 0,
  weaponKick: 0,
  reload: 0,
  alive: true,
  weaponIndex: 0,
  unlockedWeapons: [0],
  godMode: false,
  grenadeBoosts: { reload: 0, radius: 0 },
  radius: 0.2,
};

const state = {
  lastTime: performance.now(),
  enemies: [],
  enemyProjectiles: [],
  particles: [],
  pickups: [],
  weaponDrops: [],
  boosterDrops: [],
  grenades: [],
  explosions: [],
  spawnTimer: 2,
  wave: 1,
  elapsed: 0,
  pointerLocked: false,
  flash: 0,
  minimapPulse: 0,
  mouseDown: false,
  consoleOpen: false,
};

const spawnPoints = [
  [12.5, 3.5],
  [13.5, 11.5],
  [10.5, 13.5],
  [5.5, 12.5],
  [2.5, 10.5],
  [11.5, 7.5],
];

function getCurrentWeapon() {
  return WEAPONS[player.weaponIndex];
}

function hasGrenadeLauncher() {
  return player.unlockedWeapons.includes(GRENADE_WEAPON_INDEX);
}

function getGrenadeStats() {
  const weapon = WEAPONS[GRENADE_WEAPON_INDEX];
  return {
    cooldown: weapon.baseCooldown * Math.pow(GRENADE_BOOST_TYPES.reload.multiplier, player.grenadeBoosts.reload),
    splashRadius: weapon.baseSplashRadius * Math.pow(GRENADE_BOOST_TYPES.radius.multiplier, player.grenadeBoosts.radius),
  };
}

function resetGame() {
  player.x = 3.5;
  player.y = 3.5;
  player.angle = 0;
  player.hp = 100;
  player.score = 0;
  player.kills = 0;
  player.weaponBob = 0;
  player.hurtTimer = 0;
  player.weaponKick = 0;
  player.reload = 0;
  player.alive = true;
  player.weaponIndex = 0;
  player.unlockedWeapons = [0];
  player.godMode = false;
  player.grenadeBoosts.reload = 0;
  player.grenadeBoosts.radius = 0;

  state.enemies = [];
  state.enemyProjectiles = [];
  state.particles = [];
  state.pickups = [];
  state.weaponDrops = [];
  state.boosterDrops = [];
  state.grenades = [];
  state.explosions = [];
  state.spawnTimer = 2;
  state.wave = 1;
  state.elapsed = 0;
  state.flash = 0;
  state.mouseDown = false;
}

function setConsoleMessage(message) {
  devConsoleHint.textContent = message;
}

function openConsole() {
  state.consoleOpen = true;
  state.mouseDown = false;
  devConsole.classList.remove("hidden");
  devConsoleInput.value = "";
  devConsoleInput.focus();
  setConsoleMessage("Commands: god, hp 500, weapon 5, spawn 20");
  if (document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }
}

function closeConsole() {
  state.consoleOpen = false;
  devConsole.classList.add("hidden");
  devConsoleInput.blur();
}

function normalizeCommand(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function unlockWeapon(index) {
  if (index < 0 || index >= WEAPONS.length) return false;
  if (!player.unlockedWeapons.includes(index)) {
    player.unlockedWeapons.push(index);
    player.unlockedWeapons.sort((a, b) => a - b);
  }
  player.weaponIndex = index;
  return true;
}

function spawnEnemiesByCount(count) {
  for (let i = 0; i < count; i += 1) {
    spawnEnemy();
  }
}

function setWave(level) {
  const wave = Math.max(1, level);
  state.wave = wave;
  state.spawnTimer = 0.1;
  player.score = Math.max(player.score, (wave - 1) * 450);
  const cap = 4 + wave * 2;
  const toSpawn = Math.max(0, Math.min(cap, wave + 2) - state.enemies.length);
  spawnEnemiesByCount(toSpawn);
}

function executeConsoleCommand(rawCommand) {
  const command = normalizeCommand(rawCommand);
  if (!command) {
    setConsoleMessage("Empty command");
    return;
  }

  if (command === "\u0431\u0435\u0441\u0441\u043c\u0435\u0440\u0442\u0438\u0435" || command === "god" || command === "godmode") {
    player.godMode = !player.godMode;
    setConsoleMessage("God mode: " + (player.godMode ? "on" : "off"));
    return;
  }

  if (command.startsWith("\u0434\u043e\u043f \u0445\u043f ") || command.startsWith("hp ")) {
    const value = Number(command.split(" ").pop());
    if (Number.isFinite(value)) {
      player.hp += value;
      setConsoleMessage("HP: " + Math.ceil(player.hp));
    } else {
      setConsoleMessage("Example: hp 500");
    }
    return;
  }

  if (command.startsWith("\u0432\u044b\u0434\u0430\u0442\u044c \u043e\u0440\u0443\u0436\u0438\u0435 ") || command.startsWith("weapon ")) {
    const value = Number(command.split(" ").pop());
    if (Number.isFinite(value) && value >= 1 && value <= WEAPONS.length) {
      unlockWeapon(value - 1);
      setConsoleMessage("Weapon: " + WEAPONS[value - 1].name);
    } else {
      setConsoleMessage("Example: weapon 5");
    }
    return;
  }

  if (command.startsWith("\u0441\u043f\u0430\u0432\u043d \u043c\u043e\u0431\u043e\u0432 ") || command.startsWith("spawn mobs ") || command.startsWith("spawn ")) {
    const value = Number(command.split(" ").pop());
    if (Number.isFinite(value) && value > 0) {
      spawnEnemiesByCount(Math.floor(value));
      setConsoleMessage("Spawned mobs: " + Math.floor(value));
    } else {
      setConsoleMessage("Example: spawn 20");
    }
    return;
  }

  if (command === "\u0443\u0434\u0430\u043b\u0438\u0442\u044c \u043c\u043e\u0431\u043e\u0432" || command === "clear mobs" || command === "killall") {
    state.enemies = [];
    state.enemyProjectiles = [];
    setConsoleMessage("All mobs removed");
    return;
  }

  if (command.startsWith("\u043d\u0430\u043a\u0440\u0443\u0442\u0438\u0442\u044c \u043a\u0438\u043b\u044b ") || command.startsWith("kills ")) {
    const value = Number(command.split(" ").pop());
    if (Number.isFinite(value)) {
      player.kills += Math.floor(value);
      setConsoleMessage("Kills: " + player.kills);
    } else {
      setConsoleMessage("Example: kills 100");
    }
    return;
  }

  if (command.startsWith("\u043d\u0430\u0447\u0430\u0442\u044c \u0432\u043e\u043b\u043d\u0443 ") || command.startsWith("wave ")) {
    const value = Number(command.split(" ").pop());
    if (Number.isFinite(value) && value > 0) {
      setWave(Math.floor(value));
      setConsoleMessage("Wave: " + Math.floor(value));
    } else {
      setConsoleMessage("Example: wave 10");
    }
    return;
  }

  setConsoleMessage("Unknown command");
}

function isWall(x, y) {
  const mx = Math.floor(x);
  const my = Math.floor(y);
  if (my < 0 || my >= map.length || mx < 0 || mx >= map[0].length) return true;
  return map[my][mx] === "#";
}

function collidesWithWall(x, y, radius) {
  return (
    isWall(x - radius, y - radius) ||
    isWall(x + radius, y - radius) ||
    isWall(x - radius, y + radius) ||
    isWall(x + radius, y + radius)
  );
}

function normalizeAngle(angle) {
  while (angle < -Math.PI) angle += TAU;
  while (angle > Math.PI) angle -= TAU;
  return angle;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lineOfSight(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy);
  const steps = Math.max(4, Math.floor(distance * 18));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (isWall(x1 + dx * t, y1 + dy * t)) return false;
  }
  return true;
}

function castRay(angle) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  let depth = 0.02;

  while (depth < MAX_DEPTH) {
    depth += 0.02;
    const x = player.x + cos * depth;
    const y = player.y + sin * depth;
    if (isWall(x, y)) {
      const fx = x - Math.floor(x);
      const fy = y - Math.floor(y);
      const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
      const hitVertical = Math.min(fx, 1 - fx) < Math.min(fy, 1 - fy);
      const textureCoord = hitVertical ? fy : fx;
      return {
        depth,
        edge,
        hue: wallColors[(Math.floor(x) + Math.floor(y)) % wallColors.length],
        textureX: clamp(textureCoord, 0, 0.999),
      };
    }
  }

  return { depth: MAX_DEPTH, edge: 0, hue: wallColors[0], textureX: 0 };
}

function spawnEnemy() {
  const [x, y] = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
  if (Math.hypot(player.x - x, player.y - y) < 4) return;

  const hp = 60 + state.wave * 16;
  state.enemies.push({
    x,
    y,
    radius: 0.28,
    hp,
    maxHp: hp,
    speed: 0.8 + Math.random() * 0.3 + state.wave * 0.04,
    attackCooldown: 0,
    shotCooldown: 1.5 + Math.random(),
    hitFlash: 0,
    drift: Math.random() * TAU,
  });
}

function spawnPickup(x, y) {
  state.pickups.push({ x, y, radius: 0.2, life: 16 });
}

function maybeSpawnWeaponDrop(x, y) {
  if (Math.random() >= 0.2) return;

  const lockedWeapons = WEAPONS.filter((weapon, index) => {
    if (player.unlockedWeapons.includes(index)) return false;
    if (state.weaponDrops.some((drop) => drop.weaponIndex === index)) return false;
    if (index === GRENADE_WEAPON_INDEX && player.unlockedWeapons.length < WEAPONS.length - 1) return false;
    return true;
  });

  if (!lockedWeapons.length) return;

  const weapon = lockedWeapons[Math.floor(Math.random() * lockedWeapons.length)];
  const weaponIndex = WEAPONS.findIndex((item) => item.id === weapon.id);
  state.weaponDrops.push({
    x,
    y,
    radius: 0.24,
    life: 24,
    pulse: Math.random() * TAU,
    weaponIndex,
  });
}

function maybeSpawnGrenadeBoosterDrop(x, y) {
  if (!hasGrenadeLauncher()) return;
  if (Math.random() >= GRENADE_BOOST_TYPES.reload.chance) return;

  const availableBoosts = Object.entries(GRENADE_BOOST_TYPES)
    .filter(([type, info]) => player.grenadeBoosts[type] < info.maxStacks)
    .filter(([type]) => !state.boosterDrops.some((drop) => drop.type === type));

  if (!availableBoosts.length) return;

  const lowestStack = Math.min(...availableBoosts.map(([type]) => player.grenadeBoosts[type]));
  const balancedBoosts = availableBoosts.filter(([type]) => player.grenadeBoosts[type] === lowestStack);
  const [type, info] = balancedBoosts[Math.floor(Math.random() * balancedBoosts.length)];

  state.boosterDrops.push({
    x,
    y,
    radius: 0.22,
    life: 22,
    pulse: Math.random() * TAU,
    type,
    color: info.color,
  });
}

function spawnParticles(x, y, color, amount, force = 1) {
  for (let i = 0; i < amount; i += 1) {
    const angle = Math.random() * TAU;
    const speed = (0.25 + Math.random() * 0.75) * force;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      z: Math.random() * 0.3,
      vz: Math.random() * 0.04,
      color,
      life: 0.35 + Math.random() * 0.55,
      age: 0,
    });
  }
}

function spawnExplosion(x, y, radius, color) {
  state.explosions.push({
    x,
    y,
    radius,
    age: 0,
    life: 0.35,
    color,
  });
}

function killEnemy(enemy, cause = "default") {
  state.enemies = state.enemies.filter((item) => item !== enemy);
  player.score += 125;
  player.kills += 1;
  spawnParticles(enemy.x, enemy.y, "#fb7185", 22, 1.1);
  if (Math.random() < 0.48) spawnPickup(enemy.x, enemy.y);
  maybeSpawnWeaponDrop(enemy.x, enemy.y);
  if (cause === "grenade") {
    maybeSpawnGrenadeBoosterDrop(enemy.x, enemy.y);
  }
}
function traceHitscan(shotAngle, weapon) {
  let bestEnemy = null;
  let bestDist = weapon.range;

  for (const enemy of state.enemies) {
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > weapon.range) continue;

    const angleToEnemy = Math.atan2(dy, dx);
    if (Math.abs(normalizeAngle(angleToEnemy - shotAngle)) > weapon.aimCone) continue;

    const ray = castRay(angleToEnemy);
    if (ray.depth + 0.02 < dist) continue;

    if (dist < bestDist) {
      bestDist = dist;
      bestEnemy = enemy;
    }
  }

  return bestEnemy;
}

function fireHitscanWeapon(weapon) {
  const shotAngle = player.angle + (Math.random() - 0.5) * weapon.spread;
  const target = traceHitscan(shotAngle, weapon);

  if (!target) {
    spawnParticles(
      player.x + Math.cos(player.angle) * 1.2,
      player.y + Math.sin(player.angle) * 1.2,
      weapon.color,
      6,
      0.45
    );
    return;
  }

  target.hp -= weapon.damage;
  target.hitFlash = 0.16;
  spawnParticles(target.x, target.y, weapon.glow, 8, 0.65);

  if (target.hp <= 0) {
    killEnemy(target, "hitscan");
  }
}

function fireGrenadeLauncher(weapon) {
  const grenadeStats = getGrenadeStats();
  state.grenades.push({
    x: player.x + Math.cos(player.angle) * 0.7,
    y: player.y + Math.sin(player.angle) * 0.7,
    vx: Math.cos(player.angle) * weapon.projectileSpeed,
    vy: Math.sin(player.angle) * weapon.projectileSpeed,
    life: weapon.projectileLife,
    radius: 0.16,
    splashRadius: grenadeStats.splashRadius,
    damage: weapon.damage,
    weaponIndex: player.weaponIndex,
  });
}

function fireCurrentWeapon() {
  if (!player.alive || player.reload > 0) return;

  const weapon = getCurrentWeapon();
  player.reload = weapon.kind === "grenade" ? getGrenadeStats().cooldown : weapon.cooldown;
  player.weaponKick = 1;
  state.flash = 1;

  if (weapon.kind === "grenade") {
    fireGrenadeLauncher(weapon);
  } else {
    fireHitscanWeapon(weapon);
  }
}

function equipWeapon(index) {
  if (player.unlockedWeapons.includes(index)) {
    player.weaponIndex = index;
  }
}

function updatePlayer(dt) {
  let moveX = 0;
  let moveY = 0;
  const forwardX = Math.cos(player.angle);
  const forwardY = Math.sin(player.angle);
  const strafeX = Math.cos(player.angle + Math.PI / 2);
  const strafeY = Math.sin(player.angle + Math.PI / 2);
  const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? SPRINT_SPEED : MOVE_SPEED;

  if (keys.has("KeyW")) {
    moveX += forwardX;
    moveY += forwardY;
  }
  if (keys.has("KeyS")) {
    moveX -= forwardX;
    moveY -= forwardY;
  }
  if (keys.has("KeyA")) {
    moveX -= strafeX;
    moveY -= strafeY;
  }
  if (keys.has("KeyD")) {
    moveX += strafeX;
    moveY += strafeY;
  }
  if (keys.has("ArrowLeft") || keys.has("KeyQ")) {
    player.angle -= ROT_SPEED * dt;
  }
  if (keys.has("ArrowRight") || keys.has("KeyE")) {
    player.angle += ROT_SPEED * dt;
  }

  if (moveX || moveY) {
    const len = Math.hypot(moveX, moveY);
    moveX = (moveX / len) * speed * dt;
    moveY = (moveY / len) * speed * dt;
    const nextX = player.x + moveX;
    const nextY = player.y + moveY;
    if (!collidesWithWall(nextX, player.y, player.radius)) player.x = nextX;
    if (!collidesWithWall(player.x, nextY, player.radius)) player.y = nextY;
    player.weaponBob += dt * (speed > MOVE_SPEED ? 12 : 9);
  }

  if (player.reload > 0) player.reload -= dt;
  player.weaponKick = Math.max(0, player.weaponKick - dt * 9);
  player.hurtTimer = Math.max(0, player.hurtTimer - dt * 2.5);
  state.minimapPulse += dt;

  const weapon = getCurrentWeapon();
  if (state.mouseDown && weapon.automatic) {
    fireCurrentWeapon();
  }
}

function updateEnemies(dt) {
  for (const enemy of state.enemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    const seesPlayer = lineOfSight(enemy.x, enemy.y, player.x, player.y);
    enemy.drift += dt;

    if (seesPlayer && dist > 1.5) {
      const mx = (dx / dist) * enemy.speed * dt;
      const my = (dy / dist) * enemy.speed * dt;
      if (!isWall(enemy.x + mx, enemy.y)) enemy.x += mx;
      if (!isWall(enemy.x, enemy.y + my)) enemy.y += my;
    } else if (!seesPlayer) {
      const mx = Math.cos(enemy.drift) * 0.25 * dt;
      const my = Math.sin(enemy.drift * 1.2) * 0.25 * dt;
      if (!isWall(enemy.x + mx, enemy.y)) enemy.x += mx;
      if (!isWall(enemy.x, enemy.y + my)) enemy.y += my;
    }

    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    enemy.shotCooldown -= dt;

    if (dist < 1.15 && enemy.attackCooldown <= 0) {
      damagePlayer(12);
      enemy.attackCooldown = 0.9;
    }

    if (seesPlayer && dist < 7.5 && enemy.shotCooldown <= 0) {
      state.enemyProjectiles.push({
        x: enemy.x,
        y: enemy.y,
        vx: (dx / dist) * ENEMY_PROJECTILE_SPEED,
        vy: (dy / dist) * ENEMY_PROJECTILE_SPEED,
        life: 3.2,
      });
      enemy.shotCooldown = 1.2 + Math.random() * 1.4;
    }
  }
}

function updateEnemyProjectiles(dt) {
  state.enemyProjectiles = state.enemyProjectiles.filter((shot) => {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;

    if (isWall(shot.x, shot.y)) {
      spawnParticles(shot.x, shot.y, "#f97316", 7, 0.5);
      return false;
    }

    if (Math.hypot(player.x - shot.x, player.y - shot.y) < 0.35) {
      damagePlayer(8);
      spawnParticles(shot.x, shot.y, "#fca5a5", 9, 0.65);
      return false;
    }

    return shot.life > 0;
  });
}

function explodeGrenade(grenade) {
  const weapon = WEAPONS[grenade.weaponIndex];
  spawnExplosion(grenade.x, grenade.y, grenade.splashRadius, weapon.color);
  spawnParticles(grenade.x, grenade.y, weapon.color, 34, 1.3);

  const victims = state.enemies.filter(
    (enemy) => Math.hypot(enemy.x - grenade.x, enemy.y - grenade.y) <= grenade.splashRadius
  );

  for (const enemy of victims) {
    enemy.hp -= grenade.damage;
  }

  for (const enemy of [...victims]) {
    if (enemy.hp <= 0) {
      killEnemy(enemy, "grenade");
    }
  }
}

function updateGrenades(dt) {
  const survivors = [];

  for (const grenade of state.grenades) {
    grenade.x += grenade.vx * dt;
    grenade.y += grenade.vy * dt;
    grenade.life -= dt;

    const hitEnemy = state.enemies.find(
      (enemy) => Math.hypot(enemy.x - grenade.x, enemy.y - grenade.y) <= enemy.radius + grenade.radius
    );

    if (isWall(grenade.x, grenade.y) || grenade.life <= 0 || hitEnemy) {
      explodeGrenade(grenade);
      continue;
    }

    survivors.push(grenade);
  }

  state.grenades = survivors;
}

function updateExplosions(dt) {
  state.explosions = state.explosions.filter((explosion) => {
    explosion.age += dt;
    return explosion.age < explosion.life;
  });
}

function updatePickups(dt) {
  state.pickups = state.pickups.filter((pickup) => {
    pickup.life -= dt;
    if (Math.hypot(player.x - pickup.x, player.y - pickup.y) < 0.55) {
      player.hp = Math.min(100, player.hp + 24);
      spawnParticles(pickup.x, pickup.y, "#86efac", 14, 0.7);
      return false;
    }
    return pickup.life > 0;
  });
}

function updateWeaponDrops(dt) {
  state.weaponDrops = state.weaponDrops.filter((drop) => {
    drop.life -= dt;
    drop.pulse += dt * 5;

    if (Math.hypot(player.x - drop.x, player.y - drop.y) < 0.65) {
      if (!player.unlockedWeapons.includes(drop.weaponIndex)) {
        player.unlockedWeapons.push(drop.weaponIndex);
        player.unlockedWeapons.sort((a, b) => a - b);
        player.weaponIndex = drop.weaponIndex;
        const weapon = WEAPONS[drop.weaponIndex];
        spawnParticles(drop.x, drop.y, weapon.color, 18, 0.9);
      }
      return false;
    }

    return drop.life > 0;
  });
}

function updateBoosterDrops(dt) {
  state.boosterDrops = state.boosterDrops.filter((drop) => {
    drop.life -= dt;
    drop.pulse += dt * 5;

    if (Math.hypot(player.x - drop.x, player.y - drop.y) < 0.65) {
      const info = GRENADE_BOOST_TYPES[drop.type];
      if (player.grenadeBoosts[drop.type] < info.maxStacks) {
        player.grenadeBoosts[drop.type] += 1;
        spawnParticles(drop.x, drop.y, info.glow, 18, 0.95);
      }
      return false;
    }

    return drop.life > 0;
  });
}

function updateParticles(dt) {
  state.particles = state.particles.filter((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.z += particle.vz;
    particle.vx *= 0.95;
    particle.vy *= 0.95;
    particle.age += dt;
    return particle.age < particle.life;
  });
}

function damagePlayer(amount) {
  if (!player.alive) return;
  if (player.godMode) {
    player.hurtTimer = 1;
    state.flash = 0.75;
    spawnParticles(player.x, player.y, "#fecaca", 14, 0.8);
    return;
  }
  player.hp = Math.max(0, player.hp - amount);
  player.hurtTimer = 1;
  state.flash = 0.75;
  spawnParticles(player.x, player.y, "#fecaca", 14, 0.8);

  if (player.hp <= 0) {
    player.alive = false;
    startButton.textContent = "Restart Run";
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  }
}

function updateGame(dt) {
  if (!player.alive) {
    updateParticles(dt);
    updateExplosions(dt);
    state.flash = Math.max(0, state.flash - dt * 1.5);
    return;
  }

  state.elapsed += dt;
  state.wave = 1 + Math.floor(player.score / 450);
  state.spawnTimer -= dt;

  updatePlayer(dt);
  updateEnemies(dt);
  updateEnemyProjectiles(dt);
  updateGrenades(dt);
  updateExplosions(dt);
  updatePickups(dt);
  updateWeaponDrops(dt);
  updateBoosterDrops(dt);
  updateParticles(dt);

  if (state.spawnTimer <= 0) {
    const cap = 4 + state.wave * 2;
    if (state.enemies.length < cap) {
      spawnEnemy();
      if (state.wave > 2 && Math.random() < 0.28) spawnEnemy();
    }
    state.spawnTimer = Math.max(0.55, 1.8 - state.wave * 0.08);
  }

  state.flash = Math.max(0, state.flash - dt * 2.2);
}
function drawBackground() {
  if (!cachedSkyGradient) {
    cachedSkyGradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    cachedSkyGradient.addColorStop(0, "#0a1530");
    cachedSkyGradient.addColorStop(0.45, "#08111d");
    cachedSkyGradient.addColorStop(1, "#03060d");
  }
  ctx.fillStyle = cachedSkyGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const floorImage = assets.floor;
  if (!cachedFloorPattern && floorImage && floorImage.complete && floorImage.naturalWidth > 0) {
    cachedFloorPattern = ctx.createPattern(floorImage, "repeat");
  }

  if (cachedFloorPattern) {
    ctx.fillStyle = cachedFloorPattern;
    ctx.fillRect(0, HALF_HEIGHT, WIDTH, HALF_HEIGHT);
  } else {
    ctx.fillStyle = "#0f223a";
    ctx.fillRect(0, HALF_HEIGHT, WIDTH, HALF_HEIGHT);
  }

  ctx.fillStyle = "rgba(8, 15, 28, 0.28)";
  ctx.fillRect(0, HALF_HEIGHT, WIDTH, HALF_HEIGHT);
  for (let i = 0; i < 10; i += 1) {
    const y = HALF_HEIGHT + (i / 10) * HALF_HEIGHT;
    ctx.strokeStyle = `rgba(56, 189, 248, ${0.025 + (i / 10) * 0.05})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
}

function worldToSprite(x, y, depthBuffer, scale = 0.58) {
  const dx = x - player.x;
  const dy = y - player.y;
  const distance = Math.hypot(dx, dy);
  const angle = normalizeAngle(Math.atan2(dy, dx) - player.angle);
  if (Math.abs(angle) > HALF_FOV + 0.34) return null;

  const screenX = ((angle + HALF_FOV) / FOV) * WIDTH;
  const size = clamp((760 / Math.max(distance, 0.05)) * scale, 6, HEIGHT * 0.9);
  const rayIndex = Math.floor((screenX / WIDTH) * RAYS);
  if (rayIndex < 0 || rayIndex >= depthBuffer.length) return null;
  if (distance > depthBuffer[rayIndex] + 0.1) return null;

  return { x: screenX, y: HALF_HEIGHT + size * 0.12, size, distance };
}

function drawWorld() {
  const stripWidth = WIDTH / RAYS;
  const depthBuffer = new Array(RAYS);
  let rayAngle = player.angle - HALF_FOV;

  for (let i = 0; i < RAYS; i += 1) {
    const hit = castRay(rayAngle);
    const depth = hit.depth * Math.cos(player.angle - rayAngle);
    depthBuffer[i] = depth;
    const wallHeight = 760 / Math.max(0.0001, depth);
    const top = HALF_HEIGHT - wallHeight * 0.5;
    const bottom = top + wallHeight;
    const drawTop = Math.max(0, top);
    const drawBottom = Math.min(HEIGHT, bottom);
    const drawHeight = Math.max(0, drawBottom - drawTop);
    const brightness = clamp(1 - depth / MAX_DEPTH, 0.12, 1);
    const edgeGlow = clamp(1 - hit.edge * 7, 0, 1);

    if (drawHeight <= 0) {
      rayAngle += FOV / RAYS;
      continue;
    }

    const wallImage = assets.wall;
    if (wallImage && wallImage.complete && wallImage.naturalWidth > 0) {
      const sourceX = Math.floor(hit.textureX * (wallImage.naturalWidth - 1));
      const clipTop = drawTop - top;
      const clipBottom = bottom - drawBottom;
      const sourceY = (clipTop / wallHeight) * wallImage.naturalHeight;
      const sourceHeight = wallImage.naturalHeight - ((clipTop + clipBottom) / wallHeight) * wallImage.naturalHeight;
      ctx.drawImage(
        wallImage,
        sourceX,
        sourceY,
        1,
        Math.max(1, sourceHeight),
        i * stripWidth,
        drawTop,
        stripWidth + 1.2,
        drawHeight
      );
      ctx.fillStyle = `rgba(10, 18, 28, ${(1 - brightness) * 0.55})`;
      ctx.fillRect(i * stripWidth, drawTop, stripWidth + 1.2, drawHeight);
    } else {
      ctx.fillStyle = shadeColor(hit.hue, 0.24 + brightness * 0.82);
      ctx.fillRect(i * stripWidth, drawTop, stripWidth + 1.2, drawHeight);
    }

    if (edgeGlow > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${edgeGlow * 0.08})`;
      ctx.fillRect(i * stripWidth, drawTop, stripWidth + 1.2, drawHeight);
    }

    ctx.fillStyle = `rgba(2, 6, 14, ${clamp(depth / MAX_DEPTH, 0, 1) * 0.68})`;
    ctx.fillRect(i * stripWidth, drawTop, stripWidth + 1.2, drawHeight);
    rayAngle += FOV / RAYS;
  }

  const sprites = [];
  for (const enemy of state.enemies) {
    const sprite = worldToSprite(enemy.x, enemy.y, depthBuffer);
    if (sprite) sprites.push({ type: "enemy", ...sprite, enemy });
  }
  for (const pickup of state.pickups) {
    const sprite = worldToSprite(pickup.x, pickup.y, depthBuffer);
    if (sprite) sprites.push({ type: "pickup", ...sprite, pickup });
  }
  for (const drop of state.weaponDrops) {
    const sprite = worldToSprite(drop.x, drop.y, depthBuffer, WEAPONS[drop.weaponIndex].dropScale);
    if (sprite) sprites.push({ type: "weaponDrop", ...sprite, drop });
  }
  for (const drop of state.boosterDrops) {
    const sprite = worldToSprite(drop.x, drop.y, depthBuffer, 0.48);
    if (sprite) sprites.push({ type: "boosterDrop", ...sprite, drop });
  }
  for (const shot of state.enemyProjectiles) {
    const sprite = worldToSprite(shot.x, shot.y, depthBuffer, 0.3);
    if (sprite) sprites.push({ type: "enemyProjectile", ...sprite, shot });
  }
  for (const grenade of state.grenades) {
    const sprite = worldToSprite(grenade.x, grenade.y, depthBuffer, 0.36);
    if (sprite) sprites.push({ type: "grenade", ...sprite, grenade });
  }
  for (const explosion of state.explosions) {
    const sprite = worldToSprite(explosion.x, explosion.y, depthBuffer, explosion.radius * 0.42);
    if (sprite) sprites.push({ type: "explosion", ...sprite, explosion });
  }
  for (const particle of state.particles) {
    const sprite = worldToSprite(particle.x, particle.y, depthBuffer, 0.14);
    if (sprite) sprites.push({ type: "particle", ...sprite, particle });
  }

  sprites.sort((a, b) => b.distance - a.distance);

  for (const sprite of sprites) {
    if (sprite.type === "enemy") drawEnemy(sprite);
    else if (sprite.type === "pickup") drawPickup(sprite);
    else if (sprite.type === "weaponDrop") drawWeaponDrop(sprite);
    else if (sprite.type === "boosterDrop") drawBoosterDrop(sprite);
    else if (sprite.type === "enemyProjectile") drawEnemyProjectile(sprite);
    else if (sprite.type === "grenade") drawGrenade(sprite);
    else if (sprite.type === "explosion") drawExplosion(sprite);
    else drawParticle(sprite);
  }
}

function drawEnemy(sprite) {
  const { x, y, size, enemy } = sprite;
  const top = y - size * 0.3 + Math.sin(state.elapsed * 8 + enemy.x * 2) * size * 0.03;
  const image = assets.monster;

  ctx.save();
  ctx.shadowBlur = 26;
  ctx.shadowColor = enemy.hitFlash > 0 ? "#fff1f2" : "rgba(244, 63, 94, 0.9)";
  const drawn = drawImageSprite(image, x, top, size * 0.92, size * 0.92, enemy.hitFlash > 0 ? 0.92 : 1);
  ctx.restore();

  if (!drawn) {
    ctx.fillStyle = enemy.hitFlash > 0 ? "#fff1f2" : "#fb7185";
    ctx.beginPath();
    ctx.arc(x, top, size * 0.24, 0, TAU);
    ctx.fill();
  }

  const barWidth = size * 0.7;
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.fillRect(x - barWidth / 2, top - size * 0.52, barWidth, 8);
  ctx.fillStyle = "#fde047";
  ctx.fillRect(x - barWidth / 2, top - size * 0.52, barWidth * clamp(enemy.hp / enemy.maxHp, 0, 1), 8);
}

function drawPickup(sprite) {
  const { x, y, size } = sprite;
  const image = assets.hp;
  const hoverY = y - size * 0.15 + Math.sin(state.elapsed * 4 + x * 0.01) * 6;

  ctx.save();
  ctx.shadowBlur = 22;
  ctx.shadowColor = "#4ade80";
  const drawn = drawImageSprite(image, x, hoverY, size * 0.56, size * 0.56);
  ctx.restore();

  if (!drawn) {
    ctx.fillStyle = "#4ade80";
    ctx.beginPath();
    ctx.arc(x, hoverY, size * 0.18, 0, TAU);
    ctx.fill();
  }
}

function drawImageSprite(image, x, y, width, height, alpha = 1) {
  if (!image || !image.complete || image.naturalWidth === 0) return false;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
  ctx.restore();
  return true;
}

function drawWeaponDrop(sprite) {
  const { x, y, size, drop } = sprite;
  const weapon = WEAPONS[drop.weaponIndex];
  const image = assets[weapon.imageKey];
  const hover = Math.sin(drop.pulse) * 8;
  const drawY = y - size * 0.15 + hover;

  ctx.save();
  ctx.shadowBlur = 26;
  ctx.shadowColor = weapon.color;
  const drawn = drawImageSprite(image, x, drawY, size * 0.75, size * 0.75);
  ctx.restore();

  if (!drawn) {
    ctx.fillStyle = weapon.color;
    ctx.fillRect(x - size * 0.18, drawY - size * 0.18, size * 0.36, size * 0.36);
  }

  ctx.fillStyle = "rgba(226, 232, 240, 0.95)";
  ctx.font = `${Math.max(10, size * 0.12)}px Segoe UI`;
  ctx.textAlign = "center";
  ctx.fillText(`${weapon.slot}`, x, drawY - size * 0.42);
  ctx.textAlign = "left";
}

function drawBoosterDrop(sprite) {
  const { x, y, size, drop } = sprite;
  const info = GRENADE_BOOST_TYPES[drop.type];
  const image = assets[info.imageKey];
  const hover = Math.sin(drop.pulse) * 8;
  const drawY = y - size * 0.12 + hover;

  ctx.save();
  ctx.shadowBlur = 24;
  ctx.shadowColor = info.color;
  const drawn = drawImageSprite(image, x, drawY, size * 0.68, size * 0.68);
  ctx.restore();

  if (!drawn) {
    const boxWidth = size * 0.62;
    const boxHeight = size * 0.42;
    ctx.save();
    ctx.shadowBlur = 24;
    ctx.shadowColor = info.color;
    ctx.fillStyle = "rgba(8, 15, 30, 0.92)";
    ctx.fillRect(x - boxWidth / 2, drawY - boxHeight / 2, boxWidth, boxHeight);
    ctx.strokeStyle = info.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - boxWidth / 2, drawY - boxHeight / 2, boxWidth, boxHeight);
    ctx.fillStyle = info.color;
    ctx.font = `700 ${Math.max(10, size * 0.12)}px Segoe UI`;
    ctx.textAlign = "center";
    ctx.fillText(info.shortLabel, x, drawY + Math.max(4, size * 0.04));
    ctx.restore();
  }

  ctx.textAlign = "left";
}

function drawEnemyProjectile(sprite) {
  ctx.save();
  ctx.shadowBlur = 26;
  ctx.shadowColor = "#f97316";
  ctx.fillStyle = "#fb923c";
  ctx.beginPath();
  ctx.arc(sprite.x, sprite.y - sprite.size * 0.1, Math.max(3, sprite.size * 0.12), 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawGrenade(sprite) {
  const bomb = assets.bomb;
  const drawn = drawImageSprite(bomb, sprite.x, sprite.y - sprite.size * 0.08, sprite.size * 0.6, sprite.size * 0.6);
  if (!drawn) {
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#f97316";
    ctx.fillStyle = "#fb923c";
    ctx.beginPath();
    ctx.arc(sprite.x, sprite.y, Math.max(4, sprite.size * 0.18), 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawExplosion(sprite) {
  const alpha = clamp(1 - sprite.explosion.age / sprite.explosion.life, 0, 1);
  ctx.save();
  ctx.globalAlpha = alpha * 0.7;
  ctx.strokeStyle = sprite.explosion.color;
  ctx.lineWidth = Math.max(2, sprite.size * 0.08);
  ctx.beginPath();
  ctx.arc(sprite.x, sprite.y, sprite.size * 0.4, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawParticle(sprite) {
  ctx.fillStyle = sprite.particle.color;
  ctx.beginPath();
  ctx.arc(sprite.x, sprite.y - sprite.particle.z * 60, Math.max(1.5, sprite.size * 0.06), 0, TAU);
  ctx.fill();
}
function drawWeapon() {
  const weapon = getCurrentWeapon();
  const image = assets[weapon.imageKey];
  const bob = Math.sin(player.weaponBob) * 10;
  const kick = player.weaponKick * 26;
  const centerX = WIDTH * 0.52;
  const baseY = HEIGHT * 0.76 + bob + kick;
  const drawWidth = 430 * weapon.viewScale;
  const drawHeight = 430 * weapon.viewScale;

  ctx.save();
  ctx.shadowBlur = 22;
  ctx.shadowColor = `${weapon.color}88`;
  const drawn = drawImageSprite(image, centerX, baseY, drawWidth, drawHeight);
  ctx.restore();

  if (!drawn) {
    ctx.save();
    ctx.shadowBlur = 28;
    ctx.shadowColor = `${weapon.color}66`;
    const gradient = ctx.createLinearGradient(0, HEIGHT * 0.62, 0, HEIGHT);
    gradient.addColorStop(0, "#475569");
    gradient.addColorStop(1, "#0f172a");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(WIDTH * 0.3, HEIGHT - 20 + bob + kick);
    ctx.lineTo(WIDTH * 0.43, HEIGHT * 0.63 + bob * 0.5 + kick);
    ctx.lineTo(WIDTH * 0.58, HEIGHT * 0.6 + kick * 0.8);
    ctx.lineTo(WIDTH * 0.72, HEIGHT - 20 + bob + kick);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255, 241, 194, ${state.flash * 0.75})`;
    ctx.beginPath();
    ctx.moveTo(WIDTH * 0.516, HEIGHT * 0.43);
    ctx.lineTo(WIDTH * 0.475, HEIGHT * 0.36);
    ctx.lineTo(WIDTH * 0.516, HEIGHT * 0.3);
    ctx.lineTo(WIDTH * 0.557, HEIGHT * 0.36);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHud() {
  const weapon = getCurrentWeapon();
  const aliveCount = state.enemies.filter((enemy) => enemy.hp > 0).length;
  const survivedSeconds = Math.floor(state.elapsed);
  const grenadeStats = getGrenadeStats();
  ctx.fillStyle = "#e2ecff";
  ctx.font = "700 28px Segoe UI";
  ctx.fillText(`SCORE ${player.score}`, 28, 42);

  ctx.fillStyle = "#7dd3fc";
  ctx.font = "700 18px Segoe UI";
  ctx.fillText(`WAVE ${state.wave}`, 30, 70);
  ctx.fillText(`KILLS ${player.kills}`, 30, 96);
  ctx.fillText(`ALIVE ${aliveCount}`, 30, 122);
  ctx.fillText(`TIME ${survivedSeconds}s`, 30, 148);

  ctx.fillStyle = "rgba(8, 15, 30, 0.74)";
  ctx.fillRect(26, HEIGHT - 50, 250, 18);
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(26, HEIGHT - 50, 250 * (player.hp / 100), 18);
  ctx.strokeStyle = "rgba(226, 232, 240, 0.16)";
  ctx.strokeRect(26, HEIGHT - 50, 250, 18);

  ctx.fillStyle = weapon.color;
  ctx.font = "700 18px Segoe UI";
  ctx.fillText(`${weapon.slot}. ${weapon.name}`, 28, HEIGHT - 78);
  ctx.fillStyle = "#e2ecff";
  ctx.font = "600 14px Segoe UI";
  ctx.fillText(`HP ${Math.ceil(player.hp)}/100`, 30, HEIGHT - 58);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(226, 236, 255, 0.9)";
  ctx.font = "600 14px Segoe UI";
  ctx.fillText("WASD move  |  Mouse look  |  Click shoot  |  Shift sprint", WIDTH - 28, 40);
  ctx.textAlign = "left";

  const panelX = WIDTH - 290;
  const panelY = HEIGHT - 174;
  for (let i = 0; i < WEAPONS.length; i += 1) {
    const info = WEAPONS[i];
    const unlocked = player.unlockedWeapons.includes(i);
    const selected = player.weaponIndex === i;
    const rowY = panelY + i * 26;
    ctx.fillStyle = selected ? "rgba(30, 41, 59, 0.88)" : "rgba(8, 15, 30, 0.58)";
    ctx.fillRect(panelX, rowY - 16, 250, 22);
    ctx.fillStyle = unlocked ? info.color : "#64748b";
    ctx.font = unlocked ? "600 14px Segoe UI" : "600 13px Segoe UI";
    ctx.fillText(`${info.slot}. ${unlocked ? info.name : "Locked"}`, panelX + 10, rowY);
  }

  if (player.weaponIndex === GRENADE_WEAPON_INDEX) {
    const boostX = WIDTH - 290;
    const boostY = 190;
    ctx.fillStyle = "rgba(8, 15, 30, 0.72)";
    ctx.fillRect(boostX, boostY, 252, 84);
    ctx.strokeStyle = "rgba(249, 115, 22, 0.22)";
    ctx.strokeRect(boostX, boostY, 252, 84);

    ctx.fillStyle = "#fdba74";
    ctx.font = "700 15px Segoe UI";
    ctx.fillText("Grenade Launcher Upgrades", boostX + 12, boostY + 22);

    ctx.fillStyle = GRENADE_BOOST_TYPES.reload.color;
    ctx.font = "600 13px Segoe UI";
    ctx.fillText(`Reload x${player.grenadeBoosts.reload}/5   |   ${grenadeStats.cooldown.toFixed(2)}s`, boostX + 12, boostY + 48);

    ctx.fillStyle = GRENADE_BOOST_TYPES.radius.color;
    ctx.fillText(`Radius x${player.grenadeBoosts.radius}/5   |   ${grenadeStats.splashRadius.toFixed(2)}`, boostX + 12, boostY + 68);
  }

  drawCrosshair();
  drawMiniMap();
  if (!state.pointerLocked && player.alive) {
    ctx.fillStyle = "rgba(3, 8, 18, 0.7)";
    ctx.fillRect(WIDTH / 2 - 170, HEIGHT - 88, 340, 38);
    ctx.fillStyle = "#dbeafe";
    ctx.font = "600 16px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText("Click the canvas to lock the cursor", WIDTH / 2, HEIGHT - 62);
    ctx.textAlign = "left";
  }
}

function drawCrosshair() {
  const weapon = getCurrentWeapon();
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  ctx.strokeStyle = player.reload > 0 ? "#fca5a5" : "#f8fafc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 15, cy);
  ctx.lineTo(cx - 5, cy);
  ctx.moveTo(cx + 5, cy);
  ctx.lineTo(cx + 15, cy);
  ctx.moveTo(cx, cy - 15);
  ctx.lineTo(cx, cy - 5);
  ctx.moveTo(cx, cy + 5);
  ctx.lineTo(cx, cy + 15);
  ctx.stroke();

  ctx.fillStyle = weapon.color;
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, TAU);
  ctx.fill();
}

function drawArenaMap(originX, originY, scale, options = {}) {
  const {
    padding = 10,
    background = "rgba(4, 10, 22, 0.72)",
    playerRadius = 3.5,
    enemyRadius = 2.8,
    pickupRadius = 2.4,
    weaponRadius = 3.2,
    grenadeRadius = 3,
  } = options;

  ctx.fillStyle = background;
  ctx.fillRect(originX - padding, originY - padding, map[0].length * scale + padding * 2, map.length * scale + padding * 2);

  for (let y = 0; y < map.length; y += 1) {
    for (let x = 0; x < map[y].length; x += 1) {
      ctx.fillStyle = map[y][x] === "#" ? "#20344f" : "#07111f";
      ctx.fillRect(originX + x * scale, originY + y * scale, scale - 1, scale - 1);
    }
  }

  for (const enemy of state.enemies) {
    ctx.fillStyle = "#fb7185";
    ctx.beginPath();
    ctx.arc(originX + enemy.x * scale, originY + enemy.y * scale, enemyRadius, 0, TAU);
    ctx.fill();
  }
  for (const pickup of state.pickups) {
    ctx.fillStyle = "#4ade80";
    ctx.beginPath();
    ctx.arc(originX + pickup.x * scale, originY + pickup.y * scale, pickupRadius, 0, TAU);
    ctx.fill();
  }
  for (const drop of state.weaponDrops) {
    ctx.fillStyle = WEAPONS[drop.weaponIndex].color;
    ctx.beginPath();
    ctx.arc(originX + drop.x * scale, originY + drop.y * scale, weaponRadius, 0, TAU);
    ctx.fill();
  }
  for (const grenade of state.grenades) {
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.arc(originX + grenade.x * scale, originY + grenade.y * scale, grenadeRadius, 0, TAU);
    ctx.fill();
  }

  const pulse = Math.sin(state.minimapPulse * 5) * 0.4 + 0.6;
  ctx.fillStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.arc(originX + player.x * scale, originY + player.y * scale, playerRadius, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = `rgba(125, 211, 252, ${pulse})`;
  ctx.beginPath();
  ctx.moveTo(originX + player.x * scale, originY + player.y * scale);
  ctx.lineTo(
    originX + (player.x + Math.cos(player.angle) * 1.2) * scale,
    originY + (player.y + Math.sin(player.angle) * 1.2) * scale
  );
  ctx.stroke();
}

function drawMiniMap() {
  const scale = 10;
  drawArenaMap(WIDTH - map[0].length * scale - 28, HEIGHT - map.length * scale - 28, scale, {
    padding: 10,
    background: "rgba(4, 10, 22, 0.72)",
    playerRadius: 3.5,
    enemyRadius: 2.8,
    pickupRadius: 2.4,
    weaponRadius: 3.2,
    grenadeRadius: 3,
  });
}

function drawDeathMap() {
  const panelWidth = 420;
  const panelHeight = 420;
  const scale = Math.min((panelWidth - 28) / map[0].length, (panelHeight - 28) / map.length);
  const originX = WIDTH / 2 - (map[0].length * scale) / 2;
  const originY = HEIGHT / 2 + 70 - (map.length * scale) / 2;
  ctx.fillStyle = "rgba(5, 12, 24, 0.88)";
  ctx.fillRect(WIDTH / 2 - panelWidth / 2, HEIGHT / 2 - 110, panelWidth, panelHeight + 48);
  ctx.strokeStyle = "rgba(125, 211, 252, 0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(WIDTH / 2 - panelWidth / 2, HEIGHT / 2 - 110, panelWidth, panelHeight + 48);
  ctx.fillStyle = "#dbeafe";
  ctx.font = "700 18px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText("Arena Map", WIDTH / 2, HEIGHT / 2 - 78);
  drawArenaMap(originX, originY, scale, {
    padding: 12,
    background: "rgba(3, 10, 20, 0.92)",
    playerRadius: 5,
    enemyRadius: 4,
    pickupRadius: 3.5,
    weaponRadius: 4,
    grenadeRadius: 4,
  });
}
function drawPostFx() {
  const lowHp = clamp(1 - player.hp / 100, 0, 1);
  const danger = lowHp * lowHp;

  const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 160, WIDTH / 2, HEIGHT / 2, WIDTH * 0.72);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, `rgba(0, 0, 0, ${0.48 + danger * 0.16})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (danger > 0 && player.alive) {
    ctx.fillStyle = `rgba(127, 29, 29, ${0.05 + danger * 0.22})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  if (player.hurtTimer > 0) {
    ctx.fillStyle = `rgba(248, 113, 113, ${player.hurtTimer * 0.14 + danger * 0.06})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  ctx.fillStyle = `rgba(255,255,255,${0.018 + danger * 0.01})`;
  for (let i = 0; i < 10; i += 1) {
    ctx.fillRect(0, i * 72 + ((state.elapsed * 30) % 72), WIDTH, 1);
  }

  if (!player.alive) {
    ctx.fillStyle = "rgba(2, 6, 23, 0.62)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textAlign = "center";
    ctx.fillStyle = "#f8fafc";
    ctx.font = "800 64px Segoe UI";
    ctx.fillText("RUN ENDED", WIDTH / 2, HEIGHT / 2 - 180);
    ctx.fillStyle = "#fca5a5";
    ctx.font = "600 22px Segoe UI";
    ctx.fillText("Click Start Mission or press R to go again", WIDTH / 2, HEIGHT / 2 - 138);
    drawDeathMap();
    ctx.textAlign = "left";
  }
}

function shadeColor(hex, factor) {
  const color = hex.replace("#", "");
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  return `rgb(${Math.round(clamp(r * factor, 0, 255))}, ${Math.round(clamp(g * factor, 0, 255))}, ${Math.round(clamp(b * factor, 0, 255))})`;
}

function resizeCanvas() {
  const ratio = 16 / 9;
  const maxWidth = window.innerWidth - 24;
  const maxHeight = window.innerHeight - 24;
  let width = Math.min(maxWidth, 1400);
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

function render() {
  drawBackground();
  drawWorld();
  drawWeapon();
  drawHud();
  drawPostFx();
}

function loop(now) {
  const dt = Math.min(0.033, (now - state.lastTime) / 1000);
  state.lastTime = now;
  updateGame(dt);
  render();
  requestAnimationFrame(loop);
}

document.addEventListener("keydown", (event) => {
  if (event.code === "Backquote") {
    event.preventDefault();
    if (state.consoleOpen) closeConsole();
    else openConsole();
    return;
  }

  if (state.consoleOpen) {
    return;
  }

  keys.add(event.code);
  if (event.code === "KeyR") {
    resetGame();
    overlay.classList.add("hidden");
  }
  if (event.code === "Space" && player.alive) {
    fireCurrentWeapon();
    event.preventDefault();
  }
  if (event.code.startsWith("Digit")) {
    const slot = Number(event.code.replace("Digit", ""));
    if (slot >= 1 && slot <= WEAPONS.length) {
      equipWeapon(slot - 1);
    }
  }
});

document.addEventListener("keyup", (event) => {
  if (state.consoleOpen) return;
  keys.delete(event.code);
});

canvas.addEventListener("mousedown", () => {
  state.mouseDown = true;
  if (!state.pointerLocked) canvas.requestPointerLock();
  if (player.alive) fireCurrentWeapon();
});

document.addEventListener("mouseup", () => {
  state.mouseDown = false;
});

canvas.addEventListener("click", () => {
  if (!state.pointerLocked) canvas.requestPointerLock();
});

document.addEventListener("pointerlockchange", () => {
  state.pointerLocked = document.pointerLockElement === canvas;
});

document.addEventListener("mousemove", (event) => {
  if (!state.pointerLocked || !player.alive) return;
  player.angle += event.movementX * 0.0025;
});

devConsoleInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeConsole();
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    executeConsoleCommand(devConsoleInput.value);
    devConsoleInput.select();
  }
});

startButton.addEventListener("click", () => {
  resetGame();
  overlay.classList.add("hidden");
  canvas.requestPointerLock();
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
resetGame();
requestAnimationFrame(loop);







