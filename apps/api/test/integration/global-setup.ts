import { execFileSync } from 'child_process';
import { resolve } from 'path';

/** Applique les migrations versionnées sur la base de test avant la suite. */
export default async function globalSetup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://alphapay:alphapay@localhost:5433/alphapay_test';
  const schema = resolve(__dirname, '../../../../packages/database/prisma/schema.prisma');
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', `--schema=${schema}`], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
}
