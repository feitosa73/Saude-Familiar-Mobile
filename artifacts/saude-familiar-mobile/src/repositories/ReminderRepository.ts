import type {
  CreateReminderInput,
  Reminder,
  UpdateReminderInput,
} from '@/domain/reminder';

export interface ReminderRepository {
  listByConsultation(consultationId: string): Promise<Reminder[]>;
  getById(id: string): Promise<Reminder | null>;
  create(input: CreateReminderInput): Promise<Reminder>;
  update(id: string, input: UpdateReminderInput): Promise<Reminder>;
  delete(id: string): Promise<void>;
  deleteByConsultation(consultationId: string): Promise<void>;
  replaceForConsultation(
    consultationId: string,
    reminders: CreateReminderInput[],
  ): Promise<Reminder[]>;
}
