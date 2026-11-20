/**
 * Pocket money mirrored from the Allowance Ledger, through the Integration
 * API (POST /api/integration/v1/pocket-money/ledger-sync).
 *
 * The Allowance Ledger — a small app of the household's that lives outside
 * Kinboard — is the single source of truth for the children's pocket money.
 * Kinboard's side is display-only: what the ledger says is what the accounts
 * show, and a transaction a family member adds on a Kinboard screen to one
 * of these accounts is removed by the next push, exactly as the direct
 * database sync that this replaces used to remove it.
 *
 * The push is the ledger's FULL state for the accounts it manages, not a
 * stream of changes, and the answer is a reconcile: make Kinboard match.
 * That shape is what makes the endpoint safe to call on every ledger save
 * and on a five-minute timer alike, with no Idempotency-Key (RFC-001 §3's
 * keys exist for operations that DO something per call; this one asserts a
 * state, so a repeat is a no-op by construction — the specs prove the second
 * identical push changes nothing and reports zeros).
 *
 * How an entry keeps its identity across the two systems: the ledger's own
 * entry id, remembered in pocket_money_ledger_mirror (migration 088)
 * together with the amount / note / date last pushed. An edit in the ledger
 * is therefore an UPDATE of the same Kinboard transaction, a delete in the
 * ledger deletes it here, and a transaction already on the account when an
 * entry is first seen — the opening balances, historically — is adopted
 * when account and amount match, rather than duplicated.
 *
 * A mirrored entry whose transaction has meanwhile been deleted on a
 * Kinboard screen is the one deliberate divergence from the old sync: the
 * old one's state file went on believing the pairing, and the entry never
 * came back. Here the stale pairing is dropped and the entry is adopted or
 * inserted afresh — the ledger is the source of truth, so its entries win.
 *
 * `reconcileLedgerPocketMoney` takes its store as a dependency so every
 * rule — adoption, update, deletion, the display-only sweep, the balances —
 * is tested against fakes (e2e/integration-pocket-money-sync.spec.ts); the
 * live store is below it.
 */

import { createAdminClient } from "@/lib/supabase/server";

const db = () => createAdminClient() as any;

// ── the wire shape ───────────────────────────────────────────────────────────

/** A ledger note is a household scribble, not a document. */
export const LEDGER_NOTE_MAX = 1000;
/** Far beyond any household ledger; a cap exists so a broken client cannot
 *  ask for a hundred thousand writes in one request. */
export const LEDGER_SYNC_MAX_ACCOUNTS = 100;
export const LEDGER_SYNC_MAX_ENTRIES = 20_000;
/** $1,000,000.00 — a sanity bound, two orders past any real entry. */
export const LEDGER_SYNC_MAX_AMOUNT_CENTS = 99_999_999;

export interface LedgerEntryInput {
  entryId: number;
  amountCents: number;
  note: string | null;
  /** `YYYY-MM-DD`, the day the ledger dates the entry. */
  entryDate: string;
  /** True when the ledger created the entry itself (the weekly allowance). */
  auto: boolean;
}

export interface LedgerAccountInput {
  accountId: string;
  entries: LedgerEntryInput[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!DATE_SHAPE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The body, checked: the ledger's full state, or the 400 that says what is wrong. */
export function parseLedgerSyncBody(body: unknown):
  | { ok: true; accounts: LedgerAccountInput[] }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "A JSON object body is required" };
  }
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.accounts) || b.accounts.length === 0) {
    return { ok: false, error: "accounts must be a non-empty array" };
  }
  if (b.accounts.length > LEDGER_SYNC_MAX_ACCOUNTS) {
    return { ok: false, error: `accounts must list at most ${LEDGER_SYNC_MAX_ACCOUNTS} accounts` };
  }
  const accounts: LedgerAccountInput[] = [];
  const seenAccounts = new Set<string>();
  let totalEntries = 0;
  for (const rawAccount of b.accounts) {
    if (!rawAccount || typeof rawAccount !== "object" || Array.isArray(rawAccount)) {
      return { ok: false, error: "each account must be an object" };
    }
    const a = rawAccount as Record<string, unknown>;
    if (typeof a.account_id !== "string" || !UUID.test(a.account_id)) {
      return { ok: false, error: "account_id must be the id of a pocket money account (GET /pocket-money)" };
    }
    if (seenAccounts.has(a.account_id)) {
      return { ok: false, error: `account ${a.account_id} is listed twice` };
    }
    seenAccounts.add(a.account_id);
    if (!Array.isArray(a.entries)) {
      return { ok: false, error: `entries for account ${a.account_id} must be an array` };
    }
    totalEntries += a.entries.length;
    if (totalEntries > LEDGER_SYNC_MAX_ENTRIES) {
      return { ok: false, error: `a push may carry at most ${LEDGER_SYNC_MAX_ENTRIES} entries` };
    }
    const entries: LedgerEntryInput[] = [];
    const seenEntries = new Set<number>();
    for (const rawEntry of a.entries) {
      if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
        return { ok: false, error: "each entry must be an object" };
      }
      const e = rawEntry as Record<string, unknown>;
      if (typeof e.entry_id !== "number" || !Number.isInteger(e.entry_id) || e.entry_id < 1) {
        return { ok: false, error: "entry_id must be a positive integer (the ledger's own id for the entry)" };
      }
      if (seenEntries.has(e.entry_id)) {
        return { ok: false, error: `entry ${e.entry_id} is listed twice for account ${a.account_id}` };
      }
      seenEntries.add(e.entry_id);
      if (
        typeof e.amount_cents !== "number" || !Number.isInteger(e.amount_cents)
        || Math.abs(e.amount_cents) > LEDGER_SYNC_MAX_AMOUNT_CENTS
      ) {
        return { ok: false, error: "amount_cents must be an integer number of cents" };
      }
      let note: string | null = null;
      if (e.note !== undefined && e.note !== null) {
        if (typeof e.note !== "string") return { ok: false, error: "note must be a string" };
        if (e.note.length > LEDGER_NOTE_MAX) {
          return { ok: false, error: `note must be at most ${LEDGER_NOTE_MAX} characters` };
        }
        note = e.note.length > 0 ? e.note : null;
      }
      if (typeof e.entry_date !== "string" || !isRealDate(e.entry_date)) {
        return { ok: false, error: "entry_date must be a real date as YYYY-MM-DD" };
      }
      if (typeof e.auto !== "boolean") {
        return { ok: false, error: "auto must be true or false" };
      }
      entries.push({
        entryId: e.entry_id,
        amountCents: e.amount_cents,
        note,
        entryDate: e.entry_date,
        auto: e.auto,
      });
    }
    accounts.push({ accountId: a.account_id, entries });
  }
  return { ok: true, accounts };
}

// ── how an entry lands on the account ────────────────────────────────────────

/** The transaction type a ledger entry wears, as the old sync derived it. */
export function ledgerTxType(amountCents: number, auto: boolean): string {
  if (auto) return "allowance";
  return amountCents >= 0 ? "manual_deposit" : "withdrawal";
}

const LEDGER_TZ = "America/Los_Angeles";

/** The zone's offset from UTC at an instant, in milliseconds. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * When a ledger entry sits on the Kinboard timeline: noon on its date in
 * the household's timezone — the old sync's `entry_date 12:00:00 AT TIME
 * ZONE 'America/Los_Angeles'`. Noon, not midnight, so the entry belongs to
 * its day however the reader's clock is set; noon is also never inside a
 * DST gap or fold, so the correction below settles in one step.
 */
export function ledgerEntryCreatedAt(entryDate: string): string {
  const [y, m, d] = entryDate.split("-").map(Number);
  let utcMs = Date.UTC(y, m - 1, d, 12, 0, 0);
  for (let i = 0; i < 2; i++) {
    const corrected = Date.UTC(y, m - 1, d, 12, 0, 0) - zoneOffsetMs(new Date(utcMs), LEDGER_TZ);
    if (corrected === utcMs) break;
    utcMs = corrected;
  }
  return new Date(utcMs).toISOString();
}

interface TxFields {
  amountCents: number;
  note: string | null;
  type: string;
  createdAt: string;
}

function txFields(entry: LedgerEntryInput): TxFields {
  return {
    amountCents: entry.amountCents,
    note: entry.note,
    type: ledgerTxType(entry.amountCents, entry.auto),
    createdAt: ledgerEntryCreatedAt(entry.entryDate),
  };
}

// ── the store ────────────────────────────────────────────────────────────────

export interface MirrorRow {
  entryId: number;
  kinboardTxId: string;
  amountCents: number;
  note: string | null;
  entryDate: string;
}

export interface LedgerSyncDeps {
  /** Every pocket-money account id of the family — the payload may only name these. */
  familyAccountIds: (familyId: string) => Promise<string[]>;
  /** The account's transactions, oldest first: adoption takes the earliest match. */
  listTransactions: (accountId: string) => Promise<{ id: string; amountCents: number }[]>;
  listMirror: (familyId: string, accountId: string) => Promise<MirrorRow[]>;
  insertTransaction: (accountId: string, fields: TxFields) => Promise<{ id: string }>;
  updateTransaction: (txId: string, fields: TxFields) => Promise<void>;
  deleteTransaction: (txId: string) => Promise<void>;
  insertMirror: (familyId: string, accountId: string, row: MirrorRow) => Promise<void>;
  updateMirror: (familyId: string, accountId: string, row: MirrorRow) => Promise<void>;
  deleteMirror: (familyId: string, accountId: string, entryId: number) => Promise<void>;
  setBalance: (accountId: string, balanceCents: number) => Promise<void>;
}

export interface LedgerSyncResult {
  status: number;
  body: Record<string, unknown>;
}

const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}): LedgerSyncResult =>
  ({ status, body: { error, code, ...extra } });

/**
 * Make the named accounts match the pushed state. Everything is validated
 * before anything is written: a push naming an account outside the token's
 * family is refused whole, so a bad push can never half-apply.
 */
export async function reconcileLedgerPocketMoney(
  input: { familyId: string; body: unknown },
  deps: LedgerSyncDeps,
): Promise<LedgerSyncResult> {
  const parsed = parseLedgerSyncBody(input.body);
  if (!parsed.ok) return fail(400, "invalid_request", parsed.error);

  const familyAccounts = new Set(await deps.familyAccountIds(input.familyId));
  for (const account of parsed.accounts) {
    if (!familyAccounts.has(account.accountId)) {
      return fail(
        400, "invalid_request",
        `Account ${account.accountId} is not a pocket money account of this family; nothing was changed`,
        { reason: "unknown_account", account_id: account.accountId },
      );
    }
  }

  let adopted = 0;
  let inserted = 0;
  let updated = 0;
  let deleted = 0;
  const balances: Record<string, number> = {};

  for (const account of parsed.accounts) {
    const entries = [...account.entries].sort((x, y) => x.entryId - y.entryId);
    const mirror = new Map<number, MirrorRow>(
      (await deps.listMirror(input.familyId, account.accountId)).map((row) => [row.entryId, row]),
    );
    const existing = await deps.listTransactions(account.accountId);
    const existingById = new Map(existing.map((t) => [t.id, t]));
    const usedTx = new Set([...mirror.values()].map((row) => row.kinboardTxId));
    const live = new Set(entries.map((e) => e.entryId));

    for (const entry of entries) {
      const fields = txFields(entry);
      let paired = mirror.get(entry.entryId);
      // A pairing whose transaction is gone (deleted on a screen) is no
      // pairing: drop it and let the entry adopt or insert below, so the
      // ledger's entries always land.
      if (paired && !existingById.has(paired.kinboardTxId)) {
        await deps.deleteMirror(input.familyId, account.accountId, entry.entryId);
        usedTx.delete(paired.kinboardTxId);
        mirror.delete(entry.entryId);
        paired = undefined;
      }
      if (paired) {
        if (
          paired.amountCents !== entry.amountCents
          || paired.note !== entry.note
          || paired.entryDate !== entry.entryDate
        ) {
          await deps.updateTransaction(paired.kinboardTxId, fields);
          const row = { ...paired, amountCents: entry.amountCents, note: entry.note, entryDate: entry.entryDate };
          await deps.updateMirror(input.familyId, account.accountId, row);
          mirror.set(entry.entryId, row);
          updated += 1;
        }
        continue;
      }
      const match = existing.find((t) => t.amountCents === entry.amountCents && !usedTx.has(t.id));
      let txId: string;
      if (match) {
        txId = match.id;
        await deps.updateTransaction(txId, fields);
        adopted += 1;
      } else {
        txId = (await deps.insertTransaction(account.accountId, fields)).id;
        inserted += 1;
      }
      usedTx.add(txId);
      existingById.set(txId, { id: txId, amountCents: entry.amountCents });
      const row: MirrorRow = {
        entryId: entry.entryId, kinboardTxId: txId,
        amountCents: entry.amountCents, note: entry.note, entryDate: entry.entryDate,
      };
      await deps.insertMirror(input.familyId, account.accountId, row);
      mirror.set(entry.entryId, row);
    }

    // Ledger deletions propagate.
    for (const [entryId, row] of [...mirror]) {
      if (!live.has(entryId)) {
        await deps.deleteTransaction(row.kinboardTxId);
        await deps.deleteMirror(input.familyId, account.accountId, entryId);
        mirror.delete(entryId);
        deleted += 1;
      }
    }

    // Display-only: a transaction on the account that no ledger entry
    // mirrors does not survive a push.
    const keep = new Set([...mirror.values()].map((row) => row.kinboardTxId));
    for (const tx of await deps.listTransactions(account.accountId)) {
      if (!keep.has(tx.id)) {
        await deps.deleteTransaction(tx.id);
        deleted += 1;
      }
    }

    // The balance is the ledger's sum, never a running total of our own.
    const balance = entries.reduce((sum, e) => sum + e.amountCents, 0);
    await deps.setBalance(account.accountId, balance);
    balances[account.accountId] = balance;
  }

  return { status: 200, body: { adopted, inserted, updated, deleted, balances } };
}

// ── the live store ───────────────────────────────────────────────────────────

function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Failed to ${what}: ${result.error.message}`);
  return result.data;
}

export const liveLedgerSyncDeps: LedgerSyncDeps = {
  async familyAccountIds(familyId) {
    const rows = must(
      await db().from("pocket_money_accounts").select("id").eq("family_id", familyId),
      "read the family's accounts",
    ) as { id: string }[];
    return rows.map((r) => r.id);
  },
  async listTransactions(accountId) {
    const rows = must(
      await db().from("pocket_money_transactions")
        .select("id, amount_cents")
        .eq("account_id", accountId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      "read the account's transactions",
    ) as { id: string; amount_cents: number }[];
    return rows.map((r) => ({ id: r.id, amountCents: r.amount_cents }));
  },
  async listMirror(familyId, accountId) {
    const rows = must(
      await db().from("pocket_money_ledger_mirror")
        .select("ledger_entry_id, kinboard_tx_id, amount_cents, note, entry_date")
        .eq("family_id", familyId)
        .eq("account_id", accountId),
      "read the ledger mirror",
    ) as { ledger_entry_id: number; kinboard_tx_id: string; amount_cents: number; note: string | null; entry_date: string }[];
    return rows.map((r) => ({
      entryId: Number(r.ledger_entry_id), kinboardTxId: r.kinboard_tx_id,
      amountCents: r.amount_cents, note: r.note, entryDate: r.entry_date,
    }));
  },
  async insertTransaction(accountId, fields) {
    const row = must(
      await db().from("pocket_money_transactions")
        .insert({
          account_id: accountId, amount_cents: fields.amountCents,
          type: fields.type, note: fields.note, created_at: fields.createdAt,
        })
        .select("id")
        .single(),
      "insert a transaction",
    ) as { id: string };
    return { id: row.id };
  },
  async updateTransaction(txId, fields) {
    must(
      await db().from("pocket_money_transactions")
        .update({
          amount_cents: fields.amountCents, note: fields.note,
          type: fields.type, created_at: fields.createdAt,
        })
        .eq("id", txId)
        .select("id"),
      "update a transaction",
    );
  },
  async deleteTransaction(txId) {
    must(
      await db().from("pocket_money_transactions").delete().eq("id", txId).select("id"),
      "delete a transaction",
    );
  },
  async insertMirror(familyId, accountId, row) {
    must(
      await db().from("pocket_money_ledger_mirror").insert({
        family_id: familyId, account_id: accountId, ledger_entry_id: row.entryId,
        kinboard_tx_id: row.kinboardTxId, amount_cents: row.amountCents,
        note: row.note, entry_date: row.entryDate,
      }).select("ledger_entry_id"),
      "remember a mirrored entry",
    );
  },
  async updateMirror(familyId, accountId, row) {
    must(
      await db().from("pocket_money_ledger_mirror")
        .update({
          amount_cents: row.amountCents, note: row.note, entry_date: row.entryDate,
          updated_at: new Date().toISOString(),
        })
        .eq("family_id", familyId)
        .eq("account_id", accountId)
        .eq("ledger_entry_id", row.entryId)
        .select("ledger_entry_id"),
      "update a mirrored entry",
    );
  },
  async deleteMirror(familyId, accountId, entryId) {
    must(
      await db().from("pocket_money_ledger_mirror")
        .delete()
        .eq("family_id", familyId)
        .eq("account_id", accountId)
        .eq("ledger_entry_id", entryId)
        .select("ledger_entry_id"),
      "forget a mirrored entry",
    );
  },
  async setBalance(accountId, balanceCents) {
    must(
      await db().from("pocket_money_accounts")
        .update({ balance_cents: balanceCents })
        .eq("id", accountId)
        .select("id"),
      "set the account balance",
    );
  },
};
