import type { Consultation, ConsultationType } from '@/domain/consultation';

const DEFAULT_EVENT_DURATION_HOURS = 1;
const ICS_PRODID = '-//Saude Familiar Mobile//Agendamentos//PT-BR';
const ICS_DOMAIN = 'saudefamiliar.local';

export type CalendarAppointment = Pick<
  Consultation,
  'id' | 'type' | 'specialty' | 'location' | 'date' | 'time' | 'status'
>;

export type CalendarEvent = {
  uid: string;
  title: string;
  description: string;
  location: string | null;
  startDate: Date;
  endDate: Date;
  startCivilDate: string;
  startCivilTime: string;
  endCivilDate: string;
  endCivilTime: string;
  fileName: string;
};

function localDateTimeFromCivil(date: string, time: string): Date | null {
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

function isValidCivilDateTime(date: string | null, time: string | null): boolean {
  return Boolean(date && time && localDateTimeFromCivil(date, time));
}

export function isCalendarShareEligible(consultation: CalendarAppointment): boolean {
  return consultation.status === 'scheduled'
    && isValidCivilDateTime(consultation.date, consultation.time);
}

function requireCivilDateTime(consultation: CalendarAppointment): { date: string; time: string; startDate: Date } {
  if (!consultation.date || !consultation.time) {
    throw new Error('Este agendamento precisa ter data e hora para ser compartilhado.');
  }

  const startDate = localDateTimeFromCivil(consultation.date, consultation.time);
  if (!startDate) {
    throw new Error('A data e hora deste agendamento não são válidas.');
  }

  return { date: consultation.date, time: consultation.time, startDate };
}

function consultationTypeTitle(type: ConsultationType): string {
  return type === 'exam' ? 'Exame' : 'Consulta';
}

function firstNameForFile(name: string): string {
  return name.trim().split(/\s+/)[0] ?? 'familiar';
}

function slugifyFilePart(value: string): string {
  const ascii = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return ascii || 'agendamento';
}

function localDateParts(date: Date): { date: string; time: string } {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

export function buildCalendarEvent(
  consultation: CalendarAppointment,
  patientName: string,
): CalendarEvent {
  if (consultation.status !== 'scheduled') {
    throw new Error('Somente agendamentos marcados como agendados podem ser compartilhados.');
  }

  const { date, time, startDate } = requireCivilDateTime(consultation);
  const endDate = new Date(startDate);
  endDate.setHours(endDate.getHours() + DEFAULT_EVENT_DURATION_HOURS);
  const endCivil = localDateParts(endDate);
  const cleanSpecialty = consultation.specialty.trim() || 'atendimento';
  const cleanPatientName = patientName.trim() || 'familiar';
  const title = `${consultationTypeTitle(consultation.type)} - ${cleanSpecialty} - ${cleanPatientName}`;

  return {
    uid: `${encodeURIComponent(consultation.id)}@${ICS_DOMAIN}`,
    title,
    description: 'Agendamento compartilhado pelo Saúde Familiar.',
    location: consultation.location?.trim() || null,
    startDate,
    endDate,
    startCivilDate: date,
    startCivilTime: time,
    endCivilDate: endCivil.date,
    endCivilTime: endCivil.time,
    fileName: `${slugifyFilePart(consultationTypeTitle(consultation.type))}-${slugifyFilePart(cleanSpecialty)}-${slugifyFilePart(firstNameForFile(cleanPatientName))}.ics`,
  };
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function formatIcsCivilDateTime(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

function formatIcsUtcTimestamp(value: Date): string {
  if (!Number.isFinite(value.getTime())) {
    throw new Error('Não foi possível gerar a marca de tempo do evento.');
  }
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildIcsContent(event: CalendarEvent, timestamp = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${ICS_PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${formatIcsUtcTimestamp(timestamp)}`,
    `DTSTART:${formatIcsCivilDateTime(event.startCivilDate, event.startCivilTime)}`,
    `DTEND:${formatIcsCivilDateTime(event.endCivilDate, event.endCivilTime)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function calendarEventDetails(event: CalendarEvent): {
  title: string;
  startDate: Date;
  endDate: Date;
  allDay: false;
  location?: string;
  notes: string;
} {
  return {
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    allDay: false,
    ...(event.location ? { location: event.location } : {}),
    notes: event.description,
  };
}

export const calendarEventConstants = {
  defaultDurationHours: DEFAULT_EVENT_DURATION_HOURS,
  icsProdid: ICS_PRODID,
};
