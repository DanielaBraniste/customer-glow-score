# Change notification email sender to info@rescuro.app

## Goal
Switch the "from" address on Rescuro's email health-score notifications from `info@tadamn.org` to `info@rescuro.app`.

## Current state (verified)
- Email notifications are sent by the `send-notifications` Edge Function via Resend.
- The sender address is read from the `NOTIFICATION_FROM_EMAIL` secret (code default: `Rescuro <alerts@rescuro.com>`; the secret currently overrides it with the tadamn.org address).
- `rescuro.app` is confirmed verified as a sending domain in your Resend account, so sending from `info@rescuro.app` will work immediately.
- This affects only transactional health-score notifications. Auth emails use Lovable's default sender (no custom email domain configured) and are out of scope.

## Plan
1. Update the `NOTIFICATION_FROM_EMAIL` secret to `Rescuro <info@rescuro.app>` using `secrets--update_secret`.
2. Redeploy the `send-notifications` Edge Function so the new sender value is picked up.
3. Verify with a test notification from the profile popover ("Send Test Notification") — the email should arrive from `Rescuro <info@rescuro.app>`.

## Notes
- No code changes are required; the sender comes entirely from the secret.
- If a future email should use a different display name (e.g. "Rescuro Alerts"), the secret value can be adjusted in the same way.
