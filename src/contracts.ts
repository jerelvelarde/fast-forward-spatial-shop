export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: 'USD';
  imageUrl: string;
  url: string;
  seller: string;
}
export interface SearchResult { products: Product[]; message: string; query: string }
export const DEFAULT_QUERY = 'Find me a camping backpack under 150 US dollars';
export const formatPrice = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
