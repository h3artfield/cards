import {
  canonicalMultisetKey,
  isSubmultiset,
  parseCanonicalMultisetKey,
  type Multiset,
} from "./multiset";

export type MinimalInsertResult = "inserted" | "discarded_superset" | "replaced_supersets";

/**
 * Minimal Set of Multisets (antichain).
 * Independently implemented from the Spellbook MSM ADT description.
 */
export class MinimalMultisetSet {
  private readonly members = new Map<string, Multiset>();

  get size(): number {
    return this.members.size;
  }

  keys(): string[] {
    return [...this.members.keys()].sort();
  }

  values(): Multiset[] {
    return this.keys().map((k) => this.members.get(k)!);
  }

  has(ms: Multiset): boolean {
    return this.members.has(canonicalMultisetKey(ms));
  }

  get(key: string): Multiset | undefined {
    return this.members.get(key);
  }

  insert(candidate: Multiset): MinimalInsertResult {
    const key = canonicalMultisetKey(candidate);
    if (!key) return "discarded_superset";
    if (this.members.has(key)) return "discarded_superset";

    for (const existing of this.members.values()) {
      if (isSubmultiset(existing, candidate)) return "discarded_superset";
    }

    let removed = false;
    for (const [existingKey, existing] of [...this.members.entries()]) {
      if (isSubmultiset(candidate, existing)) {
        this.members.delete(existingKey);
        removed = true;
      }
    }
    this.members.set(key, new Map(candidate));
    return removed ? "replaced_supersets" : "inserted";
  }

  union(other: MinimalMultisetSet): MinimalMultisetSet {
    const out = new MinimalMultisetSet();
    for (const ms of this.values()) out.insert(ms);
    for (const ms of other.values()) out.insert(ms);
    return out;
  }

  static fromKeys(keys: string[]): MinimalMultisetSet {
    const out = new MinimalMultisetSet();
    for (const key of keys) out.insert(parseCanonicalMultisetKey(key));
    return out;
  }
}
