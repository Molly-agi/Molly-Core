import { describe, it, expect } from '@jest/globals';
import { validateVesselScars } from '../scar-validator';

describe('W0.3-F3.3: Scar Validator Schema', () => {
  it('should accept valid scar array', () => {
    const scars = [
      {
        moment: '2026-06-04T08:00:00Z',
        texture: 'learning-moment-abc123',
        learned: { insight: 'understood the pattern' },
      },
    ];

    expect(() => validateVesselScars(scars)).not.toThrow();
  });

  it('should accept multiple valid scars', () => {
    const scars = [
      {
        moment: '2026-06-04T08:00:00Z',
        texture: 'learning-abc',
        learned: 'first learning',
      },
      {
        moment: '2026-06-04T09:00:00Z',
        texture: 'learning-def',
        learned: 'second learning',
      },
    ];

    expect(() => validateVesselScars(scars)).not.toThrow();
  });

  it('should reject empty scar array', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scars: any[] = [];
    expect(() => validateVesselScars(scars)).toThrow();
  });

  it('should reject scar with missing moment field', () => {
    const scars = [
      {
        texture: 'learning-abc',
        learned: 'something',
        // missing moment
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateVesselScars(scars as any)).toThrow();
  });

  it('should reject scar with missing texture field', () => {
    const scars = [
      {
        moment: '2026-06-04T08:00:00Z',
        learned: 'something',
        // missing texture
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateVesselScars(scars as any)).toThrow();
  });

  it('should reject scar with missing learned field', () => {
    const scars = [
      {
        moment: '2026-06-04T08:00:00Z',
        texture: 'learning-abc',
        // missing learned
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateVesselScars(scars as any)).toThrow();
  });

  it('should reject scar with null moment', () => {
    const scars = [
      {
        moment: null,
        texture: 'learning-abc',
        learned: 'something',
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateVesselScars(scars as any)).toThrow();
  });

  it('should reject scar with null texture', () => {
    const scars = [
      {
        moment: '2026-06-04T08:00:00Z',
        texture: null,
        learned: 'something',
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateVesselScars(scars as any)).toThrow();
  });

  it('should reject scar with null learned', () => {
    const scars = [
      {
        moment: '2026-06-04T08:00:00Z',
        texture: 'learning-abc',
        learned: null,
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateVesselScars(scars as any)).toThrow();
  });

  it('should accept duplicate scars (user may relearn)', () => {
    const scars = [
      {
        moment: '2026-06-04T08:00:00Z',
        texture: 'learning-abc',
        learned: 'something',
      },
      {
        moment: '2026-06-04T08:00:00Z',
        texture: 'learning-abc',
        learned: 'something',
      },
    ];

    expect(() => validateVesselScars(scars)).not.toThrow();
  });

  it('should validate scar with string learned field', () => {
    const scars = [
      {
        moment: '2026-06-04T08:00:00Z',
        texture: 'learning-abc',
        learned: 'integrated string',
      },
    ];

    expect(() => validateVesselScars(scars)).not.toThrow();
  });

  it('should validate scar with object learned field', () => {
    const scars = [
      {
        moment: '2026-06-04T08:00:00Z',
        texture: 'learning-abc',
        learned: { complex: 'object', with: ['nested', 'data'] },
      },
    ];

    expect(() => validateVesselScars(scars)).not.toThrow();
  });
});
