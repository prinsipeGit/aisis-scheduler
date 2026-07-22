export const programToRow = (p) => ({
  id: p.id, code: p.code, name: p.name, version: p.version,
  version_year: p.versionYear, version_label: p.versionLabel, blocks: p.blocks,
});
export const catalogToRow = (c) => ({
  term: c.term, exported_at: c.exportedAt, sections: c.sections, warnings: c.warnings,
});
export const ratingsToRows = (ratings) => ratings.map((r) => ({
  name: r.name, rating: r.rating, course_code: r.courseCode ?? null,
  note: r.note ?? null, as_of: r.asOf ?? null,
}));
export const orphanKeys = (existing, pushed) => {
  const pushedSet = new Set(pushed);
  return existing.filter((key) => !pushedSet.has(key));
};
