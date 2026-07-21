import type { Catalog, Day, Meeting, ProfRating, RankCriterion, UserState } from "../lib/types";
import { formatTime } from "../lib/time";

const CRITERIA: { id: RankCriterion; label: string }[] = [
  { id: "compactDays", label: "Compact days (fewest gaps)" },
  { id: "fewestDays", label: "Fewest days on campus" },
  { id: "lateStart", label: "Later starts" },
  { id: "earlyEnd", label: "Earlier ends" },
  { id: "preferredProfs", label: "Preferred professors" },
];
const DAYS: Day[] = ["M", "T", "W", "TH", "F", "SAT"];
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

  const setBlock = (i: number, block: Meeting) =>
    setPrefs({ protectedBlocks: prefs.protectedBlocks.map((b, j) => (j === i ? block : b)) });

  const restoreExcluded = (key: string) =>
    setPrefs({ excludedSections: prefs.excludedSections.filter((k) => k !== key) });

  // One row per (course, professor) pair among the user's chosen courses.
  const teachingPairs: { courseCode: string; name: string }[] = [];
  for (const s of catalog.sections) {
    if (!state.requiredCourses.includes(s.courseCode)) continue;
    for (const name of s.instructors) {
      if (!name) continue;
      if (!teachingPairs.some((p) => p.courseCode === s.courseCode && p.name === name)) {
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
            </li>
          );
        })}
      </ul>

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
          <select value={block.start} onChange={(e) => setBlock(i, { ...block, start: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>{formatTime(h)}</option>
            ))}
          </select>
          {" – "}
          <select value={block.end} onChange={(e) => setBlock(i, { ...block, end: Number(e.target.value) })}>
            {HOURS.map((h) => (
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
    </section>
  );
}
