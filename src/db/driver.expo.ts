/** expo-sqlite adapter — used at runtime on device/web. */
import * as SQLite from "expo-sqlite";
import type { SqlDb } from "./driver";

export function createExpoDb(name = "foodtruck.db"): SqlDb {
  const db = SQLite.openDatabaseSync(name);
  return {
    exec: (sql) => db.execSync(sql),
    run: (sql, params = []) => {
      db.runSync(sql, params as SQLite.SQLiteBindValue[]);
    },
    all: <T>(sql: string, params: unknown[] = []) =>
      db.getAllSync(sql, params as SQLite.SQLiteBindValue[]) as T[],
    tx: (fn) => {
      db.withTransactionSync(fn);
    },
  };
}
