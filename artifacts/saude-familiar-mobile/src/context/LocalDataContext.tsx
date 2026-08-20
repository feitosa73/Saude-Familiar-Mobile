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
import type { CreatePatientInput, Patient } from '@/domain/patient';
import { SQLiteCaregiverRepository } from '@/storage/SQLiteCaregiverRepository';
import { SQLitePatientRepository } from '@/storage/SQLitePatientRepository';
import { SQLiteConsultationRepository } from '@/storage/SQLiteConsultationRepository';

type LocalDataStatus = 'loading' | 'ready' | 'error';

type PatientCreateResult = {
  patient: Patient;
  warning: string | null;
};

type CreateConsultationData = Omit<CreateConsultationInput, 'patientId'>;

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
  consultations: Consultation[];
  createConsultation: (input: CreateConsultationData) => Promise<Consultation>;
  updateConsultation: (id: string, input: UpdateConsultationInput) => Promise<Consultation>;
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
  const [status, setStatus] = useState<LocalDataStatus>('loading');
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
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
      setCaregiver(currentCaregiver);
      setPatients(currentPatients);
      setPatient(activePatient);
      setConsultations(currentConsultations);
      setStatus('ready');
    } catch {
      setStatus('error');
      setError('Não foi possível abrir os dados deste aparelho.');
    }
  }, [caregiverRepository, consultationRepository, patientRepository]);

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
      const activePatientPersisted = await persistActivePatientId(selectedPatient.id);
      if (!activePatientPersisted) {
        throw new Error('Não foi possível guardar a seleção deste familiar. Tente novamente.');
      }

      setPatient(selectedPatient);
      setConsultations(nextConsultations);
    },
    [consultationRepository, patientRepository],
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

  const deletePatient = useCallback(
    async (id: string) => {
      await patientRepository.delete(id);
      const remainingPatients = patients.filter((item) => item.id !== id);
      setPatients(remainingPatients);

      if (patient?.id === id) {
        const nextPatient = remainingPatients[0] ?? null;
        const nextConsultations = nextPatient
          ? await consultationRepository.listByPatient(nextPatient.id)
          : [];
        setPatient(nextPatient);
        setConsultations(nextConsultations);
        const activePatientPersisted = await persistActivePatientId(nextPatient?.id ?? null);
        if (!activePatientPersisted) {
          throw new Error(
            'Familiar excluído, mas não foi possível guardar o próximo selecionado. Tente novamente.',
          );
        }
      }
    },
    [consultationRepository, patient, patientRepository, patients],
  );

  const createConsultation = useCallback(
    async (input: CreateConsultationData) => {
      const patientId = patient?.id;
      if (!patientId) {
        throw new Error('Selecione um familiar antes de cadastrar uma consulta.');
      }

      const createdConsultation = await consultationRepository.create({
        ...input,
        patientId,
      });
      setConsultations((currentConsultations) => [...currentConsultations, createdConsultation]);
      return createdConsultation;
    },
    [consultationRepository, patient?.id],
  );

  const updateConsultation = useCallback(
    async (id: string, input: UpdateConsultationInput) => {
      const currentConsultation = consultations.find((item) => item.id === id);
      if (!currentConsultation || currentConsultation.patientId !== patient?.id) {
        throw new Error('Consulta não encontrada para o familiar selecionado.');
      }

      const updatedConsultation = await consultationRepository.update(id, input);
      setConsultations((currentConsultations) =>
        currentConsultations.map((item) => (item.id === id ? updatedConsultation : item)),
      );
      return updatedConsultation;
    },
    [consultationRepository, consultations, patient?.id],
  );

  const deleteConsultation = useCallback(
    async (id: string) => {
      const currentConsultation = consultations.find((item) => item.id === id);
      if (!currentConsultation || currentConsultation.patientId !== patient?.id) {
        throw new Error('Consulta não encontrada para o familiar selecionado.');
      }

      await consultationRepository.delete(id);
      setConsultations((currentConsultations) =>
        currentConsultations.filter((item) => item.id !== id),
      );
    },
    [consultationRepository, consultations, patient?.id],
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
      consultations,
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
      loadLocalData,
      patient,
      patients,
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