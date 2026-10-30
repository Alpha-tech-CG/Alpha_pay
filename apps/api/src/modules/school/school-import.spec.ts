import { importTemplate, parseCsv, parseXlsx, validateRows } from './school-import';

describe('Import des élèves (§M8)', () => {
  it('CSV « ; » (Excel français), guillemets et accents', () => {
    const rows = parseCsv('﻿matricule;Prénom;Nom\r\n"001";"Grâce; dite ""Gigi""";Mabiala\r\n');
    expect(rows).toEqual([
      ['matricule', 'Prénom', 'Nom'],
      ['001', 'Grâce; dite "Gigi"', 'Mabiala'],
    ]);
  });

  it('valide ligne par ligne : erreurs numérotées, lignes valides importées', () => {
    const { students, errors } = validateRows([
      ['matricule', 'prenom', 'nom', 'date_naissance', 'sexe', 'responsable_nom', 'responsable_telephone'],
      ['001', 'Grâce', 'Mabiala', '12/03/2015', 'F', 'Marie Mabiala', '061234567'],
      ['002', '', 'Ngoma', '', '', '', ''],
      ['001', 'Paul', 'Ngoma', '2015-02-30', 'X', 'Jean', '12'],
    ]);
    expect(students).toHaveLength(1);
    expect(students[0]).toMatchObject({ registrationNo: '001', firstName: 'Grâce', gender: 'F' });
    expect(students[0].guardians[0]).toMatchObject({ name: 'Marie Mabiala', phone: '+242061234567', isPrimary: true });
    expect(students[0].dateOfBirth!.toISOString().slice(0, 10)).toBe('2015-03-12');
    expect(errors.map((e) => [e.line, e.column])).toEqual([
      [3, 'prenom'],
      [4, 'matricule'],
      [4, 'date_naissance'],
      [4, 'sexe'],
      [4, 'responsable_telephone'],
    ]);
  });

  it('refuse un fichier sans les colonnes obligatoires', () => {
    expect(validateRows([['nom'], ['X']]).errors[0].message).toMatch(/prenom/);
  });

  it('le modèle Excel se relit à l’identique', async () => {
    const rows = await parseXlsx(await importTemplate('xlsx'));
    expect(rows[0][1]).toBe('prenom');
    expect(validateRows(rows).students).toHaveLength(1);
  });
});
