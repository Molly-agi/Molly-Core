import { NextRequest } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// GET /api/skills/content?filePath=...
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('filePath');
  if (!filePath) {
    return Response.json(
      { error: 'Missing filePath parameter' },
      { status: 400 }
    );
  }
  // Security: Only allow files under src/skills/fixtures
  const allowedRoot = path.resolve(process.cwd(), 'src/skills/fixtures');
  const absPath = path.resolve(filePath);
  if (!absPath.startsWith(allowedRoot)) {
    return Response.json({ error: 'Access denied' }, { status: 403 });
  }
  try {
    const content = await fs.readFile(absPath, 'utf8');
    return Response.json({ content });
  } catch (error: unknown) {
    let message = 'Failed to read file';
    if (error instanceof Error) message = error.message;
    return Response.json({ error: message }, { status: 500 });
  }
}
