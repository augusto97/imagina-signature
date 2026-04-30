import { create } from 'zustand';

/** Preview device — controls the canvas width override for preview only. */
export type Device = 'desktop' | 'mobile';

interface DeviceState {
  device: Device;
  setDevice: (device: Device) => void;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  device: 'desktop',
  setDevice: (device) => set({ device }),
}));
