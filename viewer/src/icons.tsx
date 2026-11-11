// Kit artwork lives in assets/icons: SVGs are inlined (recolourable), PNGs are used as URLs.
// Missing files fall back to text so the build never breaks.
const raw = import.meta.glob('./assets/icons/*.svg', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>;
const urls = import.meta.glob('./assets/icons/*.png', {
  query: '?url',
  eager: true,
  import: 'default',
}) as Record<string, string>;

const svgByName: Record<string, string> = {};
for (const [path, src] of Object.entries(raw)) {
  const m = path.match(/([^/]+)\.svg$/);
  if (m) svgByName[m[1]] = src;
}
const pngByName: Record<string, string> = {};
for (const [path, u] of Object.entries(urls)) {
  const m = path.match(/([^/]+)\.png$/);
  if (m) pngByName[m[1]] = u;
}

function sized(src: string, x: number, y: number, w: number, h: number): string | null {
  const m = src.match(/<svg\b[^>]*>/i);
  if (!m) return null;
  let tag = m[0].replace(/\s(width|height|x|y)\s*=\s*("[^"]*"|'[^']*')/gi, '');
  tag = tag.replace(
    /<svg/i,
    `<svg x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"`,
  );
  if (!/xmlns=/.test(tag)) tag = tag.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return src.replace(m[0], tag);
}

/** Draws an icon centred at (cx, cy) inside a w x h box (h defaults to w); falls back to text. */
export function Icon({
  name,
  cx,
  cy,
  size,
  h,
  rot = 0,
  color = '#111',
  multiply = false,
  fallback,
}: {
  name: string;
  cx: number;
  cy: number;
  size: number;
  h?: number;
  rot?: number;
  color?: string;
  multiply?: boolean;
  fallback: string;
}) {
  const bw = size,
    bh = h ?? size;
  const tf = rot ? `rotate(${rot} ${cx} ${cy})` : undefined;
  const png = pngByName[name];
  if (png) {
    return (
      <image
        href={png}
        x={cx - bw / 2}
        y={cy - bh / 2}
        width={bw}
        height={bh}
        preserveAspectRatio="xMidYMid meet"
        transform={tf}
        style={multiply ? { mixBlendMode: 'multiply' } : undefined}
      />
    );
  }
  const src = svgByName[name];
  const html = src ? sized(src, cx - bw / 2, cy - bh / 2, bw, bh) : null;
  if (html)
    return <g transform={tf} style={{ color }} dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <text
      x={cx}
      y={cy}
      fontSize={Math.min(bw, bh) * 0.6}
      textAnchor="middle"
      dominantBaseline="central"
      transform={tf}
    >
      {fallback}
    </text>
  );
}

/** Icon for regular DOM (not inside <svg>). */
export function DomIcon({
  name,
  size = 24,
  color = 'currentColor',
  alt = '',
}: {
  name: string;
  size?: number;
  color?: string;
  alt?: string;
}) {
  const png = pngByName[name];
  if (png)
    return <img src={png} alt={alt} width={size} height={size} style={{ objectFit: 'contain' }} />;
  const src = svgByName[name];
  if (src) {
    const html = sized(src, 0, 0, size, size);
    if (html)
      return (
        <span
          style={{ display: 'inline-flex', color }}
          dangerouslySetInnerHTML={{ __html: html.replace('<svg', '<svg style="display:block"') }}
        />
      );
  }
  return <span aria-hidden="true">•</span>;
}
