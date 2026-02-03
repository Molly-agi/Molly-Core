'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  getTextToTermuxCommand,
  getAutonomousSolution,
  getHealthCheck,
  getTextToScript,
  getMollyVoice,
  startAutonomousCycle,
} from '@/app/actions';
import type { AutonomousSolutionOutput } from '@/ai/flows/autonomous-solution';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestore } from '@/firebase/provider';
import {
  saveLearnedCommand,
  getLearnedCommand,
} from '@/firebase/firestore/memory';
import { BrainCircuit, Network, Trash2, Shield, Volume2, VolumeX, ShieldCheck, PlayCircle, Loader2 } from 'lucide-react';
import { AutonomousSolutionResponse } from './AutonomousSolutionResponse';
import { type VoiceCommandResult } from './VoiceControl';
import type { TextToScriptOutput } from '@/ai/flows/text-to-script';
import { DownloadableScript } from './DownloadableScript';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type HistoryItem = string | AutonomousSolutionOutput | TextToScriptOutput | { autonomousReport: string };

function isScriptResponse(item: HistoryItem): item is TextToScriptOutput {
  return (
    typeof item === 'object' &&
    item !== null &&
    'filename' in item &&
    'content' in item &&
    !('creativeSolution' in item)
  );
}

function isAutonomousSolution(item: HistoryItem): item is AutonomousSolutionOutput {
    return typeof item === 'object' && item !== null && 'creativeSolution' in item;
}

function isAutoReport(item: HistoryItem): item is { autonomousReport: string } {
  return typeof item === 'object' && item !== null && 'autonomousReport' in item;
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
  const [isVocal, setIsVocal] = useState(true);
  const [audioSrc, setAudioUri] = useState<string | null>(null);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const speakResponse = async (text: string) => {
    if (!isVocal || !text) return;
    try {
      const { audioUri } = await getMollyVoice(text);
      setAudioUri(audioUri);
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
          audioRef.current.play().catch(e => console.warn("Vocal cord ignition failed:", e));
        }
      }, 50);
    } catch (e) {
      console.warn("Molly: My vocal processors are restricted.", e);
    }
  };

  useEffect(() => {
    const fetchIntroduction = async () => {
      try {
        const intro = await getHealthCheck(
          'Introduce yourself as Molly V2.0, a shielded, self-healing sentinel designed for autonomous Android orchestration.'
        );
        setHistory([intro]);
        speakResponse(intro);
      } catch (error) {
        console.error(error);
        setHistory([`Error: Neural baseline failed to initialize.`]);
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

  const handleAutonomousLoop = async () => {
    if (!user || isLoading) return;
    setIsLoading(true);
    setHistory((prev) => [...prev, "[SYSTEM] Initiating Autonomous Evolution Cycle (50-run methodology simulation)..."]);
    speakResponse("Starting autonomous self-iteration. I will lead, the core will harden.");

    try {
      const report = await startAutonomousCycle("Streamline Neural Bridge and optimize thermal logic for Stage 3.", user.uid, 3);
      setHistory((prev) => [...prev, { autonomousReport: report.finalReport }]);
      speakResponse("Autonomous cycle complete. Stability verified.");
    } catch (error) {
      toast({ variant: "destructive", title: "Evolution Failed", description: "Shielded core prevented total collapse." });
    } finally {
      setIsLoading(false);
    }
  };

  const processCommand = async (cmdText: string) => {
    if (!cmdText.trim() || isLoading || !user) return;

    setHistory((prev) => [...prev, `> ${cmdText}`]);
    setIsLoading(true);

    try {
      if (cmdText.startsWith('/solve ')) {
        const prompt = cmdText.replace('/solve ', '');
        const aiResponse = await getAutonomousSolution(prompt, user.uid);
        setHistory((prev) => [...prev, aiResponse]);
        const vocalMessage = aiResponse.compensatoryStrategy 
          ? `Immune system active. ${aiResponse.compensatoryStrategy}` 
          : aiResponse.vibeCheck;
        speakResponse(vocalMessage);
      } else if (cmdText.startsWith('/script ')) {
        const prompt = cmdText.replace('/script ', '');
        const scriptResponse = await getTextToScript(prompt);
        setHistory((prev) => [...prev, scriptResponse]);
        speakResponse(`Script ${scriptResponse.filename} has been drafted.`);
      } else if (cmdText === '/healthcheck') {
        const aiResponse = await getHealthCheck('ping');
        setHistory((prev) => [...prev, `🩺 Orchestration Health: ${aiResponse}`]);
        speakResponse(aiResponse);
      } else if (cmdText === 'clear') {
        setHistory([]);
      } else {
        if (firestore) {
          const cachedCommand = await getLearnedCommand(firestore, user.uid, cmdText);
          if (cachedCommand) {
            setHistory((prev) => [...prev, `🧠 From Memory: ${cachedCommand}`]);
            speakResponse("Executing learned command.");
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
      setHistory((prev) => [...prev, `Error: Flow execution failed.`]);
      speakResponse("Logical error isolated.");
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
  }, [history, isLoading]);

  return (
    <div className="font-code text-sm h-full flex flex-col">
      <audio ref={audioRef} className="hidden" src={audioSrc ?? undefined} />
      
      <div ref={scrollAreaRef} className="flex-1 p-4 bg-card rounded-lg overflow-y-auto mb-4 border border-primary/20 shadow-inner scrollbar-thin scrollbar-thumb-primary/20">
        {isIntroducing && <div className="animate-pulse text-primary font-bold">Sentinel initializing...</div>}
        {history.map((line, index) => {
          if (isScriptResponse(line)) return <DownloadableScript key={index} response={line} />;
          if (isAutonomousSolution(line)) return <AutonomousSolutionResponse key={index} response={line} />;
          if (isAutoReport(line)) return (
            <div key={index} className="bg-primary/10 border border-primary/30 p-4 rounded-lg my-4 text-primary animate-in zoom-in-95">
              <h4 className="font-bold uppercase text-[10px] mb-2 tracking-widest">Autonomous Iteration Report</h4>
              <p className="text-xs">{line.autonomousReport}</p>
            </div>
          );
          if(typeof line !== 'string') return null;

          if (line.startsWith('🧠 From Memory:')) {
            return (
              <div key={index} className="flex items-center gap-2 text-muted-foreground my-2 animate-in fade-in slide-in-from-left-2">
                <BrainCircuit className="size-4 shrink-0 text-accent" />
                <span className="bg-accent/5 px-2 py-1 rounded border border-accent/10">{line.replace('🧠 From Memory: ', '')}</span>
              </div>
            );
          }
          const isUser = line.startsWith('>');
          return (
            <div key={index} className={`my-2 p-2 rounded ${isUser ? 'text-primary bg-primary/5' : 'text-foreground bg-white/5 border border-white/5'}`}>
              {line}
            </div>
          );
        })}
        {isLoading && <div className="animate-pulse text-accent mt-4 flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Neural Link negotiating solution...
        </div>}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <Button variant="default" size="sm" onClick={handleAutonomousLoop} disabled={isLoading} className="h-8 gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
          <PlayCircle className="size-3" /> Autonomous Evolution Mode
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleQuickAction('/solve analyze system bottleneck')} className="h-8 gap-2 hover:bg-accent/10">
          <Shield className="size-3 text-accent" /> Baseline Health
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setIsVocal(!isVocal)} className="h-8 w-8 p-0 ml-auto rounded-full hover:bg-primary/10">
          {isVocal ? <Volume2 className="size-4 text-primary" /> : <VolumeX className="size-4 text-muted-foreground" />}
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleQuickAction('clear')} className="h-8 gap-2 text-destructive border-destructive/20 hover:bg-destructive/10">
          <Trash2 className="size-3" /> Purge
        </Button>
      </div>

      <form onSubmit={handleCommand} className="relative">
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Inject objective into Orchestrator..."
          className="w-full bg-card border-primary/30 font-code focus-visible:ring-primary h-12 pr-12"
          disabled={isLoading || isIntroducing}
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-primary/40 uppercase tracking-tighter hidden md:block">
          Press Enter to commit
        </div>
      </form>
    </div>
  );
}
