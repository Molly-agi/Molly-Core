
'use client';

import { useState, useEffect, useActionState } from 'react';
import { Bot, Loader2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getChatResponse, getVoiceCommandAsText } from '@/app/actions';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { VoiceControl } from './VoiceControl';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export function AIGuidance() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isChatPending, setIsChatPending] = useState(false);
  const { toast } = useToast();

  const [voiceState, voiceAction, isVoicePending] = useActionState(
    getVoiceCommandAsText,
    null
  );

  useEffect(() => {
    if (voiceState?.command) {
      setInput(voiceState.command);
    }
    if (voiceState?.error) {
      toast({
        variant: 'destructive',
        title: 'Voice Error',
        description: voiceState.error,
      });
    }
  }, [voiceState, toast]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsChatPending(true);

    const chatHistory = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        content: m.content
    }));

    const result = await getChatResponse(chatHistory, currentInput);

    if (result.response) {
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.response,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } else {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.error || 'Sorry, I had trouble with that request.',
      };
      setMessages(prev => [...prev, errorMessage]);
    }
    setIsChatPending(false);
  };

  const isInputDisabled = isChatPending || isVoicePending;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1">
        <ScrollArea className="h-full max-h-[calc(100vh-200px)] p-4">
          <div className="space-y-6">
            {messages.length === 0 && (
                <div className="text-center text-muted-foreground p-8 flex flex-col items-center justify-center">
                    <Bot size={48} className="mb-4 text-primary"/>
                    <h3 className="text-lg font-semibold">Talk to TermAI</h3>
                    <p className="text-sm">Ask me anything! I can help with code, commands, or just chat.</p>
                    <p className="text-xs mt-2">e.g., "How do I list files in a directory?"</p>
                </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={cn('flex items-start gap-3', m.role === 'user' && 'justify-end')}>
                {m.role === 'assistant' && (
                    <Avatar className='border-2 border-primary'>
                        <AvatarFallback><Bot /></AvatarFallback>
                    </Avatar>
                )}
                <div className={cn("max-w-[80%] rounded-lg p-3 text-sm whitespace-pre-wrap", m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary')}>
                  {m.content}
                </div>
                 {m.role === 'user' && (
                    <Avatar>
                        <AvatarFallback>U</AvatarFallback>
                    </Avatar>
                )}
              </div>
            ))}
             {isChatPending && (
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
            placeholder="Ask TermAI..."
            className="pr-24"
            disabled={isInputDisabled}
          />
          <div className="absolute right-10 top-1/2 -translate-y-1/2">
             <VoiceControl voiceAction={voiceAction} isPending={isVoicePending} />
          </div>
          <Button type="submit" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" disabled={isInputDisabled || !input.trim()}>
            {isChatPending ? <Loader2 className="animate-spin" /> : <Send />}
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
