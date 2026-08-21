export type ConsultationType = 'consultation' | 'exam';
export type ConsultationStatus = 'pending' | 'scheduled' | 'completed' | 'cancelled';

export function normalizeConsultationType(value?: string | null): ConsultationType {
  return value === 'exam' ? 'exam' : 'consultation';
}

export type Consultation = {
  id: string;
  patientId: string;
  type: ConsultationType;
  specialty: string;
  professionalName: string | null;
  location: string | null;
  phone: string | null;
  date: string | null;
  time: string | null;
  notes: string | null;
  status: ConsultationStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateConsultationInput = {
  patientId: string;
  type?: ConsultationType;
  specialty: string;
  professionalName?: string | null;
  location?: string | null;
  phone?: string | null;
  date?: string | null;
  time?: string | null;
  notes?: string | null;
  status: ConsultationStatus;
};

export type UpdateConsultationInput = Omit<CreateConsultationInput, 'patientId'>;
