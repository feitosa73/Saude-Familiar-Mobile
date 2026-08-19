import type { SQLiteDatabase } from 'expo-sqlite';

const INITIAL_MIGRATION = 1;

export async function initializeDatabase(database: SQLiteDatabase): Promise<void> {
  await database.execAsync('PRAGMA journal_mode = WAL;');
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const migration = await database.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_migrations WHERE version = ?',
    INITIAL_MIGRATION,
  );

  if (migration) {
    return;
  }

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      birth_date TEXT NOT NULL,
      blood_type TEXT,
      allergies TEXT,
      emergency_contacts TEXT,
      notes TEXT,
      primary_doctor TEXT,
      health_insurance TEXT,
      health_insurance_number TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await database.runAsync(
    'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
    INITIAL_MIGRATION,
    new Date().toISOString(),
  );
}