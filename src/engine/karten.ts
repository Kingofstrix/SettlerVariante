// Kartenformen: welche Felder Land sind. Gelände, Zahlen und Häfen verteilt brett.ts.
// Jede Karte gibt es in zwei Größen: klein für 3–4, groß für 5–6 Spieler.
// Die kleinen Fassungen sind höchstens sieben Zeilen hoch, die großen höchstens acht. Die großen haben
// gut 50 Felder, damit sich sechs Spieler nicht gegenseitig einmauern; ihre Felder sind dafür etwas kleiner.

export const KARTEN = ['klassik', 'zwillinge', 'spirale', 'fjorde'] as const;
export type KartenId = (typeof KARTEN)[number];

export const KARTEN_NAME: Record<KartenId, string> = {
  klassik: 'Klassik',
  zwillinge: 'Zwillingsinseln',
  spirale: 'Spirale',
  fjorde: 'Fjordland',
};

export const KARTEN_TEXT: Record<KartenId, string> = {
  klassik: 'Das bekannte Sechseck. Kurze Wege, viel Gedränge.',
  zwillinge: 'Zwei Inseln ohne Landverbindung. Wo du gründest, bleibst du.',
  spirale: 'Ein langer Arm windet sich um den Kern. Viel Küste, weite Wege.',
  fjorde: 'Eine große Insel, von schmalen Buchten zerschnitten.',
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

const FORMEN: Record<Exclude<KartenId, 'klassik'>, { klein: string[]; gross: string[] }> = {
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

/** Landfelder einer Karte in Axialkoordinaten, zeilenweise sortiert (stabil für den Seed). */
export function kartenFelder(karte: Exclude<KartenId, 'klassik'>, gross: boolean): [number, number][] {
  const form = FORMEN[karte];
  return ausZeilen(gross ? form.gross : form.klein).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

// ---------- Abstimmung ----------

export interface Auszaehlung {
  /** Stimmen je Karte */
  stimmen: Record<KartenId, number>;
  /** Abgegebene Stimmen insgesamt */
  abgegeben: number;
  /** Karten mit den meisten Stimmen; ohne Stimmen nur „Klassik“ */
  vorn: KartenId[];
}

export function zaehleStimmen(stimmen: readonly (KartenId | null | undefined)[]): Auszaehlung {
  const n = Object.fromEntries(KARTEN.map((k) => [k, 0])) as Record<KartenId, number>;
  let abgegeben = 0;
  for (const s of stimmen) {
    if (!s) continue;
    n[s]++;
    abgegeben++;
  }
  const max = Math.max(...KARTEN.map((k) => n[k]));
  return { stimmen: n, abgegeben, vorn: abgegeben === 0 ? ['klassik'] : KARTEN.filter((k) => n[k] === max) };
}

/**
 * Ergebnis der Abstimmung: die Karte mit den meisten Stimmen. Bei Gleichstand entscheidet das Los
 * (`zufall` liefert eine Zahl in [0, 1)), ohne Stimmen wird „Klassik“ gespielt.
 */
export function waehleKarte(stimmen: readonly (KartenId | null | undefined)[], zufall: () => number): { karte: KartenId; los: boolean } {
  const { vorn } = zaehleStimmen(stimmen);
  if (vorn.length === 1) return { karte: vorn[0], los: false };
  return { karte: vorn[Math.min(vorn.length - 1, Math.floor(zufall() * vorn.length))], los: true };
}
