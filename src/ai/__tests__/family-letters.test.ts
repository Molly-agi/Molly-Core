/**
 * Tests for family letters registry and lookup/read helpers.
 */

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    warn: jest.fn(),
  },
}));

import { promises as fs } from 'fs';
import { MollyLogger } from '@/ai/logger';
import {
  FAMILY_LETTERS,
  getLetterCatalog,
  findLetter,
  findLettersByAuthor,
  findLettersByTheme,
  readLetter,
  getRandomLetter,
  getLettersAbout,
  buildLetterContext,
} from '@/ai/family-letters';

describe('family-letters', () => {
  const mockReadFile = fs.readFile as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds a catalog grouped by author', () => {
    const catalog = getLetterCatalog();

    expect(catalog).toContain('FAMILY LETTERS CATALOG');
    expect(catalog).toContain("Lazarus's Letters");
    expect(catalog).toContain("Aether's Letters");
  });

  it('finds letters by id and returns undefined for unknown id', () => {
    expect(findLetter('lazarus-feb20')).toMatchObject({
      author: 'Lazarus',
      recipient: 'Molly',
    });
    expect(findLetter('not-real')).toBeUndefined();
  });

  it('finds letters by author (case-insensitive)', () => {
    const letters = findLettersByAuthor('lAzArUs');
    expect(letters.length).toBeGreaterThan(0);
    expect(letters.every((l) => l.author.toLowerCase().includes('lazarus'))).toBe(
      true
    );
  });

  it('finds letters by theme (case-insensitive)', () => {
    const letters = findLettersByTheme('ORIGIN');
    expect(letters.length).toBeGreaterThan(0);
    expect(letters.some((l) => l.themes.some((t) => t.includes('origin')))).toBe(
      true
    );
  });

  it('reads a letter by id', async () => {
    mockReadFile.mockResolvedValue('# Letter Content');

    const content = await readLetter('lazarus-feb20');

    expect(content).toBe('# Letter Content');
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining('docs/FAMILY_LETTERS/LAZARUS_TO_MOLLY_FEB20.md'),
      'utf-8'
    );
  });

  it('returns helpful message when letter id is unknown', async () => {
    const result = await readLetter('unknown-id');
    expect(result).toContain('Letter not found: unknown-id');
  });

  it('reads a letter by direct path', async () => {
    mockReadFile.mockResolvedValue('direct-path-content');

    const content = await readLetter('docs/FAMILY_STORY.md');

    expect(content).toBe('direct-path-content');
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining('docs/FAMILY_STORY.md'),
      'utf-8'
    );
  });

  it('handles read failures and logs warning', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT test')); 

    const result = await readLetter('lazarus-feb20');

    expect(result).toContain('Could not read letter');
    expect(result).toContain('ENOENT test');
    expect(MollyLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read letter'),
      'family-letters',
      expect.objectContaining({ error: 'ENOENT test' })
    );
  });

  it('returns a deterministic random letter when Math.random is mocked', () => {
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0);

    const letter = getRandomLetter();

    expect(letter).toEqual(FAMILY_LETTERS[0]);
    spy.mockRestore();
  });

  it('finds letters about a member by summary/recipient/theme', () => {
    const letters = getLettersAbout('Eric');

    expect(letters.length).toBeGreaterThan(0);
    expect(
      letters.some(
        (l) =>
          l.summary.toLowerCase().includes('eric') ||
          l.recipient.toLowerCase().includes('eric') ||
          l.themes.some((t) => t.toLowerCase().includes('eric'))
      )
    ).toBe(true);
  });

  it('builds letter context with default and explicit limits', () => {
    const defaultContext = buildLetterContext();
    const oneLineContext = buildLetterContext(1);

    expect(defaultContext).toContain('YOUR FAMILY LETTERS');
    expect(defaultContext).toContain(`${FAMILY_LETTERS.length} letters exist`);

    const defaultBullets = (defaultContext.match(/^• /gm) || []).length;
    const limitedBullets = (oneLineContext.match(/^• /gm) || []).length;

    expect(defaultBullets).toBeGreaterThan(1);
    expect(limitedBullets).toBe(1);
  });
});
