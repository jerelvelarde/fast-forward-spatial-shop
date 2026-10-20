import type { Product } from '../src/contracts.js';

/**
 * Demo catalog for voice checkout. Each entry is a real Shopify variant captured
 * from Shop MCP `search_catalog` on 2026-10-14, so UCP `create_checkout` returns a
 * real merchant checkout. Prices can drift; checkout then fails closed with 409.
 */
export const SAMPLE_PRODUCTS: readonly Product[] = [
  {
    id: 'gid://shopify/ProductVariant/36808158601',
    catalogProductId: 'gid://shopify/p/6dqHP6NdJvw6aEAGKrGX7S',
    title: '30L Military Style Waterproof Rucksack',
    description: 'A 30 liter waterproof day pack for camping and travel.',
    price: 2495, currency: 'USD', previewMode: 'backpack',
    imageUrl: 'https://cdn.shopify.com/s/files/1/1660/4869/products/30L-military-style-rucksack-black.jpg?width=512',
    url: 'https://www.stealthangelsurvival.com/products/military-style-outdoor-30l-waterproof-rucksack-backpack?variant=36808158601',
    seller: 'Stealth Angel Survival', sellerDomain: 'dark-angel-survival.myshopify.com',
  },
  {
    id: 'gid://shopify/ProductVariant/43610243956923',
    catalogProductId: 'gid://shopify/p/6CTKtUQRmbhF1pfT9A2Yc8',
    title: 'Cascade Backpack - Standard',
    description: 'An everyday and trail backpack from Portland Gear.',
    price: 10900, currency: 'USD', previewMode: 'backpack',
    imageUrl: 'https://cdn.shopify.com/s/files/1/0707/5251/files/PG-Cascade-Standard-Black-Front_8a68b986-756e-465a-b196-33a1c9a084d6.jpg?width=512',
    url: 'https://portlandgear.com/products/cascade-backpack-black?variant=43610243956923',
    seller: 'Portland Gear', sellerDomain: 'portland-gear.myshopify.com',
  },
  {
    id: 'gid://shopify/ProductVariant/52107341693208',
    catalogProductId: 'gid://shopify/p/i1dIJDmTZtsgrdiFEVz1y',
    title: 'STM-TEX Short Oversized Rain Jacket',
    description: 'A one-size waterproof rain jacket.',
    price: 6999, currency: 'USD', previewMode: 'wearable',
    imageUrl: 'https://cdn.shopify.com/s/files/1/0960/2872/1432/files/stm-tex-one-size-short-oversized-rain-jacket-stay-puffit-puffit-9889440.webp?width=512',
    url: 'https://puffit.com/products/stm-tex-short-oversized-rain-jacket-stay-puffit?variant=52107341693208',
    seller: 'PUFFIT', sellerDomain: 'sicgvy-1v.myshopify.com',
  },
  {
    id: 'gid://shopify/ProductVariant/39499800772698',
    catalogProductId: 'gid://shopify/p/niYQxeDBXQeh9wfaLXHSl',
    title: 'Beacon Hanging Light',
    description: 'A rechargeable hanging camp lantern.',
    price: 2799, currency: 'USD', previewMode: 'object',
    imageUrl: 'https://cdn.shopify.com/s/files/1/0045/1297/2890/products/Beacon-SlateGray_PDP_01.jpg?width=512',
    url: 'https://barebonesliving.com/products/beacon?variant=39499800772698',
    seller: 'Barebones', sellerDomain: 'bareboneslivingtest.myshopify.com',
  },
];
