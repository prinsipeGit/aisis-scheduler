import type { Diagnostics, Schedule, SearchSummary, Section, UserState } from "./types";
import { sectionKey } from "./types";
import { overlaps } from "./time";
import { subjectPrefix } from "./course-code";
import type { ResolvedSlot } from "./slots";

export const MAX_SCHEDULES = 500; // browser-responsiveness guard; truncation is reported

export interface GenerateResult {
  schedules: Schedule[];
  diagnostics: Diagnostics | null;
  search: SearchSummary;
}

function sectionsConflict(a: Section, b: Section): boolean {
  for (const ma of a.meetings) {
    for (const mb of b.meetings) {
      if (overlaps(ma, mb)) return true;
    }
  }
  return false;
}

function passesFilters(s: Section, state: UserState): boolean {
  // A malformed time is not a legitimate TBA. Including it would create falsely
  // conflict-free schedules until a human fixes the source row.
  if (s.timeStatus === "parse-error") return false;
  const key = sectionKey(s);
  if (state.fullSections.includes(key)) return false;
  if (state.preferences.excludedSections.includes(key)) return false;
  const { earliestStart, latestEnd, protectedBlocks } = state.preferences;
  for (const meeting of s.meetings) {
    if (earliestStart !== undefined && meeting.start < earliestStart) return false;
    if (latestEnd !== undefined && meeting.end > latestEnd) return false;
    for (const block of protectedBlocks) {
      if (overlaps(meeting, block)) return false;
    }
  }
  return true;
}

export function generate(resolved: ResolvedSlot[], state: UserState): GenerateResult {
  // Only slots the student included AND that resolved to candidates take part. An
  // unfilled elective, a course with no offerings, and an unpinned pre-assigned course are
  // all excluded rather than blocking every other course (§5.3, §5.6).
  const active = resolved.filter((r) => r.slot.included && r.status === "ok");

  const perSlot: Diagnostics["perSlot"] = [];
  const candidates = new Map<string, Section[]>();
  for (const r of active) {
    const locked = r.sections.filter(
      (s) => s.timeStatus !== "parse-error" && state.lockedSections.includes(sectionKey(s))
    );
    // A locked section pins the slot and bypasses all filters.
    const filtered = locked.length > 0 ? locked : r.sections.filter((s) => passesFilters(s, state));
    candidates.set(r.slot.id, filtered);
    perSlot.push({
      id: r.slot.id, label: r.slot.label,
      total: r.sections.length, afterFilters: filtered.length,
    });
  }

  // Fewest candidates first: prunes the search tree earliest.
  const order = [...active].sort(
    (a, b) => candidates.get(a.slot.id)!.length - candidates.get(b.slot.id)!.length
  );

  const schedules: Schedule[] = [];
  const current: Section[] = [];
  const chosenBySlot = new Map<string, Section>();

  // A paired slot must take a section from the same subject as its partner (§5.4).
  // Checked as each section is placed, so invalid lecture/lab pairs are pruned.
  const pairingHolds = (r: ResolvedSlot, s: Section): boolean => {
    const partnerId = r.slot.pairedWith;
    if (!partnerId) return true;
    const partner = chosenBySlot.get(partnerId);
    if (!partner) return true; // partner not placed yet; it will check against us
    return subjectPrefix(partner.courseCode) === subjectPrefix(s.courseCode);
  };

  const walk = (i: number): void => {
    // Find one extra so an exact 500-result search is not mislabeled as truncated.
    if (schedules.length > MAX_SCHEDULES) return;
    if (i === order.length) {
      schedules.push([...current]);
      return;
    }
    const r = order[i];
    for (const s of candidates.get(r.slot.id)!) {
      if (current.some((chosen) => sectionsConflict(chosen, s))) continue;
      if (!pairingHolds(r, s)) continue;
      current.push(s);
      chosenBySlot.set(r.slot.id, s);
      walk(i + 1);
      chosenBySlot.delete(r.slot.id);
      current.pop();
    }
  };
  walk(0);

  const truncated = schedules.length > MAX_SCHEDULES;
  if (schedules.length > 0) {
    return {
      schedules: schedules.slice(0, MAX_SCHEDULES),
      diagnostics: null,
      search: { limit: MAX_SCHEDULES, truncated },
    };
  }

  const conflictPairs: Diagnostics["conflictPairs"] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const as = candidates.get(a.slot.id)!;
      const bs = candidates.get(b.slot.id)!;
      if (as.length === 0 || bs.length === 0) continue;
      const compatible = as.some((x) => bs.some((y) => !sectionsConflict(x, y) && pairOk(a, x, b, y)));
      if (!compatible) conflictPairs.push({ a: a.slot.label, b: b.slot.label });
    }
  }
  const nWayConflict = perSlot.every((p) => p.afterFilters > 0) && conflictPairs.length === 0;
  return {
    schedules,
    diagnostics: { perSlot, conflictPairs, nWayConflict },
    search: { limit: MAX_SCHEDULES, truncated: false },
  };
}

// Pair check for the diagnostics pass, where nothing is placed yet.
function pairOk(a: ResolvedSlot, x: Section, b: ResolvedSlot, y: Section): boolean {
  if (a.slot.pairedWith !== b.slot.id && b.slot.pairedWith !== a.slot.id) return true;
  return subjectPrefix(x.courseCode) === subjectPrefix(y.courseCode);
}
