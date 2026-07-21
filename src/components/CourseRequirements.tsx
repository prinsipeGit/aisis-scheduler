import { useMemo, useState } from "react";
import type { Catalog, CurriculumBlock, UserState } from "../lib/types";
import {
  buildRequirementRows, extraCourseRows, totalUnits, type RequirementRow,
} from "../lib/requirements";

interface Props {
  block: CurriculumBlock | undefined;
  catalog: Catalog | null;
  state: UserState;
  onChange: (s: UserState) => void;
}

const ADD_COURSE_RESULT_CAP = 20;

// A course code is still needed in requiredCourses if some *other* elective
// slot still resolves to it, or a non-elective entry in the block prints it
// (its own checkbox drives requiredCourses membership independently).
function codeStillNeeded(
  code: string,
  updatedFills: Record<string, string>,
  block: CurriculumBlock
): boolean {
  if (Object.values(updatedFills).includes(code)) return true;
  return block.entries.some((entry) => !entry.isElective && entry.catNo === code);
}

function withoutUnreferencedCode(
  courses: string[],
  code: string | undefined,
  updatedFills: Record<string, string>,
  block: CurriculumBlock
): string[] {
  if (!code || codeStillNeeded(code, updatedFills, block)) return courses;
  return courses.filter((c) => c !== code);
}

export function CourseRequirements({ block, catalog, state, onChange }: Props) {
  const [addQuery, setAddQuery] = useState("");

  const courseOptions = useMemo(() => {
    if (!catalog) return [];
    const byCode = new Map<string, string>();
    for (const s of catalog.sections) if (!byCode.has(s.courseCode)) byCode.set(s.courseCode, s.title);
    return [...byCode.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  const addMatches = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    if (!q) return [];
    return courseOptions.filter(
      ([code, title]) => code.toLowerCase().includes(q) || title.toLowerCase().includes(q)
    );
  }, [addQuery, courseOptions]);

  if (!block) return <p>Choose a program and semester first.</p>;
  if (!catalog) return <p>Loading the catalog for {state.calendarTerm}…</p>;

  const rows = [
    ...buildRequirementRows(block, state, catalog),
    ...extraCourseRows(state, block, catalog),
  ];
  const units = totalUnits(rows);

  const withCourses = (codes: string[]) => onChange({ ...state, requiredCourses: codes });

  // Fix 2: clearing/replacing slot `row.slotId`'s fill (`code` = new value, "" to
  // clear) must only drop `previous` from requiredCourses when nothing else still
  // references it — another elective slot filled with the same code, or a
  // non-elective entry printing that same catNo.
  const fillElective = (row: RequirementRow, code: string) => {
    const fills = { ...state.electiveFills };
    const previous = fills[row.slotId];
    if (code) {
      fills[row.slotId] = code;
    } else {
      delete fills[row.slotId];
    }
    let courses = withoutUnreferencedCode(state.requiredCourses, previous, fills, block);
    if (code && !courses.includes(code)) courses = [...courses, code];
    onChange({ ...state, electiveFills: fills, requiredCourses: courses });
  };

  // Fix 1: for elective rows the checkbox IS "clear the fill" — route it through
  // fillElective so it can never desync electiveFills from requiredCourses. Only
  // non-elective rows keep the plain requiredCourses toggle.
  const toggle = (row: RequirementRow) => {
    if (!row.courseCode) return;
    if (row.isElective) {
      fillElective(row, "");
      return;
    }
    withCourses(
      row.selected
        ? state.requiredCourses.filter((c) => c !== row.courseCode)
        : [...state.requiredCourses, row.courseCode]
    );
  };

  const addCourse = (code: string) => {
    if (!code || state.requiredCourses.includes(code)) return;
    withCourses([...state.requiredCourses, code]);
    setAddQuery("");
  };

  return (
    <section>
      <h2>
        {block.year} · {block.term} — courses for {state.calendarTerm}
      </h2>
      <p>
        <strong>{units} units selected</strong> (curriculum block totals {block.totalUnits})
      </p>

      <ul>
        {rows.map((row) => (
          <li key={row.slotId}>
            <label>
              <input
                type="checkbox"
                checked={row.selected}
                disabled={row.courseCode === null}
                onChange={() => toggle(row)}
              />{" "}
              <strong>{row.filledWith ?? row.catNo}</strong> — {row.title} ({row.units} units)
            </label>

            {row.isElective && (
              <>
                {" "}
                <label>
                  Fill {row.catNo}{" "}
                  <select
                    value={row.filledWith ?? ""}
                    onChange={(e) => fillElective(row, e.target.value)}
                  >
                    <option value="">— pick a course —</option>
                    {courseOptions.map(([code, title]) => (
                      <option key={code} value={code}>
                        {code} — {title}
                      </option>
                    ))}
                  </select>
                </label>
                {!row.filledWith && <em> Pick a course for this elective.</em>}
              </>
            )}

            {row.courseCode !== null && row.offeredSections === 0 && (
              <em> Not offered in {state.calendarTerm}.</em>
            )}
          </li>
        ))}
      </ul>

      <div>
        <label>
          Add another course{" "}
          <input
            type="text"
            value={addQuery}
            placeholder="search the catalog"
            onChange={(e) => setAddQuery(e.target.value)}
          />
        </label>
        {addQuery.trim() && (
          <ul>
            {addMatches.slice(0, ADD_COURSE_RESULT_CAP).map(([code, title]) => (
              <li key={code}>
                <button type="button" onClick={() => addCourse(code)}>
                  {code} — {title}
                </button>
              </li>
            ))}
            {addMatches.length === 0 && <li>No matching courses.</li>}
            {addMatches.length > ADD_COURSE_RESULT_CAP && (
              <li>
                <em>
                  {addMatches.length - ADD_COURSE_RESULT_CAP} more matched — refine your search.
                </em>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
