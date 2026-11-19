// Chase and cockpit cameras with a speed-driven FOV and crash shake.
import * as THREE from 'three';

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const q1 = new THREE.Quaternion();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'third';
    this.pos = new THREE.Vector3(0, 3, 8);
    this.look = new THREE.Vector3(0, 1, -8);
    this.fov = camera.fov;
    this.shake = 0;
    this.snap = true;
  }

  setMode(mode) {
    this.mode = mode;
    this.snap = true;
  }

  toggle() {
    this.setMode(this.mode === 'third' ? 'first' : 'third');
    return this.mode;
  }

  update(dt, car, speedFrac) {
    const cam = this.camera;
    let baseFov;
    if (this.mode === 'third') {
      baseFov = 60;
      v1.set(car.position.x * 0.9, 2.75 + speedFrac * 0.35, 6.6 - speedFrac * 0.9);
      v2.set(car.position.x * 0.6, 0.9, -10);
      const k = this.snap ? 1 : 1 - Math.exp(-dt * 7);
      this.pos.lerp(v1, k);
      this.look.lerp(v2, this.snap ? 1 : 1 - Math.exp(-dt * 9));
      cam.position.copy(this.pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.look);
    } else {
      baseFov = 62;
      car.updateMatrixWorld();
      const eye = car.userData.eye, frame = car.userData.body || car; // body rolls/pitches
      v1.copy(eye).applyMatrix4(frame.matrixWorld);
      v2.set(eye.x, eye.y - 0.3, eye.z - 14).applyMatrix4(frame.matrixWorld);
      cam.position.copy(v1);
      // roll with the body so lane changes feel physical
      cam.up.set(0, 1, 0).applyQuaternion(frame.getWorldQuaternion(q1));
      cam.lookAt(v2);
    }
    this.snap = false;

    if (this.shake > 0.001) {
      const s = this.shake * (this.mode === 'first' ? 0.18 : 0.45);
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.rotation.z += (Math.random() - 0.5) * s * 0.15;
      this.shake *= Math.exp(-dt * 3.2);
    }

    const targetFov = baseFov + speedFrac * 24;
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-dt * 4));
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}
