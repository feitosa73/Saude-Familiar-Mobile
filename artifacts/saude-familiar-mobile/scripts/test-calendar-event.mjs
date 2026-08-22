import {
  buildCalendarEvent,
  buildIcsContent,
  calendarEventDetails,
  isCalendarShareEligible,
} from '../src/utils/calendarEvent.ts';

const baseAppointment = {
  id: 'appointment-42',
  patientId: 'patient-1',
  type: 'consultation',
  specialty: 'Cardiologia',
  professionalName: 'Dra. Ana Souza',
  location: 'Clínica Central',
  phone: '(11) 99999-9999',
  date: '2026-09-30',
  time: '07:00',
  notes: 'Levar exames anteriores.',
  status: 'scheduled',
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:00.000Z',
};

function appointment(overrides) {
  return { ...baseAppointment, ...overrides };
}

function fail(message) {
  throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) fail(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

function assertMatch(actual, pattern, message) {
  if (!pattern.test(actual)) fail(`${message}: pattern ${pattern} did not match`);
}

function assertThrows(action, pattern, message) {
  try {
    action();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (pattern.test(errorMessage)) return;
    fail(`${message}: unexpected error ${errorMessage}`);
  }
  fail(`${message}: action did not throw`);
}

function assertLocalDateTime(date, expected) {
  const [datePart, timePart] = expected.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  assertEqual(date.getFullYear(), year, 'local year');
  assertEqual(date.getMonth() + 1, month, 'local month');
  assertEqual(date.getDate(), day, 'local day');
  assertEqual(date.getHours(), hour, 'local hour');
  assertEqual(date.getMinutes(), minute, 'local minute');
}

assertEqual(isCalendarShareEligible(baseAppointment), true, 'scheduled appointment is eligible');
assertEqual(isCalendarShareEligible(appointment({ type: 'exam', specialty: 'Doppler' })), true, 'scheduled exam is eligible');
assertEqual(isCalendarShareEligible(appointment({ status: 'pending' })), false, 'pending appointment is not eligible');
assertEqual(isCalendarShareEligible(appointment({ status: 'completed' })), false, 'completed appointment is not eligible');
assertEqual(isCalendarShareEligible(appointment({ status: 'cancelled' })), false, 'cancelled appointment is not eligible');
assertEqual(isCalendarShareEligible(appointment({ date: null })), false, 'appointment without date is not eligible');
assertEqual(isCalendarShareEligible(appointment({ time: null })), false, 'appointment without time is not eligible');
assertEqual(isCalendarShareEligible(appointment({ date: '2026-02-30' })), false, 'invalid date is not eligible');
assertEqual(isCalendarShareEligible(appointment({ time: '25:00' })), false, 'invalid time is not eligible');

const consultationEvent = buildCalendarEvent(baseAppointment, 'José da Silva');
assertEqual(consultationEvent.uid, 'appointment-42@saudefamiliar.local', 'stable UID');
assertEqual(consultationEvent.title, 'Consulta - Cardiologia - José da Silva', 'consultation title');
assertEqual(consultationEvent.description, 'Agendamento compartilhado pelo Saúde Familiar.', 'minimal description');
assertEqual(consultationEvent.location, 'Clínica Central', 'location');
assertLocalDateTime(consultationEvent.startDate, '2026-09-30T07:00');
assertLocalDateTime(consultationEvent.endDate, '2026-09-30T08:00');
assertEqual(calendarEventDetails(consultationEvent).allDay, false, 'timed event');
const repeatedEvent = buildCalendarEvent(baseAppointment, 'José da Silva');
assertEqual(repeatedEvent.uid, consultationEvent.uid, 'UID remains stable when shared again');

const yearBoundaryEvent = buildCalendarEvent(
  appointment({ id: 'exam-1', type: 'exam', specialty: 'Doppler', date: '2026-12-31', time: '23:30' }),
  'João',
);
assertEqual(yearBoundaryEvent.title, 'Exame - Doppler - João', 'exam title');
assertLocalDateTime(yearBoundaryEvent.endDate, '2027-01-01T00:30');

const escapedEvent = buildCalendarEvent(
  appointment({
    id: 'consulta/acentuada',
    specialty: 'Otorrino, adulto; pós',
    location: 'Clínica \\ A, Sala 2\nBloco B',
  }),
  'José; Silva',
);
const ics = buildIcsContent(escapedEvent, new Date('2026-08-22T12:34:56.000Z'));
assertMatch(ics, /^BEGIN:VCALENDAR\r\n/, 'ICS header');
assertMatch(ics, /VERSION:2\.0\r\n/, 'ICS version');
assertMatch(ics, /CALSCALE:GREGORIAN\r\n/, 'ICS calendar scale');
assertMatch(ics, /METHOD:PUBLISH\r\n/, 'ICS publish method');
assertMatch(ics, /PRODID:-\/\/Saude Familiar Mobile\/\/Agendamentos\/\/PT-BR\r\n/, 'ICS product');
assertMatch(ics, /BEGIN:VEVENT\r\n/, 'ICS event');
assertMatch(ics, /UID:consulta%2Facentuada@saudefamiliar\.local\r\n/, 'ICS UID');
assertMatch(ics, /DTSTAMP:20260822T123456Z\r\n/, 'UTC timestamp');
assertMatch(ics, /DTSTART:20260930T070000\r\n/, 'local DTSTART');
assertMatch(ics, /DTEND:20260930T080000\r\n/, 'local DTEND');
assertMatch(ics, /SUMMARY:Consulta - Otorrino\\, adulto\\; pós - José\\; Silva\r\n/, 'escaped summary');
assertMatch(ics, /LOCATION:Clínica \\\\ A\\, Sala 2\\nBloco B\r\n/, 'escaped location');
assertMatch(ics, /DESCRIPTION:Agendamento compartilhado pelo Saúde Familiar\.\r\n/, 'minimal description line');
assertMatch(ics, /END:VEVENT\r\nEND:VCALENDAR\r\n$/, 'ICS footer');
assertEqual(ics.includes('Dra. Ana Souza'), false, 'professional name excluded');
assertEqual(ics.includes('Levar exames anteriores.'), false, 'notes excluded');
assertEqual(ics.includes('(11) 99999-9999'), false, 'phone excluded');

assertThrows(
  () => buildCalendarEvent(appointment({ status: 'pending' }), 'José'),
  /Somente agendamentos marcados como agendados/,
  'pending event rejected',
);
assertThrows(
  () => buildCalendarEvent(appointment({ date: '2026-02-30' }), 'José'),
  /data e hora.*válidas/,
  'invalid date rejected',
);

console.log('Calendar event tests passed: eligibility, local timezone, one-hour duration, stable UID, ICS escaping, and data minimization.');
