// Brettgeometrie (Axialkoordinaten, spitze Hexfelder) und Brettgenerierung.
import type { Brett, Ecke, Gelaende, Hafen, HafenTyp, Hex, Kante, Layout } from './typen';
import { mischen, type RngTraeger } from './rng';

const W3 = Math.sqrt(3);
const RICHTUNGEN: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export const GELAENDE_KLEIN: Gelaende[] = [
  ...Array<Gelaende>(4).fill('wald'),
  ...Array<Gelaende>(4).fill('weide'),
  ...Array<Gelaende>(4).fill('acker'),
  ...Array<Gelaende>(3).fill('huegel'),
  ...Array<Gelaende>(3).fill('gebirge'),
  'wueste',
];
export const GELAENDE_GROSS: Gelaende[] = [
  ...Array<Gelaende>(6).fill('wald'),
  ...Array<Gelaende>(6).fill('weide'),
  ...Array<Gelaende>(6).fill('acker'),
  ...Array<Gelaende>(5).fill('huegel'),
  ...Array<Gelaende>(5).fill('gebirge'),
  'wueste',
  'wueste',
];
export const ZAHLEN_KLEIN = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
export const ZAHLEN_GROSS = [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12];
export const HAEFEN_KLEIN: HafenTyp[] = ['alle', 'holz', 'alle', 'lehm', 'alle', 'wolle', 'alle', 'getreide', 'erz'];
export const HAEFEN_GROSS: HafenTyp[] = [
  'alle', 'holz', 'alle', 'wolle', 'lehm', 'alle', 'getreide', 'alle', 'wolle', 'erz', 'alle',
];

/** Axialkoordinaten aller Landfelder. Klein: Sechseck mit Radius 2 (19). Groß: Reihen 3-4-5-6-5-4-3 (30). */
export function hexKoordinaten(gross: boolean): [number, number][] {
  const liste: [number, number][] = [];
  if (!gross) {
    for (let r = -2; r <= 2; r++)
      for (let q = Math.max(-2, -r - 2); q <= Math.min(2, -r + 2); q++) liste.push([q, r]);
  } else {
    for (let r = -3; r <= 3; r++)
      for (let q = Math.max(-3, -r - 3); q <= Math.min(2, -r + 2); q++) liste.push([q, r]);
  }
  return liste;
}

/** Baut den reinen Graphen (ohne Gelände, Zahlen, Häfen). */
export function baueGraph(gross: boolean): Brett {
  const koord = hexKoordinaten(gross);
  const hexes: Hex[] = [];
  const ecken: Ecke[] = [];
  const kanten: Kante[] = [];
  const eckeIndex = new Map<string, number>();
  const kanteIndex = new Map<string, number>();
  const hexIndex = new Map<string, number>();

  koord.forEach(([q, r], id) => {
    hexIndex.set(`${q},${r}`, id);
    hexes.push({ id, q, r, x: W3 * (q + r / 2), y: 1.5 * r, gelaende: 'wueste', zahl: null, ecken: [], nachbarn: [] });
  });

  for (const h of hexes) {
    for (let i = 0; i < 6; i++) {
      const winkel = (Math.PI / 180) * (60 * i - 30);
      const x = h.x + Math.cos(winkel);
      const y = h.y + Math.sin(winkel);
      const key = `${Math.round(x * 100)},${Math.round(y * 100)}`;
      let id = eckeIndex.get(key);
      if (id === undefined) {
        id = ecken.length;
        eckeIndex.set(key, id);
        ecken.push({ id, x, y, hexes: [], nachbarn: [], kanten: [], hafen: null });
      }
      h.ecken.push(id);
      ecken[id].hexes.push(h.id);
    }
    for (let i = 0; i < 6; i++) {
      const a = h.ecken[i];
      const b = h.ecken[(i + 1) % 6];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!kanteIndex.has(key)) {
        const id = kanten.length;
        kanteIndex.set(key, id);
        kanten.push({ id, a: Math.min(a, b), b: Math.max(a, b) });
        ecken[a].nachbarn.push(b);
        ecken[b].nachbarn.push(a);
        ecken[a].kanten.push(id);
        ecken[b].kanten.push(id);
      }
    }
    for (const [dq, dr] of RICHTUNGEN) {
      const n = hexIndex.get(`${h.q + dq},${h.r + dr}`);
      if (n !== undefined) h.nachbarn.push(n);
    }
  }
  return { gross, hexes, ecken, kanten, haefen: [] };
}

/** Küstenkanten (gehören zu genau einem Hex), im Uhrzeigersinn um die Brettmitte sortiert. */
export function kuestenKanten(brett: Brett): { kante: number; hex: number }[] {
  const zaehler = new Map<number, number[]>();
  for (const h of brett.hexes) {
    for (let i = 0; i < 6; i++) {
      const a = h.ecken[i];
      const b = h.ecken[(i + 1) % 6];
      const k = brett.kanten.find((e) => e.a === Math.min(a, b) && e.b === Math.max(a, b))!;
      const l = zaehler.get(k.id) ?? [];
      l.push(h.id);
      zaehler.set(k.id, l);
    }
  }
  const cx = brett.hexes.reduce((s, h) => s + h.x, 0) / brett.hexes.length;
  const cy = brett.hexes.reduce((s, h) => s + h.y, 0) / brett.hexes.length;
  const kueste: { kante: number; hex: number; w: number }[] = [];
  for (const [kante, hs] of zaehler) {
    if (hs.length !== 1) continue;
    const k = brett.kanten[kante];
    const mx = (brett.ecken[k.a].x + brett.ecken[k.b].x) / 2;
    const my = (brett.ecken[k.a].y + brett.ecken[k.b].y) / 2;
    kueste.push({ kante, hex: hs[0], w: Math.atan2(my - cy, mx - cx) });
  }
  kueste.sort((a, b) => a.w - b.w);
  return kueste.map(({ kante, hex }) => ({ kante, hex }));
}

function setzeHaefen(brett: Brett, typen: HafenTyp[]): void {
  const kueste = kuestenKanten(brett);
  const n = typen.length;
  const haefen: Hafen[] = [];
  for (const e of brett.ecken) e.hafen = null;
  for (let i = 0; i < n; i++) {
    const pos = kueste[Math.round((i * kueste.length) / n) % kueste.length];
    const k = brett.kanten[pos.kante];
    const h = brett.hexes[pos.hex];
    const mx = (brett.ecken[k.a].x + brett.ecken[k.b].x) / 2;
    const my = (brett.ecken[k.a].y + brett.ecken[k.b].y) / 2;
    haefen.push({ kante: k.id, typ: typen[i], x: h.x + (mx - h.x) * 1.75, y: h.y + (my - h.y) * 1.75 });
    brett.ecken[k.a].hafen = typen[i];
    brett.ecken[k.b].hafen = typen[i];
  }
  brett.haefen = haefen;
}

/** Wahr, wenn keine zwei roten Zahlen (6/8) auf benachbarten Feldern liegen. */
export function rotRegelOk(brett: Brett): boolean {
  for (const h of brett.hexes) {
    if (h.zahl !== 6 && h.zahl !== 8) continue;
    for (const n of h.nachbarn) {
      const z = brett.hexes[n].zahl;
      if (z === 6 || z === 8) return false;
    }
  }
  return true;
}

export function punkte(zahl: number | null): number {
  return zahl === null ? 0 : 6 - Math.abs(7 - zahl);
}

function belege(brett: Brett, rng: RngTraeger): void {
  const gelaende = mischen(rng, brett.gross ? GELAENDE_GROSS : GELAENDE_KLEIN);
  brett.hexes.forEach((h, i) => (h.gelaende = gelaende[i]));
  // Neu mischen, bis die 6/8-Regel erfüllt ist.
  for (;;) {
    const zahlen = mischen(rng, brett.gross ? ZAHLEN_GROSS : ZAHLEN_KLEIN);
    let i = 0;
    for (const h of brett.hexes) h.zahl = h.gelaende === 'wueste' ? null : zahlen[i++];
    if (rotRegelOk(brett)) return;
  }
}

/** Je kleiner, desto ausgeglichener. Nur für das feste Anfänger-Layout. */
function unwucht(brett: Brett): number {
  let s = 0;
  for (const h of brett.hexes) {
    for (const n of h.nachbarn) {
      if (n < h.id) continue;
      const o = brett.hexes[n];
      if (o.gelaende === h.gelaende) s += 4;
      if (o.zahl !== null && o.zahl === h.zahl) s += 5;
      if (punkte(o.zahl) === 1 && punkte(h.zahl) === 1) s += 3;
    }
  }
  // Ertrag je Geländeart möglichst gleich pro Feld
  const proArt = new Map<Gelaende, number[]>();
  for (const h of brett.hexes) {
    if (h.gelaende === 'wueste') continue;
    const l = proArt.get(h.gelaende) ?? [];
    l.push(punkte(h.zahl));
    proArt.set(h.gelaende, l);
  }
  const schnitte = [...proArt.values()].map((l) => l.reduce((a, b) => a + b, 0) / l.length);
  s += (Math.max(...schnitte) - Math.min(...schnitte)) * 6;
  // Keine überstarken Kreuzungen
  for (const e of brett.ecken) {
    const p = e.hexes.reduce((a, id) => a + punkte(brett.hexes[id].zahl), 0);
    if (p > 12) s += (p - 12) * 2;
  }
  return s;
}

/**
 * Erzeugt ein vollständiges Brett.
 * "anfaenger": festes, ausgeglichenes Layout (deterministisch, unabhängig vom Spiel-Seed).
 * "zufall": gemischt mit dem Spiel-RNG; 6 und 8 liegen nie nebeneinander.
 */
export function erzeugeBrett(gross: boolean, layout: Layout, rng: RngTraeger): Brett {
  const brett = baueGraph(gross);
  if (layout === 'zufall') {
    belege(brett, rng);
    setzeHaefen(brett, mischen(rng, gross ? HAEFEN_GROSS : HAEFEN_KLEIN));
    return brett;
  }
  const fest: RngTraeger = { rngState: gross ? 56 : 34 };
  let beste: { g: Gelaende[]; z: (number | null)[] } | null = null;
  let besteWertung = Infinity;
  for (let i = 0; i < 400; i++) {
    belege(brett, fest);
    const w = unwucht(brett);
    if (w < besteWertung) {
      besteWertung = w;
      beste = { g: brett.hexes.map((h) => h.gelaende), z: brett.hexes.map((h) => h.zahl) };
    }
  }
  brett.hexes.forEach((h, i) => {
    h.gelaende = beste!.g[i];
    h.zahl = beste!.z[i];
  });
  setzeHaefen(brett, gross ? HAEFEN_GROSS : HAEFEN_KLEIN);
  return brett;
}
