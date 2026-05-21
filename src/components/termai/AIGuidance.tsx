'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, User, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { sendDemonResearchTask, getDemonResearchFeed } from '@/app/actions';
import { useUser } from '@/firebase/auth/use-user';
import {
  saveResearchMessage,
  loadResearchHistory,
  type ResearchMessage,
} from '@/firebase/firestore/research-conversations';
import { Badge } from '../ui/badge';
import { useToast } from '@/hooks/use-toast';

export function AIGuidance() {
  const { user } = useUser();
  const [messages, setMessages] = useState<ResearchMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const { toast } = useToast();

  const handleSleepNotice = (message: string) => {
    if (!message.toLowerCase().startsWith('sleep mode')) return;
    toast({
      title: 'Sleep Mode Active',
      description: message,
    });
  };

  // Load conversation history on mount
  useEffect(() => {
    let mounted = true;

    if (user && !historyLoaded) {
      Promise.all([loadResearchHistory(user.uid, 50), getDemonResearchFeed(50)])
        .then(([history, demonFeed]) => {
          if (mounted) {
            const demonMessages: ResearchMessage[] = demonFeed.map((msg) => ({
              role: msg.from === 'eric' ? 'user' : 'bot',
              content: `[${msg.from.toUpperCase()}] ${msg.content}`,
              timestamp: msg.timestamp,
            }));

            setMessages([...history, ...demonMessages]);
            setHistoryLoaded(true);
          }
        })
        .catch((error) => {
          console.error('Failed to load research history:', error);
          if (mounted) {
            setHistoryLoaded(true);
          }
        });
    }

    return () => {
      mounted = false;
    };
  }, [user, historyLoaded]);

  const handleSend = async () => {
    if (input.trim() && !isLoading && user) {
      const userMessage: ResearchMessage = {
        role: 'user',
        content: input,
        timestamp: new Date().toISOString(),
      };

      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      const _currentInput = input;
      setInput('');
      setIsLoading(true);

      // Save user message to Firestore
      try {
        await saveResearchMessage(user.uid, userMessage);
      } catch (error) {
        console.error('Failed to save user message:', error);
      }

      try {
        const aiResponse = await sendDemonResearchTask(_currentInput, user.uid);

        const botMessage: ResearchMessage = {
          role: 'bot',
          content: `${aiResponse.answer}\n\nTask ID: ${aiResponse.taskId}`,
          timestamp: new Date().toISOString(),
        };

        setMessages([...newMessages, botMessage]);

        // Save bot response to Firestore
        try {
          await saveResearchMessage(user.uid, botMessage);
        } catch (error) {
          console.error('Failed to save bot message:', error);
        }
      } catch (error) {
        console.error(error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Could not get response from AI.';

        handleSleepNotice(errorMessage);

        const errorBotMessage: ResearchMessage = {
          role: 'bot',
          content: `Error: ${errorMessage}`,
          timestamp: new Date().toISOString(),
        };

        setMessages([...newMessages, errorBotMessage]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <Card className="h-full flex flex-col border-0">
      <CardHeader>
        <CardTitle className="text-lg">Demon Research Queue</CardTitle>
        <p className="text-xs text-muted-foreground">
          Sends structured research tasks to Demon via bridge and shows recent
          queue traffic
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Queue command:{' '}
          <code className="bg-muted px-1 py-0.5 rounded text-primary">
            /research [query] (forwarded as [DEMON_TASK])
          </code>
        </p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4 overflow-y-auto p-4">
        <ScrollArea className="flex-1">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 text-sm ${
                  message.role === 'user' ? 'justify-end' : ''
                }`}
              >
                {message.role === 'bot' && <Bot className="size-5 shrink-0" />}
                <div
                  className={`rounded-lg px-3 py-2 max-w-[80%] ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {message.content}
                  {message.savedTool && (
                    <Badge
                      variant="outline"
                      className="mt-2 text-[9px] border-green-500/30 text-green-500 bg-green-500/10"
                    >
                      <Wrench className="size-2 mr-1" />
                      Tool saved to database
                    </Badge>
                  )}
                </div>
                {message.role === 'user' && (
                  <User className="size-5 shrink-0" />
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 text-sm">
                <Bot className="size-5 shrink-0" />
                <div className="rounded-lg px-3 py-2 bg-muted animate-pulse">
                  Dispatching task to Demon queue...
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send a Demon research task..."
            onKeyDown={(e) =>
              e.key === 'Enter' &&
              !e.shiftKey &&
              (e.preventDefault(), handleSend())
            }
            className="bg-card"
            disabled={isLoading || !user}
          />
          <Button onClick={handleSend} size="sm" disabled={isLoading || !user}>
            Send
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
