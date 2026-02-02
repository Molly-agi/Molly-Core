'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { getTextToTermuxCommand } from '@/app/actions';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestore } from '@/firebase/provider';
import {
  saveLearnedCommand,
  getLearnedCommand,
} from '@/firebase/firestore/memory';
import { BrainCircuit } from 'lucide-react';

export default function Terminal() {
  const [history, setHistory] = useState<string[]>([]);
  const [command, setCommand] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();
  const firestore = useFirestore();

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isLoading) return;

    const currentCommand = command;
    setHistory((prev) => [...prev, `> ${currentCommand}`]);
    setCommand('');
    setIsLoading(true);

    try {
      // Step 1: Check memory first
      if (user && firestore) {
        const cachedCommand = await getLearnedCommand(
          firestore,
          user.uid,
          currentCommand
        );
        if (cachedCommand) {
          setHistory((prev) => [...prev, `🧠 From Memory: ${cachedCommand}`]);
          setIsLoading(false);
          return;
        }
      }

      // Step 2: If not in memory, ask the AI
      const aiResponse = await getTextToTermuxCommand(currentCommand);
      setHistory((prev) => [...prev, aiResponse]);

      // Step 3: Save the new successful response to memory
      if (user && firestore && aiResponse && !aiResponse.startsWith('Error:')) {
        saveLearnedCommand(firestore, user.uid, currentCommand, aiResponse);
      }
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
          Welcome to TermAI. Your AI-powered terminal assistant that learns over
          time.
        </div>
        {history.map((line, index) => {
          const isUser = line.startsWith('>');
          const isMemory = line.startsWith('🧠 From Memory:');

          if (isMemory) {
            return (
              <div
                key={index}
                className="flex items-center gap-2 text-muted-foreground"
              >
                <BrainCircuit className="size-4 shrink-0 text-accent" />
                <span>{line.replace('🧠 From Memory: ', '')}</span>
              </div>
            );
          }

          return (
            <div key={index} className={isUser ? 'text-primary' : ''}>
              {line}
            </div>
          );
        })}
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
