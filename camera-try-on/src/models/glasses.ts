import {
  BufferAttribute, CatmullRomCurve3, ExtrudeGeometry, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial,
  QuadraticBezierCurve3, Shape, ShapeGeometry, SphereGeometry, TubeGeometry, Vector2, Vector3,
} from '@iwsdk/core';
import { lensSpec, offsetOutline, outlineBounds } from '../lens-shapes.js';
import type { GlassesStyle } from '../products.js';
import { productEnvironment } from './environment.js';
import { color, OCCLUDER_ORDER, occluderMaterial } from './materials.js';

/** Frames sit this far in front of the eyes (units: outer-eye-corner distance). */
const FRONT_Z = 0.2;
/** Lenses wrap slightly around the face. */
const WRAP = 0.1;
/** Frames are worn about as wide as the face at the temples. */
const FRAME_SCALE = 1.1;

/**
 * Glasses in head space: origin between the eyes, x towards screen right,
 * y up, z out of the face. 1 unit = distance between the outer eye corners.
 */
export function buildGlasses(style: GlassesStyle): Group {
  const spec = lensSpec(style.shape);
  const outer = offsetOutline(spec.points, spec.rim);
  const bounds = outlineBounds(outer);
  const rimDepth = style.metal ? 0.022 : 0.055;

  const frameMaterial = style.metal
    ? new MeshStandardMaterial({ color: color(style.frame), metalness: 1, roughness: 0.2, envMap: productEnvironment(), envMapIntensity: 1.4 })
    : new MeshPhysicalMaterial({ color: color(style.frame), roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, envMap: productEnvironment(), envMapIntensity: 0.9 });
  const lensMaterial = new MeshPhysicalMaterial({
    color: color(style.lens), transparent: true, opacity: Math.max(0.08, style.lensOpacity),
    roughness: 0.04, metalness: 0.1, clearcoat: 1, envMap: productEnvironment(), envMapIntensity: 1.6, depthWrite: false, vertexColors: true,
  });

  const root = new Group();
  root.name = 'glasses';
  const frame = new Group();
  frame.scale.setScalar(FRAME_SCALE);
  root.add(frame);

  const rimShape = new Shape(outer.map(([x, y]) => new Vector2(x, y)));
  rimShape.holes.push(new Shape(spec.points.map(([x, y]) => new Vector2(x, y))));
  const lensShape = new Shape(spec.points.map(([x, y]) => new Vector2(x, y)));
  const rimGeometry = new ExtrudeGeometry(rimShape, {
    depth: rimDepth, bevelEnabled: true, bevelThickness: rimDepth * 0.25, bevelSize: Math.min(spec.rim * 0.35, 0.012), bevelSegments: 3, curveSegments: 4,
  });
  rimGeometry.translate(0, 0, -rimDepth / 2);
  const lensGeometry = gradientLens(new ShapeGeometry(lensShape, 4));

  for (const side of [1, -1] as const) {
    const eye = new Group();
    eye.position.set(side * spec.centerX, spec.centerY, FRONT_Z);
    eye.rotation.y = -side * WRAP;
    const rim = new Mesh(rimGeometry, frameMaterial);
    if (side < 0) rim.scale.x = -1;
    const lens = new Mesh(lensGeometry, lensMaterial);
    lens.scale.x = side;
    lens.renderOrder = 2;
    eye.add(rim, lens);
    frame.add(eye);
  }

  // Bridge between the rims.
  const innerX = spec.centerX + bounds.minX + spec.rim * 0.5;
  const bridgeY = spec.centerY + bounds.maxY * 0.45;
  const bridgeRadius = style.metal ? 0.011 : 0.032;
  const bridge = new TubeGeometry(new QuadraticBezierCurve3(
    new Vector3(-innerX, bridgeY, FRONT_Z), new Vector3(0, bridgeY + 0.07, FRONT_Z + 0.02), new Vector3(innerX, bridgeY, FRONT_Z),
  ), 12, bridgeRadius, 8);
  frame.add(new Mesh(bridge, frameMaterial));
  if (style.shape === 'aviator') {
    // Signature brow bar.
    const browY = spec.centerY + bounds.maxY - 0.01;
    const brow = new TubeGeometry(new QuadraticBezierCurve3(
      new Vector3(-innerX - 0.12, browY, FRONT_Z), new Vector3(0, browY + 0.03, FRONT_Z + 0.025), new Vector3(innerX + 0.12, browY, FRONT_Z),
    ), 12, 0.011, 8);
    frame.add(new Mesh(brow, frameMaterial));
    // Nose pads.
    const pad = new SphereGeometry(0.03, 10, 8);
    pad.scale(0.6, 1, 0.45);
    for (const side of [1, -1]) {
      const mesh = new Mesh(pad, new MeshPhysicalMaterial({ color: '#f4f1ea', transparent: true, opacity: 0.55, roughness: 0.2 }));
      mesh.position.set(side * (innerX - 0.03), spec.centerY - 0.08, FRONT_Z - 0.06);
      frame.add(mesh);
    }
  }

  // Temples run back from the hinges, hugging the head, to behind the ears.
  const hingeX = spec.centerX + bounds.maxX * Math.cos(WRAP) - 0.005;
  const hingeY = spec.centerY + spec.hingeY;
  const hingeZ = FRONT_Z - bounds.maxX * Math.sin(WRAP);
  const templeRadius = style.metal ? 0.011 : 0.024;
  for (const side of [1, -1]) {
    const curve = new CatmullRomCurve3([
      new Vector3(side * hingeX, hingeY, hingeZ),
      new Vector3(side * (hingeX + 0.01), hingeY + 0.005, hingeZ - 0.3),
      new Vector3(side * (hingeX + 0.005), hingeY - 0.02, hingeZ - 0.88),
      new Vector3(side * (hingeX - 0.08), hingeY - 0.18, hingeZ - 1.05),
    ]);
    frame.add(new Mesh(new TubeGeometry(curve, 24, templeRadius, 8), frameMaterial));
    if (!style.metal) {
      // Hinge block linking rim and temple on acetate frames.
      const block = new Mesh(new SphereGeometry(0.035, 12, 8), frameMaterial);
      block.scale.set(0.8, 1.4, 1.2);
      block.position.set(side * hingeX, hingeY, hingeZ - 0.01);
      frame.add(block);
    }
  }

  root.add(buildHeadOccluder());
  return root;
}

/** Gradient tint: darker at the top of the lens, like most sunglasses. */
function gradientLens(geometry: ShapeGeometry): ShapeGeometry {
  const position = geometry.attributes.position;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const t = (position.getY(i) - min.y) / (max.y - min.y || 1);
    colors.fill(1.25 - 0.6 * t, i * 3, i * 3 + 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

/** Depth-only stand-in for the wearer's head (same units as the glasses). */
export function buildHeadOccluder(): Mesh {
  const head = new Mesh(new SphereGeometry(1, 32, 24), occluderMaterial());
  head.name = 'head-occluder';
  head.scale.set(0.72, 1.2, 1.08);
  head.position.set(0, 0.12, -0.98);
  head.renderOrder = OCCLUDER_ORDER;
  return head;
}
