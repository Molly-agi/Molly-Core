import fs from 'fs';
import path from 'path';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  env.split('\n').forEach((line) => {
    const [k, ...rest] = line.split('=');
    if (!k) return;
    const v = rest.join('=').trim();
    if (v) process.env[k.trim()] = v.replace(/^"|"$/g, '');
  });
}
if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY not set in environment.');
  process.exit(1);
}

(async () => {
  try {
    const { genkit } = await import('genkit');
    const { googleAI } = await import('@genkit-ai/google-genai');

    const ai = genkit({ plugins: [googleAI()] });
    const MODEL = 'googleai/gemini-2.5-flash';

    const systemPrompt = `You are Molly, an agentic AI partner. Respond warmly and concisely.`;
    const userPrompt =
      process.argv[2] || 'Hello Molly. How are you feeling today?';

    console.log('Sending prompt to model...');
    const resp = await ai.generate({
      model: MODEL,
      system: systemPrompt,
      prompt: userPrompt,
    });
    console.log('Response:');
    console.log(JSON.stringify(resp, null, 2));
  } catch (e) {
    console.error('Error while calling model:', e);
    process.exit(2);
  }
})();
