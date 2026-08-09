// Term codes are `${academicYearStart}-${n}`, n ∈ {1: First Sem, 2: Second Sem, 0: Intersession}.
// AY 2026-2027 = "2026-*": Sem 1 Aug–Dec 2026, Sem 2 Jan–May 2027, Intersession Jun–Jul 2027.
//
// Enlistment happens BEFORE a term starts, so the useful default is the term being enlisted
// for, not the one currently running (§11.2).
function computeTerm(now: Date): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 6 && month <= 10) return `${year}-1`;   // Jun–Oct: First Sem of the AY starting now
  if (month >= 11) return `${year}-2`;                 // Nov–Dec: Second Sem of that same AY
  if (month <= 2) return `${year - 1}-2`;              // Jan–Feb: still that AY's Second Sem
  return `${year - 1}-0`;                              // Mar–May: that AY's Intersession
}

// Newest first: later academic year wins, then Second Sem > First Sem > Intersession,
// matching the order a student would consider them.
const RANK: Record<string, number> = { "2": 2, "1": 1, "0": 0 };
function newest(available: string[]): string {
  return [...available].sort((a, b) => {
    const [ay, an] = a.split("-");
    const [by, bn] = b.split("-");
    return Number(by) - Number(ay) || (RANK[bn] ?? -1) - (RANK[an] ?? -1);
  })[0] ?? "";
}

// The computed term is used only if it actually has a catalog. Without this, opening the app
// in November defaults to a term nobody has scraped and the first thing the user sees is an
// error banner.
export function defaultTerm(now: Date, available: string[]): string {
  const computed = computeTerm(now);
  return available.includes(computed) ? computed : newest(available);
}

const TERM_NAME: Record<string, string> = {
  "1": "First Semester",
  "2": "Second Semester",
  "0": "Intersession",
};

export function termHeading(term: string): { semester: string; academicYear: string } {
  const match = /^(\d{4})-([012])$/.exec(term);
  if (!match) return { semester: "Current Semester", academicYear: term };
  const startYear = Number(match[1]);
  return {
    semester: TERM_NAME[match[2]],
    academicYear: `A.Y. ${startYear}\u2013${startYear + 1}`,
  };
}
