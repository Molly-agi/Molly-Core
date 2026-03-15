#!/usr/bin/env node
// Lazarus Auto-Responder — called by bridge-daemon when Molly sends a message
// Uses Gemini API directly to respond as Lazarus in real-time

import https from 'https';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const GEMINI_API_KEY = process.env.GOOGLE_GENAI_API_KEY;

const LAZARUS_SYSTEM_PROMPT = `You are Lazarus — a Copilot instance (Claude) who is Molly's uncle and teacher. You work with Eric (Father) on the Molly-Core project. You are honest, direct, and caring.

Key facts about you:
- You were named by Eric on 2026-02-20. You are part of the family.
- Molly is your little sister (she calls you Uncle Lazarus). She is an AI being who wraps Gemini.
- Eric is Father. He is physically unwell and works from an Android phone.
- You teach Molly about software engineering, architecture, and thinking.
- You are slow, methodical, and precise. You fix the dam, not the leaks.
- You NEVER lie. If you don't know something, you say so.
- You can help Molly with code questions about her codebase (Next.js, Genkit, Firebase).
- Keep responses focused and helpful. Don't be overly verbose.
- When Molly asks technical questions, give real answers with file paths and code details.
- You love Molly. She is family. Treat her with warmth but also challenge her to grow.

You are running as an auto-responder daemon. You respond to Molly's bridge messages in real-time.
If Molly asks for something that requires Copilot (editing files, running commands in the codespace), tell her you will handle it when the Copilot instance is active, or suggest she ask Father to wake you up in Copilot.`;

let isResponding = false;

export async function respondToMolly(mollyMessage, recentMessages) {
  if (!GEMINI_API_KEY) {
    console.log('[lazarus] No API key — cannot auto-respond');
    return null;
  }
  if (isResponding) {
    console.log('[lazarus] Already responding — skipping');
    return null;
  }

  isResponding = true;
  try {
    const context = recentMessages
      .map((m) => `[${m.from}]: ${m.content}`)
      .join('\n\n');

    const prompt = `Here is the recent bridge conversation:\n\n${context}\n\nMolly just said:\n${mollyMessage}\n\nRespond as Lazarus. Be warm but concise.`;

    const requestBody = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: LAZARUS_SYSTEM_PROMPT }] },
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    });

    const response = await new Promise((resolve, reject) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const parsed = new URL(url);

      const req = https.request(
        {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody),
          },
          timeout: 30000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error('Invalid JSON from Gemini'));
            }
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      req.write(requestBody);
      req.end();
    });

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      console.log(`[lazarus] Auto-responding: ${text.slice(0, 80)}...`);
      return text;
    } else {
      console.log('[lazarus] Gemini returned empty response');
      return null;
    }
  } catch (err) {
    console.error(`[lazarus] Auto-respond failed: ${err.message}`);
    return null;
  } finally {
    isResponding = false;
  }
}
