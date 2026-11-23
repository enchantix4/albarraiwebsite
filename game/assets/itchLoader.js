// BUCK UP — itch.io hot-swap loader (file:// safe, no ES modules, no directory listing).
// Reads window.ITCH_MANIFEST + window.ITCH_MODELS (from assets/itch_incoming/).
// Empty manifest or a failed load leaves the current visuals in place.
(function () {
  function slots() {
    return (window.scene3d && scene3d.itchSlots) || window.BUCK_ITCH_SLOTS || { bar: {}, characters: [], vehicles: [] };
  }

  function extOf(path) {
    const m = /\.([a-z0-9]+)$/i.exec(path || '');
    return m ? m[1].toLowerCase() : '';
  }

  function stemOf(path) {
    const base = String(path || '').split('/').pop() || '';
    return base.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[\s_]+/g, '-');
  }

  function b64ToBuf(s) {
    const bin = atob(s);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }

  function loadEmbedded(path) {
    return new Promise(function (resolve, reject) {
      const models = window.ITCH_MODELS || {};
      const raw = models[path];
      if (!raw) { reject(new Error('not embedded: ' + path)); return; }
      const buf = b64ToBuf(raw);
      const ext = extOf(path);
      try {
        if (ext === 'fbx') {
          if (typeof THREE.FBXLoader !== 'function') { reject(new Error('FBXLoader unavailable')); return; }
          const obj = new THREE.FBXLoader().parse(buf, '');
          obj.userData.itchAnimations = obj.animations || [];
          resolve(obj);
          return;
        }
        if (typeof THREE.GLTFLoader !== 'function') { reject(new Error('GLTFLoader unavailable')); return; }
        new THREE.GLTFLoader().parse(buf, '', function (gltf) {
          const obj = gltf.scene || gltf.scenes[0];
          obj.userData.itchAnimations = gltf.animations || [];
          resolve(obj);
        }, function (err) { reject(err || new Error('parse failed')); });
      } catch (e) { reject(e); }
    });
  }

  function loadUrl(path) {
    return new Promise(function (resolve, reject) {
      const url = 'assets/itch_incoming/' + path;
      const ext = extOf(path);
      try {
        if (ext === 'fbx') {
          if (typeof THREE.FBXLoader !== 'function') { reject(new Error('FBXLoader unavailable')); return; }
          new THREE.FBXLoader().load(url, function (obj) {
            obj.userData.itchAnimations = obj.animations || [];
            resolve(obj);
          }, undefined, function (err) { reject(err); });
          return;
        }
        if (typeof THREE.GLTFLoader !== 'function') { reject(new Error('GLTFLoader unavailable')); return; }
        new THREE.GLTFLoader().load(url, function (gltf) {
          const obj = gltf.scene || gltf.scenes[0];
          obj.userData.itchAnimations = gltf.animations || [];
          resolve(obj);
        }, undefined, function (err) { reject(err); });
      } catch (e) { reject(e); }
    });
  }

  function loadModel(path) {
    const models = window.ITCH_MODELS || {};
    if (models[path]) return loadEmbedded(path);
    return loadUrl(path).catch(function () { return loadEmbedded(path); });
  }

  function hideFallback(target) {
    target.traverse(function (o) {
      if (o.userData && o.userData.itchSwap) return;
      if (o.isMesh || o.isSkinnedMesh) {
        o.userData.itchWasVisible = o.visible;
        o.visible = false;
      }
    });
  }


  const itchMixers = [];
  window.BUCK_ITCH_MIXERS = itchMixers;
  let mixerRaf = 0, mixerLast = 0;
  function tickMixers(now) {
    const t = now * 0.001;
    const dt = mixerLast ? Math.min(0.05, t - mixerLast) : 0.016;
    mixerLast = t;
    for (let i = 0; i < itchMixers.length; i++) itchMixers[i].update(dt);
    mixerRaf = requestAnimationFrame(tickMixers);
  }
  function clipKind(name) {
    const n = String(name || '');
    if (/dance/i.test(n)) return 'dance';
    if (/wave|interact|clap|cheer|yes/i.test(n)) return 'cheer';
    if (/gun|sword/i.test(n)) return null;
    if (/idle_neutral|female_idle|female_standing|female_sitting|Idle$|idle$/i.test(n)) return 'idle';
    return null;
  }
  function pickClip(anims, role) {
    const bags = { idle: [], cheer: [], dance: [] };
    anims.forEach(function (c) {
      const k = clipKind(c.name);
      if (k) bags[k].push(c);
    });
    let pool;
    if (role === 'dancer') pool = bags.dance.concat(bags.cheer).concat(bags.idle);
    else pool = bags.idle.concat(bags.cheer).concat(bags.dance);
    if (!pool.length) pool = anims.slice();
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function playItchAnim(obj, target) {
    const anims = (obj.userData && obj.userData.itchAnimations) || obj.animations || [];
    if (!anims.length || typeof THREE.AnimationMixer !== 'function') return false;
    const role = (target && target.userData && (target.userData.itchName || target.userData.role)) || '';
    const clip = pickClip(anims, role);
    if (!clip) return false;
    const mixer = new THREE.AnimationMixer(obj);
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    const dur = clip.duration || 1;
    action.time = Math.random() * dur;
    itchMixers.push(mixer);
    if (!mixerRaf) mixerRaf = requestAnimationFrame(tickMixers);
    return true;
  }

  function swapVisible(target, incoming) {
    if (!target || !incoming) return false;
    target.updateMatrixWorld(true);
    const oldBox = new THREE.Box3().setFromObject(target);
    if (oldBox.isEmpty()) return false;
    const oldSize = oldBox.getSize(new THREE.Vector3());
    const oldCenter = oldBox.getCenter(new THREE.Vector3());

    hideFallback(target);

    const wrap = new THREE.Group();
    wrap.userData.itchSwap = true;
    wrap.name = (target.name || 'itch') + '_swap';
    incoming.userData.itchSwap = true;
    wrap.add(incoming);
    incoming.position.set(0, 0, 0);
    incoming.rotation.set(0, 0, 0);
    incoming.scale.set(1, 1, 1);
    target.add(wrap);
    wrap.updateMatrixWorld(true);

    const nBox = new THREE.Box3().setFromObject(incoming);
    if (nBox.isEmpty()) { target.remove(wrap); return false; }
    const nSize = nBox.getSize(new THREE.Vector3());
    const sc = Math.max(oldSize.x, oldSize.y, oldSize.z) / Math.max(nSize.x, nSize.y, nSize.z, 1e-4);
    if (!isFinite(sc) || sc <= 0) { target.remove(wrap); return false; }
    wrap.scale.setScalar(sc);
    wrap.updateMatrixWorld(true);
    const nBox2 = new THREE.Box3().setFromObject(incoming);
    const nCenter = nBox2.getCenter(new THREE.Vector3());
    const a = oldCenter.clone();
    const b = nCenter.clone();
    target.worldToLocal(a);
    target.worldToLocal(b);
    wrap.position.add(a.sub(b));

    if (window.PS2 && PS2.applyPS2Skin) {
      try { PS2.applyPS2Skin(incoming, { role: target.userData && target.userData.role }); } catch (e) {}
    }
    return true;
  }

  function barKeyFromStem(stem) {
    if (/^(counter|bar|bar-counter|bartop)$/.test(stem)) return 'counter';
    if (/^stool/.test(stem)) return 'stool';
    if (/^bottle/.test(stem)) return 'bottle';
    if (/^barrel/.test(stem)) return 'barrel';
    if (/^crate/.test(stem)) return 'crate';
    if (/^jukebox/.test(stem)) return 'jukebox';
    if (/^(pool|table|pooltable|pool-table)$/.test(stem)) return 'pool';
    if (/^sofa|^couch/.test(stem)) return 'sofa';
    if (/^plant/.test(stem)) return 'plant';
    if (/^radio/.test(stem)) return 'radio';
    if (/^speaker/.test(stem)) return 'speaker';
    if (/^lamp/.test(stem)) return 'lamp';
    if (/^bookcase|^shelf/.test(stem)) return 'bookcase';
    if (/^coat/.test(stem)) return 'coatrack';
    if (/^tv|^television/.test(stem)) return 'tv';
    if (/^sign|^neon/.test(stem)) return 'sign';
    if (/^ring|^bumper/.test(stem)) return 'ring';
    if (/^floor|^ground/.test(stem)) return 'floor';
    if (/^bull|^hide/.test(stem)) return 'bull';
    if (/^saloon|^interior|^room$/.test(stem)) return 'saloon';
    return stem;
  }

  function targetsForBar(key) {
    const s = slots();
    return (s.bar && s.bar[key]) || [];
  }

  function characterBuckets() {
    const list = slots().characters || [];
    const bartender = [];
    const dancers = [];
    const crowd = [];
    list.forEach(function (p) {
      const n = (p.userData && p.userData.itchName) || (p.userData && p.userData.role) || '';
      if (n === 'bartender') bartender.push(p);
      else if (n === 'dancer') dancers.push(p);
      else crowd.push(p);
    });
    return { bartender: bartender, dancers: dancers, crowd: crowd };
  }

  function applyOne(target, path, opts) {
    opts = opts || {};
    return loadModel(path).then(function (obj) {
      if (!obj) return false;
      const anims = (obj.userData && obj.userData.itchAnimations) || [];
      if (opts.requireAnim && !anims.length) {
        console.warn('[ITCH] skip', path, 'no animation clips — keeping the current animated character');
        return false;
      }
      const ok = swapVisible(target, obj);
      if (ok && anims.length) playItchAnim(obj, target);
      if (ok) console.log('[ITCH] swapped', path, 'onto', target.userData && target.userData.itchName || target.name || 'object');
      return ok;
    }).catch(function (err) {
      console.warn('[ITCH] skip', path, err && (err.message || err));
      return false;
    });
  }

  function applyBar(files) {
    const used = {};
    const jobs = [];
    files.forEach(function (path) {
      const key = barKeyFromStem(stemOf(path));
      if (key === 'bull') {
        console.warn('[ITCH] skip', path, '— the mechanical bull is not replaced');
        return;
      }
      const targets = targetsForBar(key);
      if (!targets.length) {
        console.warn('[ITCH] no slot for', path, '(key:', key + ')');
        return;
      }
      const start = used[key] || 0;
      // one file replaces every instance; several files of the same key cycle in order
      const sameKey = files.filter(function (p) { return barKeyFromStem(stemOf(p)) === key; });
      if (sameKey.length === 1) {
        targets.forEach(function (t) { jobs.push(applyOne(t, path)); });
      } else {
        if (start < targets.length) jobs.push(applyOne(targets[start], path));
        used[key] = start + 1;
      }
    });
    return Promise.all(jobs);
  }

  function applyCharacters(files) {
    const b = characterBuckets();
    const jobs = [];
    const rest = [];
    files.forEach(function (path) {
      const st = stemOf(path);
      if (/bartender|barkeep|barman/.test(st) && b.bartender.length) {
        jobs.push(applyOne(b.bartender.shift(), path, { requireAnim: true }));
      } else if (/dancer/.test(st) && b.dancers.length) {
        jobs.push(applyOne(b.dancers.shift(), path, { requireAnim: true }));
      } else {
        rest.push(path);
      }
    });
    const pool = b.crowd.concat(b.dancers).concat(b.bartender);
    rest.forEach(function (path) {
      if (!pool.length) {
        console.warn('[ITCH] no remaining character slot for', path);
        return;
      }
      jobs.push(applyOne(pool.shift(), path, { requireAnim: true }));
    });
    return Promise.all(jobs);
  }

  function run() {
    const man = window.ITCH_MANIFEST || { bar: [], characters: [], vehicles: [] };
    const bar = (man.bar || []).filter(Boolean);
    const chars = (man.characters || []).filter(Boolean);
    const vehs = (man.vehicles || []).filter(Boolean);
    if (!bar.length && !chars.length && !vehs.length) {
      console.log('[ITCH] manifest empty — keeping current visuals');
      return;
    }
    if (vehs.length) {
      console.warn('[ITCH] vehicles listed but this game has no vehicle slots; ignoring', vehs.length, 'file(s)');
    }
    const work = [];
    if (bar.length) work.push(applyBar(bar));
    if (chars.length) work.push(applyCharacters(chars));
    Promise.all(work).then(function () {
      if (window.PS2 && PS2.countUntextured && window.scene3d) {
        try {
          const v = PS2.countUntextured(slots() && null);
        } catch (e) {}
      }
      console.log('[ITCH] hot-swap pass finished');
    });
  }

  function boot() {
    if (!window.BUCK_READY) { setTimeout(boot, 120); return; }
    try { run(); } catch (e) { console.warn('[ITCH] loader error, falling back', e && (e.message || e)); }
  }

  if (document.readyState === 'complete') boot();
  else addEventListener('load', boot);
})();
