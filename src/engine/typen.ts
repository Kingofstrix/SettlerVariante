// Zentrale Typen der Regel-Engine. Kein DOM, kein Netzwerk.

export const ROHSTOFFE = ['holz', 'lehm', 'wolle', 'getreide', 'erz'] as const;
export type Rohstoff = (typeof ROHSTOFFE)[number];
export type Rohstoffe = Record<Rohstoff, number>;

export type Gelaende = 'wald' | 'huegel' | 'weide' | 'acker' | 'gebirge' | 'wueste';

export const GELAENDE_ROHSTOFF: Record<Gelaende, Rohstoff | null> = {
  wald: 'holz',
  huegel: 'lehm',
  weide: 'wolle',
  acker: 'getreide',
  gebirge: 'erz',
  wueste: null,
};

export const ROHSTOFF_NAME: Record<Rohstoff, string> = {
  holz: 'Holz',
  lehm: 'Lehm',
  wolle: 'Wolle',
  getreide: 'Getreide',
  erz: 'Erz',
};

export type EntwTyp = 'ritter' | 'siegpunkt' | 'strassenbau' | 'erfindung' | 'monopol';

export const ENTW_NAME: Record<EntwTyp, string> = {
  ritter: 'Ritter',
  siegpunkt: 'Siegpunkt',
  strassenbau: 'Straßenbau',
  erfindung: 'Erfindung',
  monopol: 'Monopol',
};

export type HafenTyp = Rohstoff | 'alle';

export interface Hex {
  id: number;
  q: number;
  r: number;
  x: number;
  y: number;
  gelaende: Gelaende;
  zahl: number | null;
  ecken: number[];
  nachbarn: number[];
}

export interface Ecke {
  id: number;
  x: number;
  y: number;
  hexes: number[];
  nachbarn: number[];
  kanten: number[];
  hafen: HafenTyp | null;
}

export interface Kante {
  id: number;
  a: number;
  b: number;
}

export interface Hafen {
  kante: number;
  typ: HafenTyp;
  // Position des Hafensymbols (außerhalb der Küste)
  x: number;
  y: number;
}

export interface Brett {
  gross: boolean;
  hexes: Hex[];
  ecken: Ecke[];
  kanten: Kante[];
  haefen: Hafen[];
}

export interface Gebaeude {
  spieler: number;
  typ: 'siedlung' | 'stadt';
}

export interface EntwKarte {
  typ: EntwTyp;
  gekauftInZug: number;
}

export interface Spieler {
  id: number;
  name: string;
  farbe: string;
  hand: Rohstoffe;
  entw: EntwKarte[];
  gespielteRitter: number;
  siedlungenUebrig: number;
  staedteUebrig: number;
  strassenUebrig: number;
  /** Öffentliche Wunschliste: was der Spieler sucht und was er dafür bietet. */
  wunsch: { suche: Rohstoff[]; biete: Rohstoff[] };
}

export type Phase =
  | 'setup'
  | 'wuerfeln'
  | 'abwerfen'
  | 'raeuber'
  | 'stehlen'
  | 'aktion'
  | 'sonderbau'
  | 'ende';

export type Layout = 'anfaenger' | 'zufall';

export interface SpielConfig {
  layout: Layout;
  siegpunkte: number; // 8, 10 oder 12
  freundlicherRaeuber: boolean;
  sonderbauAutoSkip: boolean; // Spieler, die nichts bauen können, in der Sonderbauphase überspringen
  sonderbauphase: boolean; // Sonderbauphase bei 5–6 Spielern
  abwurfGrenze: number; // bei einer 7 wirft ab, wer mehr Karten hat (7 oder 9)
  /** Las-Vegas-Variante: Bei einer 7 darf man statt abzuwerfen am Glücksrad drehen. */
  gluecksrad: boolean;
}

/** Gewinnchance am Glücksrad. */
export const GLUECKSRAD_CHANCE = 0.3;

export const STANDARD_CONFIG: SpielConfig = {
  layout: 'zufall',
  siegpunkte: 10,
  freundlicherRaeuber: false,
  sonderbauAutoSkip: true,
  sonderbauphase: true,
  abwurfGrenze: 7,
  gluecksrad: false,
};

export interface Handelsangebot {
  id: number;
  von: number;
  an: number[]; // Empfänger, die noch annehmen können
  abgelehnt: number[];
  gib: Rohstoffe; // was "von" abgibt
  nimm: Rohstoffe; // was "von" bekommt
}

/** Eine Kartenbewegung. von/nach: Spielerindex oder null für die Bank. */
export interface Bewegung {
  nr: number;
  von: number | null;
  nach: number | null;
  r: Rohstoff | 'entw';
  n: number;
  /** Beim Würfelertrag: das Feld, von dem die Karten kommen. */
  hex?: number;
}

/** Stelle auf dem Brett, auf die sich ein Logeintrag bezieht. */
export interface Ort {
  ecke?: number;
  kante?: number;
  hex?: number;
}

/** Ergebnis eines Drehs am Glücksrad (öffentlich, für die Animation). */
export interface GluecksradDreh {
  nr: number;
  spieler: number;
  gewonnen: boolean;
  /** Abwurf-Soll vor dem Dreh */
  vorher: number;
  /** Abwurf-Soll nach dem Dreh (0 bei Gewinn) */
  nachher: number;
  /** Verloren und das doppelte Soll war die ganze Hand: alles wurde direkt abgeworfen */
  alle: boolean;
}

export interface LogEintrag {
  nr: number;
  text: string;
  /** Zugnummer, in der der Eintrag entstand (0 = Gründung). Fehlt in alten Spielständen. */
  zug?: number;
  /** Spieler, der gehandelt hat. */
  wer?: number;
  ort?: Ort;
  // Optionaler Zusatztext, den nur bestimmte Spieler sehen (z. B. welche Karte gestohlen wurde)
  geheim?: { fuer: number[]; text: string };
}

export interface Statistik {
  /** Anzahl Würfe je Augensumme (Index 0–12). */
  wuerfe: number[];
  /** Je Spieler: Rohstoffkarten aus Würfelerträgen. */
  ertrag: number[];
  /** Je Spieler: Tauschvorgänge mit Mitspielern und der Bank. */
  handel: number[];
  /** Je Spieler: gestohlene Karten (als Dieb). */
  diebstahl: number[];
  /** Siegpunkte aller Spieler (inkl. verdeckter) nach der Gründung und nach jedem Zug. */
  punkte: number[][];
}

export interface GameState {
  version: 1;
  seed: number;
  rngState: number;
  config: SpielConfig;
  brett: Brett;
  gebaeude: Record<number, Gebaeude>;
  strassen: Record<number, number>;
  raeuber: number;
  bank: Rohstoffe;
  stapel: EntwTyp[];
  gespielteEntw: number; // ausgespielte (abgelegte) Entwicklungskarten, für die Kartenbilanz
  spieler: Spieler[];
  aktiv: number;
  zugNr: number;
  phase: Phase;
  setup: { schritt: number; erwartet: 'siedlung' | 'strasse'; letzteEcke: number | null };
  wurf: [number, number] | null;
  abwerfen: Record<number, number>;
  nachRaeuber: 'aktion' | 'wuerfeln';
  stehlenKandidaten: number[];
  entwGespielt: boolean;
  freieStrassen: number;
  angebote: Handelsangebot[];
  naechsteAngebotId: number;
  sonderbau: { reihenfolge: number[]; index: number } | null;
  laengsteStrasse: number | null;
  groessteMacht: number | null;
  gewinner: number | null;
  log: LogEintrag[];
  logNr: number;
  /** Die letzten Kartenbewegungen (für Animationen), mit fortlaufender Nummer. */
  bewegungen: Bewegung[];
  bewegungNr: number;
  statistik: Statistik;
  /** Die letzten Drehs am Glücksrad und wer bei der aktuellen 7 schon gedreht hat. */
  gluecksrad: GluecksradDreh[];
  gluecksradNr: number;
  gedreht: number[];
  /** Wie oft jede Augensumme gefallen ist (Index = Summe, 2–12). Anders als statistik.wuerfe immer öffentlich (Reiter „Statistik“). */
  wurfStatistik: number[];
}

// Aktionen (Intentionen). "spieler" setzt immer der Host anhand der Verbindung.
export type Aktion =
  | { typ: 'WUERFELN'; spieler: number }
  | { typ: 'ABWERFEN'; spieler: number; karten: Partial<Rohstoffe> }
  | { typ: 'GLUECKSRAD_DREHEN'; spieler: number }
  | { typ: 'RAEUBER_SETZEN'; spieler: number; hex: number }
  | { typ: 'STEHLEN'; spieler: number; opfer: number }
  | { typ: 'STRASSE_BAUEN'; spieler: number; kante: number }
  | { typ: 'SIEDLUNG_BAUEN'; spieler: number; ecke: number }
  | { typ: 'STADT_BAUEN'; spieler: number; ecke: number }
  | { typ: 'ENTW_KAUFEN'; spieler: number }
  | { typ: 'RITTER_SPIELEN'; spieler: number }
  | { typ: 'STRASSENBAU_SPIELEN'; spieler: number }
  | { typ: 'ERFINDUNG_SPIELEN'; spieler: number; rohstoffe: [Rohstoff, Rohstoff] }
  | { typ: 'MONOPOL_SPIELEN'; spieler: number; rohstoff: Rohstoff }
  | { typ: 'BANKHANDEL'; spieler: number; gib: Rohstoff; nimm: Rohstoff }
  | { typ: 'HANDEL_ANBIETEN'; spieler: number; gib: Partial<Rohstoffe>; nimm: Partial<Rohstoffe>; an: number[] | null }
  | { typ: 'HANDEL_ANNEHMEN'; spieler: number; angebot: number }
  | { typ: 'HANDEL_ABLEHNEN'; spieler: number; angebot: number }
  | { typ: 'HANDEL_ZURUECKZIEHEN'; spieler: number; angebot: number }
  | { typ: 'ZUG_BEENDEN'; spieler: number }
  | { typ: 'SONDERBAU_FERTIG'; spieler: number }
  | { typ: 'WUNSCH_SETZEN'; spieler: number; suche: Rohstoff[]; biete: Rohstoff[] }
  // Vom Host bei abgelaufenem Timer ausgelöst: führt genau einen Standardschritt aus.
  | { typ: 'ZEIT_ABGELAUFEN'; spieler: number };

export type AktionsTyp = Aktion['typ'];

export type Ergebnis = { ok: true; state: GameState } | { ok: false; fehler: string };

export const KOSTEN = {
  strasse: { holz: 1, lehm: 1 } as Partial<Rohstoffe>,
  siedlung: { holz: 1, lehm: 1, wolle: 1, getreide: 1 } as Partial<Rohstoffe>,
  stadt: { getreide: 2, erz: 3 } as Partial<Rohstoffe>,
  entwicklung: { wolle: 1, getreide: 1, erz: 1 } as Partial<Rohstoffe>,
};

export function leereRohstoffe(): Rohstoffe {
  return { holz: 0, lehm: 0, wolle: 0, getreide: 0, erz: 0 };
}

export function summe(r: Partial<Rohstoffe>): number {
  let s = 0;
  for (const k of ROHSTOFFE) s += r[k] ?? 0;
  return s;
}
