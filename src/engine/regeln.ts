// Reine Regel-Hilfsfunktionen. Arbeiten auf einer Teilmenge des Zustands,
// damit sie sowohl mit dem vollen GameState (Host) als auch mit der gefilterten Sicht (Client) funktionieren.
import type { Brett, Gebaeude, Rohstoff, Rohstoffe, SpielConfig } from './typen';
import { ROHSTOFFE } from './typen';

export interface Basis {
  brett: Brett;
  gebaeude: Record<number, Gebaeude>;
  strassen: Record<number, number>;
  raeuber: number;
  config: SpielConfig;
  laengsteStrasse: number | null;
  groessteMacht: number | null;
  spieler: { id: number; siedlungenUebrig: number; staedteUebrig: number; strassenUebrig: number }[];
}

export function kannZahlen(hand: Rohstoffe, kosten: Partial<Rohstoffe>): boolean {
  return ROHSTOFFE.every((r) => hand[r] >= (kosten[r] ?? 0));
}

/** Abstandsregel: Ecke frei und keine Nachbarecke bebaut. */
export function eckeFrei(s: Basis, ecke: number): boolean {
  if (s.gebaeude[ecke]) return false;
  return s.brett.ecken[ecke].nachbarn.every((n) => !s.gebaeude[n]);
}

function hatStrasseAn(s: Basis, spieler: number, ecke: number): boolean {
  return s.brett.ecken[ecke].kanten.some((k) => s.strassen[k] === spieler);
}

/** Ecken, auf denen der Spieler jetzt eine Siedlung bauen dürfte (ohne Kostenprüfung). */
export function gueltigeSiedlungsEcken(s: Basis, spieler: number, setup: boolean): number[] {
  if (s.spieler[spieler].siedlungenUebrig <= 0) return [];
  return s.brett.ecken
    .filter((e) => eckeFrei(s, e.id) && (setup || hatStrasseAn(s, spieler, e.id)))
    .map((e) => e.id);
}

/** Eine Straße darf an einer Ecke anschließen, wenn dort ein eigenes Gebäude steht
 *  oder eine eigene Straße ankommt und kein fremdes Gebäude die Ecke blockiert. */
function eckeVerbindet(s: Basis, spieler: number, ecke: number): boolean {
  const g = s.gebaeude[ecke];
  if (g) return g.spieler === spieler;
  return hatStrasseAn(s, spieler, ecke);
}

/** Kanten, auf denen der Spieler jetzt eine Straße bauen dürfte.
 *  setupEcke: in der Gründungsphase muss die Straße an die eben gesetzte Siedlung grenzen. */
export function gueltigeStrassenKanten(s: Basis, spieler: number, setupEcke: number | null = null): number[] {
  if (s.spieler[spieler].strassenUebrig <= 0) return [];
  return s.brett.kanten
    .filter((k) => {
      if (s.strassen[k.id] !== undefined) return false;
      if (setupEcke !== null) return k.a === setupEcke || k.b === setupEcke;
      return eckeVerbindet(s, spieler, k.a) || eckeVerbindet(s, spieler, k.b);
    })
    .map((k) => k.id);
}

export function gueltigeStadtEcken(s: Basis, spieler: number): number[] {
  if (s.spieler[spieler].staedteUebrig <= 0) return [];
  return Object.entries(s.gebaeude)
    .filter(([, g]) => g.spieler === spieler && g.typ === 'siedlung')
    .map(([e]) => Number(e));
}

/** Längste zusammenhängende Handelsstraße eines Spielers (Tiefensuche über Kanten).
 *  Verzweigungen und Schleifen werden korrekt behandelt; fremde Gebäude unterbrechen die Straße. */
export function strassenLaenge(s: Basis, spieler: number): number {
  const eigene = s.brett.kanten.filter((k) => s.strassen[k.id] === spieler);
  if (eigene.length === 0) return 0;
  const benutzt = new Set<number>();
  let beste = 0;

  const suche = (ecke: number, laenge: number): void => {
    if (laenge > beste) beste = laenge;
    // Durch eine fremde Siedlung/Stadt geht es nicht weiter.
    const g = s.gebaeude[ecke];
    if (g && g.spieler !== spieler) return;
    for (const kid of s.brett.ecken[ecke].kanten) {
      if (s.strassen[kid] !== spieler || benutzt.has(kid)) continue;
      const k = s.brett.kanten[kid];
      benutzt.add(kid);
      suche(k.a === ecke ? k.b : k.a, laenge + 1);
      benutzt.delete(kid);
    }
  };

  for (const k of eigene) {
    benutzt.add(k.id);
    suche(k.a, 1);
    suche(k.b, 1);
    benutzt.delete(k.id);
  }
  return beste;
}

/** Öffentliche Siegpunkte (ohne verdeckte Siegpunktkarten). */
export function oeffentlichePunkte(s: Basis, spieler: number): number {
  let p = 0;
  for (const g of Object.values(s.gebaeude)) if (g.spieler === spieler) p += g.typ === 'stadt' ? 2 : 1;
  if (s.laengsteStrasse === spieler) p += 2;
  if (s.groessteMacht === spieler) p += 2;
  return p;
}

/** Bestes Tauschverhältnis mit der Bank für einen Rohstoff (4, 3 oder 2). */
export function tauschVerhaeltnis(s: Basis, spieler: number, rohstoff: Rohstoff): number {
  let v = 4;
  for (const [e, g] of Object.entries(s.gebaeude)) {
    if (g.spieler !== spieler) continue;
    const hafen = s.brett.ecken[Number(e)].hafen;
    if (hafen === rohstoff) return 2;
    if (hafen === 'alle') v = 3;
  }
  return v;
}

/** Felder, auf die der Räuber gesetzt werden darf (nie das aktuelle Feld). */
export function gueltigeRaeuberHexes(s: Basis, spieler: number): number[] {
  const alle = s.brett.hexes.filter((h) => h.id !== s.raeuber).map((h) => h.id);
  if (!s.config.freundlicherRaeuber) return alle;
  // Freundlicher Räuber: Felder mit Gebäuden von Spielern mit höchstens 2 Siegpunkten sind tabu.
  const erlaubt = alle.filter((id) =>
    s.brett.hexes[id].ecken.every((e) => {
      const g = s.gebaeude[e];
      return !g || g.spieler === spieler || oeffentlichePunkte(s, g.spieler) > 2;
    }),
  );
  return erlaubt.length > 0 ? erlaubt : alle;
}

/** Gegner mit Gebäude am Feld (Kandidaten zum Bestehlen, ohne Prüfung der Kartenzahl). */
export function anliegerGegner(s: Basis, spieler: number, hex: number): number[] {
  const menge = new Set<number>();
  for (const e of s.brett.hexes[hex].ecken) {
    const g = s.gebaeude[e];
    if (g && g.spieler !== spieler) menge.add(g.spieler);
  }
  return [...menge].sort((a, b) => a - b);
}
