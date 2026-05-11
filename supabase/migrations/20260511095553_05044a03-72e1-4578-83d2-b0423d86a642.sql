ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS score_fields JSONB;