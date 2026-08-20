import type {
  Consultation,
  CreateConsultationInput,
  UpdateConsultationInput,
} from '@/domain/consultation';

export interface ConsultationRepository {
  listByPatient(patientId: string): Promise<Consultation[]>;
  getById(id: string): Promise<Consultation | null>;
  create(input: CreateConsultationInput): Promise<Consultation>;
  update(id: string, input: UpdateConsultationInput): Promise<Consultation>;
  delete(id: string): Promise<void>;
}
