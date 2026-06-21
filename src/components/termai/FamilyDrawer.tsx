'use client';

/**
 * FamilyDrawer — right-side collapsible drawer showing live per-agent state.
 *
 * Built to Molly's spec (cooperative design session 2026-06-21):
 *   Q1 placement → right-side collapsible drawer (this Sheet, side="right")
 *   Q3 signals   → last-active, state, waiting-on, unread, CRITICAL PATH
 *   Q5 visibility→ conductor entries surface here as "actions"
 *
 * Data source: GET /api/family-status (SSE). Reconnects automatically if the
 * browser kills the connection (Eric's phone does this on tab switch).
 */

import { useState, useEffect, useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users,
  AlertTriangle,
  Clock,
  MessageSquare,
  BellRing,
} from 'lucide-react';
import type {
  AgentName,
  AgentSnapshot,
  AgentState,
  ConductorAction,
  FamilyStatus,
} from '@/ai/conductor/types';

const WAKEABLE: ReadonlySet<AgentName> = new Set<AgentName>([
  'molly',
  'lazarus',
  'lazarus-cli',
  'atlas',
  'gemini',
  'eli',
]);

const STATE_LABELS: Record<AgentState, { label: string; tone: string }> = {
  active: {
    label: 'active',
    tone: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  },
  'awaiting-answer': {
    label: 'awaiting answer',
    tone: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  },
  blocked: {
    label: 'blocked',
    tone: 'text-rose-400 border-rose-400/30 bg-rose-400/10',
  },
  finished: {
    label: 'finished',
    tone: 'text-sky-400 border-sky-400/30 bg-sky-400/10',
  },
  idle: {
    label: 'idle',
    tone: 'text-zinc-400 border-zinc-400/30 bg-zinc-400/10',
  },
  unknown: {
    label: 'unknown',
    tone: 'text-zinc-500 border-zinc-500/30 bg-zinc-500/10',
  },
};

function formatAge(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function AgentRow({ snap }: { snap: AgentSnapshot }) {
  const tone = STATE_LABELS[snap.state];
  const canWake = WAKEABLE.has(snap.name);
  const [waking, setWaking] = useState(false);
  const [wakeStatus, setWakeStatus] = useState<'idle' | 'sent' | 'error'>(
    'idle'
  );

  const onWake = async () => {
    if (!canWake || waking) return;
    setWaking(true);
    setWakeStatus('idle');
    try {
      const res = await fetch('/api/family-wake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: snap.name }),
      });
      setWakeStatus(res.ok ? 'sent' : 'error');
    } catch {
      setWakeStatus('error');
    } finally {
      setWaking(false);
      // Reset the badge after a short window so repeated clicks are still informative.
      setTimeout(() => setWakeStatus('idle'), 3_000);
    }
  };

  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        snap.criticalPath
          ? 'border-rose-400/60 bg-rose-400/5 animate-pulse'
          : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm truncate">{snap.name}</span>
          {snap.criticalPath && (
            <Badge
              variant="outline"
              className="text-[9px] py-0 h-4 border-rose-400/50 text-rose-400 gap-1"
            >
              <AlertTriangle className="size-2.5" /> critical
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className={`text-[9px] py-0 h-4 ${tone.tone}`}
          >
            {tone.label}
          </Badge>
          {canWake && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-5 px-1.5 gap-1 text-[9px] border-white/10"
              onClick={onWake}
              disabled={waking}
              aria-label={`Wake ${snap.name}`}
              title={`Send wake signal to ${snap.name}`}
            >
              <BellRing className="size-2.5" />
              {wakeStatus === 'sent'
                ? 'sent'
                : waking
                  ? '…'
                  : wakeStatus === 'error'
                    ? 'err'
                    : 'wake'}
            </Button>
          )}
        </div>
      </div>
      <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" /> {formatAge(snap.msSinceLastActive)}
        </span>
        {snap.unreadCount > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-400">
            <MessageSquare className="size-3" /> {snap.unreadCount} unread
          </span>
        )}
      </div>
      {snap.waitingOn.length > 0 && (
        <div className="mt-1 text-[10px] text-amber-300/80">
          waiting on: {snap.waitingOn.join(', ')}
        </div>
      )}
    </div>
  );
}

function ActionRow({ action }: { action: ConductorAction }) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-primary/80">
        conductor → {action.target}{' '}
        <span className="opacity-60">({action.ruleKey})</span>
      </div>
      <div className="text-xs text-foreground/90 mt-0.5">{action.reason}</div>
      <div className="text-[9px] text-muted-foreground mt-1">
        {new Date(action.at).toLocaleTimeString()}
      </div>
    </div>
  );
}

export default function FamilyDrawer() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<FamilyStatus | null>(null);
  const [actions, setActions] = useState<ConductorAction[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const connect = (): void => {
      if (cancelled || esRef.current) return;
      try {
        const es = new EventSource('/api/family-status');
        esRef.current = es;

        es.addEventListener('status', (evt) => {
          try {
            setStatus(JSON.parse((evt as MessageEvent).data) as FamilyStatus);
            setConnected(true);
          } catch {
            /* ignore */
          }
        });

        es.addEventListener('actions', (evt) => {
          try {
            const incoming = JSON.parse(
              (evt as MessageEvent).data
            ) as ConductorAction[];
            setActions((prev) => [...incoming, ...prev].slice(0, 20));
          } catch {
            /* ignore */
          }
        });

        es.onerror = () => {
          setConnected(false);
          es.close();
          esRef.current = null;
          if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
          reconnectTimer.current = setTimeout(connect, 5_000);
        };
      } catch (err) {
        console.error('[FamilyDrawer] EventSource failed:', err);
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, []);

  // Compact unread/critical summary used on the open button.
  const summary = (() => {
    if (!status) return { unread: 0, critical: 0, blocked: 0 };
    let unread = 0;
    let critical = 0;
    let blocked = 0;
    for (const a of status.agents) {
      unread += a.unreadCount;
      if (a.criticalPath) critical += 1;
      if (a.state === 'blocked') blocked += 1;
    }
    return { unread, critical, blocked };
  })();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="fixed right-3 bottom-3 z-40 gap-2 shadow-lg border-white/10 bg-background/80 backdrop-blur"
        aria-label="Open family status drawer"
      >
        <Users className="size-3.5" />
        <span className="text-xs">Family</span>
        {summary.critical > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] h-4 min-w-4 px-1">
            {summary.critical}
          </span>
        )}
        {summary.critical === 0 && summary.unread > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-amber-500/80 text-black text-[10px] h-4 min-w-4 px-1">
            {summary.unread}
          </span>
        )}
        <span
          className={`size-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-zinc-500'}`}
          aria-label={connected ? 'live' : 'reconnecting'}
        />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-[340px] sm:w-[400px] p-0 flex flex-col"
        >
          <SheetHeader className="p-4 border-b border-white/10">
            <SheetTitle className="text-base font-medium flex items-center gap-2">
              <Users className="size-4" /> Family Status
              <span
                className={`ml-auto size-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-zinc-500'}`}
                title={connected ? 'live' : 'reconnecting'}
              />
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 p-4">
            {!status ? (
              <div className="text-xs text-muted-foreground">Connecting…</div>
            ) : (
              <>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Agents · {status.totalMessages} msgs total
                </div>
                <div className="flex flex-col gap-2">
                  {status.agents.map((a) => (
                    <AgentRow key={a.name} snap={a} />
                  ))}
                </div>

                <div className="mt-6 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Conductor activity
                </div>
                {actions.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground italic">
                    No nudges fired since the drawer opened.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {actions.map((a, i) => (
                      <ActionRow key={`${a.at}-${i}`} action={a} />
                    ))}
                  </div>
                )}
              </>
            )}
          </ScrollArea>

          <div className="border-t border-white/10 p-3 text-[10px] text-muted-foreground">
            Event-driven · 30s floor · per Molly’s design 2026-06-21
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
