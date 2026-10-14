export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: 'USD';
  imageUrl: string;
  imageUrls?: string[];
  catalogProductId?: string;
  previewMode: 'backpack' | 'wearable' | 'object';
  url: string;
  seller: string;
  sellerDomain?: string;
}
export interface SearchResult { products: Product[]; message: string; query: string }
export const DEFAULT_QUERY = 'Find me a camping backpack under 150 US dollars';
export const PREPARED_VARIANT_ID = 'gid://shopify/ProductVariant/36808158601';
export const PREPARED_MODEL_URL = '/demo/rich-with-backpack.glb';
export const DEMO_PRODUCT: Product = {
  id: PREPARED_VARIANT_ID,
  title: '30L Stealth Angel backpack · Black',
  description: 'A 30L water-resistant backpack with five compartments, prepared for the Rich 3D demo.',
  price: 2495,
  currency: 'USD',
  imageUrl: 'https://cdn.shopify.com/s/files/1/1660/4869/products/30L-military-style-rucksack-black.jpg',
  catalogProductId: 'gid://shopify/p/6dqHP6NdJvw6aEAGKrGX7S',
  previewMode: 'backpack',
  url: 'https://www.stealthangelsurvival.com/products/military-style-outdoor-30l-waterproof-rucksack-backpack?variant=36808158601',
  seller: 'Stealth Angel Survival',
  sellerDomain: 'www.stealthangelsurvival.com',
};
export const formatPrice = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);

export interface CheckoutResult {
  id: string;
  status: string;
  continueUrl: string;
  product: Product;
  quantity: 1;
  totals: { label: string; amount: number }[];
}
