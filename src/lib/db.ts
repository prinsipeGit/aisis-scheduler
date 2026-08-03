import { createClient } from "@supabase/supabase-js";
import project from "../../supabase/project.json";
import type { Catalog, CurriculumBlock, ProfRating, Program, ProgramSummary, Section } from "./types";

// The ONLY network boundary for shared data. Tests inject stubDb instead.
export interface Db {
  selectAll<T>(table: string, columns: string): Promise<T[]>;
  selectOne<T>(table: string, columns: string, keyColumn: string, key: string): Promise<T | null>;
}

export interface CatalogRow { term: string; exported_at: string; sections: Section[]; warnings: string[] }
export interface ProgramRow { id: string; code: string; name: string; version: string; version_year: number; version_label: string; blocks: CurriculumBlock[] }
export interface RatingRow { name: string; rating: number; course_code: string | null; note: string | null; as_of: string | null }

// Column lists live beside the row types they populate, so the two cannot drift apart
// unnoticed — the omission that made versionLabel undefined (§8).
export const CATALOG_COLUMNS = "term, exported_at, sections, warnings";
export const PROGRAM_SUMMARY_COLUMNS = "id, code, name, version, version_year, version_label";
export const PROGRAM_COLUMNS = `${PROGRAM_SUMMARY_COLUMNS}, blocks`;
export const RATING_COLUMNS = "name, rating, course_code, note, as_of";

export const rowToCatalog = (row: CatalogRow): Catalog => ({
  term: row.term, exportedAt: row.exported_at, sections: row.sections, warnings: row.warnings,
});
export const rowToSummary = (row: Omit<ProgramRow, "blocks">): ProgramSummary => ({
  id: row.id, code: row.code, name: row.name, version: row.version,
  versionYear: row.version_year, versionLabel: row.version_label,
});
export const rowToProgram = (row: ProgramRow): Program => ({
  ...rowToSummary(row), blocks: row.blocks,
});
export const rowToRating = (row: RatingRow): ProfRating => ({
  name: row.name,
  rating: row.rating,
  ...(row.course_code !== null ? { courseCode: row.course_code } : {}),
  ...(row.note !== null ? { note: row.note } : {}),
  ...(row.as_of !== null ? { asOf: row.as_of } : {}),
});

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
