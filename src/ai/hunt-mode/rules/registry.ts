import type { HuntRule } from './types';

export class RuleRegistry {
  private readonly rules = new Map<string, HuntRule>();

  register(rule: HuntRule): void {
    this.rules.set(rule.id, rule);
  }

  unregister(id: string): boolean {
    return this.rules.delete(id);
  }

  get(id: string): HuntRule | undefined {
    return this.rules.get(id);
  }

  list(): HuntRule[] {
    return Array.from(this.rules.values());
  }

  size(): number {
    return this.rules.size;
  }

  clear(): void {
    this.rules.clear();
  }
}
