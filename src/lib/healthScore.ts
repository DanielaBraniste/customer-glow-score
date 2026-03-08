/**
 * Health Score Calculation Engine
 *
 * Converts raw company data into a 0–100 weighted health score.
 * Each attribute is normalised to 0–100, then multiplied by its
 * weight fraction to produce a final composite score.
 */

// ── Date scoring ────────────────────────────────────────────────
// 0–3 days ago  → 100 (grace period)
// 3–30 days ago → linear decay from 100 → 0
// 30+ days ago  → 0
const GRACE_DAYS = 3;
const MAX_DAYS = 30;

export const scoreDateRecency = (dateStr: string, today: Date = new Date()): number => {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  const diffMs = today.getTime() - date.getTime();
  const days = Math.max(0, diffMs / (1000 * 60 * 60 * 24));

  if (days <= GRACE_DAYS) return 100;
  if (days >= MAX_DAYS) return 0;
  // Linear from 100 → 0 over (MAX_DAYS − GRACE_DAYS) = 27 days
  return Math.round(100 * (1 - (days - GRACE_DAYS) / (MAX_DAYS - GRACE_DAYS)));
};

// ── Number scoring ──────────────────────────────────────────────
// Normalise a number into 0–100 given a min/max range.
// `invert` flips the scale (e.g. support tickets: fewer is better).
export const scoreNumber = (
  value: number,
  min: number,
  max: number,
  invert = false,
): number => {
  if (max === min) return 50;
  const clamped = Math.max(min, Math.min(max, value));
  const normalised = (clamped - min) / (max - min);
  const score = invert ? 1 - normalised : normalised;
  return Math.round(score * 100);
};

// ── NPS scoring ─────────────────────────────────────────────────
// NPS ranges from -100 to 100 → normalise to 0–100.
export const scoreNps = (nps: number): number => {
  return scoreNumber(nps, -100, 100);
};

// ── Field definitions for the score engine ──────────────────────
export interface ScoreFieldConfig {
  key: string;
  weight: number;               // absolute weight value
  type: "number" | "date" | "nps";
  invert?: boolean;             // for numbers: lower = better?
  min?: number;
  max?: number;
}

export const DEFAULT_SCORE_FIELDS: ScoreFieldConfig[] = [
  { key: "mrr",            weight: 20, type: "number", min: 0,    max: 30000 },
  { key: "nps",            weight: 20, type: "nps" },
  { key: "lastLogin",      weight: 10, type: "date" },
  { key: "supportTickets", weight: 15, type: "number", min: 0,    max: 20, invert: true },
  { key: "contractEnd",    weight: 10, type: "date" },
  { key: "usageScore",     weight: 25, type: "number", min: 0,    max: 100 },
];

// ── Composite score ─────────────────────────────────────────────
export interface ScoreBreakdown {
  field: string;
  rawValue: string | number;
  fieldScore: number;    // 0–100 for this field
  weight: number;        // percentage weight
  contribution: number;  // fieldScore × (weight / totalWeight)
}

export interface HealthScoreResult {
  total: number;
  breakdown: ScoreBreakdown[];
}

export const calculateHealthScore = (
  data: Record<string, any>,
  fields: ScoreFieldConfig[] = DEFAULT_SCORE_FIELDS,
  today: Date = new Date(),
): HealthScoreResult => {
  const totalWeight = fields.reduce((s, f) => s + f.weight, 0);
  if (totalWeight === 0) return { total: 0, breakdown: [] };

  const breakdown: ScoreBreakdown[] = fields.map((f) => {
    const rawValue = data[f.key];
    let fieldScore = 0;

    if (f.type === "date") {
      fieldScore = scoreDateRecency(String(rawValue ?? ""), today);
    } else if (f.type === "nps") {
      fieldScore = scoreNps(Number(rawValue) || 0);
    } else {
      fieldScore = scoreNumber(
        Number(rawValue) || 0,
        f.min ?? 0,
        f.max ?? 100,
        f.invert,
      );
    }

    const contribution = fieldScore * (f.weight / totalWeight);

    return {
      field: f.key,
      rawValue: rawValue ?? "—",
      fieldScore,
      weight: Math.round((f.weight / totalWeight) * 100),
      contribution: Math.round(contribution * 10) / 10,
    };
  });

  const total = Math.round(breakdown.reduce((s, b) => s + b.contribution, 0));

  return { total, breakdown };
};
