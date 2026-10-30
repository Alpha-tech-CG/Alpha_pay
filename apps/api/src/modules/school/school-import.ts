import ExcelJS from 'exceljs';
import { toE164 } from '@paybrain/shared';

/** Colonnes du modèle d'import (§M8), dans l'ordre du fichier téléchargeable. */
export const IMPORT_COLUMNS = [
  'matricule',
  'prenom',
  'nom',
  'date_naissance',
  'sexe',
  'responsable_nom',
  'responsable_telephone',
  'responsable_email',
  'responsable_lien',
  'responsable2_nom',
  'responsable2_telephone',
  'responsable2_email',
  'responsable2_lien',
] as const;

const EXAMPLE = ['2026-001', 'Grâce', 'Mabiala', '2015-03-12', 'F', 'Marie Mabiala', '061234567', 'marie@example.cg', 'Mère', '', '', '', ''];

export const MAX_IMPORT_ROWS = 2000;

export interface ImportGuardian {
  name: string;
  phone: string | null;
  email: string | null;
  relation: string | null;
  isPrimary: boolean;
}

export interface ImportStudent {
  line: number;
  registrationNo: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  gender: string | null;
  guardians: ImportGuardian[];
}

export interface ImportError {
  line: number;
  column?: string;
  message: string;
}

/** « Prénom », « date de naissance » → prenom, date_de_naissance. */
function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .replace(/^date_de_naissance$/, 'date_naissance');
}

/** CSV avec séparateur « ; » (Excel français) ou « , », guillemets doublés. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export async function parseXlsx(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const values: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = r.getCell(c).value as any;
      if (v instanceof Date) values.push(v.toISOString().slice(0, 10));
      else if (v && typeof v === 'object' && 'text' in v) values.push(String(v.text));
      else if (v && typeof v === 'object' && 'result' in v) values.push(String(v.result ?? ''));
      else values.push(v == null ? '' : String(v));
    }
    rows.push(values);
  });
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function parseDate(v: string): Date | null | 'invalid' {
  if (!v) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  const parts = iso ? [iso[1], iso[2], iso[3]] : fr ? [fr[3], fr[2], fr[1]] : null;
  if (!parts) return 'invalid';
  const [y, m, d] = parts;
  const date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(d) ? 'invalid' : date;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lignes du fichier → élèves et responsables validés. Chaque erreur est
 * rapportée avec son numéro de ligne (1 = en-têtes) ; une ligne en erreur
 * n'est pas importée, les autres le sont.
 */
export function validateRows(table: string[][]): { students: ImportStudent[]; errors: ImportError[] } {
  const errors: ImportError[] = [];
  if (table.length < 2) return { students: [], errors: [{ line: 1, message: 'Fichier vide : aucune ligne après les en-têtes' }] };
  if (table.length - 1 > MAX_IMPORT_ROWS) return { students: [], errors: [{ line: 1, message: `Au plus ${MAX_IMPORT_ROWS} élèves par fichier` }] };
  const headers = table[0].map(normalizeHeader);
  const missing = ['prenom', 'nom'].filter((c) => !headers.includes(c));
  if (missing.length) return { students: [], errors: [{ line: 1, message: `Colonnes obligatoires manquantes : ${missing.join(', ')}` }] };

  const students: ImportStudent[] = [];
  const seen = new Map<string, number>();
  table.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    const get = (col: string) => (cells[headers.indexOf(col)] ?? '').trim();
    const rowErrors: ImportError[] = [];
    const firstName = get('prenom');
    const lastName = get('nom');
    if (!firstName) rowErrors.push({ line, column: 'prenom', message: 'Prénom manquant' });
    if (!lastName) rowErrors.push({ line, column: 'nom', message: 'Nom manquant' });
    const registrationNo = get('matricule') || null;
    if (registrationNo) {
      if (seen.has(registrationNo)) rowErrors.push({ line, column: 'matricule', message: `Matricule ${registrationNo} déjà présent ligne ${seen.get(registrationNo)}` });
      else seen.set(registrationNo, line);
    }
    const dob = parseDate(get('date_naissance'));
    if (dob === 'invalid') rowErrors.push({ line, column: 'date_naissance', message: 'Date invalide (AAAA-MM-JJ ou JJ/MM/AAAA)' });
    const genderRaw = get('sexe').toUpperCase();
    const gender = genderRaw ? (['F', 'M'].includes(genderRaw[0]) ? genderRaw[0] : null) : null;
    if (genderRaw && !gender) rowErrors.push({ line, column: 'sexe', message: 'Sexe : F ou M' });

    const guardians: ImportGuardian[] = [];
    for (const prefix of ['responsable', 'responsable2']) {
      const name = get(`${prefix}_nom`);
      const phoneRaw = get(`${prefix}_telephone`);
      const email = get(`${prefix}_email`).toLowerCase() || null;
      if (!name && !phoneRaw && !email) continue;
      if (!name) rowErrors.push({ line, column: `${prefix}_nom`, message: 'Nom du responsable manquant' });
      let phone: string | null = null;
      if (phoneRaw) {
        try {
          phone = toE164(phoneRaw);
        } catch {
          rowErrors.push({ line, column: `${prefix}_telephone`, message: `Téléphone invalide : ${phoneRaw}` });
        }
      }
      if (email && !EMAIL.test(email)) rowErrors.push({ line, column: `${prefix}_email`, message: `Email invalide : ${email}` });
      guardians.push({ name, phone, email, relation: get(`${prefix}_lien`) || null, isPrimary: guardians.length === 0 });
    }

    if (rowErrors.length) errors.push(...rowErrors);
    else students.push({ line, registrationNo, firstName, lastName, dateOfBirth: dob as Date | null, gender, guardians });
  });
  return { students, errors };
}

/** Modèle téléchargeable : en-têtes et une ligne d'exemple. */
export async function importTemplate(format: 'csv' | 'xlsx'): Promise<Buffer> {
  if (format === 'csv') return Buffer.from('﻿' + [IMPORT_COLUMNS.join(';'), EXAMPLE.join(';')].join('\r\n'), 'utf8');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Élèves');
  ws.columns = IMPORT_COLUMNS.map((h) => ({ header: h, width: 20 }));
  ws.getRow(1).font = { bold: true };
  ws.addRow(EXAMPLE);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
