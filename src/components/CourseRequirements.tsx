import { useMemo } from "react";
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

export function CourseRequirements({ block, catalog, state, onChange }: Props) {
  const courseOptions = useMemo(() => {
    if (!catalog) return [];
    const byCode = new Map<string, string>();
    for (const s of catalog.sections) if (!byCode.has(s.courseCode)) byCode.set(s.courseCode, s.title);
    return [...byCode.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  if (!block) return <p>Choose a program and semester first.</p>;
  if (!catalog) return <p>Loading the catalog for {state.calendarTerm}…</p>;

  const rows = [
    ...buildRequirementRows(block, state, catalog),
    ...extraCourseRows(state, block, catalog),
  ];
  const units = totalUnits(rows);

  const withCourses = (codes: string[]) => onChange({ ...state, requiredCourses: codes });

  const toggle = (row: RequirementRow) => {
    if (!row.courseCode) return;
    withCourses(
      row.selected
        ? state.requiredCourses.filter((c) => c !== row.courseCode)
        : [...state.requiredCourses, row.courseCode]
    );
  };

  const fillElective = (row: RequirementRow, code: string) => {
    const fills = { ...state.electiveFills };
    const previous = fills[row.slotId];
    let courses = state.requiredCourses.filter((c) => c !== previous);
    if (code) {
      fills[row.slotId] = code;
      if (!courses.includes(code)) courses = [...courses, code];
    } else {
      delete fills[row.slotId];
    }
    onChange({ ...state, electiveFills: fills, requiredCourses: courses });
  };

  const addCourse = (code: string) => {
    if (!code || state.requiredCourses.includes(code)) return;
    withCourses([...state.requiredCourses, code]);
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

      <p>
        <label>
          Add another course{" "}
          <select value="" onChange={(e) => addCourse(e.target.value)}>
            <option value="">— search the catalog —</option>
            {courseOptions.map(([code, title]) => (
              <option key={code} value={code}>
                {code} — {title}
              </option>
            ))}
          </select>
        </label>
      </p>
    </section>
  );
}
