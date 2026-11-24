// Kartenformen: welche Felder Land sind. Gelände, Zahlen und Häfen verteilt brett.ts.
// Jede Karte gibt es in zwei Größen: klein für 3–4, groß für 5–6 Spieler.
// Die Seefahrer-Karten haben zusätzlich Meer, Goldfelder und kleine Inseln abseits der Startinseln.
// Die kleinen Fassungen sind höchstens sieben Zeilen hoch, die großen höchstens acht. Die großen haben
// gut 50 Felder, damit sich sechs Spieler nicht gegenseitig einmauern; ihre Felder sind dafür etwas kleiner.

import type { Variante } from './typen';

export const KARTEN = ['klassik', 'zwillinge', 'spirale', 'fjorde', 'neueUfer', 'archipel'] as const;
export type KartenId = (typeof KARTEN)[number];

/** Zu welcher Variante eine Karte gehört. */
export const KARTEN_VARIANTE: Record<KartenId, Variante> = {
  klassik: 'grund',
  zwillinge: 'grund',
  spirale: 'grund',
  fjorde: 'grund',
  neueUfer: 'seefahrer',
  archipel: 'seefahrer',
};

/** Die Karten einer Variante, in der Reihenfolge der Abstimmung. */
export function kartenFuer(variante: Variante): KartenId[] {
  return KARTEN.filter((k) => KARTEN_VARIANTE[k] === variante);
}

/** Karte, die ohne Stimmen gespielt wird. */
export function standardKarte(variante: Variante): KartenId {
  return kartenFuer(variante)[0];
}

export const KARTEN_NAME: Record<KartenId, string> = {
  klassik: 'Klassik',
  zwillinge: 'Zwillingsinseln',
  spirale: 'Spirale',
  fjorde: 'Fjordland',
  neueUfer: 'Neue Ufer',
  archipel: 'Archipel',
};

export const KARTEN_TEXT: Record<KartenId, string> = {
  klassik: 'Das bekannte Sechseck. Kurze Wege, viel Gedränge.',
  zwillinge: 'Zwei Inseln ohne Landverbindung. Wo du gründest, bleibst du.',
  spirale: 'Ein langer Arm windet sich um den Kern. Viel Küste, weite Wege.',
  fjorde: 'Eine große Insel, von schmalen Buchten zerschnitten.',
  neueUfer: 'Alle gründen auf der großen Insel. Im Osten warten kleine Inseln mit Gold.',
  archipel: 'Mehrere Startinseln, dazwischen Goldinseln. Wer zuerst segelt, holt den Bonus.',
};

export function istKarte(x: unknown): x is KartenId {
  return typeof x === 'string' && (KARTEN as readonly string[]).includes(x);
}

type Koord = [number, number];

/**
 * Liest eine Form aus Textzeilen: X = Land. Ungerade Zeilen sind um ein halbes Feld nach rechts
 * versetzt, so wie die Felder später auf dem Brett liegen.
 */
function ausZeilen(zeilen: string[]): Koord[] {
  const l: Koord[] = [];
  zeilen.forEach((zeile, r) => {
    [...zeile].forEach((z, spalte) => {
      if (z === 'X') l.push([spalte - (r - (r & 1)) / 2, r]);
    });
  });
  return l;
}

type GrundKarte = Exclude<KartenId, 'klassik' | SeeKarte>;
export type SeeKarte = 'neueUfer' | 'archipel';

const FORMEN: Record<GrundKarte, { klein: string[]; gross: string[] }> = {
  // Eine kleinere Insel im Westen, eine größere im Osten; dazwischen mindestens zwei Felder Wasser.
  zwillinge: {
    klein: [
      '.XX...XXX.',
      'XXX..XXXX.',
      'XXX...XXX.',
      'XX...XXXX.',
      '......XX..',
    ],
    gross: [
      '.XXX...XXX..',
      'XXXX..XXXXX.',
      'XXXX...XXXXX',
      'XXXX..XXXXX.',
      '.XXX..XXXXX.',
      '.XX...XXXX..',
      '......XXX...',
      '......XX....',
    ],
  },
  // Ein Arm läuft vom Kern aus einmal um die Mitte und endet unten rechts. Klein ist er zwei Felder
  // breit, groß an der linken Seite drei, damit man auch mit sechs Spielern außen herum kommt.
  // Die Rinne zwischen den Windungen ist nach Osten zum Meer offen.
  spirale: {
    klein: [
      '.XXXX..',
      'XXXXXX.',
      'XX...XX',
      'XX.XXXX',
      'XX.....',
      'XXXXXX.',
      '.XXXXX.',
    ],
    gross: [
      '.XXXXXXX..',
      'XXXXXXXXX.',
      'XXX....XXX',
      'XXX.XX.XXX',
      'XXX.XXXXX.',
      'XXX.......',
      'XXXXXXXX..',
      '.XXXXX....',
    ],
  },
  // Eine Insel mit Buchten, die tief ins Land reichen. Keine Bucht ist vom Meer abgeschnitten.
  fjorde: {
    klein: [
      '.XX.XX.',
      'XXX.XX.',
      'XXXXXXX',
      'X.XXX.X',
      '.X.XXX.',
    ],
    gross: [
      '..XX.XX...',
      '.XXX.XXXX.',
      '.XXXX.XXXX',
      'XXXXXXX...',
      'XX.XXXXXXX',
      '.X.XXX.XXX',
      'XX.XXX.XX.',
      '.X..XX..X.',
    ],
  },
};

// Seefahrer: X = Land der Startinseln, I = Land abseits (bringt den Insel-Bonus), G = Goldfeld abseits,
// . = Meer. Um alles Land herum liegt zusätzlich immer ein Ring Meer, damit jede Küste befahrbar ist.
// Inseln müssen durch mindestens ein Meerfeld getrennt sein; eine Insel ist ganz Start oder ganz abseits.
const SEE_FORMEN: Record<SeeKarte, { klein: string[]; gross: string[] }> = {
  // Eine große Startinsel im Westen, drei kleine Inseln mit je einem Goldfeld im Osten und Süden.
  neueUfer: {
    klein: [
      '..XXX...II.',
      '.XXXX..IGI.',
      'XXXXX......',
      '.XXXX...III',
      '..XXX...I..',
      '...........',
      '..IIGI.....',
    ],
    gross: [
      '..XXXX...III..',
      '.XXXXX...IGI..',
      'XXXXXX........',
      '.XXXXXX...IIII',
      'XXXXXX....IG..',
      '.XXXXX........',
      '..XXX...IIG...',
      '..........II..',
    ],
  },
  // Klein zwei, groß drei Startinseln; dazwischen Goldinseln.
  archipel: {
    klein: [
      '.XXX.....XXX.',
      'XXXX..I..XXXX',
      'XXXXX.GI.XXX.',
      '.XXX..II..XXX',
      '.............',
      '....IGII.....',
    ],
    gross: [
      '.XXXX....XXXX.',
      'XXXXX..I..XXXX',
      '.XXXX.IG..XXXX',
      '..XX..II...XX.',
      '..............',
      '...XXXX.GI....',
      '..XXXXXX.II...',
      '...XXXX.......',
    ],
  },
};

export function istSeeKarte(karte: KartenId): karte is SeeKarte {
  return KARTEN_VARIANTE[karte] === 'seefahrer';
}

export type FeldArt = 'start' | 'insel' | 'gold' | 'meer';

/** Alle Felder einer Seefahrer-Karte mit Art, zeilenweise sortiert; dazu ein Ring Meer um jedes Land. */
export function seeFelder(karte: SeeKarte, gross: boolean): { q: number; r: number; art: FeldArt }[] {
  const zeilen = gross ? SEE_FORMEN[karte].gross : SEE_FORMEN[karte].klein;
  const felder = new Map<string, { q: number; r: number; art: FeldArt }>();
  zeilen.forEach((zeile, r) => {
    [...zeile].forEach((z, spalte) => {
      const q = spalte - (r - (r & 1)) / 2;
      const art: FeldArt = z === 'X' ? 'start' : z === 'I' ? 'insel' : z === 'G' ? 'gold' : 'meer';
      felder.set(`${q},${r}`, { q, r, art });
    });
  });
  for (const f of [...felder.values()]) {
    if (f.art === 'meer') continue;
    for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
      const k = `${f.q + dq},${f.r + dr}`;
      if (!felder.has(k)) felder.set(k, { q: f.q + dq, r: f.r + dr, art: 'meer' });
    }
  }
  return [...felder.values()].sort((a, b) => a.r - b.r || a.q - b.q);
}

/** Landfelder einer Karte in Axialkoordinaten, zeilenweise sortiert (stabil für den Seed). */
export function kartenFelder(karte: Exclude<KartenId, 'klassik'>, gross: boolean): [number, number][] {
  if (istSeeKarte(karte)) return seeFelder(karte, gross).filter((f) => f.art !== 'meer').map((f) => [f.q, f.r]);
  const form = FORMEN[karte];
  return ausZeilen(gross ? form.gross : form.klein).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

// ---------- Abstimmung ----------

export interface Auszaehlung {
  /** Stimmen je Karte */
  stimmen: Record<KartenId, number>;
  /** Abgegebene Stimmen insgesamt */
  abgegeben: number;
  /** Karten mit den meisten Stimmen; ohne Stimmen nur die Standardkarte der Variante */
  vorn: KartenId[];
}

/** Zählt nur Stimmen für Karten der gewählten Variante; Stimmen für die andere Variante ruhen. */
export function zaehleStimmen(stimmen: readonly (KartenId | null | undefined)[], variante: Variante = 'grund'): Auszaehlung {
  const karten = kartenFuer(variante);
  const n = Object.fromEntries(KARTEN.map((k) => [k, 0])) as Record<KartenId, number>;
  let abgegeben = 0;
  for (const s of stimmen) {
    if (!s || !karten.includes(s)) continue;
    n[s]++;
    abgegeben++;
  }
  const max = Math.max(...karten.map((k) => n[k]));
  return { stimmen: n, abgegeben, vorn: abgegeben === 0 ? [standardKarte(variante)] : karten.filter((k) => n[k] === max) };
}

/**
 * Ergebnis der Abstimmung: die Karte mit den meisten Stimmen. Bei Gleichstand entscheidet das Los
 * (`zufall` liefert eine Zahl in [0, 1)), ohne Stimmen wird die Standardkarte gespielt (Klassik bzw. Neue Ufer).
 */
export function waehleKarte(
  stimmen: readonly (KartenId | null | undefined)[],
  zufall: () => number,
  variante: Variante = 'grund',
): { karte: KartenId; los: boolean } {
  const { vorn } = zaehleStimmen(stimmen, variante);
  if (vorn.length === 1) return { karte: vorn[0], los: false };
  return { karte: vorn[Math.min(vorn.length - 1, Math.floor(zufall() * vorn.length))], los: true };
}
