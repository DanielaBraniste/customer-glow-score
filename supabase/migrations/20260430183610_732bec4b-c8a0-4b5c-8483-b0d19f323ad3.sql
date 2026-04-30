CREATE TABLE public.upgrade_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID,
  email TEXT,
  trigger_reason TEXT NOT NULL,
  attempted_count INTEGER,
  current_count INTEGER,
  plan_limit INTEGER,
  scheduled_call BOOLEAN NOT NULL DEFAULT false,
  notes TEXT
);

ALTER TABLE public.upgrade_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit upgrade request"
ON public.upgrade_requests FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Users can read own upgrade requests"
ON public.upgrade_requests FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Service role can read all upgrade requests"
ON public.upgrade_requests FOR SELECT
TO service_role
USING (true);