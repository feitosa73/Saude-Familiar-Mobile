import type { CreatePatientInput, Patient } from '@/domain/patient';

export interface PatientRepository {
  getFirst(): Promise<Patient | null>;
  create(input: CreatePatientInput): Promise<Patient>;
}