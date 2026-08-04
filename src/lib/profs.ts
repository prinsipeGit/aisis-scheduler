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

function titleCase(name: string): string {
  return name.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

// AISIS prints instructors as "LAST, FIRST M." and separates *multiple* instructors with the same
// comma, so the scraper cannot always tell a second teacher from a first name: "GUIDOTE, JR.,
// ARMANDO M." arrives as ["GUIDOTE, JR.", "ARMANDO M."]. The trailing fragment carries no surname
// at all, and on a grid block — where each instructor gets one word — it would read as a second
// professor who does not exist. So a fragment is dropped whenever a real "LAST, FIRST" entry is
// present, and kept only when it is the sole thing we have.
export function lastNames(instructors: string[]): string[] {
  const proper = instructors.filter((n) => n.includes(","));
  const source = proper.length > 0 ? proper : instructors;
  const out: string[] = [];
  for (const entry of source) {
    const head = (entry.includes(",") ? entry.slice(0, entry.indexOf(",")) : entry).trim();
    if (!head) continue;
    // "TBA, -" and "TO BE ARRANGED" are the catalog's two ways of saying nobody is assigned yet;
    // both should read as TBA rather than as a professor named Tba.
    const flat = head.toUpperCase().replace(/[^A-Z]/g, "");
    const name = flat === "TBA" || flat === "TOBEARRANGED" ? "TBA" : titleCase(head);
    if (!out.includes(name)) out.push(name);
  }
  return out;
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
