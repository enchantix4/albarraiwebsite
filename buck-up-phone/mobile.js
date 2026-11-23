/* BUCK UP mobile mode (phones). Desktop keyboard play is untouched: this file only activates on touch phones
   (or with ?mobile=1). It reads the game's current prompt, shows a big arrow for the next letter, and turns a
   held lean of the phone (or a tap on an arrow pad) into the SAME key press the keyboard version expects.
   Letter -> direction is fixed: A=left, B=up(away), C=right, D=down(toward you), E=left, ... (charCode mod 4). */
(function () {
  const url = new URLSearchParams(location.search);
  const isPhone = /iPhone|iPod|Android.+Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) < 700) || url.get('mobile') === '1';
  if (!isPhone) return;
  window.__buckLite = true; document.documentElement.classList.add('buck-mobile');
  const DIRS = ['left', 'up', 'right', 'down'], ARROW = { left: '\u2190', up: '\u2191', right: '\u2192', down: '\u2193' };
  const dirOf = function (ch) { return DIRS[(String(ch).toUpperCase().charCodeAt(0) || 0) % 4]; };
  const css = document.createElement('style'); css.textContent = `
  html.buck-mobile,html.buck-mobile body{overscroll-behavior:none;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
  #bm{position:fixed;inset:0;pointer-events:none;z-index:100000;font-family:Anton,Impact,sans-serif;color:#fff}
  #bm .ring{position:absolute;left:max(3vw,env(safe-area-inset-left));top:50%;transform:translateY(-50%);width:34vmin;height:34vmin;border-radius:50%;background:rgba(10,4,12,.55);border:.8vmin solid #ffd23a;box-shadow:0 0 4vmin #ff3d8b;display:none;text-align:center}
  #bm .ring b{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);font-size:14vmin;line-height:1;text-shadow:0 0 2vmin #ff3d8b}
  #bm .ring i{position:absolute;left:0;right:0;font-style:normal;font-size:11vmin;line-height:1;color:#ffd23a}
  #bm .ring .a{top:2vmin}#bm .ring .dot{position:absolute;width:5vmin;height:5vmin;border-radius:50%;background:#3aff9a;left:50%;top:50%;margin:-2.5vmin;box-shadow:0 0 2vmin #3aff9a}
  #bm .prog{position:absolute;left:0;right:0;bottom:max(3vh,env(safe-area-inset-bottom));text-align:center;font-size:9vmin;letter-spacing:1.2vmin;text-shadow:0 0 2vmin #000,0 0 1vmin #000}
  #bm .prog span{opacity:.35}#bm .prog span.on{opacity:1;color:#ffd23a}
  #bm .pads{position:absolute;right:max(3vw,env(safe-area-inset-right));top:50%;transform:translateY(-50%);width:34vmin;height:34vmin;display:none}
  #bm .pads button{position:absolute;width:11vmin;height:11vmin;border-radius:50%;border:.6vmin solid #ffd23a;background:rgba(10,4,12,.6);color:#fff;font-size:7vmin;pointer-events:auto;padding:0}
  #bm .gate{position:fixed;inset:0;background:rgba(8,3,10,.88);display:none;align-items:center;justify-content:center;flex-direction:column;text-align:center;pointer-events:auto;padding:4vmin;font-size:6vmin;line-height:1.25}
  #bm .gate small{font-size:3.6vmin;opacity:.8;font-family:sans-serif;margin-top:2vmin}
  #bm .gate button{margin-top:4vmin;font:inherit;font-size:6vmin;padding:1.5vmin 6vmin;background:#ffd23a;border:0;border-radius:3vmin;color:#1a0a10}
  #bm .rot{position:fixed;inset:0;background:#080308;display:none;align-items:center;justify-content:center;font-size:7vmin;text-align:center;pointer-events:auto}
  @media (orientation:portrait){#bm .rot{display:flex}}`;
  document.head.appendChild(css);
  const root = document.createElement('div'); root.id = 'bm';
  root.innerHTML = '<div class="ring"><i class="a"></i><b></b><span class="dot"></span></div><div class="prog"></div><div class="pads"></div><div class="gate"></div><div class="rot">ROTATE YOUR PHONE<br>SIDEWAYS \u21bb</div>';
  document.body.appendChild(root);
  const $ = function (s) { return root.querySelector(s); }, ring = $('.ring'), ringA = $('.ring .a'), ringB = $('.ring b'), dot = $('.ring .dot'), prog = $('.prog'), pads = $('.pads'), gate = $('.gate');
  DIRS.forEach(function (d) { const b = document.createElement('button'); b.textContent = ARROW[d]; b.dataset.d = d; const p = { left: 'left:0;top:50%;margin-top:-5.5vmin', right: 'right:0;top:50%;margin-top:-5.5vmin', up: 'top:0;left:50%;margin-left:-5.5vmin', down: 'bottom:0;left:50%;margin-left:-5.5vmin' }[d]; b.style.cssText = p;
    b.addEventListener('touchstart', function (e) { e.preventDefault(); lean(d, true); }, { passive: false }); pads.appendChild(b); });
  const errEl = document.createElement('div'); errEl.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:100001;background:#b00020;color:#fff;font:11px/1.3 monospace;padding:4px 6px;display:none;pointer-events:none;word-break:break-all'; root.appendChild(errEl);
  const showErr = function (t) { errEl.style.display = 'block'; errEl.textContent = 'ERR: ' + String(t).slice(0, 220); };
  window.addEventListener('error', function (e) { showErr((e.message || '') + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno); });
  window.addEventListener('unhandledrejection', function (e) { showErr(e.reason && (e.reason.message || e.reason)); });
  const press = function (ch) { try { window.dispatchEvent(new KeyboardEvent('keydown', { key: ch })); } catch (e) { } };
  const st = function () { try { return state; } catch (e) { return ''; } };
  const pr = function () { try { return prompt; } catch (e) { return null; } };

  // ---- sensors + calibration (axis-agnostic: learns which way "right" and "forward" are from the phone itself) ----
  let RM = 3, FM = 3, g = [0, 0, 0], g0 = null, R = null, F = null, mode = 'gate', motionSeen = 0, useTap = false;
  const sub = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }, dot3 = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }, len = function (a) { return Math.hypot(a[0], a[1], a[2]); };
  const norm = function (a) { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  window.addEventListener('devicemotion', function (e) { const a = e.accelerationIncludingGravity; if (!a || a.x == null) return; g = [a.x, a.y, a.z]; motionSeen = performance.now(); });
  const gateShow = function (html) { gate.innerHTML = html; gate.style.display = 'flex'; }, gateHide = function () { gate.style.display = 'none'; };
  const askPermission = function () {
    const go = function () { calibrate(); };
    try { if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') { DeviceMotionEvent.requestPermission().then(function (r) { if (r === 'granted') go(); else { useTap = true; mode = 'play'; gateHide(); } }).catch(function () { useTap = true; mode = 'play'; gateHide(); }); return; } } catch (e) { }
    go();
  };
  const fallbackTap = function () { useTap = true; mode = 'play'; gateHide(); };
  const stepNeutral = function (cb) {
    gateShow('<div>HOLD YOUR PHONE HOW YOU LIKE<br>KEEP IT STEADY</div><small>hold it still for 2 seconds</small>');
    const t0 = performance.now(); let acc = [0, 0, 0], n = 0;
    const iv = setInterval(function () { const t = performance.now() - t0;
      if (t > 600 && t < 2000) { acc = [acc[0] + g[0], acc[1] + g[1], acc[2] + g[2]]; n++; }
      if (t >= 2000) { clearInterval(iv); cb(!motionSeen || !n ? null : [acc[0] / n, acc[1] / n, acc[2] / n]); } }, 40);
  };
  const stepLean = function (txt, g0, strip, cb) {
    gateShow('<div>' + txt + '</div><small>lean it and hold it there</small>');
    const t0 = performance.now(); let since = 0, acc = [0, 0, 0], n = 0;
    const iv = setInterval(function () { const now = performance.now(); let d = sub(g, g0); if (strip) { const k = dot3(d, strip); d = [d[0] - k * strip[0], d[1] - k * strip[1], d[2] - k * strip[2]]; }
      if (len(d) > 1.5) { if (!since) { since = now; acc = [0, 0, 0]; n = 0; } acc = [acc[0] + d[0], acc[1] + d[1], acc[2] + d[2]]; n++;
        if (now - since > 400) { clearInterval(iv); gateShow('<div>GOT IT \u2714</div>'); setTimeout(function () { cb([acc[0] / n, acc[1] / n, acc[2] / n]); }, 700); } }
      else { since = 0; }
      if (now - t0 > 7000) { clearInterval(iv); cb(null); } }, 40);
  };
  const calibrate = function () {
    stepNeutral(function (a) { if (!a) { fallbackTap(); return; } g0 = a;
      const doR = function (tries) { stepLean('NOW LEAN RIGHT \u2192' + (tries ? '<br>(a bit harder)' : ''), g0, null, function (r) {
        if (!r) { if (tries < 2) { doR(tries + 1); } else fallbackTap(); return; } RM = len(r); R = norm(r);
        const doF = function (t2) { stepLean('NOW LEAN FORWARD \u2191<br>(top edge away from you)' + (t2 ? '<br>(a bit harder)' : ''), g0, R, function (f) {
          if (!f) { if (t2 < 2) { doF(t2 + 1); } else fallbackTap(); return; } FM = len(f); F = norm(f); mode = 'play'; gateHide(); }); };
        doF(0); }); };
      doR(0); });
  };
  const start = function () {
    gateShow('<div>BUCK UP</div><div style="font-size:4.4vmin;margin-top:2vmin">Lean your phone with the bull.<br>Lean the way the arrow points.</div><button id="bmgo">TAP TO ALLOW MOTION</button><small>Safari will ask to use motion sensors. Say Allow.</small>');
    $('#bmgo').addEventListener('click', function () { askPermission(); });
  };
  // ---- one lean = one key ----
  let leanDir = null, since = 0, armed = true, hint = '';
  const lean = function (d, tapped) {
    const p = pr(); if (st() !== 'ride' || !p) return; const need = p.keys[p.typed]; if (need == null) return;
    if (d === dirOf(need)) { const before = p.typed; press(need); const q = pr(); if (q === p && q.typed > before) { q.deadline += 700; q.total += 700; } flash(); try { navigator.vibrate && navigator.vibrate(25); } catch (e) {} } else press('ASDFJKL'.replace(need, '')[0]); // wrong lean -> a real miss
    armed = false; leanDir = null;
  };
  let curDir = null;
  const flash = function () { try { ringA.style.color = '#3dff6a'; ringA.style.transform = 'scale(1.35)'; ringA.style.transition = 'transform .15s'; setTimeout(function () { ringA.style.color = ''; ringA.style.transform = ''; }, 220); } catch (e) {} };
  let lastKey = null;
  const tick = function () {
    requestAnimationFrame(tick);
    const inRide = st() === 'ride', p = inRide ? pr() : null;
    if (mode === 'play' || mode === 'gate') { /* ui below */ }
    ring.style.display = (p && mode === 'play') ? 'block' : 'none'; pads.style.display = (p && mode === 'play' && useTap) ? 'block' : 'none';
    if (p) {
      const need = p.keys[p.typed]; const key = need + ':' + p.typed + ':' + p.keys.length;
      if (key !== lastKey) { lastKey = key; ringA.textContent = ARROW[dirOf(need)]; ringB.textContent = need; armed = (curDir !== null && curDir !== dirOf(need)); leanDir = null; since = 0; }
      let h = ''; for (let i = 0; i < p.keys.length; i++) h += '<span class="' + (i < p.typed ? 'on' : '') + '">' + p.keys[i] + '</span>'; if (h !== hint) { prog.innerHTML = h; hint = h; }
      if (mode === 'play' && g0 && R && !useTap) {
        const d = sub(g, g0), x = dot3(d, R), y = F ? dot3(d, F) : 0, th = Math.max(1.2, Math.min(2.2, 0.55 * Math.min(RM, FM))), m = Math.hypot(x, y);
        dot.style.transform = 'translate(' + Math.max(-1, Math.min(1, x / 5)) * 11 + 'vmin,' + -Math.max(-1, Math.min(1, y / 5)) * 11 + 'vmin)';
        curDir = m > th * 0.8 ? (Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'up' : 'down')) : null;
        if (m < th * 0.8) { armed = true; leanDir = null; since = 0; }
        else if (armed && m > th) { const dd = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'up' : 'down'); const now = performance.now();
          if (dd !== leanDir) { leanDir = dd; since = now; } else if (now - since > (dd === dirOf(need) ? 70 : 520)) lean(dd); }
      }
    } else { prog.innerHTML = ''; hint = ''; lastKey = null; armed = false; }
    if (!inRide && st() && mode === 'play') { /* title / bucked: a tap restarts */ }
  };
  window.addEventListener('touchstart', function (e) { if (mode !== 'play') return; if (st() !== 'ride' && st() !== 'trailer') { press('Enter'); } }, { passive: true });
  start(); tick();
  window.__buckMobile = { lean: lean, calib: function () { return { g0: g0, R: R, F: F, useTap: useTap, mode: mode }; } };
})();
