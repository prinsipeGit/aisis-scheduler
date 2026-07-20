import { useMemo, useState } from "react";
import type { Catalog } from "../lib/types";

interface Props {
  catalog: Catalog;
  chosen: string[];
  onChange: (chosen: string[]) => void;
}

export function CoursePicker({ catalog, chosen, onChange }: Props) {
  const [search, setSearch] = useState("");
  const courses = useMemo(() => {
    const byCode = new Map<string, { title: string; sections: number }>();
    for (const s of catalog.sections) {
      const entry = byCode.get(s.courseCode) ?? { title: s.title, sections: 0 };
      entry.sections += 1;
      byCode.set(s.courseCode, entry);
    }
    return [...byCode.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  const visible = courses.filter(([code, info]) =>
    `${code} ${info.title}`.toLowerCase().includes(search.toLowerCase())
  );
  const toggle = (code: string) =>
    onChange(chosen.includes(code) ? chosen.filter((c) => c !== code) : [...chosen, code]);

  return (
    <section>
      <h2>Pick your courses this semester</h2>
      <input placeholder="Search courses…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul>
        {visible.map(([code, info]) => (
          <li key={code}>
            <label>
              <input type="checkbox" checked={chosen.includes(code)} onChange={() => toggle(code)} />{" "}
              <strong>{code}</strong> — {info.title} ({info.sections} section{info.sections === 1 ? "" : "s"})
            </label>
          </li>
        ))}
      </ul>
      <p>{chosen.length} course(s) chosen.</p>
    </section>
  );
}
