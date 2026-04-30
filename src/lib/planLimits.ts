// Plan limits. While the public pricing is hidden, all users are treated as
// "free" and constrained by the limits below. When pricing is re-enabled,
// this module can be extended to read the actual plan from the user profile.

export const FREE_PLAN_LIMITS = {
  maxCompanies: 30,
  maxActiveConnectors: 1,
} as const;

export const getEffectiveLimits = () => FREE_PLAN_LIMITS;
