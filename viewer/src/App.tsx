import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Board from './Board';
import { Dice } from './Dice';
import { SIZE, placement, spaces, type BoardView } from './boardData';
import { DEMO_NAME, DEMO_TEXT, SAMPLE_NAME, SAMPLE_TEXT } from './demo';
import { cardInfo, describeStep, pname, psub } from './describe';
import { Replay, ReplayError, highlightSpace, parseReplay, turnStarts } from './replay';
import { PLAYER_COLORS, useTokenAnim } from './hooks';
import { DUR, HOP_MS, motionMode, planStep, useReducedMotion, type Pos } from './motion';
import Fx from './Fx';
import { Summary } from './Summary';
import { Transport } from './Transport';
import { Seat } from './Seat';
import { Bank } from './Bank';
import { EventLog } from './EventLog';
import { CashChart } from './CashChart';
import { Rich, euro } from './format';

/** Hidden layout check: ?debugTokens=1 puts one pawn on every space, =2 puts two (and a jailed one on the jail corner). */
const DEBUG_TOKENS =
  typeof location !== 'undefined' ? new URLSearchParams(location.search).get('debugTokens') : null;
function debugTokens(mode: string) {
  const out: BoardView['tokens'] = [];
  for (let sp = 0; sp < 40; sp++) {
    out.push({ player: 0, space: sp, id: `a${sp}` });
    if (mode === '2') out.push({ player: 1, space: sp, id: `b${sp}` });
    if (sp === 10)
      out.push(
        { player: 1, space: 10, inJail: true, id: 'jail' },
        { player: 2, space: 10, inJail: true, id: 'jail2' },
      );
  }
  return out;
}

const initial = (): Replay => parseReplay(DEMO_TEXT);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const SPEEDS = [0.5, 1, 2, 4, 8, 16];
const plain = (t: string) => t.replace(/₼/g, 'M ');

export default function App() {
  const [replay, setReplay] = useState<Replay>(initial);
  const [source, setSource] = useState(DEMO_NAME);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<Pos>({ idx: 0, from: 0, animate: false, nonce: 0 });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [skipForced, setSkipForced] = useState(false);
  const [dragging, setDragging] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [endOn, setEndOn] = useState(false);
  const [expired, setExpired] = useState(-1);
  const reduced = useReducedMotion();

  const { steps, header } = replay;
  const total = steps.length;
  const step = steps[Math.min(pos.idx, total - 1)];
  const state = step.state;
  const overIdx = useMemo(
    () => steps.findIndex((s) => s.events.some((e) => e.type === 'game_over')),
    [steps],
  );
  const colors = PLAYER_COLORS;

  const live = useRef({ replay, pos, skipForced, speed });
  live.current = { replay, pos, skipForced, speed };

  const go = useCallback((i: number, animate: boolean) => {
    setPos((prev) => {
      const r = live.current.replay;
      const idx = clamp(i, 0, r.steps.length - 1);
      return { idx, from: prev.idx, animate, nonce: prev.nonce + 1 };
    });
  }, []);

  const nextIdx = useCallback((i: number, dir: 1 | -1) => {
    const { replay: r, skipForced: skip } = live.current;
    let j = i + dir;
    while (skip && j > 0 && j < r.steps.length - 1 && r.steps[j].forced) j += dir;
    return clamp(j, 0, r.steps.length - 1);
  }, []);

  const stepBy = useCallback(
    (dir: 1 | -1, animate: boolean) => go(nextIdx(live.current.pos.idx, dir), animate && dir === 1),
    [go, nextIdx],
  );

  const turnJump = useCallback(
    (dir: 1 | -1) => {
      const i = live.current.pos.idx;
      const st = live.current.replay;
      const ts = turnStarts(st.steps);
      const t =
        dir === 1
          ? (ts.find((x) => x > i) ?? st.steps.length - 1)
          : ([...ts].reverse().find((x) => x < i) ?? 0);
      go(t, false);
    },
    [go],
  );

  const load = useCallback((text: string, name: string) => {
    try {
      const r = parseReplay(text);
      setReplay(r);
      setSource(name);
      setError(null);
      setPlaying(false);
      setPos((p) => ({ idx: 0, from: 0, animate: false, nonce: p.nonce + 1 }));
      setDismissed(false);
    } catch (e) {
      setError(e instanceof ReplayError ? e.message : 'Die Datei konnte nicht gelesen werden.');
    }
  }, []);

  const loadFile = useCallback(
    (f: File | undefined | null) => {
      if (!f) return;
      f.text().then(
        (t) => load(t, f.name),
        () => setError('Die Datei konnte nicht gelesen werden.'),
      );
    },
    [load],
  );

  // choreography of the step just entered (null when seeking, spans > 8 steps, or nothing animates)
  const plan = useMemo(() => {
    if (!pos.animate || pos.idx <= pos.from || pos.idx - pos.from > 8) return null;
    return planStep(
      steps,
      pos.from,
      pos.idx,
      speed,
      motionMode(speed, reduced),
      pos.nonce,
      cardInfo,
    );
  }, [pos.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!plan) return;
    const id = window.setTimeout(() => setExpired(plan.nonce), plan.end + 150);
    return () => window.clearTimeout(id);
  }, [plan]);
  const activePlan = plan && expired !== plan.nonce ? plan : null;
  const full = activePlan?.mode === 'full';

  // playback timer: wait for the step's choreography, then advance
  useEffect(() => {
    if (!playing) return;
    const n = nextIdx(pos.idx, 1);
    if (n === pos.idx) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => go(n, true), plan ? plan.total : DUR.idle / speed);
    return () => window.clearTimeout(id);
  }, [playing, pos, speed, skipForced, steps, plan, go, nextIdx]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'SELECT' ||
          (t.tagName === 'INPUT' &&
            (t as HTMLInputElement).type !== 'range' &&
            (t as HTMLInputElement).type !== 'checkbox'))
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      let handled = true;
      switch (e.key) {
        case ' ':
          setPlaying((p) => !p);
          break;
        case 'ArrowRight':
          if (t?.tagName === 'INPUT' && (t as HTMLInputElement).type === 'range') return;
          setPlaying(false);
          stepBy(1, true);
          break;
        case 'ArrowLeft':
          if (t?.tagName === 'INPUT' && (t as HTMLInputElement).type === 'range') return;
          setPlaying(false);
          stepBy(-1, false);
          break;
        case 'Home':
          setPlaying(false);
          go(0, false);
          break;
        case 'End':
          setPlaying(false);
          go(live.current.replay.steps.length - 1, false);
          break;
        case ']':
          turnJump(1);
          break;
        case '[':
          turnJump(-1);
          break;
        case 'ArrowUp':
          setSpeed((s) => SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(s) + 1)] ?? s);
          break;
        case 'ArrowDown':
          setSpeed((s) => SPEEDS[Math.max(0, SPEEDS.indexOf(s) - 1)] ?? s);
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && (e.target as HTMLElement)?.tagName === 'BUTTON') e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  }, [go, stepBy, turnJump]);

  // close the load menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const down = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [menuOpen]);

  // drag & drop anywhere
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) =>
      !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const enter = (e: DragEvent) => {
      if (hasFiles(e)) {
        depth++;
        setDragging(true);
        e.preventDefault();
      }
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      loadFile(e.dataTransfer?.files[0]);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [loadFile]);

  const disp = useTokenAnim(steps, pos, plan);

  const tileRect = useCallback((space: number) => {
    const el = boardRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const k = r.width / SIZE,
      p = placement(space);
    return new DOMRect(r.left + p.x * k, r.top + p.y * k, p.w * k, p.h * k);
  }, []);

  const lines = describeStep(step, header);
  const sentences = lines.filter((l) => l.kind !== 'turn');
  const caption = sentences.length
    ? sentences.map((l) => l.text).join(' · ')
    : (lines[0]?.text ?? '');
  const actor = step.player ?? state.current_player;
  const view: BoardView = {
    owner: state.owner.map((o) => (o >= 0 ? o : null)),
    buildings: state.buildings,
    mortgaged: state.mortgaged.map(Boolean),
    tokens: DEBUG_TOKENS
      ? debugTokens(DEBUG_TOKENS)
      : state.players.flatMap((p, i) =>
          p.bankrupt
            ? []
            : [
                {
                  player: i,
                  space: disp[i] ?? p.position,
                  inJail: p.jail_turns > 0 && p.position === 10 && (disp[i] ?? p.position) === 10,
                },
              ],
        ),
    highlight: highlightSpace(step),
    highlightColor: colors[actor % colors.length],
    highlightTip: plain(caption),
    playerColors: colors,
    hopMs: full ? HOP_MS * activePlan!.s : null,
    fx: full
      ? {
          nonce: activePlan!.nonce,
          s: activePlan!.s,
          own: activePlan!.own,
          build: activePlan!.build,
          hlDelay: activePlan!.hlDelay,
        }
      : null,
  };

  const doubles =
    state.doubles > 0 &&
    state.phase === 'POST_ROLL' &&
    !(state.players[state.current_player]?.jail_turns > 0);
  const over =
    overIdx >= 0 && pos.idx >= overIdx
      ? (step.events.find((e) => e.type === 'game_over') ??
        steps[overIdx].events.find((e) => e.type === 'game_over'))
      : null;
  const overKey = over ? 1 : 0;
  // end moment: winner highlight, then the summary; seeking onto the end shows it at once
  useEffect(() => {
    setEndOn(false);
    if (!over) {
      setDismissed(false);
      return;
    }
    const t = plan?.overAt;
    if (t == null || plan?.mode !== 'full') {
      setEndOn(true);
      return;
    }
    const id = window.setTimeout(() => setEndOn(true), t);
    return () => window.clearTimeout(id);
  }, [overKey, pos.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const winnerSeat =
    over && endOn && typeof over.winner === 'number' && over.winner >= 0 ? over.winner : -1;
  const sumAnimated = !!activePlan && activePlan.overAt != null && pos.animate;
  const anyMort = state.mortgaged.some(Boolean);

  const seatFor = (p: number) => {
    const gh = activePlan?.ghost[p];
    const ap = activePlan;
    return (
      <Seat
        key={p}
        player={p}
        color={colors[p % colors.length]}
        header={header}
        state={state}
        current={state.current_player === p && state.phase !== 'GAME_OVER'}
        speed={speed}
        positionName={spaces[disp[p] ?? state.players[p].position]?.name ?? ''}
        fly={
          full && ap && Object.keys(ap.deed).length
            ? (sp) => {
                const d = ap.deed[sp];
                const r = d && state.owner[sp] === p ? tileRect(sp) : null;
                return r ? { rect: r, at: d.at, dur: d.dur } : null;
              }
            : undefined
        }
        cashDelay={full ? (ap?.cash[p] ?? 0) : 0}
        instant={!full}
        flash={pos.animate}
        ghosts={gh ? { nonce: pos.nonce, spaces: gh.spaces, at: gh.at } : null}
        winner={winnerSeat === p}
        pasch={
          doubles && state.current_player === p
            ? { count: state.doubles, delay: full ? (ap?.diceReveal ?? 0) : 0 }
            : null
        }
      />
    );
  };
  const n = state.players.length;
  const left = Array.from({ length: n }, (_, i) => i).filter((i) => i % 2 === 0);
  const right = Array.from({ length: n }, (_, i) => i).filter((i) => i % 2 === 1);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    loadFile(e.target.files?.[0]);
    e.target.value = '';
  };
  const rules = Object.entries(header.rules ?? {})
    .filter(([k]) => k !== 'max_turns' || !('max_rounds' in (header.rules ?? {})))
    .map(([k, v]): [string, unknown] =>
      k === 'max_rounds' || k === 'max_turns' ? ['Runden (Limit)', v] : [k, v],
    );

  const ticks = useMemo(() => turnStarts(steps), [steps]);
  const pick = (text: string, name: string) => {
    setMenuOpen(false);
    load(text, name);
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          Slopoly<span>Replay</span>
        </h1>
        <span className="src" title={source}>
          {source}
        </span>
        <button
          type="button"
          className="loadbtn"
          aria-expanded={sideOpen}
          aria-controls="side"
          onClick={() => setSideOpen((o) => !o)}
          title="Verlauf, Kontostand und Spielinfo ein- oder ausblenden"
        >
          Verlauf
        </button>
        <div className="loadmenu" ref={menuRef}>
          <button
            type="button"
            className="loadbtn"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            Replay laden
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <button type="button" role="menuitem" onClick={() => pick(DEMO_TEXT, DEMO_NAME)}>
                Demo-Partie
              </button>
              <button type="button" role="menuitem" onClick={() => pick(SAMPLE_TEXT, SAMPLE_NAME)}>
                Mini-Beispiel
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  fileRef.current?.click();
                }}
              >
                Datei öffnen<small>.jsonl vom Rechner</small>
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".jsonl,.json,application/json,text/plain"
            hidden
            onChange={onFile}
          />
        </div>
      </header>
      <div className="notices">
        {error && (
          <div className="alert" role="alert">
            <b>Replay konnte nicht geladen werden.</b> {error}
            <button type="button" onClick={() => setError(null)} aria-label="Schließen">
              ×
            </button>
          </div>
        )}
      </div>

      <main className={`stage${sideOpen ? '' : ' side-off'}`}>
        <div className="table">
          <div className="seats seats-l">{left.map(seatFor)}</div>
          <div className="board-col">
            <div className="board" ref={boardRef}>
              <Board view={view} />
            </div>
            {over && endOn && !dismissed && (
              <Summary
                replay={replay}
                idx={pos.idx}
                over={over}
                colors={colors}
                instant={!sumAnimated}
                delay={sumAnimated ? 450 * (activePlan?.s ?? 1) : 0}
                onClose={() => setDismissed(true)}
                onReplay={() => {
                  setDismissed(true);
                  go(0, false);
                  setPlaying(true);
                }}
              />
            )}
          </div>
          <div className="seats seats-r">
            {right.map(seatFor)}
            <Bank />
          </div>
        </div>

        <aside className="side" id="side" hidden={!sideOpen}>
          <section className="sec chart">
            <h2>Kontostand</h2>
            <CashChart
              steps={steps}
              idx={pos.idx}
              colors={colors}
              onSeek={(i) => {
                setPlaying(false);
                go(i, false);
              }}
            />
          </section>

          <section className="sec log">
            <h2>Ereignisse</h2>
            <div className="log-scroll">
              <EventLog
                steps={steps}
                header={header}
                idx={pos.idx}
                colors={colors}
                onJump={(i) => {
                  setPlaying(false);
                  go(i, false);
                }}
              />
            </div>
          </section>

          <details className="sec game">
            <summary>Spielinfo</summary>
            <dl className="facts">
              <div>
                <dt>Seed</dt>
                <dd>{String(header.seed ?? '–')}</dd>
              </div>
              <div>
                <dt>Engine</dt>
                <dd>{header.engine_version ?? '–'}</dd>
              </div>
              <div>
                <dt>Brett</dt>
                <dd>{header.board ?? '–'}</dd>
              </div>
              <div>
                <dt>Schritte</dt>
                <dd>{total - 1}</dd>
              </div>
              {state.houses_left !== undefined && (
                <div>
                  <dt>Bank</dt>
                  <dd>
                    {state.houses_left} Häuser, {state.hotels_left ?? 0} Hotels
                  </dd>
                </div>
              )}
              {!!state.pot && (
                <div>
                  <dt>Frei-Parken-Topf</dt>
                  <dd>
                    <Rich text={euro(state.pot)} />
                  </dd>
                </div>
              )}
            </dl>
            <div className="players-info">
              {header.players.map((p, i) => (
                <span key={i}>
                  <i style={{ background: colors[i % colors.length] }} />
                  {pname(header, i)}{' '}
                  <small>
                    {psub(header, i)}
                    {p.kind ? `, ${p.kind}` : ''}
                  </small>
                </span>
              ))}
            </div>
            {rules.length > 0 && (
              <div className="rules">
                {rules.map(([k, v]) => (
                  <span key={k} className={`chip ${v === true ? 'on' : v === false ? 'off' : ''}`}>
                    {k}: {v === true ? 'an' : v === false ? 'aus' : String(v)}
                  </span>
                ))}
              </div>
            )}
            {anyMort && (
              <p className="legend-m">
                <span className="hatch-sw" />
                Schraffierte Felder: Hypothek
              </p>
            )}
            <details className="debug">
              <summary>Debug: Rohdaten des Schritts</summary>
              <pre>
                {JSON.stringify(
                  step,
                  (_k, v) =>
                    Array.isArray(v) && v.length > 8 && v.every((x) => typeof x === 'number')
                      ? `[${v.join(',')}]`
                      : v,
                  1,
                ).replace(/"\[([-\d,]+)\]"/g, '[$1]')}
              </pre>
              {step.agent != null && (
                <>
                  <h3>Agent</h3>
                  <pre>{JSON.stringify(step.agent, null, 1)}</pre>
                </>
              )}
            </details>
          </details>
        </aside>
      </main>

      <Transport
        playing={playing}
        idx={pos.idx}
        total={total}
        turn={state.turn}
        speed={speed}
        skipForced={skipForced}
        onToggle={() => {
          if (pos.idx >= total - 1) go(0, false);
          setPlaying((p) => !p);
        }}
        onFirst={() => {
          setPlaying(false);
          go(0, false);
        }}
        onLast={() => {
          setPlaying(false);
          go(total - 1, false);
        }}
        onPrev={() => {
          setPlaying(false);
          stepBy(-1, false);
        }}
        onNext={() => {
          setPlaying(false);
          stepBy(1, true);
        }}
        onPrevTurn={() => turnJump(-1)}
        onNextTurn={() => turnJump(1)}
        onSeek={(i) => {
          setPlaying(false);
          go(i, false);
        }}
        onSpeed={setSpeed}
        onSkip={setSkipForced}
        ticks={ticks}
        dice={
          state.dice[0] > 0 ? (
            <span
              key={pos.nonce}
              className={full && activePlan!.diceReveal ? 'reveal' : undefined}
              style={full ? { animationDelay: `${activePlan!.diceReveal}ms` } : undefined}
            >
              <Dice values={state.dice} size={20} />
            </span>
          ) : null
        }
        caption={
          <span key={pos.nonce} className={pos.animate ? 'xf' : undefined}>
            <span className="who" style={{ background: colors[actor % colors.length] }} />
            {pos.idx === 0 ? 'Spielbeginn' : <Rich text={caption} />}
          </span>
        }
        extra={
          <>
            {doubles && <span className="note warn">Pasch, nochmal würfeln</span>}
            {step.forced && <span className="note">automatisch</span>}
            {state.phase === 'GAME_OVER' && (
              <button type="button" className="note bad link" onClick={() => setDismissed(false)}>
                Spiel vorbei – Zusammenfassung
              </button>
            )}
          </>
        }
      />

      {activePlan && <Fx plan={activePlan} board={boardRef.current} colors={colors} />}
      {dragging && (
        <div className="drop" aria-hidden="true">
          <div>Replay-Datei (.jsonl) hier ablegen</div>
        </div>
      )}
    </div>
  );
}
