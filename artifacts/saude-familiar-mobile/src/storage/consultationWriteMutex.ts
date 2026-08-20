let pendingWrite: Promise<void> = Promise.resolve();

export async function withConsultationWriteLock<T>(task: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const nextWrite = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previousWrite = pendingWrite;
  pendingWrite = nextWrite;

  await previousWrite;
  try {
    return await task();
  } finally {
    release();
  }
}
