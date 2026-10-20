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
export const formatPrice = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);

export interface CheckoutResult {
  id: string;
  status: string;
  continueUrl: string;
  product: Product;
  quantity: number;
  totals: { label: string; amount: number }[];
}
/** A Universal Commerce Protocol checkout tool call sent to Shop MCP. */
export interface UcpCommand { name: 'create_checkout' | 'get_checkout'; arguments: Record<string, unknown> }
export interface VoiceCheckoutResult {
  transcript: string;
  quantity: number;
  command: UcpCommand;
  checkout: CheckoutResult;
  redirectUrl: string;
}
