export function createKeyedMutationSerializer() {
  const chains = new Map<string, Promise<unknown>>();

  return function serialize<T>(key: string, mutation: () => Promise<T>): Promise<T> {
    const previous = chains.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(mutation);
    chains.set(key, current);

    current.then(
      () => {
        if (chains.get(key) === current) chains.delete(key);
      },
      () => {
        if (chains.get(key) === current) chains.delete(key);
      },
    );

    return current;
  };
}

export function createKeyedInFlightCoalescer<T>() {
  const inFlight = new Map<string, Promise<T>>();

  return function coalesce(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key);
    if (existing) return existing;

    const current = operation();
    inFlight.set(key, current);
    current.then(
      () => {
        if (inFlight.get(key) === current) inFlight.delete(key);
      },
      () => {
        if (inFlight.get(key) === current) inFlight.delete(key);
      },
    );

    return current;
  };
}
