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

export async function cancelReminderNotifications(reminders: Reminder[]): Promise<string | null> {
  const errors: string[] = [];
  for (const reminder of reminders) {
    try {
      await cancelLocalNotification(reminder.notificationId);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'erro desconhecido');
    }
  }

  return errors.length > 0
    ? 'Não foi possível cancelar uma ou mais notificações. Os lembretes atuais foram mantidos; tente novamente.'
    : null;
}

export async function syncConsultationReminders(input: {
  consultation: Consultation;
  patientName: string;
  selection: ReminderSelection;
  reminderRepository: ReminderRepository;
  existingReminders?: Reminder[];
  skipCancellation?: boolean;
}): Promise<{ reminders: Reminder[]; warning: string | null }> {
  const existingReminders = input.existingReminders ?? await input.reminderRepository.listByConsultation(input.consultation.id);
  const cancellationWarning = input.skipCancellation
    ? null
    : await cancelReminderNotifications(existingReminders);
  if (cancellationWarning) {
    return { reminders: existingReminders, warning: cancellationWarning };
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
  if (cancellationWarning) warnings.push(cancellationWarning);
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
  }

  if (!permissionGranted) {
    warnings.push('A consulta foi salva, mas as notificações estão desativadas neste aparelho.');
    return {
      reminders: persistedReminders,
      warning: warnings.join(' '),
    };
  }

  const scheduledNotificationIds: string[] = [];
  const scheduledReminders: Reminder[] = [];
  try {
    for (const reminder of persistedReminders) {
      const notificationId = await scheduleLocalNotification({
        triggerAt: reminder.triggerAt,
        body: formatConsultationBody(input.consultation, input.patientName),
        reminderId: reminder.id,
        consultationId: reminder.consultationId,
      });
      scheduledNotificationIds.push(notificationId);
      await input.reminderRepository.update(reminder.id, { notificationId });
      reminder.notificationId = notificationId;
      scheduledReminders.push(reminder);
    }
  } catch (error) {
    for (const notificationId of scheduledNotificationIds) {
      try {
        await cancelLocalNotification(notificationId);
      } catch {
        // Preserve the local records and surface the scheduling failure below.
      }
    }
    for (const reminder of scheduledReminders) {
      try {
        await input.reminderRepository.update(reminder.id, { notificationId: null });
        reminder.notificationId = null;
      } catch {
        // Keep the warning focused on the original scheduling failure.
      }
    }

    const message = error instanceof LocalNotificationPermissionError
      ? 'A consulta foi salva, mas as notificações estão desativadas neste aparelho.'
      : 'A consulta foi salva, mas não foi possível agendar todos os lembretes.';
    warnings.push(message);
  }

  return {
    reminders: persistedReminders,
    warning: warnings.length > 0 ? warnings.join(' ') : null,
  };
}
