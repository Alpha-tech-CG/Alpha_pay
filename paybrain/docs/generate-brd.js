const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
        Header, Footer, PageNumber } = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };
const FONT = 'Arial';

function h1(text) {
  return new Paragraph({
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, bold: true, size: 28, font: FONT, color: '1F4E79' })]
  });
}
function h2(text) {
  return new Paragraph({
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true, size: 24, font: FONT, color: '2E75B6' })]
  });
}
function p(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text, size: 20, font: FONT })]
  });
}
function bullet(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: { left: 360 },
    children: [new TextRun({ text: '— ' + text, size: 20, font: FONT })]
  });
}
function cell(text, opts = {}) {
  const { fill = 'FFFFFF', bold = false, color = '000000', size = 20 } = opts;
  return new TableCell({
    borders,
    width: { size: opts.width || 3000, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, bold, size, font: FONT, color })] })]
  });
}
function headerRow(cols, widths) {
  return new TableRow({ children: cols.map((t, i) => cell(t, { fill: '1F4E79', bold: true, color: 'FFFFFF', width: widths[i] })) });
}
function dataRow(cols, widths, shade = false) {
  return new TableRow({ children: cols.map((t, i) => cell(t, { fill: shade ? 'F5F9FF' : 'FFFFFF', width: widths[i] })) });
}
function space() {
  return new Paragraph({ spacing: { before: 160, after: 0 } });
}

const doc = new Document({
  sections: [{
    properties: {
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } }
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '2E75B6' } },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'PayBrain — BRD v1.0  |  Groupe Alpha  |  Confidentiel', size: 16, font: FONT, color: '888888' })]
      })] })
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: '2E75B6' } },
        spacing: { before: 80 },
        children: [
          new TextRun({ text: 'Page ', size: 16, font: FONT, color: '888888' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, font: FONT, color: '888888' }),
        ]
      })] })
    },
    children: [
      // === PAGE DE TITRE ===
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 720, after: 120 }, children: [new TextRun({ text: 'GROUPE ALPHA', bold: true, size: 22, font: FONT, color: '888888' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80 }, children: [new TextRun({ text: 'PayBrain', bold: true, size: 64, font: FONT, color: '1F4E79' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80 }, children: [new TextRun({ text: 'Agregateur de Paiement Mobile — Congo-Brazzaville', size: 26, font: FONT, color: '2E75B6' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 320, after: 640 }, children: [new TextRun({ text: 'BUSINESS REQUIREMENTS DOCUMENT — v1.0', bold: true, size: 26, font: FONT, color: '1F4E79' })] }),

      new Table({
        width: { size: 9638, type: WidthType.DXA },
        columnWidths: [2800, 6838],
        rows: [
          headerRow(['Champ', 'Valeur'], [2800, 6838]),
          dataRow(['Document', 'BRD PayBrain v1.0'], [2800, 6838]),
          dataRow(['Projet', 'PayBrain — Agregateur Paiement Mobile Congo'], [2800, 6838], true),
          dataRow(['Redacteur', 'Miche — DG & Developpeur Principal'], [2800, 6838]),
          dataRow(['Date', 'Juin 2026'], [2800, 6838], true),
          dataRow(['Statut', 'DRAFT — Phase 1'], [2800, 6838]),
        ]
      }),

      space(), space(),

      // === SECTION 1 ===
      h1('1. Contexte & Probleme'),
      p('Les marchands congolais (ecoles, cliniques, commerces, PME) souhaitent accepter les paiements mobiles MTN MoMo et Airtel Money. Chaque integration prend 3 a 6 mois, necessite des accords commerciaux separes et une expertise technique que la majorite des marchands ne possede pas.'),
      p('PayBrain resout ce probleme en proposant une API unifiee, un dashboard de suivi et des outils cle en main pour accepter les paiements des deux reseaux en quelques heures.'),

      space(),
      h1('2. Modele de Revenus'),
      h2('2.1 Commission par transaction'),
      new Table({
        width: { size: 9638, type: WidthType.DXA },
        columnWidths: [3200, 3200, 3238],
        rows: [
          headerRow(['Segment marchand', 'Commission PayBrain', 'Frais operateur'], [3200, 3200, 3238]),
          dataRow(['Ecoles / ONG', '1,5 % par transaction', 'Absorbe (modele B2B)'], [3200, 3200, 3238]),
          dataRow(['PME / Commerces', '2,0 % par transaction', 'Absorbe (modele B2B)'], [3200, 3200, 3238], true),
          dataRow(['Cliniques / Sante', '1,8 % par transaction', 'Absorbe (modele B2B)'], [3200, 3200, 3238]),
        ]
      }),

      space(),
      h2('2.2 Flux monetaire'),
      bullet('Le client paie via MTN MoMo ou Airtel Money (ex : 10 000 XAF)'),
      bullet("L'operateur debite le client et credite le compte collecte PayBrain"),
      bullet("PayBrain preleve sa commission (ex : 1,5 % = 150 XAF) et vire le net (9 850 XAF) au marchand sous 24h"),
      bullet("Phase 3-4 : compte de transit chez partenaire bancaire (BGFI ou Ecobank) pour conformite COBAC"),

      space(),
      h2('2.3 Plafonds de transactions'),
      new Table({
        width: { size: 9638, type: WidthType.DXA },
        columnWidths: [3238, 3200, 3200],
        rows: [
          headerRow(['Parametre', 'Sandbox', 'Production (cible)'], [3238, 3200, 3200]),
          dataRow(['Montant minimum', '1 XAF', '500 XAF'], [3238, 3200, 3200]),
          dataRow(['Montant maximum', 'Illimite (sandbox)', '500 000 XAF'], [3238, 3200, 3200], true),
          dataRow(['Devise', 'EUR (sandbox MTN)', 'XAF'], [3238, 3200, 3200]),
          dataRow(['Delai virement marchand', 'N/A', 'T+1 (24h ouvrees)'], [3238, 3200, 3200], true),
          dataRow(['Qui supporte les frais MTN/Airtel', 'N/A', 'PayBrain (negocie en bloc)'], [3238, 3200, 3200]),
        ]
      }),

      space(),
      h1('3. Exigences Fonctionnelles'),
      new Table({
        width: { size: 9638, type: WidthType.DXA },
        columnWidths: [800, 2500, 6338],
        rows: [
          headerRow(['#', 'Fonction', 'Description'], [800, 2500, 6338]),
          dataRow(['F1', 'Initiation paiement', 'POST /payments (montant + numero + description) → referenceId + PENDING'], [800, 2500, 6338]),
          dataRow(['F2', 'Routing operateur', 'Detection MTN / Airtel par prefixe numero congolais (242066/067/068 = MTN)'], [800, 2500, 6338], true),
          dataRow(['F3', 'Webhook entrant', 'Reception callbacks MTN/Airtel → mise a jour statut DB (SUCCESSFUL/FAILED/REJECTED)'], [800, 2500, 6338]),
          dataRow(['F4', 'Consultation statut', 'GET /payments/:id → statut temps reel'], [800, 2500, 6338], true),
          dataRow(['F5', 'Dashboard marchand', 'Liste transactions, filtres date/statut, export CSV'], [800, 2500, 6338]),
          dataRow(['F6', 'Auth marchand', 'API Key unique par marchand, rate limiting 100 req/min'], [800, 2500, 6338], true),
          dataRow(['F7', 'Recu PDF', 'Generation automatique apres confirmation paiement'], [800, 2500, 6338]),
        ]
      }),

      space(),
      h1('4. Contraintes & Hypotheses'),
      bullet('Phase 2 : MTN uniquement. Airtel integre en Phase 3'),
      bullet("Operation en sandbox jusqu'a l'accord commercial MTN Congo production"),
      bullet('Conformite COBAC requise en Phase 4 via partenariat bancaire (BGFI ou Ecobank)'),
      bullet("Depot nom commercial PayBrain a l'ANPCE avant toute demonstration externe"),
      bullet('Miche seul developpeur jusqu\'a Phase 4 — MVP strict, zero feature creep'),

      space(),
      h1('5. Risques Cles'),
      new Table({
        width: { size: 9638, type: WidthType.DXA },
        columnWidths: [3000, 1200, 5438],
        rows: [
          headerRow(['Risque', 'Niveau', 'Mitigation'], [3000, 1200, 5438]),
          dataRow(['MTN Congo refuse accord production', 'ELEVE', 'Route via BGFI/Ecobank qui a deja les accords operateurs'], [3000, 1200, 5438]),
          dataRow(['Copie du projet', 'ELEVE', 'Depot ANPCE immediat + NDA + lancer pilote avant demo externe'], [3000, 1200, 5438], true),
          dataRow(['Problemes COBAC', 'MOYEN', 'Operer sous couverture bancaire en Phase 3-4'], [3000, 1200, 5438]),
          dataRow(['Surcharge dev (Miche seul)', 'MOYEN', 'MVP strict — un flux, un reseau. Pas de feature creep avant pilote'], [3000, 1200, 5438], true),
        ]
      }),

      space(), space(),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: 'GROUPE ALPHA — DATABRAIN  |  BRD PayBrain v1.0  |  Juin 2026  |  Confidentiel', size: 16, font: FONT, color: '999999' })] }),
    ]
  }]
});

Packer.toBuffer(doc).then(b => {
  fs.writeFileSync('D:/Alphapay/paybrain/docs/BRD_PayBrain_v1.docx', b);
  console.log('BRD cree : docs/BRD_PayBrain_v1.docx');
}).catch(e => { console.error(e); process.exit(1); });
