import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSQLiteContext } from 'expo-sqlite';
import type { Caregiver, CreateCaregiverInput } from '@/domain/caregiver';
import type {
  Consultation,
  CreateConsultationInput,
  UpdateConsultationInput,
} from '@/domain/consultation';
import type { Reminder } from '@/domain/reminder';
import type { CreatePatientInput, Patient } from '@/domain/patient';
import { SQLiteCaregiverRepository } from '@/storage/SQLiteCaregiverRepository';
import { SQLitePatientRepository } from '@/storage/SQLitePatientRepository';
import { SQLiteConsultationRepository } from '@/storage/SQLiteConsultationRepository';
import { SQLiteReminderRepository } from '@/storage/SQLiteReminderRepository';
import {
  cancelReminderNotifications,
  syncConsultationReminders,
} from '@/services/reminderCoordinator';
import type { ReminderSelection } from '@/utils/reminderPlanning';

type LocalDataStatus = 'loading' | 'ready' | 'error';

type PatientCreateResult = {
  patient: Patient;
  warning: string | null;
};

type ConsultationSaveInput = Omit<CreateConsultationInput, 'patientId'> & {
  reminderSelection: ReminderSelection;
};

type ConsultationSaveResult = {
  consultation: Consultation;
  warning: string | null;
};

type PatientRemovalSummary = {
  consultationCount: number;
  reminderCount: number;
};

type LocalDataContextValue = {
  status: LocalDataStatus;
  caregiver: Caregiver | null;
  patients: Patient[];
  patient: Patient | null;
  error: string | null;
  createCaregiver: (input: CreateCaregiverInput) => Promise<Caregiver>;
  createPatient: (input: CreatePatientInput) => Promise<PatientCreateResult>;
  selectPatient: (id: string) => Promise<void>;
  updatePatient: (id: string, input: CreatePatientInput) => Promise<Patient>;
  deletePatient: (id: string) => Promise<void>;
  getPatientRemovalSummary: (id: string) => Promise<PatientRemovalSummary>;
  consultations: Consultation[];
  reminders: Reminder[];
  createConsultation: (input: ConsultationSaveInput) => Promise<ConsultationSaveResult>;
  updateConsultation: (id: string, input: ConsultationSaveInput) => Promise<ConsultationSaveResult>;
  deleteConsultation: (id: string) => Promise<void>;
  retry: () => Promise<void>;
};

const LocalDataContext = createContext<LocalDataContextValue | null>(null);
const ACTIVE_PATIENT_STORAGE_KEY = 'saude-familiar.active-patient-id';

async function persistActivePatientId(id: string | null): Promise<boolean> {
  try {
    if (id) {
      await AsyncStorage.setItem(ACTIVE_PATIENT_STORAGE_KEY, id);
    } else {
      await AsyncStorage.removeItem(ACTIVE_PATIENT_STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

async function listRemindersForConsultations(
  reminderRepository: SQLiteReminderRepository,
  consultations: Consultation[],
): Promise<Reminder[]> {
  const groupedReminders = await Promise.all(
    consultations.map((consultation) => reminderRepository.listByConsultation(consultation.id)),
  );
  return groupedReminders.flat();
}

export function LocalDataProvider({ children }: { children: React.ReactNode }) {
  const database = useSQLiteContext();
  const caregiverRepository = useMemo(
    () => new SQLiteCaregiverRepository(database),
    [database],
  );
  const patientRepository = useMemo(
    () => new SQLitePatientRepository(database),
    [database],
  );
  const consultationRepository = useMemo(
    () => new SQLiteConsultationRepository(database),
    [database],
  );
  const reminderRepository = useMemo(
    () => new SQLiteReminderRepository(database),
    [database],
  );
  const [status, setStatus] = useState<LocalDataStatus>('loading');
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadLocalData = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const [currentCaregiver, currentPatients] = await Promise.all([
        caregiverRepository.getFirst(),
        patientRepository.list(),
      ]);
      let storedPatientId: string | null = null;
      try {
        storedPatientId = await AsyncStorage.getItem(ACTIVE_PATIENT_STORAGE_KEY);
      } catch {
        storedPatientId = null;
      }
      const activePatient =
        currentPatients.find((item) => item.id === storedPatientId) ??
        currentPatients[0] ??
        null;
      const currentConsultations = activePatient
        ? await consultationRepository.listByPatient(activePatient.id)
        : [];
      const currentReminders = await listRemindersForConsultations(
        reminderRepository,
        currentConsultations,
      );
      setCaregiver(currentCaregiver);
      setPatients(currentPatients);
      setPatient(activePatient);
      setConsultations(currentConsultations);
      setReminders(currentReminders);
      setStatus('ready');
    } catch {
      setStatus('error');
      setError('Não foi possível abrir os dados deste aparelho.');
    }
  }, [caregiverRepository, consultationRepository, patientRepository, reminderRepository]);

  useEffect(() => {
    void loadLocalData();
  }, [loadLocalData]);

  const createCaregiver = useCallback(
    async (input: CreateCaregiverInput) => {
      try {
        const createdCaregiver = await caregiverRepository.create(input);
        setCaregiver(createdCaregiver);
        setError(null);
        setStatus('ready');
        return createdCaregiver;
      } catch {
        const message = 'Não foi possível salvar seu perfil. Tente novamente.';
        setError(message);
        throw new Error(message);
      }
    },
    [caregiverRepository],
  );

  const createPatient = useCallback(
    async (input: CreatePatientInput) => {
      try {
        const createdPatient = await patientRepository.create(input);
        setPatients((currentPatients) => [...currentPatients, createdPatient]);
        setPatient(createdPatient);
        setConsultations([]);
        setReminders([]);
        const warning = (await persistActivePatientId(createdPatient.id))
          ? null
          : 'Familiar salvo, mas a seleção não será lembrada ao reabrir o aplicativo.';
        setError(warning);
        setStatus('ready');
        return { patient: createdPatient, warning };
      } catch {
        const message = 'Não foi possível salvar o familiar. Tente novamente.';
        setError(message);
        throw new Error(message);
      }
    },
    [patientRepository],
  );

  const selectPatient = useCallback(
    async (id: string) => {
      const selectedPatient = await patientRepository.getById(id);
      if (!selectedPatient) {
        throw new Error('Familiar não encontrado.');
      }

      const nextConsultations = await consultationRepository.listByPatient(selectedPatient.id);
      const nextReminders = await listRemindersForConsultations(
        reminderRepository,
        nextConsultations,
      );
      const activePatientPersisted = await persistActivePatientId(selectedPatient.id);
      if (!activePatientPersisted) {
        throw new Error('Não foi possível guardar a seleção deste familiar. Tente novamente.');
      }

      setPatient(selectedPatient);
      setConsultations(nextConsultations);
      setReminders(nextReminders);
    },
    [consultationRepository, patientRepository, reminderRepository],
  );

  const updatePatient = useCallback(
    async (id: string, input: CreatePatientInput) => {
      const updatedPatient = await patientRepository.update(id, input);
      setPatients((currentPatients) =>
        currentPatients.map((item) => (item.id === id ? updatedPatient : item)),
      );
      setPatient((currentPatient) =>
        currentPatient?.id === id ? updatedPatient : currentPatient,
      );
      return updatedPatient;
    },
    [patientRepository],
  );

  const getPatientRemovalSummary = useCallback(
    async (id: string): Promise<PatientRemovalSummary> => {
      const relatedConsultations = await consultationRepository.listByPatient(id);
      const relatedReminders = await listRemindersForConsultations(
        reminderRepository,
        relatedConsultations,
      );
      return {
        consultationCount: relatedConsultations.length,
        reminderCount: relatedReminders.length,
      };
    },
    [consultationRepository, reminderRepository],
  );

  const deletePatient = useCallback(
    async (id: string) => {
      const relatedConsultations = await consultationRepository.listByPatient(id);
      const relatedReminders = await listRemindersForConsultations(
        reminderRepository,
        relatedConsultations,
      );
      const cancellationWarning = await cancelReminderNotifications(relatedReminders);
      if (cancellationWarning) {
        throw new Error(cancellationWarning);
      }

      await patientRepository.delete(id);
      const remainingPatients = patients.filter((item) => item.id !== id);
      setPatients(remainingPatients);

      if (patient?.id === id) {
        const nextPatient = remainingPatients[0] ?? null;
        const nextConsultations = nextPatient
          ? await consultationRepository.listByPatient(nextPatient.id)
          : [];
        const nextReminders = await listRemindersForConsultations(
          reminderRepository,
          nextConsultations,
        );
        setPatient(nextPatient);
        setConsultations(nextConsultations);
        setReminders(nextReminders);
        const activePatientPersisted = await persistActivePatientId(nextPatient?.id ?? null);
        if (!activePatientPersisted) {
          throw new Error(
            'Familiar excluído, mas não foi possível guardar o próximo selecionado. Tente novamente.',
          );
        }
      }
    },
    [consultationRepository, patient, patientRepository, patients, reminderRepository],
  );

  const createConsultation = useCallback(
    async (input: ConsultationSaveInput): Promise<ConsultationSaveResult> => {
      const patientId = patient?.id;
      if (!patientId || !patient) {
        throw new Error('Selecione um familiar antes de cadastrar uma consulta.');
      }

      const { reminderSelection, ...consultationInput } = input;
      const createdConsultation = await consultationRepository.create({
        ...consultationInput,
        patientId,
      });
      let reminderResult: { reminders: Reminder[]; warning: string | null };
      try {
        reminderResult = await syncConsultationReminders({
          consultation: createdConsultation,
          patientName: patient.name,
          selection: reminderSelection,
          reminderRepository,
        });
      } catch {
        reminderResult = {
          reminders: [],
          warning: 'Consulta salva, mas não foi possível configurar os lembretes. Tente novamente ao editar.',
        };
      }
      setConsultations((currentConsultations) => [...currentConsultations, createdConsultation]);
      setReminders((currentReminders) => [...currentReminders, ...reminderResult.reminders]);
      return { consultation: createdConsultation, warning: reminderResult.warning };
    },
    [consultationRepository, patient, reminderRepository],
  );

  const updateConsultation = useCallback(
    async (id: string, input: ConsultationSaveInput): Promise<ConsultationSaveResult> => {
      const currentConsultation = consultations.find((item) => item.id === id);
      if (!currentConsultation || currentConsultation.patientId !== patient?.id || !patient) {
        throw new Error('Consulta não encontrada para o familiar selecionado.');
      }

      const { reminderSelection, ...consultationInput } = input;
      const existingReminders = await reminderRepository.listByConsultation(id);
      const cancellationWarning = await cancelReminderNotifications(existingReminders);
      if (cancellationWarning) {
        throw new Error(cancellationWarning);
      }
      const updatedConsultation = await consultationRepository.update(id, consultationInput);
      let reminderResult: { reminders: Reminder[]; warning: string | null };
      try {
        reminderResult = await syncConsultationReminders({
          consultation: updatedConsultation,
          patientName: patient.name,
          selection: reminderSelection,
          reminderRepository,
          existingReminders,
          skipCancellation: true,
        });
      } catch {
        await Promise.all(
          existingReminders.map((reminder) =>
            reminder.notificationId
              ? reminderRepository.update(reminder.id, { notificationId: null }).catch(() => undefined)
              : undefined,
          ),
        );
        reminderResult = {
          reminders: existingReminders.map((reminder) => ({ ...reminder, notificationId: null })),
          warning: 'Consulta atualizada, mas não foi possível atualizar os lembretes. Tente novamente.',
        };
      }
      setConsultations((currentConsultations) =>
        currentConsultations.map((item) => (item.id === id ? updatedConsultation : item)),
      );
      setReminders((currentReminders) => [
        ...currentReminders.filter((item) => item.consultationId !== id),
        ...reminderResult.reminders,
      ]);
      return { consultation: updatedConsultation, warning: reminderResult.warning };
    },
    [consultationRepository, consultations, patient, reminderRepository],
  );

  const deleteConsultation = useCallback(
    async (id: string) => {
      const currentConsultation = consultations.find((item) => item.id === id);
      if (!currentConsultation || currentConsultation.patientId !== patient?.id) {
        throw new Error('Consulta não encontrada para o familiar selecionado.');
      }

      const relatedReminders = await reminderRepository.listByConsultation(id);
      const cancellationWarning = await cancelReminderNotifications(relatedReminders);
      if (cancellationWarning) {
        throw new Error(cancellationWarning);
      }
      await consultationRepository.delete(id);
      setConsultations((currentConsultations) =>
        currentConsultations.filter((item) => item.id !== id),
      );
      setReminders((currentReminders) =>
        currentReminders.filter((item) => item.consultationId !== id),
      );
    },
    [consultationRepository, consultations, patient?.id, reminderRepository],
  );

  const value = useMemo(
    () => ({
      status,
      caregiver,
      patients,
      patient,
      error,
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
      retry: loadLocalData,
    }),
    [
      caregiver,
      createCaregiver,
      createPatient,
      deletePatient,
      consultations,
      createConsultation,
      updateConsultation,
      deleteConsultation,
      error,
      getPatientRemovalSummary,
      loadLocalData,
      patient,
      patients,
      reminders,
      selectPatient,
      status,
      updatePatient,
    ],
  );

  return (
    <LocalDataContext.Provider value={value}>
      {children}
    </LocalDataContext.Provider>
  );
}

export function useLocalData(): LocalDataContextValue {
  const context = useContext(LocalDataContext);

  if (!context) {
    throw new Error('useLocalData deve ser usado dentro de LocalDataProvider.');
  }

  return context;
}
