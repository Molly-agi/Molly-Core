
'use client';

import React, { useState, useRef, useEffect, useActionState } from 'react';
import { Bot, ChevronRight, Loader2, Code, Terminal as TerminalIcon } from 'lucide-react';

import { getVoiceCommandAsText, runCommand } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { VoiceControl } from './VoiceControl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

type Line = {
  id: string;
  type: 'prompt' | 'command' | 'output' | 'error' | 'component';
  content: any;
  isRoot?: boolean;
};

function CommandSuggestion({ data, onAccept }: { data: any; onAccept: (command: string) => void }) {
  return (
    <Card className="my-2 bg-secondary/50 border-accent">
      <CardHeader className="p-4 flex-row items-center gap-3">
        <Bot className="text-accent" />
        <CardTitle className="text-base">AI Suggestion</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-2">
        <p className="text-sm">{data.explanation || data.suggestedFix}</p>
        {data.suggestedFix && (
          <pre className="font-code bg-background/50 p-2 rounded-md text-sm">{data.suggestedFix}</pre>
        )}
        <Button onClick={() => onAccept(data.suggestedFix)} size="sm">
          Apply Fix
        </Button>
      </CardContent>
    </Card>
  );
}

function RootRequest({ onAccept }: { onAccept: (isRoot: boolean) => void }) {
    return (
        <Card className="my-2 bg-secondary/50 border-primary">
            <CardHeader className="p-4">
                <CardTitle className="text-base">Root Access Required</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-4">
                <p className="text-sm">This command requires root privileges. Do you want to grant root access for the next command?</p>
                <div className="flex gap-4">
                    <Button onClick={() => onAccept(true)} size="sm">Grant</Button>
                    <Button onClick={() => onAccept(false)} size="sm" variant="ghost">Deny</Button>
                </div>
            </CardContent>
        </Card>
    )
}

function TerminalPrompt({ isRoot }: { isRoot: boolean }) {
  const promptSymbol = isRoot ? '#' : '$';
  const user = isRoot ? 'root' : 'user';
  return (
    <div className="flex items-center font-code">
      <span className="text-accent">{user}@termai</span>
      <span className="text-foreground">:</span>
      <span className="text-primary">~</span>
      <span className="text-foreground">{promptSymbol}&nbsp;</span>
    </div>
  );
}

export default function Terminal() {
  const { toast } = useToast();
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [isRoot, setIsRoot] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [voiceState, voiceAction, isVoicePending] = useActionState(getVoiceCommandAsText, null);

  useEffect(() => {
    if (lines.length === 0) {
      setLines([{ id: crypto.randomUUID(), type: 'prompt', content: null, isRoot: false }]);
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
        setLines(prev => [...prev, { id: crypto.randomUUID(), type: 'prompt', content: null, isRoot }]);
        return;
    }

    const commandLine: Line = {
      id: crypto.randomUUID(),
      type: 'command',
      content: commandToRun,
      isRoot,
    };
    setLines(prev => [...prev, commandLine]);
    setIsProcessing(true);

    const outputs = await runCommand({ command: commandToRun, isRoot });

    // Handle root state change for `su` command
    if (commandToRun === 'su' && !outputs.some(o => o.type === 'component')) {
        setIsRoot(true);
    }

    setLines(prev => [...prev, ...outputs]);
    setLines(prev => [...prev, { id: crypto.randomUUID(), type: 'prompt', content: null, isRoot: commandToRun === 'su' ? true : isRoot }]);
    setIsProcessing(false);
    setInput('');
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLines(prev => prev.slice(0, -1)); // Remove the current prompt line
    await execute(input);
  };
  
  const handleSuggestionAccept = async (command: string) => {
    setLines(prev => prev.slice(0, -1)); // Remove the component and the prompt
    await execute(command);
  };

  const handleRootRequestAccept = async (granted: boolean) => {
    const lastCommand = (lines.findLast(l => l.type === 'command') as Line)?.content;
    setLines(prev => prev.slice(0, -2)); // Remove the prompt and the component
    if(granted && lastCommand) {
        setIsRoot(true);
        await execute(lastCommand);
    } else {
        setLines(prev => [...prev, {id: crypto.randomUUID(), type: 'error', content: 'Permission denied.'}, { id: crypto.randomUUID(), type: 'prompt', content: null, isRoot: false }]);
    }
  }

  return (
    <div className="flex-1 p-4 md:p-6 flex flex-col h-full bg-background" onClick={() => inputRef.current?.focus()}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TerminalIcon className="w-5 h-5" />
          <span>zsh</span>
        </div>
        <div className="flex items-center gap-2">
            <Label htmlFor="root-switch">Root</Label>
            <Switch id="root-switch" checked={isRoot} onCheckedChange={setIsRoot} />
        </div>
      </div>
      <div className="w-full flex-1 overflow-y-auto font-code text-sm" >
        {lines.map(line => (
          <div key={line.id}>
            {line.type === 'prompt' && (
              <form onSubmit={handleFormSubmit} className="flex items-center">
                <TerminalPrompt isRoot={line.isRoot || false} />
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
                <TerminalPrompt isRoot={line.isRoot || false} />
                <span>{line.content}</span>
              </div>
            )}
            {line.type === 'output' && <div className="whitespace-pre-wrap">{line.content}</div>}
            {line.type === 'error' && <div className="whitespace-pre-wrap text-red-400">{line.content}</div>}
            {line.type === 'component' && (
                <>
                {line.content.type === 'InstallAssist' && <CommandSuggestion data={line.content.data} onAccept={handleSuggestionAccept} />}
                {line.content.type === 'CodeFix' && <CommandSuggestion data={line.content.data} onAccept={handleSuggestionAccept} />}
                {line.content.type === 'RootRequest' && <RootRequest onAccept={handleRootRequestAccept} />}
                </>
            )}
          </div>
        ))}
         {isProcessing && <Loader2 className="animate-spin mt-2" />}
        <div ref={scrollRef} />
      </div>
    </div>
  );
}
