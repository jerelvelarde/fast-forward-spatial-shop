import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Group, Mesh, MeshStandardMaterial,
  PlaneGeometry, RepeatWrapping, SRGBColorSpace, TorusGeometry, TubeGeometry, Vector2, Vector3, type Material,
} from '@iwsdk/core';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { BackpackStyle } from '../products.js';
import { color, fabricNormalMap, shade } from './materials.js';

const STRAP_SAMPLES = 40;
const PROFILE = 16;
const STRAP_WIDTH = 0.05;
const STRAP_THICKNESS = 0.02;

/** Pack dimensions in metres, derived from its volume. */
export function packSize(liters: number) {
  const t = liters - 20;
  return { width: 0.28 + t * 0.0025, height: 0.4 + t * 0.01, depth: 0.16 + t * 0.004, top: 0.04 + t * 0.004 };
}

function logoTexture(style: BackpackStyle): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 72;
  const g = canvas.getContext('2d')!;
  g.fillStyle = style.trim;
  g.beginPath(); g.roundRect(0, 0, 256, 72, 14); g.fill();
  g.fillStyle = style.accent;
  g.font = '800 30px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.letterSpacing = '5px';
  g.fillText('RIDGELINE', 128, 38);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Strap fabric: u runs around the cross-section (top face is 0–0.5), v along
 * the strap. Stitching near the edges and a mesh panel make it read as padded.
 */
function strapTexture(style: BackpackStyle): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const g = canvas.getContext('2d')!;
  g.fillStyle = style.accent;
  g.fillRect(0, 0, 256, 64);
  // Lighter breathable mesh on the top face, between the stitch lines.
  g.fillStyle = 'rgba(255,255,255,0.07)';
  for (let x = 30; x < 98; x += 6) for (let y = 0; y < 64; y += 6) g.fillRect(x + ((y / 6) % 2) * 3, y, 3, 3);
  g.strokeStyle = `#${shade(style.trim, -0.1).getHexString()}`;
  g.globalAlpha = 0.65;
  g.lineWidth = 3;
  g.setLineDash([7, 5]);
  for (const x of [20, 108]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** Rounded box whose upper half tapers, like a loaded pack. */
function taperedBody(width: number, height: number, depth: number): BufferGeometry {
  const geometry = new RoundedBoxGeometry(width, height, depth, 5, Math.min(0.06, depth * 0.35));
  const position = geometry.attributes.position as BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const t = Math.max(0, position.getY(i) / (height / 2));
    position.setX(i, position.getX(i) * (1 - 0.1 * t));
    // Taper away from the wearer's back (+z) only.
    const z = position.getZ(i);
    if (z < 0) position.setZ(i, z * (1 - 0.3 * t));
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A padded shoulder strap: a flattened, rounded cross-section swept along a
 * path that is rebuilt when the wearer's proportions change. Vertices are
 * updated in place, never reallocated.
 */
class Strap {
  readonly mesh: Mesh;
  private readonly geometry = new BufferGeometry();
  private readonly positions: Float32Array;
  private readonly profile: Array<[number, number]> = [];
  private readonly curve = new CatmullRomCurve3([], false, 'centripetal');
  private readonly point = new Vector3();
  private readonly tangent = new Vector3();
  private readonly normal = new Vector3();
  private readonly side = new Vector3(1, 0, 0);

  constructor(material: Material) {
    // Superellipse profile: flat faces with soft, padded edges.
    for (let k = 0; k < PROFILE; k++) {
      const a = (k / PROFILE) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      this.profile.push([(STRAP_WIDTH / 2) * Math.sign(c) * Math.abs(c) ** 0.35, (STRAP_THICKNESS / 2) * Math.sign(s) * Math.abs(s) ** 0.6]);
    }
    const ring = PROFILE + 1; // duplicate seam vertex for clean UVs
    this.positions = new Float32Array(STRAP_SAMPLES * ring * 3);
    const uvs = new Float32Array(STRAP_SAMPLES * ring * 2);
    const index: number[] = [];
    for (let i = 0; i < STRAP_SAMPLES; i++) {
      for (let k = 0; k < ring; k++) {
        uvs[(i * ring + k) * 2] = k / PROFILE;
        uvs[(i * ring + k) * 2 + 1] = (i / (STRAP_SAMPLES - 1)) * 8;
        if (i < STRAP_SAMPLES - 1 && k < PROFILE) {
          const a = i * ring + k, b = a + ring;
          index.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
    this.geometry.setIndex(index);
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
  }

  setPath(points: Vector3[], scale: number) {
    this.curve.points = points;
    const p = this.positions;
    const ring = PROFILE + 1;
    for (let i = 0; i < STRAP_SAMPLES; i++) {
      const t = i / (STRAP_SAMPLES - 1);
      this.curve.getPointAt(t, this.point);
      this.curve.getTangentAt(t, this.tangent);
      this.normal.crossVectors(this.tangent, this.side).normalize();
      for (let k = 0; k < ring; k++) {
        const w = this.profile[k % PROFILE][0] * scale, n = this.profile[k % PROFILE][1] * scale;
        const o = (i * ring + k) * 3;
        p[o] = this.point.x + this.side.x * w + this.normal.x * n;
        p[o + 1] = this.point.y + this.side.y * w + this.normal.y * n;
        p[o + 2] = this.point.z + this.side.z * w + this.normal.z * n;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}

/**
 * Backpack in torso space: origin at the shoulder midpoint, x towards screen
 * right, y up, z out of the chest. 1 unit = 1 metre.
 */
export class BackpackModel {
  readonly root = new Group();
  private readonly pack = new Group();
  private readonly straps: Strap[];
  private readonly sternum: Mesh;
  private readonly size: ReturnType<typeof packSize>;
  private fittedHalfWidth = 0;
  private fittedLength = 0;

  constructor(style: BackpackStyle) {
    this.root.name = 'backpack';
    const size = (this.size = packSize(style.liters));
    const normalMap = fabricNormalMap().clone();
    normalMap.repeat.set(8, 8);
    const normalScale = new Vector2(0.35, 0.35);
    const fabric = (hex: string, roughness = 0.82) => new MeshStandardMaterial({ color: color(hex), normalMap, normalScale, roughness, metalness: 0 });
    const bodyMaterial = fabric(style.body);
    const pocketMaterial = new MeshStandardMaterial({ color: shade(style.body, 0.06), normalMap, normalScale, roughness: 0.78 });
    const accentMaterial = fabric(style.accent, 0.9);
    const trimMaterial = new MeshStandardMaterial({ color: color(style.trim), roughness: 0.45, metalness: 0.2 });
    const { width: W, height: H, depth: D } = size;

    this.pack.add(new Mesh(taperedBody(W, H, D), bodyMaterial));

    // Padded back panel against the wearer.
    const back = new Mesh(new RoundedBoxGeometry(W * 0.88, H * 0.84, 0.035, 3, 0.015), accentMaterial);
    back.position.set(0, -H * 0.02, D / 2);
    this.pack.add(back);

    // Base panel.
    const base = new Mesh(new RoundedBoxGeometry(W * 1.01, 0.075, D * 1.02, 3, 0.03), accentMaterial);
    base.position.y = -H / 2 + 0.03;
    this.pack.add(base);

    // Front pocket on the outer face (-z), with zipper and pull.
    const pocketH = H * 0.42;
    const pocket = new Mesh(new RoundedBoxGeometry(W * 0.76, pocketH, 0.055, 4, 0.024), pocketMaterial);
    pocket.position.set(0, -H * 0.18, -D / 2 + 0.012);
    this.pack.add(pocket);
    const zipY = pocket.position.y + pocketH / 2 - 0.03;
    const zipper = new TubeGeometry(new CatmullRomCurve3([
      new Vector3(-W * 0.34, zipY - 0.03, -D / 2 - 0.016), new Vector3(0, zipY + 0.012, -D / 2 - 0.018), new Vector3(W * 0.34, zipY - 0.03, -D / 2 - 0.016),
    ]), 20, 0.0045, 6);
    this.pack.add(new Mesh(zipper, trimMaterial));
    const pull = new Mesh(new BoxGeometry(0.012, 0.04, 0.006), trimMaterial);
    pull.position.set(W * 0.24, zipY - 0.035, -D / 2 - 0.022);
    this.pack.add(pull);

    // Main zipper running over the top.
    const mainZip = new TubeGeometry(new CatmullRomCurve3([
      new Vector3(-W * 0.47, H * 0.2, -D * 0.2), new Vector3(-W * 0.3, H * 0.47, -D * 0.25),
      new Vector3(W * 0.3, H * 0.47, -D * 0.25), new Vector3(W * 0.47, H * 0.2, -D * 0.2),
    ]), 24, 0.004, 6);
    this.pack.add(new Mesh(mainZip, trimMaterial));

    // Logo patch, readable from behind the wearer.
    const logo = new Mesh(new PlaneGeometry(0.11, 0.031), new MeshStandardMaterial({ map: logoTexture(style), roughness: 0.6 }));
    logo.position.set(0, pocket.position.y - pocketH * 0.12, -D / 2 - 0.0165);
    logo.rotation.y = Math.PI;
    this.pack.add(logo);

    // Grab handle.
    const handle = new Mesh(new TorusGeometry(0.035, 0.009, 8, 20, Math.PI), accentMaterial);
    handle.position.set(0, H / 2 - 0.005, D * 0.22);
    this.pack.add(handle);

    // Floating lid on big packs.
    if (style.liters >= 30) {
      const lid = new Mesh(new RoundedBoxGeometry(W * 0.98, 0.1, D * 1.08, 4, 0.04), fabric(`#${shade(style.body, -0.15).getHexString()}`));
      lid.position.set(0, H / 2 - 0.02, -0.01);
      this.pack.add(lid);
    }

    // Side compression straps with buckles.
    for (const side of [1, -1]) {
      for (const y of [-H * 0.12, H * 0.16]) {
        const strap = new Mesh(new BoxGeometry(0.012, 0.022, D * 0.75), accentMaterial);
        strap.position.set(side * (W / 2 - 0.004), y, -0.01);
        this.pack.add(strap);
        const buckle = new Mesh(new BoxGeometry(0.016, 0.03, 0.035), trimMaterial);
        buckle.position.set(side * (W / 2 + 0.002), y, -D * 0.22);
        this.pack.add(buckle);
      }
    }

    this.root.add(this.pack);

    const strapMaterial = new MeshStandardMaterial({ map: strapTexture(style), normalMap, normalScale, roughness: 0.85 });
    this.straps = [new Strap(strapMaterial), new Strap(strapMaterial)];
    for (const strap of this.straps) this.root.add(strap.mesh);
    this.sternum = new Mesh(new BoxGeometry(1, 0.014, 0.008), accentMaterial);
    const clip = new Mesh(new BoxGeometry(0.03, 0.026, 0.012), trimMaterial);
    clip.name = 'sternum-clip';
    this.root.add(this.sternum, clip);
    this.fit(0.19, 0.5);
  }

  /**
   * Re-shape the harness to the wearer. Cheap to call every frame: it only
   * rebuilds when proportions changed by more than ~1.5 %.
   */
  fit(shoulderHalfWidth: number, torsoLength: number) {
    const hw = Math.min(0.26, Math.max(0.13, shoulderHalfWidth));
    const L = Math.min(0.62, Math.max(0.36, torsoLength));
    if (Math.abs(hw - this.fittedHalfWidth) < hw * 0.015 && Math.abs(L - this.fittedLength) < L * 0.015) return;
    this.fittedHalfWidth = hw;
    this.fittedLength = L;

    const hd = hw * 0.6; // half torso depth
    // Pose landmarks measure joint-to-joint, narrower than real shoulders
    // (~0.38 m). Size the pack and webbing relative to the body they see.
    const k = Math.min(1.15, Math.max(0.72, (2 * hw) / 0.38));
    const H = this.size.height * k, D = this.size.depth * k, top = this.size.top * k;
    this.pack.scale.setScalar(k);
    this.pack.position.set(0, top - H / 2, -(hd + D / 2 + 0.01));
    const ly = L / 0.5;
    this.straps.forEach((strap, i) => {
      const s = i === 0 ? 1 : -1;
      strap.setPath([
        new Vector3(s * hw * 0.32, top - 0.05 * k, -hd - 0.02),
        new Vector3(s * hw * 0.46, 0.06, -hd * 0.35),
        new Vector3(s * hw * 0.53, 0.055, hd * 0.45),
        new Vector3(s * hw * 0.56, -0.03, hd * 1.0),
        new Vector3(s * hw * 0.62, -0.13 * ly, hd * 1.06),
        new Vector3(s * hw * 0.8, -0.22 * ly, hd * 0.92),
        new Vector3(s * hw * 0.98, -0.27 * ly, hd * 0.3),
        new Vector3(s * hw * 0.86, -0.3 * ly, -hd - 0.03),
      ], k);
    });
    const sternumY = -0.1 * ly;
    const strapX = hw * 0.6;
    this.sternum.scale.set(strapX * 2, k, k);
    this.sternum.position.set(0, sternumY, hd * 1.05 + 0.012);
    this.root.getObjectByName('sternum-clip')!.position.set(0, sternumY, hd * 1.05 + 0.02);
  }
}
