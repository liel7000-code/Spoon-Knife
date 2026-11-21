// Self-made PBR helper textures, generated on canvases at load time (no image files):
// normal maps derived from height, roughness maps, tyre tread. Scalar maps keep the default
// (linear) colour space; only colour maps are sRGB.
import * as THREE from 'three';

const cache = new Map();
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; }

// Sobel normal map from a height canvas (red channel = height); wraps at the edges so it tiles
export function normalFromHeight(src, strength = 2) {
  const W = src.width, H = src.height, hs = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const [c, g] = canvas(W, H), out = g.createImageData(W, H);
  const h = (x, y) => hs[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), o = (y * W + x) * 4;
    out.data[o] = ((-dx / l) * 0.5 + 0.5) * 255; out.data[o + 1] = ((dy / l) * 0.5 + 0.5) * 255; out.data[o + 2] = (1 / l) * 255; out.data[o + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

const tex = (c, { repeat = [1, 1], wrapS = THREE.RepeatWrapping, wrapT = THREE.RepeatWrapping, aniso = 4 } = {}) => {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = wrapS; t.wrapT = wrapT; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = aniso;
  return t;
};

/* --------------------------------------------------------------- asphalt */
// Height + roughness for a road surface whose colour canvas is given: aggregate stones, worn
// wheel paths (smoother, less rough), painted lines (flat and smoother). Returns { normalMap, roughnessMap }
// sharing the colour map's UV layout.
export function asphaltDetail(colorCanvas, { lineU = null } = {}) {
  const W = colorCanvas.width, H = colorCanvas.height;
  const [hc, hg] = canvas(W, H), [rc, rg] = canvas(W, H);
  const col = colorCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const himg = hg.createImageData(W, H), rimg = rg.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4, lum = (col[o] * 0.3 + col[o + 1] * 0.59 + col[o + 2] * 0.11) / 255;
    // stones: local brightness becomes height, plus fine noise for grain
    const n = Math.random();
    const height = 0.45 + (lum - 0.22) * 0.9 + (n - 0.5) * 0.18;
    himg.data[o] = himg.data[o + 1] = himg.data[o + 2] = Math.max(0, Math.min(255, height * 255)); himg.data[o + 3] = 255;
    // roughness (green channel): rough aggregate, rubbered dark streaks are slicker, paint is smooth
    let r = 0.88 + (n - 0.5) * 0.08;
    if (lum < 0.13) r -= 0.22;      // laid rubber / oil
    if (lum > 0.6) r = 0.55;        // painted line
    rimg.data[o] = 0; rimg.data[o + 1] = Math.max(0, Math.min(255, r * 255)); rimg.data[o + 2] = 0; rimg.data[o + 3] = 255;
  }
  hg.putImageData(himg, 0, 0); rg.putImageData(rimg, 0, 0);
  void lineU;
  return { normalCanvas: normalFromHeight(hc, 1.6), roughnessCanvas: rc };
}

/* ----------------------------------------------------------------- tyres */
// tread blocks and grooves for the lathed tyre (u = around the tyre, v = across the profile)
export function treadNormal() {
  if (cache.has('tread')) return cache.get('tread');
  const W = 1024, H = 128, [c, g] = canvas(W, H);
  g.fillStyle = '#c0c0c0'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#303030';
  // three circumferential grooves on the tread face (middle of the profile)
  for (const v of [0.38, 0.5, 0.62]) g.fillRect(0, v * H - 2, W, 4);
  // slanted lateral sipes
  for (let i = 0; i < 96; i++) {
    const x = (i / 96) * W;
    g.save(); g.translate(x, H * 0.5); g.rotate(0.35);
    g.fillRect(-1.5, -H * 0.17, 3, H * 0.34); g.restore();
  }
  // sidewall: very soft radial ripples
  for (let y = 0; y < H; y++) { if (y > H * 0.28 && y < H * 0.72) continue; g.fillStyle = `rgba(${150 + (y % 6) * 4},0,0,0.25)`; g.fillRect(0, y, W, 1); }
  const t = tex(normalFromHeight(c, 3), { wrapT: THREE.ClampToEdgeWrapping, aniso: 8 });
  cache.set('tread', t);
  return t;
}

/* ------------------------------------------------------------- brake disc */
// concentric machining lines: a roughness map that gives discs their brushed-steel sheen
export function discRoughness() {
  if (cache.has('disc')) return cache.get('disc');
  const S = 256, [c, g] = canvas(S, S);
  g.fillStyle = 'rgb(0,110,0)'; g.fillRect(0, 0, S, S);
  for (let r = 4; r < S / 2; r += 2) { g.strokeStyle = `rgba(0,${80 + Math.random() * 90 | 0},0,0.7)`; g.lineWidth = 1; g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.stroke(); }
  const t = tex(c, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
  cache.set('disc', t);
  return t;
}

/* ------------------------------------------------------- car paint flakes */
// Metallic flakes under the clear coat, computed in the shader from the body's own position
// (the lofted bodies have no UVs). The clear coat keeps the smooth geometric normal, so the
// coat stays mirror-like while the base layer sparkles. One shared uniform switches them on/off
// per quality level without recompiling.
export const FLAKES = { uFlake: { value: 0.12 } };
export function addFlakes(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFlake = FLAKES.uFlake;
    sh.vertexShader = 'varying vec3 vFlakePos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFlakePos = position;');
    sh.fragmentShader = 'uniform float uFlake;\nvarying vec3 vFlakePos;\n'
      + 'vec3 flakeHash(vec3 p) { p = fract(p * vec3(443.897, 441.423, 437.195)); p += dot(p, p.yxz + 19.19); return fract((p.xxy + p.yzz) * p.zyx); }\n'
      + sh.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n if (uFlake > 0.0) { vec3 fl = flakeHash(floor(vFlakePos * 900.0)) - 0.5; normal = normalize(normal + fl * uFlake); }');
  };
  mat.customProgramCacheKey = () => 'flakes';
  return mat;
}
