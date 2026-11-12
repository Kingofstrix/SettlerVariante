// Sonderbauphase abschaltbar, Abwurfgrenze, Logdaten, Statistik, Titel, Wunschliste.
import { describe, expect, it } from 'vitest';
import { GELAENDE_ROHSTOFF, leereStatistik, pruefeInvarianten, sichtFuer, titel, type GameState, type Rohstoff } from '../src/engine';
import { fehler, gib, naechsterWurf, ok, pfad, setze, spiel } from './hilfe';

function leer(n = 3, config = {}): GameState {
  const s = spiel(n, config);
  s.phase = 'aktion';
  s.zugNr = 1;
  return s;
}

/** Ertragsfeld mit Ecken, die an kein anderes Feld derselben Zahl grenzen. */
function feld(s: GameState) {
  for (const h of s.brett.hexes) {
    if (h.zahl === null || h.id === s.raeuber) continue;
    const ecken = h.ecken.filter((e) => s.brett.ecken[e].hexes.every((x) => x === h.id || s.brett.hexes[x].zahl !== h.zahl));
    if (ecken.length >= 2) return { h, ecken, r: GELAENDE_ROHSTOFF[h.gelaende] as Rohstoff };
  }
  throw new Error('kein Feld');
}

describe('Sonderbauphase abschaltbar', () => {
  it('aus: bei 5 Spielern geht es direkt zum nächsten Zug', () => {
    const s = leer(5, { sonderbauphase: false, sonderbauAutoSkip: false });
    const t = ok(s, { typ: 'ZUG_BEENDEN', spieler: 0 });
    expect(t.phase).toBe('wuerfeln');
    expect(t.aktiv).toBe(1);
    expect(t.sonderbau).toBeNull();
  });
  it('an (Standard): Sonderbauphase wie bisher', () => {
    const t = ok(leer(5, { sonderbauAutoSkip: false }), { typ: 'ZUG_BEENDEN', spieler: 0 });
    expect(t.phase).toBe('sonderbau');
  });
});

describe('Abwurfgrenze', () => {
  function mitSieben(grenze: number): GameState {
    const s = leer(3, { abwurfGrenze: grenze });
    s.phase = 'wuerfeln';
    gib(s, 0, { holz: 9 });
    gib(s, 1, { erz: 10 });
    naechsterWurf(s, 7);
    return ok(s, { typ: 'WUERFELN', spieler: 0 });
  }
  it('9: erst ab 10 Karten wird abgeworfen', () => {
    expect(mitSieben(9).abwerfen).toEqual({ 1: 5 });
  });
  it('7: wie bisher ab 8 Karten', () => {
    expect(mitSieben(7).abwerfen).toEqual({ 0: 4, 1: 5 });
  });
});

describe('Logdaten', () => {
  it('Bauen merkt Zug, Spieler und Ort', () => {
    const s = leer();
    setze(s, 0, 0, 'siedlung');
    const { kanten } = pfad(s, 0, 1);
    gib(s, 0, { holz: 1, lehm: 1 });
    const t = ok(s, { typ: 'STRASSE_BAUEN', spieler: 0, kante: kanten[0] });
    expect(t.log.at(-1)).toMatchObject({ zug: 1, wer: 0, ort: { kante: kanten[0] } });
  });
  it('geheime Texte bleiben geheim, Zusatzdaten kommen in der Sicht an', () => {
    const s = leer();
    gib(s, 0, { wolle: 1, getreide: 1, erz: 1 });
    const t = ok(s, { typ: 'ENTW_KAUFEN', spieler: 0 });
    const fremd = sichtFuer(t, 1).log.at(-1)!;
    expect(fremd).toEqual({ nr: t.logNr, text: 'S0 kauft eine Entwicklungskarte.', zug: 1, wer: 0 });
    expect(sichtFuer(t, 0).log.at(-1)!.text).toContain('kauft eine Entwicklungskarte:');
  });
});

describe('Würfelertrag fliegt vom Feld', () => {
  it('jede Bewegung nennt das Feld; Summe stimmt mit der Hand', () => {
    const s = leer();
    const { h, ecken, r } = feld(s);
    setze(s, ecken[0], 1, 'siedlung');
    setze(s, ecken[1], 1, 'stadt');
    s.phase = 'wuerfeln';
    naechsterWurf(s, h.zahl!);
    const t = ok(s, { typ: 'WUERFELN', spieler: 0 });
    const neu = t.bewegungen.filter((b) => b.nach === 1);
    expect(neu.every((b) => b.von === null && b.r === r && b.hex === h.id)).toBe(true);
    expect(neu.reduce((a, b) => a + b.n, 0)).toBe(t.spieler[1].hand[r]);
  });
});

describe('Statistik', () => {
  it('zählt Würfe, Ertrag, Handel und Diebstahl; Punkte je Zug', () => {
    let s = leer();
    const { h, ecken } = feld(s);
    setze(s, ecken[0], 1, 'siedlung');
    s.phase = 'wuerfeln';
    naechsterWurf(s, h.zahl!);
    s = ok(s, { typ: 'WUERFELN', spieler: 0 });
    expect(s.statistik.wuerfe[h.zahl!]).toBe(1);
    expect(s.statistik.ertrag[1]).toBe(1);
    gib(s, 0, { holz: 4, lehm: 1 });
    gib(s, 2, { wolle: 1 });
    s = ok(s, { typ: 'BANKHANDEL', spieler: 0, gib: 'holz', nimm: 'erz' });
    s = ok(s, { typ: 'HANDEL_ANBIETEN', spieler: 0, gib: { lehm: 1 }, nimm: { wolle: 1 }, an: null });
    s = ok(s, { typ: 'HANDEL_ANNEHMEN', spieler: 2, angebot: s.angebote[0].id });
    expect(s.statistik.handel).toEqual([2, 0, 1]);
    // Räuber auf das Feld mit Spieler 1: genau ein Kandidat, es wird direkt gestohlen
    s.phase = 'raeuber';
    s.nachRaeuber = 'aktion';
    s = ok(s, { typ: 'RAEUBER_SETZEN', spieler: 0, hex: h.id });
    expect(s.statistik.diebstahl).toEqual([1, 0, 0]);
    const vorher = s.statistik.punkte.length;
    s = ok(s, { typ: 'ZUG_BEENDEN', spieler: 0 });
    expect(s.statistik.punkte.length).toBe(vorher + 1);
    expect(s.statistik.punkte.at(-1)).toEqual([0, 1, 0]);
    expect(pruefeInvarianten(s)).toEqual([]);
  });
  it('erst bei Spielende in der Sicht', () => {
    const s = leer(3, { siegpunkte: 8 });
    for (let i = 0; i < 5; i++) {
      s.stapel.splice(s.stapel.indexOf('siegpunkt'), 1);
      s.spieler[0].entw.push({ typ: 'siegpunkt', gekauftInZug: 0 });
    }
    for (const e of [0, 2, 4]) setze(s, s.brett.hexes[e].ecken[0], 0, 'siedlung'); // 8 Punkte
    expect(sichtFuer(s, 1).statistik).toBeNull();
    const t = ok(s, { typ: 'WUNSCH_SETZEN', spieler: 0, suche: [], biete: [] }); // irgendeine Aktion prüft den Sieg
    expect(t.phase).toBe('ende');
    expect(sichtFuer(t, 1).statistik!.punkte.at(-1)).toEqual([8, 0, 0]);
  });
});

describe('Titel', () => {
  it('gehen an den Bestwert, Gleichstand an alle, nichts bei allen gleich', () => {
    const st = leereStatistik(3);
    st.diebstahl = [2, 2, 0];
    st.handel = [1, 1, 1];
    st.ertrag = [5, 9, 3];
    expect(titel(st)).toEqual([['Räuberbaron'], ['Räuberbaron'], ['Pechvogel']]);
    expect(titel(leereStatistik(3))).toEqual([[], [], []]);
  });
});

describe('Wunschliste', () => {
  it('jeder darf jederzeit setzen; Reihenfolge wird vereinheitlicht; für alle sichtbar', () => {
    const s = leer();
    const t = ok(s, { typ: 'WUNSCH_SETZEN', spieler: 2, suche: ['erz', 'holz'], biete: ['wolle'] });
    expect(t.spieler[2].wunsch).toEqual({ suche: ['holz', 'erz'], biete: ['wolle'] });
    expect(sichtFuer(t, 0).spieler[2].wunsch).toEqual({ suche: ['holz', 'erz'], biete: ['wolle'] });
    const leerer = ok(t, { typ: 'WUNSCH_SETZEN', spieler: 2, suche: [], biete: [] });
    expect(leerer.spieler[2].wunsch).toEqual({ suche: [], biete: [] });
  });
  it('lehnt Überschneidung und Unsinn ab', () => {
    const s = leer();
    fehler(s, { typ: 'WUNSCH_SETZEN', spieler: 1, suche: ['erz'], biete: ['erz'] });
    fehler(s, { typ: 'WUNSCH_SETZEN', spieler: 1, suche: ['gold' as Rohstoff], biete: [] });
    fehler(s, { typ: 'WUNSCH_SETZEN', spieler: 1, suche: 'erz' as unknown as Rohstoff[], biete: [] });
  });
});
