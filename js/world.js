import * as THREE from './three.module.js';

export const CITY = {
  grid: 8,
  cell: 58,
  roadWidth: 14,
  blockSize: 44,
  extent: 232,
  mapWorld: 560,
  mapPixels: 1024,
  edge: 236,
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260731);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const rng = (a, b) => a + rand() * (b - a);

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Window / facade textures                                           */
/* ------------------------------------------------------------------ */
const FACADES = [
  { base: '#221b2c', frame: '#171120', glass: '#ffd48a', glass2: '#ffe9c4', lit: 0.42 },
  { base: '#2c2029', frame: '#1b1420', glass: '#8ce8ff', glass2: '#c9fbff', lit: 0.34 },
  { base: '#1c2433', frame: '#131a26', glass: '#ffb56b', glass2: '#ffd9a8', lit: 0.5 },
  { base: '#30242a', frame: '#20161c', glass: '#ff9bc8', glass2: '#ffd0e5', lit: 0.36 },
  { base: '#1e2220', frame: '#151918', glass: '#b6ffca', glass2: '#e4ffe9', lit: 0.3 },
  { base: '#29212f', frame: '#1a1422', glass: '#a7b8ff', glass2: '#dfe6ff', lit: 0.44 },
];

const facadeTextures = FACADES.map((f) => canvasTexture(128, 256, (ctx, w, h) => {
  ctx.fillStyle = f.base; ctx.fillRect(0, 0, w, h);
  const cols = 6, rows = 14;
  const cw = w / cols, ch = h / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * cw + cw * 0.22, py = y * ch + ch * 0.24;
      const ww = cw * 0.56, wh = ch * 0.5;
      ctx.fillStyle = f.frame;
      ctx.fillRect(px - 1.5, py - 1.5, ww + 3, wh + 3);
      if (rand() < f.lit) {
        ctx.fillStyle = rand() < 0.25 ? f.glass2 : f.glass;
        ctx.globalAlpha = rng(0.55, 1);
        ctx.fillRect(px, py, ww, wh);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = '#0c0a12';
        ctx.globalAlpha = 0.82;
        ctx.fillRect(px, py, ww, wh);
        ctx.globalAlpha = 1;
      }
    }
  }
  // subtle vertical grime
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rng(0.03, 0.1)})`;
    ctx.fillRect(rand() * w, 0, rng(1, 4), h);
  }
}));

/* ------------------------------------------------------------------ */
/*  Neon sign textures                                                 */
/* ------------------------------------------------------------------ */
const SIGN_WORDS = ['NEON PALMS', 'OCEAN DRIVE', 'SUSHI 24', 'VICE MOTEL', 'CLUB 1984', 'PAWN SHOP', 'LIQUOR', 'TATTOO', 'NO VACANCY', 'GOLDEN HOUR', 'STARLITE', 'EL TORO', 'PINK FLAMINGO', 'NIGHT OWL'];
const SIGN_COLORS = ['#ff4fa3', '#45e6ff', '#ffd447', '#b06bff', '#ff7a45', '#65ffb0'];

function makeSignTexture(word, color) {
  return canvasTexture(512, 160, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = 5;
    ctx.shadowColor = color; ctx.shadowBlur = 22;
    ctx.strokeRect(9, 9, w - 18, h - 18);
    ctx.font = 'italic 700 84px "Bebas Neue", "Arial Narrow", Impact, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 30;
    ctx.fillText(word, w / 2, h / 2 + 4);
    ctx.shadowBlur = 0;
    ctx.fillStyle = color; ctx.globalAlpha = 0.55;
    ctx.fillText(word, w / 2, h / 2 + 4);
    ctx.globalAlpha = 1;
    ctx.font = '600 20px "Rajdhani", sans-serif';
    ctx.fillStyle = color;
    ctx.fillText('OPEN ALL NIGHT', w / 2, h - 26);
  });
}

/* ------------------------------------------------------------------ */
/*  Sky, ocean, clouds                                                 */
/* ------------------------------------------------------------------ */
const SUN_DIR = new THREE.Vector3(-0.62, 0.24, -0.74).normalize();

function buildSky(scene) {
  const skyGeo = new THREE.SphereGeometry(900, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color('#171a46') },
      uMid: { value: new THREE.Color('#8f3d6e') },
      uBottom: { value: new THREE.Color('#ffb078') },
      uSunDir: { value: SUN_DIR.clone() },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uTop, uMid, uBottom, uSunDir;
      varying vec3 vWorld;
      void main() {
        vec3 dir = normalize(vWorld);
        float h = clamp(dir.y, -0.08, 1.0);
        vec3 col = mix(uBottom, uMid, smoothstep(-0.02, 0.16, h));
        col = mix(col, uTop, smoothstep(0.16, 0.82, h));
        float d = max(dot(dir, uSunDir), 0.0);
        col += vec3(1.0, 0.52, 0.24) * pow(d, 260.0) * 2.2;
        col += vec3(1.0, 0.34, 0.42) * pow(d, 9.0) * 0.30;
        col += vec3(0.35, 0.18, 0.55) * pow(1.0 - abs(dir.y), 7.0) * 0.16;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  const sunTex = canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,240,1)');
    g.addColorStop(0.18, 'rgba(255,225,170,1)');
    g.addColorStop(0.42, 'rgba(255,150,90,0.55)');
    g.addColorStop(1, 'rgba(255,80,80,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  sun.position.copy(SUN_DIR).multiplyScalar(780);
  sun.scale.setScalar(190);
  scene.add(sun);

  const cloudTex = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = rng(30, w - 30), y = rng(40, h - 25), r = rng(12, 34);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,210,220,0.5)');
      g.addColorStop(1, 'rgba(255,180,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  });
  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: rng(0.22, 0.5), depthWrite: false, fog: false, color: new THREE.Color().setHSL(rng(0.86, 0.97), 0.55, 0.75) });
    const s = new THREE.Sprite(mat);
    s.position.set(rng(-620, 620), rng(110, 260), rng(-620, 620));
    s.scale.set(rng(120, 280), rng(40, 80), 1);
    scene.add(s); clouds.push(s);
  }
  return { clouds };
}

function buildOcean(scene) {
  const geo = new THREE.PlaneGeometry(4000, 4000, 1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#07121f') },
      uShallow: { value: new THREE.Color('#123c4f') },
      uSun: { value: new THREE.Color('#ff9b6a') },
      uFog: { value: new THREE.Color('#c46f67') },
      uDensity: { value: 0.0024 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uDeep, uShallow, uSun, uFog; uniform float uDensity;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        float w1 = sin(p.x * 0.09 + uTime * 0.7) * 0.5 + 0.5;
        float w2 = sin(p.y * 0.13 - uTime * 0.5 + p.x * 0.03) * 0.5 + 0.5;
        float w3 = sin((p.x + p.y) * 0.21 + uTime * 1.1) * 0.5 + 0.5;
        vec3 col = mix(uDeep, uShallow, w1 * 0.45 + w2 * 0.25);
        float glint = pow(w1 * w2 * w3, 3.0) * 0.55;
        col += uSun * glint;
        float dist = length(vWorld - cameraPosition);
        float f = 1.0 - exp(-uDensity * uDensity * dist * dist);
        col = mix(col, uFog, clamp(f, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.7;
  scene.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  World builder                                                      */
/* ------------------------------------------------------------------ */
export function createWorld(scene, renderer) {
  const colliders = [];
  const solidMeshes = [];
  const blocks = [];
  const buildings = [];
  const roadCoords = [];
  const signs = [];
  const N = CITY.grid, cell = CITY.cell, bw = CITY.blockSize, road = CITY.roadWidth;

  for (let i = 0; i <= N; i++) roadCoords.push((i - N / 2) * cell);

  /* ---------- lights ---------- */
  const hemi = new THREE.HemisphereLight(0xffb08a, 0x322647, 1.65);
  scene.add(hemi);
  const fillLight = new THREE.DirectionalLight(0x7f8cff, 0.55);
  fillLight.position.set(0.6, 0.35, 0.8);
  scene.add(fillLight);
  const sunLight = new THREE.DirectionalLight(0xffb27a, 2.9);
  sunLight.position.copy(SUN_DIR).multiplyScalar(120);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 340;
  sunLight.shadow.camera.left = -95; sunLight.shadow.camera.right = 95;
  sunLight.shadow.camera.top = 95; sunLight.shadow.camera.bottom = -95;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.03;
  scene.add(sunLight);
  scene.add(sunLight.target);
  scene.add(new THREE.AmbientLight(0x584468, 0.85));

  scene.fog = new THREE.FogExp2(0xc06c68, 0.0026);

  const { clouds } = buildSky(scene);
  const ocean = buildOcean(scene);

  /* ---------- ground + water rim ---------- */
  const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x2b2734, roughness: 0.55, metalness: 0.18 });
  const cityFloor = new THREE.Mesh(new THREE.BoxGeometry(520, 0.4, 520), asphaltMat);
  cityFloor.position.y = -0.2;
  cityFloor.receiveShadow = true;
  scene.add(cityFloor);

  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x6f6779, roughness: 0.72, metalness: 0.06 });
  const parkMat = new THREE.MeshStandardMaterial({ color: 0x31583d, roughness: 0.95 });
  const lotMat = new THREE.MeshStandardMaterial({ color: 0x363140, roughness: 0.7, metalness: 0.12 });

  /* ---------- road markings ---------- */
  const dashGeo = new THREE.BoxGeometry(0.16, 0.02, 4.2);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf0c04a, emissive: 0x7a5a10, emissiveIntensity: 0.45, roughness: 0.6 });
  const dashes = [];
  for (let i = 0; i <= N; i++) {
    const r = roadCoords[i];
    for (let z = -CITY.extent + 3; z < CITY.extent; z += 10) {
      dashes.push({ x: r, z, rot: 0 });
      dashes.push({ x: z, z: r, rot: Math.PI / 2 });
    }
  }
  const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const v3 = new THREE.Vector3(); const s3 = new THREE.Vector3(1, 1, 1);
  dashes.forEach((d, idx) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rot);
    v3.set(d.x, 0.012, d.z);
    m4.compose(v3, q, s3);
    dashMesh.setMatrixAt(idx, m4);
  });
  dashMesh.receiveShadow = true;
  scene.add(dashMesh);

  const edgeGeo = new THREE.BoxGeometry(0.14, 0.02, CITY.extent * 2);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xd8d2d8, roughness: 0.7 });
  const edgeCount = (N + 1) * 4;
  const edgeMesh = new THREE.InstancedMesh(edgeGeo, edgeMat, edgeCount);
  let ei = 0;
  for (let i = 0; i <= N; i++) {
    const r = roadCoords[i];
    for (const off of [-road / 2 + 1.1, road / 2 - 1.1]) {
      q.identity(); v3.set(r + off, 0.013, 0); m4.compose(v3, q, s3); edgeMesh.setMatrixAt(ei++, m4);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); v3.set(0, 0.013, r + off); m4.compose(v3, q, s3); edgeMesh.setMatrixAt(ei++, m4);
    }
  }
  scene.add(edgeMesh);

  // crosswalks around the inner intersections
  const cwGeo = new THREE.BoxGeometry(0.55, 0.02, 3.2);
  const cwMat = new THREE.MeshStandardMaterial({ color: 0xd9d4dc, roughness: 0.65, emissive: 0x2a2530, emissiveIntensity: 0.3 });
  const cw = [];
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const rx = roadCoords[i], rz = roadCoords[j];
      for (const s of [-1, 1]) {
        for (let k = -4; k <= 4; k++) {
          cw.push({ x: rx + k * 1.25, z: rz + s * 8.3, rot: 0 });
          cw.push({ x: rx + s * 8.3, z: rz + k * 1.25, rot: Math.PI / 2 });
        }
      }
    }
  }
  const cwMesh = new THREE.InstancedMesh(cwGeo, cwMat, cw.length);
  cw.forEach((c, idx) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rot);
    v3.set(c.x, 0.014, c.z); m4.compose(v3, q, s3); cwMesh.setMatrixAt(idx, m4);
  });
  cwMesh.receiveShadow = true;
  scene.add(cwMesh);

  /* ---------- props instancing ---------- */
  const lampPositions = [];
  const palmPositions = [];
  const roofCaps = [];
  const acUnits = [];
  const antennas = [];

  /* ---------- blocks + buildings ---------- */
  const facadeMats = facadeTextures.map((tex) => new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.62, roughness: 0.82, metalness: 0.08,
  }));

  const storeMat = new THREE.MeshStandardMaterial({ color: 0x15121c, roughness: 0.8 });

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const cx = (i - (N - 1) / 2) * cell;
      const cz = (j - (N - 1) / 2) * cell;
      const dist = Math.hypot(cx, cz);
      let type = 'city';
      if (i === 4 && j === 4) type = 'park';
      else if (rand() < 0.085) type = 'park';
      else if (rand() < 0.075) type = 'lot';
      blocks.push({ cx, cz, type });

      // sidewalk slab
      const slab = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.28, bw), type === 'park' ? parkMat : type === 'lot' ? lotMat : sidewalkMat);
      slab.position.set(cx, 0.14, cz);
      slab.receiveShadow = true;
      scene.add(slab);

      // palms around the block edge
      if (type !== 'lot') {
        const sides = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [sx, sz] of sides) {
          if (rand() < 0.7) {
            const t = rng(-bw / 2 + 4, bw / 2 - 4);
            palmPositions.push({
              x: cx + (sx !== 0 ? sx * (bw / 2 - 1.6) : t),
              z: cz + (sz !== 0 ? sz * (bw / 2 - 1.6) : t),
              s: rng(0.8, 1.25),
            });
          }
        }
      }

      if (type === 'park') {
        if (i === 4 && j === 4) {
          // central plaza fountain
          const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.2, 1.1, 28), new THREE.MeshStandardMaterial({ color: 0x6b6474, roughness: 0.7 }));
          basin.position.set(cx, 0.8, cz); basin.castShadow = true; basin.receiveShadow = true; scene.add(basin);
          const water = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 0.1, 28), new THREE.MeshStandardMaterial({ color: 0x2bd7e8, emissive: 0x1a9aab, emissiveIntensity: 1.4, roughness: 0.15, metalness: 0.4 }));
          water.position.set(cx, 1.38, cz); scene.add(water);
          const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 3.2, 10), new THREE.MeshStandardMaterial({ color: 0x9ff5ff, emissive: 0x54d8e8, emissiveIntensity: 1.8, transparent: true, opacity: 0.75 }));
          jet.position.set(cx, 2.6, cz); scene.add(jet);
          colliders.push({ minX: cx - 5, maxX: cx + 5, minZ: cz - 5, maxZ: cz + 5, height: 1.4 });
        }
        continue;
      }

      if (type === 'lot') {
        // parking lot with painted bays
        for (let k = 0; k < 3; k++) {
          const line = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 6), new THREE.MeshStandardMaterial({ color: 0xd9d4c5, roughness: 0.8 }));
          line.position.set(cx - 12 + k * 12, 0.3, cz);
          scene.add(line);
        }
        continue;
      }

      // building lots
      const layout = rand() < 0.3 ? 1 : rand() < 0.62 ? 2 : 4;
      const lots = [];
      if (layout === 1) {
        lots.push({ x: cx, z: cz, w: rng(30, 39), d: rng(28, 38) });
      } else if (layout === 2) {
        const w = rng(16.5, 19.5), d = rng(29, 38);
        lots.push({ x: cx - 9.6, z: cz, w, d });
        lots.push({ x: cx + 9.6, z: cz, w, d });
      } else {
        const w = rng(16, 19), d = rng(15.5, 18.5);
        for (const ox of [-9.7, 9.7]) for (const oz of [-9.7, 9.7]) lots.push({ x: cx + ox, z: cz + oz, w, d });
      }

      for (const lot of lots) {
        const downtown = Math.max(0, 1 - dist / 210);
        let h = rng(8, 20) + downtown * rng(6, 26);
        if (rand() < 0.11 + downtown * 0.26) h = rng(34, 46) + downtown * rng(10, 34);
        h = Math.min(h, 86);
        const y = h / 2 + 0.28;
        const mat = pick(facadeMats).clone();
        mat.map = mat.map.clone();
        mat.emissiveMap = mat.map;
        mat.map.repeat.set(Math.max(0.4, lot.w / 18.6), Math.max(0.4, h / 44.8));
        mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
        mat.map.needsUpdate = true;
        const b = new THREE.Mesh(new THREE.BoxGeometry(lot.w, h, lot.d), mat);
        b.position.set(lot.x, y, lot.z);
        b.castShadow = true; b.receiveShadow = true;
        scene.add(b); solidMeshes.push(b);
        buildings.push({ x: lot.x, z: lot.z, w: lot.w, d: lot.d, h });
        colliders.push({ minX: lot.x - lot.w / 2, maxX: lot.x + lot.w / 2, minZ: lot.z - lot.d / 2, maxZ: lot.z + lot.d / 2, height: h });
        roofCaps.push({ x: lot.x, z: lot.z, w: lot.w + 0.5, d: lot.d + 0.5, y: y + h / 2 + 0.12 });
        if (h > 22) {
          const n = Math.floor(rng(1, 3));
          for (let k = 0; k < n; k++) acUnits.push({ x: lot.x + rng(-lot.w / 3, lot.w / 3), y: y + h / 2 + 0.65, z: lot.z + rng(-lot.d / 3, lot.d / 3), s: rng(1.1, 2.2) });
        }
        if (h > 40) antennas.push({ x: lot.x + rng(-2, 2), z: lot.z + rng(-2, 2), y: y + h / 2, h: rng(4, 10) });

        // storefront + neon sign on a street-facing facade
        if (rand() < 0.62 && dist < 210) {
          const sides = [
            { nx: 0, nz: 1, off: lot.d / 2, rot: 0, face: lot.z + lot.d / 2, vertical: false },
            { nx: 0, nz: -1, off: lot.d / 2, rot: Math.PI, face: lot.z - lot.d / 2, vertical: false },
            { nx: 1, nz: 0, off: lot.w / 2, rot: Math.PI / 2, face: lot.x + lot.w / 2, vertical: true },
            { nx: -1, nz: 0, off: lot.w / 2, rot: -Math.PI / 2, face: lot.x - lot.w / 2, vertical: true },
          ];
          let side = sides[0], bestRoad = Infinity;
          for (const s of sides) {
            let nearest = Infinity;
            for (const r of roadCoords) nearest = Math.min(nearest, Math.abs(s.face - r));
            if (nearest < bestRoad) { bestRoad = nearest; side = s; }
          }
          const sw = side.nx !== 0 ? lot.d : lot.w;
          const word = pick(SIGN_WORDS);
          const color = pick(SIGN_COLORS);
          const tex = makeSignTexture(word, color);
          const signMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.95 });
          const signW = Math.min(sw * 0.78, 11);
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signW * 0.3125), signMat);
          const px = lot.x + side.nx * (side.off + 0.12);
          const pz = lot.z + side.nz * (side.off + 0.12);
          sign.position.set(px, 6.4, pz);
          sign.rotation.y = side.rot;
          scene.add(sign);
          signs.push({ mesh: sign, seed: rand() * 100, color });
          // dark storefront band
          const band = new THREE.Mesh(new THREE.BoxGeometry(lot.w + 0.16, 2.6, lot.d + 0.16), storeMat);
          band.position.set(lot.x, 1.6, lot.z);
          scene.add(band);
        }
      }

      // streetlights at block corners
      for (const [sx, sz] of [[1, 1], [-1, -1]]) {
        lampPositions.push({ x: cx + sx * (bw / 2 - 1.1), z: cz + sz * (bw / 2 - 1.1) });
      }
    }
  }

  /* ---------- roof caps / AC / antennas ---------- */
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x211d29, roughness: 0.95 });
  const roofMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.25, 1), roofMat, roofCaps.length);
  roofCaps.forEach((r, idx) => {
    q.identity(); v3.set(r.x, r.y, r.z); s3.set(r.w, 1, r.d); m4.compose(v3, q, s3); roofMesh.setMatrixAt(idx, m4);
  });
  roofMesh.castShadow = true; roofMesh.receiveShadow = true; scene.add(roofMesh);

  const acMat = new THREE.MeshStandardMaterial({ color: 0x6c6672, roughness: 0.8, metalness: 0.3 });
  if (acUnits.length) {
    const acMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.9, 1), acMat, acUnits.length);
    acUnits.forEach((a, idx) => { q.identity(); v3.set(a.x, a.y, a.z); s3.set(a.s, 1, a.s * 0.8); m4.compose(v3, q, s3); acMesh.setMatrixAt(idx, m4); });
    acMesh.castShadow = true; scene.add(acMesh);
  }
  const antMat = new THREE.MeshStandardMaterial({ color: 0x8a8494, roughness: 0.5, metalness: 0.6 });
  if (antennas.length) {
    const antMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.09, 1, 6), antMat, antennas.length);
    antennas.forEach((a, idx) => { q.identity(); v3.set(a.x, a.y + a.h / 2, a.z); s3.set(1, a.h, 1); m4.compose(v3, q, s3); antMesh.setMatrixAt(idx, m4); });
    scene.add(antMesh);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
    const tipMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 6), tipMat, antennas.length);
    antennas.forEach((a, idx) => { q.identity(); v3.set(a.x, a.y + a.h, a.z); s3.set(1, 1, 1); m4.compose(v3, q, s3); tipMesh.setMatrixAt(idx, m4); });
    scene.add(tipMesh);
  }

  /* ---------- streetlights ---------- */
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2730, roughness: 0.6, metalness: 0.5 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc070, emissiveIntensity: 3.2 });
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.13, 5.8, 8), poleMat, lampPositions.length);
  const headMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.16, 0.26), lampMat, lampPositions.length);
  lampPositions.forEach((p, idx) => {
    q.identity(); v3.set(p.x, 2.9 + 0.28, p.z); s3.set(1, 1, 1); m4.compose(v3, q, s3); poleMesh.setMatrixAt(idx, m4);
    v3.set(p.x, 5.72, p.z); m4.compose(v3, q, s3); headMesh.setMatrixAt(idx, m4);
  });
  poleMesh.castShadow = true; scene.add(poleMesh); scene.add(headMesh);

  const glowTex = canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,224,170,1)'); g.addColorStop(0.3, 'rgba(255,180,100,0.55)'); g.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  const glowGeo = new THREE.BufferGeometry();
  const gpos = new Float32Array(lampPositions.length * 3);
  lampPositions.forEach((p, i) => { gpos[i * 3] = p.x; gpos[i * 3 + 1] = 5.7; gpos[i * 3 + 2] = p.z; });
  glowGeo.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
  const glowPoints = new THREE.Points(glowGeo, new THREE.PointsMaterial({ map: glowTex, size: 3.4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9, color: 0xffcf9a }));
  scene.add(glowPoints);

  /* ---------- palms ---------- */
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4232, roughness: 0.95 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x1f5c39, roughness: 0.85, side: THREE.DoubleSide });
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.3, 4.6, 7), trunkMat, palmPositions.length);
  const frondMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), frondMat, palmPositions.length);
  palmPositions.forEach((p, idx) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.x * 0.7 + p.z);
    v3.set(p.x, 2.3 * p.s + 0.28, p.z); s3.set(p.s, p.s, p.s); m4.compose(v3, q, s3); trunkMesh.setMatrixAt(idx, m4);
    v3.set(p.x, 4.7 * p.s + 0.28, p.z); s3.set(2.1 * p.s, 0.62 * p.s, 2.1 * p.s); m4.compose(v3, q, s3); frondMesh.setMatrixAt(idx, m4);
  });
  trunkMesh.castShadow = true; frondMesh.castShadow = true;
  scene.add(trunkMesh); scene.add(frondMesh);

  /* ---------- seawall + invisible boundary ---------- */
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x4b4553, roughness: 0.9 });
  for (const [x, z, w, d] of [[0, -236, 484, 4], [0, 236, 484, 4], [-236, 0, 4, 484], [236, 0, 4, 484]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d), wallMat);
    wall.position.set(x, 0.6, z); wall.castShadow = true; wall.receiveShadow = true; scene.add(wall);
    solidMeshes.push(wall);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: 2.2 });
  }
  // low guard rail glow on the waterfront
  for (let s = -1; s <= 1; s += 2) {
    for (let t = -230; t <= 230; t += 10) {
      // skip to keep draw calls low; the seawall is enough
    }
  }

  /* ---------- static map ---------- */
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = CITY.mapPixels; mapCanvas.height = CITY.mapPixels;
  const mctx = mapCanvas.getContext('2d');
  const MS = CITY.mapPixels / CITY.mapWorld;
  const toMap = (v) => (v + CITY.mapWorld / 2) * MS;
  mctx.fillStyle = '#071520'; mctx.fillRect(0, 0, CITY.mapPixels, CITY.mapPixels);
  // island slab
  mctx.fillStyle = '#211d29';
  mctx.fillRect(toMap(-260), toMap(-260), 520 * MS, 520 * MS);
  // blocks
  for (const b of blocks) {
    mctx.fillStyle = b.type === 'park' ? '#20452f' : b.type === 'lot' ? '#2d2a36' : '#413c4b';
    mctx.fillRect(toMap(b.cx - bw / 2), toMap(b.cz - bw / 2), bw * MS, bw * MS);
  }
  // roads
  mctx.strokeStyle = '#141119'; mctx.lineWidth = road * MS;
  for (const r of roadCoords) {
    mctx.beginPath(); mctx.moveTo(toMap(r), toMap(-CITY.extent)); mctx.lineTo(toMap(r), toMap(CITY.extent)); mctx.stroke();
    mctx.beginPath(); mctx.moveTo(toMap(-CITY.extent), toMap(r)); mctx.lineTo(toMap(CITY.extent), toMap(r)); mctx.stroke();
  }
  // lane hint
  mctx.strokeStyle = 'rgba(240,200,90,0.35)'; mctx.lineWidth = 1.2; mctx.setLineDash([5, 7]);
  for (const r of roadCoords) {
    mctx.beginPath(); mctx.moveTo(toMap(r), toMap(-CITY.extent)); mctx.lineTo(toMap(r), toMap(CITY.extent)); mctx.stroke();
    mctx.beginPath(); mctx.moveTo(toMap(-CITY.extent), toMap(r)); mctx.lineTo(toMap(CITY.extent), toMap(r)); mctx.stroke();
  }
  mctx.setLineDash([]);
  // buildings
  for (const b of buildings) {
    const t = Math.min(1, b.h / 70);
    mctx.fillStyle = `rgba(${80 + t * 40},${72 + t * 35},${94 + t * 30},0.95)`;
    mctx.fillRect(toMap(b.x - b.w / 2), toMap(b.z - b.d / 2), b.w * MS, b.d * MS);
  }
  // shoreline
  mctx.strokeStyle = 'rgba(90,220,255,0.35)'; mctx.lineWidth = 2;
  mctx.strokeRect(toMap(-238), toMap(-238), 476 * MS, 476 * MS);

  /* ---------- spawn data ---------- */
  const spawn = {
    player: new THREE.Vector3(0.5, 0, 47),
    car: new THREE.Vector3(-3.4, 0, 48.5),
    carHeading: 0,
    camera: new THREE.Vector3(0.5, 2, 53),
  };

  /* ---------- update ---------- */
  let t = 0;
  function update(dt, focus) {
    t += dt;
    ocean.material.uniforms.uTime.value = t;
    clouds.forEach((c, i) => {
      c.position.x += dt * (0.6 + i * 0.07);
      if (c.position.x > 680) c.position.x = -680;
    });
    for (const s of signs) {
      const flick = 0.82 + Math.sin(t * 13 + s.seed) * 0.05 + (Math.sin(t * 2.1 + s.seed) > 0.96 ? -0.5 : 0);
      s.mesh.material.opacity = Math.max(0.25, flick);
    }
    if (focus) {
      sunLight.position.set(focus.x + SUN_DIR.x * 180, SUN_DIR.y * 180, focus.z + SUN_DIR.z * 180);
      sunLight.target.position.set(focus.x, 0, focus.z);
      sunLight.target.updateMatrixWorld();
    }
  }

  return {
    colliders, solidMeshes, blocks, buildings, roadCoords, mapCanvas, mapScale: MS, mapWorld: CITY.mapWorld,
    spawn, update, sunLight, sunDir: SUN_DIR, ocean,
    city: CITY,
  };
}
