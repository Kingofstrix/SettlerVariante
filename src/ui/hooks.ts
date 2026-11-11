import { useEffect, useState } from 'preact/hooks';
import type { Sitzung, SitzungsZustand, TimerAnzeige } from '../netz/sitzung';

export function useSitzung(s: Sitzung): SitzungsZustand {
  const [, neu] = useState(0);
  useEffect(() => s.abonniere(() => neu((n) => n + 1)), [s]);
  return s.zustand;
}

/** Restzeit in Sekunden (aufgerundet); zählt lokal nur zur Anzeige herunter – maßgeblich ist der Host. */
export function useRestzeit(timer: TimerAnzeige | null): number | null {
  const [, neu] = useState(0);
  useEffect(() => {
    if (!timer || timer.endetUm === null) return;
    const i = setInterval(() => neu((n) => n + 1), 250);
    return () => clearInterval(i);
  }, [timer?.endetUm]);
  if (!timer) return null;
  const ms = timer.endetUm === null ? timer.restMs : Math.max(0, timer.endetUm - Date.now());
  return Math.ceil(ms / 1000);
}

// ---------- Toasts ----------

export interface Toast {
  id: number;
  text: string;
  art: 'info' | 'fehler' | 'dran';
}

let toastNr = 0;
let toasts: Toast[] = [];
const hoerer = new Set<() => void>();

export function toast(text: string, art: Toast['art'] = 'info'): void {
  const t = { id: ++toastNr, text, art };
  toasts = [...toasts.slice(-3), t];
  hoerer.forEach((h) => h());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    hoerer.forEach((h) => h());
  }, art === 'fehler' ? 4500 : 3500);
}

export function useToasts(): Toast[] {
  const [, neu] = useState(0);
  useEffect(() => {
    const h = (): void => neu((n) => n + 1);
    hoerer.add(h);
    return () => void hoerer.delete(h);
  }, []);
  return toasts;
}
