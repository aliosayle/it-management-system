/** Matches backend `MovementType` enum. */
export const MOVEMENT_TYPE_OPTIONS = [
  { value: "IN", text: "In (receive)" },
  { value: "OUT", text: "Out (issue)" },
  { value: "RETURN", text: "Return (to warehouse)" },
  { value: "FOUND", text: "Found / count gain" },
  { value: "SCRAP", text: "Scrap / dispose" },
  { value: "LOSS", text: "Loss / shrinkage" },
  { value: "ADJUST", text: "Adjust (set on-hand)" },
] as const;

export type MovementTypeValue = (typeof MOVEMENT_TYPE_OPTIONS)[number]["value"];

const LABELS: Record<string, string> = Object.fromEntries(
  MOVEMENT_TYPE_OPTIONS.map((o) => [o.value, o.text]),
);

export function movementTypeLabel(value: string): string {
  return LABELS[value] ?? value;
}
