import * as THREE from './three.module.js';
import { createWorld, CITY } from './world.js';
import { createPed, animatePed, createCar, updateCarVisual } from './actors.js';
import { AudioEngine } from './audio.js';
import { HUD } from './hud.js';
import { Input } from './input.js';

/* ================================================================== */
/*  Core setup                                                         */
/* ================================================================== */
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.matchMedia('(pointer: coarse)').matches ? 1.25 : 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
camera.position.set(0, 8, 60);

const hud = new HUD();
const input = new Input(canvas);
const audio = new AudioEngine();

const state = {
  mode: 'boot',
  time: 0,
  gameMinutes: 19 * 60 + 42,
  cash: 500,
  heat: 0,
  wanted: 0,
  lastCrime: -99,
  missionCount: 0,
  missionCooldown: 2,
  nextPoliceSpawn: 0,
  nextCopSpawn: 0,
  menuTime: 0,
  clockMinute: -1,
  lastDamage: -99,
  shake: 0,
};

let world = null;
let mission = null;
let objectiveMarker = null;
let targetMarker = null;
let playerCar = null;
let elapsed = 0;

const vehicles = [];
const peds = [];
const cops = [];
const policeCars = [];

const player = {
  group: null,
  ped: null,
  pos: null,
  heading: 0,
  health: 100,
  armor: 50,
  inCar: null,
  ammo: 12,
  reloading: 0,
  fireCooldown: 0,
  jumpOffset: 0,
  vy: 0,
  baseY: 0,
  aiming: false,
  lastStep: 0,
  velX: 0,
  velZ: 0,
  jumpRequested: false,
};

let camYaw = 0, camPitch = 0.08;
let carLookYaw = 0, carLookPitch = 0.1;
let shake = 0;
let muzzleTimer = 0;
let lastPrompt = '';

const raycaster = new THREE.Raycaster();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/* ================================================================== */
/*  Effects                                                            */
/* ================================================================== */
function makeGlowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTexture = makeGlowTexture();

class Particles {
  constructor(scene, max = 900) {
    this.max = max;
    this.data = new Array(max).fill(null).map(() => ({ life: 0, max: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), gravity: -9, color: new THREE.Color(), base: new THREE.Color() }));
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.3, map: glowTexture, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
  }
  spawn(pos, color, count, opts = {}) {
    const speed = opts.speed ?? 6, life = opts.life ?? 0.7, gravity = opts.gravity ?? -9, spread = opts.spread ?? 0.25;
    for (let n = 0; n < count; n++) {
      const p = this.data[this.cursor];
      this.cursor = (this.cursor + 1) % this.max;
      p.pos.set(pos.x + rnd(-spread, spread), pos.y + rnd(-spread, spread), pos.z + rnd(-spread, spread));
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(rnd(-1, 1));
      const s = rnd(speed * 0.35, speed);
      p.vel.set(Math.sin(phi) * Math.cos(theta) * s, Math.abs(Math.cos(phi)) * s * 0.8 + rnd(0, 2), Math.sin(phi) * Math.sin(theta) * s);
      p.life = p.max = life * rnd(0.6, 1.3);
      p.gravity = gravity;
      p.base.set(color);
      p.color.copy(p.base);
    }
  }
  update(dt) {
    const pos = this.positions, col = this.colors;
    for (let i = 0; i < this.max; i++) {
      const p = this.data[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vel.y += p.gravity * dt;
        p.pos.addScaledVector(p.vel, dt);
        const f = Math.max(0, p.life / p.max);
        p.color.copy(p.base).multiplyScalar(f * f);
        pos[i * 3] = p.pos.x; pos[i * 3 + 1] = p.pos.y; pos[i * 3 + 2] = p.pos.z;
        col[i * 3] = p.color.r; col[i * 3 + 1] = p.color.g; col[i * 3 + 2] = p.color.b;
      } else {
        pos[i * 3 + 1] = -999;
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
let particles = null;

class Tracers {
  constructor(scene, count = 24) {
    this.list = [];
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const mat = new THREE.LineBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const line = new THREE.Line(geo, mat);
      line.visible = false; line.frustumCulled = false;
      scene.add(line);
      this.list.push({ line, mat, geo, life: 0 });
    }
    this.cursor = 0;
  }
  fire(from, to, color = 0xffe6a8) {
    const t = this.list[this.cursor]; this.cursor = (this.cursor + 1) % this.list.length;
    const arr = t.geo.attributes.position.array;
    arr[0] = from.x; arr[1] = from.y; arr[2] = from.z;
    arr[3] = to.x; arr[4] = to.y; arr[5] = to.z;
    t.geo.attributes.position.needsUpdate = true;
    t.mat.color.set(color); t.mat.opacity = 0.95; t.life = 0.1;
    t.line.visible = true;
  }
  update(dt) {
    for (const t of this.list) {
      if (t.life > 0) {
        t.life -= dt;
        t.mat.opacity = Math.max(0, t.life / 0.1) * 0.95;
        if (t.life <= 0) t.line.visible = false;
      }
    }
  }
}
let tracers = null;

let muzzleSprite = null, muzzleLight = null;
let flashSprite = null, flashLife = 0;

function setupEffects() {
  particles = new Particles(scene, 1000);
  tracers = new Tracers(scene, 28);

  muzzleSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xffe0a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  muzzleSprite.scale.set(1.3, 1.3, 1); muzzleSprite.visible = false; scene.add(muzzleSprite);
  muzzleLight = new THREE.PointLight(0xffc070, 0, 14, 2); scene.add(muzzleLight);

  flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xffb050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flashSprite.visible = false; scene.add(flashSprite);
}

function flashAt(pos, color, scale, life = 0.25) {
  flashSprite.position.copy(pos);
  flashSprite.material.color.set(color);
  flashSprite.scale.set(scale, scale, 1);
  flashSprite.material.opacity = 1;
  flashSprite.visible = true;
  flashLife = life;
}

/* ================================================================== */
/*  Player + entities                                                  */
/* ================================================================== */
function setupPlayer() {
  player.group = new THREE.Group();
  player.ped = createPed({ role: 'player', shirt: '#e83f86', pants: '#1d1b24', skin: '#d9a07c' });
  player.group.add(player.ped.group);
  player.pos = player.group.position;
  player.pos.copy(world.spawn.player);
  player.heading = 0;
  player.baseY = groundY(player.pos.x, player.pos.z);
  player.pos.y = player.baseY;
  player.group.rotation.y = 0;
  player.ped.gun.visible = true;
  scene.add(player.group);

  playerCar = makeVehicle('muscle', '#e0345f', world.spawn.car, 0, null);
  playerCar.name = 'player';
}

function groundY(x, z) {
  for (const b of world.blocks) {
    if (Math.abs(x - b.cx) < CITY.blockSize / 2 - 0.1 && Math.abs(z - b.cz) < CITY.blockSize / 2 - 0.1) return 0.28;
  }
  return 0;
}

function makeVehicle(type, color, pos, heading, ai) {
  const model = createCar(type, color);
  model.group.position.copy(pos);
  model.group.position.y = 0;
  model.group.rotation.y = heading;
  scene.add(model.group);
  const v = {
    kind: 'vehicle', group: model.group, model, type, color, pos: model.group.position,
    heading, speed: 0, steer: 0, lateral: 0,
    health: type === 'police' ? 150 : type === 'truck' ? 220 : 120,
    maxHealth: type === 'police' ? 150 : type === 'truck' ? 220 : 120,
    ai, occupied: false, destroyed: false, isPolice: type === 'police',
    route: null, sirenPhase: Math.random() * 10, spawnTime: state.time,
  };
  model.group.traverse((o) => { if (o.isMesh) o.userData.entity = v; });
  vehicles.push(v);
  if (ai === 'police') policeCars.push(v);
  return v;
}

function makePed(role, pos, opts = {}) {
  const ped = createPed({ role, shirt: opts.shirt, pants: opts.pants, skin: opts.skin });
  ped.group.position.copy(pos);
  ped.group.position.y = groundY(pos.x, pos.z);
  ped.group.rotation.y = opts.heading || 0;
  scene.add(ped.group);
  const e = {
    kind: 'ped', group: ped.group, ped, pos: ped.group.position, role,
    heading: opts.heading || 0, speed: 0, health: opts.health || 100, maxHealth: opts.health || 100,
    dead: false, removed: false, deadTimer: 0, state: opts.state || 'wander',
    isCop: role === 'cop', isGang: role === 'gang', isTarget: !!opts.isTarget, isGuard: !!opts.isGuard,
    target: null, side: 0, t: 0, dir: Math.random() < 0.5 ? 1 : -1, block: null,
    wanderTimer: rnd(1, 5), shootTimer: rnd(0.6, 1.6), fleeTimer: 0, hitFlash: 0,
    aimTimer: 0,
  };
  ped.group.traverse((o) => { if (o.isMesh) o.userData.entity = e; });
  e.block = nearestBlock(pos.x, pos.z);
  e.side = Math.floor(Math.random() * 4);
  e.t = rnd(-18, 18);
  peds.push(e);
  if (e.isCop) cops.push(e);
  return e;
}

function nearestBlock(x, z) {
  let best = world.blocks[0], bd = Infinity;
  for (const b of world.blocks) {
    const d = (x - b.cx) ** 2 + (z - b.cz) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function sidePoint(block, side, t) {
  const off = CITY.blockSize / 2 - 1.2;
  switch (side) {
    case 0: return { x: block.cx + off, z: block.cz + t };
    case 1: return { x: block.cx - off, z: block.cz + t };
    case 2: return { x: block.cx + t, z: block.cz + off };
    default: return { x: block.cx + t, z: block.cz - off };
  }
}

function randomSidewalkPoint(center, minD = 0, maxD = 999) {
  for (let k = 0; k < 80; k++) {
    const b = world.blocks[Math.floor(Math.random() * world.blocks.length)];
    const side = Math.floor(Math.random() * 4);
    const t = rnd(-19, 19);
    const p = sidePoint(b, side, t);
    const d = Math.hypot(p.x - center.x, p.z - center.z);
    if (d >= minD && d <= maxD) return new THREE.Vector3(p.x, 0, p.z);
  }
  return new THREE.Vector3(center.x + rnd(20, 40), 0, center.z + rnd(20, 40));
}

function randomRoadPoint(center, minD = 0, maxD = 999) {
  for (let k = 0; k < 100; k++) {
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const r = world.roadCoords[1 + Math.floor(Math.random() * (world.roadCoords.length - 2))];
    const t = rnd(-205, 205);
    const x = axis === 'x' ? t : r;
    const z = axis === 'x' ? r : t;
    const d = Math.hypot(x - center.x, z - center.z);
    if (d >= minD && d <= maxD) return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(center.x + rnd(30, 60), 0, center.z + rnd(30, 60));
}

function spawnTraffic(count = 14) {
  const types = ['sedan', 'sedan', 'taxi', 'sports', 'van', 'muscle', 'truck', 'sedan'];
  const colors = ['#c9ccd6', '#2f3b52', '#8e2638', '#d8a327', '#2a7a68', '#6c4bb0', '#bdb5a8', '#30455f', '#8d2b52', '#d9d9e2'];
  for (let i = 0; i < count; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const road = world.roadCoords[1 + Math.floor(Math.random() * (world.roadCoords.length - 2))];
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lane = (Math.random() < 0.5 ? 1 : -1) * 3.2;
    const along = rnd(-190, 190);
    const pos = axis === 'x' ? new THREE.Vector3(along, 0, road + lane) : new THREE.Vector3(road + lane, 0, along);
    const heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const v = makeVehicle(type, color, pos, heading, 'traffic');
    v.speed = rnd(7, 11);
    v.route = { axis, dir, lane, road, lastTurn: -10 };
  }
  // a few parked cars within walking distance of the spawn
  const parkedTypes = ['sedan', 'sports', 'muscle', 'van', 'sedan', 'taxi'];
  for (let i = 0; i < 6; i++) {
    const p = randomRoadPoint(world.spawn.player, 14, 85);
    const v = makeVehicle(parkedTypes[i % parkedTypes.length], colors[(i * 3 + 1) % colors.length], p, Math.random() < 0.5 ? 0 : Math.PI, 'parked');
    v.speed = 0;
  }
}

function spawnPeds(count = 22) {
  for (let i = 0; i < count; i++) {
    const near = i < 7;
    const p = randomSidewalkPoint(world.spawn.player, near ? 8 : 40, near ? 42 : 215);
    makePed('civilian', p, {});
  }
}

/* ================================================================== */
/*  Collision                                                          */
/* ================================================================== */
function resolveCircle(pos, radius) {
  let hit = false;
  for (const c of world.colliders) {
    if (pos.y > c.height + 0.3) continue;
    const cx = clamp(pos.x, c.minX, c.maxX);
    const cz = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = radius - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      } else {
        const left = pos.x - c.minX, right = c.maxX - pos.x;
        const top = pos.z - c.minZ, bottom = c.maxZ - pos.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = c.minX - radius;
        else if (m === right) pos.x = c.maxX + radius;
        else if (m === top) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  return hit;
}

function insideBuilding(p, pad = 0.25) {
  for (const c of world.colliders) {
    if (p.y > c.height + pad) continue;
    if (p.x > c.minX - pad && p.x < c.maxX + pad && p.z > c.minZ - pad && p.z < c.maxZ + pad) return true;
  }
  return false;
}

function lineOfSight(from, to) {
  const dir = tmpA.copy(to).sub(from);
  const dist = dir.length();
  if (dist < 0.01) return true;
  dir.normalize();
  raycaster.set(from, dir);
  raycaster.far = dist - 0.25;
  const hits = raycaster.intersectObjects(world.solidMeshes, false);
  return hits.length === 0;
}

/* ================================================================== */
/*  Player update                                                      */
/* ================================================================== */
function updatePlayer(dt) {
  const look = input.consumeLook();
  if (player.inCar) {
    carLookYaw -= look.x * 0.0018;
    carLookPitch = clamp(carLookPitch + look.y * 0.0015, -0.2, 0.55);
    if (input.isTouch) {
      carLookYaw -= input.mobileLook.x * 0.0028;
      carLookPitch = clamp(carLookPitch + input.mobileLook.y * 0.0025, -0.2, 0.55);
    }
  } else {
    camYaw -= look.x * 0.0022;
    camPitch = clamp(camPitch + look.y * 0.0022, -0.32, 0.95);
    if (input.isTouch) {
      camYaw -= input.mobileLook.x * 0.0035;
      camPitch = clamp(camPitch + input.mobileLook.y * 0.0035, -0.32, 0.95);
    }
  }

  player.aiming = input.aim && !player.inCar;
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);

  if (player.inCar) {
    updateDriving(dt);
  } else {
    updateOnFoot(dt);
  }

  if (input.consume('KeyR')) startReload();
  if (input.consume('Space') || player.jumpRequested) {
    player.jumpRequested = false;
    if (player.inCar) {
      // handbrake handled by held Space
    } else if (player.jumpOffset <= 0.001 && player.vy <= 0) {
      player.vy = 5.4;
    }
  }
  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0) {
      player.ammo = 12;
      hud.setWeapon(player.ammo, false);
    }
  }

  if (input.fire && !player.inCar && state.mode === 'playing') fireWeapon();

  if (player.health < 100 && state.time - state.lastDamage > 7) {
    player.health = Math.min(100, player.health + dt * 3.2);
  }

  player.ped.gun.visible = !player.inCar;
  if (!player.inCar) {
    animatePed(player.ped, Math.hypot(player.velX || 0, player.velZ || 0), dt);
    if (player.aiming) {
      player.ped.limbs.rightArm.rotation.x = -1.35;
      player.ped.limbs.leftArm.rotation.x = -1.15;
      player.ped.limbs.rightArm.rotation.z = -0.15;
      player.ped.limbs.leftArm.rotation.z = 0.15;
    } else {
      player.ped.limbs.rightArm.rotation.z = 0;
      player.ped.limbs.leftArm.rotation.z = 0;
    }
  }
}

function updateOnFoot(dt) {
  const f = clamp(input.forward, -1, 1);
  const s = clamp(input.strafe, -1, 1);
  let mx = s, mz = f;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const speed = (input.sprint ? 7.4 : 4.5) * (player.aiming ? 0.72 : 1);
  const fwdX = Math.sin(camYaw), fwdZ = Math.cos(camYaw);
  const rightX = -Math.cos(camYaw), rightZ = Math.sin(camYaw);
  const wishX = fwdX * mz + rightX * mx;
  const wishZ = fwdZ * mz + rightZ * mx;
  const accel = player.jumpOffset > 0 ? 5 : 16;
  player.velX = lerp(player.velX || 0, wishX * speed, Math.min(1, accel * dt));
  player.velZ = lerp(player.velZ || 0, wishZ * speed, Math.min(1, accel * dt));
  player.pos.x += player.velX * dt;
  player.pos.z += player.velZ * dt;

  const moving = Math.hypot(player.velX, player.velZ);
  if (moving > 0.4) {
    if (player.aiming || input.fire) {
      player.heading = angleLerp(player.heading, camYaw, Math.min(1, dt * 14));
    } else {
      player.heading = angleLerp(player.heading, Math.atan2(player.velX, player.velZ), Math.min(1, dt * 10));
    }
  } else if (player.aiming) {
    player.heading = angleLerp(player.heading, camYaw, Math.min(1, dt * 14));
  }

  // jump physics
  if (player.vy !== 0 || player.jumpOffset > 0) {
    player.jumpOffset += player.vy * dt;
    player.vy -= 19 * dt;
    if (player.jumpOffset <= 0) { player.jumpOffset = 0; player.vy = 0; }
  }

  player.baseY = lerp(player.baseY, groundY(player.pos.x, player.pos.z), Math.min(1, dt * 12));
  player.pos.y = player.baseY + player.jumpOffset;

  resolveCircle(player.pos, 0.48);
  for (const v of vehicles) {
    if (v.destroyed) continue;
    const d = distXZ(player.pos, v.pos);
    const min = 1.95;
    if (d < min && d > 0.001) {
      player.pos.x += ((player.pos.x - v.pos.x) / d) * (min - d);
      player.pos.z += ((player.pos.z - v.pos.z) / d) * (min - d);
    }
  }
  player.pos.x = clamp(player.pos.x, -231, 231);
  player.pos.z = clamp(player.pos.z, -231, 231);
  player.group.rotation.y = player.heading;
}

function updateDriving(dt) {
  const car = player.inCar;
  const cfg = car.model.cfg;
  const throttle = clamp(input.forward, -1, 1);
  const steerIn = -clamp(input.strafe, -1, 1);
  const handbrake = input.keys.has('Space') || input.mobileSprint;

  const maxSpeed = car.type === 'sports' || car.type === 'muscle' ? 41 : car.type === 'truck' ? 24 : car.type === 'van' ? 29 : 35;
  const accel = car.type === 'sports' || car.type === 'muscle' ? 24 : car.type === 'truck' ? 10 : 16;

  if (throttle > 0) car.speed += accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 0.3) car.speed -= 34 * dt;
    else car.speed -= 11 * dt;
  } else {
    car.speed -= car.speed * 0.45 * dt;
  }
  car.speed -= car.speed * 0.16 * dt;
  if (handbrake) car.speed *= Math.pow(0.12, dt);
  car.speed = clamp(car.speed, -11, maxSpeed);

  const speedAbs = Math.abs(car.speed);
  const grip = handbrake ? 0.45 : 1;
  car.steer = lerp(car.steer, steerIn * 0.62, Math.min(1, dt * 9));
  const turnRate = (1.55 - Math.min(0.65, speedAbs / 55)) * clamp(speedAbs / 3.5, 0, 1) * grip;
  car.heading += car.steer * turnRate * dt * (car.speed >= 0 ? 1 : -1);

  if (handbrake && speedAbs > 5) car.lateral = lerp(car.lateral, -car.steer * speedAbs * 0.5, Math.min(1, dt * 7));
  else car.lateral *= Math.pow(0.02, dt);

  const fwdX = Math.sin(car.heading), fwdZ = Math.cos(car.heading);
  const rightX = -Math.cos(car.heading), rightZ = Math.sin(car.heading);
  car.pos.x += (fwdX * car.speed + rightX * car.lateral) * dt;
  car.pos.z += (fwdZ * car.speed + rightZ * car.lateral) * dt;
  car.pos.y = 0;

  const hit = resolveCircle(car.pos, 1.65);
  if (hit) {
    if (Math.abs(car.speed) > 9) {
      car.health -= Math.abs(car.speed) * 0.55;
      shake = Math.min(0.6, shake + Math.abs(car.speed) * 0.012);
      audio.crash();
      particles.spawn(car.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xffc070, 10, { speed: 7, life: 0.5 });
    }
    car.speed *= 0.22;
    car.lateral = 0;
  }
  car.pos.x = clamp(car.pos.x, -231, 231);
  car.pos.z = clamp(car.pos.z, -231, 231);

  car.group.rotation.y = car.heading;
  updateCarVisual(car.model, car.steer, car.speed, dt);

  // collisions with traffic / police
  for (const v of vehicles) {
    if (v === car || v.destroyed || v.occupied) continue;
    const d = distXZ(car.pos, v.pos);
    if (d < 2.85) {
      const nx = (car.pos.x - v.pos.x) / (d || 1);
      const nz = (car.pos.z - v.pos.z) / (d || 1);
      const overlap = 2.85 - d;
      car.pos.x += nx * overlap * 0.55; car.pos.z += nz * overlap * 0.55;
      v.pos.x -= nx * overlap * 0.45; v.pos.z -= nz * overlap * 0.45;
      const rel = Math.abs(car.speed - v.speed);
      if (rel > 4) {
        car.health -= rel * 0.5;
        v.health -= rel * 0.45;
        audio.crash();
        shake = Math.min(0.5, shake + rel * 0.008);
        particles.spawn(tmpA.set((car.pos.x + v.pos.x) / 2, 0.8, (car.pos.z + v.pos.z) / 2), 0xffc070, 8, { speed: 6, life: 0.4 });
      }
      car.speed *= 0.6;
      if (v.ai === 'traffic') v.speed *= 0.5;
      if (v.health <= 0) explodeVehicle(v);
    }
  }

  // run over pedestrians
  const hitPeds = Math.abs(car.speed) > 4;
  if (hitPeds) {
    for (const e of peds) {
      if (e.dead || e.removed) continue;
      if (distXZ(car.pos, e.pos) < 1.75) {
        killPed(e, true);
        car.speed *= 0.82;
        addHeat(e.isCop ? 18 : 30);
      }
    }
  }

  if (car.health <= 0) explodeVehicle(car);

  audio.setEngine(true, car.speed, throttle);
  hud.setSpeed(car.speed * 3.6, true);
}

/* ================================================================== */
/*  Weapons                                                            */
/* ================================================================== */
function startReload() {
  if (player.inCar || player.reloading > 0 || player.ammo >= 12) return;
  player.reloading = 1.15;
  hud.setWeapon(player.ammo, true);
  audio.reload();
}

function fireWeapon() {
  if (player.fireCooldown > 0 || player.reloading > 0 || state.mode !== 'playing') return;
  if (player.ammo <= 0) { startReload(); return; }
  player.ammo--;
  player.fireCooldown = 0.17;
  hud.setWeapon(player.ammo, false);
  hud.setSpread(7);
  audio.gunshot();
  shake = Math.min(0.45, shake + 0.1);
  camPitch = clamp(camPitch + 0.012, -0.32, 0.95);

  const origin = camera.position.clone();
  const dir = camera.getWorldDirection(new THREE.Vector3());
  raycaster.set(origin, dir);
  raycaster.far = 130;

  const targets = [];
  for (const e of peds) if (!e.dead && !e.removed) targets.push(e.group);
  for (const v of vehicles) if (!v.destroyed && v !== player.inCar) targets.push(v.group);
  targets.push(...world.solidMeshes);

  const hits = raycaster.intersectObjects(targets, true);
  let end = origin.clone().addScaledVector(dir, 90);
  let hitEntity = null, hitPoint = null, headshot = false;

  for (const hit of hits) {
    const ent = hit.object.userData.entity;
    if (ent && ent.kind === 'vehicle') {
      end.copy(hit.point); hitEntity = ent; hitPoint = hit.point.clone();
      break;
    }
    if (ent && ent.kind === 'ped') {
      end.copy(hit.point); hitEntity = ent; hitPoint = hit.point.clone();
      headshot = hit.point.y - ent.pos.y > 1.45;
      break;
    }
    // solid building
    end.copy(hit.point); hitPoint = hit.point.clone();
    break;
  }

  const muzzle = getMuzzlePos();
  spawnMuzzle(muzzle);
  tracers.fire(muzzle, end);

  if (hitPoint) {
    if (hitEntity) {
      if (hitEntity.kind === 'ped') {
        damagePed(hitEntity, headshot ? 80 : 34, hitPoint, headshot);
        hud.hitmarker(hitEntity.dead);
      } else {
        hitEntity.health -= 16;
        particles.spawn(hitPoint, 0xffc070, 7, { speed: 5, life: 0.35 });
        audio.hit();
        if (hitEntity.health <= 0) { explodeVehicle(hitEntity); hud.hitmarker(true); }
        else hud.hitmarker(false);
      }
    } else {
      particles.spawn(hitPoint, 0xffd090, 8, { speed: 4.5, life: 0.4 });
    }
  }

  // alert everyone nearby
  for (const e of peds) {
    if (!e.dead && !e.isGang && distXZ(e.pos, player.pos) < 38) {
      e.state = 'flee'; e.fleeTimer = rnd(4, 8);
    }
  }
  addHeat(12);
}

function getMuzzlePos() {
  const h = player.heading;
  return new THREE.Vector3(
    player.pos.x + Math.sin(h) * 0.75 + Math.cos(h) * 0.3,
    player.pos.y + 1.32,
    player.pos.z + Math.cos(h) * 0.75 - Math.sin(h) * 0.3,
  );
}

function spawnMuzzle(pos) {
  muzzleSprite.position.copy(pos);
  muzzleSprite.visible = true;
  muzzleSprite.material.rotation = Math.random() * 6;
  muzzleSprite.material.opacity = 1;
  muzzleLight.position.copy(pos);
  muzzleLight.intensity = 7;
  muzzleTimer = 0.06;
}

function damagePed(e, amount, point, headshot = false) {
  if (e.dead) return;
  e.health -= amount;
  particles.spawn(point, 0xb01428, headshot ? 22 : 12, { speed: 5, life: 0.55, gravity: -12 });
  if (e.health <= 0) killPed(e, headshot);
  else {
    audio.hit();
    if (!e.isGang && !e.isCop) { e.state = 'flee'; e.fleeTimer = 6; }
  }
}

function killPed(e, headshot = false) {
  if (e.dead) return;
  e.dead = true;
  e.health = 0;
  e.deadTimer = 4.5;
  e.speed = 0;
  e.group.rotation.x = -Math.PI / 2;
  e.group.position.y = Math.max(0.25, e.group.position.y - 0.1);
  particles.spawn(e.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), 0x9e1226, 18, { speed: 4.5, life: 0.7, gravity: -12 });
  audio.kill();
  if (e.isCop) addHeat(22);
  else if (e.isTarget) addHeat(8);
  else addHeat(24);
  if (e.isTarget && mission && mission.type === 'bounty') completeMission();
}

/* ================================================================== */
/*  Vehicle enter / exit                                               */
/* ================================================================== */
function nearestVehicle(maxDist = 6.4) {
  let best = null, bd = maxDist;
  for (const v of vehicles) {
    if (v.destroyed || v.occupied || v === player.inCar) continue;
    const d = distXZ(player.pos, v.pos);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function toggleVehicle() {
  if (state.mode !== 'playing') return;
  if (player.inCar) {
    exitVehicle();
  } else {
    const v = nearestVehicle();
    if (!v) return;
    player.inCar = v;
    v.occupied = true;
    v.ai = 'player';
    player.group.visible = false;
    player.pos.y = 0;
    camYaw = v.heading;
    carLookYaw = 0;
    carLookPitch = 0.1;
    hud.setSpeed(0, true);
    document.getElementById('crosshair').classList.add('hidden');
    audio.setEngine(true, v.speed, 0);
    hud.toast('VEHICLE STOLEN', 'gold');
    addHeat(6);
    setActionLabels();
  }
}

function exitVehicle() {
  const car = player.inCar;
  if (!car) return;
  const h = car.heading;
  const rightX = -Math.cos(h), rightZ = Math.sin(h);
  let px = car.pos.x + rightX * 2.2, pz = car.pos.z + rightZ * 2.2;
  if (insideBuilding(tmpA.set(px, 0.5, pz), 0.3)) { px = car.pos.x - rightX * 2.2; pz = car.pos.z - rightZ * 2.2; }
  player.pos.set(px, 0, pz);
  player.baseY = groundY(px, pz);
  player.pos.y = player.baseY;
  player.heading = h;
  player.group.visible = true;
  player.inCar = null;
  car.occupied = false;
  car.ai = 'parked';
  car.speed = 0;
  car.lateral = 0;
  camYaw = h;
  hud.setSpeed(0, false);
  document.getElementById('crosshair').classList.remove('hidden');
  audio.setEngine(false, 0, 0);
  setActionLabels();
}

function setActionLabels() {
  const action = document.getElementById('btn-action');
  const jump = document.getElementById('btn-jump');
  const sprint = document.getElementById('btn-sprint');
  if (!action) return;
  action.textContent = player.inCar ? 'EXIT' : 'CAR';
  jump.textContent = player.inCar ? 'BRAKE' : 'JUMP';
  sprint.textContent = player.inCar ? 'DRIFT' : 'RUN';
}

/* ================================================================== */
/*  Traffic, police, peds                                              */
/* ================================================================== */
function updateTraffic(dt) {
  for (const v of [...vehicles]) {
    if (v.destroyed || v.occupied || v.ai !== 'traffic') continue;
    const r = v.route;
    if (!r) continue;
    const fwdX = Math.sin(v.heading), fwdZ = Math.cos(v.heading);
    let targetSpeed = 9.5;

    for (const o of vehicles) {
      if (o === v || o.destroyed) continue;
      const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
      const ahead = dx * fwdX + dz * fwdZ;
      const side = Math.abs(dx * fwdZ - dz * fwdX);
      if (ahead > 0 && ahead < 13 && side < 2.7) { targetSpeed = 0; break; }
    }
    {
      const dx = player.pos.x - v.pos.x, dz = player.pos.z - v.pos.z;
      const ahead = dx * fwdX + dz * fwdZ;
      const side = Math.abs(dx * fwdZ - dz * fwdX);
      if (ahead > 0 && ahead < 11 && side < 2.9) targetSpeed = 0;
    }

    v.speed += clamp(targetSpeed - v.speed, -11 * dt, 6 * dt);
    v.pos.x += fwdX * v.speed * dt;
    v.pos.z += fwdZ * v.speed * dt;

    // turn at intersections
    const along = r.axis === 'x' ? v.pos.x : v.pos.z;
    const i = Math.round(along / CITY.cell + CITY.grid / 2);
    const roadCoord = (i - CITY.grid / 2) * CITY.cell;
    if (i > 0 && i < CITY.grid && Math.abs(along - roadCoord) < 1.1 && state.time > r.lastTurn + 2.4) {
      r.lastTurn = state.time;
      if (Math.random() < 0.48) {
        const newAxis = r.axis === 'x' ? 'z' : 'x';
        const newDir = Math.random() < 0.5 ? 1 : -1;
        const lane = (Math.random() < 0.5 ? 1 : -1) * 3.2;
        if (r.axis === 'x') {
          v.pos.x = roadCoord;
          v.pos.z = r.road;
          if (newAxis === 'z') v.pos.x = roadCoord + lane;
          else v.pos.z = r.road + lane;
        } else {
          v.pos.z = roadCoord;
          v.pos.x = r.road;
          if (newAxis === 'x') v.pos.z = roadCoord + lane;
          else v.pos.x = r.road + lane;
        }
        r.axis = newAxis; r.dir = newDir; r.lane = lane; r.road = roadCoord;
        v.heading = newAxis === 'x' ? (newDir > 0 ? Math.PI / 2 : -Math.PI / 2) : (newDir > 0 ? 0 : Math.PI);
      }
    }

    if (Math.abs(v.pos.x) > 219 && r.axis === 'x') { r.dir *= -1; v.heading += Math.PI; }
    if (Math.abs(v.pos.z) > 219 && r.axis === 'z') { r.dir *= -1; v.heading += Math.PI; }
    v.pos.x = clamp(v.pos.x, -228, 228); v.pos.z = clamp(v.pos.z, -228, 228);

    v.group.rotation.y = v.heading;
    updateCarVisual(v.model, 0, v.speed, dt);

    // run over the player
    if (!player.inCar && v.speed > 4 && distXZ(v.pos, player.pos) < 1.6) {
      damagePlayer(26, v.pos);
      const dx = player.pos.x - v.pos.x, dz = player.pos.z - v.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      player.pos.x += (dx / d) * 1.4; player.pos.z += (dz / d) * 1.4;
      v.speed *= 0.4;
    }
  }
}

function updatePoliceCars(dt) {
  for (const v of [...policeCars]) {
    if (v.destroyed) continue;
    if (state.wanted === 0) { v.ai = 'leave'; }
    if (v.ai === 'leave') {
      v.speed = lerp(v.speed, 16, dt);
      v.pos.x += Math.sin(v.heading) * v.speed * dt;
      v.pos.z += Math.cos(v.heading) * v.speed * dt;
      v.group.rotation.y = v.heading;
      if (Math.abs(v.pos.x) > 225 || Math.abs(v.pos.z) > 225 || state.time - v.spawnTime > 12) {
        removeVehicle(v);
      }
      continue;
    }
    const target = player.pos;
    const dx = target.x - v.pos.x, dz = target.z - v.pos.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    let diff = ((desired - v.heading + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    v.heading += clamp(diff, -2.3 * dt, 2.3 * dt);
    const targetSpeed = dist > 9 ? 27 : 9;
    v.speed += clamp(targetSpeed - v.speed, -20 * dt, 12 * dt);
    v.pos.x += Math.sin(v.heading) * v.speed * dt;
    v.pos.z += Math.cos(v.heading) * v.speed * dt;
    v.pos.y = 0;
    if (resolveCircle(v.pos, 1.7)) v.speed *= 0.5;
    v.pos.x = clamp(v.pos.x, -228, 228); v.pos.z = clamp(v.pos.z, -228, 228);
    v.group.rotation.y = v.heading;
    updateCarVisual(v.model, diff * 0.3, v.speed, dt);

    // siren lights
    v.sirenPhase += dt;
    if (v.model.lightbar) {
      const on = Math.sin(v.sirenPhase * 12) > 0;
      v.model.lightbar.red.material.emissiveIntensity = on ? 4 : 0.4;
      v.model.lightbar.blue.material.emissiveIntensity = on ? 0.4 : 4;
    }

    if (dist < 3.8) {
      if (player.inCar) {
        const d2 = dist || 1;
        v.pos.x -= (dx / d2) * 1.5; v.pos.z -= (dz / d2) * 1.5;
        player.inCar.speed *= 0.55;
        v.speed *= 0.4;
        damagePlayer(9, v.pos);
        shake = Math.min(0.5, shake + 0.12);
        audio.crash();
      } else {
        damagePlayer(30, v.pos);
        const d2 = dist || 1;
        player.pos.x -= (dx / d2) * 2; player.pos.z -= (dz / d2) * 2;
      }
    }
  }
}

function updatePeds(dt) {
  for (const e of [...peds]) {
    if (e.removed) continue;
    if (e.dead) {
      e.deadTimer -= dt;
      if (e.deadTimer <= 0) removePed(e);
      continue;
    }
    if (e.isCop) continue;
    const dPlayer = distXZ(e.pos, player.pos);

    if (e.isGang) {
      updateGang(e, dt, dPlayer);
    } else if (e.state === 'flee') {
      e.fleeTimer -= dt;
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      e.heading = Math.atan2(dx / d, dz / d);
      e.speed = lerp(e.speed, 6.4, dt * 6);
      e.pos.x += (dx / d) * e.speed * dt;
      e.pos.z += (dz / d) * e.speed * dt;
      resolveCircle(e.pos, 0.38);
      if (e.fleeTimer <= 0 || d > 55) { e.state = 'wander'; e.speed = 0; }
    } else {
      // walk along the sidewalk edge
      if (!e.block) e.block = nearestBlock(e.pos.x, e.pos.z);
      e.wanderTimer -= dt;
      if (e.wanderTimer <= 0) { e.wanderTimer = rnd(5, 11); e.dir *= Math.random() < 0.4 ? -1 : 1; }
      e.t += e.dir * 1.35 * dt;
      if (e.t > 19) { e.t = 19; e.dir = -1; }
      if (e.t < -19) { e.t = -19; e.dir = 1; }
      const p = sidePoint(e.block, e.side, e.t);
      const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
      e.pos.x = lerp(e.pos.x, p.x, Math.min(1, dt * 4));
      e.pos.z = lerp(e.pos.z, p.z, Math.min(1, dt * 4));
      e.speed = 1.35;
      if (Math.abs(dx) + Math.abs(dz) > 0.02) e.heading = Math.atan2(dx, dz);
    }

    // cars scare pedestrians
    if (!e.isGang && e.state !== 'flee') {
      for (const v of vehicles) {
        if (v.destroyed || v.speed < 7) continue;
        if (distXZ(v.pos, e.pos) < 5) { e.state = 'flee'; e.fleeTimer = 3; break; }
      }
    }
    e.pos.y = groundY(e.pos.x, e.pos.z);
    e.group.rotation.y = e.heading;
    animatePed(e.ped, e.speed, dt);
  }
}

function updateGang(e, dt, dPlayer) {
  e.speed = 0;
  if (dPlayer < 36) {
    e.heading = angleLerp(e.heading, Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z), Math.min(1, dt * 8));
    e.aimTimer = 1;
    e.shootTimer -= dt;
    if (e.shootTimer <= 0 && dPlayer < 34) {
      e.shootTimer = rnd(1.1, 1.9);
      if (lineOfSight(tmpB.set(e.pos.x, e.pos.y + 1.35, e.pos.z), tmpC.set(player.pos.x, player.pos.y + 1.2, player.pos.z))) {
        enemyShoot(e, dPlayer);
      }
    }
  }
  e.group.rotation.y = e.heading;
  animatePed(e.ped, 0, dt);
  e.pos.y = groundY(e.pos.x, e.pos.z);
}

function updateCops(dt) {
  for (const e of [...cops]) {
    if (e.removed) continue;
    if (e.dead) {
      e.deadTimer -= dt;
      if (e.deadTimer <= 0) removePed(e);
      continue;
    }
    const d = distXZ(e.pos, player.pos);
    const target = player.inCar ? player.inCar.pos : player.pos;
    if (d > 16) {
      const dx = target.x - e.pos.x, dz = target.z - e.pos.z;
      const dd = Math.hypot(dx, dz) || 1;
      e.heading = Math.atan2(dx / dd, dz / dd);
      e.speed = lerp(e.speed, 5.6, dt * 5);
      e.pos.x += (dx / dd) * e.speed * dt;
      e.pos.z += (dz / dd) * e.speed * dt;
      resolveCircle(e.pos, 0.4);
      e.pos.y = groundY(e.pos.x, e.pos.z);
    } else {
      e.speed = 0;
      e.heading = angleLerp(e.heading, Math.atan2(target.x - e.pos.x, target.z - e.pos.z), Math.min(1, dt * 10));
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = rnd(0.9, 1.5);
        if (lineOfSight(tmpB.set(e.pos.x, e.pos.y + 1.4, e.pos.z), tmpC.set(target.x, target.y + 1.2, target.z))) {
          enemyShoot(e, d, 1.15);
        }
      }
    }
    e.group.rotation.y = e.heading;
    animatePed(e.ped, e.speed, dt);
  }
}

function enemyShoot(e, dist, accuracy = 1) {
  const target = player.inCar ? player.inCar.pos : player.pos;
  const from = new THREE.Vector3(e.pos.x + Math.sin(e.heading) * 0.5, e.pos.y + 1.35, e.pos.z + Math.cos(e.heading) * 0.5);
  const hitChance = clamp(0.78 - dist * 0.014, 0.22, 0.72) * accuracy;
  const hit = Math.random() < hitChance;
  const to = new THREE.Vector3(target.x + rnd(-1.5, 1.5), target.y + rnd(0.3, 1.6), target.z + rnd(-1.5, 1.5));
  if (hit) to.set(target.x, target.y + 1.1, target.z);
  tracers.fire(from, to, 0xff9c6a);
  particles.spawn(from, 0xffb070, 3, { speed: 2.5, life: 0.18 });
  audio.enemyShot();
  if (hit) {
    if (player.inCar) {
      player.inCar.health -= 9;
      damagePlayer(3.5, e.pos);
      if (state.mode !== 'playing') return;
      if (player.inCar && player.inCar.health <= 0) explodeVehicle(player.inCar);
    } else {
      damagePlayer(rnd(4, 8) * accuracy, e.pos);
    }
  }
}

function removePed(e) {
  if (e.removed) return;
  e.removed = true;
  scene.remove(e.group);
  const pi = peds.indexOf(e); if (pi >= 0) peds.splice(pi, 1);
  const ci = cops.indexOf(e); if (ci >= 0) cops.splice(ci, 1);
}

function removeVehicle(v) {
  if (v.destroyed && v.group.parent === null) return;
  v.destroyed = true;
  scene.remove(v.group);
  const i = vehicles.indexOf(v); if (i >= 0) vehicles.splice(i, 1);
  const pi = policeCars.indexOf(v); if (pi >= 0) policeCars.splice(pi, 1);
}

function explodeVehicle(v) {
  if (v.destroyed) return;
  const pos = v.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
  particles.spawn(pos, 0xffa040, 46, { speed: 15, life: 0.9, gravity: -8, spread: 0.5 });
  particles.spawn(pos, 0xffe08a, 24, { speed: 9, life: 0.55, gravity: -5 });
  particles.spawn(pos, 0x552020, 30, { speed: 7, life: 1.4, gravity: 1.5, spread: 1 });
  flashAt(pos, 0xffb060, 14, 0.3);
  shake = Math.min(0.9, shake + 0.55);
  audio.explosion();
  if (v.isPolice) addHeat(18);

  for (const e of [...peds]) {
    if (!e.dead && !e.removed && distXZ(e.pos, v.pos) < 6.5) killPed(e, true);
  }

  if (v === player.inCar) {
    player.inCar = null;
    player.group.visible = true;
    player.pos.set(v.pos.x + rnd(-2, 2), 0, v.pos.z + rnd(-2, 2));
    player.baseY = groundY(player.pos.x, player.pos.z);
    player.pos.y = player.baseY;
    player.inCar = null;
    hud.setSpeed(0, false);
    document.getElementById('crosshair').classList.remove('hidden');
    damagePlayer(42, v.pos);
    setActionLabels();
  }
  removeVehicle(v);
  if (playerCar === v) {
    playerCar = makeVehicle('muscle', '#e0345f', world.spawn.car, 0, null);
    playerCar.name = 'player';
  }
}

/* ================================================================== */
/*  Wanted system                                                      */
/* ================================================================== */
function starsForHeat(h) {
  if (h <= 0) return 0;
  if (h < 20) return 1;
  if (h < 40) return 2;
  if (h < 60) return 3;
  if (h < 80) return 4;
  return 5;
}

function addHeat(n) {
  const prev = state.wanted;
  state.heat = clamp(state.heat + n, 0, 100);
  state.lastCrime = state.time;
  const stars = starsForHeat(state.heat);
  if (stars !== state.wanted) {
    state.wanted = stars;
    hud.setWanted(stars, stars > prev);
    if (stars > prev) hud.toast(stars >= 4 ? 'ALL UNITS RESPONDING' : 'WANTED LEVEL UP', 'red');
  }
}

function updateWanted(dt) {
  if (state.mode !== 'playing') return;
  if (state.heat > 0 && state.time - state.lastCrime > 10) {
    const copNear = policeCars.some((v) => !v.destroyed && distXZ(v.pos, player.pos) < 60) || cops.some((c) => !c.dead && distXZ(c.pos, player.pos) < 55);
    state.heat = Math.max(0, state.heat - (copNear ? 1.2 : 4.5) * dt);
    const stars = starsForHeat(state.heat);
    if (stars !== state.wanted) {
      state.wanted = stars;
      hud.setWanted(stars, false);
      if (stars === 0) hud.toast('YOU LOST THE COPS', 'gold');
    }
  }

  if (state.wanted === 0) {
    for (const v of [...policeCars]) removeVehicle(v);
    for (const c of [...cops]) { if (!c.dead) removePed(c); }
  } else {
    if (state.time > state.nextPoliceSpawn && policeCars.length < Math.min(6, state.wanted + 1)) {
      state.nextPoliceSpawn = state.time + rnd(4, 7);
      spawnPoliceCar();
    }
    if (state.wanted >= 2 && state.time > state.nextCopSpawn && cops.filter((c) => !c.dead).length < Math.min(4, state.wanted)) {
      state.nextCopSpawn = state.time + rnd(4, 6);
      spawnCop();
    }
  }

  let nearest = Infinity;
  for (const v of policeCars) if (!v.destroyed) nearest = Math.min(nearest, distXZ(v.pos, player.pos));
  for (const c of cops) if (!c.dead) nearest = Math.min(nearest, distXZ(c.pos, player.pos));
  const siren = state.wanted > 0 ? clamp(1 - nearest / 170, 0.12, 1) : 0;
  audio.setSiren(siren);
}

function spawnPoliceCar() {
  const p = randomRoadPoint(player.pos, 65, 115);
  const heading = Math.atan2(player.pos.x - p.x, player.pos.z - p.z);
  const v = makeVehicle('police', '#eef0f5', p, heading, 'police');
  v.spawnTime = state.time;
  v.speed = 12;
}

function spawnCop() {
  const p = randomSidewalkPoint(player.pos, 38, 70);
  const cop = makePed('cop', p, { health: 85 });
  cop.state = 'chase';
  cop.heading = Math.atan2(player.pos.x - p.x, player.pos.z - p.z);
}

/* ================================================================== */
/*  Missions                                                           */
/* ================================================================== */
function setupMarker() {
  const g = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 18, 20, 1, true), beamMat);
  beam.position.y = 9; g.add(beam);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.09, 8, 40), ringMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.15; g.add(ring);
  const discMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.1, 28), discMat);
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.14; g.add(disc);
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  diamond.position.y = 2.6; g.add(diamond);
  g.visible = false;
  scene.add(g);
  objectiveMarker = { group: g, beam, beamMat, ring, ringMat, disc, discMat, diamond, color: 0xffd23f };
}

function setMarkerColor(hex) {
  const c = new THREE.Color(hex);
  objectiveMarker.beamMat.color.copy(c);
  objectiveMarker.ringMat.color.copy(c);
  objectiveMarker.discMat.color.copy(c);
  objectiveMarker.diamond.material.color.copy(c);
  objectiveMarker.color = hex;
}

function placeMarker(pos) {
  if (!objectiveMarker) return;
  objectiveMarker.group.position.set(pos.x, 0, pos.z);
  objectiveMarker.group.visible = true;
}

function hideMarker() {
  if (objectiveMarker) objectiveMarker.group.visible = false;
  if (targetMarker) { targetMarker.visible = false; }
}

function startMission(type) {
  if (mission) return;
  if (!type) type = state.missionCount % 2 === 0 ? 'delivery' : 'bounty';
  state.missionCooldown = 0;

  if (type === 'delivery') {
    const pickup = randomRoadPoint(player.pos, 75, 190);
    mission = { type: 'delivery', phase: 'pickup', pos: pickup.clone(), reward: 900, timeLeft: 0 };
    setMarkerColor(0xffd23f);
    placeMarker(pickup);
    hud.setMission({
      kicker: 'SUNSET COURIER', title: 'Collect the package',
      desc: 'Follow the gold marker. A car makes it faster.', time: null,
    });
    hud.toast('NEW JOB: SUNSET COURIER');
  } else {
    spawnBounty();
  }
}

function spawnBounty() {
  const p = randomSidewalkPoint(player.pos, 60, 155);
  const target = makePed('gang', p, { health: 140, state: 'guard', isTarget: true, shirt: '#d61f3c' });
  target.health = 140; target.maxHealth = 140;
  const side = target.side;
  const guardPositions = [sidePoint(target.block, side, clamp(target.t + 4, -19, 19)), sidePoint(target.block, side, clamp(target.t - 4, -19, 19))];
  for (const gp of guardPositions) makePed('gang', new THREE.Vector3(gp.x, 0, gp.z), { health: 85, state: 'guard', isGuard: true });

  targetMarker = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshBasicMaterial({ color: 0xff2e46 }));
  targetMarker.position.set(0, 2.5, 0);
  target.group.add(targetMarker);

  mission = { type: 'bounty', target, pos: target.pos, reward: 1200, timeLeft: 0 };
  setMarkerColor(0xff2e46);
  placeMarker(target.pos);
  hud.setMission({
    kicker: 'BOUNTY', title: 'Take out the mark',
    desc: 'The red marker is your target. Expect company.', time: null,
  });
  hud.toast('NEW JOB: BOUNTY', 'red');
}

function completeMission() {
  if (!mission) return;
  const type = mission.type;
  let reward = mission.reward;
  if (type === 'delivery' && mission.phase === 'deliver') reward += Math.max(0, Math.round(mission.timeLeft * 6));
  state.cash += reward;
  hud.setCash(state.cash);
  hud.showBanner('MISSION PASSED', type === 'delivery' ? 'SUNSET COURIER' : 'BOUNTY CLEARED', '+$' + reward.toLocaleString('en-US'));
  audio.missionComplete();
  if (type === 'bounty') addHeat(8);
  if (targetMarker) { targetMarker.removeFromParent(); targetMarker = null; }
  mission = null;
  state.missionCount++;
  state.missionCooldown = 7;
  hideMarker();
  hud.setObjectiveDistance(null);
  hud.setMission({
    kicker: 'JOB COMPLETE',
    title: 'Back on the street',
    desc: 'Next job incoming — keep your eyes on the minimap.',
    time: null,
  });
}

function failMission(reason) {
  if (!mission) return;
  mission = null;
  hideMarker();
  hud.toast(reason || 'MISSION FAILED', 'red');
  hud.setObjectiveDistance(null);
  hud.setMission({
    kicker: 'JOB FAILED',
    title: 'Back on the street',
    desc: 'Next job incoming — keep your eyes on the minimap.',
    time: null,
  });
  state.missionCooldown = 5;
  state.missionCount++;
}

function updateMission(dt) {
  if (state.mode !== 'playing') return;
  if (!mission) {
    state.missionCooldown -= dt;
    if (state.missionCooldown <= 0) startMission();
    return;
  }

  if (mission.type === 'delivery') {
    const d = distXZ(player.pos, mission.pos);
    hud.setObjectiveDistance(d);
    if (mission.phase === 'pickup') {
      if (d < 4.5) {
        mission.phase = 'deliver';
        mission.pos = randomRoadPoint(player.pos, 110, 245);
        mission.timeLeft = 95;
        mission.reward = 900;
        placeMarker(mission.pos);
        setMarkerColor(0x41e8ff);
        hud.setMission({
          kicker: 'SUNSET COURIER', title: 'Deliver the package',
          desc: 'Reach the drop-off before the clock runs out.', time: 95,
        });
        hud.toast('PACKAGE SECURED — DELIVER IT', 'gold');
        audio.pickup();
      }
    } else {
      mission.timeLeft -= dt;
      hud.setTimer(mission.timeLeft);
      if (mission.timeLeft <= 0) { failMission('MISSION FAILED — OUT OF TIME'); return; }
      if (d < 5.5) completeMission();
    }
    if (objectiveMarker) objectiveMarker.group.position.set(mission.pos.x, 0, mission.pos.z);
  } else if (mission.type === 'bounty') {
    const target = mission.target;
    if (!target || target.dead || target.removed) { completeMission(); return; }
    mission.pos = target.pos;
    const d = distXZ(player.pos, target.pos);
    hud.setObjectiveDistance(d);
    if (objectiveMarker) objectiveMarker.group.position.set(target.pos.x, 0, target.pos.z);
  }
}

/* ================================================================== */
/*  Damage / death                                                     */
/* ================================================================== */
function damagePlayer(amount, source) {
  if (state.mode !== 'playing') return;
  if (player.armor > 0) {
    const absorb = Math.min(player.armor, amount * 0.6);
    player.armor -= absorb; amount -= absorb;
  }
  player.health -= amount;
  state.lastDamage = state.time;
  hud.damage();
  audio.hit();
  shake = Math.min(0.6, shake + amount * 0.012);
  if (player.health <= 0) { player.health = 0; die(); }
}

function die() {
  if (state.mode !== 'playing') return;
  if (player.inCar) {
    player.inCar.occupied = false;
    player.inCar.ai = 'parked';
    player.inCar.speed = 0;
    player.inCar = null;
  }
  state.mode = 'wasted';
  input.enabled = false;
  input.releaseLock();
  hud.hidePrompt();
  hud.hide();
  hud.setSpeed(0, false);
  audio.setEngine(false, 0, 0);
  audio.setSiren(0);
  audio.wasted();
  const cost = Math.min(500, state.cash);
  state.cash -= cost;
  hud.setCash(state.cash);
  document.getElementById('wasted-cost').textContent = '-$' + cost;
  document.getElementById('wasted').classList.remove('hidden');
  document.getElementById('mobile-controls').classList.add('hidden');
  failMission('MISSION FAILED');
}

function respawn() {
  document.getElementById('wasted').classList.add('hidden');
  document.getElementById('mobile-controls').classList.toggle('hidden', !input.isTouch);
  state.mode = 'playing';
  state.heat = 0; state.wanted = 0; state.lastCrime = state.time;
  hud.setWanted(0, false);
  hud.show();
  hud.setHealth(100, 50);
  hud.setCash(state.cash, true);
  player.health = 100; player.armor = 50;
  player.pos.copy(world.spawn.player);
  player.pos.y = groundY(player.pos.x, player.pos.z);
  player.baseY = player.pos.y;
  player.jumpOffset = 0; player.vy = 0;
  player.heading = 0;
  player.inCar = null;
  player.group.visible = true;
  player.group.rotation.set(0, 0, 0);
  player.ped.group.rotation.set(0, 0, 0);
  player.ammo = 12; player.reloading = 0;
  hud.setWeapon(12, false);
  camYaw = 0; camPitch = 0.08;
  for (const v of [...policeCars]) removeVehicle(v);
  for (const c of [...cops]) if (!c.dead) removePed(c);
  for (const e of [...peds]) if (e.isGang) removePed(e);
  if (playerCar && playerCar.destroyed) {
    playerCar = makeVehicle('muscle', '#e0345f', world.spawn.car, 0, null);
    playerCar.name = 'player';
  }
  state.missionCooldown = 3;
  mission = null;
  hideMarker();
  input.enabled = true;
  input.requestLock();
  document.getElementById('crosshair').classList.remove('hidden');
  setActionLabels();
  hud.toast('BACK ON THE STREET');
}

/* ================================================================== */
/*  Camera                                                             */
/* ================================================================== */
function updateCamera(dt) {
  let target, desired, lookTarget;
  if (player.inCar) {
    const car = player.inCar;
    carLookYaw *= Math.pow(0.6, dt);
    const yaw = car.heading + carLookYaw;
    const dist = 9.2 + Math.min(3, Math.abs(car.speed) * 0.06);
    const cp = Math.cos(carLookPitch);
    target = tmpA.set(car.pos.x, 1.6, car.pos.z);
    desired = tmpB.set(
      car.pos.x - Math.sin(yaw) * dist * cp,
      2.6 + Math.sin(carLookPitch) * dist + 0.5,
      car.pos.z - Math.cos(yaw) * dist * cp,
    );
    lookTarget = tmpC.set(car.pos.x + Math.sin(car.heading) * 5, 1.5, car.pos.z + Math.cos(car.heading) * 5);
  } else {
    const aiming = player.aiming;
    const dist = aiming ? 2.6 : 5.6;
    const cp = Math.cos(camPitch);
    target = tmpA.set(player.pos.x, player.pos.y + 1.5, player.pos.z);
    const side = aiming ? 0.78 : 0.55;
    const rightX = -Math.cos(camYaw), rightZ = Math.sin(camYaw);
    desired = tmpB.set(
      player.pos.x - Math.sin(camYaw) * dist * cp + rightX * side,
      player.pos.y + 1.45 + Math.sin(camPitch) * dist,
      player.pos.z - Math.cos(camYaw) * dist * cp + rightZ * side,
    );
    lookTarget = tmpC.set(
      player.pos.x + Math.sin(camYaw) * (aiming ? 6 : 2.2) + rightX * side,
      player.pos.y + 1.4,
      player.pos.z + Math.cos(camYaw) * (aiming ? 6 : 2.2) + rightZ * side,
    );
  }

  const clamped = clampCamera(target, desired);
  const smooth = player.inCar ? 1 - Math.exp(-9 * dt) : 1 - Math.exp(-19 * dt);
  camera.position.lerp(clamped, smooth);
  if (shake > 0.001) {
    camera.position.x += rnd(-shake, shake) * 0.35;
    camera.position.y += rnd(-shake, shake) * 0.25;
    camera.position.z += rnd(-shake, shake) * 0.35;
    shake *= Math.pow(0.02, dt);
  }
  camera.lookAt(lookTarget);

  const targetFov = player.inCar ? 62 + Math.min(9, Math.abs(player.inCar.speed) * 0.22) : (player.aiming ? 50 : 62);
  camera.fov = lerp(camera.fov, targetFov, Math.min(1, dt * 5));
  camera.updateProjectionMatrix();
}

function clampCamera(target, desired) {
  if (!insideBuilding(tmpD.set(desired.x, desired.y, desired.z), 0.4)) return desired;
  for (let i = 9; i >= 1; i--) {
    tmpD.copy(target).lerp(desired, i / 10);
    if (!insideBuilding(tmpD, 0.4)) return tmpD.clone();
  }
  return target.clone();
}

/* ================================================================== */
/*  HUD sync                                                           */
/* ================================================================== */
let hudTimer = 0, mapTimer = 0;
function updateHUD(dt) {
  hud.setHealth(player.health, player.armor);
  hud.setWeaponVisible(!player.inCar);
  hud.tickCash(dt);
  if (!player.inCar) hud.setSpeed(0, false);

  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.1;
    const minute = Math.floor(state.gameMinutes) % 1440;
    if (minute !== state.clockMinute) { state.clockMinute = minute; hud.setClock(minute); }
    hud.setSpread(player.fireCooldown > 0 ? 7 : (input.sprint ? 3 : 0));

    const actionBtn = document.getElementById('btn-action');
    if (!player.inCar) {
      const v = nearestVehicle();
      const text = v ? (v.isPolice ? 'Steal police cruiser' : 'Steal vehicle') : '';
      if (input.isTouch) {
        hud.hidePrompt();
        actionBtn.classList.toggle('ready', !!v);
      } else if (text !== lastPrompt) {
        lastPrompt = text;
        if (text) hud.showPrompt(text); else hud.hidePrompt();
      }
    } else {
      actionBtn.classList.toggle('ready', input.isTouch);
      if (!input.isTouch && lastPrompt !== 'Exit vehicle') {
        lastPrompt = 'Exit vehicle';
        hud.showPrompt('Exit vehicle');
      }
    }
  }

  mapTimer -= dt;
  if (mapTimer <= 0) {
    mapTimer = 0.07;
    const heading = player.inCar ? player.inCar.heading : player.heading;
    const blips = [];
    for (const v of vehicles) {
      if (v.destroyed || v === player.inCar) continue;
      blips.push({ x: v.pos.x, z: v.pos.z, kind: v.isPolice ? 'cop' : 'car', flash: Math.sin(state.time * 12) > 0 });
    }
    for (const c of cops) if (!c.dead) blips.push({ x: c.pos.x, z: c.pos.z, kind: 'cop', flash: Math.sin(state.time * 12) > 0 });
    if (mission && mission.type === 'bounty' && mission.target && !mission.target.dead) {
      blips.push({ x: mission.target.pos.x, z: mission.target.pos.z, kind: 'gang' });
    }
    hud.drawMinimap({
      player: { x: player.pos.x, z: player.pos.z, heading },
      blips,
      objective: mission ? { x: mission.pos.x, z: mission.pos.z, pulse: Math.sin(state.time * 6) > 0 } : null,
      mapCanvas: world.mapCanvas, mapScale: world.mapScale, mapWorld: world.mapWorld,
    });
  }

  if (objectiveMarker && objectiveMarker.group.visible) {
    objectiveMarker.ring.rotation.z += dt * 1.2;
    objectiveMarker.diamond.rotation.y += dt * 2;
    objectiveMarker.diamond.position.y = 2.6 + Math.sin(state.time * 3) * 0.2;
    objectiveMarker.beamMat.opacity = 0.1 + Math.sin(state.time * 4) * 0.03;
  }
  if (targetMarker) targetMarker.rotation.y += dt * 3;

  const act = document.getElementById('btn-action');
  if (act) {
    const want = player.inCar ? 'EXIT' : 'CAR';
    if (act.textContent !== want) setActionLabels();
  }
}

/* ================================================================== */
/*  Update loop                                                        */
/* ================================================================== */
function update(dt) {
  state.time += dt;
  elapsed += dt;
  state.gameMinutes += dt * 0.55;

  updatePlayer(dt);
  updateTraffic(dt);
  updatePoliceCars(dt);
  updatePeds(dt);
  updateCops(dt);
  updateMission(dt);
  updateWanted(dt);
  updateCamera(dt);

  particles.update(dt);
  tracers.update(dt);

  if (muzzleTimer > 0) {
    muzzleTimer -= dt;
    if (muzzleTimer <= 0) { muzzleSprite.visible = false; muzzleLight.intensity = 0; }
    else { muzzleLight.intensity = 7 * (muzzleTimer / 0.06); }
  }
  if (flashLife > 0) {
    flashLife -= dt;
    flashSprite.material.opacity = Math.max(0, flashLife / 0.3);
    if (flashLife <= 0) flashSprite.visible = false;
  }

  world.update(dt, player.pos);
  updateHUD(dt);
  input.clearFrame();
}

function updateMenu(dt) {
  state.menuTime += dt;
  state.time += dt;
  state.gameMinutes += dt * 0.55;
  const t = state.menuTime * 0.13;
  camera.position.set(Math.sin(t) * 88, 34 + Math.sin(t * 0.7) * 6, Math.cos(t) * 88);
  camera.lookAt(0, 12, 0);
  camera.fov = 58; camera.updateProjectionMatrix();

  updateTraffic(dt);
  updatePeds(dt);
  particles.update(dt);
  world.update(dt, tmpA.set(0, 0, 0));
  const minute = Math.floor(state.gameMinutes) % 1440;
  hud.setClock(minute);
}

/* ================================================================== */
/*  UI wiring                                                          */
/* ================================================================== */
function startGame() {
  if (state.mode === 'playing') return;
  audio.init();
  audio.resume();
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  hud.show();
  hud.setHealth(player.health, player.armor);
  hud.setCash(state.cash, true);
  hud.setWanted(0, false);
  hud.setWeapon(player.ammo, false);
  hud.setClock(Math.floor(state.gameMinutes) % 1440);
  document.getElementById('mobile-controls').classList.toggle('hidden', !input.isTouch);
  state.mode = 'playing';
  input.enabled = true;
  camYaw = player.heading;
  camPitch = 0.1;
  const target = new THREE.Vector3(player.pos.x - Math.sin(camYaw) * 5.6, player.pos.y + 2.2, player.pos.z - Math.cos(camYaw) * 5.6);
  camera.position.copy(target);
  camera.fov = 62; camera.updateProjectionMatrix();
  input.requestLock();
  hud.toast('WELCOME TO SUNSET CITY', 'gold');
  hud.setMission({ kicker: 'SUNSET COURIER', title: 'Collect the package', desc: 'Follow the gold marker. A car makes it faster.', time: null });
  state.missionCooldown = 2;
  setActionLabels();
}

function pauseGame(fromLock = false) {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  input.enabled = false;
  if (!fromLock) input.releaseLock();
  document.getElementById('pause').classList.remove('hidden');
  document.getElementById('mobile-controls').classList.add('hidden');
  hud.hidePrompt();
  audio.setEngine(false, 0, 0);
  audio.setSiren(0);
}

function resumeGame() {
  if (state.mode !== 'paused') return;
  state.mode = 'playing';
  input.enabled = true;
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('mobile-controls').classList.toggle('hidden', !input.isTouch);
  audio.resume();
  input.requestLock();
}

function toggleMute() {
  audio.setMuted(!audio.muted);
  const b = document.getElementById('mute-btn');
  if (b) b.textContent = 'SOUND: ' + (audio.muted ? 'OFF' : 'ON');
}

function setupUI() {
  document.getElementById('start-btn').addEventListener('click', () => { audio.ui(); startGame(); });
  document.getElementById('resume-btn').addEventListener('click', () => { audio.ui(); resumeGame(); });
  document.getElementById('restart-btn').addEventListener('click', () => location.reload());
  document.getElementById('mute-btn').addEventListener('click', toggleMute);
  document.getElementById('respawn-btn').addEventListener('click', () => { audio.ui(); respawn(); });
  document.getElementById('pause-btn').addEventListener('click', () => pauseGame());

  input.onAction = () => toggleVehicle();
  input.onJump = () => { player.jumpRequested = true; };
  input.onPause = (fromLock) => pauseGame(fromLock);
  input.onMute = toggleMute;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, input.isTouch ? 1.25 : 1.7));
  });
  window.addEventListener('blur', () => { if (state.mode === 'playing' && !input.isTouch) pauseGame(); });
}

/* ================================================================== */
/*  Boot                                                               */
/* ================================================================== */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function setLoad(p, text) {
  document.getElementById('load-fill').style.width = p + '%';
  if (text) document.getElementById('load-text').textContent = text;
}

async function boot() {
  setLoad(6, 'WARMING UP THE NEON…');
  await sleep(60);
  setupUI();
  world = createWorld(scene, renderer);
  setLoad(42, 'RAISING THE SKYLINE…');
  await sleep(30);
  setupPlayer();
  setupEffects();
  setupMarker();
  spawnTraffic(16);
  spawnPeds(22);
  setLoad(78, 'FILLING THE STREETS…');
  await sleep(30);
  hud.setClock(Math.floor(state.gameMinutes) % 1440);
  hud.setCash(state.cash, true);
  hud.setHealth(100, 50);
  hud.setWeapon(12, false);
  setLoad(100, 'READY TO RUN');
  window.__sunset = {
    state, player, world, camera, renderer, input,
    get mission() { return mission; },
    get vehicles() { return vehicles; },
    get peds() { return peds; },
    get cops() { return cops; },
    teleport(x, z) {
      if (player.inCar) {
        player.inCar.pos.set(x, 0, z);
        player.inCar.speed = 0;
      } else {
        player.pos.set(x, groundY(x, z), z);
        player.baseY = player.pos.y;
        player.jumpOffset = 0;
        player.vy = 0;
      }
    },
    lookAt(x, z) {
      camYaw = Math.atan2(x - player.pos.x, z - player.pos.z);
      player.heading = camYaw;
    },
    addHeat, startMission, completeMission, spawnPoliceCar, spawnCop, fireWeapon,
  };
  await sleep(450);
  document.getElementById('loading').classList.add('done');
  state.mode = 'menu';
  lastFrame = performance.now();
  requestAnimationFrame(loop);
}

let lastFrame = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state.mode === 'playing') update(dt);
  else if (state.mode === 'menu') updateMenu(dt);
  else {
    // paused / wasted: keep the world alive but frozen gameplay
    world.update(dt * 0.2, player.pos);
  }
  renderer.render(scene, camera);
}

boot().catch((err) => {
  console.error(err);
  const t = document.getElementById('load-text');
  if (t) t.textContent = 'FAILED TO BUILD THE CITY — ' + (err.message || err);
});
