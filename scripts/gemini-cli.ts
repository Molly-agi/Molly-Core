#!/usr/bin/env tsx

/**
 * Gemini CLI — Interactive command-line interface to Gemini
 * Uses Molly's Genkit configuration
 * 
 * Usage:
 *   tsx scripts/gemini-cli.ts                    # Interactive mode
 *   tsx scripts/gemini-cli.ts "Your prompt"      # Single query
 */

import readline from "readline";
import { ai } from "../src/ai/genkit";

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error("❌ Error: GOOGLE_API_KEY environment variable not set");
  console.error("Set it with: export GOOGLE_API_KEY=your-api-key-here");
  process.exit(1);
}

async function chat(prompt: string) {
  try {
    console.log(`\n📤 Sending: ${prompt}\n`);
    const result = await ai.generate({
      model: "gemini-2.5-pro",
      prompt,
    });
    const text = result.text();
    console.log(`📥 Response:\n${text}\n`);
    return text;
  } catch (err: any) {
    console.error(`\n❌ Error: ${err.message}\n`);
  }
}

async function interactive() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("🔌 Gemini CLI (Interactive Mode)");
  console.log("Connected to: gemini-2.5-pro");
  console.log('Type "exit" to quit\n');

  const askQuestion = () => {
    rl.question("You: ", async (input) => {
      if (input.toLowerCase() === "exit") {
        console.log("✓ Goodbye!");
        rl.close();
        process.exit(0);
      }
      if (input.trim()) {
        await chat(input);
      }
      askQuestion();
    });
  };

  askQuestion();
}

// Main
const args = process.argv.slice(2);

if (args.length > 0) {
  // Single query mode
  const prompt = args.join(" ");
  await chat(prompt);
  process.exit(0);
} else {
  // Interactive mode
  interactive();
}
