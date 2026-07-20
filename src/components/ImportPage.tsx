import { useState } from "react";
import { parseAisisTable } from "../lib/parser";
import type { Catalog, Section } from "../lib/types";
import { sectionKey } from "../lib/types";

interface Props {
  catalog: Catalog;
}

export function ImportPage({ catalog }: Props) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ sections: Section[]; warnings: string[] } | null>(null);

  const parse = () => setResult(parseAisisTable(text));

  const download = () => {
    if (!result) return;
    const merged = new Map(catalog.sections.map((s) => [sectionKey(s), s]));
    for (const s of result.sections) merged.set(sectionKey(s), s);
    const next: Catalog = {
      semester: catalog.semester,
      exportedAt: new Date().toISOString(),
      sections: [...merged.values()],
      warnings: result.warnings,
    };
    const blob = new Blob([JSON.stringify(next, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `catalog-${catalog.semester}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section>
      <h2>Import AISIS schedule data</h2>
      <p>
        Paste an AISIS class-schedule table below (or the .txt downloaded by{" "}
        <code>tools/aisis-export.js</code>), then download the merged catalog JSON and commit it
        over <code>src/data/catalog-{catalog.semester}.json</code>.
      </p>
      <textarea rows={12} style={{ width: "100%" }} value={text} onChange={(e) => setText(e.target.value)} />
      <div>
        <button onClick={parse}>Parse</button>{" "}
        <button onClick={download} disabled={!result || result.sections.length === 0}>
          Download merged catalog JSON
        </button>
      </div>
      {result && (
        <>
          <p>
            {result.sections.length} section(s) parsed, {result.warnings.length} warning(s).
          </p>
          {result.warnings.length > 0 && (
            <ul>
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
