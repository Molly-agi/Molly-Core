'use client';

import type { AutonomousSolutionOutput } from '@/app/actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb, ShieldCheck, TerminalSquare } from 'lucide-react';
import { Separator } from '../ui/separator';

export function AutonomousSolutionResponse({
  response,
}: {
  response: AutonomousSolutionOutput;
}) {
  return (
    <Card className="bg-card/50 my-2">
      <CardHeader className="p-4">
        <CardTitle className="text-base text-primary">
          Autonomous Agent Response
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm p-4 pt-0">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-accent mb-2">
            <Lightbulb className="size-4" />
            Creative Solution
          </h3>
          <p className="font-code whitespace-pre-wrap">
            {response.creativeSolution}
          </p>
        </div>
        <Separator />
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-accent mb-2">
            <ShieldCheck className="size-4" />
            Security Analysis
          </h3>
          <p className="font-code whitespace-pre-wrap">
            {response.securityAnalysis}
          </p>
        </div>
        {response.finalCommand && (
          <>
            <Separator />
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-accent mb-2">
                <TerminalSquare className="size-4" />
                Final Command
              </h3>
              <p className="font-code bg-black/30 p-2 rounded-md">
                {response.finalCommand}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
