'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { getContextualGuidance } from '@/app/actions';

export function AIGuidance() {
  const [messages, setMessages] = useState<
    { role: 'user' | 'bot'; content: string }[]
  >([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (input.trim() && !isLoading) {
      const newMessages = [...messages, { role: 'user' as const, content: input }];
      setMessages(newMessages);
      const currentInput = input;
      setInput('');
      setIsLoading(true);

      try {
        const aiResponse = await getContextualGuidance(currentInput);
        setMessages([...newMessages, { role: 'bot' as const, content: aiResponse }]);
      } catch (error) {
        console.error(error);
        setMessages([
          ...newMessages,
          { role: 'bot' as const, content: 'Error: Could not get response from AI.' },
        ]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <Card className="h-full flex flex-col border-0">
      <CardHeader>
        <CardTitle className="text-lg">AI Research</CardTitle>
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
                {message.role === 'bot' && (
                  <Bot className="size-5 shrink-0" />
                )}
                <div
                  className={`rounded-lg px-3 py-2 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {message.content}
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
                  AI is researching...
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a research question..."
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            className="bg-card"
            disabled={isLoading}
          />
          <Button onClick={handleSend} size="sm" disabled={isLoading}>Send</Button>
        </div>
      </CardContent>
    </Card>
  );
}
