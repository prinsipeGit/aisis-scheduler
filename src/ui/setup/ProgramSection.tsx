import { useState } from "react";
import type { ProgramSummary } from "../../lib/types";

interface Props {
  programs: ProgramSummary[];
  selectedId: string;
  onSelect: (programId: string) => void;
}

export function ProgramSection({ programs, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const visible = q
    ? programs.filter((p) => `${p.code} ${p.name} ${p.versionLabel}`.toLowerCase().includes(q))
    : programs;

  return (
    <div className="form-grid">
      <label>
        <span>Search</span>
        <input placeholder="Search programs…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      <label>
        <span>Program and curriculum year</span>
        <select value={selectedId} onChange={(e) => onSelect(e.target.value)}>
          <option value="">— select —</option>
          {visible.map((p) => (
            <option key={p.id} value={p.id}>
              ({p.code}) {p.name} — {p.versionLabel}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">{visible.length} of {programs.length} programs</p>
    </div>
  );
}
