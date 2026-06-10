'use client';

/**
 * Agency Admin Window
 * ------------------------------------------------------------------
 * Live control surface over the parameter registry + governor.
 *   - Renders a typed control per parameter from the `ui` metadata
 *     (int/slider → range, enum → select, toggle → switch).
 *   - Reads /api/agency/registry once, then tails the SSE stream so
 *     edits from the command console (or the other operator) show up
 *     live in both the controls and the history feed.
 *   - Two write modes: PROPOSE (default, safe — owner still decides)
 *     and OVERRIDE (privileged — sends x-molly-admin-token).
 *
 * No external UI deps on purpose: drops into Molly-Core as-is.
 * Aesthetic: dark instrument panel, phosphor accent, monospace values.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UiMeta {
  control: 'slider' | 'int' | 'number' | 'enum' | 'toggle';
  min?: number;
  max?: number;
  step?: number;
  options?: (string | number)[];
  unit?: string;
}
interface ParamDesc {
  key: string;
  value: unknown;
  owner: string;
  version: number;
  description?: string;
  ui?: UiMeta;
  lastWriter: string;
  lastChangedAt: number;
}
interface GovernorSnap {
  active: Record<string, number>;
  limits: Record<string, number>;
  inFlight: { id: string; kind: string; type: string; priority: number }[];
}
interface Change {
  key: string;
  from: unknown;
  to: unknown;
  by: string;
  reason: string;
  at: number;
  kind: string;
}
interface ReadPayload {
  parameters: ParamDesc[];
  governor: GovernorSnap;
  history: Change[];
}

const ACCENT = '#7CFFB2'; // phosphor green
const KIND_COLOR: Record<string, string> = {
  'operator-override': '#FFB454',
  'proposal-rejected': '#FF6B6B',
  commit: ACCENT,
  init: '#5A6B7B',
  'proposal-accepted': ACCENT,
};

export default function AgencyAdminWindow({ compact = false }: { compact?: boolean } = {}) {
  const [params, setParams] = useState<ParamDesc[]>([]);
  const [governor, setGovernor] = useState<GovernorSnap | null>(null);
  const [history, setHistory] = useState<Change[]>([]);
  const [overrideMode, setOverrideMode] = useState(false);
  const [token, setToken] = useState('');
  const [operator, setOperator] = useState('admin');
  const [status, setStatus] = useState<string>('');
  const draft = useRef<Record<string, number | string>>({});

  const load = useCallback(async () => {
    const res = await fetch('/api/agency/registry');
    const data: ReadPayload = await res.json();
    setParams(data.parameters);
    setGovernor(data.governor);
    setHistory(data.history.slice(-60).reverse());
  }, []);

  useEffect(() => {
    load();
    const es = new EventSource('/api/agency/registry/stream');
    es.onmessage = (e) => {
      try {
        const change: Change = JSON.parse(e.data);
        setHistory((h) => [change, ...h].slice(0, 60));
        // reflect committed value live
        setParams((ps) =>
          ps.map((p) => (p.key === change.key ? { ...p, value: change.to, lastWriter: change.by, version: p.version + 1, lastChangedAt: change.at } : p)),
        );
      } catch {
        /* heartbeat/comment line */
      }
    };
    es.onerror = () => setStatus('stream disconnected — retrying…');
    return () => es.close();
  }, [load]);

  const write = useCallback(
    async (key: string, value: number | string) => {
      const action = overrideMode ? 'override' : 'propose';
      const res = await fetch('/api/agency/registry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(overrideMode ? { 'x-molly-admin-token': token } : {}),
        },
        body: JSON.stringify({
          action,
          key,
          value,
          actor: overrideMode ? operator : 'admin-panel',
          reason: overrideMode ? 'operator override via panel' : 'proposed via panel',
        }),
      });
      const body = await res.json();
      if (res.ok) {
        setStatus(overrideMode ? `override applied: ${key}` : `proposed ${key} (owner decides)`);
      } else {
        setStatus(`✗ ${res.status}: ${body.error ?? 'failed'}`);
      }
    },
    [overrideMode, token, operator],
  );

  return (
    <div style={compact ? { ...styles.root, ...styles.rootCompact } : styles.root}>
      <Header
        overrideMode={overrideMode}
        setOverrideMode={setOverrideMode}
        token={token}
        setToken={setToken}
        operator={operator}
        setOperator={setOperator}
      />

      {governor && <GovernorStrip g={governor} />}

      <div style={compact ? { ...styles.grid, ...styles.gridCompact } : styles.grid}>
        <section style={styles.panel}>
          <h2 style={styles.h2}>PARAMETERS</h2>
          {params.map((p) => (
            <ParamRow
              key={p.key}
              p={p}
              overrideMode={overrideMode}
              onCommit={(v) => write(p.key, v)}
              onDraft={(v) => (draft.current[p.key] = v)}
            />
          ))}
        </section>

        <section style={styles.panel}>
          <h2 style={styles.h2}>CHANGE FEED</h2>
          <div style={styles.feed}>
            {history.map((c, i) => (
              <div key={i} style={styles.feedRow}>
                <span style={{ color: KIND_COLOR[c.kind] ?? '#9AB' }}>●</span>{' '}
                <span style={styles.feedKey}>{c.key.replace('governor.', '')}</span>{' '}
                <span style={styles.dim}>{fmt(c.from)}→</span>
                <span style={{ color: ACCENT }}>{fmt(c.to)}</span>{' '}
                <span style={styles.dim}>
                  {c.by} · {c.reason}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer style={styles.footer}>{status || 'live'}</footer>
    </div>
  );
}

function ParamRow({
  p,
  overrideMode,
  onCommit,
  onDraft,
}: {
  p: ParamDesc;
  overrideMode: boolean;
  onCommit: (v: number | string) => void;
  onDraft: (v: number | string) => void;
}) {
  const ui = p.ui;
  const [local, setLocal] = useState<number | string>(p.value as number | string);
  useEffect(() => setLocal(p.value as number | string), [p.value]);

  const isNumeric = ui && (ui.control === 'slider' || ui.control === 'int' || ui.control === 'number');
  const verb = overrideMode ? 'SET' : 'PROPOSE';

  return (
    <div style={styles.paramRow}>
      <div style={styles.paramHead}>
        <span style={styles.paramKey}>{p.key.replace('governor.', '')}</span>
        <span style={styles.owner}>owner: {p.owner}</span>
      </div>
      {p.description && <div style={styles.desc}>{p.description}</div>}

      <div style={styles.controlRow}>
        {isNumeric && ui && (
          <>
            <input
              type="range"
              min={ui.min}
              max={ui.max}
              step={ui.step ?? 1}
              value={Number(local)}
              onChange={(e) => {
                const v = ui.control === 'number' ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
                setLocal(v);
                onDraft(v);
              }}
              style={styles.range}
            />
            <span style={styles.value}>
              {String(local)}
              {ui.unit ? <span style={styles.unit}> {ui.unit}</span> : null}
            </span>
          </>
        )}
        {ui?.control === 'enum' && (
          <select value={String(local)} onChange={(e) => setLocal(e.target.value)} style={styles.select}>
            {ui.options?.map((o) => (
              <option key={String(o)} value={String(o)}>
                {String(o)}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => onCommit(local)}
          style={{ ...styles.btn, ...(overrideMode ? styles.btnOverride : {}) }}
        >
          {verb}
        </button>
      </div>
      <div style={styles.meta}>
        v{p.version} · last: {p.lastWriter}
      </div>
    </div>
  );
}

function GovernorStrip({ g }: { g: GovernorSnap }) {
  return (
    <div style={styles.govStrip}>
      {Object.keys(g.limits).map((k) => {
        const active = g.active[k] ?? 0;
        const limit = g.limits[k];
        const pct = limit ? Math.min(100, (active / limit) * 100) : 0;
        return (
          <div key={k} style={styles.gauge}>
            <div style={styles.gaugeLabel}>
              {k}s <span style={{ color: ACCENT }}>{active}</span>
              <span style={styles.dim}>/{limit}</span>
            </div>
            <div style={styles.gaugeTrack}>
              <div style={{ ...styles.gaugeFill, width: `${pct}%`, background: pct > 80 ? '#FFB454' : ACCENT }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Header(props: {
  overrideMode: boolean;
  setOverrideMode: (b: boolean) => void;
  token: string;
  setToken: (s: string) => void;
  operator: string;
  setOperator: (s: string) => void;
}) {
  return (
    <header style={styles.header}>
      <div>
        <span style={styles.title}>MOLLY · AGENCY CONTROL</span>
        <span style={styles.sub}>parameter registry · cognitive governor</span>
      </div>
      <div style={styles.modeBox}>
        <label style={styles.modeLabel}>
          <input
            type="checkbox"
            checked={props.overrideMode}
            onChange={(e) => props.setOverrideMode(e.target.checked)}
          />
          <span style={{ color: props.overrideMode ? '#FFB454' : '#9AB' }}>
            {props.overrideMode ? 'OPERATOR OVERRIDE' : 'PROPOSE MODE'}
          </span>
        </label>
        {props.overrideMode && (
          <div style={styles.overrideFields}>
            <input
              placeholder="operator"
              value={props.operator}
              onChange={(e) => props.setOperator(e.target.value)}
              style={styles.tokenInput}
            />
            <input
              placeholder="admin token"
              type="password"
              value={props.token}
              onChange={(e) => props.setToken(e.target.value)}
              style={styles.tokenInput}
            />
          </div>
        )}
      </div>
    </header>
  );
}

function fmt(v: unknown): string {
  if (v === undefined) return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const mono = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const styles: Record<string, React.CSSProperties> = {
  root: { background: '#0B0F12', color: '#D7E0E8', fontFamily: mono, minHeight: '100vh', padding: 20, fontSize: 13 },
  rootCompact: { minHeight: 'auto', padding: 10, fontSize: 11 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #1C262E', paddingBottom: 14, marginBottom: 16 },
  title: { display: 'block', letterSpacing: 3, fontSize: 15, color: '#EAF2F8' },
  sub: { color: '#5A6B7B', fontSize: 11, letterSpacing: 1 },
  modeBox: { textAlign: 'right' },
  modeLabel: { display: 'inline-flex', gap: 8, alignItems: 'center', letterSpacing: 1, fontSize: 11, cursor: 'pointer' },
  overrideFields: { marginTop: 8, display: 'flex', gap: 6, justifyContent: 'flex-end' },
  tokenInput: { background: '#11181D', border: '1px solid #243039', color: '#D7E0E8', padding: '5px 8px', fontFamily: mono, fontSize: 11, width: 110 },
  govStrip: { display: 'flex', gap: 18, marginBottom: 18, flexWrap: 'wrap' },
  gauge: { minWidth: 120 },
  gaugeLabel: { fontSize: 11, marginBottom: 4, color: '#9AB' },
  gaugeTrack: { height: 4, background: '#1C262E', borderRadius: 2, overflow: 'hidden' },
  gaugeFill: { height: '100%', transition: 'width .3s ease' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  gridCompact: { gridTemplateColumns: '1fr', gap: 10 },
  panel: { background: '#0E141A', border: '1px solid #1C262E', borderRadius: 4, padding: 16 },
  h2: { fontSize: 11, letterSpacing: 2, color: '#5A6B7B', margin: '0 0 14px' },
  paramRow: { padding: '12px 0', borderBottom: '1px solid #161F26' },
  paramHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  paramKey: { color: '#EAF2F8', fontSize: 13 },
  owner: { color: '#5A6B7B', fontSize: 10 },
  desc: { color: '#6E7F8E', fontSize: 11, margin: '3px 0 8px' },
  controlRow: { display: 'flex', gap: 12, alignItems: 'center' },
  range: { flex: 1, accentColor: ACCENT },
  value: { minWidth: 70, textAlign: 'right', color: ACCENT },
  unit: { color: '#5A6B7B', fontSize: 10 },
  select: { flex: 1, background: '#11181D', border: '1px solid #243039', color: '#D7E0E8', padding: 6, fontFamily: mono },
  btn: { background: 'transparent', border: `1px solid ${ACCENT}`, color: ACCENT, padding: '6px 14px', cursor: 'pointer', fontFamily: mono, fontSize: 11, letterSpacing: 1 },
  btnOverride: { borderColor: '#FFB454', color: '#FFB454' },
  meta: { color: '#3F4D58', fontSize: 10, marginTop: 6 },
  feed: { display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 420, overflowY: 'auto' },
  feedRow: { fontSize: 11, lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  feedKey: { color: '#EAF2F8' },
  dim: { color: '#5A6B7B' },
  footer: { marginTop: 16, paddingTop: 12, borderTop: '1px solid #1C262E', color: '#5A6B7B', fontSize: 11 },
};
