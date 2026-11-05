import { useEffect, useState } from 'react';
import { probeImageSize, type NaturalSize } from '@/services/imageDecode';

export interface NaturalSizeState {
  /** Intrinsic size of `src`, null while unknown / failed. */
  size: NaturalSize | null;
  /** The `src` that `size` belongs to. */
  src: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
}

/**
 * Intrinsic pixel size of the image at `src`, for the panels'
 * resolution hint and aspect lock. `known` (dimensions recorded in the
 * block at upload time) short-circuits the network probe. Debounced so
 * typing a URL does not fire a request per keystroke.
 */
export function useNaturalSize(src: string, known?: NaturalSize | null): NaturalSizeState {
  const knownW = known?.width ?? 0;
  const knownH = known?.height ?? 0;
  const [state, setState] = useState<NaturalSizeState>({ size: null, src: '', status: 'idle' });

  useEffect(() => {
    if (!src || !/^(?:https?:|blob:|data:image\/)/i.test(src)) {
      setState({ size: null, src, status: 'idle' });
      return undefined;
    }
    if (knownW > 0 && knownH > 0) {
      setState({ size: { width: knownW, height: knownH }, src, status: 'ready' });
      return undefined;
    }
    let cancelled = false;
    setState((prev) => (prev.src === src ? prev : { size: null, src, status: 'loading' }));
    const timer = window.setTimeout(() => {
      void probeImageSize(src).then((size) => {
        if (cancelled) return;
        setState({ size, src, status: size ? 'ready' : 'error' });
      });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [src, knownW, knownH]);

  return state.src === src ? state : { size: null, src, status: 'loading' };
}
