import type { CurriculumBlock, Program, ProgramSummary } from "./types";
import amdsc2024 from "../../data/curricula/BS-AMDSc-M-DSc-2024.json";
import { defaultDb, type Db } from "./supabase";
import { rowToProgram, rowToSummary, type ProgramRow } from "./rows";

// This module is the ONLY place curriculum JSON is read. Swapping the bundled
// files for Supabase later means changing only this file (spec §3, §7).

const PROGRAMS: Program[] = [amdsc2024 as Program];

// ---- Sync API (legacy, bundled JSON) ----

export function getPrograms(): ProgramSummary[] {
  return PROGRAMS.map(({ id, code, name, versionYear }) => ({ id, code, name, versionYear }));
}

export function getCurriculum(programId: string): Program | undefined {
  return PROGRAMS.find((p) => p.id === programId);
}

export function getBlock(program: Program, blockKey: string): CurriculumBlock | undefined {
  return program.blocks.find((b) => b.key === blockKey);
}

// ---- Async API (Supabase-backed) ----

export class ProgramUnavailableError extends Error {
  id: string;
  constructor(id: string) {
    super(`No curriculum for program ${id}. Run: npm run scrape:curricula && npm run push:data`);
    this.name = "ProgramUnavailableError";
    this.id = id;
  }
}

export async function getProgramsAsync(db: Db = defaultDb): Promise<ProgramSummary[]> {
  const rows = await db.selectAll<Omit<ProgramRow, "blocks">>("programs", "id, code, name, version_year");
  return rows.map(rowToSummary).sort((a, b) => a.code.localeCompare(b.code));
}

export async function loadProgram(id: string, db: Db = defaultDb): Promise<Program> {
  const row = await db.selectOne<ProgramRow>("programs", "id, code, name, version_year, blocks", "id", id);
  if (row === null) throw new ProgramUnavailableError(id);
  return rowToProgram(row);
}
