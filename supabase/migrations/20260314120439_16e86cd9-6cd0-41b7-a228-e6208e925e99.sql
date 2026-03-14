
-- Add notification settings columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS alert_threshold INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

-- Notification log table
CREATE TABLE public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  channel TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  companies_included INTEGER NOT NULL DEFAULT 0,
  alerts_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notification logs"
  ON public.notification_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service can manage notification logs"
  ON public.notification_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
