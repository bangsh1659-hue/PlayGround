export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.missionKicker = document.getElementById('mission-kicker');
    this.missionTitle = document.getElementById('mission-title');
    this.missionDesc = document.getElementById('mission-desc');
    this.missionTimer = document.getElementById('mission-timer');
    this.timerValue = document.getElementById('timer-value');
    this.clock = document.getElementById('clock');
    this.cash = document.getElementById('cash');
    this.wantedEl = document.getElementById('wanted');
    this.healthFill = document.getElementById('health-fill');
    this.armorFill = document.getElementById('armor-fill');
    this.ammoEl = document.getElementById('ammo');
    this.ammoValue = document.getElementById('ammo-value');
    this.weaponName = document.getElementById('weapon-name');
    this.weaponPanel = document.getElementById('weapon-panel');
    this.speedo = document.getElementById('speedo');
    this.speedValue = document.getElementById('speed-value');
    this.crosshair = document.getElementById('crosshair');
    this.hitmarkerEl = document.getElementById('hitmarker');
    this.prompt = document.getElementById('prompt');
    this.promptText = document.getElementById('prompt-text');
    this.toastWrap = document.getElementById('toast-wrap');
    this.banner = document.getElementById('mission-banner');
    this.bannerKicker = document.getElementById('banner-kicker');
    this.bannerTitle = document.getElementById('banner-title');
    this.bannerReward = document.getElementById('banner-reward');
    this.damageFlash = document.getElementById('damage-flash');
    this.objectiveDist = document.getElementById('objective-dist');
    this.minimap = document.getElementById('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.minimap.width = 480; this.minimap.height = 480;
    this.bannerTimer = 0;
    this.hitTimer = 0;
    this.wanted = 0;
    this.stars = [];
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span');
      s.className = 'star'; s.textContent = '★';
      this.wantedEl.appendChild(s); this.stars.push(s);
    }
    this.flashTimeout = null;
    this.cashValue = 0;
    this.cashShown = 0;
    this.mmTimer = 0;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setCash(v, instant = false) {
    this.cashValue = v;
    if (instant) this.cashShown = v;
    this.cash.textContent = '$' + Math.round(this.cashShown).toLocaleString('en-US');
  }

  tickCash(dt) {
    if (this.cashShown === this.cashValue) return;
    const diff = this.cashValue - this.cashShown;
    this.cashShown += diff * Math.min(1, dt * 8) + Math.sign(diff) * Math.min(Math.abs(diff), dt * 30);
    if (Math.abs(this.cashValue - this.cashShown) < 1) this.cashShown = this.cashValue;
    this.cash.textContent = '$' + Math.round(this.cashShown).toLocaleString('en-US');
  }

  setHealth(hp, armor = 0) {
    const h = Math.max(0, Math.min(100, hp));
    this.healthFill.style.width = h + '%';
    this.healthFill.classList.toggle('low', h < 30);
    this.armorFill.style.width = Math.max(0, Math.min(100, armor)) + '%';
  }

  setWanted(stars, flash = false) {
    stars = Math.max(0, Math.min(5, stars));
    if (stars === this.wanted && !flash) return;
    this.wanted = stars;
    this.stars.forEach((s, i) => s.classList.toggle('on', i < stars));
    this.wantedEl.classList.toggle('flash', flash && stars > 0);
    if (flash) {
      clearTimeout(this.flashTimeout);
      this.flashTimeout = setTimeout(() => this.wantedEl.classList.remove('flash'), 3000);
    }
  }

  setWeaponVisible(visible) {
    this.weaponPanel.style.opacity = visible ? '1' : '0';
  }

  setWeapon(ammo, reloading = false) {
    if (reloading) {
      this.ammoEl.classList.add('reload');
      this.ammoValue.textContent = 'RELOAD';
      this.ammoEl.querySelector('small').style.display = 'none';
    } else {
      this.ammoEl.classList.remove('reload');
      this.ammoEl.querySelector('small').style.display = '';
      this.ammoValue.textContent = ammo;
    }
  }

  setSpeed(kmh, visible) {
    this.speedo.classList.toggle('hidden', !visible);
    if (visible) this.speedValue.textContent = Math.round(Math.abs(kmh));
  }

  setClock(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    this.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  setMission({ kicker, title, desc, time = null }) {
    if (kicker) this.missionKicker.textContent = kicker;
    if (title) this.missionTitle.textContent = title;
    if (desc !== undefined) this.missionDesc.textContent = desc;
    if (time === null) this.missionTimer.classList.add('hidden');
    else { this.missionTimer.classList.remove('hidden'); this.setTimer(time); }
  }

  setTimer(seconds) {
    if (seconds === null) { this.missionTimer.classList.add('hidden'); return; }
    this.missionTimer.classList.remove('hidden');
    const s = Math.max(0, Math.ceil(seconds));
    this.timerValue.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.missionTimer.classList.toggle('urgent', s <= 10);
  }

  setObjectiveDistance(meters) {
    this.objectiveDist.textContent = meters == null ? '--' : (meters >= 1000 ? (meters / 1000).toFixed(1) + 'KM' : Math.round(meters) + 'M');
  }

  toast(text, type = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = text;
    this.toastWrap.appendChild(el);
    while (this.toastWrap.children.length > 3) this.toastWrap.firstChild.remove();
    setTimeout(() => el.remove(), 2700);
  }

  showBanner(kicker, title, reward) {
    this.bannerKicker.textContent = kicker;
    this.bannerTitle.textContent = title;
    this.bannerReward.textContent = reward;
    this.banner.classList.remove('hidden');
    this.banner.style.animation = 'none';
    void this.banner.offsetWidth;
    this.banner.style.animation = '';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.banner.classList.add('hidden'), 2800);
  }

  hideBanner() { this.banner.classList.add('hidden'); }

  showPrompt(text) {
    this.promptText.textContent = text;
    this.prompt.classList.remove('hidden');
  }
  hidePrompt() { this.prompt.classList.add('hidden'); }

  damage() {
    this.damageFlash.classList.add('on');
    setTimeout(() => this.damageFlash.classList.remove('on'), 90);
  }

  hitmarker(kill = false) {
    this.hitmarkerEl.classList.remove('kill');
    if (kill) this.hitmarkerEl.classList.add('kill');
    this.hitmarkerEl.classList.add('show');
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => this.hitmarkerEl.classList.remove('show'), kill ? 220 : 110);
  }

  setSpread(px) { this.crosshair.style.setProperty('--spread', px + 'px'); }

  /* ---------------- minimap ---------------- */
  drawMinimap(state) {
    const ctx = this.mctx;
    const size = 480, c = size / 2;
    const { x, z, heading } = state.player;
    const k = 2.6; // screen px per world metre
    const MS = state.mapScale;
    const map = state.mapCanvas;
    const theta = Math.PI + heading;
    const s = k / MS;
    const a = Math.cos(theta) * s, b = Math.sin(theta) * s;
    const cc = -Math.sin(theta) * s, d = Math.cos(theta) * s;
    const px = (x + state.mapWorld / 2) * MS;
    const py = (z + state.mapWorld / 2) * MS;
    const e = c - (a * px + cc * py);
    const f = c - (b * px + d * py);

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, c - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#071520'; ctx.fillRect(0, 0, size, size);
    ctx.setTransform(a, b, cc, d, e, f);
    ctx.drawImage(map, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // subtle scanline tint
    const grd = ctx.createRadialGradient(c, c, size * 0.15, c, c, size * 0.5);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(3,8,14,0.55)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, size, size);

    const toScreen = (wx, wz) => {
      const dx = wx - x, dz = wz - z;
      const sx = (-dx * Math.cos(heading) + dz * Math.sin(heading)) * k;
      const sy = (-dx * Math.sin(heading) - dz * Math.cos(heading)) * k;
      return [c + sx, c + sy];
    };

    // blips
    for (const b of state.blips || []) {
      const [bx, by] = toScreen(b.x, b.z);
      if (Math.hypot(bx - c, by - c) > c - 8) continue;
      ctx.beginPath();
      if (b.kind === 'cop') {
        ctx.fillStyle = b.flash ? '#ff3344' : '#3d7dff';
        ctx.arc(bx, by, 4.5, 0, Math.PI * 2); ctx.fill();
      } else if (b.kind === 'car') {
        ctx.fillStyle = 'rgba(230,238,255,0.72)';
        ctx.fillRect(bx - 2.5, by - 2.5, 5, 5);
      } else if (b.kind === 'gang') {
        ctx.fillStyle = '#ff4b6e';
        ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill();
      }
    }

    // objective
    if (state.objective) {
      const [ox, oy] = toScreen(state.objective.x, state.objective.z);
      const dx = ox - c, dy = oy - c;
      const dist = Math.hypot(dx, dy);
      if (dist > c - 18) {
        const ang = Math.atan2(dy, dx);
        const ex = c + Math.cos(ang) * (c - 16), ey = c + Math.sin(ang) * (c - 16);
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
        ctx.fillStyle = '#ffd23f'; ctx.beginPath();
        ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else {
        ctx.save(); ctx.translate(ox, oy); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = state.objective.pulse ? '#fff' : '#ffd23f';
        ctx.fillRect(-6, -6, 12, 12);
        ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2; ctx.strokeRect(-6, -6, 12, 12);
        ctx.restore();
      }
    }

    // player arrow
    ctx.save();
    ctx.translate(c, c);
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#ff2e88'; ctx.shadowBlur = 8; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

    // north marker
    const nx = c + Math.sin(heading) * (c - 16);
    const ny = c + Math.cos(heading) * (c - 16);
    ctx.font = 'bold 22px "Bebas Neue", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText('N', nx, ny);

    ctx.restore();
  }
}
