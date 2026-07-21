import type { Catalog, ProfRating } from "./types";
import ratingsJson from "../data/prof-ratings.json";

// This module is the ONLY place catalog JSON is read. Swapping the bundled
// files for Supabase later means changing only this file (spec §3, §7).

const STALE_AFTER_DAYS = 30;

export interface TermOption {
  term: string;   // "2026-2"
  label: string;  // "2026-2027 Second Semester"
  available?: boolean;
}

const TERM_SUFFIX: Record<string, string> = {
  "1": "First Semester",
  "2": "Second Semester",
  "0": "Intersession",
};

function termLabel(term: string): string {
  const [year, n] = term.split("-");
  const startYear = Number(year);
  const suffix = TERM_SUFFIX[n] ?? n;
  return `${startYear}-${startYear + 1} ${suffix}`;
}

export class CatalogUnavailableError extends Error {
  term: string;
  constructor(term: string) {
    super(
      `No catalog data for term ${term}. Run: npm run scrape:schedule -- ${term}`
    );
    this.name = "CatalogUnavailableError";
    this.term = term;
  }
}

// Vite resolves this glob at build time; only the requested term's JSON is fetched.
const CATALOG_MODULES = import.meta.glob<{ default: Catalog }>("../data/catalog-*.json");

export const TERMS: TermOption[] = ["2026-2", "2026-1", "2026-0", "2025-2", "2025-1", "2025-0"].map(
  (term) => ({
    term,
    label: termLabel(term),
    available: Boolean(CATALOG_MODULES[`../data/catalog-${term}.json`]),
  })
);

export function getTerms(): TermOption[] {
  return TERMS;
}

export async function loadCatalog(term: string): Promise<Catalog> {
  const loader = CATALOG_MODULES[`../data/catalog-${term}.json`];
  if (!loader) throw new CatalogUnavailableError(term);
  const mod = await loader();
  return mod.default;
}

export function getCommunityRatings(): ProfRating[] {
  return ratingsJson as ProfRating[];
}

export function isStale(catalog: Catalog, now: Date = new Date()): boolean {
  const exported = new Date(catalog.exportedAt).getTime();
  if (Number.isNaN(exported)) return true;
  return now.getTime() - exported > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}
