import { Group, Mesh, MeshBasicMaterial, TorusGeometry, CylinderGeometry, ConeGeometry } from '@iwsdk/core';
// Deterministic prototypes; geometry/materials remain immutable after registration.
const landscape = new Group();
const ground = new Mesh(new CylinderGeometry(12, 12, 0.08, 64), new MeshBasicMaterial({ color: '#121d1b' }));
ground.position.y = -0.08;
landscape.add(ground);
const ring = new Mesh(new TorusGeometry(3.7, 0.009, 6, 100), new MeshBasicMaterial({ color: '#527657' }));
ring.rotation.x = Math.PI / 2;
ring.position.y = -0.025;
landscape.add(ring);
const ridgeMaterial = new MeshBasicMaterial({ color: '#1d302b' });
for (let i = 0; i < 13; i++) {
  const ridge = new Mesh(new ConeGeometry(2.5 + (i % 3), 2.8 + (i % 4), 4), ridgeMaterial);
  const angle = i / 13 * Math.PI * 2;
  ridge.position.set(Math.cos(angle) * 16, 0.8, Math.sin(angle) * 16);
  ridge.rotation.y = angle;
  landscape.add(ridge);
}
export default landscape;
