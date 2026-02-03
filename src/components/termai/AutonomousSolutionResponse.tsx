
'use client';

import type { AutonomousSolutionOutput } from '@/ai/flows/autonomous-solution';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb, TerminalSquare, Zap, Cpu, BookOpen, ShieldCheck, AlertTriangle, Eye, ShieldAlert } from 'lucide-react';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';

export function AutonomousSolutionResponse({
  response,
}: {
  response: AutonomousSolutionOutput;
}) {
  const isHealthy = !response.peripheralStatus.includes('Infections');

  return (
    <Card className="bg-card/50 my-4 border-accent/20 shadow-lg animate-in fade-in slide-in-from-bottom-2">
      <CardHeader className="p-4 flex flex-row items-center justify-between border-b border-accent/10">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base text-primary flex items-center gap-2">
            <Cpu className="size-4 text-accent" />
            Shielded Evolution Engine
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[9px] h-4 py-0 border-primary/30 ${isHealthy ? 'text-green-500 border-green-500/30' : 'text-yellow-500 border-yellow-500/30'}`}>
              Immune Status: {isHealthy ? 'Healthy' : 'Compensating'}
            </Badge>
            <Badge variant="outline" className="text-[9px] h-4 py-0 border-accent/20 text-accent/70">
              Vibe: {response.neuralContext}
            </Badge>
          </div>
        </div>
        <Badge variant="secondary" className="bg-accent/10 text-accent text-[10px] uppercase tracking-tighter">
          Proprioception: {response.systemHealthImpact}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-6 text-sm p-4">
        {response.peripheralStatus.includes('Infections') && (
          <div className="bg-destructive/5 p-3 rounded-lg border border-destructive/20 space-y-2">
            <h4 className="flex items-center gap-2 text-[10px] font-bold text-destructive uppercase tracking-widest">
              <ShieldAlert className="size-3" />
              Isolated Infections Detected
            </h4>
            <p className="text-[11px] text-destructive/80 font-code italic">
              {response.peripheralStatus}
            </p>
          </div>
        )}

        {response.compensatoryStrategy && (
          <div className="bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/30 flex items-start gap-2">
            <AlertTriangle className="size-4 text-yellow-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h4 className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest">Compensatory Strategy Active</h4>
              <p className="text-xs text-yellow-100/80 italic">{response.compensatoryStrategy}</p>
            </div>
          </div>
        )}

        {response.visualInfections && response.visualInfections.length > 0 && (
          <div className="bg-accent/5 p-3 rounded-lg border border-accent/20">
            <h4 className="flex items-center gap-2 text-[10px] font-bold text-accent uppercase tracking-widest mb-1">
              <Eye className="size-3" />
              Visual Cortex Observations
            </h4>
            <ul className="space-y-1">
              {response.visualInfections.map((inf, i) => (
                <li key={i} className="text-xs text-foreground/70 flex items-center gap-2">
                  <span className="size-1 bg-accent rounded-full" />
                  {inf}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h3 className="flex items-center gap-2 font-semibold text-accent mb-2 uppercase text-[11px] tracking-widest">
            <Lightbulb className="size-4" />
            Strategic Research
          </h3>
          <p className="font-sans leading-relaxed text-foreground/80">
            {response.creativeSolution}
          </p>
        </div>
        
        {response.evolutionDraft && (
          <>
            <Separator className="bg-accent/10" />
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold text-yellow-500 uppercase text-[11px] tracking-widest">
                <Zap className="size-4 animate-pulse" />
                Self-Evolution: Logic Synthesis
              </h3>
              <div className="bg-black/60 p-4 rounded-md border border-yellow-500/20 overflow-x-auto">
                 <pre className="font-code text-xs text-yellow-100/90 leading-relaxed">
                  {response.evolutionDraft}
                </pre>
              </div>
              
              {response.memoryManagementExplanation && (
                <div className="bg-accent/5 p-3 rounded-lg border border-accent/10">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-accent mb-1">
                    <BookOpen className="size-3" />
                    Neural Pedagogical Record
                  </h4>
                  <p className="text-xs italic text-muted-foreground leading-relaxed">
                    {response.memoryManagementExplanation}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {response.finalCommand && (
          <>
            <Separator className="bg-accent/10" />
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-primary uppercase text-[11px] tracking-widest mb-2">
                <TerminalSquare className="size-4" />
                Hardened Execution Path
              </h3>
              <div className="font-code bg-black/80 p-4 rounded-md border border-primary/30 text-primary shadow-inner">
                {response.finalCommand}
              </div>
            </div>
          </>
        )}

        <div className="pt-2 flex items-center gap-2 text-[10px] text-muted-foreground border-t border-white/5">
          <ShieldCheck className="size-3 text-green-500" />
          <span>Sentinel Hardening Report: {response.hardeningReport}</span>
        </div>
      </CardContent>
    </Card>
  );
}
