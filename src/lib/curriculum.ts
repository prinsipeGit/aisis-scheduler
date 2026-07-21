import type { CurriculumBlock, Program, ProgramSummary } from "./types";
import { defaultDb, type Db } from "./supabase";
import { rowToProgram, rowToSummary, type ProgramRow } from "./rows";

// This module is the ONLY place curriculum data is read; it reads from
// Supabase via the injectable Db boundary (spec §3, §7).

export function getBlock(program: Program, blockKey: string): CurriculumBlock | undefined {
  return program.blocks.find((b) => b.key === blockKey);
}

export class ProgramUnavailableError extends Error {
  id: string;
  constructor(id: string) {
    super(`No curriculum for program ${id}. Run: npm run scrape:curricula && npm run push:data`);
    this.name = "ProgramUnavailableError";
    this.id = id;
  }
}

export async function getPrograms(db: Db = defaultDb): Promise<ProgramSummary[]> {
  const rows = await db.selectAll<Omit<ProgramRow, "blocks">>("programs", "id, code, name, version_year");
  return rows.map(rowToSummary).sort((a, b) => a.code.localeCompare(b.code));
}

export async function loadProgram(id: string, db: Db = defaultDb): Promise<Program> {
  const row = await db.selectOne<ProgramRow>("programs", "id, code, name, version_year, blocks", "id", id);
  if (row === null) throw new ProgramUnavailableError(id);
  return rowToProgram(row);
}
