// Helfer rund um den Spielverlauf: Gruppierung nach Zügen, Symbole, "seit deinem letzten Zug".
import type { Sicht, SichtLog } from '../engine';

/** Wer in Zug `zug` am Zug war (Zug 0 = Gründung). */
export function zugSpieler(sicht: Sicht, zug: number): number | null {
  return zug >= 1 ? (zug - 1) % sicht.spieler.length : null;
}

/** Symbol für eine Logzeile. */
export function logSymbol(text: string): string {
  if (/gewinnt|Längste Handelsstraße/.test(text)) return '🏆';
  if (/Rittermacht|Ritter/.test(text)) return '⚔️';
  if (/würfelt/.test(text)) return '🎲';
  if (/Räuber|stiehlt/.test(text)) return '🦹';
  if (/wirft .* ab/.test(text)) return '✋';
  if (/Stadt/.test(text)) return '🏰';
  if (/Siedlung/.test(text)) return '🏠';
  if (/Straße/.test(text)) return '🛤️';
  if (/Entwicklungskarte|spielt/.test(text)) return '🃏';
  if (/handeln|tauscht|bietet/.test(text)) return '⇄';
  return '•';
}

/**
 * Einträge anderer Spieler seit dem Beginn meines letzten Zugs (bin ich gerade dran: seit meinem vorigen Zug).
 * Beamer: alles aus dem laufenden Zug.
 */
export function seitLetztemZug(sicht: Sicht): SichtLog[] {
  const ich = sicht.ich;
  if (ich === null) return sicht.log.filter((l) => l.zug === sicht.zugNr && l.wer !== undefined);
  const n = sicht.spieler.length;
  let ab = 0;
  for (let z = sicht.zugNr - (sicht.aktiv === ich && sicht.phase !== 'setup' ? 1 : 0); z >= 1; z--)
    if ((z - 1) % n === ich) {
      ab = z;
      break;
    }
  return sicht.log.filter((l) => l.zug !== undefined && l.zug >= ab && l.wer !== undefined && l.wer !== ich);
}

/** Ecken und Kanten, an denen andere seit meinem letzten Zug gebaut haben (ohne Gründung). */
export function neueBauten(sicht: Sicht): { ecken: Set<number>; kanten: Set<number> } {
  const ecken = new Set<number>();
  const kanten = new Set<number>();
  for (const l of seitLetztemZug(sicht)) {
    if (!l.zug) continue;
    if (l.ort?.ecke !== undefined) ecken.add(l.ort.ecke);
    if (l.ort?.kante !== undefined) kanten.add(l.ort.kante);
  }
  return { ecken, kanten };
}
