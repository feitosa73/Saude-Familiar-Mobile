export type ReminderType = 'consultation_advance' | 'scheduling_task';
export type ReminderAlertMode = 'silent' | 'normal' | 'highlight';

export const DEFAULT_REMINDER_ALERT_MODE: ReminderAlertMode = 'normal';

export function normalizeReminderAlertMode(value?: string | null): ReminderAlertMode {
  return value === 'silent' || value === 'normal' || value === 'highlight'
    ? value
    : DEFAULT_REMINDER_ALERT_MODE;
}

export type ReminderOffsetUnit = 'minutes' | 'hours' | 'days';

export type Reminder = {
  id: string;
  consultationId: string;
  type: ReminderType;
  alertMode: ReminderAlertMode;
  triggerAt: string;
  offsetValue: number | null;
  offsetUnit: ReminderOffsetUnit | null;
  notificationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReminderDraft = {
  type: ReminderType;
  alertMode: ReminderAlertMode;
  triggerAt: string;
  offsetValue: number | null;
  offsetUnit: ReminderOffsetUnit | null;
};

export type CreateReminderInput = {
  consultationId: string;
  type: ReminderType;
  alertMode?: ReminderAlertMode;
  triggerAt: string;
  offsetValue?: number | null;
  offsetUnit?: ReminderOffsetUnit | null;
  notificationId?: string | null;
};

export type UpdateReminderInput = Partial<
  Pick<Reminder, 'alertMode' | 'triggerAt' | 'offsetValue' | 'offsetUnit' | 'notificationId'>
>;
