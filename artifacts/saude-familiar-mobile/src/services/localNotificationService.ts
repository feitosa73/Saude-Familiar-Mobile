import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { ReminderAlertMode } from '@/domain/reminder';

export const REMINDER_ALERT_CHANNEL_IDS: Record<ReminderAlertMode, string> = {
  silent: 'saude-familiar-reminders-silent',
  normal: 'saude-familiar-reminders-normal',
  highlight: 'saude-familiar-reminders-highlight',
};

const DEFAULT_VIBRATION_PATTERN = [0, 250, 250, 250];
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
      // The Android channel controls sound for each alert mode. Keeping this true
      // allows foreground banners for the silent channel as well.
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_ALERT_CHANNEL_IDS.silent, {
      name: 'Lembretes silenciosos',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      vibrationPattern: null,
      enableVibrate: false,
      enableLights: false,
      lightColor: '#0a7ea4',
    });
    await Notifications.setNotificationChannelAsync(REMINDER_ALERT_CHANNEL_IDS.normal, {
      name: 'Lembretes normais',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: DEFAULT_VIBRATION_PATTERN,
      enableVibrate: true,
      lightColor: '#0a7ea4',
    });
    await Notifications.setNotificationChannelAsync(REMINDER_ALERT_CHANNEL_IDS.highlight, {
      name: 'Lembretes destacados',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: DEFAULT_VIBRATION_PATTERN,
      enableVibrate: true,
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
  alertMode: ReminderAlertMode;
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
      sound: input.alertMode === 'silent' ? false : 'default',
      data: {
        reminderId: input.reminderId,
        consultationId: input.consultationId,
        alertMode: input.alertMode,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      ...(Platform.OS === 'android'
        ? { channelId: REMINDER_ALERT_CHANNEL_IDS[input.alertMode] }
        : {}),
    },
  });
}

export async function cancelLocalNotification(notificationId: string | null): Promise<void> {
  if (!notificationId || Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}
