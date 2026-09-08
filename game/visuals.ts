import * as THREE from 'three';
import type { Blueprint, BodyDef } from './types';
import { getBody, getWheel } from './catalogue';
import { TRACK_PIECES, START_Z, FINISH_Z, COURSE_MARKERS, groundHeight } from './track';

const INK = 0x283340;
const CREAM = 0xfff4dc;
const materials = new Map<string, THREE.MeshStandardMaterial>();

function material(color: number, metalness = 0): THREE.MeshStandardMaterial {
  const key = `${color}-${metalness}`;
  let value = materials.get(key);
  if (!value) {
    value = new THREE.MeshStandardMaterial({ color, roughness: 0.78 - metalness * 0.35, metalness, flatShading: true });
    materials.set(key, value);
  }
  return value;
}

function mesh(group: THREE.Group, geometry: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, metalness = 0): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material(color, metalness));
  result.position.set(x, y, z);
  result.castShadow = true;
  result.receiveShadow = true;
  group.add(result);
  return result;
}

function box(group: THREE.Group, w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(group, new THREE.BoxGeometry(w, h, d), color, x, y, z);
}

function ball(group: THREE.Group, radius: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(group, new THREE.SphereGeometry(radius, 12, 8), color, x, y, z);
}

function cylinder(group: THREE.Group, radius: number, height: number, color: number, x = 0, y = 0, z = 0, segments = 12): THREE.Mesh {
  return mesh(group, new THREE.CylinderGeometry(radius, radius, height, segments), color, x, y, z);
}

function bar(group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, radius: number, color: number): THREE.Mesh {
  const direction = to.clone().sub(from);
  const result = cylinder(group, radius, direction.length(), color);
  result.position.copy(from).add(to).multiplyScalar(0.5);
  result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return result;
}

function outlinedBox(group: THREE.Group, w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const result = box(group, w, h, d, color, x, y, z);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(result.geometry), new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.32 }));
  result.add(edge);
  return result;
}

function label(text: string, bg: number, color = INK, width = 3.5, height = 0.9): THREE.Mesh {
  const plane = new THREE.PlaneGeometry(width, height);
  if (typeof document === 'undefined') return new THREE.Mesh(plane, material(bg));
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Mesh(plane, material(bg));
  ctx.fillStyle = `#${bg.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 9;
  ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = '900 66px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 5, canvas.width - 50);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const result = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  result.userData.disposeTexture = texture;
  return result;
}

function handle(group: THREE.Group, x: number, y: number, z: number, w: number, color = INK): void {
  box(group, 0.075, 0.21, 0.075, color, x - w / 2, y, z);
  box(group, 0.075, 0.21, 0.075, color, x + w / 2, y, z);
  box(group, w + 0.08, 0.08, 0.08, color, x, y + 0.1, z);
}

function driver(group: THREE.Group, body: BodyDef, playerColor: number): void {
  const y = body.height / 2;
  const z = body.family === 'tall' ? body.length * 0.26 : -body.length * 0.12;
  box(group, 0.43, 0.36, 0.35, playerColor, 0, y + 0.14, z);
  ball(group, 0.3, playerColor, 0, y + 0.48, z);
  const face = ball(group, 0.245, 0xf1c7a4, 0, y + 0.43, z + 0.115);
  face.scale.set(0.95, 0.65, 0.8);
  box(group, 0.39, 0.1, 0.065, INK, 0, y + 0.5, z + 0.29);
  box(group, 0.24, 0.055, 0.015, 0xb5e7ec, 0, y + 0.515, z + 0.327);
  box(group, 0.06, 0.035, 0.07, CREAM, 0, y + 0.765, z + 0.02);
  for (const side of [-1, 1]) {
    const arm = box(group, 0.13, 0.13, 0.37, playerColor, side * 0.29, y + 0.12, z + 0.2);
    arm.rotation.y = side * -0.28;
    ball(group, 0.085, 0xf1c7a4, side * 0.22, y + 0.1, z + 0.39);
  }
  const steering = mesh(group, new THREE.TorusGeometry(0.24, 0.035, 6, 12), INK, 0, y + 0.12, z + 0.46);
  steering.rotation.x = Math.PI * 0.25;
}

function tub(group: THREE.Group, b: BodyDef): void {
  const { width: w, height: h, length: l, color: c } = b;
  box(group, w * 0.84, h * 0.36, l * 0.85, c, 0, -h * 0.32, 0);
  for (const s of [-1, 1]) {
    box(group, w * 0.11, h * 0.88, l * 0.95, c, s * w * 0.445, 0, 0);
    box(group, w * 0.16, 0.13, l, CREAM, s * w * 0.43, h * 0.45, 0);
    box(group, w * 0.82, h * 0.88, l * 0.08, c, 0, 0, s * l * 0.43);
    box(group, w * 0.91, 0.13, l * 0.13, CREAM, 0, h * 0.45, s * l * 0.43);
  }
  box(group, w * 0.76, 0.04, l * 0.74, 0xb7f0ed, 0, h * 0.19, 0);
  for (let i = 0; i < 7; i++) ball(group, 0.1 + (i % 3) * 0.04, CREAM, Math.sin(i * 3.4) * w * 0.29, h * 0.24, Math.cos(i * 2.2) * l * 0.27);
  cylinder(group, 0.055, 0.44, 0xd4d9d3, w * 0.26, h * 0.55, -l * 0.37);
  const spout = cylinder(group, 0.055, 0.23, 0xd4d9d3, w * 0.26, h * 0.77, -l * 0.33);
  spout.rotation.x = Math.PI / 2;
  const duck = ball(group, 0.15, 0xf8cf41, w * 0.24, h * 0.4, l * 0.25);
  duck.scale.z = 1.3;
  ball(group, 0.105, 0xf8cf41, w * 0.24, h * 0.55, l * 0.34);
  box(group, 0.13, 0.06, 0.13, 0xed894c, w * 0.24, h * 0.52, l * 0.44);
}

function sofa(group: THREE.Group, b: BodyDef): void {
  const { width: w, height: h, length: l, color: c } = b;
  outlinedBox(group, w, h * 0.34, l, c, 0, -h * 0.29, 0);
  box(group, w * 0.96, h * 0.67, l * 0.24, c, 0, h * 0.1, -l * 0.36);
  for (const s of [-1, 1]) {
    outlinedBox(group, w * 0.2, h * 0.55, l * 0.91, c, s * w * 0.4, h * -0.08, 0);
    outlinedBox(group, w * 0.28, h * 0.15, l * 0.57, 0xefadc4, s * w * 0.16, -h * 0.05, l * 0.13);
    const cushion = outlinedBox(group, w * 0.3, h * 0.38, l * 0.15, 0xe9a0bb, s * w * 0.165, h * 0.25, -l * 0.2);
    cushion.rotation.x = -0.18;
  }
  const pillow = box(group, 0.42, 0.4, 0.17, 0xf6ce65, -w * 0.25, h * 0.11, l * 0.18);
  pillow.rotation.z = 0.24;
}

function dumpster(group: THREE.Group, b: BodyDef): void {
  const { width: w, height: h, length: l, color: c } = b;
  outlinedBox(group, w * 0.94, h * 0.91, l * 0.95, c, 0, -h * 0.02, 0);
  box(group, w, 0.15, l, 0x26594d, 0, h * 0.43, 0);
  for (const s of [-1, 1]) {
    box(group, 0.1, h * 0.82, 0.1, 0x3a936e, s * w * 0.48, 0, l * 0.36);
    box(group, 0.1, h * 0.82, 0.1, 0x3a936e, s * w * 0.48, 0, -l * 0.36);
    box(group, w * 0.24, 0.2, 0.12, 0xf8dc79, s * w * 0.27, -h * 0.03, l * 0.49);
  }
  for (let i = 0; i < 5; i++) box(group, w * 0.83, 0.06, 0.09, 0x49785e, 0, h * 0.505, -l * 0.32 + i * l * 0.16);
  const sticker = label('GOOD RIDDANCE', CREAM, INK, w * 0.72, h * 0.28);
  sticker.position.set(0, 0, l * 0.482);
  group.add(sticker);
}

function toaster(group: THREE.Group, b: BodyDef): void {
  const { width: w, height: h, length: l, color: c } = b;
  outlinedBox(group, w, h * 0.9, l * 0.95, c, 0, 0, 0);
  box(group, w * 1.02, 0.12, l, INK, 0, -h * 0.45, 0);
  box(group, w * 0.92, 0.07, l * 0.91, 0xe5d6b8, 0, h * 0.48, 0);
  for (const s of [-1, 1]) {
    box(group, w * 0.24, 0.06, l * 0.71, INK, s * w * 0.23, h * 0.525, 0);
    outlinedBox(group, w * 0.18, h * 0.4, l * 0.54, 0xba793e, s * w * 0.23, h * 0.66, 0);
    box(group, w * 0.185, h * 0.28, l * 0.42, 0xf0cf8b, s * w * 0.23, h * 0.69, 0);
  }
  box(group, 0.12, h * 0.36, 0.1, INK, w * 0.52, 0.02, l * 0.25);
  box(group, 0.25, 0.13, 0.24, 0x57636a, w * 0.57, h * 0.15, l * 0.25);
  const dial = cylinder(group, 0.17, 0.06, INK, 0, -h * 0.12, l * 0.49);
  dial.rotation.x = Math.PI / 2;
  ball(group, 0.035, 0xf0fb9a, w * 0.29, -h * 0.13, l * 0.5);
}

function suitcase(group: THREE.Group, b: BodyDef): void {
  const { width: w, height: h, length: l, color: c } = b;
  outlinedBox(group, w, h * 0.94, l, c);
  box(group, w * 1.015, 0.055, l * 1.01, INK, 0, 0, 0);
  for (const s of [-1, 1]) {
    box(group, 0.13, h * 1.01, l * 1.01, 0xd2b69a, s * w * 0.31, 0, 0);
    box(group, 0.18, 0.14, 0.06, 0xf3d179, s * w * 0.31, 0.05, l * 0.51);
  }
  handle(group, 0, h * 0.55, -l * 0.2, w * 0.4);
  const sticker = label('FRAGILE-ISH', 0xf6d66a, INK, w * 0.75, h * 0.28);
  sticker.position.set(0, h * 0.505, l * 0.2);
  sticker.rotation.x = -Math.PI / 2;
  sticker.rotation.z = 0.2;
  group.add(sticker);
}

function lunchbox(group: THREE.Group, b: BodyDef): void {
  const { width: w, height: h, length: l, color: c } = b;
  outlinedBox(group, w, h * 0.82, l, c, 0, -h * 0.05, 0);
  box(group, w * 1.025, h * 0.14, l * 1.025, 0xf8d06d, 0, h * 0.42, 0);
  handle(group, 0, h * 0.6, -l * 0.2, w * 0.46, 0x91493e);
  for (const s of [-1, 1]) box(group, 0.19, 0.24, 0.08, 0xf2d398, s * w * 0.3, h * 0.32, l * 0.51);
  const decal = cylinder(group, 0.26, 0.02, 0xffe3a3, 0, -0.02, l * 0.505);
  decal.rotation.x = Math.PI / 2;
  ball(group, 0.05, INK, -0.085, 0.01, l * 0.526);
  ball(group, 0.05, INK, 0.085, 0.01, l * 0.526);
  box(group, 0.14, 0.035, 0.02, INK, 0, -0.12, l * 0.527);
}

function canoe(group: THREE.Group, b: BodyDef): void {
  const { width: w, height: h, length: l, color: c } = b;
  const shape = new THREE.Shape();
  shape.moveTo(0, -l / 2); shape.quadraticCurveTo(w * 0.7, -l * 0.2, w * 0.48, l * 0.2);
  shape.quadraticCurveTo(w * 0.35, l * 0.43, 0, l / 2);
  shape.quadraticCurveTo(-w * 0.35, l * 0.43, -w * 0.48, l * 0.2);
  shape.quadraticCurveTo(-w * 0.7, -l * 0.2, 0, -l / 2);
  const hull = mesh(group, new THREE.ExtrudeGeometry(shape, { depth: h * 0.58, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1, curveSegments: 8 }), c);
  hull.rotation.x = -Math.PI / 2;
  hull.position.y = -h * 0.4;
  const inside = box(group, w * 0.61, 0.05, l * 0.66, 0x773f3e, 0, h * 0.3, 0);
  inside.scale.z = 0.95;
  for (const s of [-1, 1]) box(group, w * 0.7, 0.11, 0.23, 0xcfa579, 0, h * 0.4, s * l * 0.21);
  const paddle = new THREE.Group();
  cylinder(paddle, 0.045, l * 0.84, 0xe0c096);
  const blade = ball(paddle, 0.22, 0xf8d57b, 0, -l * 0.34, 0);
  blade.scale.set(1, 2, 0.23);
  paddle.rotation.set(Math.PI / 2, 0.22, 0.32);
  paddle.position.set(w * 0.3, h * 0.45, 0);
  group.add(paddle);
}

function banana(group: THREE.Group, b: BodyDef): void {
  const points = [new THREE.Vector3(0, b.height * 0.33, -b.length * 0.48), new THREE.Vector3(0, -b.height * 0.12, -b.length * 0.23), new THREE.Vector3(0, -b.height * 0.19, b.length * 0.15), new THREE.Vector3(0, b.height * 0.3, b.length * 0.47)];
  const curve = new THREE.CatmullRomCurve3(points);
  const fruit = mesh(group, new THREE.TubeGeometry(curve, 12, b.width * 0.34, 6, false), b.color);
  fruit.scale.y = 0.82;
  for (const z of [-1, 1]) {
    const tip = cylinder(group, 0.115, 0.26, z === 1 ? 0x758744 : 0x755538, 0, b.height * 0.31, z * b.length * 0.46);
    tip.rotation.x = z * 0.75;
  }
  for (let i = 0; i < 4; i++) {
    const speckle = ball(group, 0.055, 0xb98535, b.width * 0.27, 0, -b.length * 0.17 + i * 0.3);
    speckle.scale.set(0.35, 0.9, 1.2);
  }
}

function ironingboard(group: THREE.Group, b: BodyDef): void {
  const { width: w, height: h, length: l, color: c } = b;
  const board = ball(group, 1, c, 0, h * 0.32, 0);
  board.scale.set(w * 0.5, 0.12, l * 0.5);
  for (const s of [-1, 1]) {
    bar(group, new THREE.Vector3(s * w * 0.3, -h * 0.45, -l * 0.25), new THREE.Vector3(s * w * 0.3, h * 0.2, l * 0.25), 0.045, CREAM);
    bar(group, new THREE.Vector3(s * w * 0.3, -h * 0.45, l * 0.25), new THREE.Vector3(s * w * 0.3, h * 0.2, -l * 0.25), 0.045, CREAM);
  }
  for (let i = -3; i <= 3; i++) box(group, w * 0.7, 0.012, 0.045, 0xe7f1ed, 0, h * 0.452, i * l * 0.09);
  const iron = box(group, w * 0.3, 0.21, l * 0.2, 0xef9478, w * 0.15, h * 0.52, l * 0.27);
  iron.rotation.y = -0.2;
  handle(group, w * 0.15, h * 0.73, l * 0.27, 0.23, CREAM);
}

function shoppingcart(group: THREE.Group, b: BodyDef): void {
  const { width: w, height: h, length: l, color: c } = b;
  const bottom = -h * 0.12;
  for (const x of [-w * 0.45, w * 0.45]) {
    for (const z of [-l * 0.44, l * 0.43]) cylinder(group, 0.045, h * 0.88, c, x, -h * 0.01, z);
    for (let j = 0; j < 4; j++) box(group, 0.045, 0.045, l * 0.89, c, x, bottom + j * h * 0.18, 0);
    for (let j = 0; j < 8; j++) box(group, 0.035, h * 0.65, 0.035, c, x, h * 0.19, -l * 0.42 + j * l * 0.12);
    box(group, 0.065, 0.065, l * 0.87, INK, x, -h * 0.44, 0);
  }
  for (const z of [-l * 0.44, l * 0.43]) {
    for (let j = 0; j < 4; j++) box(group, w * 0.93, 0.045, 0.045, c, 0, bottom + j * h * 0.18, z);
    for (let j = 0; j < 7; j++) box(group, 0.035, h * 0.65, 0.035, c, -w * 0.44 + j * w * 0.145, h * 0.19, z);
  }
  box(group, w * 0.9, 0.08, l * 0.88, c, 0, bottom, 0);
  box(group, w * 1.06, 0.11, 0.11, 0xe57761, 0, h * 0.47, -l * 0.49);
  box(group, w * 0.29, h * 0.31, l * 0.22, 0xf3cd75, w * 0.18, h * 0.1, l * 0.2);
  const groceries = ball(group, 0.29, 0x80af5d, -w * 0.18, h * 0.11, l * 0.25);
  groceries.scale.y = 0.8;
}

function fridge(group: THREE.Group, b: BodyDef): void {
  const { width: w, height: h, length: l, color: c } = b;
  outlinedBox(group, w, h, l, c);
  outlinedBox(group, w * 0.96, h * 0.3, 0.09, 0xf4f1df, 0, h * 0.33, l * 0.515);
  outlinedBox(group, w * 0.96, h * 0.66, 0.09, 0xe9eee2, 0, -h * 0.17, l * 0.515);
  box(group, 0.095, h * 0.16, 0.12, INK, -w * 0.31, h * 0.32, l * 0.55);
  box(group, 0.095, h * 0.3, 0.12, INK, -w * 0.31, -h * 0.06, l * 0.55);
  const paper = box(group, w * 0.37, h * 0.16, 0.014, 0xf6ce73, w * 0.17, h * 0.05, l * 0.541);
  paper.rotation.z = -0.13;
  ball(group, 0.045, 0xe6776e, w * 0.13, h * 0.12, l * 0.56);
  for (let i = 0; i < 6; i++) box(group, w * 0.69, 0.055, 0.04, 0x617168, 0, -h * 0.36 + i * h * 0.025, -l * 0.51);
}

function arcade(group: THREE.Group, b: BodyDef): void {
  const { width: w, height: h, length: l, color: c } = b;
  outlinedBox(group, w, h, l * 0.82, c, 0, 0, -l * 0.06);
  box(group, w * 0.91, h * 0.3, 0.08, INK, 0, h * 0.22, l * 0.362);
  box(group, w * 0.71, h * 0.22, 0.03, 0x98e2c5, 0, h * 0.22, l * 0.408);
  for (let i = 0; i < 3; i++) {
    box(group, 0.09, 0.09, 0.017, 0x416874, -0.25 + i * 0.25, h * 0.25, l * 0.429);
    box(group, 0.16, 0.055, 0.017, 0x416874, -0.25 + i * 0.25, h * 0.2, l * 0.429);
  }
  const panel = box(group, w * 0.99, h * 0.095, l * 0.36, 0xe987aa, 0, -h * 0.015, l * 0.35);
  panel.rotation.x = 0.12;
  cylinder(group, 0.04, 0.2, INK, -w * 0.24, h * 0.08, l * 0.37);
  ball(group, 0.085, 0xed6656, -w * 0.24, h * 0.18, l * 0.37);
  for (let i = 0; i < 3; i++) cylinder(group, 0.06, 0.04, [0xf9d765, 0x9fdaca, 0xf5a377][i], w * 0.05 + i * w * 0.11, h * 0.05, l * 0.4);
  const marquee = label('INSERT COURAGE', 0xf3cf72, INK, w * 0.9, h * 0.13);
  marquee.position.set(0, h * 0.44, l * 0.37);
  group.add(marquee);
  box(group, w * 0.28, h * 0.12, 0.04, INK, 0, -h * 0.31, l * 0.36);
  box(group, w * 0.12, 0.025, 0.05, 0xbdcad0, 0, -h * 0.29, l * 0.39);
}

const builders: Record<string, (group: THREE.Group, body: BodyDef) => void> = { bathtub: tub, sofa, dumpster, toaster, suitcase, lunchbox, canoe, banana, ironingboard, shoppingcart, fridge, arcade };

/** Main body origin is the physical chassis center. Wheels are supplied separately. */
export function createVehicleModel(blueprint: Blueprint, playerColor: number): THREE.Group {
  const body = getBody(blueprint.bodyId);
  const group = new THREE.Group();
  group.name = `vehicle-${body.id}`;
  builders[body.id](group, body);
  box(group, body.width * 0.76, 0.13, body.length * 0.76, INK, 0, -body.height * 0.47, 0);
  driver(group, body, playerColor);
  const pennant = new THREE.Group();
  cylinder(pennant, 0.025, 0.95, INK, 0, 0.3, 0);
  const triangle = new THREE.BufferGeometry();
  triangle.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.76, 0, 0.57, 0.59, 0, 0, 0.4, 0], 3));
  triangle.computeVertexNormals();
  const flag = new THREE.Mesh(triangle, new THREE.MeshStandardMaterial({ color: playerColor, side: THREE.DoubleSide, roughness: 0.9 }));
  pennant.add(flag);
  pennant.position.set(body.width * 0.41, body.height * 0.43, -body.length * 0.32);
  group.add(pennant);
  group.userData.bodyId = body.id;
  return group;
}

/** Wheels rotate about local X. */
export function createWheelModel(blueprint: Blueprint, playerColor: number): THREE.Group {
  const wheel = getWheel(blueprint.wheelId);
  const group = new THREE.Group();
  group.name = `wheel-${wheel.id}`;
  const width = wheel.id === 'monster' ? 0.43 : wheel.id === 'casters' ? 0.18 : 0.27;
  const tire = cylinder(group, wheel.radius, width, 0x29303b, 0, 0, 0, wheel.id === 'casters' ? 12 : 16);
  tire.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    const rim = cylinder(group, wheel.radius * 0.57, 0.025, wheel.id === 'casters' ? 0xc4d3cc : CREAM, side * (width / 2 + 0.009));
    rim.rotation.z = Math.PI / 2;
    const hub = cylinder(group, wheel.radius * 0.21, 0.04, playerColor, side * (width / 2 + 0.028));
    hub.rotation.z = Math.PI / 2;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const bolt = cylinder(group, wheel.radius * 0.045, 0.035, INK, side * (width / 2 + 0.026), Math.sin(a) * wheel.radius * 0.39, Math.cos(a) * wheel.radius * 0.39, 6);
      bolt.rotation.z = Math.PI / 2;
    }
  }
  if (wheel.id === 'monster') {
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      const tread = box(group, width * 1.03, 0.09, 0.2, 0x353c42, 0, Math.cos(angle) * wheel.radius, Math.sin(angle) * wheel.radius);
      tread.rotation.x = angle;
    }
  }
  return group;
}

function hayBale(group: THREE.Group, x: number, y: number, z: number, rotation = 0): void {
  const bale = new THREE.Group();
  box(bale, 1.25, 0.73, 0.88, 0xe5bd67, 0, 0.365, 0);
  for (const side of [-1, 1]) box(bale, 0.065, 0.75, 0.9, 0xc68e46, side * 0.36, 0.37, 0);
  bale.position.set(x, y, z);
  bale.rotation.y = rotation;
  group.add(bale);
}

function pine(group: THREE.Group, x: number, y: number, z: number, size: number, index: number): void {
  cylinder(group, size * 0.09, size * 1.4, 0x967154, x, y + size * 0.7, z, 6);
  mesh(group, new THREE.ConeGeometry(size * 0.68, size * 1.8, 7), index % 2 ? 0x76a96c : 0x588e6a, x, y + size * 1.7, z);
  mesh(group, new THREE.ConeGeometry(size * 0.51, size * 1.6, 7), index % 2 ? 0x8dbb78 : 0x6b9e70, x, y + size * 2.45, z);
}

function spectator(group: THREE.Group, x: number, y: number, z: number, color: number, cheering: boolean, facing: number): void {
  const person = new THREE.Group();
  const skin = [0xe8b58c, 0xc88762, 0x986348, 0xf2cdad][Math.abs(Math.round(z)) % 4];
  for (const side of [-1, 1]) {
    box(person, 0.14, 0.42, 0.18, INK, side * 0.12, 0.25, 0);
    const arm = box(person, 0.13, 0.47, 0.15, color, side * 0.3, cheering ? 1.03 : 0.71, 0);
    arm.rotation.z = side * (cheering ? -0.6 : 0.24);
  }
  box(person, 0.44, 0.49, 0.28, color, 0, 0.74, 0);
  ball(person, 0.22, skin, 0, 1.16, 0);
  const hair = ball(person, 0.225, INK, 0, 1.25, -0.02);
  hair.scale.y = 0.55;
  person.position.set(x, y, z);
  person.rotation.y = facing;
  group.add(person);
}

function raceFlag(group: THREE.Group, x: number, y: number, z: number, color: number, side: number): void {
  cylinder(group, 0.045, 3.7, CREAM, x, y + 1.85, z, 8);
  const cloth = box(group, 1.2, 1.7, 0.035, color, x + side * 0.56, y + 2.73, z);
  cloth.rotation.z = side * -0.055;
  const stripe = box(group, 0.13, 1.55, 0.044, CREAM, x + side * 0.38, y + 2.73, z + 0.005);
  stripe.rotation.z = side * -0.055;
}

const heightAt = groundHeight;

function sign(group: THREE.Group, text: string, x: number, y: number, z: number, color: number): void {
  const result = new THREE.Group();
  for (const s of [-1, 1]) box(result, 0.12, 2.4, 0.14, 0xb89669, s * 1.12, 1.2, 0);
  const board = label(text, color, INK, 3.7, 1.02);
  board.rotation.y = Math.PI;
  board.position.y = 2.21;
  result.add(board);
  result.position.set(x, y, z);
  result.rotation.y = x > 0 ? 0.15 : -0.15;
  group.add(result);
}

function paintedLady(group: THREE.Group, x: number, y: number, z: number, color: number, index: number): void {
  const house = new THREE.Group();
  const width = 3.3;
  const height = 4.5 + (index % 2) * 0.55;
  box(house, width, height, 3.7, color, 0, height / 2, 0);
  for (let row = 0; row < 12; row++) box(house, width + 0.035, 0.035, 3.735, CREAM, 0, 0.45 + row * (height - 0.65) / 12, 0);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-width * 0.58, 0); roofShape.lineTo(0, 1.8); roofShape.lineTo(width * 0.58, 0); roofShape.closePath();
  mesh(house, new THREE.ExtrudeGeometry(roofShape, { depth: 4.1, bevelEnabled: false }), 0x59636b, 0, height, -2.05);
  box(house, width + 0.25, 0.18, 4, CREAM, 0, height, 0);
  box(house, 0.95, 1.7, 0.12, 0x4f756e, -0.8, 0.95, 1.91);
  box(house, 1.16, 0.17, 0.23, CREAM, -0.8, 1.82, 1.97);
  for (let i = 0; i < 3; i++) box(house, 1.3 + i * 0.17, 0.17, 0.4, 0xcec4a7, -0.8, 0.29 - i * 0.085, 2.08 + i * 0.27);
  box(house, 1.12, height * 0.77, 0.48, color, 0.68, height * 0.51, 1.99);
  for (const floor of [1.12, height - 1.15]) {
    for (const side of [-1, 1]) {
      box(house, 0.56, 1.02, 0.06, 0xa8ced6, side * 0.8, floor, side === 1 ? 2.26 : 1.91);
      box(house, 0.69, 0.1, 0.13, CREAM, side * 0.8, floor - 0.54, side === 1 ? 2.28 : 1.94);
      box(house, 0.65, 0.07, 0.09, CREAM, side * 0.8, floor, side === 1 ? 2.3 : 1.96);
      box(house, 0.05, 1.07, 0.09, CREAM, side * 0.8, floor, side === 1 ? 2.3 : 1.96);
    }
  }
  box(house, 0.42, 1.2, 0.45, 0xa66f59, -0.95, height + 0.9, -0.85);
  const attic = cylinder(house, 0.29, 0.055, 0xa8ced6, 0, height + 0.65, 2.09);
  attic.rotation.x = Math.PI / 2;
  house.position.set(x, y, z);
  house.rotation.y = Math.PI / 2;
  group.add(house);
}

function goldenGate(group: THREE.Group): void {
  const orange = 0xd84e34;
  const bridgeStart = 98;
  const bridgeEnd = 139;
  const waterY = heightAt(bridgeEnd) - 7;
  const water = box(group, 112, 0.25, 60, 0x70babd, 0, waterY, 117);
  water.receiveShadow = true;
  for (let i = 0; i < 20; i++) box(group, 1.4 + (i % 4), 0.016, 0.1, 0xafe1d6, Math.sin(i * 2.31) * 42, waterY + 0.136, 93 + (i * 7.3) % 50);
  for (const towerZ of [102, 133]) {
    const deckY = heightAt(towerZ);
    for (const side of [-1, 1]) {
      box(group, 1.05, 20.5, 1.15, orange, side * 8.7, deckY + 5.6, towerZ);
      box(group, 1.9, 1.1, 2.1, 0xb7ab94, side * 8.7, waterY + 0.7, towerZ);
      box(group, 1.28, 0.3, 1.4, 0xe46d48, side * 8.7, deckY + 15.8, towerZ);
    }
    for (const height of [7.5, 11.3, 15.2]) box(group, 18.45, 0.68, 0.9, orange, 0, deckY + height, towerZ);
  }
  for (const side of [-1, 1]) {
    const cablePoints = [
      new THREE.Vector3(side * 8.7, heightAt(91) + 1.5, 91),
      new THREE.Vector3(side * 8.7, heightAt(102) + 15.5, 102),
      new THREE.Vector3(side * 8.7, heightAt(117.5) + 5.5, 117.5),
      new THREE.Vector3(side * 8.7, heightAt(133) + 15.5, 133),
      new THREE.Vector3(side * 8.7, heightAt(146) + 1.5, 146),
    ];
    const cable = new THREE.CatmullRomCurve3(cablePoints);
    mesh(group, new THREE.TubeGeometry(cable, 64, 0.11, 5, false), orange);
    for (let i = 0; i <= 32; i++) {
      const point = cable.getPoint(i / 32);
      if (point.z > bridgeStart && point.z < bridgeEnd) bar(group, new THREE.Vector3(point.x, heightAt(point.z) + 0.35, point.z), point, 0.035, orange);
    }
    const beam = box(group, 0.3, 0.8, bridgeEnd - bridgeStart, orange, side * 7.4, heightAt(118.5) - 0.45, 118.5);
    beam.rotation.x = Math.atan(0.072);
    for (let z = bridgeStart; z < bridgeEnd; z += 2.8) box(group, 0.15, 1.25, 0.15, orange, side * 7.45, heightAt(z) + 0.55, z);
  }
  const boat = new THREE.Group();
  const hull = ball(boat, 1, CREAM);
  hull.scale.set(1.5, 0.36, 3.1);
  box(boat, 1.7, 1, 2.4, 0xe7c884, 0, 0.55, -0.1);
  box(boat, 1.8, 0.12, 2.55, INK, 0, 1.1, -0.1);
  box(boat, 1.4, 0.35, 0.03, 0x8ecbd2, 0, 0.68, 1.12);
  boat.position.set(-23, waterY + 0.5, 124);
  boat.rotation.y = -0.5;
  group.add(boat);
}

function sanFrancisco(group: THREE.Group): void {
  goldenGate(group);
  for (let i = 0; i < 7; i++) paintedLady(group, -17 - (i % 2) * 0.8, heightAt(15 + i * 7.1) - 0.6, 15 + i * 7.1, [0xe8bb82, 0x9bbca8, 0xce99aa, 0xb5b5d7, 0xe0c996, 0x88b4c2, 0xd0ad8a][i], i);

  // Brick garden borders evoke Lombard Street without changing the drivable surface.
  for (let i = 0; i < 22; i++) {
    const z = 30 + i * 1.55;
    const x = 8.8 + (Math.sin(i * 0.68) + 1) * 0.85;
    for (const side of [-1, 1]) {
      box(group, 1.65, 0.35, 1.7, 0xb66e59, side * x, heightAt(z) + 0.03, z);
      const bush = ball(group, 0.75, 0x749957, side * x, heightAt(z) + 0.47, z);
      bush.scale.set(1, 0.57, 0.9);
      for (let j = 0; j < 3; j++) ball(group, 0.17, [0xe8a9c7, 0xeebbbc, 0xd591bd][(i + j) % 3], side * x + Math.sin(j * 2.1) * 0.39, heightAt(z) + 0.83, z + Math.cos(j * 2.1) * 0.38);
    }
  }

  const coit = new THREE.Group();
  cylinder(coit, 2, 1.4, 0xdecaa5, 0, 0.7, 0, 12);
  cylinder(coit, 1.3, 10.4, 0xebddbb, 0, 6.1, 0, 12);
  cylinder(coit, 1.65, 2.2, 0xf0e1c0, 0, 12, 0, 12);
  cylinder(coit, 1.76, 0.36, 0xd4c59f, 0, 13.23, 0, 12);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const window = box(coit, 0.48, 1.28, 0.09, 0x5e7776, Math.sin(a) * 1.57, 12, Math.cos(a) * 1.57);
    window.rotation.y = a;
  }
  coit.position.set(-24, heightAt(233) - 1, 233);
  group.add(coit);

  const pyramid = new THREE.Group();
  const tower = mesh(pyramid, new THREE.ConeGeometry(5.2, 23, 4, 1), 0xe5ddc8, 0, 12.6, 0);
  tower.rotation.y = Math.PI / 4;
  box(pyramid, 6.9, 1.6, 6.9, 0xc1c6bb, 0, 0.8, 0);
  for (const side of [-1, 1]) box(pyramid, 0.8, 9.5, 1.55, 0xd0d5c9, side * 2.6, 5.7, 0);
  for (let i = 1; i < 18; i++) {
    const level = i * 1.15 + 1.7;
    const span = 7.1 * (1 - (level - 1.1) / 23);
    box(pyramid, Math.max(0.15, span), 0.055, Math.max(0.15, span), 0xbcc5bd, 0, level, 0);
  }
  cylinder(pyramid, 0.065, 3.5, 0xeae4d3, 0, 25.2, 0, 6);
  pyramid.position.set(30, heightAt(255) - 1, 255);
  group.add(pyramid);

  for (let i = 0; i < 8; i++) {
    const h = 3 + (i % 3) * 2;
    box(group, 4 + (i % 2) * 2, h, 4, [0xbbc9bd, 0x9eafb6, 0xd1c8af][i % 3], 17 + (i % 4) * 6, heightAt(267) + h / 2 - 1, 275 + Math.floor(i / 4) * 7);
  }
}

/** Road meshes exactly match the physics boxes; everything beside them is scenery. */
export function createTrackScene(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'soapbox-world';
  const minZ = Math.min(...TRACK_PIECES.map((p) => p.position[2] - p.size[2] / 2));
  const maxZ = Math.max(...TRACK_PIECES.map((p) => p.position[2] + p.size[2] / 2));
  const length = maxZ - minZ;

  for (const piece of TRACK_PIECES) {
    const road = box(group, ...piece.size, piece.color, ...piece.position);
    road.rotation.set(...piece.rotation);
    road.name = `track-${piece.id}`;
    if (piece.id.startsWith('edge-')) continue;
    for (const side of [-1, 1]) {
      if (piece.position[2] < 87 || piece.position[2] > 139) {
        const terrain = box(group, 50, 2.2, piece.size[2] + 0.7, 0xbdd39b, side * 32.5, piece.position[1] - piece.size[1] / 2 - 1.15, piece.position[2]);
        terrain.rotation.set(piece.rotation[0], 0, 0);
      }
      const edge = box(group, 0.16, 0.025, piece.size[2] * 0.96, CREAM, piece.position[0] + side * (piece.size[0] / 2 - 0.25), piece.position[1] + piece.size[1] / 2 + 0.028, piece.position[2]);
      edge.rotation.set(piece.rotation[0], 0, 0);
    }
  }

  for (let z = minZ + 5, i = 0; z < maxZ; z += 8, i++) {
    const y = heightAt(z);
    const dash = box(group, 0.13, 0.035, 2.15, 0xf5e4ae, 0, y + 0.04, z);
    dash.rotation.x = 0.08;
    if (z > 87 && z < 140) continue;
    for (const side of [-1, 1]) {
      hayBale(group, side * 7.65, y - 0.14, z, Math.sin(i * 2.1) * 0.05);
      if (i % 3 === 0) raceFlag(group, side * 9.1, y - 0.3, z + 1.2, side < 0 ? 0xf2a153 : 0x83b9d7, side);
      if (i % 2 === 0) {
        for (let j = 0; j < 3; j++) spectator(group, side * (10.2 + (j % 2) * 0.6), y - 0.3, z + j * 1.4, [0xef9771, 0x86b7cf, 0xf0c85f, 0xc496ca, 0x5d9f8c][(i + j) % 5], (i + j) % 3 === 0, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      if (i % 4 === 0) pine(group, side * (16 + (i % 3) * 4), y - 0.9, z + 2, 1.7 + (i % 3) * 0.7, i);
    }
  }

  for (let i = 0; i < 16; i++) {
    const z = minZ + (i / 15) * length;
    if (z > 80 && z < 145) continue;
    const side = i % 2 ? 1 : -1;
    const hill = ball(group, 1, [0xa9c991, 0xabc58e, 0xb1ce91][i % 3], side * (28 + (i % 3) * 5), heightAt(z) - 2, z);
    hill.scale.set(12 + (i % 3) * 5, 4 + (i % 4) * 2, 18 + (i % 2) * 9);
  }

  COURSE_MARKERS.forEach(({ name, z, color }, i) => {
    sign(group, name, i % 2 ? 10.5 : -10.5, heightAt(z) - 0.1, z - 2, color);
  });

  for (const lane of [-3.5, 3.5]) {
    for (const [text, z, bg] of [['HOLD', 74, 0xffe29a], ['HOP!', 83, 0xffdb43]] as const) {
      const cue = label(text, bg, INK, 3.7, 1.35);
      cue.rotation.x = -Math.PI / 2;
      cue.rotation.z = Math.PI;
      cue.position.set(lane, heightAt(z) + 0.052, z);
      group.add(cue);
    }
    for (const z of [81.7, 84.4]) for (let stripe = 0; stripe < 8; stripe++) {
      const marking = box(group, 0.65, 0.027, 0.32, stripe % 2 ? CREAM : 0xffd84c, lane - 2.28 + stripe * 0.65, heightAt(z) + 0.04, z);
      marking.rotation.x = Math.atan(0.072);
    }
  }
  sign(group, 'HOLD, THEN HOP!', -10.5, heightAt(80), 80, 0xffdb43);

  const finishZ = FINISH_Z;
  const finishY = heightAt(finishZ);
  const arch = new THREE.Group();
  for (const side of [-1, 1]) {
    box(arch, 0.85, 6.4, 0.85, 0xf0c668, side * 7.7, 3.2, 0);
    box(arch, 1.35, 0.38, 1.3, INK, side * 7.7, 0.19, 0);
    for (let j = 0; j < 5; j++) box(arch, 0.88, 0.4, 0.9, j % 2 ? CREAM : INK, side * 7.7, 0.7 + j * 0.41, 0);
  }
  box(arch, 16.25, 1.35, 0.55, 0xf0c668, 0, 6.15, 0);
  const finish = label('FINISH · STILL IN ONE PIECE?', 0xf0c668, INK, 13.7, 1.05);
  finish.rotation.y = Math.PI;
  finish.position.set(0, 6.14, -0.286);
  arch.add(finish);
  arch.position.set(0, finishY, finishZ);
  group.add(arch);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 18; col++) {
    box(group, 0.74, 0.027, 0.74, (row + col) % 2 ? INK : CREAM, -6.29 + col * 0.74, finishY + 0.038, finishZ - 0.75 + row * 0.74);
  }

  const startZ = START_Z;
  const startY = heightAt(startZ);
  sign(group, 'DOODLE DERBY', -10.7, startY, startZ + 1, 0xf4d06b);
  for (const side of [-1, 1]) {
    const pit = box(group, 3.2, 0.25, 4.5, side < 0 ? 0xe79c71 : 0x8cbad0, side * 11.2, startY - 0.15, startZ - 5);
    pit.rotation.y = side * 0.08;
    box(group, 2.3, 0.13, 0.85, 0xe3c39b, side * 11.2, startY + 0.85, startZ - 4.5);
    for (const s of [-1, 1]) box(group, 0.1, 0.9, 0.7, 0x987958, side * 11.2 + s * 0.85, startY + 0.4, startZ - 4.5);
  }
  sanFrancisco(group);
  return group;
}
