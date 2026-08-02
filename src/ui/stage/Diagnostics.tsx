import type { Diagnostics as D } from "../../lib/types";

export function Diagnostics({ diagnostics }: { diagnostics: D }) {
  return (
    <section>
      <h3>Sections available per course, after your filters</h3>
      <ul>
        {diagnostics.perSlot.map((s) => (
          <li key={s.id}>
            {s.label}: {s.afterFilters} of {s.total} usable
            {s.afterFilters === 0 ? " - all filtered out (full, excluded, or outside your time limits)" : ""}
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
          These courses cannot all fit at once, even though each pair can. Try excluding a
          section, relaxing a time limit, or swapping a course.
        </p>
      )}
    </section>
  );
}
