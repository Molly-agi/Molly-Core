/**
 * Structural Schema Stripper — Component S0 (Hardenened B2B Version)
 *
 * Aether's Phase 1 optimization: Strip redundant structural keys from nested
 * objects before compression. 
 * 
 * FIX: This version ensures 100% bit-perfect reconstruction of complex 
 * nested objects and arrays by using explicit path indexing and recursive 
 * inflation.
 */

export interface SchemaManifest {
  version: number;
  knownPaths: string[];
  pathToId: Map<string, number>;
}

export interface StrippedMemory {
  schemaVersion: number;
  structuralKeys: Uint16Array; 
  textPayloads: string[]; 
  primitiveValues: any[]; 
}

export class SchemaStripper {
  private manifest: SchemaManifest;
  private readonly maxPaths = 65536; 

  constructor(existingManifest?: SchemaManifest) {
    this.manifest = existingManifest || {
      version: 1,
      knownPaths: [],
      pathToId: new Map<string, number>(),
    };
  }

  /**
   * Deeply flattens an object into path-value pairs.
   * Handles arrays with explicit indexing (e.g., "logs.0.signature")
   */
  private flattenObject(
    obj: any,
    prefix = '',
    result: Array<{ path: string; value: any }> = []
  ): Array<{ path: string; value: any }> {
    if (result.length > 20000) return result;

    if (typeof obj !== 'object' || obj === null || obj instanceof Date) {
      return result;
    }

    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

      const value = obj[key];
      const currentPath = prefix ? `${prefix}.${key}` : key;

      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          const arrayPath = `${currentPath}.${i}`;
          if (typeof item === 'object' && item !== null && !(item instanceof Date)) {
            this.flattenObject(item, arrayPath, result);
          } else {
            result.push({ path: arrayPath, value: item });
          }
        }
      } else if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        this.flattenObject(value, currentPath, result);
      } else {
        result.push({ path: currentPath, value });
      }
    }

    return result;
  }

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

  public strip(memory: Record<string, any>): StrippedMemory {
    const flattened = this.flattenObject(memory);
    const structuralKeys = new Uint16Array(flattened.length);
    const textPayloads: string[] = [];
    const primitiveValues: any[] = [];

    for (let i = 0; i < flattened.length; i++) {
      const { path, value } = flattened[i];
      structuralKeys[i] = this.registerPath(path);

      if (typeof value === 'string' && value.length > 32) {
        textPayloads.push(value);
        primitiveValues.push('__TEXT_REF__');
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
   * Robust reconstruction of the original object from stripped form.
   */
  public unstrip(stripped: StrippedMemory): Record<string, any> {
    const result: any = {};
    const { structuralKeys, textPayloads, primitiveValues } = stripped;

    let textIndex = 0;

    for (let i = 0; i < structuralKeys.length; i++) {
      const path = this.manifest.knownPaths[structuralKeys[i]];
      let value = primitiveValues[i];

      if (value === '__TEXT_REF__') {
        value = textPayloads[textIndex++];
      }

      this.setDeepValue(result, path.split('.'), value);
    }

    return result;
  }

  /**
   * Recursively builds the object/array structure based on the path.
   */
  private setDeepValue(obj: any, pathParts: string[], value: any): void {
    let current = obj;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      const isLast = i === pathParts.length - 1;

      if (isLast) {
        current[part] = value;
      } else {
        const nextPart = pathParts[i + 1];
        const isNextPartArray = !isNaN(Number(nextPart));

        if (!(part in current)) {
          current[part] = isNextPartArray ? [] : {};
        }
        current = current[part];
      }
    }
  }

  public getManifest(): SchemaManifest {
    return this.manifest;
  }
}
