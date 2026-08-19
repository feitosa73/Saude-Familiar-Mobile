export type Caregiver = {
  id: string;
  name: string;
  photoUri: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateCaregiverInput = {
  name: string;
  photoUri?: string | null;
};
