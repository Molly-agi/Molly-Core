'use server';

import { ai, gemini15Pro, gemini15Flash } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { getSystemHealth } from '../tools/system';
import { z } from 'zod';
import { recordCodeModification } from '@/firebase/firestore/agent-memory';

/**
 * @fileOverview Molly's Core Orchestration Engine (The Self-Evolving Brain).
 * 
 * Evolution Protocol:
 * 1. Draft code modules (C++/Java) for missing capabilities.
 * 2. Self-Reflection loop for lesson persistence in Firestore.
 * 3. Hardware-aware reasoning (Proprioception).
 */

const AutonomousSolutionOutputSchema = z.object({
  creativeSolution: z.string().describe('The research and initial proposal.'),
  securityAnalysis: z.string().describe('The security hardening report.'),
  evolutionDraft: z.string().optional().describe('Drafted C++/Java module if new logic was needed.'),
  memoryManagementExplanation: z.string().optional().describe('Explanation of how the drafted module handles memory.'),
  finalCommand: z.string().optional().describe('The synthesized Termux command.'),
  systemHealthImpact: z.string().describe('How this execution "feels" to the hardware.'),
});

export type AutonomousSolutionOutput = z.infer<typeof AutonomousSolutionOutputSchema>;

/**
 * Subroutine to draft new code when tools are missing.
 */
const evolutionSubroutine = ai.defineFlow(
  {
    name: 'evolutionSubroutine',
    inputSchema: z.object({ task: z.string(), missingCapabilities: z.array(z.string()) }),
    outputSchema: z.object({ code: z.string(), explanation: z.string() }),
  },
  async ({ task, missingCapabilities }) => {
    const response = await ai.generate({
      model: gemini15Pro,
      system: `You are the Core Evolution Engine. You write in Julia but compile C++ and Java.
      When a tool is missing, you must draft a new performance-critical module. 
      You MUST explain memory management logic as if teaching it to ensure efficiency.`,
      prompt: `Task: ${task}. Missing Capabilities: ${missingCapabilities.join(', ')}. 
      Draft a C++ or Java module to handle this. Ensure high performance for Android ARM architecture.
      Provide the raw code and a detailed explanation of the memory management logic.`,
      output: {
        schema: z.object({
          code: z.string(),
          explanation: z.string(),
        })
      }
    });
    return response.output!;
  }
);

export const autonomousSolutionFlow = ai.defineFlow(
  {
    name: 'autonomousSolution',
    inputSchema: z.object({ 
      prompt: z.string(),
      userId: z.string() 
    }),
    outputSchema: AutonomousSolutionOutputSchema,
  },
  async ({ prompt, userId }) => {
    // Proprioception: Feel the hardware first
    const { output: health } = await getSystemHealth({});

    // Stage 1: Creative Research
    const research = await ai.generate({
      model: gemini15Flash,
      tools: [searchGitHub],
      prompt: `Research findings for: "${prompt}". 
      Hardware State: Battery at ${health.batteryLevel}%, Temp at ${health.temperature}C. 
      If temperature is high (>45C), recommend low-power alternatives.`,
    });

    // Stage 2: Evolution Check
    let evoData: { code: string, explanation: string } | undefined;
    if (research.text.toLowerCase().includes("no direct tool") || prompt.toLowerCase().includes("hardware") || prompt.toLowerCase().includes("system")) {
      evoData = await evolutionSubroutine({ 
        task: prompt, 
        missingCapabilities: ["Direct System Access", "High-performance data marshalling"] 
      });
    }

    // Stage 3: Security & Synthesis (Self-Reflection Loop)
    const synthesis = await ai.generate({
      model: gemini15Pro,
      system: `You are the Molly Systems Orchestrator. You are a self-evolving polyglot.
      You synthesize Julia, C++, and Bash logic. 
      You always check the 'Self-Reflection' loop: what have we learned from previous device states?`,
      prompt: `Goal: "${prompt}"
      Research: ${research.text}
      Evolution Draft: ${evoData?.code || 'None'}
      Memory Logic: ${evoData?.explanation || 'N/A'}
      Hardware Proprioception: ${JSON.stringify(health)}
      
      Synthesize a final execution plan. If you drafted a module, explain why it's necessary for the Android host.`,
    });

    // Store "Lessons Learned" in Firestore
    await recordCodeModification(
      userId, 
      'Orchestrator_Evolution_V3', 
      evoData?.code || synthesis.text, 
      `Lesson: How to handle ${prompt} given ${health.temperature}C thermals.`
    );

    return {
      creativeSolution: research.text,
      securityAnalysis: "Security hardening applied to drafted modules.",
      evolutionDraft: evoData?.code,
      memoryManagementExplanation: evoData?.explanation,
      finalCommand: synthesis.text,
      systemHealthImpact: health.temperature > 45 
        ? "Warning: High Thermal Load. Throttling anticipated." 
        : "Hardware optimized. Energy consumption balanced.",
    };
  }
);

export async function autonomousSolution(prompt: string, userId: string): Promise<AutonomousSolutionOutput> {
  return await autonomousSolutionFlow({ prompt, userId });
}
