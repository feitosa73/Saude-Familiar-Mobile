import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import type {
  Consultation,
  CreateConsultationInput,
  UpdateConsultationInput,
} from '@/domain/consultation';
import type { ConsultationRepository } from '@/repositories/ConsultationRepository';
import { createGlobalId } from '@/utils/ids';
import { withConsultationWriteLock } from '@/storage/consultationWriteMutex';

type ConsultationRow = {
  id: string;
  patient_id: string;
  specialty: string;
  professional_name: string | null;
  location: string | null;
  phone: string | null;
  date: string | null;
  time: string | null;
  notes: string | null;
  status: Consultation['status'];
  created_at: string;
  updated_at: string;
};

function nullableText(value?: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized ? normalized : null;
}

function toConsultation(row: ConsultationRow): Consultation {
  return {
    id: row.id,
    patientId: row.patient_id,
    specialty: row.specialty,
    professionalName: row.professional_name,
    location: row.location,
    phone: row.phone,
    date: row.date,
    time: row.time,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SQLiteConsultationRepository implements ConsultationRepository {
  constructor(private readonly database: SQLiteDatabase) {}

  async listByPatient(patientId: string): Promise<Consultation[]> {
    const rows = await this.database.getAllAsync<ConsultationRow>(
      `SELECT * FROM consultations
       WHERE patient_id = ?
       ORDER BY
         CASE status
           WHEN 'pending' THEN 0
           WHEN 'scheduled' THEN 1
           WHEN 'completed' THEN 2
           ELSE 3
         END,
         date IS NULL,
         date ASC,
         time ASC,
         created_at ASC`,
      patientId,
    );

    return rows.map(toConsultation);
  }

  async getById(id: string): Promise<Consultation | null> {
    const row = await this.database.getFirstAsync<ConsultationRow>(
      'SELECT * FROM consultations WHERE id = ?',
      id,
    );

    return row ? toConsultation(row) : null;
  }

  async create(input: CreateConsultationInput): Promise<Consultation> {
    const specialty = input.specialty.trim();
    if (!specialty) {
      throw new Error('Informe a especialidade da consulta.');
    }

    const now = new Date().toISOString();
    const consultation: Consultation = {
      id: await createGlobalId(),
      patientId: input.patientId,
      specialty,
      professionalName: nullableText(input.professionalName),
      location: nullableText(input.location),
      phone: nullableText(input.phone),
      date: nullableText(input.date),
      time: nullableText(input.time),
      notes: nullableText(input.notes),
      status: input.status,
      createdAt: now,
      updatedAt: now,
    };

    return withConsultationWriteLock(async () => {
      const patient = await this.database.getFirstAsync<{ id: string }>(
        'SELECT id FROM patients WHERE id = ?',
        consultation.patientId,
      );
      if (!patient) {
        throw new Error('Familiar não encontrado.');
      }

      await this.database.runAsync(
        `INSERT INTO consultations (
          id, patient_id, specialty, professional_name, location, phone,
          date, time, notes, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        consultation.id,
        consultation.patientId,
        consultation.specialty,
        consultation.professionalName,
        consultation.location,
        consultation.phone,
        consultation.date,
        consultation.time,
        consultation.notes,
        consultation.status,
        consultation.createdAt,
        consultation.updatedAt,
      );
      return consultation;
    });
  }

  async update(id: string, input: UpdateConsultationInput): Promise<Consultation> {
    const specialty = input.specialty.trim();
    if (!specialty) {
      throw new Error('Informe a especialidade da consulta.');
    }

    const now = new Date().toISOString();
    await withConsultationWriteLock(() =>
      this.database.runAsync(
        `UPDATE consultations
         SET specialty = ?, professional_name = ?, location = ?, phone = ?,
             date = ?, time = ?, notes = ?, status = ?, updated_at = ?
         WHERE id = ?`,
        specialty,
        nullableText(input.professionalName),
        nullableText(input.location),
        nullableText(input.phone),
        nullableText(input.date),
        nullableText(input.time),
        nullableText(input.notes),
        input.status,
        now,
        id,
      ).then(() => undefined),
    );

    const consultation = await this.getById(id);
    if (!consultation) {
      throw new Error('Consulta não encontrada.');
    }

    return consultation;
  }

  async delete(id: string): Promise<void> {
    await withConsultationWriteLock(async () => {
      if (Platform.OS === 'web') {
        await this.database.withTransactionAsync(async () => {
          await this.database.runAsync('DELETE FROM reminders WHERE consultation_id = ?', id);
          await this.database.runAsync('DELETE FROM consultations WHERE id = ?', id);
        });
        return;
      }

      await this.database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync('DELETE FROM reminders WHERE consultation_id = ?', id);
        await transaction.runAsync('DELETE FROM consultations WHERE id = ?', id);
      });
    });
  }
}
