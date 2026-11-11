import { memo, useEffect, useRef, type ReactNode } from 'react';
import {
  BoardView,
  CORNER,
  SIZE,
  TILE_D,
  TILE_W,
  Space,
  groups,
  isOwnable,
  placement,
  spaces,
} from './boardData';
import { Icon } from './icons';
import { euro, shade, svgRich } from './format';

const FILL = '#d9e8d6';
const STROKE = '#000';
const SW = 3.5;
const BAR = 42;
const FONT = "'Jost', system-ui, sans-serif";

/** Uppercase that keeps ß as capital ẞ (Jost latin-ext has it). */
export function upper(s: string): string {
  return s
    .replace(/ß/g, '\u0001')
    .toUpperCase()
    .replace(/\u0001/g, 'ẞ');
}

function wrapAt(words: string[], maxChars: number): string[] {
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + ' ' + w).length <= maxChars)
      lines[lines.length - 1] = last + ' ' + w;
    else lines.push(w);
  }
  return lines;
}

/** Break German compounds at the seam so long names can stay large: "Chausseestraße" -> "Chaussee-" / "straße". */
function splitCompound(name: string): string[] {
  const parts: string[] = [];
  for (const w of name.split(/\s+/)) {
    const m = w.match(/^(.{3,}?)(straße|bahnhof|platz|allee|werk)$/i);
    if (/^elektrizitätswerk$/i.test(w)) parts.push('Elektri-', 'zitäts-', 'werk');
    else if (m && w.length > 8) parts.push(m[1] + '-', m[2]);
    else parts.push(w);
  }
  return parts.map(upper);
}

const NAME_W = 102,
  CAP_EM = 0.6;
/** Smallest board text (viewBox units). At >= 750px board width this renders at >= 9px. */
const MIN_FS = 16.5;

/** Largest font size (<= max) at which the name fits in <= 3 lines of NAME_W units. */
function fit(name: string, max: number): { lines: string[]; fs: number } {
  const words = splitCompound(name);
  const longestWord = Math.max(...words.map((w) => w.length));
  for (let fs = max; fs >= MIN_FS; fs -= 0.5) {
    const maxChars = Math.floor(NAME_W / (fs * CAP_EM));
    if (longestWord > maxChars) continue;
    const lines = wrapAt(words, maxChars);
    if (lines.length <= 3) return { lines, fs };
  }
  return { lines: wrapAt(words, Math.floor(NAME_W / (MIN_FS * CAP_EM))), fs: MIN_FS };
}

/** Text lines; `top` is the vertical centre of the first line. */
function TLines({
  lines,
  cx,
  top,
  fs,
  weight = 500,
  lh = 1.18,
  fill = '#111',
}: {
  lines: string[];
  cx: number;
  top: number;
  fs: number;
  weight?: number;
  lh?: number;
  fill?: string;
}) {
  return (
    <text textAnchor="middle" fontFamily={FONT} fontWeight={weight} fontSize={fs} fill={fill}>
      {lines.map((l, k) => (
        <tspan key={k} x={cx} y={top + k * fs * lh + fs * 0.35}>
          {svgRich(l)}
        </tspan>
      ))}
    </text>
  );
}

function Name({
  text,
  cx,
  top,
  max = 17,
  weight = 500,
}: {
  text: string;
  cx: number;
  top: number;
  max?: number;
  weight?: number;
}) {
  const { lines, fs } = fit(text, max);
  return <TLines lines={lines} cx={cx} top={top} fs={fs} weight={weight} />;
}

/* ---------- 3D pieces ---------- */

function House({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#pieceShadow)">
      <polygon
        points="14,9 21,6 21,15 14,18"
        fill="url(#hSide)"
        stroke="#0b3d1c"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <rect
        x="3"
        y="9"
        width="11"
        height="9"
        fill="url(#hFront)"
        stroke="#0b3d1c"
        strokeWidth="1"
      />
      <polygon
        points="8,2 14,-1 21,6 15,9"
        fill="url(#hRoofSide)"
        stroke="#0b3d1c"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <polygon
        points="1,9 8,2 15,9"
        fill="url(#hRoof)"
        stroke="#0b3d1c"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <rect x="7" y="12" width="3" height="6" fill="#0b3d1c" fillOpacity=".55" />
    </g>
  );
}

function Hotel({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#pieceShadow)">
      <polygon
        points="36,9 46,4 46,22 36,27"
        fill="url(#kSide)"
        stroke="#4a0a0a"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <rect
        x="2"
        y="9"
        width="34"
        height="18"
        fill="url(#kFront)"
        stroke="#4a0a0a"
        strokeWidth="1.2"
      />
      <polygon
        points="2,9 12,4 46,4 36,9"
        fill="url(#kTop)"
        stroke="#4a0a0a"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {[7, 15, 23, 30].map((wx) => (
        <rect
          key={wx}
          x={wx}
          y="14"
          width="4"
          height="5"
          fill="#ffe9a8"
          stroke="#4a0a0a"
          strokeWidth=".6"
        />
      ))}
    </g>
  );
}

type BuildFx = { prev: number; delay: number; s: number };
const DROP_MS = 460,
  LIFT_MS = 320;

function Buildings({ n, fx }: { n: number; fx?: BuildFx }) {
  const prev = fx ? fx.prev : n;
  const x0Of = (c: number) => (TILE_W - (c * 21 + (c - 1) * 3)) / 2;
  const hx = (TILE_W - 48) / 2,
    hy = (BAR - 28) / 2 + 4;
  const t = (extra: number, dur: number) =>
    fx
      ? { animationDelay: `${fx.delay + extra * fx.s}ms`, animationDuration: `${dur * fx.s}ms` }
      : undefined;
  const house = (k: number, c: number, cls?: string, extra = 0) => (
    <g
      key={`${cls ?? 'h'}${k}`}
      className={cls}
      style={cls ? t(extra, cls === 'b-drop' ? DROP_MS : LIFT_MS) : undefined}
    >
      <House x={x0Of(c) + k * 24} y={13} />
    </g>
  );
  const out: ReactNode[] = [];
  if (n >= 5) {
    if (fx && prev < 5) for (let k = 0; k < prev; k++) out.push(house(k, prev, 'b-lift')); // houses make way for the hotel
    out.push(
      <g
        key="hotel"
        className={fx && prev < 5 ? 'b-drop' : undefined}
        style={fx && prev < 5 ? t(prev ? 260 : 0, DROP_MS) : undefined}
      >
        <Hotel x={hx} y={hy} />
      </g>,
    );
    return <>{out}</>;
  }
  if (fx && prev >= 5) {
    // hotel sold: lifts off, houses drop in its place
    out.push(
      <g key="hg" className="b-lift" style={t(0, LIFT_MS)}>
        <Hotel x={hx} y={hy} />
      </g>,
    );
    for (let k = 0; k < n; k++) out.push(house(k, n, 'b-drop', 220));
    return <>{out}</>;
  }
  for (let k = 0; k < n; k++) out.push(house(k, n, fx && k >= prev ? 'b-drop' : undefined));
  if (fx) for (let k = n; k < prev; k++) out.push(house(k, prev, 'b-lift'));
  return <>{out}</>;
}

/** Relative luminance 0..1 of a hex colour. */
export function lum(c: string): number {
  const m = c.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(m.slice(k, k + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const PAWN_BODY =
  'M-12.5 16.5 C-12.5 12 -7 11 -5 4 C-4 0.5 -3.3 -1 -3.3 -2.5 H3.3 C3.3 -1 4 0.5 5 4 C7 11 12.5 12 12.5 16.5 Z';

/** The pawn silhouette (union of base, body, neck ring, head), defined once; used for outline, halo and as clip path. */
function Silhouette() {
  return (
    <>
      <ellipse cx="0" cy="16" rx="13" ry="4.2" />
      <path d={PAWN_BODY} />
      <ellipse cx="0" cy="-2.6" rx="6.6" ry="2.3" />
      <circle cx="0" cy="-10" r="7.4" />
    </>
  );
}
/** Clip path of the silhouette; every shading layer is clipped to it so gloss can never spill outside the pawn. */
export function PawnClip({ id }: { id: string }) {
  return (
    <clipPath id={id} clipPathUnits="userSpaceOnUse">
      <Silhouette />
    </clipPath>
  );
}

/** The one pawn: flared base, slim body, neck ring, round head. Players differ by colour only.
 *  Light comes from the top left (as for the houses and drop shadows): specular on the upper-left of the head,
 *  rim light on the left edge, darker band at the base. Fill, shading and clip share one group, so they cannot drift apart. */
function PawnShape({
  ids,
  dark,
  clip,
}: {
  ids: [string, string, string];
  dark: boolean;
  clip: string;
}) {
  const [g, gh, gs] = ids;
  const st = { stroke: '#1a1a1a', strokeWidth: 1.5, strokeLinejoin: 'round' as const };
  return (
    <g>
      {dark && (
        <g fill="none" stroke="#fff" strokeWidth="4.6" strokeLinejoin="round">
          <Silhouette />
        </g>
      )}
      <ellipse cx="0" cy="16" rx="13" ry="4.2" fill={gh} {...st} />
      <path d={PAWN_BODY} fill={gh} {...st} />
      <ellipse cx="0" cy="-2.6" rx="6.6" ry="2.3" fill={g} {...st} />
      <circle cx="0" cy="-10" r="7.4" fill={gs} {...st} />
      <g clipPath={`url(#${clip})`} pointerEvents="none">
        <ellipse cx="0" cy="19.5" rx="15" ry="4.4" fill="#000" fillOpacity=".3" />
        <path
          d="M-6.2 14 C-7.6 10 -4.6 6.5 -3.2 3.5"
          fill="none"
          stroke="#fff"
          strokeOpacity=".55"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M-6.4 -10 A6.6 6.6 0 0 1 -1 -16.2"
          fill="none"
          stroke="#fff"
          strokeOpacity=".5"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <ellipse
          cx="-2.9"
          cy="-12.9"
          rx="2.5"
          ry="1.6"
          transform="rotate(-35 -2.9 -12.9)"
          fill="#fff"
          fillOpacity=".88"
        />
      </g>
    </g>
  );
}

function Pawn({ k, dark }: { k: number; dark: boolean }) {
  return (
    <PawnShape ids={[`url(#pv${k})`, `url(#ph${k})`, `url(#ps${k})`]} dark={dark} clip="pawnClip" />
  );
}

/** Pawn as standalone SVG (for seat areas). */
export function PawnIcon({
  player,
  color,
  size = 28,
}: {
  player: number;
  color: string;
  size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="-17 -20 34 42" aria-hidden="true">
      <defs>
        <PawnClip id={`pawnClipI${player}`} />
        <radialGradient id={`ips${player}`} cx=".35" cy=".3" r=".85">
          <stop offset="0" stopColor={shade(color, 0.7)} />
          <stop offset=".5" stopColor={color} />
          <stop offset="1" stopColor={shade(color, -0.45)} />
        </radialGradient>
        <linearGradient id={`iph${player}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={shade(color, 0.45)} />
          <stop offset=".45" stopColor={color} />
          <stop offset="1" stopColor={shade(color, -0.5)} />
        </linearGradient>
        <linearGradient id={`ipv${player}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={shade(color, 0.55)} />
          <stop offset="1" stopColor={shade(color, -0.35)} />
        </linearGradient>
      </defs>
      <PawnShape
        ids={[`url(#ipv${player})`, `url(#iph${player})`, `url(#ips${player})`]}
        dark={lum(color) < 0.25}
        clip={`pawnClipI${player}`}
      />
    </svg>
  );
}

/* ---------- tiles ---------- */

const PRICE_Y = 157;
function Price({ cx, text }: { cx: number; text: string }) {
  return (
    <text
      x={cx}
      y={PRICE_Y + 4.5}
      textAnchor="middle"
      fontFamily={FONT}
      fontWeight={500}
      fontSize="18"
      fill="#111"
    >
      {svgRich(text)}
    </text>
  );
}

function EdgeTile({
  s,
  owner,
  buildings,
  color,
  fx,
}: {
  s: Space;
  owner: boolean;
  buildings: number;
  color: string | null;
  fx?: { own?: number; build?: BuildFx; nonce: number; s: number };
}) {
  const bar = s.type === 'street' && s.group ? groups[s.group]?.color : undefined;
  const cx = TILE_W / 2;
  const chanceIcon = s.i === 7 ? 'chance_pink' : s.i === 22 ? 'chance_blue' : 'chance_orange';
  let body: ReactNode = null;
  switch (s.type) {
    case 'street':
      body = (
        <>
          <Name text={s.name} cx={cx} top={72} />
          <Price cx={cx} text={euro(s.price ?? 0)} />
        </>
      );
      break;
    case 'station':
      body = (
        <>
          <Name text={s.name} cx={cx} top={24} max={18} />
          <Icon name="train" cx={cx} cy={92} size={80} h={64} fallback="🚂" />
          <Price cx={cx} text={euro(s.price ?? 0)} />
        </>
      );
      break;
    case 'utility':
      body = (
        <>
          <Name text={s.name} cx={cx} top={24} max={18} />
          <Icon
            name={s.i === 12 ? 'electric' : 'water'}
            cx={cx}
            cy={92}
            size={74}
            h={64}
            fallback={s.i === 12 ? '💡' : '🚰'}
          />
          <Price cx={cx} text={euro(s.price ?? 0)} />
        </>
      );
      break;
    case 'chance':
      body = (
        <>
          <TLines lines={['EREIGNIS-', 'FELD']} cx={cx} top={26} fs={17} />
          <Icon name={chanceIcon} cx={cx} cy={112} size={92} fallback="?" />
        </>
      );
      break;
    case 'community':
      body = (
        <>
          <TLines lines={['GEMEIN-', 'SCHAFTS-', 'FELD']} cx={cx} top={20} fs={17} />
          <Icon name="community" cx={cx} cy={118} size={84} h={68} fallback="✉" />
        </>
      );
      break;
    case 'tax':
      body =
        s.i === 4 ? (
          <>
            <TLines lines={['EINKOMMEN-', 'STEUER']} cx={cx} top={30} fs={MIN_FS} />
            <rect
              x={cx - 4.5}
              y={90}
              width="9"
              height="9"
              transform={`rotate(45 ${cx} 94.5)`}
              fill="none"
              stroke="#111"
              strokeWidth="2"
            />
            <TLines lines={[`ZAHLE ${euro(s.amount ?? 0)}`]} cx={cx} top={PRICE_Y} fs={MIN_FS} />
          </>
        ) : (
          <>
            <TLines lines={['ZUSATZ-', 'STEUER']} cx={cx} top={30} fs={17} />
            <Icon name="tax" cx={cx} cy={100} size={64} h={52} fallback="💍" />
            <Price cx={cx} text={euro(s.amount ?? 0)} />
          </>
        );
      break;
    default:
      body = <Name text={s.name} cx={cx} top={72} />;
  }
  return (
    <g>
      <rect
        x="0"
        y="0"
        width={TILE_W}
        height={TILE_D}
        fill={FILL}
        stroke={STROKE}
        strokeWidth={SW}
      />
      {bar && (
        <rect x="0" y="0" width={TILE_W} height={BAR} fill={bar} stroke={STROKE} strokeWidth={SW} />
      )}
      {bar && (buildings > 0 || (fx?.build && fx.build.prev > 0)) && (
        <Buildings n={buildings} fx={fx?.build} />
      )}
      {body}
      {owner && color && (
        <rect
          key={fx?.own != null ? fx.nonce : 'o'}
          className={fx?.own != null ? 'own-fill' : undefined}
          style={
            fx?.own != null
              ? { animationDelay: `${fx.own}ms`, animationDuration: `${400 * fx.s}ms` }
              : undefined
          }
          x="12"
          y="166"
          width={TILE_W - 24}
          height="9"
          rx="4.5"
          fill={color}
          stroke="#000"
          strokeWidth="1.6"
        />
      )}
    </g>
  );
}

const CORNER_ROT: Record<number, number> = { 0: -45, 10: 45, 20: 135, 30: 225 };

function Corner({ s }: { s: Space }) {
  const c = CORNER / 2;
  const frame = (
    <rect x="0" y="0" width={CORNER} height={CORNER} fill={FILL} stroke={STROKE} strokeWidth={SW} />
  );
  const rot = CORNER_ROT[s.i] ?? 0;
  const R = (children: ReactNode) => (
    <g transform={`translate(${c} ${c}) rotate(${rot})`}>{children}</g>
  );
  switch (s.type) {
    case 'go':
      return (
        <g>
          {frame}
          {R(
            <>
              {/* salary text: three short lines above-left of the lettering, parallel to it */}
              <TLines
                lines={['DU ERHÄLTST', `${euro(200)} GEHALT`, 'BEIM PASSIEREN']}
                cx={0}
                top={-68}
                fs={MIN_FS}
                lh={1.03}
              />
              <text
                x="0"
                y="26"
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily={FONT}
                fontWeight={700}
                fontSize="70"
                letterSpacing="2"
                fill="#111"
              >
                LOS
              </text>
            </>,
          )}
          <Icon name="go_arrow" cx={92} cy={160} size={136} h={26} fallback="⬅" />
        </g>
      );
    case 'jail':
      return (
        <g>
          {frame}
          <rect
            x="44"
            y="0"
            width="138"
            height="140"
            fill="#f7941d"
            stroke={STROKE}
            strokeWidth={SW}
          />
          <Icon name="jail" cx={113} cy={70} size={150} multiply fallback="⛓" />
          <text
            transform="translate(22 70) rotate(-90)"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily={FONT}
            fontWeight={500}
            fontSize="17"
            fill="#111"
          >
            NUR ZU
          </text>
          <text
            x="113"
            y="161"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily={FONT}
            fontWeight={500}
            fontSize="17"
            fill="#111"
          >
            BESUCH
          </text>
        </g>
      );
    case 'free_parking':
      return (
        <g>
          {frame}
          {R(
            <>
              <TLines lines={['FREI']} cx={0} top={-60} fs={19} />
              <Icon name="free_parking" cx={0} cy={2} size={74} fallback="🅿" />
              <TLines lines={['PARKEN']} cx={0} top={64} fs={19} />
            </>,
          )}
        </g>
      );
    default:
      return (
        <g>
          {frame}
          {R(
            <>
              <TLines lines={['GEHE INS']} cx={0} top={-64} fs={17} />
              <Icon name="go_to_jail" cx={0} cy={0} size={84} fallback="👮" />
              <TLines lines={['GEFÄNGNIS']} cx={0} top={66} fs={17} />
            </>,
          )}
        </g>
      );
  }
}

/* ---------- token placement ----------
   Every token rests on an anchor computed from the tile geometry (tile-local units, then rotated with the tile).
   Anchors never depend on the previous position, so hops always start and end exactly on them.
   Edge tiles: between name and price, centred; two tokens sit symmetrically left/right of the centre line. */
/* One constant pawn scale everywhere (about 65% of an edge tile's width); it never depends on tile size or count.
   The rest point is a tile-local anchor in the unrotated tile frame (182 deep, 112 wide; y grows towards the price)
   rotated into place with the tile, so left/right sides line up exactly like the top/bottom rows. Pawns stay upright.
   Several pawns on one tile are offset diagonally; the later (front) one sits slightly lower, like real pieces. */
export const PAWN_SCALE = 2.5;
const EDGE_BASE: [number, number] = [56, 86]; // tile-local rest point of a single pawn (free area between bar and price)
// Offsets for several pawns are applied in board space, so they look the same on all four sides: pawn 2 sits right of
// and slightly lower than pawn 1.
const EDGE_OFFSETS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-16, -6],
    [16, 6],
  ],
  3: [
    [-22, -12],
    [22, -8],
    [0, 8],
  ],
  4: [
    [-20, -12],
    [20, -8],
    [-20, 8],
    [20, 12],
  ],
};
// dedicated corner anchors (corner-local, 182 x 182), chosen to leave the main art as free as a constant scale allows
const CORNER_SLOTS: Record<number, [number, number][]> = {
  0: [
    [142, 52],
    [40, 98],
    [104, 50],
    [76, 100],
  ], // GO: beside the diagonal lettering, above the arrow
  20: [
    [142, 52],
    [40, 130],
    [104, 48],
    [76, 132],
  ],
  30: [
    [40, 52],
    [142, 130],
    [76, 48],
    [104, 132],
  ],
};
const JAIL_CELL: [number, number][][] = [
  // "im Gefängnis": inside the orange square (centre 113,70)
  [[113, 72]],
  [
    [85, 72],
    [141, 72],
  ],
  [
    [85, 66],
    [141, 66],
    [113, 82],
  ],
  [
    [85, 62],
    [141, 62],
    [85, 82],
    [141, 82],
  ],
];
const VISIT_SLOTS: [number, number][] = [
  [40, 128],
  [112, 128],
  [76, 126],
  [40, 100],
]; // "nur zu Besuch": the outer L-strip

/** Board-space position (x, y) and the constant scale of a token. slot/count describe its place among tokens sharing the tile. */
export function tokenPos(
  space: number,
  slot: number,
  count: number,
  inJail?: boolean,
): [number, number, number] {
  const p = placement(space);
  const n = Math.min(4, Math.max(1, count)),
    i = Math.min(n - 1, slot);
  if (p.corner) {
    if (space === 10) {
      const [cx, cy] = inJail ? JAIL_CELL[n - 1][i] : VISIT_SLOTS[i];
      return [p.x + cx, p.y + cy, PAWN_SCALE];
    }
    const [cx, cy] = CORNER_SLOTS[space][i];
    return [p.x + cx, p.y + cy, PAWN_SCALE];
  }
  const a = (p.rot * Math.PI) / 180;
  const dx = EDGE_BASE[0] - TILE_W / 2,
    dy = EDGE_BASE[1] - TILE_D / 2;
  const [ox, oy] = EDGE_OFFSETS[n][i];
  return [
    p.x + p.w / 2 + dx * Math.cos(a) - dy * Math.sin(a) + ox,
    p.y + p.h / 2 + dx * Math.sin(a) + dy * Math.cos(a) + oy,
    PAWN_SCALE,
  ];
}

/** Circular distance between two spaces. */
const ring = (a: number, b: number) => {
  const d = Math.abs(a - b) % 40;
  return Math.min(d, 40 - d);
};

/** One token: the outer group translates between anchors (CSS transition on an absolute translate, so no drift);
 *  an inner group does the lift and squash of each hop and always returns to rest. */
function Token({
  player,
  pos,
  space,
  inJail,
  hopMs,
  dark,
}: {
  player: number;
  pos: [number, number, number];
  space: number;
  inJail?: boolean;
  hopMs: number | null;
  dark: boolean;
}) {
  const prev = useRef(space);
  const [x, y, sc] = pos;
  const far = hopMs != null && ring(prev.current, space) > 1;
  useEffect(() => {
    prev.current = space;
  }, [space]);
  const dur = hopMs == null ? 0 : far ? hopMs * 2 : hopMs;
  const k = player % 4;
  return (
    <g
      style={{
        transform: `translate(${x}px, ${y}px)`,
        transition: dur ? `transform ${dur}ms ease-in-out` : 'none',
      }}
    >
      <g transform={`scale(${sc})`}>
        <ellipse cx="2" cy="17" rx="13" ry="4.5" fill="#000" fillOpacity="0.32" />
        <g
          key={`${space}-${inJail ? 1 : 0}`}
          filter="url(#tokenShadow)"
          style={
            dur
              ? {
                  animation: `${far ? 'slide' : 'hop'} ${dur}ms ease-in-out`,
                  transformBox: 'fill-box',
                  transformOrigin: '50% 100%',
                }
              : undefined
          }
        >
          <Pawn k={k} dark={dark} />
        </g>
      </g>
    </g>
  );
}

const HATCH_ID = 'hatch';

/* ---------- centre ---------- */

const PILES = {
  community: { cx: 407, cy: 409, fill: '#abdffa', edge: '#8dbbd6', label: 'Gemeinschaftskarte' },
  chance: { cx: 959, cy: 959, fill: '#f7941d', edge: '#c9760f', label: 'Ereigniskarte' },
};

function Pile({ kind }: { kind: 'community' | 'chance' }) {
  const p = PILES[kind];
  const w = 257,
    h = 172,
    m = 15;
  const path = `M${-w / 2 - m} ${-h / 2 - m} H${w / 2 + m} V${h / 2 + m} H${-w / 2 - m} Z`;
  const id = `pp-${kind}`;
  return (
    <g transform={`translate(${p.cx} ${p.cy}) rotate(-45)`}>
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={p.fill}
        stroke={p.edge}
        strokeWidth="3"
      />
      <path id={id} d={path} fill="none" />
      <text fontFamily={FONT} fontSize="16.5" fontWeight="700" fill="#111" letterSpacing="3">
        <textPath href={`#${id}`}>{'?.'.repeat(130)}</textPath>
      </text>
      {[
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, b]) => (
        <circle key={`${a}${b}`} cx={a * (w / 2 + m)} cy={b * (h / 2 + m)} r="4.5" fill="#000" />
      ))}
      {kind === 'community' ? (
        <Icon name="community" cx={0} cy={0} size={118} h={96} rot={30} fallback="✉" />
      ) : (
        <Icon name="chance" cx={0} cy={0} size={150} fallback="?" />
      )}
    </g>
  );
}

function BoardImpl({ view }: { view: BoardView }) {
  const {
    owner,
    buildings,
    mortgaged,
    tokens,
    highlight,
    playerColors,
    highlightColor,
    highlightTip,
    hopMs,
    fx,
  } = view;
  const hc = highlightColor ?? '#ffb300';
  const hcRing = lum(hc) < 0.25 ? '#fff' : hc; // a graphite ring would vanish into the black outline
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width="100%"
      height="100%"
      role="img"
      aria-label="Spielbrett"
      style={{ display: 'block' }}
    >
      <defs>
        <pattern
          id={HATCH_ID}
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="12" height="12" fill="#8a8a8a" fillOpacity="0.55" />
          <rect width="5" height="12" fill="#444" fillOpacity="0.65" />
        </pattern>
        <PawnClip id="pawnClip" />
        <filter id="tokenShadow" x="-30%" y="-20%" width="170%" height="170%">
          <feDropShadow dx="1" dy="2.2" stdDeviation="1.1" floodColor="#000" floodOpacity=".55" />
        </filter>
        <filter id="pieceShadow" x="-30%" y="-30%" width="170%" height="180%">
          <feDropShadow dx="1.2" dy="2" stdDeviation="1.2" floodColor="#000" floodOpacity=".45" />
        </filter>
        <linearGradient id="hFront" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#58d27a" />
          <stop offset="1" stopColor="#1f9a45" />
        </linearGradient>
        <linearGradient id="hSide" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b8a3d" />
          <stop offset="1" stopColor="#0f5a27" />
        </linearGradient>
        <linearGradient id="hRoof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8be6a3" />
          <stop offset="1" stopColor="#34b45a" />
        </linearGradient>
        <linearGradient id="hRoofSide" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1f9a45" />
          <stop offset="1" stopColor="#0d5324" />
        </linearGradient>
        <linearGradient id="kFront" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0524f" />
          <stop offset="1" stopColor="#b11818" />
        </linearGradient>
        <linearGradient id="kSide" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a31515" />
          <stop offset="1" stopColor="#600c0c" />
        </linearGradient>
        <linearGradient id="kTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff9a94" />
          <stop offset="1" stopColor="#e03a36" />
        </linearGradient>
        {playerColors.slice(0, 4).map((c, k) => (
          <g key={k}>
            <radialGradient id={`ps${k}`} cx=".35" cy=".3" r=".85">
              <stop offset="0" stopColor={shade(c, 0.7)} />
              <stop offset=".5" stopColor={c} />
              <stop offset="1" stopColor={shade(c, -0.45)} />
            </radialGradient>
            <linearGradient id={`ph${k}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={shade(c, 0.45)} />
              <stop offset=".45" stopColor={c} />
              <stop offset="1" stopColor={shade(c, -0.5)} />
            </linearGradient>
            <linearGradient id={`pv${k}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={shade(c, 0.55)} />
              <stop offset="1" stopColor={shade(c, -0.35)} />
            </linearGradient>
          </g>
        ))}
      </defs>
      <rect width={SIZE} height={SIZE} fill={FILL} />
      <rect
        x={CORNER}
        y={CORNER}
        width={SIZE - 2 * CORNER}
        height={SIZE - 2 * CORNER}
        fill={FILL}
        stroke={STROKE}
        strokeWidth={SW}
      />

      {/* SLOPOLY banner */}
      <g transform={`translate(${SIZE / 2} ${SIZE / 2 - 2}) rotate(-45)`}>
        <rect x="-460" y="-84" width="920" height="168" rx="22" fill="#f11c26" />
        <rect
          x="-452"
          y="-76"
          width="904"
          height="152"
          rx="16"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
        />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          y="6"
          fontFamily={FONT}
          fontWeight={700}
          fontSize="150"
          fill="#fff"
          textLength="730"
          lengthAdjust="spacingAndGlyphs"
        >
          SLOPOLY
        </text>
      </g>
      <Pile kind="community" />
      <Pile kind="chance" />

      {spaces.map((s) => {
        const p = placement(s.i);
        const ownable = isOwnable(s);
        const o = ownable ? owner[s.i] : null;
        const color = o != null ? (playerColors[o] ?? '#888') : null;
        const tf = p.corner
          ? `translate(${p.x} ${p.y})`
          : `translate(${p.x + p.w / 2} ${p.y + p.h / 2}) rotate(${p.rot}) translate(${-TILE_W / 2} ${-TILE_D / 2})`;
        return (
          <g key={s.i} transform={tf}>
            {p.corner ? (
              <Corner s={s} />
            ) : (
              <EdgeTile
                s={s}
                owner={o != null}
                color={color}
                buildings={buildings[s.i] ?? 0}
                fx={
                  fx
                    ? {
                        own: fx.own[s.i],
                        build: fx.build[s.i] ? { ...fx.build[s.i], s: fx.s } : undefined,
                        nonce: fx.nonce,
                        s: fx.s,
                      }
                    : undefined
                }
              />
            )}
            {ownable && mortgaged?.[s.i] && (
              <g>
                <title>Hypothek</title>
                <rect
                  x="0"
                  y="0"
                  width={TILE_W}
                  height={TILE_D}
                  fill={`url(#${HATCH_ID})`}
                  stroke={STROKE}
                  strokeWidth={SW}
                />
                <rect
                  x="4"
                  y="78"
                  width={TILE_W - 8}
                  height="26"
                  rx="4"
                  fill="#fff"
                  fillOpacity=".92"
                  stroke="#000"
                  strokeWidth="1.5"
                />
                <text
                  x={TILE_W / 2}
                  y="91.5"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily={FONT}
                  fontWeight={700}
                  fontSize={MIN_FS}
                  letterSpacing="1"
                  fill="#111"
                >
                  HYPOTHEK
                </text>
              </g>
            )}
          </g>
        );
      })}

      {highlight != null &&
        (() => {
          const p = placement(highlight);
          return (
            <g style={fx ? { animation: `hlin ${260 * fx.s}ms ${fx.hlDelay}ms both` } : undefined}>
              <g pointerEvents="none">
                <rect
                  x={p.x + 4}
                  y={p.y + 4}
                  width={p.w - 8}
                  height={p.h - 8}
                  fill="none"
                  stroke="#000"
                  strokeWidth="8"
                />
                <rect
                  x={p.x + 4}
                  y={p.y + 4}
                  width={p.w - 8}
                  height={p.h - 8}
                  fill="none"
                  stroke={hcRing}
                  strokeWidth="4.2"
                />
              </g>
              <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="transparent" pointerEvents="all">
                {highlightTip && <title>{highlightTip}</title>}
              </rect>
            </g>
          );
        })()}

      {tokens.map((t) => {
        const key = `${t.space}:${t.inJail ? 1 : 0}`;
        const mates = tokens.filter((o) => `${o.space}:${o.inJail ? 1 : 0}` === key);
        return (
          <Token
            key={t.id ?? t.player}
            player={t.player}
            space={t.space}
            inJail={t.inJail}
            hopMs={hopMs ?? null}
            dark={lum(playerColors[t.player] ?? '#888') < 0.25}
            pos={tokenPos(t.space, mates.indexOf(t), mates.length, t.inJail)}
          />
        );
      })}
    </svg>
  );
}

export const Board = memo(BoardImpl);
export default Board;
