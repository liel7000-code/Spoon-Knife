// Shared physically based materials.
import * as THREE from 'three';

export function carPaint(color, { metalness = 0.55, roughness = 0.3, pearl = false, matte = false } = {}) {
  // matte: satin finish with no gloss clearcoat (e.g. the C63's matte grey)
  if (matte) return new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.58, clearcoat: 0.15, clearcoatRoughness: 0.7 });
  return new THREE.MeshPhysicalMaterial({
    color, metalness, roughness,
    clearcoat: 1, clearcoatRoughness: 0.05,
    ...(pearl ? { sheen: 0.6, sheenColor: new THREE.Color('#f5e9ff'), sheenRoughness: 0.4, iridescence: 0.25, iridescenceIOR: 1.3 } : {}),
  });
}

// cheaper paint for traffic (still clear-coated)
export function trafficPaint(color) {
  return new THREE.MeshPhysicalMaterial({ color, metalness: 0.4, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.12 });
}

const std = (o) => new THREE.MeshStandardMaterial(o);

export const MAT = {
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x05080c, metalness: 0.0, roughness: 0.05, transparent: true, opacity: 0.86,
    envMapIntensity: 0.6, specularIntensity: 0.3, depthWrite: false,
  }),
  lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.22, envMapIntensity: 2.5, depthWrite: false }),
  tire: std({ color: 0x151515, roughness: 0.9, metalness: 0 }),
  tireSide: std({ color: 0x1c1c1c, roughness: 0.75, metalness: 0 }),
  alloy: std({ color: 0xc8ccd2, metalness: 1, roughness: 0.22 }),
  gunmetal: std({ color: 0x45494f, metalness: 1, roughness: 0.3 }),
  bronze: std({ color: 0x8a7550, metalness: 1, roughness: 0.3 }),
  chrome: std({ color: 0xe8ebef, metalness: 1, roughness: 0.08 }),
  rimInner: std({ color: 0x2a2c30, metalness: 0.7, roughness: 0.5 }),
  disc: std({ color: 0x7a7d82, metalness: 0.9, roughness: 0.42 }),
  caliperRed: new THREE.MeshPhysicalMaterial({ color: 0xb3121a, roughness: 0.32, clearcoat: 1 }),
  caliperGold: new THREE.MeshPhysicalMaterial({ color: 0xc9a23a, metalness: 0.6, roughness: 0.3, clearcoat: 1 }),
  plastic: std({ color: 0x0f1012, roughness: 0.6, metalness: 0 }),
  satin: std({ color: 0x17181b, roughness: 0.35, metalness: 0.3 }),
  carbon: new THREE.MeshPhysicalMaterial({ color: 0x18191c, roughness: 0.3, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.08 }),
  interior: std({ color: 0x1b1c1f, roughness: 0.85 }),
  leather: std({ color: 0x24201d, roughness: 0.7 }),
  mirror: std({ color: 0x1a2230, metalness: 1, roughness: 0.06 }),
  reflector: std({ color: 0xd8dde3, metalness: 1, roughness: 0.15 }),
  head: std({ color: 0xffffff, emissive: 0xfff2d6, emissiveIntensity: 3.2 }),
  drl: std({ color: 0xffffff, emissive: 0xe8f1ff, emissiveIntensity: 2.2 }),
  fog: std({ color: 0xfff6cf, emissive: 0xffe9a8, emissiveIntensity: 2.0 }),
  tail: std({ color: 0x3a0303, emissive: 0xff1208, emissiveIntensity: 1.4, roughness: 0.3 }),
  tailDark: new THREE.MeshPhysicalMaterial({ color: 0x2a0606, roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.92 }),
  amber: std({ color: 0x4a2a00, emissive: 0xff8a10, emissiveIntensity: 0.3 }),
  reverse: std({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0.15 }),
  plate: std({ color: 0xf2c418, roughness: 0.5 }),
  exhaust: std({ color: 0xb9bcc0, metalness: 1, roughness: 0.25 }),
  soot: std({ color: 0x050505, roughness: 1 }),
};

export const indicatorMat = () => std({ color: 0x4a2a00, emissive: 0xff8a10, emissiveIntensity: 0 });
