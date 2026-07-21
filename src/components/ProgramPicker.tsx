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
    `${p.code} ${p.name} ${p.versionYear}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <section>
      <h2>Choose your program</h2>
      <input
        placeholder="Search programs…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <p>
        <label>
          Program{" "}
          <select value={selectedId} onChange={(e) => onSelect(e.target.value)}>
            <option value="">— select —</option>
            {visible.map((p) => (
              <option key={p.id} value={p.id}>
                ({p.code}) {p.name} — {p.versionYear}
              </option>
            ))}
          </select>
        </label>
      </p>
      <ul>
        {visible.map((p) => (
          <li key={p.id}>
            <strong>{p.code}</strong> — {p.name} ({p.versionYear})
          </li>
        ))}
      </ul>
    </section>
  );
}
