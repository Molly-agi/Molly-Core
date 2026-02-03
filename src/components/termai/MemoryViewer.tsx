'use client';

import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BrainCircuit, Zap, History, Shield } from 'lucide-react';
import { Badge } from '../ui/badge';

export function MemoryViewer() {
  const { user } = useUser();
  const firestore = useFirestore();

  const lessonsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'users', user.uid, 'codeModifications'),
      orderBy('timestamp', 'desc'),
      limit(10)
    );
  }, [firestore, user]);

  const { data: lessons, isLoading } = useCollection(lessonsQuery);

  return (
    <Card className="h-full flex flex-col border-0 bg-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-primary flex items-center gap-2">
          <History className="size-4" />
          Neural Cache
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
              {lessons?.map((lesson) => (
                <div key={lesson.id} className="bg-white/5 border border-white/5 rounded-md p-3 space-y-2 group hover:border-accent/20 transition-colors">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[8px] h-4 py-0 border-accent/20 text-accent">
                      {lesson.filePath}
                    </Badge>
                    <span className="text-[8px] text-muted-foreground">
                      {new Date(lesson.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-[10px] text-foreground/80 leading-relaxed italic">
                    {lesson.modificationSuggestion}
                  </p>
                  <div className="bg-black/30 p-2 rounded text-[9px] font-code text-primary/70 line-clamp-2">
                    {lesson.modifiedCode}
                  </div>
                </div>
              ))}
              {(!lessons || lessons.length === 0) && (
                <div className="text-center py-10 text-muted-foreground text-xs italic">
                  No neural records found.
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
