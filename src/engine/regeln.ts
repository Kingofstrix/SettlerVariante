// Reine Regel-Hilfsfunktionen. Arbeiten auf einer Teilmenge des Zustands,
// damit sie sowohl mit dem vollen GameState (Host) als auch mit der gefilterten Sicht (Client) funktionieren.
import { istLand, kantenFelder } from './brett';
import type { Brett, Gebaeude, Rohstoff, Rohstoffe, SpielConfig } from './typen';
import { INSEL_BONUS, ROHSTOFFE } from './typen';

export interface Basis {
  brett: Brett;
  gebaeude: Record<number, Gebaeude>;
  strassen: Record<number, number>;
  /** Seefahrer; fehlt in alten Spielständen. */
  schiffe?: Record<number, number>;
  raeuber: number;
  pirat?: number | null;
  config: SpielConfig;
  laengsteStrasse: number | null;
  groessteMacht: number | null;
  spieler: {
    id: number;
    siedlungenUebrig: number;
    staedteUebrig: number;
    strassenUebrig: number;
    schiffeUebrig?: number;
    inselBonus?: number[];
  }[];
}

const KEINE: Record<number, number> = {};

/** Liegt an der Kante mindestens ein Landfeld? (Nur dort dürfen Straßen hin.) */
export function landKante(brett: Brett, kante: number): boolean {
  return kantenFelder(brett, kante).some((h) => istLand(brett.hexes[h]));
}

/** Liegt an der Kante mindestens ein Meerfeld? (Nur dort dürfen Schiffe hin.) */
export function meerKante(brett: Brett, kante: number): boolean {
  return kantenFelder(brett, kante).some((h) => !istLand(brett.hexes[h]));
}

/** Grenzt die Ecke an Land? (Nur dort dürfen Siedlungen hin.) */
export function eckeAnLand(brett: Brett, ecke: number): boolean {
  return brett.ecken[ecke].hexes.some((h) => istLand(brett.hexes[h]));
}

/** Kante schon mit Straße oder Schiff belegt? */
export function kanteBelegt(s: Basis, kante: number): boolean {
  return s.strassen[kante] !== undefined || (s.schiffe ?? KEINE)[kante] !== undefined;
}

/** Die sechs Kanten eines Felds. */
export function feldKanten(brett: Brett, hex: number): number[] {
  const ecken = brett.hexes[hex].ecken;
  const l: number[] = [];
  for (const e of ecken)
    for (const k of brett.ecken[e].kanten) {
      const kk = brett.kanten[k];
      if (ecken.includes(kk.a) && ecken.includes(kk.b) && !l.includes(k)) l.push(k);
    }
  return l;
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

function hatSchiffAn(schiffe: Record<number, number>, brett: Brett, spieler: number, ecke: number): boolean {
  return brett.ecken[ecke].kanten.some((k) => schiffe[k] === spieler);
}

/** Ecken, auf denen der Spieler jetzt eine Siedlung bauen dürfte (ohne Kostenprüfung).
 *  Angeschlossen über eine eigene Straße oder (Seefahrer) ein eigenes Schiff. */
export function gueltigeSiedlungsEcken(s: Basis, spieler: number, setup: boolean): number[] {
  if (s.spieler[spieler].siedlungenUebrig <= 0) return [];
  const schiffe = s.schiffe ?? KEINE;
  return s.brett.ecken
    .filter(
      (e) =>
        eckeFrei(s, e.id) &&
        eckeAnLand(s.brett, e.id) &&
        (setup || hatStrasseAn(s, spieler, e.id) || hatSchiffAn(schiffe, s.brett, spieler, e.id)),
    )
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
      if (kanteBelegt(s, k.id) || !landKante(s.brett, k.id)) return false;
      if (setupEcke !== null) return k.a === setupEcke || k.b === setupEcke;
      return eckeVerbindet(s, spieler, k.a) || eckeVerbindet(s, spieler, k.b);
    })
    .map((k) => k.id);
}

// ---------- Seefahrer: Schiffe ----------

/** Kanten am Feld des Piraten: dort darf kein Schiff gebaut oder versetzt werden. */
function piratKanten(s: Basis): Set<number> {
  return s.pirat === null || s.pirat === undefined ? new Set() : new Set(feldKanten(s.brett, s.pirat));
}

/** Freie Schiffsplätze für eine gegebene Schiffsbelegung (ohne Vorratsprüfung).
 *  Ein Schiff schließt an ein eigenes Gebäude an oder an ein eigenes Schiff, wenn kein fremdes Gebäude dazwischen steht.
 *  Straßen und Schiffe verbinden sich nur über eine eigene Siedlung oder Stadt. */
function schiffPlaetze(s: Basis, spieler: number, schiffe: Record<number, number>, setupEcke: number | null): number[] {
  const pirat = piratKanten(s);
  const verbindet = (ecke: number): boolean => {
    const g = s.gebaeude[ecke];
    if (g) return g.spieler === spieler;
    return hatSchiffAn(schiffe, s.brett, spieler, ecke);
  };
  return s.brett.kanten
    .filter((k) => {
      if (s.strassen[k.id] !== undefined || schiffe[k.id] !== undefined) return false;
      if (!meerKante(s.brett, k.id) || pirat.has(k.id)) return false;
      if (setupEcke !== null) return k.a === setupEcke || k.b === setupEcke;
      return verbindet(k.a) || verbindet(k.b);
    })
    .map((k) => k.id);
}

/** Kanten, auf denen der Spieler jetzt ein Schiff bauen dürfte (ohne Kostenprüfung). */
export function gueltigeSchiffKanten(s: Basis, spieler: number, setupEcke: number | null = null): number[] {
  if (s.config.variante !== 'seefahrer' || (s.spieler[spieler].schiffeUebrig ?? 0) <= 0) return [];
  return schiffPlaetze(s, spieler, s.schiffe ?? KEINE, setupEcke);
}

/** Schiffe, die der Spieler versetzen darf: offenes Ende einer Schiffslinie, nicht neu gebaut, nicht am Piraten. */
export function beweglicheSchiffe(s: Basis, spieler: number, neu: readonly number[] = []): number[] {
  if (s.config.variante !== 'seefahrer') return [];
  const schiffe = s.schiffe ?? KEINE;
  const pirat = piratKanten(s);
  return Object.entries(schiffe)
    .filter(([k, sp]) => sp === spieler && !neu.includes(Number(k)) && !pirat.has(Number(k)))
    .map(([k]) => Number(k))
    .filter((kid) => {
      const k = s.brett.kanten[kid];
      return [k.a, k.b].some((e) => {
        const g = s.gebaeude[e];
        if (g && g.spieler === spieler) return false;
        return !s.brett.ecken[e].kanten.some((x) => x !== kid && schiffe[x] === spieler);
      });
    });
}

/** Wohin das Schiff `von` versetzt werden darf (gilt, als stünde es schon nicht mehr dort). */
export function schiffZiele(s: Basis, spieler: number, von: number): number[] {
  const schiffe = { ...(s.schiffe ?? KEINE) };
  delete schiffe[von];
  return schiffPlaetze(s, spieler, schiffe, null).filter((k) => k !== von);
}

export function gueltigeStadtEcken(s: Basis, spieler: number): number[] {
  if (s.spieler[spieler].staedteUebrig <= 0) return [];
  return Object.entries(s.gebaeude)
    .filter(([, g]) => g.spieler === spieler && g.typ === 'siedlung')
    .map(([e]) => Number(e));
}

/** Längste zusammenhängende Handelsstraße eines Spielers (Tiefensuche über Kanten).
 *  Verzweigungen und Schleifen werden korrekt behandelt; fremde Gebäude unterbrechen die Straße.
 *  Seefahrer: Schiffe zählen mit (Handelsroute). Von Straße zu Schiff geht es nur über ein eigenes Gebäude. */
export function strassenLaenge(s: Basis, spieler: number): number {
  const schiffe = s.schiffe ?? KEINE;
  const art = (kid: number): 'strasse' | 'schiff' | null =>
    s.strassen[kid] === spieler ? 'strasse' : schiffe[kid] === spieler ? 'schiff' : null;
  const eigene = s.brett.kanten.filter((k) => art(k.id) !== null);
  if (eigene.length === 0) return 0;
  const benutzt = new Set<number>();
  let beste = 0;

  const suche = (ecke: number, laenge: number, kam: 'strasse' | 'schiff'): void => {
    if (laenge > beste) beste = laenge;
    // Durch eine fremde Siedlung/Stadt geht es nicht weiter.
    const g = s.gebaeude[ecke];
    if (g && g.spieler !== spieler) return;
    const eigenesGebaeude = !!g;
    for (const kid of s.brett.ecken[ecke].kanten) {
      const a = art(kid);
      if (a === null || benutzt.has(kid)) continue;
      if (a !== kam && !eigenesGebaeude) continue;
      const k = s.brett.kanten[kid];
      benutzt.add(kid);
      suche(k.a === ecke ? k.b : k.a, laenge + 1, a);
      benutzt.delete(kid);
    }
  };

  for (const k of eigene) {
    const a = art(k.id)!;
    benutzt.add(k.id);
    suche(k.a, 1, a);
    suche(k.b, 1, a);
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
  p += INSEL_BONUS * (s.spieler[spieler].inselBonus?.length ?? 0);
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

/** Felder, auf die der Räuber gesetzt werden darf (nie das aktuelle Feld).
 *  Seefahrer: Landfelder für den Räuber, Meerfelder für den Piraten. */
export function gueltigeRaeuberHexes(s: Basis, spieler: number): number[] {
  const mitPirat = s.pirat !== null && s.pirat !== undefined;
  const alle = s.brett.hexes
    .filter((h) => (istLand(h) ? h.id !== s.raeuber : mitPirat && h.id !== s.pirat))
    .map((h) => h.id);
  if (!s.config.freundlicherRaeuber) return alle;
  // Freundlicher Räuber: Felder mit Gebäuden (bzw. Schiffen) von Spielern mit höchstens 2 Siegpunkten sind tabu.
  const erlaubt = alle.filter((id) => anlieger(s, id).every((sp) => sp === spieler || oeffentlichePunkte(s, sp) > 2));
  return erlaubt.length > 0 ? erlaubt : alle;
}

/** Alle Spieler mit Gebäude an einem Landfeld bzw. Schiff an einem Meerfeld. */
function anlieger(s: Basis, hex: number): number[] {
  const menge = new Set<number>();
  if (istLand(s.brett.hexes[hex])) {
    for (const e of s.brett.hexes[hex].ecken) {
      const g = s.gebaeude[e];
      if (g) menge.add(g.spieler);
    }
  } else {
    const schiffe = s.schiffe ?? KEINE;
    for (const k of feldKanten(s.brett, hex)) if (schiffe[k] !== undefined) menge.add(schiffe[k]);
  }
  return [...menge];
}

/** Gegner mit Gebäude am Feld bzw. Schiff am Meerfeld (Kandidaten zum Bestehlen, ohne Prüfung der Kartenzahl). */
export function anliegerGegner(s: Basis, spieler: number, hex: number): number[] {
  return anlieger(s, hex)
    .filter((sp) => sp !== spieler)
    .sort((a, b) => a - b);
}
