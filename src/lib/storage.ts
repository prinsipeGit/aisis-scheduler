import type { Preferences, UserState } from "./types";

export const STORAGE_VERSION = 1;
const KEY = "aisis-scheduler-state";

const defaultPreferences = (): Preferences => ({
  criteria: ["compactDays"],
  protectedBlocks: [],
  excludedSections: [],
});

export function defaultState(semester: string): UserState {
  return {
    version: STORAGE_VERSION,
    semester,
    chosenCourses: [],
    lockedSections: [],
    fullSections: [],
    preferences: defaultPreferences(),
    personalRatings: [],
  };
}

const VALID_RANK_CRITERIA = new Set([
  "compactDays",
  "fewestDays",
  "lateStart",
  "earlyEnd",
  "preferredProfs",
]);

function isValidCriterion(x: unknown): boolean {
  return typeof x === "string" && VALID_RANK_CRITERIA.has(x);
}

function isValidProtectedBlock(x: unknown): boolean {
  if (typeof x !== "object" || x === null) return false;
  const b = x as Record<string, unknown>;
  return Array.isArray(b.days) && typeof b.start === "number" && typeof b.end === "number";
}

function isValidPersonalRating(x: unknown): boolean {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return typeof r.name === "string" && typeof r.rating === "number";
}

function isValidState(v: unknown): v is UserState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  const isStringArray = (x: unknown) => Array.isArray(x) && x.every((e) => typeof e === "string");
  const prefs = s.preferences as Record<string, unknown> | null | undefined;
  return (
    typeof s.version === "number" &&
    typeof s.semester === "string" &&
    isStringArray(s.chosenCourses) &&
    isStringArray(s.lockedSections) &&
    isStringArray(s.fullSections) &&
    Array.isArray(s.personalRatings) &&
    s.personalRatings.every(isValidPersonalRating) &&
    typeof prefs === "object" && prefs !== null &&
    Array.isArray(prefs.criteria) && prefs.criteria.every(isValidCriterion) &&
    Array.isArray(prefs.protectedBlocks) && prefs.protectedBlocks.every(isValidProtectedBlock) &&
    isStringArray(prefs.excludedSections)
  );
}

export function loadState(semester: string): { state: UserState; wasReset: boolean } {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return { state: defaultState(semester), wasReset: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidState(parsed) || parsed.version !== STORAGE_VERSION || parsed.semester !== semester) {
      return { state: defaultState(semester), wasReset: true };
    }
    return { state: parsed, wasReset: false };
  } catch {
    return { state: defaultState(semester), wasReset: true };
  }
}

export function saveState(state: UserState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}
