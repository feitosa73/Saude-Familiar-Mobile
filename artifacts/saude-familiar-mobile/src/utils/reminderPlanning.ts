import type { ConsultationStatus } from '@/domain/consultation';
import type {
  ReminderDraft,
  ReminderOffsetUnit,
} from '@/domain/reminder';

export type ReminderOffsetSelection = {
  offsetValue: number;
  offsetUnit: ReminderOffsetUnit;
};

export type PendingReminderPreset = 'none' | 'tomorrow' | 'three_days' | 'one_week' | 'custom';

export type ReminderSelection = {
  scheduledOffsets: ReminderOffsetSelection[];
  pendingPreset: PendingReminderPreset;
  pendingCustomTriggerAt: string | null;
};

export type ReminderPlanResult = {
  drafts: ReminderDraft[];
  skippedPastCount: number;
};

export function localDateTimeFromCivil(date: string, time: string): Date | null {
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const localDate = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day ||
    localDate.getHours() !== hour ||
    localDate.getMinutes() !== minute
  ) {
    return null;
  }

  return localDate;
}

export function localDateTimeToIso(date: string, time: string): string | null {
  return localDateTimeFromCivil(date, time)?.toISOString() ?? null;
}

function subtractLocalOffset(date: Date, offset: ReminderOffsetSelection): Date {
  const trigger = new Date(date);
  if (offset.offsetUnit === 'minutes') {
    trigger.setMinutes(trigger.getMinutes() - offset.offsetValue);
  } else if (offset.offsetUnit === 'hours') {
    trigger.setHours(trigger.getHours() - offset.offsetValue);
  } else {
    trigger.setDate(trigger.getDate() - offset.offsetValue);
  }
  return trigger;
}

function defaultPendingTriggerAt(daysFromNow: number, now: Date): string {
  const trigger = new Date(now);
  trigger.setDate(trigger.getDate() + daysFromNow);
  trigger.setHours(9, 0, 0, 0);
  return trigger.toISOString();
}

export function buildReminderPlan(
  consultation: Pick<
    { status: ConsultationStatus; date: string | null; time: string | null },
    'status' | 'date' | 'time'
  >,
  selection: ReminderSelection,
  now = new Date(),
): ReminderPlanResult {
  if (consultation.status === 'completed' || consultation.status === 'cancelled') {
    return { drafts: [], skippedPastCount: 0 };
  }

  if (consultation.status === 'scheduled') {
    if (selection.scheduledOffsets.length === 0) {
      return { drafts: [], skippedPastCount: 0 };
    }
    if (!consultation.date || !consultation.time) {
      throw new Error('Informe data e hora para configurar um lembrete da consulta.');
    }

    const consultationAt = localDateTimeFromCivil(consultation.date, consultation.time);
    if (!consultationAt) {
      throw new Error('A data e hora da consulta não são válidas para o lembrete.');
    }

    let skippedPastCount = 0;
    const drafts = selection.scheduledOffsets.flatMap((offset) => {
      const triggerAt = subtractLocalOffset(consultationAt, offset);
      if (triggerAt.getTime() <= now.getTime()) {
        skippedPastCount += 1;
        return [];
      }
      return [{
        type: 'consultation_advance' as const,
        triggerAt: triggerAt.toISOString(),
        offsetValue: offset.offsetValue,
        offsetUnit: offset.offsetUnit,
      }];
    });

    return { drafts, skippedPastCount };
  }

  if (selection.pendingPreset === 'none') {
    return { drafts: [], skippedPastCount: 0 };
  }

  const triggerAt = selection.pendingPreset === 'tomorrow'
    ? defaultPendingTriggerAt(1, now)
    : selection.pendingPreset === 'three_days'
      ? defaultPendingTriggerAt(3, now)
      : selection.pendingPreset === 'one_week'
        ? defaultPendingTriggerAt(7, now)
        : selection.pendingCustomTriggerAt;

  if (!triggerAt) {
    throw new Error('Informe a data e hora do lembrete de agendamento.');
  }

  const triggerDate = new Date(triggerAt);
  if (!Number.isFinite(triggerDate.getTime())) {
    throw new Error('A data e hora do lembrete de agendamento não são válidas.');
  }
  if (triggerDate.getTime() <= now.getTime()) {
    return { drafts: [], skippedPastCount: 1 };
  }

  return {
    drafts: [{
      type: 'scheduling_task',
      triggerAt: triggerDate.toISOString(),
      offsetValue: null,
      offsetUnit: null,
    }],
    skippedPastCount: 0,
  };
}

export function localDateInputFromIso(value: string): string {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

export function localTimeInputFromIso(value: string): string {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
