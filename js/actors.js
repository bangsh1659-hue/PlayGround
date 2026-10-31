import * as THREE from './three.module.js';

/* Shared geometries */
const G = {
  leg: new THREE.BoxGeometry(0.18, 0.82, 0.22).translate(0, -0.41, 0),
  arm: new THREE.BoxGeometry(0.14, 0.62, 0.16).translate(0, -0.31, 0),
  torso: new THREE.BoxGeometry(0.54, 0.62, 0.3),
  head: new THREE.SphereGeometry(0.185, 12, 10),
  hair: new THREE.SphereGeometry(0.196, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
  shoe: new THREE.BoxGeometry(0.2, 0.11, 0.32),
  gun: new THREE.BoxGeometry(0.07, 0.13, 0.34),
  wheel: new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14).rotateZ(Math.PI / 2),
  wheelSmall: new THREE.CylinderGeometry(0.3, 0.3, 0.24, 12).rotateZ(Math.PI / 2),
  lightbar: new THREE.BoxGeometry(0.44, 0.12, 0.24),
};

const skinTones = ['#c98d68', '#8d5a3c', '#e0ac84', '#6b4229', '#d49a74', '#a86b48'];
const shirtColors = ['#d84f6f', '#3e7ecf', '#e5d6b8', '#4fae82', '#8f5fc9', '#d98c3a', '#c8c8d8', '#2e3b55', '#b43a3a', '#efe6f0'];
const pantsColors = ['#23222c', '#30384a', '#3c3030', '#1c2733', '#4b4652'];

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.05, ...opts });
}

export function createPed(opts = {}) {
  const role = opts.role || 'civilian';
  const g = new THREE.Group();
  const skin = opts.skin || skinTones[Math.floor(Math.random() * skinTones.length)];
  const shirt = opts.shirt || (role === 'cop' ? '#24355c' : role === 'gang' ? '#a51734' : shirtColors[Math.floor(Math.random() * shirtColors.length)]);
  const pants = opts.pants || (role === 'cop' ? '#141d33' : role === 'gang' ? '#16141b' : pantsColors[Math.floor(Math.random() * pantsColors.length)]);
  const skinMat = mat(skin, { roughness: 0.85 });
  const shirtMat = mat(shirt, { roughness: 0.8 });
  const pantsMat = mat(pants, { roughness: 0.9 });
  const shoeMat = mat('#121016', { roughness: 0.7 });

  const torso = new THREE.Mesh(G.torso, shirtMat);
  torso.position.y = 1.18; g.add(torso);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.15, 8), skinMat);
  neck.position.y = 1.51; g.add(neck);

  const head = new THREE.Mesh(G.head, skinMat);
  head.position.y = 1.66; g.add(head);

  const hairMat = mat(role === 'cop' ? '#10131f' : '#241a18', { roughness: 0.95 });
  const hair = new THREE.Mesh(G.hair, hairMat);
  hair.position.y = 1.7; hair.scale.set(1.02, 0.9, 1.02); g.add(hair);

  const limbs = {};
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(G.leg, pantsMat);
    leg.position.set(0.14 * side, 0.86, 0); g.add(leg);
    const shoe = new THREE.Mesh(G.shoe, shoeMat);
    shoe.position.set(0, -0.8, 0.06); leg.add(shoe);
    const arm = new THREE.Mesh(G.arm, shirtMat);
    arm.position.set(0.335 * side, 1.46, 0); g.add(arm);
    limbs[side < 0 ? 'leftLeg' : 'rightLeg'] = leg;
    limbs[side < 0 ? 'leftArm' : 'rightArm'] = arm;
  }

  if (role === 'cop') {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 10), mat('#0d1730', { roughness: 0.7 }));
    cap.position.y = 1.81; g.add(cap);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.18), mat('#0a1224', { roughness: 0.4 }));
    visor.position.set(0, 1.76, 0.14); g.add(visor);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.44, 0.33), mat('#0c1425', { roughness: 0.6, metalness: 0.15 }));
    vest.position.set(0, 1.24, 0.01); g.add(vest);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.02), new THREE.MeshStandardMaterial({ color: '#ffcf5a', emissive: '#8a5a10', emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.3 }));
    badge.position.set(-0.16, 1.34, 0.18); g.add(badge);
  } else if (role === 'gang') {
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 6, 14), new THREE.MeshStandardMaterial({ color: '#ffcf5a', metalness: 0.9, roughness: 0.25 }));
    chain.position.set(0, 1.47, 0.12); chain.rotation.x = 1.35; g.add(chain);
    const bandana = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.36), mat('#e11d3c', { roughness: 0.8 }));
    bandana.position.set(0, 1.56, 0.01); g.add(bandana);
  } else if (role === 'player') {
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.31), mat('#f6eef7', { roughness: 0.7 }));
    collar.position.set(0, 1.47, 0); g.add(collar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.015), mat('#f6eef7', { roughness: 0.6 }));
    stripe.position.set(0, 1.24, -0.155); g.add(stripe);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.215, 0.11, 12), mat('#f1ecf5', { roughness: 0.75 }));
    cap.position.y = 1.8; g.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.2), mat('#ff2e88', { roughness: 0.6 }));
    brim.position.set(0, 1.77, 0.19); g.add(brim);
  }

  const gun = new THREE.Mesh(G.gun, new THREE.MeshStandardMaterial({ color: '#15151b', roughness: 0.35, metalness: 0.75 }));
  gun.position.set(0, -0.56, 0.22);
  gun.rotation.x = 0.2;
  limbs.rightArm.add(gun);
  gun.visible = false;

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  return { group: g, limbs, gun, role, phase: Math.random() * 10, dead: false };
}

export function animatePed(ped, speed, dt) {
  const l = ped.limbs;
  if (!l) return;
  ped.phase += dt * (3.4 + speed * 1.55);
  const amp = Math.min(0.95, 0.15 + speed * 0.13);
  const s = Math.sin(ped.phase);
  l.leftLeg.rotation.x = s * amp;
  l.rightLeg.rotation.x = -s * amp;
  l.leftArm.rotation.x = -s * amp * 0.85;
  l.rightArm.rotation.x = s * amp * 0.85;
  if (speed < 0.15) {
    l.leftLeg.rotation.x *= 0.25;
    l.rightLeg.rotation.x *= 0.25;
    l.leftArm.rotation.x = Math.sin(ped.phase * 0.5) * 0.04;
    l.rightArm.rotation.x = -Math.sin(ped.phase * 0.5) * 0.04;
  }
}

/* ------------------------------------------------------------------ */
/*  Vehicles                                                           */
/* ------------------------------------------------------------------ */
const shadowCanvas = document.createElement('canvas');
shadowCanvas.width = shadowCanvas.height = 128;
{
  const ctx = shadowCanvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.68)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.34)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
}
const SHADOW_TEX = new THREE.CanvasTexture(shadowCanvas);
const SHADOW_MAT = new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, opacity: 0.55, depthWrite: false, color: 0x000000 });
const SHADOW_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

const WHEEL_MAT = new THREE.MeshStandardMaterial({ color: '#111014', roughness: 0.85 });
const GLASS_MAT = new THREE.MeshStandardMaterial({ color: '#0b1622', roughness: 0.12, metalness: 0.85 });
const TRIM_MAT = new THREE.MeshStandardMaterial({ color: '#191820', roughness: 0.5, metalness: 0.55 });
const HEAD_MAT = new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: '#ffdf9a', emissiveIntensity: 2.6, roughness: 0.3 });
const TAIL_MAT = new THREE.MeshStandardMaterial({ color: '#5a0b12', emissive: '#ff1f35', emissiveIntensity: 1.6, roughness: 0.4 });

const CAR_TYPES = {
  sedan: { L: 4.35, W: 1.9, bodyY: 0.56, bodyH: 0.56, cabW: 1.68, cabH: 0.55, cabL: 2.1, cabZ: -0.1, roofY: 1.34, wheelR: 0.36 },
  sports: { L: 4.5, W: 1.98, bodyY: 0.47, bodyH: 0.44, cabW: 1.56, cabH: 0.42, cabL: 1.72, cabZ: -0.25, roofY: 1.11, wheelR: 0.35, spoiler: true },
  taxi: { L: 4.35, W: 1.9, bodyY: 0.56, bodyH: 0.56, cabW: 1.68, cabH: 0.55, cabL: 2.1, cabZ: -0.1, roofY: 1.34, wheelR: 0.36, taxi: true },
  police: { L: 4.45, W: 1.94, bodyY: 0.57, bodyH: 0.58, cabW: 1.7, cabH: 0.56, cabL: 2.15, cabZ: -0.08, roofY: 1.37, wheelR: 0.37, police: true },
  van: { L: 5.1, W: 2.05, bodyY: 0.8, bodyH: 1.05, cabW: 1.9, cabH: 0.6, cabL: 1.7, cabZ: 1.15, roofY: 1.62, wheelR: 0.38 },
  truck: { L: 6.4, W: 2.25, bodyY: 0.85, bodyH: 0.9, cabW: 2.05, cabH: 0.85, cabL: 2.2, cabZ: 1.75, roofY: 1.7, wheelR: 0.42, truck: true },
  muscle: { L: 4.6, W: 2.0, bodyY: 0.54, bodyH: 0.52, cabW: 1.62, cabH: 0.48, cabL: 1.95, cabZ: -0.18, roofY: 1.28, wheelR: 0.37, spoiler: true },
};

export function createCar(type = 'sedan', color = '#d23b4f') {
  const cfg = CAR_TYPES[type] || CAR_TYPES.sedan;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#18171f', roughness: 0.6, metalness: 0.3 });

  const contact = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
  contact.scale.set(cfg.W * 1.35, 1, cfg.L * 1.18);
  contact.position.y = 0.025;
  g.add(contact);

  const body = new THREE.Mesh(new THREE.BoxGeometry(cfg.W, cfg.bodyH, cfg.L), bodyMat);
  body.position.y = cfg.bodyY; body.castShadow = true; body.receiveShadow = true; g.add(body);

  if (cfg.truck) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(cfg.W, cfg.cabH, cfg.cabL), bodyMat);
    cab.position.set(0, cfg.bodyY + cfg.bodyH / 2 + cfg.cabH / 2 - 0.05, cfg.cabZ); cab.castShadow = true; g.add(cab);
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(cfg.W + 0.05, 1.9, 3.4), new THREE.MeshStandardMaterial({ color: '#d8d3cb', roughness: 0.8 }));
    cargo.position.set(0, 1.35, -0.95); cargo.castShadow = true; g.add(cargo);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(cfg.W + 0.07, 0.3, 3.4), bodyMat);
    stripe.position.set(0, 1.5, -0.95); g.add(stripe);
  } else {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(cfg.cabW, cfg.cabH, cfg.cabL), GLASS_MAT);
    cab.position.set(0, cfg.bodyY + cfg.bodyH / 2 + cfg.cabH / 2 - 0.02, cfg.cabZ); cab.castShadow = true; g.add(cab);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(cfg.cabW + 0.06, 0.08, cfg.cabL * 0.92), bodyMat);
    roof.position.set(0, cfg.roofY, cfg.cabZ); g.add(roof);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(cfg.cabW + 0.12, 0.07, 0.62), bodyMat);
    trunk.position.set(0, cfg.bodyY + cfg.bodyH / 2 + 0.02, -cfg.L / 2 + 0.55); g.add(trunk);
    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(cfg.cabW * 0.84, cfg.cabH * 0.62, 0.03), GLASS_MAT);
    rearGlass.position.set(0, cfg.bodyY + cfg.bodyH / 2 + cfg.cabH * 0.4, cfg.cabZ - cfg.cabL / 2 - 0.02); g.add(rearGlass);
    // side pillars
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.06, cfg.cabH, 0.1), bodyMat);
      pillar.position.set(sx * (cfg.cabW / 2), cfg.bodyY + cfg.bodyH / 2 + cfg.cabH / 2, cfg.cabZ + cfg.cabL / 2 - 0.08);
      g.add(pillar);
    }
  }

  // bumpers
  for (const z of [cfg.L / 2 - 0.08, -cfg.L / 2 + 0.08]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(cfg.W + 0.04, 0.16, 0.18), TRIM_MAT);
    bumper.position.set(0, 0.36, z); g.add(bumper);
  }

  // lights
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.06), HEAD_MAT);
    head.position.set(sx * (cfg.W / 2 - 0.32), cfg.bodyY + 0.06, cfg.L / 2 + 0.01); g.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06), TAIL_MAT.clone());
    tail.position.set(sx * (cfg.W / 2 - 0.3), cfg.bodyY + 0.08, -cfg.L / 2 - 0.01); g.add(tail);
    if (!tail.userData.base) tail.userData.base = 1.6;
  }

  // wheels
  const wheels = [], frontWheels = [];
  const wheelGeo = cfg.wheelR < 0.33 ? G.wheelSmall : G.wheel;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, WHEEL_MAT);
      w.position.set(sx * (cfg.W / 2 + 0.01), cfg.wheelR, sz * (cfg.L / 2 - 0.95));
      w.castShadow = true;
      g.add(w); wheels.push(w);
      if (sz > 0) frontWheels.push(w);
    }
  }

  if (cfg.police) {
    const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.34, 1.5), new THREE.MeshStandardMaterial({ color: '#101015', roughness: 0.4 }));
    doorL.position.set(-cfg.W / 2 - 0.01, 0.62, 0.1); g.add(doorL);
    const doorR = doorL.clone(); doorR.position.x = cfg.W / 2 + 0.01; g.add(doorR);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.28), darkMat);
    barBase.position.set(0, cfg.roofY + 0.08, 0.1); g.add(barBase);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.24), new THREE.MeshStandardMaterial({ color: '#ff2030', emissive: '#ff1020', emissiveIntensity: 2.5, roughness: 0.3 }));
    red.position.set(-0.3, cfg.roofY + 0.17, 0.1); g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.24), new THREE.MeshStandardMaterial({ color: '#2050ff', emissive: '#1040ff', emissiveIntensity: 2.5, roughness: 0.3 }));
    blue.position.set(0.3, cfg.roofY + 0.17, 0.1); g.add(blue);
    g.userData.lightbar = { red, blue };
  }

  if (cfg.taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.34), new THREE.MeshStandardMaterial({ color: '#ffe28a', emissive: '#ffcf4a', emissiveIntensity: 1.4, roughness: 0.5 }));
    sign.position.set(0, cfg.roofY + 0.14, 0.05); g.add(sign);
  }

  if (cfg.spoiler) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(cfg.W - 0.25, 0.06, 0.36), darkMat);
    spoiler.position.set(0, cfg.bodyY + cfg.bodyH / 2 + 0.12, -cfg.L / 2 + 0.25); g.add(spoiler);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.12), darkMat);
      post.position.set(sx * 0.55, cfg.bodyY + cfg.bodyH / 2 + 0.03, -cfg.L / 2 + 0.28); g.add(post);
    }
  }

  g.userData.type = type;
  g.userData.cfg = cfg;
  return { group: g, wheels, frontWheels, cfg, lightbar: g.userData.lightbar || null };
}

export function updateCarVisual(car, steer, speed, dt) {
  for (const w of car.wheels) w.rotation.x += speed * dt * 2.2;
  for (const w of car.frontWheels) w.rotation.y = steer * 0.42;
}
