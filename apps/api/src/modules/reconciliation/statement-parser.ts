import { toCents } from "../../common/money";

export interface StatementLine {
  reference: string;
  amountCents: bigint;
  date: string | null;
  raw: Record<string, string>;
}

// Alias de colonnes tolérés par opérateur/banque (insensible à la casse).
const REFERENCE_KEYS = [
  "reference",
  "ref",
  "transaction_id",
  "transactionid",
  "financialtransactionid",
  "externalid",
  "id",
];
const AMOUNT_KEYS = ["amount", "montant", "value", "valeur"];
const DATE_KEYS = [
  "date",
  "timestamp",
  "datetime",
  "transaction_date",
  "created_at",
];

function pick(row: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const found = Object.keys(row).find((c) => c.toLowerCase().trim() === k);
    if (found && row[found] !== "") return row[found];
  }
  return undefined;
}

/** Découpe une ligne CSV en respectant les guillemets simples. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Parseur tolérant de relevé CSV (MTN, Airtel, banque) — ALP-140.
 * Détecte le délimiteur (`,` ou `;`), mappe les alias de colonnes, ignore les
 * lignes vides/illisibles. Les montants sont convertis en centimes.
 */
export function parseStatementCsv(content: string): StatementLine[] {
  const rows = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (rows.length < 2) return [];

  const delimiter =
    (rows[0].match(/;/g)?.length ?? 0) > (rows[0].match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
  const headers = splitCsvLine(rows[0], delimiter).map((h) => h.toLowerCase());

  const lines: StatementLine[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = splitCsvLine(rows[i], delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = cells[idx] ?? ""));

    const reference = pick(row, REFERENCE_KEYS);
    const amountRaw = pick(row, AMOUNT_KEYS);
    if (!reference || amountRaw === undefined) continue; // ligne illisible → ignorée

    const amount = Number(String(amountRaw).replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(amount)) continue;

    lines.push({
      reference: reference.trim(),
      amountCents: toCents(amount),
      date: pick(row, DATE_KEYS) ?? null,
      raw: row,
    });
  }
  return lines;
}
