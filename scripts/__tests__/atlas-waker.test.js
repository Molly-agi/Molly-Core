import { readFileSync } from 'fs';
import { join } from 'path';

describe('atlas-waker script config', () => {
  it('polls unread messages for atlas', () => {
    const script = readFileSync(
      join(process.cwd(), 'scripts', 'atlas-waker.js'),
      'utf8'
    );

    expect(script).toContain("const RECIPIENT = 'atlas';");
  });
});
