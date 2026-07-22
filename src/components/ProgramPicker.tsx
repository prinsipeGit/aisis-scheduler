import { useState } from "react";
import type { ProgramSummary } from "../lib/types";

interface Props {
  programs: ProgramSummary[];
  selectedId: string;
  onSelect: (programId: string) => void;
}

export function ProgramPicker({ programs, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const visible = programs.filter((p) =>
    `${p.code} ${p.name} ${p.versionLabel}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <section>
      <div className="section-heading">
        <p className="eyebrow">Step 1</p>
        <h2>Choose your program</h2>
        <p>Your curriculum determines the courses suggested for each semester.</p>
      </div>
      <div className="form-grid">
        <label>
          <span>Search</span>
          <input
            placeholder="Search programs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
      </div>
      <ul className="summary-list">
        {visible.map((p) => (
          <li key={p.id}>
            <strong>{p.code}</strong> — {p.name} ({p.versionLabel})
          </li>
        ))}
      </ul>
    </section>
  );
}
