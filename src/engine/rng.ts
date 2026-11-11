// Seeded RNG (mulberry32). Der Zustand ist eine einzelne 32-Bit-Zahl und liegt im GameState.

export interface RngTraeger {
  rngState: number;
}

/** Liefert eine Zahl in [0, 1) und schaltet den Zustand weiter. */
export function zufall(s: RngTraeger): number {
  s.rngState = (s.rngState + 0x6d2b79f5) | 0;
  let t = s.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Ganzzahl in [0, n). */
export function zufallInt(s: RngTraeger, n: number): number {
  return Math.floor(zufall(s) * n);
}

export function mischen<T>(s: RngTraeger, liste: readonly T[]): T[] {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = zufallInt(s, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function waehle<T>(s: RngTraeger, liste: readonly T[]): T {
  return liste[zufallInt(s, liste.length)];
}
