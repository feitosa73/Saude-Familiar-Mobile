import type { SQLiteDatabase } from "expo-sqlite";

const INITIAL_MIGRATION = 1;
const OPTIONAL_BIRTH_DATE_MIGRATION = 2;
const CAREGIVER_MIGRATION = 3;

async function getLatestMigration(database: SQLiteDatabase): Promise<number> {
  const migration = await database.getFirstAsync<{ version: number }>(
    "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
  );

  return migration?.version ?? 0;
}

async function createInitialSchema(database: SQLiteDatabase): Promise<void> {
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
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
    INITIAL_MIGRATION,
    new Date().toISOString(),
  );
}

async function migrateBirthDateToOptional(
  database: SQLiteDatabase,
): Promise<void> {
  await database.withTransactionAsync(async () => {
    await database.execAsync(`
      CREATE TABLE patients_v2 (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        birth_date TEXT,
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

      INSERT INTO patients_v2 (
        id, name, birth_date, blood_type, allergies, emergency_contacts,
        notes, primary_doctor, health_insurance, health_insurance_number,
        created_at, updated_at
      )
      SELECT
        id, name, birth_date, blood_type, allergies, emergency_contacts,
        notes, primary_doctor, health_insurance, health_insurance_number,
        created_at, updated_at
      FROM patients;

      DROP TABLE patients;
      ALTER TABLE patients_v2 RENAME TO patients;
    `);

    await database.runAsync(
      "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      OPTIONAL_BIRTH_DATE_MIGRATION,
      new Date().toISOString(),
    );
  });
}

async function createCaregiverSchema(database: SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS caregivers (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      photo_uri TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await database.runAsync(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
    CAREGIVER_MIGRATION,
    new Date().toISOString(),
  );
}

export async function initializeDatabase(
  database: SQLiteDatabase,
): Promise<void> {
  await database.execAsync("PRAGMA journal_mode = WAL;");
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  let currentVersion = await getLatestMigration(database);

  if (currentVersion < INITIAL_MIGRATION) {
    await createInitialSchema(database);
    currentVersion = INITIAL_MIGRATION;
  }

  if (currentVersion < OPTIONAL_BIRTH_DATE_MIGRATION) {
    await migrateBirthDateToOptional(database);
    currentVersion = OPTIONAL_BIRTH_DATE_MIGRATION;
  }
  if (currentVersion < CAREGIVER_MIGRATION) {
    await createCaregiverSchema(database);
  }
}
