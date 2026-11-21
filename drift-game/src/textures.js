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
// Tileable asphalt relief (normal map) and roughness, built once from a value-noise height field in plain
// arrays (no canvas read-back: that cost seconds per track) and shared by every road. Coarse aggregate +
// fine grain; roughness varies a little with the height (exposed stones are rougher than the binder).
export function asphaltMaps(aniso = 4) {
  if (cache.has('asphalt')) return cache.get('asphalt');
  const S = 512, N = S * S, hgt = new Float32Array(N);
  const grid = (cells) => { const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = Math.random(); return g; };
  const layer = (cells, amp) => {
    const g = grid(cells), k = cells / S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const fx = x * k, fy = y * k, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const a = g[(iy % cells) * cells + (ix % cells)], b = g[(iy % cells) * cells + ((ix + 1) % cells)];
      const c = g[((iy + 1) % cells) * cells + (ix % cells)], d = g[((iy + 1) % cells) * cells + ((ix + 1) % cells)];
      const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
      hgt[y * S + x] += amp * (a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v);
    }
  };
  layer(16, 0.35); layer(64, 0.4); layer(170, 0.35);
  for (let i = 0; i < N; i++) hgt[i] += (Math.random() - 0.5) * 0.12; // grit
  const [nc, ng] = canvas(S, S), [rc, rg] = canvas(S, S), nimg = ng.createImageData(S, S), rimg = rg.createImageData(S, S);
  const H = (x, y) => hgt[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2, l = Math.hypot(dx, dy, 1), o = (y * S + x) * 4;
    nimg.data[o] = ((-dx / l) * 0.5 + 0.5) * 255; nimg.data[o + 1] = ((dy / l) * 0.5 + 0.5) * 255; nimg.data[o + 2] = (1 / l) * 255; nimg.data[o + 3] = 255;
    rimg.data[o + 1] = Math.max(0, Math.min(255, (0.8 + (H(x, y) - 0.55) * 0.35) * 255)); rimg.data[o + 3] = 255;
  }
  ng.putImageData(nimg, 0, 0); rg.putImageData(rimg, 0, 0);
  const res = { normalMap: tex(nc, { aniso }), roughnessMap: tex(rc, { aniso }) };
  cache.set('asphalt', res);
  return res;
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
