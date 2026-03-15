CREATE TABLE public.connector_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.connector_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own requests" ON public.connector_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own requests" ON public.connector_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service can read all requests" ON public.connector_requests
  FOR SELECT TO service_role USING (true);