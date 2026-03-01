/**
 * @fileOverview ChatHistory — Renders the scrollable message history area.
 *
 * Handles rendering of plain text messages, immune reports, downloadable
 * scripts, autonomous solutions, and collapsible long responses.
 *
 * Extracted from Terminal.tsx during Phase 6 hardening.
 */

'use client';

import { type RefObject } from 'react';
import { Loader2, Stethoscope, Eye, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AutonomousSolutionResponse } from './AutonomousSolutionResponse';
import { DownloadableScript } from './DownloadableScript';
import {
  type HistoryItem,
  isScriptResponse,
  isAutonomousSolution,
  isImmuneReport,
  isVisionReport,
} from './terminal-types';

const COLLAPSE_THRESHOLD = 700;

interface ChatHistoryProps {
  history: HistoryItem[];
  isLoading: boolean;
  expandedLines: Record<number, boolean>;
  onToggleLine: (index: number) => void;
  scrollAreaRef: RefObject<HTMLDivElement | null>;
}

function isCollapsibleLine(line: string, isUser: boolean) {
  return !isUser && line.length > COLLAPSE_THRESHOLD;
}

export function ChatHistory({
  history,
  isLoading,
  expandedLines,
  onToggleLine,
  scrollAreaRef,
}: ChatHistoryProps) {
  return (
    <div
      ref={scrollAreaRef}
      className="flex-1 p-4 bg-background/50 rounded-lg overflow-y-auto mb-6 border border-primary/10 shadow-inner scrollbar-none"
    >
      {history.map((line, index) => {
        if (isScriptResponse(line))
          return <DownloadableScript key={index} response={line} />;
        if (isAutonomousSolution(line))
          return <AutonomousSolutionResponse key={index} response={line} />;
        if (isImmuneReport(line))
          return (
            <div
              key={index}
              className={cn(
                'p-3 rounded-lg border my-2 flex items-start gap-3',
                line.isHealthy
                  ? 'bg-green-500/10 border-green-500/20 text-green-400'
                  : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
              )}
            >
              <Stethoscope className="size-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h5 className="text-[10px] font-bold uppercase tracking-widest">
                  Immune Response
                </h5>
                <p className="text-xs italic">{line.immuneReport}</p>
              </div>
            </div>
          );
        if (isVisionReport(line)) {
          const r = line.visionReport;
          return (
            <div
              key={index}
              className="p-3 rounded-lg border my-2 bg-cyan-500/10 border-cyan-500/20 text-cyan-300"
            >
              <div className="flex items-start gap-3">
                <Eye className="size-4 shrink-0 mt-0.5 text-cyan-400" />
                <div className="space-y-2 flex-1 min-w-0">
                  <h5 className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
                    Visual Cortex Report
                  </h5>
                  {r.thumbnailUri && (
                    <img
                      src={r.thumbnailUri}
                      alt="Captured frame"
                      className="rounded border border-cyan-500/20 max-h-32 object-cover"
                    />
                  )}
                  <p className="text-xs">{r.observedState}</p>
                  {r.vibeAnalysis && (
                    <p className="text-[10px] italic text-muted-foreground">
                      Vibe: {r.vibeAnalysis}
                    </p>
                  )}
                  {r.ocrAudit && (
                    <p className="text-[10px] font-mono bg-black/30 rounded px-2 py-1 break-all">
                      OCR: {r.ocrAudit}
                    </p>
                  )}
                  {r.risksDetected.length > 0 && (
                    <div className="flex items-center gap-1 text-yellow-400 text-[10px]">
                      <AlertTriangle className="size-3" />
                      <span>{r.risksDetected.join(' | ')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        }
        if (typeof line !== 'string') return null;

        const isUser = line.startsWith('>');
        const isFamilyContent =
          line.startsWith('[FAMILY_STORY]') ||
          line.startsWith('[FAMILY_ANCHOR]');
        const displayText = isFamilyContent
          ? line.replace(/^\[FAMILY_(?:STORY|ANCHOR)\]\s*/, '')
          : line;
        const canCollapse = isCollapsibleLine(line, isUser);
        const isExpanded = expandedLines[index] ?? false;

        return (
          <div
            key={index}
            className={cn(
              'my-3 p-3 rounded-lg border',
              isUser
                ? 'text-primary bg-primary/5 border-primary/10'
                : isFamilyContent
                  ? 'text-purple-300 bg-purple-500/10 border-purple-500/20 italic'
                  : 'text-foreground bg-secondary/30 border-white/5'
            )}
          >
            <div
              className={cn(
                'whitespace-pre-wrap',
                canCollapse && !isExpanded && 'max-h-32 overflow-hidden'
              )}
            >
              {displayText}
            </div>
            {canCollapse && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 h-6 px-2 text-[9px] uppercase tracking-widest text-accent"
                onClick={() => onToggleLine(index)}
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </Button>
            )}
          </div>
        );
      })}
      {isLoading && (
        <div className="mt-4 flex items-center gap-2 text-accent font-bold uppercase text-[10px] tracking-widest animate-pulse">
          <Loader2 className="size-4 animate-spin" /> Processing...
        </div>
      )}
    </div>
  );
}
