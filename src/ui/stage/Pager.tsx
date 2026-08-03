import { useEffect } from "react";

interface Props {
  index: number;
  count: number;
  score: number;
  onIndex: (i: number) => void;
}

const isTyping = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
};

export function Pager({ index, count, score, onIndex }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping()) return;
      if (e.key === "ArrowRight" && index < count - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count, onIndex]);

  // `score` is a within-set relative position (ranker.ts): every criterion the student ordered,
  // normalised across the candidates on screen right now and combined with decaying weights, then
  // capped so it can never rise as rank falls. It says where this schedule sits between the worst
  // and best of THIS set — nothing about how well it satisfies the student in absolute terms, and
  // nothing that carries to a different set. So the copy never says "match" or "satisfies", and
  // the number never appears without the rank position beside it. Rendered in the visible row, not
  // only the .sr-only live region, so a sighted student sees it too.
  const percent = Math.round(score * 100);

  return (
    <div className="pager">
      <button type="button" aria-label="Previous schedule"
              disabled={index === 0} onClick={() => onIndex(index - 1)}>
        Prev
      </button>
      {/* Same words, different weight: the rank is what a student reads at a glance, so it
          carries the size, and the qualifier sits quiet beside it. Split across spans purely
          for typography — the text content is unchanged. */}
      <span className="pager-count" aria-hidden="true">
        <span className="pager-rank">{String(index + 1).padStart(2, "0")} / {count}</span>
        <span className="pager-score">{" "}&mdash; {percent}% toward the best of this set, across your preferences</span>
      </span>
      <span className="spacer" />
      <span className="sr-only" role="status" aria-live="polite">
        Schedule {index + 1} of {count} &mdash; {percent}% toward the best of this set, across your preferences.
      </span>
      <button type="button" aria-label="Next schedule"
              disabled={index >= count - 1} onClick={() => onIndex(index + 1)}>
        Next
      </button>
    </div>
  );
}
