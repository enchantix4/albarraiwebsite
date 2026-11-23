// grab the canvas and its drawing tool
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener('resize', resize);
resize();

const LETTERS = 'ASDFJKL';
// load the art
function img(n) { const i = new Image(); i.src = 'assets/' + n; return i; }
const rideBg = img('buckup_ride_bg.jpg');
const SLIDES = [
  { pic: img('buckup_trailer_exterior.jpg'), text: 'SOMEWHERE OFF THE HIGHWAY...' },
  { pic: img('buckup_trailer_bar.jpg'),   text: 'FRIDAY NIGHT. THE BITTER BLONDE.' },
  { pic: img('buckup_trailer_bull.jpg'),  text: 'THE BULL HAS NEVER LOST.' },
  { pic: img('buckup_trailer_rider.jpg'), text: 'TONIGHT, SHE RIDES.' },
];
const SLIDE_MS = 4000;
// BUCK UP / lose titles: Lucidity Expand (file supplied by Juani), silver metallic fill.
let titleFontReady = false;
if (document.fonts && document.fonts.load) {
  Promise.all([
    document.fonts.load('120px "Lucidity Expand"'),
    document.fonts.load('80px "Lucidity Expand"'),
    document.fonts.load('44px Anton'),
    document.fonts.load('28px Anton'),
    document.fonts.ready
  ]).then(function () { titleFontReady = true; }).catch(function () { titleFontReady = true; });
} else {
  titleFontReady = true;
}
function titleFont(size) {
  return size + 'px "Lucidity Expand", Anton, Impact, sans-serif';
}
function fitTitleSize(text, maxW, size) {
  ctx.font = titleFont(size);
  const w = ctx.measureText(text).width;
  return w > maxW ? size * maxW / w : size;
}
function drawSilverLine(text, x, y, size, glitch) {
  ctx.save();
  ctx.font = titleFont(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const h = size;
  const grd = ctx.createLinearGradient(x, y - h * 0.55, x, y + h * 0.55);
  grd.addColorStop(0, '#F7F4EE');
  grd.addColorStop(0.38, '#D4D1CB');
  grd.addColorStop(0.72, '#A8A59F');
  grd.addColorStop(1, '#8A8781');
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillText(text, x + 4, y + 5);
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(5, size * 0.055);
  ctx.strokeStyle = 'rgba(8,6,4,0.9)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = grd;
  ctx.fillText(text, x, y);
  if (glitch) {
    const t = performance.now() / 1000;
    if (Math.sin(t * 1.7) > 0.88) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#9bb8ff';
      ctx.fillText(text, x + 2, y);
      ctx.fillStyle = '#ffb0a0';
      ctx.fillText(text, x - 2, y);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.restore();
}

function drawTitleCredits() {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.font = '10px sans-serif';
  ctx.fillStyle = 'rgba(168, 124, 88, 0.42)';
  const x = 12, line = 13;
  if (!titleCreditsOpen) {
    ctx.fillText('models  ·  press C', x, canvas.height - 8);
  } else {
    const lines = [
      '"Farm (low poly)" (https://skfb.ly/otPnE) by Avmifi, CC BY 4.0',
      '"Cowboy Confidence" (https://skfb.ly/pNpKF) by restore50, CC BY 4.0',
      '"GTA sa NPC 1" (https://skfb.ly/pE7Ys) by Uususykoolaid, CC BY 4.0'
    ];
    if (window.BUCK_CC_MODELS && window.BUCK_CC_MODELS.summer) {
      lines.splice(2, 0, '"Summer Confidence" (https://skfb.ly/pNGDE) by Grauwolf, CC BY 4.0');
    }
    let y = canvas.height - 8 - (lines.length - 1) * line;
    lines.forEach(function (s) { ctx.fillText(s, x, y); y += line; });
  }
  ctx.restore();
}

function drawTitle(text, x, y, size) {
  if (!titleFontReady) return;
  drawSilverLine(text, x, y, fitTitleSize(text, canvas.width * 0.86, size), false);
}
function drawLoseTitle() {
  if (!titleFontReady) return;
  const maxW = canvas.width * 0.9;
  let size = Math.min(canvas.width / 9, 100);
  size = Math.min(fitTitleSize('BUCK IT', maxW, size), fitTitleSize('THE F*CK UP', maxW, size));
  const cy = canvas.height * 0.44, gap = size * 1.08;
  drawSilverLine('BUCK IT', canvas.width / 2, cy - gap / 2, size, true);
  drawSilverLine('THE F*CK UP', canvas.width / 2, cy + gap / 2, size, true);
}
// neon-sign captions (inspired by saloon neon): chunky slab type with a red glow
function drawNeon(text, x, y, size) {
  ctx.save(); ctx.textAlign = 'center';
  ctx.font = `bold ${size}px Rockwell, "American Typewriter", Georgia, serif`;
  ctx.shadowColor = '#FF2A3D'; ctx.shadowBlur = 25; ctx.lineWidth = 3; ctx.strokeStyle = '#FF2A3D';
  ctx.strokeText(text, x, y); ctx.shadowBlur = 8; ctx.fillStyle = '#FFF4F0'; ctx.fillText(text, x, y);
  ctx.restore();
}
// gothic lose text, in the spirit of crime-game death screens
function drawGothic(text, x, y, size, color) {
  ctx.save(); ctx.textAlign = 'center';
  ctx.font = `${size}px "Pirata One", Luminari, "Old English Text MT", fantasy`;
  ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.restore();
}
// fake 3D depth: the bottom of the picture is "near", the top is "far"
function drawDepth(pic, x, y, w, h, shift, push) {
  const strips = 24, sh = pic.height / strips, dh = h / strips;
  for (let i = 0; i < strips; i++) {
    const near = i / strips;                 // 0 = far, 1 = near
    const k = 0.25 + near * near * 1.5;
    const sc = 1 + push * near * 0.25;       // near strips grow when pushing in
    ctx.drawImage(pic, 0, i * sh, pic.width, sh + 1,
      x + shift * k - (w * sc - w) / 2, y + i * dh, w * sc, dh + 1);
  }
}
// Light film treatment: at rest, only subtle colour fringing. Glitch tears and a soft
// downscale appear only as intensity rises (damage / higher levels). Never crunch a
// clean frame down to 400px.
const low = document.createElement('canvas'), lctx = low.getContext('2d');
function ps2(intensity, now) {
  const a = Math.max(0, intensity);
  // full-screen chromatic fringing from an offscreen copy so the frame never shifts off the edges
  if (a > 0.02) {
    if (low.width !== canvas.width || low.height !== canvas.height) { low.width = canvas.width; low.height = canvas.height; }
    lctx.drawImage(canvas, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.05 + a * 0.1;
    const off = 1 + a * 2;
    ctx.drawImage(low, off, 0);
    ctx.globalAlpha = 0.04 + a * 0.07;
    ctx.drawImage(low, -off, 0);
    ctx.restore();
  }
  // only at higher intensity: a mild downscale and glitch tears
  if (a > 0.35) {
    const scale = 1 - (a - 0.35) * 0.45; // 1.0 .. ~0.7
    const W = Math.max(640, Math.round(canvas.width * scale));
    const H = Math.round(W * canvas.height / canvas.width);
    low.width = W; low.height = H;
    lctx.imageSmoothingEnabled = true;
    lctx.drawImage(canvas, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = (a - 0.35) * 1.1;
    ctx.drawImage(low, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    const tears = Math.floor(Math.random() * a * 5);
    for (let i = 0; i < tears; i++) {
      const ty = Math.random() * canvas.height, th = 3 + Math.random() * 18;
      ctx.drawImage(canvas, 0, ty, canvas.width, th, (Math.random() - 0.5) * 40 * a, ty, canvas.width, th);
    }
  }
}
// draw the 3D render at full window size
let yawAcc = 0, lastNow = 0;
const lastFrame = document.createElement('canvas'), lastCtx = lastFrame.getContext('2d');
let hasLastFrame = false;
function keepFrame() {
  if (lastFrame.width !== canvas.width || lastFrame.height !== canvas.height) {
    lastFrame.width = canvas.width; lastFrame.height = canvas.height;
  }
  lastCtx.drawImage(canvas, 0, 0);
  hasLastFrame = true;
}
function holdFrame() {
  if (!hasLastFrame) return false;
  ctx.drawImage(lastFrame, 0, 0, canvas.width, canvas.height);
  return true;
}
function draw3d(x, y, w, h) {
  const lost = window.scene3d && scene3d.isLost && scene3d.isLost();
  try {
    if (window.scene3d && scene3d.canvas && scene3d.canvas.width && !lost) {
      // 3D is rendered at full window size; blit 1:1 (or a gentle downscale if dpr > 1)
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(scene3d.canvas, x, y, w, h);
      return true;
    }
  } catch (e) { console.error('BUCK draw3d', e && (e.stack || e)); }
  if (hasLastFrame) { ctx.drawImage(lastFrame, x, y, w, h); return true; }
  return false;
}
// pre-0050 warm smoggy orange-sepia wash (preferred palette)
function grade(strength) {
  ctx.fillStyle = `rgba(232,140,60,${strength})`; ctx.globalCompositeOperation = 'soft-light';
  ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createRadialGradient(canvas.width/2, canvas.height/2, canvas.height*0.3, canvas.width/2, canvas.height/2, canvas.height*0.9);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,10,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
}
// crime-game style HUD: round radar, money-style score, health bar
function chunky(text, x, y, size, fill, align) {
  ctx.save();
  ctx.textAlign = align || 'right';
  ctx.font = `${size}px Anton, Impact, "Arial Black", sans-serif`;
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  ctx.lineJoin = 'miter'; ctx.miterLimit = 2;
  ctx.lineWidth = 3; ctx.strokeStyle = '#000';
  const t = String(text).toUpperCase();
  ctx.strokeText(t, x, y);
  ctx.fillStyle = fill; ctx.fillText(t, x, y);
  ctx.restore();
}
function drawHUD(now) {
  const r = Math.min(canvas.width, canvas.height) * 0.09, cx = r + 30, cy = canvas.height - r - 30;
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = 'rgba(60,70,60,0.8)'; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = '#111'; ctx.stroke(); ctx.clip();
  ctx.fillStyle = 'rgba(200,200,190,0.7)';
  for (let i = -3; i <= 3; i++) { ctx.fillRect(cx + i * r * 0.35 - 3, cy - r, 6, r * 2); ctx.fillRect(cx - r, cy + i * r * 0.35 - 3, r * 2, 6); }
  ctx.restore();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(now / 300) * 0.8);
  ctx.fillStyle = '#F4E9D8'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(-7, 8); ctx.fill(); ctx.restore();
  const money = '$' + String(Math.floor(score)).padStart(8, '0');
  chunky(money, canvas.width - 28, 58, 44, '#3E8E3A', 'right');
  chunky('RESPECT ' + String(respect).padStart(4, '0'), canvas.width - 28, 96, 22, '#E8B04B', 'right');
  ctx.fillStyle = '#000'; ctx.fillRect(canvas.width - 236, 108, 206, 16);
  ctx.fillStyle = '#B4191D'; ctx.fillRect(canvas.width - 233, 111, 200 * (3 - misses) / 3, 10);
  const elapsed = state === 'ride' ? Math.max(0, (now - startTime) / 1000) : 0;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(Math.floor(elapsed % 60)).padStart(2, '0');
  chunky(mm + ':' + ss, canvas.width - 28, 148, 28, '#F4E9D8', 'right');
  // chaos stars — fill as intensity rises (original, not a wanted-level copy)
  const chaos = Math.min((level + misses * 3) / 12, 1);
  const filled = Math.round(chaos * 5);
  const starY = 28, starX0 = canvas.width / 2 - 70;
  for (let i = 0; i < 5; i++) {
    const x = starX0 + i * 32, on = i < filled;
    ctx.save(); ctx.translate(x, starY);
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + k * Math.PI * 2 / 5;
      const r1 = 11, r2 = 5;
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a + Math.PI / 5) * r2, Math.sin(a + Math.PI / 5) * r2);
    }
    ctx.closePath();
    ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.stroke();
    ctx.fillStyle = on ? '#E8B04B' : 'rgba(20,16,12,0.85)'; ctx.fill();
    ctx.restore();
  }
}
function drawPassSplash(now) {
  if (!passPop) return;
  const t = (now - passPop.born) / 1600;
  if (t >= 1) { passPop = null; return; }
  const a = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1;
  const sc = 0.85 + Math.min(t * 2, 1) * 0.2;
  ctx.save(); ctx.globalAlpha = a;
  ctx.translate(canvas.width / 2, canvas.height * 0.28);
  ctx.scale(sc, sc);
  chunky('SONG PASSED', 0, 0, 64, '#F4E9D8', 'center');
  chunky('RESPECT +' + (passPop.bonus || 50), 0, 56, 36, '#E8B04B', 'center');
  ctx.restore();
}
function drawRadioPop(now) {
  if (!radioPop) return;
  const t = (now - radioPop.born) / 2800;
  if (t >= 1) { radioPop = null; return; }
  const a = t < 0.12 ? t / 0.12 : t > 0.75 ? (1 - t) / 0.25 : 1;
  const x = 28, y = 28, w = Math.min(420, canvas.width * 0.46), h = 64;
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(10,8,6,0.82)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#E8B04B'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
  ctx.textAlign = 'left';
  ctx.font = '700 12px Impact, "Arial Black", sans-serif';
  ctx.fillStyle = '#E8B04B'; ctx.fillText('RADIO', x + 14, y + 20);
  chunky(radioPop.title, x + 14, y + 50, 26, '#F4E9D8', 'left');
  ctx.restore();
}
function drawBuckedSplash(now) {
  return; // pop-up removed (presentation only)
  if (state !== 'bucked' || !buckedAt) return;
  const t = (now - buckedAt) / 1800;
  const a = t < 1 ? (t < 0.12 ? t / 0.12 : t > 0.7 ? (1 - t) / 0.3 : 1) : 0;
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  ctx.translate(canvas.width / 2, canvas.height * 0.32);
  const sc = 0.9 + Math.min(t * 1.5, 1) * 0.25;
  ctx.scale(sc, sc);
  chunky('BUCKED', 0, 0, 96, '#B4191D', 'center');
  ctx.restore();
}
let trailerStart = null;
// game state: which screen we're on, plus the ride numbers
let state = 'trailer', score = 0, misses = 0, level = 1;
let titleCreditsOpen = false;
let prompt = null;          // { keys, typed, deadline, total, songTitle }
let nextPromptAt = 0, startTime = 0, shake = 0;
let lastSongPrompt = false, nextJunkAt = 0, goldFlash = 0, splats = [];
let respect = 0, passPop = null, radioPop = null, buckedAt = 0;
let songQueue = [];
function nextSong() {
  if (!songQueue.length) {
    songQueue = SONGS.slice();
    for (let i = songQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = songQueue[i]; songQueue[i] = songQueue[j]; songQueue[j] = t;
    }
  }
  return songQueue.shift();
}
const SONGS = [
  { title: 'Buck Up', display: 'BUCK UP' },
  { title: 'Shred', display: 'SHRED' },
  { title: 'Taste', display: 'TASTE' },
  { title: 'Lick', display: 'LICK' },
  { title: 'Gap-Tooth Bitch', display: 'GAP-TOOTH B*TCH' },
  { title: 'Get On Your Face', display: 'GET ON YOUR FACE' },
  { title: 'Post-Concert', display: 'POST-CONCERT' },
  { title: 'Not a Fucking Loser', display: 'NOT A F*CKING LOSER' },
  { title: 'Chase Dillon', display: 'CHASE DILLON' },
  { title: 'Alba Rari', display: 'ALBA RARI' },
  { title: 'Hothead', display: 'HOTHEAD' },
  { title: 'Bitter Blonde', display: 'BITTER BLONDE' },
  { title: 'Bottle Blonde', display: 'BOTTLE BLONDE' },
  { title: 'Buckle Belt', display: 'BUCKLE BELT' },
  { title: 'Blood Clot', display: 'BLOOD CLOT' },
];

// start (or restart) a ride
function startRide(now) {
  state = 'ride'; yawAcc = 0; lastNow = 0; cracks = []; score = 0; misses = 0; level = 1; prompt = null;
  startTime = now; nextPromptAt = now + 2000;
  lastSongPrompt = false; nextJunkAt = now + 1600; goldFlash = 0; splats = [];
  respect = 0; passPop = null; radioPop = null; buckedAt = 0;
  if (window.scene3d && scene3d.clearJunk) scene3d.clearJunk();
}

// make a new key prompt; longer sequences and less time as level rises.
// from level 2, about 1 in 4 prompts is a song title (never back to back).
function newPrompt(now) {
  let song = null;
  if (level >= 2 && !lastSongPrompt) { // alternate: random letters, then a song title
    song = nextSong();
  }
  lastSongPrompt = !!song;
  let keys;
  if (song) keys = song.title.toUpperCase().replace(/[^A-Z]/g, '');
  else {
    const len = Math.min(1 + Math.floor((level - 1) / 2), 5);
    keys = '';
    for (let i = 0; i < len; i++) keys += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  const time = Math.max(2200 - level * 150, 900) + keys.length * 350;
  prompt = { keys, typed: 0, deadline: now + time, total: time, songTitle: song ? song.display : null };
  if (song) radioPop = { born: now, title: song.display };
}

let cracks = [];
// draw a starburst crack at a random spot
function addCrack() {
  const x = Math.random() * canvas.width, y = Math.random() * canvas.height;
  for (let r = 0; r < 9; r++) {
    let a = Math.random() * 6.28, px = x, py = y; const line = [x, y];
    for (let s = 0; s < 6; s++) { a += (Math.random() - 0.5) * 0.8; px += Math.cos(a) * 40; py += Math.sin(a) * 40; line.push(px, py); }
    cracks.push(line);
  }
}
function addSplat(kind, now) {
  splats.push({ kind, x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.35, y: canvas.height / 2 + (Math.random() - 0.5) * canvas.height * 0.3, born: now, life: 380 });
}
function drawSplats(now) {
  for (const s of splats) {
    const a = 1 - (now - s.born) / s.life;
    if (a <= 0) continue;
    const glass = s.kind === 'beer' || s.kind === 'whiskey';
    ctx.fillStyle = glass ? `rgba(190,230,170,${0.32 * a})` : s.kind === 'cig' ? `rgba(255,120,40,${0.28 * a})` : `rgba(255,245,220,${0.28 * a})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.globalAlpha = Math.max(0, a);
    if (glass) {
      ctx.strokeStyle = 'rgba(210,255,200,0.9)'; ctx.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + a, len = 20 + (1 - a) * 70;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len); ctx.stroke();
      }
    } else {
      ctx.fillStyle = 'rgba(244,233,216,0.85)';
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2, r = (i % 2 ? 28 : 54) * (1.4 - a);
        if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
        else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  splats = splats.filter(s => now - s.born < s.life);
}
function miss(now) {
  misses++; addCrack(); shake = 40; prompt = null; nextPromptAt = now + 1500;
  addSplat('smash', now);
  if (window.scene3d && scene3d.forceSmash) scene3d.forceSmash();
  if (window.scene3d && scene3d.crowdReact) scene3d.crowdReact('fall');
  if (misses >= 3) { state = 'bucked'; buckedAt = now; if (window.scene3d && scene3d.clearJunk) scene3d.clearJunk(); }
}

// keyboard input
addEventListener('keydown', e => {
  const now = performance.now();
  if (state === 'trailer') { state = 'title'; return; }
  if (state === 'title' && (e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey) {
    titleCreditsOpen = !titleCreditsOpen;
    if (e.preventDefault) e.preventDefault();
    return;
  }
  if (state !== 'ride') { startRide(now); return; }
  if (!prompt) return;
  const k = e.key.toUpperCase();
  if (k === prompt.keys[prompt.typed]) {
    prompt.typed++;
    if (prompt.typed === prompt.keys.length) {
      score += 100 * prompt.keys.length;
      if (prompt.songTitle) {
        score += 500; goldFlash = 1; respect += 50;
        passPop = { born: now, title: prompt.songTitle, bonus: 50 };
        if (window.scene3d && scene3d.crowdReact) scene3d.crowdReact('song');
      }
      level++; prompt = null;
      nextPromptAt = now + Math.max(2500 - level * 120, 1000);
    }
  } else if (/^[A-Z]$/.test(k) && (prompt.songTitle || LETTERS.includes(k))) miss(now);
});

// draw the fake first-person bar view, swaying harder with level
function drawRide(now) {
  const t = (now - startTime) / 1000;
  const slow = prompt ? 0.25 : 1;           // slow-mo while a prompt is up
  const power = 1 + level * 0.25;
  const sway = Math.sin(t * 3 * power * slow) * 0.08 * power + Math.sin(t * 7.3) * 0.02 * power;
  const bob = Math.abs(Math.sin(t * 6 * power * slow)) * 0.13 * power;
  const sh = shake; shake *= 0.9;
  const spin = Math.sin(t * 0.6 * power) + Math.sin(t * 1.7) * 0.4 * power;
  const intensity = Math.min((level + misses * 3) / 12, 1);
  if (window.scene3d) {
    const dt = Math.min((now - (lastNow || now)) / 1000, 0.05); lastNow = now;
    const dir = Math.sin(t * 0.7 + Math.sin(t * 0.31) * 3) > 0 ? 1 : -1;
    yawAcc += dt * dir * (0.7 + level * 0.2) * slow;
    const pitch = Math.sin(t * 5 * power * slow) * 0.07 * power;
    scene3d.ride(now / 1000, yawAcc + spin * 0.4, pitch, bob, level, { sway: sway, shake: sh, intensity: intensity, roll: sway * 1.15 });
    draw3d(0, 0, canvas.width, canvas.height);
  } else if (rideBg.complete) {
    const h = Math.max(canvas.height, canvas.width * 9 / 16), w = h * 16 / 9;
    ctx.drawImage(rideBg, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }
  if (Math.sin(now / (220 - Math.min(level * 10, 150))) > 0.7 - level * 0.04) {
    ctx.fillStyle = Math.sin(now / 90) > 0 ? 'rgba(255,63,164,0.12)' : 'rgba(25,211,197,0.12)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // cracked screen: more cracks per miss
  ctx.strokeStyle = 'rgba(244,233,216,0.85)'; ctx.lineWidth = 2;
  for (const c of cracks) { ctx.beginPath(); ctx.moveTo(c[0], c[1]); for (let i = 2; i < c.length; i += 2) ctx.lineTo(c[i], c[i + 1]); ctx.stroke(); }
  // damage tint gets redder with misses
  ctx.fillStyle = `rgba(200,16,46,${misses * 0.15})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (window.scene3d && scene3d.spawnJunk) {
    if (now > nextJunkAt) {
      scene3d.spawnJunk(1 + level * 0.18 + misses * 0.35, misses);
      nextJunkAt = now + Math.max(350, 1800 - level * 120 - misses * 280);
    }
    for (const h of scene3d.consumeHits()) { shake = Math.max(shake, 18); addSplat(h.kind, now); }
  }
  drawSplats(now);
}

function drawPrompt(now) {
  if (!prompt) return;
  const left = prompt.deadline - now;
  if (left <= 0) { miss(now); return; }
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const n = prompt.keys.length, maxW = canvas.width * 0.88;
  let per = n, badge = 90, rows = 1;
  while (rows < 4) {
    per = Math.ceil(n / rows);
    badge = Math.min(90, (maxW - Math.max(0, per - 1) * 8) / per);
    if (badge >= 52 || rows === 3) break;
    rows++;
  }
  badge = Math.max(36, badge);
  rows = Math.ceil(n / per);
  const bw = badge * 0.86, bh = badge * 0.95, rowH = bh + 12;
  const startY = cy - (rows * rowH) / 2 + bh / 2 - (prompt.songTitle ? 18 : 0);
  if (prompt.songTitle) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const cap = prompt.songTitle;
    const capSize = Math.min(42, canvas.width / 22);
    ctx.font = `900 ${capSize}px Impact, "Arial Black", sans-serif`;
    ctx.lineWidth = 6; ctx.strokeStyle = '#000';
    ctx.strokeText(cap, cx, startY - bh / 2 - capSize * 0.95);
    ctx.fillStyle = '#E8B04B'; ctx.fillText(cap, cx, startY - bh / 2 - capSize * 0.95);
    ctx.restore();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.max(18, badge * 0.7)}px "Arial Black", Impact, sans-serif`;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / per), col = i % per;
    const colsThis = row === rows - 1 ? n - row * per : per;
    const x = cx - (colsThis * badge) / 2 + badge / 2 + col * badge;
    const y = startY + row * rowH;
    ctx.fillStyle = i < prompt.typed ? '#3E8E3A' : 'rgba(10,10,10,0.85)';
    ctx.beginPath(); ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, Math.max(6, badge * 0.15)); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#F4E9D8'; ctx.stroke();
    ctx.fillStyle = '#F4E9D8'; ctx.fillText(prompt.keys[i], x, y + 2);
  }
  const barW = Math.min(maxW, Math.max(n * 40, 200));
  const barY = startY + rows * rowH - rowH / 2 + bh / 2 + 12;
  ctx.fillStyle = '#E8B04B';
  ctx.fillRect(cx - barW / 2, barY, barW * (left / prompt.total), 10);
}

function drawText(big, small, color) {
  ctx.textAlign = 'center'; ctx.fillStyle = color;
  ctx.font = `900 ${Math.min(canvas.width / 10, 110)}px Impact, sans-serif`;
  ctx.fillText(big, canvas.width / 2, canvas.height / 2);
  ctx.font = '24px sans-serif'; ctx.fillStyle = '#F4E9D8';
  ctx.fillText(small, canvas.width / 2, canvas.height / 2 + 60);
}

// the game loop: redraws the screen about 60 times a second
function loop(now) {
  try {
  const lost = window.scene3d && scene3d.isLost && scene3d.isLost();
  if (lost && hasLastFrame) holdFrame();
  else { ctx.fillStyle = '#D68542'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  if (window.scene3d && scene3d.setMood) scene3d.setMood(state === 'bucked' ? 'fail' : state === 'ride' ? 'ride' : 'cinematic');
  const blink = Math.floor(now / 500) % 2 === 0;
  if (state === 'trailer') {
    if (trailerStart === null) trailerStart = now;
    const e = Math.max(0, now - trailerStart), i = Math.floor(e / SLIDE_MS);
    if (i >= SLIDES.length || !SLIDES[i]) state = 'title';
    else {
      const p = (e % SLIDE_MS) / SLIDE_MS, s = SLIDES[i];
      // 3D stays fully opaque — fading it used to flash the canvas fill (was navy blue)
      const z = 1.05 + p * 0.12, h = Math.max(canvas.height, canvas.width * 9 / 16) * z, w = h * 16 / 9;
      if (!(window.scene3d && typeof scene3d.shot === 'function') && s.pic && s.pic.complete && s.pic.naturalWidth) {
        drawDepth(s.pic, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h, (i % 2 ? -1 : 1) * (p - 0.5) * 120, p);
      } else if (window.scene3d && typeof scene3d.shot === 'function') {
        scene3d.shot(i, p, now / 1000); draw3d(0, 0, canvas.width, canvas.height);
      }
      // letterbox bars + caption (caption alone may fade)
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height * 0.1); ctx.fillRect(0, canvas.height * 0.9, canvas.width, canvas.height * 0.1);
      grade(0.35);
      ctx.globalAlpha = Math.min(1, p * 4, (1 - p) * 4);
      drawNeon(s.text, canvas.width / 2, canvas.height * 0.83, Math.min(canvas.width / 22, 54));
      ctx.globalAlpha = 1;
      ctx.textAlign = 'right'; ctx.font = '16px sans-serif'; ctx.fillStyle = '#F4E9D8'; ctx.fillText('press any key to skip', canvas.width - 18, canvas.height * 0.96); ctx.textAlign = 'left';
    }
  } else if (state === 'title') {
    if (window.scene3d) { scene3d.idle(now / 1000); draw3d(0, 0, canvas.width, canvas.height); }
    else if (rideBg.complete) { const h = Math.max(canvas.height, canvas.width * 9 / 16), w = h * 16 / 9; ctx.filter = 'blur(4px) brightness(0.55)'; ctx.drawImage(rideBg, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h); ctx.filter = 'none'; }
    grade(0.22);
    drawTitle('BUCK UP', canvas.width / 2, canvas.height * 0.45, Math.min(canvas.width / 10, 120));
    if (blink) drawNeon('press any key', canvas.width / 2, canvas.height * 0.62, 28);
    drawTitleCredits();
  } else if (state === 'ride') {
    if (!prompt && now > nextPromptAt) newPrompt(now);
    score += 0.2;
    drawRide(now);
    if (goldFlash > 0) {
      ctx.fillStyle = `rgba(230,190,50,${0.4 * Math.min(goldFlash, 1)})`;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      goldFlash = Math.max(0, goldFlash - 0.045);
    }
    drawPrompt(now);
    drawPassSplash(now); drawRadioPop(now);
    grade(0.3); drawHUD(now);
  } else {
    if (window.scene3d) { scene3d.idle(now / 1000); ctx.save(); ctx.translate(canvas.width/2, canvas.height/2); ctx.rotate(0.25); ctx.filter = 'blur(5px) grayscale(0.6) brightness(0.6)'; draw3d(-canvas.width*0.7, -canvas.height*0.7, canvas.width*1.4, canvas.height*1.4); ctx.restore(); ctx.filter = 'none'; }
    else if (rideBg.complete) { const h = Math.max(canvas.height, canvas.width * 9 / 16) * 1.3, w = h * 16 / 9; ctx.save(); ctx.translate(canvas.width/2, canvas.height/2); ctx.rotate(0.25); ctx.filter = 'blur(6px) grayscale(0.6) brightness(0.6)'; ctx.drawImage(rideBg, -w/2, -h/2, w, h); ctx.restore(); ctx.filter = 'none'; }
    grade(0.3);
    drawBuckedSplash(now);
    drawLoseTitle();
    ctx.textAlign = 'center'; ctx.font = '900 30px Impact, sans-serif'; ctx.fillStyle = '#3E8E3A'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
    const m = '$' + String(Math.floor(score)).padStart(8, '0'); ctx.strokeText(m, canvas.width/2, canvas.height*0.6); ctx.fillText(m, canvas.width/2, canvas.height*0.6);
    if (blink) drawNeon('press any key to try again', canvas.width / 2, canvas.height * 0.72, 26);
  }
  ps2(state === 'ride' ? Math.min((level + misses * 3) / 12, 1) : 0.15, now);
  keepFrame();
  } catch (err) {
    console.error('BUCK frame', err && (err.stack || err));
    try { holdFrame(); } catch (e2) {}
  }
  requestAnimationFrame(loop);
}
window.BUCK = {
  get state() { return state; },
  go(s) {
    const now = performance.now();
    if (s === 'title') { state = 'title'; }
    else if (s === 'trailer') { state = 'trailer'; trailerStart = now; }
    else if (s === 'ride') startRide(now);
    else if (s === 'rideHard' || s === 'rideHigh') { startRide(now); level = 8; misses = 2; shake = 32; }
    else if (s === 'bull') { state = 'trailer'; trailerStart = now - SLIDE_MS * 2 - 1200; }
    else if (s === 'tonight' || s === 'she') { state = 'trailer'; trailerStart = now - SLIDE_MS * 3 - 1200; }
    else if (s === 'people') { state = 'title'; if (window.scene3d && scene3d.peopleClose) scene3d.peopleClose(); }
    else if (s === 'bucked' || s === 'lose') { state = 'bucked'; }
  }
};
requestAnimationFrame(loop);
