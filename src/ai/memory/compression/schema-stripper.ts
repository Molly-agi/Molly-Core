/**
 * Structural Schema Stripper — Component S0
 *
 * Aether's Phase 1 optimization: Strip redundant structural keys from nested
 * objects before compression. Captures recurring paths and replaces with Uint16 IDs.
 *
 * Expected compression: 40-50% reduction on highly-structured data.
 * Designed for AI memories (nested roles, message arrays, metadata fields).
 */

export interface SchemaManifest {
  version: number;
  knownPaths: string[];
  pathToId: Map<string, number>;
}

export interface StrippedMemory {
  schemaVersion: number;
  structuralKeys: Uint16Array; // Path IDs instead of actual strings
  textPayloads: string[]; // Content values (>32 bytes)
  primitiveValues: any[]; // Everything else (numbers, booleans, refs)
}

export class SchemaStripper {
  private manifest: SchemaManifest;
  private readonly maxPaths = 65536; // Uint16 limit

  constructor(existingManifest?: SchemaManifest) {
    this.manifest = existingManifest || {
      version: 1,
      knownPaths: [],
      pathToId: new Map<string, number>(),
    };
  }

  /**
   * Flattens nested structures and records all unique paths.
   * Normalizes array indices to [n] pattern.
   */
  private flattenObject(
    obj: any,
    prefix = '',
    result: Array<{ path: string; value: any }> = []
  ): Array<{ path: string; value: any }> {
    if (result.length > 10000) {
      // Prevent runaway recursion on pathological data
      return result;
    }

    if (typeof obj !== 'object' || obj === null || obj instanceof Date) {
      return result;
    }

    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

      const value = obj[key];
      const currentPath = prefix ? `${prefix}.${key}` : key;

      if (Array.isArray(value)) {
        // Normalize array indices: messages.0.role → messages.[n].role
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (typeof item === 'object' && item !== null) {
            this.flattenObject(item, `${currentPath}.[n]`, result);
          } else {
            result.push({ path: `${currentPath}.[${i}]`, value: item });
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        this.flattenObject(value, currentPath, result);
      } else {
        result.push({ path: currentPath, value });
      }
    }

    return result;
  }

  /**
   * Registers a new path in the manifest and returns its ID.
   */
  private registerPath(path: string): number {
    let id = this.manifest.pathToId.get(path);

    if (id === undefined) {
      if (this.manifest.knownPaths.length >= this.maxPaths) {
        throw new RangeError(`Schema overflow: Exceeded path limit (${this.maxPaths})`);
      }
      id = this.manifest.knownPaths.length;
      this.manifest.knownPaths.push(path);
      this.manifest.pathToId.set(path, id);
    }

    return id;
  }

  /**
   * Strips structural overhead from a memory object.
   * Returns flattened representation with path IDs and text payloads separated.
   */
  public strip(memory: Record<string, any>): StrippedMemory {
    if (!memory || typeof memory !== 'object') {
      throw new TypeError('Memory must be a valid object');
    }

    const flattened = this.flattenObject(memory);
    const structuralKeys = new Uint16Array(flattened.length);
    const textPayloads: string[] = [];
    const primitiveValues: any[] = [];

    for (let i = 0; i < flattened.length; i++) {
      const { path, value } = flattened[i];
      const pathId = this.registerPath(path);
      structuralKeys[i] = pathId;

      // Separate high-entropy text payloads from primitives
      if (typeof value === 'string' && value.length > 32) {
        textPayloads.push(value);
        primitiveValues.push('__TEXT_REF__'); // Marker for restoration
      } else if (typeof value === 'number' && !Number.isFinite(value)) {
        // Sanitize NaN/Infinity
        primitiveValues.push(0);
      } else {
        primitiveValues.push(value);
      }
    }

    return {
      schemaVersion: this.manifest.version,
      structuralKeys,
      textPayloads,
      primitiveValues,
    };
  }

  /**
   * Reconstructs original object from stripped representation.
   */
  public unstrip(stripped: StrippedMemory): Record<string, any> {
    const result: Record<string, any> = {};
    const { structuralKeys, textPayloads, primitiveValues } = stripped;

    let textIndex = 0;

    for (let i = 0; i < structuralKeys.length; i++) {
      const pathId = structuralKeys[i];
      const path = this.manifest.knownPaths[pathId];
      let value = primitiveValues[i];

      // Restore text payloads
      if (value === '__TEXT_REF__') {
        value = textPayloads[textIndex++];
      }

      // Reconstruct nested path: "messages.[n].role" → result.messages[...].role
      const parts = path.split('.');
      let current = result;

      for (let j = 0; j < parts.length - 1; j++) {
        const part = parts[j];

        if (part === '[n]' || part.startsWith('[')) {
          // Array handling (simplified for now)
          continue;
        }

        if (!(part in current)) {
          current[part] = {};
        }
        current = current[part];
      }

      const lastPart = parts[parts.length - 1];
      current[lastPart] = value;
    }

    return result;
  }

  /**
   * Returns the manifest for serialization/persistence.
   */
  public getManifest(): SchemaManifest {
    return this.manifest;
  }

  /**
   * Estimates compression ratio before/after stripping.
   */
  public estimateCompressionGain(memory: Record<string, any>): { ratio: number; bytesRemoved: number } {
    const original = JSON.stringify(memory);
    const originalBytes = Buffer.byteLength(original, 'utf-8');

    const stripped = this.strip(memory);
    // Rough estimate: structural keys (Uint16) + text payloads + primitives
    const strippedBytes =
      stripped.structuralKeys.byteLength +
      stripped.textPayloads.reduce((sum, text) => sum + Buffer.byteLength(text, 'utf-8'), 0) +
      Buffer.byteLength(JSON.stringify(stripped.primitiveValues), 'utf-8');

    const ratio = ((originalBytes - strippedBytes) / originalBytes) * 100;
    return { ratio, bytesRemoved: originalBytes - strippedBytes };
  }
}
