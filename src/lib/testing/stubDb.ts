import type { Db } from "../db";

const parseColumns = (columns: string): string[] =>
  columns.split(",").map((c) => c.trim()).filter(Boolean);

// Every existing test either injected rows directly or stubbed a Db that ignored the
// `columns` argument — which is exactly why `version_label` was read by the row mappers,
// never requested from Supabase, and arrived undefined with a full suite passing.
// This stub fails instead (§8).
function assertColumns(table: string, columns: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;
  const shape = new Set(Object.keys(rows[0]));
  for (const column of parseColumns(columns)) {
    if (column === "*") continue;
    if (!shape.has(column)) {
      throw new Error(
        `stubDb: query on "${table}" requested column "${column}", which the row shape does not have. ` +
        `Available: ${[...shape].join(", ")}`
      );
    }
  }
}

export function stubDb(tables: Record<string, Record<string, unknown>[]>): Db {
  return {
    async selectAll<T>(table: string, columns: string): Promise<T[]> {
      const rows = tables[table] ?? [];
      assertColumns(table, columns, rows);
      return rows as T[];
    },
    async selectOne<T>(table: string, columns: string, keyColumn: string, key: string): Promise<T | null> {
      const rows = tables[table] ?? [];
      assertColumns(table, columns, rows);
      return (rows.find((row) => row[keyColumn] === key) as T) ?? null;
    },
  };
}
