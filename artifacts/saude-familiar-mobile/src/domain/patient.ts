export type Patient = {
  id: string;
  name: string;
  birthDate: string | null;
  bloodType: string | null;
  allergies: string | null;
  emergencyContacts: string | null;
  notes: string | null;
  primaryDoctor: string | null;
  healthInsurance: string | null;
  healthInsuranceNumber: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatePatientInput = {
  name: string;
  birthDate?: string | null;
  notes?: string | null;
};

export type UpdatePatientInput = CreatePatientInput;
