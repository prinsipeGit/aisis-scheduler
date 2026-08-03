import { useEffect, useRef } from "react";
import type { Catalog, UserState } from "../../lib/types";
import type { ResolvedSlot } from "../../lib/slots";
import { PreferencesSection } from "./PreferencesSection";

interface Props {
  catalog: Catalog | null;
  state: UserState;
  resolved: ResolvedSlot[];
  onChange: (s: UserState) => void;
  onClose: () => void;
}

/** Preferences is the one surface complex enough to earn its own window: six groups of controls
 *  that were being crushed into a 300px column beside everything else. Editing them is a task a
 *  student comes to deliberately and then leaves, which is exactly what a modal is for. */
export function PreferencesDialog({ catalog, state, resolved, onChange, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // The stage binds the arrow keys to paging candidates. While this is open the student is
      // editing, not browsing, so the schedule must not change underneath the dialog.
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previous;
      returnTo.current?.focus();
    };
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="prefs-title"
           ref={panel} tabIndex={-1}>
        <header className="dialog-head">
          <h2 id="prefs-title">Preferences</h2>
          <button type="button" className="icon-button" aria-label="Close preferences" onClick={onClose}>
            &times;
          </button>
        </header>
        <div className="dialog-body">
          <PreferencesSection catalog={catalog} state={state} resolved={resolved} onChange={onChange} />
        </div>
        <footer className="dialog-foot">
          <p className="hint">Changes apply as you make them.</p>
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
}
