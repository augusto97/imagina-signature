import { create } from './createStore';
import type { MeResponse } from '@shared/types';

interface UserState {
  me: MeResponse | null;
  setMe: (me: MeResponse | null) => void;
}

export const useUserStore = create<UserState>((set) => ({
  me: null,
  setMe: (me) => set({ me }),
}));
