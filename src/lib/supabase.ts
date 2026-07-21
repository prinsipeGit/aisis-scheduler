import { createClient } from "@supabase/supabase-js";
import project from "../../supabase/project.json";

// The ONLY network boundary for shared data. Tests inject a stub Db instead.
export interface Db {
  selectAll<T>(table: string, columns: string): Promise<T[]>;
  selectOne<T>(table: string, columns: string, keyColumn: string, key: string): Promise<T | null>;
}

const client = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? project.url,
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? project.anonKey,
  { auth: { persistSession: false } }
);

export const defaultDb: Db = {
  async selectAll<T>(table: string, columns: string): Promise<T[]> {
    const { data, error } = await client.from(table).select(columns);
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data ?? []) as T[];
  },
  async selectOne<T>(table: string, columns: string, keyColumn: string, key: string): Promise<T | null> {
    const { data, error } = await client.from(table).select(columns).eq(keyColumn, key).maybeSingle();
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data as T) ?? null;
  },
};
