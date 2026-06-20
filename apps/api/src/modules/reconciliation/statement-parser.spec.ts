import { parseStatementCsv } from "./statement-parser";

describe("parseStatementCsv (ALP-140)", () => {
  it("parse un CSV simple (reference, amount) en centimes", () => {
    const csv =
      "reference,amount,date\nref-1,100,2026-06-17\nref-2,250.50,2026-06-17";
    const lines = parseStatementCsv(csv);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ reference: "ref-1", amountCents: 10000n });
    expect(lines[1].amountCents).toBe(25050n);
  });

  it("détecte le délimiteur point-virgule et les alias de colonnes", () => {
    const csv =
      "transaction_id;montant;timestamp\nMTN-9;1000;2026-06-17T10:00:00Z";
    const lines = parseStatementCsv(csv);
    expect(lines[0]).toMatchObject({
      reference: "MTN-9",
      amountCents: 100000n,
    });
  });

  it("ignore les lignes illisibles (sans référence ou montant)", () => {
    const csv = "reference,amount\nok-1,100\n,50\nbad-no-amount,\n   ";
    const lines = parseStatementCsv(csv);
    expect(lines.map((l) => l.reference)).toEqual(["ok-1"]);
  });

  it("nettoie les montants formatés (espaces, devise)", () => {
    const csv = 'ref,amount\nr1,"1 000 FCFA"';
    const lines = parseStatementCsv(csv);
    expect(lines[0].amountCents).toBe(100000n);
  });

  it("retourne [] si pas de données", () => {
    expect(parseStatementCsv("reference,amount")).toEqual([]);
    expect(parseStatementCsv("")).toEqual([]);
  });
});
