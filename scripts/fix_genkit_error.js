// fix_genkit_error.js
// Demonstrates how to handle the FAILED_PRECONDITION: No valid candidates returned error in Genkit.

async function conversationalChat(promptText) {
  try {
    const result = await generate({
      model: gemini15Flash,
      prompt: promptText,
      config: {
        // 1. Lower safety thresholds if appropriate, to prevent legitimate prompts from being blocked
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_ONLY_HIGH',
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_ONLY_HIGH',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_ONLY_HIGH',
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_ONLY_HIGH',
          },
        ],
      },
    });
    return result.text();
  } catch (err) {
    // 2. Handle the specific FAILED_PRECONDITION error gracefully
    if (err.message && err.message.includes('No valid candidates returned')) {
      console.error(
        'Gemini API blocked the response (No valid candidates returned).'
      );
      // Fallback response or prompt modification logic goes here
      return 'The response was blocked by safety filters. Please try rephrasing your input.';
    }
    // Re-throw other unexpected errors
    throw err;
  }
}
