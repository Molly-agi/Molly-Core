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
import { Loader2, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AutonomousSolutionResponse } from './AutonomousSolutionResponse';
import { DownloadableScript } from './DownloadableScript';
import {
  type HistoryItem,
  isScriptResponse,
  isAutonomousSolution,
  isImmuneReport,
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
        if (typeof line !== 'string') return null;

        const isUser = line.startsWith('>');
        const canCollapse = isCollapsibleLine(line, isUser);
        const isExpanded = expandedLines[index] ?? false;

        return (
          <div
            key={index}
            className={cn(
              'my-3 p-3 rounded-lg border',
              isUser
                ? 'text-primary bg-primary/5 border-primary/10'
                : 'text-foreground bg-secondary/30 border-white/5'
            )}
          >
            <div
              className={cn(
                'whitespace-pre-wrap',
                canCollapse && !isExpanded && 'max-h-32 overflow-hidden'
              )}
            >
              {line}
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
