import type { SQLiteDatabase } from "expo-sqlite";
import type { Caregiver, CreateCaregiverInput } from "@/domain/caregiver";
import type { CaregiverRepository } from "@/repositories/CaregiverRepository";
import { createGlobalId } from "@/utils/ids";

export class CaregiverAlreadyExistsError extends Error {
  constructor() {
    super("Já existe um perfil de cuidador neste aparelho.");
    this.name = "CaregiverAlreadyExistsError";
  }
}

type CaregiverRow = {
  id: string;
  name: string;
  photo_uri: string | null;
  created_at: string;
  updated_at: string;
};

function toCaregiver(row: CaregiverRow): Caregiver {
  return {
    id: row.id,
    name: row.name,
    photoUri: row.photo_uri,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SQLiteCaregiverRepository implements CaregiverRepository {
  constructor(private readonly database: SQLiteDatabase) {}

  async getFirst(): Promise<Caregiver | null> {
    const row = await this.database.getFirstAsync<CaregiverRow>(
      "SELECT * FROM caregivers ORDER BY created_at ASC LIMIT 1",
    );

    return row ? toCaregiver(row) : null;
  }

  async create(input: CreateCaregiverInput): Promise<Caregiver> {
    const existingCaregiver = await this.getFirst();
    if (existingCaregiver) {
      throw new CaregiverAlreadyExistsError();
    }

    const now = new Date().toISOString();
    const caregiver: Caregiver = {
      id: await createGlobalId(),
      name: input.name.trim(),
      photoUri: input.photoUri ?? null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.database.runAsync(
        `INSERT INTO caregivers (
          id, name, photo_uri, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)`,
        caregiver.id,
        caregiver.name,
        caregiver.photoUri,
        caregiver.createdAt,
        caregiver.updatedAt,
      );
    } catch (error) {
      const message = String(error).toLowerCase();
      if (message.includes('unique constraint') || message.includes('caregivers_singleton_idx')) {
        throw new CaregiverAlreadyExistsError();
      }
      throw error;
    }

    return caregiver;
  }
}
