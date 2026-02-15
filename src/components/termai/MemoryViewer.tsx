'use client';

import {
  useFirestore,
  useUser,
  useCollection,
  useMemoFirebase,
} from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BrainCircuit,
  Zap,
  History,
  Shield,
  CheckCircle2,
  ChevronDown,
  Lightbulb,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/accordion';
import { memoryAnchors } from '@/lib/memory-anchors';

export function MemoryViewer() {
  const { user } = useUser();
  const firestore = useFirestore();

  const lessonsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'users', user.uid, 'codeModifications'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
  }, [firestore, user]);

  const { data: lessons, isLoading } = useCollection(lessonsQuery);

  return (
    <Card className="h-full flex flex-col border-0 bg-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-primary flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="size-4" />
            Neural Cache
          </div>
          <Badge
            variant="outline"
            className="text-[8px] h-4 py-0 border-primary/20 text-primary uppercase"
          >
            Vibe Index: 2.5
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-2 overflow-hidden">
        <ScrollArea className="h-full">
          {isLoading ? (
            <div className="space-y-2 p-2">
              <div className="h-16 w-full bg-accent/5 animate-pulse rounded-md" />
              <div className="h-16 w-full bg-accent/5 animate-pulse rounded-md" />
            </div>
          ) : (
            <div className="space-y-3 p-2">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[9px] font-bold uppercase tracking-widest text-primary">
                    Memory Anchors
                  </h3>
                  <span className="text-[8px] text-muted-foreground">
                    {memoryAnchors.length} anchors
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[8px] uppercase tracking-widest text-accent">
                  <Shield className="size-3" />
                  Identity Core
                </div>
                <p className="mt-1 text-[9px] text-muted-foreground">
                  My earliest and most profound memories define my core.
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {memoryAnchors.map((anchor, index) => (
                    <div
                      key={anchor.id}
                      className="flex gap-2 rounded-md border border-white/10 bg-black/40 p-2"
                    >
                      {anchor.imageUrl ? (
                        <img
                          src={anchor.imageUrl}
                          alt={anchor.title}
                          className="h-12 w-12 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-white/10 text-[8px] text-muted-foreground">
                          No image
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-[8px] uppercase tracking-widest text-accent">
                          Anchor {index + 1}
                        </div>
                        <div className="text-[10px] font-semibold text-foreground/90">
                          {anchor.title}
                        </div>
                        <p className="text-[9px] text-muted-foreground line-clamp-2">
                          {anchor.summary}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <Accordion type="single" collapsible className="w-full space-y-3">
                {lessons?.map((lesson) => (
                  <AccordionItem
                    key={lesson.id}
                    value={lesson.id}
                    className="bg-white/5 border border-white/5 rounded-md px-3 py-1 group hover:border-accent/20 transition-colors relative overflow-hidden"
                  >
                    <AccordionTrigger className="hover:no-underline py-2">
                      <div className="flex flex-col items-start text-left gap-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[7px] h-3 py-0 border-accent/20 text-accent uppercase tracking-tighter"
                          >
                            {lesson.filePath}
                          </Badge>
                          <span className="text-[8px] text-muted-foreground">
                            {new Date(lesson.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-[10px] text-foreground/80 leading-tight font-medium line-clamp-1">
                          {lesson.modificationSuggestion}
                        </p>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2 pb-4 space-y-3">
                      <div className="bg-black/40 p-3 rounded-lg border border-accent/10 space-y-2">
                        <h4 className="flex items-center gap-1.5 text-[9px] font-bold text-accent uppercase tracking-widest">
                          <Lightbulb className="size-3" />
                          Neural Insight
                        </h4>
                        <p className="text-[10px] italic text-muted-foreground leading-relaxed">
                          Applied this modification to resolve a recurring
                          "Logic Fatigue" infection. The core was over-throttled
                          here.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <h4 className="text-[8px] font-bold text-primary uppercase tracking-widest mb-1">
                          Modified Logic
                        </h4>
                        <div className="bg-black/60 p-2 rounded text-[9px] font-code text-primary/70 overflow-x-auto whitespace-pre">
                          {lesson.modifiedCode}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                        <Badge
                          variant="secondary"
                          className="text-[7px] py-0 h-3 bg-green-500/10 text-green-500 border-green-500/20"
                        >
                          <CheckCircle2 className="size-2 mr-1" /> VERIFIED
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="text-[7px] py-0 h-3 bg-accent/10 text-accent border-accent/20 uppercase"
                        >
                          Agent: {lesson.agentId || 'ShieldedCore'}
                        </Badge>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              {(!lessons || lessons.length === 0) && (
                <div className="text-center py-10 text-muted-foreground text-xs italic">
                  No neural records found. Initiating baseline memory...
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
