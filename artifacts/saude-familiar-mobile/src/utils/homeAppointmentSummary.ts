import type { Consultation } from '../domain/consultation';

export type HomeAppointmentSummary = {
  pendingCount: number;
  upcoming: Consultation[];
  next: Consultation | null;
  otherUpcomingCount: number;
  hasAppointments: boolean;
};

function localCivilDateTime(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}T${hours}:${minutes}`;
}

function appointmentDateTime(consultation: Consultation): string | null {
  if (!consultation.date || !consultation.time) return null;
  return `${consultation.date}T${consultation.time}`;
}

export function buildHomeAppointmentSummary(
  consultations: Consultation[],
  now: Date = new Date(),
): HomeAppointmentSummary {
  const pendingCount = consultations.filter((item) => item.status === 'pending').length;
  const currentDateTime = localCivilDateTime(now);
  const upcoming = consultations
    .filter((item) => item.status === 'scheduled')
    .map((item) => ({ item, dateTime: appointmentDateTime(item) }))
    .filter((entry): entry is { item: Consultation; dateTime: string } =>
      entry.dateTime !== null && entry.dateTime > currentDateTime,
    )
    .sort((left, right) => left.dateTime.localeCompare(right.dateTime))
    .map(({ item }) => item);
  const next = upcoming[0] ?? null;

  return {
    pendingCount,
    upcoming,
    next,
    otherUpcomingCount: Math.max(0, upcoming.length - 1),
    hasAppointments: consultations.length > 0,
  };
}
