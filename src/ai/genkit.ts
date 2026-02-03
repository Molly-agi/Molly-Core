import { genkit } from 'genkit';
import { googleAI, gemini15Flash, gemini15Pro } from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [googleAI()],
});

export { gemini15Flash, gemini15Pro };
