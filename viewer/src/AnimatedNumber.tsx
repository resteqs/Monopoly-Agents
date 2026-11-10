import { useEffect, useRef, useState } from 'react';
import { euro, Rich } from './format';

/** Counts towards `value` after `delay` ms (so it lines up with the banknotes arriving or leaving);
 *  duration shrinks with playback speed. While counting the figure is tinted green (gain) or red (loss). */
export function AnimatedMoney({
  value,
  speed = 1,
  delay = 0,
  instant = false,
  flash = false,
}: {
  value: number;
  speed?: number;
  delay?: number;
  instant?: boolean;
  flash?: boolean;
}) {
  const [shown, setShown] = useState(value);
  const [dir, setDir] = useState<0 | 1 | -1>(0);
  const cur = useRef(value);
  useEffect(() => {
    const from = cur.current,
      to = value;
    if (from === to) return;
    const dur = Math.max(0, 450 / speed);
    if (instant || dur < 30) {
      // no counting: jump, with a brief colour flash (green up, red down)
      cur.current = to;
      setShown(to);
      if (!flash) {
        setDir(0);
        return;
      }
      setDir(to > from ? 1 : -1);
      const id = window.setTimeout(() => setDir(0), 520);
      return () => window.clearTimeout(id);
    }
    let raf = 0,
      t0 = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const v = from + (to - from) * (1 - Math.pow(1 - k, 3));
      cur.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
      else setDir(0);
    };
    const start = window.setTimeout(() => {
      setDir(to > from ? 1 : -1);
      t0 = performance.now();
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      window.clearTimeout(start);
      cancelAnimationFrame(raf);
    };
  }, [value, speed, delay, instant, flash]);
  return (
    <span className={dir > 0 ? 'tick-up' : dir < 0 ? 'tick-down' : undefined}>
      <Rich text={euro(shown)} />
    </span>
  );
}
