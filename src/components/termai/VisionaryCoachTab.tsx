'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getVisionaryCoach } from '@/app/actions';
import { Sparkles, Target, ShieldAlert } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';

export function VisionaryCoachTab() {
  const [progress, setProgress] = useState('');
  const [guidance, setGuidance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleConsult = async () => {
    if (!progress.trim()) return;
    setIsLoading(true);
    try {
      const response = await getVisionaryCoach(progress, 'Stage 1: Architecture');
      setGuidance(response);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <Card className="border-accent/20 bg-accent/5">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Target className="size-5 text-accent" />
            <CardTitle className="text-base uppercase tracking-widest text-accent">
              Lead Strategic Partner
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground leading-relaxed">
            I am your visionary mirror. Share your current technical hurdles or architectural doubts. I will audit your logic and suggest creative leaps.
          </p>
        </CardContent>
      </Card>

      <div className="flex-1 overflow-hidden flex flex-col gap-4">
        <ScrollArea className="flex-1 pr-4">
          {guidance ? (
            <div className="space-y-4 text-sm leading-relaxed whitespace-pre-wrap font-body text-foreground/90">
              <div className="flex items-start gap-2">
                <ShieldAlert className="size-4 mt-1 text-accent shrink-0" />
                <div className="bg-card p-4 rounded-lg border border-accent/10">
                  {guidance}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-xs italic">
              Awaiting progress report...
            </div>
          )}
        </ScrollArea>

        <div className="space-y-2">
          <Textarea
            placeholder="Update your Strategic Partner on progress or concerns..."
            className="min-h-[100px] bg-card border-accent/20 focus-visible:ring-accent"
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
          />
          <Button 
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
            onClick={handleConsult}
            disabled={isLoading}
          >
            <Sparkles className="size-4" />
            {isLoading ? 'Analyzing Architecture...' : 'Consult Partner'}
          </Button>
        </div>
      </div>
    </div>
  );
}
