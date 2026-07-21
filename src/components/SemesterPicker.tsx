import type { Program } from "../lib/types";
import type { TermOption } from "../lib/catalog";

interface Props {
  program: Program | undefined;
  blockKey: string;
  calendarTerm: string;
  terms: TermOption[];
  onChangeBlock: (blockKey: string) => void;
  onChangeTerm: (term: string) => void;
}

export function SemesterPicker({
  program, blockKey, calendarTerm, terms, onChangeBlock, onChangeTerm,
}: Props) {
  if (!program) return <p>Choose a program first.</p>;

  return (
    <section>
      <h2>Which semester?</h2>
      <p>
        <label>
          Curriculum block (what you need){" "}
          <select value={blockKey} onChange={(e) => onChangeBlock(e.target.value)}>
            <option value="">— select —</option>
            {program.blocks.map((b) => (
              <option key={b.key} value={b.key}>
                {b.year} · {b.term} — {b.totalUnits} units
              </option>
            ))}
          </select>
        </label>
      </p>
      <p>
        <label>
          Calendar term (where to look){" "}
          <select value={calendarTerm} onChange={(e) => onChangeTerm(e.target.value)}>
            {terms.map((t) => (
              <option key={t.term} value={t.term}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </p>
    </section>
  );
}
