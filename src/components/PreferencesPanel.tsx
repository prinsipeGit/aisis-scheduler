import type { Catalog, Day, Meeting, ProfRating, RankCriterion, UserState } from "../lib/types";
import { formatTime } from "../lib/time";
import { sameCourseCode } from "../lib/course-code";

const CRITERIA: { id: RankCriterion; label: string }[] = [
  { id: "compactDays", label: "Compact days (fewest gaps)" },
  { id: "fewestDays", label: "Fewest days on campus" },
  { id: "lateStart", label: "Later starts" },
  { id: "earlyEnd", label: "Earlier ends" },
  { id: "preferredProfs", label: "Preferred professors" },
];
const DAYS: Day[] = ["M", "T", "W", "TH", "F", "SAT", "SUN"];
const HOURS = Array.from({ length: 15 }, (_, i) => 420 + i * 60); // 7:00 AM – 9:00 PM

interface Props {
  catalog: Catalog | null;
  state: UserState;
  onChange: (s: UserState) => void;
}

export function PreferencesPanel({ catalog, state, onChange }: Props) {
  if (!catalog) return <p>Loading the catalog for {state.calendarTerm}…</p>;

  const prefs = state.preferences;
  const setPrefs = (p: Partial<UserState["preferences"]>) =>
    onChange({ ...state, preferences: { ...prefs, ...p } });

  const toggleCriterion = (id: RankCriterion) =>
    setPrefs({
      criteria: prefs.criteria.includes(id)
        ? prefs.criteria.filter((c) => c !== id)
        : [...prefs.criteria, id],
    });

  const moveCriterion = (id: RankCriterion, direction: -1 | 1) => {
    const from = prefs.criteria.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= prefs.criteria.length) return;
    const criteria = [...prefs.criteria];
    [criteria[from], criteria[to]] = [criteria[to], criteria[from]];
    setPrefs({ criteria });
  };

  const setBlock = (i: number, block: Meeting) =>
    setPrefs({ protectedBlocks: prefs.protectedBlocks.map((b, j) => (j === i ? block : b)) });

  const restoreExcluded = (key: string) =>
    setPrefs({ excludedSections: prefs.excludedSections.filter((k) => k !== key) });
  const restoreFull = (key: string) =>
    onChange({ ...state, fullSections: state.fullSections.filter((k) => k !== key) });

  // One row per (course, professor) pair among the user's chosen courses.
  const teachingPairs: { courseCode: string; name: string }[] = [];
  const seenTeachingPairs = new Set<string>();
  for (const s of catalog.sections) {
    if (!state.requiredCourses.some((code) => sameCourseCode(code, s.courseCode))) continue;
    for (const name of s.instructors) {
      if (!name) continue;
      const pairKey = `${s.courseCode}\u0000${name}`;
      if (!seenTeachingPairs.has(pairKey)) {
        seenTeachingPairs.add(pairKey);
        teachingPairs.push({ courseCode: s.courseCode, name });
      }
    }
  }
  teachingPairs.sort((a, b) => a.courseCode.localeCompare(b.courseCode) || a.name.localeCompare(b.name));

  const ratingOf = (courseCode: string, name: string) =>
    state.personalRatings.find((r) => r.name === name && r.courseCode === courseCode)?.rating;

  const setRating = (courseCode: string, name: string, value: string) => {
    const others = state.personalRatings.filter(
      (r) => !(r.name === name && r.courseCode === courseCode)
    );
    if (value === "") {
      onChange({ ...state, personalRatings: others });
      return;
    }
    const rating = Number(value) as ProfRating["rating"];
    onChange({
      ...state,
      personalRatings: [...others, { name, rating, courseCode }],
    });
  };

  const timeSelect = (value: number | undefined, set: (v: number | undefined) => void) => (
    <select
      value={value ?? ""}
      onChange={(e) => set(e.target.value === "" ? undefined : Number(e.target.value))}
    >
      <option value="">any time</option>
      {HOURS.map((h) => (
        <option key={h} value={h}>{formatTime(h)}</option>
      ))}
    </select>
  );

  return (
    <section>
      <div className="section-heading">
        <p className="eyebrow">Step 5</p>
        <h2>Fine-tune your preferences</h2>
        <p>Prioritize what matters, protect personal time, and manage section choices.</p>
      </div>
      <div className="settings-section">
      <h2>Ranking criteria (priority = order checked)</h2>
      <ul>
        {CRITERIA.map(({ id, label }) => {
          const pos = prefs.criteria.indexOf(id);
          return (
            <li key={id}>
              <label>
                <input type="checkbox" checked={pos >= 0} onChange={() => toggleCriterion(id)} />{" "}
                {label}
                {pos >= 0 ? ` — priority ${pos + 1}` : ""}
              </label>
              {pos >= 0 && (
                <>
                  {" "}<button type="button" disabled={pos === 0} onClick={() => moveCriterion(id, -1)} aria-label={`Move ${label} up`}>↑</button>
                  {" "}<button type="button" disabled={pos === prefs.criteria.length - 1} onClick={() => moveCriterion(id, 1)} aria-label={`Move ${label} down`}>↓</button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      </div>

      <div className="settings-section">
      <h2>Time limits</h2>
      <label>No classes before {timeSelect(prefs.earliestStart, (v) => setPrefs({ earliestStart: v }))}</label>{" "}
      <label>No classes after {timeSelect(prefs.latestEnd, (v) => setPrefs({ latestEnd: v }))}</label>

      <h2>Protected time blocks</h2>
      {prefs.protectedBlocks.map((block, i) => (
        <div key={i}>
          <select
            value={block.days[0]}
            onChange={(e) => setBlock(i, { ...block, days: [e.target.value as Day] })}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select aria-label={`Protected block ${i + 1} start`} value={block.start} onChange={(e) => {
            const start = Number(e.target.value);
            setBlock(i, { ...block, start, end: Math.max(block.end, start + 60) });
          }}>
            {/* The grid's last hour is excluded: a block starting there has no end to pick. */}
            {HOURS.slice(0, -1).map((h) => (
              <option key={h} value={h}>{formatTime(h)}</option>
            ))}
          </select>
          {" – "}
          <select aria-label={`Protected block ${i + 1} end`} value={block.end} onChange={(e) => setBlock(i, { ...block, end: Number(e.target.value) })}>
            {HOURS.filter((h) => h > block.start).map((h) => (
              <option key={h} value={h}>{formatTime(h)}</option>
            ))}
          </select>{" "}
          <button onClick={() => setPrefs({ protectedBlocks: prefs.protectedBlocks.filter((_, j) => j !== i) })}>
            Remove
          </button>
        </div>
      ))}
      <button onClick={() => setPrefs({ protectedBlocks: [...prefs.protectedBlocks, { days: ["M"], start: 720, end: 780 }] })}>
        Add protected block
      </button>
      </div>

      <div className="settings-section">
      <h2>Excluded sections</h2>
      {prefs.excludedSections.length === 0 ? (
        <p>None excluded.</p>
      ) : (
        <ul>
          {prefs.excludedSections.map((key) => (
            <li key={key}>
              {key}{" "}
              <button onClick={() => restoreExcluded(key)}>Restore</button>
            </li>
          ))}
        </ul>
      )}

      <h2>Sections marked full</h2>
      {state.fullSections.length === 0 ? <p>None marked full.</p> : (
        <ul>
          {state.fullSections.map((key) => (
            <li key={key}>{key} <button type="button" onClick={() => restoreFull(key)}>Restore</button></li>
          ))}
        </ul>
      )}
      </div>

      <div className="settings-section">
      <h2>My professor ratings</h2>
      {teachingPairs.length === 0 && <p>Pick courses first to rate their professors.</p>}
      <ul>
        {teachingPairs.map(({ courseCode, name }) => (
          <li key={`${courseCode}|${name}`}>
            <label>
              {name} — {courseCode}{" "}
              <select
                value={ratingOf(courseCode, name) ?? ""}
                onChange={(e) => setRating(courseCode, name, e.target.value)}
              >
                <option value="">unrated</option>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} ★
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
      </div>
    </section>
  );
}
