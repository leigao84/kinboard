import { NextRequest, NextResponse } from "next/server";
import { withIntegrationAuth } from "@/lib/integration-route";
import { logApiError } from "@/lib/api-error";
import { liveLedgerSyncDeps, reconcileLedgerPocketMoney } from "@/lib/integration-pocket-money-sync";

export const dynamic = "force-dynamic";

/**
 * POST /api/integration/v1/pocket-money/ledger-sync
 * `{ accounts: [{ account_id, entries: [{ entry_id, amount_cents, note,
 * entry_date, auto }] }] }`
 *
 * The Allowance Ledger's full state for the accounts it manages, reconciled
 * onto Kinboard's pocket money: entries are adopted, inserted, updated and
 * deleted until the accounts match the push, and each balance becomes the
 * ledger's sum (lib/integration-pocket-money-sync.ts). The ledger is the
 * source of truth and Kinboard's side is display-only, so a transaction no
 * entry mirrors is removed.
 *
 * No Idempotency-Key, deliberately: RFC-001 §3's keys protect operations
 * that act per call, and this one asserts a state — a repeat push is a
 * no-op by construction and answers with zero counts, so a client that
 * retries, or pushes on every save and again on a timer, needs no key
 * discipline to be safe.
 *
 * Answers 200 `{ adopted, inserted, updated, deleted, balances }` — the
 * counts the old direct-database sync printed — or 400 with the account
 * named when the push names one outside the token's family, in which case
 * nothing was changed.
 */
export async function POST(request: NextRequest) {
  return withIntegrationAuth(request, "pocket_money:write", async (context) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    try {
      const result = await reconcileLedgerPocketMoney(
        { familyId: context.familyId, body },
        liveLedgerSyncDeps,
      );
      return NextResponse.json(result.body, { status: result.status });
    } catch (err) {
      await logApiError("integration/pocket-money/ledger-sync", err);
      return NextResponse.json({ error: "Could not reconcile pocket money", code: "internal_error" }, { status: 500 });
    }
  });
}
