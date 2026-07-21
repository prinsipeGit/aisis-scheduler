import { useEffect, useMemo, useState } from "react";
import { generate } from "../lib/generator";
import { rank } from "../lib/ranker";
import { buildRequirementRows, extraCourseRows, resolveCourseCodes } from "../lib/requirements";
import type { Catalog, CurriculumBlock, ProfRating, UserState } from "../lib/types";
import { sectionKey } from "../lib/types";
import { ScheduleGrid } from "./ScheduleGrid";
import { sameCourseCode } from "../lib/course-code";

const PAGE = 10;

interface Props {
  catalog: Catalog;
  block: CurriculumBlock | undefined;
  state: UserState;
  ratings: Map<string, ProfRating>;
  onChange: (s: UserState) => void;
}

export function Results({ catalog, block, state, ratings, onChange }: Props) {
  // Keep unavailable selections in saved state, but do not send them to the engine.
  const resolvedCourses = useMemo(() => {
    if (!block) {
      // No block chosen yet: fall back to "has at least one section" so a
      // 0-section course still never reaches the engine.
      return state.requiredCourses.filter((code) =>
        catalog.sections.some((s) => sameCourseCode(s.courseCode, code))
      );
    }
    const rows = [
      ...buildRequirementRows(block, state, catalog),
      ...extraCourseRows(state, block, catalog),
    ];
    return resolveCourseCodes(rows);
  }, [catalog, state, block]);

  const { schedules, diagnostics, search } = useMemo(
    () => generate(catalog.sections, { ...state, requiredCourses: resolvedCourses }),
    [catalog, state, resolvedCourses]
  );
  const ranked = useMemo(
    () => rank(schedules, state.preferences, ratings),
    [schedules, state.preferences, ratings]
  );
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [catalog, state.requiredCourses, state.lockedSections,
    state.fullSections, state.preferences]);

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
        excludedSections: state.preferences.excludedSections.includes(key)
          ? state.preferences.excludedSections
          : [...state.preferences.excludedSections, key],
      },
    });

  if (state.requiredCourses.length === 0) return <p>Pick courses first.</p>;
  // Without this, the engine would receive zero courses and emit one empty schedule.
  if (resolvedCourses.length === 0) {
    return (
      <p role="alert">
        None of your selected courses are offered in {state.calendarTerm}. Adjust your
        courses or pick a different term.
      </p>
    );
  }

  if (ranked.length === 0) {
    return (
      <section>
        <div className="empty-state"><span className="empty-icon">×</span><h2>No valid schedule found</h2>
        <p>Try relaxing a preference or changing one of your selected courses.</p></div>
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
                excluding a section, relaxing a time limit, or swapping a course.
              </p>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <section>
      <div className="section-heading split-heading">
        <div><p className="eyebrow">Step 4</p><h2>Your schedule options</h2><p>Ranked using your selected priorities.</p></div>
        <div className="metric"><strong>{ranked.length}</strong><span>candidates</span></div>
      </div>
      <p className="sr-only">{ranked.length} candidate schedule(s), ranked best first</p>
      {search.truncated && (
        <p className="banner" role="status">
          Search reached its {search.limit}-schedule safety limit. Rankings apply to these
          candidates; add filters or lock a section to narrow the search.
        </p>
      )}
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
                  {s.timeStatus === "tba" || (s.timeStatus === undefined && s.meetings.length === 0)
                    ? " · time TBA"
                    : ""}{" "}
                  <button onClick={() => toggle("lockedSections", key)}>
                    {state.lockedSections.includes(key) ? "Unlock" : "Lock"}
                  </button>{" "}
                  <button onClick={() => toggle("fullSections", key)}>Mark full</button>{" "}
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
