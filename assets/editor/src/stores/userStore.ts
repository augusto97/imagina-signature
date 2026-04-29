import { createStore } from './createStore';
import type { MeResponse } from '@shared/types';

interface UserState {
  me: MeResponse | null;
}

export const userStore = createStore<UserState>({ me: null });

export function setMe(me: MeResponse | null): void {
  userStore.setState({ me });
}
