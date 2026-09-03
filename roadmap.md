# Roadmap

- [done] Change notification email sender to info@rescuro.app (NOTIFICATION_FROM_EMAIL secret updated to `Rescuro <info@rescuro.app>`, send-notifications redeployed).
- [done] Fix: admin plan change now takes effect — planLimits made tier-aware, usePlan hook added, AddCompanyDialog & Connectors read the real plan.
- [done] Add per-user API identifier + ingest endpoint to admin panel (admin-users edge function returns api_keys; new "API Access" tab in user detail).
