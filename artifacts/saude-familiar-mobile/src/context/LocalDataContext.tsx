import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import type { Caregiver, CreateCaregiverInput } from '@/domain/caregiver';
import type { CreatePatientInput, Patient } from '@/domain/patient';
import { SQLiteCaregiverRepository } from '@/storage/SQLiteCaregiverRepository';
import { SQLitePatientRepository } from '@/storage/SQLitePatientRepository';

type LocalDataStatus = 'loading' | 'ready' | 'error';

type LocalDataContextValue = {
  status: LocalDataStatus;
  caregiver: Caregiver | null;
  patient: Patient | null;
  error: string | null;
  createCaregiver: (input: CreateCaregiverInput) => Promise<Caregiver>;
  createPatient: (input: CreatePatientInput) => Promise<Patient>;
  retry: () => Promise<void>;
};

const LocalDataContext = createContext<LocalDataContextValue | null>(null);

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
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLocalData = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const [currentCaregiver, currentPatient] = await Promise.all([
        caregiverRepository.getFirst(),
        patientRepository.getFirst(),
      ]);
      setCaregiver(currentCaregiver);
      setPatient(currentPatient);
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
        setPatient(createdPatient);
        setError(null);
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

  const value = useMemo(
    () => ({
      status,
      caregiver,
      patient,
      error,
      createCaregiver,
      createPatient,
      retry: loadLocalData,
    }),
    [caregiver, createCaregiver, createPatient, error, loadLocalData, patient, status],
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