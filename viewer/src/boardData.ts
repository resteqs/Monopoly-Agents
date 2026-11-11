import boardJson from '../../engine/monopoly/data/board_de.json';

export type SpaceType =
  | 'go'
  | 'street'
  | 'community'
  | 'tax'
  | 'station'
  | 'chance'
  | 'jail'
  | 'utility'
  | 'free_parking'
  | 'go_to_jail';

export interface Space {
  i: number;
  name: string;
  type: SpaceType;
  group?: string;
  price?: number;
  rent?: number[];
  amount?: number;
}
export interface Group {
  color: string;
  house_cost: number;
  spaces: number[];
}

export const spaces = boardJson.spaces as Space[];
export const groups = boardJson.groups as Record<string, Group>;
export const currency: string = boardJson.currency ?? '€';

/** Per-step board effects: which ownership strips fill in, which tiles gain/lose buildings, when the highlight appears. */
export interface BoardFx {
  nonce: number;
  /** playback-speed factor applied to effect durations (1 / speed) */
  s: number;
  own: Record<number, number>;
  build: Record<number, { prev: number; delay: number }>;
  hlDelay: number;
}

export type BoardView = {
  owner: (number | null)[]; // length 40, player index or null
  buildings: number[]; // length 40, 0-4 houses, 5 hotel
  mortgaged?: boolean[]; // length 40
  tokens: { player: number; space: number; inJail?: boolean; id?: string }[];
  highlight?: number | null;
  playerColors: string[];
  /** soft glow on the space of the current event, in the acting player's colour, with a tooltip */
  highlightColor?: string;
  highlightTip?: string;
  /** ms per tile hop while a move animates; null = tokens snap */
  hopMs?: number | null;
  /** choreography hooks for the current step (delays in ms from step start); null when nothing animates */
  fx?: BoardFx | null;
};

// Geometry (viewBox 0 0 1372 1372)
export const SIZE = 1372;
export const CORNER = 182;
export const TILE_W = 112;
export const TILE_D = 182;

export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  /** rotation (deg, clockwise) so tile text faces the board centre */
  rot: number;
  corner: boolean;
}

export function placement(i: number): Placement {
  const far = SIZE - CORNER;
  if (i === 0) return { x: far, y: far, w: CORNER, h: CORNER, rot: 0, corner: true };
  if (i < 10) return { x: far - i * TILE_W, y: far, w: TILE_W, h: TILE_D, rot: 0, corner: false };
  if (i === 10) return { x: 0, y: far, w: CORNER, h: CORNER, rot: 0, corner: true };
  if (i < 20)
    return { x: 0, y: far - (i - 10) * TILE_W, w: TILE_D, h: TILE_W, rot: 90, corner: false };
  if (i === 20) return { x: 0, y: 0, w: CORNER, h: CORNER, rot: 0, corner: true };
  if (i < 30)
    return { x: CORNER + (i - 21) * TILE_W, y: 0, w: TILE_W, h: TILE_D, rot: 180, corner: false };
  if (i === 30) return { x: far, y: 0, w: CORNER, h: CORNER, rot: 0, corner: true };
  return { x: far, y: CORNER + (i - 31) * TILE_W, w: TILE_D, h: TILE_W, rot: 270, corner: false };
}

export function isOwnable(s: Space): boolean {
  return s.type === 'street' || s.type === 'station' || s.type === 'utility';
}
