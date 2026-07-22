import type { Catalog, CurriculumBlock, ProfRating, Program, ProgramSummary, Section } from "./types";

export interface CatalogRow { term: string; exported_at: string; sections: Section[]; warnings: string[] }
export interface ProgramRow { id: string; code: string; name: string; version: string; version_year: number; version_label: string; blocks: CurriculumBlock[] }
export interface RatingRow { name: string; rating: number; course_code: string | null; note: string | null; as_of: string | null }

export const rowToCatalog = (row: CatalogRow): Catalog => ({
  term: row.term, exportedAt: row.exported_at, sections: row.sections, warnings: row.warnings,
});
export const rowToProgram = (row: ProgramRow): Program => ({
  id: row.id, code: row.code, name: row.name, version: row.version,
  versionYear: row.version_year, versionLabel: row.version_label, blocks: row.blocks,
});
export const rowToSummary = (row: Omit<ProgramRow, "blocks">): ProgramSummary => ({
  id: row.id, code: row.code, name: row.name, version: row.version,
  versionYear: row.version_year, versionLabel: row.version_label,
});
export const rowToRating = (row: RatingRow): ProfRating => ({
  name: row.name,
  rating: row.rating,
  ...(row.course_code !== null ? { courseCode: row.course_code } : {}),
  ...(row.note !== null ? { note: row.note } : {}),
  ...(row.as_of !== null ? { asOf: row.as_of } : {}),
});
