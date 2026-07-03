/**
 * Minimal synchronous SQL driver interface. Runtime uses expo-sqlite
 * (driver.expo.ts); tests use bun:sqlite (driver.bun.ts). The repository only
 * depends on this interface, never on a concrete engine.
 */
export interface SqlDb {
  /** Execute one or more statements with no params/result. */
  exec(sql: string): void;
  /** Run a single statement with positional params. */
  run(sql: string, params?: unknown[]): void;
  /** Query rows with positional params. */
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  /** Run `fn` inside a single transaction (atomic commit/rollback). */
  tx(fn: () => void): void;
}
