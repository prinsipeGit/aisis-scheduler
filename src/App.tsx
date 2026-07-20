import { useEffect, useMemo, useState } from "react";
import { getCatalog, isStale } from "./lib/catalog";
import { loadState, saveState } from "./lib/storage";
import type { UserState } from "./lib/types";
import { CoursePicker } from "./components/CoursePicker";

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
      {tab === "preferences" && <p>Preferences — added in Task 10.</p>}
      {tab === "results" && <p>Results — added in Task 11.</p>}
      {tab === "import" && <p>Import — added in Task 12.</p>}
    </main>
  );
}
