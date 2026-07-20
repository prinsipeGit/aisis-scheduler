import { useEffect, useMemo, useState } from "react";
import { getCatalog, getCommunityRatings, isStale } from "./lib/catalog";
import { mergeRatings } from "./lib/profs";
import { loadState, saveState } from "./lib/storage";
import type { UserState } from "./lib/types";
import { CoursePicker } from "./components/CoursePicker";
import { PreferencesPanel } from "./components/PreferencesPanel";
import { Results } from "./components/Results";
import { ImportPage } from "./components/ImportPage";

type Tab = "courses" | "preferences" | "results" | "import";
const TABS: { id: Tab; label: string }[] = [
  { id: "courses", label: "Courses" },
  { id: "preferences", label: "Preferences" },
  { id: "results", label: "Results" },
  { id: "import", label: "Import" },
];

export default function App() {
  const catalog = useMemo(() => getCatalog(), []);
  const [loaded] = useState(() => loadState(catalog.semester));
  const [state, setState] = useState<UserState>(loaded.state);
  const [tab, setTab] = useState<Tab>("courses");
  useEffect(() => { saveState(state); }, [state]);
  const ratings = useMemo(
    () => mergeRatings(getCommunityRatings(), state.personalRatings),
    [state.personalRatings]
  );

  return (
    <main>
      <h1>AISIS Scheduler</h1>
      <nav>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {isStale(catalog) && (
        <p className="banner">This catalog data is over 30 days old — it may be outdated.</p>
      )}
      {loaded.wasReset && (
        <p className="banner">Saved settings were invalid or from another semester, so they were reset.</p>
      )}
      {tab === "courses" && (
        <CoursePicker
          catalog={catalog}
          chosen={state.chosenCourses}
          onChange={(chosenCourses) => setState((s) => ({ ...s, chosenCourses }))}
        />
      )}
      {tab === "preferences" && <PreferencesPanel catalog={catalog} state={state} onChange={setState} />}
      {tab === "results" && <Results catalog={catalog} state={state} ratings={ratings} onChange={setState} />}
      {tab === "import" && <ImportPage catalog={catalog} />}
    </main>
  );
}
