// Tiny Zustand-shaped store. Avoids the dependency so the bundle stays
// reproducible without `npm install`. Replace with `zustand` later if we
// want devtools and middleware.

type Listener<T> = (state: T) => void;

export interface Store<T> {
  getState: () => T;
  setState: (partial: Partial<T> | ((state: T) => Partial<T>)) => void;
  subscribe: (listener: Listener<T>) => () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener<T>>();

  const setState: Store<T>['setState'] = (partial) => {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    if (patch === state) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener(state));
  };

  return {
    getState: () => state,
    setState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
