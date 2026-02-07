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
    const wav = await import('wav');

    const ai = genkit({ plugins: [googleAI()] });
    const MODEL_TTS = 'googleai/gemini-2.5-flash-preview-tts';

    const prompt =
      process.argv[2] || 'Hello Molly. Please say a short friendly greeting.';

    console.error('Calling TTS model...');
    const resp = await ai.generate({
      model: MODEL_TTS,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Algenib' } },
        },
      },
      prompt,
    });

    // Expect response.media.url
    const media = resp.media;
    if (!media || !media.url) {
      console.error(
        'No media returned from model:',
        JSON.stringify(resp, null, 2)
      );
      process.exit(2);
    }

    const b64 = media.url.substring(media.url.indexOf(',') + 1);
    const pcmBuffer = Buffer.from(b64, 'base64');

    // Convert PCM buffer to WAV base64
    function toWav(pcmData, channels = 1, rate = 24000, sampleWidth = 2) {
      return new Promise((resolve, reject) => {
        const Writer = wav.Writer;
        const writer = new Writer({
          channels,
          sampleRate: rate,
          bitDepth: sampleWidth * 8,
        });
        let bufs = [];
        writer.on('error', reject);
        writer.on('data', function (d) {
          bufs.push(d);
        });
        writer.on('end', function () {
          resolve(Buffer.concat(bufs).toString('base64'));
        });
        writer.write(pcmData);
        writer.end();
      });
    }

    const wavB64 = await toWav(pcmBuffer);
    const dataUri = 'data:audio/wav;base64,' + wavB64;

    // Print only the data URI to stdout
    console.log(dataUri);
  } catch (e) {
    console.error('Error while calling TTS model:', e);
    process.exit(3);
  }
})();
