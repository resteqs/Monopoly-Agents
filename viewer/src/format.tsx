import { Fragment, createElement, type ReactNode } from 'react';

const nf = new Intl.NumberFormat('de-DE');
/** Money marker: U+20BC (₼) stands for the kit's struck-through "M" and is rendered by <Rich>/<svgRich>. */
export const M = '₼';
export function euro(n: number): string {
  return `${M}${nf.format(Math.round(n))}`;
}
export function signedEuro(n: number): string {
  return `${n >= 0 ? '+' : '−'}${euro(Math.abs(n))}`;
}

/** DOM: render text, replacing the money marker with a struck-through M. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(M);
  const out: ReactNode[] = [];
  parts.forEach((p, i) => {
    if (i > 0) out.push(createElement('span', { key: `m${i}`, className: 'money' }, 'M'));
    out.push(createElement(Fragment, { key: `t${i}` }, p));
  });
  return createElement(Fragment, null, ...out);
}

/** SVG <text> children: struck-through M via text-decoration. */
export function svgRich(text: string): ReactNode[] {
  const parts = text.split(M);
  const out: ReactNode[] = [];
  parts.forEach((p, i) => {
    if (i > 0) out.push(createElement('tspan', { key: `m${i}`, className: 'money-svg' }, 'M'));
    if (p) out.push(createElement('tspan', { key: `t${i}` }, p));
  });
  return out;
}

function hex(c: string): [number, number, number] {
  const m = c.replace('#', '');
  const f =
    m.length === 3
      ? m
          .split('')
          .map((x) => x + x)
          .join('')
      : m;
  return [
    parseInt(f.slice(0, 2), 16) || 0,
    parseInt(f.slice(2, 4), 16) || 0,
    parseInt(f.slice(4, 6), 16) || 0,
  ];
}
/** amt in -1..1: negative darkens, positive lightens */
export function shade(c: string, amt: number): string {
  const t = amt < 0 ? 0 : 255;
  const a = Math.abs(amt);
  const [r, g, b] = hex(c);
  const h = (v: number) =>
    Math.round(v + (t - v) * a)
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
