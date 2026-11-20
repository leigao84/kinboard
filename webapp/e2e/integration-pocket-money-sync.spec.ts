import { test, expect } from "@playwright/test";
import {
  ledgerEntryCreatedAt,
  ledgerTxType,
  parseLedgerSyncBody,
  reconcileLedgerPocketMoney,
  type LedgerSyncDeps,
  type MirrorRow,
} from "../src/lib/integration-pocket-money-sync";

/**
 * The Allowance Ledger's full-state push (RFC-012's pocket money, mirrored):
 * the reconcile rules run against an in-memory store that counts what it
 * was asked, so "nothing changed" is a count of zero writes, not an absence
 * of errors. The wire behaviour — auth, the real tables, the real mirror —
 * is in integration-pocket-money-sync-live.spec.ts.
 */

const FAMILY = "11111111-1111-1111-1111-111111111111";
const OTHER_FAMILY = "22222222-2222-2222-2222-222222222222";
const EMMA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const MATTHEW = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const FOREIGN = "aaaaaaaa-aaaa-4aaa-8aaa-000000000099";

const entry = (over: Record<string, unknown> = {}) => ({
  entry_id: 1, amount_cents: 500, note: "mowing", entry_date: "2026-11-01", auto: false, ...over,
});
const push = (entries: unknown[], accountId = EMMA) => ({ accounts: [{ account_id: accountId, entries }] });

// ── the body, checked ────────────────────────────────────────────────────────

test.describe("parseLedgerSyncBody", () => {
  test("accepts a minimal push and normalises an empty note to null", () => {
    const parsed = parseLedgerSyncBody(push([entry({ note: "" })]));
    expect(parsed).toEqual({
      ok: true,
      accounts: [{
        accountId: EMMA,
        entries: [{ entryId: 1, amountCents: 500, note: null, entryDate: "2026-11-01", auto: false }],
      }],
    });
  });

  test("refuses what is not the ledger's state", () => {
    const bad: unknown[] = [
      null, [], {}, { accounts: [] }, { accounts: [{}] },
      push([], "not-a-uuid"),
      push([entry({ entry_id: 0 })]),
      push([entry({ entry_id: 1.5 })]),
      push([entry({ amount_cents: 10.5 })]),
      push([entry({ amount_cents: "500" })]),
      push([entry({ amount_cents: 100_000_000 })]),
      push([entry({ entry_date: "2026-02-30" })]),
      push([entry({ entry_date: "01.11.2026" })]),
      push([entry({ auto: 1 })]),
      push([entry({ note: "x".repeat(1001) })]),
      push([entry(), entry()]), // the same entry twice
      { accounts: [{ account_id: EMMA, entries: [] }, { account_id: EMMA, entries: [] }] }, // the same account twice
    ];
    for (const body of bad) {
      expect(parseLedgerSyncBody(body).ok, JSON.stringify(body)).toBe(false);
    }
  });
});

// ── how an entry lands ───────────────────────────────────────────────────────

test.describe("an entry's type and timestamp", () => {
  test("the type follows the ledger's own derivation", () => {
    expect(ledgerTxType(500, true)).toBe("allowance");
    expect(ledgerTxType(-500, true)).toBe("allowance");
    expect(ledgerTxType(500, false)).toBe("manual_deposit");
    expect(ledgerTxType(0, false)).toBe("manual_deposit");
    expect(ledgerTxType(-500, false)).toBe("withdrawal");
  });

  test("created_at is noon in Los Angeles, winter and summer", () => {
    expect(ledgerEntryCreatedAt("2026-11-19")).toBe("2026-11-19T20:00:00.000Z"); // PST, UTC-8
    expect(ledgerEntryCreatedAt("2026-07-04")).toBe("2026-07-04T19:00:00.000Z"); // PDT, UTC-7
    expect(ledgerEntryCreatedAt("2026-03-08")).toBe("2026-03-08T19:00:00.000Z"); // spring-forward day: noon is PDT
    expect(ledgerEntryCreatedAt("2026-11-01")).toBe("2026-11-01T20:00:00.000Z"); // fall-back day: noon is PST
  });
});

// ── the reconcile, against a fake store ──────────────────────────────────────

interface FakeTx {
  id: string; accountId: string; seq: number;
  amountCents: number; note: string | null; type: string; createdAt: string;
}

class FakeStore implements LedgerSyncDeps {
  accountFamily = new Map<string, string>();
  txs = new Map<string, FakeTx>();
  mirror = new Map<string, MirrorRow>();
  balances = new Map<string, number>();
  /** Mutations of transactions and the mirror — a repeat push must make none. */
  writes = 0;
  private seq = 0;

  constructor() {
    this.accountFamily.set(EMMA, FAMILY);
    this.accountFamily.set(MATTHEW, FAMILY);
    this.accountFamily.set(FOREIGN, OTHER_FAMILY);
  }

  private key(familyId: string, accountId: string, entryId: number) {
    return `${familyId}|${accountId}|${entryId}`;
  }

  seedTx(accountId: string, amountCents: number, over: Partial<FakeTx> = {}): string {
    const id = `tx-${++this.seq}`;
    this.txs.set(id, {
      id, accountId, seq: this.seq, amountCents,
      note: null, type: "manual_deposit", createdAt: "2026-01-01T20:00:00.000Z", ...over,
    });
    return id;
  }

  async familyAccountIds(familyId: string) {
    return [...this.accountFamily].filter(([, f]) => f === familyId).map(([id]) => id);
  }
  async listTransactions(accountId: string) {
    return [...this.txs.values()]
      .filter((t) => t.accountId === accountId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.seq - b.seq)
      .map((t) => ({ id: t.id, amountCents: t.amountCents }));
  }
  async listMirror(familyId: string, accountId: string) {
    return [...this.mirror]
      .filter(([k]) => k.startsWith(`${familyId}|${accountId}|`))
      .map(([, row]) => ({ ...row }));
  }
  async insertTransaction(accountId: string, fields: Omit<FakeTx, "id" | "accountId" | "seq">) {
    this.writes += 1;
    const id = `tx-${++this.seq}`;
    this.txs.set(id, { id, accountId, seq: this.seq, ...fields });
    return { id };
  }
  async updateTransaction(txId: string, fields: Omit<FakeTx, "id" | "accountId" | "seq">) {
    this.writes += 1;
    const tx = this.txs.get(txId);
    if (tx) Object.assign(tx, fields);
  }
  async deleteTransaction(txId: string) {
    this.writes += 1;
    this.txs.delete(txId);
  }
  async insertMirror(familyId: string, accountId: string, row: MirrorRow) {
    this.writes += 1;
    this.mirror.set(this.key(familyId, accountId, row.entryId), { ...row });
  }
  async updateMirror(familyId: string, accountId: string, row: MirrorRow) {
    this.writes += 1;
    this.mirror.set(this.key(familyId, accountId, row.entryId), { ...row });
  }
  async deleteMirror(familyId: string, accountId: string, entryId: number) {
    this.writes += 1;
    this.mirror.delete(this.key(familyId, accountId, entryId));
  }
  async setBalance(accountId: string, balanceCents: number) {
    this.balances.set(accountId, balanceCents);
  }

  accountTxs(accountId: string): FakeTx[] {
    return [...this.txs.values()].filter((t) => t.accountId === accountId);
  }
}

const reconcile = (store: FakeStore, body: unknown, familyId = FAMILY) =>
  reconcileLedgerPocketMoney({ familyId, body }, store);

test.describe("reconcileLedgerPocketMoney", () => {
  test("a first push inserts the entries and sets the balance to their sum", async () => {
    const store = new FakeStore();
    const result = await reconcile(store, push([
      entry({ entry_id: 1, amount_cents: 1000, note: "opening", entry_date: "2026-11-01" }),
      entry({ entry_id: 2, amount_cents: -250, note: "candy", entry_date: "2026-11-03" }),
      entry({ entry_id: 3, amount_cents: 500, note: null, entry_date: "2026-11-07", auto: true }),
    ]));
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ adopted: 0, inserted: 3, updated: 0, deleted: 0 });
    expect(result.body.balances).toEqual({ [EMMA]: 1250 });
    expect(store.balances.get(EMMA)).toBe(1250);
    const txs = store.accountTxs(EMMA);
    expect(txs.map((t) => t.type)).toEqual(["manual_deposit", "withdrawal", "allowance"]);
    expect(txs[0].createdAt).toBe("2026-11-01T20:00:00.000Z");
    expect(store.mirror.size).toBe(3);
  });

  test("the same push again changes nothing and reports zeros", async () => {
    const store = new FakeStore();
    const body = push([entry({ entry_id: 1 }), entry({ entry_id: 2, amount_cents: -100 })]);
    await reconcile(store, body);
    store.writes = 0;
    const again = await reconcile(store, body);
    expect(again.body).toMatchObject({ adopted: 0, inserted: 0, updated: 0, deleted: 0 });
    expect(store.writes).toBe(0);
    expect(store.accountTxs(EMMA)).toHaveLength(2);
  });

  test("a transaction already there with the entry's amount is adopted, not duplicated", async () => {
    const store = new FakeStore();
    const opening = store.seedTx(EMMA, 1000, { note: "typed on a screen", createdAt: "2025-01-01T00:00:00.000Z" });
    const result = await reconcile(store, push([
      entry({ entry_id: 1, amount_cents: 1000, note: "opening balance", entry_date: "2026-11-01" }),
    ]));
    expect(result.body).toMatchObject({ adopted: 1, inserted: 0 });
    const txs = store.accountTxs(EMMA);
    expect(txs).toHaveLength(1);
    expect(txs[0].id).toBe(opening);
    // …and normalised to what the ledger says.
    expect(txs[0].note).toBe("opening balance");
    expect(txs[0].createdAt).toBe("2026-11-01T20:00:00.000Z");
  });

  test("an edit in the ledger updates the same transaction", async () => {
    const store = new FakeStore();
    await reconcile(store, push([entry({ entry_id: 1, amount_cents: 500 })]));
    const before = store.accountTxs(EMMA)[0];
    const result = await reconcile(store, push([
      entry({ entry_id: 1, amount_cents: 700, note: "corrected", entry_date: "2026-11-02" }),
    ]));
    expect(result.body).toMatchObject({ adopted: 0, inserted: 0, updated: 1, deleted: 0 });
    const after = store.accountTxs(EMMA);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
    expect(after[0].amountCents).toBe(700);
    expect(store.balances.get(EMMA)).toBe(700);
  });

  test("a deletion in the ledger deletes here; a screen-added transaction is swept", async () => {
    const store = new FakeStore();
    await reconcile(store, push([entry({ entry_id: 1 }), entry({ entry_id: 2, amount_cents: 300 })]));
    store.seedTx(EMMA, 999); // added on a Kinboard screen — display-only means it goes
    const result = await reconcile(store, push([entry({ entry_id: 1 })]));
    expect(result.body).toMatchObject({ inserted: 0, updated: 0, deleted: 2 });
    expect(store.accountTxs(EMMA)).toHaveLength(1);
    expect(store.mirror.size).toBe(1);
    expect(store.balances.get(EMMA)).toBe(500);
  });

  test("a mirrored entry whose transaction was deleted on a screen is restored, not lost", async () => {
    const store = new FakeStore();
    await reconcile(store, push([entry({ entry_id: 1 })]));
    const txId = store.accountTxs(EMMA)[0].id;
    store.txs.delete(txId); // a family member deletes it on a screen
    const result = await reconcile(store, push([entry({ entry_id: 1 })]));
    expect(result.body).toMatchObject({ inserted: 1, deleted: 0 });
    expect(store.accountTxs(EMMA)).toHaveLength(1);
    expect(store.balances.get(EMMA)).toBe(500);
  });

  test("an account outside the family refuses the whole push, before any write", async () => {
    const store = new FakeStore();
    const result = await reconcile(store, {
      accounts: [
        { account_id: EMMA, entries: [entry({ entry_id: 1 })] },
        { account_id: FOREIGN, entries: [entry({ entry_id: 1 })] },
      ],
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ code: "invalid_request", reason: "unknown_account" });
    expect(store.writes).toBe(0);
    expect(store.accountTxs(EMMA)).toHaveLength(0);
  });

  test("accounts reconcile independently in one push", async () => {
    const store = new FakeStore();
    const result = await reconcile(store, {
      accounts: [
        { account_id: EMMA, entries: [entry({ entry_id: 1, amount_cents: 100 })] },
        { account_id: MATTHEW, entries: [entry({ entry_id: 1, amount_cents: 200 }), entry({ entry_id: 2, amount_cents: -50 })] },
      ],
    });
    expect(result.body).toMatchObject({ inserted: 3 });
    expect(result.body.balances).toEqual({ [EMMA]: 100, [MATTHEW]: 150 });
    expect(store.accountTxs(MATTHEW)).toHaveLength(2);
  });
});
