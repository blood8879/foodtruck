import type { Store } from "./contract";
import { createExpoDb } from "./driver.expo";
import { Repository } from "./store";

/** Native (iOS/Android) store factory: durable SQLite via expo-sqlite. */
export function createStore(): Store {
  const repo = new Repository(createExpoDb());
  return repo;
}
