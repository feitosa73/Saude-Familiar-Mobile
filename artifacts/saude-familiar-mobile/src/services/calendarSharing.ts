import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  buildCalendarEvent,
  buildIcsContent,
  calendarEventDetails,
  type CalendarEvent,
} from '@/utils/calendarEvent';

export type CalendarActionResult =
  | { status: 'added'; action: string }
  | { status: 'cancelled'; action: string }
  | { status: 'permission-denied' }
  | { status: 'unavailable' };

function assertNativeCalendarSupport(): void {
  if (Platform.OS === 'web') {
    throw new Error('O calendário do aparelho está disponível somente no Android e no iOS.');
  }
}

export async function addEventToDeviceCalendar(event: CalendarEvent): Promise<CalendarActionResult> {
  assertNativeCalendarSupport();

  const currentPermission = await Calendar.getCalendarPermissionsAsync();
  const permission = currentPermission.granted
    ? currentPermission
    : await Calendar.requestCalendarPermissionsAsync();
  if (!permission.granted) {
    return { status: 'permission-denied' };
  }

  const result = await Calendar.createEventInCalendarAsync(calendarEventDetails(event), {
    startNewActivityTask: false,
  });
  if (result.action === 'canceled') {
    return { status: 'cancelled', action: result.action };
  }
  return { status: 'added', action: result.action };
}

export async function shareEventAsIcs(event: CalendarEvent): Promise<void> {
  assertNativeCalendarSupport();

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('O compartilhamento não está disponível neste aparelho.');
  }

  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) {
    throw new Error('Não foi possível preparar o arquivo temporário do agendamento.');
  }

  const fileUri = `${cacheDirectory}${event.fileName}`;

  try {
    await FileSystem.writeAsStringAsync(fileUri, buildIcsContent(event), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await Sharing.shareAsync(fileUri, {
      dialogTitle: 'Compartilhar agendamento',
      mimeType: 'text/calendar',
      UTI: 'com.apple.ical.ics',
    });
  } finally {
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
  }
}

export function createCalendarEvent(
  consultation: Parameters<typeof buildCalendarEvent>[0],
  patientName: string,
): CalendarEvent {
  return buildCalendarEvent(consultation, patientName);
}
