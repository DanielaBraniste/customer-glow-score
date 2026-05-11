ALTER TABLE public.company_snapshots
  ADD COLUMN IF NOT EXISTS health_score INTEGER;

CREATE INDEX IF NOT EXISTS idx_company_snapshots_company_date
  ON public.company_snapshots (company_id, snapshot_date DESC);