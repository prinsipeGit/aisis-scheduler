import type { Diagnostics, Schedule, SearchSummary, Section, UserState } from "./types";
import { sectionKey } from "./types";
import { overlaps } from "./time";
import { sameCourseCode } from "./course-code";

const MAX_SCHEDULES = 500; // browser responsiveness guard; truncation is reported to the UI

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
  // A malformed time is not the same thing as a legitimate TBA section. Until a
  // human fixes the source row, including it would create falsely conflict-free schedules.
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

export function generate(all: Section[], state: UserState): GenerateResult {
  const perCourse: Diagnostics["perCourse"] = [];
  const candidates = new Map<string, Section[]>();

  for (const course of state.requiredCourses) {
    const total = all.filter((s) => sameCourseCode(s.courseCode, course));
    const locked = total.filter(
      (s) => s.timeStatus !== "parse-error" && state.lockedSections.includes(sectionKey(s))
    );
    // A locked section pins the course and bypasses all filters.
    const filtered = locked.length > 0 ? locked : total.filter((s) => passesFilters(s, state));
    candidates.set(course, filtered);
    perCourse.push({ courseCode: course, total: total.length, afterFilters: filtered.length });
  }

  const order = [...state.requiredCourses].sort(
    (a, b) => candidates.get(a)!.length - candidates.get(b)!.length
  );
  const schedules: Schedule[] = [];
  const current: Section[] = [];

  const walk = (i: number): void => {
    // Find one extra result so an exact 500-result search is not mislabeled as truncated.
    if (schedules.length > MAX_SCHEDULES) return;
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
  const truncated = schedules.length > MAX_SCHEDULES;

  if (schedules.length > 0) {
    return {
      schedules: schedules.slice(0, MAX_SCHEDULES),
      diagnostics: null,
      search: { limit: MAX_SCHEDULES, truncated },
    };
  }

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
  return {
    schedules,
    diagnostics: { perCourse, conflictPairs, nWayConflict },
    search: { limit: MAX_SCHEDULES, truncated: false },
  };
}
