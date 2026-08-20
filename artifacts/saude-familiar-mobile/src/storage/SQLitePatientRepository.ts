import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import type {
  CreatePatientInput,
  Patient,
  UpdatePatientInput,
} from '@/domain/patient';
import type { PatientRepository } from '@/repositories/PatientRepository';
import { createGlobalId } from '@/utils/ids';

type PatientRow = {
  id: string;
  name: string;
  birth_date: string | null;
  blood_type: string | null;
  allergies: string | null;
  emergency_contacts: string | null;
  notes: string | null;
  primary_doctor: string | null;
  health_insurance: string | null;
  health_insurance_number: string | null;
  created_at: string;
  updated_at: string;
};

function toPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    name: row.name,
    birthDate: row.birth_date,
    bloodType: row.blood_type,
    allergies: row.allergies,
    emergencyContacts: row.emergency_contacts,
    notes: row.notes,
    primaryDoctor: row.primary_doctor,
    healthInsurance: row.health_insurance,
    healthInsuranceNumber: row.health_insurance_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SQLitePatientRepository implements PatientRepository {
  constructor(private readonly database: SQLiteDatabase) {}

  async list(): Promise<Patient[]> {
    const rows = await this.database.getAllAsync<PatientRow>(
      'SELECT * FROM patients ORDER BY created_at ASC',
    );

    return rows.map(toPatient);
  }

  async getFirst(): Promise<Patient | null> {
    const row = await this.database.getFirstAsync<PatientRow>(
      'SELECT * FROM patients ORDER BY created_at ASC LIMIT 1',
    );

    return row ? toPatient(row) : null;
  }

  async getById(id: string): Promise<Patient | null> {
    const row = await this.database.getFirstAsync<PatientRow>(
      'SELECT * FROM patients WHERE id = ?',
      id,
    );

    return row ? toPatient(row) : null;
  }

  async create(input: CreatePatientInput): Promise<Patient> {
    const now = new Date().toISOString();
    const patient: Patient = {
      id: await createGlobalId(),
      name: input.name.trim(),
      birthDate: input.birthDate ?? null,
      bloodType: null,
      allergies: null,
      emergencyContacts: null,
      notes: input.notes ?? null,
      primaryDoctor: null,
      healthInsurance: null,
      healthInsuranceNumber: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.database.runAsync(
      `INSERT INTO patients (
        id, name, birth_date, blood_type, allergies, emergency_contacts,
        notes, primary_doctor, health_insurance, health_insurance_number,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      patient.id,
      patient.name,
      patient.birthDate,
      patient.bloodType,
      patient.allergies,
      patient.emergencyContacts,
      patient.notes,
      patient.primaryDoctor,
      patient.healthInsurance,
      patient.healthInsuranceNumber,
      patient.createdAt,
      patient.updatedAt,
    );

    return patient;
  }

  async update(id: string, input: UpdatePatientInput): Promise<Patient> {
    const now = new Date().toISOString();
    await this.database.runAsync(
      `UPDATE patients
       SET name = ?, birth_date = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      input.name.trim(),
      input.birthDate ?? null,
      input.notes ?? null,
      now,
      id,
    );

    const patient = await this.getById(id);
    if (!patient) {
      throw new Error('Familiar não encontrado.');
    }

    return patient;
  }

  async delete(id: string): Promise<void> {
    if (Platform.OS === 'web') {
      await this.database.withTransactionAsync(async () => {
        await this.database.runAsync('DELETE FROM consultations WHERE patient_id = ?', id);
        await this.database.runAsync('DELETE FROM patients WHERE id = ?', id);
      });
      return;
    }

    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync('DELETE FROM consultations WHERE patient_id = ?', id);
      await transaction.runAsync('DELETE FROM patients WHERE id = ?', id);
    });
  }
}
