/**
 * Device capability detection.
 *
 * Switching on width alone is wrong twice over: a narrow desktop window would
 * lose mouse-and-keyboard chrome, and a large tablet would never get touch
 * controls. So the touch surface keys off POINTER CAPABILITY, and only the
 * cosmetic compaction keys off width.
 */
import { useEffect, useState } from 'react';

function read() {
  if (typeof window === 'undefined') {
    return { touch: false, coarse: false, narrow: false, landscape: true, w: 1280, h: 720 };
  }
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    // Treat as touch-first only when the primary pointer really is coarse.
    // A laptop with a touchscreen keeps its keyboard controls.
    touch: hasTouch && (coarse || noHover),
    coarse,
    narrow: w < 640,
    landscape: w > h,
    w,
    h,
  };
}

export function useDevice() {
  const [state, setState] = useState(read);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setState(read()));
    };
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    const mqC = window.matchMedia('(pointer: coarse)');
    const mqH = window.matchMedia('(hover: none)');
    mqC.addEventListener?.('change', update);
    mqH.addEventListener?.('change', update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      mqC.removeEventListener?.('change', update);
      mqH.removeEventListener?.('change', update);
    };
  }, []);

  return state;
}

export default useDevice;
