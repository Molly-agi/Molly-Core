'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { getOriginStory, seedOriginStoryMemory } from '@/app/actions';
import { useUser } from '@/firebase';

export function OriginStoryDialog() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const seededRef = useRef(false);
  const { toast } = useToast();
  const { user } = useUser();

  useEffect(() => {
    if (!open) return;

    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const result = await getOriginStory();
        if (!isMounted) return;
        setContent(result.content);

        if (user && !seededRef.current) {
          await seedOriginStoryMemory(user.uid);
          seededRef.current = true;
        }
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to load origin story.';
        toast({
          variant: 'destructive',
          title: 'Origin Story Unavailable',
          description: message,
        });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [open, toast, user]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          title="Origin Story"
        >
          <BookOpen className="h-4 w-4" />
          <span className="sr-only">Open origin story</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Origin Story</DialogTitle>
          <DialogDescription>
            Molly&apos;s creation narrative, preserved verbatim.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-full pr-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading origin story...
            </p>
          ) : (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed">
              {content}
            </pre>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
