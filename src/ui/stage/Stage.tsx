import { useEffect, useRef, useState } from "react";
import type { CurriculumBlock, Program, Section, UserState } from "../../lib/types";
import { sectionKey } from "../../lib/types";
import type { Schedules } from "../useSchedules";
import { downloadScheduleImage } from "../export/scheduleImage";
import { Pager } from "./Pager";
import { WeekGrid } from "./WeekGrid";
import { SectionChips } from "./SectionChips";
import { Diagnostics } from "./Diagnostics";
import { EmptyStage } from "./EmptyStage";
import { CandidateList } from "../candidates/CandidateList";
import { SectionSwitcher } from "./SectionSwitcher";

interface Props {
  schedules: Schedules;
  index: number;
  onIndex: (i: number) => void;
  state: UserState;
  block: CurriculumBlock | undefined;
  program: Program | undefined;
  onChange: (s: UserState) => void;
  // Whether the term's catalog fetch failed outright, as opposed to simply not having
  // resolved yet. Stage can't tell those two apart on its own — App owns the fetch and the
  // resulting error, so it hands the verdict down instead of Stage guessing from `resolved`.
  catalogFailed?: boolean;
}

export function Stage({ schedules, index, onIndex, state, block, program, onChange, catalogFailed = false }: Props) {
  const { ranked, diagnostics, search, resolved } = schedules;
  // Survives across renders so a candidate change can be compared with the one before it.
  const seen = useRef<Set<string>>(new Set());
  const [switching, setSwitching] = useState<Section | null>(null);

  // Excluded from generation but still required: the week on screen is not the whole story,
  // and saying so is the point (§5.3, §5.6).
  const missing = resolved.filter((r) => r.slot.included && r.status !== "ok");

  // Which sections this candidate has that the last one did not. Paging through 500 near-identical
  // weeks the useful question is never "what is this schedule" but "what moved", so the blocks
  // that actually changed announce themselves and the rest stay put.
  //
  // Computed before the early returns below, because the effect that advances the ref is a hook
  // and hooks cannot sit behind a conditional return. The ref is read during render but written
  // only after commit: writing it during render makes the diff wrong under StrictMode, which
  // invokes render twice — the second pass would see the ref already advanced and conclude that
  // nothing had changed.
  const clampedIndex = Math.max(0, Math.min(index, ranked.length - 1));
  const keys = ranked.length > 0 ? ranked[clampedIndex].schedule.map(sectionKey) : [];
  const changed = new Set(keys.filter((k) => !seen.current.has(k)));
  useEffect(() => { seen.current = new Set(keys); });

  if (ranked.length === 0) {
    if (!program || !block || state.slots.length === 0) {
      return <EmptyStage hasProgram={!!program} hasBlock={!!block} hasCourses={state.slots.length > 0} />;
    }
    // useSchedules returns resolved: [] exactly while the catalog hasn't loaded yet (it's one
    // ResolvedSlot per slot once the catalog is in). With courses chosen but nothing resolved,
    // there is no schedule failure to report yet — just data still on its way.
    if (resolved.length === 0) {
      if (catalogFailed) {
        // The banner above already explains what broke; this just has to stop claiming data
        // is still on its way.
        return (
          <section>
            <h2>Course data unavailable</h2>
            <p>This term's offerings didn't load. See the notice above for what happened.</p>
          </section>
        );
      }
      return (
        <section>
          <h2>Loading your courses</h2>
          <p>Fetching this term's offerings. Your schedule will appear here shortly.</p>
        </section>
      );
    }
    // No slot is both included and resolved, so generation never had a candidate to place.
    // That is a normal state — everything unchecked, or a thesis/intersession block whose
    // courses are simply not in this term — not a search that failed. "No schedule fits"
    // would send the student off loosening filters that were never the problem.
    if (resolved.every((r) => !r.slot.included || r.status !== "ok")) {
      return (
        <section>
          <h2>Nothing to schedule yet</h2>
          <p>
            Nothing you have checked has a section this term. Check a course under Your
            courses, fill an elective, or add a course from the catalog.
          </p>
          {missing.length > 0 && <MissingList missing={missing} />}
        </section>
      );
    }
    return (
      <section>
        <h2>No schedule fits</h2>
        <p>Loosen a time limit, swap a course, or restore an excluded section.</p>
        {missing.length > 0 && <MissingList missing={missing} />}
        {diagnostics && <Diagnostics diagnostics={diagnostics} />}
      </section>
    );
  }

  const current = ranked[clampedIndex];

  return (
    <section>
      {search.truncated && (
        <p className="banner" role="status">
          Search hit its {search.limit}-schedule limit. Rankings apply to these candidates;
          pin a section or add a filter to narrow it.
        </p>
      )}
      <Pager index={clampedIndex} count={ranked.length} score={current.score} onIndex={onIndex} />
      {/* The candidate list used to be a third column that read as static, because every row
          showed the same number. It scores across all criteria now, so the rows differ — and it
          belongs beside the pager it drives rather than in a rail of its own. */}
      <CandidateList ranked={ranked} index={clampedIndex} onPick={onIndex} />
      <WeekGrid schedule={current.schedule} changed={changed} onSectionClick={setSwitching} />
      {missing.length > 0 && <MissingList missing={missing} />}
      {/* The codes are what the student actually types into AISIS, so they get a frame of
          their own with the handoff attached, rather than trailing off the bottom of the page. */}
      <div className="enlist">
        <div className="enlist-head">
          <span className="enlist-title">Enlist these sections</span>
          <span className="enlist-actions">
            <button type="button" className="btn-primary"
                    onClick={() => downloadScheduleImage(current.schedule, {
                      program: program?.code ?? "",
                      block: block?.key.replace("|", " / ") ?? "",
                      term: state.calendarTerm,
                    })}>
              Download schedule
            </button>
          </span>
        </div>
        <SectionChips schedule={current.schedule} state={state} onChange={onChange} />
      </div>
      {switching && (
        <SectionSwitcher selected={switching} schedule={current.schedule} resolved={resolved}
                         state={state} onChange={onChange} onClose={() => setSwitching(null)} />
      )}
    </section>
  );
}

function MissingList({ missing }: { missing: Schedules["resolved"] }) {
  return (
    <div className="banner" role="status">
      <strong>Not in this schedule:</strong>
      <ul>
        {missing.map((r) => (
          <li key={r.slot.id}>
            {r.slot.label}
            {r.status === "awaiting-section" && " - pre-assigned; set your section"}
            {r.status === "no-offerings" && " - not offered this term"}
            {r.status === "unfilled" && " - no course chosen yet"}
          </li>
        ))}
      </ul>
    </div>
  );
}
