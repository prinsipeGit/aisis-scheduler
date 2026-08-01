import type { Preferences, Slot, UserState } from "./types";

export const STORAGE_VERSION = 3;
const KEY = "aisis-scheduler-state";

const VALID_RANK_CRITERIA = new Set([
  "compactDays", "fewestDays", "lateStart", "earlyEnd", "preferredProfs",
]);
const VALID_DAYS = new Set(["M", "T", "W", "TH", "F", "SAT", "SUN"]);
const isFiniteMinute = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 24 * 60;
const isStringArray = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every((e) => typeof e === "string");
const isNullableString = (x: unknown): boolean => x === null || typeof x === "string";

const defaultPreferences = (): Preferences => ({
  criteria: ["compactDays"], protectedBlocks: [], excludedSections: [],
});

export function defaultState(calendarTerm: string): UserState {
  return {
    version: STORAGE_VERSION,
    programId: "",
    blockKey: "",
    calendarTerm,
    slots: [],
    lockedSections: [],
    fullSections: [],
    completedCourses: [],
    preferences: defaultPreferences(),
    personalRatings: [],
  };
}

function isValidSlot(v: unknown): v is Slot {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return typeof s.id === "string" && s.id !== "" &&
    (s.origin === "ips" || s.origin === "added") &&
    typeof s.label === "string" &&
    isNullableString(s.requirement) &&
    isNullableString(s.category) &&
    isNullableString(s.sourceBlock) &&
    isNullableString(s.chosen) &&
    isNullableString(s.pairedWith) &&
    typeof s.included === "boolean";
}

function isValidPreferences(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  if (!Array.isArray(p.criteria) ||
      !p.criteria.every((c) => typeof c === "string" && VALID_RANK_CRITERIA.has(c))) return false;
  if (new Set(p.criteria).size !== p.criteria.length) return false;
  if (!Array.isArray(p.protectedBlocks)) return false;
  if (!p.protectedBlocks.every((b) => {
    if (typeof b !== "object" || b === null) return false;
    const m = b as Record<string, unknown>;
    return Array.isArray(m.days) && m.days.length > 0 &&
      m.days.every((day) => typeof day === "string" && VALID_DAYS.has(day)) &&
      isFiniteMinute(m.start) && isFiniteMinute(m.end) && m.start < m.end;
  })) return false;
  if (p.earliestStart !== undefined && !isFiniteMinute(p.earliestStart)) return false;
  if (p.latestEnd !== undefined && !isFiniteMinute(p.latestEnd)) return false;
  if (isFiniteMinute(p.earliestStart) && isFiniteMinute(p.latestEnd) && p.earliestStart > p.latestEnd) return false;
  return isStringArray(p.excludedSections);
}

function isValidState(v: unknown): v is UserState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  if (typeof s.version !== "number") return false;
  if (typeof s.programId !== "string") return false;
  if (typeof s.blockKey !== "string") return false;
  if (typeof s.calendarTerm !== "string") return false;
  if (!Array.isArray(s.slots) || !s.slots.every(isValidSlot)) return false;
  if (new Set((s.slots as Slot[]).map((x) => x.id)).size !== s.slots.length) return false;
  if (!isStringArray(s.lockedSections)) return false;
  if (!isStringArray(s.fullSections)) return false;
  if (!isStringArray(s.completedCourses)) return false;
  if (!Array.isArray(s.personalRatings)) return false;
  if (!s.personalRatings.every((x) => {
    if (typeof x !== "object" || x === null) return false;
    const rt = x as Record<string, unknown>;
    return typeof rt.name === "string" && rt.name.trim() !== "" &&
      typeof rt.rating === "number" && Number.isFinite(rt.rating) && rt.rating >= 0 && rt.rating <= 5 &&
      (rt.courseCode === undefined || typeof rt.courseCode === "string") &&
      (rt.note === undefined || typeof rt.note === "string") &&
      (rt.asOf === undefined || typeof rt.asOf === "string");
  })) return false;
  return isValidPreferences(s.preferences);
}

export function loadState(calendarTerm: string): { state: UserState; wasReset: boolean } {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return { state: defaultState(calendarTerm), wasReset: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    // v2 held requiredCourses + electiveFills. The selection model changed shape, so there
    // is no migration worth keeping — it resets with a notice (§9).
    if (!isValidState(parsed) || parsed.version !== STORAGE_VERSION) {
      return { state: defaultState(calendarTerm), wasReset: true };
    }
    return { state: parsed, wasReset: false };
  } catch {
    return { state: defaultState(calendarTerm), wasReset: true };
  }
}

export function saveState(state: UserState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Scheduling still works when storage is blocked or full; persistence is best-effort.
  }
}
