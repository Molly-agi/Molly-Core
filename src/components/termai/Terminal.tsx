'use client';

import React, { useState, useRef, useEffect, useActionState } from 'react';
import { Loader2, Terminal as TerminalIcon } from 'lucide-react';

import { getVoiceCommandAsText, runCommand } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { VoiceControl } from './VoiceControl';

type Line = {
  id: string;
  type: 'prompt' | 'command' | 'output' | 'error';
  content: any;
};

function TerminalPrompt() {
  return (
    <div className="flex items-center font-code">
      <span className="text-accent">user@termai</span>
      <span className="text-foreground">:</span>
      <span className="text-primary">~</span>
      <span className="text-foreground">$&nbsp;</span>
    </div>
  );
}

export default function Terminal() {
  const { toast } = useToast();
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [voiceState, voiceAction, isVoicePending] = useActionState(getVoiceCommandAsText, null);

  useEffect(() => {
    if (lines.length === 0) {
      setLines([{ id: crypto.randomUUID(), type: 'prompt', content: null }]);
    }
  }, [lines.length]);
  
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

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    inputRef.current?.focus();
  }, [lines]);

  const execute = async (commandToRun: string) => {
    if (!commandToRun.trim()) {
        setLines(prev => [...prev, { id: crypto.randomUUID(), type: 'prompt', content: null }]);
        return;
    }

    if (commandToRun === 'clear') {
        setLines([{ id: crypto.randomUUID(), type: 'prompt', content: null }]);
        setInput('');
        return;
    }

    const commandLine: Line = {
      id: crypto.randomUUID(),
      type: 'command',
      content: commandToRun,
    };
    setLines(prev => [...prev, commandLine]);
    setIsProcessing(true);

    const outputs = await runCommand({ command: commandToRun });
    
    setLines(prev => [...prev, ...outputs]);
    setLines(prev => [...prev, { id: crypto.randomUUID(), type: 'prompt', content: null }]);
    setIsProcessing(false);
    setInput('');
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLines(prev => prev.slice(0, -1)); // Remove the current prompt line
    await execute(input);
  };

  return (
    <div className="flex-1 p-4 md:p-6 flex flex-col h-full bg-background" onClick={() => inputRef.current?.focus()}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TerminalIcon className="w-5 h-5" />
          <span>zsh</span>
        </div>
      </div>
      <div className="w-full flex-1 overflow-y-auto font-code text-sm" >
        {lines.map(line => (
          <div key={line.id}>
            {line.type === 'prompt' && (
              <form onSubmit={handleFormSubmit} className="flex items-center">
                <TerminalPrompt />
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  className="bg-transparent focus:outline-none flex-1"
                  autoFocus
                  disabled={isProcessing || isVoicePending}
                />
                <VoiceControl voiceAction={voiceAction} />
              </form>
            )}
            {line.type === 'command' && (
              <div className="flex items-center">
                <TerminalPrompt />
                <span>{line.content}</span>
              </div>
            )}
            {line.type === 'output' && <div className="whitespace-pre-wrap">{line.content}</div>}
            {line.type === 'error' && <div className="whitespace-pre-wrap text-red-400">{line.content}</div>}
          </div>
        ))}
         {isProcessing && <Loader2 className="animate-spin mt-2" />}
        <div ref={scrollRef} />
      </div>
    </div>
  );
}
