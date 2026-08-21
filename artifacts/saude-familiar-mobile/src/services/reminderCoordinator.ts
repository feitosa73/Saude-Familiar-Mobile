import { Platform } from 'react-native';
import type { Consultation } from '@/domain/consultation';
import type { Reminder } from '@/domain/reminder';
import type { ReminderRepository } from '@/repositories/ReminderRepository';
import {
  cancelLocalNotification,
  LocalNotificationPermissionError,
  requestLocalNotificationPermission,
  scheduleLocalNotification,
} from '@/services/localNotificationService';
import {
  buildReminderPlan,
  type ReminderSelection,
} from '@/utils/reminderPlanning';

function formatConsultationBody(consultation: Consultation, patientName: string): string {
  if (consultation.status === 'pending') {
    return `Lembrete: agendar ${consultation.specialty} para ${patientName}.`;
  }

  const date = consultation.date
    ? `${consultation.date.slice(8, 10)}/${consultation.date.slice(5, 7)}/${consultation.date.slice(0, 4)}`
    : 'a definir';
  const time = consultation.time ? ` às ${consultation.time}` : '';
  return `Lembrete de consulta: ${consultation.specialty} para ${patientName} em ${date}${time}.`;
}

export type ReminderCancellationResult = {
  reminderId: string;
  hadNotification: boolean;
  cancelled: boolean;
  error: string | null;
};

export type ReminderCancellationSummary = {
  results: ReminderCancellationResult[];
  warning: string | null;
};

export async function cancelReminderNotifications(
  reminders: Reminder[],
): Promise<ReminderCancellationSummary> {
  const results: ReminderCancellationResult[] = [];
  for (const reminder of reminders) {
    if (!reminder.notificationId) {
      results.push({
        reminderId: reminder.id,
        hadNotification: false,
        cancelled: true,
        error: null,
      });
      continue;
    }

    try {
      await cancelLocalNotification(reminder.notificationId);
      results.push({
        reminderId: reminder.id,
        hadNotification: true,
        cancelled: true,
        error: null,
      });
    } catch (error) {
      results.push({
        reminderId: reminder.id,
        hadNotification: true,
        cancelled: false,
        error: error instanceof Error ? error.message : 'erro desconhecido',
      });
    }
  }

  const failedCount = results.filter((result) => result.hadNotification && !result.cancelled).length;
  return {
    results,
    warning: failedCount > 0
      ? failedCount === 1
        ? 'Não foi possível cancelar uma notificação local. O lembrete correspondente foi mantido; tente novamente.'
        : `Não foi possível cancelar ${failedCount} notificações locais. Os lembretes correspondentes foram mantidos; tente novamente.`
      : null,
  };
}

export async function clearCancelledReminderIds(input: {
  reminders: Reminder[];
  cancellation: ReminderCancellationSummary;
  reminderRepository: ReminderRepository;
}): Promise<{ reminders: Reminder[]; warning: string | null }> {
  const nextReminders = input.reminders.map((reminder) => ({ ...reminder }));
  const resultById = new Map(input.cancellation.results.map((result) => [result.reminderId, result]));
  const clearFailures: string[] = [];

  for (const reminder of nextReminders) {
    const result = resultById.get(reminder.id);
    if (!result?.hadNotification || !result.cancelled) continue;

    try {
      await input.reminderRepository.update(reminder.id, { notificationId: null });
      reminder.notificationId = null;
    } catch (error) {
      clearFailures.push(error instanceof Error ? error.message : 'erro desconhecido');
    }
  }

  const warnings: string[] = [];
  if (input.cancellation.warning) warnings.push(input.cancellation.warning);
  if (clearFailures.length > 0) {
    warnings.push(
      clearFailures.length === 1
        ? 'Uma notificação foi cancelada, mas não foi possível atualizar sua referência no armazenamento local.'
        : `${clearFailures.length} notificações foram canceladas, mas não foi possível atualizar suas referências no armazenamento local.`,
    );
  }

  return {
    reminders: nextReminders,
    warning: warnings.length > 0 ? warnings.join(' ') : null,
  };
}

export async function syncConsultationReminders(input: {
  consultation: Consultation;
  patientName: string;
  selection: ReminderSelection;
  reminderRepository: ReminderRepository;
  existingReminders?: Reminder[];
  skipCancellation?: boolean;
}): Promise<{ reminders: Reminder[]; warning: string | null }> {
  let existingReminders = input.existingReminders ?? await input.reminderRepository.listByConsultation(input.consultation.id);
  if (!input.skipCancellation) {
    const cancellation = await cancelReminderNotifications(existingReminders);
    const cleanup = await clearCancelledReminderIds({
      reminders: existingReminders,
      cancellation,
      reminderRepository: input.reminderRepository,
    });
    existingReminders = cleanup.reminders;
    if (cleanup.warning) {
      return { reminders: existingReminders, warning: cleanup.warning };
    }
  }

  const plan = buildReminderPlan(input.consultation, input.selection);
  const persistedReminders = await input.reminderRepository.replaceForConsultation(
    input.consultation.id,
    plan.drafts.map((draft) => ({
      consultationId: input.consultation.id,
      type: draft.type,
      triggerAt: draft.triggerAt,
      offsetValue: draft.offsetValue,
      offsetUnit: draft.offsetUnit,
      notificationId: null,
    })),
  );

  const warnings: string[] = [];
  if (plan.skippedPastCount > 0) {
    warnings.push(
      plan.skippedPastCount === 1
        ? 'Um lembrete foi ignorado porque o horário já passou.'
        : `${plan.skippedPastCount} lembretes foram ignorados porque os horários já passaram.`,
    );
  }

  if (persistedReminders.length === 0 || Platform.OS === 'web') {
    if (persistedReminders.length > 0 && Platform.OS === 'web') {
      warnings.push('Os lembretes foram salvos, mas as notificações locais funcionam no aplicativo Android.');
    }
    return {
      reminders: persistedReminders,
      warning: warnings.length > 0 ? warnings.join(' ') : null,
    };
  }

  let permissionGranted = false;
  try {
    permissionGranted = await requestLocalNotificationPermission();
  } catch {
    warnings.push('A consulta foi salva, mas não foi possível solicitar a permissão de notificações.');
    return {
      reminders: persistedReminders,
      warning: warnings.join(' '),
    };
  }

  if (!permissionGranted) {
    warnings.push('A consulta foi salva, mas as notificações estão desativadas neste aparelho.');
    return {
      reminders: persistedReminders,
      warning: warnings.join(' '),
    };
  }

  const scheduledReminders: Reminder[] = [];
  try {
    for (const reminder of persistedReminders) {
      const notificationId = await scheduleLocalNotification({
        triggerAt: reminder.triggerAt,
        body: formatConsultationBody(input.consultation, input.patientName),
        reminderId: reminder.id,
        consultationId: reminder.consultationId,
      });
      const scheduledReminder = { ...reminder, notificationId };
      scheduledReminders.push(scheduledReminder);
      await input.reminderRepository.update(reminder.id, { notificationId });
      reminder.notificationId = notificationId;
    }
  } catch (error) {
    const persistenceFailures: string[] = [];
    for (const reminder of scheduledReminders) {
      try {
        await input.reminderRepository.update(reminder.id, { notificationId: reminder.notificationId });
      } catch (persistenceError) {
        persistenceFailures.push(
          persistenceError instanceof Error ? persistenceError.message : 'erro desconhecido',
        );
      }
    }

    const cancellation = await cancelReminderNotifications(scheduledReminders);
    const cleanup = await clearCancelledReminderIds({
      reminders: scheduledReminders,
      cancellation,
      reminderRepository: input.reminderRepository,
    });
    for (const reminder of cleanup.reminders) {
      const persistedReminder = persistedReminders.find((item) => item.id === reminder.id);
      if (persistedReminder) persistedReminder.notificationId = reminder.notificationId;
    }

    const message = error instanceof LocalNotificationPermissionError
      ? 'A consulta foi salva, mas as notificações estão desativadas neste aparelho.'
      : 'A consulta foi salva, mas não foi possível agendar todos os lembretes.';
    warnings.push(message);
    if (persistenceFailures.length > 0) {
      warnings.push('Não foi possível preservar uma ou mais referências de notificação no armazenamento local.');
    }
    if (cleanup.warning) warnings.push(cleanup.warning);
  }

  return {
    reminders: persistedReminders,
    warning: warnings.length > 0 ? warnings.join(' ') : null,
  };
}
