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

function isValidState(v: unknown): v is UserState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  const isStringArray = (x: unknown) => Array.isArray(x) && x.every((e) => typeof e === "string");
  return (
    typeof s.version === "number" &&
    typeof s.semester === "string" &&
    isStringArray(s.chosenCourses) &&
    isStringArray(s.lockedSections) &&
    isStringArray(s.fullSections) &&
    Array.isArray(s.personalRatings) &&
    typeof s.preferences === "object" && s.preferences !== null &&
    Array.isArray((s.preferences as Record<string, unknown>).criteria) &&
    Array.isArray((s.preferences as Record<string, unknown>).protectedBlocks) &&
    isStringArray((s.preferences as Record<string, unknown>).excludedSections)
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
