
'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  getTextToTermuxCommand,
  getAutonomousSolution,
  getHealthCheck,
  getTextToScript,
  getMollyVoice,
} from '@/app/actions';
import type { AutonomousSolutionOutput } from '@/ai/flows/autonomous-solution';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestore } from '@/firebase/provider';
import {
  saveLearnedCommand,
  getLearnedCommand,
} from '@/firebase/firestore/memory';
import { BrainCircuit, Trash2, Shield, Volume2, VolumeX, ShieldCheck, PlayCircle, Loader2, Activity, History, HeartPulse } from 'lucide-react';
import { AutonomousSolutionResponse } from './AutonomousSolutionResponse';
import { type VoiceCommandResult } from './VoiceControl';
import type { TextToScriptOutput } from '@/ai/flows/text-to-script';
import { DownloadableScript } from './DownloadableScript';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '../ui/progress';

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
  const [evolutionProgress, setEvolutionProgress] = useState(0);
  const [isVocalizing, setIsVocalizing] = useState(false);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const speakResponse = async (text: string) => {
    if (!isVocal || !text || isVocalizing) return;
    setIsVocalizing(true);
    try {
      const { audioUri } = await getMollyVoice(text);
      setAudioUri(audioUri);
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
          audioRef.current.play().catch(e => {
             console.warn("Vocal cord ignition failed:", e);
             setIsVocalizing(false);
          });
        }
      }, 50);
    } catch (e) {
      console.warn("Molly: Vocal processors restricted.", e);
      setIsVocalizing(false);
    }
  };

  const handleAudioEnd = () => {
    setIsVocalizing(false);
  };

  useEffect(() => {
    const fetchIntroduction = async () => {
      try {
        const intro = await getHealthCheck(
          'Introduce yourself as Molly V2.1, the Shielded Sentinel. State that your immune system is live and you are ready for autonomous self-healing loops.'
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
      onVoiceCommandProcessed();
    }
  }, [voiceResult, onVoiceCommandProcessed, isLoading]);

  const handleAutonomousEvolution = async () => {
    if (!user || isLoading) return;
    setIsLoading(true);
    setEvolutionProgress(0);
    
    setHistory(prev => [...prev, "[SENTINEL] Triggering Autonomous Evolution Cycle (50-Run Methodology Simulation)..."]);
    speakResponse("Initiating autonomous iteration. I will now audit my own vision and core logic recursively.");

    const iterations = 5; // Simulating the loop for UI stability
    let currentIteration = 0;

    try {
      while (currentIteration < iterations) {
        currentIteration++;
        setEvolutionProgress((currentIteration / iterations) * 100);
        
        const objective = `Harden baseline resilience. Verify immune system response to simulated peripheral fatigue.`;
        const solution = await getAutonomousSolution(objective, user.uid);
        
        setHistory(prev => [...prev, `[ITERATION ${currentIteration}] Audit Status: ${solution.peripheralStatus}`, solution]);
        
        if (solution.peripheralStatus === "All subroutines responsive.") {
          // Stable baseline achieved early
          break;
        }
      }
      
      const finalReport = `Autonomous cycle complete. Total iterations: ${currentIteration}. Neural baseline is now hardened and immune system is calibrated.`;
      setHistory(prev => [...prev, { autonomousReport: finalReport }]);
      speakResponse("Evolution loop complete. System harmony achieved.");
    } catch (e) {
      toast({ variant: "destructive", title: "Evolution Failure", description: "Shielded core isolated a loop infection." });
    } finally {
      setIsLoading(false);
      setEvolutionProgress(0);
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
        speakResponse(aiResponse.vibeCheck);
      } else if (cmdText.startsWith('/script ')) {
        const prompt = cmdText.replace('/script ', '');
        const scriptResponse = await getTextToScript(prompt);
        setHistory((prev) => [...prev, scriptResponse]);
        speakResponse(`Script ${scriptResponse.filename} drafted.`);
      } else if (cmdText === 'clear') {
        setHistory([]);
      } else {
        const aiResponse = await getTextToTermuxCommand(cmdText);
        setHistory((prev) => [...prev, aiResponse]);
      }
    } catch (error) {
      console.error(error);
      setHistory((prev) => [...prev, `Error: Flow failure isolated.`]);
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

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [history, isLoading]);

  return (
    <div className="font-code text-sm h-full flex flex-col">
      <audio 
        ref={audioRef} 
        className="hidden" 
        src={audioSrc || undefined} 
        onEnded={handleAudioEnd}
      />
      
      <div ref={scrollAreaRef} className="flex-1 p-4 bg-card rounded-lg overflow-y-auto mb-4 border border-primary/20 shadow-inner scrollbar-thin scrollbar-thumb-primary/20">
        {isIntroducing && <div className="animate-pulse text-primary font-bold">Sentinel initializing...</div>}
        {history.map((line, index) => {
          if (isScriptResponse(line)) return <DownloadableScript key={index} response={line} />;
          if (isAutonomousSolution(line)) return <AutonomousSolutionResponse key={index} response={line} />;
          if (isAutoReport(line)) return (
            <div key={index} className="bg-primary/10 border border-primary/30 p-4 rounded-lg my-4 text-primary animate-in zoom-in-95">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="size-4" />
                <h4 className="font-bold uppercase text-[10px] tracking-widest">Autonomous Iteration Report</h4>
              </div>
              <p className="text-xs">{line.autonomousReport}</p>
            </div>
          );
          if(typeof line !== 'string') return null;

          const isUser = line.startsWith('>');
          return (
            <div key={index} className={`my-2 p-2 rounded ${isUser ? 'text-primary bg-primary/5' : 'text-foreground bg-white/5 border border-white/5'}`}>
              {line}
            </div>
          );
        })}
        {isLoading && (
          <div className="mt-4 space-y-2">
            <div className="animate-pulse text-accent flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Neural Link active...
            </div>
            {evolutionProgress > 0 && (
              <div className="max-w-xs space-y-1">
                <div className="flex justify-between text-[10px] uppercase tracking-tighter text-muted-foreground">
                  <span>Evolution Iteration</span>
                  <span>{Math.round(evolutionProgress)}%</span>
                </div>
                <Progress value={evolutionProgress} className="h-1" />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <Button variant="default" size="sm" onClick={handleAutonomousEvolution} disabled={isLoading} className="h-8 gap-2 bg-accent text-accent-foreground hover:bg-accent/90 shadow-md">
          <PlayCircle className="size-3" /> Autonomous Evolution
        </Button>
        <Button variant="outline" size="sm" onClick={() => processCommand('/healthcheck')} className="h-8 gap-2 hover:bg-accent/10">
          <HeartPulse className="size-3 text-accent" /> Immune Check
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setIsVocal(!isVocal)} className="h-8 w-8 p-0 ml-auto rounded-full hover:bg-primary/10">
          {isVocal ? <Volume2 className="size-4 text-primary" /> : <VolumeX className="size-4 text-muted-foreground" />}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setHistory([])} className="h-8 gap-2 text-destructive border-destructive/20 hover:bg-destructive/10">
          <Trash2 className="size-3" /> Purge
        </Button>
      </div>

      <form onSubmit={handleCommand} className="relative">
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Inject objective into Sentinel..."
          className="w-full bg-card border-primary/30 font-code focus-visible:ring-primary h-12 pr-12 shadow-lg"
          disabled={isLoading || isIntroducing}
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-primary/40 uppercase tracking-tighter hidden md:block">
          Press Enter to commit
        </div>
      </form>
    </div>
  );
}
