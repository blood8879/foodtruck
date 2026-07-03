/** bun:sqlite adapter — used only by `bun test`. Not imported by the app. */
import { Database } from "bun:sqlite";
import type { SqlDb } from "./driver";

export function createBunDb(path = ":memory:"): SqlDb {
  const db = new Database(path);
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => {
      db.run(sql, params as never[]);
    },
    all: <T>(sql: string, params: unknown[] = []) =>
      db.query(sql).all(...(params as never[])) as T[],
    tx: (fn) => {
      db.transaction(fn)();
    },
  };
}
