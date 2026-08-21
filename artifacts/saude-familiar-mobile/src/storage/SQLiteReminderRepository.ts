import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  DEFAULT_REMINDER_ALERT_MODE,
  normalizeReminderAlertMode,
  type CreateReminderInput,
  type Reminder,
  type ReminderAlertMode,
  type ReminderOffsetUnit,
  type UpdateReminderInput,
} from '@/domain/reminder';
import type { ReminderRepository } from '@/repositories/ReminderRepository';
import { withConsultationWriteLock } from '@/storage/consultationWriteMutex';
import { createGlobalId } from '@/utils/ids';

type ReminderRow = {
  id: string;
  consultation_id: string;
  type: Reminder['type'];
  alert_mode: ReminderAlertMode | null;
  trigger_at: string;
  offset_value: number | null;
  offset_unit: ReminderOffsetUnit | null;
  notification_id: string | null;
  created_at: string;
  updated_at: string;
};

function toReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    consultationId: row.consultation_id,
    type: row.type,
    alertMode: row.alert_mode ?? DEFAULT_REMINDER_ALERT_MODE,
    triggerAt: row.trigger_at,
    offsetValue: row.offset_value,
    offsetUnit: row.offset_unit,
    notificationId: row.notification_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeTriggerAt(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error('Informe uma data e hora válidas para o lembrete.');
  }

  return new Date(timestamp).toISOString();
}

function normalizeOffsetValue(value?: number | null): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('A antecedência do lembrete deve ser um número positivo.');
  }
  return value;
}

function normalizeOffsetUnit(
  value: ReminderOffsetUnit | null | undefined,
  offsetValue: number | null,
): ReminderOffsetUnit | null {
  if (offsetValue === null) return null;
  if (!value) {
    throw new Error('Informe a unidade da antecedência do lembrete.');
  }
  return value;
}

export class SQLiteReminderRepository implements ReminderRepository {
  constructor(private readonly database: SQLiteDatabase) {}

  async listByConsultation(consultationId: string): Promise<Reminder[]> {
    const rows = await this.database.getAllAsync<ReminderRow>(
      `SELECT * FROM reminders
       WHERE consultation_id = ?
       ORDER BY trigger_at ASC, created_at ASC`,
      consultationId,
    );

    return rows.map(toReminder);
  }

  async getById(id: string): Promise<Reminder | null> {
    const row = await this.database.getFirstAsync<ReminderRow>(
      'SELECT * FROM reminders WHERE id = ?',
      id,
    );

    return row ? toReminder(row) : null;
  }

  async create(input: CreateReminderInput): Promise<Reminder> {
    const reminder: Reminder = {
      id: await createGlobalId(),
      consultationId: input.consultationId,
      type: input.type,
      alertMode: normalizeReminderAlertMode(input.alertMode),
      triggerAt: normalizeTriggerAt(input.triggerAt),
      offsetValue: normalizeOffsetValue(input.offsetValue),
      offsetUnit: normalizeOffsetUnit(input.offsetUnit, normalizeOffsetValue(input.offsetValue)),
      notificationId: input.notificationId ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await withConsultationWriteLock(async () => {
      const consultation = await this.database.getFirstAsync<{ id: string }>(
        'SELECT id FROM consultations WHERE id = ?',
        reminder.consultationId,
      );
      if (!consultation) {
        throw new Error('Consulta não encontrada.');
      }

      await this.database.runAsync(
        `INSERT INTO reminders (
          id, consultation_id, type, alert_mode, trigger_at, offset_value, offset_unit,
          notification_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        reminder.id,
        reminder.consultationId,
        reminder.type,
        reminder.alertMode,
        reminder.triggerAt,
        reminder.offsetValue,
        reminder.offsetUnit,
        reminder.notificationId,
        reminder.createdAt,
        reminder.updatedAt,
      );
    });

    return reminder;
  }

  async update(id: string, input: UpdateReminderInput): Promise<Reminder> {
    await withConsultationWriteLock(async () => {
      const current = await this.database.getFirstAsync<ReminderRow>(
        'SELECT * FROM reminders WHERE id = ?',
        id,
      );
      if (!current) {
        throw new Error('Lembrete não encontrado.');
      }

      const currentAlertMode = current.alert_mode ?? DEFAULT_REMINDER_ALERT_MODE;
      const alertMode = input.alertMode === undefined
        ? normalizeReminderAlertMode(currentAlertMode)
        : normalizeReminderAlertMode(input.alertMode);
      const currentOffsetValue = current.offset_value;
      const offsetValue = input.offsetValue === undefined
        ? currentOffsetValue
        : normalizeOffsetValue(input.offsetValue);
      const offsetUnit = input.offsetUnit === undefined
        ? current.offset_unit
        : normalizeOffsetUnit(input.offsetUnit, offsetValue);
      const triggerAt = input.triggerAt === undefined
        ? current.trigger_at
        : normalizeTriggerAt(input.triggerAt);
      const notificationId = input.notificationId === undefined
        ? current.notification_id
        : input.notificationId;

      await this.database.runAsync(
        `UPDATE reminders
         SET alert_mode = ?, trigger_at = ?, offset_value = ?, offset_unit = ?,
             notification_id = ?, updated_at = ?
         WHERE id = ?`,
        alertMode,
        triggerAt,
        offsetValue,
        offsetUnit,
        notificationId,
        new Date().toISOString(),
        id,
      );
    });

    const reminder = await this.getById(id);
    if (!reminder) {
      throw new Error('Lembrete não encontrado.');
    }
    return reminder;
  }

  async delete(id: string): Promise<void> {
    await withConsultationWriteLock(() =>
      this.database.runAsync('DELETE FROM reminders WHERE id = ?', id).then(() => undefined),
    );
  }

  async deleteByConsultation(consultationId: string): Promise<void> {
    await withConsultationWriteLock(() =>
      this.database
        .runAsync('DELETE FROM reminders WHERE consultation_id = ?', consultationId)
        .then(() => undefined),
    );
  }

  async replaceForConsultation(
    consultationId: string,
    inputs: CreateReminderInput[],
  ): Promise<Reminder[]> {
    const now = new Date().toISOString();
    const reminders = await Promise.all(
      inputs.map(async (input) => {
        if (input.consultationId !== consultationId) {
          throw new Error('Lembrete não pertence à consulta selecionada.');
        }
        const offsetValue = normalizeOffsetValue(input.offsetValue);
        return {
          id: await createGlobalId(),
          consultationId,
          type: input.type,
          alertMode: normalizeReminderAlertMode(input.alertMode),
          triggerAt: normalizeTriggerAt(input.triggerAt),
          offsetValue,
          offsetUnit: normalizeOffsetUnit(input.offsetUnit, offsetValue),
          notificationId: input.notificationId ?? null,
          createdAt: now,
          updatedAt: now,
        } satisfies Reminder;
      }),
    );

    await withConsultationWriteLock(async () => {
      const consultation = await this.database.getFirstAsync<{ id: string }>(
        'SELECT id FROM consultations WHERE id = ?',
        consultationId,
      );
      if (!consultation) {
        throw new Error('Consulta não encontrada.');
      }

      if (Platform.OS === 'web') {
        await this.database.withTransactionAsync(async () => {
          await this.database.runAsync(
            'DELETE FROM reminders WHERE consultation_id = ?',
            consultationId,
          );
          for (const reminder of reminders) {
            await this.database.runAsync(
              `INSERT INTO reminders (
                id, consultation_id, type, alert_mode, trigger_at, offset_value, offset_unit,
                notification_id, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              reminder.id,
              reminder.consultationId,
              reminder.type,
              reminder.alertMode,
              reminder.triggerAt,
              reminder.offsetValue,
              reminder.offsetUnit,
              reminder.notificationId,
              reminder.createdAt,
              reminder.updatedAt,
            );
          }
        });
        return;
      }

      await this.database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          'DELETE FROM reminders WHERE consultation_id = ?',
          consultationId,
        );
        for (const reminder of reminders) {
          await transaction.runAsync(
            `INSERT INTO reminders (
              id, consultation_id, type, alert_mode, trigger_at, offset_value, offset_unit,
              notification_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            reminder.id,
            reminder.consultationId,
            reminder.type,
            reminder.alertMode,
            reminder.triggerAt,
            reminder.offsetValue,
            reminder.offsetUnit,
            reminder.notificationId,
            reminder.createdAt,
            reminder.updatedAt,
          );
        }
      });
    });

    return reminders;
  }
}
