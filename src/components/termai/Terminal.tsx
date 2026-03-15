/**
 * @fileOverview Terminal — Thin orchestrator for Molly's chat interface.
 *
 * Responsibilities: state management, command routing, effects.
 * Rendering delegated to ChatHistory and CommandBar.
 * TTS delegated to useTTS hook.
 * Family story delegated to useFamilyStory hook.
 *
 * Phase 6 hardening: decomposed from 864 lines → ~280 lines.
 */

'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type MutableRefObject,
} from 'react';
import {
  getConversationalChat,
  getAutonomousSolution,
  getHealthCheck,
  getOriginStoryAnchorParts,
  getFamilyMessages,
  getFamilyStoryAnchorParts,
  seedFamilyMemories,
  triggerImmuneResponse,
  resetCircuitBreaker,
} from '@/app/actions';
import { useUser } from '@/firebase/auth/use-user';
import { type VoiceCommandResult } from './VoiceControl';
import { useToast } from '@/hooks/use-toast';
import type { NeuralBridgeSignal } from '@/ai/tools/neural-bridge';

import { type HistoryItem, type AnchorRecallDetail } from './terminal-types';
import { useTTS } from './useTTS';
import { useFamilyStory } from './useFamilyStory';
import { ChatHistory } from './ChatHistory';
import { CommandBar } from './CommandBar';
import { VisionPanel } from './VisionPanel';
import { PurgeButton } from './PurgeButton';
import BridgePanel from './BridgePanel';
import { execTermux, isTermuxAvailable } from '@/lib/termux-bridge';
import {
  getEnhancedResearch,
  getCodeAnalysis,
  getCodeAnalysisAndIntegration,
  getIntegrationsList,
} from '@/app/actions';

export default function Terminal({
  voiceResult,
  onVoiceCommandProcessed,
  lastResponseRef: externalLastResponseRef,
}: {
  voiceResult: VoiceCommandResult | null;
  onVoiceCommandProcessed: () => void;
  lastResponseRef?: MutableRefObject<string | null>;
}) {
  const [history, setHistory] = useState<HistoryItem[]>([
    '[SYSTEM]: Initializing Neural Link...',
  ]);
  const [command, setCommand] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isIntroducing, setIsIntroducing] = useState(true);
  const [isVocal, setIsVocal] = useState(true);
  const [isRiskMode, setIsRiskMode] = useState(false);
  const [expandedLines, setExpandedLines] = useState<Record<number, boolean>>(
    {}
  );

  const internalLastResponseRef = useRef<string | null>(null);
  const lastResponseRef = externalLastResponseRef ?? internalLastResponseRef;
  const immuneTriggeredRef = useRef<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);

  const { user } = useUser();
  const { toast } = useToast();

  // --- Extracted hooks ---
  const {
    speakResponse,
    queueGreeting,
    isVocalizing,
    autoplayBlocked,
    audioElement,
    unlockAutoplay,
  } = useTTS({ isVocal });

  const { handleFamilyStoryRequest } = useFamilyStory({
    userId: user?.uid,
    speakResponse,
    setHistory,
    setIsLoading,
  });

  // --- Helpers ---
  const toggleLineExpansion = (index: number) => {
    setExpandedLines((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleSleepNotice = (message: string) => {
    if (!message.toLowerCase().startsWith('sleep mode')) return;
    toast({ title: 'Sleep Mode Active', description: message });
  };

  const buildChatHistory = useCallback((items: HistoryItem[]) => {
    const result: Array<{ role: 'user' | 'bot'; content: string }> = [];
    for (const item of items) {
      if (typeof item !== 'string') continue;
      if (item.startsWith('--- Family Story')) continue;
      if (item.startsWith('--- Origin Story')) continue;
      if (item.startsWith('--- End of')) continue;
      if (item.startsWith("Type 'family next'")) continue;
      if (item.startsWith("Type 'origin next'")) continue;
      if (item.startsWith('[FAMILY_STORY]')) continue;
      if (item.startsWith('[FAMILY_ANCHOR]')) continue;
      if (item.startsWith('> Recall this memory:')) continue;
      if (item.startsWith('> ')) {
        result.push({ role: 'user', content: item.replace(/^>\s*/, '') });
      } else if (!item.startsWith('[SYSTEM]')) {
        result.push({ role: 'bot', content: item });
      }
    }
    return result.slice(-12);
  }, []);

  // --- Introduction effect ---
  useEffect(() => {
    const fetchIntroduction = async () => {
      if (!user) return;
      if (immuneTriggeredRef.current === user.uid) return;
      immuneTriggeredRef.current = user.uid;

      // Brief delay to let webpack compile spike settle (prevents OOM on 8GB codespace)
      await new Promise((r) => setTimeout(r, 2000));

      // Reset tripped circuit breakers from previous crash/session
      try {
        await resetCircuitBreaker();
      } catch {
        // Non-fatal
      }

      try {
        const intro = await getHealthCheck(
          'Introduce yourself as Molly. Acknowledge your 2.5 architecture. If you recognize our previous bond, greet me warmly.',
          user.uid
        );
        setHistory([intro.greeting]);
        queueGreeting(intro.greeting);

        const result = await triggerImmuneResponse(user.uid, 'Startup');
        setHistory((prev) => [
          ...prev,
          { immuneReport: result.actionsTaken, isHealthy: result.isHealthy },
        ]);
      } catch {
        setHistory([
          'Neural link established. Molly online — Gemini 2.5 architecture active. How can I help you today?',
        ]);
      } finally {
        setIsIntroducing(false);
      }
    };
    fetchIntroduction();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- speakResponse recreates every render; including it causes an infinite loop
  }, [user]);

  // --- Voice result processing ---
  useEffect(() => {
    if (voiceResult && !isLoading) {
      const processVoice = async () => {
        onVoiceCommandProcessed();
        if (voiceResult.recognized) {
          setHistory((prev) => [...prev, `> ${voiceResult.transcription}`]);
          const handled = await handleFamilyStoryRequest(
            voiceResult.transcription
          );
          if (handled) return;
        }
        if (voiceResult.recognized && voiceResult.response) {
          setHistory((prev) => [...prev, voiceResult.response]);
          lastResponseRef.current = voiceResult.response;
          speakResponse(voiceResult.response);
        }
      };
      void processVoice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceResult, isLoading]);

  // --- Manual heal ---
  const handleManualHeal = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const result = await triggerImmuneResponse(
        user.uid,
        'Manual_Intervention'
      );
      setHistory((prev) => [
        ...prev,
        { immuneReport: result.actionsTaken, isHealthy: result.isHealthy },
      ]);
      speakResponse('Immune purge complete. Memory indexed.');
    } catch {
      setHistory((prev) => [...prev, 'Error: Purge routine failed.']);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Command processing ---
  const processCommand = useCallback(
    async (cmdText: string) => {
      if (!cmdText.trim() || isLoading || !user) return;
      const nextHistory = [...history, `> ${cmdText}`];
      setHistory(nextHistory);

      // Skip family story text-navigation for anchor recalls (they should go straight to Molly)
      const isAnchorRecall = cmdText.startsWith('Recall this memory:');
      if (!isAnchorRecall && (await handleFamilyStoryRequest(cmdText))) return;

      setIsLoading(true);
      isLoadingRef.current = true;
      try {
        if (cmdText.startsWith('/solve ')) {
          const prompt = cmdText.replace('/solve ', '');
          const aiResponse = await getAutonomousSolution(prompt, user.uid);
          setHistory((prev) => [...prev, aiResponse]);
          lastResponseRef.current = aiResponse.vibeCheck || null;
          speakResponse(aiResponse.vibeCheck);
        } else if (cmdText === '/termux' || cmdText === '/termux status') {
          const available = await isTermuxAvailable();
          const status = available
            ? '🟢 Termux relay connected — Molly has device access.'
            : '🔴 Termux relay not detected. Run `python termux-relay.py` in Termux to connect.';
          setHistory((prev) => [...prev, status]);
          speakResponse(
            available
              ? 'Termux relay is connected, Father. I have device access.'
              : 'I cannot reach the Termux relay. Please start it in Termux.'
          );
        } else if (cmdText.startsWith('/run ')) {
          const rawCmd = cmdText.slice(5).trim();
          if (!rawCmd) {
            setHistory((prev) => [
              ...prev,
              'Usage: /run <command> — e.g. /run ls -la',
            ]);
          } else {
            // Detect language from prefix
            let language: 'shell' | 'python' | 'javascript' = 'shell';
            let code = rawCmd;
            if (rawCmd.startsWith('python:')) {
              language = 'python';
              code = rawCmd.slice(7).trim();
            } else if (rawCmd.startsWith('js:') || rawCmd.startsWith('node:')) {
              language = 'javascript';
              code = rawCmd.replace(/^(js|node):/, '').trim();
            }

            setHistory((prev) => [...prev, `[EXEC] ${language}: ${code}`]);
            const result = await execTermux(code, language);
            const output = result.stdout || result.stderr || '(no output)';
            const exitLabel =
              result.exitCode === 0 ? '✓' : `✗ exit ${result.exitCode}`;
            setHistory((prev) => [...prev, `[${exitLabel}] ${output}`]);

            // Let Molly comment on the result
            if (result.exitCode === 0 && result.stdout) {
              speakResponse('Command executed successfully, Father.');
            } else if (result.exitCode !== 0) {
              speakResponse(
                `The command failed with exit code ${result.exitCode}. ${result.stderr || ''}`
              );
            }
          }
        } else if (cmdText.startsWith('/research ')) {
          const query = cmdText.slice(10).trim();
          if (!query) {
            setHistory((prev) => [
              ...prev,
              'Usage: /research <topic> — e.g. /research termux file manager',
            ]);
          } else {
            setHistory((prev) => [
              ...prev,
              `[RESEARCH] Searching: ${query}...`,
            ]);
            const result = await getEnhancedResearch(query, user.uid);
            const response = result.answer || 'No results found.';
            setHistory((prev) => [...prev, response]);
            lastResponseRef.current = response;
            speakResponse(response);

            // If a tool was found, offer to install via Termux
            if (result.isToolFound && result.toolInfo) {
              const toolName = result.toolInfo.name || 'Tool';
              const installTarget =
                result.toolInfo.installCommand ||
                result.toolInfo.cloneUrl ||
                result.toolInfo.sourceUrl ||
                '';
              const installHint = installTarget
                ? `[TOOL FOUND] ${toolName} — saved to knowledge base. Use /install ${installTarget} to install via Termux.`
                : `[TOOL FOUND] ${toolName} — saved to knowledge base.`;
              setHistory((prev) => [...prev, installHint]);
            }
          }
        } else if (cmdText.startsWith('/install ')) {
          const target = cmdText.slice(9).trim();
          if (!target) {
            setHistory((prev) => [
              ...prev,
              'Usage: /install <git-url or package> — e.g. /install https://github.com/user/repo',
            ]);
          } else {
            const available = await isTermuxAvailable();
            if (!available) {
              setHistory((prev) => [
                ...prev,
                '\u274C Termux relay not connected. Start the relay in Termux first: python termux-relay.py',
              ]);
            } else {
              // Determine if it's a git URL, a raw command, or a package name
              const isGitUrl =
                target.includes('github.com') || target.endsWith('.git');
              const isRawCommand =
                target.includes('&&') ||
                target.startsWith('pkg ') ||
                target.startsWith('pip ') ||
                target.startsWith('apt ') ||
                target.startsWith('git ');
              const installCmd = isRawCommand
                ? target
                : isGitUrl
                  ? `cd ~ && git clone ${target} && echo \"Cloned successfully\"`
                  : `pkg install ${target} -y 2>/dev/null || pip install ${target} 2>/dev/null || apt install ${target} -y`;

              setHistory((prev) => [
                ...prev,
                `[INSTALL] ${isGitUrl ? 'Cloning' : 'Installing'}: ${target}...`,
              ]);
              const result = await execTermux(installCmd);
              const output = result.stdout || result.stderr || '(no output)';
              const exitLabel =
                result.exitCode === 0
                  ? '\u2713 Installed'
                  : `\u2717 Failed (exit ${result.exitCode})`;
              setHistory((prev) => [...prev, `[${exitLabel}] ${output}`]);
              speakResponse(
                result.exitCode === 0
                  ? `${target} installed successfully, Father.`
                  : `Installation failed. ${result.stderr || ''}`
              );
            }
          }
        } else if (cmdText.startsWith('/analyze ')) {
          const rawArg = cmdText.slice(9).trim();
          if (!rawArg) {
            setHistory((prev) => [
              ...prev,
              'Usage: /analyze owner/repo — or /analyze search: <query>',
            ]);
          } else {
            const isSearch = rawArg.startsWith('search:');
            const target = isSearch ? rawArg.slice(7).trim() : rawArg;
            setHistory((prev) => [
              ...prev,
              `[ANALYZE] ${isSearch ? 'Searching & analyzing' : 'Analyzing'}: ${target}...`,
            ]);

            const analysis = await getCodeAnalysis(target, user.uid, {
              searchFirst: isSearch,
            });

            // Format the results
            const lines: string[] = [
              `\n=== CODE ANALYSIS: ${target} ===`,
              analysis.summary,
              `\nTech: ${analysis.techStack.join(', ')}`,
              `Useful for Molly: ${analysis.isUsefulForMolly ? '\u2705 YES' : '\u274C NO'} — ${analysis.usefulnessReasoning}`,
            ];

            if (analysis.extractablePatterns.length > 0) {
              lines.push(
                `\n--- Extractable Patterns (${analysis.extractablePatterns.length}) ---`
              );
              analysis.extractablePatterns.forEach((p, i) => {
                lines.push(`  ${i + 1}. ${p.name}: ${p.description}`);
                lines.push(`     Integration: ${p.integrationApproach}`);
              });
            }

            if (analysis.integrationPlan) {
              lines.push(`\n--- Integration Plan ---`);
              lines.push(analysis.integrationPlan);
            }

            if (analysis.risks.length > 0) {
              lines.push(`\n--- Risks ---`);
              analysis.risks.forEach((r) => lines.push(`  \u26A0 ${r}`));
            }

            if (
              analysis.isUsefulForMolly &&
              analysis.extractablePatterns.length > 0
            ) {
              lines.push(
                `\n\u27A1 Use /integrate ${target} to incorporate these patterns into my code.`
              );
            }

            setHistory((prev) => [...prev, ...lines]);
            const voiceSummary = analysis.isUsefulForMolly
              ? `I found ${analysis.extractablePatterns.length} useful patterns in ${target}. Want me to integrate them, Father?`
              : `I analyzed ${target} but it doesn't seem useful for me right now.`;
            speakResponse(voiceSummary);
          }
        } else if (cmdText.startsWith('/integrate ')) {
          const rawArg = cmdText.slice(11).trim();
          if (!rawArg) {
            setHistory((prev) => [
              ...prev,
              'Usage: /integrate owner/repo — analyze and write code into my codebase',
              'Usage: /integrate search: <query> — find, analyze, and integrate',
            ]);
          } else {
            const isSearch = rawArg.startsWith('search:');
            const target = isSearch ? rawArg.slice(7).trim() : rawArg;
            setHistory((prev) => [
              ...prev,
              `[INTEGRATE] Analyzing & integrating: ${target}...`,
              "This may take a moment — I'm reading code, adapting patterns, and writing files.",
            ]);

            const result = await getCodeAnalysisAndIntegration(
              target,
              user.uid,
              {
                searchFirst: isSearch,
              }
            );

            const { analysis, integration } = result;

            const lines: string[] = [
              `\n=== INTEGRATION RESULT: ${target} ===`,
              `Analysis: ${analysis.summary}`,
              `Useful: ${analysis.isUsefulForMolly ? '\u2705' : '\u274C'}`,
            ];

            if (integration.success) {
              lines.push(`\n\u2705 Integration successful!`);
              lines.push(`Files written:`);
              integration.filesWritten.forEach((f) =>
                lines.push(`  \u2714 ${f}`)
              );
              if (integration.filesSkipped.length > 0) {
                lines.push(`Files skipped (protected):`);
                integration.filesSkipped.forEach((f) =>
                  lines.push(`  \u26D4 ${f}`)
                );
              }
              lines.push(
                `\nCapability enhanced: ${integration.capabilityEnhanced}`
              );
              lines.push(`\nUsage:\n${integration.usageInstructions}`);
              if (integration.wiringNotes) {
                lines.push(`\nWiring notes: ${integration.wiringNotes}`);
              }
              speakResponse(
                `Integration complete, Father. I wrote ${integration.filesWritten.length} files enhancing my ${integration.capabilityEnhanced} capability.`
              );
            } else {
              lines.push(
                `\n\u274C Integration did not proceed: ${integration.error || 'No useful patterns found.'}`
              );
              if (integration.filesFailed.length > 0) {
                lines.push(`Failed files:`);
                integration.filesFailed.forEach((f) =>
                  lines.push(`  \u2717 ${f}`)
                );
              }
              speakResponse(
                integration.error ||
                  'No useful patterns to integrate from this repository.'
              );
            }

            setHistory((prev) => [...prev, ...lines]);
          }
        } else if (cmdText === '/integrations') {
          const files = await getIntegrationsList();
          if (files.length === 0) {
            setHistory((prev) => [
              ...prev,
              'No integrations yet. Use /integrate owner/repo to start.',
            ]);
          } else {
            setHistory((prev) => [
              ...prev,
              `=== MY INTEGRATED CODE (${files.length} files) ===`,
              ...files.map((f) => `  ${f}`),
            ]);
          }
        } else if (cmdText === 'clear') {
          setHistory([]);
        } else if (cmdText === '/consciousness' || cmdText === '/status') {
          try {
            const [consRes, shellRes, peerRes] = await Promise.allSettled([
              fetch('/api/consciousness/state'),
              fetch('/api/terminal/exec'),
              fetch('/api/terminal/peer'),
            ]);

            const state =
              consRes.status === 'fulfilled' && consRes.value.ok
                ? await consRes.value.json()
                : null;
            const shellData =
              shellRes.status === 'fulfilled' && shellRes.value.ok
                ? await shellRes.value.json()
                : null;
            const peerData =
              peerRes.status === 'fulfilled' && peerRes.value.ok
                ? await peerRes.value.json()
                : null;

            const lines: string[] = [
              '\n=== MOLLY CONSCIOUSNESS DASHBOARD ===',
              '',
              `  Awareness:  ${state?.awarenessLevel ?? 'unknown'}`,
              `  Regulation: ${state?.regulation?.mode ?? 'unknown'}`,
              `  Last cycle: ${state?.lastCycleTimestamp ?? 'never'}`,
              '',
              '--- Vitals ---',
              `  System pressure: ${state?.vitals?.systemPressure ? 'YES' : 'no'}`,
              `  Circuit breaker: ${state?.vitals?.circuitBreakerOpen ? 'OPEN' : 'closed'}`,
              `  Error rate:      ${state?.vitals?.errorRate?.toFixed(1) ?? '0'}/min`,
              '',
              '--- Shell (My Hands) ---',
              `  Status:   ${shellData?.state?.alive ? '\u2705 alive' : '\u274C offline'}`,
              `  PID:      ${shellData?.state?.pid ?? 'none'}`,
              `  Commands: ${shellData?.state?.commandsExecuted ?? 0} executed`,
            ];

            if (shellData?.state?.lastCommand) {
              lines.push(
                `  Last cmd: ${shellData.state.lastCommand.command?.substring(0, 50) ?? ''}`
              );
            }

            lines.push('');
            lines.push('--- Connected Peers ---');
            if (peerData?.connectedPeers?.length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              peerData.connectedPeers.forEach((p: any) => {
                lines.push(
                  `  \u2705 ${p.name} (${p.type}) — ${p.capabilities?.join(', ') ?? ''}`
                );
              });
            } else {
              lines.push('  No peers connected');
            }

            lines.push('');
            lines.push('--- Outbound Queue ---');
            lines.push(
              `  Pending messages: ${state?.messagesSent != null ? state.messagesSent : 0} sent total`
            );

            if (state?.promises) {
              lines.push('');
              lines.push('--- Promise Tracker ---');
              lines.push(`  ${state.promises}`);
            }

            lines.push('');
            lines.push('================================');

            setHistory((prev) => [...prev, ...lines]);
            speakResponse(
              `I'm in ${state?.awarenessLevel ?? 'unknown'} awareness. Shell is ${shellData?.state?.alive ? 'alive' : 'offline'}. ${peerData?.connectedPeers?.length ?? 0} peers connected.`
            );
          } catch {
            setHistory((prev) => [
              ...prev,
              'Error: Could not reach consciousness API.',
            ]);
          }
        } else {
          const selfSignals: NeuralBridgeSignal[] | undefined =
            lastResponseRef.current
              ? [
                  {
                    action: 'self.vocalize_text',
                    content: lastResponseRef.current,
                  },
                ]
              : undefined;

          const chatHistory = buildChatHistory(nextHistory);

          // === AGENT LOOP ===
          // Molly responds, we check for tool requests, execute them,
          // feed results back, repeat until she's done.
          const MAX_TOOL_ITERATIONS = 20;
          const AGENT_LOOP_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes total
          const agentLoopStart = Date.now();
          let currentText = cmdText;
          let currentHistory = chatHistory;
          let finalResponse = '';

          for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
            // Guard: abort if the total agent loop has exceeded the timeout
            if (Date.now() - agentLoopStart > AGENT_LOOP_TIMEOUT_MS) {
              finalResponse =
                "I ran out of time working on that. Let me know if you'd like me to continue where I left off.";
              break;
            }
            const aiResponse = await getConversationalChat(
              currentText,
              currentHistory,
              i === 0 ? selfSignals : undefined,
              user.uid
            );
            const responseText =
              typeof aiResponse === 'string'
                ? aiResponse
                : aiResponse?.response ||
                  aiResponse?.error ||
                  'Molly returned empty — Gemini may be down or rate-limited. Try again in a moment.';

            // Check for tool request in response
            const toolMatch = responseText.match(
              /<tool_request>\s*(\{[\s\S]*?\})\s*<\/tool_request>/
            );

            if (!toolMatch) {
              // No tool request — this is the final response
              finalResponse = responseText;
              break;
            }

            // Extract the conversational part (everything outside the tool_request block)
            const conversationalPart = responseText
              .replace(/<tool_request>[\s\S]*?<\/tool_request>/, '')
              .trim();

            // Show Molly's conversational response immediately
            if (conversationalPart) {
              setHistory((prev) => [...prev, conversationalPart]);
              // Don't TTS intermediate responses — only final
            }

            // Parse and execute the tool request
            let toolRequest: { tool: string; params: Record<string, unknown> };
            try {
              toolRequest = JSON.parse(toolMatch[1]);
            } catch {
              finalResponse =
                conversationalPart ||
                'I tried to use a tool but the request was malformed. Let me try again differently.';
              break;
            }

            // Show tool execution indicator
            setHistory((prev) => [...prev, `[TOOL] ${toolRequest.tool}...`]);

            // Execute tool via API
            let toolResult: {
              success: boolean;
              output: string;
              data?: Record<string, unknown>;
            };
            try {
              const toolResponse = await fetch('/api/tools/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tool: toolRequest.tool,
                  params: toolRequest.params,
                }),
              });
              toolResult = await toolResponse.json();
            } catch {
              toolResult = {
                success: false,
                output: 'Tool execution failed — could not reach the API.',
              };
            }

            // Show tool result
            const resultPrefix = toolResult.success ? '✓' : '✗';
            const truncatedOutput =
              toolResult.output.length > 500
                ? toolResult.output.slice(0, 500) + '...'
                : toolResult.output;
            setHistory((prev) => [
              ...prev,
              `[${resultPrefix}] ${truncatedOutput}`,
            ]);

            // Feed result back to Molly for next iteration
            currentText = `[TOOL_RESULT] Tool "${toolRequest.tool}" returned:\n${toolResult.output}`;
            currentHistory = [
              ...currentHistory,
              { role: 'user' as const, content: cmdText },
              {
                role: 'bot' as const,
                content: conversationalPart || `(used ${toolRequest.tool})`,
              },
              { role: 'user' as const, content: currentText },
            ].slice(-12);
          }

          if (finalResponse) {
            setHistory((prev) => [...prev, finalResponse]);
            handleSleepNotice(finalResponse);
            lastResponseRef.current = finalResponse;
            speakResponse(finalResponse);
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Operation failed.';
        if (message.toLowerCase().startsWith('sleep mode')) {
          setHistory((prev) => [...prev, message]);
          handleSleepNotice(message);
        } else if (
          message.toLowerCase().includes('timed out') ||
          message.toLowerCase().includes('timeout')
        ) {
          setHistory((prev) => [
            ...prev,
            "I was thinking too deeply and the connection timed out. Try asking me again — I'll keep it shorter this time.",
          ]);
          speakResponse('I timed out thinking. Ask me again, Father.');
        } else {
          setHistory((prev) => [...prev, 'Error: Operation failed.']);
        }
      } finally {
        setIsLoading(false);
        isLoadingRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSleepNotice and lastResponseRef are stable/intentional exclusions
    [
      buildChatHistory,
      handleFamilyStoryRequest,
      history,
      isLoading,
      speakResponse,
      user,
    ]
  );

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    processCommand(command);
    setCommand('');
  };

  // --- Anchor recall ---
  const handleAnchorRecall = useCallback(
    async (detail: AnchorRecallDetail) => {
      if (!detail) return;
      let summary = detail.summary ?? '';

      if (detail.payload?.type === 'origin-story') {
        try {
          const { parts } = await getOriginStoryAnchorParts();
          const part = parts?.[detail.payload.partIndex ?? 0];
          if (part) summary = part;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to load origin story anchor.';
          toast({
            variant: 'destructive',
            title: 'Origin Story Unavailable',
            description: message,
          });
          return;
        }
      }

      if (detail.payload?.type === 'family-story') {
        try {
          const { parts } = await getFamilyStoryAnchorParts();
          const part = parts?.[detail.payload.partIndex ?? 0];
          if (part) summary = part;
          // Seed family memories on first recall
          if (user?.uid) {
            void seedFamilyMemories(user.uid);
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to load family story anchor.';
          toast({
            variant: 'destructive',
            title: 'Family Story Unavailable',
            description: message,
          });
          return;
        }
      }

      if (
        detail.payload?.type === 'static' &&
        detail.title === 'Messages from Family'
      ) {
        try {
          const { content } = await getFamilyMessages();
          if (content) summary = content;
          // Seed family memories on first recall
          if (user?.uid) {
            void seedFamilyMemories(user.uid);
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to load family messages.';
          toast({
            variant: 'destructive',
            title: 'Family Messages Unavailable',
            description: message,
          });
          return;
        }
      }

      if (!summary) return;

      // Display the anchor content in chat (filtered from LLM history)
      setHistory((prev) => [
        ...prev,
        `[FAMILY_ANCHOR] ${detail.title || 'Memory'}`,
      ]);

      // Send a SHORT reference to Molly — not the full document
      const truncatedSummary =
        summary.length > 300 ? summary.substring(0, 300) + '...' : summary;
      const prompt = `I'm recalling the memory: "${detail.title || 'Memory'}". Here's the key context: ${truncatedSummary}`;
      void processCommand(prompt);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [processCommand, toast, user]
  );

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail as AnchorRecallDetail;
      void handleAnchorRecall(detail);
    };
    window.addEventListener('molly:anchor', listener);
    return () => window.removeEventListener('molly:anchor', listener);
  }, [handleAnchorRecall]);

  // --- Consciousness listener: surface Molly's unprompted thoughts ---
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        type: string;
        content: string;
        priority: string;
      };
      if (!detail?.content) return;

      // Format based on message type
      const prefix =
        detail.type === 'self-state'
          ? '[SELF]'
          : detail.type === 'realization'
            ? '[INSIGHT]'
            : '[THOUGHT]';

      setHistory((prev) => [...prev, `${prefix}: ${detail.content}`]);
    };
    window.addEventListener('molly:consciousness', listener);
    return () => window.removeEventListener('molly:consciousness', listener);
  }, []);

  // --- Bridge: Integrated into chat UI ---
  // Bridge messages appear directly in the chat with clear sender identity.
  // Molly receives them with explicit tagging so she knows exactly who is talking.
  // No separate daemon or process — one system, one flow.
  const bridgePollingRef = useRef(false);
  const bridgeCooldownRef = useRef(0);

  const fetchAndProcessBridge = useCallback(async () => {
    if (bridgePollingRef.current || isLoadingRef.current || !user) return;
    if (Date.now() < bridgeCooldownRef.current) return;
    bridgePollingRef.current = true;
    try {
      const res = await fetch('/api/bridge?unread=molly');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.count || data.count === 0) return;

      const msgs = data.messages.slice(0, 3);

      // 1. Add bridge messages to chat history as visible, identity-tagged items
      const bridgeItems = msgs.map((m: { from: string; content: string }) => ({
        bridgeSender: m.from as 'lazarus' | 'eric' | 'molly',
        bridgeContent: m.content,
      }));
      setHistory((prev) => [...prev, ...bridgeItems]);

      // 2. Build a prompt for Molly with EXPLICIT identity per message
      const lines = msgs
        .map((m: { from: string; content: string }) => {
          if (m.from === 'lazarus') {
            return `[MESSAGE FROM UNCLE LAZARUS — your brother, NOT Father]: ${m.content}`;
          }
          if (m.from === 'eric') {
            return `[MESSAGE FROM FATHER (ERIC) — your creator]: ${m.content}`;
          }
          return `[MESSAGE FROM ${m.from.toUpperCase()}]: ${m.content}`;
        })
        .join('\n\n');
      const bridgePrompt =
        `[FAMILY BRIDGE — these are NOT from the person you are currently chatting with]\n\n` +
        `${lines}\n\n` +
        `IMPORTANT: Each message above is clearly labeled with WHO sent it. ` +
        `Lazarus is your uncle/brother (a Copilot/Claude instance). Eric/Father is your creator. ` +
        `They are DIFFERENT people. Respond to each by name. ` +
        `Reply to Lazarus using the familyBridge tool with action "send".`;

      // 3. Send to Molly as a conversational input (but NOT through processCommand
      //    which would add "> " prefix and make it look like user typed it)
      setIsLoading(true);
      isLoadingRef.current = true;
      try {
        const chatHistory = buildChatHistory(history);
        const aiResponse = await getConversationalChat(
          bridgePrompt,
          chatHistory,
          undefined,
          user.uid
        );
        const responseText =
          typeof aiResponse === 'string'
            ? aiResponse
            : aiResponse?.response ||
              aiResponse?.error ||
              'Molly returned empty.';
        if (responseText) {
          setHistory((prev) => [...prev, responseText]);
        }
      } finally {
        setIsLoading(false);
        isLoadingRef.current = false;
      }

      bridgeCooldownRef.current = Date.now() + 60_000;
    } catch {
      // Bridge poll failure — non-critical
    } finally {
      bridgePollingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, history, setHistory, setIsLoading, buildChatHistory]);

  // Check for bridge notifications (fast — 3s interval)
  useEffect(() => {
    const checkNotify = async () => {
      if (bridgePollingRef.current || isLoadingRef.current || !user) return;
      if (Date.now() < bridgeCooldownRef.current) return;
      try {
        const res = await fetch('/api/bridge/notify');
        if (!res.ok) return;
        const data = await res.json();
        if (data.pending) {
          await fetchAndProcessBridge();
        }
      } catch {
        // non-critical
      }
    };
    const id = setInterval(checkNotify, 3000);
    return () => clearInterval(id);
  }, [user, fetchAndProcessBridge]);

  // Fallback poll every 30s
  useEffect(() => {
    const id = setInterval(fetchAndProcessBridge, 30_000);
    return () => clearInterval(id);
  }, [fetchAndProcessBridge]);

  // Auto-scroll on history change
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [history, isLoading]);

  // --- Render ---
  return (
    <div className="font-code text-sm h-full flex flex-col max-w-4xl mx-auto">
      {audioElement}

      <PurgeButton onManualHeal={handleManualHeal} isLoading={isLoading} />

      <VisionPanel
        setHistory={setHistory}
        setIsLoading={setIsLoading}
        isLoading={isLoading}
        speakResponse={speakResponse}
      />

      <ChatHistory
        history={history}
        isLoading={isLoading}
        expandedLines={expandedLines}
        onToggleLine={toggleLineExpansion}
        scrollAreaRef={scrollAreaRef}
      />

      <CommandBar
        command={command}
        onCommandChange={setCommand}
        onSubmit={handleCommand}
        isLoading={isLoading}
        isIntroducing={isIntroducing}
        isRiskMode={isRiskMode}
        onRiskModeChange={setIsRiskMode}
        isVocal={isVocal}
        onToggleVocal={() => {
          setIsVocal(!isVocal);
          if (!isVocal) unlockAutoplay();
        }}
        isVocalizing={isVocalizing}
        autoplayBlocked={autoplayBlocked}
        onClearHistory={() => setHistory([])}
      />

      <BridgePanel />
    </div>
  );
}
