import { useMemo, useState } from "react";
import { generate } from "../lib/generator";
import { rank } from "../lib/ranker";
import { getCurriculum, getBlock } from "../lib/curriculum";
import { buildRequirementRows, extraCourseRows, resolveCourseCodes } from "../lib/requirements";
import type { Catalog, ProfRating, UserState } from "../lib/types";
import { sectionKey } from "../lib/types";
import { ScheduleGrid } from "./ScheduleGrid";

const PAGE = 10;

interface Props {
  catalog: Catalog;
  state: UserState;
  ratings: Map<string, ProfRating>;
  onChange: (s: UserState) => void;
}

export function Results({ catalog, state, ratings, onChange }: Props) {
  // resolveCourseCodes (Task 8) is what's supposed to feed generate(): it drops
  // any selected course with zero sections this term ("not offered") so it
  // can't silently block every other required course. The narrowed list is
  // built here, for this call only, and never written back to `state` — doing
  // so would delete the user's not-offered selections from storage. The
  // "not offered" surfacing itself lives in the Courses tab.
  const resolvedCourses = useMemo(() => {
    const program = state.programId ? getCurriculum(state.programId) : undefined;
    const block = program && state.blockKey ? getBlock(program, state.blockKey) : undefined;
    if (!block) {
      // No block chosen yet: fall back to "has at least one section" so a
      // 0-section course still never reaches the engine.
      return state.requiredCourses.filter((code) =>
        catalog.sections.some((s) => s.courseCode === code)
      );
    }
    const rows = [
      ...buildRequirementRows(block, state, catalog),
      ...extraCourseRows(state, block, catalog),
    ];
    return resolveCourseCodes(rows);
  }, [catalog, state]);

  const { schedules, diagnostics } = useMemo(
    () => generate(catalog.sections, { ...state, requiredCourses: resolvedCourses }),
    [catalog, state, resolvedCourses]
  );
  const ranked = useMemo(
    () => rank(schedules, state.preferences, ratings),
    [schedules, state.preferences, ratings]
  );
  const [shown, setShown] = useState(PAGE);

  const toggle = (field: "lockedSections" | "fullSections", key: string) => {
    const list = state[field];
    onChange({
      ...state,
      [field]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key],
    });
  };
  const exclude = (key: string) =>
    onChange({
      ...state,
      preferences: {
        ...state.preferences,
        excludedSections: [...state.preferences.excludedSections, key],
      },
    });

  if (state.requiredCourses.length === 0) return <p>Pick courses first.</p>;

  if (ranked.length === 0) {
    return (
      <section>
        <h2>No valid schedule found</h2>
        {diagnostics && (
          <>
            <h3>Sections available per course (after your filters)</h3>
            <ul>
              {diagnostics.perCourse.map((c) => (
                <li key={c.courseCode}>
                  {c.courseCode}: {c.afterFilters} of {c.total} section(s) usable
                  {c.afterFilters === 0 ? " — all filtered out (full / excluded / time limits)" : ""}
                </li>
              ))}
            </ul>
            {diagnostics.conflictPairs.length > 0 && (
              <>
                <h3>Courses that cannot fit together</h3>
                <ul>
                  {diagnostics.conflictPairs.map((p) => (
                    <li key={`${p.a}|${p.b}`}>{p.a} and {p.b} always conflict</li>
                  ))}
                </ul>
              </>
            )}
            {diagnostics.nWayConflict && (
              <p>
                These courses can't all fit together at once, even though each pair can. Try
                marking a section full, relaxing a time limit, or swapping a course.
              </p>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <section>
      <h2>{ranked.length} valid schedule(s), best first</h2>
      {ranked.slice(0, shown).map((r, i) => (
        <article key={r.schedule.map(sectionKey).join("|")} className="schedule-card">
          <h3>
            #{i + 1} · score {r.score.toFixed(2)} ·{" "}
            {r.schedule.reduce((sum, s) => sum + s.units, 0)} units
          </h3>
          <ScheduleGrid schedule={r.schedule} />
          <ul>
            {r.schedule.map((s) => {
              const key = sectionKey(s);
              return (
                <li key={key}>
                  {key} — {s.instructors.length > 0 ? s.instructors.join(", ") : "TBA"}
                  {s.modality ? ` · ${s.modality}` : ""}{" "}
                  {/* No "Mark full" in v2 — closed-class handling is out of scope. */}
                  <button onClick={() => toggle("lockedSections", key)}>
                    {state.lockedSections.includes(key) ? "Unlock" : "Lock"}
                  </button>{" "}
                  <button onClick={() => exclude(key)}>Exclude</button>
                </li>
              );
            })}
          </ul>
        </article>
      ))}
      {shown < ranked.length && <button onClick={() => setShown(shown + PAGE)}>Show more</button>}
    </section>
  );
}
