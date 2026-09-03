// Plan limits per tier. The user's actual plan (from their profile) drives
// the limits applied across the app — admin plan changes take effect here.

export type PlanTier = "free" | "starter" | "medium" | "premium";

export interface PlanLimits {
  maxCompanies: number;
  maxActiveConnectors: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: { maxCompanies: 30, maxActiveConnectors: 1 },
  starter: { maxCompanies: 100, maxActiveConnectors: 3 },
  medium: { maxCompanies: 500, maxActiveConnectors: 5 },
  premium: { maxCompanies: Infinity, maxActiveConnectors: Infinity },
};

/** Backward-compatible alias for the free-tier limits. */
export const FREE_PLAN_LIMITS = PLAN_LIMITS.free;

export const getEffectiveLimits = (plan: PlanTier = "free"): PlanLimits =>
  PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

export const isUnlimited = (value: number) => !Number.isFinite(value);

export const formatLimit = (value: number) =>
  isUnlimited(value) ? "Unlimited" : String(value);
