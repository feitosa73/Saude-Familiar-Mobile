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
import type { CreatePatientInput, Patient } from '@/domain/patient';
import { SQLiteCaregiverRepository } from '@/storage/SQLiteCaregiverRepository';
import { SQLitePatientRepository } from '@/storage/SQLitePatientRepository';

type LocalDataStatus = 'loading' | 'ready' | 'error';

type LocalDataContextValue = {
  status: LocalDataStatus;
  caregiver: Caregiver | null;
  patients: Patient[];
  patient: Patient | null;
  error: string | null;
  createCaregiver: (input: CreateCaregiverInput) => Promise<Caregiver>;
  createPatient: (input: CreatePatientInput) => Promise<Patient>;
  selectPatient: (id: string) => Promise<void>;
  updatePatient: (id: string, input: CreatePatientInput) => Promise<Patient>;
  deletePatient: (id: string) => Promise<void>;
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
  const [status, setStatus] = useState<LocalDataStatus>('loading');
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
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
      setCaregiver(currentCaregiver);
      setPatients(currentPatients);
      setPatient(activePatient);
      setStatus('ready');
    } catch {
      setStatus('error');
      setError('Não foi possível abrir os dados deste aparelho.');
    }
  }, [caregiverRepository, patientRepository]);

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
        const activePatientPersisted = await persistActivePatientId(createdPatient.id);
        setError(
          activePatientPersisted
            ? null
            : 'Familiar salvo, mas a seleção não será lembrada ao reabrir o aplicativo.',
        );
        setStatus('ready');
        return createdPatient;
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

      const activePatientPersisted = await persistActivePatientId(selectedPatient.id);
      if (!activePatientPersisted) {
        throw new Error('Não foi possível guardar a seleção deste familiar. Tente novamente.');
      }

      setPatient(selectedPatient);
    },
    [patientRepository],
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
        setPatient(nextPatient);
        const activePatientPersisted = await persistActivePatientId(nextPatient?.id ?? null);
        if (!activePatientPersisted) {
          throw new Error(
            'Familiar excluído, mas não foi possível guardar o próximo selecionado. Tente novamente.',
          );
        }
      }
    },
    [patient, patientRepository, patients],
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
      retry: loadLocalData,
    }),
    [
      caregiver,
      createCaregiver,
      createPatient,
      deletePatient,
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