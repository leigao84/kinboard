-- migrations/088_pocket_money_ledger_mirror.sql — remember which Kinboard
-- transaction each Allowance Ledger entry was mirrored to.
--
-- The Allowance Ledger (a separate little app of the household's) is the
-- single source of truth for the children's pocket money; Kinboard's side is
-- display-only. Until now a sync container reconciled the two by writing
-- pocket_money_transactions directly, remembering the pairing in its own
-- SQLite state file. The pairing now lives here, next to the data it pairs,
-- and the reconcile runs through the Integration API
-- (POST /api/integration/v1/pocket-money/ledger-sync,
-- lib/integration-pocket-money-sync.ts) instead of around it.
--
-- One row per mirrored ledger entry:
--   ledger_entry_id   the entry's id in the ledger's own database — stable
--                     across edits, which is what makes an edit here an
--                     UPDATE of the same transaction rather than a new one.
--   kinboard_tx_id    the pocket_money_transactions row it mirrors to.
--   amount_cents, note, entry_date
--                     the snapshot last pushed, so a later push can tell
--                     "unchanged" from "edited" without trusting the
--                     transaction row (which a family member could have
--                     tidied on a screen — the snapshot is what the ledger
--                     said, and the ledger wins).
--
-- The reconcile deletes from this table in step with the transactions it
-- removes, and the foreign keys cascade both ways: delete the transaction
-- (or the account, or the family) and the pairing goes with it.
--
-- Service role only, like the other integration tables (054): nothing in a
-- browser ever reads this; it is bookkeeping between two servers.

CREATE TABLE IF NOT EXISTS public.pocket_money_ledger_mirror (
  family_id       UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES public.pocket_money_accounts(id) ON DELETE CASCADE,
  ledger_entry_id BIGINT NOT NULL,
  kinboard_tx_id  UUID NOT NULL REFERENCES public.pocket_money_transactions(id) ON DELETE CASCADE,
  amount_cents    INT NOT NULL,
  note            TEXT,
  entry_date      DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (family_id, account_id, ledger_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_pocket_money_ledger_mirror_tx
  ON public.pocket_money_ledger_mirror (kinboard_tx_id);

REVOKE ALL ON TABLE public.pocket_money_ledger_mirror FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.pocket_money_ledger_mirror FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.pocket_money_ledger_mirror FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE public.pocket_money_ledger_mirror TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
