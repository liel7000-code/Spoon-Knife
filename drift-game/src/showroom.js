// Studio showroom: the car parked on a light seamless floor under soft studio
// lighting, with a slowly orbiting camera, ambient occlusion and a gentle
// depth of field.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildPlayerCar } from './cars.js';
import { maxAnisotropy } from './parts.js';

const BG = new THREE.Color('#dedfe2');

export class Showroom {
  constructor(renderer) {
    this.renderer = renderer;
    const scene = (this.scene = new THREE.Scene());
    scene.background = BG.clone();
    scene.fog = new THREE.Fog(BG.clone(), 16, 38);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environmentIntensity = 0.9;
    pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);

    // seamless studio floor that fades into the backdrop
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#d4d5d8', roughness: 0.42, metalness: 0 }));
    floor.receiveShadow = true;
    scene.add(floor);
    // a faint darker turntable disc gives the car a "stage"
    const stage = new THREE.Mesh(new THREE.CircleGeometry(3.6, 96).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#c6c8cc', roughness: 0.3, metalness: 0.1 }));
    stage.position.y = 0.002; stage.receiveShadow = true;
    scene.add(stage);

    scene.add(new THREE.HemisphereLight('#ffffff', '#b9bbbf', 0.9));
    const key = (this.key = new THREE.DirectionalLight('#ffffff', 2.4));
    key.position.set(3, 9, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 });
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 6;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#fff4e6', 1.2);
    rim.position.set(-6, 4, -5);
    scene.add(rim);

    this.carGroup = new THREE.Group();
    scene.add(this.carGroup);
    this.car = null;
    this.angle = -2.4;      // orbit angle around the car
    this.turn = this.carGroup; // kept for automated checks

    // post: AO + subtle DOF
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.ao = new GTAOPass(scene, this.camera, 512, 512);
    this.ao.blendIntensity = 0.85;
    this.composer.addPass(this.ao);
    this.dof = new BokehPass(scene, this.camera, { focus: 9, aperture: 0.0018, maxblur: 0.006 });
    this.composer.addPass(this.dof);
    this.composer.addPass(new OutputPass());
    this.post = true;
  }

  setQuality(q) {
    this.post = q.post;
    this.ao.enabled = q.ao; // AO on High only
  }

  setCar(def, color, style) {
    if (this.car) this.carGroup.remove(this.car);
    this.car = buildPlayerCar(def, color, style);
    this.car.traverse((o) => { if (o.isMesh && !o.userData.blob) o.castShadow = true; });
    maxAnisotropy(this.car, this.renderer);
    this.carGroup.add(this.car);
  }

  setColor(color) {
    if (this.car) this.car.userData.paint.color.set(color);
  }

  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(renderer, dt, mode) {
    this.angle += dt * 0.16; // slow orbit
    const size = renderer.getSize(new THREE.Vector2());
    const aspect = size.x / Math.max(1, size.y);
    const cam = this.camera;
    cam.aspect = aspect;
    const portrait = aspect < 1;
    const dist = portrait ? 15 : mode === 'garage' ? 11 : 9.5;
    cam.position.set(Math.sin(this.angle) * dist, portrait ? 3.6 : 2.3, Math.cos(this.angle) * dist);
    // keep the car clear of the menu card (right, RTL) / garage panel (bottom)
    let lookY = 0.55;
    if (mode === 'menu' && !portrait) cam.setViewOffset(size.x, size.y, size.x * 0.2, 0, size.x, size.y);
    else cam.clearViewOffset();
    if (portrait) lookY = mode === 'garage' ? -2.4 : -2.0;
    else if (mode === 'garage') lookY = -1.25;
    cam.lookAt(0, lookY, 0);
    cam.updateProjectionMatrix();
    if (this.post) {
      this.dof.uniforms.focus.value = dist;
      this.composer.render(dt);
    } else renderer.render(this.scene, cam);
  }
}
