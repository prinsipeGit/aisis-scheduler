import type { ProfRating } from "./types";

export function normalizeName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z,\s]/g, " ").replace(/\s+/g, " ").trim();
  const comma = cleaned.indexOf(",");
  if (comma >= 0) {
    const last = cleaned.slice(0, comma).trim();
    const first = cleaned.slice(comma + 1).replace(/,/g, " ").replace(/\s+/g, " ").trim();
    return `${first} ${last}`.trim();
  }
  return cleaned;
}

export function ratingKey(name: string, courseCode?: string): string {
  const base = normalizeName(name);
  return courseCode ? `${base}@${courseCode}` : base;
}

export function mergeRatings(community: ProfRating[], personal: ProfRating[]): Map<string, ProfRating> {
  const merged = new Map<string, ProfRating>();
  for (const rating of [...community, ...personal]) {
    merged.set(ratingKey(rating.name, rating.courseCode), rating);
  }
  return merged;
}

export function ratingFor(
  instructor: string, merged: Map<string, ProfRating>, courseCode?: string
): ProfRating | undefined {
  const base = normalizeName(instructor);
  if (!base) return undefined;
  if (courseCode) {
    const scoped = merged.get(`${base}@${courseCode}`);
    if (scoped) return scoped;
  }
  const overall = merged.get(base);
  if (overall) return overall;

  // Unique-last-name fallback, over course-agnostic entries only.
  const lastName = base.split(" ").pop();
  if (!lastName) return undefined;
  const candidates = [...merged.entries()].filter(
    ([k]) => !k.includes("@") && k.split(" ").includes(lastName)
  );
  return candidates.length === 1 ? candidates[0][1] : undefined;
}
