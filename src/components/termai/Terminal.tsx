'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { getTextToTermuxCommand } from '@/app/actions';

export default function Terminal() {
  const [history, setHistory] = useState<string[]>([]);
  const [command, setCommand] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isLoading) return;

    const currentCommand = command;
    setHistory((prev) => [...prev, `> ${currentCommand}`]);
    setCommand('');
    setIsLoading(true);

    try {
      const aiResponse = await getTextToTermuxCommand(currentCommand);
      setHistory((prev) => [...prev, aiResponse]);
    } catch (error) {
      console.error(error);
      setHistory((prev) => [...prev, 'Error: Could not get response from AI.']);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [history, isLoading]);

  return (
    <div className="font-code text-sm">
      <div
        ref={scrollAreaRef}
        className="p-4 bg-card rounded-lg h-[calc(100vh-150px)] overflow-y-auto"
      >
        <div className="mb-4">
          Welcome to TermAI. Your AI-powered terminal assistant.
        </div>
        {history.map((line, index) => (
          <div key={index} className={line.startsWith('>') ? 'text-primary' : ''}>
            {line}
          </div>
        ))}
        {isLoading && <div className="animate-pulse">AI is thinking...</div>}
      </div>
      <form onSubmit={handleCommand}>
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Type a command or ask a question..."
          className="mt-4 w-full bg-card border-border font-code"
          autoFocus
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
