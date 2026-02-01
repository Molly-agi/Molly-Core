
'use client';

import { useState } from 'react';
import { Bot, Loader2, Send, Sparkles } from 'lucide-react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getGuidance } from '@/app/actions';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { cn } from '@/lib/utils';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: any;
};

export function AIGuidance() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsPending(true);

    const context = 'Current directory: ~/code. Recent command: ls -l.';
    const result = await getGuidance(input, context);

    if (result.suggestion) {
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.suggestion,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } else {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: { explanation: result.error || 'Sorry, I had trouble with that request.' },
      };
      setMessages(prev => [...prev, errorMessage]);
    }
    setIsPending(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1">
        <ScrollArea className="h-full max-h-[calc(100vh-200px)] p-4">
          <div className="space-y-6">
            {messages.length === 0 && (
                <div className="text-center text-muted-foreground p-8 flex flex-col items-center justify-center">
                    <Bot size={48} className="mb-4 text-primary"/>
                    <h3 className="text-lg font-semibold">AI Guidance</h3>
                    <p className="text-sm">Ask me anything about Termux!</p>
                    <p className="text-xs mt-2">e.g., "How to install packages?"</p>
                </div>
            )}
            {messages.map((m, i) => (
              <div key={m.id} className={cn('flex items-start gap-3', m.role === 'user' && 'justify-end')}>
                {m.role === 'assistant' && (
                    <Avatar className='border-2 border-primary'>
                        <AvatarFallback><Bot /></AvatarFallback>
                    </Avatar>
                )}
                <div className={cn("max-w-[80%] rounded-lg p-3 text-sm", m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary')}>
                  {m.role === 'user' ? (
                    m.content
                  ) : (
                    <div className="space-y-2">
                      <p>{m.content.explanation}</p>
                      {m.content.suggestions && (
                        <div>
                          <h4 className="font-semibold mb-1 flex items-center gap-2"><Sparkles className="text-accent w-4 h-4"/> Suggestions:</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {m.content.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                      {m.content.exampleUsage && (
                        <div>
                          <h4 className="font-semibold mb-1">Example:</h4>
                          <pre className="font-code bg-background/50 p-2 rounded-md text-xs">{m.content.exampleUsage}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                 {m.role === 'user' && (
                    <Avatar>
                        <AvatarFallback>U</AvatarFallback>
                    </Avatar>
                )}
              </div>
            ))}
             {isPending && (
                <div className="flex items-start gap-3">
                    <Avatar className='border-2 border-primary'>
                        <AvatarFallback><Bot /></AvatarFallback>
                    </Avatar>
                    <div className="bg-secondary rounded-lg p-3">
                        <Loader2 className="animate-spin text-primary" />
                    </div>
                </div>
             )}
          </div>
        </ScrollArea>
      </div>
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="relative">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask for guidance..."
            className="pr-12"
            disabled={isPending}
          />
          <Button type="submit" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" disabled={isPending || !input.trim()}>
            {isPending ? <Loader2 className="animate-spin" /> : <Send />}
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
