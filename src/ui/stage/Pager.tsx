import { useEffect } from "react";

interface Props {
  index: number;
  count: number;
  onIndex: (i: number) => void;
}

const isTyping = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
};

export function Pager({ index, count, onIndex }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping()) return;
      if (e.key === "ArrowRight" && index < count - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count, onIndex]);

  const isFirst = index === 0;
  const isLast = index >= count - 1;
  const optionLabel = isFirst ? "Best schedule" : `Schedule option ${index + 1}`;

  return (
    <div className="pager">
      <button type="button" className="pager-back" disabled={isFirst}
              onClick={() => onIndex(index - 1)}>
        <span aria-hidden="true">&larr;</span> Back
      </button>
      <span className="pager-option" aria-hidden="true">{optionLabel}</span>
      <span className="sr-only" role="status" aria-live="polite">
        {optionLabel}. Schedule {index + 1} of {count}.
      </span>
      <button type="button" className="btn-primary pager-generate"
              disabled={isLast} onClick={() => onIndex(index + 1)}>
        {isLast ? "No more schedules" : "Generate another"}
      </button>
    </div>
  );
}
