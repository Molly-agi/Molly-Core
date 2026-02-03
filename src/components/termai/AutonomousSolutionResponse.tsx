'use client';

import type { AutonomousSolutionOutput } from '@/ai/flows/autonomous-solution';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb, TerminalSquare, Zap, Cpu, BookOpen } from 'lucide-react';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';

export function AutonomousSolutionResponse({
  response,
}: {
  response: AutonomousSolutionOutput;
}) {
  return (
    <Card className="bg-card/50 my-4 border-accent/20 shadow-lg">
      <CardHeader className="p-4 flex flex-row items-center justify-between border-b border-accent/10">
        <CardTitle className="text-base text-primary flex items-center gap-2">
          <Cpu className="size-4 text-accent" />
          Autonomous Evolution Engine
        </CardTitle>
        <Badge variant="secondary" className="bg-accent/10 text-accent text-[10px] uppercase tracking-tighter">
          Proprioception: {response.systemHealthImpact}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-6 text-sm p-4">
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
                Self-Evolution: Generated Module
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
                    Memory Management Logic
                  </h4>
                  <p className="text-xs italic text-muted-foreground">
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
                Synthesized Execution
              </h3>
              <div className="font-code bg-black/80 p-4 rounded-md border border-primary/30 text-primary shadow-inner">
                {response.finalCommand}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
