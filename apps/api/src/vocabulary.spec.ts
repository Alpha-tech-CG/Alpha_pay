import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { extname, join, relative } from 'path';

/**
 * Vocabulaire interdit (§4.4) : AlphaPay ne détient pas d'argent, l'interface et
 * la documentation ne doivent jamais laisser croire le contraire. Balaye les
 * textes livrés : API (messages, page de paiement, portail), tableau de bord,
 * back-office, documentation. Une ligne qui CITE la règle (« jamais … ») est permise.
 */
const ROOT = join(__dirname, '..', '..', '..');
const SCANNED = ['apps/api/src', 'dashboard/src', 'admin/src', 'docs', 'README.md'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'archive', 'api']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.html', '.md', '.json']);
const FORBIDDEN = /porte-monnaie AlphaPay|compte AlphaPay|solde AlphaPay|nous encaissons pour vous|nous vous reversons/i;
const CITES_RULE = /jamais|interdit|§4\.4|forbidden/i;

function files(path: string): string[] {
  const full = join(ROOT, path);
  if (!existsSync(full)) return []; // image Docker de l'API : fronts absents
  if (!statSync(full).isDirectory()) return [full];
  return readdirSync(full).flatMap((name) => (SKIP_DIRS.has(name) ? [] : files(join(path, name))));
}

describe('Vocabulaire interdit (§4.4)', () => {
  it('aucun texte livré ne parle de porte-monnaie, de solde ou de compte d’argent AlphaPay', () => {
    const offenders: string[] = [];
    for (const file of SCANNED.flatMap(files)) {
      if (!EXTENSIONS.has(extname(file)) || file.endsWith('vocabulary.spec.ts') || file.endsWith('CAHIER_DES_CHARGES_ALPHAPAY_V1.md')) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (FORBIDDEN.test(line) && !CITES_RULE.test(line)) offenders.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
