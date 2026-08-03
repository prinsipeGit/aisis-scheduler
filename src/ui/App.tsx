import { useEffect, useMemo, useState } from "react";
import "@fontsource/archivo-black/400.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import { getTerms, loadCatalog, loadCommunityRatings, isStale, CatalogUnavailableError, type TermOption } from "../lib/catalog";
import { getPrograms, loadProgram, getBlock } from "../lib/curriculum";
import { mergeRatings } from "../lib/profs";
import { loadState, saveState } from "../lib/storage";
import { defaultTerm } from "../lib/term";
import { seedSlots } from "../lib/slots";
import type { AliasFile } from "../lib/offerings";
import type { Catalog, Program, ProfRating, ProgramSummary, UserState } from "../lib/types";
import aliasData from "../../data/course-aliases.json";
import { useSchedules } from "./useSchedules";
import { ProgramSection } from "./setup/ProgramSection";
import { SemesterSection } from "./setup/SemesterSection";
import { CoursesSection } from "./setup/CoursesSection";
import { AlreadyHaveSection } from "./setup/AlreadyHaveSection";
import { PreferencesSection } from "./setup/PreferencesSection";
import { Stage } from "./stage/Stage";
import { CandidateList } from "./candidates/CandidateList";

// The JSON import's inferred type ("pairs" as string[][]) doesn't structurally match the
// AliasFile tuple type ([string, string][]), so the cast must go through `unknown` first.
const aliases = aliasData as unknown as AliasFile;

type SetupId = "program" | "semester" | "courses" | "have" | "preferences";
const SETUP: { id: SetupId; label: string }[] = [
  { id: "program", label: "Program" },
  { id: "semester", label: "Semester" },
  { id: "courses", label: "Courses" },
  { id: "have", label: "Classes you already have" },
  { id: "preferences", label: "Preferences" },
];

export default function App() {
  // The term default needs the available list, which loads asynchronously; start from the
  // stored term and correct it once terms arrive (§11.2).
  const [loaded] = useState(() => loadState(""));
  const [state, setState] = useState<UserState>(loaded.state);
  const [open, setOpen] = useState<SetupId>("program");

  const [terms, setTerms] = useState<TermOption[]>([]);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [program, setProgram] = useState<Program | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [communityRatings, setCommunityRatings] = useState<ProfRating[]>([]);

  const [catalogError, setCatalogError] = useState("");
  const [programError, setProgramError] = useState("");
  const [listError, setListError] = useState("");
  const [ratingsError, setRatingsError] = useState("");

  useEffect(() => { saveState(state); }, [state]);

  // Terms and programs are load-bearing for setup — the pickers have nothing to show without
  // them, so either failing is fatal and surfaces as a banner rather than an empty picker with
  // no explanation (§8).
  useEffect(() => {
    let cancelled = false;
    Promise.all([getTerms(), getPrograms()])
      .then(([t, p]) => {
        if (cancelled) return;
        setTerms(t); setPrograms(p);
        setState((s) => s.calendarTerm
          ? s
          : { ...s, calendarTerm: defaultTerm(new Date(), t.filter((x) => x.available).map((x) => x.term)) });
      })
      .catch((err: unknown) => {
        if (!cancelled) setListError(`Could not load programs or terms: ${err instanceof Error ? err.message : String(err)}`);
      });
    return () => { cancelled = true; };
  }, []);

  // Community ratings only tilt the ranking of candidate schedules — they are not load-bearing
  // for the term/program pickers. Kept in its own effect (rather than joining the Promise.all
  // above) so a ratings failure can't take the pickers down with it and degrades to an empty
  // ratings list instead.
  useEffect(() => {
    let cancelled = false;
    loadCommunityRatings()
      .then((r) => { if (!cancelled) setCommunityRatings(r); })
      .catch(() => {
        if (!cancelled) setRatingsError("Community ratings didn't load, so rankings may be a little off this session.");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCatalog(null); setCatalogError("");
    if (!state.calendarTerm) return;
    loadCatalog(state.calendarTerm)
      .then((c) => { if (!cancelled) setCatalog(c); })
      .catch((err: unknown) => {
        if (!cancelled) setCatalogError(err instanceof CatalogUnavailableError ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [state.calendarTerm]);

  useEffect(() => {
    let cancelled = false;
    setProgram(null); setProgramError("");
    if (!state.programId) return;
    loadProgram(state.programId)
      .then((p) => { if (!cancelled) setProgram(p); })
      .catch((err: unknown) => {
        if (!cancelled) setProgramError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [state.programId]);

  const block = useMemo(
    () => (program && state.blockKey ? getBlock(program, state.blockKey) : undefined),
    [program, state.blockKey]
  );
  const ratings = useMemo(
    () => mergeRatings(communityRatings, state.personalRatings),
    [communityRatings, state.personalRatings]
  );

  const schedules = useSchedules(catalog, state, ratings, aliases);

  const chooseBlock = (blockKey: string) => {
    const next = program ? getBlock(program, blockKey) : undefined;
    setState((s) => ({ ...s, blockKey, slots: next ? seedSlots(next, aliases) : [] }));
  };

  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [schedules.ranked]);

  return (
    <div className="cockpit">
      <header className="cockpit-header">
        <span className="wordmark">AISIS Scheduler</span>
        <span className="term-badge">{state.calendarTerm || "no term"}</span>
        <span className="privacy-badge">Saved on this device</span>
      </header>

      <div className="notice-stack">
        {loaded.wasReset && <p className="banner">Saved settings were from an older version, so they were reset.</p>}
        {listError && <p className="banner" role="alert">{listError}</p>}
        {catalogError && <p className="banner" role="alert">{catalogError}</p>}
        {programError && <p className="banner" role="alert">{programError}</p>}
        {catalog && isStale(catalog) && <p className="banner">This catalog is over 30 days old — re-run the scraper.</p>}
        {ratingsError && <p className="banner">{ratingsError}</p>}
      </div>

      <div className="zones">
        <aside className="rail rail-setup" aria-label="Setup">
          {SETUP.map(({ id, label }) => (
            <section key={id} className={open === id ? "accordion open" : "accordion"}>
              <h2>
                <button aria-expanded={open === id} onClick={() => setOpen(id)}>
                  {label}
                </button>
              </h2>
              {open === id && (
                <div className="accordion-body">
                  {id === "program" && (
                    <ProgramSection
                      programs={programs}
                      selectedId={state.programId}
                      onSelect={(programId) => setState((s) => ({ ...s, programId, blockKey: "", slots: [] }))}
                    />
                  )}
                  {id === "semester" && (
                    <SemesterSection
                      program={program ?? undefined}
                      blockKey={state.blockKey}
                      calendarTerm={state.calendarTerm}
                      terms={terms}
                      onChangeBlock={chooseBlock}
                      onChangeTerm={(calendarTerm) => setState((s) => ({
                        ...s, calendarTerm, lockedSections: [], fullSections: [],
                        preferences: { ...s.preferences, excludedSections: [] },
                      }))}
                    />
                  )}
                  {id === "courses" && (
                    <CoursesSection
                      program={program ?? undefined}
                      block={block}
                      catalog={catalog}
                      state={state}
                      resolved={schedules.resolved}
                      aliases={aliases}
                      onChange={setState}
                    />
                  )}
                  {id === "have" && (
                    <AlreadyHaveSection resolved={schedules.resolved} state={state} onChange={setState} />
                  )}
                  {id === "preferences" && (
                    <PreferencesSection catalog={catalog} state={state} resolved={schedules.resolved} onChange={setState} />
                  )}
                </div>
              )}
            </section>
          ))}
        </aside>

        <main className="stage">
          <Stage
            schedules={schedules}
            index={index}
            onIndex={setIndex}
            state={state}
            block={block}
            program={program ?? undefined}
            onChange={setState}
            catalogFailed={!!catalogError}
          />
        </main>

        <aside className="rail rail-candidates" aria-label="Candidates">
          <CandidateList ranked={schedules.ranked} index={index} onPick={setIndex} />
        </aside>
      </div>

      <footer className="cockpit-footer">Unofficial planning tool · Always verify your final schedule in AISIS.</footer>
    </div>
  );
}
