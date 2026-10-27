import { creditCost } from './credits.service';
import { TEMPLATE_CATALOG } from './templates.catalog';
import { interpolate, MissingVariableError, renderTemplate } from './template.service';

describe('rendu des modèles', () => {
  it('remplace les variables et refuse une variable manquante', () => {
    expect(interpolate('Code {{ code }} pour {{nom}}', { code: '123456', nom: 'Awa' })).toBe('Code 123456 pour Awa');
    expect(() => interpolate('Code {{code}}', {})).toThrow(MissingVariableError);
  });

  it('prépare un modèle WhatsApp avec ses variables dans l’ordre déclaré', () => {
    const t = TEMPLATE_CATALOG.find((x) => x.key === 'verif.paiement_recu' && x.channel === 'WHATSAPP')!;
    const r = renderTemplate(
      { subject: null, body: t.body, whatsappTemplateName: t.whatsappTemplateName!, variables: t.variables! },
      { amount: '15 000 XAF', payer: 'Jean M.', operator: 'MTN', reference: 'AP-8F3K2' },
    );
    expect(r.text).toBe('Paiement reçu : 15 000 XAF de Jean M., MTN, réf. AP-8F3K2');
    expect(r.whatsapp).toEqual({ name: 'alphapay_paiement_recu', variables: ['15 000 XAF', 'Jean M.', 'MTN', 'AP-8F3K2'] });
  });
});

describe('catalogue', () => {
  it('a des clés (clé, canal, version) uniques et n’emploie aucun vocabulaire interdit (§4.4)', () => {
    const ids = TEMPLATE_CATALOG.map((t) => `${t.key}|${t.channel}|${t.version}`);
    expect(new Set(ids).size).toBe(ids.length);
    const forbidden = /porte-monnaie AlphaPay|compte AlphaPay|solde AlphaPay|nous encaissons pour vous|nous vous reversons/i;
    for (const t of TEMPLATE_CATALOG) expect(`${t.subject ?? ''} ${t.body}`).not.toMatch(forbidden);
  });

  it('chaque modèle WhatsApp désigne un modèle Meta et ses variables', () => {
    for (const t of TEMPLATE_CATALOG.filter((x) => x.channel === 'WHATSAPP')) {
      expect(t.whatsappTemplateName).toBeTruthy();
      expect(Array.isArray(t.variables)).toBe(true);
    }
  });
});

describe('coût en crédits', () => {
  it('1 crédit par défaut, surchargeable par configuration', () => {
    expect(creditCost('SMS')).toBe(1);
    process.env.MESSAGE_CREDIT_COSTS = '{"WHATSAPP":2,"EMAIL":0}';
    expect(creditCost('WHATSAPP')).toBe(2);
    expect(creditCost('EMAIL')).toBe(0);
    expect(creditCost('SMS')).toBe(1);
    delete process.env.MESSAGE_CREDIT_COSTS;
  });
});
