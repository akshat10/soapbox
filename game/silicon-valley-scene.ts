import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BAY_CIRCUIT_COURSE as course } from './course';
import { createCampusCrane, createRooftopGarden, createRooftopMascot } from './silicon-campus-props';

type SignCopy = { label: string; lines: string[]; color: string; ink?: string };
// Original fictional sign copy recovered from SF_RACE_HUMOR and AI_REFERENCE_BANK.
export const VALLEY_COPY: readonly SignCopy[] = [
  { label: 'HACKER HOUSE', lines: ['12 FOUNDERS.', '1 BATHROOM. 0 REVENUE.'], color: '#ffba50' },
  { label: 'OPEN HOUSE', lines: ['SF RENT.', 'BILLED PER TOKEN.'], color: '#ffba50' },
  { label: 'CONTEXT WINDOW', lines: ['1M TOKENS.', 'NO PARKING.'], color: '#abe7db' },
  { label: 'LOMBARD REALTY', lines: ['FLAT ROUTE.', 'ACCORDING TO THE LISTING.'], color: '#abe7db' },
  { label: 'SHIP IT GARAGE', lines: ['THE BRAKES', 'WERE VIBE-CODED.'], color: '#2447b2', ink: '#ffffff' },
  { label: 'OWN YOUR INERTIA.', lines: ["THAT'S SO", 'AERODYNAMIC.'], color: '#2447b2', ink: '#ffffff' },
  { label: 'MISSION LABS', lines: ['MCP: MISSION', 'CARNITAS PROTOCOL.'], color: '#ec7454' },
  { label: 'TAQUERIA.AI', lines: ['JUST ANOTHER', 'AI WRAPPER.'], color: '#ec7454' },
  { label: 'SERIES A · STILL HIRING', lines: ['STOP HIRING DRIVERS.', 'DRIVER WANTED.'], color: '#194335', ink: '#d6ffe2' },
  { label: 'OUTDOOR ADVERTISING', lines: ['AI BILLBOARDS', 'FOR AI BILLBOARDS.'], color: '#194335', ink: '#d6ffe2' },
  { label: 'CAMPUS SHUTTLE', lines: ['SHUTTLE TO', 'YOUR ZOOM CALL.'], color: '#e7e8e4' },
  { label: 'PARKING ASSISTANT', lines: ['FREE PARKING.', 'HALLUCINATION DETECTED.'], color: '#e7e8e4' },
  { label: 'FARM TO PROMPT', lines: ['ARTISANAL SLOP.', 'LOCALLY GENERATED.'], color: '#d8a7e6' },
  { label: 'MISSION MARKET', lines: ['GUAC IS', 'STILL EXTRA.'], color: '#d8a7e6' },
  { label: 'INFERENCE CAFE', lines: ['$9.', 'MILK SOLD SEPARATELY.'], color: '#efc265' },
  { label: 'PIER BAKERY', lines: ['LOCAL STARTER.', 'BIG FINISH.'], color: '#efc265' },
  { label: 'PIT STOP · RATE LIMIT LIFTED', lines: ['ChatGPT', 'RESET +3s'], color: '#084b3e', ink: '#8fffd3' },
  { label: 'SAN FRANCISCO', lines: ['OpenAI'], color: '#f4f5ed' },
  { label: 'RESEARCH CAMPUS', lines: ['ANTHROPIC'], color: '#e5b59c' },
  { label: 'SILICON VALLEY', lines: ['Google'], color: '#f4f5ed' },
  { label: 'COMPUTE CAMPUS', lines: ['NVIDIA'], color: '#81bd19' },
];
const COLS = 4, ROWS = 8, CELL_W = 512, CELL_H = 256;

function signAtlas(): THREE.Texture | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas'); canvas.width = COLS * CELL_W; canvas.height = ROWS * CELL_H;
  const ctx = canvas.getContext('2d'); if (!ctx) return undefined;
  VALLEY_COPY.forEach((copy, i) => {
    ctx.save(); ctx.translate(i % COLS * CELL_W, Math.floor(i / COLS) * CELL_H);
    ctx.fillStyle = copy.color; ctx.fillRect(0, 0, CELL_W, CELL_H);
    ctx.fillStyle = copy.ink ?? '#192b2b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 16px Arial, sans-serif'; ctx.fillText(copy.label, 256, 38);
    ctx.fillRect(28, 64, 456, 2);
    copy.lines.forEach((line, row) => {
      let font = copy.lines.length === 1 ? 65 : 40;
      do { ctx.font = `900 ${font--}px Arial, sans-serif`; } while (ctx.measureText(line).width > 458 && font > 17);
      ctx.fillText(line, 256, copy.lines.length === 1 ? 154 : 122 + row * 55);
    });
    ctx.restore();
  });
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4; texture.name = 'Silicon Valley · roadside jokes and campus marquees';
  return texture;
}

export function valleyJokeIndex(pair: number, lap: number): number {
  // A seeded first choice with alternating laps: every phone and host agree,
  // and no mutable RNG or reconnect can reshuffle signs during the same lap.
  return pair * 2 + ((Math.imul(pair + 7, 0x45d9f3b) >>> 3) + Math.max(0, lap - 1) & 1);
}

export type ValleyScene = { root: THREE.Group; update: (lap: number) => void };

export function createSiliconValleyScene(authored: THREE.Group): ValleyScene {
  const root = new THREE.Group(); root.name = 'Silicon Valley · campus landmarks and race jokes';
  authored.updateMatrixWorld(true);
  const occupied: THREE.Box3[] = [], offices: THREE.Box3[] = [];
  const groundMeshes: THREE.Mesh[] = [];
  authored.traverse(node => {
    if (node instanceof THREE.Mesh && node.name.startsWith('Sealed coastal island')) groundMeshes.push(node);
    if (/^sf_(painted_lady|mission_storefront|soma_office|chinatown_gate|coit_tower|pyramid_tower)$/.test(node.userData.asset_id ?? '')) {
      const box = new THREE.Box3().setFromObject(node); occupied.push(box);
      if (node.userData.asset_id === 'sf_soma_office') offices.push(box);
    }
  });
  const atlas = signAtlas();
  const faceMaterial = new THREE.MeshBasicMaterial({ map: atlas ?? null, color: atlas ? 0xffffff : 0x94ebd0, toneMapped: false });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x183d3b, roughness: .72 });
  const concreteMaterial = new THREE.MeshStandardMaterial({ color: 0xc7c8b4, roughness: .95 });
  const frames: THREE.BufferGeometry[] = [], feet: THREE.BufferGeometry[] = [], faces: THREE.BufferGeometry[] = [];
  const slots: { vertex: number; pair: number | null; fixed: number }[] = [];
  const cube = new THREE.BoxGeometry(1, 1, 1), unit = new THREE.PlaneGeometry(1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const addBox = (parts: THREE.BufferGeometry[], x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0) => {
    parts.push(cube.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(up, yaw), new THREE.Vector3(w, h, d))));
  };
  const addBoard = (x: number, y: number, z: number, yaw: number, width: number, ground: number, fixed: number, pair: number | null = null) => {
    const height = width / 2, rotation = new THREE.Quaternion().setFromAxisAngle(up, yaw);
    addBox(frames, x, y, z, width + .25, height + .25, .28, yaw);
    for (const side of [-1, 1]) {
      const normal = new THREE.Vector3(0, 0, side * .16).applyQuaternion(rotation);
      const face = unit.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z).add(normal),
        new THREE.Quaternion().setFromAxisAngle(up, yaw + (side < 0 ? Math.PI : 0)), new THREE.Vector3(width, height, 1)));
      slots.push({ vertex: faces.length * 4, pair, fixed }); faces.push(face);
      const local = new THREE.Vector3(side * width * .32, 0, 0).applyQuaternion(rotation);
      const poleHeight = Math.max(.4, y - height / 2 - ground);
      addBox(frames, x + local.x, ground + poleHeight / 2, z + local.z, .19, poleHeight, .19);
    }
    addBox(feet, x, ground - .16, z, width * .83, .32, 1.3, yaw);
  };
  const samples = course.paths[0].samples;
  const ray = new THREE.Raycaster();
  const clearRoad = (x: number, z: number, radius: number) => samples.every(sample =>
    Math.hypot(x - sample.position[0], z - sample.position[2]) > sample.width / 2 + radius + 1.2);
  const locations = [24, 82, 150, 225, 279, 327, 364, 421, 483, 570, 664];
  const placements: { distance: number; x: number; z: number; radius: number }[] = [];
  locations.forEach((distance, index) => {
    const width = 8, radius = 4.3, frame = course.frame(distance);
    const yaw = Math.atan2(-frame.tangent.x, -frame.tangent.z);
    for (const offset of [13, -13, 17, -17, 22, -22, 28, -28]) {
      const x = frame.position.x + frame.right.x * offset, z = frame.position.z + frame.right.z * offset;
      if (!clearRoad(x, z, radius) || occupied.some(box => x + radius > box.min.x && x - radius < box.max.x && z + radius > box.min.z && z - radius < box.max.z)) continue;
      ray.set(new THREE.Vector3(x, 120, z), new THREE.Vector3(0, -1, 0));
      const terrainHeight = ray.intersectObjects(groundMeshes, false)[0]?.point.y;
      // Outer viaduct signs use pilings down to the bay floor; inland boards
      // sit directly on the repaired terrain instead of floating beside it.
      const ground = terrainHeight ?? -4.6;
      addBoard(x, Math.max(frame.position.y + 5.5, ground + 3), z, yaw, width, ground, 0, index % 8);
      placements.push({ distance, x, z, radius });
      occupied.push(new THREE.Box3(new THREE.Vector3(x - radius, -100, z - radius), new THREE.Vector3(x + radius, 100, z + radius)));
      break;
    }
  });
  // Oversized rooftop wordmarks echo the Silicon Valley opening-title city.
  offices.slice(0, 4).forEach((bounds, i) => {
    const center = bounds.getCenter(new THREE.Vector3());
    const projection = course.project({ x: center.x, y: bounds.min.y, z: center.z }, { pathId: 'main', distance: 0 }, course.finishDistance);
    const yaw = Math.atan2(projection.position.x - center.x, projection.position.z - center.z);
    const away = new THREE.Vector3(0, 0, -2.4).applyAxisAngle(up, yaw);
    addBoard(center.x + away.x, bounds.max.y + 3.1, center.z + away.z, yaw, 9, bounds.max.y, 17 + i);
    if (i !== 0 && i !== 3) {
      const garden = createRooftopGarden(6, 5);
      garden.position.set(center.x, bounds.max.y + .02, center.z); garden.rotation.y = yaw;
      root.add(garden);
    }
    if (i === 0) {
      const mascot = createRooftopMascot(); mascot.scale.setScalar(1.4);
      const front = new THREE.Vector3(0, 0, 1).applyAxisAngle(up, yaw);
      mascot.position.set(center.x + front.x, bounds.max.y + .14, center.z + front.z); mascot.rotation.y = yaw;
      root.add(mascot);
    }
    if (i === 3) {
      const crane = createCampusCrane();
      crane.position.set(center.x, bounds.max.y + .14, center.z);
      // Send the jib away from the nearby racing road.
      crane.rotation.y = yaw + Math.PI / 2;
      root.add(crane);
    }
  });
  const merge = (parts: THREE.BufferGeometry[], material: THREE.Material, name: string) => {
    if (!parts.length) return null;
    const geometry = mergeGeometries(parts)!; parts.forEach(part => part.dispose()); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  merge(frames, frameMaterial, 'Campus billboard frames and poles');
  merge(feet, concreteMaterial, 'Campus sign foundations');
  const signs = merge(faces, faceMaterial, 'Readable roadside jokes and campus wordmarks');
  cube.dispose(); unit.dispose();
  let previousLap = -1;
  const update = (lap: number) => {
    const current = Number.isFinite(lap) ? Math.max(1, Math.floor(lap)) : 1;
    if (current === previousLap || !signs) return; previousLap = current;
    const uv = signs.geometry.getAttribute('uv');
    for (const slot of slots) {
      const index = slot.pair === null ? slot.fixed : valleyJokeIndex(slot.pair, current);
      const x = index % COLS, y = Math.floor(index / COLS), inset = .005;
      const left = x / COLS + inset, right = (x + 1) / COLS - inset;
      const top = 1 - y / ROWS - inset, bottom = 1 - (y + 1) / ROWS + inset;
      uv.setXY(slot.vertex, left, top); uv.setXY(slot.vertex + 1, right, top);
      uv.setXY(slot.vertex + 2, left, bottom); uv.setXY(slot.vertex + 3, right, bottom);
    }
    uv.needsUpdate = true;
  };
  root.userData.signPlacements = placements; root.userData.campusRoofs = offices;
  root.userData.jokeSignCount = placements.length; root.userData.campusSignCount = Math.min(4, offices.length);
  update(1); return { root, update };
}
