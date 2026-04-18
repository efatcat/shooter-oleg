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
  { id: "pistol", slot: 1, name: "Пистолет", imageKey: "pistol", kind: "hitscan", damage: 34, spread: 0.01, aimCone: 0.08, range: 10, cooldown: 0.4, automatic: false, color: "#cbd5e1", glow: "#f8fafc", dropScale: 0.62, viewScale: 0.62 },
  { id: "auto", slot: 2, name: "Автомат", imageKey: "auto", kind: "hitscan", damage: 13, spread: 0.03, aimCone: 0.1, range: 9.5, cooldown: 0.08, automatic: true, color: "#60a5fa", glow: "#bfdbfe", dropScale: 0.74, viewScale: 0.78 },
  { id: "rifle", slot: 3, name: "Винтовка", imageKey: "rifle", kind: "hitscan", damage: 120, spread: 0.004, aimCone: 0.035, range: 16, cooldown: 0.6, automatic: false, color: "#d8b4fe", glow: "#f3e8ff", dropScale: 0.76, viewScale: 0.9 },
  { id: "ak", slot: 4, name: "АК", imageKey: "ak", kind: "hitscan", damage: 24, spread: 0.02, aimCone: 0.085, range: 12, cooldown: 0.11, automatic: true, color: "#f59e0b", glow: "#fde68a", dropScale: 0.8, viewScale: 0.88 },
  { id: "grenadeLauncher", slot: 5, name: "Гранатомёт", imageKey: "grenadeLauncher", kind: "grenade", damage: 999, splashRadius: 2.5, baseSplashRadius: 2.5, cooldown: 1.5, baseCooldown: 1.5, automatic: false, projectileSpeed: 5.2, projectileLife: 1.1, color: "#f97316", glow: "#fdba74", dropScale: 0.82, viewScale: 0.94 },
];

const GRENADE_WEAPON_INDEX = WEAPONS.findIndex((weapon) => weapon.id === "grenadeLauncher");
const GRENADE_BOOST_TYPES = {
  reload: { label: "Перезарядка", shortLabel: "ПЗ", imageKey: "timeUp", color: "#38bdf8", glow: "#7dd3fc", maxStacks: 5, chance: 0.05, multiplier: 0.8 },
  radius: { label: "Радиус взрыва", shortLabel: "РВ", imageKey: "terUp", color: "#f97316", glow: "#fdba74", maxStacks: 5, chance: 0.05, multiplier: 1.15 },
};

const player = {
  x: 3.5, y: 3.5, angle: 0, hp: 100, score: 0, kills: 0,
  weaponBob: 0, hurtTimer: 0, weaponKick: 0, reload: 0, alive: true,
  weaponIndex: 0, unlockedWeapons: [0], godMode: false,
  grenadeBoosts: { reload: 0, radius: 0 }, radius: 0.2,
};

const state = {
  lastTime: performance.now(), enemies: [], enemyProjectiles: [], particles: [],
  pickups: [], weaponDrops: [], boosterDrops: [], grenades: [], explosions: [],
  spawnTimer: 2, wave: 1, elapsed: 0, pointerLocked: false, flash: 0,
  minimapPulse: 0, mouseDown: false, consoleOpen: false,
};

const spawnPoints = [[12.5,3.5],[13.5,11.5],[10.5,13.5],[5.5,12.5],[2.5,10.5],[11.5,7.5]];

function getCurrentWeapon() { return WEAPONS[player.weaponIndex]; }
function hasGrenadeLauncher() { return player.unlockedWeapons.includes(GRENADE_WEAPON_INDEX); }
function getGrenadeStats() {
  const w = WEAPONS[GRENADE_WEAPON_INDEX];
  return {
    cooldown: w.baseCooldown * Math.pow(GRENADE_BOOST_TYPES.reload.multiplier, player.grenadeBoosts.reload),
    splashRadius: w.baseSplashRadius * Math.pow(GRENADE_BOOST_TYPES.radius.multiplier, player.grenadeBoosts.radius),
  };
}

function resetGame() {
  player.x = 3.5; player.y = 3.5; player.angle = 0; player.hp = 100;
  player.score = 0; player.kills = 0; player.weaponBob = 0; player.hurtTimer = 0;
  player.weaponKick = 0; player.reload = 0; player.alive = true; player.weaponIndex = 0;
  player.unlockedWeapons = [0]; player.godMode = false;
  player.grenadeBoosts = { reload: 0, radius: 0 };
  state.enemies = []; state.enemyProjectiles = []; state.particles = [];
  state.pickups = []; state.weaponDrops = []; state.boosterDrops = [];
  state.grenades = []; state.explosions = []; state.spawnTimer = 2;
  state.wave = 1; state.elapsed = 0; state.flash = 0; state.mouseDown = false;
}

function setConsoleMessage(msg) { devConsoleHint.textContent = msg; }

function openConsole() {
  state.consoleOpen = true;
  state.mouseDown = false;
  devConsole.classList.remove("hidden");
  devConsoleInput.value = "";
  devConsoleInput.focus();
  setConsoleMessage("Команды: бог | хп 500 | выдать оружие 5 | спавн мобов 20");
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function closeConsole() {
  state.consoleOpen = false;
  devConsole.classList.add("hidden");
  devConsoleInput.blur();
}

function normalizeCommand(text) { return text.trim().toLowerCase().replace(/\s+/g, " "); }

function unlockWeapon(index) {
  if (index < 0 || index >= WEAPONS.length) return false;
  if (!player.unlockedWeapons.includes(index)) player.unlockedWeapons.push(index);
  player.unlockedWeapons.sort((a,b)=>a-b);
  player.weaponIndex = index;
  return true;
}

function spawnEnemiesByCount(count) { for(let i=0;i<count;i++) spawnEnemy(); }

function setWave(level) {
  state.wave = Math.max(1, level);
  state.spawnTimer = 0.1;
  player.score = Math.max(player.score, (state.wave-1)*450);
  const cap = 4 + state.wave * 2;
  const toSpawn = Math.max(0, Math.min(cap, state.wave + 2) - state.enemies.length);
  spawnEnemiesByCount(toSpawn);
}

function executeConsoleCommand(raw) {
  const cmd = normalizeCommand(raw);
  if (!cmd) { setConsoleMessage("Пустая команда"); return; }

  if (cmd === "бог" || cmd === "god" || cmd === "godmode") {
    player.godMode = !player.godMode;
    setConsoleMessage("Режим бога: " + (player.godMode ? "вкл" : "выкл"));
    return;
  }
  if (cmd.startsWith("хп ") || cmd.startsWith("hp ")) {
    const val = Number(cmd.split(" ").pop());
    if (Number.isFinite(val)) { player.hp += val; setConsoleMessage("ХП: " + Math.ceil(player.hp)); }
    else setConsoleMessage("Пример: хп 500");
    return;
  }
  if (cmd.startsWith("выдать оружие ") || cmd.startsWith("weapon ")) {
    const val = Number(cmd.split(" ").pop());
    if (Number.isFinite(val) && val>=1 && val<=WEAPONS.length) {
      unlockWeapon(val-1);
      setConsoleMessage("Оружие: " + WEAPONS[val-1].name);
    } else setConsoleMessage("Пример: выдать оружие 5");
    return;
  }
  if (cmd.startsWith("спавн мобов ") || cmd.startsWith("spawn mobs ") || cmd.startsWith("spawn ")) {
    const val = Number(cmd.split(" ").pop());
    if (Number.isFinite(val) && val>0) {
      spawnEnemiesByCount(Math.floor(val));
      setConsoleMessage("Создано мобов: " + Math.floor(val));
    } else setConsoleMessage("Пример: спавн мобов 20");
    return;
  }
  if (cmd === "удалить мобов" || cmd === "clear mobs" || cmd === "killall") {
    state.enemies = []; state.enemyProjectiles = [];
    setConsoleMessage("Все мобы удалены");
    return;
  }
  if (cmd.startsWith("накрутить килы ") || cmd.startsWith("kills ")) {
    const val = Number(cmd.split(" ").pop());
    if (Number.isFinite(val)) { player.kills += Math.floor(val); setConsoleMessage("Убийств: " + player.kills); }
    else setConsoleMessage("Пример: накрутить килы 100");
    return;
  }
  if (cmd.startsWith("начать волну ") || cmd.startsWith("wave ")) {
    const val = Number(cmd.split(" ").pop());
    if (Number.isFinite(val) && val>0) { setWave(Math.floor(val)); setConsoleMessage("Волна: " + Math.floor(val)); }
    else setConsoleMessage("Пример: начать волну 10");
    return;
  }
  setConsoleMessage("Неизвестная команда");
}

function isWall(x,y) {
  const mx = Math.floor(x), my = Math.floor(y);
  if (my<0 || my>=map.length || mx<0 || mx>=map[0].length) return true;
  return map[my][mx] === "#";
}

function collidesWithWall(x,y,radius) {
  return isWall(x-radius, y-radius) || isWall(x+radius, y-radius) ||
         isWall(x-radius, y+radius) || isWall(x+radius, y+radius);
}

function normalizeAngle(a) {
  while (a < -Math.PI) a += TAU;
  while (a > Math.PI) a -= TAU;
  return a;
}

function clamp(v,min,max) { return Math.max(min, Math.min(max, v)); }

function lineOfSight(x1,y1,x2,y2) {
  const dx = x2-x1, dy = y2-y1;
  const dist = Math.hypot(dx,dy);
  const steps = Math.max(4, Math.floor(dist*18));
  for(let i=1;i<steps;i++) {
    const t = i/steps;
    if (isWall(x1+dx*t, y1+dy*t)) return false;
  }
  return true;
}

function castRay(angle) {
  const sin = Math.sin(angle), cos = Math.cos(angle);
  let depth = 0.02;
  while (depth < MAX_DEPTH) {
    depth += 0.02;
    const x = player.x + cos * depth;
    const y = player.y + sin * depth;
    if (isWall(x, y)) {
      const fx = x - Math.floor(x), fy = y - Math.floor(y);
      const edge = Math.min(fx, 1-fx, fy, 1-fy);
      const hitVertical = Math.min(fx, 1-fx) < Math.min(fy, 1-fy);
      const textureCoord = hitVertical ? fy : fx;
      return { depth, edge, hue: wallColors[(Math.floor(x)+Math.floor(y))%wallColors.length], textureX: clamp(textureCoord,0,0.999) };
    }
  }
  return { depth: MAX_DEPTH, edge: 0, hue: wallColors[0], textureX: 0 };
}

function spawnEnemy() {
  const [x,y] = spawnPoints[Math.floor(Math.random()*spawnPoints.length)];
  if (Math.hypot(player.x-x, player.y-y) < 4) return;
  const hp = 60 + state.wave * 16;
  state.enemies.push({
    x, y, radius: 0.28, hp, maxHp: hp,
    speed: 0.8 + Math.random()*0.3 + state.wave*0.04,
    attackCooldown: 0, shotCooldown: 1.5 + Math.random(),
    hitFlash: 0, drift: Math.random()*TAU,
  });
}

function spawnPickup(x,y) { state.pickups.push({ x, y, radius: 0.2, life: 16 }); }

function maybeSpawnWeaponDrop(x,y) {
  if (Math.random() >= 0.2) return;
  const lockedWeapons = WEAPONS.filter((w,idx) => {
    if (player.unlockedWeapons.includes(idx)) return false;
    if (state.weaponDrops.some(d=>d.weaponIndex===idx)) return false;
    if (idx===GRENADE_WEAPON_INDEX && player.unlockedWeapons.length<WEAPONS.length-1) return false;
    return true;
  });
  if (!lockedWeapons.length) return;
  const weapon = lockedWeapons[Math.floor(Math.random()*lockedWeapons.length)];
  const weaponIndex = WEAPONS.findIndex(item=>item.id===weapon.id);
  state.weaponDrops.push({ x, y, radius: 0.24, life: 24, pulse: Math.random()*TAU, weaponIndex });
}

function maybeSpawnGrenadeBoosterDrop(x,y) {
  if (!hasGrenadeLauncher()) return;
  if (Math.random() >= GRENADE_BOOST_TYPES.reload.chance) return;
  const availableBoosts = Object.entries(GRENADE_BOOST_TYPES).filter(([type,info]) => 
    player.grenadeBoosts[type] < info.maxStacks && !state.boosterDrops.some(d=>d.type===type)
  );
  if (!availableBoosts.length) return;
  const lowestStack = Math.min(...availableBoosts.map(([type])=>player.grenadeBoosts[type]));
  const balancedBoosts = availableBoosts.filter(([type])=>player.grenadeBoosts[type]===lowestStack);
  const [type, info] = balancedBoosts[Math.floor(Math.random()*balancedBoosts.length)];
  state.boosterDrops.push({ x, y, radius: 0.22, life: 22, pulse: Math.random()*TAU, type, color: info.color });
}

function spawnParticles(x,y,color,amount,force=1) {
  for(let i=0;i<amount;i++) {
    const angle = Math.random()*TAU;
    const speed = (0.25+Math.random()*0.75)*force;
    state.particles.push({
      x, y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
      z: Math.random()*0.3, vz: Math.random()*0.04, color,
      life: 0.35+Math.random()*0.55, age: 0,
    });
  }
}

function spawnExplosion(x,y,radius,color) { state.explosions.push({ x, y, radius, age: 0, life: 0.35, color }); }

function killEnemy(enemy, cause="default") {
  state.enemies = state.enemies.filter(e=>e!==enemy);
  player.score += 125;
  player.kills += 1;
  spawnParticles(enemy.x, enemy.y, "#fb7185", 22, 1.1);
  if (Math.random() < 0.48) spawnPickup(enemy.x, enemy.y);
  maybeSpawnWeaponDrop(enemy.x, enemy.y);
  if (cause === "grenade") maybeSpawnGrenadeBoosterDrop(enemy.x, enemy.y);
}

function traceHitscan(shotAngle, weapon) {
  let bestEnemy = null, bestDist = weapon.range;
  for (const enemy of state.enemies) {
    const dx = enemy.x - player.x, dy = enemy.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > weapon.range) continue;
    const angleToEnemy = Math.atan2(dy, dx);
    if (Math.abs(normalizeAngle(angleToEnemy - shotAngle)) > weapon.aimCone) continue;
    const ray = castRay(angleToEnemy);
    if (ray.depth + 0.02 < dist) continue;
    if (dist < bestDist) { bestDist = dist; bestEnemy = enemy; }
  }
  return bestEnemy;
}

function fireHitscanWeapon(weapon) {
  const shotAngle = player.angle + (Math.random()-0.5)*weapon.spread;
  const target = traceHitscan(shotAngle, weapon);
  if (!target) {
    spawnParticles(player.x+Math.cos(player.angle)*1.2, player.y+Math.sin(player.angle)*1.2, weapon.color, 6, 0.45);
    return;
  }
  target.hp -= weapon.damage;
  target.hitFlash = 0.16;
  spawnParticles(target.x, target.y, weapon.glow, 8, 0.65);
  if (target.hp <= 0) killEnemy(target, "hitscan");
}

function fireGrenadeLauncher(weapon) {
  const stats = getGrenadeStats();
  state.grenades.push({
    x: player.x + Math.cos(player.angle)*0.7, y: player.y + Math.sin(player.angle)*0.7,
    vx: Math.cos(player.angle)*weapon.projectileSpeed, vy: Math.sin(player.angle)*weapon.projectileSpeed,
    life: weapon.projectileLife, radius: 0.16, splashRadius: stats.splashRadius,
    damage: weapon.damage, weaponIndex: player.weaponIndex,
  });
}

function fireCurrentWeapon() {
  if (!player.alive || player.reload>0) return;
  const weapon = getCurrentWeapon();
  player.reload = weapon.kind==="grenade" ? getGrenadeStats().cooldown : weapon.cooldown;
  player.weaponKick = 1;
  state.flash = 1;
  if (weapon.kind==="grenade") fireGrenadeLauncher(weapon);
  else fireHitscanWeapon(weapon);
}

function equipWeapon(idx) { if (player.unlockedWeapons.includes(idx)) player.weaponIndex = idx; }

function updatePlayer(dt) {
  let moveX=0,moveY=0;
  const fx = Math.cos(player.angle), fy = Math.sin(player.angle);
  const sx = Math.cos(player.angle+Math.PI/2), sy = Math.sin(player.angle+Math.PI/2);
  const speed = (keys.has("ShiftLeft")||keys.has("ShiftRight")) ? SPRINT_SPEED : MOVE_SPEED;
  if (keys.has("KeyW")) { moveX+=fx; moveY+=fy; }
  if (keys.has("KeyS")) { moveX-=fx; moveY-=fy; }
  if (keys.has("KeyA")) { moveX-=sx; moveY-=sy; }
  if (keys.has("KeyD")) { moveX+=sx; moveY+=sy; }
  if (keys.has("ArrowLeft")||keys.has("KeyQ")) player.angle -= ROT_SPEED*dt;
  if (keys.has("ArrowRight")||keys.has("KeyE")) player.angle += ROT_SPEED*dt;
  if (moveX||moveY) {
    const len = Math.hypot(moveX,moveY);
    moveX = moveX/len*speed*dt;
    moveY = moveY/len*speed*dt;
    const nx = player.x+moveX, ny = player.y+moveY;
    if (!collidesWithWall(nx, player.y, player.radius)) player.x = nx;
    if (!collidesWithWall(player.x, ny, player.radius)) player.y = ny;
    player.weaponBob += dt * (speed>MOVE_SPEED ? 12 : 9);
  }
  if (player.reload>0) player.reload -= dt;
  player.weaponKick = Math.max(0, player.weaponKick - dt*9);
  player.hurtTimer = Math.max(0, player.hurtTimer - dt*2.5);
  state.minimapPulse += dt;
  const weapon = getCurrentWeapon();
  if (state.mouseDown && weapon.automatic) fireCurrentWeapon();
}

function updateEnemies(dt) {
  for (const e of state.enemies) {
    const dx = player.x - e.x, dy = player.y - e.y;
    const dist = Math.hypot(dx,dy) || 1;
    const sees = lineOfSight(e.x, e.y, player.x, player.y);
    e.drift += dt;
    if (sees && dist>1.5) {
      const mx = (dx/dist)*e.speed*dt, my = (dy/dist)*e.speed*dt;
      if (!isWall(e.x+mx, e.y)) e.x += mx;
      if (!isWall(e.x, e.y+my)) e.y += my;
    } else if (!sees) {
      const mx = Math.cos(e.drift)*0.25*dt, my = Math.sin(e.drift*1.2)*0.25*dt;
      if (!isWall(e.x+mx, e.y)) e.x += mx;
      if (!isWall(e.x, e.y+my)) e.y += my;
    }
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.attackCooldown = Math.max(0, e.attackCooldown - dt);
    e.shotCooldown -= dt;
    if (dist < 1.15 && e.attackCooldown<=0) { damagePlayer(12); e.attackCooldown = 0.9; }
    if (sees && dist<7.5 && e.shotCooldown<=0) {
      state.enemyProjectiles.push({ x: e.x, y: e.y, vx: dx/dist*ENEMY_PROJECTILE_SPEED, vy: dy/dist*ENEMY_PROJECTILE_SPEED, life: 3.2 });
      e.shotCooldown = 1.2 + Math.random()*1.4;
    }
  }
}

function updateEnemyProjectiles(dt) {
  state.enemyProjectiles = state.enemyProjectiles.filter(p => {
    p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt;
    if (isWall(p.x, p.y)) { spawnParticles(p.x, p.y, "#f97316", 7, 0.5); return false; }
    if (Math.hypot(player.x-p.x, player.y-p.y) < 0.35) { damagePlayer(8); spawnParticles(p.x, p.y, "#fca5a5", 9, 0.65); return false; }
    return p.life > 0;
  });
}

function explodeGrenade(g) {
  const w = WEAPONS[g.weaponIndex];
  spawnExplosion(g.x, g.y, g.splashRadius, w.color);
  spawnParticles(g.x, g.y, w.color, 34, 1.3);
  const victims = state.enemies.filter(e => Math.hypot(e.x-g.x, e.y-g.y) <= g.splashRadius);
  for (const e of victims) e.hp -= g.damage;
  for (const e of [...victims]) if (e.hp <= 0) killEnemy(e, "grenade");
}

function updateGrenades(dt) {
  const survivors = [];
  for (const g of state.grenades) {
    g.x += g.vx*dt; g.y += g.vy*dt; g.life -= dt;
    const hitEnemy = state.enemies.find(e => Math.hypot(e.x-g.x, e.y-g.y) <= e.radius+g.radius);
    if (isWall(g.x, g.y) || g.life<=0 || hitEnemy) { explodeGrenade(g); continue; }
    survivors.push(g);
  }
  state.grenades = survivors;
}

function updateExplosions(dt) { state.explosions = state.explosions.filter(e => (e.age+=dt) < e.life); }
function updatePickups(dt) {
  state.pickups = state.pickups.filter(p => {
    p.life -= dt;
    if (Math.hypot(player.x-p.x, player.y-p.y) < 0.55) { player.hp = Math.min(100, player.hp+24); spawnParticles(p.x, p.y, "#86efac", 14, 0.7); return false; }
    return p.life > 0;
  });
}
function updateWeaponDrops(dt) {
  state.weaponDrops = state.weaponDrops.filter(d => {
    d.life -= dt; d.pulse += dt*5;
    if (Math.hypot(player.x-d.x, player.y-d.y) < 0.65) {
      if (!player.unlockedWeapons.includes(d.weaponIndex)) {
        player.unlockedWeapons.push(d.weaponIndex);
        player.unlockedWeapons.sort((a,b)=>a-b);
        player.weaponIndex = d.weaponIndex;
        const w = WEAPONS[d.weaponIndex];
        spawnParticles(d.x, d.y, w.color, 18, 0.9);
      }
      return false;
    }
    return d.life > 0;
  });
}
function updateBoosterDrops(dt) {
  state.boosterDrops = state.boosterDrops.filter(d => {
    d.life -= dt; d.pulse += dt*5;
    if (Math.hypot(player.x-d.x, player.y-d.y) < 0.65) {
      const info = GRENADE_BOOST_TYPES[d.type];
      if (player.grenadeBoosts[d.type] < info.maxStacks) {
        player.grenadeBoosts[d.type] += 1;
        spawnParticles(d.x, d.y, info.glow, 18, 0.95);
      }
      return false;
    }
    return d.life > 0;
  });
}
function updateParticles(dt) {
  state.particles = state.particles.filter(p => {
    p.x += p.vx*dt; p.y += p.vy*dt; p.z += p.vz;
    p.vx *= 0.95; p.vy *= 0.95;
    p.age += dt;
    return p.age < p.life;
  });
}

function damagePlayer(amt) {
  if (!player.alive) return;
  if (player.godMode) { player.hurtTimer = 1; state.flash = 0.75; spawnParticles(player.x, player.y, "#fecaca", 14, 0.8); return; }
  player.hp = Math.max(0, player.hp - amt);
  player.hurtTimer = 1;
  state.flash = 0.75;
  spawnParticles(player.x, player.y, "#fecaca", 14, 0.8);
  if (player.hp <= 0) {
    player.alive = false;
    startButton.textContent = "Перезапуск";
    // Принудительно показываем курсор при смерти
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
    state.pointerLocked = false;
  }
}

function updateGame(dt) {
  if (!player.alive) {
    updateParticles(dt); updateExplosions(dt);
    state.flash = Math.max(0, state.flash - dt*1.5);
    return;
  }
  state.elapsed += dt;
  state.wave = 1 + Math.floor(player.score / 450);
  state.spawnTimer -= dt;
  updatePlayer(dt); updateEnemies(dt); updateEnemyProjectiles(dt);
  updateGrenades(dt); updateExplosions(dt); updatePickups(dt);
  updateWeaponDrops(dt); updateBoosterDrops(dt); updateParticles(dt);
  if (state.spawnTimer <= 0) {
    const cap = 4 + state.wave * 2;
    if (state.enemies.length < cap) { spawnEnemy(); if (state.wave>2 && Math.random()<0.28) spawnEnemy(); }
    state.spawnTimer = Math.max(0.55, 1.8 - state.wave*0.08);
  }
  state.flash = Math.max(0, state.flash - dt*2.2);
}

function drawBackground() {
  if (!cachedSkyGradient) {
    cachedSkyGradient = ctx.createLinearGradient(0,0,0,HEIGHT);
    cachedSkyGradient.addColorStop(0,"#0a1530");
    cachedSkyGradient.addColorStop(0.45,"#08111d");
    cachedSkyGradient.addColorStop(1,"#03060d");
  }
  ctx.fillStyle = cachedSkyGradient;
  ctx.fillRect(0,0,WIDTH,HEIGHT);
  const floorImage = assets.floor;
  if (!cachedFloorPattern && floorImage && floorImage.complete && floorImage.naturalWidth>0)
    cachedFloorPattern = ctx.createPattern(floorImage, "repeat");
  if (cachedFloorPattern) { ctx.fillStyle = cachedFloorPattern; ctx.fillRect(0, HALF_HEIGHT, WIDTH, HALF_HEIGHT); }
  else { ctx.fillStyle = "#0f223a"; ctx.fillRect(0, HALF_HEIGHT, WIDTH, HALF_HEIGHT); }
  ctx.fillStyle = "rgba(8,15,28,0.28)";
  ctx.fillRect(0, HALF_HEIGHT, WIDTH, HALF_HEIGHT);
  for(let i=0;i<10;i++) {
    const y = HALF_HEIGHT + (i/10)*HALF_HEIGHT;
    ctx.strokeStyle = `rgba(56,189,248,${0.025+(i/10)*0.05})`;
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(WIDTH,y); ctx.stroke();
  }
}

function worldToSprite(x,y,depthBuffer,scale=0.58) {
  const dx = x - player.x, dy = y - player.y;
  const dist = Math.hypot(dx,dy);
  const angle = normalizeAngle(Math.atan2(dy,dx) - player.angle);
  if (Math.abs(angle) > HALF_FOV+0.34) return null;
  const screenX = ((angle+HALF_FOV)/FOV)*WIDTH;
  const size = clamp((760/Math.max(dist,0.05))*scale, 6, HEIGHT*0.9);
  const rayIdx = Math.floor((screenX/WIDTH)*RAYS);
  if (rayIdx<0 || rayIdx>=depthBuffer.length) return null;
  if (dist > depthBuffer[rayIdx]+0.1) return null;
  return { x: screenX, y: HALF_HEIGHT+size*0.12, size, distance: dist };
}

function drawWorld() {
  const stripWidth = WIDTH/RAYS;
  const depthBuffer = new Array(RAYS);
  let rayAngle = player.angle - HALF_FOV;
  for(let i=0;i<RAYS;i++) {
    const hit = castRay(rayAngle);
    const depth = hit.depth * Math.cos(player.angle - rayAngle);
    depthBuffer[i] = depth;
    const wallHeight = 760/Math.max(0.0001,depth);
    const top = HALF_HEIGHT - wallHeight*0.5;
    const bottom = top + wallHeight;
    const drawTop = Math.max(0,top);
    const drawBottom = Math.min(HEIGHT,bottom);
    const drawHeight = Math.max(0,drawBottom-drawTop);
    const brightness = clamp(1 - depth/MAX_DEPTH, 0.12, 1);
    const edgeGlow = clamp(1 - hit.edge*7, 0, 1);
    if (drawHeight>0) {
      const wallImage = assets.wall;
      if (wallImage && wallImage.complete && wallImage.naturalWidth>0) {
        const sx = Math.floor(hit.textureX*(wallImage.naturalWidth-1));
        const clipTop = drawTop - top;
        const clipBottom = bottom - drawBottom;
        const sy = (clipTop/wallHeight)*wallImage.naturalHeight;
        const sh = wallImage.naturalHeight - ((clipTop+clipBottom)/wallHeight)*wallImage.naturalHeight;
        ctx.drawImage(wallImage, sx, sy, 1, Math.max(1,sh), i*stripWidth, drawTop, stripWidth+1.2, drawHeight);
        ctx.fillStyle = `rgba(10,18,28,${(1-brightness)*0.55})`;
        ctx.fillRect(i*stripWidth, drawTop, stripWidth+1.2, drawHeight);
      } else {
        ctx.fillStyle = hit.hue;
        ctx.fillRect(i*stripWidth, drawTop, stripWidth+1.2, drawHeight);
      }
      if (edgeGlow>0.01) { ctx.fillStyle = `rgba(255,255,255,${edgeGlow*0.08})`; ctx.fillRect(i*stripWidth, drawTop, stripWidth+1.2, drawHeight); }
      ctx.fillStyle = `rgba(2,6,14,${clamp(depth/MAX_DEPTH,0,1)*0.68})`;
      ctx.fillRect(i*stripWidth, drawTop, stripWidth+1.2, drawHeight);
    }
    rayAngle += FOV/RAYS;
  }
  const sprites = [];
  for(const e of state.enemies) { const s=worldToSprite(e.x,e.y,depthBuffer); if(s) sprites.push({type:"enemy",...s,enemy:e}); }
  for(const p of state.pickups) { const s=worldToSprite(p.x,p.y,depthBuffer); if(s) sprites.push({type:"pickup",...s,pickup:p}); }
  for(const d of state.weaponDrops) { const s=worldToSprite(d.x,d.y,depthBuffer,WEAPONS[d.weaponIndex].dropScale); if(s) sprites.push({type:"weaponDrop",...s,drop:d}); }
  for(const d of state.boosterDrops) { const s=worldToSprite(d.x,d.y,depthBuffer,0.48); if(s) sprites.push({type:"boosterDrop",...s,drop:d}); }
  for(const p of state.enemyProjectiles) { const s=worldToSprite(p.x,p.y,depthBuffer,0.3); if(s) sprites.push({type:"enemyProjectile",...s,shot:p}); }
  for(const g of state.grenades) { const s=worldToSprite(g.x,g.y,depthBuffer,0.36); if(s) sprites.push({type:"grenade",...s,grenade:g}); }
  for(const e of state.explosions) { const s=worldToSprite(e.x,e.y,depthBuffer,e.radius*0.42); if(s) sprites.push({type:"explosion",...s,explosion:e}); }
  for(const p of state.particles) { const s=worldToSprite(p.x,p.y,depthBuffer,0.14); if(s) sprites.push({type:"particle",...s,particle:p}); }
  sprites.sort((a,b)=>b.distance-a.distance);
  for(const s of sprites) {
    if(s.type==="enemy") drawEnemy(s);
    else if(s.type==="pickup") drawPickup(s);
    else if(s.type==="weaponDrop") drawWeaponDrop(s);
    else if(s.type==="boosterDrop") drawBoosterDrop(s);
    else if(s.type==="enemyProjectile") drawEnemyProjectile(s);
    else if(s.type==="grenade") drawGrenade(s);
    else if(s.type==="explosion") drawExplosion(s);
    else drawParticle(s);
  }
}

function drawEnemy(s) {
  const top = s.y - s.size*0.3 + Math.sin(state.elapsed*8 + s.enemy.x*2)*s.size*0.03;
  const img = assets.monster;
  ctx.save(); ctx.shadowBlur = 26; ctx.shadowColor = s.enemy.hitFlash>0 ? "#fff1f2" : "rgba(244,63,94,0.9)";
  const drawn = drawImageSprite(img, s.x, top, s.size*0.92, s.size*0.92, s.enemy.hitFlash>0?0.92:1);
  ctx.restore();
  if(!drawn) { ctx.fillStyle = s.enemy.hitFlash>0?"#fff1f2":"#fb7185"; ctx.beginPath(); ctx.arc(s.x, top, s.size*0.24,0,TAU); ctx.fill(); }
  const barW = s.size*0.7;
  ctx.fillStyle = "rgba(15,23,42,0.85)"; ctx.fillRect(s.x-barW/2, top-s.size*0.52, barW, 8);
  ctx.fillStyle = "#fde047"; ctx.fillRect(s.x-barW/2, top-s.size*0.52, barW*clamp(s.enemy.hp/s.enemy.maxHp,0,1), 8);
}

function drawPickup(s) {
  const img = assets.hp;
  const hoverY = s.y - s.size*0.15 + Math.sin(state.elapsed*4 + s.x*0.01)*6;
  ctx.save(); ctx.shadowBlur = 22; ctx.shadowColor = "#4ade80";
  const drawn = drawImageSprite(img, s.x, hoverY, s.size*0.56, s.size*0.56);
  ctx.restore();
  if(!drawn) { ctx.fillStyle = "#4ade80"; ctx.beginPath(); ctx.arc(s.x, hoverY, s.size*0.18,0,TAU); ctx.fill(); }
}

function drawImageSprite(img,x,y,w,h,alpha=1) {
  if(!img || !img.complete || img.naturalWidth===0) return false;
  ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(img, x-w/2, y-h/2, w, h); ctx.restore();
  return true;
}

function drawWeaponDrop(s) {
  const w = WEAPONS[s.drop.weaponIndex];
  const img = assets[w.imageKey];
  const hover = Math.sin(s.drop.pulse)*8;
  const drawY = s.y - s.size*0.15 + hover;
  ctx.save(); ctx.shadowBlur = 26; ctx.shadowColor = w.color;
  const drawn = drawImageSprite(img, s.x, drawY, s.size*0.75, s.size*0.75);
  ctx.restore();
  if(!drawn) { ctx.fillStyle = w.color; ctx.fillRect(s.x-s.size*0.18, drawY-s.size*0.18, s.size*0.36, s.size*0.36); }
  ctx.fillStyle = "rgba(226,232,240,0.95)";
  ctx.font = `${Math.max(10, s.size*0.12)}px Unbounded`;
  ctx.textAlign = "center";
  ctx.fillText(`${w.slot}`, s.x, drawY - s.size*0.42);
  ctx.textAlign = "left";
}

function drawBoosterDrop(s) {
  const info = GRENADE_BOOST_TYPES[s.drop.type];
  const img = assets[info.imageKey];
  const hover = Math.sin(s.drop.pulse)*8;
  const drawY = s.y - s.size*0.12 + hover;
  ctx.save(); ctx.shadowBlur = 24; ctx.shadowColor = info.color;
  const drawn = drawImageSprite(img, s.x, drawY, s.size*0.68, s.size*0.68);
  ctx.restore();
  if(!drawn) {
    const bw = s.size*0.62, bh = s.size*0.42;
    ctx.save(); ctx.shadowBlur = 24; ctx.shadowColor = info.color;
    ctx.fillStyle = "rgba(8,15,30,0.92)"; ctx.fillRect(s.x-bw/2, drawY-bh/2, bw, bh);
    ctx.strokeStyle = info.color; ctx.lineWidth = 2; ctx.strokeRect(s.x-bw/2, drawY-bh/2, bw, bh);
    ctx.fillStyle = info.color;
    ctx.font = `700 ${Math.max(10, s.size*0.12)}px Unbounded`;
    ctx.textAlign = "center";
    ctx.fillText(info.shortLabel, s.x, drawY+Math.max(4, s.size*0.04));
    ctx.restore();
  }
  ctx.textAlign = "left";
}

function drawEnemyProjectile(s) { ctx.save(); ctx.shadowBlur=26; ctx.shadowColor="#f97316"; ctx.fillStyle="#fb923c"; ctx.beginPath(); ctx.arc(s.x, s.y-s.size*0.1, Math.max(3,s.size*0.12),0,TAU); ctx.fill(); ctx.restore(); }
function drawGrenade(s) { const bomb=assets.bomb; const drawn=drawImageSprite(bomb, s.x, s.y-s.size*0.08, s.size*0.6, s.size*0.6); if(!drawn){ ctx.save(); ctx.shadowBlur=20; ctx.shadowColor="#f97316"; ctx.fillStyle="#fb923c"; ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(4,s.size*0.18),0,TAU); ctx.fill(); ctx.restore(); } }
function drawExplosion(s) { const alpha=clamp(1-s.explosion.age/s.explosion.life,0,1); ctx.save(); ctx.globalAlpha=alpha*0.7; ctx.strokeStyle=s.explosion.color; ctx.lineWidth=Math.max(2,s.size*0.08); ctx.beginPath(); ctx.arc(s.x, s.y, s.size*0.4,0,TAU); ctx.stroke(); ctx.restore(); }
function drawParticle(s) { ctx.fillStyle=s.particle.color; ctx.beginPath(); ctx.arc(s.x, s.y-s.particle.z*60, Math.max(1.5,s.size*0.06),0,TAU); ctx.fill(); }

function drawWeapon() {
  const w = getCurrentWeapon();
  const img = assets[w.imageKey];
  const bob = Math.sin(player.weaponBob)*10;
  const kick = player.weaponKick*26;
  const cx = WIDTH*0.52, baseY = HEIGHT*0.76 + bob + kick;
  const dw = 430*w.viewScale, dh = 430*w.viewScale;
  ctx.save(); ctx.shadowBlur = 22; ctx.shadowColor = `${w.color}88`;
  const drawn = drawImageSprite(img, cx, baseY, dw, dh);
  ctx.restore();
  if(!drawn) {
    ctx.save(); ctx.shadowBlur=28; ctx.shadowColor=`${w.color}66`;
    const grad = ctx.createLinearGradient(0,HEIGHT*0.62,0,HEIGHT);
    grad.addColorStop(0,"#475569"); grad.addColorStop(1,"#0f172a");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(WIDTH*0.3, HEIGHT-20+bob+kick);
    ctx.lineTo(WIDTH*0.43, HEIGHT*0.63+bob*0.5+kick);
    ctx.lineTo(WIDTH*0.58, HEIGHT*0.6+kick*0.8);
    ctx.lineTo(WIDTH*0.72, HEIGHT-20+bob+kick);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  if(state.flash>0) { ctx.fillStyle = `rgba(255,241,194,${state.flash*0.75})`; ctx.beginPath(); ctx.moveTo(WIDTH*0.516,HEIGHT*0.43); ctx.lineTo(WIDTH*0.475,HEIGHT*0.36); ctx.lineTo(WIDTH*0.516,HEIGHT*0.3); ctx.lineTo(WIDTH*0.557,HEIGHT*0.36); ctx.closePath(); ctx.fill(); }
}

function drawHud() {
  const w = getCurrentWeapon();
  const aliveCount = state.enemies.filter(e=>e.hp>0).length;
  const survived = Math.floor(state.elapsed);
  const stats = getGrenadeStats();
  ctx.fillStyle = "#e2ecff"; ctx.font = "700 28px Unbounded"; ctx.fillText(`ОЧКИ ${player.score}`, 28, 42);
  ctx.fillStyle = "#7dd3fc"; ctx.font = "700 18px Unbounded";
  ctx.fillText(`ВОЛНА ${state.wave}`, 30, 70);
  ctx.fillText(`УБИЙСТВ ${player.kills}`, 30, 96);
  ctx.fillText(`ВРАГОВ ${aliveCount}`, 30, 122);
  ctx.fillText(`ВРЕМЯ ${survived}с`, 30, 148);
  ctx.fillStyle = "rgba(8,15,30,0.74)"; ctx.fillRect(26, HEIGHT-50, 250, 18);
  ctx.fillStyle = "#22c55e"; ctx.fillRect(26, HEIGHT-50, 250*(player.hp/100), 18);
  ctx.strokeStyle = "rgba(226,232,240,0.16)"; ctx.strokeRect(26, HEIGHT-50, 250, 18);
  ctx.fillStyle = w.color; ctx.font = "700 18px Unbounded"; ctx.fillText(`${w.slot}. ${w.name}`, 28, HEIGHT-78);
  ctx.fillStyle = "#e2ecff"; ctx.font = "600 14px Unbounded"; ctx.fillText(`ХП ${Math.ceil(player.hp)}/100`, 30, HEIGHT-58);
  ctx.textAlign = "right"; ctx.fillStyle = "rgba(226,236,255,0.9)"; ctx.font = "600 14px Unbounded";
  ctx.fillText("WASD движение | Мышь прицел | Клик выстрел | Shift бег", WIDTH-28, 40);
  ctx.textAlign = "left";
  const panelX = WIDTH-290, panelY = HEIGHT-174;
  for(let i=0;i<WEAPONS.length;i++) {
    const info = WEAPONS[i];
    const unlocked = player.unlockedWeapons.includes(i);
    const selected = player.weaponIndex===i;
    const rowY = panelY + i*26;
    ctx.fillStyle = selected ? "rgba(30,41,59,0.88)" : "rgba(8,15,30,0.58)";
    ctx.fillRect(panelX, rowY-16, 250, 22);
    ctx.fillStyle = unlocked ? info.color : "#64748b";
    ctx.font = unlocked ? "600 14px Unbounded" : "600 13px Unbounded";
    ctx.fillText(`${info.slot}. ${unlocked ? info.name : "ЗАБЛОКИРОВАНО"}`, panelX+10, rowY);
  }
  if(player.weaponIndex===GRENADE_WEAPON_INDEX) {
    const bx = WIDTH-290, by = 190;
    ctx.fillStyle = "rgba(8,15,30,0.72)"; ctx.fillRect(bx, by, 252, 84);
    ctx.strokeStyle = "rgba(249,115,22,0.22)"; ctx.strokeRect(bx, by, 252, 84);
    ctx.fillStyle = "#fdba74"; ctx.font = "700 15px Unbounded"; ctx.fillText("Улучшения гранатомёта", bx+12, by+22);
    ctx.fillStyle = GRENADE_BOOST_TYPES.reload.color; ctx.font = "600 13px Unbounded";
    ctx.fillText(`Перезарядка x${player.grenadeBoosts.reload}/5   |   ${stats.cooldown.toFixed(2)}с`, bx+12, by+48);
    ctx.fillStyle = GRENADE_BOOST_TYPES.radius.color;
    ctx.fillText(`Радиус x${player.grenadeBoosts.radius}/5   |   ${stats.splashRadius.toFixed(2)}`, bx+12, by+68);
  }
  drawCrosshair(); drawMiniMap();
  if(!state.pointerLocked && player.alive) {
    ctx.fillStyle = "rgba(3,8,18,0.7)"; ctx.fillRect(WIDTH/2-170, HEIGHT-88, 340, 38);
    ctx.fillStyle = "#dbeafe"; ctx.font = "600 16px Unbounded"; ctx.textAlign = "center";
    ctx.fillText("Кликните по канвасу для захвата мыши", WIDTH/2, HEIGHT-62);
    ctx.textAlign = "left";
  }
}

function drawCrosshair() {
  const w = getCurrentWeapon();
  const cx = WIDTH/2, cy = HEIGHT/2;
  ctx.strokeStyle = player.reload>0 ? "#fca5a5" : "#f8fafc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx-15,cy); ctx.lineTo(cx-5,cy);
  ctx.moveTo(cx+5,cy); ctx.lineTo(cx+15,cy);
  ctx.moveTo(cx,cy-15); ctx.lineTo(cx,cy-5);
  ctx.moveTo(cx,cy+5); ctx.lineTo(cx,cy+15);
  ctx.stroke();
  ctx.fillStyle = w.color; ctx.beginPath(); ctx.arc(cx,cy,2.5,0,TAU); ctx.fill();
}

function drawArenaMap(ox, oy, scale, opts={}) {
  const {padding=10,bg="rgba(4,10,22,0.72)",pr=3.5,er=2.8,pkr=2.4,wr=3.2,gr=3}=opts;
  ctx.fillStyle = bg; ctx.fillRect(ox-padding, oy-padding, map[0].length*scale+padding*2, map.length*scale+padding*2);
  for(let y=0;y<map.length;y++) {
    for(let x=0;x<map[y].length;x++) {
      ctx.fillStyle = map[y][x]==="#" ? "#20344f" : "#07111f";
      ctx.fillRect(ox+x*scale, oy+y*scale, scale-1, scale-1);
    }
  }
  for(const e of state.enemies) { ctx.fillStyle="#fb7185"; ctx.beginPath(); ctx.arc(ox+e.x*scale, oy+e.y*scale, er,0,TAU); ctx.fill(); }
  for(const p of state.pickups) { ctx.fillStyle="#4ade80"; ctx.beginPath(); ctx.arc(ox+p.x*scale, oy+p.y*scale, pkr,0,TAU); ctx.fill(); }
  for(const d of state.weaponDrops) { ctx.fillStyle=WEAPONS[d.weaponIndex].color; ctx.beginPath(); ctx.arc(ox+d.x*scale, oy+d.y*scale, wr,0,TAU); ctx.fill(); }
  for(const g of state.grenades) { ctx.fillStyle="#f97316"; ctx.beginPath(); ctx.arc(ox+g.x*scale, oy+g.y*scale, gr,0,TAU); ctx.fill(); }
  const pulse = Math.sin(state.minimapPulse*5)*0.4+0.6;
  ctx.fillStyle = "#e2e8f0"; ctx.beginPath(); ctx.arc(ox+player.x*scale, oy+player.y*scale, pr,0,TAU); ctx.fill();
  ctx.strokeStyle = `rgba(125,211,252,${pulse})`; ctx.beginPath(); ctx.moveTo(ox+player.x*scale, oy+player.y*scale); ctx.lineTo(ox+(player.x+Math.cos(player.angle)*1.2)*scale, oy+(player.y+Math.sin(player.angle)*1.2)*scale); ctx.stroke();
}

function drawMiniMap() { const s=10; drawArenaMap(WIDTH-map[0].length*s-28, HEIGHT-map.length*s-28, s, { padding:10, bg:"rgba(4,10,22,0.72)", pr:3.5, er:2.8, pkr:2.4, wr:3.2, gr:3 }); }

function drawDeathMap() {
  // Карта справа
  const mapSize = Math.min(280, Math.min(WIDTH * 0.35, HEIGHT * 0.35));
  const s = Math.min(mapSize / map[0].length, mapSize / map.length);
  const mapWidth = map[0].length * s;
  const mapHeight = map.length * s;
  
  const ox = WIDTH - mapWidth - 40;
  const oy = HEIGHT/2 - mapHeight/2;
  
  ctx.fillStyle = "rgba(5,12,24,0.92)";
  ctx.fillRect(ox - 15, oy - 40, mapWidth + 30, mapHeight + 70);
  ctx.strokeStyle = "rgba(125,211,252,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(ox - 15, oy - 40, mapWidth + 30, mapHeight + 70);
  
  ctx.fillStyle = "#dbeafe";
  ctx.font = `700 ${Math.max(12, Math.min(16, mapHeight * 0.06))}px Unbounded`;
  ctx.textAlign = "center";
  ctx.fillText("Карта арены", ox + mapWidth/2, oy - 18);
  
  drawArenaMap(ox, oy, s, { 
    padding: 0, 
    bg: "rgba(3,10,20,0.92)", 
    pr: Math.max(3, s * 0.6), 
    er: Math.max(2.5, s * 0.5), 
    pkr: Math.max(2, s * 0.4), 
    wr: Math.max(2.5, s * 0.5), 
    gr: Math.max(2.5, s * 0.5) 
  });
}

function drawPostFx() {
  const low = clamp(1 - player.hp/100, 0, 1);
  const danger = low*low;
  const vig = ctx.createRadialGradient(WIDTH/2,HEIGHT/2,160,WIDTH/2,HEIGHT/2,WIDTH*0.72);
  vig.addColorStop(0,"rgba(0,0,0,0)"); vig.addColorStop(1,`rgba(0,0,0,${0.48+danger*0.16})`);
  ctx.fillStyle = vig; ctx.fillRect(0,0,WIDTH,HEIGHT);
  if(danger>0 && player.alive) { ctx.fillStyle = `rgba(127,29,29,${0.05+danger*0.22})`; ctx.fillRect(0,0,WIDTH,HEIGHT); }
  if(player.hurtTimer>0) { ctx.fillStyle = `rgba(248,113,113,${player.hurtTimer*0.14+danger*0.06})`; ctx.fillRect(0,0,WIDTH,HEIGHT); }
  ctx.fillStyle = `rgba(255,255,255,${0.018+danger*0.01})`;
  for(let i=0;i<10;i++) ctx.fillRect(0, i*72+((state.elapsed*30)%72), WIDTH, 1);
  if(!player.alive) {
    ctx.fillStyle = "rgba(2,6,23,0.85)";
    ctx.fillRect(0,0,WIDTH,HEIGHT);
    ctx.textAlign = "center";
    
    const titleSize = Math.min(48, Math.max(28, Math.floor(HEIGHT * 0.07)));
    const subtitleSize = Math.min(18, Math.max(12, Math.floor(HEIGHT * 0.03)));
    
    ctx.fillStyle = "#f8fafc";
    ctx.font = `800 ${titleSize}px Unbounded`;
    ctx.fillText("ЗАВЕРШЕНИЕ", WIDTH/2, HEIGHT/2 - HEIGHT * 0.2);
    
    ctx.fillStyle = "#fca5a5";
    ctx.font = `600 ${subtitleSize}px Unbounded`;
    ctx.fillText("Вы погибли", WIDTH/2, HEIGHT/2 - HEIGHT * 0.12);
    
    // Кнопка "Вернуться в меню" слева
    const btnWidth = 180;
    const btnHeight = 40;
    const btnX = 40;
    const btnY = HEIGHT - 70;
    
    ctx.fillStyle = "rgba(125,211,252,0.2)";
    ctx.fillRect(btnX, btnY, btnWidth, btnHeight);
    ctx.strokeStyle = "#7dd3fc";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(btnX, btnY, btnWidth, btnHeight);
    ctx.fillStyle = "#7dd3fc";
    ctx.font = `600 ${Math.max(12, Math.min(14, subtitleSize))}px Unbounded`;
    ctx.fillText("Вернуться в меню", btnX + btnWidth/2, btnY + btnHeight/2 + 5);
    
    // Сохраняем состояние для клика по кнопке
    if (typeof window.deathMenuButton === "undefined") {
      window.deathMenuButton = { x: btnX, y: btnY, w: btnWidth, h: btnHeight };
    } else {
      window.deathMenuButton.x = btnX;
      window.deathMenuButton.y = btnY;
      window.deathMenuButton.w = btnWidth;
      window.deathMenuButton.h = btnHeight;
    }
    
    drawDeathMap();
    ctx.textAlign = "left";
  }
}

function render() { drawBackground(); drawWorld(); drawWeapon(); drawHud(); drawPostFx(); }

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - lastTime)/1000);
  lastTime = now;
  updateGame(dt);
  render();
  requestAnimationFrame(loop);
}

// Обработка клика по кнопке "Вернуться в меню" при смерти
canvas.addEventListener("click", (e) => {
  if (!player.alive && window.deathMenuButton) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    const btn = window.deathMenuButton;
    if (mouseX >= btn.x && mouseX <= btn.x + btn.w && mouseY >= btn.y && mouseY <= btn.y + btn.h) {
      resetGame();
      overlay.classList.remove("hidden");
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
      state.pointerLocked = false;
    }
  }
});

document.addEventListener("keydown", (e) => {
  if (e.code === "Backquote") { e.preventDefault(); state.consoleOpen ? closeConsole() : openConsole(); return; }
  if (state.consoleOpen) return;
  keys.add(e.code);
  if (e.code === "KeyR") { resetGame(); overlay.classList.remove("hidden"); if (document.pointerLockElement === canvas) document.exitPointerLock(); state.pointerLocked = false; }
  if (e.code === "Space" && player.alive) { fireCurrentWeapon(); e.preventDefault(); }
  if (e.code.startsWith("Digit")) { const slot = Number(e.code.replace("Digit","")); if(slot>=1 && slot<=WEAPONS.length) equipWeapon(slot-1); }
});
document.addEventListener("keyup", (e) => { if(!state.consoleOpen) keys.delete(e.code); });
canvas.addEventListener("mousedown", (e) => {
  // Проверяем, не кликнули ли по кнопке в меню смерти
  if (!player.alive && window.deathMenuButton) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    const btn = window.deathMenuButton;
    if (mouseX >= btn.x && mouseX <= btn.x + btn.w && mouseY >= btn.y && mouseY <= btn.y + btn.h) {
      return; // Не стреляем, обработаем в click
    }
  }
  state.mouseDown = true;
  if(!state.pointerLocked && player.alive) canvas.requestPointerLock();
  if(player.alive) fireCurrentWeapon();
});
document.addEventListener("mouseup", () => { state.mouseDown = false; });
canvas.addEventListener("click", () => { if(!state.pointerLocked && player.alive) canvas.requestPointerLock(); });
document.addEventListener("pointerlockchange", () => { state.pointerLocked = document.pointerLockElement === canvas; });
document.addEventListener("mousemove", (e) => { if(state.pointerLocked && player.alive) player.angle += e.movementX * 0.0025; });
devConsoleInput.addEventListener("keydown", (e) => { if(e.key==="Escape") { e.preventDefault(); closeConsole(); return; } if(e.key==="Enter") { e.preventDefault(); executeConsoleCommand(devConsoleInput.value); devConsoleInput.select(); } });
startButton.addEventListener("click", () => { resetGame(); overlay.classList.add("hidden"); canvas.requestPointerLock(); });

function resizeCanvas() {
  const ratio = 16/9;
  const maxW = window.innerWidth - 24;
  const maxH = window.innerHeight - 24;
  let w = Math.min(maxW, 1400);
  let h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();
resetGame();
requestAnimationFrame(loop);
