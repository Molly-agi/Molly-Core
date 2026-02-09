import type { NextApiRequest, NextApiResponse } from 'next';
import { getConversationalChat } from '@/app/actions/ai-flows';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const prompt =
      req.body?.prompt || 'Hello Molly. How are you feeling today?';
    const history = req.body?.history || [];
    const result = await getConversationalChat(prompt, history);
    res.status(200).json({ ok: true, result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
