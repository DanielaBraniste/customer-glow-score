import { DEFAULT_SCORE_FIELDS, ScoreFieldConfig } from "@/lib/healthScore";

// UI-level configuration used in the Raw Data → Configure Fields panel.
export interface UiFieldConfig {
  key: string;
  label: string;
  weight: number;
  enabled: boolean;
  type: "number" | "date" | "text";
  align: "left" | "right";
  isCustom?: boolean;
  min?: number;
  max?: number;
}

export const DEFAULT_UI_FIELDS: UiFieldConfig[] = [
  { key: "mrr", label: "MRR ($)", weight: 20, enabled: true, type: "number", align: "right" },
  { key: "nps", label: "NPS", weight: 20, enabled: true, type: "number", align: "right", min: -100, max: 100 },
  { key: "lastLogin", label: "Last Login", weight: 10, enabled: true, type: "date", align: "left" },
  { key: "supportTickets", label: "Support Tickets", weight: 15, enabled: true, type: "number", align: "right" },
  { key: "contractEnd", label: "Contract End", weight: 10, enabled: true, type: "date", align: "left" },
  { key: "usageScore", label: "Usage Score", weight: 25, enabled: true, type: "number", align: "right" },
];

// Map a UI field config (with user-edited weight + enabled flag) into the
// ScoreFieldConfig shape that the scoring engine consumes. Built-in keys
// keep their special handling (nps range, supportTickets inversion, etc.);
// custom numeric fields default to a 0–100 scale.
export function toScoreFields(uiFields: UiFieldConfig[] | null | undefined): ScoreFieldConfig[] {
  const source = uiFields && uiFields.length ? uiFields : DEFAULT_UI_FIELDS;
  const defaultsByKey = new Map(DEFAULT_SCORE_FIELDS.map((f) => [f.key, f]));

  return source
    .filter((f) => f.enabled && f.weight > 0 && f.type !== "text")
    .map((f) => {
      const known = defaultsByKey.get(f.key);
      if (known) return { ...known, weight: f.weight };
      // Custom field
      return {
        key: f.key,
        weight: f.weight,
        type: f.type === "date" ? "date" : "number",
        min: f.min ?? 0,
        max: f.max ?? 100,
      } as ScoreFieldConfig;
    });
}

// True when two configs differ in a way that would change scores.
export function fieldsScoringDiffers(a: UiFieldConfig[], b: UiFieldConfig[]): boolean {
  const norm = (fs: UiFieldConfig[]) =>
    [...fs]
      .map((f) => ({ key: f.key, weight: f.enabled ? f.weight : 0, type: f.type }))
      .sort((x, y) => x.key.localeCompare(y.key));
  return JSON.stringify(norm(a)) !== JSON.stringify(norm(b));
}
