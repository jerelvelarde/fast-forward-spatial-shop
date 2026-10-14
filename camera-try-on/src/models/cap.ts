import {
  BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, SphereGeometry, SRGBColorSpace,
} from '@iwsdk/core';
import type { CapStyle } from '../products.js';
import { color, fabricNormalMap, OCCLUDER_ORDER, occluderMaterial, shade } from './materials.js';

const RX = 1.04, RY = 1.02, RZ = 1.16;
/** Crown extends slightly past a hemisphere so its rim hugs the head. */
const THETA = Math.PI / 2 + 0.08;

/** Six-panel seams, stitched band and eyelets, wrapped by the sphere UVs. */
function crownTexture(style: CapStyle): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const g = canvas.getContext('2d')!;
  g.fillStyle = style.crown;
  g.fillRect(0, 0, canvas.width, canvas.height);
  // Soft vertical shading, darker toward the band.
  const gradient = g.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(255,255,255,0.08)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, canvas.width, canvas.height);
  const seam = `#${shade(style.crown, -0.45).getHexString()}`;
  g.strokeStyle = seam;
  for (let i = 0; i < 6; i++) {
    // Seams at u = (i + 0.5) / 6 put the centre-front seam at u = 0.25 (+z).
    const x = ((i + 0.5) / 6) * canvas.width;
    g.lineWidth = 5; g.globalAlpha = 0.55;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, canvas.height); g.stroke();
    g.lineWidth = 1.5; g.globalAlpha = 0.5; g.setLineDash([6, 6]);
    for (const offset of [-9, 9]) { g.beginPath(); g.moveTo(x + offset, 40); g.lineTo(x + offset, canvas.height); g.stroke(); }
    g.setLineDash([]);
    // Eyelet on each panel.
    g.globalAlpha = 0.75; g.fillStyle = seam;
    g.beginPath(); g.arc(((i + 1) / 6) * canvas.width, canvas.height * 0.38, 7, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  // Stitched band above the rim.
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, canvas.height - 26, canvas.width, 26);
  g.strokeStyle = seam; g.lineWidth = 1.5; g.setLineDash([7, 5]);
  g.beginPath(); g.moveTo(0, canvas.height - 30); g.lineTo(canvas.width, canvas.height - 30); g.stroke();
  // Front logo patch (SphereGeometry faces +z at u = 0.25).
  const cx = canvas.width * 0.25, cy = canvas.height * 0.62;
  g.setLineDash([]);
  g.fillStyle = style.accent;
  g.beginPath(); g.roundRect(cx - 46, cy - 26, 92, 52, 10); g.fill();
  g.fillStyle = style.crown;
  g.font = '800 34px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('FF', cx, cy + 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Curved, slightly drooping brim attached along the front of the rim. */
function brimGeometry(): BufferGeometry {
  const arc = 34, radial = 8, length = 0.95, spread = 1.15;
  const positions: number[] = [], uvs: number[] = [], index: number[] = [];
  const rimY = Math.cos(THETA) * RY;
  const rimScale = Math.sin(THETA);
  for (let i = 0; i <= arc; i++) {
    const phi = (i / arc - 0.5) * 2 * spread; // 0 = straight ahead (+z)
    const profile = Math.cos((phi / spread) * Math.PI * 0.5) ** 0.55;
    const ix = Math.sin(phi) * RX * rimScale, iz = Math.cos(phi) * RZ * rimScale;
    for (let j = 0; j <= radial; j++) {
      const t = j / radial;
      const reach = t * length * profile;
      const x = ix + Math.sin(phi) * reach * 0.55;
      const z = iz + reach;
      // Pre-curved: edges drop, the whole brim tilts slightly down.
      const y = rimY - 0.01 - reach * 0.3 - (x * x) * 0.14 * t;
      positions.push(x, y, z);
      uvs.push(i / arc, t);
    }
  }
  for (let i = 0; i < arc; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Cap in head space (same frame and units as the glasses): origin between
 * the eyes, 1 unit = outer-eye-corner distance.
 */
export function buildCap(style: CapStyle): Group {
  const root = new Group();
  root.name = 'cap';
  const normalMap = fabricNormalMap().clone();
  normalMap.repeat.set(10, 5);

  const shell = new Group();
  shell.position.set(0, 0.52, -0.88);
  shell.rotation.x = 0.12; // rim sits higher on the forehead than at the nape
  root.add(shell);

  const crown = new Mesh(
    new SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, THETA),
    new MeshStandardMaterial({ map: crownTexture(style), normalMap, roughness: 0.92, side: DoubleSide }),
  );
  crown.scale.set(RX, RY, RZ);
  shell.add(crown);

  const button = new Mesh(new SphereGeometry(0.075, 16, 10), new MeshStandardMaterial({ color: color(style.crown), roughness: 0.8 }));
  button.scale.set(1, 0.4, 1);
  button.position.set(0, RY, 0);
  shell.add(button);

  const brim = new Mesh(brimGeometry(), new MeshStandardMaterial({ color: color(style.brim), normalMap, roughness: 0.88, side: DoubleSide }));
  shell.add(brim);

  const head = new Mesh(new SphereGeometry(1, 32, 24), occluderMaterial());
  head.name = 'head-occluder';
  head.scale.set(0.72, 1.1, 1.0);
  head.position.set(0, -0.1, -0.95);
  head.renderOrder = OCCLUDER_ORDER;
  root.add(head);
  return root;
}
