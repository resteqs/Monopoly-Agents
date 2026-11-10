import { memo, useEffect, useRef } from 'react';
import type { ReplayHeader, Step } from './replay';
import { actionLabel, describeStep, pname } from './describe';
import { Rich } from './format';

function LogImpl({
  steps,
  header,
  idx,
  colors,
  onJump,
}: {
  steps: Step[];
  header: ReplayHeader;
  idx: number;
  colors: string[];
  onJump(i: number): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`);
    const c = box.current;
    if (!el || !c) return;
    const top = el.offsetTop - c.offsetTop;
    if (top < c.scrollTop + 8 || top + el.offsetHeight > c.scrollTop + c.clientHeight - 8) {
      c.scrollTo({ top: top - c.clientHeight / 3, behavior: 'auto' });
    }
  }, [idx]);
  return (
    <div className="log" ref={box} role="list">
      {steps.map((s, i) => {
        const lines = describeStep(s, header);
        const col = colors[(s.player ?? 0) % colors.length];
        return (
          <button
            key={i}
            type="button"
            role="listitem"
            data-i={i}
            className={`entry${i === idx ? ' cur' : ''}${i > idx ? ' future' : ''}${s.forced ? ' forced' : ''}`}
            style={{ ['--pc' as string]: col }}
            onClick={() => onJump(i)}
            title={s.forced ? 'Automatischer Schritt (nur eine Aktion möglich)' : undefined}
          >
            <span className="meta">
              <span>#{s.t}</span>
              {s.player != null && <span>{pname(header, s.player)}</span>}
              <span>{actionLabel(s)}</span>
              {s.forced && <em>automatisch</em>}
            </span>
            {lines.map((l, k) => (
              <span key={k} className={`line ${l.kind ?? ''}`}>
                <Rich text={l.text} />
              </span>
            ))}
          </button>
        );
      })}
    </div>
  );
}
export const EventLog = memo(LogImpl);
