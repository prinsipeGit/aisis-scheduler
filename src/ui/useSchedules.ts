import { useMemo } from "react";
import { generate } from "../lib/generator";
import { rank, type RankedSchedule } from "../lib/ranker";
import { resolveSlots, type ResolvedSlot } from "../lib/slots";
import type { AliasFile } from "../lib/offerings";
import type { Catalog, Diagnostics, ProfRating, SearchSummary, UserState } from "../lib/types";

export interface Schedules {
  resolved: ResolvedSlot[];
  ranked: RankedSchedule[];
  diagnostics: Diagnostics | null;
  search: SearchSummary;
}

export function useSchedules(
  catalog: Catalog | null,
  state: UserState,
  ratings: Map<string, ProfRating>,
  aliases: AliasFile
): Schedules {
  const resolved = useMemo(
    () => (catalog ? resolveSlots(state.slots, catalog, aliases, state.lockedSections) : []),
    [catalog, state.slots, state.lockedSections, aliases]
  );

  const { schedules, diagnostics, search } = useMemo(
    () => generate(resolved, state),
    [resolved, state]
  );

  const ranked = useMemo(
    () => rank(schedules, state.preferences, ratings),
    [schedules, state.preferences, ratings]
  );

  return { resolved, ranked, diagnostics, search };
}
