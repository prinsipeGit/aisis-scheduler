import { useState } from "react";
import type { Catalog, Day, Meeting, RankCriterion, UserState } from "../../lib/types";
import { formatTime } from "../../lib/time";
import type { ResolvedSlot } from "../../lib/slots";

type TabId = "ranking" | "time" | "sections" | "professors";
const TABS: { id: TabId; label: string }[] = [
  { id: "ranking", label: "Ranking" },
  { id: "time", label: "Time" },
  { id: "sections", label: "Sections" },
  { id: "professors", label: "Professors" },
];

const CRITERIA: { id: RankCriterion; label: string }[] = [
  { id: "compactDays", label: "Compact days (fewest gaps)" },
  { id: "fewestDays", label: "Fewest days on campus" },
  { id: "lateStart", label: "Later starts" },
  { id: "earlyEnd", label: "Earlier ends" },
  { id: "preferredProfs", label: "Preferred professors" },
];
const DAYS: Day[] = ["M", "T", "W", "TH", "F", "SAT", "SUN"];
const HOURS = Array.from({ length: 15 }, (_, i) => 420 + i * 60); // 7 AM to 9 PM

interface Props {
  catalog: Catalog | null;
  state: UserState;
  resolved: ResolvedSlot[];
  onChange: (s: UserState) => void;
}

export function PreferencesSection({ catalog, state, resolved, onChange }: Props) {
  // Declared before the catalog guard: hooks cannot sit behind a conditional return.
  const [tab, setTab] = useState<TabId>("ranking");

  if (!catalog) return <p>Loading the catalog for {state.calendarTerm}...</p>;

  const prefs = state.preferences;
  const setPrefs = (p: Partial<UserState["preferences"]>) =>
    onChange({ ...state, preferences: { ...prefs, ...p } });

  const toggleCriterion = (id: RankCriterion) =>
    setPrefs({
      criteria: prefs.criteria.includes(id)
        ? prefs.criteria.filter((c) => c !== id)
        : [...prefs.criteria, id],
    });

  const move = (id: RankCriterion, direction: -1 | 1) => {
    const from = prefs.criteria.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= prefs.criteria.length) return;
    const criteria = [...prefs.criteria];
    [criteria[from], criteria[to]] = [criteria[to], criteria[from]];
    setPrefs({ criteria });
  };

  const setBlock = (i: number, block: Meeting) =>
    setPrefs({ protectedBlocks: prefs.protectedBlocks.map((b, j) => (j === i ? block : b)) });

  // Each bound's options exclude anything that would invert the range - the same "filter
  // the far end" idiom the protected-block start/end selects below already use. Without
  // this, picking an earliest-start after the latest-end would exclude every meeting in
  // generation (§ generator.ts), silently producing zero schedules instead of refusing
  // the nonsensical combination up front.
  const timeSelect = (value: number | undefined, set: (v: number | undefined) => void, hours: number[]) => (
    <select value={value ?? ""}
            onChange={(e) => set(e.target.value === "" ? undefined : Number(e.target.value))}>
      <option value="">any time</option>
      {hours.map((h) => <option key={h} value={h}>{formatTime(h)}</option>)}
    </select>
  );

  const pairs: { courseCode: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const r of resolved) {
    if (!r.slot.included) continue;
    for (const s of r.allSections) {
      for (const name of s.instructors) {
        const key = `${s.courseCode}|${name}`;
        if (name && !seen.has(key)) { seen.add(key); pairs.push({ courseCode: s.courseCode, name }); }
      }
    }
  }
  pairs.sort((a, b) => a.courseCode.localeCompare(b.courseCode) || a.name.localeCompare(b.name));

  const ratingOf = (courseCode: string, name: string) =>
    state.personalRatings.find((r) => r.name === name && r.courseCode === courseCode)?.rating;

  const setRating = (courseCode: string, name: string, value: string) => {
    const others = state.personalRatings.filter(
      (r) => !(r.name === name && r.courseCode === courseCode));
    onChange({
      ...state,
      personalRatings: value === "" ? others : [...others, { name, rating: Number(value), courseCode }],
    });
  };

  return (
    <div className="prefs">
      {/* Preferences is the densest surface in the app — six groups that used to be stacked in a
          300px column. Tabs let each one breathe without making the student scroll past four
          they did not come for. Only the active panel is mounted, so nothing hidden is
          reachable by keyboard or screen reader. */}
      <div className="tablist" role="tablist" aria-label="Preferences">
        {TABS.map(({ id, label }) => (
          <button key={id} type="button" role="tab" id={`prefs-tab-${id}`}
                  aria-selected={tab === id} aria-controls={`prefs-panel-${id}`}
                  className={tab === id ? "tab is-active" : "tab"}
                  onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="tabpanel" role="tabpanel" id={`prefs-panel-${tab}`}
           aria-labelledby={`prefs-tab-${tab}`} tabIndex={0}>

      {tab === "ranking" && <>
      <h3>Ranking priorities</h3>
      <p className="hint">The first one decides. Later ones only break ties.</p>
      <ul className="criteria">
        {/* Chosen criteria first, in the order they actually apply, then the rest. Up and Down
            move a row through this list, so the list has to BE the priority order — showing
            "priority 2" above "priority 1" made the buttons read as doing nothing. */}
        {[...CRITERIA]
          .sort((a, b) => {
            const pa = prefs.criteria.indexOf(a.id);
            const pb = prefs.criteria.indexOf(b.id);
            if (pa < 0 && pb < 0) return 0;
            if (pa < 0) return 1;
            if (pb < 0) return -1;
            return pa - pb;
          })
          .map(({ id, label }) => {
          const pos = prefs.criteria.indexOf(id);
          return (
            <li key={id} className={pos >= 0 ? "criterion is-on" : "criterion"}>
              <label>
                <input type="checkbox" checked={pos >= 0} onChange={() => toggleCriterion(id)} /> {label}
                {pos >= 0 ? ` - priority ${pos + 1}` : ""}
              </label>
              {pos >= 0 && (
                <span className="criterion-move">
                  <button type="button" disabled={pos === 0}
                          onClick={() => move(id, -1)} aria-label={`Move ${label} up`}>Up</button>
                  <button type="button" disabled={pos === prefs.criteria.length - 1}
                          onClick={() => move(id, 1)} aria-label={`Move ${label} down`}>Down</button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      </>}

      {tab === "time" && <>
      <h3>Time limits</h3>
      <label>No classes before {timeSelect(prefs.earliestStart, (v) => setPrefs({ earliestStart: v }),
        HOURS.filter((h) => prefs.latestEnd === undefined || h < prefs.latestEnd))}</label>{" "}
      <label>No classes after {timeSelect(prefs.latestEnd, (v) => setPrefs({ latestEnd: v }),
        HOURS.filter((h) => prefs.earliestStart === undefined || h > prefs.earliestStart))}</label>

      <h3>Protected time</h3>
      {prefs.protectedBlocks.map((block, i) => (
        <div key={i} className="protected-row">
          <select aria-label={`Protected block ${i + 1} day`} value={block.days[0]}
                  onChange={(e) => setBlock(i, { ...block, days: [e.target.value as Day] })}>
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select aria-label={`Protected block ${i + 1} start`} value={block.start}
                  onChange={(e) => {
                    const start = Number(e.target.value);
                    setBlock(i, { ...block, start, end: Math.max(block.end, start + 60) });
                  }}>
            {HOURS.slice(0, -1).map((h) => <option key={h} value={h}>{formatTime(h)}</option>)}
          </select>
          {" to "}
          <select aria-label={`Protected block ${i + 1} end`} value={block.end}
                  onChange={(e) => setBlock(i, { ...block, end: Number(e.target.value) })}>
            {HOURS.filter((h) => h > block.start).map((h) => <option key={h} value={h}>{formatTime(h)}</option>)}
          </select>{" "}
          <button type="button"
                  onClick={() => setPrefs({ protectedBlocks: prefs.protectedBlocks.filter((_, j) => j !== i) })}>
            Remove
          </button>
        </div>
      ))}
      <button type="button"
              onClick={() => setPrefs({ protectedBlocks: [...prefs.protectedBlocks, { days: ["M"], start: 720, end: 780 }] })}>
        Add protected block
      </button>
      </>}

      {tab === "sections" && <>
      <h3>Excluded sections</h3>
      {prefs.excludedSections.length === 0 ? <p>None excluded.</p> : (
        <ul>
          {prefs.excludedSections.map((key) => (
            <li key={key}>{key}{" "}
              <button type="button"
                      onClick={() => setPrefs({ excludedSections: prefs.excludedSections.filter((k) => k !== key) })}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Sections marked full</h3>
      {state.fullSections.length === 0 ? <p>None marked full.</p> : (
        <ul>
          {state.fullSections.map((key) => (
            <li key={key}>{key}{" "}
              <button type="button"
                      onClick={() => onChange({ ...state, fullSections: state.fullSections.filter((k) => k !== key) })}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
      </>}

      {tab === "professors" && <>
      <h3>My professor ratings</h3>
      {pairs.length === 0 && <p>Pick courses first to rate their professors.</p>}
      <ul>
        {pairs.map(({ courseCode, name }) => (
          <li key={`${courseCode}|${name}`}>
            <label>
              {name} - {courseCode}{" "}
              <select value={ratingOf(courseCode, name) ?? ""}
                      onChange={(e) => setRating(courseCode, name, e.target.value)}>
                <option value="">unrated</option>
                {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} stars</option>)}
              </select>
            </label>
          </li>
        ))}
      </ul>
      </>}

      </div>
    </div>
  );
}
