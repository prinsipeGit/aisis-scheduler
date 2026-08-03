import type { Catalog, CurriculumBlock, CurriculumEntry, Section, Slot } from "./types";
import { sectionKey } from "./types";
import { isPreAssigned, sectionsFor, type AliasFile } from "./offerings";

export type SlotStatus =
  | "ok"               // has candidate sections
  | "unfilled"         // an elective with no course chosen yet
  | "no-offerings"     // resolves to a course, but nothing is offered this term
  | "awaiting-section"; // pre-assigned; the student must supply their section (§5.6)

export interface ResolvedSlot {
  slot: Slot;
  sections: Section[];     // candidates generation may use
  allSections: Section[];  // every section of every acceptable code, for the pin picker
  status: SlotStatus;
  pinned: string | null;
}

const slotId = (entry: CurriculumEntry) => `ips:${entry.slotId}`;

function toSlot(entry: CurriculumEntry, block: CurriculumBlock): Slot {
  return {
    id: slotId(entry),
    origin: "ips",
    label: entry.catNo,
    // An elective has no concrete code, so it resolves to nothing until filled (§5.2).
    requirement: entry.isElective ? null : entry.catNo,
    category: entry.category || null,
    sourceBlock: block.key,
    chosen: null,
    pairedWith: null,
    included: !entry.isElective,
  };
}

// Link slots whose categories are declared a pair, in both directions (§5.4).
function linkPairs(slots: Slot[], file: AliasFile): Slot[] {
  const byCategory = new Map(slots.filter((s) => s.category).map((s) => [s.category!, s]));
  for (const [a, b] of file.pairs) {
    const first = byCategory.get(a);
    const second = byCategory.get(b);
    if (first && second) {
      first.pairedWith = second.id;
      second.pairedWith = first.id;
    }
  }
  return slots;
}

export function seedSlots(block: CurriculumBlock, file: AliasFile): Slot[] {
  return linkPairs(block.entries.map((entry) => toSlot(entry, block)), file);
}

// Adding a requirement from another block (§11.5). Returns the pair partner too: importing
// half a lecture/lab pair would leave a slot whose partner does not exist, silently dropping
// the constraint.
export function slotsFromCurriculum(
  entry: CurriculumEntry, block: CurriculumBlock, file: AliasFile
): Slot[] {
  const partnerCategory = file.pairs
    .find(([a, b]) => a === entry.category || b === entry.category)
    ?.find((c) => c !== entry.category);
  const partner = partnerCategory
    ? block.entries.find((e) => e.category === partnerCategory)
    : undefined;
  const entries = partner ? [entry, partner] : [entry];
  return linkPairs(entries.map((e) => toSlot(e, block)), file);
}

export function slotFromCatalog(code: string, index: number): Slot {
  return {
    id: `added:${index}`,
    origin: "added",
    label: code,
    requirement: code,
    category: null,
    sourceBlock: null,
    chosen: null,
    pairedWith: null,
    included: true,
  };
}

export function resolveSlots(
  slots: Slot[], catalog: Catalog, file: AliasFile, locked: string[]
): ResolvedSlot[] {
  // A locked key belongs to at most one slot, first match among included slots wins. Slots
  // may accept the same codes — PFT3 and PFT4 alias to the identical 23-activity pool — and
  // letting both claim one key pins both to one section, which then conflicts with itself and
  // reports zero schedules as "PATHFit 3 and PATHFit 4 always conflict".
  //
  // An excluded slot must never claim: `generate` filters `active` on `slot.included`, so a
  // claim by an excluded slot is inert - that slot never generates - while the still-included
  // sibling that shares the pool sees `pinned: null` and plans freely around the very section
  // the student was assigned. Unchecking a block-seeded slot in the Courses rail is the only
  // affordance offered for it (Remove is withheld there), so this is reachable.
  const claimed = new Set<string>();
  return slots.map((slot) => {
    // Computed once and returned on every branch: the pin picker must still list the
    // alternatives when `sections` has been narrowed to one or emptied.
    const allSections = sectionsFor(slot, catalog, file);

    // A pin is a locked section belonging to one of this slot's acceptable codes, claimable
    // only by a slot that will actually generate.
    const pinnedSection = slot.included
      ? allSections.find((s) => locked.includes(sectionKey(s)) && !claimed.has(sectionKey(s)))
      : undefined;
    if (pinnedSection) {
      claimed.add(sectionKey(pinnedSection));
      return {
        slot, allSections, sections: [pinnedSection],
        status: "ok" as const, pinned: sectionKey(pinnedSection),
      };
    }

    if (slot.requirement === null && slot.chosen === null) {
      return { slot, allSections, sections: [], status: "unfilled" as const, pinned: null };
    }

    // Pre-assigned, included, and not pinned: excluded from generation, but say why. Treating
    // its 103 sections as free choices multiplies the search space and truncates every ranking
    // (§5.6). Only where there is something to pin: INTACT 12 and INTAC 2 are pre-assigned and
    // absent from this term, and "set your section under Classes you already have" points
    // at a row that section never renders - it lists only slots with sections.
    //
    // Gated on `slot.included` too: an excluded slot can never hold a pin (the claim above is
    // itself gated on `included`), so this text would always point at a row AlreadyHaveSection
    // never renders for it - that list is filtered on `included` as well - even when the
    // student already set the section before unchecking the slot.
    if (slot.included && isPreAssigned(slot, file) && allSections.length > 0) {
      return { slot, allSections, sections: [], status: "awaiting-section" as const, pinned: null };
    }

    return {
      slot,
      allSections,
      sections: allSections,
      status: allSections.length > 0 ? ("ok" as const) : ("no-offerings" as const),
      pinned: null,
    };
  });
}

// Units for the slots the student has selected. A slot's units come from its curriculum
// entry where it has one, else from the catalog section it resolves to.
export function totalUnits(resolved: ResolvedSlot[], unitsFor: (code: string) => number): number {
  return resolved.reduce((sum, r) => {
    if (!r.slot.included) return sum;
    const code = r.slot.chosen ?? r.slot.requirement;
    return code ? sum + unitsFor(code) : sum;
  }, 0);
}
