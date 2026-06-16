const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, BorderStyle, WidthType, ShadingType,
        Header, Footer, PageNumber } = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };
const FONT = 'Arial';

function h1(text) {
  return new Paragraph({
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, bold: true, size: 28, font: FONT, color: '1F4E79' })]
  });
}
function h2(text) {
  return new Paragraph({
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text, bold: true, size: 24, font: FONT, color: '2E75B6' })]
  });
}
function h3(text) {
  return new Paragraph({
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text, bold: true, size: 22, font: FONT, color: '444444' })]
  });
}
function p(text) {
  return new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text, size: 20, font: FONT })] });
}
function code(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: { left: 360 },
    shading: { fill: 'F0F0F0', type: ShadingType.CLEAR },
    children: [new TextRun({ text, size: 18, font: 'Courier New', color: '333333' })]
  });
}
function bullet(text) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    indent: { left: 360 },
    children: [new TextRun({ text: '- ' + text, size: 20, font: FONT })]
  });
}
function space() { return new Paragraph({ spacing: { before: 120, after: 0 } }); }

function mkCell(text, opts = {}) {
  const { fill = 'FFFFFF', bold = false, color = '222222', w = 2000 } = opts;
  return new TableCell({
    borders, width: { size: w, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, bold, size: 20, font: FONT, color })] })]
  });
}
function hRow(cols, ws) {
  return new TableRow({ children: cols.map((t, i) => mkCell(t, { fill: '1F4E79', bold: true, color: 'FFFFFF', w: ws[i] })) });
}
function dRow(cols, ws, shade = false) {
  return new TableRow({ children: cols.map((t, i) => mkCell(t, { fill: shade ? 'EEF4FB' : 'FFFFFF', w: ws[i] })) });
}

const W = 9638;

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
        children: [new TextRun({ text: 'PayBrain — FSD v1.0  |  Groupe Alpha  |  Confidentiel', size: 16, font: FONT, color: '888888' })]
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
      // TITRE
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 720, after: 80 }, children: [new TextRun({ text: 'GROUPE ALPHA', bold: true, size: 22, font: FONT, color: '888888' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80 }, children: [new TextRun({ text: 'PayBrain', bold: true, size: 64, font: FONT, color: '1F4E79' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80 }, children: [new TextRun({ text: 'Agregateur de Paiement Mobile — Congo-Brazzaville', size: 24, font: FONT, color: '2E75B6' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 320, after: 640 }, children: [new TextRun({ text: 'FUNCTIONAL SPECIFICATIONS DOCUMENT — v1.0', bold: true, size: 26, font: FONT, color: '1F4E79' })] }),

      new Table({
        width: { size: W, type: WidthType.DXA }, columnWidths: [2800, W - 2800],
        rows: [
          hRow(['Champ', 'Valeur'], [2800, W - 2800]),
          dRow(['Document', 'FSD PayBrain v1.0'], [2800, W - 2800]),
          dRow(['Projet', 'PayBrain — Agregateur Paiement Mobile Congo'], [2800, W - 2800], true),
          dRow(['Redacteur', 'Miche — DG & Developpeur Principal'], [2800, W - 2800]),
          dRow(['Date', 'Juin 2026'], [2800, W - 2800], true),
          dRow(['Perimetre', 'Phase 2 MVP — MTN MoMo sandbox + webhooks'], [2800, W - 2800]),
        ]
      }),

      space(), space(),

      // 1. FLUX PRINCIPAL
      h1('1. Flux Principal — Initiation de Paiement'),
      h2('1.1 Endpoint : POST /payments'),
      h3('Requete'),
      code('POST /payments'),
      code('Content-Type: application/json'),
      code('X-API-Key: {cle_api_marchand}'),
      space(),
      code('{'),
      code('  "amount": 10000,'),
      code('  "phone": "242066123456",'),
      code('  "description": "Frais scolarite Janvier 2026",'),
      code('  "merchantExternalId": "ECOLE-001-INV-2026"'),
      code('}'),
      space(),
      h3('Reponse succes (HTTP 202)'),
      code('{'),
      code('  "success": true,'),
      code('  "referenceId": "uuid-genere-par-paybrain",'),
      code('  "status": "PENDING",'),
      code('  "message": "Demande envoyee. Le client doit confirmer sur son telephone.",'),
      code('  "operator": "MTN"'),
      code('}'),
      space(),
      h3('Validations'),
      bullet('amount > 0 et present'),
      bullet('phone present et format reconnu (242XXXXXXXXX ou numéros sandbox MTN)'),
      bullet('Operateur detecte par prefixe : MTN = 066/067/068, Airtel = 055-058/074-077'),
      bullet('Phase 2 : retourner erreur 400 si operateur != MTN'),
      space(),
      h3('Codes erreur'),
      new Table({
        width: { size: W, type: WidthType.DXA }, columnWidths: [1200, 2200, W - 3400],
        rows: [
          hRow(['HTTP', 'Code', 'Cause'], [1200, 2200, W - 3400]),
          dRow(['400', 'MISSING_FIELD', 'amount ou phone absent'], [1200, 2200, W - 3400]),
          dRow(['400', 'INVALID_AMOUNT', 'Montant <= 0'], [1200, 2200, W - 3400], true),
          dRow(['400', 'OPERATOR_NOT_SUPPORTED', 'Airtel (Phase 3)'], [1200, 2200, W - 3400]),
          dRow(['400', 'INVALID_PHONE', 'Numero non reconnu'], [1200, 2200, W - 3400], true),
          dRow(['409', 'DUPLICATE_REFERENCE', 'referenceId deja utilise (MTN)'], [1200, 2200, W - 3400]),
          dRow(['500', 'MTN_ERROR', 'Erreur API MTN (retry apres 30s)'], [1200, 2200, W - 3400], true),
        ]
      }),

      space(),
      h1('2. Flux Consultation Statut'),
      h2('2.1 Endpoint : GET /payments/:referenceId'),
      h3('Reponse (HTTP 200)'),
      code('{'),
      code('  "referenceId": "uuid",'),
      code('  "status": "SUCCESSFUL",'),
      code('  "amount": "10000",'),
      code('  "currency": "XAF",'),
      code('  "payer": { "partyIdType": "MSISDN", "partyId": "242066123456" },'),
      code('  "reason": null'),
      code('}'),
      space(),
      p('Statuts possibles : PENDING | SUCCESSFUL | FAILED | REJECTED'),
      p('PENDING = en attente confirmation client. Interroger apres 30s si pas de webhook recu.'),

      space(),
      h1('3. Flux Webhook — Callback MTN'),
      h2('3.1 Endpoint : POST /webhooks/mtn'),
      p('MTN appelle cette URL lorsque le paiement est confirme, refuse ou expire par le client.'),
      h3('Payload MTN entrant'),
      code('{'),
      code('  "financialTransactionId": "uuid-interne-mtn",'),
      code('  "externalId": "ECOLE-001-INV-2026",'),
      code('  "amount": "10000",'),
      code('  "currency": "XAF",'),
      code('  "payer": { "partyIdType": "MSISDN", "partyId": "242066123456" },'),
      code('  "status": "SUCCESSFUL"'),
      code('}'),
      space(),
      h3('Traitement PayBrain'),
      bullet('1. Logger le payload brut dans webhooks_log (PostgreSQL)'),
      bullet('2. Identifier la transaction par financialTransactionId ou externalId'),
      bullet('3. Mettre a jour transactions.status = SUCCESSFUL / FAILED / REJECTED'),
      bullet('4. TODO Phase 2 : notifier le marchand (webhook sortant ou SMS)'),
      bullet('5. Toujours repondre HTTP 200 a MTN (meme en cas d\'erreur interne)'),
      space(),
      h3('Reponse PayBrain a MTN (HTTP 200)'),
      code('{ "received": true }'),
      space(),
      p('NOTE PRODUCTION : valider la signature HMAC de MTN avant tout traitement.'),

      space(),
      h1('4. Flux Erreur & Retry'),
      h2('4.1 Codes MTN et comportement PayBrain'),
      new Table({
        width: { size: W, type: WidthType.DXA }, columnWidths: [1200, 2600, W - 3800],
        rows: [
          hRow(['Code MTN', 'Signification', 'Action PayBrain'], [1200, 2600, W - 3800]),
          dRow(['202', 'PENDING — en attente', 'Stocker PENDING, attendre webhook'], [1200, 2600, W - 3800]),
          dRow(['400', 'Donnees invalides', 'Logger, retourner erreur 400 au marchand'], [1200, 2600, W - 3800], true),
          dRow(['404', 'ReferenceId inconnu', 'Alerte ops, verifier la DB'], [1200, 2600, W - 3800]),
          dRow(['409', 'ReferenceId duplique', 'Generer un nouvel UUID, reessayer'], [1200, 2600, W - 3800], true),
          dRow(['500', 'Erreur interne MTN', 'Retry automatique apres 30s (Redis Queue)'], [1200, 2600, W - 3800]),
        ]
      }),

      space(),
      h1('5. Modele de Donnees'),
      h2('5.1 Table transactions'),
      new Table({
        width: { size: W, type: WidthType.DXA }, columnWidths: [2200, 1800, W - 4000],
        rows: [
          hRow(['Colonne', 'Type', 'Description'], [2200, 1800, W - 4000]),
          dRow(['id', 'UUID PK', 'Identifiant interne PayBrain'], [2200, 1800, W - 4000]),
          dRow(['merchant_id', 'UUID FK', 'Marchand emetteur (null en Phase 2)'], [2200, 1800, W - 4000], true),
          dRow(['mtn_reference_id', 'UUID UNIQUE', 'X-Reference-Id envoye a MTN'], [2200, 1800, W - 4000]),
          dRow(['external_id', 'VARCHAR', 'ID interne du marchand'], [2200, 1800, W - 4000], true),
          dRow(['amount', 'DECIMAL(10,2)', 'Montant en XAF'], [2200, 1800, W - 4000]),
          dRow(['currency', 'VARCHAR(3)', 'XAF (EUR en sandbox)'], [2200, 1800, W - 4000], true),
          dRow(['payer_phone', 'VARCHAR(20)', 'Numero payeur format E.164'], [2200, 1800, W - 4000]),
          dRow(['status', 'VARCHAR(20)', 'PENDING | SUCCESSFUL | FAILED | REJECTED'], [2200, 1800, W - 4000], true),
          dRow(['failure_reason', 'TEXT', 'Raison echec (si applicable)'], [2200, 1800, W - 4000]),
          dRow(['created_at / updated_at', 'TIMESTAMP', 'Horodatages creation et mise a jour'], [2200, 1800, W - 4000], true),
        ]
      }),

      space(),
      h2('5.2 Table webhooks_log'),
      new Table({
        width: { size: W, type: WidthType.DXA }, columnWidths: [2200, 1800, W - 4000],
        rows: [
          hRow(['Colonne', 'Type', 'Description'], [2200, 1800, W - 4000]),
          dRow(['id', 'UUID PK', 'Identifiant log'], [2200, 1800, W - 4000]),
          dRow(['mtn_reference_id', 'TEXT', 'ID de reference MTN (financialTransactionId ou externalId)'], [2200, 1800, W - 4000], true),
          dRow(['raw_payload', 'JSONB', 'Payload brut recu de MTN'], [2200, 1800, W - 4000]),
          dRow(['processed', 'BOOLEAN', 'true apres traitement reussi'], [2200, 1800, W - 4000], true),
          dRow(['received_at', 'TIMESTAMP', 'Horodatage reception'], [2200, 1800, W - 4000]),
        ]
      }),

      space(),
      h1('6. Detection Operateur par Prefixe'),
      new Table({
        width: { size: W, type: WidthType.DXA }, columnWidths: [2400, 2400, W - 4800],
        rows: [
          hRow(['Prefixes', 'Operateur', 'Format exemple'], [2400, 2400, W - 4800]),
          dRow(['066, 067, 068', 'MTN Congo', '242066XXXXXX'], [2400, 2400, W - 4800]),
          dRow(['055, 056, 057, 058', 'Airtel Congo', '242055XXXXXX'], [2400, 2400, W - 4800], true),
          dRow(['074, 075, 076, 077', 'Airtel Congo', '242074XXXXXX'], [2400, 2400, W - 4800]),
          dRow(['46733123450/51/52', 'MTN Sandbox', 'Numeros de test uniquement'], [2400, 2400, W - 4800], true),
        ]
      }),

      space(),
      h1('7. Securite'),
      bullet('HTTPS obligatoire sur tous les endpoints (nginx + Let\'s Encrypt en production)'),
      bullet('API Key par marchand transmise dans le header X-API-Key'),
      bullet('Rate limiting : 100 requetes/minute par API Key'),
      bullet('Validation HMAC MTN sur les webhooks entrants (obligatoire en production)'),
      bullet('Variables d\'environnement pour toutes les cles (jamais dans le code)'),
      bullet('Logs d\'audit complets dans PostgreSQL (table audit_log en Phase 4)'),

      space(), space(),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: 'GROUPE ALPHA — DATABRAIN  |  FSD PayBrain v1.0  |  Juin 2026  |  Confidentiel', size: 16, font: FONT, color: '999999' })] }),
    ]
  }]
});

Packer.toBuffer(doc).then(b => {
  fs.writeFileSync('D:/Alphapay/paybrain/docs/FSD_PayBrain_v1.docx', b);
  console.log('FSD cree : docs/FSD_PayBrain_v1.docx');
}).catch(e => { console.error(e); process.exit(1); });
