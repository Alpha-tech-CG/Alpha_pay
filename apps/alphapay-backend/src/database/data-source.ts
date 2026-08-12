import 'reflect-metadata';
import { DataSource } from 'typeorm';

/** Standalone DataSource for the TypeORM CLI (migrations). Reads the same env. */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'alphapay',
  password: process.env.DB_PASSWORD ?? 'alphapay',
  database: process.env.DB_NAME ?? 'alphapay_db',
  entities: ['src/**/*.entity.ts', 'src/**/*.entities.ts'],
  migrations: ['src/database/migrations/*.ts'],
});
