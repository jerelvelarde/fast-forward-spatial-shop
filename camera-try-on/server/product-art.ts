import { lensSpec, offsetOutline } from '../src/lens-shapes.js';
import type { BackpackStyle, CapStyle, GlassesStyle, TryOnStyle } from '../src/products.js';

/**
 * Product images rendered as transparent SVG from the same parameters the
 * try-on model uses, so every colour variant has a matching image link.
 */

function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 255;
    const next = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.round(Math.min(255, Math.max(0, next))).toString(16).padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

const escapeXml = (text: string) => text.replace(/[<>&"']/g, char => `&#${char.charCodeAt(0)};`);
const fmt = (value: number) => value.toFixed(1);

function glassesSvg(style: GlassesStyle): string {
  const spec = lensSpec(style.shape);
  const k = 300, cx = 240, cy = 140;
  const toPath = (points: Array<[number, number]>, side: 1 | -1) =>
    points.map(([x, y], i) => `${i ? 'L' : 'M'}${fmt(cx + side * (spec.centerX + x) * k)} ${fmt(cy - (spec.centerY + y) * k)}`).join(' ') + ' Z';
  const outer = offsetOutline(spec.points, spec.rim);
  const frameDark = shade(style.frame, -0.35);
  const frameLight = shade(style.frame, 0.35);
  const lensOpacity = Math.max(0.12, style.lensOpacity);
  const hingeY = fmt(cy - (spec.centerY + spec.hingeY) * k);
  const outerX = (spec.centerX + Math.max(...outer.map(([x]) => x))) * k;
  const temple = (side: 1 | -1) => {
    const x0 = cx + side * (outerX - 4);
    const x1 = cx + side * (outerX + 34);
    const width = style.metal ? 5 : 12;
    return `<path d="M${fmt(x0)} ${hingeY} L${fmt(x1)} ${fmt(Number(hingeY) - 10)}" stroke="${frameDark}" stroke-width="${width}" stroke-linecap="round"/>`;
  };
  const innerTop = spec.points.reduce((best, p) => (p[1] > 0.05 && p[0] < best[0] ? p : best), [Infinity, 0] as [number, number]);
  const bridgeX = (spec.centerX + innerTop[0]) * k;
  const bridgeY = cy - (spec.centerY + innerTop[1] * 0.7) * k;
  const bridge = style.metal
    ? `<path d="M${fmt(cx - bridgeX)} ${fmt(bridgeY)} Q${cx} ${fmt(bridgeY - 18)} ${fmt(cx + bridgeX)} ${fmt(bridgeY)}" fill="none" stroke="url(#frame)" stroke-width="5"/>
       <path d="M${fmt(cx - bridgeX - 30)} ${fmt(bridgeY - 34)} Q${cx} ${fmt(bridgeY - 46)} ${fmt(cx + bridgeX + 30)} ${fmt(bridgeY - 34)}" fill="none" stroke="url(#frame)" stroke-width="5"/>`
    : `<path d="M${fmt(cx - bridgeX - 6)} ${fmt(bridgeY - 6)} Q${cx} ${fmt(bridgeY - 22)} ${fmt(cx + bridgeX + 6)} ${fmt(bridgeY - 6)}" fill="none" stroke="url(#frame)" stroke-width="${fmt(spec.rim * k * 0.9)}"/>`;
  const lens = (side: 1 | -1) => `
    <path d="${toPath(outer, side)} ${toPath(spec.points, side)}" fill="url(#frame)" fill-rule="evenodd"/>
    <path d="${toPath(spec.points, side)}" fill="url(#lens)" opacity="${lensOpacity.toFixed(2)}"/>
    <path d="${toPath(spec.points, side)}" fill="url(#glare)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300">
  <defs>
    <linearGradient id="frame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${frameLight}"/><stop offset="0.45" stop-color="${style.frame}"/><stop offset="1" stop-color="${frameDark}"/></linearGradient>
    <linearGradient id="lens" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(style.lens, -0.25)}"/><stop offset="1" stop-color="${shade(style.lens, 0.3)}"/></linearGradient>
    <linearGradient id="glare" x1="0" y1="0" x2="1" y2="1"><stop offset="0.15" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.4" stop-color="#fff" stop-opacity="0"/><stop offset="0.7" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="shadow"><stop offset="0" stop-color="#000" stop-opacity="0.28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="240" cy="262" rx="190" ry="16" fill="url(#shadow)"/>
  ${temple(-1)}${temple(1)}${bridge}${lens(-1)}${lens(1)}
</svg>`;
}

function capSvg(style: CapStyle): string {
  const crownLight = shade(style.crown, 0.22);
  const crownDark = shade(style.crown, -0.3);
  const brimDark = shade(style.brim, -0.4);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360">
  <defs>
    <linearGradient id="crown" x1="0.2" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="${crownLight}"/><stop offset="0.55" stop-color="${style.crown}"/><stop offset="1" stop-color="${crownDark}"/></linearGradient>
    <linearGradient id="brim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(style.brim, 0.12)}"/><stop offset="1" stop-color="${brimDark}"/></linearGradient>
    <radialGradient id="shadow"><stop offset="0" stop-color="#000" stop-opacity="0.3"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="250" cy="316" rx="200" ry="20" fill="url(#shadow)"/>
  <path d="M150 232 C 96 238 52 262 46 286 C 44 298 70 304 112 300 C 170 294 228 272 262 250 Z" fill="url(#brim)"/>
  <path d="M150 232 C 110 238 70 260 58 280" fill="none" stroke="${shade(style.brim, 0.3)}" stroke-width="2" stroke-dasharray="5 5" opacity="0.6"/>
  <path d="M138 246 C 128 150 196 82 276 80 C 362 78 420 138 418 238 C 360 262 214 266 138 246 Z" fill="url(#crown)"/>
  <path d="M276 80 C 236 120 214 180 214 258" fill="none" stroke="${crownDark}" stroke-width="2.5" opacity="0.55"/>
  <path d="M276 80 C 316 122 338 184 340 256" fill="none" stroke="${crownDark}" stroke-width="2.5" opacity="0.55"/>
  <path d="M276 80 C 196 102 156 160 150 236" fill="none" stroke="${crownDark}" stroke-width="2" opacity="0.35"/>
  <path d="M138 246 C 214 266 360 262 418 238" fill="none" stroke="${crownDark}" stroke-width="5" opacity="0.6"/>
  <ellipse cx="276" cy="80" rx="17" ry="7" fill="${style.crown}" stroke="${crownDark}" stroke-width="2"/>
  <circle cx="244" cy="128" r="3.5" fill="${crownDark}" opacity="0.7"/><circle cx="318" cy="130" r="3.5" fill="${crownDark}" opacity="0.7"/>
  <rect x="176" y="170" width="58" height="34" rx="8" fill="${style.accent}" transform="rotate(-6 205 187)"/>
  <text x="205" y="194" font-family="system-ui, sans-serif" font-size="17" font-weight="800" fill="${style.crown}" text-anchor="middle" transform="rotate(-6 205 187)">FF</text>
</svg>`;
}

function backpackSvg(style: BackpackStyle): string {
  const grow = Math.max(0, Math.min(1, (style.liters - 20) / 20));
  const w = 210 + grow * 40, h = 280 + grow * 80;
  const x = 200 - w / 2, y = 470 - 40 - h;
  const bodyLight = shade(style.body, 0.18);
  const bodyDark = shade(style.body, -0.32);
  const pocketY = y + h * 0.44;
  const lid = style.liters >= 30
    ? `<rect x="${fmt(x - 6)}" y="${fmt(y - 8)}" width="${fmt(w + 12)}" height="${fmt(h * 0.2)}" rx="34" fill="${shade(style.body, -0.12)}"/>
       <path d="M${fmt(x + 18)} ${fmt(y + h * 0.13)} H${fmt(x + w - 18)}" stroke="${style.trim}" stroke-width="3" stroke-dasharray="7 4"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bodyLight}"/><stop offset="0.6" stop-color="${style.body}"/><stop offset="1" stop-color="${bodyDark}"/></linearGradient>
    <linearGradient id="pocket" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(style.body, 0.1)}"/><stop offset="1" stop-color="${shade(style.body, -0.2)}"/></linearGradient>
    <radialGradient id="shadow"><stop offset="0" stop-color="#000" stop-opacity="0.32"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="200" cy="452" rx="${fmt(w * 0.75)}" ry="16" fill="url(#shadow)"/>
  <rect x="${fmt(x - 14)}" y="${fmt(y + 30)}" width="34" height="${fmt(h * 0.72)}" rx="16" fill="${style.accent}"/>
  <rect x="${fmt(x + w - 20)}" y="${fmt(y + 30)}" width="34" height="${fmt(h * 0.72)}" rx="16" fill="${style.accent}"/>
  <path d="M${fmt(200 - 30)} ${fmt(y + 6)} C ${fmt(200 - 30)} ${fmt(y - 36)}, ${fmt(200 + 30)} ${fmt(y - 36)}, ${fmt(200 + 30)} ${fmt(y + 6)}" fill="none" stroke="${style.accent}" stroke-width="9" stroke-linecap="round"/>
  <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="46" fill="url(#body)"/>
  <rect x="${fmt(x)}" y="${fmt(y + h - 48)}" width="${fmt(w)}" height="48" rx="22" fill="${style.accent}"/>
  ${lid}
  <rect x="${fmt(x - 8)}" y="${fmt(y + h * 0.3)}" width="18" height="10" rx="3" fill="${style.accent}"/>
  <rect x="${fmt(x + w - 10)}" y="${fmt(y + h * 0.3)}" width="18" height="10" rx="3" fill="${style.accent}"/>
  <rect x="${fmt(x + 24)}" y="${fmt(pocketY)}" width="${fmt(w - 48)}" height="${fmt(h * 0.42)}" rx="30" fill="url(#pocket)"/>
  <path d="M${fmt(x + 34)} ${fmt(pocketY + 18)} Q 200 ${fmt(pocketY - 10)} ${fmt(x + w - 34)} ${fmt(pocketY + 18)}" fill="none" stroke="${style.trim}" stroke-width="3.5" stroke-dasharray="6 3"/>
  <rect x="${fmt(x + w - 52)}" y="${fmt(pocketY + 12)}" width="9" height="24" rx="3" fill="${style.trim}"/>
  <path d="M${fmt(x + 22)} ${fmt(y + 40)} Q 200 ${fmt(y + 10)} ${fmt(x + w - 22)} ${fmt(y + 40)}" fill="none" stroke="${bodyDark}" stroke-width="3" opacity="0.6"/>
  <rect x="${fmt(200 - 44)}" y="${fmt(pocketY + h * 0.18)}" width="88" height="24" rx="6" fill="${style.trim}"/>
  <text x="200" y="${fmt(pocketY + h * 0.18 + 17)}" font-family="system-ui, sans-serif" font-size="12" font-weight="800" letter-spacing="2" fill="${style.accent}" text-anchor="middle">RIDGELINE</text>
</svg>`;
}

export function productSvg(style: TryOnStyle, title: string): string {
  const svg = style.kind === 'glasses' ? glassesSvg(style) : style.kind === 'cap' ? capSvg(style) : backpackSvg(style);
  return svg.replace('<svg ', `<svg role="img" aria-label="${escapeXml(title)}" `);
}
