import { useEffect, useMemo, useState } from "react";
import {
  getTerms, loadCatalog, getCommunityRatings, isStale, CatalogUnavailableError,
} from "./lib/catalog";
import { getPrograms, getCurriculum, getBlock } from "./lib/curriculum";
import { mergeRatings } from "./lib/profs";
import { loadState, saveState } from "./lib/storage";
import { seedRequiredCourses } from "./lib/requirements";
import type { Catalog, UserState } from "./lib/types";
import { ProgramPicker } from "./components/ProgramPicker";
import { SemesterPicker } from "./components/SemesterPicker";
import { CourseRequirements } from "./components/CourseRequirements";
import { PreferencesPanel } from "./components/PreferencesPanel";
import { Results } from "./components/Results";

type Tab = "program" | "semester" | "courses" | "results" | "preferences";
const TABS: { id: Tab; label: string }[] = [
  { id: "program", label: "Program" },
  { id: "semester", label: "Semester" },
  { id: "courses", label: "Courses" },
  { id: "results", label: "Results" },
  { id: "preferences", label: "Preferences" },
];

// 2026-2 exists in the AISIS dropdown but has no published schedule yet, so the
// app defaults to the newest term that actually has data (verified 2026-07-21).
const DEFAULT_TERM = "2026-1";

export default function App() {
  const [loaded] = useState(() => loadState(DEFAULT_TERM));
  const [state, setState] = useState<UserState>(loaded.state);
  const [tab, setTab] = useState<Tab>("program");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string>("");
  const catalogUnavailable = catalog === null && catalogError !== "";

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    setCatalog(null);
    setCatalogError("");
    loadCatalog(state.calendarTerm)
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCatalogError(
          err instanceof CatalogUnavailableError ? err.message : String(err)
        );
      });
    return () => {
      cancelled = true;
    };
  }, [state.calendarTerm]);

  const programs = useMemo(() => getPrograms(), []);
  const program = useMemo(
    () => (state.programId ? getCurriculum(state.programId) : undefined),
    [state.programId]
  );
  const block = useMemo(
    () => (program && state.blockKey ? getBlock(program, state.blockKey) : undefined),
    [program, state.blockKey]
  );
  const ratings = useMemo(
    () => mergeRatings(getCommunityRatings(), state.personalRatings),
    [state.personalRatings]
  );

  // Choosing a block seeds its required courses (electives stay unfilled).
  const chooseBlock = (blockKey: string) => {
    const next = program ? getBlock(program, blockKey) : undefined;
    setState((s) => ({
      ...s,
      blockKey,
      requiredCourses: next ? seedRequiredCourses(next) : [],
      electiveFills: {},
    }));
  };

  return (
    <main>
      <header className="app-header">
        <div>
          <p className="eyebrow">Ateneo class planning</p>
          <h1>AISIS Scheduler</h1>
          <p className="app-subtitle">Build a conflict-free semester around your IPS and preferences.</p>
        </div>
        <span className="privacy-badge">Saved on this device</span>
      </header>
      <nav className="tab-list" aria-label="Scheduler steps">
        {TABS.map((t, index) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            <span className="tab-number" aria-hidden="true">{index + 1}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="notice-stack">
        {loaded.wasReset && (
          <p className="banner">Saved settings were from an older version, so they were reset.</p>
        )}
        {catalogError && <p className="banner">{catalogError}</p>}
        {catalog && isStale(catalog) && (
          <p className="banner">This catalog data is over 30 days old — re-run the scraper.</p>
        )}
      </div>

      <div className="workspace-panel">
      {tab === "program" && (
        <ProgramPicker
          programs={programs}
          selectedId={state.programId}
          onSelect={(programId) =>
            setState((s) => ({ ...s, programId, blockKey: "", requiredCourses: [], electiveFills: {} }))
          }
        />
      )}
      {tab === "semester" && (
        <SemesterPicker
          program={program}
          blockKey={state.blockKey}
          calendarTerm={state.calendarTerm}
          terms={getTerms()}
          onChangeBlock={chooseBlock}
          // Section keys are term-scoped, so drop them when the term changes.
          onChangeTerm={(calendarTerm) =>
            setState((s) => ({
              ...s,
              calendarTerm,
              lockedSections: [],
              fullSections: [],
              preferences: { ...s.preferences, excludedSections: [] },
            }))
          }
        />
      )}
      {tab === "courses" && (
        catalogUnavailable ? <p role="alert">{catalogError}</p> :
          <CourseRequirements block={block} catalog={catalog} state={state} onChange={setState} />
      )}
      {tab === "results" &&
        (catalogUnavailable ? <p role="alert">{catalogError}</p> : catalog ? (
          <Results catalog={catalog} state={state} ratings={ratings} onChange={setState} />
        ) : (
          <p>Loading the catalog for {state.calendarTerm}…</p>
        ))}
      {tab === "preferences" && (
        catalogUnavailable ? <p role="alert">{catalogError}</p> :
          <PreferencesPanel catalog={catalog} state={state} onChange={setState} />
      )}
      </div>
      <footer className="app-footer">Unofficial planning tool · Always verify your final schedule in AISIS.</footer>
    </main>
  );
}
