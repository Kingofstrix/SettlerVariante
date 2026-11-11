// Gemeinsame Helfer für die Tests.
import { anwenden, neuesSpiel, zufallInt, ROHSTOFFE, type Aktion, type GameState, type Rohstoffe, type SpielConfig } from '../src/engine';

export const FARBEN = ['rot', 'blau', 'orange', 'weiss', 'gruen', 'braun'];

export function spiel(n: number, config: Partial<SpielConfig> = {}, seed = 1): GameState {
  return neuesSpiel({
    spieler: Array.from({ length: n }, (_, i) => ({ name: `S${i}`, farbe: FARBEN[i] })),
    seed,
    config,
    ohneMischen: true,
  });
}

/** Wendet eine Aktion an und wirft bei Ablehnung. */
export function ok(s: GameState, a: Aktion): GameState {
  const e = anwenden(s, a);
  if (!e.ok) throw new Error(`Abgelehnt: ${e.fehler} (${JSON.stringify(a)})`);
  return e.state;
}

export function fehler(s: GameState, a: Aktion): string {
  const e = anwenden(s, a);
  if (e.ok) throw new Error(`Hätte abgelehnt werden müssen: ${JSON.stringify(a)}`);
  return e.fehler;
}

/** Spielt die Gründungsphase mit Standardaktionen durch. */
export function nachSetup(s: GameState): GameState {
  while (s.phase === 'setup') s = ok(s, { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
  return s;
}

/** Gibt einem Spieler Karten aus der Bank (Kartenbilanz bleibt erhalten). */
export function gib(s: GameState, spieler: number, r: Partial<Rohstoffe>): void {
  for (const k of ROHSTOFFE) {
    const n = r[k] ?? 0;
    s.spieler[spieler].hand[k] += n;
    s.bank[k] -= n;
  }
}

/** Nimmt einem Spieler alle Karten zurück in die Bank. */
export function leere(s: GameState, spieler: number): void {
  for (const k of ROHSTOFFE) {
    s.bank[k] += s.spieler[spieler].hand[k];
    s.spieler[spieler].hand[k] = 0;
  }
}

/** Stellt den RNG so ein, dass der nächste Wurf die gewünschte Summe ergibt. */
export function naechsterWurf(s: GameState, summe: number): void {
  for (let r = 1; r < 100000; r++) {
    const t = { rngState: r };
    if (zufallInt(t, 6) + 1 + zufallInt(t, 6) + 1 === summe) {
      s.rngState = r;
      return;
    }
  }
  throw new Error('kein passender RNG-Zustand');
}

/** Einfacher Pfad über "laenge" Kanten ab einer Ecke (ohne Ecken doppelt zu besuchen). */
export function pfad(s: GameState, start: number, laenge: number, tabu: number[] = []): { kanten: number[]; ecken: number[] } {
  const besucht = new Set<number>([start, ...tabu]);
  const kanten: number[] = [];
  const ecken: number[] = [start];
  const suche = (e: number): boolean => {
    if (kanten.length === laenge) return true;
    for (const kid of s.brett.ecken[e].kanten) {
      const k = s.brett.kanten[kid];
      const z = k.a === e ? k.b : k.a;
      if (besucht.has(z)) continue;
      besucht.add(z);
      kanten.push(kid);
      ecken.push(z);
      if (suche(z)) return true;
      besucht.delete(z);
      kanten.pop();
      ecken.pop();
    }
    return false;
  };
  if (!suche(start)) throw new Error('kein Pfad');
  return { kanten, ecken };
}

export function kanteZwischen(s: GameState, a: number, b: number): number {
  return s.brett.kanten.find((k) => (k.a === a && k.b === b) || (k.a === b && k.b === a))!.id;
}

/** Setzt ein Gebäude direkt aufs Brett und hält die Figurenzahlen konsistent. */
export function setze(s: GameState, ecke: number, spieler: number, typ: 'siedlung' | 'stadt'): void {
  const alt = s.gebaeude[ecke];
  if (alt) {
    if (alt.typ === 'siedlung') s.spieler[alt.spieler].siedlungenUebrig++;
    else s.spieler[alt.spieler].staedteUebrig++;
  }
  s.gebaeude[ecke] = { spieler, typ };
  if (typ === 'siedlung') s.spieler[spieler].siedlungenUebrig--;
  else s.spieler[spieler].staedteUebrig--;
}
