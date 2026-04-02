import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * Standalone DataSource used by the TypeORM CLI for migrations.
 * Reads DATABASE_URL from the environment (loaded via dotenv above).
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/entities/*.ts'],
  migrations: ['src/migrations/*.ts'],
});
