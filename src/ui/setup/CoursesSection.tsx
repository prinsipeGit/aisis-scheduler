import { useMemo, useState } from "react";
import type { Catalog, CurriculumBlock, Program, UserState } from "../../lib/types";
import { acceptableCodes, type AliasFile } from "../../lib/offerings";
import { slotFromCatalog, slotsFromCurriculum, totalUnits, type ResolvedSlot, type SlotStatus } from "../../lib/slots";
import { sameCourseCode } from "../../lib/course-code";

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
  "awaiting-section": "Pre-assigned. Set your section under Classes you already have.",
};

export function CoursesSection({ program, block, catalog, state, resolved, aliases, onChange }: Props) {
  const [fromCurriculum, setFromCurriculum] = useState("");
  const [fromCatalog, setFromCatalog] = useState("");
  const [addCourseError, setAddCourseError] = useState<string | null>(null);
  const [fillDrafts, setFillDrafts] = useState<Record<string, string>>({});

  const titleOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of catalog?.sections ?? []) if (!map.has(s.courseCode)) map.set(s.courseCode, s.title);
    return map;
  }, [catalog]);

  // Keyed by every code that can appear as a slot's `chosen ?? requirement`: a curriculum
  // entry's own catNo (so an un-narrowed slot answers from what the block itself printed,
  // even when that catNo is a requirement like "NSTP 11" that never appears verbatim in the
  // catalog — offerings there are "NSTP 11(CWTS)" etc.) and, for anything else, the exact
  // catalog course code a narrowed or catalog-added slot names.
  const unitsOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of program?.blocks ?? []) for (const e of b.entries) map.set(e.catNo, e.units);
    for (const s of catalog?.sections ?? []) if (!map.has(s.courseCode)) map.set(s.courseCode, s.units);
    return map;
  }, [program, catalog]);

  if (!program || !block) return <p>Choose a program and semester first.</p>;
  if (!catalog) return <p>Loading the catalog for {state.calendarTerm}...</p>;

  const selectedUnits = totalUnits(resolved, (code) => unitsOf.get(code) ?? 0);

  const update = (slots: UserState["slots"]) => onChange({ ...state, slots });

  const setChosen = (id: string, chosen: string) =>
    update(state.slots.map((s) =>
      s.id === id ? { ...s, chosen: chosen || null, included: chosen ? true : s.included } : s));

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
    if (state.slots.some((s) => s.requirement && sameCourseCode(s.requirement, fromCatalog))) return;
    update([...state.slots, candidate]);
    setFromCatalog("");
    setAddCourseError(null);
  };

  const available = program.blocks.flatMap((b) =>
    b.entries
      .filter((e) => !state.slots.some((s) => s.id === `ips:${e.slotId}`))
      .map((e) => ({ block: b, entry: e })));
  const catalogCodes = [...new Set(catalog.sections.map((s) => s.courseCode))].sort();
  const catalogCodeSet = new Set(catalogCodes);

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
                         onChange={(e) => {
                           const value = e.target.value;
                           // A narrowed slot resolves by exact match only (offerings.ts:
                           // slot.chosen !== null filters on canonical equality, no variant
                           // suffixes), so exact catalog membership is the right rule here -
                           // unlike Add-course, which checks resolvability. Empty string is
                           // let through alongside a valid code so clearing the input can
                           // reset `chosen` back to null; there is no other way to clear an
                           // elective once it has been filled.
                           if (value === "" || catalogCodeSet.has(value)) {
                             setChosen(r.slot.id, value);
                             // Drop the draft once committed: keeping it would shadow any
                             // later external change to `chosen` (e.g. cleared elsewhere)
                             // behind this now-stale typed value forever.
                             setFillDrafts((prev) => {
                               if (!(r.slot.id in prev)) return prev;
                               const { [r.slot.id]: _dropped, ...rest } = prev;
                               return rest;
                             });
                           } else {
                             setFillDrafts((prev) => ({ ...prev, [r.slot.id]: value }));
                           }
                         }} />
                </label>
              )}
              {STATUS_TEXT[r.status] && <em> {STATUS_TEXT[r.status]}</em>}
              {r.slot.origin === "added" && (
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
