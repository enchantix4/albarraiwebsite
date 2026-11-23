// BUCK UP — mild PS2 vertex snap for three.js r147 (UMD, file:// safe).
//
// Shader chunks adapted from lferreira457/threejs-psx-shader
// https://github.com/lferreira457/threejs-psx-shader
// MIT License (see LICENSE-lferreira457-threejs-psx-shader.txt).
//
// We use ONLY the vertex-snap path, with a finer grid than the library's
// default 320x240, and affine texture warp left at 0: PS2, not PS1.
// No dither, CRT, or 15-bit colour from that package is used.
(function (global) {
  if (typeof THREE === 'undefined') return;

  var psxGlobals = {
    uniforms: {
      uPsxSnapRes: { value: new THREE.Vector2(512, 288) },
      uPsxSnapEnabled: { value: 1 },
      uPsxJitterScale: { value: 1 },
      uPsxAffineGlobal: { value: 0 },
      uPsxAffineCap: { value: 0 },
      uPsxAffineFade: { value: 2.5 }
    }
  };

  function applyPSXMaterial(material, opts) {
    if (!material) return material;
    opts = opts || {};
    var snap = opts.snap !== undefined ? opts.snap : true;
    var affine = opts.affine !== undefined ? opts.affine : 0; // default off: no PS1 wobble
    var prev = material.onBeforeCompile;
    var prevKey = material.customProgramCacheKey;

    material.onBeforeCompile = function (shader) {
      if (typeof prev === 'function') prev(shader);
      shader.uniforms.uPsxSnapRes = psxGlobals.uniforms.uPsxSnapRes;
      shader.uniforms.uPsxSnapEnabled = psxGlobals.uniforms.uPsxSnapEnabled;
      shader.uniforms.uPsxJitterScale = psxGlobals.uniforms.uPsxJitterScale;
      shader.uniforms.uPsxAffineGlobal = psxGlobals.uniforms.uPsxAffineGlobal;
      shader.uniforms.uPsxAffineCap = psxGlobals.uniforms.uPsxAffineCap;
      shader.uniforms.uPsxAffineFade = psxGlobals.uniforms.uPsxAffineFade;
      shader.uniforms.uPsxAffine = { value: affine };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', [
          '#include <common>',
          'uniform vec2 uPsxSnapRes;',
          'uniform float uPsxSnapEnabled;',
          'uniform float uPsxJitterScale;'
        ].join('\n'))
        .replace('#include <project_vertex>', [
          '#include <project_vertex>',
          '#ifdef PSX_SNAP',
          '  if ( uPsxSnapEnabled > 0.5 ) {',
          '    vec2 psxGrid = ( uPsxSnapRes / max( uPsxJitterScale, 0.05 ) ) * 0.5;',
          '    vec3 psxNdc = gl_Position.xyz / gl_Position.w;',
          '    psxNdc.xy = floor( psxNdc.xy * psxGrid + 0.5 ) / psxGrid;',
          '    gl_Position.xyz = psxNdc * gl_Position.w;',
          '  }',
          '#endif'
        ].join('\n'));

      if (snap) {
        shader.defines = shader.defines || {};
        shader.defines.PSX_SNAP = '';
      }
    };

    material.customProgramCacheKey = function () {
      var k = (typeof prevKey === 'function') ? prevKey.call(material) : (prevKey || '');
      return k + '_ps2snap_' + (snap ? 1 : 0) + '_' + affine;
    };
    material.userData.ps2snap = true;
    material.needsUpdate = true;
    return material;
  }

  global.PS2Shader = {
    psxGlobals: psxGlobals,
    applyPSXMaterial: applyPSXMaterial,
    // aliases used by scene3d hookSnap / applyPS2Skin
    apply: applyPSXMaterial
  };
})(this);
