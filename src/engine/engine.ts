// Deterministischer Reducer: (state, aktion) => state | fehler. Alle Validierung passiert hier.
import { erzeugeBrett } from './brett';
import { KARTEN_NAME } from './karten';
import { mischen, waehle, zufall, zufallInt } from './rng';
import {
  anliegerGegner,
  gueltigeRaeuberHexes,
  gueltigeSiedlungsEcken,
  gueltigeStadtEcken,
  gueltigeStrassenKanten,
  kannZahlen,
  oeffentlichePunkte,
  strassenLaenge,
  tauschVerhaeltnis,
} from './regeln';
import {
  ENTW_NAME,
  GELAENDE_ROHSTOFF,
  GLUECKSRAD_CHANCE,
  KOSTEN,
  ROHSTOFFE,
  ROHSTOFF_NAME,
  STANDARD_CONFIG,
  leereRohstoffe,
  summe,
  type Aktion,
  type EntwTyp,
  type Ergebnis,
  type GameState,
  type Rohstoff,
  type Rohstoffe,
  type SpielConfig,
} from './typen';

const LOG_MAX = 300;

export function kartenProRohstoff(spielerzahl: number): number {
  return spielerzahl >= 5 ? 24 : 19;
}

export function entwStapel(spielerzahl: number): EntwTyp[] {
  const gross = spielerzahl >= 5;
  const n = gross ? 3 : 2;
  return [
    ...Array<EntwTyp>(gross ? 20 : 14).fill('ritter'),
    ...Array<EntwTyp>(5).fill('siegpunkt'),
    ...Array<EntwTyp>(n).fill('strassenbau'),
    ...Array<EntwTyp>(n).fill('erfindung'),
    ...Array<EntwTyp>(n).fill('monopol'),
  ];
}

export interface NeuesSpielOptionen {
  spieler: { name: string; farbe: string }[];
  seed: number;
  config?: Partial<SpielConfig>;
  /** Für Tests: Sitzreihenfolge nicht mischen. */
  ohneMischen?: boolean;
  /** Zusatz für die Logzeile zur Karte, z. B. das Ergebnis der Abstimmung. */
  kartenHinweis?: string;
}

export function neuesSpiel(opt: NeuesSpielOptionen): GameState {
  const n = opt.spieler.length;
  if (n < 3 || n > 6) throw new Error('Es werden 3 bis 6 Spieler benötigt.');
  const config: SpielConfig = { ...STANDARD_CONFIG, ...opt.config };
  const rng = { rngState: opt.seed | 0 };
  const reihenfolge = opt.ohneMischen ? opt.spieler : mischen(rng, opt.spieler);
  const brett = erzeugeBrett(n >= 5, config.layout, rng, config.karte);
  const stapel = mischen(rng, entwStapel(n));
  const proRohstoff = kartenProRohstoff(n);
  const s: GameState = {
    version: 1,
    seed: opt.seed | 0,
    rngState: rng.rngState,
    config,
    brett,
    gebaeude: {},
    strassen: {},
    raeuber: brett.hexes.find((h) => h.gelaende === 'wueste')!.id,
    bank: { holz: proRohstoff, lehm: proRohstoff, wolle: proRohstoff, getreide: proRohstoff, erz: proRohstoff },
    stapel,
    gespielteEntw: 0,
    spieler: reihenfolge.map((p, id) => ({
      id,
      name: p.name,
      farbe: p.farbe,
      hand: leereRohstoffe(),
      entw: [],
      gespielteRitter: 0,
      siedlungenUebrig: 5,
      staedteUebrig: 4,
      strassenUebrig: 15,
    })),
    aktiv: 0,
    zugNr: 0,
    phase: 'setup',
    setup: { schritt: 0, erwartet: 'siedlung', letzteEcke: null },
    wurf: null,
    abwerfen: {},
    nachRaeuber: 'aktion',
    stehlenKandidaten: [],
    entwGespielt: false,
    freieStrassen: 0,
    angebote: [],
    naechsteAngebotId: 1,
    sonderbau: null,
    laengsteStrasse: null,
    groessteMacht: null,
    gewinner: null,
    log: [],
    logNr: 0,
    bewegungen: [],
    bewegungNr: 0,
    gluecksrad: [],
    gluecksradNr: 0,
    gedreht: [],
    wurfStatistik: Array<number>(13).fill(0),
  };
  log(s, `Spiel gestartet (Seed ${s.seed}). Reihenfolge: ${s.spieler.map((p) => p.name).join(', ')}.`);
  if (config.karte !== 'klassik' || opt.kartenHinweis)
    log(s, `Karte: ${KARTEN_NAME[config.karte]}${opt.kartenHinweis ? ` (${opt.kartenHinweis})` : ''}.`);
  log(s, `Gründungsphase: ${s.spieler[0].name} setzt die erste Siedlung.`);
  return s;
}

// ---------- Hilfsfunktionen ----------

function log(s: GameState, text: string, geheim?: { fuer: number[]; text: string }): void {
  s.logNr++;
  s.log.push(geheim ? { nr: s.logNr, text, geheim } : { nr: s.logNr, text });
  if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX);
}

export function formatRohstoffe(r: Partial<Rohstoffe>): string {
  const teile = ROHSTOFFE.filter((k) => (r[k] ?? 0) > 0).map((k) => `${r[k]}× ${ROHSTOFF_NAME[k]}`);
  return teile.length ? teile.join(', ') : 'nichts';
}

function klon(s: GameState): GameState {
  return {
    ...s,
    gebaeude: { ...s.gebaeude },
    strassen: { ...s.strassen },
    bank: { ...s.bank },
    stapel: s.stapel.slice(),
    spieler: s.spieler.map((p) => ({ ...p, hand: { ...p.hand }, entw: p.entw.slice() })),
    setup: { ...s.setup },
    abwerfen: { ...s.abwerfen },
    stehlenKandidaten: s.stehlenKandidaten.slice(),
    angebote: s.angebote.map((a) => ({ ...a, an: a.an.slice(), abgelehnt: a.abgelehnt.slice() })),
    sonderbau: s.sonderbau ? { ...s.sonderbau } : null,
    log: s.log.slice(),
    bewegungen: s.bewegungen.slice(),
    gluecksrad: s.gluecksrad.slice(),
    gedreht: s.gedreht.slice(),
    wurfStatistik: s.wurfStatistik.slice(),
  };
}

/** Spieler, der in der Gründungsphase im gegebenen Schritt dran ist (Schlangenreihenfolge). */
export function setupSpieler(s: Pick<GameState, 'spieler' | 'setup'>): number {
  const n = s.spieler.length;
  return s.setup.schritt < n ? s.setup.schritt : 2 * n - 1 - s.setup.schritt;
}

/** Alle Spieler, die gerade etwas tun müssen bzw. dürfen. */
export function amZug(
  s: Pick<GameState, 'phase' | 'spieler' | 'setup' | 'abwerfen' | 'sonderbau' | 'aktiv'>,
): number[] {
  switch (s.phase) {
    case 'ende':
      return [];
    case 'setup':
      return [setupSpieler(s)];
    case 'abwerfen':
      return Object.keys(s.abwerfen).map(Number);
    case 'sonderbau':
      return s.sonderbau ? [s.sonderbau.reihenfolge[s.sonderbau.index]] : [];
    default:
      return [s.aktiv];
  }
}

export function gesamtPunkte(s: GameState, spieler: number): number {
  return oeffentlichePunkte(s, spieler) + s.spieler[spieler].entw.filter((k) => k.typ === 'siegpunkt').length;
}

const BEWEGUNGEN_MAX = 40;

/** Hält eine Kartenbewegung fest (nur für die Anzeige; ändert keine Karten). */
function bewege(s: GameState, von: number | null, nach: number | null, r: Rohstoff | 'entw', n: number): void {
  if (n <= 0) return;
  s.bewegungNr++;
  s.bewegungen.push({ nr: s.bewegungNr, von, nach, r, n });
  if (s.bewegungen.length > BEWEGUNGEN_MAX) s.bewegungen.splice(0, s.bewegungen.length - BEWEGUNGEN_MAX);
}

function zahle(s: GameState, spieler: number, kosten: Partial<Rohstoffe>): void {
  for (const r of ROHSTOFFE) {
    const n = kosten[r] ?? 0;
    s.spieler[spieler].hand[r] -= n;
    s.bank[r] += n;
    bewege(s, spieler, null, r, n);
  }
}

function bereinige(r: unknown): Rohstoffe | null {
  if (typeof r !== 'object' || r === null) return null;
  const aus = leereRohstoffe();
  for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
    if (!(ROHSTOFFE as readonly string[]).includes(k)) return null;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 99) return null;
    aus[k as Rohstoff] = v;
  }
  return aus;
}

function istRohstoff(r: unknown): r is Rohstoff {
  return typeof r === 'string' && (ROHSTOFFE as readonly string[]).includes(r);
}

/** Vergibt bzw. entzieht die Sonderkarte "Längste Handelsstraße". */
function aktualisiereStrasse(s: GameState): void {
  const laengen = s.spieler.map((p) => strassenLaenge(s, p.id));
  const max = Math.max(...laengen);
  const vorher = s.laengsteStrasse;
  let neu: number | null;
  if (max < 5) neu = null;
  else if (vorher !== null && laengen[vorher] === max) neu = vorher; // Gleichstand: Besitzer behält
  else {
    const beste = laengen.flatMap((l, i) => (l === max ? [i] : []));
    neu = beste.length === 1 ? beste[0] : null; // unterbrochen und Gleichstand: niemand
  }
  if (neu !== vorher) {
    s.laengsteStrasse = neu;
    if (neu !== null) log(s, `${s.spieler[neu].name} hat jetzt die Längste Handelsstraße (${max}).`);
    else if (vorher !== null) log(s, `${s.spieler[vorher].name} verliert die Längste Handelsstraße – niemand hält sie.`);
  }
}

function aktualisiereMacht(s: GameState, spieler: number): void {
  const n = s.spieler[spieler].gespielteRitter;
  const halter = s.groessteMacht;
  if (n >= 3 && halter !== spieler && (halter === null || n > s.spieler[halter].gespielteRitter)) {
    s.groessteMacht = spieler;
    log(s, `${s.spieler[spieler].name} hat jetzt die Größte Rittermacht (${n}).`);
  }
}

function verteile(s: GameState, zahl: number): string {
  const ertrag = s.spieler.map(() => leereRohstoffe());
  for (const h of s.brett.hexes) {
    if (h.zahl !== zahl || h.id === s.raeuber) continue;
    const r = GELAENDE_ROHSTOFF[h.gelaende];
    if (!r) continue;
    for (const e of h.ecken) {
      const g = s.gebaeude[e];
      if (g) ertrag[g.spieler][r] += g.typ === 'stadt' ? 2 : 1;
    }
  }
  const knapp: string[] = [];
  for (const r of ROHSTOFFE) {
    const berechtigte = ertrag.flatMap((e, i) => (e[r] > 0 ? [i] : []));
    const bedarf = berechtigte.reduce((a, i) => a + ertrag[i][r], 0);
    if (bedarf <= s.bank[r]) continue;
    // Bank reicht nicht: mehrere Berechtigte -> niemand; einer -> der Rest.
    if (berechtigte.length === 1) ertrag[berechtigte[0]][r] = s.bank[r];
    else for (const i of berechtigte) ertrag[i][r] = 0;
    knapp.push(ROHSTOFF_NAME[r]);
  }
  const teile: string[] = [];
  ertrag.forEach((e, i) => {
    if (summe(e) === 0) return;
    for (const r of ROHSTOFFE) {
      s.spieler[i].hand[r] += e[r];
      s.bank[r] -= e[r];
      bewege(s, null, i, r, e[r]);
    }
    teile.push(`${s.spieler[i].name} erhält ${formatRohstoffe(e)}`);
  });
  let text = teile.length ? teile.join('; ') : 'niemand erhält etwas';
  if (knapp.length) text += ` (Bank knapp: ${knapp.join(', ')})`;
  return text;
}

function stehle(s: GameState, dieb: number, opfer: number): void {
  const hand = s.spieler[opfer].hand;
  const karten: Rohstoff[] = ROHSTOFFE.flatMap((r) => Array<Rohstoff>(hand[r]).fill(r));
  if (karten.length === 0) return;
  const r = waehle(s, karten);
  hand[r]--;
  s.spieler[dieb].hand[r]++;
  bewege(s, opfer, dieb, r, 1);
  log(s, `${s.spieler[dieb].name} stiehlt eine Karte von ${s.spieler[opfer].name}.`, {
    fuer: [dieb, opfer],
    text: `${s.spieler[dieb].name} stiehlt 1× ${ROHSTOFF_NAME[r]} von ${s.spieler[opfer].name}.`,
  });
}

/** Kann der Spieler mit seiner Hand gerade irgendetwas bauen oder kaufen? */
export function kannEtwasBauen(s: GameState, spieler: number): boolean {
  const hand = s.spieler[spieler].hand;
  if (kannZahlen(hand, KOSTEN.strasse) && gueltigeStrassenKanten(s, spieler).length > 0) return true;
  if (kannZahlen(hand, KOSTEN.siedlung) && gueltigeSiedlungsEcken(s, spieler, false).length > 0) return true;
  if (kannZahlen(hand, KOSTEN.stadt) && gueltigeStadtEcken(s, spieler).length > 0) return true;
  if (kannZahlen(hand, KOSTEN.entwicklung) && s.stapel.length > 0) return true;
  return false;
}

function naechsterZug(s: GameState): void {
  s.aktiv = (s.aktiv + 1) % s.spieler.length;
  s.zugNr++;
  s.phase = 'wuerfeln';
  s.wurf = null;
  s.entwGespielt = false;
  s.freieStrassen = 0;
  s.sonderbau = null;
  s.angebote = [];
  log(s, `${s.spieler[s.aktiv].name} ist am Zug.`);
}

function sonderbauWeiter(s: GameState): void {
  const sb = s.sonderbau!;
  while (
    sb.index < sb.reihenfolge.length &&
    s.config.sonderbauAutoSkip &&
    !kannEtwasBauen(s, sb.reihenfolge[sb.index])
  )
    sb.index++;
  if (sb.index >= sb.reihenfolge.length) naechsterZug(s);
}

/** Gültige Ecken in der Gründungsphase: frei, Abstandsregel, und mindestens eine freie Kante für die Straße. */
export function gueltigeSetupEcken(s: Pick<GameState, 'brett' | 'gebaeude' | 'strassen'>): number[] {
  return s.brett.ecken
    .filter(
      (e) =>
        !s.gebaeude[e.id] &&
        e.nachbarn.every((n) => !s.gebaeude[n]) &&
        e.kanten.some((k) => s.strassen[k] === undefined),
    )
    .map((e) => e.id);
}

function setupWeiter(s: GameState): void {
  const n = s.spieler.length;
  s.setup = { schritt: s.setup.schritt + 1, erwartet: 'siedlung', letzteEcke: null };
  if (s.setup.schritt >= 2 * n) {
    s.phase = 'wuerfeln';
    s.aktiv = 0;
    s.zugNr = 1;
    log(s, `Die Gründungsphase ist beendet. ${s.spieler[0].name} beginnt.`);
  }
}

function pruefeSieg(s: GameState): void {
  if (s.phase === 'setup' || s.phase === 'sonderbau' || s.phase === 'ende') return;
  if (gesamtPunkte(s, s.aktiv) >= s.config.siegpunkte) {
    s.phase = 'ende';
    s.gewinner = s.aktiv;
    s.angebote = [];
    log(s, `🏆 ${s.spieler[s.aktiv].name} gewinnt mit ${gesamtPunkte(s, s.aktiv)} Siegpunkten!`);
  }
}

const UNGUELTIG = 'Diese Aktion ist gerade nicht möglich.';

// ---------- Aktionen ----------

function ausfuehren(s: GameState, a: Aktion): string | null {
  const p = s.spieler[a.spieler];
  if (a.typ !== 'ZEIT_ABGELAUFEN' && !p) return 'Unbekannter Spieler.';
  const istAktiv = a.spieler === s.aktiv;
  const baut =
    (s.phase === 'aktion' && istAktiv) ||
    (s.phase === 'sonderbau' && s.sonderbau!.reihenfolge[s.sonderbau!.index] === a.spieler);
  // Solange kostenlose Straßen (Straßenbau-Karte) offen sind, ist nur Straße bauen oder Zug beenden erlaubt.
  if (s.freieStrassen > 0 && istAktiv && !['STRASSE_BAUEN', 'ZUG_BEENDEN', 'ZEIT_ABGELAUFEN'].includes(a.typ))
    return 'Baue zuerst deine kostenlosen Straßen.';

  switch (a.typ) {
    case 'WUERFELN': {
      if (s.phase !== 'wuerfeln' || !istAktiv) return UNGUELTIG;
      const w: [number, number] = [zufallInt(s, 6) + 1, zufallInt(s, 6) + 1];
      s.wurf = w;
      const zahl = w[0] + w[1];
      s.wurfStatistik[zahl]++;
      if (zahl === 7) {
        s.abwerfen = {};
        s.gedreht = [];
        for (const q of s.spieler) {
          const n = summe(q.hand);
          if (n > 7) s.abwerfen[q.id] = Math.floor(n / 2);
        }
        const namen = Object.keys(s.abwerfen).map((i) => s.spieler[Number(i)].name);
        log(s, `${p.name} würfelt 7${namen.length ? ` – ${namen.join(', ')} ${namen.length > 1 ? 'müssen' : 'muss'} abwerfen` : ''}.`);
        s.nachRaeuber = 'aktion';
        s.phase = namen.length ? 'abwerfen' : 'raeuber';
      } else {
        log(s, `${p.name} würfelt ${zahl} – ${verteile(s, zahl)}.`);
        s.phase = 'aktion';
      }
      return null;
    }

    case 'ABWERFEN': {
      const soll = s.abwerfen[a.spieler];
      if (s.phase !== 'abwerfen' || soll === undefined) return UNGUELTIG;
      const karten = bereinige(a.karten);
      if (!karten || summe(karten) !== soll) return `Du musst genau ${soll} Karten abwerfen.`;
      if (!kannZahlen(p.hand, karten)) return 'So viele Karten hast du nicht.';
      zahle(s, a.spieler, karten);
      delete s.abwerfen[a.spieler];
      log(s, `${p.name} wirft ${soll} Karten ab.`);
      if (Object.keys(s.abwerfen).length === 0) s.phase = 'raeuber';
      return null;
    }

    case 'GLUECKSRAD_DREHEN': {
      const soll = s.abwerfen[a.spieler];
      if (!s.config.gluecksrad) return 'Das Glücksrad ist in dieser Partie aus.';
      if (s.phase !== 'abwerfen' || soll === undefined) return UNGUELTIG;
      if (s.gedreht.includes(a.spieler)) return 'Du hast schon am Glücksrad gedreht.';
      s.gedreht.push(a.spieler);
      const gewonnen = zufall(s) < GLUECKSRAD_CHANCE;
      const handSumme = summe(p.hand);
      const nachher = gewonnen ? 0 : Math.min(2 * soll, handSumme);
      s.gluecksradNr++;
      s.gluecksrad.push({ nr: s.gluecksradNr, spieler: a.spieler, gewonnen, vorher: soll, nachher, alle: !gewonnen && nachher === handSumme });
      if (s.gluecksrad.length > 10) s.gluecksrad.splice(0, s.gluecksrad.length - 10);
      if (gewonnen) {
        delete s.abwerfen[a.spieler];
        log(s, `🎰 ${p.name} dreht am Glücksrad – GEWONNEN! Kein Abwurf.`);
      } else if (nachher === handSumme) {
        // Doppeltes Soll ist die ganze Hand: alles direkt abwerfen
        zahle(s, a.spieler, { ...p.hand });
        delete s.abwerfen[a.spieler];
        log(s, `🎰 ${p.name} dreht am Glücksrad – verloren! Alle ${nachher} Karten sind weg.`);
      } else {
        s.abwerfen[a.spieler] = nachher;
        log(s, `🎰 ${p.name} dreht am Glücksrad – verloren! Jetzt ${nachher} statt ${soll} Karten abwerfen.`);
      }
      if (Object.keys(s.abwerfen).length === 0) s.phase = 'raeuber';
      return null;
    }

    case 'RAEUBER_SETZEN': {
      if (s.phase !== 'raeuber' || !istAktiv) return UNGUELTIG;
      if (!gueltigeRaeuberHexes(s, a.spieler).includes(a.hex)) return 'Dorthin darf der Räuber nicht.';
      s.raeuber = a.hex;
      const h = s.brett.hexes[a.hex];
      log(s, `${p.name} versetzt den Räuber${h.zahl ? ` auf die ${h.zahl}` : ' in die Wüste'}.`);
      const kandidaten = anliegerGegner(s, a.spieler, a.hex).filter((i) => summe(s.spieler[i].hand) > 0);
      if (kandidaten.length > 1) {
        s.stehlenKandidaten = kandidaten;
        s.phase = 'stehlen';
      } else {
        if (kandidaten.length === 1) stehle(s, a.spieler, kandidaten[0]);
        s.phase = s.nachRaeuber;
      }
      return null;
    }

    case 'STEHLEN': {
      if (s.phase !== 'stehlen' || !istAktiv) return UNGUELTIG;
      if (!s.stehlenKandidaten.includes(a.opfer)) return 'Diesen Spieler kannst du nicht bestehlen.';
      stehle(s, a.spieler, a.opfer);
      s.stehlenKandidaten = [];
      s.phase = s.nachRaeuber;
      return null;
    }

    case 'STRASSE_BAUEN': {
      if (s.phase === 'setup') {
        if (setupSpieler(s) !== a.spieler || s.setup.erwartet !== 'strasse') return UNGUELTIG;
        if (!gueltigeStrassenKanten(s, a.spieler, s.setup.letzteEcke).includes(a.kante))
          return 'Die Straße muss an deine neue Siedlung grenzen.';
        s.strassen[a.kante] = a.spieler;
        p.strassenUebrig--;
        log(s, `${p.name} baut eine Straße.`);
        setupWeiter(s);
        return null;
      }
      if (!baut) return UNGUELTIG;
      if (p.strassenUebrig <= 0) return 'Du hast keine Straßen mehr.';
      if (!gueltigeStrassenKanten(s, a.spieler).includes(a.kante)) return 'Hier kannst du keine Straße bauen.';
      if (s.freieStrassen > 0) s.freieStrassen--;
      else {
        if (!kannZahlen(p.hand, KOSTEN.strasse)) return 'Zu wenig Rohstoffe für eine Straße.';
        zahle(s, a.spieler, KOSTEN.strasse);
      }
      s.strassen[a.kante] = a.spieler;
      p.strassenUebrig--;
      log(s, `${p.name} baut eine Straße.`);
      if (s.freieStrassen > 0 && gueltigeStrassenKanten(s, a.spieler).length === 0) s.freieStrassen = 0;
      aktualisiereStrasse(s);
      return null;
    }

    case 'SIEDLUNG_BAUEN': {
      if (s.phase === 'setup') {
        if (setupSpieler(s) !== a.spieler || s.setup.erwartet !== 'siedlung') return UNGUELTIG;
        if (!gueltigeSetupEcken(s).includes(a.ecke)) return 'Hier kannst du keine Siedlung bauen.';
        s.gebaeude[a.ecke] = { spieler: a.spieler, typ: 'siedlung' };
        p.siedlungenUebrig--;
        let text = `${p.name} gründet eine Siedlung`;
        if (s.setup.schritt >= s.spieler.length) {
          // Startrohstoffe für die zweite Siedlung
          const start = leereRohstoffe();
          for (const h of s.brett.ecken[a.ecke].hexes) {
            const r = GELAENDE_ROHSTOFF[s.brett.hexes[h].gelaende];
            if (r && s.bank[r] > 0) {
              start[r]++;
              s.bank[r]--;
              p.hand[r]++;
            }
          }
          for (const r of ROHSTOFFE) bewege(s, null, a.spieler, r, start[r]);
          text += ` und erhält ${formatRohstoffe(start)}`;
        }
        log(s, text + '.');
        s.setup = { ...s.setup, erwartet: 'strasse', letzteEcke: a.ecke };
        return null;
      }
      if (!baut) return UNGUELTIG;
      if (p.siedlungenUebrig <= 0) return 'Du hast keine Siedlungen mehr.';
      if (!gueltigeSiedlungsEcken(s, a.spieler, false).includes(a.ecke)) return 'Hier kannst du keine Siedlung bauen.';
      if (!kannZahlen(p.hand, KOSTEN.siedlung)) return 'Zu wenig Rohstoffe für eine Siedlung.';
      zahle(s, a.spieler, KOSTEN.siedlung);
      s.gebaeude[a.ecke] = { spieler: a.spieler, typ: 'siedlung' };
      p.siedlungenUebrig--;
      log(s, `${p.name} baut eine Siedlung.`);
      aktualisiereStrasse(s); // eine Siedlung kann fremde Straßen unterbrechen
      return null;
    }

    case 'STADT_BAUEN': {
      if (!baut) return UNGUELTIG;
      if (p.staedteUebrig <= 0) return 'Du hast keine Städte mehr.';
      if (!gueltigeStadtEcken(s, a.spieler).includes(a.ecke)) return 'Hier steht keine eigene Siedlung.';
      if (!kannZahlen(p.hand, KOSTEN.stadt)) return 'Zu wenig Rohstoffe für eine Stadt.';
      zahle(s, a.spieler, KOSTEN.stadt);
      s.gebaeude[a.ecke] = { spieler: a.spieler, typ: 'stadt' };
      p.staedteUebrig--;
      p.siedlungenUebrig++;
      log(s, `${p.name} baut eine Stadt.`);
      return null;
    }

    case 'ENTW_KAUFEN': {
      if (!baut) return UNGUELTIG;
      if (s.stapel.length === 0) return 'Es gibt keine Entwicklungskarten mehr.';
      if (!kannZahlen(p.hand, KOSTEN.entwicklung)) return 'Zu wenig Rohstoffe für eine Entwicklungskarte.';
      zahle(s, a.spieler, KOSTEN.entwicklung);
      const typ = s.stapel.pop()!;
      p.entw.push({ typ, gekauftInZug: s.zugNr });
      bewege(s, null, a.spieler, 'entw', 1);
      log(s, `${p.name} kauft eine Entwicklungskarte.`, {
        fuer: [a.spieler],
        text: `${p.name} kauft eine Entwicklungskarte: ${ENTW_NAME[typ]}.`,
      });
      return null;
    }

    case 'RITTER_SPIELEN':
    case 'STRASSENBAU_SPIELEN':
    case 'ERFINDUNG_SPIELEN':
    case 'MONOPOL_SPIELEN': {
      const typ: EntwTyp =
        a.typ === 'RITTER_SPIELEN' ? 'ritter' : a.typ === 'STRASSENBAU_SPIELEN' ? 'strassenbau' : a.typ === 'ERFINDUNG_SPIELEN' ? 'erfindung' : 'monopol';
      // Ritter darf auch vor dem Würfeln gespielt werden, alle anderen erst danach.
      const phaseOk = s.phase === 'aktion' || (typ === 'ritter' && s.phase === 'wuerfeln');
      if (!istAktiv || !phaseOk) return UNGUELTIG;
      if (s.entwGespielt) return 'Du hast in diesem Zug schon eine Entwicklungskarte gespielt.';
      const idx = p.entw.findIndex((k) => k.typ === typ && k.gekauftInZug < s.zugNr);
      if (idx < 0)
        return p.entw.some((k) => k.typ === typ)
          ? 'Diese Karte hast du erst in diesem Zug gekauft.'
          : 'Diese Karte hast du nicht.';

      if (a.typ === 'STRASSENBAU_SPIELEN') {
        if (p.strassenUebrig <= 0 || gueltigeStrassenKanten(s, a.spieler).length === 0)
          return 'Du kannst gerade keine Straße bauen.';
        s.freieStrassen = Math.min(2, p.strassenUebrig);
        log(s, `${p.name} spielt Straßenbau.`);
      } else if (a.typ === 'ERFINDUNG_SPIELEN') {
        const r = a.rohstoffe;
        if (!Array.isArray(r) || r.length !== 2 || !istRohstoff(r[0]) || !istRohstoff(r[1])) return 'Wähle zwei Rohstoffe.';
        const bedarf = leereRohstoffe();
        bedarf[r[0]]++;
        bedarf[r[1]]++;
        if (!kannZahlen(s.bank, bedarf)) return 'Die Bank hat diese Rohstoffe nicht mehr.';
        for (const k of r) {
          s.bank[k]--;
          p.hand[k]++;
          bewege(s, null, a.spieler, k, 1);
        }
        log(s, `${p.name} spielt Erfindung und nimmt ${formatRohstoffe(bedarf)}.`);
      } else if (a.typ === 'MONOPOL_SPIELEN') {
        if (!istRohstoff(a.rohstoff)) return 'Wähle einen Rohstoff.';
        let n = 0;
        for (const q of s.spieler) {
          if (q.id === a.spieler) continue;
          n += q.hand[a.rohstoff];
          bewege(s, q.id, a.spieler, a.rohstoff, q.hand[a.rohstoff]);
          q.hand[a.rohstoff] = 0;
        }
        p.hand[a.rohstoff] += n;
        log(s, `${p.name} spielt Monopol auf ${ROHSTOFF_NAME[a.rohstoff]} und erhält ${n} Karten.`);
      } else {
        p.gespielteRitter++;
        log(s, `${p.name} spielt einen Ritter.`);
        aktualisiereMacht(s, a.spieler);
        s.nachRaeuber = s.phase === 'wuerfeln' ? 'wuerfeln' : 'aktion';
        s.phase = 'raeuber';
      }
      p.entw.splice(idx, 1);
      s.gespielteEntw++;
      s.entwGespielt = true;
      return null;
    }

    case 'BANKHANDEL': {
      if (s.phase !== 'aktion' || !istAktiv) return UNGUELTIG;
      if (!istRohstoff(a.gib) || !istRohstoff(a.nimm) || a.gib === a.nimm) return 'Ungültiger Tausch.';
      const v = tauschVerhaeltnis(s, a.spieler, a.gib);
      if (p.hand[a.gib] < v) return `Zu wenig ${ROHSTOFF_NAME[a.gib]} (du brauchst ${v}).`;
      if (s.bank[a.nimm] < 1) return `Die Bank hat kein ${ROHSTOFF_NAME[a.nimm]} mehr.`;
      p.hand[a.gib] -= v;
      s.bank[a.gib] += v;
      s.bank[a.nimm]--;
      p.hand[a.nimm]++;
      bewege(s, a.spieler, null, a.gib, v);
      bewege(s, null, a.spieler, a.nimm, 1);
      log(s, `${p.name} tauscht ${v}× ${ROHSTOFF_NAME[a.gib]} gegen 1× ${ROHSTOFF_NAME[a.nimm]} (${v}:1).`);
      return null;
    }

    case 'HANDEL_ANBIETEN': {
      if (s.phase !== 'aktion') return 'Handel ist nur in der Handels- und Bauphase möglich.';
      const gib = bereinige(a.gib);
      const nimm = bereinige(a.nimm);
      if (!gib || !nimm) return 'Ungültiges Angebot.';
      if (summe(gib) === 0 || summe(nimm) === 0) return 'Geschenke sind nicht erlaubt: beide Seiten müssen etwas geben.';
      if (ROHSTOFFE.some((r) => gib[r] > 0 && nimm[r] > 0)) return 'Derselbe Rohstoff kann nicht auf beiden Seiten stehen.';
      if (!kannZahlen(p.hand, gib)) return 'Du hast nicht, was du anbietest.';
      let an: number[];
      if (istAktiv) {
        const alle = s.spieler.map((q) => q.id).filter((i) => i !== a.spieler);
        an = a.an === null || a.an === undefined ? alle : alle.filter((i) => Array.isArray(a.an) && a.an.includes(i));
        if (an.length === 0) return 'Wähle mindestens einen Mitspieler.';
      } else {
        an = [s.aktiv]; // Gegenangebot: nur an den aktiven Spieler
        s.angebote = s.angebote.filter((o) => o.von !== a.spieler);
      }
      if (s.angebote.filter((o) => o.von === a.spieler).length >= 4) return 'Zu viele offene Angebote.';
      s.angebote.push({ id: s.naechsteAngebotId++, von: a.spieler, an, abgelehnt: [], gib, nimm });
      const ziel = an.length === s.spieler.length - 1 ? 'alle' : an.map((i) => s.spieler[i].name).join(', ');
      log(s, `${p.name} bietet ${formatRohstoffe(gib)} für ${formatRohstoffe(nimm)} (an ${ziel}).`);
      return null;
    }

    case 'HANDEL_ANNEHMEN': {
      const o = s.angebote.find((x) => x.id === a.angebot);
      if (s.phase !== 'aktion' || !o || !o.an.includes(a.spieler)) return 'Dieses Angebot ist nicht mehr gültig.';
      const von = s.spieler[o.von];
      if (!kannZahlen(von.hand, o.gib)) {
        s.angebote = s.angebote.filter((x) => x.id !== o.id);
        return 'Dieses Angebot ist nicht mehr gültig.';
      }
      if (!kannZahlen(p.hand, o.nimm)) return 'Dir fehlen die Rohstoffe für diesen Handel.';
      for (const r of ROHSTOFFE) {
        von.hand[r] += o.nimm[r] - o.gib[r];
        p.hand[r] += o.gib[r] - o.nimm[r];
        bewege(s, o.von, a.spieler, r, o.gib[r]);
        bewege(s, a.spieler, o.von, r, o.nimm[r]);
      }
      s.angebote = s.angebote.filter((x) => x.id !== o.id);
      log(s, `${von.name} und ${p.name} handeln: ${formatRohstoffe(o.gib)} gegen ${formatRohstoffe(o.nimm)}.`);
      return null;
    }

    case 'HANDEL_ABLEHNEN': {
      const o = s.angebote.find((x) => x.id === a.angebot);
      if (!o || !o.an.includes(a.spieler)) return 'Dieses Angebot ist nicht mehr gültig.';
      o.an = o.an.filter((i) => i !== a.spieler);
      o.abgelehnt.push(a.spieler);
      if (o.an.length === 0) s.angebote = s.angebote.filter((x) => x.id !== o.id);
      return null;
    }

    case 'HANDEL_ZURUECKZIEHEN': {
      const o = s.angebote.find((x) => x.id === a.angebot);
      if (!o || o.von !== a.spieler) return 'Dieses Angebot ist nicht mehr gültig.';
      s.angebote = s.angebote.filter((x) => x.id !== o.id);
      return null;
    }

    case 'ZUG_BEENDEN': {
      if (s.phase !== 'aktion' || !istAktiv) return UNGUELTIG;
      s.angebote = [];
      s.freieStrassen = 0;
      if (s.spieler.length >= 5) {
        // Sonderbauphase (nur 5–6 Spieler): alle anderen dürfen reihum bauen.
        const n = s.spieler.length;
        const reihenfolge = Array.from({ length: n - 1 }, (_, i) => (s.aktiv + 1 + i) % n);
        s.sonderbau = { reihenfolge, index: 0 };
        s.phase = 'sonderbau';
        sonderbauWeiter(s);
      } else naechsterZug(s);
      return null;
    }

    case 'SONDERBAU_FERTIG': {
      if (s.phase !== 'sonderbau' || s.sonderbau!.reihenfolge[s.sonderbau!.index] !== a.spieler) return UNGUELTIG;
      s.sonderbau!.index++;
      sonderbauWeiter(s);
      return null;
    }

    case 'ZEIT_ABGELAUFEN': {
      // Genau ein Standardschritt; der Host ruft so oft auf, bis der Zug vorbei ist.
      switch (s.phase) {
        case 'setup': {
          const sp = setupSpieler(s);
          return s.setup.erwartet === 'siedlung'
            ? ausfuehren(s, { typ: 'SIEDLUNG_BAUEN', spieler: sp, ecke: waehle(s, gueltigeSetupEcken(s)) })
            : ausfuehren(s, {
                typ: 'STRASSE_BAUEN',
                spieler: sp,
                kante: waehle(s, gueltigeStrassenKanten(s, sp, s.setup.letzteEcke)),
              });
        }
        case 'wuerfeln':
          return ausfuehren(s, { typ: 'WUERFELN', spieler: s.aktiv });
        case 'abwerfen': {
          for (const [id, soll] of Object.entries(s.abwerfen)) {
            const q = s.spieler[Number(id)];
            const karten = mischen(s, ROHSTOFFE.flatMap((r) => Array<Rohstoff>(q.hand[r]).fill(r))).slice(0, soll);
            const wurf = leereRohstoffe();
            for (const k of karten) wurf[k]++;
            const f = ausfuehren(s, { typ: 'ABWERFEN', spieler: q.id, karten: wurf });
            if (f) return f;
          }
          return null;
        }
        case 'raeuber':
          return ausfuehren(s, { typ: 'RAEUBER_SETZEN', spieler: s.aktiv, hex: waehle(s, gueltigeRaeuberHexes(s, s.aktiv)) });
        case 'stehlen':
          return ausfuehren(s, { typ: 'STEHLEN', spieler: s.aktiv, opfer: waehle(s, s.stehlenKandidaten) });
        case 'aktion':
          return ausfuehren(s, { typ: 'ZUG_BEENDEN', spieler: s.aktiv });
        case 'sonderbau':
          return ausfuehren(s, { typ: 'SONDERBAU_FERTIG', spieler: s.sonderbau!.reihenfolge[s.sonderbau!.index] });
        default:
          return UNGUELTIG;
      }
    }

    default:
      return UNGUELTIG; // unbekannter Aktionstyp
  }
}

/** Wendet eine Aktion an. Der übergebene Zustand wird nie verändert. */
export function anwenden(state: GameState, aktion: Aktion): Ergebnis {
  if (state.phase === 'ende') return { ok: false, fehler: 'Das Spiel ist beendet.' };
  if (typeof aktion !== 'object' || aktion === null) return { ok: false, fehler: UNGUELTIG };
  const s = klon(state);
  let fehler: string | null;
  try {
    fehler = ausfuehren(s, aktion) ?? null;
  } catch {
    // Fehlerhafte Nutzdaten (z. B. unbekannte IDs) dürfen den Host nie abstürzen lassen.
    fehler = UNGUELTIG;
  }
  if (fehler) return { ok: false, fehler };
  pruefeSieg(s);
  return { ok: true, state: s };
}
