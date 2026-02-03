'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  getTextToTermuxCommand,
  getAutonomousSolution,
  getHealthCheck,
  getTextToScript,
} from '@/app/actions';
import type { AutonomousSolutionOutput } from '@/ai/flows/autonomous-solution';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestore } from '@/firebase/provider';
import {
  saveLearnedCommand,
  getLearnedCommand,
} from '@/firebase/firestore/memory';
import { BrainCircuit, Network, FileCode, Trash2, Shield } from 'lucide-react';
import { AutonomousSolutionResponse } from './AutonomousSolutionResponse';
import { type VoiceCommandResult } from './VoiceControl';
import type { TextToScriptOutput } from '@/ai/flows/text-to-script';
import { DownloadableScript } from './DownloadableScript';
import { Button } from '@/components/ui/button';

type HistoryItem = string | AutonomousSolutionOutput | TextToScriptOutput;

function isScriptResponse(item: HistoryItem): item is TextToScriptOutput {
  return (
    typeof item === 'object' &&
    'filename' in item &&
    'content' in item &&
    !('creativeSolution' in item)
  );
}

function isAutonomousSolution(item: HistoryItem): item is AutonomousSolutionOutput {
    return typeof item === 'object' && 'creativeSolution' in item;
}

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
  const [isIntroducing, setIsIntroducing] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();
  const firestore = useFirestore();

  useEffect(() => {
    const fetchIntroduction = async () => {
      try {
        const intro = await getHealthCheck(
          'Introduce yourself as Molly, an agentic multi-module AI designed for Termux. Mention your Orchestration engine and specialized subroutines.'
        );
        setHistory((prev) => [intro]);
      } catch (error) {
        console.error(error);
        setHistory((prev) => [`Error: ${error instanceof Error ? error.message : 'AI initialization failed.'}`]);
      } finally {
        setIsIntroducing(false);
      }
    };
    fetchIntroduction();
  }, []);

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

  const processCommand = async (cmdText: string) => {
    if (!cmdText.trim() || isLoading || !user) return;

    setHistory((prev) => [...prev, `> ${cmdText}`]);
    setIsLoading(true);

    try {
      if (cmdText.startsWith('/solve ')) {
        const prompt = cmdText.replace('/solve ', '');
        const aiResponse = await getAutonomousSolution(prompt, user.uid);
        setHistory((prev) => [...prev, aiResponse]);
      } else if (cmdText.startsWith('/script ')) {
        const prompt = cmdText.replace('/script ', '');
        const scriptResponse = await getTextToScript(prompt);
        setHistory((prev) => [...prev, scriptResponse]);
      } else if (cmdText === '/healthcheck') {
        const aiResponse = await getHealthCheck('ping');
        setHistory((prev) => [...prev, `🩺 Orchestration Health: ${aiResponse}`]);
      } else if (cmdText === 'clear') {
        setHistory([]);
      } else {
        if (firestore) {
          const cachedCommand = await getLearnedCommand(firestore, user.uid, cmdText);
          if (cachedCommand) {
            setHistory((prev) => [...prev, `🧠 From Memory: ${cachedCommand}`]);
            setIsLoading(false);
            return;
          }
        }
        const aiResponse = await getTextToTermuxCommand(cmdText);
        setHistory((prev) => [...prev, aiResponse]);
        if (firestore && aiResponse && !aiResponse.startsWith('Error:')) {
          saveLearnedCommand(firestore, user.uid, cmdText, aiResponse);
        }
      }
    } catch (error) {
      console.error(error);
      setHistory((prev) => [...prev, `Error: ${error instanceof Error ? error.message : 'Flow execution failed.'}`]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    processCommand(command);
    setCommand('');
  };

  const handleQuickAction = (cmd: string) => {
    setCommand('');
    processCommand(cmd);
  };

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [history, isLoading, isIntroducing]);

  return (
    <div className="font-code text-sm h-full flex flex-col">
      <div ref={scrollAreaRef} className="flex-1 p-4 bg-card rounded-lg overflow-y-auto mb-4 border border-primary/20">
        {isIntroducing && <div className="animate-pulse text-primary">Orchestrator initializing...</div>}
        {history.map((line, index) => {
          if (isScriptResponse(line)) return <DownloadableScript key={index} response={line} />;
          if (isAutonomousSolution(line)) return <AutonomousSolutionResponse key={index} response={line} />;
          if(typeof line !== 'string') return null;

          if (line.startsWith('🧠 From Memory:')) {
            return (
              <div key={index} className="flex items-center gap-2 text-muted-foreground my-1">
                <BrainCircuit className="size-4 shrink-0 text-accent" />
                <span>{line.replace('🧠 From Memory: ', '')}</span>
              </div>
            );
          }
          return <div key={index} className={line.startsWith('>') ? 'text-primary my-1' : 'my-1'}>{line}</div>;
        })}
        {isLoading && <div className="animate-pulse text-accent mt-2">Agents collaborating...</div>}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Button variant="outline" size="sm" onClick={() => handleQuickAction('/solve check battery and thermal')} className="h-8 gap-2">
          <Shield className="size-3" /> System Health
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleQuickAction('/solve network penetration scan')} className="h-8 gap-2">
          <Network className="size-3" /> Net Audit
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleQuickAction('clear')} className="h-8 gap-2 text-destructive">
          <Trash2 className="size-3" /> Clear
        </Button>
      </div>

      <form onSubmit={handleCommand}>
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Input objective for Orchestrator..."
          className="w-full bg-card border-primary/30 font-code focus-visible:ring-primary"
          disabled={isLoading || isIntroducing}
        />
      </form>
    </div>
  );
}
