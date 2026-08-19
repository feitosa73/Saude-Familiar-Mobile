import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import type { CreatePatientInput, Patient } from '@/domain/patient';
import { SQLitePatientRepository } from '@/storage/SQLitePatientRepository';

type LocalDataStatus = 'loading' | 'ready' | 'error';

type LocalDataContextValue = {
  status: LocalDataStatus;
  patient: Patient | null;
  error: string | null;
  createPatient: (input: CreatePatientInput) => Promise<Patient>;
  retry: () => Promise<void>;
};

const LocalDataContext = createContext<LocalDataContextValue | null>(null);

export function LocalDataProvider({ children }: { children: React.ReactNode }) {
  const database = useSQLiteContext();
  const repository = useMemo(
    () => new SQLitePatientRepository(database),
    [database],
  );
  const [status, setStatus] = useState<LocalDataStatus>('loading');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPatient = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const currentPatient = await repository.getFirst();
      setPatient(currentPatient);
      setStatus('ready');
    } catch {
      setStatus('error');
      setError('Não foi possível abrir os dados deste aparelho.');
    }
  }, [repository]);

  useEffect(() => {
    void loadPatient();
  }, [loadPatient]);

  const createPatient = useCallback(
    async (input: CreatePatientInput) => {
      try {
        const createdPatient = await repository.create(input);
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
    [repository],
  );

  const value = useMemo(
    () => ({
      status,
      patient,
      error,
      createPatient,
      retry: loadPatient,
    }),
    [createPatient, error, loadPatient, patient, status],
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