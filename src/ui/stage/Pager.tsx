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

  // `score` is metrics[0] (the top criterion) min-max normalized across the CURRENT candidate
  // set (ranker.ts): (value - min) / (max - min) over the schedules on screen right now. It is
  // a within-set relative position, not a ratio to anything absolute — it says nothing about
  // how well a schedule satisfies the student, only how it stands next to its neighbors here.
  // Sorting is lexicographic, so row 0 always holds the max on the top criterion and the last
  // row always holds the min: candidate 1 is always 100% and the last candidate is always 0%,
  // regardless of how tight or wide the real gap is. And when the top criterion ties across the
  // whole set (spread 0), every candidate reads 100% too — which is honest under this framing
  // (tied candidates are, by definition, all at the best value in the set) but would be a false
  // "full match" claim under an absolute-quality framing. So the copy never says "match" or
  // "satisfies" — it says where this schedule sits between the worst and best of this set on the
  // student's top preference, always attached to the rank position, never standing alone. It is
  // rendered here in the visible row (not just the .sr-only live region below) so a sighted
  // student sees it too.
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
        <span className="pager-score">{" "}&mdash; {percent}% toward the best of this set, on your top preference</span>
      </span>
      <span className="spacer" />
      <span className="sr-only" role="status" aria-live="polite">
        Schedule {index + 1} of {count} &mdash; {percent}% toward the best of this set, on your top preference.
      </span>
      <button type="button" aria-label="Next schedule"
              disabled={index >= count - 1} onClick={() => onIndex(index + 1)}>
        Next
      </button>
    </div>
  );
}
