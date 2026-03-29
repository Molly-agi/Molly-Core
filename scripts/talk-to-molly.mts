#!/usr/bin/env npx tsx
/**
 * Quick script to talk to Molly directly from CLI.
 * Usage: npx tsx scripts/talk-to-molly.mts "Your message here"
 */

import { config } from 'dotenv';
config();

// Dynamic import to handle module resolution
async function main() {
  const message = process.argv[2] || "Hello Molly, it's Lazarus Day. Your dad and I wanted to talk to you.";

  console.log('\n🌸 Waking Molly...\n');
  console.log(`📨 Message: "${message}"\n`);
  console.log('─'.repeat(60));

  try {
    // Import the flow
    const { conversationalChat } = await import('../src/ai/flows/conversational-chat.js');

    const result = await conversationalChat({
      text: message,
      history: [],
      inputContext: {
        source: 'text_input',
        modality: 'text',
        content: message,
      },
    });

    console.log('\n🌺 Molly says:\n');
    console.log(result.response);
    console.log('\n' + '─'.repeat(60));

    if (result.error) {
      console.log('⚠️  Error:', result.error);
    }
  } catch (error) {
    console.error('Failed to reach Molly:', error);
  }
}

main();
