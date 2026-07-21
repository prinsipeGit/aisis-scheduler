import type { CurriculumBlock, Program, ProgramSummary } from "./types";
import amdsc2024 from "../data/curriculum-BS-AMDSc-2024.json";

// This module is the ONLY place curriculum JSON is read. Swapping the bundled
// files for Supabase later means changing only this file (spec §3, §7).

const PROGRAMS: Program[] = [amdsc2024 as Program];

export function getPrograms(): ProgramSummary[] {
  return PROGRAMS.map(({ id, code, name, versionYear }) => ({ id, code, name, versionYear }));
}

export function getCurriculum(programId: string): Program | undefined {
  return PROGRAMS.find((p) => p.id === programId);
}

export function getBlock(program: Program, blockKey: string): CurriculumBlock | undefined {
  return program.blocks.find((b) => b.key === blockKey);
}
