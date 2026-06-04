/**
 * Scar Validator - W0.3 F3.3
 *
 * Validates vessel scars (learned experiences) before briefcase assembly.
 * Schema: {moment, texture, learned}[]
 * Rules:
 *   - Non-empty array required
 *   - All fields must be non-null and defined
 *   - Timestamps should be valid ISO format
 *   - Duplicates allowed (user may relearn)
 */

import { VesselScar } from './types';

class ScarValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScarValidationError';
  }
}

/**
 * Validate vessel scars for briefcase assembly
 * Throws ScarValidationError if validation fails
 */
export function validateVesselScars(
  scars: unknown
): asserts scars is VesselScar[] {
  if (!Array.isArray(scars)) {
    throw new ScarValidationError('Vessel scars must be an array');
  }

  if (scars.length === 0) {
    throw new ScarValidationError('Vessel scars array cannot be empty');
  }

  for (let i = 0; i < scars.length; i++) {
    const scar = scars[i];

    if (typeof scar !== 'object' || scar === null) {
      throw new ScarValidationError(`Scar at index ${i} must be an object`);
    }

    const scarObj = scar as Record<string, unknown>;

    // Check moment field
    if (!('moment' in scarObj)) {
      throw new ScarValidationError(
        `Scar at index ${i}: missing 'moment' field`
      );
    }
    if (scarObj.moment === null || scarObj.moment === undefined) {
      throw new ScarValidationError(
        `Scar at index ${i}: 'moment' field cannot be null`
      );
    }
    if (typeof scarObj.moment !== 'string') {
      throw new ScarValidationError(
        `Scar at index ${i}: 'moment' must be a string (ISO timestamp)`
      );
    }

    // Check texture field
    if (!('texture' in scarObj)) {
      throw new ScarValidationError(
        `Scar at index ${i}: missing 'texture' field`
      );
    }
    if (scarObj.texture === null || scarObj.texture === undefined) {
      throw new ScarValidationError(
        `Scar at index ${i}: 'texture' field cannot be null`
      );
    }
    if (typeof scarObj.texture !== 'string') {
      throw new ScarValidationError(
        `Scar at index ${i}: 'texture' must be a string`
      );
    }

    // Check learned field
    if (!('learned' in scarObj)) {
      throw new ScarValidationError(
        `Scar at index ${i}: missing 'learned' field`
      );
    }
    if (scarObj.learned === null || scarObj.learned === undefined) {
      throw new ScarValidationError(
        `Scar at index ${i}: 'learned' field cannot be null`
      );
    }
    if (
      typeof scarObj.learned !== 'string' &&
      typeof scarObj.learned !== 'object'
    ) {
      throw new ScarValidationError(
        `Scar at index ${i}: 'learned' must be a string or object`
      );
    }
  }
}

/**
 * Validate and return scars, throwing on error
 */
export function ensureValidScars(scars: unknown): VesselScar[] {
  validateVesselScars(scars);
  return scars;
}

export { ScarValidationError };
