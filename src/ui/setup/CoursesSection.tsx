import { useMemo, useState } from "react";
import type { Catalog, CurriculumBlock, Program, UserState } from "../../lib/types";
import { acceptableCodes, type AliasFile } from "../../lib/offerings";
import { slotFromCatalog, slotsFromCurriculum, totalUnits, type ResolvedSlot, type SlotStatus } from "../../lib/slots";
import { canonicalCourseCode, sameCourseCode } from "../../lib/course-code";

interface Props {
  program: Program | undefined;
  block: CurriculumBlock | undefined;
  catalog: Catalog | null;
  state: UserState;
  resolved: ResolvedSlot[];
  aliases: AliasFile;
  onChange: (s: UserState) => void;
}

const STATUS_TEXT: Record<SlotStatus, string> = {
  ok: "",
  unfilled: "Pick a course for this elective.",
  "no-offerings": "Not offered this term.",
  "awaiting-section": "Pre-assigned. Set your section under Pre-enlisted Classes.",
};

export function CoursesSection({ program, block, catalog, state, resolved, aliases, onChange }: Props) {
  const [fromCurriculum, setFromCurriculum] = useState("");
  const [fromCatalog, setFromCatalog] = useState("");
  const [addCourseError, setAddCourseError] = useState<string | null>(null);
  const [fillDrafts, setFillDrafts] = useState<Record<string, string>>({});
  const [slotErrors, setSlotErrors] = useState<Record<string, string>>({});

  const titleOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of catalog?.sections ?? []) if (!map.has(s.courseCode)) map.set(s.courseCode, s.title);
    return map;
  }, [catalog]);

  // Keyed by every code that can appear as a slot's `chosen ?? requirement`, canonicalized
  // so a typed code that differs only in case or whitespace (e.g. "math 71.1") still hits
  // the catalog's "MATH 71.1" entry: a curriculum entry's own catNo (so an un-narrowed slot
  // answers from what the block itself printed, even when that catNo is a requirement like
  // "NSTP 11" that never appears verbatim in the catalog — offerings there are
  // "NSTP 11(CWTS)" etc.) and, for anything else, the exact catalog course code a narrowed
  // or catalog-added slot names.
  const unitsOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of program?.blocks ?? []) for (const e of b.entries) map.set(canonicalCourseCode(e.catNo), e.units);
    for (const s of catalog?.sections ?? []) {
      const key = canonicalCourseCode(s.courseCode);
      if (!map.has(key)) map.set(key, s.units);
    }
    return map;
  }, [program, catalog]);

  // A typed code can resolve to real sections (acceptableCodes' variant-suffix rule) without
  // ever being a literal key above — a variant base like "MATH 71" prices nothing on its own;
  // only "MATH 71.1" / "MATH 71.3" are catalog codes. Price it from the units of whatever this
  // slot actually resolved to, using the resolution `resolved` already computed.
  const resolvedUnitsOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of resolved) {
      const code = r.slot.chosen ?? r.slot.requirement;
      // `sections` is narrowed to exactly the pinned section when a slot is pinned, so it
      // is the one that will actually be enlisted; for an unpinned slot the two agree.
      // Without it, locking a 1-unit BIO 11.02 lab still prices as the 3-unit lecture.
      const priced = r.sections[0] ?? r.allSections[0];
      if (code && priced) map.set(canonicalCourseCode(code), priced.units);
    }
    return map;
  }, [resolved]);

  if (!program || !block) return <p>Choose a program and semester first.</p>;
  if (!catalog) return <p>Loading the catalog for {state.calendarTerm}...</p>;

  const selectedUnits = totalUnits(resolved, (code) => {
    const canon = canonicalCourseCode(code);
    return unitsOf.get(canon) ?? resolvedUnitsOf.get(canon) ?? 0;
  });

  const update = (slots: UserState["slots"]) => onChange({ ...state, slots });

  const catalogCodes = [...new Set(catalog.sections.map((s) => s.courseCode))].sort();
  const catalogCodeSet = new Set(catalogCodes);

  // Two slots must never claim one course: generation rejects a duplicate outright
  // (generator.ts's distinct-course rule), so accepting one here would quietly cost the
  // student a course rather than double-book them, and the unit total would double-count it.
  const claimedElsewhere = (id: string, code: string) =>
    state.slots.some((s) => {
      if (s.id === id) return false;
      const claimed = s.chosen ?? s.requirement;
      return claimed !== null && sameCourseCode(claimed, code);
    });

  const dropKey = (map: Record<string, string>, id: string) => {
    if (!(id in map)) return map;
    const { [id]: _dropped, ...rest } = map;
    return rest;
  };

  const setChosen = (id: string, chosen: string) => {
    if (chosen && claimedElsewhere(id, chosen)) {
      setSlotErrors((prev) => ({ ...prev, [id]: `${chosen} is already on your list.` }));
      return;
    }
    setSlotErrors((prev) => dropKey(prev, id));
    update(state.slots.map((s) =>
      s.id === id ? { ...s, chosen: chosen || null, included: chosen ? true : s.included } : s));
  };

  // A narrowed slot resolves by exact match only (offerings.ts: `slot.chosen !== null`
  // filters on canonical equality, no variant suffixes), so exact catalog membership is the
  // right rule here — unlike Add-course, which checks resolvability. Empty string is let
  // through alongside a valid code so clearing the input can reset `chosen` back to null;
  // there is no other way to clear an elective once it has been filled.
  const setFill = (id: string, value: string) => {
    const acceptable = value === "" || (catalogCodeSet.has(value) && !claimedElsewhere(id, value));
    if (!acceptable) {
      setFillDrafts((prev) => ({ ...prev, [id]: value }));
      if (catalogCodeSet.has(value)) {
        setSlotErrors((prev) => ({ ...prev, [id]: `${value} is already on your list.` }));
      }
      return;
    }
    setChosen(id, value);
    // Drop the draft once committed: keeping it would shadow any later external change to
    // `chosen` (e.g. cleared elsewhere) behind this now-stale typed value forever.
    setFillDrafts((prev) => dropKey(prev, id));
  };

  const toggle = (id: string) =>
    update(state.slots.map((s) => (s.id === id ? { ...s, included: !s.included } : s)));

  const remove = (id: string) =>
    update(state.slots.filter((s) => s.id !== id && s.pairedWith !== id));

  const addRequirement = () => {
    if (!fromCurriculum) return;
    const source = program.blocks.find((b) => b.entries.some((e) => e.slotId === fromCurriculum));
    const entry = source?.entries.find((e) => e.slotId === fromCurriculum);
    if (!source || !entry) return;
    const added = slotsFromCurriculum(entry, source, aliases)
      .filter((s) => !state.slots.some((existing) => existing.id === s.id));
    update([...state.slots, ...added]);
    setFromCurriculum("");
  };

  // Ids for added slots are derived from a free index, not the slot count: `remove`
  // shrinks the count, so reusing it as an index would hand out an id already in use.
  const nextAddedIndex = () => {
    let i = 0;
    while (state.slots.some((s) => s.id === `added:${i}`)) i++;
    return i;
  };

  const addCourse = () => {
    if (!fromCatalog) return;
    // Resolvability, not literal catalog membership: acceptableCodes matches a requirement
    // by canonical equality plus variant suffixes ("NSTP 11" -> "NSTP 11(CWTS)"), and that
    // canonicalization is case- and whitespace-insensitive. A literal-membership check
    // rejects codes ("NSTP 11", "PHILO 11", lowercase "math 71.1") that genuinely resolve.
    const candidate = slotFromCatalog(fromCatalog, nextAddedIndex());
    if (acceptableCodes(candidate, catalog, aliases).length === 0) {
      setAddCourseError("That is not a course in this term's catalog.");
      return;
    }
    // `chosen ?? requirement`, not `requirement` alone: a filled elective has a null
    // requirement, so comparing only requirements let the same course through twice.
    if (claimedElsewhere(candidate.id, fromCatalog)) {
      setAddCourseError("That course is already on your list.");
      return;
    }
    update([...state.slots, candidate]);
    setFromCatalog("");
    setAddCourseError(null);
  };

  const available = program.blocks.flatMap((b) =>
    b.entries
      .filter((e) => !state.slots.some((s) => s.id === `ips:${e.slotId}`))
      .map((e) => ({ block: b, entry: e })));

  return (
    <div>
      <p className="metric">
        <strong className="tabular">{selectedUnits} units selected</strong>{" "}
        <span className="hint">this block is {block.totalUnits}</span>
      </p>
      {selectedUnits > block.totalUnits && (
        <p className="banner">That is above what this block plans for. An overload usually needs approval.</p>
      )}
      {selectedUnits > 0 && selectedUnits < block.totalUnits && (
        <p className="hint">Below this block's planned load. Check that a lighter semester is what you want.</p>
      )}

      <ul className="course-list">
        {resolved.map((r) => {
          const codes = acceptableCodes({ ...r.slot, chosen: null }, catalog, aliases);
          return (
            <li key={r.slot.id} data-testid={`slot-${r.slot.id}`} className={r.slot.included ? "" : "muted-row"}>
              <label>
                <input type="checkbox" checked={r.slot.included} onChange={() => toggle(r.slot.id)} />{" "}
                <strong>{r.slot.chosen ?? r.slot.label}</strong>
              </label>
              {r.slot.sourceBlock && r.slot.sourceBlock !== block.key && (
                <span className="hint"> from {r.slot.sourceBlock.replace("|", " / ")}</span>
              )}
              {codes.length > 1 && (
                <label>
                  {" "}Narrow{" "}
                  <select aria-label={`Narrow ${r.slot.label}`} value={r.slot.chosen ?? ""}
                          onChange={(e) => setChosen(r.slot.id, e.target.value)}>
                    <option value="">any - let the scheduler choose</option>
                    {codes.map((code) => (
                      <option key={code} value={code}>{titleOf.get(code) ?? code}</option>
                    ))}
                  </select>
                </label>
              )}
              {r.slot.requirement === null && (
                <label>
                  {" "}Fill{" "}
                  <input list="catalog-codes" aria-label={`Fill ${r.slot.label}`}
                         placeholder="Search the catalog..."
                         value={fillDrafts[r.slot.id] ?? r.slot.chosen ?? ""}
                         onChange={(e) => setFill(r.slot.id, e.target.value)} />
                </label>
              )}
              {STATUS_TEXT[r.status] && <em> {STATUS_TEXT[r.status]}</em>}
              {slotErrors[r.slot.id] && <span className="hint">{slotErrors[r.slot.id]}</span>}
              {/* Removable when it did not come from the block on screen: courses added from
                  the catalog (sourceBlock null) and requirements pulled in from another
                  block. Adding the wrong cross-block requirement is otherwise a one-way
                  door. A slot the current block seeded stays — unchecking is the affordance
                  there, and Remove would only invite losing a real requirement. */}
              {r.slot.sourceBlock !== block.key && (
                <button type="button" onClick={() => remove(r.slot.id)}>Remove</button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="add-panel">
        <label>
          Add from my curriculum{" "}
          <select value={fromCurriculum} onChange={(e) => setFromCurriculum(e.target.value)}>
            <option value="">- pick a requirement -</option>
            {available.map(({ block: b, entry }) => (
              <option key={entry.slotId} value={entry.slotId}>
                {entry.catNo} - {b.year} / {b.term}
              </option>
            ))}
          </select>
        </label>{" "}
        <button type="button" onClick={addRequirement}>Add requirement</button>
      </div>

      <div className="add-panel">
        <label>
          Add from the catalog{" "}
          <input list="catalog-codes" placeholder="Search the catalog..."
                 value={fromCatalog}
                 onChange={(e) => { setFromCatalog(e.target.value); setAddCourseError(null); }} />
        </label>{" "}
        <button type="button" onClick={addCourse}>Add course</button>
        {addCourseError && <p className="hint">{addCourseError}</p>}
      </div>

      <datalist id="catalog-codes">
        {catalogCodes.map((code) => (
          <option key={code} value={code}>{titleOf.get(code)}</option>
        ))}
      </datalist>
    </div>
  );
}
