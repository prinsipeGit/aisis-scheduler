import type { Catalog, CurriculumBlock, UserState } from "./types";

export interface RequirementRow {
  slotId: string;
  catNo: string;              // as printed in the curriculum
  title: string;
  units: number;
  isElective: boolean;
  electiveDept?: string;
  filledWith?: string;        // concrete course chosen for an elective slot
  courseCode: string | null;  // resolved code, or null for an unfilled elective
  selected: boolean;
  offeredSections: number;    // sections in the chosen term's catalog
}

function countSections(catalog: Catalog, courseCode: string | null): number {
  if (!courseCode) return 0;
  return catalog.sections.filter((s) => s.courseCode === courseCode).length;
}

export function seedRequiredCourses(block: CurriculumBlock): string[] {
  return block.entries.filter((e) => !e.isElective).map((e) => e.catNo);
}

export function buildRequirementRows(
  block: CurriculumBlock,
  state: UserState,
  catalog: Catalog
): RequirementRow[] {
  return block.entries.map((entry) => {
    const filledWith = entry.isElective ? state.electiveFills[entry.slotId] : undefined;
    const courseCode = entry.isElective ? (filledWith ?? null) : entry.catNo;
    // Non-elective slots are seeded into requiredCourses and can be toggled off there
    // (underload). Elective slots are never seeded there — filling the slot IS the
    // selection action, so "selected" just means "resolved to a concrete course."
    const selected = entry.isElective
      ? courseCode !== null
      : state.requiredCourses.includes(entry.catNo);
    return {
      slotId: entry.slotId,
      catNo: entry.catNo,
      title: entry.title,
      units: entry.units,
      isElective: entry.isElective,
      electiveDept: entry.electiveDept,
      filledWith,
      courseCode,
      selected,
      offeredSections: countSections(catalog, courseCode),
    };
  });
}

export function extraCourseRows(
  state: UserState,
  block: CurriculumBlock,
  catalog: Catalog
): RequirementRow[] {
  const fromBlock = new Set<string>();
  for (const entry of block.entries) {
    if (!entry.isElective) fromBlock.add(entry.catNo);
    const fill = state.electiveFills[entry.slotId];
    if (fill) fromBlock.add(fill);
  }
  return state.requiredCourses
    .filter((code) => !fromBlock.has(code))
    .map((code) => {
      const section = catalog.sections.find((s) => s.courseCode === code);
      return {
        slotId: `extra#${code}`,
        catNo: code,
        title: section?.title ?? code,
        units: section?.units ?? 0,
        isElective: false,
        courseCode: code,
        selected: true,
        offeredSections: countSections(catalog, code),
      };
    });
}

export function resolveCourseCodes(rows: RequirementRow[]): string[] {
  const codes: string[] = [];
  for (const row of rows) {
    if (!row.selected || row.courseCode === null || row.offeredSections === 0) continue;
    if (!codes.includes(row.courseCode)) codes.push(row.courseCode);
  }
  return codes;
}

export function totalUnits(rows: RequirementRow[]): number {
  return rows.reduce((sum, row) => (row.selected ? sum + row.units : sum), 0);
}
