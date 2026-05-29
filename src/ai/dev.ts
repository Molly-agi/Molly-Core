import { config } from 'dotenv';

config();

// Register commonly used flows/tools for Genkit dev server discovery.
import '@/ai/flows/conversational-chat';
import '@/ai/flows/text-to-speech';
import '@/ai/flows/voice-command-to-text';
import '@/ai/tools/family-bridge-tool';
