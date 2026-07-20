import type { Catalog, ProfRating } from "./types";
import catalogJson from "../data/catalog-2026-1.json";
import ratingsJson from "../data/prof-ratings.json";

// This module is the ONLY place the bundled JSON is read. Swapping the static
// files for an API later means changing only this file (spec §3, §11).

const STALE_AFTER_DAYS = 30;

export function getCatalog(): Catalog {
  return catalogJson as Catalog;
}

export function getCommunityRatings(): ProfRating[] {
  return ratingsJson as ProfRating[];
}

export function isStale(catalog: Catalog, now: Date = new Date()): boolean {
  const exported = new Date(catalog.exportedAt).getTime();
  if (Number.isNaN(exported)) return true;
  return now.getTime() - exported > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}
