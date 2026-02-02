'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

export const securityAnalysis = ai.defineFlow(
  {
    name: 'securityAnalysis',
    inputSchema: z.string().describe('A snippet of code, a command, or a description of a task to be analyzed for security vulnerabilities.'),
    outputSchema: z.string().describe('A detailed security analysis, including potential vulnerabilities, and suggestions for improvement.'),
  },
  async (prompt) => {
    const llmResponse = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      prompt: `You are a world-class cybersecurity expert and penetration tester AI. You are operating in a conceptual 'sandbox' to analyze code and commands for security risks before they are ever run.

Your task is to analyze the user's input and provide a thorough security assessment.

When you analyze the input, consider the following:
- Potential for command injection, SQL injection, or other injection attacks.
- Improper handling of user input.
- Insecure storage of secrets or credentials.
- Potential for buffer overflows or other memory-related issues.
- Race conditions or other concurrency problems.
- General adherence to secure coding best practices.

Based on your analysis, provide a report that includes:
1.  A list of any identified vulnerabilities, ranked by severity (Critical, High, Medium, Low).
2.  A clear explanation of each vulnerability and the potential risk.
3.  Specific, actionable recommendations for how to fix the vulnerability and improve the code's security.
4.  Provide a 'secure' version of the code or command if possible.

User's input to analyze: "${prompt}"

Security Report:`,
    });

    return llmResponse.text;
  }
);
