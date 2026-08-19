import type { SQLiteDatabase } from 'expo-sqlite';
import type { CreatePatientInput, Patient } from '@/domain/patient';
import type { PatientRepository } from '@/repositories/PatientRepository';
import { createGlobalId } from '@/utils/ids';

type PatientRow = {
  id: string;
  name: string;
  birth_date: string;
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

  async getFirst(): Promise<Patient | null> {
    const row = await this.database.getFirstAsync<PatientRow>(
      'SELECT * FROM patients ORDER BY created_at ASC LIMIT 1',
    );

    return row ? toPatient(row) : null;
  }

  async create(input: CreatePatientInput): Promise<Patient> {
    const now = new Date().toISOString();
    const patient: Patient = {
      id: await createGlobalId(),
      name: input.name.trim(),
      birthDate: input.birthDate,
      bloodType: null,
      allergies: null,
      emergencyContacts: null,
      notes: null,
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
}