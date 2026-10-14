export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: 'USD';
  imageUrl: string;
  url: string;
  seller: string;
  sellerDomain?: string;
}
export interface SearchResult { products: Product[]; message: string; query: string }
export const DEFAULT_QUERY = 'Find me a camping backpack under 150 US dollars';
export const formatPrice = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);

export interface CheckoutResult {
  id: string;
  status: string;
  continueUrl: string;
  product: Product;
  quantity: 1;
  totals: { label: string; amount: number }[];
}
