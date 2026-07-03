import type { Store } from "./contract";
import { MemoryStore } from "./memoryStore";

/**
 * Default/base + web + tsc store factory: pure-JS MemoryStore (no native deps).
 * Native platforms resolve createStore.native.ts (expo-sqlite) instead.
 */
export function createStore(): Store {
  return new MemoryStore();
}
