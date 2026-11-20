import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "child_process";
import { createThrowawayFamily, deleteThrowawayFamily } from "./throwaway-family";
import { dbContainer } from "./whole-database";
import { generateIntegrationToken } from "../src/lib/integration-auth";

/**
 * POST /api/integration/v1/pocket-money/ledger-sync over HTTP, against a
 * stack: the token in the database authenticates (or does not), the push
 * reconciles real rows in pocket_money_transactions, a repeat is a no-op,
 * and another family's account is refused. The rules themselves are
 * faked-store territory (integration-pocket-money-sync.spec.ts); this is
 * the wiring proof, in families of its own.
 */

const FAMILY_CODE = process.env.FAMILY_CODE;
test.skip(!FAMILY_CODE, "needs a running stack (FAMILY_CODE)");

function psql(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainer(), "psql", "-U", "postgres", "-d", "postgres", "-tA", "-q", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

const sqlLit = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** A child with a pocket-money account in the family; returns the account id. */
function seedChild(familyId: string, name: string): string {
  const personId = psql(
    `INSERT INTO people (family_id, name, is_child) VALUES (${sqlLit(familyId)}, ${sqlLit(name)}, true) RETURNING id`,
  );
  return psql(
    `INSERT INTO pocket_money_accounts (family_id, person_id, currency) VALUES (${sqlLit(familyId)}, ${sqlLit(personId)}, 'USD') RETURNING id`,
  );
}

/** A hand-created integration token, as Settings would mint it; returns the plaintext. */
function seedToken(familyId: string, scopes: string[]): string {
  const { token, hash } = generateIntegrationToken();
  psql(
    `INSERT INTO integration_tokens (family_id, name, token_hash, scopes) VALUES (${sqlLit(familyId)}, 'e2e ledger sync', ${sqlLit(hash)}, ARRAY[${scopes.map(sqlLit).join(",")}])`,
  );
  return token;
}

const entry = (over: Record<string, unknown> = {}) => ({
  entry_id: 1, amount_cents: 500, note: "mowing", entry_date: "2026-11-01", auto: false, ...over,
});

function push(request: APIRequestContext, token: string | null, body: unknown) {
  return request.post("/api/integration/v1/pocket-money/ledger-sync", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    data: body as Record<string, unknown>,
  });
}

async function withFamily(page: Page, label: string, body: (familyId: string) => Promise<void>) {
  await page.goto("/join", { waitUntil: "domcontentloaded" });
  const name = `claude-${label}-${test.info().project.name}-${Date.now()}`;
  const familyId = await createThrowawayFamily(page, name);
  try {
    await body(familyId);
  } finally {
    await deleteThrowawayFamily(page, familyId, name);
  }
}

test("the ledger push reconciles over HTTP, and only for its own family", async ({ page, request }) => {
  test.setTimeout(120_000);
  await withFamily(page, "ledgersync", async (familyId) => {
    const account = seedChild(familyId, "Ledger Kid");
    const token = seedToken(familyId, ["pocket_money:write"]);
    const readOnly = seedToken(familyId, ["family:read"]);
    const body = (entries: unknown[]) => ({ accounts: [{ account_id: account, entries }] });

    // No token, a wrong token, and a token without the scope all answer
    // the same 401 — the framework does not say which it was.
    expect((await push(request, null, body([entry()]))).status()).toBe(401);
    expect((await push(request, "kbi_not-a-real-token", body([entry()]))).status()).toBe(401);
    expect((await push(request, readOnly, body([entry()]))).status()).toBe(401);
    expect(psql(`SELECT count(*) FROM pocket_money_transactions WHERE account_id=${sqlLit(account)}`)).toBe("0");

    // A first push inserts and balances.
    const first = await push(request, token, body([
      entry({ entry_id: 1, amount_cents: 1000, note: "opening", entry_date: "2026-11-01" }),
      entry({ entry_id: 2, amount_cents: -250, note: "candy", entry_date: "2026-11-03" }),
    ]));
    expect(first.status()).toBe(200);
    expect(await first.json()).toMatchObject({ adopted: 0, inserted: 2, updated: 0, deleted: 0, balances: { [account]: 750 } });
    expect(psql(`SELECT balance_cents FROM pocket_money_accounts WHERE id=${sqlLit(account)}`)).toBe("750");
    expect(psql(`SELECT count(*) FROM pocket_money_ledger_mirror WHERE family_id=${sqlLit(familyId)}`)).toBe("2");

    // The same push again is a no-op.
    const again = await push(request, token, body([
      entry({ entry_id: 1, amount_cents: 1000, note: "opening", entry_date: "2026-11-01" }),
      entry({ entry_id: 2, amount_cents: -250, note: "candy", entry_date: "2026-11-03" }),
    ]));
    expect(await again.json()).toMatchObject({ adopted: 0, inserted: 0, updated: 0, deleted: 0 });

    // An edit updates in place; a removal deletes.
    const edited = await push(request, token, body([
      entry({ entry_id: 1, amount_cents: 1200, note: "opening, corrected", entry_date: "2026-11-01" }),
    ]));
    expect(await edited.json()).toMatchObject({ updated: 1, deleted: 1, balances: { [account]: 1200 } });
    expect(psql(`SELECT count(*) FROM pocket_money_transactions WHERE account_id=${sqlLit(account)}`)).toBe("1");
    expect(psql(`SELECT amount_cents FROM pocket_money_transactions WHERE account_id=${sqlLit(account)}`)).toBe("1200");

    // Another family's account is refused, and nothing moves.
    await withFamily(page, "ledgersync-other", async (otherFamily) => {
      const foreignAccount = seedChild(otherFamily, "Other Kid");
      const refused = await push(request, token, { accounts: [{ account_id: foreignAccount, entries: [entry()] }] });
      expect(refused.status()).toBe(400);
      expect(await refused.json()).toMatchObject({ code: "invalid_request", reason: "unknown_account" });
      expect(psql(`SELECT count(*) FROM pocket_money_transactions WHERE account_id=${sqlLit(foreignAccount)}`)).toBe("0");
    });
  });
});
