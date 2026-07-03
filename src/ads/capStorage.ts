/**
 * Frequency-cap storage — default/web. Uses localStorage when available (so the
 * cap survives reloads on web), otherwise a no-op that always reads null. Native
 * resolves capStorage.native.ts (AsyncStorage) via Metro.
 */
import type { CapStorage } from "./frequencyCap";

const ls =
  typeof globalThis !== "undefined" && globalThis.localStorage
    ? globalThis.localStorage
    : null;

export const capStorage: CapStorage = {
  get: async (key) => (ls ? ls.getItem(key) : null),
  set: async (key, value) => {
    ls?.setItem(key, value);
  },
};
