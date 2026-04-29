// Preact-compatible Zustand wrapper.
//
// Zustand's React entrypoint pulls in `use-sync-external-store/shim/
// with-selector`, which is incompatible with Preact 10's hook scheduling
// (`Cannot read properties of null (reading '__H')`). CLAUDE.md §1.2
// pins Zustand 4 as the state library, so we keep the runtime store
// (`zustand/vanilla`) and re-implement just the React selector hook on
// top of Preact's own `useState` / `useEffect`. This is a small, well-
// understood subscription pattern.
//
// Public surface mirrors Zustand's `create()` so call-sites don't change.

import { createStore as createVanillaStore, type StoreApi } from 'zustand/vanilla';
import { useEffect, useState } from 'preact/hooks';

export type StateCreator<T> = (
  set: StoreApi<T>['setState'],
  get: StoreApi<T>['getState'],
  api: StoreApi<T>,
) => T;

export interface UseBoundStore<T> {
  (): T;
  <U>(selector: (state: T) => U): U;
  getState: StoreApi<T>['getState'];
  setState: StoreApi<T>['setState'];
  subscribe: StoreApi<T>['subscribe'];
}

const identity = <T>(state: T): T => state;
const isEqual = <T>(a: T, b: T): boolean => Object.is(a, b);

export function create<T>(initializer: StateCreator<T>): UseBoundStore<T> {
  const store = createVanillaStore<T>(initializer as never);

  function useBoundStore<U>(selector: (state: T) => U = identity as never): U {
    const [value, setValue] = useState<U>(() => selector(store.getState()));

    useEffect(() => {
      // Initial read may be stale by the time the effect attaches; re-pull.
      const current = selector(store.getState());
      if (! isEqual(current, value)) {
        setValue(current);
      }
      return store.subscribe((state) => {
        const next = selector(state);
        setValue((prev) => (isEqual(prev, next) ? prev : next));
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return value;
  }

  const bound = useBoundStore as UseBoundStore<T>;
  bound.getState = store.getState;
  bound.setState = store.setState;
  bound.subscribe = store.subscribe;
  return bound;
}
