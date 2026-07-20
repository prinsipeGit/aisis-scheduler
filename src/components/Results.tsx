import { useMemo, useState } from "react";
import { generate } from "../lib/generator";
import { rank } from "../lib/ranker";
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
  const { schedules, diagnostics } = useMemo(
    () => generate(catalog.sections, state),
    [catalog, state]
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

  if (state.chosenCourses.length === 0) return <p>Pick courses first.</p>;

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
          <h3>#{i + 1} · score {r.score.toFixed(2)}</h3>
          <ScheduleGrid schedule={r.schedule} />
          <ul>
            {r.schedule.map((s) => {
              const key = sectionKey(s);
              return (
                <li key={key}>
                  {key} — {s.instructor}{" "}
                  <button onClick={() => toggle("lockedSections", key)}>
                    {state.lockedSections.includes(key) ? "Unlock" : "Lock"}
                  </button>{" "}
                  <button onClick={() => toggle("fullSections", key)}>
                    {state.fullSections.includes(key) ? "Unmark full" : "Mark full"}
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
