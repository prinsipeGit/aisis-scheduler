import type { Diagnostics, Schedule, Section, UserState } from "./types";
import { sectionKey } from "./types";
import { overlaps } from "./time";

const MAX_SCHEDULES = 500; // real courses have 40+ sections; the UI only shows the top page

export interface GenerateResult {
  schedules: Schedule[];
  diagnostics: Diagnostics | null;
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

export function generate(all: Section[], state: UserState): GenerateResult {
  const perCourse: Diagnostics["perCourse"] = [];
  const candidates = new Map<string, Section[]>();
  // Courses with zero sections this term ("not offered") are reported in
  // diagnostics but dropped from the combinatorial walk below, per spec §6
  // error handling: excluded from generation, not a silent zero-result for
  // every other required course.
  const schedulable: string[] = [];

  for (const course of state.requiredCourses) {
    const total = all.filter((s) => s.courseCode === course);
    const locked = total.filter((s) => state.lockedSections.includes(sectionKey(s)));
    // A locked section pins the course and bypasses all filters.
    const filtered = locked.length > 0 ? locked : total.filter((s) => passesFilters(s, state));
    candidates.set(course, filtered);
    perCourse.push({ courseCode: course, total: total.length, afterFilters: filtered.length });
    if (total.length > 0) schedulable.push(course);
  }

  const order = [...schedulable].sort(
    (a, b) => candidates.get(a)!.length - candidates.get(b)!.length
  );
  const schedules: Schedule[] = [];
  const current: Section[] = [];

  const walk = (i: number): void => {
    if (schedules.length >= MAX_SCHEDULES) return;
    if (i === order.length) {
      schedules.push([...current]);
      return;
    }
    for (const s of candidates.get(order[i])!) {
      if (current.some((chosen) => sectionsConflict(chosen, s))) continue;
      current.push(s);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);

  if (schedules.length > 0) return { schedules, diagnostics: null };

  const conflictPairs: Diagnostics["conflictPairs"] = [];
  for (let i = 0; i < state.requiredCourses.length; i++) {
    for (let j = i + 1; j < state.requiredCourses.length; j++) {
      const aCourse = state.requiredCourses[i];
      const bCourse = state.requiredCourses[j];
      const as = candidates.get(aCourse)!;
      const bs = candidates.get(bCourse)!;
      if (as.length === 0 || bs.length === 0) continue;
      const compatible = as.some((a) => bs.some((b) => !sectionsConflict(a, b)));
      if (!compatible) conflictPairs.push({ a: aCourse, b: bCourse });
    }
  }
  const nWayConflict = perCourse.every((c) => c.afterFilters > 0) && conflictPairs.length === 0;
  return { schedules, diagnostics: { perCourse, conflictPairs, nWayConflict } };
}
