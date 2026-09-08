import * as THREE from 'three';

/** A game collectible, drawn once and shared by every reset on the course. */
export function createResetPickup(radius: number, texture?: THREE.Texture): THREE.Group {
  const root = new THREE.Group(); root.name = 'ChatGPT reset · 3 second speed boost';
  const shape = new THREE.Shape();
  const h = radius * .86, r = radius * .22;
  shape.moveTo(-h + r, -h);
  shape.lineTo(h - r, -h); shape.quadraticCurveTo(h, -h, h, -h + r);
  shape.lineTo(h, h - r); shape.quadraticCurveTo(h, h, h - r, h);
  shape.lineTo(-h + r, h); shape.quadraticCurveTo(-h, h, -h, h - r);
  shape.lineTo(-h, -h + r); shape.quadraticCurveTo(-h, -h, -h + r, -h);
  const shell = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .24, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .07, bevelThickness: .06, curveSegments: 5 }),
    new THREE.MeshStandardMaterial({ color: 0x4effc6, emissive: 0x10b981, emissiveIntensity: .42, roughness: .34, metalness: .16 }));
  shell.position.z = -.12; root.add(shell);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(h * 1.87, h * 1.87),
    new THREE.MeshBasicMaterial({ map: texture ?? null, color: texture ? 0xffffff : 0x074b3c, toneMapped: false }));
  // Both directions get readable type; no mirrored back faces.
  face.position.z = .20;
  const back = face.clone(); back.rotation.y = Math.PI; back.position.z = -.20;
  root.add(face, back);
  root.userData.resetPickup = true;
  return root;
}

export function createResetTexture(): THREE.Texture | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d'); if (!ctx) return undefined;
  ctx.fillStyle = '#084b3e'; ctx.fillRect(0, 0, 512, 512);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d9fff0'; ctx.font = '600 46px Arial, sans-serif'; ctx.fillText('ChatGPT', 256, 65);
  // The familiar reset arrow reads as a pickup even before its label is legible.
  ctx.strokeStyle = '#6dffcc'; ctx.lineWidth = 24; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(256, 224, 77, -.28, Math.PI * 1.56); ctx.stroke();
  ctx.fillStyle = '#6dffcc'; ctx.beginPath(); ctx.moveTo(264, 113); ctx.lineTo(264, 180); ctx.lineTo(210, 151); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '900 67px Arial, sans-serif'; ctx.fillText('RESET', 256, 363);
  ctx.fillStyle = '#91ffcf'; ctx.font = '700 30px Arial, sans-serif'; ctx.fillText('+3s SPEED BOOST', 256, 439);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = 'ChatGPT reset pickup'; texture.anisotropy = 4;
  return texture;
}
