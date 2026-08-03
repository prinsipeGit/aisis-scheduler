import type { Catalog, Section, Slot } from "./types";
import { canonicalCourseCode } from "./course-code";

export interface AliasFile {
  aliases: Record<string, string[]>;
  pairs: [string, string][];
  preAssigned: string[];
}

// A catalog code is a variant of `base` when it extends base with a suffix beginning
// "." or "(" — PHILO 11 → PHILO 11.03, NSTP 11 → NSTP 11(CWTS). Deliberately narrow, so
// MATH 10 does not swallow MATH 100 (remainder "0" starts with neither).
function isVariantOf(code: string, base: string): boolean {
  const c = canonicalCourseCode(code);
  const b = canonicalCourseCode(base);
  if (!c.startsWith(b)) return false;
  const rest = c.slice(b.length);
  return rest.startsWith(".") || rest.startsWith("(");
}

function matches(code: string, base: string): boolean {
  return canonicalCourseCode(code) === canonicalCourseCode(base) || isVariantOf(code, base);
}

// Alias keys are AISIS requirement categories where the slot has one, and catNo otherwise.
// Categories are stable where catNos drift between programs — NP1 is "NSTP 11" in 63
// programs and "NSTP 1" in 6 — so the category is tried first (§5.1).
export function aliasKeyFor(slot: Slot, file: AliasFile): string | null {
  if (slot.category && file.aliases[slot.category]) return slot.category;
  const target = slot.requirement;
  if (target && file.aliases[target]) return target;
  return null;
}

export function isPreAssigned(slot: Slot, file: AliasFile): boolean {
  const keys = [slot.category, slot.requirement].filter(Boolean) as string[];
  return keys.some((k) => file.preAssigned.includes(k));
}

export function acceptableCodes(slot: Slot, catalog: Catalog, file: AliasFile): string[] {
  const codes = [...new Set(catalog.sections.map((s) => s.courseCode))];

  // A narrowed slot names a concrete catalog code; it must not re-expand through its
  // category, or picking Tai Chi would give back all 23 PATHFit activities (§5.2).
  if (slot.chosen !== null) {
    const chosen = canonicalCourseCode(slot.chosen);
    return codes.filter((c) => canonicalCourseCode(c) === chosen).sort();
  }

  const target = slot.requirement;
  if (!target) return [];

  // The three rules are a union, not a precedence chain: a code matching more than one
  // must not shadow the others (§5).
  const out = new Set<string>();
  for (const code of codes) if (matches(code, target)) out.add(code);
  const key = aliasKeyFor(slot, file);
  if (key) {
    for (const prefix of file.aliases[key]) {
      for (const code of codes) if (matches(code, prefix)) out.add(code);
    }
  }
  return [...out].sort();
}

export function sectionsFor(slot: Slot, catalog: Catalog, file: AliasFile): Section[] {
  const codes = new Set(acceptableCodes(slot, catalog, file).map(canonicalCourseCode));
  return catalog.sections.filter((s) => codes.has(canonicalCourseCode(s.courseCode)));
}
