// BUCK UP 3D saloon: low-poly PS2-style room used by the trailer, title and ride.
// Needs three.js r147 (free, MIT) as a classic script, plus optional GLTFLoader / postprocessing.
(function () {
  // antialias off: EffectComposer does not use the default MSAA buffer, which just eats VRAM
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
  if (THREE.LinearToneMapping) renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1.0;
  if ('physicallyCorrectLights' in renderer) renderer.physicallyCorrectLights = false;
  renderer.shadowMap.enabled = false;
  // clean SA daylight: blue sky, only a touch of warm haze — no mustard wash
  const SKY = 0xE89B5A;
  const HAZE = 0xE89B5A;
  const scene = new THREE.Scene(); window.__dbgScene = scene;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.FogExp2(0xE89B5A, 0.026); // thicker dusk haze so the far room and the highway melt into orange
  renderer.setClearColor(SKY, 1);
  renderer.shadowMap.enabled = false;
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 60); window.__dbgCam = camera;
  camera.rotation.order = 'YXZ';
  let composer = null, bloomPass = null, gradePass = null, filmPass = null, vignettePass = null;
  let glLost = false, gpuTier = 0, restoreTimer = 0, lostCount = 0, restoreCount = 0;
  window.BUCK_GL = { lost: false, lostCount: 0, restoreCount: 0 };
  function viewSize() {
    const pr = Math.min((typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1, 1.75);
    const w = Math.max(1, innerWidth);
    const h = Math.max(1, innerHeight);
    return { w: w, h: h, pr: pr };
  }
  function size() {
    const v = viewSize();
    renderer.setPixelRatio(v.pr);
    renderer.setSize(v.w, v.h, true);
    camera.aspect = v.w / v.h; camera.updateProjectionMatrix();
    if (composer) {
      if (composer.setPixelRatio) composer.setPixelRatio(v.pr);
      composer.setSize(v.w, v.h);
      if (bloomPass && bloomPass.resolution) bloomPass.resolution.set(v.w * v.pr, v.h * v.pr);
      if (typeof sleekPass !== 'undefined' && sleekPass) sleekPass.uniforms.res.value.set(v.w * v.pr, v.h * v.pr);
    }
  }
  function disposeComposer() {
    // when the context is already lost, GPU objects are invalid — just drop JS refs
    if (composer && !glLost) {
      try {
        if (composer.renderTarget1) composer.renderTarget1.dispose();
        if (composer.renderTarget2) composer.renderTarget2.dispose();
        if (bloomPass) {
          (bloomPass.renderTargetsHorizontal || []).forEach(function (t) { if (t && t.dispose) t.dispose(); });
          (bloomPass.renderTargetsVertical || []).forEach(function (t) { if (t && t.dispose) t.dispose(); });
          if (bloomPass.renderTargetBright && bloomPass.renderTargetBright.dispose) bloomPass.renderTargetBright.dispose();
        }
      } catch (e) {}
    }
    composer = null;
    bloomPass = gradePass = filmPass = vignettePass = warpPass = null;
  }
  function refreshGpuResources() {
    scene.traverse(function (o) {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      mats.forEach(function (m) {
        if (!m) return;
        ['map', 'emissiveMap', 'alphaMap', 'lightMap', 'normalMap'].forEach(function (k) {
          if (m[k]) m[k].needsUpdate = true;
        });
        m.needsUpdate = true;
      });
      if (o.geometry) o.geometry.elementsNeedUpdate = true;
    });
  }
  size(); addEventListener('resize', size);
  renderer.domElement.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    glLost = true;
    lostCount++;
    window.BUCK_GL.lost = true; window.BUCK_GL.lostCount = lostCount;
    console.error('BUCK webglcontextlost', lostCount);
    disposeComposer();
    if (restoreTimer) clearTimeout(restoreTimer);
    restoreTimer = setTimeout(function () {
      if (!glLost) return;
      try {
        const gl = renderer.getContext();
        const ext = gl && gl.getExtension('WEBGL_lose_context');
        if (ext) ext.restoreContext();
      } catch (err) { console.error('BUCK restore retry', err && (err.stack || err)); }
    }, 700);
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', function () {
    console.warn('BUCK webglcontextrestored');
    glLost = false;
    restoreCount++;
    window.BUCK_GL.lost = false; window.BUCK_GL.restoreCount = restoreCount;
    gpuTier = Math.min(2, gpuTier + 1);
    try {
      if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
      if (THREE.LinearToneMapping) renderer.toneMapping = THREE.LinearToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setClearColor(HAZE, 1);
      size();
      setupComposer();
      refreshGpuResources();
    } catch (err) { console.error('BUCK restore', err && (err.stack || err)); }
  }, false);

  const mats = {};
  const SNAP = { value: 256 }; // subtle framebuffer snap, no PS1 wobble
  function hookSnap(m) {
    if (!m || m.userData.ps2snap) return m;
    m.userData.ps2snap = true;
    if (window.PS2Shader && PS2Shader.applyPSXMaterial) {
      return PS2Shader.applyPSXMaterial(m, { snap: true, affine: 0 });
    }
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = function (shader) {
      if (typeof prev === 'function') prev(shader);
      shader.uniforms.uSnap = SNAP;
      shader.vertexShader = 'uniform float uSnap;\n' + shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n\tgl_Position.xy = floor((gl_Position.xy / gl_Position.w) * uSnap) / uSnap * gl_Position.w;'
      );
    };
    m.customProgramCacheKey = function () { return (prev && prev.customProgramCacheKey ? prev.customProgramCacheKey() : '') + 'ps2snap'; };
    m.needsUpdate = true;
    return m;
  }
  const mat = function (c) {
    if (mats['s' + c]) return mats['s' + c];
    const map = (window.PS2 && PS2.gritTint) ? PS2.gritTint(c) : null;
    const m = hookSnap(new THREE.MeshLambertMaterial({ color: map ? 0xffffff : c, map: map, side: THREE.DoubleSide }));
    m.userData.ps2 = true;
    return (mats['s' + c] = m);
  };
  const glow = function (c) {
    const map = (window.PS2 && PS2.gritTint) ? PS2.gritTint(c) : null;
    return hookSnap(new THREE.MeshLambertMaterial({
      color: map ? 0xffffff : c,
      map: map,
      emissive: new THREE.Color(c),
      emissiveIntensity: 1.2,
      side: THREE.DoubleSide
    }));
  };
  function box(w, h, d, m, x, y, z, parent) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.receiveShadow = false;
    b.castShadow = false;
    (parent || scene).add(b); return b;
  }
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const maxAniso = (renderer.capabilities && renderer.capabilities.getMaxAnisotropy) ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  function makeTex(key, rx, ry, adj) {
    const t = new THREE.Texture();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx || 1, ry || 1);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.anisotropy = 1;
    if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    if (adj) { t.userData.gain = adj.gain; t.userData.lift = adj.lift; t.userData.contrast = adj.contrast; }
    const src = window.BUCK_MODELS && BUCK_MODELS[key];
    if (src) {
      const img = new Image();
      img.onload = function () {
        const gain = t.userData.gain, lift = t.userData.lift, contrast = t.userData.contrast;
        if (gain || lift || contrast) {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
          const gn = gain || 1, lf = lift || 0, ct = contrast || 1;
          for (let i = 0; i < d.length; i += 4) {
            for (let k = 0; k < 3; k++) {
              let v = d[i + k] * gn + lf;
              v = (v - 128) * ct + 128;
              d[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
            }
          }
          g.putImageData(id, 0, 0);
          t.image = c;
        } else t.image = img;
        // crunch to 128–256px, nearest, no mips (chunky SA textures, still tiled)
        (function crunch() {
          const srcImg = t.image;
          if (!srcImg || !srcImg.width) return;
          const maxD = 128;
          const sc = Math.min(1, maxD / Math.max(srcImg.width, srcImg.height, 1));
          const w = Math.max(16, Math.round(srcImg.width * sc));
          const h = Math.max(16, Math.round(srcImg.height * sc));
          if (w === srcImg.width && h === srcImg.height && srcImg.tagName === 'CANVAS') return;
          const c2 = document.createElement('canvas');
          c2.width = w; c2.height = h;
          const g2 = c2.getContext('2d');
          g2.imageSmoothingEnabled = false;
          g2.drawImage(srcImg, 0, 0, w, h);
          t.image = c2;
        })();
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        t.needsUpdate = true;
      };
      const mime = src.indexOf('iVBOR') === 0 ? 'image/png' : 'image/jpeg';
      img.src = 'data:' + mime + ';base64,' + src;
    }
    return t;
  }
  function makeTexAdj(key, rx, ry, gain, lift, contrast) {
    return makeTex(key, rx, ry, { gain: gain, lift: lift, contrast: contrast });
  }
  function texMat(key, color, rx, ry, opts) {
    const o = opts || {};
    return hookSnap(new THREE.MeshLambertMaterial({
      color: color || 0xffffff,
      map: (o.gain || o.lift || o.contrast) ? makeTexAdj(key, rx, ry, o.gain, o.lift, o.contrast) : makeTex(key, rx, ry),
      side: THREE.DoubleSide,
    }));
  }

  // Module 3: exact SA golden-hour lights (old key/fill/window/ambient/spot/points removed)
  if (window.PS2 && PS2.makeSkyDome) {
    const dome = PS2.makeSkyDome();
    scene.add(dome);
    if (PS2.skyTexture) scene.background = PS2.skyTexture;
  }
  const sun = new THREE.DirectionalLight(0xFFAE52, 1.3); // was 1.8: sun-facing walls clipped to lemon yellow instead of dusk orange
  sun.position.set(60, 20, -50);
  sun.castShadow = false;
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xEDAE7C, 0x5C3D4A, 1.05);
  // neon colour pools (GTA bar mood): magenta + teal + red + violet
  [[-7, 3.2, -5, 0xff2a9a, 1.7, 13], [7, 3.2, -5, 0x20e0d0, 1.5, 13], [0, 5.2, 1, 0xff3a30, 0.9, 11], [0, 3, 9.5, 0x9a4aff, 0.9, 10]].forEach(function (L) {
    const pl = new THREE.PointLight(L[3], L[4], L[5], 1.6); pl.position.set(L[0], L[1], L[2]); pl.name = 'neonPool'; scene.add(pl);
  });
  scene.add(hemi);
  const sunset = sun;
  const bullSpot = { intensity: 0, position: { set: function () {} }, target: { position: { set: function () {} }, updateMatrixWorld: function () {} } };
  const flick = [];
  if (window.PS2 && PS2.initBlobs) PS2.initBlobs(scene);
  const itchSlots = { bar: {}, characters: [], vehicles: [] };
  function registerItch(kind, name, obj) {
    if (!obj) return obj;
    obj.userData.itchKind = kind;
    obj.userData.itchName = name;
    if (kind === 'characters') itchSlots.characters.push(obj);
    else if (kind === 'vehicles') itchSlots.vehicles.push(obj);
    else {
      if (!itchSlots.bar[name]) itchSlots.bar[name] = [];
      itchSlots.bar[name].push(obj);
    }
    return obj;
  }
  window.BUCK_ITCH_SLOTS = itchSlots;
  window.BUCK_PS2_LIGHTS = { sun: 0xFFAE52, sunI: 1.3, sunPos: [60,20,-50], hemiSky: 0xEDAE7C, hemiGround: 0x5C3D4A, hemiI: 1.05, fog: 0xE89B5A, fogD: 0.026 };

  // visible lamp shades over the bar
  [-4, 1.2, 5.5].forEach(function (x) {
    box(0.28, 0.1, 0.28, mat(0x2a1c10), x, 3.42, -9.15);
    box(0.08, 0.25, 0.08, mat(0x3a2a18), x, 3.58, -9.15);
  });

  // the room
  function ps2Mat(key, rx, ry, color) {
    if (window.PS2 && PS2.material) return hookSnap(PS2.material(key, rx, ry, color));
    return texMat('texFloorWorn', color || 0xffffff, rx, ry);
  }
  const woodFloor = ps2Mat('diner_floor', 3, 3);
  const woodWall = ps2Mat('diner_wall', 1, 1);
  const woodDark = ps2Mat('diner_wood', 4, 2);
  const wainscotM = ps2Mat('diner_wood', 4, 1);
  const leatherM = ps2Mat('char_leather', 3, 3);
  const metalM = ps2Mat('diner_chrome', 3, 3);
  const saloon = new THREE.Group(); saloon.name = 'saloon'; scene.add(saloon);
  const floorMesh = box(24, 0.2, 24, woodFloor, 0, -0.1, 0, saloon); floorMesh.name = 'dinerFloor'; registerItch('bar', 'floor', floorMesh);
  const ceilMesh = box(24, 0.2, 24, woodDark, 0, 7, 0, saloon); ceilMesh.name = 'ceiling';
  const wallBack = box(24, 7, 0.3, woodWall, 0, 3.5, -12, saloon); wallBack.name = 'dinerWall';
  box(0.3, 7, 24, woodWall, -12, 3.5, 0, saloon);
  box(0.3, 7, 24, woodWall, 12, 3.5, 0, saloon);
  // +Z wall with a doorway so blue daylight and the Strip sign read through it
  box(10.2, 7, 0.3, woodWall, -6.9, 3.5, 12, saloon);
  box(10.2, 7, 0.3, woodWall, 6.9, 3.5, 12, saloon);
  box(3.6, 2.2, 0.3, woodWall, 0, 5.9, 12, saloon);
  // painted dusk street seen through the arched windows (generated): sky gradient, low sun, hills, palms, pole
  const __winMats = {};
  function winViewMat(skyOnly) {
    const key = skyOnly ? 's' : 'v';
    if (__winMats[key]) return __winMats[key];
    const t = canvasTex(function (g, W0, H0) {
      g.scale(4, 4); const W = 64, H = 96; // painted on a 64x96 grid, rendered at 4x so it stays smooth
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#3a2a68'); gr.addColorStop(0.3, '#a8467c'); gr.addColorStop(0.58, '#f0803a'); gr.addColorStop(0.8, '#ffb85a'); gr.addColorStop(1, '#ffd890');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      if (skyOnly) return;
      const sg = g.createRadialGradient(W * 0.3, H * 0.74, 0, W * 0.3, H * 0.74, 30);
      sg.addColorStop(0, 'rgba(255,244,190,1)'); sg.addColorStop(0.18, 'rgba(255,214,120,0.8)'); sg.addColorStop(0.5, 'rgba(255,150,70,0.28)'); sg.addColorStop(1, 'rgba(255,120,60,0)');
      g.fillStyle = sg; g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(W * 0.3, H * 0.74, 5, 0, 6.3); g.fill();
      const hg = g.createLinearGradient(0, H * 0.8, 0, H); hg.addColorStop(0, '#7a3a4a'); hg.addColorStop(1, '#3a1a2a');
      g.fillStyle = hg; g.fillRect(0, H * 0.82, W, H * 0.18);                       // far hills / roofs
      g.fillStyle = '#6a3042'; g.fillRect(8, H * 0.76, 10, H * 0.1); g.fillRect(40, H * 0.72, 14, H * 0.14);
      g.fillStyle = '#1a0c14'; g.fillRect(W * 0.7, H * 0.38, 3, H * 0.5);                     // palm trunk
      for (let k = 0; k < 6; k++) { g.save(); g.translate(W * 0.7 + 1, H * 0.38); g.rotate(-1.2 + k * 0.5); g.fillRect(0, -1, 18, 3); g.restore(); }
      g.fillRect(W * 0.12, H * 0.45, 2, H * 0.45); g.fillRect(W * 0.12 - 8, H * 0.5, 18, 2);   // telephone pole
    }, 256, 384);
    const m = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, fog: false });
    m.userData.ps2KeepMap = true; __winMats[key] = hookSnap(m); return __winMats[key];
  }
  (function skyWindows() {
    const glass = function (w, h) {
      return hookSnap(new THREE.MeshLambertMaterial({
        color: 0xF2B05E, emissive: 0xE89B54, emissiveIntensity: 1.2, transparent: true, opacity: 0.4, side: THREE.DoubleSide
      }));
    };
    const frame = (window.PS2 && PS2.material) ? hookSnap(PS2.material('diner_wood', 1, 1)) : hookSnap(new THREE.MeshLambertMaterial({ color: 0x3a2a18, side: THREE.DoubleSide }));
    function pane(x, y, z, w, h, ry) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.08), frame);
      f.name = 'windowFrame'; f.position.set(x, y, z); f.rotation.y = ry || 0; f.receiveShadow = false; saloon.add(f);
      const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass(w, h));
      g.name = 'windowGlass'; g.position.set(x, y, z + (ry ? 0 : 0.06)); g.rotation.y = ry || 0; saloon.add(g);
      // Saddle Ranch arched window: glowing glass plus an arched top, sill and mullions on the room side (visual only)
      try {
        const sgn = ry ? 1 : -1;
        const arch = new THREE.Group(); arch.name = 'archWindow';
        arch.position.set(x, y, z); arch.rotation.y = ry || 0;
        const gm = winViewMat(false), gm2 = winViewMat(true);
        const lower = new THREE.Mesh(new THREE.PlaneGeometry(w, h), gm);
        lower.name = 'windowGlass'; lower.position.z = sgn * 0.05; arch.add(lower);
        const top = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 10, 0, Math.PI), gm2);
        top.name = 'windowGlass'; top.position.set(0, h / 2, sgn * 0.05); arch.add(top);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(w / 2 + 0.04, 0.08, 5, 10, Math.PI), frame);
        ring.name = 'archTrim'; ring.position.set(0, h / 2, sgn * 0.05); arch.add(ring);
        [
          [0.07, h + w / 2, 0.05, 0, w / 4, 0.08],
          [w, 0.07, 0.05, 0, h / 2, 0.08],
          [0.1, h, 0.06, -(w / 2 + 0.04), 0, 0.07],
          [0.1, h, 0.06, w / 2 + 0.04, 0, 0.07],
          [w + 0.34, 0.1, 0.16, 0, -h / 2 - 0.05, 0.09]
        ].forEach(function (b) {
          box(b[0], b[1], b[2], frame, b[3], b[4], sgn * b[5], arch).name = 'archTrim';
        });
        saloon.add(arch);
      } catch (e) { console.error('BUCK arch window', e && (e.stack || e)); }
    }
    pane(-4.2, 4.4, 11.78, 2.2, 1.8, 0);
    pane(4.2, 4.4, 11.78, 2.2, 1.8, 0);
    pane(-11.78, 4.4, -2, 1.8, 1.6, Math.PI / 2);
    pane(11.78, 4.4, -2, 1.8, 1.6, -Math.PI / 2);
  })();
  // dark wood wainscot / dado around the room (gap at the door)
  box(24, 1.2, 0.14, wainscotM, 0, 0.6, -11.82, saloon);
  box(10.2, 1.2, 0.14, wainscotM, -6.9, 0.6, 11.82, saloon);
  box(10.2, 1.2, 0.14, wainscotM, 6.9, 0.6, 11.82, saloon);
  box(0.14, 1.2, 24, wainscotM, -11.82, 0.6, 0, saloon);
  box(0.14, 1.2, 24, wainscotM, 11.82, 0.6, 0, saloon);
  // floor litter — cigarette packs, napkins, bottle caps (original, no brands)
  (function litter() {
    const mPaper = mat(0xc8b89a);
    const mCard = mat(0x6a3a28);
    const mCap = mat(0x8a6a3a);
    const mButt = mat(0xd8c8a8);
    for (let i = 0; i < 36; i++) {
      const ang = Math.random() * 6.283, r = 3.6 + Math.random() * 7.2;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      if (z < -10.4) continue;
      const kind = Math.random();
      let m;
      if (kind < 0.25) {
        m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.015, 0.08), mCard);
      } else if (kind < 0.55) {
        m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.004, 0.1), mPaper);
      } else if (kind < 0.8) {
        m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.008, 8), mCap);
      } else {
        m = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6), mButt);
        m.rotation.z = 1.2;
      }
      m.position.set(x, 0.02, z);
      m.rotation.y = Math.random() * 6.28;
      scene.add(m);
    }
  })();
  const PLANK = ps2Mat('diner_wood', 1, 4);
  [-8, 0, 8].forEach(function (k) {
    box(0.28, 7, 0.14, PLANK, k, 3.5, -11.8, saloon);
    box(0.28, 7, 0.14, PLANK, k, 3.5, 11.8, saloon);
    box(0.14, 7, 0.28, PLANK, -11.8, 3.5, k, saloon);
    box(0.14, 7, 0.28, PLANK, 11.8, 3.5, k, saloon);
  });
  // rustic timber beams
  const beamM = ps2Mat('diner_wood', 8, 1);
  for (let k = -11; k <= 11; k += 3) box(24, 0.42, 0.55, beamM, 0, 6.72, k, saloon);
  // warm sunset through the side windows and the doorway
  [-6, 6].forEach(z => { box(0.05, 2.2, 1.8, glow(0xff7a30), -11.8, 3.6, z, saloon); box(0.05, 2.2, 1.8, glow(0xff7a30), 11.8, 3.6, z, saloon); });
  const doorGlow = box(3.2, 4.4, 0.04, glow(0xff8a3a), 0, 2.4, 11.92, saloon);
  doorGlow.name = 'doorwayGlow';
  if (doorGlow.material) { doorGlow.material.transparent = true; doorGlow.material.opacity = 0.35; doorGlow.material.depthWrite = false; }

  // exposed ducting
  const ductM = ps2Mat('diner_chrome', 2, 1);
  [[0, 6.35, 3], [5, 6.35, -2], [-4, 6.4, 1]].forEach(([x, y, z], i) => {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 10, 8), ductM);
    d.rotation.z = Math.PI / 2; if (i === 1) d.rotation.x = 0.08;
    d.position.set(x, y, z); scene.add(d);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 8), metalM);
    cap.rotation.z = Math.PI / 2; cap.position.set(x + (i - 1) * 3, y, z); scene.add(cap);
  });

  // the bar — dark stained wood, not orange planks
  const earlyBar = ps2Mat('diner_wood', 6, 1);
  const barCounter = new THREE.Group(); barCounter.name = 'counter'; saloon.add(barCounter);
  box(14.2, 1.02, 0.7, earlyBar, 0, 0.51, -9.58, barCounter);
  box(14.4, 0.08, 0.82, earlyBar, 0, 1.06, -9.52, barCounter);
  box(14.2, 1.7, 0.28, earlyBar, 0, 1.55, -11.15, barCounter);
  box(13.6, 0.06, 0.4, earlyBar, 0, 1.7, -10.85, barCounter);
  box(13.6, 0.06, 0.4, earlyBar, 0, 2.2, -10.85, barCounter);
  box(14.2, 0.06, 0.08, metalM, 0, 1.12, -9.15, barCounter);
  registerItch('bar', 'counter', barCounter);
  registerItch('bar', 'saloon', saloon);
  // bottles on the back shelves (always visible, original colours, no brands)
  (function barBottles() {
    const cols = [0x2a4a26, 0x6b3a10, 0x8a5a1c, 0x3a2210, 0xcdd6d2, 0x1f3a22, 0x7a4a14];
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < 36; i++) {
        const x = -6.6 + i * 0.37 + (s ? 0.1 : 0);
        const h = 0.28 + ((i * 3 + s) % 5) * 0.05;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.044, h, 7), mat(cols[(i + s) % cols.length]));
        body.position.set(x, 1.73 + s * 0.5 + h / 2, -10.85);
        scene.add(body);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.07, 6), body.material);
        neck.position.set(x, 1.73 + s * 0.5 + h + 0.03, -10.85);
        scene.add(neck);
      }
    }
  })();

  const neon = [];
  neon.push(box(14, 0.1, 0.05, glow(0xff2a3d), 0, 4.6, -11.8));
  neon.push(box(14, 0.1, 0.05, glow(0xfff0e8), 0, 4.9, -11.8));
  neon.push(box(0.05, 0.1, 18, glow(0xff2a3d), -11.8, 5.3, 0));
  neon.push(box(0.05, 0.1, 18, glow(0xff2a3d), 11.8, 5.3, 0));

  function canvasTex(draw, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    draw(ctx, w, h);
    if (window.PS2 && PS2.gritPass) PS2.gritPass(ctx, w, h, (w * 13 + h * 7) | 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    t.needsUpdate = true;
    t.userData.ps2 = true;
    t.userData.grit = true;
    return t;
  }
  function neonSign(text, color, w, h) {
    const t = canvasTex((g, W, H) => {
      g.fillStyle = '#080004'; g.fillRect(0, 0, W, H);
      g.font = 'bold ' + Math.floor(H * 0.55) + 'px Impact, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = color; g.shadowBlur = 28;
      g.strokeStyle = color; g.lineWidth = 4; g.strokeText(text, W / 2, H / 2);
      g.fillStyle = '#fff4f0'; g.fillText(text, W / 2, H / 2);
    }, w, h);
    const m = new THREE.MeshLambertMaterial({ map: t, color: 0xffffff, emissive: new THREE.Color(color), emissiveIntensity: 1.2 });
    m.userData.ps2KeepMap = true;
    return m;
  }
  const buckSign = box(3.6, 0.9, 0.08, neonSign('BUCK UP', '#ff2a3d', 512, 128), 0, 5.7, -11.7);
  neon.push(buckSign);
  const spurSign = box(3.2, 0.7, 0.08, neonSign('BITTER BLONDE', '#ff9a3a', 512, 128), -11.72, 5.0, -3);
  spurSign.rotation.y = Math.PI / 2; neon.push(spurSign);
  const spurSign2 = box(3.2, 0.7, 0.08, neonSign('BITTER BLONDE', '#ff3fa4', 512, 128), 11.72, 5.0, 3);
  spurSign2.rotation.y = -Math.PI / 2; neon.push(spurSign2);

  // chalkboard menus
  function chalkBoard(x, y, z, rotY) {
    const t = canvasTex((g, W, H) => {
      g.fillStyle = '#1a1e16'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#c4a574'; g.lineWidth = 10; g.strokeRect(8, 8, W - 16, H - 16);
      g.fillStyle = '#f0e6d0'; g.font = 'bold 28px Georgia, serif';
      g.textAlign = 'center'; g.fillText("TODAY'S POISON", W / 2, 52);
      g.font = '22px Georgia, serif'; g.textAlign = 'left';
      ['WHISKEY    $4', 'BEER       $3', 'SHOTS      $5', 'BUCK UP    $7'].forEach((l, i) => g.fillText(l, 36, 110 + i * 36));
    }, 256, 256);
    const chalkM = new THREE.MeshLambertMaterial({ map: t }); chalkM.userData.ps2KeepMap = true;
    const b = box(1.8, 1.6, 0.06, chalkM, x, y, z);
    b.rotation.y = rotY || 0; return b;
  }
  chalkBoard(-11.82, 2.6, 4, Math.PI / 2);
  chalkBoard(11.82, 2.6, -3, -Math.PI / 2);

  // hanging ceiling clutter: bras, hats, flags
  function cowboyHatMesh(parent, x, y, z, s) {
    const g = new THREE.Group();
    const leather = mat(0x5a3a1e);
    g.name = 'hat';
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 14), leather);
    brim.name = 'hat'; brim.position.y = 0; g.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.16, 10), leather);
    crown.name = 'hat'; crown.position.y = 0.09; g.add(crown);
    g.position.set(x, y, z); if (s) g.scale.setScalar(s);
    g.rotation.z = (Math.random() - 0.5) * 0.6; g.rotation.x = 0.3 + Math.random() * 0.5;
    (parent || scene).add(g); return g;
  }
  function makeBraLocal() {
    const g = new THREE.Group(), cloth = mat(0xc45a6a), strap = mat(0xa84858);
    [-1, 1].forEach(s => {
      const cup = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), cloth);
      cup.scale.set(1, 0.72, 0.8); cup.position.set(s * 0.17, 0.06, 0); g.add(cup);
    });
    box(0.54, 0.045, 0.07, strap, 0, -0.07, 0, g);
    box(0.03, 0.3, 0.03, strap, -0.17, 0.22, -0.03, g);
    box(0.03, 0.3, 0.03, strap, 0.17, 0.22, -0.03, g);
    return g;
  }
  for (let i = 0; i < 2; i++) {
    const bra = makeBraLocal();
    bra.position.set((Math.random() - 0.5) * 16, 6.15, (Math.random() - 0.5) * 14);
    bra.rotation.set(0.4, Math.random() * 6, 0.2); bra.scale.setScalar(0.9);
    scene.add(bra);
  }
  // denser row of bras over the bar (original, no brands)
  for (let i = 0; i < 3; i++) {
    const bra = makeBraLocal();
    bra.position.set(-7 + i * 1.4, 6.05, -9.2 + (Math.random() - 0.5) * 1.2);
    bra.rotation.set(0.5, Math.random() * 6, 0.25); bra.scale.setScalar(0.85 + Math.random() * 0.2);
    scene.add(bra);
  }
  for (let i = 0; i < 1; i++) cowboyHatMesh(scene, (Math.random() - 0.5) * 16, 6.2, (Math.random() - 0.5) * 14, 1);
  const flagCols = ['#b4191d', '#f4e9d8', '#2a1a10', '#e8b04b'];
  for (let i = 0; i < 0; i++) {
    const fm = new THREE.MeshBasicMaterial({ color: rnd(flagCols), side: THREE.DoubleSide });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), fm);
    fl.position.set((Math.random() - 0.5) * 14, 6.15, (Math.random() - 0.5) * 12);
    fl.rotation.y = Math.random() * 6; scene.add(fl);
  }

  // string lights over the ring
  const stringLights = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), glow(i % 3 ? 0xffe0a0 : 0xff6a3a));
    s.position.set(Math.cos(a) * 3.6, 4.6 + Math.sin(i) * 0.08, Math.sin(a) * 3.6);
    scene.add(s); stringLights.push(s);
  }
  const cable = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.012, 6, 32), mat(0x222222));
  cable.rotation.x = Math.PI / 2; cable.position.y = 4.6; scene.add(cable);

  const stars = [];
  for (let i = 0; i < 6; i++) {
    const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), glow(i % 3 ? 0xffe0b0 : 0xff4030));
    st.position.set((Math.random() - 0.5) * 16, 5.6 + Math.random() * 0.5, (Math.random() - 0.5) * 16);
    scene.add(st); stars.push(st);
  }

  // ranch dressing: wagon wheels, antlers, cowhide, hanging lanterns (original geometry)
  (function dressRanch() {
    const wood = ps2Mat('diner_wood', 1, 2);
    function wagonWheel(x, y, z, ry, sc) {
      const g = new THREE.Group();
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.055, 8, 18), wood);
      g.add(rim);
      for (let i = 0; i < 8; i++) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 6), wood);
        sp.rotation.z = i * Math.PI / 8; g.add(sp);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 10), wood);
      hub.rotation.x = Math.PI / 2; g.add(hub);
      g.position.set(x, y, z); g.rotation.y = ry || 0; g.scale.setScalar(sc || 1);
      scene.add(g);
    }
    wagonWheel(-11.3, 1.15, -3.2, Math.PI / 2, 1);
    wagonWheel(-11.3, 1.15, 7.2, Math.PI / 2, 0.9);
    wagonWheel(11.3, 1.15, -5.0, -Math.PI / 2, 1);
    wagonWheel(11.3, 1.15, 8.0, -Math.PI / 2, 0.85);
    wagonWheel(-8.5, 1.15, 11.3, 0, 0.95);
    function antlers(x, y, z, ry) {
      const g = new THREE.Group();
      box(0.55, 0.42, 0.07, wood, 0, 0, 0, g);
      const hornM = mat(0xd8c8a8);
      [[-1, 0.2], [1, -0.2]].forEach(function (h) {
        const a = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.7, 6), hornM);
        a.position.set(h[0] * 0.08, 0.4, 0.02); a.rotation.z = h[0] * 0.55; a.rotation.y = h[1]; g.add(a);
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.022, 0.28, 5), hornM);
        t.position.set(h[0] * 0.28, 0.62, 0.02); t.rotation.z = h[0] * 1.1; g.add(t);
      });
      g.position.set(x, y, z); g.rotation.y = ry || 0; scene.add(g);
    }
    antlers(-11.75, 4.2, 1.5, Math.PI / 2);
    antlers(11.75, 4.1, -5.5, -Math.PI / 2);
    antlers(-6, 4.4, -11.75, 0);
    const hideTex = canvasTex(function (g, W, H) {
      g.fillStyle = '#e8d2a8'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#5a3218';
      for (let i = 0; i < 28; i++) {
        g.beginPath();
        g.ellipse(Math.random() * W, Math.random() * H, 12 + Math.random() * 28, 8 + Math.random() * 18, Math.random() * 3, 0, 6.3);
        g.fill();
      }
    }, 256, 256);
    const hideMatl = new THREE.MeshLambertMaterial({ map: hideTex, side: THREE.DoubleSide, color: 0xffffff });
    [[-11.7, 2.0, 8.5, Math.PI / 2], [11.7, 2.1, -2, -Math.PI / 2], [-9, 0.03, 8.8, 0]].forEach(function (h, i) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(i === 2 ? 2.4 : 1.6, i === 2 ? 1.6 : 2.1), hideMatl);
      pl.position.set(h[0], h[1], h[2]); pl.rotation.y = h[3];
      if (i === 2) pl.rotation.x = -Math.PI / 2;
      scene.add(pl);
    });
    // hanging star lanterns — warm amber many-pointed stars (original geometry, one mesh each)
    function starGeo(core, longLen, shortLen, half) {
      const pos = [], uv = [];
      const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
      [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b) { [-1, 1].forEach(function (c) { dirs.push([a, b, c]); }); }); });
      const d = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3();
      dirs.forEach(function (q, k) {
        d.set(q[0], q[1], q[2]).normalize();
        up.set(0, 1, 0); if (Math.abs(d.y) > 0.9) up.set(1, 0, 0);
        u.crossVectors(d, up).normalize(); v.crossVectors(d, u).normalize();
        const L = k < 6 ? longLen : shortLen;
        const ax = d.x * L, ay = d.y * L, az = d.z * L;
        const cs = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(function (s2) {
          return [d.x * core + (u.x * s2[0] + v.x * s2[1]) * half, d.y * core + (u.y * s2[0] + v.y * s2[1]) * half, d.z * core + (u.z * s2[0] + v.z * s2[1]) * half];
        });
        for (let n = 0; n < 4; n++) {
          const p1 = cs[n], p2 = cs[(n + 1) % 4];
          pos.push(ax, ay, az, p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
          uv.push(0.5, 1, 0, 0, 1, 0);
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      return geo;
    }
    let starG = null;
    try { starG = starGeo(0.05, 0.42, 0.25, 0.1); } catch (e) { starG = null; }
    const starCols = [0xffb060, 0xff7a3a, 0xffd89a];
    [[-5.5, 4.8, 4], [5.5, 4.8, 4], [-5.5, 4.8, -4], [5.5, 4.8, -4], [0, 4.9, 8.5], [-8, 4.7, -6],
     [-9.5, 5.2, 2], [9.5, 5.2, 2], [-2.5, 5.3, -9], [6, 5.3, -9.2]].forEach(function (p, k) {
      const g = new THREE.Group(); g.name = 'starLantern';
      if (starG) {
        const star = new THREE.Mesh(starG, glow(starCols[k % 3]));
        star.name = 'lanternStar'; star.castShadow = false; star.receiveShadow = false;
        star.userData.ps2KeepMap = true;
        star.rotation.set(0.3 + k * 0.37, k * 0.9, 0.2);
        g.add(star);
      } else {
        box(0.22, 0.28, 0.22, mat(0x3a2a18), 0, 0, 0, g);
        box(0.16, 0.2, 0.16, glow(0xff8a30), 0, 0, 0, g);
      }
      const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5), mat(0x222222));
      hook.position.y = 0.62; g.add(hook);
      g.position.set(p[0], p[1], p[2]); scene.add(g);
    });
  })();

  // yellow padded ring + black rubber base (original; no leather — that texture made the ring look red)
  function vinylTex(hex) {
    return canvasTex(function (g, W, H) {
      g.fillStyle = hex; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,240,160,0.28)';
      for (let y = 0; y < H; y += 8) g.fillRect(0, y, W, 3);
      g.strokeStyle = 'rgba(90,50,10,0.35)'; g.lineWidth = 2;
      for (let y = -H; y < H * 2; y += 28) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + W * 0.55); g.stroke();
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y - W * 0.55); g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let i = 0; i < 30; i++) g.fillRect(Math.random() * W, Math.random() * H, 10, 6);
    }, 256, 256);
  }
  const softVinyl = canvasTex(function (g, W, H) {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#7a2a22'); gr.addColorStop(0.5, '#a23a2c'); gr.addColorStop(1, '#6a2420');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,190,140,0.10)'; for (let i = 0; i < 260; i++) g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 7, 1 + Math.random() * 3);
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 160; i++) g.fillRect(Math.random() * W, Math.random() * H, 3 + Math.random() * 9, 1 + Math.random() * 2);
    g.strokeStyle = 'rgba(40,12,8,0.28)'; g.lineWidth = 3;
    for (let x = 0; x <= W; x += W / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  }, 256, 128);
  if (softVinyl) { softVinyl.wrapS = softVinyl.wrapT = THREE.RepeatWrapping; softVinyl.repeat.set(10, 1); }
  const yellowVinyl = hookSnap(new THREE.MeshLambertMaterial({ map: softVinyl, color: 0xffffff, side: THREE.DoubleSide }));
  const yellowPadM = (window.PS2 && PS2.material) ? hookSnap(PS2.material('diner_booth', 4, 4)) : yellowVinyl;
  const rubberTex = canvasTex(function (g, W, H) {
    g.fillStyle = '#2b231c'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 700; i++) { g.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.22)' : 'rgba(120,90,60,0.12)'; g.fillRect(Math.random() * W, Math.random() * H, 3 + Math.random() * 14, 2 + Math.random() * 5); }
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 6; for (let r = 40; r < W / 2; r += 56) { g.beginPath(); g.arc(W / 2, H / 2, r, 0, 6.3); g.stroke(); }
  }, 256, 256);
  const blackRubber = hookSnap(new THREE.MeshLambertMaterial({ map: rubberTex, color: 0xffffff, side: THREE.DoubleSide }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.38, 12, 36), yellowVinyl);
  ring.name = 'ring'; ring.rotation.x = -Math.PI / 2; ring.position.y = 0.42; scene.add(ring); registerItch('bar', 'ring', ring);
  const wall = new THREE.Mesh(new THREE.TorusGeometry(3.62, 0.22, 10, 36), blackRubber);
  wall.name = 'ringRubber'; wall.rotation.x = -Math.PI / 2; wall.position.y = 0.16; scene.add(wall);
  const wallLip = new THREE.Mesh(new THREE.CylinderGeometry(3.85, 3.85, 0.1, 36), blackRubber);
  wallLip.name = 'ringLip'; wallLip.position.y = 0.05; scene.add(wallLip);
  // dark scuffed pit floor inside the yellow bumper — a ring, not a yellow table
  const pitMat = new THREE.MeshLambertMaterial({
    color: 0x2a241c,
    map: canvasTex(function (g, W, H) {
      g.fillStyle = '#2a241c'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(80,60,40,0.18)';
        g.fillRect(Math.random() * W, Math.random() * H, 6 + Math.random() * 18, 3 + Math.random() * 8);
      }
      g.strokeStyle = 'rgba(0,0,0,0.10)'; g.lineWidth = 6;
      for (let r = 40; r < W / 2; r += 56) { g.beginPath(); g.arc(W/2, H/2, r, 0, 6.3); g.stroke(); }
    }, 256, 256)
  });
  if (pitMat.map) { pitMat.map.wrapS = pitMat.map.wrapT = THREE.RepeatWrapping; pitMat.map.repeat.set(3, 3); }
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.05, 0.08, 36), pitMat);
  pad.position.y = 0.04; scene.add(pad);

  // mechanical rodeo bull — original procedural machine (the Quaternius live-animal
  // GLB stays in models.js but is not placed in the scene). Head toward -Z.
  // Elongated silhouette ~1.8m long, 0.55m wide, 0.6m tall, on a slim chrome column.
  function hideTex() {
    return canvasTex(function (g, W, H) {
      g.fillStyle = '#1c120c'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 600; i++) {
        g.fillStyle = Math.random() > 0.5 ? 'rgba(255,210,160,0.04)' : 'rgba(0,0,0,0.08)';
        g.fillRect(Math.random() * W, Math.random() * H, 4, 3);
      }
      const cx = W * 0.5;
      g.strokeStyle = 'rgba(50,30,18,0.85)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, H); g.stroke();
      g.fillStyle = 'rgba(190,160,120,0.45)';
      for (let y = 3; y < H; y += 7) g.fillRect(cx - 5, y, 10, 2);
    }, 256, 256);
  }
  function saddleTex() {
    return canvasTex(function (g, W, H) {
      g.fillStyle = '#6a4224'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(30,16,8,0.4)'; g.lineWidth = 2;
      for (let y = -H; y < H * 2; y += 22) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + W * 0.5); g.stroke();
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y - W * 0.5); g.stroke();
      }
    }, 256, 256);
  }
  function hideMat(color, map) {
    return hookSnap(new THREE.MeshLambertMaterial({
      color: color, map: map || null, flatShading: false
    }));
  }
  function chromeMat(color) {
    if (window.PS2 && PS2.material) return hookSnap(PS2.material('diner_chrome', 2, 2, color || 0xffffff));
    return hookSnap(new THREE.MeshLambertMaterial({
      color: color || 0xb0b0b8, map: makeTex('texMetal', 2, 2), flatShading: false
    }));
  }
  const HIDE = (window.PS2 && PS2.material) ? hookSnap(PS2.material('bull_cowhide', 2, 1)) : hideMat(0xc49a70, makeTexAdj('texBullHide', 4, 3, 2.6, 28, 1.22));
  const HIDE_DARK = (window.PS2 && PS2.material) ? hookSnap(PS2.material('char_leather', 3, 2)) : hideMat(0x8a5a38, makeTexAdj('texBullHide', 3, 2, 2.2, 20, 1.2));
  const SADDLE_M = (window.PS2 && PS2.material) ? hookSnap(PS2.material('char_leather', 2, 2)) : hideMat(0xc48a58, makeTexAdj('texSaddleLeather', 2, 2, 1.85, 22, 1.15));
  const HORN_M = hookSnap(new THREE.MeshLambertMaterial({ color: 0xffffff, map: (window.PS2 && PS2.gritTint) ? PS2.gritTint(0xe8dcc0) : null, flatShading: false }));
  const ROPE_M = (window.PS2 && PS2.material) ? hookSnap(PS2.material('char_leather', 2, 1)) : hideMat(0x8a6238, (window.PS2 && PS2.gritTint) ? PS2.gritTint(0x8a6238) : null);
  const STRAP_M = (window.PS2 && PS2.material) ? hookSnap(PS2.material('char_leather', 2, 1)) : hideMat(0x3a2214, (window.PS2 && PS2.gritTint) ? PS2.gritTint(0x3a2214) : null);
  const CHROME = chromeMat(0xb8b8c0);
  const STEEL = chromeMat(0x7a7a82);
  const METAL = CHROME;
  const METAL_DARK = STEEL;

  const bull = new THREE.Group(); bull.name = 'bull'; bull.userData.isBull = true; scene.add(bull);
  // PS2-style bilinear filtering on the bull only: the first-person ride view sits right on the hide, and hard
  // point-filtered texels read as a pixel blob there. Re-applied every half second because later texture passes reset filters. Visual only.
  (window.__buckLife = window.__buckLife || []).push((function () { let acc = 1; return function (t, dt) { acc += dt || 0.016; if (acc < 0.5) return; acc = 0;
    bull.traverse(function (o) { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { const mp = m && m.map; if (mp && mp.magFilter !== THREE.LinearFilter) { mp.magFilter = THREE.LinearFilter; mp.minFilter = THREE.LinearFilter; mp.needsUpdate = true; } }); }); }; })());
  // Sleek finish: smooth (bilinear + mipmapped + anisotropic) filtering on every world texture instead of hard point sampling. Visual only.
  (window.__buckLife = window.__buckLife || []).push((function () { let acc = 1; const maxA = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
    return function (t, dt) { acc += dt || 0.016; if (acc < 0.5) return; acc = 0;
      scene.traverse(function (o) { if (!o.isMesh && !o.isSprite) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { const mp = m && m.map; if (mp && mp.isTexture && !mp.isCompressedTexture && mp.userData.sleek !== 2) { mp.generateMipmaps = true; mp.magFilter = THREE.LinearFilter; mp.minFilter = THREE.LinearMipmapLinearFilter; mp.anisotropy = maxA; mp.userData.sleek = 2; mp.needsUpdate = true; } }); }); }; })());
  // first-person eye sits over the saddle, looking toward the head/horns/grip (-Z)
  let rideEye = { x: 0, y: 1.78, z: 0.52, pitch: -0.34 };

  // low round steel flange on the pad — not a table under the body
  const mechBase = new THREE.Group(); scene.add(mechBase);
  const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.07, 24), STEEL);
  basePlate.position.y = 0.035; mechBase.add(basePlate);
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 8, 24), CHROME);
  baseRing.rotation.x = -Math.PI / 2; baseRing.position.y = 0.072; mechBase.add(baseRing);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.62, 24), CHROME);
  post.name = 'chromePost'; post.position.y = 0.38; mechBase.add(post);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 20), STEEL);
  collar.position.y = 0.68; mechBase.add(collar);
  const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 16), CHROME);
  ram.position.y = 0.78; bull.add(ram);
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), CHROME);
  joint.position.y = 0.86; bull.add(joint);

  // elongated lathe torso: 1.8m along Z after rotate, ~0.55m wide, ~0.6m tall with hump.
  // rotation.x = -PI/2 maps profile +Y (chest) to -Z (head).
  const bodyPts = [];
  const bodyProf = [
    [0.00, -0.90], [0.16, -0.88], [0.24, -0.80], [0.27, -0.64],
    [0.275, -0.40], [0.275, -0.12], [0.275, 0.12], [0.275, 0.32],
    [0.27, 0.50], [0.24, 0.68], [0.18, 0.80], [0.10, 0.88], [0.00, 0.90]
  ];
  bodyProf.forEach(function (p) { bodyPts.push(new THREE.Vector2(p[0], p[1])); });
  const torso = new THREE.Mesh(new THREE.LatheGeometry(bodyPts, 32), HIDE);
  torso.name = 'bullHide';
  torso.rotation.x = -Math.PI / 2;
  torso.scale.set(1, 0.6 / 0.55, 1); // 0.55 wide, 0.6 tall
  torso.position.set(0, 1.08, 0);
  bull.add(torso);
  // raised shoulder hump (toward the head, -Z)
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.30, 20, 14), HIDE);
  hump.name = 'bullHide';
  hump.scale.set(0.95, 0.95, 1.2);
  hump.position.set(0, 1.36, -0.42);
  bull.add(hump);

  // thicker neck, tapering down and forward into a distinct lower head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.38, 16), HIDE);
  neck.rotation.x = 1.35;
  neck.position.set(0, 1.04, -1.00);
  bull.add(neck);
  const headG = new THREE.Group();
  headG.position.set(0, 0.90, -1.28);
  bull.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, 16, 12), HIDE);
  head.scale.set(1.15, 0.95, 1.05);
  headG.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), HIDE);
  muzzle.scale.set(1.15, 0.75, 1.55);
  muzzle.position.set(0, -0.06, -0.20);
  headG.add(muzzle);
  [-1, 1].forEach(function (s) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), mat(0x080604));
    nostril.position.set(s * 0.055, -0.07, -0.38);
    headG.add(nostril);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), mat(0x0a0806));
    eye.position.set(s * 0.14, 0.06, -0.08);
    headG.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), HIDE_DARK);
    ear.scale.set(0.4, 1.1, 0.35);
    ear.position.set(s * 0.20, 0.14, 0.04);
    ear.rotation.z = -s * 0.6;
    headG.add(ear);
  });
  // thick ivory horns: 6cm+ radius at the base, ~45cm long, curving out and forward
  function curvedHorn(side) {
    const g = new THREE.Group();
    const pts = [
      new THREE.Vector3(side * 0.12, 0.10, 0.02),
      new THREE.Vector3(side * 0.26, 0.28, -0.06),
      new THREE.Vector3(side * 0.34, 0.40, -0.22),
      new THREE.Vector3(side * 0.28, 0.44, -0.42)
    ];
    const rad = [0.062, 0.048, 0.030, 0.012];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dir = b.clone().sub(a);
      const len = dir.length();
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rad[i + 1], rad[i], len, 10), HORN_M);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize());
      g.add(mesh);
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.08, 8), HORN_M);
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    const dir = last.clone().sub(prev).normalize();
    tip.position.copy(last).addScaledVector(dir, 0.04);
    tip.quaternion.setFromUnitVectors(up, dir);
    g.add(tip);
    return g;
  }
  headG.add(curvedHorn(-1));
  headG.add(curvedHorn(1));

  // short tail stub at the rear (+Z)
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.055, 0.22, 8), HIDE_DARK);
  tail.rotation.x = 0.9;
  tail.position.set(0, 1.10, 0.98);
  bull.add(tail);

  // four short stumpy padded leg nubs (typical of bar rodeo machines)
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
    const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.16, 10), new THREE.MeshLambertMaterial({ color: 0x2a2218, map: makeTexAdj('texVinylWorn', 2, 2, 0.4, 0, 1) }));
    nub.position.set(p[0] * 0.16, 0.78, p[1] * 0.38);
    bull.add(nub);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), HIDE_DARK);
    cap.position.set(p[0] * 0.16, 0.70, p[1] * 0.38);
    bull.add(cap);
  });

  // visible western-style saddle, raised front horn, rope grip, belly strap
  const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.30, 16, 12), SADDLE_M);
  saddle.name = 'saddle';
  saddle.scale.set(0.92, 0.28, 1.28);
  saddle.position.set(0, 1.40, 0.08);
  bull.add(saddle);
  const cantle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 8, 12, Math.PI), SADDLE_M);
  cantle.position.set(0, 1.40, 0.26);
  cantle.rotation.x = 0.3;
  bull.add(cantle);
  const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.14, 10), SADDLE_M);
  pommel.position.set(0, 1.46, -0.16);
  bull.add(pommel);
  const pommelCap = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), SADDLE_M);
  pommelCap.position.set(0, 1.54, -0.16);
  bull.add(pommelCap);
  const grip = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 8, 16), ROPE_M);
  grip.position.set(0, 1.44, -0.16);
  grip.rotation.x = Math.PI / 2;
  bull.add(grip);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.022, 8, 24), STRAP_M);
  strap.rotation.z = Math.PI / 2;
  strap.scale.set(1, 1, 0.85);
  strap.position.set(0, 1.08, 0.06);
  bull.add(strap);

  function posterTex(kind) {
    return canvasTex(function (g, W, H) {
      if (kind === 'rodeo') {
        g.fillStyle = '#5a1c14'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#e8c44a'; g.fillRect(10, 10, W-20, H-20);
        g.fillStyle = '#5a1c14'; g.fillRect(18, 18, W-36, H-36);
        g.fillStyle = '#f4e9d8'; g.font = 'bold 28px Impact, sans-serif'; g.textAlign = 'center';
        g.fillText('RODEO NIGHT', W/2, 70);
        g.fillStyle = '#2a1a10'; g.beginPath();
        g.ellipse(W/2, 150, 70, 40, 0, 0, 6.3); g.fill();
        g.fillStyle = '#f4f0e4';
        g.beginPath(); g.moveTo(W/2-30, 130); g.lineTo(W/2-50, 80); g.lineTo(W/2-20, 120); g.fill();
        g.beginPath(); g.moveTo(W/2+30, 130); g.lineTo(W/2+50, 80); g.lineTo(W/2+20, 120); g.fill();
        g.fillStyle = '#e8c44a'; g.font = 'bold 22px Impact, sans-serif';
        g.fillText('BITTER BLONDE', W/2, H-36);
      } else if (kind === 'ale') {
        g.fillStyle = '#1a2a16'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#c45a1a'; g.fillRect(0, 40, W, 90);
        g.fillStyle = '#f4e9d8'; g.font = 'bold 36px Impact, sans-serif'; g.textAlign = 'center';
        g.fillText('HOG WASH', W/2, 95);
        g.font = 'bold 22px Impact, sans-serif'; g.fillText('ALE', W/2, 122);
        g.fillStyle = '#e8c44a'; g.font = '16px Georgia, serif';
        g.fillText('EST. NOWHERE', W/2, 200);
        g.beginPath(); g.arc(W/2, 230, 24, 0, 6.3); g.strokeStyle = '#e8c44a'; g.lineWidth = 4; g.stroke();
      } else if (kind === 'toro') {
        g.fillStyle = '#102030'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#f4f0e4'; g.font = 'bold 34px Impact, sans-serif'; g.textAlign = 'center';
        g.fillText('EL TORO', W/2, 90);
        g.fillStyle = '#7ab0d8'; g.font = 'bold 28px Impact, sans-serif';
        g.fillText('LITE', W/2, 126);
        g.fillStyle = '#c9a03a'; g.font = '14px sans-serif';
        g.fillText('ICE COLD  •  NO BULL', W/2, 200);
      } else {
        g.fillStyle = '#2a1020'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#e070a0'; g.fillRect(8, 8, W-16, H-16);
        g.fillStyle = '#2a1020'; g.fillRect(16, 16, W-32, H-32);
        g.fillStyle = '#f4e9d8'; g.font = 'bold 24px Impact, sans-serif'; g.textAlign = 'center';
        g.fillText('MIDNIGHT', W/2, 90);
        g.fillText('RANCH', W/2, 122);
        g.font = '16px Georgia, serif'; g.fillText('DANCE TONIGHT', W/2, 180);
        g.fillStyle = '#e8c44a'; g.fillText('$3 COVER', W/2, 230);
      }
    }, 256, 256);
  }
  function muralTex() {
    return canvasTex(function (g, W, H) {
      g.fillStyle = '#d8c8b0'; g.fillRect(0, 0, W, H);
      // dirty white brick
      g.strokeStyle = 'rgba(80,60,40,0.35)'; g.lineWidth = 2;
      for (let y = 0; y < H; y += 16) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
        const off = (y/16)%2 ? 16 : 0;
        for (let x = off; x < W; x += 32) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y+16); g.stroke(); }
      }
      g.fillStyle = '#b4191d'; g.beginPath(); g.ellipse(70, 90, 40, 50, 0, 0, 6.3); g.fill();
      g.fillStyle = '#5a1c14'; g.beginPath(); g.ellipse(70, 90, 18, 22, 0, 0, 6.3); g.fill();
      g.fillStyle = '#e8c44a'; g.beginPath(); g.arc(190, 70, 36, 0, 6.3); g.fill();
      g.fillStyle = '#c45a1a'; g.beginPath(); g.moveTo(190, 70); g.lineTo(230, 110); g.lineTo(150, 110); g.fill();
      g.fillStyle = 'rgba(60,40,20,0.2)';
      for (let i = 0; i < 20; i++) g.fillRect(Math.random()*W, Math.random()*H, 20, 8);
    }, 256, 256);
  }
  function dressBar() {
    // original posters (no real brands)
    const kinds = ['rodeo', 'ale', 'toro', 'ranch'];
    const spots = [
      [-11.82, 2.4, -4, Math.PI/2], [-11.82, 2.6, 0, Math.PI/2], [-11.82, 2.2, 6, Math.PI/2],
      [11.82, 2.5, -4, -Math.PI/2], [11.82, 2.3, 1, -Math.PI/2], [11.82, 2.6, 7, -Math.PI/2],
      [-8, 2.8, 11.82, Math.PI], [8, 2.6, 11.82, Math.PI],
      [-4, 3.0, -11.82, 0], [4, 2.7, -11.82, 0]
    ];
    spots.forEach(function (s, i) {
      const pm = new THREE.MeshLambertMaterial({ map: posterTex(kinds[i % 4]) }); pm.userData.ps2KeepMap = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.7), pm);
      m.position.set(s[0], s[1], s[2]); m.rotation.y = s[3]; scene.add(m);
    });
    // painted murals on the long walls
    [[-11.84, 3.2, -1, Math.PI/2], [11.84, 3.2, 4, -Math.PI/2]].forEach(function (s) {
      const mm = new THREE.MeshLambertMaterial({ map: muralTex() }); mm.userData.ps2KeepMap = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6), mm);
      m.position.set(s[0], s[1], s[2]); m.rotation.y = s[3]; scene.add(m);
    });
    // made-up neon beer signs
    function neonWord(text, color, w, h, x, y, z, rotY) {
      const mesh = box(w, h, 0.06, neonSign(text, color, 512, 128), x, y, z);
      mesh.rotation.y = rotY || 0; neon.push(mesh);
    }
    neonWord('HOG WASH', '#ff9a3a', 2.4, 0.5, -11.7, 4.4, 5, Math.PI/2);
    neonWord('EL TORO', '#7ad0ff', 2.2, 0.45, 11.7, 4.5, -1, -Math.PI/2);
    neonWord('COLD BEER', '#ff3fa4', 2.6, 0.45, -8.2, 4.6, 11.7, Math.PI);
    neonWord('LONGNECK', '#7ad0ff', 2.2, 0.42, 8.2, 4.5, 11.7, Math.PI);
    neonWord('ICE HOUSE', '#ff9a3a', 2.2, 0.42, 11.7, 4.8, 6.5, -Math.PI/2);
    neonWord('SHOTS', '#ff4060', 1.6, 0.4, -11.7, 4.8, -7, Math.PI/2);
    // street-name neon outside the doorway (not a venue logo)
    neonWord('SUNSET STRIP', '#ff2a3d', 4.4, 0.7, 0, 3.7, 15.2, Math.PI);
    // jukebox
    const juke = new THREE.Group(); juke.name = 'jukebox';
    box(0.7, 1.4, 0.5, (window.PS2 && PS2.material) ? hookSnap(PS2.material('diner_booth', 2, 2)) : mat(0xb4191d), 0, 0.7, 0, juke);
    box(0.72, 0.5, 0.2, glow(0xff4060), 0, 1.15, 0.22, juke);
    box(0.5, 0.35, 0.08, glow(0x40c8ff), 0, 1.15, 0.26, juke);
    box(0.6, 0.5, 0.08, mat(0x222222), 0, 0.55, 0.26, juke);
    juke.position.set(-10.8, 0, 4.5); juke.rotation.y = Math.PI/2; scene.add(juke); registerItch('bar', 'jukebox', juke);
    // pool table
    const pool = new THREE.Group(); pool.name = 'pool';
    box(2.2, 0.12, 1.2, mat(0x1e5a28), 0, 0.82, 0, pool);
    box(2.3, 0.16, 1.3, mat(0x4a2a14), 0, 0.72, 0, pool);
    box(0.12, 0.7, 0.12, mat(0x3a2214), -0.95, 0.35, -0.5, pool);
    box(0.12, 0.7, 0.12, mat(0x3a2214), 0.95, 0.35, -0.5, pool);
    box(0.12, 0.7, 0.12, mat(0x3a2214), -0.95, 0.35, 0.5, pool);
    box(0.12, 0.7, 0.12, mat(0x3a2214), 0.95, 0.35, 0.5, pool);
    [0xfff0e0, 0xb4191d, 0x1a3a8a, 0xe8c44a, 0x2a8a3a, 0x8a1a8a].forEach(function (c, i) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), mat(c));
      ball.position.set(-0.4 + (i%3)*0.25, 0.92, -0.2 + Math.floor(i/3)*0.25); pool.add(ball);
    });
    pool.position.set(7.5, 0, 5.5); pool.rotation.y = 0.2; scene.add(pool); registerItch('bar', 'pool', pool);
    // barrels and beer crates
    function barrel(x, z) {
      const g = new THREE.Group(); g.name = 'barrel'; g.position.set(x, 0, z); scene.add(g);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.7, 10), (window.PS2 && PS2.material) ? hookSnap(PS2.material('diner_wood', 2, 2)) : mat(0x6a3a18));
      b.name = 'barrel'; b.position.set(0, 0.35, 0); g.add(b);
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 10), (window.PS2 && PS2.material) ? hookSnap(PS2.material('diner_chrome', 1, 1)) : mat(0x333333));
      r.rotation.x = Math.PI/2; r.position.set(0, 0.5, 0); g.add(r);
      registerItch('bar', 'barrel', g);
    }
    barrel(-10.5, -7.2); barrel(-10.5, -6.4); barrel(10.4, 8.5); barrel(10.4, 7.7);
    for (let i = 0; i < 6; i++) {
      box(0.55, 0.28, 0.4, mat(i%2 ? 0x8a5a28 : 0x6a4220), -10.6 + (i%2)*0.6, 0.16 + Math.floor(i/2)*0.28, 7.2);
    }
    // hats on wall hooks
    for (let i = 0; i < 5; i++) {
      cowboyHatMesh(scene, -11.5, 2.0, -6 + i * 0.7, 0.7);
    }
    // glasses and bottles already on shelves; add more on the bar top
    for (let i = 0; i < 10; i++) {
      const x = -6 + i * 1.2 + (Math.random()-0.5)*0.2;
      const g = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.12, 8), new THREE.MeshLambertMaterial({ color: 0xaadccc, transparent: true, opacity: 0.45 }));
      g.position.set(x, 1.28, -9.15); scene.add(g);
    }
    // floor litter (cups, papers, packs) — original, no real brands
    for (let i = 0; i < 18; i++) {
      const x = (Math.random()-0.5)*16, z = (Math.random()-0.5)*16;
      if (Math.hypot(x, z) < 4.2) continue;
      if (Math.random() < 0.5) {
        const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.12), new THREE.MeshLambertMaterial({ color: rnd([0xe8e0d0, 0xd0c8b0, 0xc4b8a0]), side: THREE.DoubleSide }));
        paper.rotation.x = -Math.PI/2; paper.rotation.z = Math.random()*6; paper.position.set(x, 0.02, z); scene.add(paper);
      } else {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.08, 6), mat(rnd([0xd8d0c4, 0x6a3a22, 0x3a3a3a])));
        cup.position.set(x, 0.05, z); cup.rotation.z = Math.random()*0.8; scene.add(cup);
      }
    }
  }
  dressBar();

  // fallback box people
  const SKIN = [0xe0b08a, 0xc48a62, 0x8a5a3a, 0xf0c8a0];
  const TOPS = [0xb4191d, 0x2f4f8f, 0x3e6b3a, 0x6b3a1e, 0xd8d0c0, 0x8a2a5a];
  const HATS = [0xb08a5a, 0x2a1a10, 0xd8c8a8];
  function person(o) {
    const g = new THREE.Group(), skin = mat(rnd(SKIN)), legs = mat(o.legs || rnd([0x2f4a7a, 0x22304a, 0x4a3a2a]));
    box(0.18, 0.8, 0.18, legs, -0.12, 0.4, 0, g); box(0.18, 0.8, 0.18, legs, 0.12, 0.4, 0, g);
    box(0.5, 0.6, 0.28, mat(o.top || rnd(TOPS)), 0, 1.1, 0, g);
    const up = o.up !== undefined ? o.up : Math.random() < 0.4;
    const armL = box(0.12, 0.55, 0.12, skin, -0.32, up ? 1.55 : 1.05, 0, g);
    box(0.12, 0.55, 0.12, skin, 0.32, 1.05, 0, g);
    box(0.3, 0.32, 0.3, skin, 0, 1.6, 0, g);
    if (o.hat || Math.random() < 0.55) { const hm = mat(o.hatColor || rnd(HATS)); box(0.62, 0.04, 0.62, hm, 0, 1.78, 0, g); box(0.32, 0.2, 0.32, hm, 0, 1.88, 0, g); }
    g.userData = { ph: Math.random() * 6.28, arm: armL, mixer: null };
    return g;
  }
  const crowd = [];
  const boxPeople = [];
  for (let i = 0; i < 32; i++) {
    const a = Math.random() * Math.PI * 2, r = 4.6 + Math.random() * 3.4;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z < -7.5 || (Math.abs(x) < 1.8 && z > 9)) continue;
    const p = person({}); p.position.set(x, 0, z); faceToward(p, 0, 0); scene.add(p); crowd.push(p); boxPeople.push(p);
  }
  const dancers = [-3, 3].map(x => { const d = person({ top: 0xf4e9d8, legs: 0x3a5a9a, hat: true, up: true }); d.position.set(x, 1.2, -9.5); scene.add(d); boxPeople.push(d); return d; });
  let rider = person({ top: 0xf4e9d8, legs: 0x2f4a7a, hat: true, hatColor: 0xb08a5a, up: true });
  rider.position.set(0, 0.42, 0.08); rider.scale.setScalar(0.9); bull.add(rider);
  boxPeople.push(rider);
  box(0.35, 0.08, 0.32, mat(0xB4191D), 0, 1.42, 0.02, rider);
  const hair = [];
  for (let i = 0; i < 5; i++) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.9), new THREE.MeshLambertMaterial({ color: 0xffffff, map: (window.PS2 && PS2.gritTint) ? PS2.gritTint(0x3a2214) : null, side: THREE.DoubleSide }));
    h.position.set(-0.12 + i * 0.06, 1.3, 0.17); rider.add(h); hair.push(h);
  }

  // outside — blue daylight through the door, dusty-pink pavement
  const skyPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 40),
    new THREE.MeshBasicMaterial({
      map: (window.PS2 && PS2.skyTexture) ? PS2.skyTexture : null,
      color: 0xF2B05E,
      fog: false,
      side: THREE.DoubleSide
    })
  );
  skyPlane.name = 'skyPlane';
  skyPlane.position.set(0, 10, 28);
  scene.add(skyPlane);
  const outGround = box(80, 0.1, 50, (window.PS2 && PS2.material) ? hookSnap(PS2.material('desert_sand', 8, 8)) : mat(0xC28B56), 0, -0.15, 37);
  outGround.name = 'desertSand';
  box(3.5, 0.5, 0.1, glow(0xff2a3d), 0, 7.6, 12.25);
  box(3.0, 0.3, 0.1, glow(0xfff0e8), 0, 7.0, 12.25);
  // ---- EXTERIOR (original, generated): dive-bar facade, dusty highway, palms, low-riders, street signs, low sun ----
  (function buildExterior() {
    try {
      skyPlane.visible = false; // the sky dome covers the sky now
      const lam = function (map, color) { const m = new THREE.MeshLambertMaterial({ map: map || null, color: color === undefined ? 0xffffff : color }); if (map) m.userData.ps2KeepMap = true; return hookSnap(m); };
      const basic = function (map, color) { const m = new THREE.MeshBasicMaterial({ map: map || null, color: color === undefined ? 0xffffff : color, fog: true }); if (map) m.userData.ps2KeepMap = true; return hookSnap(m); };
      const rep = function (t, rx, ry) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; };
      let seed = 7; const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const grp = new THREE.Group(); grp.name = 'exterior'; scene.add(grp);
      const eb = function (w, h, d, m, x, y, z, p) { const o = box(w, h, d, m, x, y, z, p || grp); return o; };
      // far hills (flat purple ridge) and a roadside sky
      for (let i = 0; i < 14; i++) {
        const h = 4 + rnd() * 5, r = 6 + rnd() * 4;
        const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), lam(null, 0x8a5070));
        hill.position.set(-70 + i * 11 + rnd() * 5, h / 2 - 1, 62 + rnd() * 8); hill.name = 'ridge'; grp.add(hill);
      }
      // sun: big low orange disc with halo (basic material, no fog) sitting just above the horizon down the road
      const halo = canvasTex(function (g, W, H) {
        const gr = g.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
        gr.addColorStop(0, 'rgba(255,238,170,1)'); gr.addColorStop(0.16, 'rgba(255,205,110,0.95)');
        gr.addColorStop(0.17, 'rgba(255,150,60,0.55)'); gr.addColorStop(0.55, 'rgba(255,110,50,0.18)'); gr.addColorStop(1, 'rgba(255,90,60,0)');
        g.clearRect(0, 0, W, H); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      }, 128, 128);
      const sunM = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), new THREE.MeshBasicMaterial({ map: halo, transparent: true, fog: false, depthWrite: false }));
      sunM.position.set(-40, 6, 28); sunM.lookAt(14, 2, 31); sunM.renderOrder = -5; sunM.name = 'sunGlow'; grp.add(sunM);
      // highway (cracked asphalt, double yellow centre line, white edges) running along x
      const road = canvasTex(function (g, W, H) {
        // fine-grain worn asphalt (original, procedural): base tone, speckle aggregate, patches, cracks, tyre tracks, paint
        g.fillStyle = '#4a4440'; g.fillRect(0, 0, W, H);
        const id = g.getImageData(0, 0, W, H), d = id.data;
        for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 34, w = rnd() < 0.06 ? 26 : 0; d[i] += n + w; d[i + 1] += n * 0.95 + w * 0.9; d[i + 2] += n * 0.9 + w * 0.8; }
        g.putImageData(id, 0, 0);
        for (let i = 0; i < 40; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(20,16,14,0.13)' : 'rgba(150,120,95,0.07)'; g.fillRect(rnd() * W, rnd() * H, 30 + rnd() * 160, 8 + rnd() * 30); }
        g.fillStyle = 'rgba(15,12,10,0.16)'; g.fillRect(0, H * 0.24, W, H * 0.1); g.fillRect(0, H * 0.66, W, H * 0.1);
        g.strokeStyle = 'rgba(12,9,8,0.75)'; g.lineWidth = 1.5;
        for (let k = 0; k < 16; k++) { let x = rnd() * W, y = rnd() * H; g.beginPath(); g.moveTo(x, y); for (let q = 0; q < 12; q++) { x += (rnd() - 0.3) * 26; y += (rnd() - 0.5) * 14; g.lineTo(x, y); } g.stroke(); }
        g.fillStyle = 'rgba(232,184,48,0.93)'; g.fillRect(0, H / 2 - 7, W, 4); g.fillRect(0, H / 2 + 3, W, 4);
        g.fillStyle = 'rgba(216,208,192,0.85)'; g.fillRect(0, 6, W, 4); g.fillRect(0, H - 10, W, 4);
        for (let i = 0; i < 70; i++) { g.fillStyle = 'rgba(30,24,20,0.5)'; g.fillRect(rnd() * W, H / 2 - 7, 3 + rnd() * 18, 14); }
      }, 1024, 256);
      rep(road, 4, 1);
      const roadM = new THREE.Mesh(new THREE.PlaneGeometry(130, 12), lam(road)); roadM.rotation.x = -Math.PI / 2; roadM.position.set(0, -0.08, 31); roadM.name = 'highway'; grp.add(roadM);
      // gravel lot between bar and road
      const lotT = canvasTex(function (g, W, H) { g.fillStyle = '#9a7650'; g.fillRect(0, 0, W, H); for (let i = 0; i < 300; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(60,40,28,0.4)' : 'rgba(220,190,150,0.3)'; g.fillRect((rnd() * W) | 0, (rnd() * H) | 0, 2, 2); } }, 64, 64);
      rep(lotT, 12, 3);
      const lot = new THREE.Mesh(new THREE.PlaneGeometry(60, 14), lam(lotT)); lot.rotation.x = -Math.PI / 2; lot.position.set(0, -0.085, 19.2); lot.name = 'lot'; grp.add(lot);
      // facade: false-front parapet with big neon, porch, awning, glowing windows
      const boards = ps2Mat('diner_wood', 6, 2);
      eb(23, 3.2, 0.5, boards, 0, 8.4, 12.35);
      eb(23.4, 0.3, 0.7, mat(0x3a2418), 0, 10.1, 12.4);
      const front = neonSign('SUNSET STRIP', '#ff2a3d', 512, 128);
      const fs = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), front); fs.position.set(0, 8.5, 12.64); /* old SUNSET STRIP front board removed */
      const fs2 = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.0), neonSign('BULL RIDING NITELY', '#ffb030', 512, 128)); fs2.position.set(0, 6.9, 12.64); /* old BULL RIDING board removed */
      eb(23, 0.25, 4.4, boards, 0, 0.04, 14.4);                 // porch deck
      eb(23, 0.18, 4.8, mat(0x6a2418), 0, 4.15, 14.6).rotation.x = 0.1; // red tin awning
      [-10.6, -3.6, 3.6, 10.6].forEach(function (x) { eb(0.22, 4.1, 0.22, boards, x, 2.05, 16.6); });
      [[-6.9, 0xffb050], [6.9, 0xffc060]].forEach(function (a) {
        eb(2.9, 2.1, 0.1, mat(0x24140c), a[0], 2.5, 12.2);
        eb(2.5, 1.7, 0.12, new THREE.MeshBasicMaterial({ color: a[1] }), a[0], 2.5, 12.26);
      });
      const bs = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.6), neonSign('OPEN', '#42ff80', 256, 96)); bs.position.set(2.7, 3.0, 12.3); grp.add(bs); neon.push(bs);
      const bs2 = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.6), neonSign('COLD BEER', '#7ad0ff', 256, 96)); bs2.position.set(-2.7, 3.0, 12.3); grp.add(bs2); neon.push(bs2);
      // roadside billboard
      eb(0.3, 6, 0.3, boards, -26, 3, 22); eb(0.3, 6, 0.3, boards, -19, 3, 22);
      const bb = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), neonSign('LIVE BULLS · NO MERCY', '#ff9a3a', 512, 128)); bb.position.set(-22.5, 6.2, 21.8); grp.add(bb); neon.push(bb);
      // street sign (green, white text) on a pole
      const signT = canvasTex(function (g, W, H) {
        g.fillStyle = '#1c6a3a'; g.fillRect(0, 0, W, H); g.strokeStyle = '#f2f2e8'; g.lineWidth = 4; g.strokeRect(5, 5, W - 10, H - 10);
        g.fillStyle = '#f2f2e8'; g.font = 'bold 34px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SUNSET STRIP', W / 2, H * 0.32); g.font = 'bold 22px Arial, sans-serif'; g.fillText('DUSTY MILE RD', W / 2, H * 0.72);
      }, 256, 96);
      const sgn = function (x, z, ry) { eb(0.14, 4.4, 0.14, mat(0x777777), x, 2.2, z); const s = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.98), lam(signT)); s.material.side = THREE.DoubleSide; s.position.set(x, 4.5, z + 0.1); s.rotation.y = ry; grp.add(s); };
      sgn(14.5, 25.2, 0.0); sgn(-14, 25.2, 0.0);
      // telephone poles with a wire
      const poleG = new THREE.Group(); poleG.name = 'procPole'; grp.add(poleG);
      [-30, -10, 10, 30].forEach(function (x) { eb(0.22, 9, 0.22, boards, x, 4.5, 26, poleG); eb(2.6, 0.18, 0.18, boards, x, 8.4, 26, poleG); });
      eb(80, 0.04, 0.04, mat(0x1a1214), 0, 8.5, 26, poleG);
      // palms: banded tapered trunk + drooping fronds
      const frondT = (function () { const c = document.createElement('canvas'); c.width = 64; c.height = 16; const g = c.getContext('2d'); g.fillStyle = '#4aa63a'; for (let i = 0; i < 8; i++) { const x = i * 8; g.fillRect(x, 3, 6, 10 - i); g.fillRect(x, 3, 6, 1); } g.fillStyle = '#b8f070'; g.fillRect(0, 7, 64, 2); g.globalCompositeOperation = 'destination-in'; g.beginPath(); g.moveTo(0, 8); g.lineTo(48, 0); g.lineTo(64, 8); g.lineTo(48, 16); g.closePath(); g.fill(); const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.userData.ps2 = true; if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; return t; })();
      const frondM = hookSnap(new THREE.MeshLambertMaterial({ map: frondT, side: THREE.DoubleSide, alphaTest: 0.5, color: 0xdfffd0 })); frondM.userData.ps2KeepMap = true;
      const trunkT = canvasTex(function (g, W, H) { g.fillStyle = '#7a5634'; g.fillRect(0, 0, W, H); for (let y = 0; y < H; y += 6) { g.fillStyle = 'rgba(30,18,10,0.55)'; g.fillRect(0, y, W, 2); } }, 16, 64);
      const palm = function (x, z, h, lean) {
        const g = new THREE.Group(); g.name = 'procPalm'; g.position.set(x, 0, z); g.rotation.z = lean; grp.add(g);
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.38, h, 6), lam(trunkT)); tr.position.y = h / 2; g.add(tr);
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2 + rnd() * 0.3, f = new THREE.Group(); f.position.y = h; f.rotation.y = a; g.add(f);
          const lg = new THREE.PlaneGeometry(3.8, 1.3); lg.rotateX(-Math.PI / 2); lg.translate(1.9, 0, 0); const l = new THREE.Mesh(lg, frondM); l.rotation.z = -0.3 - rnd() * 0.35; f.add(l);
        }
      };
      [[-19, 21, 8, 0.08], [-7, 22.5, 7, -0.06], [9, 22, 8.5, 0.07], [21, 21, 7.5, -0.1], [-14, 14.5, 6.5, 0.05], [14.5, 14.5, 7, -0.05], [-34, 24, 8, 0.1], [32, 23, 8, -0.08]].forEach(function (p) { palm(p[0], p[1], p[2], p[3]); });
      // low-rider cars (original, boxy '60s style): candy-painted body, chrome, white-wall tyres
      const paint = function (hex) { return canvasTex(function (g, W, H) { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, hex); gr.addColorStop(1, '#000'); g.fillStyle = hex; g.fillRect(0, 0, W, H); g.globalAlpha = 0.55; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.globalAlpha = 1; g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, H * 0.3, W, 2); }, 32, 32); };
      const lowrider = function (x, z, ry, hex) {
        const c = new THREE.Group(); c.name = 'procCar'; c.position.set(x, 0, z); c.rotation.y = ry; grp.add(c);
        const body = lam(paint(hex)), chrome = ps2Mat('diner_chrome', 1, 1), glass = new THREE.MeshLambertMaterial({ color: 0x182a3a, emissive: 0x101a2a });
        eb(4.9, 0.55, 2.0, body, 0, 0.42, 0, c);             // lower body, slammed
        eb(4.9, 0.1, 2.06, chrome, 0, 0.7, 0, c);            // chrome trim line
        eb(2.5, 0.55, 1.75, body, -0.3, 0.97, 0, c);         // cabin
        eb(2.2, 0.42, 1.8, glass, -0.3, 1.0, 0, c);          // windows
        eb(2.6, 0.08, 1.9, body, -0.3, 1.28, 0, c);          // roof
        eb(0.12, 0.28, 2.0, chrome, 2.5, 0.35, 0, c); eb(0.12, 0.28, 2.0, chrome, -2.5, 0.35, 0, c); // bumpers
        eb(0.08, 0.16, 0.4, new THREE.MeshBasicMaterial({ color: 0xfff0b0 }), 2.47, 0.55, 0.7, c); eb(0.08, 0.16, 0.4, new THREE.MeshBasicMaterial({ color: 0xfff0b0 }), 2.47, 0.55, -0.7, c);
        eb(0.08, 0.16, 0.4, new THREE.MeshBasicMaterial({ color: 0xff2020 }), -2.47, 0.55, 0.7, c); eb(0.08, 0.16, 0.4, new THREE.MeshBasicMaterial({ color: 0xff2020 }), -2.47, 0.55, -0.7, c);
        [[1.5, 1], [-1.5, 1], [1.5, -1], [-1.5, -1]].forEach(function (w) {
          const t = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10), lam(null, 0x141414)); t.rotation.x = Math.PI / 2; t.position.set(w[0], 0.34, w[1] * 0.98); c.add(t);
          const r = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.28, 10), new THREE.MeshBasicMaterial({ color: 0xe8e8e0 })); r.rotation.x = Math.PI / 2; r.position.copy(t.position); c.add(r);
        });
      };
      lowrider(-4.5, 19, 0.35, '#7a1fa8'); lowrider(5, 28, Math.PI / 2 - 0.05, '#1fa87a'); lowrider(12.5, 18.5, -0.4, '#d82828');
    } catch (err) { console.error('BUCK exterior', err && (err.stack || err)); }
  })();
  // ---- across-the-road SA-style shop row + motel pylon (original art, generated) ----
  (function shopRow() {
    try {
      const ext = scene.getObjectByName('exterior'); if (!ext) return;
      let sd = 11; const rn = function () { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
      const shops = [['TACOS', '#e8a0c0', '#7a1e4a'], ['LIQUOR', '#7ad0c0', '#1a4a50'], ['PAWN', '#f0d060', '#6a4a10'], ['NAILS', '#c8a0e8', '#4a2a70'], ['TIRES', '#e07a50', '#5a2410'], ['MOTEL', '#a8d890', '#2a5a28'], ['CASH 4 GOLD', '#f2e0a0', '#7a2a1a']];
      shops.forEach(function (sp, i) {
        const x = -52 + i * 17.5, w = 15.5, h = 5.6 + rn() * 2.2;
        const tex = canvasTex(function (g, W, H) {
          g.fillStyle = sp[1]; g.fillRect(0, 0, W, H);
          if (window.PS2 && PS2.brickCanvas) { g.globalAlpha = 0.62; for (let bx = 0; bx < W; bx += 128) for (let by = 0; by < H; by += 128) g.drawImage(PS2.brickCanvas, bx, by); g.globalAlpha = 0.28; g.fillStyle = sp[1]; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
          if (i % 2 === 0) { // original spray tag + drips (code-painted, no third-party art)
            const tc = ['#ff4fa0', '#38e0c0', '#ffd23a'][i % 3]; g.save(); g.translate(W * 0.3, H * 0.88); g.rotate(-0.12); g.font = 'italic bold 30px Arial Black, Arial, sans-serif'; g.lineWidth = 5; g.strokeStyle = 'rgba(20,10,10,0.8)'; g.strokeText('VATO', 0, 0); g.fillStyle = tc; g.fillText('VATO', 0, 0); g.restore();
            g.fillStyle = tc; for (let d = 0; d < 4; d++) g.fillRect(W * 0.3 + 6 + d * 17, H * 0.88 + 2, 2, 6 + ((d * 5 + i) % 9));
          }
          for (let k = 0; k < 220; k++) { g.fillStyle = rn() < 0.5 ? 'rgba(60,40,30,0.18)' : 'rgba(255,255,255,0.14)'; g.fillRect((rn() * W) | 0, (rn() * H) | 0, 3, 2); }
          g.fillStyle = sp[2]; g.fillRect(0, 0, W, 22);                           // parapet band
          g.fillStyle = '#f6efe0'; g.font = 'bold 20px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sp[0], W / 2, 12);
          g.fillStyle = '#1c1416'; g.fillRect(14, 48, 70, 54); g.fillRect(W - 84, 48, 70, 54); g.fillRect(W / 2 - 18, 52, 36, 76);   // windows + door
          g.strokeStyle = '#8a8a90'; g.lineWidth = 2; for (let b = 0; b < 6; b++) { g.beginPath(); g.moveTo(22 + b * 11, 48); g.lineTo(22 + b * 11, 102); g.stroke(); g.beginPath(); g.moveTo(W - 76 + b * 11, 48); g.lineTo(W - 76 + b * 11, 102); g.stroke(); }
          g.fillStyle = sp[2]; g.fillRect(8, 34, W - 16, 8);                       // awning
          for (let a = 0; a < 12; a++) { g.fillStyle = a % 2 ? '#f6efe0' : sp[2]; g.fillRect(8 + a * ((W - 16) / 12), 40, (W - 16) / 12, 6); }
          g.fillStyle = '#ffd35a'; g.fillRect(W / 2 - 14, 58, 28, 8);             // OPEN glow
          if (i % 3 === 1) { g.strokeStyle = '#2ad06a'; g.lineWidth = 4; g.beginPath(); g.moveTo(92, 118); g.bezierCurveTo(110, 96, 130, 126, 150, 104); g.bezierCurveTo(160, 96, 176, 120, 190, 108); g.stroke(); }  // graffiti tag
        }, 256, 128);
        const m = new THREE.MeshLambertMaterial({ map: tex }); m.userData.ps2KeepMap = true;
        const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), hookSnap(m)); front.position.set(x, h / 2, 41.9); front.rotation.y = Math.PI; ext.add(front);
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 9), hookSnap(new THREE.MeshLambertMaterial({ color: 0x8a6a5a }))); body.position.set(x, h / 2, 46.5); ext.add(body);
      });
      // motel pylon sign near the lot
      const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 10, 6), hookSnap(new THREE.MeshLambertMaterial({ color: 0x555058 }))); pm.position.set(23, 5, 19); ext.add(pm);
      const pylon = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.4), neonSign('MOTEL · VACANCY', '#ff4a2a', 512, 256)); pylon.position.set(23, 10.6, 19); ext.add(pylon); neon.push(pylon);
      const pyl2 = pylon.clone(); pyl2.rotation.y = Math.PI; pyl2.position.z = 18.9; ext.add(pyl2); neon.push(pyl2);
    } catch (e) { console.error('BUCK shopRow', e && (e.stack || e)); }
  })();
  // ---- Poly Pizza CC BY street models (palm, cars, telephone poles); procedural versions stay as fallback ----
  (function streetModels() {
    try {
      const pack = window.BUCK_STREET_MODELS;
      if (!pack || typeof THREE.GLTFLoader !== 'function') return;
      const ext = scene.getObjectByName('exterior'); if (!ext) return;
      const loader = new THREE.GLTFLoader();
      const dec = function (b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
      const skinM = function (o) {
        o.traverse(function (m) {
          if (!m.isMesh) return;
          if (m.isSkinnedMesh) m.frustumCulled = false;
          const arr = Array.isArray(m.material) ? m.material : [m.material];
          const out = arr.map(function (mm) {
            const map = mm.map || null;
            if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter; map.generateMipmaps = false; if (THREE.sRGBEncoding) map.encoding = THREE.sRGBEncoding; map.needsUpdate = true; }
            const l = new THREE.MeshLambertMaterial({ map: map, color: mm.color ? mm.color.clone() : 0xffffff, side: mm.side === THREE.DoubleSide || (mm.alphaTest > 0) ? THREE.DoubleSide : THREE.FrontSide, alphaTest: mm.alphaTest || 0, transparent: !!mm.transparent });
            if (map) l.userData.ps2KeepMap = true;
            return hookSnap(l);
          });
          m.material = Array.isArray(m.material) ? out : out[0];
        });
      };
      const place = function (obj, size, axis, x, z, yaw, sy) {
        const w = new THREE.Group(); w.add(obj); obj.scale.set(1, 1, 1); obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0); obj.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(obj), sz = bb.getSize(new THREE.Vector3());
        const sc = size / (axis === 'y' ? sz.y : sz.z); obj.scale.setScalar(sc);
        if (sy) obj.scale.y *= sy;
        const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3());
        obj.position.set(-c.x, -b2.min.y, -c.z);
        w.position.set(x, 0, z); w.rotation.y = yaw; ext.add(w); return w;
      };
      const load = function (key, fn) { if (!pack[key]) return; loader.parse(dec(pack[key]), '', function (g) { try { const o = g.scene || g.scenes[0]; skinM(o); fn(o, g); } catch (e) { console.error('BUCK street', key, e); } }, function () {}); };
      const hide = function (n) { ext.children.forEach(function (c) { if (c.name === n) c.visible = false; }); };
      load('palm', function (o) {
        hide('procPalm');
        [[-19, 21, 8.5], [-7, 22.5, 7.5], [9, 22, 9], [21, 21, 8], [-14, 14.5, 7], [14.5, 14.5, 7.5], [-34, 24, 8.5], [32, 23, 8.5]].forEach(function (p, i) { const pw = place(i ? o.clone() : o, p[2], 'y', p[0], p[1], i * 1.3, 1); const ph = i * 1.7; (window.__buckLife = window.__buckLife || []).push(function (t) { pw.rotation.z = Math.sin(t * 0.9 + ph) * 0.018; pw.rotation.x = Math.cos(t * 0.7 + ph) * 0.012; }); });
      });
      load('convertible', function (o) { place(o, 4.9, 'z', -4.5, 19, 0.95, 0.9); });
      load('car', function (o) { place(o, 4.4, 'z', 12.5, 18.5, -0.5, 0.9); });
      load('telepole', function (o) {
        hide('procPole');
        [-17, 17].forEach(function (x, i) { place(i ? o.clone() : o, 9, 'y', x, 25, Math.PI / 2, 1); });
      });
      load('p_street', function (o) { [[-9, 23.6], [9, 23.6], [27, 23.6]].forEach(function (p, i) { place(i ? o.clone() : o, 7, 'y', p[0], p[1], Math.PI * 0, 1); }); });
      load('p_street2', function (o) { place(o, 6.5, 'y', -24, 14, Math.PI / 2, 1); place(o.clone(), 6.5, 'y', 24, 14, -Math.PI / 2, 1); });
      load('p_dumpster', function (o) { place(o, 1.5, 'y', -13.5, 16, 0.25, 1); });
      load('p_hydrant', function (o) { place(o, 1.0, 'y', 15, 24.3, 0, 1); place(o.clone(), 1.0, 'y', -12, 24.3, 0, 1); });
      load('p_trash', function (o) { place(o, 0.95, 'y', 3.2, 15.6, 0, 1); place(o.clone(), 0.95, 'y', -8.2, 15.7, 0, 1); });
      load('p_moto', function (o) { place(o, 2.2, 'z', -1.5, 16.6, -0.6, 1); place(o.clone(), 2.2, 'z', 2.0, 17.4, 0.5, 1); });
      load('p_mailbox', function (o) { place(o, 1.3, 'y', 16.8, 24.2, 0, 1); });
      load('p_vend', function (o) { place(o, 2.0, 'y', 9.6, 13.6, 0, 1); });
      load('p_traffic', function (o) { place(o, 6.2, 'y', 18.5, 25.3, 0, 1); });
      // ---- Kenney CC0 retro urban kit: parked trucks, desert shrubs, barriers, sheds, lamps ----
      const UK = window.BUCK_URBAN;
      const loadU = function (key, fn) { if (!UK || !UK[key]) return; loader.parse(dec(UK[key]), '', function (g) { try { const o = g.scene || g.scenes[0]; skinM(o); fn(o); } catch (e) { console.error('BUCK urban', key, e); } }, function () {}); };
      loadU('truck_green', function (o) { place(o, 5.4, 'z', -26, 19.5, Math.PI / 2 + 0.06, 1); });
      loadU('truck_grey_cargo', function (o) { place(o, 5.0, 'z', 27, 18.2, -Math.PI / 2 + 0.1, 1); });
      loadU('tree_shrub', function (o) { [[-30, 27.5], [-22, 38.5], [-12, 39.2], [-3, 38.6], [6, 39.3], [15, 38.4], [25, 39.0], [33, 27.8], [-34, 17], [34, 16], [-16, 26.5], [20, 26.6]].forEach(function (p, i) { place(i ? o.clone() : o, 0.9 + (i % 3) * 0.25, 'y', p[0], p[1], i * 1.9, 1); }); });
      loadU('detail_barrier_type_a', function (o) { [[-8.5, 26.2, 0.1], [-6.2, 26.0, -0.1], [8.0, 26.1, 0.05], [12.5, 26.2, 0]].forEach(function (p, i) { place(i ? o.clone() : o, 1.15, 'y', p[0], p[1], p[2], 1); }); });
      loadU('detail_barrier_strong_type_a', function (o) { place(o, 2.0, 'z', 30, 24.8, 0.15, 1); place(o.clone(), 2.0, 'z', -32, 24.6, -0.1, 1); });
      loadU('wall_a_roof_slant_detailed', function (o) { place(o, 3.4, 'y', -36, 11, 0.3, 1); });
      loadU('wall_b_roof_slant_detailed', function (o) { place(o, 3.2, 'y', 36, 10, -0.3, 1); });
      loadU('detail_light_single', function (o) { [-21, 3.5, 24].forEach(function (x, i) { place(i ? o.clone() : o, 5.6, 'y', x, 24.9, 0, 1); }); });
      loadU('pallet', function (o) { place(o, 1.1, 'z', 18, 13.2, 0.4, 1); place(o.clone(), 1.1, 'z', 19.4, 13.6, -0.2, 1); });
      // ---- life: animated peds, patrolling cops, driving low-rider, flashing police lights, swaying palms ----
      const life = window.__buckLife = window.__buckLife || [];
      const actor = function (key, size, x, z, yaw, clipName, opts) {
        opts = opts || {};
        load(key, function (o, g) {
          const w = place(o, size, 'y', x, z, yaw, 1); w.position.y = opts.y || 0; w.name = opts.name || 'ped';
          const st = { ph: Math.random() * 6.28, yaw0: yaw, dir: 1 };
          if (clipName && g.animations && g.animations.length) {
            const clip = g.animations.filter(function (a) { return a.name.indexOf(clipName) >= 0; })[0];
            if (clip) { st.mixer = new THREE.AnimationMixer(o); const act = st.mixer.clipAction(clip); act.play(); act.time = st.ph; }
          }
          life.push(function (t, dt) {
            if (st.mixer) st.mixer.update(dt);
            if (opts.patrol) {
              const p = opts.patrol; w.position.x += st.dir * p.speed * dt;
              if (w.position.x > p.max) st.dir = -1; if (w.position.x < p.min) st.dir = 1;
              w.rotation.y = st.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
            } else if (opts.dance) {
              w.position.y = (opts.y || 0) + Math.abs(Math.sin(t * 5 + st.ph)) * 0.09;
              w.rotation.y = st.yaw0 + Math.sin(t * 2.2 + st.ph) * 0.45;
              w.rotation.z = Math.sin(t * 5 + st.ph) * 0.05;
            }
          });
        });
      };
      // ---- Kenney CC0 chunky characters (rigged, idle/run clips, painted 128px skins) ----
      const KP = window.BUCK_KENNEY;
      const kActor = function (skin, size, x, z, yaw, clipName, opts) {
        if (!KP || !KP.glb || !KP[skin]) return false;
        opts = opts || {};
        loader.parse(dec(KP.glb), '', function (g) {
          try {
            const o = g.scene || g.scenes[0];
            const img = new Image(); const tex = new THREE.Texture(img); img.onload = function () { tex.needsUpdate = true; }; img.src = 'data:image/png;base64,' + KP[skin];
            tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
            o.traverse(function (m) { if (!m.isMesh) return; m.frustumCulled = false; const l = new THREE.MeshLambertMaterial({ map: tex }); l.userData.ps2KeepMap = true; m.material = hookSnap(l); });
            const w = place(o, size, 'y', x, z, yaw, 1); w.position.y = opts.y || 0; w.name = opts.name || 'ped';
            const st = { ph: Math.random() * 6.28, yaw0: yaw, dir: 1 };
            const clip = g.animations.filter(function (a) { return a.name === (clipName || 'idle'); })[0];
            if (clip) { st.mixer = new THREE.AnimationMixer(o); const act = st.mixer.clipAction(clip); act.timeScale = opts.ts || 1; act.play(); act.time = st.ph % clip.duration; }
            life.push(function (t, dt) {
              if (st.mixer) st.mixer.update(dt);
              if (opts.patrol) {
                const p = opts.patrol; w.position.x += st.dir * p.speed * dt;
                if (w.position.x > p.max) st.dir = -1; if (w.position.x < p.min) st.dir = 1;
                w.rotation.y = st.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
              } else if (opts.dance) {
                w.position.y = (opts.y || 0) + Math.abs(Math.sin(t * 5 + st.ph)) * 0.09;
                w.rotation.y = st.yaw0 + Math.sin(t * 2.2 + st.ph) * 0.45;
                w.rotation.z = Math.sin(t * 5 + st.ph) * 0.05;
              }
            });
          } catch (e) { console.error('BUCK kenney', skin, e); }
        }, function () {});
        return true;
      };
      // ---- PS2-era CC0 characters (Wobble Blocks): painted faces, 10 outfit/skin variants, procedural idle/walk/dance ----
      const PS2RIG = function (o) {
        o.updateMatrixWorld(true);
        const sk = {}; o.traverse(function (m) { if (m.isSkinnedMesh && m.skeleton) m.skeleton.bones.forEach(function (b) { if (!sk[b.name]) sk[b.name] = b; }); });
        const B = {}; ['Hips','Spine','Spine1','Spine2','Neck','Head','UpperArmR','UpperArmL','ForeArmR','ForeArmL','UpperLegR','UpperLegL','LowerLegR','LowerLegL','FootR','FootL','ShoulderR','ShoulderL'].forEach(function (n) { let b = sk[n] || sk[n + '_1'] || o.getObjectByName(n); if (b && b.parent && !b.parent.isBone && b.parent.name === n + '_1') b = b.parent; B[n] = b; });
        const wq = function (b) { return b.getWorldQuaternion(new THREE.Quaternion()); };
        // arms down: aim bone toward child downward
        const aim = function (b, child, dir) {
          if (!b || !child) return;
          o.updateMatrixWorld(true);
          const p = b.getWorldPosition(new THREE.Vector3()), c = child.getWorldPosition(new THREE.Vector3());
          const cur = c.sub(p).normalize();
          const dq = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize());
          const nw = dq.multiply(wq(b)); const pq = wq(b.parent).invert();
          b.quaternion.copy(pq.multiply(nw)); o.updateMatrixWorld(true);
        };
        aim(B.UpperArmR, B.ForeArmR, new THREE.Vector3(-0.10, -1, 0.04));
        aim(B.UpperArmL, B.ForeArmL, new THREE.Vector3(0.10, -1, 0.04));
        aim(B.ForeArmR, B.HandR || B.ForeArmR.children[0], new THREE.Vector3(-0.06, -1, 0.35));
        aim(B.ForeArmL, B.HandL || B.ForeArmL.children[0], new THREE.Vector3(0.06, -1, 0.35));
        const base = {}, axisP = {};
        const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
        Object.keys(B).forEach(function (k) { const b = B[k]; if (!b) return; base[k] = b.quaternion.clone(); const pq = wq(b.parent).invert(); axisP[k] = { x: X.clone().applyQuaternion(pq), y: Y.clone().applyQuaternion(pq), z: Z.clone().applyQuaternion(pq) }; });
        const q = new THREE.Quaternion(), qq = new THREE.Quaternion();
        // rot: bone name, axis 'x'|'y'|'z' (object space), angle
        const set = function (n, ax, ang, ax2, ang2) {
          const b = B[n]; if (!b) return;
          q.setFromAxisAngle(axisP[n][ax], ang);
          if (ax2) { qq.setFromAxisAngle(axisP[n][ax2], ang2); q.multiply(qq); }
          b.quaternion.copy(q).multiply(base[n]);
        };
        const hip0 = B.Hips ? B.Hips.position.clone() : null;
        return {
          B: B,
          update: function (mode, t, ph, spd) {
            t = t + ph;
            if (mode === 'walk') {
              const w = t * (spd || 6), s = Math.sin(w), c = Math.cos(w);
              set('UpperLegR', 'x', s * 0.62); set('UpperLegL', 'x', -s * 0.62);
              set('LowerLegR', 'x', Math.max(0, -s) * 0.9); set('LowerLegL', 'x', Math.max(0, s) * 0.9);
              set('UpperArmR', 'x', -s * 0.55); set('UpperArmL', 'x', s * 0.55);
              set('ForeArmR', 'x', -0.35 - Math.max(0, s) * 0.5); set('ForeArmL', 'x', -0.35 - Math.max(0, -s) * 0.5);
              set('Spine1', 'y', s * 0.08); set('Head', 'y', -s * 0.05);
              if (hip0) B.Hips.position.y = hip0.y + Math.abs(c) * 0.012;
            } else if (mode === 'dance') {
              const s = Math.sin(t * 5), c = Math.cos(t * 5), s2 = Math.sin(t * 2.5);
              set('UpperArmR', 'z', -1.1 + c * 0.5, 'x', -0.4 + s * 0.3); set('UpperArmL', 'z', 1.1 - c * 0.5, 'x', -0.4 - s * 0.3);
              set('ForeArmR', 'x', -0.9 + s * 0.4); set('ForeArmL', 'x', -0.9 - s * 0.4);
              set('Spine1', 'z', s2 * 0.12); set('Spine2', 'y', s2 * 0.18); set('Head', 'z', -s2 * 0.12);
              set('UpperLegR', 'x', Math.max(0, s) * 0.35); set('UpperLegL', 'x', Math.max(0, -s) * 0.35);
              set('LowerLegR', 'x', Math.max(0, s) * 0.5); set('LowerLegL', 'x', Math.max(0, -s) * 0.5);
              if (hip0) { B.Hips.position.y = hip0.y - Math.abs(s) * 0.03; }
            } else { // idle
              const s = Math.sin(t * 1.6), s2 = Math.sin(t * 0.8);
              set('Spine1', 'x', s * 0.015); set('Spine2', 'z', s2 * 0.025); set('Head', 'y', s2 * 0.22, 'x', s * 0.02);
              set('UpperArmR', 'x', s * 0.03); set('UpperArmL', 'x', -s * 0.03);
              set('UpperLegR', 'z', 0); if (hip0) B.Hips.position.y = hip0.y + s * 0.004;
            }
          }
        };
      };

      const PP = window.BUCK_PS2CHARS, pTex = {}, pBuf = {};
      const pTexture = function (key, b64) {
        if (pTex[key]) return pTex[key];
        const img = new Image(), t = new THREE.Texture(img); img.onload = function () { t.needsUpdate = true; }; img.src = 'data:image/png;base64,' + b64;
        t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
        return (pTex[key] = t);
      };
      const HAIR = [0xffffff, 0xd8b070, 0x555555, 0xff9060, 0x999999];
      const pActor = function (gender, variant, hairIdx, size, x, z, yaw, mode, opts) {
        if (!PP || !PP[gender] || !PP[(gender === 'masc' ? 'm' : 'f') + variant]) return false;
        opts = opts || {};
        loader.parse(pBuf[gender] || (pBuf[gender] = dec(PP[gender])), '', function (g) {
          try {
            const o = g.scene || g.scenes[0];
            const skinT = pTexture((gender === 'masc' ? 'm' : 'f') + variant, PP[(gender === 'masc' ? 'm' : 'f') + variant]), hairT = pTexture('hair', PP.hair), eyeT = pTexture('eye', PP.eye);
            o.traverse(function (m) {
              if (!m.isMesh) return; m.frustumCulled = false;
              const nm = (m.material && m.material.name) || m.name;
              const l = new THREE.MeshLambertMaterial({ map: nm === 'hair' ? hairT : (nm === 'eyes' ? eyeT : skinT), color: nm === 'hair' ? HAIR[hairIdx % HAIR.length] : 0xffffff, side: THREE.DoubleSide });
              l.userData.ps2KeepMap = true; m.material = hookSnap(l);
            });
            const rig = PS2RIG(o);
            const w = new THREE.Group(); w.add(o); o.scale.setScalar(size / 1.775); w.position.set(x, opts.y || 0, z); w.rotation.y = yaw; w.name = opts.name || 'ped'; ext.add(w);
            const st = { ph: Math.random() * 20, yaw0: yaw, dir: 1 };
            life.push(function (t, dt) {
              if (opts.patrol) {
                const p = opts.patrol; w.position.x += st.dir * p.speed * dt;
                if (w.position.x > p.max) st.dir = -1; if (w.position.x < p.min) st.dir = 1;
                w.rotation.y = st.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
              }
              rig.update(mode, t, st.ph, opts.patrol ? Math.max(4.5, opts.patrol.speed * 3.1) : 6);
              if (mode === 'dance') { w.rotation.y = st.yaw0 + Math.sin(t * 1.6 + st.ph) * 0.35; }
            });
          } catch (e) { console.error('BUCK ps2char', e); }
        }, function () {});
        return true;
      };
      // ---- Sketchfab CC-BY animated PS1-style characters (jailer, street guy) ----
      const SK = window.BUCK_SK;
      const sActor = function (key, size, x, z, yaw, clipName, opts) {
        if (!SK || !SK[key]) return false;
        opts = opts || {};
        loader.parse(dec(SK[key]), '', function (g) {
          try {
            const o = g.scene || g.scenes[0];
            o.traverse(function (m) {
              if (!m.isMesh) return; m.frustumCulled = false;
              const arr = Array.isArray(m.material) ? m.material : [m.material];
              const out = arr.map(function (mm) {
                const map = mm.map || null;
                if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter; map.generateMipmaps = false; if (THREE.sRGBEncoding) map.encoding = THREE.sRGBEncoding; map.needsUpdate = true; }
                const l = new THREE.MeshLambertMaterial({ map: map, color: mm.color ? mm.color.clone() : 0xffffff, side: THREE.DoubleSide, alphaTest: mm.alphaTest || 0, transparent: !!mm.transparent });
                if (map) l.userData.ps2KeepMap = true; return hookSnap(l);
              });
              m.material = Array.isArray(m.material) ? out : out[0];
            });
            const clip = g.animations.filter(function (a) { return a.name === clipName; })[0] || g.animations[0];
            const mixer = new THREE.AnimationMixer(o); const act = mixer.clipAction(clip); act.timeScale = opts.ts || 1; if (opts.pp && THREE.LoopPingPong) act.setLoop(THREE.LoopPingPong, Infinity); act.play(); mixer.update(0.01);
            o.updateMatrixWorld(true);
            let mn = 1e9, mx = -1e9; o.traverse(function (b) { if (b.isBone) { const y = b.getWorldPosition(new THREE.Vector3()).y; if (y < mn) mn = y; if (y > mx) mx = y; } });
            const h = Math.max(mx - mn, 1e-4), s = size / (h * 1.06);
            const w = new THREE.Group(); w.add(o); o.scale.setScalar(s); o.position.y = -mn * s; w.position.set(x, opts.y || 0, z); w.rotation.y = yaw; w.name = opts.name || 'ped'; ext.add(w);
            const st = { ph: Math.random() * 6, dir: 1 };
            act.time = st.ph % clip.duration;
            life.push(function (t, dt) {
              mixer.update(dt);
              if (opts.patrol) {
                const p = opts.patrol; w.position.x += st.dir * p.speed * dt;
                if (w.position.x > p.max) st.dir = -1; if (w.position.x < p.min) st.dir = 1;
                w.rotation.y = st.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
              }
            });
          } catch (e) { console.error('BUCK sk', key, e); }
        }, function () {});
        return true;
      };
      // ---- Quaternius Universal Base Characters (CC0): detailed 512px-texture men with painted clothing, hair and beard ----
      const UBC = window.BUCK_UBC;
      const uActor = function (skinKey, hairKey, hairColor, size, x, z, yaw, opts) {
        if (!UBC || !UBC.male) return false;
        opts = opts || {};
        loader.parse(dec(UBC.male), '', function (g) {
          try {
            const o = g.scene || g.scenes[0];
            let skinTex = null; const applySkin = function () { if (!skinTex) return; o.traverse(function (m) { if (!m.isMesh || !/SuperHero_Male/i.test(m.name)) return; const ms = Array.isArray(m.material) ? m.material : [m.material]; ms.forEach(function (mm) { if (mm.map !== skinTex) { mm.map = skinTex; if (mm.color) mm.color.set(0xffffff); mm.needsUpdate = true; } }); }); };
            const im = new Image(); im.onload = function () { skinTex = new THREE.Texture(im); skinTex.flipY = false; skinTex.anisotropy = 8; if (THREE.sRGBEncoding) skinTex.encoding = THREE.sRGBEncoding; skinTex.needsUpdate = true; applySkin(); }; im.src = 'data:image/jpeg;base64,' + UBC.skins[skinKey];
            let skinN = 0; life.push(function () { if (skinN++ % 30 === 0) applySkin(); });
            o.traverse(function (m) { if (!m.isMesh) return; m.frustumCulled = false; const mm = m.material;  });
            const bone = function (n) { let f = null; o.traverse(function (b) { if (b.name === n) f = b; }); return f; };
            const ul = bone('upperarm_l'), ur = bone('upperarm_r'), sp = bone('spine_02'), pv = bone('pelvis');
            if (ul && ur) { ul.rotation.z -= 1.15; ur.rotation.z += 1.15; }
            const sp0 = sp ? sp.rotation.x : 0, pv0 = pv ? pv.rotation.y : 0, ph = Math.random() * 6;
            life.push(function (t) { if (sp) sp.rotation.x = sp0 + 0.012 * Math.sin(t * 1.7 + ph); if (pv) pv.rotation.y = pv0 + 0.03 * Math.sin(t * 0.6 + ph); });
            [hairKey, 'hairBeard'].forEach(function (hk) {
              if (!hk || !UBC[hk] || (hk === 'hairBeard' && !opts.beard)) return;
              loader.parse(dec(UBC[hk]), '', function (h) { h.scene.traverse(function (m) { if (m.isMesh) { m.material.color && m.material.color.setHex(hairColor); m.frustumCulled = false; } }); o.add(h.scene); }, function () {});
            });
            o.updateMatrixWorld(true);
            const w = new THREE.Group(); w.add(o); o.scale.setScalar(size / 1.81); w.position.set(x, opts.y || 0, z); w.rotation.y = yaw; w.name = opts.name || 'ped'; ext.add(w);
          } catch (e) { console.error('BUCK ubc', e); }
        }, function () {});
        return true;
      };
      uActor('dark_tee', 'hairBuzzed', 0x1a1008, 1.82, 2.0, -5.5, 0.05, { name: 'barPed', beard: true });
      uActor('light_hoodie', 'hairBuzzed', 0x3a2412, 1.84, -6.4, -4.6, -0.1, { name: 'barPed' });
      uActor('dark_hoodie', 'hairBuzzed', 0x120a06, 1.8, 4.2, 17.4, -0.6, { beard: true });
      uActor('light_tee', 'hairBuzzed', 0x5a3a1e, 1.82, -7.0, 21.0, 0.8, {});
      // outside: cops on patrol + a runner on the lot, porch peds dancing
      if (!pActor('masc', 8, 2, 1.8, 11.6, 26.0, Math.PI / 2, 'walk', { patrol: { min: 3, max: 15, speed: 1.0 } }))
      if (!kActor('criminalMaleA', 1.75, 11.6, 26.0, Math.PI / 2, 'run', { ts: 0.45, patrol: { min: 3, max: 15, speed: 0.9 } })) actor('c_officer', 1.7, 11.6, 26.0, Math.PI / 2, 'Walk', { patrol: { min: 3, max: 15, speed: 0.9 } });
      if (!pActor('femme', 8, 1, 1.72, 13.0, 26.3, Math.PI - 0.9, 'idle', {}))
      if (!kActor('skaterFemaleA', 1.7, 13.0, 26.3, Math.PI - 0.9, 'idle')) actor('c_femoff', 1.7, 13.0, 26.3, Math.PI - 0.9, 'Idle');
      if (!sActor('jailer', 1.8, 14.4, 20.2, Math.PI / 2, 'Walking_1_24', { ts: 1.7, patrol: { min: 6, max: 20, speed: 2.6 } }))
      if (!pActor('masc', 2, 0, 1.78, 14.4, 20.2, Math.PI / 2, 'walk', { patrol: { min: 6, max: 20, speed: 4.2 } }))
      if (!kActor('skaterMaleA', 1.65, 14.4, 20.2, Math.PI / 2, 'run', { patrol: { min: 6, max: 20, speed: 4.2 } })) actor('c_prisoner', 1.5, 14.4, 20.2, Math.PI / 2, 'Sprint', { patrol: { min: 6, max: 20, speed: 4.2 } });
      actor('c_cowgirl', 1.72, -4.2, 15.3, 0.15, null, { y: 0.17, dance: true });
      if (!sActor('ceomi', 1.72, -1.9, 15.1, -0.2, 'Armature|Armature.001|stand_dancebattle_f', { y: 0.17, pp: true }))
      if (!pActor('femme', 7, 3, 1.72, -1.9, 15.1, -0.2, 'dance', { y: 0.17 }))
      if (!kActor('cyborgFemaleA', 1.7, -1.9, 15.1, -0.2, 'idle', { y: 0.17, dance: true })) actor('c_punkgirl', 1.7, -1.9, 15.1, -0.2, null, { y: 0.17, dance: true });
      pActor('masc', 5, 1, 1.8, 4.6, 15.2, 0.1, 'dance', { y: 0.17 }); pActor('femme', 3, 2, 1.7, -4.2, 15.3, 0.15, 'dance', { y: 0.17 });
      sActor('ceomi', 1.76, -0.3, -6.4, 0.05, 'Armature|Armature.001|stand_dancebattle_f', { pp: true, name: 'barPed', ts: 0.9 });
      sActor('jailer', 1.8, -9.5, 22.8, 0.6, 'Idle2', {}); sActor('man', 1.82, 7.0, 21.5, -0.8, 'mixamo.com', {});
      pActor('masc', 6, 2, 1.82, 18.8, 23.4, -1.2, 'idle', {}); pActor('femme', 9, 4, 1.7, -14.5, 24.0, 0.9, 'idle', {}); pActor('masc', 9, 0, 1.78, -15.3, 23.6, 1.4, 'idle', {});
      actor('c_cowboy2', 1.8, 4.6, 15.2, 0.1, null, { y: 0.17, dance: true });
      // inside the bar, behind the ring, facing the rider
      if (!pActor('masc', 0, 2, 1.9, -3.4, -5.6, 0.1, 'dance', { name: 'barPed' }))
      if (!kActor('criminalMaleA', 1.95, -3.4, -5.6, 0.1, 'idle', { name: 'barPed', dance: true })) actor('c_officer', 1.9, -3.4, -5.6, 0.1, 'Idle', { name: 'barPed' });
      if (!pActor('femme', 7, 3, 1.82, 3.6, -5.6, -0.1, 'dance', { name: 'barPed' }))
      if (!kActor('skaterFemaleA', 1.9, 3.6, -5.6, -0.1, 'idle', { name: 'barPed', dance: true })) actor('c_femoff', 1.9, 3.6, -5.6, -0.1, 'Jump', { name: 'barPed' });
      if (!pActor('masc', 3, 0, 1.86, 0.4, -5.4, 0, 'idle', { name: 'barPed' }))
      if (!kActor('skaterMaleA', 1.8, 0.4, -5.4, 0, 'idle', { name: 'barPed', dance: true })) actor('c_prisoner', 1.7, 0.4, -5.4, 0, 'Jump', { name: 'barPed' });
      if (!pActor('femme', 4, 1, 1.8, -6.2, -5.9, 0.25, 'dance', { name: 'barPed' }))
      if (!kActor('cyborgFemaleA', 1.85, -6.2, -5.9, 0.25, 'idle', { name: 'barPed', dance: true })) actor('c_punkgirl', 1.8, -6.2, -5.9, 0.25, null, { name: 'barPed', dance: true });
      pActor('masc', 6, 2, 1.86, 6.4, -5.9, -0.25, 'dance', { name: 'barPed' }); pActor('femme', 1, 3, 1.78, -8.6, -5.3, 0.4, 'idle', { name: 'barPed' }); pActor('masc', 9, 4, 1.84, 8.7, -5.3, -0.4, 'idle', { name: 'barPed' }); pActor('femme', 5, 0, 1.8, -1.9, -6.0, 0.1, 'dance', { name: 'barPed' }); pActor('masc', 4, 1, 1.84, 2.2, -6.0, -0.1, 'dance', { name: 'barPed' });
      actor('c_cowgirl', 1.8, 6.4, -5.9, -0.25, null, { name: 'barPed', dance: true });
      // ---- Sketchfab CC-BY San Andreas-style street dressing: gangsters, lowrider, parked cars, van, slum house ----
      const GT = window.BUCK_GTA;
      const gLoad = function (key, fn) { if (!GT || !GT[key]) return; loader.parse(dec(GT[key]), '', function (g) { try { const o = g.scene || g.scenes[0]; skinM(o); fn(o); } catch (e) { console.error('BUCK gta', key, e); } }, function () {}); };
      const dropGround = function (o) {
        o.updateMatrixWorld(true); const ms = [];
        o.traverse(function (m) { if (m.isMesh) { const s = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()); ms.push([m, Math.max(s.x, s.z), s.y]); } });
        const ex = ms.map(function (a) { return a[1]; }).sort(function (a, b) { return a - b; }), med = ex[ex.length >> 1] || 1;
        ms.forEach(function (a) { if (a[1] > med * 4 && a[2] < a[1] * 0.06 && a[0].parent) a[0].parent.remove(a[0]); });
      };
      // scale by length along the long horizontal axis; yaw 0 = long axis along world z
      const placeL = function (obj, len, x, z, yaw) {
        obj.updateMatrixWorld(true); const s = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
        return place(obj, len * (s.y / Math.max(s.x, s.z, 1e-4)), 'y', x, z, yaw + (s.x > s.z ? Math.PI / 2 : 0), 1);
      };
      gLoad('brute', function (o) {
        [[-9.0, 18.8, 2.5], [-14.4, 22.2, 1.0], [-12.2, 24.8, 0.2], [5.4, 24.4, 2.9], [17.6, 16.4, -0.7], [-1.7, -7.0, 0.05, 1], [2.3, -7.2, -0.1, 1], [9.6, -5.4, -0.45, 1]].forEach(function (p, i) {
          const w = place(i ? o.clone() : o, 1.82 + (i % 3) * 0.05, 'y', p[0], p[1], p[2], 1); w.name = p[3] ? 'barPed' : 'ped';
          const ph = i * 1.37, c = w.children[0], r0 = c.rotation.y;
          life.push(function (t) { c.rotation.y = r0 + Math.sin(t * 0.55 + ph) * 0.1; c.rotation.z = Math.sin(t * 1.9 + ph) * 0.012; });
        });
      });
      gLoad('impala', function (o) {
        dropGround(o);
        const park = o.clone();
        // cruising lowrider on hydraulics, opposite lane to the camaro
        const w = placeL(o, 5.3, 48, 29.8, -Math.PI / 2); w.name = 'lowriderB';
        life.push(function (t, dt) { w.position.x -= 6.2 * dt; if (w.position.x < -62) w.position.x = 62; const hop = Math.max(0, Math.sin(t * 3.1)); w.position.y = hop * hop * 0.35; w.rotation.z = Math.sin(t * 3.1) * 0.05; });
        placeL(park, 5.3, -11.4, 20.9, 0.35);
      });
      gLoad('cars', function (o) {
        o.updateMatrixWorld(true); const cars = [];
        o.traverse(function (m) { if (m.isMesh) { const g2 = m.geometry.clone(); g2.applyMatrix4(m.matrixWorld); cars.push(new THREE.Mesh(g2, m.material)); } });
        [[-19.6, 19.2, 0.2], [2.6, 19.8, -0.15], [-3.0, 27.5, Math.PI / 2], [17.5, 27.4, -Math.PI / 2], [-24, 35.3, Math.PI / 2], [-8.0, 35.4, -Math.PI / 2], [12.5, 35.2, Math.PI / 2], [30, 35.4, -Math.PI / 2]].forEach(function (p, i) {
          if (cars[i]) placeL(cars[i], 4.7, p[0], p[1], p[2]);
        });
      });
      gLoad('van', function (o) { placeL(o, 6.0, 22.5, 35.4, -Math.PI / 2); });
      gLoad('slum', function (o) { dropGround(o); placeL(o, 11, -46, 9, 0.5); });
      // police car with flashing red/blue lights
      load('c_police', function (o) {
        const w = place(o, 4.6, 'z', 8.5, 28.2, Math.PI / 2 + 0.12, 1);
        const red = new THREE.PointLight(0xff1a1a, 0, 14, 1.5), blue = new THREE.PointLight(0x2a50ff, 0, 14, 1.5);
        red.position.set(-0.4, 2.0, 0); blue.position.set(0.4, 2.0, 0); w.add(red); w.add(blue);
        const mr = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2020 })), mb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.5), new THREE.MeshBasicMaterial({ color: 0x2a50ff }));
        mr.position.set(-0.45, 1.55, 0); mb.position.set(0.45, 1.55, 0); w.add(mr); w.add(mb);
        life.push(function (t) { const f = Math.sin(t * 9) > 0; red.intensity = f ? 2.4 : 0; blue.intensity = f ? 0 : 2.4; mr.visible = f; mb.visible = !f; });
      });
      // low-rider cruising the highway (loops), faces the direction it drives
      load('camaro', function (o) {
        hide('procCar');
        const w = place(o, 4.7, 'z', -50, 31.6, Math.PI / 2 + 0.03, 0.86); w.name = 'lowriderA';
        life.push(function (t, dt) { w.position.x += 7.5 * dt; if (w.position.x > 60) w.position.x = -60; w.position.y = Math.sin(t * 6) * 0.01; });
      });
    } catch (err) { console.error('BUCK streetModels', err && (err.stack || err)); }
  })();
  // extra grimy bar dressing and original low-res signs (no official brands)
  (function moreDressing() {
    const posters = [
      [ -10.6, 3.6, -4, 'BULL NIGHT', 0xffc230 ],
      [ -10.6, 2.4, 2.2, 'COLD ONES', 0x3E8E41 ],
      [ 10.6, 3.8, -3, 'NO FISTFIGHTS', 0xff7a40 ],
      [ 10.6, 2.5, 3, 'SATURDAY', 0xffe080 ]
    ];
    posters.forEach(function (p) {
      const m = neonSign(p[3], p[4], 256, 96);
      m.side = THREE.DoubleSide;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), hookSnap(m));
      s.name = 'wallPoster';
      s.position.set(p[0], p[1], p[2]);
      s.rotation.y = p[0] < 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(s);
    });
    // ashtrays, bowls, crates around the ring and bar
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      box(0.22, 0.08, 0.22, mat(0x6a6a68), Math.cos(a) * 3.5, 0.16, Math.sin(a) * 3.5);
    }
    box(0.7, 0.5, 0.5, ps2Mat('diner_wood', 2, 2), -7.2, 0.25, -6.4);
    box(0.55, 0.7, 0.45, ps2Mat('diner_wood', 2, 2), 7.4, 0.35, -5.8);
    box(0.28, 0.12, 0.28, metalM, -3.2, 1.22, -9.35);
    box(0.28, 0.12, 0.28, metalM, 2.4, 1.22, -9.35);
  })();

  // ---- GTA-style dressing (visual only, generated, no gameplay): bar neon beer signs, bottles, lamp light cones, pool table; street newspaper boxes, hydrants, dumpster ----
  (function buildDressing() {
    try {
      const dark = function (c) { return new THREE.MeshLambertMaterial({ color: c }); };
      const add = function (m, parent) { (parent || scene).add(m); return m; };
      // neon beer signs on the back wall and side walls
      [['COLD BEER', '#33e6ff', -7.2, 4.35, -11.6, 0], ['OPEN 24', '#ff3a3a', 7.4, 4.35, -11.6, 0], ['LIVE BULL', '#ffd23a', -11.6, 4.0, 5.5, Math.PI / 2], ['TEQUILA', '#ff4fd2', 11.6, 4.0, -5.5, -Math.PI / 2]].forEach(function (n) {
        const sgn = box(2.2, 0.55, 0.06, neonSign(n[0], n[1], 512, 128), n[2], n[3], n[4]);
        sgn.rotation.y = n[5]; neon.push(sgn);
      });
      // bottles along the bar top (generic shapes, no brands)
      const bcols = [0x2a4a26, 0x8a4a1a, 0x9a6a20, 0x3a2210, 0x1f3a22];
      for (let i = 0; i < 16; i++) {
        const bx = -6.6 + i * 0.86 + ((i * 37) % 7) * 0.03;
        const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 6), new THREE.MeshLambertMaterial({ color: bcols[i % bcols.length], emissive: bcols[i % bcols.length], emissiveIntensity: 0.12 }));
        bt.position.set(bx, 1.25, -9.45 + ((i * 13) % 5) * 0.05); add(bt);
        const nk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.12, 6), bt.material);
        nk.position.set(bx, 1.46, bt.position.z); add(nk);
      }
      // warm light cones under the lamp shades
      [-4, 1.2, 5.5].forEach(function (x) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.1, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        cone.position.set(x, 1.85, -9.15); add(cone);
      });
      // pool table in the left back corner area
      const pool = new THREE.Group(); pool.position.set(-8.2, 0, 3.2); pool.rotation.y = 0.15; add(pool);
      const rail = dark(0x4a2a14), felt = new THREE.MeshLambertMaterial({ color: 0x1f6a3c });
      box(2.6, 0.12, 1.4, rail, 0, 0.86, 0, pool); box(2.3, 0.06, 1.1, felt, 0, 0.93, 0, pool);
      [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]].forEach(function (l) { box(0.14, 0.82, 0.14, rail, l[0], 0.41, l[1], pool); });
      for (let b = 0; b < 8; b++) { const ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshLambertMaterial({ color: [0xffffff, 0xd02020, 0xe8c020, 0x2060d0, 0x20a040, 0x111111, 0xe06020, 0x8020a0][b] })); ball.position.set(-0.3 + (b % 4) * 0.12, 0.99, -0.1 + ((b / 4) | 0) * 0.12); pool.add(ball); }
      box(1.8, 0.08, 0.5, new THREE.MeshBasicMaterial({ color: 0xffc070, fog: false }), 0, 2.6, 0, pool);
      // street: newspaper boxes by the porch, hydrants, dumpster on the lot
      const grpS = new THREE.Group(); grpS.name = 'streetDressing'; scene.add(grpS);
      [[-8.6, 14.2], [-9.4, 14.2], [10.6, 15.0]].forEach(function (p, i) {
        const col = [0xc02a2a, 0x2a56c0, 0xd0a020][i];
        box(0.5, 0.9, 0.4, dark(col), p[0], 0.45, p[1], grpS);
        box(0.36, 0.3, 0.02, new THREE.MeshLambertMaterial({ color: 0xcfe6f0, emissive: 0x335566, emissiveIntensity: 0.3 }), p[0], 0.62, p[1] + 0.21, grpS);
        box(0.54, 0.06, 0.44, dark(0x222222), p[0], 0.93, p[1], grpS);
      });
      [[-13, 16.5], [15, 23.5]].forEach(function (p) {
        const hm = new THREE.MeshLambertMaterial({ color: 0xc8281e });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.62, 8), hm); body.position.set(p[0], 0.31, p[1]); grpS.add(body);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), hm); cap.position.set(p[0], 0.66, p[1]); grpS.add(cap);
        const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), hm); nz.rotation.z = Math.PI / 2; nz.position.set(p[0], 0.45, p[1]); grpS.add(nz);
      });
      box(2.2, 1.2, 1.1, dark(0x2f5a3a), 22, 0.6, 14.5, grpS); box(2.3, 0.1, 1.2, dark(0x1c3a26), 22, 1.25, 14.5, grpS);
    } catch (e) { console.error('BUCK dressing', e && (e.stack || e)); }
  })();

  const mixers = [];
  let lastAnimT = 0;
  function animate(time, level) {
    const lv = level || 1;
    const dt = lastAnimT ? Math.min(time - lastAnimT, 0.05) : 0.016;
    lastAnimT = time;
    mixers.forEach(m => m.update(dt));
    if (window.__buckLife) { for (let i = 0; i < window.__buckLife.length; i++) { try { window.__buckLife[i](time, dt); } catch (e) {} } }
    crowd.forEach(p => {
      const u = p.userData;
      if (u && u.mixer) {
        if (u.cheerUntil && time > u.cheerUntil) {
          u.cheerUntil = 0;
          playAct(p, u.kind === 'dance' ? 'dance' : 'idle');
        }
        return;
      }
      if (u && u.binds) poseHuman(p, time);
      else if (u && u.ph !== undefined) {
        p.position.y = (u.baseY || 0) + Math.abs(Math.sin(time * 4 + u.ph)) * 0.08;
        if (u.arm) u.arm.rotation.z = Math.sin(time * 6 + u.ph) * 0.3;
      }
    });
    dancers.forEach((d, i) => {
      if (d.userData && d.userData.binds) poseHuman(d, time);
      else {
        d.rotation.y = Math.sin(time * 2 + i) * 0.5;
        d.position.y = (d.userData.baseY || 1.2) + Math.abs(Math.sin(time * 5 + i)) * 0.1;
      }
    });
    if (rider && rider.userData && rider.userData.binds) poseHuman(rider, time);
    flick.forEach((l, i) => { l.intensity = l.userData.base != null ? l.userData.base : (l.intensity * (0.92 + 0.08 * Math.sin(time * 3 + i))); });
    neon.forEach((n) => { n.visible = true; });
    stars.forEach((s, i) => { s.rotation.y = time + i; });
    if (tvScreens.length) paintTV(time);
    hair.forEach((h, i) => { h.rotation.x = 0.6 + Math.sin(time * 14 + i) * 0.5; h.rotation.z = Math.sin(time * 9 + i) * 0.4; });
  }
  const tmp = new THREE.Vector3();

  // flying junk
  function junkGlass(hex, opacity) {
    return hookSnap(new THREE.MeshLambertMaterial({
      color: 0xffffff,
      map: (window.PS2 && PS2.gritTint) ? PS2.gritTint(hex) : null,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide
    }));
  }
  const glassBeer = junkGlass(0x1a6a2c, 0.7);
  const glassWhiskey = junkGlass(0x7a4210, 0.75);
  const shardBeer = junkGlass(0x1a6a2c, 0.85);
  const shardWhiskey = junkGlass(0x7a4210, 0.85);
  const JUNK_KINDS = ['beer', 'whiskey', 'bra', 'belt', 'boot', 'cig'];
  const flying = [], shards = [], junkHits = [];
  const junkPos = new THREE.Vector3();
  let junkLastT = 0;

  function makeBeer() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.58, 10), glassBeer);
    body.position.y = 0.1; g.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.1, 0.24, 10), glassBeer);
    neck.position.y = 0.5; g.add(neck);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.05, 10), glassBeer);
    lip.position.y = 0.63; g.add(lip);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.05, 8), mat(0xd4b84a));
    cap.position.y = 0.67; g.add(cap);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.155, 0.24, 10, 1, true), mat(0xe8d9a8));
    label.position.y = 0.08; g.add(label);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.153, 0.156, 0.05, 10, 1, true), mat(0xb4191d));
    stripe.position.y = 0.14; g.add(stripe);
    box(0.01, 0.3, 0.01, glow(0xccffdd), 0.13, 0.12, 0, g);
    return g;
  }
  function makeWhiskey() {
    const g = new THREE.Group();
    box(0.3, 0.52, 0.3, glassWhiskey, 0, 0.06, 0, g);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.22, 8), glassWhiskey);
    neck.position.y = 0.42; g.add(neck);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.08, 8), mat(0xc4a574));
    cork.position.y = 0.56; g.add(cork);
    box(0.31, 0.2, 0.02, mat(0xf0e6c8), 0, 0.06, 0.16, g);
    box(0.22, 0.04, 0.021, mat(0x7a1010), 0, 0.12, 0.161, g);
    box(0.01, 0.28, 0.01, glow(0xffe0a0), 0.14, 0.08, 0.14, g);
    return g;
  }
  function makeBra() { return makeBraLocal(); }
  function makeBelt() {
    const g = new THREE.Group(), leather = mat(0x5a3018);
    for (let i = 0; i < 8; i++) {
      const seg = box(0.18, 0.045, 0.13, leather, 0, Math.sin(i * 0.4) * 0.08, i * 0.13 - 0.42, g);
      seg.rotation.x = i * 0.18;
    }
    box(0.24, 0.08, 0.18, mat(0xd4b84a), 0, 0.01, -0.56, g);
    box(0.04, 0.04, 0.2, mat(0xc4a040), 0, 0.03, -0.62, g);
    box(0.12, 0.02, 0.08, mat(0x3a2010), 0, 0.05, -0.5, g);
    return g;
  }
  function makeBoot() {
    const g = new THREE.Group(), leather = mat(0x6b3a1e), dark = mat(0x3a2010);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.5, 8), leather);
    shaft.position.y = 0.38; g.add(shaft);
    box(0.18, 0.15, 0.38, leather, 0, 0.1, 0.12, g);
    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.16), leather);
    toe.position.set(0, 0.09, 0.34); g.add(toe);
    box(0.16, 0.1, 0.13, dark, 0, 0.0, -0.08, g);
    box(0.19, 0.035, 0.46, mat(0x2a1810), 0, 0.02, 0.12, g);
    box(0.03, 0.32, 0.03, mat(0xc4a574), 0.13, 0.38, 0, g);
    return g;
  }
  function makeCig() {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.58, 8), mat(0xf4efe6));
    stick.rotation.z = Math.PI / 2; g.add(stick);
    const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.13, 8), mat(0xd4a04a));
    filter.rotation.z = Math.PI / 2; filter.position.x = -0.34; g.add(filter);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), glow(0xff4a10));
    tip.position.x = 0.3; g.add(tip);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), glow(0xffe080));
    ember.position.x = 0.32; g.add(ember);
    const smokes = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), new THREE.MeshLambertMaterial({ color: 0xffffff, map: (window.PS2 && PS2.gritTint) ? PS2.gritTint(0xc8c8c8) : null, transparent: true, opacity: 0.35 }));
      g.add(s); smokes.push(s);
    }
    g.userData = { ember, smokes };
    return g;
  }
  function buildJunk(kind) {
    if (kind === 'beer') return makeBeer();
    if (kind === 'whiskey') return makeWhiskey();
    if (kind === 'bra') return makeBra();
    if (kind === 'belt') return makeBelt();
    if (kind === 'boot') return makeBoot();
    return makeCig();
  }
  function disposeGroup(g) {
    g.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.transparent && o.parent && o.parent.userData && o.parent.userData.smokes) o.material.dispose();
    });
    scene.remove(g);
  }
  function spawnShards(kind, origin) {
    const isGlass = kind === 'beer' || kind === 'whiskey';
    const n = isGlass ? 11 : 6;
    const src = kind === 'beer' ? shardBeer : kind === 'whiskey' ? shardWhiskey : mat(kind === 'bra' ? 0xc45a6a : kind === 'belt' ? 0x5a3018 : kind === 'boot' ? 0x6b3a1e : 0xf4efe6);
    for (let i = 0; i < n; i++) {
      const matl = isGlass ? src.clone() : src;
      const mesh = new THREE.Mesh(isGlass ? new THREE.TetrahedronGeometry(0.05 + Math.random() * 0.07, 0) : new THREE.BoxGeometry(0.05, 0.04, 0.08), matl);
      mesh.position.copy(origin);
      scene.add(mesh);
      shards.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 3 + 0.5, (Math.random() - 0.5) * 6),
        spin: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
        life: 0.7 + Math.random() * 0.4,
        glass: isGlass,
      });
    }
  }
  function aimChance(misses) {
    // 3 lives: at full health ~8% come at the face; at 1 life left ~55%. Smoothstep.
    const t = Math.min(Math.max((misses || 0) / 2, 0), 1);
    const s = t * t * (3 - 2 * t);
    return 0.08 + s * 0.47;
  }
  function spawnJunk(speed, misses) {
    if (flying.length >= 8) return;
    const kind = rnd(JUNK_KINDS), group = buildJunk(kind);
    if (window.PS2 && PS2.applyPS2Skin) { PS2.applyPS2Skin(group); PS2.trackBlob(group, 0.28); }
    scene.add(group);
    const aimed = Math.random() < aimChance(misses);
    let x, y;
    if (aimed) { x = (Math.random() - 0.5) * 0.55; y = (Math.random() - 0.5) * 0.32; }
    else {
      const side = Math.random() < 0.5 ? -1 : 1;
      x = side * (1.7 + Math.random() * 1.6);
      y = (Math.random() - 0.5) * 1.3;
    }
    flying.push({
      group, kind, aimed,
      dist: 5.5 + Math.random() * 3.5,
      x, y,
      rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
      srx: (Math.random() - 0.5) * 8, sry: (Math.random() - 0.5) * 8, srz: (Math.random() - 0.5) * 8,
      spd: speed || 1,
      scale: kind === 'cig' ? 1.2 : kind === 'boot' ? 1.05 : kind === 'bra' ? 1.15 : 1,
    });
  }
  function smashItem(it) {
    spawnShards(it.kind, it.group.position);
    disposeGroup(it.group);
  }
  function forceSmash() {
    const kind = rnd(JUNK_KINDS);
    camera.updateMatrixWorld();
    junkPos.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.15, -0.55).applyMatrix4(camera.matrixWorld);
    const group = buildJunk(kind);
    group.position.copy(junkPos);
    group.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    scene.add(group);
    spawnShards(kind, junkPos);
    disposeGroup(group);
  }
  function updateJunk(time) {
    const dt = junkLastT ? Math.min(time - junkLastT, 0.05) : 0.016;
    junkLastT = time;
    camera.updateMatrixWorld();
    for (let i = flying.length - 1; i >= 0; i--) {
      const it = flying[i];
      it.dist -= dt * it.spd * 3.4;
      it.rx += it.srx * dt; it.ry += it.sry * dt; it.rz += it.srz * dt;
      it.group.rotation.set(it.rx, it.ry, it.rz);
      const sc = it.scale * Math.max(0.7, Math.min(2.4, 1.5 / Math.max(it.dist, 0.28)));
      it.group.scale.setScalar(sc);
      if (it.aimed) junkPos.set(it.x * Math.max(it.dist, 0.3) * 0.22, it.y * Math.max(it.dist, 0.3) * 0.18, -it.dist);
      else junkPos.set(it.x, it.y, -it.dist);
      junkPos.applyMatrix4(camera.matrixWorld);
      it.group.position.copy(junkPos);
      const ud = it.group.userData;
      if (it.kind === 'cig' && ud.smokes) {
        ud.ember.scale.setScalar(0.8 + Math.sin(time * 22) * 0.35);
        ud.smokes.forEach((s, si) => {
          const ph = (time * 0.9 + si * 0.35) % 1;
          s.position.set(0.32 + ph * 0.2, ph * 0.45, 0);
          s.scale.setScalar(0.5 + ph * 2.2);
          s.material.opacity = 0.4 * (1 - ph);
        });
      }
      if (it.aimed && it.dist < 0.42) {
        junkHits.push({ kind: it.kind });
        smashItem(it);
        flying.splice(i, 1);
      } else if (!it.aimed && it.dist < -0.8) {
        disposeGroup(it.group);
        flying.splice(i, 1);
      }
    }
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      s.life -= dt;
      s.vel.y -= 9 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt; s.mesh.rotation.y += s.spin.y * dt;
      if (s.glass) s.mesh.material.opacity = Math.max(0, s.life);
      if (s.life <= 0) {
        if (s.mesh.geometry) s.mesh.geometry.dispose();
        if (s.glass) s.mesh.material.dispose();
        scene.remove(s.mesh);
        shards.splice(i, 1);
      }
    }
  }
  function clearJunk() {
    flying.forEach(it => disposeGroup(it.group));
    flying.length = 0;
    shards.forEach(s => { if (s.mesh.geometry) s.mesh.geometry.dispose(); if (s.glass) s.mesh.material.dispose(); scene.remove(s.mesh); });
    shards.length = 0;
    junkHits.length = 0;
    junkLastT = 0;
  }
  function consumeHits() { const h = junkHits.slice(); junkHits.length = 0; return h; }

  // post-processing (optional: if the classic scripts loaded)
  let warpPass = null;
  const WarpShader = {
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float time,amount; varying vec2 vUv;',
      'void main(){',
      '  float a=amount;',
      '  vec2 uv=vUv;',
      '  uv+=vec2(sin((vUv.y*24.0)+time*7.0), cos((vUv.x*18.0)+time*5.5))*a*0.009;',
      '  uv+=vec2(sin(vUv.y*8.0+time*2.2),0.0)*a*0.006;',
      '  uv=clamp(uv,0.001,0.999);',
      '  vec2 ca=vec2(a*0.003,0.0);',
      '  float r=texture2D(tDiffuse,uv+ca).r;',
      '  float g=texture2D(tDiffuse,uv).g;',
      '  float b=texture2D(tDiffuse,uv-ca).b;',
      '  gl_FragColor=vec4(r,g,b,1.0);',
      '}'
    ].join('\n')
  };
  const GradeShader = {
    uniforms: { tDiffuse: { value: null }, warmth: { value: 0.06 }, sat: { value: 1.08 }, contrast: { value: 1.10 }, fade: { value: 0 }, lift: { value: 0.0 }, bleach: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float warmth,sat,contrast,fade,lift,bleach; varying vec2 vUv;',
      'void main(){',
      '  vec4 c=texture2D(tDiffuse,vUv);',
      '  vec3 col=c.rgb*vec3(1.08,1.08,1.0);',
      '  col=max(col-vec3(0.035),vec3(0.0))*1.05;',
      '  col=col*vec3(1.0+warmth,1.0+warmth*0.35,1.0-warmth*0.05);',
      '  float g=dot(col,vec3(0.299,0.587,0.114));',
      '  col=mix(vec3(g),col,sat);',
      '  col=(col-0.5)*contrast+0.5+lift;',
      '  float sl=dot(col,vec3(0.299,0.587,0.114)); col+=mix(vec3(0.045,-0.012,0.055),vec3(0.05,0.022,-0.035),smoothstep(0.15,0.75,sl))*(1.0-fade);',
      '  col=mix(col,vec3(g)*vec3(1.04,1.01,0.94),bleach);',
      '  col=mix(col,vec3(g),fade);',
      '  gl_FragColor=vec4(clamp(col,0.0,1.0),c.a);',
      '}'
    ].join('\n')
  };
  const SleekShader = {
    uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1280, 720) }, sharp: { value: 0.45 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform vec2 res; uniform float sharp; varying vec2 vUv;',
      'float lum(vec3 c){ return dot(c,vec3(0.299,0.587,0.114)); }',
      'void main(){',
      '  vec2 px=1.0/res;',
      '  vec3 nw=texture2D(tDiffuse,vUv+vec2(-1.0,-1.0)*px).rgb; vec3 ne=texture2D(tDiffuse,vUv+vec2(1.0,-1.0)*px).rgb;',
      '  vec3 sw=texture2D(tDiffuse,vUv+vec2(-1.0,1.0)*px).rgb; vec3 se=texture2D(tDiffuse,vUv+vec2(1.0,1.0)*px).rgb;',
      '  vec3 m=texture2D(tDiffuse,vUv).rgb;',
      '  float lnw=lum(nw),lne=lum(ne),lsw=lum(sw),lse=lum(se),lm=lum(m);',
      '  float lmin=min(lm,min(min(lnw,lne),min(lsw,lse))), lmax=max(lm,max(max(lnw,lne),max(lsw,lse)));',
      '  vec2 dir=vec2(-((lnw+lne)-(lsw+lse)),((lnw+lsw)-(lne+lse)));',
      '  float dr=max((lnw+lne+lsw+lse)*0.03125,0.0078125);',
      '  float rc=1.0/(min(abs(dir.x),abs(dir.y))+dr);',
      '  dir=clamp(dir*rc,-8.0,8.0)*px;',
      '  vec3 a=0.5*(texture2D(tDiffuse,vUv+dir*(1.0/3.0-0.5)).rgb+texture2D(tDiffuse,vUv+dir*(2.0/3.0-0.5)).rgb);',
      '  vec3 b=a*0.5+0.25*(texture2D(tDiffuse,vUv+dir*-0.5).rgb+texture2D(tDiffuse,vUv+dir*0.5).rgb);',
      '  float lb=lum(b); vec3 o=(lb<lmin||lb>lmax)?a:b;',
      '  vec3 avg=(nw+ne+sw+se)*0.25;',
      '  o+=(m-avg)*sharp;',
      '  gl_FragColor=vec4(clamp(o,0.0,1.0),1.0);',
      '}'
    ].join('\n')
  };
  let sleekPass = null;
  function setupComposer() {
    if (typeof THREE.EffectComposer !== 'function' || typeof THREE.RenderPass !== 'function') return;
    try {
      const v = viewSize();
      composer = new THREE.EffectComposer(renderer);
      if (composer.setPixelRatio) composer.setPixelRatio(v.pr);
      composer.setSize(v.w, v.h);
      composer.addPass(new THREE.RenderPass(scene, camera));
      if (THREE.UnrealBloomPass && gpuTier < 2) {
        bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(v.w * v.pr, v.h * v.pr), 0.3, 0.5, 0.82);
        composer.addPass(bloomPass);
      }
      gradePass = new THREE.ShaderPass(GradeShader);
      composer.addPass(gradePass);
      sleekPass = new THREE.ShaderPass(SleekShader); sleekPass.uniforms.res.value.set(v.w * v.pr, v.h * v.pr);
      composer.addPass(sleekPass);
      if (THREE.VignetteShader) {
        vignettePass = new THREE.ShaderPass(THREE.VignetteShader);
        vignettePass.uniforms.offset.value = 1.35;
        vignettePass.uniforms.darkness.value = 0.22;
        vignettePass.uniforms.darkness.value = 0.45;
        composer.addPass(vignettePass);
      }
      const last = composer.passes[composer.passes.length - 1];
      if (last) last.renderToScreen = true;
    } catch (e) { composer = null; }
  }
  setupComposer();

  // ---- PBR look (style lock 21-22 Nov 2026: realistic PBR, GTA V-mod-like). Visual only, no gameplay. ----
  // HDRI image-based lighting (Poly Haven "Cowboy Town Saloon", CC0), ACES tone mapping, Lambert -> Standard (PBR)
  // materials, and Poly Haven CC0 bar stools + barrels. Data in assets/pbr_pack.js (window.BUCK_PBR). Remove that script tag to revert.
  (function pbrLook() {
    const P = window.BUCK_PBR; if (!P) return;
    const ab = function (s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; };
    // minimal Radiance .hdr (RGBE, new-style RLE) decoder -> half-float RGBA
    const parseHDR = function (buf) {
      const d = new Uint8Array(buf); let p = 0; const line = function () { let s = ''; while (p < d.length && d[p] !== 10) s += String.fromCharCode(d[p++]); p++; return s; };
      let l; while ((l = line()) !== '' && p < d.length) {} const dims = line().match(/-Y (\d+) \+X (\d+)/); const H = +dims[1], W = +dims[2];
      const out = new Uint16Array(W * H * 4), sc = new Uint8Array(W * 4), half = THREE.DataUtils.toHalfFloat, one = half(1);
      for (let y = 0; y < H; y++) {
        if (d[p] === 2 && d[p + 1] === 2 && (d[p + 2] << 8 | d[p + 3]) === W) { p += 4;
          for (let c = 0; c < 4; c++) { let x = 0; while (x < W) { let n = d[p++]; if (n > 128) { n -= 128; const v = d[p++]; while (n--) sc[(x++) * 4 + c] = v; } else { while (n--) sc[(x++) * 4 + c] = d[p++]; } } }
        } else { for (let x = 0; x < W; x++) { sc[x * 4] = d[p++]; sc[x * 4 + 1] = d[p++]; sc[x * 4 + 2] = d[p++]; sc[x * 4 + 3] = d[p++]; } }
        for (let x = 0; x < W; x++) { const e = sc[x * 4 + 3], f = e ? Math.pow(2, e - 136) : 0, o = (y * W + x) * 4;
          out[o] = half(sc[x * 4] * f); out[o + 1] = half(sc[x * 4 + 1] * f); out[o + 2] = half(sc[x * 4 + 2] * f); out[o + 3] = one; }
      }
      const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
      t.mapping = THREE.EquirectangularReflectionMapping; t.flipY = true; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
    };
    let envRT = null;
    const applyEnv = function () {
      try {
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
        if (!envRT && P.hdri && THREE.PMREMGenerator) { const pm = new THREE.PMREMGenerator(renderer); const eq = parseHDR(ab(P.hdri)); envRT = pm.fromEquirectangular(eq); eq.dispose(); pm.dispose(); }
        if (envRT) scene.environment = envRT.texture;
      } catch (e) { console.error('BUCK pbr env', e); }
    };
    applyEnv();
    if (typeof hemi !== 'undefined' && hemi) hemi.intensity *= 0.45; // the HDRI now supplies most of the fill light
    // Lambert/Phong -> MeshStandardMaterial; old material stays the "driver" so existing flicker/tint code keeps working
    const pairs = [], conv = new Map();
    const toPBR = function (m) {
      if (!m || !(m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return m;
      if (conv.has(m)) return conv.get(m);
      const s = new THREE.MeshStandardMaterial({ color: m.color, map: m.map, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
        transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, vertexColors: m.vertexColors, fog: m.fog, depthWrite: m.depthWrite,
        roughness: m.isMeshPhongMaterial ? 0.45 : 0.82, metalness: m.userData && m.userData.metal ? 0.8 : 0.0, envMapIntensity: 0.85 });
      s.name = m.name; s.userData.pbr = true; conv.set(m, s); pairs.push([m, s]); return s;
    };
    let sweep = function () {
      scene.traverse(function (o) {
        if (!o.isMesh || o.userData.noPBR) return;
        if (Array.isArray(o.material)) { let ch = false; const a = o.material.map(function (m) { const n = toPBR(m); if (n !== m) ch = true; return n; }); if (ch) o.material = a; }
        else { const n = toPBR(o.material); if (n !== o.material) o.material = n; }
      });
    };
    // ---- Poly Haven CC0 props: round bar stools along the counter, barrels in the corners ----
    const glb = function (key, fn) { if (!P[key] || !THREE.GLTFLoader) return; new THREE.GLTFLoader().parse(ab(P[key]), '', function (g) { try { fn(g.scene || g.scenes[0]); } catch (e) { console.error('BUCK pbr', key, e); } }, function () {}); };
    glb('bar_chair', function (o) {
      scene.traverse(function (x) { if (/^stool/i.test(x.name || '') && x.parent) x.visible = false; });
      o.updateMatrixWorld(true); const s = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()); const k = 0.82 / s.y;
      for (let i = 0; i < 8; i++) { const c = i ? o.clone() : o; c.scale.setScalar(k); c.position.set(-6.5 + i * 1.85, 0, -8.35); c.rotation.y = i * 0.7; c.name = 'pbrStool'; c.traverse(function (q) { q.userData.keepPBR = true; }); scene.add(c); }
    });
    glb('barrels', function (o) {
      const keep = []; o.traverse(function (x) { if (x.isMesh && /barrel0/.test((x.parent && x.parent.name) + x.name)) keep.push(x); });
      const pts = [[-12.2, -8.6, 0.3], [-11.3, -9.6, 1.4], [12.0, -8.7, 2.2], [12.4, -6.9, 0.9]];
      pts.forEach(function (p, i) { const src = keep[i % Math.max(1, keep.length)]; if (!src) return; const m = new THREE.Mesh(src.geometry, src.material);
        src.updateMatrixWorld(true); const s = new THREE.Box3().setFromObject(src).getSize(new THREE.Vector3()); m.scale.setScalar(1.0 / s.y);
        m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox; m.position.set(p[0], -bb.min.y * m.scale.y, p[1]); m.rotation.y = p[2]; m.name = 'pbrBarrel'; m.userData.keepPBR = true; scene.add(m); });
    });
    let acc = 0, tAll = 0;
    (window.__buckLife = window.__buckLife || []).push(function (t, dt) {
      dt = dt || 0.016; acc += dt; tAll += dt;
      if (acc > (tAll < 25 ? 1 : 4)) { acc = 0; sweep(); if (renderer.toneMapping !== THREE.ACESFilmicToneMapping) applyEnv(); }
      for (let i = 0; i < pairs.length; i++) { const a = pairs[i][0], b = pairs[i][1];
        if (b.userData.lockMap) { b.emissiveIntensity = a.emissiveIntensity; b.opacity = a.opacity; b.visible = a.visible; continue; }
        if (b.map !== a.map) { b.map = a.map; b.needsUpdate = true; }
        b.color.copy(a.color); if (a.emissive) b.emissive.copy(a.emissive); b.emissiveIntensity = a.emissiveIntensity; b.opacity = a.opacity; b.visible = a.visible; }
    });
    sweep();
    // ---- Poly Haven CC0 scanned wood on the room: floor, walls, ceiling/wainscot, bar counter ----
    const TX = P.tex || {};
    const loadT = function (k, srgb, rx, ry) { if (!TX[k]) return null; const im = new Image(); const t = new THREE.Texture(im);
      im.onload = function () { t.needsUpdate = true; }; im.src = 'data:image/jpeg;base64,' + TX[k];
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; if (srgb && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; t.userData.sleek = 2; return t; };
    const mk = function (set, rx, ry, rough) { const d = loadT(set + '_Diffuse', true, rx, ry); if (!d) return null;
      const m = new THREE.MeshStandardMaterial({ map: d, normalMap: loadT(set + '_nor_gl', false, rx, ry), roughnessMap: loadT(set + '_Rough', false, rx, ry), roughness: rough, metalness: 0, envMapIntensity: 0.85 });
      m.userData.pbr = true; m.userData.lockMap = true; return m; };
    const RM = { floor: mk('wood_floor_deck', 8, 8, 1.0), wall: mk('painted_plaster_wall', 4, 1.4, 1.0) || mk('weathered_brown_planks', 5, 2, 1.0), wains: mk('red_plaster_weathered', 6, 0.5, 0.95), ceil: mk('dark_wood', 6, 6, 0.9), bar: mk('wood_table_worn', 4, 1, 0.75) };
    if (RM.wall && TX.painted_plaster_wall_Diffuse) RM.wall.color.set(0x6a4630); // warm adobe / cantina wash (ref: bull bar)
    // assign by mesh (other passes may have swapped the original materials); re-checked on every sweep
    const skinRoom = function () {
      const room = scene.getObjectByName('saloon'); if (!room) return;
      room.children.forEach(function (o) {
        if (!o.isMesh || o.userData.noPBR) return;
        const g = o.geometry && o.geometry.parameters; if (!g || o.geometry.type !== 'BoxGeometry') return;
        let k = null;
        if (o.name === 'dinerFloor') k = 'floor'; else if (o.name === 'ceiling') k = 'ceil';
        else if (g.height >= 2 && Math.min(g.width, g.depth) <= 0.35 && Math.max(g.width, g.depth) >= 3) k = 'wall';
        else if (Math.abs(g.height - 1.2) < 0.05 && Math.min(g.width, g.depth) <= 0.2 && Math.max(g.width, g.depth) >= 8) k = 'wains';
        if (k && RM[k]) { o.userData.keepPBR = true; if (o.material !== RM[k]) o.material = RM[k]; }
      });
      const bc = scene.getObjectByName('counter');
      if (bc && RM.bar) bc.children.forEach(function (o) { if (o.isMesh && o.geometry.type === 'BoxGeometry' && o.geometry.parameters.depth > 0.1) { o.userData.keepPBR = true; if (o.material !== RM.bar) o.material = RM.bar; } });
    };
    skinRoom();
    const sweep0 = sweep; sweep = function () { sweep0(); skinRoom(); };
    // ---- bigger arched sunset windows (palms outside) so the view is part of the vibe ----
    (function bigWindows() {
      const room = scene.getObjectByName('saloon'); if (!room) return;
      room.children.forEach(function (o) {
        if (o.name === 'archWindow' || o.name === 'windowFrame' || (o.name === 'windowGlass' && o.isMesh)) {
          if (o.userData.bigWin) return; o.userData.bigWin = true; o.userData.keepPBR = true;
          o.scale.multiplyScalar(1.6); o.position.y = 3.65; o.traverse(function (q) { q.userData.keepPBR = true; });
        }
      });
    })();
    // ---- club light show: sweeping coloured beams, colour-cycling wash, strobe hits (the party look, visual only) ----
    (function clubLights() {
      const rig = new THREE.Group(); rig.name = 'clubRig'; rig.userData.keepPBR = true; scene.add(rig);
      const beamG = new THREE.ConeGeometry(0.9, 6.2, 18, 1, true); beamG.translate(0, -3.1, 0);
      const heads = [];
      [[-6, -4], [6, -4], [-6, 5], [6, 5], [0, -8], [0, 8]].forEach(function (p, i) {
        const h = new THREE.Group(); h.position.set(p[0], 6.3, p[1]); rig.add(h);
        const bm = new THREE.MeshBasicMaterial({ color: 0xff3d8b, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
        const beam = new THREE.Mesh(beamG, bm); beam.userData.noPBR = true; h.add(beam);
        const sp = new THREE.SpotLight(0xff3d8b, 2.2, 18, 0.32, 0.6, 1.6); sp.position.set(0, 0, 0); h.add(sp); const tg = new THREE.Object3D(); tg.position.set(0, -6, 0); h.add(tg); sp.target = tg;
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.36, 10), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.35 })); can.position.y = 0.1; h.add(can);
        heads.push({ h: h, bm: bm, sp: sp, ph: i * 1.13 });
      });
      const wash = new THREE.PointLight(0xff2d8a, 0.0, 26, 2); wash.position.set(0, 5.5, 0); rig.add(wash);
      const strobe = new THREE.PointLight(0xffffff, 0, 30, 2); strobe.position.set(0, 6, 0); rig.add(strobe);
      const c = new THREE.Color();
      (window.__buckLife = window.__buckLife || []).push(function (t) {
        const bpm = 2.1; // ~126 bpm feel
        heads.forEach(function (o, i) {
          o.h.rotation.x = Math.sin(t * 0.9 + o.ph) * 0.75; o.h.rotation.z = Math.cos(t * 0.7 + o.ph * 1.7) * 0.75;
          c.setHSL(((t * 0.08 + i / heads.length) % 1), 1, 0.55); o.bm.color.copy(c); o.sp.color.copy(c);
          const pulse = 0.55 + 0.45 * Math.max(0, Math.sin(t * Math.PI * bpm + i));
          o.bm.opacity = 0.07 + 0.13 * pulse; o.sp.intensity = 1.2 + 2.2 * pulse;
        });
        c.setHSL((t * 0.05) % 1, 0.9, 0.5); wash.color.copy(c); wash.intensity = 0.35 + 0.35 * Math.max(0, Math.sin(t * Math.PI * bpm));
        const s = (t * bpm) % 8; strobe.intensity = (s > 7 && (Math.floor(t * 18) % 2 === 0)) ? 5.0 : 0; // strobe burst every 4 bars
      });
    })();
    // ---- street + wall art pass (Juani 22 Nov): smooth golden-hour sky + layered mountains (replaces the pixelated mesa dome), road sun-glare, stucco shop sides, smooth street textures, hand-made baddie-core posters + mural + neon trim on the bar walls. All art is drawn here in code (original, no brands, no downloads). Visual only. ----
    (function streetStyle() {
      try {
        let sd = 21; const R = function () { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
        const mkTex = function (w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t; };
        const fogHex = scene.fog ? '#' + scene.fog.color.getHexString() : '#e89b5a';
        // ---------- sky: equirect painted dusk (sun low down the road, layered mountains, soft cloud streaks) ----------
        const skyT = mkTex(2048, 1024, function (g, W, H) {
          const hy = H / 2, ey = function (e) { return hy - e / 90 * hy; };
          const gr = g.createLinearGradient(0, 0, 0, hy);
          [[90, '#141c48'], [60, '#2a3070'], [35, '#5a3a86'], [20, '#a04a8a'], [12, '#e8607a'], [6, '#ff9460'], [2.5, '#ffc070'], [0, '#ffe0a8']].forEach(function (q) { gr.addColorStop(ey(q[0]) / hy, q[1]); });
          g.fillStyle = gr; g.fillRect(0, 0, W, hy);
          g.fillStyle = fogHex; g.fillRect(0, hy, W, hy);
          // clouds (soft streaks, warm underlit)
          g.filter = 'blur(7px)';
          for (let i = 0; i < 46; i++) {
            const e = 5 + R() * 28, x = R() * W, w = 140 + R() * 380, h = 6 + R() * 16;
            g.fillStyle = e < 14 ? 'rgba(255,120,90,' + (0.22 + R() * 0.2) + ')' : 'rgba(255,190,170,' + (0.14 + R() * 0.14) + ')';
            [0, -W].forEach(function (o) { g.beginPath(); g.ellipse(x + o, ey(e), w, h, 0, 0, 7); g.fill(); });
          }
          g.filter = 'none';
          // sun low at the end of the road
          const sx = W * 0.985, sy = ey(4.5);
          [0, -W].forEach(function (o) {
            const h = g.createRadialGradient(sx + o, sy, 2, sx + o, sy, 70);
            h.addColorStop(0, 'rgba(255,214,140,1)'); h.addColorStop(0.4, 'rgba(255,190,110,0.8)'); h.addColorStop(1, 'rgba(255,150,90,0)');
            g.fillStyle = h; g.fillRect(sx + o - 72, sy - 72, 144, 144);
          });
          // mountain ridges, far to near, hazed
          const ridge = function (amp, col, ph, haze) {
            g.beginPath(); g.moveTo(0, hy + 6);
            for (let x = 0; x <= W; x += 8) {
              const a = x / W * Math.PI * 2;
              const n = 0.5 + 0.22 * Math.sin(3 * a + ph) + 0.16 * Math.sin(7 * a + ph * 2.1) + 0.1 * Math.sin(17 * a + ph * 3.3) + 0.06 * Math.sin(41 * a + ph * 1.7);
              g.lineTo(x, hy - amp * n);
            }
            g.lineTo(W, hy + 6); g.closePath(); g.fillStyle = col; g.fill();
            const hz = g.createLinearGradient(0, hy - amp, 0, hy); hz.addColorStop(0, 'rgba(255,170,110,0)'); hz.addColorStop(1, 'rgba(255,170,110,' + haze + ')');
            g.fillStyle = hz; g.fillRect(0, hy - amp, W, amp + 6);
          };
          ridge(70, '#b06a78', 0.6, 0.55); ridge(52, '#8a4a6c', 2.1, 0.4); ridge(34, '#5e3460', 4.0, 0.28);
        });
        const sky = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 32), new THREE.MeshBasicMaterial({ map: skyT, side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false, toneMapped: false }));
        sky.name = 'dusk3Sky'; sky.userData.noPBR = true; sky.renderOrder = -100; sky.frustumCulled = false; sky.userData.keepPBR = true; scene.add(sky);
        scene.background = new THREE.Color(fogHex);
        // ---------- road sun glare (additive, along the road toward the sun) ----------
        const glareT = mkTex(512, 128, function (g, W, H) {
          let gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(255,205,130,1)'); gr.addColorStop(0.5, 'rgba(255,150,90,0.4)'); gr.addColorStop(1, 'rgba(255,120,80,0)');
          g.fillStyle = gr; g.fillRect(0, 0, W, H);
          gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.globalCompositeOperation = 'destination-in'; g.fillStyle = gr; g.fillRect(0, 0, W, H);
        });
        const glare = new THREE.Mesh(new THREE.PlaneGeometry(62, 7), new THREE.MeshBasicMaterial({ map: glareT, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
        glare.rotation.x = -Math.PI / 2; glare.position.set(-20, 0.03, 31); glare.renderOrder = 3; glare.name = 'roadGlare'; glare.userData.keepPBR = true; glare.userData.noPBR = true; glare.material.userData.ps2KeepMap = true; scene.add(glare);
        // ---------- stucco shop sides ----------
        const stuccoCols = ['#e8a0a8', '#7fc4c0', '#e9c28a', '#f08a5a', '#b9a0d8', '#e8d6a0'];
        const stucco = stuccoCols.map(function (c, i) {
          const t = mkTex(256, 256, function (g, W, H) {
            g.fillStyle = c; g.fillRect(0, 0, W, H);
            for (let k = 0; k < 1800; k++) { g.fillStyle = 'rgba(' + (R() > 0.5 ? '255,255,255' : '60,30,20') + ',' + (R() * 0.07) + ')'; g.fillRect(R() * W, R() * H, 2 + R() * 3, 2 + R() * 3); }
            const st = g.createLinearGradient(0, 0, 0, H); st.addColorStop(0, 'rgba(60,30,20,0.3)'); st.addColorStop(0.25, 'rgba(60,30,20,0)'); st.addColorStop(0.8, 'rgba(60,30,20,0)'); st.addColorStop(1, 'rgba(60,30,20,0.35)');
            g.fillStyle = st; g.fillRect(0, 0, W, H);
          });
          t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2);
          const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, metalness: 0 }); m.userData.keepPBR = true; m.userData.ps2KeepMap = true; return m;
        });
        // ---------- Poly Haven CC0 street textures (asphalt_02, concrete_pavement_02, yellow_plaster_02, worn_brick_wall) from assets/street_pack.js ----------
        const ST = window.BUCK_STREET || {};
        const smat = function (slug, rx, ry, tint) {
          const e = ST[slug]; if (!e) return null; const L = new THREE.TextureLoader();
          const mk = function (b64, srgb) { const t = L.load('data:image/jpeg;base64,' + b64); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; if (srgb) t.encoding = THREE.sRGBEncoding; t.userData.sleek = 2; return t; };
          const m = new THREE.MeshStandardMaterial({ map: mk(e.d, true), normalMap: mk(e.n, false), roughnessMap: mk(e.r, false), roughness: 1, metalness: 0, color: tint === undefined ? 0xffffff : tint, envMapIntensity: 0.6 });
          m.userData.keepPBR = true; m.userData.ps2KeepMap = true; return m;
        };
        const roadM = smat('asphalt_02', 26, 2.4, 0xd8cfc6), lotM = smat('concrete_pavement_02', 20, 5, 0xe8dccb);
        const plasterTints = [0xf0b0b8, 0x9ed8d2, 0xf6d49a, 0xf5a070, 0xcdb6ec, 0xffe6a8, 0xf0b0b8];
        const bldM = plasterTints.map(function (c, i) { return (i === 2 || i === 5) ? smat('worn_brick_wall', 4, 2, 0xe8c8b8) : smat('yellow_plaster_02', 4, 2, c); });
        const linesT = mkTex(2048, 256, function (g, W, H) {
          g.clearRect(0, 0, W, H);
          g.fillStyle = 'rgba(244,196,40,0.92)'; g.fillRect(0, H / 2 - 6, W, 3); g.fillRect(0, H / 2 + 3, W, 3);
          g.fillStyle = 'rgba(240,236,224,0.88)'; g.fillRect(0, 22, W, 4); g.fillRect(0, H - 26, W, 4);
          for (let k = 0; k < 900; k++) { g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,' + (0.2 + R() * 0.5) + ')'; g.fillRect(R() * W, R() * H, 2 + R() * 14, 1 + R() * 3); }
          g.globalCompositeOperation = 'source-over';
        });
        const linesMat = new THREE.MeshStandardMaterial({ map: linesT, transparent: true, roughness: 0.8, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }); linesMat.userData.keepPBR = true; linesMat.userData.ps2KeepMap = true;
        const lines = new THREE.Mesh(new THREE.PlaneGeometry(130, 12), linesMat); lines.rotation.x = -Math.PI / 2; lines.position.set(0, 0.0, 31); lines.name = 'roadLines'; lines.userData.keepPBR = true; lines.userData.noPBR = true; lines.renderOrder = 1; scene.add(lines);
        // ---------- CC0 graffiti tags (ambientCG GraffitiSet001, 4x4 atlas) as decals: bar outer walls + street shopfronts ----------
        let tagAtlas = null;
        if (ST.graffiti && ST.graffiti.png) { tagAtlas = new THREE.TextureLoader().load('data:image/png;base64,' + ST.graffiti.png); tagAtlas.encoding = THREE.sRGBEncoding; tagAtlas.anisotropy = 8; tagAtlas.userData.sleek = 2; }
        const tagDecal = function (cell, w, h, x, y, z, ry, rz) {
          if (!tagAtlas) return null;
          const t = tagAtlas.clone(); t.needsUpdate = true; t.repeat.set(0.25, 0.25); t.offset.set((cell % 4) * 0.25, 1 - (Math.floor(cell / 4) + 1) * 0.25); t.userData.sleek = 2; t.anisotropy = 8;
          const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.04, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide }); m.userData.keepPBR = true; m.userData.ps2KeepMap = true;
          const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); o.position.set(x, y, z); o.rotation.set(0, ry, rz || 0); o.name = 'tagDecal'; o.userData.keepPBR = true; o.userData.noPBR = true; scene.add(o); return o;
        };
        for (let i = 0; i < 16; i++) { const x = -54 + i * 7.2 + (R() - 0.5) * 3; tagDecal(Math.floor(R() * 16), 1.7 + R() * 0.8, 1.7 + R() * 0.8, x, 1.1 + R() * 0.9, 41.85, Math.PI, (R() - 0.5) * 0.25); }
        let tagsOnBar = false;
        let stuccoDone = false;
        const dirtT = mkTex(512, 512, function (g, W, H) {
          g.fillStyle = '#9a7a58'; g.fillRect(0, 0, W, H);
          for (let k = 0; k < 9000; k++) { const v = 90 + R() * 90 | 0; g.fillStyle = 'rgba(' + v + ',' + (v * 0.8 | 0) + ',' + (v * 0.6 | 0) + ',' + (0.05 + R() * 0.12) + ')'; g.fillRect(R() * W, R() * H, 1 + R() * 3, 1 + R() * 3); }
          g.filter = 'blur(10px)'; for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(' + (R() > 0.5 ? '60,40,25' : '200,160,110') + ',0.16)'; g.beginPath(); g.ellipse(R() * W, R() * H, 30 + R() * 80, 20 + R() * 50, R() * 3, 0, 7); g.fill(); } g.filter = 'none';
        });
        dirtT.wrapS = dirtT.wrapT = THREE.RepeatWrapping; dirtT.repeat.set(10, 3);
        let dirtDone = false;
        // ---------- wall art ----------
        const paper = function (g, W, H, base) { g.fillStyle = base; g.fillRect(0, 0, W, H); for (let i = 0; i < 2600; i++) { g.fillStyle = 'rgba(0,0,0,' + (R() * 0.05) + ')'; g.fillRect(R() * W, R() * H, 2, 2); } };
        const wear = function (g, W, H) {
          const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.78); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(50,25,0,0.38)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
          g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, H * 0.5); g.lineTo(W, H * 0.5 + 6); g.moveTo(W * 0.5, 0); g.lineTo(W * 0.5 - 4, H); g.stroke();
          [[W * 0.1, 4, -0.6], [W * 0.9, 4, 0.6]].forEach(function (p) { g.save(); g.translate(p[0], p[1] + 6); g.rotate(p[2]); g.fillStyle = 'rgba(236,226,190,0.78)'; g.fillRect(-46, -14, 92, 28); g.restore(); });
        };
        const sparkle = function (g, x, y, r, col) { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = (i % 2 ? r * 0.2 : r); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
        const star5 = function (g, x, y, r, col) { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = (i % 2 ? r * 0.45 : r); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
        const txt = function (g, s, x, y, size, fill, stroke) { g.font = '900 ' + size + 'px Impact, "Arial Black", Haettenschweiler, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; if (stroke) { g.lineWidth = size * 0.13; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(s, x, y); } g.fillStyle = fill; g.fillText(s, x, y); };
        const chromeFill = function (g, y, size) { const c = g.createLinearGradient(0, y - size / 2, 0, y + size / 2); c.addColorStop(0, '#ffffff'); c.addColorStop(0.5, '#bfe6ff'); c.addColorStop(0.55, '#ffffff'); c.addColorStop(1, '#ffd6ec'); return c; };
        const goldFill = function (g, y, size) { const c = g.createLinearGradient(0, y - size / 2, 0, y + size / 2); c.addColorStop(0, '#fff1b0'); c.addColorStop(0.45, '#e8b84a'); c.addColorStop(0.55, '#a8761c'); c.addColorStop(1, '#f6d77a'); return c; };
        const designs = {
          rodeo: [512, 720, function (g, W, H) {
            paper(g, W, H, '#f6e3b0');
            for (let i = 0; i < 28; i++) { g.fillStyle = i % 2 ? '#f0572d' : '#f7a823'; g.beginPath(); g.moveTo(W / 2, H * 0.42); g.arc(W / 2, H * 0.42, 900, i / 28 * Math.PI * 2, (i + 1) / 28 * Math.PI * 2); g.closePath(); g.fill(); }
            g.fillStyle = '#fff1c0'; g.beginPath(); g.arc(W / 2, H * 0.42, 150, 0, 7); g.fill(); g.lineWidth = 16; g.strokeStyle = '#7a2a1a'; g.beginPath(); g.arc(W / 2, H * 0.44, 78, Math.PI * 0.12, Math.PI * 0.88, true); g.stroke();
            star5(g, W / 2, H * 0.38, 34, '#7a2a1a');
            g.fillStyle = '#7a1d12'; g.fillRect(40, 30, W - 80, 56); txt(g, 'THE BITTER BLONDE', W / 2, 58, 38, '#ffe9a8');
            txt(g, 'LIVE BULL', W / 2, H * 0.76, 104, '#fff4d0', '#7a1d12'); txt(g, 'FRIDAYS', W / 2, H * 0.89, 78, '#ffd23a', '#7a1d12'); wear(g, W, H); }],
          baddies: [512, 720, function (g, W, H) {
            const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#ff3d9a'); bg.addColorStop(0.6, '#ff8cc8'); bg.addColorStop(1, '#ffd0e8'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
            for (let i = 0; i < 26; i++) sparkle(g, R() * W, R() * H, 10 + R() * 26, 'rgba(255,255,255,' + (0.5 + R() * 0.5) + ')');
            txt(g, 'BADDIES', W / 2, H * 0.26, 128, chromeFill(g, H * 0.26, 128), '#c70f68'); txt(g, 'RIDE', W / 2, H * 0.47, 150, '#ffe14a', '#c70f68'); txt(g, 'FREE', W / 2, H * 0.68, 150, chromeFill(g, H * 0.68, 150), '#c70f68');
            txt(g, 'ALL NIGHT  •  NO CAP', W / 2, H * 0.89, 38, '#7a0b45'); wear(g, W, H); }],
          queenz: [512, 720, function (g, W, H) {
            g.fillStyle = '#0c0a0c'; g.fillRect(0, 0, W, H);
            for (let i = 0; i < 2000; i++) { g.fillStyle = 'rgba(255,255,255,' + (R() * 0.04) + ')'; g.fillRect(R() * W, R() * H, 2, 2); }
            g.strokeStyle = '#e8b84a'; g.lineWidth = 6; const link = function (x, y, r) { g.beginPath(); g.ellipse(x, y, 13, 8, r, 0, 7); g.stroke(); };
            for (let x = 30; x < W - 20; x += 22) { link(x, 30, 0); link(x, H - 30, 0); } for (let y = 40; y < H - 30; y += 22) { link(30, y, Math.PI / 2); link(W - 30, y, Math.PI / 2); }
            txt(g, 'QUEENZ', W / 2, H * 0.3, 132, goldFill(g, H * 0.3, 132), '#3a2208'); txt(g, 'NIGHT', W / 2, H * 0.47, 96, '#ff4fa8', '#400020');
            g.lineWidth = 12; g.strokeStyle = '#e8b84a'; g.beginPath(); g.arc(W * 0.35, H * 0.7, 64, 0, 7); g.stroke(); g.beginPath(); g.arc(W * 0.65, H * 0.7, 64, 0, 7); g.stroke();
            txt(g, 'LADIES FREE TIL 11', W / 2, H * 0.89, 32, '#f6d77a'); wear(g, W, H); }],
          bandana: [512, 720, function (g, W, H) {
            paper(g, W, H, '#b3121f');
            g.fillStyle = 'rgba(255,255,255,0.7)';
            for (let y = 40; y < H; y += 92) for (let x = (y / 92 % 2 ? 40 : 0) + 20; x < W; x += 80) { g.save(); g.translate(x, y); g.rotate(0.6); g.beginPath(); g.ellipse(0, 0, 14, 28, 0, 0, 7); g.fill(); g.beginPath(); g.arc(24, 0, 5, 0, 7); g.fill(); g.restore(); }
            g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 10; g.strokeRect(16, 16, W - 32, H - 32);
            g.fillStyle = '#0c0c0c'; g.fillRect(44, H * 0.3, W - 88, H * 0.4); txt(g, 'NO CAP', W / 2, H * 0.43, 120, '#ffffff'); txt(g, 'NO FEAR', W / 2, H * 0.58, 120, '#ff2a3d'); txt(g, 'RIDE OR DIE', W / 2, H * 0.83, 52, '#ffffff', '#5a0810'); wear(g, W, H); }],
          wanted: [512, 720, function (g, W, H) {
            paper(g, W, H, '#d8b98a'); for (let i = 0; i < 7; i++) { g.fillStyle = 'rgba(110,70,30,' + (0.05 + R() * 0.08) + ')'; g.beginPath(); g.ellipse(R() * W, R() * H, 40 + R() * 90, 30 + R() * 70, R() * 3, 0, 7); g.fill(); }
            g.strokeStyle = '#3a1d0e'; g.lineWidth = 8; g.strokeRect(22, 22, W - 44, H - 44); g.lineWidth = 3; g.strokeRect(36, 36, W - 72, H - 72);
            txt(g, 'WANTED', W / 2, H * 0.17, 128, '#3a1d0e'); txt(g, 'BULL RIDERS', W / 2, H * 0.31, 70, '#7a1d12'); star5(g, W / 2, H * 0.55, 120, '#3a1d0e'); star5(g, W / 2, H * 0.55, 86, '#d8b98a'); star5(g, W / 2, H * 0.55, 52, '#7a1d12');
            txt(g, 'REWARD:', W / 2, H * 0.78, 48, '#3a1d0e'); txt(g, 'BRAGGING RIGHTS', W / 2, H * 0.87, 50, '#3a1d0e'); wear(g, W, H); }],
          lastcall: [720, 400, function (g, W, H) {
            g.fillStyle = '#0b0e1c'; g.fillRect(0, 0, W, H); for (let i = 0; i < 2200; i++) { g.fillStyle = 'rgba(120,60,50,' + (R() * 0.08) + ')'; g.fillRect(R() * W, R() * H, 6, 3); }
            g.shadowColor = '#3ff2e0'; g.shadowBlur = 28; txt(g, 'LAST CALL', W / 2, H * 0.36, 150, '#c9fff8', '#3ff2e0'); g.shadowColor = '#ff2a9a'; txt(g, '2AM', W / 2, H * 0.74, 120, '#ffd0ec', '#ff2a9a'); g.shadowBlur = 0;
            const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.6); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = v; g.fillRect(0, 0, W, H); }]
        };
        const texs = {}; Object.keys(designs).forEach(function (k) { const d = designs[k]; texs[k] = mkTex(d[0], d[1], d[2]); });
        // mural: dusk, palms, bull silhouette, stencil text
        const muralT = mkTex(1024, 512, function (g, W, H) {
          const sk = g.createLinearGradient(0, 0, 0, H); sk.addColorStop(0, '#3a2a7a'); sk.addColorStop(0.4, '#e0527a'); sk.addColorStop(0.7, '#ff9a5a'); sk.addColorStop(1, '#ffd890'); g.fillStyle = sk; g.fillRect(0, 0, W, H);
          g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(W * 0.5, H * 0.62, 120, 0, 7); g.fill();
          g.fillStyle = '#7a3a6a'; g.beginPath(); g.moveTo(0, H * 0.78); for (let x = 0; x <= W; x += 16) g.lineTo(x, H * 0.72 - 26 * Math.sin(x / 90) - 14 * Math.sin(x / 31)); g.lineTo(W, H); g.lineTo(0, H); g.fill();
          g.fillStyle = '#1a0e1c'; g.fillRect(0, H * 0.86, W, H * 0.14);
          const palm = function (x, h, lean) { g.strokeStyle = '#1a0e1c'; g.lineWidth = 14; g.beginPath(); g.moveTo(x, H * 0.88); g.quadraticCurveTo(x + lean * 0.4, H * 0.88 - h * 0.6, x + lean, H * 0.88 - h); g.stroke(); g.lineWidth = 7; for (let i = 0; i < 7; i++) { const a = -Math.PI + i * Math.PI / 6; g.beginPath(); g.moveTo(x + lean, H * 0.88 - h); g.quadraticCurveTo(x + lean + Math.cos(a) * 60, H * 0.88 - h + Math.sin(a) * 40 - 20, x + lean + Math.cos(a) * 110, H * 0.88 - h + Math.sin(a) * 60 + 30); g.stroke(); } };
          palm(120, 330, 40); palm(880, 380, -50); palm(960, 250, -20);
          g.fillStyle = '#12080f'; g.save(); g.translate(W * 0.5, H * 0.74); g.beginPath(); g.ellipse(0, 0, 120, 52, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(-112, -22, 42, 34, -0.3, 0, 7); g.fill(); g.beginPath(); g.ellipse(-60, -44, 54, 38, 0, 0, 7); g.fill();
          g.lineWidth = 9; g.strokeStyle = '#12080f'; g.beginPath(); g.moveTo(-142, -46); g.quadraticCurveTo(-170, -80, -150, -92); g.moveTo(-88, -50); g.quadraticCurveTo(-84, -90, -104, -98); g.stroke(); g.lineWidth = 14; [[-80, 40], [-50, 44], [60, 44], [88, 40]].forEach(function (l) { g.beginPath(); g.moveTo(l[0], 30); g.lineTo(l[0] + 4, 30 + l[1] + 20); g.stroke(); }); g.beginPath(); g.moveTo(118, -8); g.quadraticCurveTo(160, -10, 150, 40); g.stroke(); g.restore();
          txt(g, 'BUCK UP', W * 0.5, H * 0.2, 130, '#fff4d8', '#e0127a'); txt(g, 'RIDE OR DIE', W * 0.5, H * 0.38, 50, '#ffe14a', '#6a1040');
          g.lineWidth = 14; g.strokeStyle = '#fff4d8'; g.strokeRect(7, 7, W - 14, H - 14);
        });
        const hung = [];
        const hang = function (tex, w, h, x, y, z, ry, rz, name) {
          const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }); m.userData.keepPBR = true; m.userData.ps2KeepMap = true;
          const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); o.position.set(x, y, z); o.rotation.set(0, ry, rz || 0); o.name = name || 'baddiePoster'; o.userData.keepPBR = true; o.userData.noPBR = true; scene.add(o); hung.push(o); return o;
        };
        const P = Math.PI / 2, XL = -11.72, XR = 11.72, ZB = -11.72, ZF = 11.72;
        // lay posters + mural into the free gaps of the walls (skips whatever is already hanging there)
        let placed = false;
        const layout = function () {
          const skip = { saloon: 1, exterior: 1, dusk3Sky: 1, roadGlare: 1, neonCove: 1, baddiePoster: 1, baddieMural: 1, clubRig: 1, ccSign: 1, wallPoster: 1 };
          const bb = new THREE.Box3(), sz = new THREE.Vector3();
          const walls = [
            { fixed: XL, axis: 'z', ry: P, near: function (b) { return b.min.x < -10.7; }, along: function (b) { return [b.min.z, b.max.z]; }, extra: [] },
            { fixed: XR, axis: 'z', ry: -P, near: function (b) { return b.max.x > 10.7; }, along: function (b) { return [b.min.z, b.max.z]; }, extra: [] },
            { fixed: ZF, axis: 'x', ry: Math.PI, near: function (b) { return b.max.z > 10.7; }, along: function (b) { return [b.min.x, b.max.x]; }, extra: [[-6.9, 6.9]] }
          ];
          walls.forEach(function (w) {
            const bl = w.extra.slice();
            scene.children.forEach(function (o) {
              if (!o.visible || skip[o.name] || o.isLight || o.isCamera || o.isSkinnedMesh) return;
              bb.setFromObject(o); if (bb.isEmpty()) return; bb.getSize(sz); if (sz.length() > 16 || bb.min.y < 0.3 && sz.y < 1.4) return;
              if (bb.max.y < 1.5 || bb.min.y > 6.3 || !w.near(bb)) return;
              const r = w.along(bb); bl.push([r[0] - 0.25, r[1] + 0.25]);
            });
            bl.sort(function (a, b) { return a[0] - b[0]; });
            const gaps = []; let cur = -10.9;
            bl.forEach(function (r) { if (r[0] > cur + 0.8) gaps.push([cur, Math.min(r[0], 10.9)]); cur = Math.max(cur, r[1]); });
            if (cur < 10.9 - 0.8) gaps.push([cur, 10.9]);
            w.gaps = gaps;
          });
          // mural: widest gap
          let best = null; walls.forEach(function (w) { w.gaps.forEach(function (g) { if (!best || g[1] - g[0] > best.g[1] - best.g[0]) best = { w: w, g: g }; }); });
          if (best && best.g[1] - best.g[0] >= 3.6) {
            const mw = Math.min(6.4, best.g[1] - best.g[0] - 0.5), c = (best.g[0] + best.g[1]) / 2;
            hang(muralT, mw, mw / 2, best.w.axis === 'z' ? best.w.fixed : c, 3.55, best.w.axis === 'z' ? c : best.w.fixed, best.w.ry, 0, 'baddieMural');
            best.g[1] = best.g[0];
          }
          const list = [['rodeo', 1.2, 1.7], ['baddies', 1.2, 1.7], ['lastcall', 1.9, 1.05], ['queenz', 1.2, 1.7], ['bandana', 1.2, 1.7], ['wanted', 1.2, 1.7], ['baddies', 1.2, 1.7], ['rodeo', 1.2, 1.7], ['queenz', 1.2, 1.7], ['lastcall', 1.9, 1.05], ['bandana', 1.2, 1.7], ['wanted', 1.2, 1.7]];
          let li = 0;
          walls.forEach(function (w) {
            w.gaps.forEach(function (g) {
              const gw = g[1] - g[0]; if (gw < 1.5) return;
              const n = Math.max(1, Math.min(3, Math.floor((gw + 0.3) / 1.9)));
              for (let i = 0; i < n && li < list.length; i++, li++) {
                const it = list[li], c = g[0] + gw * (i + 0.5) / n, land = it[1] > it[2];
                const y = land ? 3.8 : 3.1 + (li % 3) * 0.12, rz = (R() - 0.5) * 0.06;
                hang(texs[it[0]], it[1], it[2], w.axis === 'z' ? w.fixed : c, y, w.axis === 'z' ? c : w.fixed, w.ry, rz);
              }
            });
          });
        };
        // neon cove trim along the top of the side walls + back wall
        const neonM = [new THREE.MeshBasicMaterial({ color: 0xff2a9a, toneMapped: false }), new THREE.MeshBasicMaterial({ color: 0x3ff2e0, toneMapped: false })];
        [[XL + 0.06, 5.5, 0, 0.06, 0.06, 23], [XR - 0.06, 5.5, 0, 0.06, 0.06, 23], [0, 5.5, ZB + 0.06, 23, 0.06, 0.06]].forEach(function (n, i) { const o = new THREE.Mesh(new THREE.BoxGeometry(n[3], n[4], n[5]), neonM[i % 2]); o.position.set(n[0], n[1], n[2]); o.name = 'neonCove'; o.userData.keepPBR = true; scene.add(o); });
        // ---------- per-frame upkeep ----------
        let acc = 9, tAcc = 0;
        (window.__buckLife = window.__buckLife || []).push(function (t, dt) {
          sky.position.copy(camera.position);
          if (!placed) { tAcc += dt || 0.016; if (tAcc > 4) { placed = true; try { layout(); } catch (e) { console.error('BUCK posters', e); } } }
          if (placed && !tagsOnBar) { tagsOnBar = true; try { let ti = 0; scene.traverse(function (o) { if (o.name === 'refTag' && o.isMesh) { const v = new THREE.Vector3(), q = new THREE.Quaternion(); o.getWorldPosition(v); o.getWorldQuaternion(q); const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'); const n = new THREE.Vector3(0, 0, 0.02).applyQuaternion(q); const gp = o.geometry && o.geometry.parameters || {}; const d = tagDecal([0, 3, 4, 7, 8, 10, 12, 14][ti++ % 8], (gp.width || 2.4) * 0.9, (gp.width || 2.4) * 0.9, v.x + n.x, v.y + n.y, v.z + n.z, e.y, e.z); if (d) { d.quaternion.copy(q); o.visible = false; } } }); } catch (e) { console.error('BUCK tags', e); } }
          acc += dt || 0.016; if (acc < 1.5) return; acc = 0;
          scene.traverse(function (o) {
            if (o.name === 'ps2SkyDome' || o.name === 'skyPlane' || o.name === 'ridge' || o.name === 'sunGlow' || o.name === 'ccSign') { if (o.visible) o.visible = false; }
          });
          scene.traverse(function (o) {
            if (!o.isMesh || o.isSkinnedMesh || !o.material) return;
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
              const tx = m && m.map; if (tx && tx.isTexture && !tx.isCompressedTexture && tx.magFilter !== THREE.LinearFilter) { tx.magFilter = THREE.LinearFilter; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.generateMipmaps = true; tx.anisotropy = 8; tx.needsUpdate = true; }
            });
            if (o.parent && o.parent.name === 'exterior' && o.geometry && o.geometry.parameters && o.geometry.parameters.depth > 8 && o.geometry.parameters.height > 4 && o.position.z > 44) { const wm = bldM[Math.floor((o.position.x + 60) / 17) % bldM.length] || stucco[0]; if (o.material !== wm) { o.material = wm; } o.userData.keepPBR = o.userData.noPBR = true; }
            if (o.name === 'highway' && roadM) { if (o.material !== roadM) o.material = roadM; o.userData.keepPBR = o.userData.noPBR = true; }
            if (o.name === 'lot' && lotM) { if (o.material !== lotM) o.material = lotM; o.userData.keepPBR = o.userData.noPBR = true; }
          });
          stuccoDone = true;
          if (!dirtDone) { dirtDone = true; const o = scene.getObjectByName('desertSand'); if (o) { const m = new THREE.MeshStandardMaterial({ map: dirtT, roughness: 0.95, metalness: 0 }); m.userData.keepPBR = true; m.userData.ps2KeepMap = true; o.material = m; o.userData.keepPBR = o.userData.noPBR = true; } }
        });
      } catch (err) { console.error('BUCK streetStyle', err && (err.stack || err)); }
    })();
    // ---- THE BITTER BLONDE: buckle-belt sign wrapped round the building, saloon / rock-bar / club front. Visual only ----
    (function bitterBlonde() {
      try {
        const life = window.__buckLife = window.__buckLife || [];
        const mkTex = function (w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; t.userData.sleek = 2; return t; };
        const grp = new THREE.Group(); grp.name = 'bitterBlonde'; scene.add(grp);
        const flag = function (o) { o.userData.keepPBR = o.userData.noPBR = true; if (o.material) { o.material.userData.keepPBR = o.material.userData.noPBR = true; } return o; };
        const box = function (w, h, d, mat, x, y, z) { const m = flag(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)); m.position.set(x, y, z); grp.add(m); return m; };
        const basic = function (hex, op) { return new THREE.MeshBasicMaterial({ color: hex, transparent: op != null, opacity: op == null ? 1 : op }); };
        const BY = 7.9;           // belt centre height on the facade
        // ---------- leather strap texture (stitched, worn) ----------
        const leatherT = mkTex(512, 128, function (g, W, H) {
          const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#3a1c0c'); gr.addColorStop(0.15, '#6b3a1c'); gr.addColorStop(0.5, '#7d4624'); gr.addColorStop(0.85, '#5e3017'); gr.addColorStop(1, '#2e1507');
          g.fillStyle = gr; g.fillRect(0, 0, W, H);
          for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(' + (i % 2 ? '20,8,2' : '170,110,60') + ',' + (0.05 + Math.random() * 0.08) + ')'; g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 5, 1); }
          g.strokeStyle = '#e8d4a0'; g.lineWidth = 3; g.setLineDash([14, 9]); [[18], [H - 18]].forEach(function (a) { g.beginPath(); g.moveTo(0, a[0]); g.lineTo(W, a[0]); g.stroke(); });
          g.setLineDash([]); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, 5); g.fillRect(0, H - 5, W, 5);
        });
        leatherT.wrapS = THREE.RepeatWrapping; leatherT.wrapT = THREE.ClampToEdgeWrapping;
        const strapMat = function (len) { const t = leatherT.clone(); t.needsUpdate = true; t.repeat.set(len / 3.4, 1); t.wrapS = THREE.RepeatWrapping; t.userData.sleek = 2; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.62, metalness: 0.05 }); };
        const SH = 1.15;
        // wall height (so the belt has something to wrap)
        let H = 7; { const bb = new THREE.Box3(), s = new THREE.Vector3(), c = new THREE.Vector3(); scene.children.forEach(function (o) { if (!o.isMesh) return; bb.setFromObject(o); bb.getSize(s); bb.getCenter(c); if (Math.abs(Math.abs(c.x) - 12) < 0.4 && s.z > 20 && s.y > 4 && s.y < 12) H = Math.max(H, bb.max.y); }); }
        const need = BY + SH / 2 + 0.1;
        // ring: front over parapet, sides + back (with a plaster skirt where the wall is lower than the belt)
        const skirtM = new THREE.MeshStandardMaterial({ color: 0x4a2230, roughness: 0.9 });
        box(24.8, SH, 0.14, strapMat(24.8), 0, BY, 12.64);
        [-1, 1].forEach(function (sx) {
          box(0.14, SH, 25.1, (function () { const m = strapMat(25.1); return m; })(), sx * 12.3, BY, 0.17);
          if (H < need) box(0.5, need - H + 0.05, 24.4, skirtM, sx * 12.1, (H + need) / 2 - 0.02, 0);
        });
        box(24.8, SH, 0.14, strapMat(24.8), 0, BY, -12.3);
        if (H < need) box(24.0, need - H + 0.05, 0.5, skirtM, 0, (H + need) / 2 - 0.02, -12.1);
        // ---------- the buckle sign (user's "buckle belt vector.png") ----------
        const signW = 9.0, signH = signW * 573 / 1024;
        const img = new Image();
        img.onload = function () {
          // strip the white fringe: flood-fill near-white/transparent from the edges, then erode the rim 2px
          const cv0 = document.createElement('canvas'); cv0.width = img.naturalWidth || 1024; cv0.height = img.naturalHeight || 573; const c0 = cv0.getContext('2d'); c0.drawImage(img, 0, 0); let id; try { id = c0.getImageData(0, 0, cv0.width, cv0.height); } catch (e) { id = null; }
          if (id) { const W0 = cv0.width, H0 = cv0.height, d = id.data, seen = new Uint8Array(W0 * H0), st = [];
            const bg = function (i) { return d[i * 4 + 3] < 40 || (d[i * 4] > 225 && d[i * 4 + 1] > 225 && d[i * 4 + 2] > 225); };
            for (let x = 0; x < W0; x++) { st.push(x, (H0 - 1) * W0 + x); } for (let y = 0; y < H0; y++) { st.push(y * W0, y * W0 + W0 - 1); }
            while (st.length) { const i = st.pop(); if (seen[i] || !bg(i)) continue; seen[i] = 1; d[i * 4 + 3] = 0; const x = i % W0, y = (i / W0) | 0; if (x > 0) st.push(i - 1); if (x < W0 - 1) st.push(i + 1); if (y > 0) st.push(i - W0); if (y < H0 - 1) st.push(i + W0); }
            for (let pass = 0; pass < 2; pass++) { const kill = []; for (let y = 1; y < H0 - 1; y++) for (let x = 1; x < W0 - 1; x++) { const i = y * W0 + x; if (d[i * 4 + 3] && (!d[(i - 1) * 4 + 3] || !d[(i + 1) * 4 + 3] || !d[(i - W0) * 4 + 3] || !d[(i + W0) * 4 + 3])) kill.push(i); } kill.forEach(function (i) { d[i * 4 + 3] = 0; }); }
            c0.putImageData(id, 0, 0); }
          const t = new THREE.CanvasTexture(cv0); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; t.needsUpdate = true; t.userData.sleek = 2;
          const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.04, roughness: 0.4, metalness: 0.35, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.38 });
          const p = flag(new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), m)); p.position.set(0, BY, 12.8); grp.add(p);
          // soft pink halo behind it
          const hc = document.createElement('canvas'); hc.width = hc.height = 128; const g = hc.getContext('2d'); const rg = g.createRadialGradient(64, 64, 4, 64, 64, 64); rg.addColorStop(0, 'rgba(255,90,170,0.65)'); rg.addColorStop(1, 'rgba(255,90,170,0)'); g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
          const ht = new THREE.CanvasTexture(hc); const hm = flag(new THREE.Mesh(new THREE.PlaneGeometry(signW * 1.5, signH * 1.5), new THREE.MeshBasicMaterial({ map: ht, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))); hm.position.set(0, BY, 12.74); grp.add(hm);
          life.push(function (tt) { hm.material.opacity = 0.75 + Math.sin(tt * 2.4) * 0.25; });
        };
        img.src = window.BUCK_SIGN || '';
        // belt lettering either side of the buckle
        const word = function (txt, x) {
          const t = mkTex(1024, 192, function (g, W, Hh) {
            g.clearRect(0, 0, W, Hh); g.font = '900 150px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.shadowColor = '#ff2a9a'; g.shadowBlur = 28; g.fillStyle = '#ff7ac8'; g.fillText(txt, W / 2, Hh / 2 + 6);
            g.shadowBlur = 0; g.lineWidth = 7; g.strokeStyle = '#ffd36a'; g.strokeText(txt, W / 2, Hh / 2 + 6); g.fillStyle = '#fff4d8'; g.fillText(txt, W / 2, Hh / 2 + 6);
          });
          const m = flag(new THREE.Mesh(new THREE.PlaneGeometry(6.6, 6.6 * 192 / 1024 * 1.0), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }))); m.position.set(x, BY + 0.03, 12.73); grp.add(m);
        };
        word('THE BITTER', -8.1); word('BLONDE', 8.1);
        // gold conchos (studs) down the strap
        { const cg = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 14); cg.rotateX(Math.PI / 2); const xs = []; for (let x = -11.4; x <= 11.5; x += 1.5) if (Math.abs(x) > 4.8 && Math.abs(Math.abs(x) - 8.1) > 0.01) xs.push(x);
          const im = flag(new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: 0xd9a63a, metalness: 0.9, roughness: 0.3, emissive: 0x4a3008 }), xs.length * 2)); const mt = new THREE.Matrix4(); let n = 0;
          xs.forEach(function (x) { [-1, 1].forEach(function (s) { mt.makeTranslation(x, BY + s * 0.44, 12.74); im.setMatrixAt(n++, mt); }); }); grp.add(im); }
        // ---------- saloon false-front: weathered board cladding + cornice ----------
        const plankT = mkTex(256, 512, function (g, W, Hh) {
          const cols = ['#4b1e2a', '#2e1a22', '#5a2430', '#26161c', '#3d1c26']; const bw = W / 8;
          for (let i = 0; i < 8; i++) { g.fillStyle = cols[i % 5]; g.fillRect(i * bw, 0, bw, Hh); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(i * bw, 0, 2, Hh); }
          for (let i = 0; i < 1400; i++) { g.fillStyle = 'rgba(' + (i % 3 ? '0,0,0' : '230,190,150') + ',' + (0.04 + Math.random() * 0.07) + ')'; g.fillRect(Math.random() * W, Math.random() * Hh, 1, 6 + Math.random() * 40); }
          g.fillStyle = 'rgba(20,10,10,0.7)'; for (let i = 0; i < 18; i++) g.fillRect(Math.random() * W, Math.random() * Hh, 3, 3);
        });
        plankT.wrapS = plankT.wrapT = THREE.RepeatWrapping; plankT.repeat.set(2.6, 1.1);
        const plankM = new THREE.MeshStandardMaterial({ map: plankT, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        [-6.9, 6.9].forEach(function (x) { const p = flag(new THREE.Mesh(new THREE.PlaneGeometry(10.2, 6.7), plankM)); p.position.set(x, 3.4, 12.17); grp.add(p); });
        // cornice + crown
        const wood = new THREE.MeshStandardMaterial({ color: 0x2a1218, roughness: 0.8 });
        box(24.4, 0.45, 0.9, wood, 0, 10.2, 12.5); box(24.0, 0.25, 0.6, new THREE.MeshStandardMaterial({ color: 0xc89a3a, metalness: 0.7, roughness: 0.4 }), 0, 9.95, 12.7);
        // pediment for the buckle: stepped saloon crown
        box(9.6, 0.5, 0.7, wood, 0, 10.65, 12.45); box(6.4, 0.5, 0.6, wood, 0, 11.15, 12.4); box(3.0, 0.5, 0.5, wood, 0, 11.65, 12.35);
        // ---------- glowing club windows with dancing silhouettes + neon frames ----------
        const winT = mkTex(256, 200, function (g, W, Hh) {
          const gr = g.createLinearGradient(0, 0, W, Hh); gr.addColorStop(0, '#ff3d9a'); gr.addColorStop(0.5, '#ff9a4a'); gr.addColorStop(1, '#7a3dff'); g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
          g.filter = 'blur(2px)'; g.fillStyle = 'rgba(10,0,12,0.85)';
          for (let i = 0; i < 6; i++) { const x = 25 + i * 38 + (i % 2) * 6, h = 70 + (i * 37) % 40; g.beginPath(); g.arc(x, Hh - h - 8, 11, 0, 7); g.fill(); g.fillRect(x - 10, Hh - h + 4, 20, h + 6); if (i % 2) { g.save(); g.translate(x, Hh - h + 8); g.rotate(-0.9); g.fillRect(0, -3, 34, 6); g.restore(); } else { g.save(); g.translate(x, Hh - h + 8); g.rotate(0.9); g.fillRect(-34, -3, 34, 6); g.restore(); } }
          g.filter = 'none'; g.fillStyle = 'rgba(0,0,0,0.5)'; for (let x = 0; x < W; x += 16) g.fillRect(x, 0, 2, Hh);
        });
        const winMats = [];
        [-4.2, 4.2].forEach(function (x, k) {
          const m = new THREE.MeshBasicMaterial({ map: winT }); winMats.push(m); const w = flag(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), m)); w.position.set(x, 3.6, 12.22); grp.add(w);
          [[0xff2a9a, 0.9], [0x3affff, 0.9]].forEach(function (cc, ci) { const o = 0.07 * ci, hw = 1.75 + o, hh = 1.35 + o; const nm = basic(cc[0]);
            box(2 * hw, 0.09, 0.08, nm, x, 3.6 + hh, 12.26 + ci * 0.02); box(2 * hw, 0.09, 0.08, nm, x, 3.6 - hh, 12.26 + ci * 0.02); box(0.09, 2 * hh, 0.08, nm, x - hw, 3.6, 12.26 + ci * 0.02); box(0.09, 2 * hh, 0.08, nm, x + hw, 3.6, 12.26 + ci * 0.02); });
        });
        life.push(function (t) { const b = 0.82 + 0.18 * Math.sin(t * 8.2); winMats.forEach(function (m, i) { m.color.setScalar(b * (i ? 0.95 : 1)); }); });
        // ---------- doorway: dark timber frame, studded doors, batwings, neon pillars ----------
        box(0.28, 4.7, 0.5, wood, -1.85, 2.35, 12.3); box(0.28, 4.7, 0.5, wood, 1.85, 2.35, 12.3); box(4.0, 0.4, 0.55, wood, 0, 4.8, 12.3);
        [-1.98, 1.98].forEach(function (x) { box(0.07, 4.7, 0.07, basic(0xff2a9a), x, 2.35, 12.58); });
        const bat = []; [-1, 1].forEach(function (s) { const pv = new THREE.Group(); pv.position.set(s * 1.6, 0.55, 12.45); const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.35, 0.07), new THREE.MeshStandardMaterial({ color: 0x24100f, roughness: 0.7 })); flag(leaf); leaf.position.set(-s * 0.75, 0.68, 0); pv.add(leaf); for (let i = 0; i < 5; i++) { const sl = flag(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.35, 0.09), new THREE.MeshStandardMaterial({ color: 0x5a2c16, roughness: 0.7 }))); sl.position.set(-s * (0.15 + i * 0.3), 0.68, 0.01); pv.add(sl); } grp.add(pv); bat.push([pv, s]); });
        life.push(function (t) { bat.forEach(function (b, i) { b[0].rotation.y = b[1] * (0.12 + 0.1 * Math.sin(t * 2.3 + i * 1.7)); }); });
        // ---------- marquee bulbs along awning + cornice (chasing) ----------
        { const pts = []; for (let x = -11.2; x <= 11.3; x += 0.56) { pts.push([x, 4.3, 17.08]); } for (let x = -11.8; x <= 11.9; x += 0.8) { pts.push([x, 10.05, 13.18]); }
          const bm = new THREE.MeshBasicMaterial({ color: 0xffffff }); const im = flag(new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), bm, pts.length)); const mt = new THREE.Matrix4(), col = new THREE.Color(); pts.forEach(function (p, i) { mt.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, mt); im.setColorAt(i, col.set(0xffd68a)); }); grp.add(im);
          let acc = 0; life.push(function (t, dt) { acc += dt || 0.016; if (acc < 0.09) return; acc = 0; for (let i = 0; i < pts.length; i++) { const on = ((i + Math.floor(t * 7)) % 4) < 2; col.set(on ? 0xffe6a0 : 0x6a3a20); im.setColorAt(i, col); } im.instanceColor.needsUpdate = true; }); }
        // ---------- spotlight beams raking up at the sign ----------
        [[-6.5, 18], [6.5, 18]].forEach(function (b, i) {
          const a = new THREE.Vector3(b[0], 0.1, b[1]), c = new THREE.Vector3(i ? 2.5 : -2.5, 8.2, 12.9), d = c.clone().sub(a), L = d.length();
          const g = new THREE.CylinderGeometry(0.2, 1.5, L, 18, 1, true); g.translate(0, L / 2, 0);
          const m = flag(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: i ? 0xff5ab4 : 0xffc680, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })));
          m.position.copy(a); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); m.scale.set(1, 1, 1); m.rotation.reorder('YXZ'); grp.add(m);
          life.push(function (t) { m.material.opacity = 0.10 + 0.04 * Math.sin(t * 1.7 + i * 2); });
        });
        // swap the old "SUNSET STRIP" signboards out
        const bb2 = new THREE.Box3(), s2 = new THREE.Vector3(), c2 = new THREE.Vector3();
        const hideOld = function () { scene.traverse(function (o) { if (!o.isMesh || o.visible === false) return; let p = o, mine = false; while (p) { if (p === grp) { mine = true; break; } p = p.parent; } if (mine) return;
          bb2.setFromObject(o); if (bb2.isEmpty()) return; bb2.getSize(s2); bb2.getCenter(c2);
          if (Math.abs(c2.x) < 0.6 && c2.y > 6.3 && c2.y < 9.6 && c2.z > 12.1 && c2.z < 12.9 && s2.x > 2.5 && s2.x < 10 && s2.y < 3.3) o.visible = false; }); };
        const hid = []; const hideOld2 = function () { scene.traverse(function (o) { if (!o.isMesh || o.visible === false) return; let p = o; while (p) { if (p === grp) return; p = p.parent; } bb2.setFromObject(o); if (bb2.isEmpty()) return; bb2.getSize(s2); bb2.getCenter(c2); if (Math.abs(c2.x) < 0.6 && c2.y > 6.3 && c2.y < 9.6 && c2.z > 12.1 && c2.z < 12.9 && s2.x > 2.5 && s2.x < 10 && s2.y < 3.3) { hid.push(o); } else if (Math.abs(c2.x) < 0.6 && c2.y > 3.2 && c2.y < 4.2 && c2.z > 14.8 && c2.z < 15.7 && s2.x > 3.5 && s2.x < 5.5 && s2.y < 1) { hid.push(o); } }); hid.forEach(function (o) { o.visible = false; if (o.parent) o.parent.remove(o); }); }; let hacc = 0, hn = 0; life.push(function (t, dt) { hid.forEach(function (o) { if (o.visible) o.visible = false; }); hacc += dt || 0.016; if (hacc > 2 && hn < 4 && t > 2) { hacc = 0; hn++; hideOld2(); } });
      } catch (err) { console.error('BUCK bitterBlonde', err && (err.stack || err)); }
    })();
    // ---- STREET CHAOS: brawls, drunks, people in the road, a lowrider swerving round them, shouted speech bubbles. Visual only ----
    (function streetChaos() {
      try {
        const life = window.__buckLife = window.__buckLife || [];
        const grp = new THREE.Group(); grp.name = 'streetChaos'; scene.add(grp);
        const shouts = ['OH HELL NO!', 'SAY IT AGAIN!', 'GET OFF ME!', 'WHO YOU LOOKIN AT?!', 'BUCK UP!', 'RUN IT BACK!', 'NOT TONIGHT!', 'MOVE, BABE!', 'HOLD MY HOOPS', 'YEEHAW!!', 'SHE STOLE MY SHOT', 'BITCH PLEASE'];
        const bubbleTex = {};
        const bubble = function (txt, hot) {
          const k = txt + hot; if (bubbleTex[k]) return bubbleTex[k];
          const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d');
          g.font = '900 52px Impact, "Arial Black", sans-serif'; const w = Math.min(490, g.measureText(txt).width + 60);
          g.translate(256, 0); g.fillStyle = '#fff6e0'; g.strokeStyle = '#1a0a10'; g.lineWidth = 8; g.beginPath(); g.moveTo(-w / 2 + 24, 14); g.lineTo(w / 2 - 24, 14); g.quadraticCurveTo(w / 2, 14, w / 2, 40); g.lineTo(w / 2, 82); g.quadraticCurveTo(w / 2, 108, w / 2 - 24, 108); g.lineTo(18, 108); g.lineTo(0, 150); g.lineTo(-8, 108); g.lineTo(-w / 2 + 24, 108); g.quadraticCurveTo(-w / 2, 108, -w / 2, 82); g.lineTo(-w / 2, 40); g.quadraticCurveTo(-w / 2, 14, -w / 2 + 24, 14); g.closePath(); g.fill(); g.stroke();
          g.fillStyle = hot ? '#e0143c' : '#1a0a10'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 0, 62);
          const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.userData.sleek = 2; return (bubbleTex[k] = t);
        };
        window.__buckBubble = bubble; window.__buckShouts = shouts; window.__buckSay = function (txt, x, y, z, hot) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubble(txt, hot), transparent: true, depthWrite: false, fog: false })); sp.scale.set(2.7, 0.84, 1); sp.position.set(x, y, z); sp.userData.life = 0; sp.renderOrder = 20; grp.add(sp); grp.userData.bub = (grp.userData.bub || []).concat([sp]); };
        const tints = [0xff4fa8, 0x2a2a30, 0xe8c04a, 0x3aa0ff, 0xff7a3a, 0xb84dff, 0x7be08a, 0xd9d9d9, 0xff3030];
        let T = null; const cast = [];
        const spawn = function (tpl, x, z, yaw, tint, sc) {
          const w = tpl.clone(true); w.name = 'chaosPed'; w.position.set(x, tpl.position.y, z); w.rotation.set(0, yaw, 0); w.scale.multiplyScalar(sc || 1);
          w.traverse(function (o) { if (o.isMesh) { o.userData.keepPBR = o.userData.noPBR = true; if (o.material) { o.material = o.material.clone(); o.material.userData.keepPBR = o.material.userData.noPBR = true; if (o.material.color) o.material.color.multiply(new THREE.Color(tint)); } } });
          grp.add(w); const p = { w: w, x: x, z: z, yaw: yaw, ph: Math.random() * 6.28, h: w.position.y }; cast.push(p); return p;
        };
        const hit = function (p, t, face, sp) { // brawl body language: lunge, recoil, whip round, jolt
          const c = Math.sin(t * sp + p.ph), d = Math.max(0, Math.sin(t * sp * 0.5 + p.ph * 2));
          p.w.position.x = p.x + Math.cos(face) * 0.0 + Math.sin(face) * c * 0.28 * d; p.w.position.z = p.z + Math.cos(face) * c * 0.28 * d;
          p.w.position.y = p.h + Math.max(0, Math.sin(t * sp * 1.3 + p.ph)) * 0.14;
          p.w.rotation.y = face + Math.sin(t * sp * 0.7 + p.ph) * 0.35; p.w.rotation.x = c * 0.16 * d; p.w.rotation.z = Math.sin(t * sp * 1.7 + p.ph) * 0.14;
        };
        const build = function () {
          return true; const peds = []; scene.traverse(function (o) { if (o.name === 'ped' && o.parent && o.parent.name === 'exterior') peds.push(o); });
          if (peds.length < 2) return false; T = peds;
          const pick = function (i) { return T[i % T.length]; };
          // two brawls on the forecourt (pairs face each other)
          const brawls = [[-5.8, 19.6, 0], [8.2, 21.4, 1.1], [-0.6, 24.6, 2.3]];
          brawls.forEach(function (b, k) {
            const a = spawn(pick(k * 2), b[0] - 0.55, b[1], Math.PI / 2, tints[(k * 3) % 9], 0.98), c = spawn(pick(k * 2 + 1), b[0] + 0.55, b[1], -Math.PI / 2, tints[(k * 3 + 4) % 9], 1.02);
            a.fight = c.fight = k + 1; a.mate = c; c.mate = a; a.base = Math.PI / 2; c.base = -Math.PI / 2; a.sp = 7 + k; c.sp = 7.7 + k;
          });
          // drunks wandering the pavement
          [[-9, 15.8], [2, 16.6], [10, 15.9]].forEach(function (d, k) { const p = spawn(pick(k + 4), d[0], d[1], 0.4, tints[(k * 2 + 1) % 9], 1); p.drunk = true; p.sp = 0.5 + k * 0.12; p.dir = k % 2 ? -1 : 1; p.tx = d[0]; });
          // people standing in the road, shouting at the cars
          [[-3.4, 30.7, 0.2], [-1.2, 31.4, -0.3], [1.6, 30.4, 0.5], [3.4, 31.2, -0.1]].forEach(function (d, k) { const p = spawn(pick(k + 1), d[0], d[1], d[2] + (k % 2 ? -Math.PI / 2 : Math.PI / 2), tints[(k + 5) % 9], 1); p.road = true; p.sp = 2.6 + k * 0.5; p.base = p.yaw; });
          return true;
        };
        let built = false, acc = 0, bt = 0;
        life.push(function (t, dt) {
          if (!built) { acc += dt || 0.016; if (acc > 1.5) { acc = 0; if (t > 3) built = build(); } return; }
          cast.forEach(function (p) {
            const w = p.w;
            if (p.fight) { const m = p.mate; const face = p.base + Math.sin(t * 1.1 + p.fight) * 0.5; hit(p, t, face, p.sp); }
            else if (p.drunk) { p.tx += p.dir * (dt || 0.016) * 0.35; if (p.tx > 17) p.tx = -17; if (p.tx < -17) p.tx = 17; w.position.x = p.tx + Math.sin(t * p.sp * 2.1 + p.ph) * 0.5; w.position.z = p.z + Math.sin(t * p.sp * 1.3 + p.ph) * 0.45; w.rotation.y = (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(t * p.sp * 1.7 + p.ph) * 0.9; w.rotation.z = Math.sin(t * p.sp * 2.1 + p.ph) * 0.26; w.rotation.x = Math.sin(t * p.sp * 1.1 + p.ph) * 0.1; }
            else if (p.road) { w.rotation.y = p.base + Math.sin(t * 0.8 + p.ph) * 0.5; w.position.y = p.h + Math.max(0, Math.sin(t * p.sp + p.ph)) * 0.18; w.rotation.z = Math.sin(t * p.sp * 1.9 + p.ph) * 0.12; w.rotation.x = Math.sin(t * p.sp + p.ph) * 0.08; }
          });
          // shouted bubbles
          bt += dt || 0.016; if (bt > 1.1) { bt = 0; const ps = cast.filter(function (p) { return p.fight || p.road || p.drunk; }); const p = ps[Math.floor(Math.random() * ps.length)]; if (p) {
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubble(shouts[Math.floor(Math.random() * shouts.length)], Math.random() > 0.5), transparent: true, depthWrite: false, fog: false })); s.scale.set(2.4, 0.75, 1); s.position.set(p.w.position.x, p.w.position.y + 2.6, p.w.position.z); s.userData.life = 0; s.renderOrder = 20; grp.add(s); p.w.userData.b = s; grp.userData.bub = (grp.userData.bub || []).concat([s]); } }
          if (grp.userData.bub) grp.userData.bub = grp.userData.bub.filter(function (s) { s.userData.life += dt || 0.016; s.position.y += (dt || 0.016) * 0.25; s.material.opacity = Math.min(1, 3 - s.userData.life * 1.4); if (s.userData.life > 2.1) { grp.remove(s); s.material.dispose(); return false; } return true; });
        });
        // lowriders swerve around the people standing in the road
        const carCfg = {}; const dzOf = function (x, amp) { const u = (x + 0.0) / 4.2; return amp * Math.exp(-u * u); };
        life.push(function () {
          [['lowriderA', 2.9, -1], ['lowriderB', -3.1, 1]].forEach(function (c) {
            const o = scene.getObjectByName(c[0]) || (function () { let f = null; scene.traverse(function (q) { if (!f && q.name === c[0]) f = q; }); return f; })(); if (!o) return;
            let k = carCfg[c[0]]; if (!k) k = carCfg[c[0]] = { z: o.position.z, y: o.rotation.y };
            const dz = dzOf(o.position.x, c[1]), dz2 = dzOf(o.position.x + 0.5, c[1]), dz1 = dzOf(o.position.x - 0.5, c[1]);
            o.position.z = k.z + dz; o.rotation.y = k.y + c[2] * Math.atan(dz2 - dz1);
          });
        });
      } catch (err) { console.error('BUCK streetChaos', err && (err.stack || err)); }
    })();
    // ---- CROWD CHAOS: brawlers, screamers shouting at the rider, street-style accessories. Visual only ----
    (function crowdChaos() {
      try {
        const life = window.__buckLife = window.__buckLife || [];
        const MP = THREE.AnimationMixer.prototype, origUpdate = MP.update;
        MP.update = function (dt) { const r = origUpdate.call(this, dt); const rt = this._root; if (rt && rt.userData && rt.userData.post) { try { rt.userData.post(performance.now() / 1000); } catch (e) {} } return r; };
        const qp = new THREE.Quaternion(), qr = new THREE.Quaternion(), qi = new THREE.Quaternion(), V = new THREE.Vector3(), AX = new THREE.Vector3();
        const rot = function (b, axis, a) { if (!b || !b.parent) return; b.parent.getWorldQuaternion(qp); qr.setFromAxisAngle(axis, a); qi.copy(qp).invert().multiply(qr).multiply(qp); b.quaternion.premultiply(qi); };
        const lines = ['RIDE HER!', "DON'T YOU FALL!", 'HOLD ON, BABE!', 'MORE!! MORE!!', 'BUCK UP!', 'YOU GOT THIS!', 'YEEHAW!!', 'THROW HER OFF!', 'WOOOO!', 'SHE\'S GONNA BLOW!', 'DON\'T BE BORING!'];
        let done = false, acc = 0, people = [];
        const gold = new THREE.MeshStandardMaterial({ color: 0xe0b040, metalness: 1, roughness: 0.25, emissive: 0x3a2808 });
        const mat = function (hex, r) { return new THREE.MeshStandardMaterial({ color: hex, roughness: r == null ? 0.7 : r, metalness: 0 }); };
        const mkPerson = function (w, i) {
          const inst = w.children[0], B = {}; let pre = '';
          inst.traverse(function (b) { if (!b.isBone) return; const n = b.name; let m;
            if (/_head_\d+$/.test(n)) B.head = b; else if (/_head_end_\d+$/.test(n)) B.headEnd = b; else if (/_neck_\d+$/.test(n)) B.neck = b; else if (/_spine_02_\d+$/.test(n)) B.sp = b; else if (/_jaw_\d+$/.test(n)) B.jaw = b;
            else if (/_upperarm_l_\d+$/.test(n)) B.uaL = b; else if (/_upperarm_r_\d+$/.test(n)) B.uaR = b; else if (/_lowerarm_l_\d+$/.test(n)) B.laL = b; else if (/_lowerarm_r_\d+$/.test(n)) B.laR = b;
            if (!pre && (m = /^rp_([a-z]+)_/.exec(n))) pre = m[1]; });
          return { w: w, inst: inst, B: B, i: i, woman: /sophia|carla|claudia|anna|eva|julia/.test(pre), ph: i * 1.91 + Math.random(), role: 0, y0: inst.position.y, p: new THREE.Vector3(), dir: i % 2 ? 1 : -1 };
        };
        const setup = function () {
          const ws = []; scene.traverse(function (o) { if (o.name === 'realPed' && o.children[0]) ws.push(o); });
          if (ws.length < 12) return false;
          people = ws.map(function (w, i) { return mkPerson(w, i); });
          people.forEach(function (q) { q.w.getWorldPosition(q.p); });
          // pair up the nearest people as brawlers (3 pairs), screamers = next ring
          const free = people.slice(); const pairs = [];
          for (let k = 0; k < 3 && free.length > 3; k++) { const a = free.shift(); let bi = 0, bd = 1e9; free.forEach(function (c, j) { const d = a.p.distanceTo(c.p); if (d < bd) { bd = d; bi = j; } }); const c = free.splice(bi, 1)[0]; a.role = c.role = 1; a.mate = c; c.mate = a; a.sp = 6.5 + k; c.sp = 7.4 + k; pairs.push([a, c]); }
          free.forEach(function (q, j) { if (j % 3 !== 2) q.role = (j % 5 === 1 ? 5 : (j % 7 === 3 ? 6 : 2)); });
          people.forEach(function (q) { const k = 0.97 + ((q.i * 37) % 7) / 100; q.inst.scale.multiplyScalar(k); });
          people.forEach(function (q) { q.inst.userData.post = function (t) { act(q, t); }; });
          people.forEach(accessorise);
          return true;
        };
        const ang = function (d) { return Math.atan2(Math.sin(d), Math.cos(d)); };
        const act = function (q, t) {
          const bl = q.bl || (q.bl = Object.keys(q.B).map(function (k) { return q.B[k]; }).filter(function (b) { return b && b.isBone; }));
          // undo last frame's pose offsets on bones the clip does not drive, so nothing accumulates into stretched skin
          bl.forEach(function (b) { const u = b.userData; if (u.lastQ && b.quaternion.equals(u.lastQ)) b.quaternion.copy(u.origQ); u.origQ = b.quaternion.clone(); });
          try { act0(q, t); } finally { bl.forEach(function (b) { b.userData.lastQ = b.quaternion.clone(); }); }
        };
        const act0 = function (q, t) {
          const w = q.w, inst = q.inst, B = q.B; if (!q.role || !w.visible) return;
          inst.getWorldQuaternion(qr); const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(qr), right = new THREE.Vector3(1, 0, 0).applyQuaternion(qr);
          w.getWorldPosition(q.p);
          if (q.role === 5) { // phone up, filming the chaos
            const s = Math.sin(t * 2 + q.ph); inst.rotation.y += ang((Math.atan2(-q.p.x, -q.p.z) - w.rotation.y) - inst.rotation.y) * 0.1;
            rot(B.uaR, right, -1.35); rot(B.laR, right, -1.1 + 0.1 * s); rot(B.head, right, -0.1); return;
          }
          if (q.role === 6) { // shimmy / hands on head
            const s = Math.sin(t * 5 + q.ph); inst.position.x = s * 0.04;
            rot(B.uaL, fwd, 1.5); rot(B.uaR, fwd, -1.5); rot(B.laL, right, -0.9); rot(B.laR, right, -0.9); return;
          }
          if (q.role === 3) { // drunk: sway, droop, swig
            const s = Math.sin(t * 1.7 + q.ph), s2 = Math.sin(t * 0.9 + q.ph * 2);
            inst.position.x = Math.sin(t * 1.1 + q.ph) * 0.15; inst.rotation.y = (q.dir > 0 ? Math.PI / 2 : -Math.PI / 2) - w.rotation.y + Math.sin(t * 0.8 + q.ph) * 0.8;
            rot(B.head, right, 0.3 + 0.2 * s); rot(B.sp, right, 0.15); const sw = Math.max(0, Math.sin(t * 0.7 + q.ph)); rot(B.uaR, right, -1.7 * sw); rot(B.laR, right, -1.3 * sw); return;
          }
          if (q.role === 4) { // yelling in the road
            inst.rotation.y = (q.base || 0) - w.rotation.y + Math.sin(t * 0.8 + q.ph) * 0.6; const s = Math.sin(t * 8 + q.ph), s2 = Math.sin(t * 6.1 + q.ph * 1.3);
            inst.position.y = q.y0; rot(B.uaL, fwd, 1.2 + 0.4 * s); rot(B.uaR, fwd, -(0.6 + 0.6 * Math.abs(s2))); rot(B.head, right, -0.2); rot(B.jaw, right, 0.2 + 0.15 * Math.abs(s)); return;
          }
          if (q.role === 2) {
            const yaw = Math.atan2(-q.p.x, -q.p.z) - w.rotation.y; inst.rotation.y += ang(yaw - inst.rotation.y) * 0.25;
            const s = Math.sin(t * 9 + q.ph), s2 = Math.sin(t * 7.3 + q.ph * 1.7);
            inst.position.y = q.y0;
            rot(B.uaL, fwd, 1.5 + 0.3 * s); rot(B.uaR, fwd, -(1.5 + 0.3 * s2)); rot(B.head, right, -0.25 + 0.08 * s); rot(B.jaw, right, 0.2 + 0.15 * Math.abs(s)); rot(B.sp, right, -0.06 + 0.05 * s2);
          } else {
            const m = q.mate, dx = m.p.x - q.p.x, dz = m.p.z - q.p.z, d = Math.hypot(dx, dz) || 1;
            const yaw = Math.atan2(dx, dz) - w.rotation.y; inst.rotation.y += ang(yaw - inst.rotation.y) * 0.3;
            const close = Math.max(0, Math.min(1.1, (d - 1.05) / 2)), c = Math.cos(-w.rotation.y), sn = Math.sin(-w.rotation.y);
            const swing = Math.max(0, Math.sin(t * q.sp + q.ph)), jolt = Math.sin(t * q.sp * 0.5 + q.ph);
            const ox = (dx / d) * (close + swing * 0.12), oz = (dz / d) * (close + swing * 0.12);
            inst.position.x = ox * c + oz * sn; inst.position.z = -ox * sn + oz * c; inst.position.y = q.y0;
            rot(B.sp, right, 0.2 * swing); rot(B.uaR, right, -1.3 * swing); rot(B.laR, right, -0.5 * swing); rot(B.uaL, right, -1.2 * Math.max(0, Math.sin(t * q.sp + q.ph + 3.1))); rot(B.uaL, fwd, 0.3); rot(B.head, right, 0.08 * jolt);
          }
        };
        // accessories (world-sized, parented to head/neck bones so they follow the dance)
        const bodgeV = new THREE.Vector3();
        const attach = function (bone, inst, mesh, localPos) { // localPos in inst space (metres, upright)
          inst.updateWorldMatrix(true, true); const wp = inst.localToWorld(localPos.clone()); bone.updateWorldMatrix(true, false);
          const bq = new THREE.Quaternion(), iq = new THREE.Quaternion(), bs = new THREE.Vector3(); bone.getWorldQuaternion(bq); inst.getWorldQuaternion(iq); bone.getWorldScale(bs);
          mesh.position.copy(bone.worldToLocal(wp)); mesh.quaternion.copy(bq.invert().multiply(iq)); mesh.scale.setScalar(1 / (bs.x || 1)); mesh.userData.keepPBR = mesh.userData.noPBR = true; mesh.traverse(function (o) { o.userData.keepPBR = o.userData.noPBR = true; o.frustumCulled = false; }); bone.add(mesh);
        };
        const accessorise = function (q) {
          const B = q.B, inst = q.inst; if (!B.head || !B.headEnd || !B.neck) return;
          inst.updateWorldMatrix(true, true); const hp = inst.worldToLocal(B.head.getWorldPosition(new THREE.Vector3())), he = inst.worldToLocal(B.headEnd.getWorldPosition(new THREE.Vector3())), np = inst.worldToLocal(B.neck.getWorldPosition(new THREE.Vector3()));
          const sc = inst.getWorldScale(new THREE.Vector3()).x || 1; // inst local units -> metres factor
          const toL = function (x, y, z) { return new THREE.Vector3(x / sc, y / sc, z / sc); };
          const hc = hp.clone().lerp(he, 0.55), i = q.i;
          const addAt = function (mesh, off) { attach(B.head, inst, mesh, hc.clone().add(toL(off[0], off[1], off[2]))); };
          const chain = function () { const m = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.009, 8, 20), gold); m.rotation.x = Math.PI / 2; const g = new THREE.Group(); g.add(m); attach(B.neck, inst, g, np.clone().add(toL(0, -0.035, 0.012))); const p2 = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.007, 8, 18), gold); p2.rotation.x = Math.PI / 2; const g2 = new THREE.Group(); g2.add(p2); attach(B.neck, inst, g2, np.clone().add(toL(0, -0.085, 0.03))); };
          const hoops = function () { [-1, 1].forEach(function (s) { const m = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0045, 8, 16), gold); m.rotation.y = Math.PI / 2; const g = new THREE.Group(); g.add(m); addAt(g, [s * 0.088, -0.03, -0.005]); }); };
          const shades = function (hex) { const g = new THREE.Group(), dm = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.15, metalness: 0.6 }); [-1, 1].forEach(function (s) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.034, 0.008), dm); l.position.x = s * 0.034; g.add(l); }); const br = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.008, 0.008), dm); br.position.y = 0.012; g.add(br); addAt(g, [0, -0.005, 0.098]); };
          const cap = function (hex, back) { const g = new THREE.Group(), cm = mat(hex); const dome = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cm); g.add(dome); const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.008, 14, 1, false, -0.9, 1.8), cm); brim.position.set(0, 0.002, (back ? -1 : 1) * 0.085); brim.rotation.y = back ? Math.PI : 0; brim.scale.set(1, 1, 0.8); g.add(brim); addAt(g, [0, 0.045, 0]); };
          const cowboy = function (hex) { const g = new THREE.Group(), cm = mat(hex, 0.85); const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 22), cm); g.add(brim); const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.108, 0.115, 16), cm); crown.position.y = 0.06; g.add(crown); const band = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 16), mat(0x2a160c)); band.position.y = 0.025; g.add(band); addAt(g, [0, 0.085, 0.01]); };
          const bandana = function (hex) { const g = new THREE.Group(), cm = mat(hex, 0.9); const band = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.05, 16, 1, true), cm); cm.side = THREE.DoubleSide; g.add(band); const knot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.03), cm); knot.position.set(0.03, -0.01, -0.12); g.add(knot); addAt(g, [0, 0.07, 0]); };
          if (false) { try { window.__buckCrop(inst, i); } catch (e) { } } if (i % 5 < 3) { try { window.__buckBoots(inst, i); } catch (e) { } }
          if (q.woman) { if (i % 5 !== 3) hoops(); if (i % 3 !== 1) chain(); if (i % 4 === 0) shades(0x1a1018); }
          else { if (i % 2 === 0) chain(); if (i % 3 === 1) shades(0x101018); }
        };
        // ---------- street cast: same scanned rigs, tinted + dressed, doing the fighting ----------
        let streetDone = false; const streetPeople = [];
        const spawnRP = function (key, tint, x, z, yaw, h, role, extra) {
          const RP = window.__buckRP; if (!RP || !THREE.SkeletonUtils) return null;
          const m = RP.models.filter(function (q) { return q.key === key; })[0] || RP.models[0];
          const inst = THREE.SkeletonUtils.clone(m.g.scene);
          inst.traverse(function (q) { q.userData.keepPBR = q.userData.noPBR = true; if (q.isMesh) { q.frustumCulled = false; if (q.material && q.material.map) { q.material.map.anisotropy = 4; q.material.map.userData.sleek = 2; } if (q.material) q.material.envMapIntensity = 0.7; } });
          if (tint) inst.traverse(function (q) { if (q.isMesh && q.material && q.material.map) { const t2 = RP.baddieTex(q.material.map, tint); if (t2) { q.material = q.material.clone(); q.material.map = t2; if (/leather|snake|sequin/.test(String(tint))) { q.material.roughness = 0.4; q.material.metalness = 0.16; } } } });
          const want = (RP.RL.credits && RP.RL.credits.anim && RP.RL.credits.anim[m.key]) || 'own';
          let clip = want === 'own' ? (m.g.animations && m.g.animations[0]) : null;
          if (!clip) { const an = RP.models.filter(function (q) { return q.g.animations && q.g.animations.length && RP.prefixOf(q.g.scene) !== null; }); const src = RP.models.filter(function (q) { return q.key === want; })[0] || an[0]; const tp = RP.prefixOf(inst), fp = src && RP.prefixOf(src.g.scene); if (src && tp !== null && fp !== null) clip = RP.retarget(src.g.animations[0], fp, tp); }
          const mixer = new THREE.AnimationMixer(inst);
          if (clip) { const a = mixer.clipAction(clip); a.time = Math.random() * clip.duration; a.timeScale = 0.9 + Math.random() * 0.5; a.play(); }
          mixer.update(0.01); inst.updateMatrixWorld(true);
          let mn = 1e9, mx = -1e9; inst.traverse(function (b) { if (b.isBone) { const y = b.getWorldPosition(new THREE.Vector3()).y; if (y < mn) mn = y; if (y > mx) mx = y; } });
          if (mn > mx) { const bb = new THREE.Box3().setFromObject(inst); mn = bb.min.y; mx = bb.max.y; }
          const sc = h / Math.max(mx - mn, 1e-4) * 0.93; const w = new THREE.Group(); w.add(inst); inst.scale.setScalar(sc); const k = 0.97 + Math.random() * 0.06; inst.scale.multiplyScalar(k); inst.position.y = -mn * sc; w.position.set(x, 0, z); w.rotation.y = yaw; w.name = 'streetRP'; w.userData.keepPBR = true; scene.add(w);
          const q = mkPerson(w, 100 + streetPeople.length); q.role = role; q.street = true; q.base = extra && extra.base; q.sp = 6 + Math.random() * 3; q.p0 = w.position.clone(); Object.assign(q, extra || {});
          inst.userData.post = function (t) { act(q, t); };
          life.push(function (t, dt) { if (q.role === 3) { w.position.x += q.dir * (dt || 0.016) * 0.25; if (w.position.x > 16) w.position.x = -16; if (w.position.x < -16) w.position.x = 16; } mixer.update(dt || 0.016); });
          accessorise(q); streetPeople.push(q); return q;
        };
        const buildStreet = function () {
          const RP = window.__buckRP; if (!RP) return false; const ks = RP.models.map(function (q) { return q.key; }); const wk = ks.filter(function (k) { return /sophia|carla|claudia/.test(k); }), mk = ks.filter(function (k) { return !/sophia|carla|claudia/.test(k); });
          const tm = ['pink', 'red', 'black', 'wine', 'purple', 'orange', 'lime', 'cobalt', 'gold'], bm = ['grey', 'black', 'ltdenim', 'khaki', 'grey', 'pink'];
          const outfit = function (j) { return tm[j % tm.length] + '+' + bm[(j * 2 + 1) % bm.length]; };
          const pick = function (j, w) { const a = w ? (wk.length ? wk : ks) : (mk.length ? mk : ks); return a[j % a.length]; };
          [[-7, 24.5], [6, 25.2], [-3.2, 27.4]].forEach(function (b, k) {
            const a = spawnRP(pick(k, k % 2 === 0), outfit(k * 2), b[0] - 0.9, b[1], Math.PI / 2, k % 2 === 0 ? 1.68 : 1.86, 1), c = spawnRP(pick(k + 1, k % 2 !== 0), outfit(k * 2 + 3), b[0] + 0.9, b[1], -Math.PI / 2, k % 2 === 0 ? 1.85 : 1.66, 1);
            if (a && c) { a.mate = c; c.mate = a; }
          });
          [[-9, 15.8, 1], [2, 16.6, -1], [10, 15.9, 1]].forEach(function (d, k) { spawnRP(pick(k + 2, k % 2 === 1), outfit(k + 5), d[0], d[1], 0, 1.7, 3, { dir: d[2] }); });
          [[-3.4, 30.7, 0.2], [-1.2, 31.4, 2.9], [1.6, 30.4, 0.5], [3.4, 31.2, -2.6]].forEach(function (d, k) { spawnRP(pick(k, k % 2 === 0), outfit(k + 7), d[0], d[1], d[2], 1.72, 4, { base: d[2] }); });
          return true;
        };
        let bt = 0;
        life.push(function (t, dt) {
          if (!streetDone && t > 4 && window.__buckRP) streetDone = buildStreet();
          if (!done) { acc += dt || 0.016; if (acc > 2) { acc = 0; if (t > 4) done = setup(); } return; }
          bt += dt || 0.016; if (bt > 0.7 && window.__buckSay) { bt = 0; const sc = people.filter(function (q) { return q.role === 2 && q.w.visible; }).sort(function (a, b) { return Math.hypot(a.p.x, a.p.z) - Math.hypot(b.p.x, b.p.z); }).slice(0, 8).concat(streetPeople); const q = sc[Math.floor(Math.random() * sc.length)]; if (q) window.__buckSay(q.street ? window.__buckShouts[Math.floor(Math.random() * window.__buckShouts.length)] : lines[Math.floor(Math.random() * lines.length)], q.p.x, 2.3, q.p.z, Math.random() > 0.4); }
        });
      } catch (err) { console.error('BUCK crowdChaos', err && (err.stack || err)); }
    })();
    // ---- WORLD PROPS + SOUND: street lamps, neon blade signs, bins/hydrants/shelter, barrel fires; synthesised crowd/fight/street audio. Visual+audio only ----
    (function worldProps() {
      try {
        const life = window.__buckLife = window.__buckLife || [];
        const grp = new THREE.Group(); grp.name = 'worldProps'; scene.add(grp);
        const flag = function (o) { o.userData.keepPBR = o.userData.noPBR = true; if (o.material) o.material.userData.keepPBR = o.material.userData.noPBR = true; return o; };
        const std = function (hex, r, m) { return new THREE.MeshStandardMaterial({ color: hex, roughness: r == null ? 0.7 : r, metalness: m || 0 }); };
        const add = function (geo, mat, x, y, z, par) { const m = flag(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); (par || grp).add(m); return m; };
        const glowTex = (function () { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 2, 64, 64, 64); r.addColorStop(0, 'rgba(255,230,170,1)'); r.addColorStop(0.3, 'rgba(255,190,110,0.45)'); r.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
        const glow = function (x, y, z, s, op, hex) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op, color: hex || 0xffffff, fog: false })); sp.scale.set(s, s, 1); sp.position.set(x, y, z); grp.add(sp); return sp; };
        const pool = function (x, z, r, hex) { const m = flag(new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, color: hex || 0xffcf8a, fog: false }))); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.045, z); grp.add(m); };
        const dark = std(0x24262c, 0.5, 0.6);
        // street lamps along both pavements
        [-48, -34, -20, -6, 8, 22, 36, 50].forEach(function (x, i) {
          const z = 38.2, face = -1; add(new THREE.CylinderGeometry(0.07, 0.1, 6.2, 8), dark, x, 3.1, z); add(new THREE.BoxGeometry(0.14, 0.14, 1.5), dark, x, 6.15, z + face * 0.7);
          const head = add(new THREE.BoxGeometry(0.5, 0.12, 0.28), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }), x, 6.05, z + face * 1.4);
          const g = glow(x, 6.0, z + face * 1.4, 4.2, 0.85); pool(x, z + face * 1.4, 3.6);
          life.push(function (t) { g.material.opacity = 0.8 + 0.05 * Math.sin(t * 3 + i) - (i === 3 && Math.sin(t * 17) > 0.93 ? 0.5 : 0); });
        });
        // hanging neon blade signs off the shopfronts
        const neon = function (txt, hex, w) { const c = document.createElement('canvas'); c.width = 512; c.height = 192; const g = c.getContext('2d'); g.fillStyle = 'rgba(8,4,12,0.88)'; g.fillRect(0, 0, 512, 192); g.strokeStyle = hex; g.lineWidth = 10; g.shadowColor = hex; g.shadowBlur = 24; g.strokeRect(14, 14, 484, 164); g.font = '900 86px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = hex; g.fillText(txt, 256, 100); g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.85; g.fillText(txt, 256, 100); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.userData.sleek = 2; return t; };
        [['LIQUOR', '#ff3fa4', -41], ['TACOS', '#ffb02a', -30], ['TATTOO', '#3affd9', -19], ['OPEN 24', '#ff5030', -8], ['CASH', '#7aff4a', 4], ['BAIL BONDS', '#ff3fa4', 15], ['PIZZA', '#ffb02a', 26], ['LOUNGE', '#b04dff', 37], ['VAPE', '#3affd9', 47]].forEach(function (s, i) {
          const m = new THREE.MeshBasicMaterial({ map: neon(s[0], s[1]), side: THREE.DoubleSide }); const p = flag(new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.72), m)); p.position.set(s[2], 4.4, 40.6); p.rotation.y = Math.PI / 2; grp.add(p);
          add(new THREE.BoxGeometry(0.05, 0.05, 1.5), dark, s[2], 4.9, 41.2); glow(s[2], 4.4, 40.6, 3.4, 0.35, new THREE.Color(s[1]).getHex());
          life.push(function (t) { m.color.setScalar(i % 4 === 1 && Math.sin(t * 13 + i) > 0.9 ? 0.25 : 0.88 + 0.12 * Math.sin(t * 5 + i)); });
        });
        { let cn = 0; life.push(function (t, dt) { cn += dt || 0.016; if (cn < 3 || cn > 12) return; cn += 3; scene.traverse(function (o) { if (o.isMesh && o.parent !== grp && o.visible && ((o.geometry && o.geometry.type === 'ConeGeometry' && o.geometry.parameters.height < 0.8) || /cone/i.test(o.name || ''))) o.visible = false; }); }); }
        // street furniture
        const bin = function (x, z) { add(new THREE.CylinderGeometry(0.32, 0.27, 0.9, 12), std(0x3b4a3a, 0.6, 0.3), x, 0.45, z); add(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 12), dark, x, 0.93, z); };
        [[-3, 37.6], [14, 37.8], [-27, 37.7], [31, 37.6], [-12, 14.5], [11.5, 14.6]].forEach(function (p) { bin(p[0], p[1]); });
        const hyd = function (x, z) { const m = std(0xc01818, 0.5, 0.2); add(new THREE.CylinderGeometry(0.15, 0.17, 0.7, 10), m, x, 0.4, z); add(new THREE.SphereGeometry(0.17, 10, 6, 0, 6.28, 0, 1.6), m, x, 0.75, z); add(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 8), m, x, 0.5, z).rotation.z = Math.PI / 2; };
        hyd(6, 37.5); hyd(-26, 37.5); hyd(40, 37.4);
        [[-16, 38.4, 0.1], [24, 38.6, -0.15]].forEach(function (d) { const g = new THREE.Group(); g.position.set(d[0], 0, d[1]); g.rotation.y = d[2]; grp.add(g); add(new THREE.BoxGeometry(2.6, 1.3, 1.2), std(0x1f5a3a, 0.7, 0.3), 0, 0.85, 0, g); add(new THREE.BoxGeometry(2.7, 0.1, 1.3), std(0x16402a, 0.7, 0.3), 0, 1.55, 0, g); [-1.1, 1.1].forEach(function (x) { add(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), dark, x, 0.12, 0.5, g).rotation.x = Math.PI / 2; }); flag(g); });
                // bus shelter
        { const g = new THREE.Group(); g.position.set(30, 0, 38.8); grp.add(g); [-1.5, 1.5].forEach(function (x) { add(new THREE.BoxGeometry(0.08, 2.4, 0.08), dark, x, 1.2, 0, g); }); add(new THREE.BoxGeometry(3.3, 0.08, 1.4), dark, 0, 2.4, 0.2, g); add(new THREE.BoxGeometry(3, 1.7, 0.03), new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.4 }), 0, 1.3, -0.5, g); add(new THREE.BoxGeometry(2.4, 0.08, 0.45), std(0x6b3a22, 0.8), 0, 0.5, -0.2, g); const ad = add(new THREE.PlaneGeometry(1.2, 1.7), new THREE.MeshBasicMaterial({ map: neon('BUCK UP', '#ff3fa4') }), 1.7, 1.3, 0.15, g); ad.rotation.y = Math.PI / 2; flag(g); }
        // barrel fires on the forecourt
        [[11.5, 23.6], [-11.5, 26.2]].forEach(function (p, i) {
          add(new THREE.CylinderGeometry(0.34, 0.3, 0.9, 12), std(0x4a2a1a, 0.9, 0.4), p[0], 0.45, p[1]); const fl = []; for (let k = 0; k < 3; k++) { const f = flag(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: k ? 0xff8a2a : 0xffd070, side: THREE.DoubleSide, fog: false }))); f.position.set(p[0], 1.2, p[1]); f.rotation.y = k * 1.05; grp.add(f); fl.push(f); } const g = glow(p[0], 1.3, p[1], 5.5, 0.6, 0xff8a2a); pool(p[0], p[1], 3.2, 0xff8a40);
          life.push(function (t) { fl.forEach(function (f, k) { const s = 0.8 + 0.35 * Math.sin(t * 11 + k * 2 + i); f.scale.set(s, 0.9 + 0.5 * Math.sin(t * 9 + k + i * 3), 1); f.position.y = 1.15 + 0.1 * s; }); g.material.opacity = 0.55 + 0.15 * Math.sin(t * 13 + i); });
        });
        // ---------- procedural audio: crowd murmur, shouts, punches, glass, horn (starts on first key/click) ----------
        const AC = window.AudioContext || window.webkitAudioContext;
        if (false && AC) {
          let ctx = null, master = null, noiseB = null, evT = null;
          const noise = function () { if (!noiseB) { noiseB = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } const s = ctx.createBufferSource(); s.buffer = noiseB; s.loop = true; return s; };
          const env = function (g, t0, a, d, peak) { g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); };
          const yell = function () { const t0 = ctx.currentTime, f0 = 260 + Math.random() * 260, dur = 0.45 + Math.random() * 0.5; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t0); o.frequency.linearRampToValueAtTime(f0 * (1.2 + Math.random() * 0.5), t0 + dur * 0.5); o.frequency.linearRampToValueAtTime(f0 * 0.8, t0 + dur);
            const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 700 + Math.random() * 400; f1.Q.value = 4; const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1800 + Math.random() * 500; f2.Q.value = 5; const g = ctx.createGain(); env(g, t0, 0.05, dur, 0.06 + Math.random() * 0.05); const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pan) pan.pan.value = Math.random() * 2 - 1;
            o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); (pan ? (g.connect(pan), pan.connect(master)) : g.connect(master)); o.start(t0); o.stop(t0 + dur + 0.1); };
          const punch = function () { const t0 = ctx.currentTime; const n = noise(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; const g = ctx.createGain(); env(g, t0, 0.005, 0.14, 0.22); n.connect(f); f.connect(g); g.connect(master); n.start(t0); n.stop(t0 + 0.3);
            const o = ctx.createOscillator(); o.frequency.setValueAtTime(130, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.16); const g2 = ctx.createGain(); env(g2, t0, 0.004, 0.18, 0.3); o.connect(g2); g2.connect(master); o.start(t0); o.stop(t0 + 0.3); };
          const glass = function () { const t0 = ctx.currentTime; const n = noise(), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3500; const g = ctx.createGain(); env(g, t0, 0.003, 0.5, 0.12); n.connect(f); f.connect(g); g.connect(master); n.start(t0); n.stop(t0 + 0.7); };
          const horn = function () { const t0 = ctx.currentTime; [330, 415].forEach(function (fr) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.05, t0 + 0.03); g.gain.setValueAtTime(0.05, t0 + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7); o.connect(f); f.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.75); }); };
          const build = function () {
            master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
            const n = noise(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 0.5; const g = ctx.createGain(); g.gain.value = 0.05; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.23; const lg = ctx.createGain(); lg.gain.value = 0.02; lfo.connect(lg); lg.connect(g.gain); n.connect(bp); bp.connect(g); g.connect(master); n.start(); lfo.start();
            const n2 = noise(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; const g2 = ctx.createGain(); g2.gain.value = 0.07; n2.connect(lp); lp.connect(g2); g2.connect(master); n2.start();
            const tick = function () { const r = Math.random(); if (r < 0.55) yell(); else if (r < 0.8) punch(); else if (r < 0.9) { punch(); setTimeout(yell, 120); } else if (r < 0.96) glass(); else horn(); evT = setTimeout(tick, 350 + Math.random() * 1100); };
            tick();
          };
          const start = function () { try { if (!ctx) { ctx = new AC(); build(); } else if (ctx.state === 'suspended') ctx.resume(); } catch (e) {} };
          ['keydown', 'pointerdown', 'touchstart', 'click'].forEach(function (e) { window.addEventListener(e, start, { passive: true }); });
          document.addEventListener('visibilitychange', function () { if (ctx) { if (document.hidden) ctx.suspend(); else ctx.resume(); } });
        }
      } catch (err) { console.error('BUCK worldProps', err && (err.stack || err)); }
    })();
    // ---- BAR DECOR (dive-bar / saloon dance-bar dressing: backlit bottle wall, licence plates, dollar garlands, neon) + gritty colour grade. Visual only ----
    (function barDecor() {
      try {
        const life = window.__buckLife = window.__buckLife || [];
        const grp = new THREE.Group(); grp.name = 'barDecor'; scene.add(grp);
        const flag = function (o) { o.userData.keepPBR = o.userData.noPBR = true; if (o.material) o.material.userData.keepPBR = o.material.userData.noPBR = true; return o; };
        const mkT = function (w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.userData.sleek = 2; return t; };
        const neon = function (txt, hex) { return mkT(512, 192, function (g) { g.fillStyle = 'rgba(8,4,12,0.9)'; g.fillRect(0, 0, 512, 192); g.strokeStyle = hex; g.lineWidth = 9; g.shadowColor = hex; g.shadowBlur = 22; g.strokeRect(12, 12, 488, 168); g.font = '900 ' + (txt.length > 9 ? 62 : 90) + 'px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = hex; g.fillText(txt, 256, 100); g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.85; g.fillText(txt, 256, 100); }); };
        [['SHOTS', '#ff3fa4', -11.75, 6, 1], ['NO COVER', '#ffb02a', -11.75, -5, 1], ['DANCE ON THE BAR', '#3affd9', 11.75, 2, -1], ['COLD BEER', '#ff5030', 11.75, -7, -1]].forEach(function (s, i) {
          const m = new THREE.MeshBasicMaterial({ map: neon(s[0], s[1]) }); const p = flag(new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.05), m)); p.position.set(s[2], 4.5, s[3]); p.rotation.y = s[4] * Math.PI / 2; grp.add(p);
          life.push(function (t) { m.color.setScalar(i === 1 && Math.sin(t * 11) > 0.92 ? 0.3 : 0.9 + 0.1 * Math.sin(t * 4 + i)); });
        });
        // licence-plate walls
        const plates = mkT(1024, 256, function (g, W, H) { g.fillStyle = '#1a0e0a'; g.fillRect(0, 0, W, H); const cols = ['#e8e0c8', '#f2c230', '#3a6ea8', '#d8d8d0', '#c43a2a', '#6aa86a', '#f0f0f0'], words = ['WILD', 'LONE STAR', 'BUCK UP', 'TRUBL', 'SHOTS', 'RODEO', 'BAD GRL', 'YEEHAW', 'NO REGRTS', 'LAST CALL']; for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) { const x = c * 128 + 6, y = r * 128 + 14, w = 116, h = 100; g.fillStyle = cols[(r * 8 + c * 3) % cols.length]; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.strokeRect(x + 3, y + 3, w - 6, h - 6); g.fillStyle = '#1a1a1a'; g.font = '800 22px Impact, sans-serif'; g.textAlign = 'center'; g.fillText(words[(r * 5 + c * 7) % words.length], x + w / 2, y + 60); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + h - 30, w, 30); } });
        [[-11.8, -1, 1], [11.8, 1, -1]].forEach(function (s) { [-7, 6].forEach(function (z) { const p = flag(new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshStandardMaterial({ map: plates, roughness: 0.6, metalness: 0.2 }))); p.position.set(s[0] - s[1] * 0.0, 6.0, z); p.rotation.y = s[2] * Math.PI / 2; grp.add(p); }); });
        // dollar-bill garlands across the ceiling
        { const n = 4 * 56, im = flag(new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.09), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n)), mt = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3(); let k = 0;
          [].forEach(function (z) { for (let i = 0; i < 56; i++) { const x = -11.4 + i * (22.8 / 55), u = x / 11.4, y = 6.3 - 0.7 * (1 - u * u); e.set(0, (i % 3) * 0.9, 0.3 * Math.sin(i * 1.7)); q.setFromEuler(e); ps.set(x, y - 0.06, z + (i % 2) * 0.03); mt.compose(ps, q, sc); im.setMatrixAt(k, mt); im.setColorAt(k, col.setHex([0x7fc27a, 0x69b064, 0x8ed08a, 0xcfe6a8][i % 4])); k++; } }); grp.add(im); }
        // backlit bottle wall behind the bar
        { const bodies = 3 * 50, gm = function () { return new THREE.MeshStandardMaterial({ roughness: 0.15, metalness: 0.25, emissive: 0x2a1204, emissiveIntensity: 1 }); }, B = flag(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.06, 0.3, 10), gm(), bodies)), N = flag(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.016, 0.03, 0.16, 8), gm(), bodies)), L = flag(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0615, 0.0615, 0.1, 10, 1, true), new THREE.MeshStandardMaterial({ roughness: 0.8, emissive: 0x241a10 }), bodies)), mt = new THREE.Matrix4(), col = new THREE.Color(); let k = 0;
          const pal = [0x8a5a1c, 0x2a4a26, 0xcdd6d2, 0x4a2a14, 0x9a6a20, 0x3a2210, 0x1f3a22, 0xb88a3a];
          [2.0, 2.65, 3.3].forEach(function (y, r) { for (let i = 0; i < 50; i++) { const x = -8.6 + i * 0.35 + (r % 2) * 0.17; mt.makeTranslation(x, y + 0.15, -11.55); B.setMatrixAt(k, mt); N.setMatrixAt(k, mt.clone().setPosition(x, y + 0.38, -11.55)); col.setHex(pal[(i * 3 + r * 5) % pal.length]).multiplyScalar(0.7 + 0.3 * ((i * 7 + r) % 5) / 4); B.setColorAt(k, col); N.setColorAt(k, col); L.setMatrixAt(k, mt.clone().setPosition(x, y + 0.13, -11.55)); L.setColorAt(k, col.setHex([0xe8dcc0, 0xc43a2a, 0xe8c050, 0xf0f0e8][(i + r) % 4])); k++; } });
          grp.add(B); grp.add(N); grp.add(L);
          const gl = mkT(64, 256, function (g, W, H) { const r = g.createLinearGradient(0, 0, 0, H); r.addColorStop(0, 'rgba(255,170,60,0)'); r.addColorStop(0.5, 'rgba(255,170,60,0.85)'); r.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = r; g.fillRect(0, 0, W, H); });
          const gp = flag(new THREE.Mesh(new THREE.PlaneGeometry(18, 2.9), new THREE.MeshBasicMaterial({ map: gl, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))); gp.position.set(0, 2.9, -11.7); grp.add(gp);
          [1.95, 2.6, 3.25].forEach(function (y) { const sh = flag(new THREE.Mesh(new THREE.BoxGeometry(18, 0.05, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a1f10, roughness: 0.6 }))); sh.position.set(0, y, -11.55); grp.add(sh); }); }
        // gritty colour grade (contrast, vignette, film grain) over the canvas
        const cv = renderer.domElement; cv.style.filter = 'contrast(1.1) saturate(1.1)';
        const ov = document.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(0,0,0,0.38) 100%);mix-blend-mode:multiply';
        const gr = document.createElement('div'); gr.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0.09;mix-blend-mode:overlay;background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/></filter><rect width=\'160\' height=\'160\' filter=\'url(%23n)\'/></svg>")';
        document.body.appendChild(ov); document.body.appendChild(gr); let gx = 0; life.push(function (t) { gx = (gx + 1) % 8; if (gx === 0) gr.style.backgroundPosition = ((Math.random() * 160) | 0) + 'px ' + ((Math.random() * 160) | 0) + 'px'; });
      } catch (err) { console.error('BUCK barDecor', err && (err.stack || err)); }
    })();
    // ---- REFERENCE-BOARD BAR + STREET PASS: dark wood wainscot, neon shapes (star BEER, bull skull, script), tin signs, jukebox, wall string lights, overhead power lines ----
    (function refBar() {
      try {
        const life = window.__buckLife = window.__buckLife || [];
        const grp = new THREE.Group(); grp.name = 'refBar'; scene.add(grp);
        const flag = function (o) { o.userData.keepPBR = o.userData.noPBR = true; if (o.material) o.material.userData.keepPBR = o.material.userData.noPBR = true; return o; };
        const mkT = function (w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.userData.sleek = 2; return t; };
        const plane = function (w, h, mat, x, y, z, ry) { const p = flag(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)); p.position.set(x, y, z); p.rotation.y = ry || 0; grp.add(p); return p; };
        // dark wood wainscot + rail on both side walls
        const wood = mkT(256, 256, function (g, W, H) { for (let i = 0; i < 10; i++) { g.fillStyle = ['#2a1612', '#321a14', '#24120f'][i % 3]; g.fillRect(i * 25.6, 0, 25.6, H); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(i * 25.6, 0, 2, H); } for (let i = 0; i < 500; i++) { g.fillStyle = 'rgba(255,200,150,0.04)'; g.fillRect(Math.random() * W, Math.random() * H, 1, 8 + Math.random() * 30); } });
        wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(8, 1);
        const wm = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
        [[-11.78, 1], [11.78, -1]].forEach(function (s) { plane(22, 1.3, wm, s[0], 0.68, 0, s[1] * Math.PI / 2); plane(22, 0.1, new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.6 }), s[0] + s[1] * 0.02, 1.36, 0, s[1] * Math.PI / 2); });
        // neon shapes
        const NG = function (draw, hex) { return mkT(512, 512, function (g, W, H) { g.clearRect(0, 0, W, H); g.shadowColor = hex; g.shadowBlur = 26; g.lineCap = 'round'; draw(g, W, H); }); };
        const starBeer = NG(function (g, W, H) { g.strokeStyle = '#2a78ff'; g.lineWidth = 12; [[110, 90, 400, 280], [400, 90, 110, 280]].forEach(function (l) { g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); }); g.strokeStyle = '#fff'; g.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 4 * Math.PI / 5; g.lineTo(256 + 85 * Math.cos(a), 235 + 85 * Math.sin(a)); } g.closePath(); g.stroke(); g.fillStyle = '#ff2a2a'; g.strokeStyle = '#ff2a2a'; g.font = '900 130px Impact, sans-serif'; g.textAlign = 'center'; g.fillText('BEER', 256, 440); }, '#ff2a2a');
        const skull = NG(function (g, W, H) { g.strokeStyle = '#ff4fa0'; g.lineWidth = 11; g.beginPath(); g.moveTo(256, 130); g.quadraticCurveTo(150, 140, 160, 260); g.quadraticCurveTo(170, 340, 256, 440); g.quadraticCurveTo(342, 340, 352, 260); g.quadraticCurveTo(362, 140, 256, 130); g.stroke(); g.beginPath(); g.moveTo(170, 175); g.quadraticCurveTo(60, 150, 40, 70); g.moveTo(342, 175); g.quadraticCurveTo(452, 150, 472, 70); g.stroke(); [[215, 270], [297, 270]].forEach(function (e) { g.beginPath(); g.arc(e[0], e[1], 22, 0, 7); g.stroke(); }); g.font = 'italic 700 80px "Brush Script MT", cursive'; g.fillStyle = '#ff4fa0'; g.textAlign = 'center'; g.fillText('Bull Bar', 256, 495); }, '#ff4fa0');
        const script = NG(function (g, W, H) { g.strokeStyle = '#3aff7a'; g.lineWidth = 8; g.font = 'italic 700 150px "Brush Script MT", cursive'; g.textAlign = 'center'; g.fillStyle = '#3aff7a'; g.fillText('Bitter', 256, 230); g.fillStyle = '#fff'; g.fillText('Blonde', 256, 390); }, '#3aff7a');
        [[starBeer, -11.74, -3, 3.7, 2.3, 1], [skull, -11.74, 3.4, 3.8, 2.3, 1], [script, 11.74, -3.6, 3.7, 2.3, -1]].forEach(function (n, i) { const m = new THREE.MeshBasicMaterial({ map: n[0], transparent: true, depthWrite: false }); plane(n[4], n[4], m, n[1], n[3], n[2], n[5] * Math.PI / 2); life.push(function (t) { m.color.setScalar(i === 1 && Math.sin(t * 9) > 0.94 ? 0.35 : 0.92 + 0.08 * Math.sin(t * 3 + i)); }); });
        // vintage tin signs
        const tins = mkT(1024, 256, function (g, W, H) { g.fillStyle = '#120a08'; g.fillRect(0, 0, W, H); const defs = [['WE RESERVE THE RIGHT', 'TO REFUSE SERVICE', '#e8e0c8', '#c43a2a'], ['COLD', 'BEER', '#f2c230', '#2a1a10'], ['NO', 'TAB', '#3a6ea8', '#f0f0f0'], ['LAST', 'CALL', '#c43a2a', '#f0e8d0'], ['RODEO', 'NITE', '#e8a040', '#2a1a10']]; defs.forEach(function (d, i) { const x = 10 + i * 202, y = 20, w = 186, h = 216; g.fillStyle = d[2]; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 5; g.strokeRect(x + 6, y + 6, w - 12, h - 12); g.fillStyle = d[3]; g.textAlign = 'center'; g.font = '900 ' + (d[0].length > 8 ? 24 : 54) + 'px Impact, sans-serif'; g.fillText(d[0], x + w / 2, y + 90); g.fillText(d[1], x + w / 2, y + 160); }); });
        plane(5, 1.25, new THREE.MeshStandardMaterial({ map: tins, roughness: 0.5, metalness: 0.2 }), 11.77, 3.0, 7.5, -Math.PI / 2); plane(5, 1.25, new THREE.MeshStandardMaterial({ map: tins, roughness: 0.5, metalness: 0.2 }), -11.77, 2.9, -8, Math.PI / 2);
        // jukebox
        const jb = mkT(256, 512, function (g, W, H) { g.fillStyle = '#1a0c08'; g.fillRect(0, 0, W, H); const r = g.createLinearGradient(0, 0, 0, H * 0.6); r.addColorStop(0, '#ff3fa4'); r.addColorStop(0.5, '#ffb02a'); r.addColorStop(1, '#3affd9'); g.fillStyle = r; g.beginPath(); g.moveTo(20, 280); g.lineTo(20, 120); g.arc(128, 120, 108, Math.PI, 0); g.lineTo(236, 280); g.closePath(); g.fill(); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(50, 150, 156, 110); g.fillStyle = '#ffd6a0'; for (let i = 0; i < 6; i++) g.fillRect(60, 160 + i * 17, 90 + (i * 23) % 50, 6); g.fillStyle = '#c8a040'; g.fillRect(30, 300, 196, 28); g.fillStyle = '#240f0a'; g.fillRect(30, 335, 196, 160); });
        { const j = new THREE.Group(); j.position.set(11.3, 0, 9.3); grp.add(j); const body = flag(new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.9, 1.2), new THREE.MeshStandardMaterial({ color: 0x2a1408, roughness: 0.6 }))); body.position.y = 0.95; j.add(body); const fr = flag(new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.9), new THREE.MeshBasicMaterial({ map: jb }))); fr.position.set(-0.36, 0.95, 0); fr.rotation.y = -Math.PI / 2; j.add(fr); }
        // string lights along both walls
        { const pts = []; [-11.6, 11.6].forEach(function (x) { for (let z = -11; z <= 11; z += 0.4) { const f = ((z + 11) % 4.4) / 4.4; pts.push([x, 3.35 - 0.3 * Math.sin(Math.PI * f), z]); } });
          const im = flag(new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }), pts.length)), mt = new THREE.Matrix4(); pts.forEach(function (p, i) { mt.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, mt); }); grp.add(im); }
        // overhead power lines along the street
        { const lm = new THREE.LineBasicMaterial({ color: 0x0c0c10 }), xs = [-48, -34, -20, -6, 8, 22, 36, 50];
          xs.forEach(function (x, i) { const arm = flag(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.8), new THREE.MeshStandardMaterial({ color: 0x2a2a2e }))); arm.position.set(x, 6.7, 38.2); grp.add(arm); if (i === xs.length - 1) return; [-0.7, 0, 0.7].forEach(function (dz) { const a = new THREE.Vector3(x, 6.7, 38.2 + dz), b = new THREE.Vector3(xs[i + 1], 6.7, 38.2 + dz), pts = []; for (let k = 0; k <= 12; k++) { const u = k / 12; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * u, 6.7 - 0.55 * Math.sin(Math.PI * u), 38.2 + dz)); } grp.add(flag(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm))); }); }); }
      } catch (err) { console.error('BUCK refBar', err && (err.stack || err)); }
    })();
    // ---- POLISH PASS: ref6 maroon walls + stacked wall-item clusters, pendant beer lamps, shelf LED strip; street grime, cracks, wet-road neon streaks. Visual only ----
    (function polishPass() {
      try {
        const life = window.__buckLife = window.__buckLife || [];
        const grp = new THREE.Group(); grp.name = 'polishPass'; scene.add(grp);
        let sd = 7; const R = function () { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
        const flag = function (o) { o.userData.keepPBR = o.userData.noPBR = true; if (o.material) o.material.userData.keepPBR = o.material.userData.noPBR = true; return o; };
        const mkT = function (w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; t.userData.sleek = 2; return t; };
        const plane = function (w, h, mat, x, y, z, ry, rx) { const p = flag(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)); p.position.set(x, y, z); p.rotation.set(rx || 0, ry || 0, 0); grp.add(p); return p; };
        // maroon plaster walls (side + back), under the wainscot and behind everything hung on them
        const plaster = mkT(256, 256, function (g, W, H) { g.fillStyle = '#2c1016'; g.fillRect(0, 0, W, H); for (let i = 0; i < 1800; i++) { g.fillStyle = 'rgba(' + (i % 2 ? '0,0,0' : '120,50,60') + ',' + (0.04 + R() * 0.06) + ')'; g.fillRect(R() * W, R() * H, 2 + R() * 6, 2 + R() * 6); } const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); });
        plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping; plaster.repeat.set(6, 1.5);
        const pm = new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
        plane(22, 4.9, pm, -11.8, 3.85, 0, Math.PI / 2); plane(22, 4.9, pm, 11.8, 3.85, 0, -Math.PI / 2); plane(22, 4.9, pm, 0, 3.85, -11.82, 0);
        // stacked wall-item clusters (tin signs, framed posters, badges, shield) like the reference bar
        const cluster = function (seed) { sd = seed; return mkT(768, 576, function (g, W, H) {
          g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, W, H); const pals = [['#e8e0c8', '#c43a2a'], ['#f2c230', '#2a1a10'], ['#3a6ea8', '#f0f0f0'], ['#c43a2a', '#f0e8d0'], ['#2a2a30', '#e8a040'], ['#6aa86a', '#10200e'], ['#e8a040', '#2a1a10']], words = [['WE RESERVE', 'THE RIGHT TO', 'REFUSE SERVICE'], ['COLD', 'BEER', 'ON TAP'], ['NO', 'CREDIT', 'EVER'], ['LIVE', 'MUSIC', 'FRI + SAT'], ['LAST', 'CALL', '2 AM'], ['OPEN', 'LATE', ''], ['RODEO', 'NITE', '$2 SHOTS']];
          const cells = [[0, 0, 250, 170], [262, 0, 150, 220], [424, 0, 330, 140], [0, 182, 150, 200], [162, 182, 250, 190], [424, 152, 150, 240], [586, 152, 168, 170], [0, 394, 330, 170], [342, 404, 200, 160], [554, 334, 200, 230]];
          cells.forEach(function (c, i) { const p = pals[Math.floor(R() * pals.length)], wd = words[Math.floor(R() * words.length)]; const kind = i % 4;
            if (kind === 3) { g.fillStyle = '#1a1210'; g.beginPath(); g.arc(c[0] + c[2] / 2, c[1] + c[3] / 2, Math.min(c[2], c[3]) / 2 - 4, 0, 7); g.fill(); g.strokeStyle = '#d4a63a'; g.lineWidth = 8; g.stroke(); g.fillStyle = '#d4a63a'; g.font = '900 34px Impact, sans-serif'; g.textAlign = 'center'; g.fillText('EST', c[0] + c[2] / 2, c[1] + c[3] / 2 - 4); g.fillText('1987', c[0] + c[2] / 2, c[1] + c[3] / 2 + 34); return; }
            g.fillStyle = kind === 1 ? '#0e0a08' : p[0]; g.fillRect(c[0], c[1], c[2], c[3]); g.strokeStyle = kind === 1 ? '#8a6a30' : 'rgba(0,0,0,0.55)'; g.lineWidth = kind === 1 ? 10 : 6; g.strokeRect(c[0] + 5, c[1] + 5, c[2] - 10, c[3] - 10);
            if (kind === 1) { const gr = g.createLinearGradient(c[0], c[1], c[0] + c[2], c[1] + c[3]); gr.addColorStop(0, p[1]); gr.addColorStop(1, '#10080a'); g.fillStyle = gr; g.fillRect(c[0] + 14, c[1] + 14, c[2] - 28, c[3] - 28); }
            g.fillStyle = kind === 1 ? '#f4ead0' : p[1]; g.textAlign = 'center'; const fs = Math.max(20, Math.min(54, c[2] / 5)); g.font = '900 ' + fs + 'px Impact, sans-serif'; wd.forEach(function (t, k) { if (t) g.fillText(t, c[0] + c[2] / 2, c[1] + c[3] / 2 - 12 + k * (fs + 4) - (wd[2] ? fs * 0.6 : 0) + 14); }); });
        }); };
        [].forEach(function (c, i) { plane(2.6, 1.95, new THREE.MeshStandardMaterial({ map: cluster(11 + i * 17), transparent: true, roughness: 0.55, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), c[0], c[2], c[1], c[3] * Math.PI / 2); });
        // pendant beer lamps over the bar line + LED strip under the bottle shelf
        const shadeLab = mkT(256, 96, function (g, W, H) { g.fillStyle = '#e8601a'; g.fillRect(0, 0, W, H); g.fillStyle = '#f4ead0'; g.fillRect(70, 12, 116, 72); g.fillStyle = '#c43a2a'; g.font = '900 24px Impact, sans-serif'; g.textAlign = 'center'; g.fillText('BITTER', 128, 44); g.fillText('BLONDE', 128, 72); });
        [-5.5, 0, 5.5].forEach(function (x) { const z = -7.6; const rod = flag(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }))); rod.position.set(x, 5.7, z); grp.add(rod);
          const sh = flag(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.85, 0.5, 4, 1, true), new THREE.MeshStandardMaterial({ map: shadeLab, side: THREE.DoubleSide, roughness: 0.5, emissive: 0x6a2808, emissiveIntensity: 0.7 }))); sh.position.set(x, 4.8, z); sh.rotation.y = Math.PI / 4; grp.add(sh);
          const bulb = flag(new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }))); bulb.position.set(x, 4.62, z); grp.add(bulb);
          const gl = mkT(64, 64, function (g) { const r = g.createRadialGradient(32, 32, 1, 32, 32, 32); r.addColorStop(0, 'rgba(255,200,120,0.9)'); r.addColorStop(1, 'rgba(255,160,80,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gl, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7, fog: false })); sp.scale.set(3, 3, 1); sp.position.set(x, 4.4, z); grp.add(sp); });
        [1.9, 2.55, 3.2].forEach(function (y) { const m = flag(new THREE.Mesh(new THREE.BoxGeometry(18, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0xffb860 }))); m.position.set(0, y - 0.03, -11.38); grp.add(m); });
        // street grime: oil stains, tyre marks, cracks, patches on the road and lot
        const grime = mkT(512, 512, function (g, W, H) { g.clearRect(0, 0, W, H); for (let i = 0; i < 5; i++) { const x = R() * W, y = R() * H, r = 30 + R() * 70; const gr = g.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, 'rgba(8,6,6,0.55)'); gr.addColorStop(1, 'rgba(8,6,6,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * (0.5 + R() * 0.5), R() * 3, 0, 7); g.fill(); }
          g.strokeStyle = 'rgba(6,4,4,0.8)'; g.lineWidth = 2.5; for (let k = 0; k < 4; k++) { let x = R() * W, y = R() * H; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 9; j++) { x += (R() - 0.3) * 60; y += (R() - 0.5) * 40; g.lineTo(x, y); if (R() > 0.7) { g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 40, y + (R() - 0.5) * 40); g.moveTo(x, y); } } g.stroke(); }
          g.strokeStyle = 'rgba(10,8,8,0.35)'; g.lineWidth = 14; for (let k = 0; k < 2; k++) { const y = 60 + R() * 380; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(150, y + (R() - 0.5) * 60, 330, y + (R() - 0.5) * 60, W, y); g.stroke(); } });
        const gm = new THREE.MeshBasicMaterial({ map: grime, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        for (let i = 0; i < 26; i++) { const x = -52 + i * 4.1 + R() * 2, z = 27.5 + R() * 8; plane(5 + R() * 4, 4 + R() * 3, gm, x, 0.07, z, 0, -Math.PI / 2).rotation.z = R() * 6; }
        for (let i = 0; i < 6; i++) plane(6, 5, gm, -10 + i * 4.5, 0.06, 13 + R() * 11, 0, -Math.PI / 2).rotation.z = R() * 6;
        // wet-road neon streaks under the shop signs and lamps
        const streak = mkT(64, 256, function (g, W, H) { const r = g.createLinearGradient(0, 0, 0, H); r.addColorStop(0, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(24, 0, 16, H); const q = g.createLinearGradient(0, 0, W, 0); q.addColorStop(0, 'rgba(255,255,255,0)'); q.addColorStop(0.5, 'rgba(255,255,255,0.4)'); q.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = q; g.fillRect(0, 0, W, H * 0.5); });
        [[-41, 0xff3fa4], [-30, 0xffb02a], [-19, 0x3affd9], [-8, 0xff5030], [4, 0x7aff4a], [15, 0xff3fa4], [26, 0xffb02a], [37, 0xb04dff], [47, 0x3affd9]].forEach(function (s) { const m = new THREE.MeshBasicMaterial({ map: streak, color: s[1], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45, fog: false }); plane(1.4, 9, m, s[0], 0.08, 33, 0, -Math.PI / 2); });
        { let a = 0; life.push(function (t, dt) { a += dt || 0.016; if (a < 2) return; a = 0; const r = scene.getObjectByName('highway'); if (r && r.material && r.material.roughness > 0.5) { r.material.roughness = 0.42; r.material.needsUpdate = true; } }); }
      } catch (err) { console.error('BUCK polishPass', err && (err.stack || err)); }
    })();
    // ---- BAR TOP: tap tower, mugs, LED edge strip, ice bucket (ref6). Visual only ----
    (function barTop() {
      try {
        const g = new THREE.Group(); g.name = 'barTop'; scene.add(g);
        const fl = function (o) { o.userData.keepPBR = o.userData.noPBR = true; if (o.material) o.material.userData.keepPBR = o.material.userData.noPBR = true; return o; };
        const add = function (m, x, y, z) { fl(m); m.position.set(x, y, z); g.add(m); return m; };
        const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8dc, metalness: 0.9, roughness: 0.25 });
        const glass = new THREE.MeshStandardMaterial({ color: 0xe8a020, transparent: true, opacity: 0.8, roughness: 0.1 });
        const foam = new THREE.MeshStandardMaterial({ color: 0xfff4dc, roughness: 0.9 });
        const topY = 1.10;
        add(new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: 0xffb050 })), 0, 1.0, -9.12);
        add(new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.025, 0.025), new THREE.MeshBasicMaterial({ color: 0xff4a8a })), 0, topY + 0.02, -9.14);
        // tap tower
        add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.28), chrome), 1.2, topY + 0.34, -9.75);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), chrome), 1.2, topY + 0.15, -9.75);
        [-0.95, -0.47, 0, 0.47, 0.95].forEach(function (dx, i) { const x = 1.2 + dx;
          add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), chrome), x, topY + 0.18, -9.64);
          const h = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.05), new THREE.MeshStandardMaterial({ color: [0xc43a2a, 0xf2c230, 0x2a6ea8, 0x10100e, 0x3a8a4a][i], roughness: 0.5 })), x, topY + 0.6, -9.75); });
        // mugs, some full
        [[-5.6, -9.45], [-4.2, -9.6], [-1.8, -9.5], [3.4, -9.4], [4.6, -9.55], [6.2, -9.45]].forEach(function (p, i) {
          add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.17, 10), glass), p[0], topY + 0.1, p[1]);
          add(new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.035, 10), foam), p[0], topY + 0.2, p[1]);
          add(new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 10, Math.PI), glass), p[0] + 0.08, topY + 0.1, p[1]).rotation.z = -Math.PI / 2; });
        // ice bucket with bottle necks
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.26, 14), new THREE.MeshStandardMaterial({ color: 0x8a8d92, metalness: 0.8, roughness: 0.4 })), -2.9, topY + 0.13, -9.5);
        [[-0.06, 0.2], [0.05, 0.22], [0, 0.18]].forEach(function (b, i) { add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.2, 8), new THREE.MeshStandardMaterial({ color: [0x3a7a3a, 0x8a5a1a, 0x2a6a2a][i], roughness: 0.2 })), -2.9 + b[0], topY + 0.32, -9.5 + (i - 1) * 0.05); });
        // tip jar
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0xcfe8e0, transparent: true, opacity: 0.45, roughness: 0.1 })), 6.6, topY + 0.12, -9.6);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 0.7 })), 6.6, topY + 0.06, -9.6);
      } catch (err) { console.error('BUCK barTop', err && (err.stack || err)); }
    })();
    // ---- BAR VIBES ADDITIONS (ref7): warm bulbs on counter front, paper-towel roll, stacked beer crates, green+yellow neon, hood lamp. Visual only ----
    (function barVibes() {
      try {
        const g = new THREE.Group(); g.name = 'barVibes'; scene.add(g);
        const fl = function (o) { o.userData.keepPBR = o.userData.noPBR = true; if (o.material) o.material.userData.keepPBR = o.material.userData.noPBR = true; return o; };
        const mkT = function (w, h, d) { const c = document.createElement('canvas'); c.width = w; c.height = h; d(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.userData.sleek = 2; return t; };
        // bulbs along counter front edge, with sag
        const bm = new THREE.MeshBasicMaterial({ color: 0xffe6a8 }), im = fl(new THREE.InstancedMesh(new THREE.SphereGeometry(0.028, 6, 5), bm, 58)), mt = new THREE.Matrix4();
        for (let i = 0; i < 58; i++) { const x = -7.1 + i * 0.25; mt.makeTranslation(x, 0.93 - Math.abs(Math.sin(i * 0.5)) * 0.05, -9.12); im.setMatrixAt(i, mt); } g.add(im);
        // paper towel roll
        const pt = fl(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.26, 12), new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.9 }))); pt.position.set(-1.0, 1.24, -9.5); g.add(pt);
        const pb = fl(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12), new THREE.MeshStandardMaterial({ color: 0x222222 }))); pb.position.set(-1.0, 1.11, -9.5); g.add(pb);
        // stacked beer crates at counter end (cardboard, original label)
        const lab = mkT(256, 256, function (c, W, H) { c.fillStyle = '#7a6a48'; c.fillRect(0, 0, W, H); c.fillStyle = '#3a4a2a'; c.fillRect(20, 70, W - 40, 120); c.fillStyle = '#e8dfc0'; c.font = '900 52px Impact, sans-serif'; c.textAlign = 'center'; c.fillText('BITTER', W / 2, 128); c.font = '900 34px Impact, sans-serif'; c.fillText('LAGER  x24', W / 2, 172); });
        const cm = new THREE.MeshStandardMaterial({ map: lab, roughness: 0.95 });
        [[-8.3, 0.25, -8.9, 0.1], [-8.25, 0.75, -8.88, -0.08], [-7.75, 0.25, -8.7, 0.2]].forEach(function (p) { const b = fl(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.45), cm)); b.position.set(p[0], p[1], p[2]); b.rotation.y = p[3]; g.add(b); });
        // neon: green script + yellow BEER on the right wall
        const neon = mkT(512, 256, function (c, W, H) { c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, W, H); c.textAlign = 'center'; c.lineJoin = 'round';
          c.shadowColor = '#3aff6a'; c.shadowBlur = 28; c.strokeStyle = '#baffc8'; c.lineWidth = 6; c.font = 'italic 900 104px Impact, sans-serif'; c.strokeText('Bitter', W / 2, 105); c.fillStyle = '#3aff6a'; c.globalAlpha = 0.5; c.fillText('Bitter', W / 2, 105); c.globalAlpha = 1;
          c.shadowColor = '#ffd23a'; c.fillStyle = '#ffe36a'; c.font = '900 96px Impact, sans-serif'; c.fillText('BEER', W / 2, 215); });
        const np = fl(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: neon, transparent: true, depthWrite: false, side: THREE.DoubleSide }))); np.position.set(11.7, 3.7, -5.2); np.rotation.y = -Math.PI / 2; g.add(np);
        const gl = new THREE.PointLight(0x5aff7a, 0.8, 5); gl.position.set(10.8, 3.6, -5.2); g.add(gl);
        // hood lamp (orange, over the counter end) like the ref
        const hood = fl(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, 0.4, 4, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8541a, side: THREE.DoubleSide, roughness: 0.5, emissive: 0x4a1504, emissiveIntensity: 0.6 }))); hood.position.set(-3.2, 3.9, -8.6); hood.rotation.y = Math.PI / 4; hood.scale.set(1.6, 1, 0.8); g.add(hood);
        const hr = fl(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }))); hr.position.set(-3.2, 5.4, -8.6); g.add(hr);
      } catch (err) { console.error('BUCK barVibes', err && (err.stack || err)); }
    })();
    // ---- WALL FILL + TIDY: hide empty windows, more stacked tin-sign/poster clusters (ref7 style), fewer hangers. Visual only ----
    (function wallFill() {
      try {
        const life = window.__buckLife = window.__buckLife || [];
        const g = new THREE.Group(); g.name = 'wallFill'; scene.add(g);
        let sd = 99; const R = function () { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
        const lines = [['WE RESERVE', 'THE RIGHT TO', 'REFUSE SERVICE'], ['COLD', 'BEER', ''], ['NO', 'CREDIT', ''], ['LAST', 'CALL', ''], ['LIVE', 'BULL', 'RIDING'], ['2 FOR 1', 'SHOTS', ''], ['BITTER', 'BLONDE', 'EST 1987'], ['RODEO', 'NITE', 'FRIDAYS'], ['HOUSE', 'RULES', ''], ['TIPS', 'APPRECIATED', ''], ['SORRY', 'WE’RE', 'OPEN']];
        const pal = [['#e8e0c8', '#c43a2a'], ['#f2c230', '#2a1a10'], ['#2f5f9a', '#f0f0f0'], ['#c43a2a', '#f0e8d0'], ['#1e1a1a', '#e8a040'], ['#2f7a4a', '#f4ead0'], ['#e8a040', '#2a1a10'], ['#efe4c0', '#2a3a6a']];
        const tex = function (seed) { sd = seed; const c = document.createElement('canvas'); c.width = 768; c.height = 576; const x = c.getContext('2d');
          const cells = [[0, 0, 230, 190], [242, 0, 170, 230], [424, 0, 340, 150], [0, 202, 150, 190], [162, 242, 250, 150], [424, 162, 150, 230], [586, 162, 178, 160], [0, 404, 330, 160], [342, 404, 200, 160], [554, 334, 210, 230]];
          cells.forEach(function (cl, i) { if (R() < 0.12) return; const p = pal[Math.floor(R() * pal.length)], wd = lines[Math.floor(R() * lines.length)], kind = i % 3;
            if (kind === 2 && R() > 0.3) { x.fillStyle = '#1a1210'; x.beginPath(); x.arc(cl[0] + cl[2] / 2, cl[1] + cl[3] / 2, Math.min(cl[2], cl[3]) / 2 - 4, 0, 7); x.fill(); x.strokeStyle = '#d4a63a'; x.lineWidth = 8; x.stroke(); x.fillStyle = '#d4a63a'; x.font = '900 32px Impact, sans-serif'; x.textAlign = 'center'; x.fillText(wd[0], cl[0] + cl[2] / 2, cl[1] + cl[3] / 2 - 2); x.fillText(wd[1], cl[0] + cl[2] / 2, cl[1] + cl[3] / 2 + 34); return; }
            x.fillStyle = kind === 1 ? '#120c0a' : p[0]; x.fillRect(cl[0], cl[1], cl[2], cl[3]); x.strokeStyle = kind === 1 ? '#8a6a30' : 'rgba(0,0,0,0.55)'; x.lineWidth = kind === 1 ? 10 : 6; x.strokeRect(cl[0] + 4, cl[1] + 4, cl[2] - 8, cl[3] - 8);
            x.fillStyle = kind === 1 ? '#f4ead0' : p[1]; x.textAlign = 'center'; const fs = Math.max(20, Math.min(52, cl[2] / 5)); x.font = '900 ' + fs + 'px Impact, sans-serif'; const n = wd[2] ? 3 : 2; wd.forEach(function (t, k) { if (t && k < n) x.fillText(t, cl[0] + cl[2] / 2, cl[1] + cl[3] / 2 - (n - 1) * fs / 2 + k * (fs + 4) + fs * 0.35); }); });
          const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; t.userData.sleek = 2; return t; };
        const place = function (px, py, pz, ry, w, h, seed) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex(seed), transparent: true, roughness: 0.55, metalness: 0.12, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 })); m.userData.keepPBR = m.userData.noPBR = true; m.material.userData.keepPBR = m.material.userData.noPBR = true; m.position.set(px, py, pz); m.rotation.y = ry; g.add(m); };
        // individual signs, many designs, scattered in loose stacks (adapted from the dive-bar reference: tin signs, framed posters, badges, plates)
        const cache = {};
        const kinds = 14;
        const sign = function (kind, v) { const key = kind + ':' + v; if (cache[key]) return cache[key]; const W = 256, H = (kind === 2 || kind === 9) ? 256 : (kind === 7 ? 128 : (kind === 1 || kind === 6 || kind === 13) ? 340 : 170);
          const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); const P = [['#e8e0c8', '#c43a2a'], ['#f2c230', '#2a1a10'], ['#2f5f9a', '#f4f0e8'], ['#1e1a1a', '#e8a040'], ['#2f7a4a', '#f4ead0'], ['#c43a2a', '#f4ead0']][(kind + v) % 6];
          x.textAlign = 'center'; x.textBaseline = 'middle'; const txt = function (t, y, sz, col) { x.fillStyle = col; x.font = '900 ' + sz + 'px Impact, sans-serif'; x.fillText(t, W / 2, y); };
          const rim = function (col, w) { x.strokeStyle = col; x.lineWidth = w; x.strokeRect(w / 2, w / 2, W - w, H - w); };
          if (kind === 0) { x.fillStyle = '#f4f0e8'; x.fillRect(0, 0, W, H); x.fillStyle = '#c43a2a'; x.fillRect(0, 0, W, 38); txt('NOTICE', 20, 30, '#fff'); txt('WE RESERVE THE', 78, 22, '#111'); txt('RIGHT TO REFUSE', 108, 22, '#111'); txt('SERVICE', 138, 26, '#c43a2a'); rim('#111', 6); }
          else if (kind === 1) { x.fillStyle = '#e6c98a'; x.fillRect(0, 0, W, H); x.strokeStyle = '#3a2a1a'; x.lineWidth = 14; x.beginPath(); x.moveTo(70, 60); x.lineTo(186, 150); x.moveTo(186, 60); x.lineTo(70, 150); x.stroke(); txt('HOUSE', 220, 40, '#3a2a1a'); txt('SPECIAL', 262, 40, '#c43a2a'); rim('#7a5a30', 10); }
          else if (kind === 2) { x.fillStyle = '#16110e'; x.beginPath(); x.arc(128, 128, 120, 0, 7); x.fill(); x.strokeStyle = '#d4a63a'; x.lineWidth = 12; x.stroke(); txt('IN MEMORY', 84, 26, '#d4a63a'); txt('OF', 128, 30, '#d4a63a'); txt('TINY', 172, 44, '#d4a63a'); }
          else if (kind === 3) { x.fillStyle = P[0]; x.fillRect(0, 0, W, H); rim('#000', 8); txt('LAST', 62, 60, P[1]); txt('CALL', 122, 60, P[1]); }
          else if (kind === 4) { x.fillStyle = P[0]; x.fillRect(0, 0, W, H); rim('#f4f0e8', 10); txt('COLD', 55, 56, P[1]); txt('BEER', 118, 56, P[1]); }
          else if (kind === 5) { x.fillStyle = '#1a0a10'; x.fillRect(0, 0, W, H); x.shadowColor = '#ff3a9a'; x.shadowBlur = 18; x.strokeStyle = '#ff7ac8'; x.lineWidth = 5; x.font = 'italic 900 78px Impact, sans-serif'; x.strokeText('Bitter', W / 2, 62); x.fillStyle = '#ff3a9a'; x.globalAlpha = 0.6; x.fillText('Bitter', W / 2, 62); x.globalAlpha = 1; x.shadowBlur = 0; rim('#4a2030', 8); txt('BLONDE', 132, 34, '#ffd0e8'); }
          else if (kind === 6) { x.fillStyle = '#1a1210'; x.fillRect(0, 0, W, H); const gr = x.createLinearGradient(0, 0, W, H); gr.addColorStop(0, P[1]); gr.addColorStop(1, '#10080a'); x.fillStyle = gr; x.fillRect(16, 16, W - 32, H - 32); txt('LIVE', 90, 56, '#f4ead0'); txt('FRI + SAT', 160, 40, '#f2c230'); txt('NO COVER', 240, 30, '#f4ead0'); rim('#8a6a30', 12); }
          else if (kind === 7) { x.fillStyle = '#e8d48a'; x.fillRect(0, 0, W, H); rim('#2a3a6a', 8); txt('BUCK UP', 50, 44, '#2a3a6a'); txt('TEXAS · BULL', 100, 20, '#2a3a6a'); }
          else if (kind === 8) { x.fillStyle = P[0]; x.fillRect(0, 0, W, H); rim('#000', 8); txt('NO', 50, 50, P[1]); txt('CREDIT', 118, 50, P[1]); }
          else if (kind === 9) { x.fillStyle = '#2a2a30'; x.beginPath(); x.moveTo(20, 20); x.lineTo(236, 20); x.lineTo(236, 130); x.quadraticCurveTo(128, 260, 20, 130); x.closePath(); x.fill(); x.strokeStyle = '#d4a63a'; x.lineWidth = 10; x.stroke(); txt('EST', 80, 30, '#d4a63a'); txt('1987', 128, 50, '#d4a63a'); }
          else if (kind === 10) { x.fillStyle = '#f2c230'; x.fillRect(0, 0, W, H); rim('#111', 10); txt('2 FOR 1', 56, 50, '#111'); txt('SHOTS', 122, 50, '#c43a2a'); }
          else if (kind === 11) { x.fillStyle = '#10100e'; x.fillRect(0, 0, W, H); x.shadowColor = '#ff2a3d'; x.shadowBlur = 20; txt('OPEN', 85, 80, '#ff6a7a'); x.shadowBlur = 0; rim('#3a1a1a', 8); }
          else if (kind === 12) { x.fillStyle = '#2f5f9a'; x.fillRect(0, 0, W, H); rim('#f4f0e8', 8); txt('HOUSE', 50, 36, '#f4f0e8'); txt('RULES', 98, 50, '#f2c230'); txt('BE NICE', 146, 24, '#f4f0e8'); }
          else { x.fillStyle = '#e6d3a0'; x.fillRect(0, 0, W, H); txt('WANTED', 50, 62, '#3a2210'); x.fillStyle = '#3a2210'; x.beginPath(); x.arc(128, 170, 52, 0, 7); x.fill(); txt('DEAD OR', 262, 28, '#3a2210'); txt('BUCKED', 300, 34, '#c43a2a'); rim('#7a5a30', 10); }
          const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; t.userData.sleek = 2; return (cache[key] = { t: t, ar: W / H }); };
        const put = function (cx, cy, cz, ry) { const n = 1 + Math.floor(R() * 3); for (let k = 0; k < n; k++) { const kd = Math.floor(R() * kinds), sg = sign(kd, Math.floor(R() * 3)), h = 0.42 + R() * 0.5, w = h * sg.ar, ox = (R() - 0.5) * 1.5, oy = (R() - 0.5) * 1.1;
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: sg.t, roughness: 0.55, metalness: 0.12, polygonOffset: true, polygonOffsetFactor: -6 - k, polygonOffsetUnits: -6 - k })); m.userData.keepPBR = m.userData.noPBR = true; m.material.userData.keepPBR = m.material.userData.noPBR = true;
            if (Math.abs(Math.cos(ry)) > 0.5) m.position.set(cx + ox, cy + oy, cz); else m.position.set(cx, cy + oy, cz + ox); m.rotation.y = ry; m.rotation.z = (R() - 0.5) * 0.12; g.add(m); } };
        for (let k = 0; k < 0; k++) { if (R() > 0.2) put(-11.74, 2.2 + R() * 2.8, -9.8 + k * 3.1 + R() * 1.2, Math.PI / 2); if (R() > 0.2) put(11.74, 2.2 + R() * 2.8, -9.4 + k * 3.1 + R() * 1.2, -Math.PI / 2); }
        [].forEach(function (x) { put(x, 4.6, -11.74, 0); });
        for (let k = 0; k < 0; k++) put(-9.6 + k * 4.8 + R(), 2.8 + R() * 2.2, 11.74, Math.PI);
        let a = 0; life.push(function (t, dt) { a += dt || 0.016; if (a < 1.5) return; a = 0; const room = scene.getObjectByName('saloon'); if (!room) return;
          room.traverse(function (o) { if ((o.name === 'archWindow' || o.name === 'windowFrame' || o.name === 'windowGlass') && o.visible) o.visible = false; }); });
      } catch (err) { console.error('BUCK wallFill', err && (err.stack || err)); }
    })();
    // ---- CROP TOP + BARE MIDRIFF with slogan (original text), world-fitted to the neck bone; used by crowd + street. Visual only ----
    (function cropTopHelper() {
      window.__buckCrop = function (inst, i) {
        let neck = null; inst.traverse(function (b) { if (!neck && b.isBone && /_neck_\d+$/.test(b.name)) neck = b; }); if (!neck) return;
        let sk = null; inst.traverse(function (o) { if (sk || !o.isMesh || !o.material || !o.material.map || !o.material.map.image || !o.material.map.image.width) return; try { const im = o.material.map.image, c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 64, 64); const d = x.getImageData(0, 0, 64, 64).data; let r = 0, g = 0, b = 0, n = 0; for (let k = 0; k < d.length; k += 4) { if (d[k] > 110 && d[k] > d[k + 1] + 12 && d[k + 1] > d[k + 2] + 8 && d[k] < 235) { r += d[k]; g += d[k + 1]; b += d[k + 2]; n++; } } if (n > 40) sk = new THREE.Color(r / n / 255, g / n / 255, b / n / 255).multiplyScalar(0.92); } catch (e) { } });
        if (!sk) return;
        inst.updateWorldMatrix(true, true); const sc = inst.getWorldScale(new THREE.Vector3()).x || 1, np = inst.worldToLocal(neck.getWorldPosition(new THREE.Vector3()));
        const put = function (mesh, dy, dz) { const g = new THREE.Group(); g.add(mesh); const wp = inst.localToWorld(np.clone().add(new THREE.Vector3(0, dy / sc, dz / sc))); neck.updateWorldMatrix(true, false);
          const bq = new THREE.Quaternion(), iq = new THREE.Quaternion(), bs = new THREE.Vector3(); neck.getWorldQuaternion(bq); inst.getWorldQuaternion(iq); neck.getWorldScale(bs);
          g.position.copy(neck.worldToLocal(wp)); g.quaternion.copy(bq.invert().multiply(iq)); g.scale.setScalar(1 / (bs.x || 1)); g.traverse(function (o) { o.userData.keepPBR = o.userData.noPBR = true; o.frustumCulled = false; }); neck.add(g); };
        const slog = ['BITTER', 'BADDIE', 'BUCK UP', 'NO CAP', 'WILD', 'LUCKY', 'MENACE', 'SASSY'][i % 8], pc = [['#101010', '#ff7ac8'], ['#f4f0e8', '#111111'], ['#ff4fa8', '#ffffff'], ['#111111', '#f2c230'], ['#e8e0d0', '#c01820']][i % 5];
        const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const cx = cv.getContext('2d'); cx.fillStyle = pc[0]; cx.fillRect(0, 0, 512, 128); cx.fillStyle = pc[1]; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.font = '900 ' + (slog.length > 6 ? 62 : 78) + 'px Impact, sans-serif'; cx.fillText(slog, 256, 68);
        const tt = new THREE.CanvasTexture(cv); tt.encoding = THREE.sRGBEncoding; tt.userData.sleek = 2;
        const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.17, 28, 1, true), new THREE.MeshStandardMaterial({ map: tt, roughness: 0.85, side: THREE.DoubleSide })); top.scale.set(0.175, 1, 0.125); top.rotation.y = Math.PI; put(top, -0.2, 0);
        const bel = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.2, 24, 1, true), new THREE.MeshStandardMaterial({ color: sk, roughness: 0.7, side: THREE.DoubleSide })); bel.scale.set(0.15, 1, 0.105); put(bel, -0.395, 0.003);
      };
    })();
    // ---- CRISP PASS: max anisotropy + mipmapped linear filtering on every texture, sharper pixel ratio. Visual only ----
    (function crispPass() {
      try {
        const life = window.__buckLife = window.__buckLife || [];
        const maxA = Math.min(16, (renderer.capabilities && renderer.capabilities.getMaxAnisotropy && renderer.capabilities.getMaxAnisotropy()) || 8);
        const seen = new WeakSet(); let a = 0;
        const fix = function (t) { if (!t || !t.isTexture || seen.has(t) || t.isCompressedTexture || t.isCubeTexture || t.isDataTexture) return; seen.add(t); if (t.image && t.image.width && t.image.width < 64) return;
          t.anisotropy = maxA; if (t.minFilter !== THREE.LinearMipmapLinearFilter && t.userData.pixelArt !== true) { t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; } t.needsUpdate = true; };
        life.push(function (t, dt) { a += dt || 0.016; if (a < 3) return; a = 0;
          scene.traverse(function (o) { if (!o.isMesh || !o.material) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (!m) return; fix(m.map); fix(m.normalMap); fix(m.roughnessMap); fix(m.emissiveMap); fix(m.aoMap); }); }); });
      } catch (err) { console.error('BUCK crispPass', err && (err.stack || err)); }
    })();
    // ---- BAR WALL DRESSING v2: neon signs, licence plates, antlers, drinking licence, funky mirrors, sticker corkboards, pennants — laid out in themed stations. Visual only, all original art ----
    (function barWalls() {
      try {
        const life = window.__buckLife = window.__buckLife || [];
        const G = new THREE.Group(); G.name = 'barWalls'; scene.add(G);
        let sd = 4242; const R = function () { sd = (sd * 16807) % 2147483647; return sd / 2147483647; }; const pick = function (a) { return a[Math.floor(R() * a.length)]; };
        const fl = function (o) { o.userData.keepPBR = o.userData.noPBR = true; if (o.material) o.material.userData.keepPBR = o.material.userData.noPBR = true; o.traverse(function (q) { q.userData.keepPBR = q.userData.noPBR = true; if (q.material) q.material.userData.keepPBR = q.material.userData.noPBR = true; }); return o; };
        const cvT = function (w, h, fn, noWear) { const c = document.createElement('canvas'); c.width = w; c.height = h; const cx2 = c.getContext('2d'); fn(cx2, w, h); if (!noWear) { cx2.globalCompositeOperation = 'source-atop'; for (let k = 0; k < w * h / 260; k++) { cx2.fillStyle = 'rgba(' + (R() > 0.5 ? '20,14,8' : '210,200,180') + ',' + (R() * 0.16) + ')'; cx2.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 2); } for (let k = 0; k < 6; k++) { cx2.strokeStyle = 'rgba(230,220,200,' + (0.12 + R() * 0.2) + ')'; cx2.lineWidth = 1; cx2.beginPath(); const x0 = R() * w, y0 = R() * h; cx2.moveTo(x0, y0); cx2.lineTo(x0 + (R() - 0.5) * w * 0.5, y0 + (R() - 0.5) * h * 0.4); cx2.stroke(); } const vg = cx2.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(18,10,4,0.45)'); cx2.fillStyle = vg; cx2.fillRect(0, 0, w, h); const dg = cx2.createLinearGradient(0, 0, 0, h); dg.addColorStop(0, 'rgba(0,0,0,0)'); dg.addColorStop(1, 'rgba(40,28,14,0.28)'); cx2.fillStyle = dg; cx2.fillRect(0, 0, w, h); cx2.globalCompositeOperation = 'source-over'; } const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; t.userData.sleek = 2; return t; };
        const flick = [];
        // wall frame: item sits on a wall at (along, y); face outward into room
        const W = { L: { x: -11.72, ry: Math.PI / 2, ax: 'z', dir: 1 }, R: { x: 11.72, ry: -Math.PI / 2, ax: 'z', dir: 1 }, B: { z: -11.72, ry: 0, ax: 'x' }, F: { z: 11.72, ry: Math.PI, ax: 'x' } };
        let ctx = null, shTex = null; const put = function (wall, along, y, obj, off) { const w = W[wall]; const o = fl(obj); const d = off || 0; if (ctx) { along = ctx.a + (along - ctx.a) * ctx.S; y = ctx.y + (y - ctx.y) * ctx.S; o.scale.multiplyScalar(ctx.S); } if (w.ax === 'z') o.position.set(w.x + (wall === 'L' ? d : -d), y, along); else o.position.set(along, y, w.z + (wall === 'B' ? d : -d)); o.rotation.y += w.ry; G.add(o); o.updateMatrixWorld(true); try { const bb = new THREE.Box3().setFromObject(o), sz = bb.getSize(new THREE.Vector3()); const sw = (w.ax === 'z' ? sz.z : sz.x), sh = sz.y; if (sw > 0.2 && sh > 0.1 && sw < 5) { if (!shTex) shTex = cvT(64, 64, function (g2) { const r = g2.createRadialGradient(32, 32, 6, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,0.75)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g2.fillStyle = r; g2.fillRect(0, 0, 64, 64); }, true); const sp = new THREE.Mesh(new THREE.PlaneGeometry(sw * 1.25 + 0.08, sh * 1.25 + 0.08), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); sp.userData.keepPBR = sp.userData.noPBR = true; sp.material.userData.keepPBR = true; sp.rotation.y = w.ry; const cxp = (bb.min.x + bb.max.x) / 2, cyp = (bb.min.y + bb.max.y) / 2, czp = (bb.min.z + bb.max.z) / 2; if (w.ax === 'z') sp.position.set(w.x + (wall === 'L' ? 0.012 : -0.012), cyp - 0.05, czp + 0.03); else sp.position.set(cxp + 0.03, cyp - 0.05, w.z + (wall === 'B' ? 0.012 : -0.012)); G.add(sp); } } catch (e2) { } return o; };
        const plane = function (w, h, mat) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); };
        // ---- neon tubes (glow drawn on canvas) ----
        const neon = function (kind, col, w, h) { const T = cvT(512, Math.round(512 * h / w), function (g, W2, H2) { g.clearRect(0, 0, W2, H2); g.lineJoin = g.lineCap = 'round'; g.shadowColor = col; g.shadowBlur = 26; const s = function (fn, wd) { g.strokeStyle = col; g.lineWidth = wd || 9; g.globalAlpha = 0.55; fn(); g.stroke(); g.globalAlpha = 1; g.strokeStyle = '#fff'; g.lineWidth = (wd || 9) * 0.38; g.shadowBlur = 8; fn(); g.stroke(); g.shadowBlur = 26; };
            const cx = W2 / 2, cy = H2 / 2, u = Math.min(W2, H2) / 100; g.font = '900 ' + (H2 * 0.5) + 'px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            const txt = function (t, y, fs) { g.font = '900 ' + fs + 'px Impact, sans-serif'; s(function () { g.beginPath(); g.strokeText = g.strokeText; }); g.strokeStyle = col; g.lineWidth = 7; g.globalAlpha = 0.6; g.strokeText(t, cx, y); g.globalAlpha = 1; g.strokeStyle = '#fff'; g.lineWidth = 2.4; g.shadowBlur = 6; g.strokeText(t, cx, y); g.shadowBlur = 26; };
            if (kind === 'open') { txt('OPEN', cy, H2 * 0.62); s(function () { g.beginPath(); g.rect(10, 10, W2 - 20, H2 - 20); }, 7); }
            else if (kind === 'beer') { txt('BEER', cy - H2 * 0.08, H2 * 0.62); s(function () { g.beginPath(); g.moveTo(cx - W2 * 0.4, cy + H2 * 0.36); g.lineTo(cx + W2 * 0.4, cy + H2 * 0.36); }, 7); }
            else if (kind === 'cold') { txt('COLD', cy - H2 * 0.22, H2 * 0.42); txt('ONES', cy + H2 * 0.24, H2 * 0.42); }
            else if (kind === 'bar') { txt('BAR', cy, H2 * 0.78); }
            else if (kind === 'glass') { s(function () { g.beginPath(); g.moveTo(cx - 40 * u, 12 * u); g.lineTo(cx + 40 * u, 12 * u); g.lineTo(cx, 55 * u); g.closePath(); g.moveTo(cx, 55 * u); g.lineTo(cx, 88 * u); g.moveTo(cx - 24 * u, 90 * u); g.lineTo(cx + 24 * u, 90 * u); }, 8); s(function () { g.beginPath(); g.arc(cx + 14 * u, 28 * u, 5 * u, 0, 7); }, 6); }
            else if (kind === 'star') { s(function () { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = (k % 2 ? 20 : 46) * u; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); }, 8); }
            else if (kind === 'horseshoe') { s(function () { g.beginPath(); g.arc(cx, cy - 6 * u, 36 * u, Math.PI * 0.85, Math.PI * 2.15, true); g.lineTo(cx + 28 * u, cy + 44 * u); g.moveTo(cx - 36 * u * Math.cos(0.15 * Math.PI), cy - 6 * u + 36 * u * Math.sin(0.15 * Math.PI) * 0); }, 9); }
            else if (kind === 'bolt') { s(function () { g.beginPath(); g.moveTo(cx + 8 * u, 6 * u); g.lineTo(cx - 24 * u, 54 * u); g.lineTo(cx - 2 * u, 54 * u); g.lineTo(cx - 14 * u, 94 * u); g.lineTo(cx + 26 * u, 40 * u); g.lineTo(cx + 4 * u, 40 * u); g.closePath(); }, 8); }
            else if (kind === 'hat') { s(function () { g.beginPath(); g.ellipse(cx, cy + 14 * u, 46 * u, 9 * u, 0, 0, 7); g.moveTo(cx - 22 * u, cy + 10 * u); g.quadraticCurveTo(cx - 24 * u, cy - 30 * u, cx - 6 * u, cy - 24 * u); g.quadraticCurveTo(cx, cy - 16 * u, cx + 6 * u, cy - 24 * u); g.quadraticCurveTo(cx + 24 * u, cy - 30 * u, cx + 22 * u, cy + 10 * u); }, 8); }
            else if (kind === 'script') { g.font = 'italic 900 ' + (H2 * 0.72) + 'px Impact, sans-serif'; g.strokeStyle = col; g.lineWidth = 8; g.globalAlpha = 0.6; g.strokeText('Bitter', cx, cy); g.globalAlpha = 1; g.strokeStyle = '#fff'; g.lineWidth = 2.6; g.shadowBlur = 6; g.strokeText('Bitter', cx, cy); }
            else if (kind === 'skull') { s(function () { g.beginPath(); g.moveTo(cx - 46 * u, cy - 38 * u); g.quadraticCurveTo(cx - 54 * u, cy - 6 * u, cx - 26 * u, cy - 12 * u); g.lineTo(cx - 18 * u, cy + 20 * u); g.lineTo(cx - 8 * u, cy + 40 * u); g.lineTo(cx + 8 * u, cy + 40 * u); g.lineTo(cx + 18 * u, cy + 20 * u); g.lineTo(cx + 26 * u, cy - 12 * u); g.quadraticCurveTo(cx + 54 * u, cy - 6 * u, cx + 46 * u, cy - 38 * u); }, 8); }
          }, true); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: T, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
          const back = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.02, h * 1.02), new THREE.MeshBasicMaterial({ color: 0x050204, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 })); back.position.z = -0.004; const g = new THREE.Group(); g.add(back); g.add(m); if (R() > 0.45) flick.push({ m: m.material, ph: R() * 6, sp: 0.8 + R() * 2 }); return g; };
        // ---- state plate ----
        const plate = function () { const st = pick(['TEXAS', 'NEVADA', 'ARIZONA', 'LOUISIANA', 'MONTANA', 'ALASKA']), no = pick(['BUCK 69', 'BAD 4 U', 'HOT SHOT', 'LUCKY 7', 'OL BLONDE', '1 DRUNK', 'RIDE ON', 'NOT TODAY', 'BARFLY']), bg = pick([['#f4f0e0', '#1a2a6a'], ['#f2c230', '#222'], ['#2a3a7a', '#f4f0e0'], ['#e8e0c8', '#a0201a'], ['#1a3a2a', '#f0e8c0']]);
          const T = cvT(256, 128, function (g, W2, H2) { g.fillStyle = bg[0]; g.fillRect(0, 0, W2, H2); g.strokeStyle = bg[1]; g.lineWidth = 6; g.strokeRect(4, 4, W2 - 8, H2 - 8); g.fillStyle = bg[1]; g.textAlign = 'center'; g.font = '900 26px Impact, sans-serif'; g.fillText(st, W2 / 2, 36); g.font = '900 54px Impact, sans-serif'; g.fillText(no, W2 / 2, 94); for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(80,40,10,' + R() * 0.25 + ')'; g.fillRect(R() * W2, R() * H2, 2 + R() * 6, 2 + R() * 4); } g.fillStyle = '#777'; g.beginPath(); g.arc(14, 14, 4, 0, 7); g.arc(W2 - 14, 14, 4, 0, 7); g.fill(); });
          const o = plane(0.46, 0.23, new THREE.MeshStandardMaterial({ map: T, roughness: 0.45, metalness: 0.5, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 })); o.rotation.z = (R() - 0.5) * 0.22; return o; };
        // ---- antlers on a plaque ----
        const antlers = function () { const g = new THREE.Group(), bone = new THREE.MeshStandardMaterial({ color: 0xb8a880, roughness: 0.85 }), wood = new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 0.8 });
          const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 20), wood); pl.rotation.x = Math.PI / 2; g.add(pl);
          const seg = function (a, b, r) { const d = b.clone().sub(a), len = d.length(), m = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.4, r * 2.0, len, 7), bone); m.position.copy(a.clone().add(b).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(m); };
          [-1, 1].forEach(function (s) { let p = new THREE.Vector3(s * 0.05, 0.1, 0.05), main = [[0.18, 0.28, 0.16], [0.22, 0.28, 0.12], [0.1, 0.3, 0.1], [0.08, 0.3, 0.05]]; for (let k = 0; k < main.length; k++) { const q = new THREE.Vector3(p.x + s * main[k][0], p.y + main[k][1], p.z + main[k][2]); seg(p, q, 0.032 - k * 0.005); if (k > 0) seg(q, new THREE.Vector3(q.x + s * 0.02, q.y + 0.22, q.z + 0.03), 0.017); p = q; } });
          g.scale.setScalar(1.15); return g; };
        // ---- drinking licence (framed certificate) ----
        const licence = function () { const T = cvT(256, 340, function (g, W2, H2) { g.fillStyle = '#efe2bd'; g.fillRect(0, 0, W2, H2); g.strokeStyle = '#6a4a22'; g.lineWidth = 5; g.strokeRect(12, 12, W2 - 24, H2 - 24); g.strokeRect(20, 20, W2 - 40, H2 - 40); g.fillStyle = '#3a2210'; g.textAlign = 'center'; g.font = '900 30px Impact, sans-serif'; g.fillText('OFFICIAL', W2 / 2, 62); g.font = '900 38px Impact, sans-serif'; g.fillText('DRINKING', W2 / 2, 104); g.fillText('LICENSE', W2 / 2, 146); g.fillStyle = '#8a7a5a'; for (let k = 0; k < 5; k++) g.fillRect(44, 172 + k * 18, W2 - 88 - (k === 4 ? 70 : 0), 5); g.strokeStyle = '#1a2a6a'; g.lineWidth = 3; g.beginPath(); g.moveTo(48, 292); for (let k = 0; k < 8; k++) g.lineTo(52 + k * 12, 286 + (k % 2 ? 12 : -4)); g.stroke(); g.fillStyle = '#b01c1c'; g.beginPath(); g.arc(200, 288, 20, 0, 7); g.fill(); g.fillStyle = '#e8c070'; g.beginPath(); g.arc(200, 288, 12, 0, 7); g.fill(); });
          const g = new THREE.Group(); const fr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.64, 0.04), new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.6 })); g.add(fr); const p = plane(0.42, 0.56, new THREE.MeshStandardMaterial({ map: T, roughness: 0.6 })); p.position.z = 0.022; g.add(p); g.rotation.z = (R() - 0.5) * 0.08; return g; };
        // ---- funky sunburst mirror ----
        const mirror = function (r) { const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xd4a63a, metalness: 0.9, roughness: 0.3 });
          const n = 16; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, c = new THREE.Mesh(new THREE.ConeGeometry(r * 0.12, r * 0.7, 4), gold); c.position.set(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15, 0); c.rotation.z = a - Math.PI / 2; g.add(c); }
          const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, r * 0.09, 8, 36), gold); g.add(ring);
          const glass = new THREE.Mesh(new THREE.CircleGeometry(r * 0.88, 36), new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 1, roughness: 0.04, envMapIntensity: 1.6 })); glass.position.z = 0.02; g.add(glass); return g; };
        // ---- sticker corkboard billboard ----
        const board = function (w, h) { const T = cvT(512, Math.round(512 * h / w), function (g, W2, H2) { g.fillStyle = '#9a7040'; g.fillRect(0, 0, W2, H2); for (let k = 0; k < 900; k++) { g.fillStyle = 'rgba(' + (R() > 0.5 ? '60,35,10' : '200,150,90') + ',' + R() * 0.25 + ')'; g.fillRect(R() * W2, R() * H2, 2 + R() * 3, 2 + R() * 3); }
            const brands = ['BITTER BLONDE', 'LONE STAR', 'COLD ONE', 'WHISKEY', 'HOUSE ALE', 'BUCK UP'];
            for (let k = 0; k < 7; k++) { const x = 30 + R() * (W2 - 60), y = 30 + R() * (H2 - 60), r = 26 + R() * 12; g.save(); g.translate(x, y); g.rotate(R() * 6); g.fillStyle = pick(['#e8dcc0', '#c8a060', '#9a2a22', '#2a4a6a']); g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.strokeStyle = 'rgba(40,24,10,0.8)'; g.lineWidth = 2; g.stroke(); g.fillStyle = 'rgba(30,18,8,0.85)'; g.font = '900 ' + (r * 0.34) + 'px Impact, sans-serif'; g.textAlign = 'center'; g.fillText(pick(brands), 0, 3); g.restore(); }
            for (let k = 0; k < 9; k++) { const x = 20 + R() * (W2 - 40), y = 20 + R() * (H2 - 40); g.save(); g.translate(x, y); g.fillStyle = pick(['#b8b0a0', '#c88a30', '#7a8a60', '#a03a2a']); g.beginPath(); for (let q = 0; q < 24; q++) { const a = q / 24 * 6.283, r = q % 2 ? 11 : 13; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(0, 0, 8, 0, 7); g.fill(); g.restore(); }
            for (let k = 0; k < 4; k++) { const x = R() * (W2 - 70), y = R() * (H2 - 90); g.save(); g.translate(x + 30, y + 40); g.rotate((R() - 0.5) * 0.5); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-28, -34, 62, 78); g.fillStyle = '#efe8d8'; g.fillRect(-30, -38, 60, 76); g.fillStyle = pick(['#3a2a24', '#243a4a', '#4a2a2a', '#2a3a2a']); g.fillRect(-25, -33, 50, 50); g.fillStyle = 'rgba(255,200,140,0.5)'; g.beginPath(); g.arc(0, -8, 9, 0, 7); g.fill(); g.fillRect(-10, 2, 20, 16); g.restore(); }
            for (let k = 0; k < 4; k++) { const x = R() * (W2 - 70), y = R() * (H2 - 50); g.save(); g.translate(x + 35, y + 25); g.rotate((R() - 0.5) * 0.6); g.fillStyle = '#6a8a5a'; g.fillRect(-36, -16, 72, 32); g.strokeStyle = '#2a4a22'; g.lineWidth = 2; g.strokeRect(-33, -13, 66, 26); g.fillStyle = '#2a4a22'; g.font = '900 16px Impact'; g.textAlign = 'center'; g.fillText('$1', 0, 6); g.restore(); }
            for (let k = 0; k < 3; k++) { const x = R() * (W2 - 50), y = R() * (H2 - 70); g.save(); g.translate(x + 22, y + 30); g.rotate((R() - 0.5) * 0.5); g.fillStyle = '#f6f2e8'; g.fillRect(-22, -30, 44, 60); g.fillStyle = '#b01818'; g.font = '900 30px serif'; g.textAlign = 'center'; g.fillText(pick(['A', 'K', 'Q']), 0, -4); g.fillText('\u2660', 0, 24); g.restore(); }
            { const x = R() * (W2 - 140) + 10, y = R() * (H2 - 160) + 10; g.save(); g.translate(x + 60, y + 70); g.rotate(-0.06); g.fillStyle = '#e8dcb0'; g.fillRect(-60, -70, 120, 140); g.fillStyle = '#2a1a10'; g.font = '900 30px Impact'; g.textAlign = 'center'; g.fillText('WANTED', 0, -38); g.fillStyle = '#6a5a40'; g.fillRect(-36, -28, 72, 64); g.fillStyle = '#2a1a10'; g.font = '900 13px Impact'; g.fillText('BUCK UP BLONDE', 0, 56); g.restore(); }
            for (let k = 0; k < 22; k++) { const x = 14 + R() * (W2 - 28), y = 14 + R() * (H2 - 28); g.fillStyle = pick(['#d03030', '#e8c030', '#3070b0', '#d8d8d8']); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x - 1.5, y - 1.5, 2, 2); }
            g.strokeStyle = '#2a1a10'; g.lineWidth = 16; g.strokeRect(0, 0, W2, H2); });
          return plane(w, h, new THREE.MeshStandardMaterial({ map: T, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 })); };
        // ---- beer-mirror / tin sign with real "bar sign" look ----
        const tin = function (w, h) { const pal = pick([['#5a3a1a', '#e8d8a8', 'COLD'], ['#2a6aa8', '#f4f0e8', 'ON TAP'], ['#a8201a', '#f4e8c8', 'ICE'], ['#2a7a4a', '#f4f0e0', 'LAGER'], ['#1a1a1a', '#e8a840', 'WHISKEY']]);
          const T = cvT(256, Math.round(256 * h / w), function (g, W2, H2) { const gr = g.createLinearGradient(0, 0, W2, H2); gr.addColorStop(0, pal[0]); gr.addColorStop(1, '#201810'); g.fillStyle = gr; g.fillRect(0, 0, W2, H2); g.strokeStyle = pal[1]; g.lineWidth = 5; g.strokeRect(7, 7, W2 - 14, H2 - 14); g.fillStyle = pal[1]; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 ' + (H2 * 0.38) + 'px Impact, sans-serif'; g.fillText(pal[2], W2 / 2, H2 * 0.42); g.font = '900 ' + (H2 * 0.16) + 'px Impact, sans-serif'; g.fillText('BITTER BLONDE', W2 / 2, H2 * 0.78); for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(0,0,0,' + R() * 0.25 + ')'; g.fillRect(R() * W2, R() * H2, 1 + R() * 5, 1 + R() * 3); } });
          return plane(w, h, new THREE.MeshStandardMaterial({ map: T, roughness: 0.4, metalness: 0.45, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 })); };
        const pennant = function () { const T = cvT(128, 256, function (g, W2, H2) { g.fillStyle = pick(['#8a1c1c', '#1a3a6a', '#2a5a3a', '#6a4a14']); g.beginPath(); g.moveTo(0, 0); g.lineTo(W2, 12); g.lineTo(0, H2); g.closePath(); g.fill(); g.fillStyle = '#f0e8d0'; g.font = '900 26px Impact, sans-serif'; g.save(); g.translate(18, 24); g.rotate(1.35); g.fillText(pick(['RODEO', 'TEXAS', 'BUCK UP', 'MEMPHIS']), 0, 0); g.restore(); });
          return plane(0.3, 0.6, new THREE.MeshStandardMaterial({ map: T, transparent: true, side: THREE.DoubleSide, roughness: 0.8 })); };
        // ---- layout: stations along each side wall, plus back/front ends ----
        const neonKinds = [['open', '#ff3a4a', 1.0, 0.5], ['beer', '#ff2a3a', 1.3, 0.55], ['cold', '#3acaff', 0.95, 0.7], ['bar', '#3aff8a', 0.9, 0.45], ['glass', '#ff4aa8', 0.7, 0.75], ['star', '#ffd23a', 0.7, 0.7], ['horseshoe', '#ff9a2a', 0.7, 0.7], ['bolt', '#ffe03a', 0.6, 0.75], ['hat', '#ff8a2a', 1.0, 0.55], ['script', '#ff4aa8', 1.5, 0.6], ['skull', '#ff3a7a', 1.0, 0.7]];
        const station = function (wall, along, kind, S) { ctx = { a: along, y: 3.4, S: S || 1.4 }; const base = 3.0 + R() * 0.6;
          if (kind === 0) { const nk = pick(neonKinds); put(wall, along, base + 0.2, neon(nk[0], nk[1], nk[2] * 1.4, nk[3] * 1.4), 0.03); put(wall, along - 0.95, base - 0.5, plate(), 0.03); put(wall, along + 0.9, base - 0.25, plate(), 0.03); put(wall, along + 0.1, base - 0.85, tin(0.7, 0.36), 0.03); }
          else if (kind === 1) { const m = mirror(0.42 + R() * 0.12); put(wall, along, base, m, 0.04); const nk = pick(neonKinds); put(wall, along - 1.15, base + 0.2, neon(nk[0], nk[1], nk[2], nk[3]), 0.03); put(wall, along + 1.1, base - 0.2, licence(), 0.03); }
          else if (kind === 2) { put(wall, along, base + 0.1, mirror(0.4), 0.05); put(wall, along - 0.85, base - 0.35, plate(), 0.03); put(wall, along + 0.85, base - 0.35, plate(), 0.03); put(wall, along, base - 0.75, tin(0.8, 0.4), 0.03); const p = pennant(); put(wall, along + 0.6, base + 0.35, p, 0.03); }
          else if (kind === 3) { put(wall, along, base, board(1.9, 1.35), 0.03); const nk = pick(neonKinds); put(wall, along + 1.55, base + 0.35, neon(nk[0], nk[1], nk[2], nk[3]), 0.03); put(wall, along - 1.3, base - 0.5, plate(), 0.03); }
          else if (kind === 4) { put(wall, along, base, licence(), 0.03); put(wall, along - 0.55, base - 0.15, tin(0.55, 0.55), 0.03); put(wall, along + 0.6, base + 0.12, tin(0.7, 0.35), 0.03); const nk = pick(neonKinds); put(wall, along + 1.5, base + 0.25, neon(nk[0], nk[1], nk[2], nk[3]), 0.03); }
          else { const nk = pick(neonKinds), nk2 = pick(neonKinds); put(wall, along - 0.7, base + 0.2, neon(nk[0], nk[1], nk[2] * 1.2, nk[3] * 1.2), 0.03); put(wall, along + 0.8, base - 0.1, neon(nk2[0], nk2[1], nk2[2], nk2[3]), 0.03); put(wall, along, base - 0.9, plate(), 0.03); } };
        const order = [0, 1, 3, 2, 4, 5, 1, 0, 3, 2]; const station2 = function (w, a, k, S) { station(w, a, k, S); ctx = null; };
        [['L', -8.6], ['R', -8.6]].forEach(function (w, wi) { for (let k = 0; k < 4; k++) { const along = w[1] + k * 4.2 + (R() - 0.5) * 0.4; station2(w[0], along, order[(k + wi * 3) % order.length], 1.45); } });
        ctx = null;  [[-5.6, 3.55], [-4.7, 3.7], [-3.8, 3.5], [3.8, 3.55], [4.7, 3.7], [5.6, 3.5]].forEach(function (p) { const pl = plate(); pl.scale.multiplyScalar(1.7); put('B', p[0], p[1], pl, 0.04); }); [-9.9, 9.9].forEach(function (x, i) { station2('B', x, [2, 3][i], 1.2); }); [-6.6, -2.2, 2.2, 6.6].forEach(function (x, i) { put('B', x, 5.1, neon(neonKinds[(i * 3 + 1) % neonKinds.length][0], neonKinds[(i * 3 + 1) % neonKinds.length][1], 1.3, 0.62), 0.03); put('B', x + 1.2, 5.0, plate(), 0.03); }); [-9.6, 9.6].forEach(function (x, i) { if (false) put('B', x, 4.5, neon(neonKinds[(i * 4 + 3) % neonKinds.length][0], neonKinds[(i * 4 + 3) % neonKinds.length][1], 1.3, 0.8), 0.03); put('B', x * 0.9 + (i ? -1.5 : 1.5), 4.3, plate(), 0.03); });
        [-8, -4, 4, 8].forEach(function (x, i) { station2('F', x, [4, 1, 3, 0][i], 1.3); });
        let a = 0; life.push(function (t, dt) { a += dt || 0.016; for (let k = 0; k < flick.length; k++) { const f = flick[k]; const v = 0.82 + 0.18 * Math.sin(t * f.sp + f.ph) * (Math.sin(t * 7 + f.ph) > 0.92 ? 0.3 : 1); f.m.opacity = v; } });
      } catch (err) { console.error('BUCK barWalls', err && (err.stack || err)); }
    })();
    // ---- COWBOY BOOTS (leather, stitched) on lower legs; GTA wardrobe research: cowboy boots in black / brown. Visual only ----
    (function bootsHelper() {
      window.__buckBoots = function (inst, i) {
        const find = function (re) { let r = null; inst.traverse(function (b) { if (!r && b.isBone && re.test(b.name)) r = b; }); return r; };
        const cols = [['#141010', '#8a6a40'], ['#4a2a16', '#c8a060'], ['#7a5530', '#2a1a10'], ['#e8dfd0', '#7a5a30'], ['#2a1a14', '#d0b070']][i % 5];
        const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); g.fillStyle = cols[0]; g.fillRect(0, 0, 128, 128);
        for (let k = 0; k < 500; k++) { g.fillStyle = 'rgba(' + (k % 2 ? '255,255,255' : '0,0,0') + ',' + (0.03 + (k % 5) * 0.012) + ')'; g.fillRect((k * 37) % 128, (k * 91) % 128, 2, 2); }
        g.strokeStyle = cols[1]; g.lineWidth = 2; g.beginPath(); for (let x = 0; x <= 128; x += 8) { g.lineTo(x, 40 + (x / 8 % 2) * 8); } g.stroke(); g.beginPath(); for (let x = 0; x <= 128; x += 8) { g.lineTo(x, 80 + (x / 8 % 2) * 8); } g.stroke();
        const tt = new THREE.CanvasTexture(cv); tt.encoding = THREE.sRGBEncoding; tt.wrapS = tt.wrapT = THREE.RepeatWrapping; tt.userData.sleek = 2; tt.anisotropy = 4;
        const mat = new THREE.MeshStandardMaterial({ map: tt, roughness: 0.38, metalness: 0.15 });
        inst.updateWorldMatrix(true, true);
        ['l', 'r'].forEach(function (sd) {
          const low = find(new RegExp('lowerleg_' + sd + '_\\d+$')), foot = find(new RegExp('foot_' + sd + '_\\d+$')), ball = find(new RegExp('ball_' + sd + '_\\d+$')); if (!low || !foot || !ball) return;
          const wp = function (b) { return b.getWorldPosition(new THREE.Vector3()); }, K = wp(low), A = wp(foot), Bp = wp(ball);
          const seg = function (bone, p0, p1, r0, r1, flat) { const bs = bone.getWorldScale(new THREE.Vector3()).x || 1, a = bone.worldToLocal(p0.clone()), b = bone.worldToLocal(p1.clone()), d = b.clone().sub(a), len = d.length(); if (len < 1e-5) return;
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r1 / bs, r0 / bs, len, 14, 1, false), mat); m.position.copy(a.clone().add(b).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); if (flat) m.scale.set(1, 1, flat); m.userData.keepPBR = m.userData.noPBR = true; m.material.userData.keepPBR = m.material.userData.noPBR = true; m.frustumCulled = false; bone.add(m); };
          const sc = 1, up = A.clone().add(K.clone().sub(A).multiplyScalar(0.52));
          seg(low, up, A, 0.066 * sc, 0.054 * sc);              // shaft
          const toe = Bp.clone().add(Bp.clone().sub(A).multiplyScalar(0.55)); seg(foot, A, toe, 0.054 * sc, 0.034 * sc, 1.0);   // foot + toe box
        });
      };
    })();
    // ---- TIDY: hide stray floating cream squares / diamonds / flat yellow slabs above head height ----
    (function strayTidy() {
      let n = 0; (window.__buckLife = window.__buckLife || []).push(function () { if (n++ % 90) return; try { scene.traverse(function (o) { if (!o.isMesh || !o.visible || !o.material || !o.material.color) return; const g = o.geometry && o.geometry.type, c = o.material.color.getHexString(), p = o.parent && o.parent.name || ''; const y = o.getWorldPosition(new THREE.Vector3()).y; if (y < 3.4) return;
        if (g === 'OctahedronGeometry' || (g === 'PlaneGeometry' && c === 'dfffd0' && !p) || (p === 'worldProps' && c === 'ffe2b0' && g === 'BoxGeometry')) o.visible = false; }); } catch (e) { } });
    })();
    // ---- JUKEBOX (CC BY 4.0, Rescue3D Assets via Sketchfab) against the right wall. Visual only ----
    (function jukeboxProp() {
      const B = window.BUCK_PROPS && window.BUCK_PROPS.jukebox; if (!B || !THREE.GLTFLoader) return;
      try { new THREE.GLTFLoader().parse(ab(B), '', function (g) { try {
        const o = g.scene || g.scenes[0];
        o.traverse(function (q) { q.userData.keepPBR = q.userData.noPBR = true; if (q.isMesh && q.material) { const m = q.material; m.userData.keepPBR = m.userData.noPBR = true; if (m.map) { m.map.anisotropy = 8; m.map.userData.sleek = 2; } if (m.emissiveMap) m.emissiveIntensity = 1.2; } });
        const bb = new THREE.Box3().setFromObject(o), sz = bb.getSize(new THREE.Vector3()), k = 1.85 / (sz.y || 1); o.scale.setScalar(k);
        const bb2 = new THREE.Box3().setFromObject(o), c = bb2.getCenter(new THREE.Vector3()); o.position.set(-c.x, -bb2.min.y, -c.z);
        const holder = new THREE.Group(); holder.add(o); holder.position.set(10.75, 0, 6.2); holder.rotation.y = -Math.PI / 2; holder.name = 'jukebox'; scene.add(holder);
        const pl = new THREE.PointLight(0xffa04a, 0.9, 6, 2); pl.position.set(-0.7, 1.4, 0); holder.add(pl);
      } catch (e) { console.error('BUCK jukebox', e); } }); } catch (e) { console.error('BUCK jukebox', e); }
    })();
    // ---- REAL DEER SKULL + ANTLERS (CC BY 4.0, RISD Nature Lab via Sketchfab, simplified) mounted on the back wall. Visual only ----
    (function deerSkulls() {
      const B = window.BUCK_PROPS && window.BUCK_PROPS.antlers; if (!B || !THREE.GLTFLoader) return;
      try { new THREE.GLTFLoader().parse(ab(B), '', function (g) { try {
        const src = g.scene || g.scenes[0];
        src.traverse(function (q) { q.userData.keepPBR = q.userData.noPBR = true; if (q.isMesh && q.material) { q.material.userData.keepPBR = q.material.userData.noPBR = true; q.material.roughness = 0.9; if (q.material.map) { q.material.map.anisotropy = 8; q.material.map.userData.sleek = 2; } } });
        const bb = new THREE.Box3().setFromObject(src), sz = bb.getSize(new THREE.Vector3());
        [[-4.4, 4.3, 0.0], [4.4, 4.3, 0.0], [-9.2, 4.6, 0.0]].forEach(function (p, i) {
          const o = src.clone(true), h = new THREE.Group(), k = 1.5 / Math.max(sz.x, sz.y); o.scale.setScalar(k); o.rotation.x = (window.__skullRX !== undefined ? window.__skullRX : 0);
          const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.05), new THREE.MeshStandardMaterial({ color: 0x2c1a0e, roughness: 0.7 })); plaque.position.set(0, -0.1, -0.12); plaque.userData.keepPBR = plaque.userData.noPBR = true; plaque.material.userData.keepPBR = plaque.material.userData.noPBR = true;
          h.add(plaque); h.add(o); h.position.set(p[0], p[1], -11.72 + 0.35); h.rotation.y = (i === 2 ? 0.0 : 0); h.name = 'deerSkull'; scene.add(h); });
      } catch (e) { console.error('BUCK deer', e); } }); } catch (e) { console.error('BUCK deer', e); }
    })();
    // ---- reference-board styling (Juani's refs: SA golden hour, GTA V pink, bar string lights, baddie street tags). Visual only ----
    (function refStyle() {
      // 1) string lights + star lanterns + papel picado across the bar ceiling (ref: mechanical bull bar)
      const bulbG = new THREE.SphereGeometry(0.06, 8, 6), cols = [0xffd27a, 0xff6a8a, 0xffe9b0, 0xff9a3a, 0xc07aff];
      const bulbMs = cols.map(function (c) { return new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); });
      const wireM = new THREE.LineBasicMaterial({ color: 0x1a120c });
      const flagG = new THREE.PlaneGeometry(0.34, 0.42), flagCols = [0xff2d6f, 0x2ad1ff, 0xffd23a, 0x8a3dff, 0x3aff8a, 0xff7a2a];
      const flagMs = flagCols.map(function (c) { return new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.7, transparent: true, opacity: 0.92, emissive: c, emissiveIntensity: 0.18 }); });
      const lights = new THREE.Group(); lights.name = 'refStringLights'; lights.userData.keepPBR = true; scene.add(lights);
      const strand = function (a, b, sag, n, flags) {
        const pts = []; for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * sag, a.z + (b.z - a.z) * t)); }
        lights.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireM));
        pts.forEach(function (p, i) { if (i === 0 || i === n) return;
          if (flags) { if (i % 7) return; const f = new THREE.Mesh(flagG, flagMs[i % flagMs.length]); f.position.set(p.x, p.y - 0.22, p.z); f.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2; f.userData.keepPBR = true; f.userData.noPBR = true; lights.add(f); }
          else { const m = new THREE.Mesh(bulbG, bulbMs[i % bulbMs.length]); m.position.copy(p); m.userData.noPBR = true; lights.add(m); } });
      };
      const H = 5.4;
      for (let k = -2; k <= 2; k++) { strand(new THREE.Vector3(-11.6, H, k * 4.2), new THREE.Vector3(11.6, H, k * 4.2 + 1.2), 0.9, 34, false); }
      for (let k = -1; k <= 1; k++) { strand(new THREE.Vector3(k * 6 - 1.5, H - 0.2, -11.6), new THREE.Vector3(k * 6 + 1.5, H - 0.2, 11.6), 1.1, 26, true); }
      // star lanterns (ref: star lights over the bull)
      const starShape = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.16 : 0.38, a = i / 10 * Math.PI * 2; if (i) starShape.lineTo(Math.sin(a) * r, Math.cos(a) * r); else starShape.moveTo(Math.sin(a) * r, Math.cos(a) * r); }
      const starG = new THREE.ExtrudeGeometry(starShape, { depth: 0.12, bevelEnabled: false }); const starM = new THREE.MeshBasicMaterial({ color: 0xfff0c8, toneMapped: false });
      const stars = [];
      [[-4, -3], [4, -3], [-6, 2], [6, 2], [0, 5], [-2, -6], [3, -7], [0, 0.5]].forEach(function (p, i) { const s = new THREE.Mesh(starG, starM); s.position.set(p[0], H - 1.1 - (i % 3) * 0.35, p[1]); s.userData.noPBR = true; lights.add(s); stars.push(s); });
      const glowA = new THREE.PointLight(0xffb070, 0.9, 16, 2); glowA.position.set(0, H - 1.2, -2); lights.add(glowA);
      const glowB = new THREE.PointLight(0xff5a9a, 0.6, 14, 2); glowB.position.set(0, H - 1.4, 5); lights.add(glowB);
      (window.__buckLife = window.__buckLife || []).push(function (t) { stars.forEach(function (s, i) { s.rotation.y = t * 0.6 + i; }); bulbMs.forEach(function (m, i) { const k = 0.82 + 0.18 * Math.sin(t * 2.3 + i * 1.7); m.color.setHex(cols[i]).multiplyScalar(k); }); });
      // 2) baddie street tags on the bar's outside walls (canvas spray paint, original words only)
      const tag = function (txt, c1, c2, w, h) { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const g = cv.getContext('2d');
        g.font = 'bold italic 120px Impact, Haettenschweiler, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
        g.lineWidth = 22; g.strokeStyle = 'rgba(10,6,12,0.9)'; g.strokeText(txt, 256, 132); g.lineWidth = 9; g.strokeStyle = c2; g.strokeText(txt, 256, 128);
        const gr = g.createLinearGradient(0, 70, 0, 190); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillText(txt, 256, 128);
        for (let i = 0; i < 40; i++) { g.fillStyle = c1; g.globalAlpha = 0.5; g.fillRect(60 + Math.random() * 390, 170 + Math.random() * 60, 3, 8 + Math.random() * 26); } g.globalAlpha = 1;
        const t = new THREE.CanvasTexture(cv); if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
        m.userData.keepPBR = true; m.userData.noPBR = true; return m; };
      [['BADDIE', '#ff3d8b', '#ffd23a', -12.18, 1.7, 4, -Math.PI / 2], ['BUCK UP', '#38e0ff', '#a64dff', -12.18, 1.6, -4, -Math.PI / 2], ['QUEENZ', '#ffd23a', '#ff4a2a', 12.18, 1.7, 3, Math.PI / 2],
       ['RIDE OR DIE', '#ff3d8b', '#7a2aff', 12.18, 1.5, -5, Math.PI / 2], ['BUCK IT', '#ff2d4a', '#ffd23a', -7.5, 1.5, 12.18, 0], ['LIL SPUR', '#3aff9a', '#2a8aff', 7.5, 1.6, 12.18, 0]].forEach(function (d) {
        const m = tag(d[0], d[1], d[2], d[0].length > 7 ? 4.4 : 3.4, 1.7); m.position.set(d[3], d[4], d[5]); m.rotation.y = d[6]; m.name = 'refTag'; scene.add(m); });
    })();
    // ---- baddie bartender (Gofer's original art -> TRELLIS model by Player Two), behind the bar in place of the old one ----
    (function realBartender() {
      const RB = window.BUCK_REAL && window.BUCK_REAL.bartender; if (!RB || !THREE.GLTFLoader) return;
      new THREE.GLTFLoader().parse(ab(RB), '', function (g) { try {
        const o = g.scene || g.scenes[0];
        o.traverse(function (q) { q.userData.keepPBR = true; q.userData.noPBR = true; if (q.isMesh) { if (!q.geometry.attributes.normal) q.geometry.computeVertexNormals();
          const m = q.material; if (m) { m.envMapIntensity = 0.9; if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.55); if (m.map) { m.map.anisotropy = 8; m.map.userData.sleek = 2; } } } });
        const bb = new THREE.Box3().setFromObject(o); const sz = bb.getSize(new THREE.Vector3());
        const sc = 1.68 / sz.y; o.scale.setScalar(sc); o.position.set(-(bb.min.x + sz.x / 2) * sc, -bb.min.y * sc, -(bb.min.z + sz.z / 2) * sc);
        const w = new THREE.Group(); w.add(o); w.name = 'realBartender'; w.userData.keepPBR = true;
        let old = null; (window.BUCK_ITCH_SLOTS && window.BUCK_ITCH_SLOTS.characters || []).forEach(function (c) { if (c.userData.itchName === 'bartender') old = c; });
        if (old) { const p = old.getWorldPosition(new THREE.Vector3()), q = old.getWorldQuaternion(new THREE.Quaternion()); w.position.set(p.x, 0, p.z); w.rotation.y = new THREE.Euler().setFromQuaternion(q, 'YXZ').y; }
        else { w.position.set(0, 0, -10.6); w.rotation.y = 0; }
        scene.add(w);
        const y0 = w.rotation.y;
        (window.__buckLife = window.__buckLife || []).push(function (t) { if (old && old.visible) old.visible = false; w.rotation.y = y0 + Math.sin(t * 0.4) * 0.25; o.rotation.z = Math.sin(t * 1.1) * 0.012; });
      } catch (e) { console.error('BUCK bartender', e); } }, function (e) { console.error('BUCK bartender', e); });
    })();
    // ---- realistic bull body ("Black Bull" by Znvne179, CC BY 4.0) on the existing mechanical bull: visual only, it rides the same bull group ----
    (function realBull() {
      const RB = window.BUCK_REAL && window.BUCK_REAL.bull; if (!RB || !THREE.GLTFLoader) return;
      const bullG = scene.getObjectByName('bull'); if (!bullG) return;
      new THREE.GLTFLoader().parse(ab(RB), '', function (g) { try {
        const o = g.scene || g.scenes[0];
        o.traverse(function (q) { q.userData.keepPBR = true; q.userData.noPBR = true;
          if (q.isMesh) { q.frustumCulled = false; const n = ((q.material && q.material.name) || '') + q.name; if (/scrotum/i.test(n)) q.visible = false;
            if (q.material) { q.material.envMapIntensity = 0.9; if (q.material.map) { q.material.map.anisotropy = 8; q.material.map.userData.sleek = 2; } } } });
        o.updateMatrixWorld(true);
        // bind-pose bounds, then drop the lower legs so it reads as a machine on a post (stub legs stay)
        const bb = new THREE.Box3(); const v = new THREE.Vector3();
        o.traverse(function (q) { if (!q.isMesh) return; const p = q.geometry.attributes.position; for (let i = 0; i < p.count; i++) bb.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(q.matrixWorld)); });
        const yCut = bb.min.y + (bb.max.y - bb.min.y) * 0.34;
        o.traverse(function (q) { if (!q.isMesh || !q.geometry.index) return; const p = q.geometry.attributes.position, ix = q.geometry.index.array, keep = [];
          for (let i = 0; i < ix.length; i += 3) { let top = -1e9; for (let k = 0; k < 3; k++) { const y = v.fromBufferAttribute(p, ix[i + k]).applyMatrix4(q.matrixWorld).y; if (y > top) top = y; } if (top > yCut) keep.push(ix[i], ix[i + 1], ix[i + 2]); }
          q.geometry.setIndex(keep); });
        const size = bb.getSize(new THREE.Vector3());
        const wrap = new THREE.Group(); wrap.name = 'realBull'; wrap.add(o);
        const s = 1.85 / Math.max(size.z, size.x, 1e-4); o.scale.setScalar(s);
        wrap.rotation.y = size.x > size.z ? -Math.PI / 2 : Math.PI; // head toward -Z like the machine
        const midY = (yCut + bb.max.y) / 2, mid = bb.getCenter(new THREE.Vector3());
        o.position.set(-mid.x * s, -midY * s, -mid.z * s);
        wrap.position.set(0, 0.96, -0.08); bullG.add(wrap);
        // hide the old low-poly flesh (keep saddle, rope, horns-free machine parts and the rider)
        const hideOld = function () { bullG.children.forEach(function (c) { if (c === wrap || (c.userData && c.userData.kind === 'ride')) return;
          let skinned = false; c.traverse(function (q) { if (q.isSkinnedMesh) skinned = true; }); if (skinned || c.name === 'bullHide' || c.name === 'bullHead') c.visible = false; });
          [typeof torso !== 'undefined' && torso, typeof hump !== 'undefined' && hump, typeof neck !== 'undefined' && neck, typeof headG !== 'undefined' && headG, typeof tail !== 'undefined' && tail].forEach(function (x) { if (x && x.parent === bullG) x.visible = false; }); };
        hideOld(); (window.__buckLife = window.__buckLife || []).push((function () { let a = 0; return function (t, dt) { a += dt || 0.016; if (a > 1) { a = 0; hideOld(); } }; })());
      } catch (e) { console.error('BUCK realBull', e); } }, function (e) { console.error('BUCK realBull', e); });
    })();
    // ---- realistic scanned crowd (Renderpeople / in3D, CC BY 4.0 via Sketchfab) replaces the low-poly crowd inside the bar ----
    (function realCrowd() {
      const RL = window.BUCK_REAL; if (!RL || !THREE.GLTFLoader) return;
      const keys = Object.keys(RL).filter(function (k) { return k !== 'credits' && k !== 'bull' && k !== 'bartender'; }); if (!keys.length) return;
      const models = []; let pending = keys.length;
      keys.forEach(function (k) {
        new THREE.GLTFLoader().parse(ab(RL[k]), '', function (g) { models.push({ key: k, g: g }); if (--pending === 0) setTimeout(swap, 300); },
          function (e) { console.error('BUCK real', k, e); if (--pending === 0) setTimeout(swap, 300); });
      });
      // baddie-core variants: recolour the white top (and white sneakers) of a scanned outfit to red / black / wine; skin and denim untouched
      const tintCache = {};
      const baddieTex = function (tex, kind) {
        const img = tex && tex.image; if (!img || !img.width) return null; const key = tex.uuid + kind; if (tintCache[key]) return tintCache[key];
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, cv.width, cv.height), a = d.data; const parts = String(kind).split('+'), pat = parts[2] || ''; const col = parts[0] ? ({ red: [150, 18, 28], black: [22, 20, 24], wine: [92, 14, 38], pink: [236, 72, 160], cobalt: [30, 70, 190], gold: [214, 164, 40], lime: [120, 200, 60], purple: [120, 50, 170], orange: [232, 100, 30], denim: [66, 98, 148], cream: [236, 224, 196], teal: [20, 150, 150], grey: [90, 90, 96], olive: [70, 78, 52], leather: [44, 30, 24], burgundy: [80, 16, 30], green: [38, 92, 52], sky: [40, 150, 200], silver: [186, 190, 198], tan: [176, 132, 84], rust: [150, 62, 28] }[parts[0]] || [150, 18, 28]) : null; const bot = parts[1] ? { black: [26, 24, 28], khaki: [160, 138, 92], wine: [96, 18, 44], white: [226, 226, 220], olive: [76, 90, 54], pink: [232, 112, 172], grey: [92, 92, 98], ltdenim: [150, 176, 208], dkdenim: [30, 40, 66], leather: [34, 24, 22], stone: [124, 118, 108] }[parts[1]] : null;
        for (let i = 0; i < a.length; i += 4) { const r = a[i], g = a[i + 1], b = a[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (col && mx > 88 && mx - mn < 0.16 * mx + 6) { const l = Math.min(1, mx / 215); a[i] = col[0] * l; a[i + 1] = col[1] * l; a[i + 2] = col[2] * l; if (pat) { const px = (i >> 2) % cv.width, py = ((i >> 2) / cv.width) | 0; let k = 1, mix = null; if (pat === 'leo') { const v = Math.sin(px * 0.11) * Math.sin(py * 0.13) + 0.6 * Math.sin(px * 0.045 + py * 0.05); if (v > 0.85) { k = 0.25; } else if (v > 0.6) { mix = [150, 90, 30]; } } else if (pat === 'stripe') { if ((py >> 4) & 1) mix = [240, 240, 235]; } else if (pat === 'plaid') { const q = ((px >> 5) & 1) + ((py >> 5) & 1); if (q === 1) k = 0.55; else if (q === 2) mix = [20, 20, 24]; } else if (pat === 'tie') { if (Math.sin(Math.hypot(px - 300, py - 700) * 0.05) > 0.2) mix = [250, 250, 255]; else k = 0.8; } else if (pat === 'camo') { const v = Math.sin(px * 0.03 + Math.sin(py * 0.04) * 2) + Math.sin(py * 0.05); if (v > 0.8) mix = [70, 80, 50]; else if (v < -0.6) mix = [30, 30, 24]; } else if (pat === 'snake') { const u = (px + py) >> 4, w2 = (px - py + 4000) >> 4, dd = ((px + py) & 15), ee = ((px - py + 4000) & 15); if (dd < 2 || ee < 2) k = 0.45; else k = ((u + w2) & 1) ? 0.72 : 1.08; } else if (pat === 'sequin') { const h = ((px * 73856093) ^ (py * 19349663)) >>> 0; if ((h % 13) === 0) mix = [255, 244, 210]; else k = 0.82 + ((h % 7) / 40); } else if (pat === 'floral') { const v = Math.sin(px * 0.09 + Math.sin(py * 0.07) * 1.5) * Math.sin(py * 0.1 + Math.cos(px * 0.06) * 1.5); if (v > 0.55) mix = [250, 170, 190]; else if (v < -0.6) mix = [255, 235, 120]; else if (v > 0.2 && v < 0.3) mix = [40, 150, 90]; } else if (pat === 'band') { if (((py >> 6) & 3) === 0) mix = [250, 230, 120]; } if (mix) { const lm = l; a[i] = mix[0] * lm; a[i + 1] = mix[1] * lm; a[i + 2] = mix[2] * lm; } else if (k !== 1) { a[i] *= k; a[i + 1] *= k; a[i + 2] *= k; } } } else if (bot && b > r + 14 && b > g + 4 && mx < 205) { const l = Math.min(1.25, mx / 150); a[i] = Math.min(255, bot[0] * l); a[i + 1] = Math.min(255, bot[1] * l); a[i + 2] = Math.min(255, bot[2] * l); if (parts[3] === 'rip') { const px = (i >> 2) % cv.width, py = ((i >> 2) / cv.width) | 0; const v = Math.sin(px * 0.06) * Math.sin(py * 0.075) + 0.4 * Math.sin(px * 0.2 + py * 0.17); if (v > 0.95) { a[i] = 214; a[i + 1] = 196; a[i + 2] = 176; } else if (v > 0.8) { a[i] = Math.min(255, a[i] * 1.5 + 30); a[i + 1] = Math.min(255, a[i + 1] * 1.5 + 30); a[i + 2] = Math.min(255, a[i + 2] * 1.5 + 30); } } } }
        cx.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(cv); t.flipY = tex.flipY; t.encoding = tex.encoding; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.anisotropy = 4; t.userData.sleek = 2; tintCache[key] = t; return t;
      };
      const prefixOf = function (root) { let p = null; root.traverse(function (b) { if (p === null && b.isBone && /(^|_)hip_\d+$/.test(b.name)) p = b.name.replace(/hip_\d+$/, ''); }); return p; };
      // Renderpeople rigs share bone suffixes, so a dance clip can drive a rig-only model by swapping the name prefix
      const retarget = function (clip, fromP, toP) {
        const tr = []; clip.tracks.forEach(function (t) { if (/\.position$/.test(t.name) && !/hip_\d+\.position$/.test(t.name)) return; if (fromP && t.name.indexOf(fromP) !== 0) return;
          const c = t.clone(); c.name = toP + t.name.slice(fromP.length); tr.push(c); });
        return new THREE.AnimationClip(clip.name + '_rt', clip.duration, tr);
      };
      const swap = function () {
        if (!models.length) return; window.__buckRP = { models: models, prefixOf: prefixOf, retarget: retarget, baddieTex: baddieTex, RL: RL };
        const animated = models.filter(function (m) { return m.g.animations && m.g.animations.length && prefixOf(m.g.scene) !== null; });
        const spots = [];
        const take = function (o) { if (!o || o.userData.realSwapped || !o.visible) return; let vis = true; for (let q = o.parent; q; q = q.parent) if (!q.visible) vis = false; if (!vis) return;
          const p = o.getWorldPosition(new THREE.Vector3()); o.userData.realSwapped = true;
          spots.push({ o: o, p: p, p0: p.clone() }); };
        (window.BUCK_ITCH_SLOTS && window.BUCK_ITCH_SLOTS.characters || []).forEach(function (o) { if (o.userData.itchName !== 'bartender') take(o); });
        scene.traverse(function (o) { if ((o.name === 'barPed' || o.name === 'ped') && o.parent) take(o); });
        // nearest to the bull first (that's what the rider sees); the far tail is just hidden
        const MAX = 40; spots.sort(function (a, b) { return Math.hypot(a.p.x, a.p.z) - Math.hypot(b.p.x, b.p.z); });
        spots.forEach(function (s, i) { s.o.visible = false; s.i = i; });
        const walkClip = (function () { const nm = models.filter(function (x) { return x.key === 'nathan'; })[0]; if (!nm || !nm.g.animations[0]) return null;
          const c = nm.g.animations[0].clone(); c.tracks.forEach(function (t) { if (/hip_\d+\.position$/.test(t.name)) { const v = t.values; for (let k = 3; k < v.length; k += 3) { v[k] = v[0]; v[k + 2] = v[2]; } } }); return { m: nm, c: c }; })();
        setTimeout(function () {
          spots.forEach(function (s, i) {
            if (i >= MAX) return;
            const cur = s.o.getWorldPosition(new THREE.Vector3()); const walker = cur.distanceTo(s.p0) > 0.25 && walkClip;
            const order = ['sophia:silver+black+sequin', 'manuel:sky+khaki+floral', 'carla:tan+leather+snake', 'nathan:green+dkdenim', 'sophia:denim+white+leo', 'carla:white+ltdenim', 'manuel:grey+black', 'nathan:leather+stone', 'eric:+stone', 'sophia:leather+dkdenim++rip', 'manuel:wine+stone', 'carla:olive+dkdenim', 'nathan:black+black', 'sophia:denim+olive', 'carla:white+dkdenim', 'manuel:grey+leather', 'nathan:leather+ltdenim', 'eric:+grey', 'sophia:black+ltdenim++rip', 'manuel:wine+grey', 'carla:olive+white', 'nathan:black+ltdenim++rip', 'sophia:denim+khaki', 'carla:white+black', 'manuel:grey+stone', 'nathan:leather+dkdenim', 'eric:+black', 'manuel:wine+black', 'carla:olive+olive', 'nathan:black+dkdenim++rip', 'sophia:denim+leather', 'manuel:grey+grey', 'nathan:leather+white', 'eric:+ltdenim', 'sophia:black+white', 'manuel:wine+ltdenim', 'carla:olive+khaki', 'sophia:denim+stone', 'manuel:grey+black', 'nathan:leather+olive', 'eric:+dkdenim', 'sophia:black+olive', 'manuel:wine+dkdenim', 'carla:olive+leather'];
            const pick = order[i % order.length].split(':'); const m = walker ? walkClip.m : (models.filter(function (x) { return x.key === pick[0]; })[0] || models[i % models.length]);
            const tint = !walker && pick[1];
            const inst = THREE.SkeletonUtils ? THREE.SkeletonUtils.clone(m.g.scene) : m.g.scene.clone(true);
            inst.traverse(function (q) { q.userData.keepPBR = true; q.userData.noPBR = true; if (q.isMesh) { q.frustumCulled = false; const mm = q.material; if (mm && mm.map) { mm.map.anisotropy = 4; mm.map.userData.sleek = 2; } if (mm) mm.envMapIntensity = 0.7; } });
            if (tint) inst.traverse(function (q) { if (q.isMesh && q.material && q.material.map) { const t2 = baddieTex(q.material.map, tint); if (t2) { q.material = q.material.clone(); q.material.map = t2; if (/leather|snake|sequin/.test(String(tint))) { q.material.roughness = 0.4; q.material.metalness = 0.16; } } } });
            const want = (RL.credits && RL.credits.anim && RL.credits.anim[m.key]) || 'own';
            let clip = walker ? walkClip.c : (want === 'own' ? (m.g.animations && m.g.animations[0]) : null);
            if (!clip) { const src = models.filter(function (x) { return x.key === want; })[0] || animated[0]; const tp = prefixOf(inst), fp = src && prefixOf(src.g.scene);
              if (src && tp !== null && fp !== null) clip = retarget(src.g.animations[0], fp, tp); }
            const mixer = new THREE.AnimationMixer(inst);
            if (clip) { const a = mixer.clipAction(clip); a.time = (i * 1.37) % Math.max(clip.duration, 0.1); a.timeScale = walker ? 1 : 0.85 + (i % 5) * 0.06; a.play(); }
            mixer.update(0.01); inst.updateMatrixWorld(true); if (window.__buckCrop && !walker && /sophia|carla/.test(String(m.key)) && false) { try { window.__buckCrop(inst, i); } catch (e) { } } if (window.__buckBoots && !walker && i % 5 < 3) { try { window.__buckBoots(inst, i); } catch (e) { } }
            let mn = 1e9, mx = -1e9; inst.traverse(function (b) { if (b.isBone) { const y = b.getWorldPosition(new THREE.Vector3()).y; if (y < mn) mn = y; if (y > mx) mx = y; } });
            if (mn > mx) { const bb = new THREE.Box3().setFromObject(inst); mn = bb.min.y; mx = bb.max.y; }
            const h = 1.6 + ((i * 7) % 5) * 0.06, sc = h / Math.max(mx - mn, 1e-4) * 0.93;
            const w = new THREE.Group(); w.add(inst); inst.scale.setScalar(sc); inst.position.y = -mn * sc;
            w.name = 'realPed'; w.userData.keepPBR = true; scene.add(w);
            const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
            const follow = function () { s.o.updateWorldMatrix(true, false); s.o.matrixWorld.decompose(v, q, new THREE.Vector3()); e.setFromQuaternion(q, 'YXZ');
              w.position.set(v.x, Math.max(0, v.y - (s.o.userData.realYOff || 0)), v.z); w.rotation.y = e.y; };
            follow(); s.o.userData.realYOff = 0; w.position.y = s.p0.y > 0.05 ? s.p0.y : 0;
            (window.__buckLife = window.__buckLife || []).push(function (t, dt) { mixer.update(dt || 0.016); if (s.o.visible) s.o.visible = false; follow(); });
          });
        }, 700);
      };
    })();
  })();
  // Gothic fail splash (presentation only): a DOM overlay above the game canvas, driven by the
  // mood the game already reports each frame. No game state is read or written here.
  let failSplashEl = null, failSplashMood = null;
  function updateFailSplash(m) {
    if (m === failSplashMood) return;
    failSplashMood = m;
    try {
      if (!failSplashEl) {
        if (m !== 'fail' || !document.body) return;
        failSplashEl = document.createElement('div');
        failSplashEl.id = 'buck-fail';
        failSplashEl.setAttribute('aria-hidden', 'true');
        const word = document.createElement('span');
        word.textContent = 'Bucked';
        failSplashEl.appendChild(word);
        document.body.appendChild(failSplashEl);
        void failSplashEl.offsetWidth;
      }
      if (m === 'fail') failSplashEl.classList.add('on');
      else failSplashEl.classList.remove('on');
    } catch (e) {}
  }
  function setMood(m) {
    if (!gradePass) return;
    if (m === 'fail') {
      gradePass.uniforms.fade.value = 0.55; gradePass.uniforms.sat.value = 0.2; gradePass.uniforms.warmth.value = 0.04; gradePass.uniforms.contrast.value = 1.05;
      if (filmPass) { filmPass.uniforms.nIntensity.value = 0.3; filmPass.uniforms.grayscale.value = 1; }
      if (vignettePass) { vignettePass.uniforms.darkness.value = 0.7; vignettePass.uniforms.offset.value = 1.1; }
      if (bloomPass) bloomPass.strength = 0.1;
    } else if (m === 'cinematic') {
      gradePass.uniforms.fade.value = 0; gradePass.uniforms.sat.value = 1.08; gradePass.uniforms.warmth.value = 0.06; gradePass.uniforms.contrast.value = 1.10;
      if (gradePass.uniforms.bleach) gradePass.uniforms.bleach.value = 0;
      if (vignettePass) { vignettePass.uniforms.darkness.value = 0.22; vignettePass.uniforms.offset.value = 1.35; }
      if (bloomPass) { bloomPass.strength = 0.16; bloomPass.threshold = 0.88; }
    } else {
      gradePass.uniforms.fade.value = 0; gradePass.uniforms.sat.value = 1.08; gradePass.uniforms.warmth.value = 0.06; gradePass.uniforms.contrast.value = 1.10;
      if (gradePass.uniforms.bleach) gradePass.uniforms.bleach.value = 0;
      if (vignettePass) { vignettePass.uniforms.darkness.value = 0.22; vignettePass.uniforms.offset.value = 1.35; }
      if (bloomPass) { bloomPass.strength = 0.16; bloomPass.threshold = 0.88; }
    }
  }
  function render() { safeRender(); }

  // load embedded GLBs (file:// safe) and swap in the real people, bull and furniture
  const loaded = {};
  function b64ToBuf(s) {
    const bin = atob(s);
    const buf = new ArrayBuffer(bin.length), v = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) v[i] = bin.charCodeAt(i);
    return buf;
  }
  function findBone(root, name) {
    let found = null;
    const want = name.toLowerCase().replace(/[._\s-]/g, '');
    root.traverse(function (o) {
      if (found || !o.name) return;
      const n = o.name.toLowerCase().replace(/[._\s-]/g, '');
      if (o.name === name || n === want || n.endsWith(want)) found = o;
    });
    return found;
  }
  function listBones(root) {
    const names = [];
    root.traverse(function (o) { if (o.isBone || o.type === 'Bone') names.push(o.name); });
    return names;
  }
  function flushPose(wrap) {
    wrap.updateMatrixWorld(true);
    wrap.traverse(function (o) {
      if (o.isSkinnedMesh && o.skeleton) {
        o.skeleton.update();
        o.frustumCulled = false;
      }
    });
  }
  function faceToward(obj, x, z) {
    obj.rotation.x = 0;
    obj.rotation.z = 0;
    obj.rotation.y = Math.atan2((obj.position.x - x), (obj.position.z - z)) + Math.PI;
  }
  function poseAstride(wrap) {
    const l = findBone(wrap, 'UpperLegL') || findBone(wrap, 'UpperLeg.L');
    const r = findBone(wrap, 'UpperLegR') || findBone(wrap, 'UpperLeg.R');
    const ll = findBone(wrap, 'LowerLegL') || findBone(wrap, 'LowerLeg.L');
    const rr = findBone(wrap, 'LowerLegR') || findBone(wrap, 'LowerLeg.R');
    function out(bone, sign) {
      if (!bone) return;
      const bind = bone.userData.bindQ;
      if (bind) bone.quaternion.copy(bind);
      bone.rotateX(0.35);
      bone.rotateZ(sign * 0.55);
    }
    out(l, 1); out(r, -1);
    [ll, rr].forEach(function (b) {
      if (!b) return;
      if (b.userData.bindQ) b.quaternion.copy(b.userData.bindQ);
      b.rotateX(0.4);
    });
    flushPose(wrap);
  }
  const _down = new THREE.Vector3();
  const _inv = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _q2 = new THREE.Quaternion();
  const _ax = new THREE.Vector3();
  function cacheBinds(root) {
    const names = ['Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head', 'Shoulder.L', 'Shoulder.R', 'UpperArm.L', 'UpperArm.R', 'LowerArm.L', 'LowerArm.R'];
    const binds = {};
    names.forEach(function (n) {
      const b = findBone(root, n);
      if (b) {
        binds[n] = { q: b.quaternion.clone() };
        b.userData.bindQ = b.quaternion.clone();
      }
    });
    return binds;
  }
  function addBindRot(bone, bindQ, axis, angle) {
    _q2.setFromAxisAngle(axis, angle);
    bone.quaternion.copy(bindQ).multiply(_q2);
  }
  function poseArmDown(upper, lower, side, time, ph, kind) {
    if (!upper || !upper.parent) return;
    upper.updateWorldMatrix(false, false);
    upper.parent.updateWorldMatrix(true, false);
    _inv.copy(upper.parent.matrixWorld).invert();
    // Point the bone's +Y (along the limb) at world-down, slightly out and forward
    const cheer = kind === 'cheer';
    if (cheer) _down.set(side * 0.22, 0.95, 0.12).normalize();
    else _down.set(side * 0.12, -1, kind === 'ride' && side < 0 ? 0.35 : 0.08).normalize();
    _down.transformDirection(_inv).normalize();
    if (_down.lengthSq() < 1e-6) return;
    _ax.set(0, 1, 0);
    if (_ax.dot(_down) > 0.999) _q.identity();
    else if (_ax.dot(_down) < -0.999) _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    else _q.setFromUnitVectors(_ax, _down);
    const dance = kind === 'dance';
    const swing = Math.sin(time * (cheer ? 8 : dance ? 5 : 2.2) + ph) * (cheer ? 0.28 : dance ? 0.35 : 0.1);
    _q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), swing);
    upper.quaternion.copy(_q).multiply(_q2);
    if (lower) {
      const bend = (cheer ? 0.15 : 0.3) + Math.sin(time * (cheer ? 8 : dance ? 5 : 2.2) + ph + 0.4) * (cheer ? 0.2 : dance ? 0.18 : 0.06);
      lower.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), bend);
    }
  }
  function poseHuman(wrap, time) {
    const u = wrap.userData;
    if (!u || !u.binds) return;
    if (u.cheerUntil && time > u.cheerUntil) { u.kind = u.prevKind || 'idle'; u.cheerUntil = 0; }
    const ph = u.ph || 0;
    const kind = u.kind || 'idle';
    const dance = kind === 'dance';
    const cheer = kind === 'cheer';
    const hips = findBone(wrap, 'Hips');
    const chest = findBone(wrap, 'Chest');
    const head = findBone(wrap, 'Head');
    if (hips && u.binds.Hips) addBindRot(hips, u.binds.Hips.q, _ax.set(0, 1, 0), Math.sin(time * (cheer ? 7 : dance ? 4 : 1.6) + ph) * (cheer ? 0.14 : dance ? 0.08 : 0.03));
    if (chest && u.binds.Chest) addBindRot(chest, u.binds.Chest.q, _ax.set(1, 0, 0), Math.sin(time * (cheer ? 7 : dance ? 4 : 1.6) + ph + 0.3) * (cheer ? 0.12 : dance ? 0.07 : 0.03));
    // tiny nod only — never yaw the head/neck (that was flipping faces backwards)
    if (head && u.binds.Head) addBindRot(head, u.binds.Head.q, _ax.set(1, 0, 0), Math.sin(time * 2.1 + ph) * 0.04);
    const shL = findBone(wrap, 'Shoulder.L') || findBone(wrap, 'ShoulderL');
    const shR = findBone(wrap, 'Shoulder.R') || findBone(wrap, 'ShoulderR');
    if (shL && shL.userData.bindQ) { shL.quaternion.copy(shL.userData.bindQ); shL.rotateZ(-0.15); }
    if (shR && shR.userData.bindQ) { shR.quaternion.copy(shR.userData.bindQ); shR.rotateZ(0.15); }
    poseArmDown(findBone(wrap, 'UpperArm.L') || findBone(wrap, 'UpperArmL') || findBone(wrap, 'LeftArm'), findBone(wrap, 'LowerArm.L') || findBone(wrap, 'LowerArmL'), 1, time, ph, kind);
    poseArmDown(findBone(wrap, 'UpperArm.R') || findBone(wrap, 'UpperArmR') || findBone(wrap, 'RightArm'), findBone(wrap, 'LowerArm.R') || findBone(wrap, 'LowerArmR'), -1, time, ph, kind);
    if (u.baseY != null) {
      wrap.position.y = u.baseY + Math.abs(Math.sin(time * (cheer ? 8 : dance ? 5 : 2.2) + ph)) * (cheer ? 0.1 : dance ? 0.05 : 0.015);
    }
    flushPose(wrap);
  }
  function toStd(src, opts, skinned) {
    const m = new THREE.MeshLambertMaterial({
      color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
      map: src.map || null,
      name: src.name,
      transparent: !!src.transparent,
      opacity: src.opacity != null ? src.opacity : 1,
      side: src.side || THREE.FrontSide,
    });
    if (skinned && ('skinning' in m)) m.skinning = true;
    if (src.map) {
      if (THREE.sRGBEncoding) src.map.encoding = THREE.sRGBEncoding;
      src.map.magFilter = THREE.NearestFilter;
      src.map.minFilter = THREE.NearestFilter;
      src.map.generateMipmaps = false;
    }
    return m;
  }
  function paintCloth(kind) {
    return canvasTex(function (g, W, H) {
      if (kind === 'denim') {
        g.fillStyle = '#2a3a58'; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(180,200,230,0.08)';
        for (let y = 0; y < H; y += 2) g.fillRect(0, y, W, 1);
        g.fillStyle = 'rgba(0,0,0,0.15)';
        for (let i = 0; i < 40; i++) g.fillRect(Math.random()*W, Math.random()*H, 3, 2);
      } else if (kind === 'plaid') {
        const a = '#6a2a22', b = '#2a3a28', c = '#c4a050';
        g.fillStyle = a; g.fillRect(0, 0, W, H);
        g.fillStyle = b;
        for (let x = 0; x < W; x += 16) g.fillRect(x, 0, 8, H);
        g.fillStyle = 'rgba(196,160,80,0.45)';
        for (let y = 0; y < H; y += 16) g.fillRect(0, y, W, 3);
      } else if (kind === 'leather') {
        g.fillStyle = '#3a2216'; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(80,40,20,0.5)';
        for (let i = 0; i < 30; i++) g.beginPath(), g.arc(Math.random()*W, Math.random()*H, 8+Math.random()*16, 0, 6.3), g.fill();
      } else if (kind === 'tank') {
        g.fillStyle = '#d8d0c4'; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(80,60,40,0.12)';
        for (let i = 0; i < 20; i++) g.fillRect(Math.random()*W, Math.random()*H, 12, 8);
      } else {
        g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, W, H);
      }
    }, 128, 128);
  }
  
  function projectUVs(mesh) {
    const geo = mesh.geometry;
    if (!geo || !geo.attributes || !geo.attributes.position) return;
    const pos = geo.attributes.position;
    const n = pos.count;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const uv = new Float32Array(n * 2);
    const name = ((mesh.name || '') + ' ' + ((mesh.material && mesh.material.name) || '')).toLowerCase();
    const isHead = /head/.test(name) && !/hair/.test(name);
    const eps = 1e-6;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let u, v;
      if (isHead) {
        u = (x - minX) / (maxX - minX + eps);
        v = (z - minZ) / (maxZ - minZ + eps);
      } else {
        u = 0.5 + Math.atan2(y, x) / (Math.PI * 2);
        v = (z - minZ) / (maxZ - minZ + eps);
      }
      uv[i * 2] = u; uv[i * 2 + 1] = v;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.attributes.uv.needsUpdate = true;
  }
  function prepareChar(root) {
    if (!root || root.userData.uvReady) return;
    root.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      const uv = o.geometry.attributes.uv;
      let deg = !uv;
      if (uv) {
        deg = true;
        const a = uv.array;
        for (let i = 0; i < a.length; i += 2) {
          if (Math.abs(a[i]) > 0.01 || Math.abs(a[i + 1] - 1) > 0.01) { deg = false; break; }
        }
      }
      if (deg) projectUVs(o);
    });
    root.userData.uvReady = true;
  }
  const UAL_BONE = {
    root: 'Root', pelvis: 'Hips', spine_01: 'Abdomen', spine_02: 'Torso', spine_03: 'Chest',
    neck_01: 'Neck', Head: 'Head',
    clavicle_l: 'Shoulder.L', upperarm_l: 'UpperArm.L', lowerarm_l: 'LowerArm.L', hand_l: 'Hand.L',
    clavicle_r: 'Shoulder.R', upperarm_r: 'UpperArm.R', lowerarm_r: 'LowerArm.R', hand_r: 'Hand.R',
    thigh_l: 'UpperLeg.L', calf_l: 'LowerLeg.L', foot_l: 'Foot.L',
    thigh_r: 'UpperLeg.R', calf_r: 'LowerLeg.R', foot_r: 'Foot.R',
    index_01_l: 'Index1.L', index_02_l: 'Index2.L', index_03_l: 'Index3.L',
    index_01_r: 'Index1.R', index_02_r: 'Index2.R', index_03_r: 'Index3.R',
    middle_01_l: 'Middle1.L', middle_02_l: 'Middle2.L', middle_03_l: 'Middle3.L',
    middle_01_r: 'Middle1.R', middle_02_r: 'Middle2.R', middle_03_r: 'Middle3.R',
    ring_01_l: 'Ring1.L', ring_02_l: 'Ring2.L', ring_03_l: 'Ring3.L',
    ring_01_r: 'Ring1.R', ring_02_r: 'Ring2.R', ring_03_r: 'Ring3.R',
    pinky_01_l: 'Pinky1.L', pinky_02_l: 'Pinky2.L', pinky_03_l: 'Pinky3.L',
    pinky_01_r: 'Pinky1.R', pinky_02_r: 'Pinky2.R', pinky_03_r: 'Pinky3.R',
    thumb_01_l: 'Thumb1.L', thumb_02_l: 'Thumb2.L', thumb_03_l: 'Thumb3.L',
    thumb_01_r: 'Thumb1.R', thumb_02_r: 'Thumb2.R', thumb_03_r: 'Thumb3.R'
  };
  function resolveBone(nameSet, ual) {
    const want = UAL_BONE[ual] || ual;
    if (nameSet[want]) return want;
    // men pack uses Index2 as the first finger joint
    const alt = want.replace(/Index1/, 'Index2').replace(/Middle1/, 'Middle2').replace(/Ring1/, 'Ring2').replace(/Pinky1/, 'Pinky2').replace(/Thumb1/, 'Thumb2');
    if (alt !== want && nameSet[alt]) return alt;
    return null;
  }
  function retargetClip(clip, nameSet) {
    const tracks = [];
    clip.tracks.forEach(function (t) {
      const parts = t.name.split('.');
      const bone = parts[0], prop = parts.slice(1).join('.');
      if (prop.indexOf('position') >= 0) return; // in-place only
      const dest = resolveBone(nameSet, bone);
      if (!dest) return;
      const nt = t.clone();
      nt.name = dest + '.' + prop;
      tracks.push(nt);
    });
    if (!tracks.length) return null;
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }
  function bindAnims(root, wrap, kind) {
    const src = loaded.ualClips;
    if (!src || !src.animations || !src.animations.length || typeof THREE.AnimationMixer !== 'function') return;
    const nameSet = {};
    root.traverse(function (o) { if (o.name) nameSet[o.name] = true; });
    const actions = {};
    const mixer = new THREE.AnimationMixer(root);
    src.animations.forEach(function (c) {
      const r = retargetClip(c, nameSet);
      if (!r) return;
      const a = mixer.clipAction(r);
      a.enabled = true;
      actions[c.name] = a;
    });
    const idle = actions.Idle_Loop || actions.Idle_Talking_Loop;
    const dance = actions.Dance_Loop;
    const cheer = actions.Idle_Rail_Call || actions.Yes;
    const talk = actions.Idle_Talking_Loop;
    let start = idle;
    if (kind === 'dance' && dance) start = dance;
    else if (kind === 'talk' && talk) start = talk;
    if (start) { start.reset().setLoop(THREE.LoopRepeat).play(); }
    wrap.userData.mixer = mixer;
    wrap.userData.actions = { idle: idle, dance: dance, cheer: cheer, talk: talk, current: start };
    mixers.push(mixer);
  }
  function playAct(wrap, name, loopOnce) {
    const A = wrap && wrap.userData && wrap.userData.actions;
    if (!A || !wrap.userData.mixer) return;
    const next = A[name] || A.idle;
    if (!next) return;
    if (A.current && A.current !== next) A.current.fadeOut(0.2);
    next.reset();
    if (loopOnce) next.setLoop(THREE.LoopOnce, 1).clampWhenFinished = true;
    else next.setLoop(THREE.LoopRepeat);
    next.fadeIn(0.2).play();
    A.current = next;
  }

  function paintSkin(hex) {
    return canvasTex(function (g, W, H) {
      g.fillStyle = hex; g.fillRect(0, 0, W, H);
      // baked-looking SA face (original; not a ripped texture)
      const cx = W * 0.5, cy = H * 0.52;
      g.fillStyle = 'rgba(0,0,0,0.10)';
      g.fillRect(cx - 18, cy - 4, 36, 28);
      // brows
      g.fillStyle = 'rgba(20,10,6,0.75)';
      g.fillRect(cx - 22, cy - 16, 14, 4);
      g.fillRect(cx + 8, cy - 16, 14, 4);
      // eye whites + iris + pupil
      g.fillStyle = '#f3ece3';
      g.fillRect(cx - 20, cy - 8, 12, 9);
      g.fillRect(cx + 8, cy - 8, 12, 9);
      g.fillStyle = '#3a2418';
      g.fillRect(cx - 16, cy - 6, 6, 6);
      g.fillRect(cx + 12, cy - 6, 6, 6);
      g.fillStyle = '#0a0604';
      g.fillRect(cx - 14, cy - 4, 3, 3);
      g.fillRect(cx + 14, cy - 4, 3, 3);
      // nose shadow + lips
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(cx - 4, cy + 4, 8, 8);
      g.fillStyle = '#7a3030';
      g.fillRect(cx - 8, cy + 16, 16, 5);
      g.fillStyle = 'rgba(255,200,180,0.12)';
      g.fillRect(cx - 24, cy + 8, 10, 8);
      g.fillRect(cx + 14, cy + 8, 10, 8);
    }, 256, 256);
  }
  function paintBodySkin(hex) {
    return canvasTex(function (g, W, H) {
      g.fillStyle = hex; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(0,0,0,0.06)';
      for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
    }, 128, 128);
  }
  function paintWifeBeater() {
    return canvasTex(function (g, W, H) {
      g.fillStyle = '#f3f0ea'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(180,180,176,0.35)';
      for (let x = 0; x < W; x += 3) g.fillRect(x, 0, 1, H);
      g.fillStyle = 'rgba(0,0,0,0.06)';
      for (let i = 0; i < 18; i++) g.fillRect(Math.random() * W, Math.random() * H, 4, 2);
    }, 128, 128);
  }
  function paintJeans() {
    return canvasTex(function (g, W, H) {
      g.fillStyle = '#2a4a72'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(180,200,230,0.12)';
      for (let y = 0; y < H; y += 2) g.fillRect(0, y, W, 1);
      g.fillStyle = 'rgba(20,30,50,0.25)';
      g.fillRect(W * 0.45, 0, 3, H);
      g.fillRect(0, H * 0.55, W, 2);
      g.fillStyle = 'rgba(200,180,80,0.35)';
      g.fillRect(W * 0.2, H * 0.2, 18, 2);
    }, 128, 128);
  }
  function paintBandana(base, dot) {
    return canvasTex(function (g, W, H) {
      g.fillStyle = base || '#6a1020'; g.fillRect(0, 0, W, H);
      g.fillStyle = dot || '#d0c8b0';
      for (let i = 0; i < 24; i++) {
        const x = (i * 37) % W, y = (i * 53) % H;
        g.beginPath(); g.arc(x, y, 4, 0, 6.28); g.fill();
      }
    }, 64, 64);
  }
  function crunchMap(tex) {
    if (!tex) return tex;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.anisotropy = 1;
    tex.needsUpdate = true;
    return tex;
  }
  function convertMeshes(root, opts) {
    root.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const out = list.map(function (m) {
        const mm = hookSnap(toStd(m, opts, o.isSkinnedMesh));
        ['map', 'emissiveMap', 'lightMap'].forEach(function (k) { if (mm[k]) crunchMap(mm[k]); });
        return mm;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
      o.castShadow = false;
      o.receiveShadow = false;
    });
  }
  // Y2K "baddie" crowd: every person gets a random skin tone, hair colour and painted outfit (crop top / baggy jeans /
  // chunky shoes). The rigs are exported Z-up with flat-colour parts, so clothing parts get a front-on planar UV
  // (u across the torso, v feet->head) that lines up with the painted atlas from PS2.outfitTexture. Visual only.
  const BADDIE_HAIR = ['#E9D79A', '#C79A45', '#15100D', '#7B2D1B', '#4A2A18', '#E36FA6', '#C94A2E', '#1E2A55'];
  function baddieUV(root) {
    const all = new THREE.Box3();
    root.traverse(function (o) { if (o.isMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); all.union(o.geometry.boundingBox); } });
    return all;
  }
  function tintChar(root, role) {
    const P = window.PS2;
    const idx = (P && P.nextCharIndex) ? P.nextCharIndex() : Math.floor(Math.random() * 100);
    const bartender = role === 'bartender';
    const skinHex = P && P.SKIN_TONES ? rnd(P.SKIN_TONES) : '#D99E73';
    const darkHex = '#' + new THREE.Color(skinHex).multiplyScalar(0.84).getHexString();
    const hairHex = rnd(BADDIE_HAIR);
    const cnt = (P && P.OUTFIT_COUNTS) || { pants: 1, top: 1, shoes: 1 };
    const fit = bartender ? { pants: 4 % cnt.pants, top: 6 % cnt.top, shoes: 1 % cnt.shoes }
      : { pants: Math.floor(Math.random() * cnt.pants), top: Math.floor(Math.random() * cnt.top), shoes: Math.floor(Math.random() * cnt.shoes) };
    const atlas = (P && P.outfitTexture) ? P.outfitTexture(fit, skinHex) : null;
    const roll = Math.random();
    root.userData.role = role || 'baddie';
    root.userData.charIndex = idx;
    root.userData.outfit = { chain: roll < 0.9, hoops: Math.random() < 0.8, bandana: roll > 0.5 && roll < 0.82, hat: roll >= 0.82 };
    const box = baddieUV(root), sz = box.getSize(new THREE.Vector3());
    // the hair is the tallest non-skin head part
    let hairMesh = null, hairH = 0;
    root.traverse(function (o) {
      if (!o.isMesh) return;
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      const mn = ((src && src.name) || '').toLowerCase(), on = (o.name || '').toLowerCase();
      if (/_head/.test(on) && !/skin|eye|brow|gold|earring/.test(mn)) {
        const h = o.geometry.boundingBox.max.z - o.geometry.boundingBox.min.z;
        if (h > hairH) { hairH = h; hairMesh = o; }
      }
    });
    root.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      const skinned = o.isSkinnedMesh;
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      const mn = ((src.name || '')).toLowerCase(), on = (o.name || '').toLowerCase();
      const mat0 = hookSnap(toStd(src, {}, skinned));
      mat0.color.set(0xffffff);
      const grit = function (hex) { return (P && P.gritTint) ? P.gritTint(hex) : null; };
      if (/eye/.test(mn) && !/brow/.test(mn)) { mat0.map = grit(0x1a120c); if (!mat0.map) mat0.color.set(0x1a120c); }
      else if (/brow/.test(mn + on)) { mat0.map = grit(0x1a1008); if (!mat0.map) mat0.color.set(0x1a1008); }
      else if (/skin/.test(mn)) { mat0.map = P && P.skinTexture ? P.skinTexture(/dark/.test(mn) ? darkHex : skinHex) : paintSkin(skinHex); }
      else if (/gold|earring|chain/.test(mn)) { mat0.map = grit(0xe0b84a); mat0.emissive = new THREE.Color(0x3a2a08); mat0.emissiveIntensity = 0.25; }
      else if (o === hairMesh) { mat0.map = grit(hairHex); if (!mat0.map) mat0.color.set(hairHex); }
      else if (/_head/.test(on)) { const c0 = src.color ? src.color.getHex() : 0x2a1a10; mat0.map = grit(c0); if (!mat0.map) mat0.color.set(c0); }
      else if (atlas) {
        mat0.map = atlas;
        if (o.geometry && !o.geometry.userData.baddieUV) {
          o.geometry.userData.baddieUV = true;
          const pa = o.geometry.attributes.position, uvs = new Float32Array(pa.count * 2);
          for (let k = 0; k < pa.count; k++) {
            const u = (pa.getX(k) - box.min.x) / sz.x, v = (pa.getZ(k) - box.min.z) / sz.z;
            uvs[k * 2] = Math.max(0, Math.min(1, (u - 0.15) / 0.7));
            uvs[k * 2 + 1] = Math.max(0, Math.min(1, v));
          }
          o.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        }
      } else { mat0.map = grit(src.color ? src.color.getHex() : 0x884422); }
      if (mat0.map) crunchMap(mat0.map);
      o.material = mat0;
      o.castShadow = false;
      o.receiveShadow = false;
    });
  }
  const FACE_Y = 0.0010, FACE_Z = 0.0016;
  function attachSAAcc(wrap, style) {
    if (!style) return;
    const head = findBone(wrap, 'Head');
    const chest = findBone(wrap, 'Chest') || findBone(wrap, 'Torso') || findBone(wrap, 'Neck');
    if (head) head.scale.multiplyScalar(1.2); // chunky bobble head (PS2 proportions)
    const gold = hookSnap(new THREE.MeshLambertMaterial({ color: 0xffffff, map: (window.PS2 && PS2.gritTint) ? PS2.gritTint(0xd4b24a) : null, emissive: 0x3a2a08, emissiveIntensity: 0.2 }));
    if (style.chain && chest) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.00115, 0.00016, 6, 12), gold);
      ring.rotation.x = 1.15;
      ring.position.set(0, 0, 0.0002);
      chest.add(ring);
      const pendant = new THREE.Mesh(new THREE.BoxGeometry(0.0005, 0.0007, 0.00016), gold);
      pendant.position.set(0, -0.0013, 0.0006);
      chest.add(pendant);
    }
    if (head) {
      try {
        const FT = window.__buckFaceTex || (window.__buckFaceTex = [0, 1, 2, 3, 4, 5].map(function (k) {
          const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
          const lip = ['#c8283c', '#e0508a', '#a01830', '#d86a5a', '#8a1c3a', '#e8405a'][k];
          // eyes: white, iris, heavy lids
          [[19, 26], [45, 26]].forEach(function (e) { g.fillStyle = '#f4efe6'; g.fillRect(e[0] - 7, e[1] - 3, 14, 7); g.fillStyle = k % 2 ? '#3a2410' : '#1a1a1e'; g.fillRect(e[0] - 3, e[1] - 3, 6, 7); g.fillStyle = '#fff'; g.fillRect(e[0] - 1, e[1] - 2, 2, 2); g.fillStyle = '#1a0e08'; g.fillRect(e[0] - 8, e[1] - 4, 16, 2); g.fillRect(e[0] - 9, e[1] - 6, 3, 2); g.fillRect(e[0] + 6, e[1] - 6, 3, 2); });
          // heavy brows
          g.fillStyle = '#140a06'; g.fillRect(9, 16, 20, 4); g.fillRect(35, 16, 20, 4); g.fillRect(12, 14, 14, 2); g.fillRect(38, 14, 14, 2);
          // nose shade
          g.fillStyle = 'rgba(70,30,20,0.45)'; g.fillRect(29, 31, 6, 9); g.fillRect(27, 40, 10, 3);
          // mouth
          if (k === 1 || k === 4) { g.fillStyle = '#2a0c10'; g.fillRect(21, 47, 22, 8); g.fillStyle = '#e8c84a'; g.fillRect(22, 47, 20, 3); g.fillStyle = '#fff2b0'; g.fillRect(24, 47, 2, 2); g.fillRect(34, 47, 2, 2); g.fillStyle = lip; g.fillRect(20, 45, 24, 3); g.fillRect(21, 55, 22, 3); }
          else { g.fillStyle = lip; g.fillRect(20, 46, 24, 4); g.fillRect(22, 50, 20, 4); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(26, 50, 6, 1); }
          if (k === 2 || k === 5) { g.fillStyle = '#0a0a0e'; g.fillRect(6, 20, 52, 13); g.fillStyle = '#2a3a58'; g.fillRect(9, 22, 20, 9); g.fillRect(35, 22, 20, 9); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(11, 23, 6, 2); g.fillRect(37, 23, 6, 2); }
          const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; t.userData.ps2 = true; return t;
        }));
        const fm = new THREE.MeshBasicMaterial({ map: FT[(Math.random() * FT.length) | 0], transparent: true, alphaTest: 0.5, color: 0xe8d8c8 });
        fm.userData.ps2KeepMap = true;
        const fp = new THREE.Mesh(new THREE.PlaneGeometry(0.0016, 0.0016), fm);
        fp.name = 'facePaint'; fp.userData.ps2KeepMap = true; fp.userData.itchSwap = true; fp.position.set(0, FACE_Y, FACE_Z); head.add(fp);
      } catch (e) {}
    }
    if (style.hoops && head) {
      const hoopM = hookSnap(new THREE.MeshLambertMaterial({ color: 0xffffff, map: (window.PS2 && PS2.gritTint) ? PS2.gritTint(Math.random() < 0.6 ? 0xe7c25a : 0xdfe3ea) : null, emissive: 0x2a2a2a, emissiveIntensity: 0.3 }));
      [-1, 1].forEach(function (sx) {
        const h = new THREE.Mesh(new THREE.TorusGeometry(0.00042, 0.00008, 6, 12), hoopM);
        h.name = 'hoop'; h.position.set(sx * 0.00118, -0.00035, 0); h.rotation.y = Math.PI / 2; head.add(h);
      });
    }
    if (style.bandana && head) {
      const ban = new THREE.Mesh(new THREE.TorusGeometry(0.00095, 0.00028, 5, 10), hookSnap(new THREE.MeshLambertMaterial({ map: (function (c) { return paintBandana(c[0], c[1]); })(rnd([['#2E8B3E', '#F0F0E8'], ['#7A3FB0', '#F0E8F8'], ['#E0589A', '#FFFFFF'], ['#B01826', '#F0E8D8']])), color: 0xffffff })));
      ban.rotation.x = 1.2;
      ban.position.set(0, 0.00015, 0.0001);
      head.add(ban);
    }
    if (style.hat && head && typeof attachHatAndHair === 'function') {
      try { attachHatAndHair(wrap); } catch (e) {}
    }
  }
  function cloneGltf(gltf) {
    if (THREE.SkeletonUtils && THREE.SkeletonUtils.clone) return THREE.SkeletonUtils.clone(gltf.scene);
    return gltf.scene.clone(true);
  }
  function wrapScaled(obj, targetH) {
    const wrap = new THREE.Group(); wrap.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wrap);
    const size = box.getSize(new THREE.Vector3());
    const srcH = Math.max(size.y, 1e-4);
    let s = targetH / srcH;
    if (!isFinite(s) || s > 400) s = targetH / Math.max(srcH, 0.01);
    if (s < 0.01) s = targetH / srcH;
    wrap.scale.setScalar(s);
    wrap.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(wrap);
    wrap.position.y -= box2.min.y;
    wrap.updateMatrixWorld(true);
    const box3 = new THREE.Box3().setFromObject(wrap);
    const size3 = box3.getSize(new THREE.Vector3());
    if (size3.x > 6 || size3.y > 4 || size3.z > 6) {
      const cap = 3 / Math.max(size3.x, size3.y, size3.z, 0.001);
      wrap.scale.multiplyScalar(cap);
      wrap.updateMatrixWorld(true);
      const box4 = new THREE.Box3().setFromObject(wrap);
      wrap.position.y -= box4.min.y;
    }
    return wrap;
  }
  function makeHuman(key, kind, role) {
    const gltf = loaded[key];
    if (!gltf) return null;
    prepareChar(gltf.scene);
    const src = cloneGltf(gltf);
    tintChar(src, role || kind);
    const female = /^w/i.test(key || '');
    const wrap = wrapScaled(src, female ? 1.78 : 1.9);
    wrap.scale.x *= 1.0;
    wrap.scale.z *= 1.0;
    wrap.userData = { kind: kind || 'idle', role: role || src.userData.role, ph: Math.random() * 6.28, baseY: 0, binds: cacheBinds(wrap), key: key };
    attachSAAcc(wrap, src.userData && src.userData.outfit);
    if (window.PS2 && PS2.applyPS2Skin) PS2.applyPS2Skin(wrap, { role: wrap.userData.role });
    if (!window.BUCK_BONES) {
      window.BUCK_BONES = listBones(wrap);
      console.log('[BUCK bones]', window.BUCK_BONES);
    }
    bindAnims(src, wrap, kind || 'idle');
    if (!wrap.userData.mixer) poseHuman(wrap, wrap.userData.ph);
    return wrap;
  }
  function attachHatAndHair(charWrap) {
    const head = findBone(charWrap, 'Head');
    if (!head) return;
    hair.length = 0;
    const hat = new THREE.Group(); hat.name = 'hat';
    const leather = (window.PS2 && PS2.material) ? hookSnap(PS2.material('char_hat', 2, 2)) : mat(0xb08a5a);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.00025, 14), leather);
    brim.name = 'hat'; hat.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.00105, 0.00125, 0.0015, 10), leather);
    crown.name = 'hat'; crown.position.y = 0.0009; hat.add(crown);
    hat.position.y = 0.0022;
    head.add(hat);
    for (let i = 0; i < 6; i++) {
      const h = new THREE.Mesh(new THREE.PlaneGeometry(0.0009, 0.0075), new THREE.MeshLambertMaterial({ color: 0xffffff, map: (window.PS2 && PS2.gritTint) ? PS2.gritTint(0x3a2214) : null, side: THREE.DoubleSide }));
      h.position.set(-0.0012 + i * 0.0004, -0.001, 0.0012);
      h.rotation.x = 0.5; head.add(h); hair.push(h);
    }
  }
  function fitAt(obj, x, y, z, scale, rotY) {
    const wrap = new THREE.Group(); wrap.add(obj);
    if (scale) wrap.scale.setScalar(scale);
    wrap.rotation.y = rotY || 0;
    scene.add(wrap);
    wrap.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(wrap);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    // bottles use a large raw scale; everything else should stay under ~4m
    const cap = scale >= 10 ? 0.45 : 4.0;
    if (maxDim > cap && maxDim > 0) {
      wrap.scale.multiplyScalar(cap / maxDim);
      wrap.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(wrap);
    }
    wrap.position.set(x - (box.min.x + box.max.x) / 2, y - box.min.y, z - (box.min.z + box.max.z) / 2);
    return wrap;
  }
  function stainWood(root) {
    root.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      o.material = o.material.clone();
      o.material.color.multiply(new THREE.Color(0xc89a64));
      if (!o.material.map) o.material.map = makeTex('texWoodPlanks', 1, 1);
    });
  }
  function stainMetal(root) {
    root.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      o.material = o.material.clone();
      o.material.color.multiply(new THREE.Color(0x9aa0a6));
      if (!o.material.map) o.material.map = makeTex('texMetal', 1, 1);
    });
  }
  function stainLeather(root) {
    root.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      o.material = o.material.clone();
      o.material.color.multiply(new THREE.Color(0x6a3a28));
      if (!o.material.map) o.material.map = makeTex('texLeather', 1, 1);
    });
  }
  const tvScreens = [];
  function addTVScreen(tvWrap, color) {
    const box3 = new THREE.Box3().setFromObject(tvWrap);
    const size = box3.getSize(new THREE.Vector3());
    const mid = box3.getCenter(new THREE.Vector3());
    const c = document.createElement('canvas'); c.width = 128; c.height = 96;
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    const scr = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.72, size.y * 0.62, 0.02), new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff }));
    scr.position.copy(mid); scr.position.y = mid.y + size.y * 0.04;
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), tvWrap.rotation.y);
    scr.position.addScaledVector(fwd, size.z * 0.55);
    scene.add(scr);
    neon.push(scr);
    tvScreens.push({ canvas: c, ctx: c.getContext('2d'), tex: tex });
  }
  function paintTV(now) {
    tvScreens.forEach(function (tv, i) {
      const g = tv.ctx, W = tv.canvas.width, H = tv.canvas.height, t = now + i;
      if (Math.sin(t * 3 + i) > 0.2) {
        // rodeo graphic
        g.fillStyle = '#1a1008'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#e8c44a'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center';
        g.fillText('BUCK UP', W/2, 18);
        g.fillStyle = '#2a1a10'; g.beginPath(); g.ellipse(W/2, 58, 28, 16, 0, 0, 6.3); g.fill();
        g.fillStyle = '#f4f0e4';
        g.beginPath(); g.moveTo(W/2-12, 48); g.lineTo(W/2-22, 28); g.lineTo(W/2-6, 44); g.fill();
        g.beginPath(); g.moveTo(W/2+12, 48); g.lineTo(W/2+22, 28); g.lineTo(W/2+6, 44); g.fill();
        g.fillStyle = '#b4191d'; g.fillRect(0, H-12, W, 12);
      } else {
        const img = g.getImageData(0, 0, W, H), d = img.data;
        for (let p = 0; p < d.length; p += 4) {
          const v = 40 + Math.random()*80;
          d[p]=v; d[p+1]=v*0.7; d[p+2]=v*0.4; d[p+3]=255;
        }
        g.putImageData(img, 0, 0);
      }
      tv.tex.needsUpdate = true;
    });
  }
  function makePersonTex(key) {
    const t = makeTex(key, 1, 1);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.set(1, 1);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }
  const PHOTO_ASPECT = { pCowboy: 140/384, pBiker: 132/384, pTank: 114/384, pBartender: 124/384 };
  function makePhotoPerson(key, height) {
    if (!(window.BUCK_MODELS && BUCK_MODELS[key])) return null;
    const tex = makePersonTex(key);
    const matl = new THREE.MeshLambertMaterial({
      map: tex, color: 0xffffff, transparent: true, alphaTest: 0.3,
      side: THREE.DoubleSide, depthWrite: true
    });
    const h = height || 1.72;
    const w = h * (PHOTO_ASPECT[key] || 0.33);
    const wrap = new THREE.Group();
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matl);
    front.position.set(0, h / 2, 0.07);
    wrap.add(front);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matl);
    back.position.set(0, h / 2, -0.07);
    back.rotation.y = Math.PI;
    wrap.add(back);
    wrap.userData = { kind: 'idle', baseY: 0, photo: true, key: key };
    return wrap;
  }
  function giveBottle(person, side) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.2, 8), mat(0x245a28));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.06, 8), mat(0x245a28));
    neck.position.y = 0.12; b.add(neck);
    b.position.set((side || 1) * 0.22, 0.92, 0.1);
    b.rotation.z = (side || 1) * -0.15;
    person.add(b);
  }
  function crowdReact(kind) {
    const dur = kind === 'song' ? 3.6 : 2.2;
    const until = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000 + dur;
    function pump(p) {
      if (!p || !p.userData) return;
      p.userData.cheerUntil = until;
      if (p.userData.mixer && p.userData.actions) {
        playAct(p, 'cheer', true);
        return;
      }
      if (p.userData.binds) {
        if (!p.userData.prevKind) p.userData.prevKind = p.userData.kind || 'idle';
        p.userData.kind = 'cheer';
      }
    }
    crowd.forEach(pump);
    dancers.forEach(pump);
  }
  function onModelsReady() {
    const wKeys = ['wCasual', 'wFormal', 'wPunk', 'wSuit'].filter(k => loaded[k]);
    const mKeys = ['mCasual', 'mCasual2', 'mPunk', 'mSuit'].filter(k => loaded[k]);
    if (wKeys.length + mKeys.length === 0) { window.BUCK_READY = true; return; }
    wKeys.concat(mKeys).forEach(function (k) { if (loaded[k] && loaded[k].scene) prepareChar(loaded[k].scene); });

    const spots = crowd.map(p => ({ x: p.position.x, z: p.position.z, y: p.rotation.y }));
    crowd.slice().forEach(p => { scene.remove(p); const i = crowd.indexOf(p); if (i >= 0) crowd.splice(i, 1); });
    boxPeople.forEach(p => { if (p.parent) p.parent.remove(p); });
    boxPeople.length = 0;
    dancers.splice(0, dancers.length);
    function placeTextured(key, x, z, rotY) {
      if (!loaded[key]) return null;
      const src = loaded[key].scene.clone(true);
      convertMeshes(src, { roughness: 0.88, metalness: 0.02 });
      const wrap = wrapScaled(src, 1.72);
      wrap.position.x = x; wrap.position.z = z;
      if (rotY != null) wrap.rotation.y = rotY;
      else faceToward(wrap, 0, 0);
      wrap.userData = { kind: 'idle', ph: Math.random() * 6.28, baseY: wrap.position.y };
      scene.add(wrap); crowd.push(wrap);
      return wrap;
    }
    const westKeys = ['cowboy', 'cowgirl'].filter(function (k) { return loaded[k]; });
    let westUsed = 0;
    const n = Math.min(spots.length, 24);
    for (let i = 0; i < n; i++) {
      // at most two textured western figures in the mix; the rest are rigged and animated
      if (westKeys.length && westUsed < 2 && (i === 3 || i === 11)) {
        const p = placeTextured(westKeys[westUsed % westKeys.length], spots[i].x, spots[i].z);
        westUsed++;
        if (p) continue;
      }
      const female = Math.random() < 0.45 && wKeys.length;
      const key = female ? rnd(wKeys) : (mKeys.length ? rnd(mKeys) : rnd(wKeys));
      const kind = Math.random() < 0.4 ? 'dance' : 'idle';
      const p = makeHuman(key, kind);
      if (!p) continue;
      p.position.x = spots[i].x; p.position.z = spots[i].z;
      faceToward(p, 0, 0);
      p.userData.baseY = p.position.y;
      scene.add(p); crowd.push(p);
    }
    // packed rowdy crowd pressed up against the bar, facing the dancers
    for (let x = -6.4; x <= 6.4; x += 0.9) {
      if (Math.abs(x) < 0.3) continue;
      const female = Math.random() < 0.5 && wKeys.length;
      const key = female ? rnd(wKeys) : (mKeys.length ? rnd(mKeys) : rnd(wKeys));
      const p = makeHuman(key, Math.random() < 0.55 ? 'dance' : 'idle');
      if (!p) continue;
      p.position.set(x, 0, -8.15);
      p.rotation.set(0, Math.PI, 0);
      p.userData.baseY = p.position.y;
      scene.add(p); crowd.push(p);
    }
    // women dancing on the bar top
    dancers.splice(0, dancers.length);
    [-5.1, -1.7, 1.7, 5.1].forEach(function (x) {
      const d = makeHuman(wKeys.length ? rnd(wKeys) : rnd(mKeys), 'dance');
      if (!d) return;
      d.position.set(x, d.position.y + 1.16, -9.5);
      d.userData.baseY = d.position.y;
      d.rotation.set(0, 0, 0);
      scene.add(d); dancers.push(d);
    });
    // bartender behind the bar, facing the room
    if (wKeys.length || mKeys.length) {
      const barkeep = makeHuman(mKeys.length ? rnd(mKeys) : rnd(wKeys), 'idle', 'bartender');
      if (barkeep) {
        barkeep.position.set(-1.4, barkeep.position.y, -9.85);
        barkeep.userData.baseY = barkeep.position.y;
        barkeep.userData.role = 'bartender';
        barkeep.rotation.set(0, 0, 0);
        scene.add(barkeep); crowd.push(barkeep);
      }
    }
    // rider kept in the scene but hidden — first-person ride never shows them
    if (wKeys.length) {
      if (rider && rider.parent) rider.parent.remove(rider);
      const rideKey = loaded.wCasual ? 'wCasual' : (loaded.wPunk ? 'wPunk' : wKeys[0]);
      const r = makeHuman(rideKey, 'ride');
      if (r) {
        attachHatAndHair(r);
        r.position.set(0, 0.42, 0.08);
        r.rotation.set(0, 0, 0);
        r.scale.multiplyScalar(0.88);
        poseAstride(r);
        r.userData.kind = 'ride';
        r.userData.baseY = 0.42;
        r.visible = false;
        bull.add(r);
        rider = r;
      }
    }
    if (rider) rider.visible = false;

    // compose a mechanical rodeo bull from the textured/vertex-coloured bull
    // model plus the chrome post, saddle and pit already in the scene
    (function mountMechBull() {
      const srcGltf = loaded.bull;
      if (!srcGltf) return;
      try {
        const src = cloneGltf(srcGltf);
        convertMeshes(src, { roughness: 0.75, metalness: 0.05 });
        // keep the GLB's own hide / muzzle / horn colours — do not wash it into a red blob
        src.traverse(function (o) {
          if (!o.isMesh || !o.material) return;
          const list = Array.isArray(o.material) ? o.material : [o.material];
          list.forEach(function (m) {
            const n = ((m.name || '') + ' ' + (o.name || '')).toLowerCase();
            if (/horn/.test(n)) {
              m.map = (window.PS2 && PS2.gritTint) ? PS2.gritTint(0xe8d8b0) : m.map;
              m.color.set(0xffffff);
            } else if (/muzzle|nose|snout/.test(n)) {
              m.map = (window.PS2 && PS2.textures) ? PS2.cloneTex(PS2.textures.char_leather, 2, 2) : m.map;
              m.color.set(0x6a4a32);
            } else if (/hoof|hoove/.test(n)) {
              m.map = (window.PS2 && PS2.textures) ? PS2.cloneTex(PS2.textures.char_leather, 2, 2) : m.map;
              m.color.set(0x3a2a18);
            } else if (/eye.?white|eye_white/.test(n)) {
              m.map = (window.PS2 && PS2.gritTint) ? PS2.gritTint(0xf0ece4) : m.map;
              m.color.set(0xffffff);
            } else if (/eye/.test(n)) {
              m.map = (window.PS2 && PS2.gritTint) ? PS2.gritTint(0x0a0806) : m.map;
              m.color.set(0xffffff);
            } else if (/light/.test(n)) {
              m.map = (window.PS2 && PS2.gritTint) ? PS2.gritTint(0x4a3a28) : m.map;
              m.color.set(0xffffff);
            } else {
              m.map = (window.PS2 && PS2.textures) ? PS2.cloneTex(PS2.textures.bull_cowhide || PS2.textures.char_leather_dark, 2, 1) : m.map;
              m.color.set(0xffffff);
              // the GLB's own UVs are tiny palette islands (one texel = flat colour), so wrap the hide
              // around the body instead: u along the longest axis, v mirrored around it (no seam). Visual only.
              try {
                const geo = o.geometry;
                if (geo && geo.attributes && geo.attributes.position && !geo.userData.cowUV) {
                  geo.userData.cowUV = true;
                  geo.computeBoundingBox();
                  const bb = geo.boundingBox, pa = geo.attributes.position;
                  const ext = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
                  const ax = ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : (ext[1] >= ext[2] ? 1 : 2);
                  const b1 = (ax + 1) % 3, b2 = (ax + 2) % 3;
                  const mn = [bb.min.x, bb.min.y, bb.min.z], mx = [bb.max.x, bb.max.y, bb.max.z];
                  const c1 = (mn[b1] + mx[b1]) / 2, c2 = (mn[b2] + mx[b2]) / 2;
                  const uvs = new Float32Array(pa.count * 2);
                  for (let vi = 0; vi < pa.count; vi++) {
                    const pv = [pa.getX(vi), pa.getY(vi), pa.getZ(vi)];
                    let ang = Math.atan2(pv[b1] - c1, pv[b2] - c2) - 2.0;
                    if (ang < -Math.PI) ang += Math.PI * 2;
                    uvs[vi * 2] = (pv[ax] - mn[ax]) / (ext[ax] || 1);
                    uvs[vi * 2 + 1] = Math.abs(ang) / Math.PI;
                  }
                  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
                }
              } catch (e) { console.error('BUCK cowhide uv', e && (e.stack || e)); }
            }
            m.needsUpdate = true;
          });
          o.castShadow = false;
          o.receiveShadow = false;
        });
        // tuck the standing legs up under the belly so it reads as a machine, not livestock
        function tuck(name, rx, ry, rz) {
          const b = findBone(src, name);
          if (!b) return;
          if (b.userData && b.userData.bindQ) b.quaternion.copy(b.userData.bindQ);
          if (rx) b.rotateX(rx);
          if (ry) b.rotateY(ry);
          if (rz) b.rotateZ(rz);
        }
        cacheBinds(src);
        // hide standing legs and tail; the procedural padded nubs stay as machine feet
        src.traverse(function (o) {
          const n = (o.name || '').toLowerCase().replace(/[._\s-]/g, '');
          if (/leg|tail|hoof|poletarget|ikfront|ikback|ffb\b|^ff[lr]/.test(n)) {
            o.scale.setScalar(0.001);
          }
        });
        flushPose(src);
        const wrap = new THREE.Group(); wrap.add(src);
        src.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(wrap);
        const size = box.getSize(new THREE.Vector3());
        const mid = box.getCenter(new THREE.Vector3());
        // aim for ~1.85m long body sitting on the hydraulic joint
        const s = 1.85 / Math.max(size.z, size.x, 0.01);
        wrap.scale.setScalar(s);
        wrap.rotation.y = Math.PI; // model typically faces +Z; machine head is -Z
        wrap.updateMatrixWorld(true);
        const box2 = new THREE.Box3().setFromObject(wrap);
        const mid2 = box2.getCenter(new THREE.Vector3());
        wrap.position.x -= mid2.x;
        wrap.position.z -= mid2.z;
        wrap.position.y += (1.12 - mid2.y);
        bull.add(wrap);
        // hide the procedural flesh so the model + saddle + post read as one machine
        torso.visible = false; hump.visible = false; neck.visible = false;
        headG.visible = false; tail.visible = false;
      } catch (err) { console.error('BUCK mechBull', err && (err.stack || err)); }
    })();

    // furniture
    function inst(key, x, y, z, s, rotY, stain) {
      if (!loaded[key]) return;
      const obj = loaded[key].scene.clone(true);
      if (stain) stain(obj);
      convertMeshes(obj, { roughness: 1, metalness: 0 });
      if (window.PS2 && PS2.applyPS2Skin) PS2.applyPS2Skin(obj, { role: key });
      const placed = fitAt(obj, x, y, z, s, rotY);
      let slot = key;
      if (/^stool/i.test(key)) slot = 'stool';
      else if (/^tv/i.test(key)) slot = 'tv';
      else if (/^lamp/i.test(key)) slot = 'lamp';
      else if (/^sofa/i.test(key)) slot = 'sofa';
      else if (/^bookcase/i.test(key)) slot = 'bookcase';
      else if (/^coat/i.test(key)) slot = 'coatrack';
      else if (/^speaker/i.test(key)) slot = 'speaker';
      if (placed) { placed.name = placed.name || key; registerItch('bar', slot, placed); }
      return placed;
    }
    // tall metal stools along the bar
    for (let i = 0; i < 8; i++) {
      const x = -6.5 + i * 1.85;
      inst(i % 2 ? 'stoolBar' : 'stoolBarSquare', x, 0, -8.35, 2.0, Math.random() * 0.4, stainMetal);
    }
    // bottle clusters on the back shelves
    if (loaded.bottles) {
      for (let s = 0; s < 3; s++) {
        for (let k = 0; k < 6; k++) {
          const obj = loaded.bottles.scene.clone(true);
          registerItch('bar', 'bottle', fitAt(obj, -5.5 + k * 2.15, 1.5 + s * 0.9, -11.35, 22, (k % 2) * 0.4));
        }
      }
    } else {
      const BOTTLES = [0x2f6b2f, 0x7a3a10, 0xc89a40, 0x6a1010, 0xdddddd];
      for (let s = 0; s < 3; s++) {
        box(14, 0.08, 0.6, mat(0x4a2510), 0, 1.6 + s * 0.9, -11.5);
        for (let x = -6.8; x < 6.8; x += 0.35) box(0.15, 0.45, 0.15, mat(rnd(BOTTLES)), x, 1.88 + s * 0.9, -11.5);
      }
    }
    inst('bookcaseOpen', -11.2, 0, -8.2, 2.4, Math.PI / 2, stainWood);
    inst('bookcaseClosed', 11.2, 0, -8.2, 2.4, -Math.PI / 2, stainWood);
    const tv1 = inst('tvModern', -11.55, 3.4, 0, 2.4, Math.PI / 2, stainMetal);
    if (tv1) addTVScreen(tv1, 0x3ad0ff);
    const tv2 = inst('tvVintage', 11.55, 3.5, 2, 2.2, -Math.PI / 2, stainMetal);
    if (tv2) addTVScreen(tv2, 0xff6a3a);
    const tv3 = inst('tvAntenna', 0, 4.0, -11.55, 2.0, 0, stainMetal);
    if (tv3) addTVScreen(tv3, 0x7dff6a);
    inst('lampCeiling', -4, 6.55, -4, 3, 0, stainMetal);
    inst('lampCeiling', 4, 6.55, 3, 3, 0, stainMetal);
    inst('lampCeiling', -2, 6.55, 5, 3, 0, stainMetal);
    inst('lampWall', -11.7, 3.2, -6, 2.4, Math.PI / 2, stainMetal);
    inst('speaker', -11.0, 0, 6, 2.2, Math.PI / 2, stainMetal);
    inst('speaker', 11.0, 0, 6, 2.2, -Math.PI / 2, stainMetal);
    inst('sofaLong', -8.5, 0, 8.5, 2.3, Math.PI * 0.15, stainLeather);
    inst('sofa', 8.8, 0, 8.2, 2.3, -Math.PI * 0.2, stainLeather);
    inst('coatRack', -11.0, 0, 2.5, 2.2, Math.PI / 2, stainWood);
    inst('plant', 10.6, 0, -6, 2.2, 0);
    inst('radio', 6, 1.22, -9.3, 2.0, 0, stainWood);
    if (bull) registerItch('bar', 'bull', bull);
    if (typeof neon !== 'undefined') neon.forEach(function (n) { registerItch('bar', 'sign', n); });
    crowd.forEach(function (p) { registerItch('characters', p.userData && p.userData.role === 'bartender' ? 'bartender' : 'crowd', p); });
    dancers.forEach(function (p) { registerItch('characters', 'dancer', p); });
    if (window.PS2 && PS2.applyPS2Skin) {
      PS2.applyPS2Skin(scene);
      PS2.disableShadows(scene, renderer);
      crowd.forEach(function (p) { PS2.trackBlob(p, 0.48); });
      dancers.forEach(function (p) { PS2.trackBlob(p, 0.42); });
      if (bull) PS2.trackBlob(bull, 0.7);
    }
    if (window.PS2 && PS2.countUntextured) {
      const v = PS2.countUntextured(scene);
      window.BUCK_PS2_VERIFY = v;
      console.log('[PS2] meshes', v.total, 'untextured', v.untextured, v.missing.slice(0, 12));
    }
    window.BUCK_READY = true;
  }
  function parseAll() {
    if (!window.BUCK_MODELS || typeof THREE.GLTFLoader !== 'function') return;
    const keys = Object.keys(BUCK_MODELS).filter(k => k.indexOf('tex') !== 0);
    let left = keys.length, started = false;
    if (!keys.length) return;
    const loader = new THREE.GLTFLoader();
    keys.forEach(function (key) {
      try {
        loader.parse(b64ToBuf(BUCK_MODELS[key]), '', function (gltf) {
          loaded[key] = gltf;
          if (--left <= 0 && !started) { started = true; try { onModelsReady(); } catch (e) { /* keep box fallback */ } }
        }, function () {
          if (--left <= 0 && !started) { started = true; try { onModelsReady(); } catch (e) {} }
        });
      } catch (e) {
        if (--left <= 0 && !started) { started = true; try { onModelsReady(); } catch (err) {} }
      }
    });
  }
  parseAll();
  setTimeout(function () { if (!window.BUCK_READY) window.BUCK_READY = true; }, 8000);

  // CC BY Sketchfab extras: far-back still figures + farm outside the +Z door.
  // Not itch crowd slots (those stay on the animated Quaternius set).
  function loadCCBackgrounds() {
    const pack = window.BUCK_CC_MODELS;
    if (!pack || typeof THREE.GLTFLoader !== 'function') return;
    const loader = new THREE.GLTFLoader();
    const placed = {};
    function parseKey(key, fn) {
      const b64 = pack[key];
      if (!b64) return;
      try {
        loader.parse(b64ToBuf(b64), '', function (gltf) {
          try { fn(gltf.scene || gltf.scenes[0]); } catch (e) {}
        }, function () {});
      } catch (e) {}
    }
    function skin(obj) {
      obj.traverse(function (o) {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const out = mats.map(function (m) {
          if (!m) return m;
          const map = m.map || null;
          if (map) {
            map.magFilter = THREE.NearestFilter;
            map.minFilter = THREE.NearestFilter;
            map.generateMipmaps = false;
            if (THREE.sRGBEncoding) map.encoding = THREE.sRGBEncoding;
            map.needsUpdate = true;
          }
          const lamb = new THREE.MeshLambertMaterial({
            map: map,
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: !!m.transparent,
            opacity: (m.opacity != null) ? m.opacity : 1,
            alphaTest: m.alphaTest || 0,
            skinning: !!o.isSkinnedMesh
          });
          if (lamb.map) {
            lamb.map.magFilter = THREE.NearestFilter;
            lamb.map.minFilter = THREE.NearestFilter;
            lamb.map.generateMipmaps = false;
          }
          return lamb;
        });
        o.material = Array.isArray(o.material) ? out : out[0];
        o.castShadow = false;
        o.receiveShadow = false;
        if (o.isSkinnedMesh) o.frustumCulled = false;
      });
    }
    function fitAt(obj, x, y, z, targetSpan, axis) {
      const wrap = new THREE.Group();
      wrap.add(obj);
      scene.add(wrap);
      wrap.updateMatrixWorld(true);
      wrap.traverse(function (o) {
        if (o.isSkinnedMesh && o.skeleton) { o.skeleton.update(); o.frustumCulled = false; }
      });
      if (typeof flushPose === 'function') { try { flushPose(wrap); } catch (e) {} }
      wrap.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(wrap);
      const size = new THREE.Vector3();
      box.getSize(size);
      const span = axis === 'y' ? size.y : size[axis];
      const sc = span > 0.01 ? targetSpan / span : 1;
      wrap.scale.setScalar(sc);
      wrap.updateMatrixWorld(true);
      box.setFromObject(wrap);
      wrap.position.x += x - (box.min.x + box.max.x) / 2;
      wrap.position.y += y - box.min.y;
      wrap.position.z += z - (box.min.z + box.max.z) / 2;
      wrap.updateMatrixWorld(true);
      return wrap;
    }
    function recenterCC(wrap, x, y, z) {
      wrap.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(wrap);
      wrap.position.x += x - (box.min.x + box.max.x) / 2;
      wrap.position.y += y - box.min.y;
      wrap.position.z += z - (box.min.z + box.max.z) / 2;
      wrap.updateMatrixWorld(true);
    }
    parseKey('farm', function (obj) {
      skin(obj);
      // Sit on the desert just outside the +Z door, in front of the sky plane at z=28.
      const w = fitAt(obj, -30, 0, 46, 7.5, 'y');
      w.name = 'ccFarm';
      placed.farm = w;
    });
    parseKey('cowboy', function (obj) {
      skin(obj);
      const w = fitAt(obj, -10.0, 0, 10.0, 1.74, 'y');
      w.name = 'ccCowboy';
      faceToward(w, 0, 0);
      recenterCC(w, -10.0, 0, 10.0);
      if (window.PS2 && PS2.trackBlob) PS2.trackBlob(w, 0.45);
      placed.cowboy = w;
    });
    parseKey('summer', function (obj) {
      skin(obj);
      const w = fitAt(obj, 10.0, 0, 9.8, 1.70, 'y');
      w.name = 'ccSummer';
      faceToward(w, 0, 0);
      recenterCC(w, 10.0, 0, 9.8);
      if (window.PS2 && PS2.trackBlob) PS2.trackBlob(w, 0.45);
      placed.summer = w;
    });
    parseKey('npc', function (obj) {
      skin(obj);
      const w = fitAt(obj, 8.2, 0, 10.0, 1.72, 'y');
      w.name = 'ccNpc';
      faceToward(w, 0, 2);
      recenterCC(w, 8.2, 0, 10.0);
      if (window.PS2 && PS2.trackBlob) PS2.trackBlob(w, 0.45);
      placed.npc = w;
    });
    window.BUCK_CC_GROUPS = placed;
    window.BUCK_CC_READY = true;
  }

  loadCCBackgrounds();

  // Quaternius Cyberpunk Signs (CC0) on the existing wall-poster spots.
  // Atlas uses generic OPEN/SHOP/pictograms and everyday Japanese words — no brand logos.
  function loadPropSigns() {
    const pack = window.BUCK_PROP_MODELS;
    if (!pack || !pack.signs || typeof THREE.GLTFLoader !== 'function') return;
    const loader = new THREE.GLTFLoader();
    try {
      loader.parse(b64ToBuf(pack.signs), '', function (gltf) {
        try {
          const root = gltf.scene || gltf.scenes[0];
          const picks = ['Sign_1', 'Sign_2', 'Sign_Corner_Hazard', 'Sign_4'];
          const spots = [
            { x: -10.45, y: 3.6, z: -4, ry: Math.PI / 2, w: 2.2 },
            { x: -10.45, y: 2.4, z: 2.2, ry: Math.PI / 2, w: 2.0 },
            { x: 10.45, y: 3.8, z: -3, ry: -Math.PI / 2, w: 2.2 },
            { x: 10.45, y: 2.5, z: 3, ry: -Math.PI / 2, w: 2.0 }
          ];
          const dbg = { placed: 0, sizes: [], err: null };
          function takeSign(name) {
            let node = null;
            root.traverse(function (o) { if (!node && o.name === name) node = o; });
            if (!node) return null;
            const wrap = new THREE.Group();
            const clone = node.clone(true);
            clone.position.set(0, 0, 0);
            clone.rotation.set(0, 0, 0);
            clone.scale.set(1, 1, 1);
            wrap.add(clone);
            wrap.updateMatrixWorld(true);
            const box = new THREE.Box3();
            const size = new THREE.Vector3();
            box.setFromObject(wrap);
            box.getSize(size);
            // Authored signs lie in XZ (Y nearly 0). Stand them up so the thin axis faces local Z, like a wall plane.
            if (size.y < size.x * 0.2 && size.y < size.z * 0.2) {
              clone.rotation.x = -Math.PI / 2;
            } else if (size.x < size.y * 0.2 && size.x < size.z * 0.2) {
              clone.rotation.z = Math.PI / 2;
            }
            wrap.updateMatrixWorld(true);
            box.setFromObject(wrap);
            const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2, cz = (box.min.z + box.max.z) / 2;
            clone.position.set(-cx, -cy, -cz);
            wrap.updateMatrixWorld(true);
            box.setFromObject(wrap);
            box.getSize(size);
            return { wrap: wrap, size: size };
          }
          spots.forEach(function (spot, i) {
            const got = takeSign(picks[i]);
            if (!got) return;
            const sc = spot.w / Math.max(got.size.x, got.size.y, 0.01);
            got.wrap.scale.setScalar(sc);
            got.wrap.position.set(spot.x, spot.y, spot.z);
            got.wrap.rotation.y = spot.ry;
            got.wrap.name = 'ccSign';
            got.wrap.traverse(function (o) {
              if (!o.isMesh) return;
              o.name = 'neonSign';
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              mats.forEach(function (m) {
                if (!m) return;
                if (m.map) {
                  m.map.magFilter = THREE.NearestFilter;
                  m.map.minFilter = THREE.NearestFilter;
                  m.map.generateMipmaps = false;
                  m.map.needsUpdate = true;
                  m.emissiveMap = m.map;
                }
                m.emissive = new THREE.Color(0xff8a3a);
                m.emissiveIntensity = 0.55;
                m.side = THREE.DoubleSide;
                m.userData.ps2KeepMap = true;
              });
              o.userData.ps2KeepMap = true;
            });
            scene.add(got.wrap);
            dbg.placed += 1;
            dbg.sizes.push([+got.size.x.toFixed(3), +got.size.y.toFixed(3), +got.size.z.toFixed(3)]);
            if (window.PS2 && PS2.applyPS2Skin) {
              try { PS2.applyPS2Skin(got.wrap); } catch (e) {}
            }
          });
          scene.traverse(function (o) { if (o.name === 'wallPoster') o.visible = false; });
          window.BUCK_PROP_DEBUG = dbg;
        } catch (e) { window.BUCK_PROP_DEBUG = { err: String(e && e.message || e) }; }
      }, function (err) { window.BUCK_PROP_DEBUG = { err: 'parse ' + String(err && err.message || err) }; });
    } catch (e) { window.BUCK_PROP_DEBUG = { err: 'throw ' + String(e && e.message || e) }; }
  }
  loadPropSigns();



  const _bBox = new THREE.Box3();
  const _bSize = new THREE.Vector3();
  function boundsOf(obj) {
    if (!obj) return null;
    _bBox.setFromObject(obj);
    _bBox.getSize(_bSize);
    return { min: [+_bBox.min.x.toFixed(2), +_bBox.min.y.toFixed(2), +_bBox.min.z.toFixed(2)], max: [+_bBox.max.x.toFixed(2), +_bBox.max.y.toFixed(2), +_bBox.max.z.toFixed(2)], size: [+_bSize.x.toFixed(2), +_bSize.y.toFixed(2), +_bSize.z.toFixed(2)] };
  }
  function captureDebug(mode) {
    const d = {
      mode: mode,
      cam: [+camera.position.x.toFixed(2), +camera.position.y.toFixed(2), +camera.position.z.toFixed(2)],
      near: camera.near,
      floorY: 0,
      room: { min: [-12, 0, -12], max: [12, 7, 12] },
      bull: boundsOf(bull),
      crowd0: boundsOf(crowd[0]),
      insideRoom: camera.position.y >= 0.2 && camera.position.y <= 6.8 && Math.abs(camera.position.x) < 11.7 && Math.abs(camera.position.z) < 11.7
    };
    window.BUCK_CAM = d;
    return d;
  }

  function keepCamInRoom() {
    camera.position.x = Math.max(-10.6, Math.min(10.6, camera.position.x));
    camera.position.z = Math.max(-10.6, Math.min(10.6, camera.position.z));
    camera.position.y = Math.max(0.45, Math.min(6.4, camera.position.y));
  }
  function hideRider() { if (rider) rider.visible = false; }
  function finiteOr(n, d) { return typeof n === 'number' && isFinite(n) ? n : d; }
  function guardCam() {
    if (!isFinite(camera.position.x) || !isFinite(camera.position.y) || !isFinite(camera.position.z) || !isFinite(camera.rotation.x) || !isFinite(camera.rotation.y) || !isFinite(camera.rotation.z)) {
      camera.position.set(0, 1.7, 5);
      camera.rotation.set(-0.15, 0, 0);
    }
    if (bull && (!isFinite(bull.rotation.x) || !isFinite(bull.rotation.y))) bull.rotation.set(0, 0, 0);
  }
  function safeRender() {
    if (glLost) return false;
    try {
      guardCam();
      if (window.PS2 && PS2.updateBlobs) PS2.updateBlobs();
      if (composer) composer.render();
      else renderer.render(scene, camera);
      return true;
    } catch (err) {
      console.error('BUCK render', err && (err.stack || err));
      try { disposeComposer(); renderer.render(scene, camera); return true; } catch (e2) { return false; }
    }
  }

  window.scene3d = {
    canvas: renderer.domElement,
    ride(time, yaw, pitch, bob, level, fx) {
      fx = fx || {};
      hideRider();
      const pit = Math.max(-0.38, Math.min(0.38, pitch || 0));
      bull.rotation.set(pit * 0.58, yaw, (fx.roll || 0) * 0.28);
      bull.updateMatrixWorld(true);
      const sh = fx.shake || 0;
      const intensity = fx.intensity || 0;
      // eye just behind the saddle, looking down -Z at the head, horns and grip in the lower frame
      bull.localToWorld(tmp.set(
        (Math.random() - 0.5) * sh * 0.005,
        rideEye.y + (bob || 0) + (Math.random() - 0.5) * sh * 0.005,
        rideEye.z
      ));
      const yMin = rideEye.y - 0.22, yMax = rideEye.y + 0.28;
      if (tmp.y < yMin) tmp.y = yMin;
      if (tmp.y > yMax) tmp.y = yMax;
      camera.position.copy(tmp);
      const drunk = Math.max(0, intensity - 0.4);
      const roll = (fx.roll || 0) * 0.85 + (Math.random() - 0.5) * sh * 0.008 + Math.sin(time * 18) * intensity * 0.02 + Math.sin(time * 1.15) * drunk * 0.055;
      const jYaw = (Math.random() - 0.5) * sh * 0.006 + Math.sin(time * 11) * intensity * 0.015 + Math.sin(time * 0.7) * drunk * 0.035;
      const jPit = (Math.random() - 0.5) * sh * 0.006 + Math.sin(time * 15) * intensity * 0.018 + Math.cos(time * 0.55) * drunk * 0.028;
      camera.rotation.set(rideEye.pitch + pit + jPit, yaw + jYaw, roll);
      camera.updateMatrixWorld();
      if (warpPass) { warpPass.uniforms.amount.value = intensity * 0.42; warpPass.uniforms.time.value = time; }
      animate(time, level);
      updateJunk(time);
      keepCamInRoom();
      captureDebug('ride');
      safeRender();
    },
    shot(i, p, time) {
      try {
      hideRider();
      if (i === 2) bull.rotation.set(Math.sin(time * 2.2) * 0.10, 0.12, Math.sin(time * 1.8) * 0.06);
      else bull.rotation.set(Math.sin(time * 3) * 0.12, Math.sin(time * 1.5) * 0.8, Math.sin(time * 2.3) * 0.1);
      if (bullSpot) bullSpot.intensity = 0;
      if (i === 0) {
        // street drift, then a glide in to THE BITTER BLONDE: buckle sign first, then tilt down to the doors
        const k = Math.min(1, Math.max(0, (p - 0.34) / 0.66)), e = k * k * (3 - 2 * k), e2 = Math.min(1, Math.max(0, (k - 0.55) / 0.45)), f = e2 * e2 * (3 - 2 * e2);
        const sx = 24 - p * 4, sz = 33.5, lx = -10, ly = 3.6 + p * 0.4, lz = 21 - p * 2;
        const tx = 0.0 + Math.sin(p * 3) * 0.3, ty = 1.75, tz = 21.5;
        camera.position.set(sx + (tx - sx) * e, 1.6 + (ty - 1.6) * e, sz + (tz - sz) * e);
        const gx = lx + (0 - lx) * e, gy = ly + (7.4 - ly) * e, gz = lz + (12.6 - lz) * e;
        camera.lookAt(gx, gy + (3.2 - 7.4) * f * e, gz);
      }
      else if (i === 1) { camera.position.set(-9.8 + p * 3, 1.75, 8.5); camera.lookAt(-2 + p * 9, 1.9, -4); }
      else if (i === 2) { camera.position.set(3.25, 1.45, -0.55); camera.lookAt(0, 1.10, -0.20); }
      else {
        // TONIGHT, SHE RIDES. — empty saddle, dramatic light, no rider
        bull.rotation.set(0.06, 0.45, -0.05);
        camera.position.set(2.3, 2.0, 2.1);
        camera.lookAt(0, 1.3, 0);
        if (bullSpot) {
          bullSpot.intensity = 2.1;
          bullSpot.position.set(2.6, 4.4, 2.8);
          bullSpot.target.position.set(0, 1.28, 0);
          bullSpot.target.updateMatrixWorld();
        }
      }
      if (camera.position.y < 1.2) camera.position.y = 1.2;
      if (i !== 0) keepCamInRoom();
      if (warpPass) { warpPass.uniforms.amount.value = 0; }
      animate(time, 3);
      captureDebug('shot' + i);
      safeRender();
      } catch (err) { console.error('BUCK shot', err && (err.stack || err)); }
    },
    peopleClose() {
      try {
      hideRider();
      const p = crowd[2] || crowd[0];
      if (!p) return;
      const dir = new THREE.Vector3(-p.position.x, 0, -p.position.z).normalize();
      camera.position.set(p.position.x + dir.x * 1.5, 1.52, p.position.z + dir.z * 1.5);
      camera.lookAt(p.position.x, 1.42, p.position.z);
      keepCamInRoom();
      animate(performance.now() / 1000, 2);
      captureDebug('people');
      safeRender();
      } catch (err) { console.error('BUCK peopleClose', err && (err.stack || err)); }
    },
    idle(time) {
      try {
      hideRider();
      if (window.BUCK_CC_SHOT) {
        camera.position.set(0, 1.9, -8.2);
        camera.lookAt(0, 1.45, 14);
        keepCamInRoom();
        if (warpPass) { warpPass.uniforms.amount.value = 0; }
        animate(time, 2);
        captureDebug('cc-shot');
        safeRender();
        return;
      }
      if (bullSpot) bullSpot.intensity = 0;
      bull.rotation.set(Math.sin(time * 1.4) * 0.08, 0.08, Math.sin(time * 1.1) * 0.04);
      // stay on a 3/4 side arc so the elongated silhouette always reads
      const a = Math.PI * 0.48 + Math.sin(time * 0.15) * 0.16;
      camera.position.set(Math.sin(a) * 5.8, 2.15, Math.cos(a) * 5.8);
      camera.lookAt(0, 1.85, -0.1);
      keepCamInRoom();
      if (warpPass) { warpPass.uniforms.amount.value = 0; }
      animate(time, 2);
      captureDebug('idle');
      safeRender();
      } catch (err) { console.error('BUCK idle', err && (err.stack || err)); }
    },
    debugInfo: function () { return window.BUCK_CAM || null; },
    spawnJunk: spawnJunk,
    forceSmash: forceSmash,
    consumeHits: consumeHits,
    clearJunk: clearJunk,
    crowdReact: crowdReact,
    setMood: setMood,
    itchSlots: itchSlots,
    isLost: function () { return glLost; },
    forceLose: function () {
      const gl = renderer.getContext();
      const ext = gl && gl.getExtension('WEBGL_lose_context');
      if (ext) { ext.loseContext(); return true; }
      return false;
    },
    forceRestore: function () {
      const gl = renderer.getContext();
      const ext = gl && gl.getExtension('WEBGL_lose_context');
      if (ext) { ext.restoreContext(); return true; }
      return false;
    }
  };
})();
