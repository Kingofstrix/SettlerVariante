// Gefilterte Sicht: Was ein bestimmter Spieler (oder der Beamer) sehen darf.
import { istLand } from './brett';
import { amZug, gesamtPunkte } from './engine';
import { oeffentlichePunkte, strassenLaenge } from './regeln';
import { summe, type Brett, type Bewegung, type EntwKarte, type GameState, type LogEintrag, type Rohstoffe, type Spieler, type Statistik } from './typen';

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
  extends Omit<GameState, 'spieler' | 'stapel' | 'rngState' | 'seed' | 'log' | 'gespielteEntw' | 'bewegungen' | 'statistik'> {
  bewegungen: SichtBewegung[];
  /** Eigener Spielerindex; null beim Beamer. */
  ich: number | null;
  spieler: SpielerSicht[];
  stapelAnzahl: number;
  log: SichtLog[];
  /** Eigene Gesamtpunkte inkl. Siegpunktkarten; null beim Beamer. */
  eigenePunkte: number | null;
  /** Wer gerade handeln muss. */
  amZug: number[];
  /** Bei Spielende: Endstand mit aufgedeckten Siegpunktkarten. */
  endstand: number[] | null;
  /** Erst bei Spielende sichtbar (enthält verdeckte Siegpunkte). */
  statistik: Statistik | null;
  /** Nebel: verdeckte Landfelder, als Schlüssel („“ = nichts verdeckt). Ändert er sich, schickt der Host das Brett neu. */
  nebelSchluessel: string;
}

export type SichtLog = Omit<LogEintrag, 'geheim'>;

function logFuer(l: LogEintrag, ich: number | null): SichtLog {
  const { geheim, ...rest } = l;
  return geheim && ich !== null && geheim.fuer.includes(ich) ? { ...rest, text: geheim.text } : rest;
}

/**
 * Landfelder, die der Betrachter sehen darf; null = alle.
 *  - mittel: in der ganzen Gründung (auch bei Gold dort) ist alles Land verdeckt.
 *  - extrem: nur Felder an eigenen Siedlungen/Städten; der Beamer (ich = null) sieht alles, was irgendwer aufgedeckt hat.
 *  Bei Spielende ist alles offen.
 */
export function sichtbareFelder(s: Pick<GameState, 'config' | 'phase' | 'nachGold' | 'gebaeude' | 'brett'>, ich: number | null): Set<number> | null {
  const nebel = s.config.nebel ?? 'aus';
  if (nebel === 'aus' || s.phase === 'ende') return null;
  const gruendung = s.phase === 'setup' || (s.phase === 'gold' && s.nachGold === 'setup');
  if (nebel === 'mittel') return gruendung ? new Set() : null;
  const offen = new Set<number>();
  for (const [e, g] of Object.entries(s.gebaeude)) {
    if (ich !== null && g.spieler !== ich) continue;
    for (const h of s.brett.ecken[Number(e)].hexes) offen.add(h);
  }
  return offen;
}

// Gefilterte Bretter je Original und Schlüssel, damit dasselbe Brett-Objekt wiederkommt (die Grundebene zeichnet dann nicht neu).
const NEBEL_CACHE = new WeakMap<Brett, Map<string, Brett>>();

function brettImNebel(brett: Brett, offen: Set<number> | null): { brett: Brett; schluessel: string } {
  if (!offen) return { brett, schluessel: '' };
  const verdeckt = brett.hexes.filter((h) => istLand(h) && !offen.has(h.id)).map((h) => h.id);
  if (verdeckt.length === 0) return { brett, schluessel: '' };
  const schluessel = verdeckt.join(',');
  let je = NEBEL_CACHE.get(brett);
  if (!je) NEBEL_CACHE.set(brett, (je = new Map()));
  let b = je.get(schluessel);
  if (!b) {
    const zu = new Set(verdeckt);
    b = { ...brett, hexes: brett.hexes.map((h) => (zu.has(h.id) ? { ...h, gelaende: 'nebel', zahl: null } : h)) };
    if (je.size > 50) je.clear();
    je.set(schluessel, b);
  }
  return { brett: b, schluessel };
}

/** ich = Spielerindex oder null (Beamer/Zuschauer: sieht keine Handkarten). */
export function sichtFuer(s: GameState, ich: number | null): Sicht {
  const { spieler, stapel, rngState: _r, seed: _s, log, gespielteEntw: _g, bewegungen, statistik, ...rest } = s;
  void _r, _s, _g;
  const offen = sichtbareFelder(s, ich);
  const nebel = brettImNebel(s.brett, offen);
  return {
    ...rest,
    brett: nebel.brett,
    nebelSchluessel: nebel.schluessel,
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
    bewegungen: bewegungen.map((b) => {
      let x: SichtBewegung = b;
      if ((b.von !== null && b.nach !== null && b.von !== ich && b.nach !== ich) || (b.geheim && b.nach !== ich)) x = { ...x, r: null };
      // Im Nebel verriete das Herkunftsfeld seine Zahl
      if (b.hex !== undefined && offen && !offen.has(b.hex)) {
        const { hex: _h, ...ohne } = x;
        void _h;
        x = ohne;
      }
      return x;
    }),
    eigenePunkte: ich === null ? null : gesamtPunkte(s, ich),
    amZug: amZug(s),
    endstand: s.phase === 'ende' ? spieler.map((p) => gesamtPunkte(s, p.id)) : null,
    statistik: s.phase === 'ende' ? statistik : null,
  };
}
