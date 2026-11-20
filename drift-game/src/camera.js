// Chase and cockpit cameras with a speed-driven FOV, speed shake, an intro
// sweep when a run starts and a slow cinematic orbit around a crash.
import * as THREE from 'three';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'third';
    this.pos = new THREE.Vector3(0, 3, 8);
    this.look = new THREE.Vector3(0, 1, -8);
    this.fov = camera.fov;
    this.shake = 0;
    this.snap = true;
    this.intro = 0;      // seconds left of the intro sweep
    this.introLen = 2.2;
    this.crash = false;  // orbit the wreck
    this.crashT = 0;
    this.time = 0;
  }

  setMode(mode) { this.mode = mode; this.snap = true; }
  // chase -> bumper -> cockpit
  toggle() { const order = ['third', 'bumper', 'first']; this.setMode(order[(order.indexOf(this.mode) + 1) % order.length]); return this.mode; }
  startIntro() { this.intro = this.introLen; this.crash = false; }
  startCrash(side) { this.crash = true; this.crashT = 0; this.crashSide = side || 1; }

  update(dt, car, speedFrac) {
    const cam = this.camera;
    this.time += dt;
    let baseFov, camPos = v1, target = v2;
    const frame = car.userData.body || car;
    car.updateMatrixWorld();

    if (this.mode === 'third' || this.crash) {
      baseFov = 48; // tighter lens: the car reads bigger and less stretched
      // high, close chase view looking down onto the roof and rear glass
      camPos.set(car.position.x * 0.92 + 0.4, 2.35 + speedFrac * 0.2, 5.7 - speedFrac * 0.4);
      target.set(car.position.x * 0.8 - 0.1, -0.55, -9);
      const k = this.snap ? 1 : 1 - Math.exp(-dt * 7);
      this.pos.lerp(camPos, k);
      this.look.lerp(target, this.snap ? 1 : 1 - Math.exp(-dt * 9));
      camPos.copy(this.pos); target.copy(this.look);
    } else if (this.mode === 'bumper') {
      // low camera on the front bumper: the most intense sense of speed
      baseFov = 66;
      const len = (car.userData.def && car.userData.def.length) || 4.5;
      camPos.set(0, 0.62, -len / 2 - 0.05).applyMatrix4(frame.matrixWorld);
      target.set(0, 0.5, -len / 2 - 30).applyMatrix4(frame.matrixWorld);
    } else {
      baseFov = 62;
      const eye = car.userData.eye;
      camPos.copy(eye).applyMatrix4(frame.matrixWorld);
      target.set(eye.x, eye.y - 0.3, eye.z - 14).applyMatrix4(frame.matrixWorld);
    }

    if (this.crash) {
      // slow orbit around the car while time is slowed down
      this.crashT += dt;
      const a = this.crashSide * (0.9 + this.crashT * 0.35);
      const r = 7.5 - Math.min(2, this.crashT);
      v3.set(car.position.x + Math.sin(a) * r, 2.0 + Math.min(1.2, this.crashT * 0.5), Math.cos(a) * r);
      const k = ease(this.crashT / 0.8);
      camPos.lerp(v3, k);
      target.lerp(v3.set(car.position.x, 0.7, 0), k);
      baseFov = 50;
    }

    if (this.intro > 0) {
      // sweep from a showroom-style front 3/4 view round to the driving camera
      this.intro = Math.max(0, this.intro - dt);
      const t = 1 - this.intro / this.introLen;
      const a = -2.5 + t * 1.2;
      v3.set(car.position.x + Math.sin(a) * 7, 1.4, Math.cos(a) * 7);
      const k = ease(t);
      camPos.lerpVectors(v3, camPos, k);
      target.lerpVectors(v3.set(car.position.x, 0.6, 0), target, k);
      baseFov = THREE.MathUtils.lerp(38, baseFov, k);
    }

    cam.position.copy(camPos);
    if (this.mode !== 'third' && !this.crash && this.intro <= 0) cam.up.set(0, 1, 0).applyQuaternion(frame.getWorldQuaternion(q1));
    else cam.up.set(0, 1, 0);
    cam.lookAt(target);
    this.snap = false;

    // vibration that grows with speed, plus crash shake
    const buzz = speedFrac * speedFrac * (this.mode === 'first' ? 0.006 : 0.012) * (this.crash ? 0 : 1);
    cam.position.x += Math.sin(this.time * 47) * buzz;
    cam.position.y += Math.sin(this.time * 61 + 1.3) * buzz;
    if (this.shake > 0.001) {
      const s = this.shake * (this.mode === 'first' ? 0.18 : 0.45);
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.rotation.z += (Math.random() - 0.5) * s * 0.15;
      this.shake *= Math.exp(-dt * 3.2);
    }

    const targetFov = baseFov + (this.crash || this.intro > 0 ? 0 : speedFrac * (this.mode === 'third' ? 16 : 24));
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-dt * 4));
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}
