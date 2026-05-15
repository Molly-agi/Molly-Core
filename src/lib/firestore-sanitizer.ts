/**
 * Recursive sanitizer for Firestore-incompatible data structures.
 *
 * Firestore rejects nested arrays, Map/Set objects, undefined values,
 * and raw Date instances. This module normalizes all of these at the
 * write chokepoint so individual modules don't need to care.
 */

function sanitizeValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'object') return val;

  if (val instanceof Date) return val.toISOString();

  if (val instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of val) obj[String(k)] = sanitizeValue(v);
    return obj;
  }

  if (val instanceof Set) return Array.from(val).map(sanitizeValue);

  if (Array.isArray(val)) {
    // Detect Map.entries() pattern: array of 2-element tuples with string keys
    if (
      val.length > 0 &&
      val.every(
        (item) =>
          Array.isArray(item) &&
          item.length === 2 &&
          typeof item[0] === 'string'
      )
    ) {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of val) obj[k as string] = sanitizeValue(v);
      return obj;
    }

    return val.map((item) => {
      if (Array.isArray(item)) return JSON.stringify(item);
      return sanitizeValue(item);
    });
  }

  // Plain object — recurse
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (v !== undefined) result[k] = sanitizeValue(v);
  }
  return result;
}

export function sanitizeForFirestore(
  data: Record<string, unknown>
): Record<string, unknown> {
  return sanitizeValue(data) as Record<string, unknown>;
}
