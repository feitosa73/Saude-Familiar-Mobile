export type ConsultationStatus = 'pending' | 'scheduled' | 'completed' | 'cancelled';

export type Consultation = {
  id: string;
  patientId: string;
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
