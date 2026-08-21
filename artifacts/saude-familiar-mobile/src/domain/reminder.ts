export type ReminderType = 'consultation_advance' | 'scheduling_task';

export type ReminderOffsetUnit = 'minutes' | 'hours' | 'days';

export type Reminder = {
  id: string;
  consultationId: string;
  type: ReminderType;
  triggerAt: string;
  offsetValue: number | null;
  offsetUnit: ReminderOffsetUnit | null;
  notificationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReminderDraft = {
  type: ReminderType;
  triggerAt: string;
  offsetValue: number | null;
  offsetUnit: ReminderOffsetUnit | null;
};

export type CreateReminderInput = {
  consultationId: string;
  type: ReminderType;
  triggerAt: string;
  offsetValue?: number | null;
  offsetUnit?: ReminderOffsetUnit | null;
  notificationId?: string | null;
};

export type UpdateReminderInput = Partial<
  Pick<Reminder, 'triggerAt' | 'offsetValue' | 'offsetUnit' | 'notificationId'>
>;
