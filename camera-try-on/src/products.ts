/**
 * Product contract shared by the backend (server/) and the app (src/).
 * Type-only plus tiny pure helpers: safe to import from Node and the browser.
 */

export type TryOnKind = 'glasses' | 'cap' | 'backpack';

export interface GlassesStyle {
  kind: 'glasses';
  shape: 'aviator' | 'wayfarer' | 'round';
  frame: string;
  lens: string;
  /** 0 = clear, 1 = fully opaque. */
  lensOpacity: number;
  metal: boolean;
}

export interface CapStyle {
  kind: 'cap';
  crown: string;
  brim: string;
  accent: string;
}

export interface BackpackStyle {
  kind: 'backpack';
  body: string;
  accent: string;
  trim: string;
  /** Volume drives the rendered size of the pack. */
  liters: number;
}

export type TryOnStyle = GlassesStyle | CapStyle | BackpackStyle;

export interface ProductVariant {
  id: string;
  name: string;
  /** CSS colour shown in the swatch. */
  swatch: string;
  /** Colour overrides applied to the base try-on style. */
  colors: Record<string, string>;
  imageUrl: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: 'Eyewear' | 'Headwear' | 'Backpacks';
  price: { amount: number; currency: string };
  description: string;
  imageUrl: string;
  tryOn: TryOnStyle;
  variants: ProductVariant[];
}

export interface ProductsResponse {
  products: Product[];
}

export function formatPrice(price: Product['price']): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency, maximumFractionDigits: price.amount % 1 ? 2 : 0 }).format(price.amount);
}

/** Merge a variant's colour overrides into the product's base style. */
export function styleFor(product: Product, variant?: ProductVariant): TryOnStyle {
  return { ...product.tryOn, ...(variant?.colors ?? {}) } as TryOnStyle;
}
