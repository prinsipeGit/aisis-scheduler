import type { ProfRating } from "./types";

export function normalizeName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z,\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const comma = cleaned.indexOf(",");
  if (comma >= 0) {
    const last = cleaned.slice(0, comma).trim();
    const first = cleaned.slice(comma + 1).replace(/,/g, " ").replace(/\s+/g, " ").trim();
    return `${first} ${last}`.trim();
  }
  return cleaned;
}

export function mergeRatings(
  community: ProfRating[],
  personal: ProfRating[]
): Map<string, ProfRating> {
  const merged = new Map<string, ProfRating>();
  for (const rating of community) merged.set(normalizeName(rating.name), rating);
  for (const rating of personal) merged.set(normalizeName(rating.name), rating);
  return merged;
}

export function ratingFor(
  instructor: string,
  merged: Map<string, ProfRating>
): ProfRating | undefined {
  const key = normalizeName(instructor);
  if (!key) return undefined;
  const exact = merged.get(key);
  if (exact) return exact;
  const lastName = key.split(" ").pop();
  if (!lastName) return undefined;
  const candidates = [...merged.entries()].filter(([k]) => k.split(" ").includes(lastName));
  return candidates.length === 1 ? candidates[0][1] : undefined;
}
