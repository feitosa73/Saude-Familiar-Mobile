import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import type { Caregiver } from '@/domain/caregiver';
import type {
  Consultation,
  ConsultationStatus,
  ConsultationType,
  CreateConsultationInput,
} from '@/domain/consultation';
import {
  DEFAULT_REMINDER_ALERT_MODE,
  type Reminder,
  type ReminderAlertMode,
  type ReminderOffsetUnit,
} from '@/domain/reminder';
import type { CreatePatientInput, Patient } from '@/domain/patient';
import { useColors } from '@/hooks/useColors';
import { useLocalData } from '@/context/LocalDataContext';
import {
  localDateInputFromIso,
  localDateTimeToIso,
  localTimeInputFromIso,
  type PendingReminderPreset,
  type ReminderOffsetSelection,
  type ReminderSelection,
} from '@/utils/reminderPlanning';

type OnboardingStep = 'welcome' | 'caregiver-form';
type PatientView = 'home' | 'list' | 'add' | 'edit';
type ConsultationView = 'none' | 'list' | 'add' | 'edit';
type ConsultationFormInput = Omit<CreateConsultationInput, 'patientId'> & {
  reminderSelection: ReminderSelection;
};

const SCHEDULED_REMINDER_OPTIONS: Array<{
  label: string;
  offset: ReminderOffsetSelection;
}> = [
  { label: '30 minutos antes', offset: { offsetValue: 30, offsetUnit: 'minutes' } },
  { label: '1 hora antes', offset: { offsetValue: 1, offsetUnit: 'hours' } },
  { label: '2 horas antes', offset: { offsetValue: 2, offsetUnit: 'hours' } },
  { label: '1 dia antes', offset: { offsetValue: 1, offsetUnit: 'days' } },
  { label: '2 dias antes', offset: { offsetValue: 2, offsetUnit: 'days' } },
  { label: '1 semana antes', offset: { offsetValue: 7, offsetUnit: 'days' } },
];

const PENDING_REMINDER_OPTIONS: Array<{ label: string; value: PendingReminderPreset }> = [
  { label: 'Não lembrar', value: 'none' },
  { label: 'Amanhã às 09:00', value: 'tomorrow' },
  { label: 'Daqui a 3 dias às 09:00', value: 'three_days' },
  { label: 'Daqui a 1 semana às 09:00', value: 'one_week' },
  { label: 'Data/hora personalizada', value: 'custom' },
];

const REMINDER_ALERT_MODE_OPTIONS: Array<{
  value: ReminderAlertMode;
  label: string;
  description: string;
}> = [
  { value: 'silent', label: 'Silencioso', description: 'Mostrar apenas a notificação.' },
  { value: 'normal', label: 'Normal', description: 'Som e vibração.' },
  { value: 'highlight', label: 'Destacado', description: 'Som, vibração e alerta em destaque quando permitido pelo Android.' },
];

const CONSULTATION_STATUS_LABELS: Record<ConsultationStatus, string> = {
  pending: 'A agendar',
  scheduled: 'Agendado',
  completed: 'Realizado',
  cancelled: 'Cancelado',
};

const APPOINTMENT_TYPE_OPTIONS: Array<{ value: ConsultationType; label: string }> = [
  { value: 'consultation', label: 'Consulta' },
  { value: 'exam', label: 'Exame' },
];

const CONSULTATION_STATUSES: ConsultationStatus[] = [
  'pending',
  'scheduled',
  'completed',
  'cancelled',
];

function consultationStatusLabel(status: ConsultationStatus): string {
  return CONSULTATION_STATUS_LABELS[status];
}

function consultationTypeLabel(type: ConsultationType): string {
  return type === 'exam' ? 'Exame' : 'Consulta';
}

function consultationDateLabel(consultation: Consultation): string | null {
  if (!consultation.date) return null;
  const date = formatCivilDate(consultation.date);
  return consultation.time ? `${date} às ${consultation.time}` : date;
}

function consultationSortValue(consultation: Consultation): string {
  return `${consultation.date ?? '9999-99-99'}T${consultation.time ?? '99:99'}`;
}

function currentCivilDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function isUpcomingConsultation(consultation: Consultation): boolean {
  return consultation.status === 'scheduled' &&
    (!consultation.date || consultation.date >= currentCivilDate());
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function showUserAlert(title: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }]);
  });
}

function formatBirthDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseCivilDate(value: string): string | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const currentYear = new Date().getFullYear();

  if (year < 1900 || year > currentYear || month < 1 || month > 12) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${yearText}-${monthText}-${dayText}`;
}

function parseConsultationDate(value: string): string | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  if (year < 1900 || year > 2200 || month < 1 || month > 12) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${yearText}-${monthText}-${dayText}`;
}

function formatTimeInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function parseConsultationTime(value: string): string | null {
  if (!value) return null;
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

function formatCivilDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function formatReminderSummary(reminder: Reminder): string {
  if (reminder.type === 'scheduling_task') {
    return `Em ${localDateInputFromIso(reminder.triggerAt)} às ${localTimeInputFromIso(reminder.triggerAt)}`;
  }

  const value = reminder.offsetValue ?? 0;
  const unit = reminder.offsetUnit === 'minutes'
    ? value === 1 ? 'minuto' : 'minutos'
    : reminder.offsetUnit === 'hours'
      ? value === 1 ? 'hora' : 'horas'
      : value === 1 ? 'dia' : 'dias';
  return `${value} ${unit} antes`;
}

function initialReminderSelection(reminders: Reminder[]): ReminderSelection {
  const scheduledOffsets = reminders
    .filter((item) => item.type === 'consultation_advance' && item.offsetValue && item.offsetUnit)
    .map((item) => ({
      offsetValue: item.offsetValue as number,
      offsetUnit: item.offsetUnit as ReminderOffsetUnit,
    }));
  const pendingReminder = reminders.find((item) => item.type === 'scheduling_task');
  const reminderWithAlertMode = reminders.find((item) => item.alertMode);
  return {
    scheduledOffsets,
    pendingPreset: pendingReminder ? 'custom' : 'none',
    pendingCustomTriggerAt: pendingReminder?.triggerAt ?? null,
    alertMode: reminderWithAlertMode?.alertMode ?? DEFAULT_REMINDER_ALERT_MODE,
  };
}

function LocalBadge() {
  const colors = useColors();

  return (
    <View
      accessibilityLabel="Dados somente neste aparelho"
      style={[
        styles.localBadge,
        { backgroundColor: colors.secondary, borderColor: colors.border },
      ]}
    >
      <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
      <Text style={[styles.localBadgeText, { color: colors.secondaryForeground }]}>
        Somente neste aparelho
      </Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: colors.primary },
        pressed && !disabled ? styles.pressed : null,
        disabled ? { backgroundColor: colors.muted } : null,
      ]}
    >
      {disabled ? (
        <ActivityIndicator color={colors.mutedForeground} />
      ) : (
        <>
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
            {label}
          </Text>
          <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} />
        </>
      )}
    </Pressable>
  );
}

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.welcomeContent,
          { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <Image
            accessibilityLabel="Símbolo Saúde Familiar"
            source={require('../assets/images/icon.png')}
            style={styles.logo}
          />
          <View>
            <Text style={[styles.brandName, { color: colors.foreground }]}>
              Saúde Familiar
            </Text>
            <Text style={[styles.brandCaption, { color: colors.mutedForeground }]}>
              Cuidado simples, no seu ritmo
            </Text>
          </View>
        </View>

        <View style={styles.welcomeHero}>
          <View style={[styles.heroIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="heart-outline" size={42} color={colors.accentForeground} />
          </View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>
            PRIMEIRO PASSO
          </Text>
          <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>
            Antes de começar, conte quem está cuidando.
          </Text>
          <Text style={[styles.welcomeDescription, { color: colors.mutedForeground }]}>
            Diga como podemos chamar você. Depois, vamos cadastrar a pessoa que você
            quer acompanhar.
          </Text>
        </View>

        <View style={styles.promiseList}>
          <PromiseRow
            icon="sparkles-outline"
            text="Uma experiência simples para começar"
          />
          <PromiseRow
            icon="shield-checkmark-outline"
            text="Seus dados ficam neste aparelho"
          />
          <PromiseRow
            icon="wifi-outline"
            text="Funciona mesmo sem Internet"
          />
        </View>

        <View style={styles.welcomeAction}>
          <PrimaryButton
            label="Criar meu perfil"
            onPress={onStart}
            testID="welcome-start"
          />
          <Text style={[styles.actionHint, { color: colors.mutedForeground }]}>
            Leva menos de um minuto
          </Text>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function PromiseRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const colors = useColors();

  return (
    <View style={styles.promiseRow}>
      <View style={[styles.promiseIcon, { backgroundColor: colors.secondary }]}>
        <Ionicons name={icon} size={19} color={colors.primary} />
      </View>
      <Text style={[styles.promiseText, { color: colors.foreground }]}>{text}</Text>
    </View>
  );
}

function CaregiverForm({
  onBack,
  onSaved,
}: {
  onBack: () => void;
  onSaved: (name: string) => Promise<void>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    Keyboard.dismiss();
    setError(null);

    if (name.trim().length < 2) {
      setError('Informe seu nome para continuar.');
      return;
    }

    setIsSaving(true);
    try {
      await onSaved(name.trim());
    } catch {
      setError('Não foi possível salvar agora. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.formContent,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
        ]}
        bottomOffset={72}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityLabel="Voltar para a introdução"
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed ? styles.pressed : null,
          ]}
          testID="caregiver-form-back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>

        <View style={[styles.formIcon, { backgroundColor: colors.secondary }]}>
          <Ionicons name="person-circle-outline" size={30} color={colors.primary} />
        </View>
        <Text style={[styles.formTitle, { color: colors.foreground }]}>
          Como podemos chamar você?
        </Text>
        <Text style={[styles.formDescription, { color: colors.mutedForeground }]}>
          Este é o seu perfil de quem está cuidando. Depois, você poderá cadastrar o familiar que deseja acompanhar.
        </Text>

        <View style={styles.formFields}>
          <FieldLabel label="Seu nome" required />
          <TextInput
            accessibilityLabel="Seu nome"
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={setName}
            onSubmitEditing={() => void handleSubmit()}
            placeholder="Ex.: Paulo da Silva"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="done"
            style={[
              styles.input,
              { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground },
            ]}
            testID="caregiver-name-input"
            value={name}
          />
        </View>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.accent }]}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.accentForeground} />
            <Text style={[styles.errorText, { color: colors.accentForeground }]}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.formAction}>
          <PrimaryButton
            disabled={isSaving}
            label="Salvar meu perfil"
            onPress={() => void handleSubmit()}
            testID="caregiver-save"
          />
          <View style={styles.privacyNote}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
            <Text style={[styles.privacyText, { color: colors.mutedForeground }]}>
              Seu nome fica somente neste aparelho
            </Text>
          </View>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function PatientForm({
  initialPatient,
  onBack,
  onSaved,
  submitLabel = 'Salvar familiar',
  title = 'Quem você quer acompanhar?',
  description = 'Cadastre um familiar para começar. Você poderá completar outras informações depois.',
}: {
  initialPatient?: Patient;
  onBack?: () => void;
  onSaved: (input: CreatePatientInput) => Promise<void>;
  submitLabel?: string;
  title?: string;
  description?: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initialPatient?.name ?? '');
  const [birthDate, setBirthDate] = useState(
    initialPatient?.birthDate ? formatCivilDate(initialPatient.birthDate) : '',
  );
  const [notes, setNotes] = useState(initialPatient?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    Keyboard.dismiss();
    setError(null);

    if (name.trim().length < 2) {
      setError('Informe o nome do familiar para continuar.');
      return;
    }

    const civilDate = birthDate.trim() ? parseCivilDate(birthDate) : null;
    if (birthDate.trim() && !civilDate) {
      setError('Informe uma data de nascimento válida no formato DD/MM/AAAA.');
      return;
    }

    setIsSaving(true);
    try {
      await onSaved({
        name: name.trim(),
        birthDate: civilDate,
        notes: notes.trim() || null,
      });
    } catch {
      setError('Não foi possível salvar agora. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.formContent,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
        ]}
        bottomOffset={72}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {onBack ? (
          <Pressable
            accessibilityLabel="Voltar para a introdução"
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed ? styles.pressed : null,
            ]}
            testID="patient-form-back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
        ) : null}

        <View style={[styles.formIcon, { backgroundColor: colors.secondary }]}>
          <Ionicons name="person-outline" size={30} color={colors.primary} />
        </View>
        <Text style={[styles.formTitle, { color: colors.foreground }]}>
          {title}
        </Text>
        <Text style={[styles.formDescription, { color: colors.mutedForeground }]}>
          {description}
        </Text>

        <View style={styles.formFields}>
          <FieldLabel label="Nome do familiar" required />
          <TextInput
            accessibilityLabel="Nome do familiar"
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={setName}
            placeholder="Ex.: João da Silva"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="next"
            style={[
              styles.input,
              { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground },
            ]}
            testID="patient-name-input"
            value={name}
          />

          <FieldLabel label="Data de nascimento" />
          <TextInput
            accessibilityLabel="Data de nascimento"
            keyboardType="number-pad"
            maxLength={10}
            onChangeText={(value) => setBirthDate(formatBirthDateInput(value))}
            placeholder="DD/MM/AAAA"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground },
            ]}
            testID="patient-birth-date-input"
            value={birthDate}
          />
          <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
            Opcional. Você poderá informar depois.
          </Text>

          <FieldLabel label="Observações" />
          <TextInput
            accessibilityLabel="Observações do familiar"
            multiline
            onChangeText={setNotes}
            placeholder="Ex.: informações importantes para o cuidado"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              styles.notesInput,
              { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground },
            ]}
            testID="patient-notes-input"
            textAlignVertical="top"
            value={notes}
          />
        </View>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.accent }]}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.accentForeground} />
            <Text style={[styles.errorText, { color: colors.accentForeground }]}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.formAction}>
          <PrimaryButton
            disabled={isSaving}
            label={submitLabel}
            onPress={() => void handleSubmit()}
            testID="patient-save"
          />
          <View style={styles.privacyNote}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
            <Text style={[styles.privacyText, { color: colors.mutedForeground }]}>
              Salvo somente neste aparelho
            </Text>
          </View>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function ReminderAlertModeOptions({
  value,
  onChange,
}: {
  value: ReminderAlertMode;
  onChange: (mode: ReminderAlertMode) => void;
}) {
  const colors = useColors();

  return (
    <View style={styles.reminderAlertModeFields}>
      <FieldLabel label="Como deseja ser avisado?" />
      {REMINDER_ALERT_MODE_OPTIONS.map((option) => {
        const isSelected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.reminderAlertModeOption,
              {
                backgroundColor: isSelected ? colors.primary : colors.card,
                borderColor: isSelected ? colors.primary : colors.border,
              },
              pressed ? styles.pressed : null,
            ]}
            testID={`consultation-alert-mode-${option.value}`}
          >
            <View style={[
              styles.reminderAlertModeRadio,
              { borderColor: isSelected ? colors.primaryForeground : colors.mutedForeground },
            ]}>
              {isSelected ? <View style={[styles.reminderAlertModeRadioDot, { backgroundColor: colors.primaryForeground }]} /> : null}
            </View>
            <View style={styles.reminderAlertModeCopy}>
              <Text style={[styles.reminderAlertModeLabel, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>
                {option.label}
              </Text>
              <Text style={[styles.reminderAlertModeDescription, { color: isSelected ? colors.primaryForeground : colors.mutedForeground }]}>
                {option.description}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function ConsultationForm({
  initialConsultation,
  onBack,
  onSaved,
  title,
  description,
  submitLabel,
  initialReminders = [],
}: {
  initialConsultation?: Consultation | null;
  initialReminders?: Reminder[];
  onBack: () => void;
  onSaved: (input: ConsultationFormInput) => Promise<void>;
  title: string;
  description: string;
  submitLabel: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<ConsultationType>(initialConsultation?.type ?? 'consultation');
  const [specialty, setSpecialty] = useState(initialConsultation?.specialty ?? '');
  const [professionalName, setProfessionalName] = useState(initialConsultation?.professionalName ?? '');
  const [location, setLocation] = useState(initialConsultation?.location ?? '');
  const [phone, setPhone] = useState(initialConsultation?.phone ?? '');
  const [status, setStatus] = useState<ConsultationStatus>(initialConsultation?.status ?? 'pending');
  const [date, setDate] = useState(
    initialConsultation?.date ? formatCivilDate(initialConsultation.date) : '',
  );
  const [time, setTime] = useState(initialConsultation?.time ?? '');
  const [notes, setNotes] = useState(initialConsultation?.notes ?? '');
  const initialSelection = initialReminderSelection(initialReminders);
  const initialCustomScheduledOffset = initialSelection.scheduledOffsets.find(
    (offset) => !SCHEDULED_REMINDER_OPTIONS.some(
      (option) => option.offset.offsetValue === offset.offsetValue && option.offset.offsetUnit === offset.offsetUnit,
    ),
  );
  const [scheduledOffsets, setScheduledOffsets] = useState<ReminderOffsetSelection[]>(initialSelection.scheduledOffsets);
  const [customScheduledEnabled, setCustomScheduledEnabled] = useState(Boolean(initialCustomScheduledOffset));
  const [customOffsetValue, setCustomOffsetValue] = useState(
    initialCustomScheduledOffset ? String(initialCustomScheduledOffset.offsetValue) : '',
  );
  const [customOffsetUnit, setCustomOffsetUnit] = useState<ReminderOffsetUnit>(
    initialCustomScheduledOffset?.offsetUnit ?? 'days',
  );
  const [pendingPreset, setPendingPreset] = useState<PendingReminderPreset>(initialSelection.pendingPreset);
  const [pendingCustomDate, setPendingCustomDate] = useState(
    initialSelection.pendingCustomTriggerAt
      ? localDateInputFromIso(initialSelection.pendingCustomTriggerAt)
      : '',
  );
  const [pendingCustomTime, setPendingCustomTime] = useState(
    initialSelection.pendingCustomTriggerAt
      ? localTimeInputFromIso(initialSelection.pendingCustomTriggerAt)
      : '',
  );
  const [alertMode, setAlertMode] = useState<ReminderAlertMode>(
    initialSelection.alertMode ?? DEFAULT_REMINDER_ALERT_MODE,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function toggleScheduledOffset(offset: ReminderOffsetSelection) {
    setScheduledOffsets((current) => {
      const exists = current.some(
        (item) => item.offsetValue === offset.offsetValue && item.offsetUnit === offset.offsetUnit,
      );
      return exists
        ? current.filter((item) => item.offsetValue !== offset.offsetValue || item.offsetUnit !== offset.offsetUnit)
        : [...current, offset];
    });
  }

  async function handleSubmit() {
    Keyboard.dismiss();
    setError(null);

    if (specialty.trim().length < 2) {
      setError(type === 'exam' ? 'Informe o nome do exame.' : 'Informe a especialidade da consulta.');
      return;
    }

    const civilDate = date.trim() ? parseConsultationDate(date) : null;
    if (date.trim() && !civilDate) {
      setError('Informe uma data válida no formato DD/MM/AAAA.');
      return;
    }

    const normalizedTime = parseConsultationTime(time.trim());
    if (time.trim() && !normalizedTime) {
      setError('Informe uma hora válida no formato HH:MM.');
      return;
    }

    let reminderOffsets = status === 'scheduled'
      ? scheduledOffsets.filter((offset) =>
        SCHEDULED_REMINDER_OPTIONS.some(
          (option) => option.offset.offsetValue === offset.offsetValue && option.offset.offsetUnit === offset.offsetUnit,
        ),
      )
      : [];
    if (status === 'scheduled' && customScheduledEnabled) {
      const parsedOffset = Number(customOffsetValue);
      if (!Number.isInteger(parsedOffset) || parsedOffset <= 0) {
        setError('Informe uma antecedência personalizada positiva.');
        return;
      }
      const customOffset = { offsetValue: parsedOffset, offsetUnit: customOffsetUnit };
      const standardOffsets = reminderOffsets.filter((offset) =>
        SCHEDULED_REMINDER_OPTIONS.some(
          (option) => option.offset.offsetValue === offset.offsetValue && option.offset.offsetUnit === offset.offsetUnit,
        ),
      );
      reminderOffsets = standardOffsets.some(
        (offset) => offset.offsetValue === customOffset.offsetValue && offset.offsetUnit === customOffset.offsetUnit,
      )
        ? standardOffsets
        : [...standardOffsets, customOffset];
    }

    let pendingCustomTriggerAt: string | null = null;
    if (status === 'pending' && pendingPreset === 'custom') {
      const pendingDate = pendingCustomDate.trim() ? parseConsultationDate(pendingCustomDate) : null;
      const pendingTime = parseConsultationTime(pendingCustomTime.trim());
      if (!pendingDate || !pendingTime) {
        setError('Informe data e hora válidas para o lembrete personalizado.');
        return;
      }
      pendingCustomTriggerAt = localDateTimeToIso(pendingDate, pendingTime);
      if (!pendingCustomTriggerAt) {
        setError('Não foi possível interpretar a data e hora do lembrete.');
        return;
      }
    }

    if (status === 'scheduled' && reminderOffsets.length > 0 && (!civilDate || !normalizedTime)) {
      setError('Informe data e hora do agendamento antes de configurar lembretes.');
      return;
    }

    setIsSaving(true);
    try {
      await onSaved({
        type,
        specialty: specialty.trim(),
        professionalName: type === 'consultation' ? professionalName.trim() || null : null,
        location: location.trim() || null,
        phone: phone.trim() || null,
        date: civilDate,
        time: normalizedTime,
        notes: notes.trim() || null,
        status,
        reminderSelection: {
          scheduledOffsets: reminderOffsets,
          pendingPreset: status === 'pending' ? pendingPreset : 'none',
          pendingCustomTriggerAt,
          alertMode,
        },
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o agendamento.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.formContent,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
        ]}
        bottomOffset={72}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityLabel="Voltar para Agendamentos"
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed ? styles.pressed : null,
          ]}
          testID="consultation-form-back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>

        <View style={[styles.formIcon, { backgroundColor: colors.secondary }]}>
          <Ionicons name="calendar-outline" size={30} color={colors.primary} />
        </View>
        <Text style={[styles.formTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.formDescription, { color: colors.mutedForeground }]}>{description}</Text>

        <View style={styles.formFields}>
          <FieldLabel label="O que deseja registrar?" required />
          <View style={styles.consultationTypeOptions}>
            {APPOINTMENT_TYPE_OPTIONS.map((option) => {
              const isSelected = option.value === type;
              return (
                <Pressable
                  key={option.value}
                  accessibilityLabel={option.label}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  onPress={() => setType(option.value)}
                  style={({ pressed }) => [
                    styles.consultationTypeOption,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                    pressed ? styles.pressed : null,
                  ]}
                  testID={`appointment-type-${option.value}`}
                >
                  <Ionicons name={option.value === 'exam' ? 'flask-outline' : 'medical-outline'} size={18} color={isSelected ? colors.primaryForeground : colors.primary} />
                  <Text style={[styles.consultationTypeOptionText, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <FieldLabel label={type === 'exam' ? 'Nome do exame' : 'Especialidade'} required />
          <TextInput
            accessibilityLabel={type === 'exam' ? 'Nome do exame' : 'Especialidade da consulta'}
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={setSpecialty}
            placeholder={type === 'exam' ? 'Ex.: Hemograma' : 'Ex.: Cardiologista'}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
            testID="consultation-specialty-input"
            value={specialty}
          />

          <FieldLabel label="Status" required />
          <View style={styles.consultationStatusOptions}>
            {CONSULTATION_STATUSES.map((option) => {
              const isSelected = option === status;
              return (
                <Pressable
                  key={option}
                  accessibilityLabel={`Status ${consultationStatusLabel(option)}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setStatus(option)}
                  style={({ pressed }) => [
                    styles.consultationStatusOption,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                    pressed ? styles.pressed : null,
                  ]}
                  testID={`consultation-status-${option}`}
                >
                  <Text style={[styles.consultationStatusOptionText, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>
                    {consultationStatusLabel(option)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
            Em “A agendar”, data e hora podem ficar vazias e ser preenchidas depois.
          </Text>

          {type === 'consultation' ? (
            <>
              <FieldLabel label="Profissional" />
              <TextInput
                accessibilityLabel="Nome do profissional"
                autoCapitalize="words"
                onChangeText={setProfessionalName}
                placeholder="Ex.: Dra. Ana Souza"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
                testID="consultation-professional-input"
                value={professionalName}
              />
            </>
          ) : null}

          <FieldLabel label={type === 'exam' ? 'Local / Laboratório' : 'Local / Unidade'} />
          <TextInput
            accessibilityLabel={type === 'exam' ? 'Local ou laboratório do exame' : 'Local ou unidade da consulta'}
            onChangeText={setLocation}
            placeholder="Ex.: Clínica Central"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
            testID="consultation-location-input"
            value={location}
          />

          <FieldLabel label="Telefone" />
          <TextInput
            accessibilityLabel="Telefone do agendamento"
            keyboardType="phone-pad"
            onChangeText={setPhone}
            placeholder="Ex.: (11) 99999-9999"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
            testID="consultation-phone-input"
            value={phone}
          />

          <FieldLabel label="Data" />
          <TextInput
            accessibilityLabel="Data do agendamento"
            keyboardType="number-pad"
            maxLength={10}
            onChangeText={(value) => setDate(formatBirthDateInput(value))}
            placeholder="DD/MM/AAAA"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
            testID="consultation-date-input"
            value={date}
          />

          <FieldLabel label="Hora" />
          <TextInput
            accessibilityLabel="Hora do agendamento"
            keyboardType="number-pad"
            maxLength={5}
            onChangeText={(value) => setTime(formatTimeInput(value))}
            placeholder="HH:MM"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
            testID="consultation-time-input"
            value={time}
          />

          <FieldLabel label="Observações" />
          <TextInput
            accessibilityLabel="Observações do agendamento"
            multiline
            onChangeText={setNotes}
            placeholder="Ex.: levar documentos ou perguntas"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, styles.notesInput, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
            testID="consultation-notes-input"
            textAlignVertical="top"
            value={notes}
          />

          {status === 'scheduled' ? (
            <View style={styles.reminderFields}>
              <FieldLabel label="Lembretes" />
              <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>Escolha uma ou mais antecedências. Se nada for escolhido, não haverá lembrete.</Text>
              <Pressable
                accessibilityLabel="Não lembrar deste agendamento"
                accessibilityRole="button"
                accessibilityState={{ selected: scheduledOffsets.length === 0 && !customScheduledEnabled }}
                onPress={() => {
                  setScheduledOffsets([]);
                  setCustomScheduledEnabled(false);
                }}
                style={({ pressed }) => [
                  styles.reminderOption,
                  {
                    backgroundColor: scheduledOffsets.length === 0 && !customScheduledEnabled ? colors.primary : colors.card,
                    borderColor: scheduledOffsets.length === 0 && !customScheduledEnabled ? colors.primary : colors.border,
                  },
                  pressed ? styles.pressed : null,
                ]}
                testID="consultation-reminder-none"
              >
                <Text style={[styles.reminderOptionText, { color: scheduledOffsets.length === 0 && !customScheduledEnabled ? colors.primaryForeground : colors.foreground }]}>Não lembrar</Text>
              </Pressable>
              {SCHEDULED_REMINDER_OPTIONS.map((option) => {
                const isSelected = scheduledOffsets.some(
                  (offset) => offset.offsetValue === option.offset.offsetValue && offset.offsetUnit === option.offset.offsetUnit,
                );
                return (
                  <Pressable
                    key={option.label}
                    accessibilityLabel={option.label}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    onPress={() => toggleScheduledOffset(option.offset)}
                    style={({ pressed }) => [
                      styles.reminderOption,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.card,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                      pressed ? styles.pressed : null,
                    ]}
                    testID={`consultation-reminder-${option.offset.offsetValue}-${option.offset.offsetUnit}`}
                  >
                    <Text style={[styles.reminderOptionText, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>{option.label}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityLabel="Antecedência personalizada"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: customScheduledEnabled }}
                onPress={() => setCustomScheduledEnabled((current) => !current)}
                style={({ pressed }) => [
                  styles.reminderOption,
                  {
                    backgroundColor: customScheduledEnabled ? colors.primary : colors.card,
                    borderColor: customScheduledEnabled ? colors.primary : colors.border,
                  },
                  pressed ? styles.pressed : null,
                ]}
                testID="consultation-reminder-custom"
              >
                <Text style={[styles.reminderOptionText, { color: customScheduledEnabled ? colors.primaryForeground : colors.foreground }]}>Personalizado</Text>
              </Pressable>
              {customScheduledEnabled ? (
                <View style={styles.reminderCustomRow}>
                  <TextInput
                    accessibilityLabel="Quantidade da antecedência personalizada"
                    keyboardType="number-pad"
                    onChangeText={(value) => setCustomOffsetValue(value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="3"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.reminderCustomInput, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
                    testID="consultation-reminder-custom-value"
                    value={customOffsetValue}
                  />
                  {(['minutes', 'hours', 'days'] as ReminderOffsetUnit[]).map((unit) => {
                    const isSelected = customOffsetUnit === unit;
                    const label = unit === 'minutes' ? 'minutos' : unit === 'hours' ? 'horas' : 'dias';
                    return (
                      <Pressable
                        key={unit}
                        accessibilityLabel={label}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        onPress={() => setCustomOffsetUnit(unit)}
                        style={({ pressed }) => [
                          styles.reminderUnitOption,
                          {
                            backgroundColor: isSelected ? colors.primary : colors.card,
                            borderColor: isSelected ? colors.primary : colors.border,
                          },
                          pressed ? styles.pressed : null,
                        ]}
                        testID={`consultation-reminder-unit-${unit}`}
                      >
                        <Text style={[styles.reminderUnitText, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              <ReminderAlertModeOptions value={alertMode} onChange={setAlertMode} />
            </View>
          ) : status === 'pending' ? (
            <View style={styles.reminderFields}>
              <FieldLabel label="Lembrete para agendar" />
              <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>O agendamento ainda não tem horário. Escolha quando lembrar de realizar o agendamento.</Text>
              {PENDING_REMINDER_OPTIONS.map((option) => {
                const isSelected = pendingPreset === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityLabel={option.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setPendingPreset(option.value)}
                    style={({ pressed }) => [
                      styles.reminderOption,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.card,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                      pressed ? styles.pressed : null,
                    ]}
                    testID={`consultation-pending-reminder-${option.value}`}
                  >
                    <Text style={[styles.reminderOptionText, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>{option.label}</Text>
                  </Pressable>
                );
              })}
              {pendingPreset === 'custom' ? (
                <View style={styles.reminderCustomDateRow}>
                  <TextInput
                    accessibilityLabel="Data personalizada do lembrete"
                    keyboardType="number-pad"
                    maxLength={10}
                    onChangeText={(value) => setPendingCustomDate(formatBirthDateInput(value))}
                    placeholder="DD/MM/AAAA"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.reminderDateInput, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
                    testID="consultation-pending-reminder-date"
                    value={pendingCustomDate}
                  />
                  <TextInput
                    accessibilityLabel="Hora personalizada do lembrete"
                    keyboardType="number-pad"
                    maxLength={5}
                    onChangeText={(value) => setPendingCustomTime(formatTimeInput(value))}
                    placeholder="HH:MM"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.reminderDateInput, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
                    testID="consultation-pending-reminder-time"
                    value={pendingCustomTime}
                  />
                </View>
              ) : null}
              <ReminderAlertModeOptions value={alertMode} onChange={setAlertMode} />
            </View>
          ) : null}
        </View>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.accent }]}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.accentForeground} />
            <Text style={[styles.errorText, { color: colors.accentForeground }]}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.formAction}>
          <PrimaryButton
            disabled={isSaving}
            label={submitLabel}
            onPress={() => void handleSubmit()}
            testID="consultation-save"
          />
          <View style={styles.privacyNote}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
            <Text style={[styles.privacyText, { color: colors.mutedForeground }]}>Salvo somente neste aparelho</Text>
          </View>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function PatientsScreen({
  patients,
  activePatientId,
  onBack,
  onAdd,
  onEdit,
  onDelete,
  onSelect,
}: {
  patients: Patient[];
  activePatientId: string | null;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (patient: Patient) => void;
  onDelete: (patient: Patient) => void;
  onSelect: (patient: Patient) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <View style={[styles.managerHeader, { paddingTop: insets.top + 12 }]}>
        <Pressable
          accessibilityLabel="Voltar para o espaço do familiar"
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed ? styles.pressed : null,
          ]}
          testID="patients-back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.managerHeaderCopy}>
          <Text style={[styles.homeEyebrow, { color: colors.primary }]}>FAMILIARES</Text>
          <Text style={[styles.managerTitle, { color: colors.foreground }]}>Quem você acompanha</Text>
          <Text style={[styles.managerDescription, { color: colors.mutedForeground }]}>
            Selecione um familiar ou cadastre outra pessoa para organizar seus cuidados.
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Cadastrar novo familiar"
          accessibilityRole="button"
          onPress={onAdd}
          style={({ pressed }) => [
            styles.addIconButton,
            { backgroundColor: colors.primary },
            pressed ? styles.pressed : null,
          ]}
          testID="patient-add"
        >
          <Ionicons name="add" size={25} color={colors.primaryForeground} />
        </Pressable>
      </View>

      <LocalBadge />

      <FlatList
        data={patients}
        style={styles.patientListView}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.patientList,
          { paddingBottom: insets.bottom + 24 },
        ]}
        renderItem={({ item }) => {
          const isSelected = item.id === activePatientId;
          return (
            <View
              style={[
                styles.patientCard,
                { backgroundColor: colors.card, borderColor: isSelected ? colors.primary : colors.border },
              ]}
            >
              <Pressable
                accessibilityLabel={`Selecionar ${item.name}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelect(item)}
                style={({ pressed }) => [
                  styles.patientCardContent,
                  pressed ? styles.pressed : null,
                ]}
                testID={`patient-select-${item.id}`}
              >
                <View style={[styles.patientCardIcon, { backgroundColor: colors.secondary }]}>
                  <Ionicons name="person-outline" size={23} color={colors.primary} />
                </View>
                <View style={styles.patientCardCopy}>
                  <Text style={[styles.patientCardName, { color: colors.foreground }]}>{item.name}</Text>
                  <Text style={[styles.patientCardMeta, { color: colors.mutedForeground }]}>
                    {item.birthDate ? `Nascimento: ${formatCivilDate(item.birthDate)}` : 'Data de nascimento não informada'}
                  </Text>
                  {item.notes ? (
                    <Text numberOfLines={2} style={[styles.patientCardNotes, { color: colors.mutedForeground }]}>
                      {item.notes}
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name={isSelected ? 'checkmark-circle' : 'chevron-forward'}
                  size={24}
                  color={isSelected ? colors.primary : colors.mutedForeground}
                />
              </Pressable>
              <View style={[styles.patientActions, { borderTopColor: colors.border }]}>
                <Pressable
                  accessibilityLabel={`Editar ${item.name}`}
                  accessibilityRole="button"
                  onPress={() => onEdit(item)}
                  style={({ pressed }) => [styles.patientAction, pressed ? styles.pressed : null]}
                  testID={`patient-edit-${item.id}`}
                >
                  <Ionicons name="create-outline" size={18} color={colors.primary} />
                  <Text style={[styles.patientActionText, { color: colors.primary }]}>Editar</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Excluir ${item.name}`}
                  accessibilityRole="button"
                  onPress={() => onDelete(item)}
                  style={({ pressed }) => [styles.patientAction, pressed ? styles.pressed : null]}
                  testID={`patient-delete-${item.id}`}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                  <Text style={[styles.patientActionText, { color: colors.destructive }]}>Excluir</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={(
          <View style={styles.emptyPatients}>
            <Ionicons name="people-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyPatientsTitle, { color: colors.foreground }]}>Nenhum familiar cadastrado</Text>
            <Text style={[styles.emptyPatientsDescription, { color: colors.mutedForeground }]}>
              Cadastre uma pessoa para começar a organizar os cuidados.
            </Text>
          </View>
        )}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function ConsultationStatusBadge({ status }: { status: ConsultationStatus }) {
  const colors = useColors();
  const statusColor = status === 'cancelled'
    ? colors.destructive
    : status === 'completed'
      ? colors.accentForeground
      : colors.primary;
  const statusBackground = status === 'cancelled'
    ? colors.secondary
    : status === 'completed'
      ? colors.accent
      : colors.card;
  const iconName = status === 'pending'
    ? 'time-outline'
    : status === 'scheduled'
      ? 'calendar-outline'
      : status === 'completed'
        ? 'checkmark-circle-outline'
        : 'close-circle-outline';

  return (
    <View style={[styles.consultationStatusBadge, { backgroundColor: statusBackground, borderColor: colors.border }]}>
      <Ionicons name={iconName} size={15} color={statusColor} />
      <Text style={[styles.consultationStatusText, { color: statusColor }]}>{consultationStatusLabel(status)}</Text>
    </View>
  );
}

function ConsultationTypeBadge({ type }: { type: ConsultationType }) {
  const colors = useColors();
  const isExam = type === 'exam';
  return (
    <View
      accessibilityLabel={`Tipo: ${consultationTypeLabel(type)}`}
      style={[styles.consultationTypeBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}
    >
      <Ionicons name={isExam ? 'flask-outline' : 'medical-outline'} size={14} color={colors.primary} />
      <Text style={[styles.consultationTypeText, { color: colors.secondaryForeground }]}>{consultationTypeLabel(type)}</Text>
    </View>
  );
}

function ConsultationCard({
  consultation,
  reminders,
  onDelete,
  onEdit,
}: {
  consultation: Consultation;
  reminders: Reminder[];
  onDelete: (consultation: Consultation) => void;
  onEdit: (consultation: Consultation) => void;
}) {
  const colors = useColors();
  const dateLabel = consultationDateLabel(consultation);

  return (
    <View style={[styles.consultationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.consultationCardHeader}>
        <View style={styles.consultationCardCopy}>
          <ConsultationTypeBadge type={consultation.type} />
          <Text style={[styles.consultationSpecialty, { color: colors.foreground }]}>{consultation.specialty}</Text>
          {consultation.professionalName ? (
            <Text style={[styles.consultationMeta, { color: colors.mutedForeground }]}>
              {consultation.professionalName}
            </Text>
          ) : null}
        </View>
        <ConsultationStatusBadge status={consultation.status} />
      </View>
      <View style={styles.consultationDetails}>
        <View style={styles.consultationDetailRow}>
          <Ionicons name="calendar-outline" size={17} color={colors.primary} />
          <Text style={[styles.consultationDetailText, { color: colors.foreground }]}>
            {dateLabel ?? (consultation.status === 'pending' ? 'Data e hora a definir' : 'Data não informada')}
          </Text>
        </View>
        {consultation.location ? (
          <View style={styles.consultationDetailRow}>
            <Ionicons name="location-outline" size={17} color={colors.primary} />
            <Text style={[styles.consultationDetailText, { color: colors.mutedForeground }]}>{consultation.location}</Text>
          </View>
        ) : null}
        {consultation.phone ? (
          <View style={styles.consultationDetailRow}>
            <Ionicons name="call-outline" size={17} color={colors.primary} />
            <Text style={[styles.consultationDetailText, { color: colors.mutedForeground }]}>{consultation.phone}</Text>
          </View>
        ) : null}
        {consultation.notes ? (
          <Text style={[styles.consultationNotes, { color: colors.mutedForeground }]}>{consultation.notes}</Text>
        ) : null}
        {reminders.length > 0 ? (
          <View
            accessibilityLabel={`${reminders.length} lembrete${reminders.length === 1 ? '' : 's'} configurado${reminders.length === 1 ? '' : 's'}`}
            style={styles.consultationReminderSummary}
          >
            <Ionicons name="notifications-outline" size={16} color={colors.primary} />
            <Text style={[styles.consultationReminderText, { color: colors.mutedForeground }]}>
              {reminders.map(formatReminderSummary).join(' · ')}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.consultationActions, { borderTopColor: colors.border }]}>
        <Pressable
          accessibilityLabel={`Editar ${consultationTypeLabel(consultation.type).toLowerCase()} de ${consultation.specialty}`}
          accessibilityRole="button"
          onPress={() => onEdit(consultation)}
          style={({ pressed }) => [styles.consultationAction, pressed ? styles.pressed : null]}
          testID={`consultation-edit-${consultation.id}`}
        >
          <Ionicons name="create-outline" size={18} color={colors.primary} />
          <Text style={[styles.consultationActionText, { color: colors.primary }]}>Editar</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Excluir ${consultationTypeLabel(consultation.type).toLowerCase()} de ${consultation.specialty}`}
          accessibilityRole="button"
          onPress={() => onDelete(consultation)}
          style={({ pressed }) => [styles.consultationAction, pressed ? styles.pressed : null]}
          testID={`consultation-delete-${consultation.id}`}
        >
          <Ionicons name="trash-outline" size={18} color={colors.destructive} />
          <Text style={[styles.consultationActionText, { color: colors.destructive }]}>Excluir</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ConsultationsScreen({
  consultations,
  reminders,
  onAdd,
  onBack,
  onDelete,
  onEdit,
  patient,
}: {
  consultations: Consultation[];
  reminders: Reminder[];
  onAdd: () => void;
  onBack: () => void;
  onDelete: (consultation: Consultation) => void;
  onEdit: (consultation: Consultation) => void;
  patient: Patient;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pending = consultations.filter((item) => item.status === 'pending');
  const upcoming = consultations
    .filter(isUpcomingConsultation)
    .sort((left, right) => consultationSortValue(left).localeCompare(consultationSortValue(right)));
  const history = consultations.filter(
    (item) =>
      item.status === 'completed' ||
      item.status === 'cancelled' ||
      (item.status === 'scheduled' && item.date !== null && item.date < currentCivilDate()),
  );

  const renderSection = (title: string, items: Consultation[], emptyText: string) => (
    <View style={styles.consultationSection}>
      <Text style={[styles.consultationSectionTitle, { color: colors.foreground }]}>{title}</Text>
      {items.length > 0 ? items.map((item) => (
        <ConsultationCard
          key={item.id}
          consultation={item}
          reminders={reminders.filter((reminder) => reminder.consultationId === item.id)}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      )) : (
        <Text style={[styles.consultationEmptyText, { color: colors.mutedForeground }]}>{emptyText}</Text>
      )}
    </View>
  );

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <View style={[styles.managerHeader, { paddingTop: insets.top + 12 }]}>
        <Pressable
          accessibilityLabel="Voltar para a Home"
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed ? styles.pressed : null]}
          testID="consultations-back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.managerHeaderCopy}>
          <Text style={[styles.homeEyebrow, { color: colors.primary }]}>AGENDAMENTOS</Text>
          <Text style={[styles.managerTitle, { color: colors.foreground }]}>Agendamentos de {patient.name}</Text>
          <Text style={[styles.managerDescription, { color: colors.mutedForeground }]}>
            Acompanhe consultas e exames deste familiar, inclusive os que ainda estão a agendar.
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Adicionar agendamento"
          accessibilityRole="button"
          onPress={onAdd}
          style={({ pressed }) => [styles.addIconButton, { backgroundColor: colors.primary }, pressed ? styles.pressed : null]}
          testID="consultation-add"
        >
          <Ionicons name="add" size={25} color={colors.primaryForeground} />
        </Pressable>
      </View>

      <LocalBadge />
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.consultationListContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {renderSection('A agendar', pending, 'Nenhum agendamento aguardando data.')}
        {renderSection('Próximos', upcoming, 'Nenhum agendamento próximo.')}
        {renderSection('Histórico', history, 'Nenhum agendamento realizado ou cancelado.')}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  const colors = useColors();

  return (
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
      {label}
      {required ? <Text style={{ color: colors.primary }}> *</Text> : null}
    </Text>
  );
}

function HomeScreen({
  caregiver,
  consultations,
  onManagePatients,
  onOpenConsultations,
  patient,
}: {
  caregiver: Caregiver;
  consultations: Consultation[];
  onManagePatients: () => void;
  onOpenConsultations: () => void;
  patient: Patient;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pendingCount = consultations.filter((item) => item.status === 'pending').length;
  const nextConsultation = consultations
    .filter(isUpcomingConsultation)
    .sort((left, right) => consultationSortValue(left).localeCompare(consultationSortValue(right)))[0] ?? null;

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.homeContent,
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.homeHeader}>
          <View style={styles.homeHeaderCopy}>
            <Text style={[styles.homeEyebrow, { color: colors.primary }]}>SEU ESPAÇO</Text>
            <Text style={[styles.homeTitle, { color: colors.foreground }]}>
              Olá, {firstNameOf(caregiver.name)}.
            </Text>
            <Text style={[styles.homeSubtitle, { color: colors.mutedForeground }]}>
              Você está cuidando da sua família por aqui.
            </Text>
          </View>
          <View style={[styles.homeAvatar, { backgroundColor: colors.primary }]}>
            <Ionicons name="person" size={25} color={colors.primaryForeground} />
          </View>
        </View>

        <LocalBadge />

        <View style={[styles.selectedPatientCard, { backgroundColor: colors.secondary }]}>
          <View style={styles.selectedPatientCopy}>
            <Text style={[styles.homeEyebrow, { color: colors.primary }]}>FAMILIAR SELECIONADO</Text>
            <Text style={[styles.selectedPatientName, { color: colors.secondaryForeground }]}>{patient.name}</Text>
            <Text style={[styles.selectedPatientMeta, { color: colors.mutedForeground }]}>
              {patient.birthDate
                ? `Nascimento: ${formatCivilDate(patient.birthDate)}`
                : 'Data de nascimento não informada'}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Trocar familiar selecionado"
            accessibilityRole="button"
            onPress={onManagePatients}
            style={({ pressed }) => [
              styles.secondaryAction,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed ? styles.pressed : null,
            ]}
            testID="home-manage-patients"
          >
            <Ionicons name="swap-horizontal-outline" size={19} color={colors.primary} />
            <Text style={[styles.secondaryActionText, { color: colors.primary }]}>Trocar</Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.readyCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={[styles.readyIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="checkmark-circle" size={28} color={colors.accentForeground} />
          </View>
          <Text style={[styles.readyTitle, { color: colors.foreground }]}>
            Cadastro concluído
          </Text>
          <Text style={[styles.readyDescription, { color: colors.mutedForeground }]}>
            {patient.name} já está pronto para ser acompanhado.
          </Text>
          <View style={[styles.patientSummary, { borderTopColor: colors.border }]}>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <Text style={[styles.patientSummaryText, { color: colors.foreground }]}>
              {patient.birthDate
                ? `Nascimento: ${formatCivilDate(patient.birthDate)}`
                : 'Data de nascimento não informada'}
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityLabel="Gerenciar familiares"
          accessibilityRole="button"
          onPress={onManagePatients}
          style={({ pressed }) => [
            styles.manageButton,
            { backgroundColor: colors.primary },
            pressed ? styles.pressed : null,
          ]}
          testID="home-patients-button"
        >
          <Ionicons name="people-outline" size={21} color={colors.primaryForeground} />
          <Text style={[styles.manageButtonText, { color: colors.primaryForeground }]}>Gerenciar familiares</Text>
        </Pressable>

        <Pressable
          accessibilityLabel={`Abrir agendamentos de ${patient.name}`}
          accessibilityRole="button"
          onPress={onOpenConsultations}
          style={({ pressed }) => [
            styles.consultationSummaryCard,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed ? styles.pressed : null,
          ]}
          testID="home-consultations-button"
        >
          <View style={[styles.consultationSummaryIcon, { backgroundColor: colors.secondary }]}>
            <Ionicons name="calendar-outline" size={23} color={colors.primary} />
          </View>
          <View style={styles.consultationSummaryCopy}>
            <Text style={[styles.consultationSummaryTitle, { color: colors.foreground }]}>Agendamentos</Text>
            <Text style={[styles.consultationSummaryMeta, { color: colors.mutedForeground }]}>
              {pendingCount === 1 ? '1 agendamento a agendar' : `${pendingCount} agendamentos a agendar`}
              {nextConsultation ? ` · Próximo: ${consultationDateLabel(nextConsultation) ?? 'data a definir'}` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.mutedForeground} />
        </Pressable>

        <View style={[styles.infoCard, { backgroundColor: colors.secondary }]}>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
          <View style={styles.infoCopy}>
            <Text style={[styles.infoTitle, { color: colors.secondaryForeground }]}>
              Dados somente neste aparelho
            </Text>
            <Text style={[styles.infoDescription, { color: colors.mutedForeground }]}>
              Nesta primeira versão, nada é enviado para a Internet. Você pode continuar
              usando o aplicativo mesmo sem conexão.
            </Text>
          </View>
        </View>

        <Text style={[styles.homeFooter, { color: colors.mutedForeground }]}>
          Saúde Familiar · versão Local-Only
        </Text>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function DatabaseErrorScreen({ onRetry }: { onRetry: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.centeredPage,
        { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={[styles.errorPageIcon, { backgroundColor: colors.accent }]}>
        <Ionicons name="refresh-outline" size={32} color={colors.accentForeground} />
      </View>
      <Text style={[styles.errorPageTitle, { color: colors.foreground }]}>
        Não conseguimos abrir o app
      </Text>
      <Text style={[styles.errorPageText, { color: colors.mutedForeground }]}>
        Seus dados não foram alterados. Tente abrir novamente.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [
          styles.retryButton,
          { backgroundColor: colors.primary },
          pressed ? styles.pressed : null,
        ]}
        testID="database-retry"
      >
        <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Tentar novamente</Text>
      </Pressable>
    </View>
  );
}

export default function IndexScreen() {
  const {
    status,
    caregiver,
    patients,
    patient,
    createCaregiver,
    createPatient,
    selectPatient,
    updatePatient,
    deletePatient,
    getPatientRemovalSummary,
    consultations,
    reminders,
    createConsultation,
    updateConsultation,
    deleteConsultation,
    retry,
  } = useLocalData();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [patientView, setPatientView] = useState<PatientView>('home');
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [consultationView, setConsultationView] = useState<ConsultationView>('none');
  const [editingConsultation, setEditingConsultation] = useState<Consultation | null>(null);

  async function handlePatientSaved(input: CreatePatientInput) {
    if (editingPatient) {
      await updatePatient(editingPatient.id, input);
      setEditingPatient(null);
    } else {
      const { warning } = await createPatient(input);
      if (warning) {
        await showUserAlert('Atenção', warning);
      }
    }
    setPatientView('home');
  }

  async function handleConsultationSaved(input: ConsultationFormInput) {
    const result = editingConsultation
      ? await updateConsultation(editingConsultation.id, input)
      : await createConsultation(input);
    if (editingConsultation) {
      setEditingConsultation(null);
    }
    setConsultationView('list');
    if (result.warning) {
      await showUserAlert('Atenção', result.warning);
    }
  }

  function handleDeleteConsultation(consultation: Consultation) {
    Alert.alert(
      `Excluir ${consultationTypeLabel(consultation.type).toLowerCase()}?`,
      `Os dados de ${consultation.specialty} serão removidos deste aparelho.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            void deleteConsultation(consultation.id)
              .then(() => setConsultationView('list'))
              .catch((error: unknown) => {
                Alert.alert(
                  'Não foi possível excluir',
                  error instanceof Error ? error.message : 'Tente novamente.',
                );
              });
          },
        },
      ],
    );
  }

  async function handleDeletePatient(patientToDelete: Patient) {
    let summary: { consultationCount: number; reminderCount: number };
    try {
      summary = await getPatientRemovalSummary(patientToDelete.id);
    } catch (error) {
      Alert.alert(
        'Não foi possível verificar os dados',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
      return;
    }

    const relatedText = summary.consultationCount > 0
      ? ` Isso também excluirá ${summary.consultationCount} agendamento${summary.consultationCount === 1 ? '' : 's'} e ${summary.reminderCount} lembrete${summary.reminderCount === 1 ? '' : 's'} armazenado${summary.reminderCount === 1 ? '' : 's'} neste aparelho.`
      : '';
    Alert.alert(
      'Excluir familiar?',
      `Os dados de ${patientToDelete.name} serão removidos deste aparelho.${relatedText}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            void deletePatient(patientToDelete.id)
              .then(() => setPatientView('home'))
              .catch((error: unknown) => {
                Alert.alert(
                  'Não foi possível concluir',
                  error instanceof Error ? error.message : 'Tente novamente.',
                );
              });
          },
        },
      ],
    );
  }

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'error') {
    return <DatabaseErrorScreen onRetry={() => void retry()} />;
  }

  if (!caregiver) {
    if (step === 'welcome') {
      return <WelcomeScreen onStart={() => setStep('caregiver-form')} />;
    }

    return (
      <CaregiverForm
        onBack={() => setStep('welcome')}
        onSaved={async (name) => {
          await createCaregiver({ name });
        }}
      />
    );
  }

  if (patientView === 'add' || (patients.length === 0 && !patient)) {
    return (
      <PatientForm
        onBack={patients.length > 0 ? () => setPatientView('list') : undefined}
        onSaved={handlePatientSaved}
        title={patientView === 'add' ? 'Cadastrar familiar' : undefined}
        description={
          patientView === 'add'
            ? 'Informe os dados básicos. Você poderá completar outras informações depois.'
            : undefined
        }
        submitLabel={patientView === 'add' ? 'Salvar familiar' : undefined}
      />
    );
  }

  if (patientView === 'edit' && editingPatient) {
    return (
      <PatientForm
        initialPatient={editingPatient}
        onBack={() => {
          setEditingPatient(null);
          setPatientView('list');
        }}
        onSaved={handlePatientSaved}
        title="Editar familiar"
        description="Atualize os dados básicos deste familiar."
        submitLabel="Salvar alterações"
      />
    );
  }

  if (patientView === 'list' || !patient) {
    return (
      <PatientsScreen
        activePatientId={patient?.id ?? null}
        onAdd={() => {
          setEditingPatient(null);
          setPatientView('add');
        }}
        onBack={() => setPatientView(patient ? 'home' : 'add')}
        onDelete={handleDeletePatient}
        onEdit={(patientToEdit) => {
          setEditingPatient(patientToEdit);
          setPatientView('edit');
        }}
        onSelect={(patientToSelect) => {
          void selectPatient(patientToSelect.id)
            .then(() => setPatientView('home'))
            .catch((error: unknown) => {
              Alert.alert(
                'Não foi possível selecionar',
                error instanceof Error ? error.message : 'Tente novamente.',
              );
            });
        }}
        patients={patients}
      />
    );
  }

  if (consultationView === 'add') {
    return (
      <ConsultationForm
        onBack={() => setConsultationView('list')}
        onSaved={handleConsultationSaved}
        title="Novo agendamento"
        description={`Cadastre uma consulta ou exame para ${patient.name}.`}
        submitLabel="Salvar agendamento"
      />
    );
  }

  if (consultationView === 'edit' && editingConsultation) {
    return (
      <ConsultationForm
        initialConsultation={editingConsultation}
        initialReminders={reminders.filter((reminder) => reminder.consultationId === editingConsultation.id)}
        onBack={() => {
          setEditingConsultation(null);
          setConsultationView('list');
        }}
        onSaved={handleConsultationSaved}
        title="Editar agendamento"
        description={`Atualize os dados deste agendamento de ${patient.name}.`}
        submitLabel="Salvar alterações"
      />
    );
  }

  if (consultationView === 'list') {
    return (
      <ConsultationsScreen
        consultations={consultations}
        reminders={reminders}
        onAdd={() => {
          setEditingConsultation(null);
          setConsultationView('add');
        }}
        onBack={() => setConsultationView('none')}
        onDelete={handleDeleteConsultation}
        onEdit={(consultationToEdit) => {
          setEditingConsultation(consultationToEdit);
          setConsultationView('edit');
        }}
        patient={patient}
      />
    );
  }

  return (
    <HomeScreen
      caregiver={caregiver}
      consultations={consultations}
      onManagePatients={() => setPatientView('list')}
      onOpenConsultations={() => setConsultationView('list')}
      patient={patient}
    />
  );
}

function LoadingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.centeredPage,
        { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
        Preparando seu espaço...
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  centeredPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  welcomeContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48, borderRadius: 14 },
  brandName: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  brandCaption: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 2 },
  welcomeHero: { marginTop: 42 },
  heroIcon: {
    width: 76,
    height: 76,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  eyebrow: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1.3, marginBottom: 12 },
  welcomeTitle: { fontSize: 34, lineHeight: 40, fontFamily: 'Inter_700Bold', maxWidth: 350 },
  welcomeDescription: { fontSize: 17, lineHeight: 25, fontFamily: 'Inter_400Regular', marginTop: 18, maxWidth: 350 },
  promiseList: { gap: 14, marginTop: 32 },
  promiseRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  promiseIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  promiseText: { fontSize: 15, fontFamily: 'Inter_500Medium', flex: 1 },
  welcomeAction: { marginTop: 38 },
  actionHint: { fontSize: 13, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 12 },
  primaryButton: {
    minHeight: 58,
    borderRadius: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  primaryButtonText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.78 },
  formContent: { flexGrow: 1, paddingHorizontal: 24 },
  notesInput: { minHeight: 96, paddingTop: 16 },
  managerHeader: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 24, gap: 12 },
  managerHeaderCopy: { flex: 1 },
  managerTitle: { fontSize: 27, lineHeight: 33, fontFamily: 'Inter_700Bold' },
  managerDescription: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', marginTop: 6 },
  addIconButton: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  patientListView: { flex: 1, marginTop: 16 },
  patientList: { paddingHorizontal: 24, gap: 12 },
  patientCard: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  patientCardContent: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  patientCardIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  patientCardCopy: { flex: 1 },
  patientCardName: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  patientCardMeta: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 3 },
  patientCardNotes: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 3 },
  patientActions: { flexDirection: 'row', borderTopWidth: 1, paddingHorizontal: 12 },
  patientAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 12 },
  patientActionText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  emptyPatients: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 44 },
  emptyPatientsTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginTop: 14, textAlign: 'center' },
  emptyPatientsDescription: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', marginTop: 7, textAlign: 'center' },
  consultationTypeOptions: { flexDirection: 'row', gap: 8 },
  consultationTypeOption: { minHeight: 44, flex: 1, flexDirection: 'row', gap: 7, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  consultationTypeOptionText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  consultationTypeBadge: { alignSelf: 'flex-start', minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8 },
  consultationTypeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  consultationStatusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  consultationStatusOption: { minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  consultationStatusOptionText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  reminderFields: { gap: 8, marginTop: 10 },
  reminderOption: { minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  reminderOptionText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  reminderAlertModeFields: { gap: 8, marginTop: 12 },
  reminderAlertModeOption: { minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  reminderAlertModeRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  reminderAlertModeRadioDot: { width: 10, height: 10, borderRadius: 5 },
  reminderAlertModeCopy: { flex: 1 },
  reminderAlertModeLabel: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  reminderAlertModeDescription: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 2 },
  reminderCustomRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  reminderCustomInput: { minHeight: 50, minWidth: 72, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 16, fontFamily: 'Inter_500Medium' },
  reminderUnitOption: { minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  reminderUnitText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  reminderCustomDateRow: { flexDirection: 'row', gap: 8 },
  reminderDateInput: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, fontSize: 15, fontFamily: 'Inter_500Medium' },
  consultationListContent: { paddingHorizontal: 24 },
  consultationSection: { marginTop: 22, gap: 10 },
  consultationSectionTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  consultationEmptyText: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  consultationCard: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  consultationCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16 },
  consultationCardCopy: { flex: 1 },
  consultationSpecialty: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  consultationMeta: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 4 },
  consultationStatusBadge: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9 },
  consultationStatusText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  consultationDetails: { gap: 7, paddingHorizontal: 16, paddingBottom: 16 },
  consultationDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  consultationDetailText: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_500Medium' },
  consultationNotes: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 2 },
  consultationReminderSummary: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 2 },
  consultationReminderText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' },
  consultationActions: { flexDirection: 'row', borderTopWidth: 1, paddingHorizontal: 10 },
  consultationAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  consultationActionText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  formIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  formTitle: { fontSize: 30, lineHeight: 36, fontFamily: 'Inter_700Bold' },
  formDescription: { fontSize: 16, lineHeight: 24, fontFamily: 'Inter_400Regular', marginTop: 12, maxWidth: 350 },
  formFields: { marginTop: 34, gap: 10 },
  fieldLabel: { fontSize: 14, fontFamily: 'Inter_700Bold', marginTop: 6 },
  input: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  fieldHint: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 2 },
  errorBox: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, marginTop: 20, alignItems: 'flex-start' },
  errorText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: 'Inter_500Medium' },
  formAction: { marginTop: 'auto', paddingTop: 34 },
  privacyNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14 },
  privacyText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  localBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginTop: 22 },
  localBadgeText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  homeContent: { paddingHorizontal: 24 },
  homeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  homeHeaderCopy: { flex: 1, paddingRight: 14 },
  homeEyebrow: { fontSize: 12, letterSpacing: 1.3, fontFamily: 'Inter_700Bold', marginBottom: 8 },
  homeTitle: { fontSize: 30, lineHeight: 36, fontFamily: 'Inter_700Bold' },
  homeSubtitle: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter_400Regular', marginTop: 6 },
  homeAvatar: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  selectedPatientCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 18, marginTop: 18 },
  selectedPatientCopy: { flex: 1 },
  selectedPatientName: { fontSize: 21, fontFamily: 'Inter_700Bold' },
  selectedPatientMeta: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 4 },
  secondaryAction: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 9 },
  secondaryActionText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  manageButton: { minHeight: 54, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 16 },
  manageButtonText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  consultationSummaryCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 20, padding: 14, marginTop: 14 },
  consultationSummaryIcon: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  consultationSummaryCopy: { flex: 1 },
  consultationSummaryTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  consultationSummaryMeta: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 3 },
  readyCard: { borderWidth: 1, borderRadius: 24, padding: 22, marginTop: 18 },
  readyIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  readyTitle: { fontSize: 21, fontFamily: 'Inter_700Bold' },
  readyDescription: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter_400Regular', marginTop: 7 },
  patientSummary: { flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, paddingTop: 16, marginTop: 20 },
  patientSummaryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  infoCard: { flexDirection: 'row', gap: 13, borderRadius: 20, padding: 18, marginTop: 16, alignItems: 'flex-start' },
  infoCopy: { flex: 1 },
  infoTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  infoDescription: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 5 },
  homeFooter: { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 32 },
  errorPageIcon: { width: 70, height: 70, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  errorPageTitle: { fontSize: 22, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  errorPageText: { fontSize: 15, lineHeight: 22, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 10, maxWidth: 300 },
  retryButton: { borderRadius: 16, minHeight: 52, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  retryText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  loadingText: { fontSize: 14, fontFamily: 'Inter_500Medium', marginTop: 14 },
});