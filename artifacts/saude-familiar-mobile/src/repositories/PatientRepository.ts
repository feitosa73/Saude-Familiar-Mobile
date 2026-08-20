import type {
  CreatePatientInput,
  Patient,
  UpdatePatientInput,
} from '@/domain/patient';

export interface PatientRepository {
  list(): Promise<Patient[]>;
  getFirst(): Promise<Patient | null>;
  getById(id: string): Promise<Patient | null>;
  create(input: CreatePatientInput): Promise<Patient>;
  update(id: string, input: UpdatePatientInput): Promise<Patient>;
  delete(id: string): Promise<void>;
}
