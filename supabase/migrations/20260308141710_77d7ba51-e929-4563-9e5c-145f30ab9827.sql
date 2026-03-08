
-- Table to store user connector configurations
CREATE TABLE public.user_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  connector_id TEXT NOT NULL, -- e.g. 'hubspot', 'intercom', 'salesforce'
  api_key TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT false,
  last_import_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);

ALTER TABLE public.user_connectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own connectors"
  ON public.user_connectors FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connectors"
  ON public.user_connectors FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connectors"
  ON public.user_connectors FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own connectors"
  ON public.user_connectors FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Table to log import runs
CREATE TABLE public.import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  connector_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, success, failed
  records_imported INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own import logs"
  ON public.import_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can insert/update import logs (from edge function)
CREATE POLICY "Service can manage import logs"
  ON public.import_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Also allow service role full access on user_connectors for the cron job
CREATE POLICY "Service can read all connectors"
  ON public.user_connectors FOR SELECT
  TO service_role
  USING (true);
