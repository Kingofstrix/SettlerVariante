// Rangliste der Feigen Sippe: Ergebnisse abgeschlossener Online-Partien.
// Kein Server: Jedes Gerät speichert die Liste selbst. Beim Verbinden tauschen Host und Clients ihre
// Listen aus und führen sie über die Partie-ID ohne Doppelte zusammen. Spieler werden am Namen erkannt.
import { gesamtPunkte, titel, type GameState } from '../engine';
import { lese, schreibe } from './speicher';

export const GRUPPE = 'Feige Sippe';

export interface Partie {
  id: string;
  datum: number;
  spieler: { name: string; punkte: number; titel: string[] }[];
  sieger: string;
}

const MAX = 500;

function istPartie(x: unknown): x is Partie {
  if (typeof x !== 'object' || x === null) return false;
  const p = x as Partial<Partie>;
  return (
    typeof p.id === 'string' &&
    p.id.length <= 80 &&
    typeof p.datum === 'number' &&
    typeof p.sieger === 'string' &&
    Array.isArray(p.spieler) &&
    p.spieler.length >= 3 &&
    p.spieler.length <= 6 &&
    p.spieler.every(
      (s) =>
        typeof s === 'object' &&
        s !== null &&
        typeof s.name === 'string' &&
        s.name.length <= 40 &&
        typeof s.punkte === 'number' &&
        Array.isArray(s.titel) &&
        s.titel.every((t) => typeof t === 'string'),
    )
  );
}

export function pruefePartien(x: unknown): Partie[] {
  return Array.isArray(x) ? x.filter(istPartie).slice(-MAX) : [];
}

let liste = pruefePartien(lese('rangliste'));
const abos = new Set<() => void>();

export function partien(): Partie[] {
  return liste;
}

export function abonniereRangliste(cb: () => void): () => void {
  abos.add(cb);
  return () => abos.delete(cb);
}

/** Übernimmt Partien, die noch fehlen. true, wenn sich die Liste geändert hat. */
export function uebernimm(neue: unknown): boolean {
  const ids = new Set(liste.map((p) => p.id));
  const dazu = pruefePartien(neue).filter((p) => !ids.has(p.id) && !!ids.add(p.id));
  if (dazu.length === 0) return false;
  liste = [...liste, ...dazu].sort((a, b) => a.datum - b.datum).slice(-MAX);
  schreibe('rangliste', liste);
  for (const cb of [...abos]) cb();
  return true;
}

/** Ergebnis einer beendeten Partie. */
export function partieAus(s: GameState, raumCode: string): Partie {
  const t = titel(s.statistik);
  return {
    id: `${raumCode}-${s.seed}`,
    datum: Date.now(),
    spieler: s.spieler.map((p) => ({ name: p.name, punkte: gesamtPunkte(s, p.id), titel: t[p.id] })),
    sieger: s.spieler[s.gewinner!].name,
  };
}

export interface Zeile {
  name: string;
  spiele: number;
  siege: number;
  schnitt: number;
  titel: Record<string, number>;
}

/** Tabelle je Spieler (Name ohne Groß-/Kleinschreibung), sortiert nach Siegen, Quote, Schnitt. */
export function tabelle(ps: Partie[]): Zeile[] {
  const m = new Map<string, Zeile & { summe: number }>();
  for (const p of ps)
    for (const sp of p.spieler) {
      const k = sp.name.trim().toLowerCase();
      const z = m.get(k) ?? { name: sp.name, spiele: 0, siege: 0, schnitt: 0, summe: 0, titel: {} };
      z.name = sp.name; // jüngste Schreibweise
      z.spiele++;
      z.summe += sp.punkte;
      if (p.sieger.trim().toLowerCase() === k) z.siege++;
      for (const t of sp.titel) z.titel[t] = (z.titel[t] ?? 0) + 1;
      m.set(k, z);
    }
  return [...m.values()]
    .map(({ summe, ...z }) => ({ ...z, schnitt: summe / z.spiele }))
    .sort((a, b) => b.siege - a.siege || b.siege / b.spiele - a.siege / a.spiele || b.schnitt - a.schnitt);
}
