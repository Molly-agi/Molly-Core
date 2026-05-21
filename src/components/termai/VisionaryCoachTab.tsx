'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  sendGeminiSpiritualTask,
  getGeminiSpiritualFeed,
} from '@/app/actions';
import { Sparkles, Target, ShieldAlert } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase/auth/use-user';

export function VisionaryCoachTab() {
  const { user } = useUser();
  const [progress, setProgress] = useState('');
  const [guidance, setGuidance] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { toast } = useToast();

  const handleSleepNotice = (message: string) => {
    if (!message.toLowerCase().startsWith('sleep mode')) return;
    toast({
      title: 'Sleep Mode Active',
      description: message,
    });
  };

  useEffect(() => {
    let mounted = true;

    if (!loaded) {
      getGeminiSpiritualFeed(40)
        .then((feed) => {
          if (!mounted) return;
          const lines = feed.map(
            (msg) => `[${msg.from.toUpperCase()}] ${msg.content}`
          );
          setGuidance(lines);
          setLoaded(true);
        })
        .catch(() => {
          if (mounted) setLoaded(true);
        });
    }

    return () => {
      mounted = false;
    };
  }, [loaded]);

  const handleConsult = async () => {
    if (!progress.trim() || !user) return;
    setIsLoading(true);
    try {
      const response = await sendGeminiSpiritualTask(progress, user.uid);
      const line = `${response.answer}\n\nTask ID: ${response.taskId}`;
      setGuidance((prev) => [...prev, `[SYSTEM] ${line}`]);
      setProgress('');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Request failed.';
      setGuidance((prev) => [...prev, `[SYSTEM] ${message}`]);
      handleSleepNotice(message);
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
              Gemini Spiritual Advisor
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Sends direct communion tasks to Gemini and displays advisor traffic.
            This channel is independent of bridge daemon availability.
          </p>
        </CardContent>
      </Card>

      <div className="flex-1 overflow-hidden flex flex-col gap-4">
        <ScrollArea className="flex-1 pr-4">
          {guidance.length > 0 ? (
            <div className="space-y-4 text-sm leading-relaxed whitespace-pre-wrap font-body text-foreground/90">
              {guidance.map((line, idx) => (
                <div className="flex items-start gap-2" key={`${idx}-${line.slice(0, 24)}`}>
                  <ShieldAlert className="size-4 mt-1 text-accent shrink-0" />
                  <div className="bg-card p-4 rounded-lg border border-accent/10">
                    {line}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-xs italic">
              Awaiting spiritual advisor prompt...
            </div>
          )}
        </ScrollArea>

        <div className="space-y-2">
          <Textarea
            placeholder="Send a spiritual guidance prompt to Gemini..."
            className="min-h-[100px] bg-card border-accent/20 focus-visible:ring-accent"
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
          />
          <Button
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
            onClick={handleConsult}
            disabled={isLoading || !user}
          >
            <Sparkles className="size-4" />
            {isLoading ? 'Dispatching to Gemini...' : 'Consult Spiritual Advisor'}
          </Button>
        </div>
      </div>
    </div>
  );
}
