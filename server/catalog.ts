import type { Product, SearchResult } from '../src/contracts.js';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown): string => typeof value === 'string' ? value : '';
const plain = (value: unknown): string => string(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const units = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const spokenAmounts = new Map<string, number>();
const belowHundred = (value: number): string => value < 20 ? units[value] : `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${units[value % 10]}` : ''}`;
for (let value = 1; value <= 150; value++) {
  if (value < 100) spokenAmounts.set(belowHundred(value), value);
  else {
    const tail = value % 100 ? ` ${belowHundred(value % 100)}` : '';
    for (const prefix of ['one hundred', 'a hundred']) {
      spokenAmounts.set(`${prefix}${tail}`, value);
      if (tail) spokenAmounts.set(`${prefix} and${tail}`, value);
    }
  }
}
const numberWord = `(?:${[...units, ...tens.filter(Boolean), 'hundred', 'thousand', 'million', 'and', 'a', 'point', 'minus', 'negative'].join('|')})`;
const leadingSpokenAmount = new RegExp(`^${numberWord}\\b(?:[\\s-]+${numberWord}\\b)*`, 'i');

function parseBudget(query: string): number {
  const marker = /\b(?:under|below|less than|up to|max(?:imum)?(?: of)?|budget(?: of| is)?)\b\s*|\$\s*/i.exec(query);
  const currency = /\b(?:USD|US dollars|dollars)\b/i.exec(query);
  if (!marker && !currency) return 150;
  let amount: string;
  if (marker) amount = query.slice(marker.index + marker[0].length).replace(/^\$\s*/, '').trim();
  else {
    const beforeCurrency = query.slice(0, currency!.index).trim();
    amount = beforeCurrency.match(new RegExp(`(?:[-+]?\\d+(?:\\.\\d+)?|${numberWord}(?:[\\s-]+${numberWord})*)$`, 'i'))?.[0] ?? '';
  }
  const numeric = amount.match(/^(\d+(?:\.\d{1,2})?)(?=\s|$|[!?])/);
  let dollars: number | undefined;
  if (numeric) {
    const rest = amount.slice(numeric[0].length).trim();
    if (!leadingSpokenAmount.test(rest)) dollars = Number(numeric[1]);
  } else {
    const spoken = amount.match(leadingSpokenAmount)?.[0].toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ');
    if (spoken) dollars = spokenAmounts.get(spoken);
  }
  if (dollars === undefined || !Number.isFinite(dollars) || dollars <= 0) throw new ApiError(400, 'Enter a positive budget in US dollars, such as “under 80 dollars”.');
  return dollars;
}

export function httpsUrl(value: unknown): string {
  try {
    const url = new URL(string(value));
    return url.protocol === 'https:' && !url.username && !url.password ? string(value) : '';
  } catch { return ''; }
}

export function searchIntent(value: unknown): { query: string; budget: number } {
  if (typeof value !== 'string' || value.trim().length < 3 || value.length > 300) throw new ApiError(400, 'Describe a camping backpack in 3–300 characters.');
  const query = value.trim();
  if (!/\b(backpack|rucksack|daypack|back pack)\b/i.test(query)) throw new ApiError(400, 'This demo searches camping backpacks. Try “camping backpack under 150 US dollars”.');
  if (/\b(EUR|GBP|CAD|AUD|euros?|pounds?|yen)\b|[€£¥]/i.test(query)) throw new ApiError(400, 'This demo supports prices in US dollars only.');
  const dollars = parseBudget(query);
  return { query, budget: Math.min(15000, Math.round(dollars * 100)) };
}

export function normalizeProducts(payload: unknown, budget: number): Product[] {
  const result: Product[] = [];
  const seen = new Set<string>();
  for (const entry of list(record(payload).products)) {
    const product = record(entry);
    const title = plain(product.title);
    const description = plain(record(product.description).plain);
    const metadata = record(product.metadata);
    const evidence = [title, description, ...list(metadata.top_features), ...list(metadata.tech_specs)].join(' ');
    if (!/\b(backpack|rucksack|daypack|back pack)\b/i.test(evidence) || !/\b(camping|hiking|trekking|backpacking|outdoor|trail)\b/i.test(evidence)) continue;
    for (const item of list(product.variants)) {
      const variant = record(item);
      const price = record(variant.price);
      const id = string(variant.id);
      const url = httpsUrl(variant.url);
      const media = [...list(variant.media), ...list(product.media)].map(record);
      const imageUrl = media.filter(m => m.type === 'image').map(m => httpsUrl(m.url)).find(Boolean) ?? '';
      if (!id || seen.has(id) || !url || !imageUrl || record(variant.availability).available !== true || price.currency !== 'USD' || !Number.isSafeInteger(price.amount) || Number(price.amount) <= 0 || Number(price.amount) >= Math.min(budget, 15000)) continue;
      seen.add(id);
      result.push({ id, title: plain(variant.title) || title, description: plain(record(variant.description).plain) || description, price: Number(price.amount), currency: 'USD', imageUrl, url, seller: plain(record(variant.seller).name) || 'Shopify merchant' });
    }
  }
  return result.slice(0, 12);
}

export async function searchCatalog(query: string, fetcher: typeof fetch = fetch): Promise<SearchResult> {
  const intent = searchIntent(query);
  let response: Response;
  try {
    response = await fetcher('https://mcp.shop.com/', {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'search_catalog' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_catalog', arguments: { catalog: { query: `${intent.query}; camping hiking backpack`, context: { address_country: 'US', currency: 'USD' }, filters: { price: { max: intent.budget - 1 } }, pagination: { limit: 24 } } }, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'fast-forward-spatial-shop', version: '0.1.0' }, 'io.modelcontextprotocol/clientCapabilities': {} } } }),
    });
  } catch { throw new ApiError(502, 'Shopify search could not connect. Please try again.'); }
  if (!response.ok) throw new ApiError(502, 'Shopify search is unavailable. Please try again.');
  let payload: RecordValue;
  try { payload = record(await response.json()); } catch { throw new ApiError(502, 'Shopify returned an unreadable response.'); }
  const rpcResult = record(payload.result);
  if (payload.error || rpcResult.isError) throw new ApiError(502, 'Shopify could not complete this search. Please try again.');
  const data = record(rpcResult.structuredContent);
  if (!Array.isArray(data.products)) throw new ApiError(502, 'Shopify returned no valid catalog response.');
  const products = normalizeProducts(data, intent.budget);
  const notices = list(data.messages).map(m => typeof m === 'string' ? plain(m) : plain(record(m).message ?? record(m).text)).filter(Boolean).join(' ').slice(0, 800);
  const budgetLabel = (intent.budget / 100).toFixed(intent.budget % 100 ? 2 : 0);
  const summary = products.length ? `${products.length} available outdoor backpacks below $${budgetLabel} USD. Prices exclude shipping and tax.` : `No available camping backpacks below $${budgetLabel} USD matched. Try a broader backpack search.`;
  return { products, query: intent.query, message: [summary, notices].filter(Boolean).join(' ') };
}
