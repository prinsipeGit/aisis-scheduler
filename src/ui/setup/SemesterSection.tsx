import type { Program } from "../../lib/types";
import type { TermOption } from "../../lib/catalog";

interface Props {
  program: Program | undefined;
  blockKey: string;
  calendarTerm: string;
  terms: TermOption[];
  onChangeBlock: (blockKey: string) => void;
  onChangeTerm: (term: string) => void;
}

export function SemesterSection({
  program, blockKey, calendarTerm, terms, onChangeBlock, onChangeTerm,
}: Props) {
  if (!program) return <p>Choose a program first.</p>;

  return (
    <div className="form-grid">
      <label>
        <span>Curriculum block</span>
        <select value={blockKey} onChange={(e) => onChangeBlock(e.target.value)}>
          <option value="">— select —</option>
          {program.blocks.map((b) => (
            <option key={b.key} value={b.key}>
              {b.year} · {b.term} — {b.totalUnits} units
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Calendar term</span>
        <select value={calendarTerm} onChange={(e) => onChangeTerm(e.target.value)}>
          {terms.map((t) => (
            <option key={t.term} value={t.term} disabled={!t.available}>
              {t.label}{t.available ? "" : " — catalog unavailable"}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        This is the block your semester starts from. You can pull courses from other blocks in the next step.
      </p>
    </div>
  );
}
