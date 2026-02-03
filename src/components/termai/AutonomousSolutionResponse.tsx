'use client';

import type { AutonomousSolutionOutput } from '@/ai/flows/autonomous-solution';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb, ShieldCheck, TerminalSquare, Zap, Cpu } from 'lucide-react';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';

export function AutonomousSolutionResponse({
  response,
}: {
  response: AutonomousSolutionOutput;
}) {
  return (
    <Card className="bg-card/50 my-2 border-accent/20">
      <CardHeader className="p-4 flex flex-row items-center justify-between">
        <CardTitle className="text-base text-primary flex items-center gap-2">
          <Cpu className="size-4 text-accent" />
          Autonomous Orchestrator V2
        </CardTitle>
        <Badge variant="secondary" className="bg-accent/10 text-accent text-[10px]">
          {response.systemHealthImpact}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 text-sm p-4 pt-0">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-accent mb-2">
            <Lightbulb className="size-4" />
            Creative Strategy
          </h3>
          <p className="font-code whitespace-pre-wrap text-foreground/80">
            {response.creativeSolution}
          </p>
        </div>
        
        {response.evolutionDraft && (
          <>
            <Separator className="bg-accent/10" />
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-yellow-500 mb-2">
                <Zap className="size-4" />
                Self-Evolution: Module Drafted
              </h3>
              <div className="bg-black/40 p-3 rounded border border-yellow-500/20">
                 <pre className="font-code text-xs whitespace-pre-wrap text-yellow-100/80">
                  {response.evolutionDraft}
                </pre>
              </div>
            </div>
          </>
        )}

        {response.finalCommand && (
          <>
            <Separator className="bg-accent/10" />
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-accent mb-2">
                <TerminalSquare className="size-4" />
                Synthesized Execution
              </h3>
              <p className="font-code bg-black/60 p-3 rounded-md border border-primary/20 text-primary">
                {response.finalCommand}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
