import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CONSULTATION_REMINDER_CHANNEL_ID = 'consultation-reminders';
let configured = false;

export class LocalNotificationPermissionError extends Error {
  constructor() {
    super('As notificações estão desativadas neste aparelho.');
    this.name = 'LocalNotificationPermissionError';
  }
}

export async function configureLocalNotifications(): Promise<void> {
  if (Platform.OS === 'web' || configured) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CONSULTATION_REMINDER_CHANNEL_ID, {
      name: 'Lembretes de consultas',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0a7ea4',
    });
  }

  configured = true;
}

export async function requestLocalNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  await configureLocalNotifications();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function scheduleLocalNotification(input: {
  triggerAt: string;
  body: string;
  reminderId: string;
  consultationId: string;
}): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('Notificações locais estão disponíveis no aplicativo Android.');
  }

  const triggerDate = new Date(input.triggerAt);
  if (!Number.isFinite(triggerDate.getTime()) || triggerDate.getTime() <= Date.now()) {
    throw new Error('O horário deste lembrete já passou.');
  }

  const granted = await requestLocalNotificationPermission();
  if (!granted) {
    throw new LocalNotificationPermissionError();
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Saúde Familiar',
      body: input.body,
      sound: 'default',
      data: {
        reminderId: input.reminderId,
        consultationId: input.consultationId,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      ...(Platform.OS === 'android' ? { channelId: CONSULTATION_REMINDER_CHANNEL_ID } : {}),
    },
  });
}

export async function cancelLocalNotification(notificationId: string | null): Promise<void> {
  if (!notificationId || Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}
