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

  // `score` is metrics[0] normalized across the whole candidate set (ranker.ts). Ordering is
  // lexicographic — later criteria break ties the top criterion can't see — so when the top
  // criterion ties broadly (compactDays is 0 for most schedules), every candidate gets score 1
  // even though they are genuinely ranked apart. Showing that as a bare "100% match" would lie.
  // Instead: rank position is the headline (always true, always distinguishes candidates), and
  // the score is folded in as a qualifier on the *top* criterion specifically, not as overall
  // schedule quality.
  const percent = Math.round(score * 100);

  return (
    <div className="pager">
      <button type="button" aria-label="Previous schedule"
              disabled={index === 0} onClick={() => onIndex(index - 1)}>
        Prev
      </button>
      <span className="pager-count" aria-hidden="true">
        {String(index + 1).padStart(2, "0")} / {count}
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        Schedule {index + 1} of {count}, rank {index + 1} of {count} on your top preference
        &mdash; {percent}% of this set's best score on that measure.
      </span>
      <button type="button" aria-label="Next schedule"
              disabled={index >= count - 1} onClick={() => onIndex(index + 1)}>
        Next
      </button>
    </div>
  );
}
