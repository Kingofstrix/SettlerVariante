// Gefilterte Sicht: Was ein bestimmter Spieler (oder der Beamer) sehen darf.
import { amZug, gesamtPunkte } from './engine';
import { oeffentlichePunkte, strassenLaenge } from './regeln';
import { summe, type Bewegung, type EntwKarte, type GameState, type LogEintrag, type Rohstoffe, type Spieler } from './typen';

export interface SpielerSicht extends Omit<Spieler, 'hand' | 'entw'> {
  /** Nur beim eigenen Spieler gefüllt, sonst null. */
  hand: Rohstoffe | null;
  entw: EntwKarte[] | null;
  handAnzahl: number;
  entwAnzahl: number;
  /** Öffentliche Siegpunkte (ohne verdeckte Siegpunktkarten). */
  punkte: number;
  strassenLaenge: number;
}

/** Bewegung aus Sicht eines Betrachters: Rohstoff unbekannt, wenn er zwischen zwei anderen Spielern wandert. */
export interface SichtBewegung extends Omit<Bewegung, 'r'> {
  r: Bewegung['r'] | null;
}

export interface Sicht
  extends Omit<GameState, 'spieler' | 'stapel' | 'rngState' | 'seed' | 'log' | 'gespielteEntw' | 'bewegungen'> {
  bewegungen: SichtBewegung[];
  /** Eigener Spielerindex; null beim Beamer. */
  ich: number | null;
  spieler: SpielerSicht[];
  stapelAnzahl: number;
  log: { nr: number; text: string }[];
  /** Eigene Gesamtpunkte inkl. Siegpunktkarten; null beim Beamer. */
  eigenePunkte: number | null;
  /** Wer gerade handeln muss. */
  amZug: number[];
  /** Bei Spielende: Endstand mit aufgedeckten Siegpunktkarten. */
  endstand: number[] | null;
}

function logFuer(l: LogEintrag, ich: number | null): { nr: number; text: string } {
  if (l.geheim && ich !== null && l.geheim.fuer.includes(ich)) return { nr: l.nr, text: l.geheim.text };
  return { nr: l.nr, text: l.text };
}

/** ich = Spielerindex oder null (Beamer/Zuschauer: sieht keine Handkarten). */
export function sichtFuer(s: GameState, ich: number | null): Sicht {
  const { spieler, stapel, rngState: _r, seed: _s, log, gespielteEntw: _g, bewegungen, ...rest } = s;
  void _r, _s, _g;
  return {
    ...rest,
    ich,
    stapelAnzahl: stapel.length,
    spieler: spieler.map((p) => ({
      ...p,
      hand: p.id === ich ? p.hand : null,
      entw: p.id === ich ? p.entw : null,
      handAnzahl: summe(p.hand),
      entwAnzahl: p.entw.length,
      punkte: oeffentlichePunkte(s, p.id),
      strassenLaenge: strassenLaenge(s, p.id),
    })),
    log: log.map((l) => logFuer(l, ich)),
    bewegungen: bewegungen.map((b) =>
      b.von !== null && b.nach !== null && b.von !== ich && b.nach !== ich ? { ...b, r: null } : b,
    ),
    eigenePunkte: ich === null ? null : gesamtPunkte(s, ich),
    amZug: amZug(s),
    endstand: s.phase === 'ende' ? spieler.map((p) => gesamtPunkte(s, p.id)) : null,
  };
}
