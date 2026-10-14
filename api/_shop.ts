const SHOP_MCP_URL = 'https://mcp.shop.com/';
const PROTOCOL_VERSION = '2026-07-28';

export type ProductCard = {
  productId: string;
  variantId: string;
  title: string;
  imageUrl?: string;
  priceMinor: number;
  currency: string;
  seller: string;
  url: string;
  available: boolean;
};

export type SearchResponse = {
  query: string;
  products: ProductCard[];
  warnings: string[];
};

type ShopPrice = { amount?: unknown; currency?: unknown };
type ShopVariant = {
  id?: unknown;
  price?: ShopPrice;
  availability?: { available?: unknown };
  seller?: { name?: unknown };
  url?: unknown;
};
type ShopProduct = {
  id?: unknown;
  title?: unknown;
  media?: Array<{ type?: unknown; url?: unknown }>;
  variants?: ShopVariant[];
};

export function parseShoppingRequest(text: string): {
  query: string;
  maxPriceMinor?: number;
} {
  const trimmed = text.trim().slice(0, 300);
  const budget = trimmed.match(
    /\b(?:under|below|less than)\s*(?:US\s*)?(?:\$\s*)?(\d+(?:\.\d{1,2})?)\s*(?:US\s*dollars?|USD|dollars?)?/i,
  );
  const maxPriceMinor = budget
    ? Math.ceil(Number(budget[1]) * 100) - 1
    : undefined;
  const query = trimmed
    .replace(budget?.[0] ?? '', ' ')
    .replace(/^\s*(?:please\s+)?(?:find|show|get|search\s+for)\s+(?:me\s+)?(?:some\s+|a\s+|an\s+)?/i, '')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { query, maxPriceMinor };
}

function httpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function normalizeProducts(
  products: ShopProduct[],
  currency: string,
  maxPriceMinor?: number,
): ProductCard[] {
  const cards: ProductCard[] = [];
  for (const product of products) {
    const variant = product.variants?.[0];
    const price = variant?.price;
    if (
      typeof product.id !== 'string' ||
      typeof product.title !== 'string' ||
      typeof variant?.id !== 'string' ||
      typeof price?.amount !== 'number' ||
      !Number.isSafeInteger(price.amount) ||
      price.amount < 0 ||
      price.currency !== currency ||
      variant.availability?.available !== true ||
      !httpUrl(variant.url)
    ) continue;
    if (maxPriceMinor !== undefined && price.amount > maxPriceMinor) continue;

    const image = product.media?.find(
      (item) => item.type === 'image' && httpUrl(item.url),
    );
    cards.push({
      productId: product.id,
      variantId: variant.id,
      title: product.title,
      ...(image && typeof image.url === 'string' ? { imageUrl: image.url } : {}),
      priceMinor: price.amount,
      currency,
      seller: typeof variant.seller?.name === 'string' ? variant.seller.name : 'Merchant',
      url: variant.url,
      available: true,
    });
    if (cards.length === 6) break;
  }
  return cards;
}

export async function searchShop(text: string): Promise<SearchResponse> {
  const { query, maxPriceMinor } = parseShoppingRequest(text);
  if (query.length < 2) throw new Error('Say or type a product to search for.');
  if (maxPriceMinor !== undefined && maxPriceMinor < 0) {
    throw new Error('The price limit must be greater than zero.');
  }

  // This first demo is explicitly scoped to US shoppers and USD prices.
  const currency = 'USD';
  const response = await fetch(SHOP_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL_VERSION,
      'Mcp-Method': 'tools/call',
      'Mcp-Name': 'search_catalog',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'search_catalog',
        arguments: {
          catalog: {
            query,
            context: { address_country: 'US', currency },
            ...(maxPriceMinor !== undefined
              ? { filters: { price: { max: maxPriceMinor } } }
              : {}),
            pagination: { limit: 18 },
          },
        },
        _meta: {
          'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
          'io.modelcontextprotocol/clientInfo': {
            name: 'fast-forward-spatial-shop',
            version: '0.1.0',
          },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
    signal: AbortSignal.timeout(15000),
  });

  const payload = await response.json() as {
    error?: { message?: string };
    result?: {
      isError?: boolean;
      structuredContent?: {
        products?: ShopProduct[];
        messages?: Array<{ type?: unknown; content?: unknown }>;
      };
    };
  };
  if (!response.ok || payload.error || payload.result?.isError) {
    throw new Error(payload.error?.message ?? 'Shop search failed. Please try again.');
  }
  const content = payload.result?.structuredContent;
  if (!Array.isArray(content?.products)) {
    throw new Error('Shop returned an unexpected response. Please try again.');
  }

  return {
    query,
    products: normalizeProducts(content.products, currency, maxPriceMinor),
    warnings: (content.messages ?? [])
      .filter((message) => message.type === 'warning' && typeof message.content === 'string')
      .map((message) => message.content as string),
  };
}
