// Post-processing: render -> bloom -> output (tone mapping + sRGB) -> final pass.
// The final pass does speed-based radial blur, chromatic aberration, vignette,
// speed lines at the screen edges and exhaust heat haze, all in one shader.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSpeed: { value: 0 },     // 0..1
    uLines: { value: 0 },     // 0..1
    uTime: { value: 0 },
    uHaze: { value: new THREE.Vector2(0.5, 0.2) },
    uHazeAmt: { value: 0 },
    uAspect: { value: 1 },
    uCenter: { value: new THREE.Vector2(0.5, 0.55) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uSpeed, uLines, uTime, uHazeAmt, uAspect;
    uniform vec2 uHaze, uCenter;
    varying vec2 vUv;
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      // heat haze shimmer above the exhaust
      vec2 hd = (uv - uHaze) * vec2(uAspect, 1.0);
      float hz = uHazeAmt * smoothstep(0.09, 0.0, length(hd + vec2(0.0, -0.03)));
      uv += hz * 0.0035 * vec2(sin(uv.y * 160.0 + uTime * 32.0), cos(uv.x * 130.0 + uTime * 27.0));

      vec2 dir = uv - uCenter;
      float r = length(dir * vec2(uAspect, 1.0)) / max(uAspect, 1.0);
      // radial motion blur, stronger towards the edges
      float amt = uSpeed * 0.045 * smoothstep(0.1, 0.75, r);
      vec3 col = vec3(0.0);
      for (int i = 0; i < 8; i++) { float t = float(i) / 7.0; col += texture2D(tDiffuse, uv - dir * amt * t).rgb; }
      col /= 8.0;
      // chromatic aberration at high speed
      float ca = uSpeed * uSpeed * 0.0038 * r;
      col.r = mix(col.r, texture2D(tDiffuse, uv + dir * ca).r, 0.85);
      col.b = mix(col.b, texture2D(tDiffuse, uv - dir * ca).b, 0.85);
      // speed lines streaming out of the vanishing point, edges only
      float ang = atan(dir.y, dir.x);
      float bucket = floor((ang + 3.1416) * 28.0);
      float h = hash(bucket);
      float inLine = smoothstep(0.5, 0.0, abs(fract((ang + 3.1416) * 28.0) - 0.5) * 6.0);
      float dash = fract(r * 2.2 - uTime * (2.4 + h * 2.0) + h * 7.0);
      float streak = step(0.8, h) * inLine * smoothstep(0.0, 0.05, dash) * smoothstep(0.45, 0.15, dash);
      col += streak * smoothstep(0.32, 0.7, r) * uLines * 0.35;
      // vignette
      float v = smoothstep(1.0, 0.3, r * 1.15);
      col *= mix(1.0, v, 0.5 + uSpeed * 0.25);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.26, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.enabled = true;
    this.scene = scene; this.camera = camera;
  }

  setQuality(q) {
    this.enabled = q.post;
    this.bloom.enabled = q.bloom;
  }

  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.final.uniforms.uAspect.value = w / Math.max(1, h);
  }

  render(dt, { speed = 0, lines = 0, haze = null, hazeAmt = 0 } = {}) {
    if (!this.enabled) { this.renderer.render(this.scene, this.camera); return; }
    const u = this.final.uniforms;
    u.uTime.value += dt;
    u.uSpeed.value = speed;
    u.uLines.value = lines;
    u.uHazeAmt.value = hazeAmt;
    if (haze) u.uHaze.value.copy(haze);
    this.composer.render(dt);
  }
}
