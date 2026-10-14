import type { Product, TryOnStyle } from '../src/products.js';

/**
 * Demo catalog. Swap `listProducts()` for a real commerce backend (Shopify,
 * a CMS, …) — the app only depends on the `Product` contract.
 */
interface Seed {
  id: string;
  name: string;
  brand: string;
  category: Product['category'];
  price: number;
  description: string;
  tryOn: TryOnStyle;
  variants: Array<{ id: string; name: string; swatch: string; colors: Record<string, string> }>;
}

const seeds: Seed[] = [
  {
    id: 'sundial-aviator', name: 'Sundial Aviator', brand: 'Lumen Optics', category: 'Eyewear', price: 149,
    description: 'Featherweight metal aviator with gradient polarized lenses.',
    tryOn: { kind: 'glasses', shape: 'aviator', frame: '#c9a45c', lens: '#4a2c14', lensOpacity: 0.72, metal: true },
    variants: [
      { id: 'gold', name: 'Gold / Amber', swatch: '#c9a45c', colors: {} },
      { id: 'silver', name: 'Silver / Ocean', swatch: '#c3c7cc', colors: { frame: '#c3c7cc', lens: '#1f3550' } },
      { id: 'gunmetal', name: 'Gunmetal / G-15', swatch: '#4a4d52', colors: { frame: '#4a4d52', lens: '#22382a' } },
    ],
  },
  {
    id: 'night-owl', name: 'Night Owl Wayfarer', brand: 'Lumen Optics', category: 'Eyewear', price: 119,
    description: 'Bold acetate wayfarer. The everyday classic, polarized.',
    tryOn: { kind: 'glasses', shape: 'wayfarer', frame: '#121212', lens: '#18241c', lensOpacity: 0.86, metal: false },
    variants: [
      { id: 'black', name: 'Gloss Black', swatch: '#121212', colors: {} },
      { id: 'tortoise', name: 'Havana Tortoise', swatch: '#6b3b1c', colors: { frame: '#6b3b1c', lens: '#2c2216' } },
      { id: 'crystal', name: 'Crystal Rose', swatch: '#d8b4b0', colors: { frame: '#d8b4b0', lens: '#6b4b55' } },
    ],
  },
  {
    id: 'studio-round', name: 'Studio Round', brand: 'Lumen Optics', category: 'Eyewear', price: 95,
    description: 'Round acetate optical frame with clear blue-light lenses.',
    tryOn: { kind: 'glasses', shape: 'round', frame: '#7a4526', lens: '#b8cde0', lensOpacity: 0.16, metal: false },
    variants: [
      { id: 'amber', name: 'Amber', swatch: '#7a4526', colors: {} },
      { id: 'ink', name: 'Ink', swatch: '#1c1f26', colors: { frame: '#1c1f26' } },
      { id: 'sage', name: 'Sage', swatch: '#7f9180', colors: { frame: '#7f9180' } },
    ],
  },
  {
    id: 'trailhead-cap', name: 'Trailhead Cap', brand: 'Fast Forward Supply', category: 'Headwear', price: 38,
    description: 'Six-panel brushed cotton cap with a pre-curved brim.',
    tryOn: { kind: 'cap', crown: '#2f4a3a', brim: '#2a4234', accent: '#ece4cf' },
    variants: [
      { id: 'forest', name: 'Forest', swatch: '#2f4a3a', colors: {} },
      { id: 'navy', name: 'Navy', swatch: '#1f2d48', colors: { crown: '#1f2d48', brim: '#1a263d' } },
      { id: 'sand', name: 'Sand', swatch: '#c9b38c', colors: { crown: '#c9b38c', brim: '#bba47c', accent: '#33302a' } },
    ],
  },
  {
    id: 'studio-dad-cap', name: 'Studio Dad Cap', brand: 'Fast Forward Supply', category: 'Headwear', price: 32,
    description: 'Unstructured washed twill with a low, relaxed profile.',
    tryOn: { kind: 'cap', crown: '#e7e1d3', brim: '#ddd6c6', accent: '#1d1d1d' },
    variants: [
      { id: 'bone', name: 'Bone', swatch: '#e7e1d3', colors: {} },
      { id: 'black', name: 'Black', swatch: '#1b1b1b', colors: { crown: '#1b1b1b', brim: '#151515', accent: '#f2f2f2' } },
      { id: 'rust', name: 'Rust', swatch: '#a4492c', colors: { crown: '#a4492c', brim: '#963f25', accent: '#f4ead9' } },
    ],
  },
  {
    id: 'summit-28', name: 'Summit 28L Daypack', brand: 'Ridgeline', category: 'Backpacks', price: 129,
    description: 'Ventilated hiking daypack with hip-belt pockets and a rain cover.',
    tryOn: { kind: 'backpack', body: '#3f5d4a', accent: '#232725', trim: '#e3b23c', liters: 28 },
    variants: [
      { id: 'moss', name: 'Moss', swatch: '#3f5d4a', colors: {} },
      { id: 'glacier', name: 'Glacier', swatch: '#5d7f99', colors: { body: '#5d7f99' } },
      { id: 'ember', name: 'Ember', swatch: '#b5492f', colors: { body: '#b5492f', trim: '#f1e6d2' } },
    ],
  },
  {
    id: 'ridge-22', name: 'Ridge 22L Commuter', brand: 'Ridgeline', category: 'Backpacks', price: 89,
    description: 'Slim weatherproof commuter with a padded 16" laptop sleeve.',
    tryOn: { kind: 'backpack', body: '#2a2c30', accent: '#17181a', trim: '#cfd3d6', liters: 22 },
    variants: [
      { id: 'graphite', name: 'Graphite', swatch: '#2a2c30', colors: {} },
      { id: 'sand', name: 'Sand', swatch: '#b9a585', colors: { body: '#b9a585', trim: '#3a3631' } },
      { id: 'navy', name: 'Navy', swatch: '#24324f', colors: { body: '#24324f' } },
    ],
  },
  {
    id: 'basecamp-40', name: 'Basecamp 40L Trekker', brand: 'Ridgeline', category: 'Backpacks', price: 149,
    description: 'Multi-day trekking pack with a floating lid and side compression.',
    tryOn: { kind: 'backpack', body: '#c4552d', accent: '#2e3032', trim: '#f0eadc', liters: 40 },
    variants: [
      { id: 'canyon', name: 'Canyon', swatch: '#c4552d', colors: {} },
      { id: 'slate', name: 'Slate', swatch: '#55626b', colors: { body: '#55626b' } },
      { id: 'pine', name: 'Pine', swatch: '#2f4f3b', colors: { body: '#2f4f3b', trim: '#e3b23c' } },
    ],
  },
];

const imageUrl = (id: string, variant: string) => `/api/products/${id}/image.svg?variant=${variant}`;

export function listProducts(): Product[] {
  return seeds.map(seed => ({
    id: seed.id,
    name: seed.name,
    brand: seed.brand,
    category: seed.category,
    price: { amount: seed.price, currency: 'USD' },
    description: seed.description,
    imageUrl: imageUrl(seed.id, seed.variants[0].id),
    tryOn: seed.tryOn,
    variants: seed.variants.map(variant => ({ ...variant, imageUrl: imageUrl(seed.id, variant.id) })),
  }));
}

export function findProduct(id: string): Product | undefined {
  return listProducts().find(product => product.id === id);
}
