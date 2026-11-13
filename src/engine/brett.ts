// Brettgeometrie (Axialkoordinaten, spitze Hexfelder) und Brettgenerierung.
import { kartenFelder, type KartenId } from './karten';
import type { Brett, Ecke, Gelaende, Hafen, HafenTyp, Hex, Kante, Layout } from './typen';
import { mischen, zufall, type RngTraeger } from './rng';

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

/** Baut den reinen Graphen (ohne Gelände, Zahlen, Häfen). Ohne `koord` entsteht das klassische Brett. */
export function baueGraph(gross: boolean, koord: [number, number][] = hexKoordinaten(gross)): Brett {
  const hexes: Hex[] = [];
  const ecken: Ecke[] = [];
  const kanten: Kante[] = [];
  const eckeIndex = new Map<string, number>();
  const kanteIndex = new Map<string, number>();
  const hexIndex = new Map<string, number>();

  koord.forEach(([q, r], id) => {
    hexIndex.set(`${q},${r}`, id);
    hexes.push({ id, q, r, x: Math.round(W3 * (q + r / 2) * 1000) / 1000, y: 1.5 * r, gelaende: 'wueste', zahl: null, ecken: [], nachbarn: [] });
  });

  for (const h of hexes) {
    for (let i = 0; i < 6; i++) {
      const winkel = (Math.PI / 180) * (60 * i - 30);
      // Auf 3 Stellen runden: reicht fürs Zeichnen und hält die Netzwerknachrichten klein.
      const x = Math.round((h.x + Math.cos(winkel)) * 1000) / 1000;
      const y = Math.round((h.y + Math.sin(winkel)) * 1000) / 1000;
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

// ---------- Freie Karten (alles außer „Klassik“) ----------

/** Landfelder einer Karte. */
export function feldKoordinaten(karte: KartenId, gross: boolean): [number, number][] {
  return karte === 'klassik' ? hexKoordinaten(gross) : kartenFelder(karte, gross);
}

/** Gelände für n Felder im Verhältnis des Grundspiels (4:4:4:3:3), dazu 1–3 Wüsten. */
export function gelaendeFuer(n: number): Gelaende[] {
  // Höchstens zwei Wüsten: Auf den Zwillingsinseln bekommt jede Insel höchstens eine.
  const wuesten = n < 28 ? 1 : 2;
  const p = n - wuesten;
  const arten: [Gelaende, number][] = [['wald', 4], ['weide', 4], ['acker', 4], ['huegel', 3], ['gebirge', 3]];
  const genau = arten.map(([, anteil]) => (p * anteil) / 18);
  const anzahl = genau.map(Math.floor);
  // Die übrigen Felder gehen an die Arten mit dem größten Rest.
  const nachRest = arten.map((_, i) => i).sort((a, b) => genau[b] - anzahl[b] - (genau[a] - anzahl[a]) || a - b);
  for (let i = 0, rest = p - anzahl.reduce((a, b) => a + b, 0); i < rest; i++) anzahl[nachRest[i]]++;
  return [...arten.flatMap(([art], i) => Array<Gelaende>(anzahl[i]).fill(art)), ...Array<Gelaende>(wuesten).fill('wueste')];
}

/** Zahlenchips für n Ertragsfelder: volle Sätze des Grundspiels, den Rest von der Mitte der Würfelkurve her. */
export function zahlenFuer(n: number): number[] {
  const zusatz = [5, 9, 4, 10, 6, 8, 3, 11, 5, 9, 4, 10, 3, 11, 6, 8, 2, 12];
  const l: number[] = [];
  for (let i = 0; i < Math.floor(n / 18); i++) l.push(...ZAHLEN_KLEIN);
  return [...l, ...zusatz.slice(0, n % 18)];
}

/** Zusammenhängende Landmassen als Listen von Feld-IDs. */
export function inseln(brett: Brett): number[][] {
  const gesehen = new Set<number>();
  const liste: number[][] = [];
  for (const h of brett.hexes) {
    if (gesehen.has(h.id)) continue;
    const insel: number[] = [];
    const offen = [h.id];
    gesehen.add(h.id);
    while (offen.length) {
      const id = offen.pop()!;
      insel.push(id);
      for (const n of brett.hexes[id].nachbarn) {
        if (gesehen.has(n)) continue;
        gesehen.add(n);
        offen.push(n);
      }
    }
    liste.push(insel);
  }
  return liste;
}

/**
 * Wahr, wenn auf jeder Insel alle fünf Rohstoffe vorkommen (sonst säße dort jemand ohne Erz oder Lehm fest)
 * und keine Insel mehr als eine Wüste trägt.
 */
function jedeInselVollstaendig(brett: Brett, landmassen: number[][]): boolean {
  return landmassen.every((insel) => {
    const gelaende = insel.map((id) => brett.hexes[id].gelaende);
    return new Set(gelaende.filter((g) => g !== 'wueste')).size === 5 && gelaende.filter((g) => g === 'wueste').length <= 1;
  });
}

function belegeFrei(brett: Brett, rng: RngTraeger): void {
  const vorrat = gelaendeFuer(brett.hexes.length);
  const landmassen = inseln(brett);
  // Bei mehreren Inseln neu mischen, bis jede alle Rohstoffe hat (nach 200 Versuchen gilt die letzte Verteilung).
  for (let versuch = 0; versuch < 200; versuch++) {
    const gelaende = mischen(rng, vorrat);
    brett.hexes.forEach((h, i) => (h.gelaende = gelaende[i]));
    if (landmassen.length === 1 || jedeInselVollstaendig(brett, landmassen)) break;
  }
  const chips = zahlenFuer(brett.hexes.filter((h) => h.gelaende !== 'wueste').length);
  // Neu mischen, bis die 6/8-Regel erfüllt ist.
  for (;;) {
    const zahlen = mischen(rng, chips);
    let i = 0;
    for (const h of brett.hexes) h.zahl = h.gelaende === 'wueste' ? null : zahlen[i++];
    if (rotRegelOk(brett)) return;
  }
}

/**
 * Häfen für beliebige Küsten (mehrere Inseln, Buchten, Binnenseen): Der erste Platz wird gelost,
 * jeder weitere ist die Küstenkante, die am weitesten von allen bisherigen Häfen entfernt liegt.
 * Kein Hafen teilt eine Ecke mit einem anderen, und in jedem Wasserfeld liegt höchstens einer.
 */
function setzeHaefenFrei(brett: Brett, typen: HafenTyp[], rng: RngTraeger): void {
  const plaetze = kuestenKanten(brett).map(({ kante, hex }) => {
    const k = brett.kanten[kante];
    const h = brett.hexes[hex];
    const mx = (brett.ecken[k.a].x + brett.ecken[k.b].x) / 2;
    const my = (brett.ecken[k.a].y + brett.ecken[k.b].y) / 2;
    // Das Doppelte des Wegs zur Kantenmitte ist die Mitte des Wasserfelds dahinter.
    const wasser = `${Math.round((h.x + (mx - h.x) * 2) * 10)},${Math.round((h.y + (my - h.y) * 2) * 10)}`;
    return { k, x: h.x + (mx - h.x) * 1.75, y: h.y + (my - h.y) * 1.75, wasser };
  });
  const gewaehlt: typeof plaetze = [];
  const frei = (p: (typeof plaetze)[number]): boolean =>
    gewaehlt.every((g) => g.wasser !== p.wasser && g.k.a !== p.k.a && g.k.a !== p.k.b && g.k.b !== p.k.a && g.k.b !== p.k.b);
  const abstand = (p: (typeof plaetze)[number]): number => Math.min(...gewaehlt.map((g) => Math.hypot(g.x - p.x, g.y - p.y)));
  gewaehlt.push(plaetze[Math.floor(zufall(rng) * plaetze.length)]);
  while (gewaehlt.length < typen.length) {
    let bester: (typeof plaetze)[number] | null = null;
    let weite = -1;
    for (const p of plaetze) {
      if (!frei(p)) continue;
      const a = abstand(p);
      if (a > weite + 1e-9) {
        weite = a;
        bester = p;
      }
    }
    if (!bester) break; // Küste zu kurz für alle Häfen
    gewaehlt.push(bester);
  }
  for (const e of brett.ecken) e.hafen = null;
  brett.haefen = gewaehlt.map((p, i) => {
    brett.ecken[p.k.a].hafen = typen[i];
    brett.ecken[p.k.b].hafen = typen[i];
    return { kante: p.k.id, typ: typen[i], x: p.x, y: p.y };
  });
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
 * Andere Karten als "klassik" werden immer zufällig belegt; `layout` gilt für sie nicht.
 */
export function erzeugeBrett(gross: boolean, layout: Layout, rng: RngTraeger, karte: KartenId = 'klassik'): Brett {
  if (karte !== 'klassik') {
    const frei = baueGraph(gross, kartenFelder(karte, gross));
    belegeFrei(frei, rng);
    setzeHaefenFrei(frei, mischen(rng, gross ? HAEFEN_GROSS : HAEFEN_KLEIN), rng);
    return frei;
  }
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
