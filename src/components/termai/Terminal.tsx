'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  getTextToTermuxCommand,
  getAutonomousSolution,
  getHealthCheck,
} from '@/app/actions';
import type { AutonomousSolutionOutput } from '@/ai/flows/autonomous-solution';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestore } from '@/firebase/provider';
import {
  saveLearnedCommand,
  getLearnedCommand,
} from '@/firebase/firestore/memory';
import { BrainCircuit } from 'lucide-react';
import { AutonomousSolutionResponse } from './AutonomousSolutionResponse';
import { type VoiceCommandResult } from './VoiceControl';

type HistoryItem = string | AutonomousSolutionOutput;

export default function Terminal({
  voiceResult,
  onVoiceCommandProcessed,
}: {
  voiceResult: VoiceCommandResult | null;
  onVoiceCommandProcessed: () => void;
}) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [command, setCommand] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();
  const firestore = useFirestore();

  useEffect(() => {
    if (voiceResult && !isLoading) {
      const { prompt, command } = voiceResult;

      setHistory((prev) => [...prev, `> ${prompt}`, command]);

      if (user && firestore && !command.startsWith('Error:')) {
        saveLearnedCommand(firestore, user.uid, prompt, command);
      }

      onVoiceCommandProcessed();
    }
  }, [voiceResult, onVoiceCommandProcessed, isLoading, user, firestore]);

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isLoading) return;

    const currentCommand = command;
    setHistory((prev) => [...prev, `> ${currentCommand}`]);
    setCommand('');
    setIsLoading(true);

    try {
      if (currentCommand.startsWith('/solve ')) {
        const prompt = currentCommand.replace('/solve ', '');
        const aiResponse = await getAutonomousSolution(prompt);
        setHistory((prev) => [...prev, aiResponse]);

        if (user && firestore && aiResponse.finalCommand) {
          saveLearnedCommand(
            firestore,
            user.uid,
            prompt,
            aiResponse.finalCommand
          );
        }
      } else if (currentCommand === '/healthcheck') {
        const aiResponse = await getHealthCheck('ping');
        setHistory((prev) => [...prev, `🩺 Health Check Passed: ${aiResponse}`]);
      } else {
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

        const aiResponse = await getTextToTermuxCommand(currentCommand);
        setHistory((prev) => [...prev, aiResponse]);

        if (
          user &&
          firestore &&
          aiResponse &&
          !aiResponse.startsWith('Error:')
        ) {
          saveLearnedCommand(firestore, user.uid, currentCommand, aiResponse);
        }
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
          <br />
          Type{' '}
          <span className="text-accent font-semibold">/solve [your goal]</span>{' '}
          to use the autonomous agent team.
          <br />
          Type <span className="text-accent font-semibold">/healthcheck</span> to
          test system connectivity.
        </div>
        {history.map((line, index) => {
          if (typeof line !== 'string') {
            return <AutonomousSolutionResponse key={index} response={line} />;
          }

          const isUser = line.startsWith('>');
          const isMemory = line.startsWith('🧠 From Memory:');
          const isHealthCheck = line.startsWith('🩺 Health Check Passed:');

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

          if (isHealthCheck) {
            return (
              <div
                key={index}
                className="flex items-center gap-2 text-green-400"
              >
                <span>{line}</span>
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
          placeholder="Type a command or use /solve [your goal]..."
          className="mt-4 w-full bg-card border-border font-code"
          autoFocus
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
