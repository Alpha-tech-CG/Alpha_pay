import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

/**
 * Garde-fou d'injection : compile le graphe complet des modules (API et
 * worker partagent AppModule). Une dépendance non exportée ou circulaire
 * casse ce test au lieu de casser le démarrage. Aucune connexion n'est
 * ouverte : la compilation ne fait que résoudre les fournisseurs.
 */
describe('AppModule', () => {
  it('résout toutes les dépendances', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  }, 30_000);
});
