'use client';

/**
 * Agency Console — terminal UI
 * ------------------------------------------------------------------
 * A real terminal over /api/agency/console. Command history (↑/↓),
 * autocompletes parameter keys on Tab, and renders out/err streams in
 * distinct colors. Pairs with the slider panel: both hit the same
 * registry, so changes from either show up in the other's live feed.
 *
 * Optional admin token unlocks `override` (sent as a header). Without
 * it the engine refuses overrides, same fail-closed rule as the panel.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface Line {
  stream: 'out' | 'err' | 'cmd';
  text: string;
}

const ACCENT = '#7CFFB2';
const COMMANDS = ['help', 'ls', 'snapshot', 'get', 'desc', 'propose', 'override', 'pending', 'resolve', 'history', 'gov'];

export default function AgencyConsole({ compact = false }: { compact?: boolean } = {}) {
  const [lines, setLines] = useState<Line[]>([
    { stream: 'out', text: "molly agency console — type 'help'" },
  ]);
  const [input, setInput] = useState('');
  const [token, setToken] = useState('');
  const [operator, setOperator] = useState('console');
  const [hist, setHist] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [keys, setKeys] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // preload parameter keys for tab-completion
    fetch('/api/agency/registry')
      .then((r) => r.json())
      .then((d) => setKeys((d.parameters ?? []).map((p: { key: string }) => p.key)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const submit = useCallback(
    async (raw: string) => {
      const cmd = raw.trim();
      if (!cmd) return;
      setLines((l) => [...l, { stream: 'cmd', text: `› ${cmd}` }]);
      setHist((h) => [cmd, ...h].slice(0, 100));
      setHistIdx(-1);
      setInput('');
      try {
        const res = await fetch('/api/agency/console', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'x-molly-admin-token': token } : {}),
          },
          body: JSON.stringify({ input: cmd, operator }),
        });
        const data: { lines: Line[] } = await res.json();
        setLines((l) => [...l, ...data.lines]);
      } catch {
        setLines((l) => [...l, { stream: 'err', text: 'request failed' }]);
      }
    },
    [token, operator],
  );

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      submit(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const ni = Math.min(histIdx + 1, hist.length - 1);
      if (ni >= 0) {
        setHistIdx(ni);
        setInput(hist[ni]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const ni = histIdx - 1;
      setHistIdx(ni);
      setInput(ni >= 0 ? hist[ni] : '');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const parts = input.split(/\s+/);
      if (parts.length === 1) {
        const m = COMMANDS.filter((c) => c.startsWith(parts[0]));
        if (m.length === 1) setInput(m[0] + ' ');
      } else {
        const last = parts[parts.length - 1];
        const m = keys.filter((k) => k.startsWith(last));
        if (m.length === 1) {
          parts[parts.length - 1] = m[0];
          setInput(parts.join(' ') + ' ');
        }
      }
    }
  };

  return (
    <div style={compact ? { ...styles.root, ...styles.rootCompact } : styles.root}>
      <div style={styles.bar}>
        <span style={styles.title}>AGENCY CONSOLE</span>
        <div style={styles.fields}>
          <input style={styles.field} placeholder="operator" value={operator} onChange={(e) => setOperator(e.target.value)} />
          <input style={styles.field} placeholder="admin token (for override)" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
        </div>
      </div>
      <div ref={scrollRef} style={styles.screen}>
        {lines.map((l, i) => (
          <div key={i} style={{ color: l.stream === 'err' ? '#FF6B6B' : l.stream === 'cmd' ? '#EAF2F8' : '#9FB4C2', whiteSpace: 'pre-wrap' }}>
            {l.text}
          </div>
        ))}
      </div>
      <div style={styles.promptRow}>
        <span style={{ color: ACCENT }}>›</span>
        <input
          autoFocus
          spellCheck={false}
          style={styles.prompt}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="get governor.maxConcurrentFlows"
        />
      </div>
    </div>
  );
}

const mono = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const styles: Record<string, React.CSSProperties> = {
  root: { background: '#07090B', border: '1px solid #1C262E', borderRadius: 4, fontFamily: mono, fontSize: 12.5, color: '#9FB4C2', display: 'flex', flexDirection: 'column', height: 460 },
  rootCompact: { height: '100%', minHeight: 360, fontSize: 11 },
  bar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #1C262E' },
  title: { letterSpacing: 2, color: '#5A6B7B', fontSize: 11 },
  fields: { display: 'flex', gap: 6 },
  field: { background: '#0E141A', border: '1px solid #243039', color: '#D7E0E8', padding: '4px 8px', fontFamily: mono, fontSize: 11, width: 150 },
  screen: { flex: 1, overflowY: 'auto', padding: 12, lineHeight: 1.55 },
  promptRow: { display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', borderTop: '1px solid #1C262E' },
  prompt: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#EAF2F8', fontFamily: mono, fontSize: 12.5 },
};
