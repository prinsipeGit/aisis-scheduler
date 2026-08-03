import type { CurriculumBlock, Program, ProgramSummary } from "./types";
import {
  defaultDb, rowToProgram, rowToSummary,
  PROGRAM_COLUMNS, PROGRAM_SUMMARY_COLUMNS,
  type Db, type ProgramRow,
} from "./db";

// The ONLY place curriculum data is read (§8).

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
  const rows = await db.selectAll<Omit<ProgramRow, "blocks">>("programs", PROGRAM_SUMMARY_COLUMNS);
  return rows.map(rowToSummary).sort((a, b) => a.code.localeCompare(b.code));
}

export async function loadProgram(id: string, db: Db = defaultDb): Promise<Program> {
  const row = await db.selectOne<ProgramRow>("programs", PROGRAM_COLUMNS, "id", id);
  if (row === null) throw new ProgramUnavailableError(id);
  return rowToProgram(row);
}
