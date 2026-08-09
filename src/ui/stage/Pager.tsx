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

  // `score` is a within-set relative position, not an absolute match quality. Keep its full
  // qualification in the live announcement while the visual toolbar carries only the position;
  // repeating the long explanation beside 500 near-identical candidates overwhelms navigation.
  const percent = Math.round(score * 100);

  return (
    <div className="pager">
      <button type="button" aria-label="Previous schedule"
              disabled={index === 0} onClick={() => onIndex(index - 1)}>
        <span aria-hidden="true">&larr;</span>
      </button>
      <span className="pager-count" aria-hidden="true">
        <span className="pager-rank">Schedule {String(index + 1).padStart(2, "0")} of {count}</span>
      </span>
      <span className="spacer" />
      <span className="sr-only" role="status" aria-live="polite">
        Schedule {index + 1} of {count} &mdash; {percent}% toward the best of this set, across your preferences.
      </span>
      <button type="button" aria-label="Next schedule"
              disabled={index >= count - 1} onClick={() => onIndex(index + 1)}>
        <span aria-hidden="true">&rarr;</span>
      </button>
    </div>
  );
}
