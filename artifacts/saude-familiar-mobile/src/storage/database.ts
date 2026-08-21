import type { SQLiteDatabase } from 'expo-sqlite';

const INITIAL_MIGRATION = 1;
const OPTIONAL_BIRTH_DATE_MIGRATION = 2;
const CAREGIVER_MIGRATION = 3;
const CAREGIVER_SINGLETON_MIGRATION = 4;
const CONSULTATIONS_MIGRATION = 5;
const REMINDERS_MIGRATION = 6;
const REMINDER_ALERT_MODE_MIGRATION = 7;

async function getLatestMigration(database: SQLiteDatabase): Promise<number> {
  const migration = await database.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
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
    'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
    INITIAL_MIGRATION,
    new Date().toISOString(),
  );
}

async function migrateBirthDateToOptional(database: SQLiteDatabase): Promise<void> {
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
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      OPTIONAL_BIRTH_DATE_MIGRATION,
      new Date().toISOString(),
    );
  });
}

async function createCaregiverSchema(database: SQLiteDatabase): Promise<void> {
  await database.withTransactionAsync(async () => {
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
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      CAREGIVER_MIGRATION,
      new Date().toISOString(),
    );
  });
}

async function enforceSingleCaregiver(database: SQLiteDatabase): Promise<void> {
  await database.withTransactionAsync(async () => {
    await database.execAsync(`
      DELETE FROM caregivers
      WHERE id NOT IN (
        SELECT id
        FROM caregivers
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      );
      CREATE UNIQUE INDEX IF NOT EXISTS caregivers_singleton_idx
        ON caregivers ((1));
    `);

    await database.runAsync(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      CAREGIVER_SINGLETON_MIGRATION,
      new Date().toISOString(),
    );
  });
}

async function createConsultationsSchema(database: SQLiteDatabase): Promise<void> {
  await database.withTransactionAsync(async () => {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS consultations (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL,
        specialty TEXT NOT NULL,
        professional_name TEXT,
        location TEXT,
        phone TEXT,
        date TEXT,
        time TEXT,
        notes TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'scheduled', 'completed', 'cancelled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS consultations_patient_idx
        ON consultations (patient_id, status, date, time);
    `);

    await database.runAsync(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      CONSULTATIONS_MIGRATION,
      new Date().toISOString(),
    );
  });
}

async function addReminderAlertMode(database: SQLiteDatabase): Promise<void> {
  await database.withTransactionAsync(async () => {
    await database.execAsync(`
      ALTER TABLE reminders
      ADD COLUMN alert_mode TEXT NOT NULL DEFAULT 'normal'
      CHECK (alert_mode IN ('silent', 'normal', 'highlight'));
    `);

    await database.runAsync(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      REMINDER_ALERT_MODE_MIGRATION,
      new Date().toISOString(),
    );
  });
}

async function createRemindersSchema(database: SQLiteDatabase): Promise<void> {
  await database.withTransactionAsync(async () => {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY NOT NULL,
        consultation_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('consultation_advance', 'scheduling_task')),
        trigger_at TEXT NOT NULL,
        offset_value INTEGER,
        offset_unit TEXT CHECK (offset_unit IN ('minutes', 'hours', 'days')),
        notification_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS reminders_consultation_idx
        ON reminders (consultation_id, trigger_at);
      CREATE INDEX IF NOT EXISTS reminders_trigger_idx
        ON reminders (trigger_at);
    `);

    await database.runAsync(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      REMINDERS_MIGRATION,
      new Date().toISOString(),
    );
  });
}

export async function initializeDatabase(database: SQLiteDatabase): Promise<void> {
  await database.execAsync('PRAGMA journal_mode = WAL;');
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
    currentVersion = CAREGIVER_MIGRATION;
  }
  if (currentVersion < CAREGIVER_SINGLETON_MIGRATION) {
    await enforceSingleCaregiver(database);
    currentVersion = CAREGIVER_SINGLETON_MIGRATION;
  }
  if (currentVersion < CONSULTATIONS_MIGRATION) {
    await createConsultationsSchema(database);
    currentVersion = CONSULTATIONS_MIGRATION;
  }
  if (currentVersion < REMINDERS_MIGRATION) {
    await createRemindersSchema(database);
    currentVersion = REMINDERS_MIGRATION;
  }
  if (currentVersion < REMINDER_ALERT_MODE_MIGRATION) {
    await addReminderAlertMode(database);
    currentVersion = REMINDER_ALERT_MODE_MIGRATION;
  }
}
