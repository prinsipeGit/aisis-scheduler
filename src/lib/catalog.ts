import type { Catalog, ProfRating } from "./types";
import {
  defaultDb, rowToCatalog, rowToRating,
  CATALOG_COLUMNS, RATING_COLUMNS,
  type CatalogRow, type Db, type RatingRow,
} from "./db";

// The ONLY place catalog data is read (§8).

const STALE_AFTER_DAYS = 30;

export interface TermOption {
  term: string;
  label: string;
  available: boolean;
}

const TERM_SUFFIX: Record<string, string> = {
  "1": "First Semester", "2": "Second Semester", "0": "Intersession",
};

function termLabel(term: string): string {
  const [year, n] = term.split("-");
  const startYear = Number(year);
  return `${startYear}-${startYear + 1} ${TERM_SUFFIX[n] ?? n}`;
}

export class CatalogUnavailableError extends Error {
  term: string;
  constructor(term: string) {
    super(`No catalog data for term ${term}. Run: npm run scrape:schedule -- ${term} && npm run push:data`);
    this.name = "CatalogUnavailableError";
    this.term = term;
  }
}

export function isStale(catalog: Catalog, now: Date = new Date()): boolean {
  const exported = new Date(catalog.exportedAt).getTime();
  if (Number.isNaN(exported)) return true;
  return now.getTime() - exported > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

const KNOWN_TERMS = ["2026-2", "2026-1", "2026-0", "2025-2", "2025-1", "2025-0"];

export async function getTerms(db: Db = defaultDb): Promise<TermOption[]> {
  const rows = await db.selectAll<Pick<CatalogRow, "term">>("catalogs", "term");
  const inDb = new Set(rows.map((r) => r.term));
  const known = KNOWN_TERMS.map((term) => ({ term, label: termLabel(term), available: inDb.has(term) }));
  const extras = [...inDb].filter((t) => !KNOWN_TERMS.includes(t)).sort().reverse()
    .map((term) => ({ term, label: termLabel(term), available: true }));
  return [...known, ...extras];
}

export async function loadCatalog(term: string, db: Db = defaultDb): Promise<Catalog> {
  const row = await db.selectOne<CatalogRow>("catalogs", CATALOG_COLUMNS, "term", term);
  if (row === null) throw new CatalogUnavailableError(term);
  return rowToCatalog(row);
}

export async function loadCommunityRatings(db: Db = defaultDb): Promise<ProfRating[]> {
  const rows = await db.selectAll<RatingRow>("community_ratings", RATING_COLUMNS);
  return rows.map(rowToRating);
}
