interface Props {
  hasProgram: boolean;
  hasBlock: boolean;
  hasCourses: boolean;
}

export function EmptyStage({ hasProgram, hasBlock, hasCourses }: Props) {
  const steps = [
    { done: hasProgram, label: "Pick your program" },
    { done: hasBlock, label: "Pick your semester" },
    { done: hasCourses, label: "Review your courses" },
  ];
  return (
    <div className="empty-stage">
      <h2>Your week appears here</h2>
      <ol>
        {steps.map((s) => (
          <li key={s.label}>{s.done ? "Done" : "To do"} - {s.label}</li>
        ))}
      </ol>
    </div>
  );
}
