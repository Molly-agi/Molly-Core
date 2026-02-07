import path from 'path';
import { fileURLToPath } from 'url';

// Load environment key from .env.local
import fs from 'fs';
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

// Ensure GEMINI_API_KEY is set (fallback to GOOGLE_GENAI_API_KEY)
if (!process.env.GEMINI_API_KEY && process.env.GOOGLE_GENAI_API_KEY) {
  process.env.GEMINI_API_KEY = process.env.GOOGLE_GENAI_API_KEY;
}

(async () => {
  try {
    const pageModulePath = path.resolve(
      process.cwd(),
      '.next/server/app/page.js'
    );
    if (!fs.existsSync(pageModulePath)) {
      console.error(
        'Compiled server module not found at .next/server/app/page.js'
      );
      process.exit(1);
    }

    const mod = await import('file://' + pageModulePath);
    if (!mod.getConversationalChat) {
      console.error('getConversationalChat not exported from server bundle');
      process.exit(1);
    }

    console.log('Starting self-check conversation with Molly...');
    const res = await mod.getConversationalChat(
      'Hello Molly. How are you feeling today?',
      []
    );
    console.log('Molly responded:');
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error('Self-check failed with error:');
    console.error(e);
    process.exit(2);
  }
})();
