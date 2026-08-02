import type { CurriculumBlock, Program, UserState } from "../../lib/types";
import type { Schedules } from "../useSchedules";
import { Pager } from "./Pager";
import { WeekGrid } from "./WeekGrid";
import { SectionChips } from "./SectionChips";
import { Diagnostics } from "./Diagnostics";
import { EmptyStage } from "./EmptyStage";

interface Props {
  schedules: Schedules;
  index: number;
  onIndex: (i: number) => void;
  state: UserState;
  block: CurriculumBlock | undefined;
  program: Program | undefined;
  onChange: (s: UserState) => void;
}

export function Stage({ schedules, index, onIndex, state, block, program, onChange }: Props) {
  const { ranked, diagnostics, search, resolved } = schedules;

  // Excluded from generation but still required: the week on screen is not the whole story,
  // and saying so is the point (§5.3, §5.6).
  const missing = resolved.filter((r) => r.slot.included && r.status !== "ok");

  if (ranked.length === 0) {
    if (!program || !block || state.slots.length === 0) {
      return <EmptyStage hasProgram={!!program} hasBlock={!!block} hasCourses={state.slots.length > 0} />;
    }
    // useSchedules returns resolved: [] exactly while the catalog hasn't loaded yet (it's one
    // ResolvedSlot per slot once the catalog is in). With courses chosen but nothing resolved,
    // there is no schedule failure to report yet — just data still on its way.
    if (resolved.length === 0) {
      return (
        <section>
          <h2>Loading your courses</h2>
          <p>Fetching this term's offerings. Your schedule will appear here shortly.</p>
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

  const clampedIndex = Math.min(index, ranked.length - 1);
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
      <WeekGrid schedule={current.schedule} />
      {missing.length > 0 && <MissingList missing={missing} />}
      <SectionChips schedule={current.schedule} state={state} onChange={onChange} />
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
