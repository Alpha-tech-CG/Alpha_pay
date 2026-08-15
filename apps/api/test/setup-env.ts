// Exécuté par Jest AVANT le chargement de tout module de test (jest `setupFiles`),
// donc avant que `@paybrain/database` ne construise son PrismaClient singleton au
// premier import — c'est le seul moment où pointer DATABASE_URL vers la base de
// test (`paybrain_test`, schéma cloné de la base dev via pg_dump, cf. handoff §D)
// est garanti d'avoir un effet.
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/paybrain_test';

// dotenv (chargé par ConfigModule.forRoot dans AppModule) ne écrase jamais une
// variable déjà définie dans process.env — DATABASE_URL ci-dessus est donc
// protégé même si apps/api/.env en définit une autre.
