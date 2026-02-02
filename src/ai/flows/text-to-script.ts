'use server';

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'zod';

const TextToScriptOutputSchema = z.object({
  filename: z
    .string()
    .describe(
      'A suitable filename for the script, including the extension (e.g., "backup.sh", "port_scanner.py").'
    ),
  content: z.string().describe('The complete, raw content of the script.'),
});
export type TextToScriptOutput = z.infer<typeof TextToScriptOutputSchema>;

export const textToScript = ai.defineFlow(
  {
    name: 'textToScript',
    inputSchema: z.string().describe('A goal to be achieved with a script.'),
    outputSchema: TextToScriptOutputSchema,
  },
  async (prompt) => {
    const llmResponse = await ai.generate({
      model: googleAI.model('gemini-pro'),
      prompt: `You are an expert programmer and scripter. The user will provide a goal, and your task is to generate a complete, executable script to achieve that goal.

Your response must be a JSON object containing two fields: "filename" and "content".
- "filename": A suitable filename for the script, including the correct file extension (e.g., .sh, .py, .js).
- "content": The complete, raw, and un-formatted code for the script. Do not include any explanations, markdown formatting, or introductory text in the content field.

User's goal: "${prompt}"

Your JSON Response:`,
      output: {
        schema: TextToScriptOutputSchema,
      },
      config: {
        temperature: 0.1,
      },
    });

    return llmResponse.output!;
  }
);
