// 3D showroom: the selected car slowly turning on a lit podium.
import * as THREE from 'three';
import { buildPlayerCar } from './cars.js';

export class Showroom {
  constructor(envMap) {
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#121419');
    scene.fog = new THREE.Fog('#121419', 12, 30);
    scene.environment = envMap;
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#16181d', roughness: 0.9 }),
    );
    scene.add(floor);
    const podium = new THREE.Mesh(
      new THREE.CylinderGeometry(3.3, 3.4, 0.14, 64),
      new THREE.MeshStandardMaterial({ color: '#23262d', metalness: 0.6, roughness: 0.25 }),
    );
    podium.position.y = 0.07;
    scene.add(podium);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.38, 0.03, 8, 96).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff5a1f', emissiveIntensity: 2 }),
    );
    ring.position.y = 0.14;
    scene.add(ring);

    scene.add(new THREE.HemisphereLight('#c9d6ff', '#2a2420', 0.6));
    const key = new THREE.SpotLight('#ffffff', 140, 30, 0.55, 0.6, 1.4);
    key.position.set(4, 7, 4);
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight('#ff9a5c', 1.4);
    rim.position.set(-6, 3, -5);
    scene.add(rim);

    this.turn = new THREE.Group();
    this.turn.position.y = 0.14;
    this.turn.rotation.y = -2.3;
    scene.add(this.turn);
    this.car = null;
  }

  setCar(def, color) {
    if (this.car) this.turn.remove(this.car);
    this.car = buildPlayerCar(def, color);
    this.turn.add(this.car);
  }

  setColor(color) {
    if (this.car) this.car.userData.paint.color.set(color);
  }

  render(renderer, dt, mode) {
    this.turn.rotation.y += dt * 0.35;
    const size = renderer.getSize(new THREE.Vector2());
    const aspect = size.x / Math.max(1, size.y);
    this.camera.aspect = aspect;
    const portrait = aspect < 1;
    const dist = portrait ? 14 : (mode === 'garage' ? 10 : 8.2);
    this.camera.position.set(dist * 0.72, portrait ? 3.4 : 2.2, dist * 0.7);
    // keep the car clear of the menu card / garage panel
    // menu card is on the right (RTL), so shift the car to the left half
    let lookY = 0.55;
    if (mode === 'menu' && !portrait) this.camera.setViewOffset(size.x, size.y, size.x * 0.2, 0, size.x, size.y);
    else this.camera.clearViewOffset();
    if (portrait) lookY = mode === 'garage' ? -2.6 : -2.2;
    else if (mode === 'garage') lookY = -0.6;
    this.camera.lookAt(0, lookY, 0);
    this.camera.updateProjectionMatrix();
    renderer.render(this.scene, this.camera);
  }
}
