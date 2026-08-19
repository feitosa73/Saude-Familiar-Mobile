import type { Caregiver, CreateCaregiverInput } from "@/domain/caregiver";

export interface CaregiverRepository {
  getFirst(): Promise<Caregiver | null>;
  create(input: CreateCaregiverInput): Promise<Caregiver>;
}
