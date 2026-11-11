import { describe, expect, it } from 'vitest';
import {
  GELAENDE_ROHSTOFF,
  anwenden,
  gesamtPunkte,
  gueltigeRaeuberHexes,
  pruefeInvarianten,
  sichtFuer,
  summe,
  tauschVerhaeltnis,
  type GameState,
  type Rohstoff,
} from '../src/engine';
import { fehler, gib, leere, naechsterWurf, nachSetup, ok, pfad, setze, spiel } from './hilfe';

/** Leeres Brett, Spieler 0 in der Aktionsphase. */
function leer(n = 3, config = {}): GameState {
  const s = spiel(n, config);
  s.phase = 'aktion';
  s.zugNr = 1;
  return s;
}

/** Feld mit Zahl (nicht Wüste), dazu Rohstoff. */
function ertragsFeld(s: GameState) {
  const h = s.brett.hexes.find((x) => x.zahl !== null && x.id !== s.raeuber)!;
  // andere Felder mit derselben Zahl stören die Tests nicht, weil dort nichts steht
  return { h, r: GELAENDE_ROHSTOFF[h.gelaende] as Rohstoff };
}

describe('Rohstoffverteilung', () => {
  it('Siedlung 1, Stadt 2; Räuberfeld liefert nichts', () => {
    const s = leer();
    const { h, r } = ertragsFeld(s);
    setze(s, h.ecken[0], 1, 'siedlung');
    setze(s, h.ecken[2], 2, 'stadt');
    s.phase = 'wuerfeln';
    naechsterWurf(s, h.zahl!);
    const t = ok(s, { typ: 'WUERFELN', spieler: 0 });
    expect(t.spieler[1].hand[r]).toBe(1);
    expect(t.spieler[2].hand[r]).toBe(2);
    expect(t.phase).toBe('aktion');
    expect(t.log.at(-1)!.text).toContain(`S0 würfelt ${h.zahl}`);
    expect(pruefeInvarianten(t)).toEqual([]);
    s.raeuber = h.id;
    naechsterWurf(s, h.zahl!);
    const u = ok(s, { typ: 'WUERFELN', spieler: 0 });
    expect(u.spieler[1].hand[r] + u.spieler[2].hand[r]).toBe(0);
  });
  it('Bank knapp: mehrere Berechtigte -> niemand; einer -> der Rest', () => {
    const s = leer();
    const { h, r } = ertragsFeld(s);
    setze(s, h.ecken[0], 1, 'stadt');
    setze(s, h.ecken[2], 2, 'stadt');
    gib(s, 0, { [r]: s.bank[r] - 3 }); // Bank hat noch 3, Bedarf 4
    s.phase = 'wuerfeln';
    naechsterWurf(s, h.zahl!);
    const t = ok(s, { typ: 'WUERFELN', spieler: 0 });
    expect(t.spieler[1].hand[r]).toBe(0);
    expect(t.spieler[2].hand[r]).toBe(0);
    expect(t.bank[r]).toBe(3);
    // nur ein Berechtigter mit Bedarf 2, Bank hat 1
    delete s.gebaeude[h.ecken[2]];
    s.spieler[2].staedteUebrig++;
    gib(s, 0, { [r]: 2 });
    naechsterWurf(s, h.zahl!);
    const u = ok(s, { typ: 'WUERFELN', spieler: 0 });
    expect(u.spieler[1].hand[r]).toBe(1);
    expect(u.bank[r]).toBe(0);
    expect(pruefeInvarianten(u)).toEqual([]);
  });
});

describe('Die 7', () => {
  function mitSieben(): GameState {
    const s = leer(4);
    gib(s, 0, { holz: 8 }); // 8 -> 4 abwerfen
    gib(s, 1, { lehm: 7 }); // genau 7 -> nichts
    gib(s, 2, { erz: 5, wolle: 4 }); // 9 -> 4 abwerfen
    s.phase = 'wuerfeln';
    naechsterWurf(s, 7);
    return ok(s, { typ: 'WUERFELN', spieler: 0 });
  }
  it('mehr als 7 Karten: Hälfte abgerundet, parallel', () => {
    let s = mitSieben();
    expect(s.phase).toBe('abwerfen');
    expect(s.abwerfen).toEqual({ 0: 4, 2: 4 });
    fehler(s, { typ: 'ABWERFEN', spieler: 1, karten: { lehm: 3 } });
    fehler(s, { typ: 'ABWERFEN', spieler: 0, karten: { holz: 3 } }); // zu wenig
    fehler(s, { typ: 'ABWERFEN', spieler: 2, karten: { holz: 4 } }); // hat er nicht
    fehler(s, { typ: 'RAEUBER_SETZEN', spieler: 0, hex: 0 }); // erst abwerfen
    s = ok(s, { typ: 'ABWERFEN', spieler: 2, karten: { erz: 2, wolle: 2 } }); // Reihenfolge egal
    expect(s.phase).toBe('abwerfen');
    s = ok(s, { typ: 'ABWERFEN', spieler: 0, karten: { holz: 4 } });
    expect(s.phase).toBe('raeuber');
    expect(summe(s.spieler[0].hand)).toBe(4);
    expect(summe(s.spieler[2].hand)).toBe(5);
    expect(pruefeInvarianten(s)).toEqual([]);
  });
  it('Zeitablauf wirft zufällig ab', () => {
    const s = ok(mitSieben(), { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
    expect(s.phase).toBe('raeuber');
    expect(summe(s.spieler[0].hand)).toBe(4);
    expect(pruefeInvarianten(s)).toEqual([]);
  });
  it('Räuber: nicht aufs selbe Feld; stiehlt eine Karte vom Anlieger', () => {
    let s = mitSieben();
    s = ok(s, { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
    fehler(s, { typ: 'RAEUBER_SETZEN', spieler: 0, hex: s.raeuber });
    fehler(s, { typ: 'RAEUBER_SETZEN', spieler: 1, hex: 0 });
    const ziel = s.brett.hexes.find((h) => h.id !== s.raeuber)!;
    setze(s, ziel.ecken[0], 1, 'siedlung');
    setze(s, ziel.ecken[3], 3, 'siedlung'); // hat keine Karten -> kein Kandidat
    const vorher = summe(s.spieler[1].hand);
    const t = ok(s, { typ: 'RAEUBER_SETZEN', spieler: 0, hex: ziel.id });
    expect(t.raeuber).toBe(ziel.id);
    expect(summe(t.spieler[1].hand)).toBe(vorher - 1);
    expect(t.phase).toBe('aktion');
    // Geheimer Logtext nur für Dieb und Opfer
    expect(sichtFuer(t, 0).log.at(-1)!.text).toContain('Lehm');
    expect(sichtFuer(t, 2).log.at(-1)!.text).not.toContain('Lehm');
    expect(sichtFuer(t, null).log.at(-1)!.text).not.toContain('Lehm');
  });
  it('mehrere Kandidaten: Auswahl nötig', () => {
    let s = ok(mitSieben(), { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
    const ziel = s.brett.hexes.find((h) => h.id !== s.raeuber)!;
    setze(s, ziel.ecken[0], 1, 'siedlung');
    setze(s, ziel.ecken[3], 2, 'siedlung');
    s = ok(s, { typ: 'RAEUBER_SETZEN', spieler: 0, hex: ziel.id });
    expect(s.phase).toBe('stehlen');
    expect(s.stehlenKandidaten).toEqual([1, 2]);
    fehler(s, { typ: 'STEHLEN', spieler: 0, opfer: 3 });
    fehler(s, { typ: 'ZUG_BEENDEN', spieler: 0 });
    s = ok(s, { typ: 'STEHLEN', spieler: 0, opfer: 2 });
    expect(summe(s.spieler[2].hand)).toBe(4);
    expect(s.phase).toBe('aktion');
  });
  it('Freundlicher Räuber schützt Spieler mit höchstens 2 Punkten', () => {
    const s = leer(3, { freundlicherRaeuber: true });
    const ziel = s.brett.hexes.find((h) => h.id !== s.raeuber)!;
    setze(s, ziel.ecken[0], 1, 'siedlung');
    expect(gueltigeRaeuberHexes(s, 0)).not.toContain(ziel.id);
    setze(s, ziel.ecken[0], 1, 'stadt');
    setze(s, ziel.ecken[3], 1, 'siedlung'); // 3 Punkte
    expect(gueltigeRaeuberHexes(s, 0)).toContain(ziel.id);
  });
});

describe('Bauen und Kosten', () => {
  it('Kosten werden abgezogen, Stadt gibt die Siedlung zurück, Figurenlimit', () => {
    let s = leer();
    const p = pfad(s, 10, 2);
    setze(s, p.ecken[0], 0, 'siedlung');
    s.spieler[0].siedlungenUebrig = 4;
    fehler(s, { typ: 'STRASSE_BAUEN', spieler: 0, kante: p.kanten[0] }); // keine Rohstoffe
    fehler(s, { typ: 'STADT_BAUEN', spieler: 0, ecke: p.ecken[0] });
    fehler(s, { typ: 'ENTW_KAUFEN', spieler: 0 });
    gib(s, 0, { holz: 1, lehm: 1, getreide: 2, erz: 3 });
    s = ok(s, { typ: 'STRASSE_BAUEN', spieler: 0, kante: p.kanten[0] });
    s = ok(s, { typ: 'STADT_BAUEN', spieler: 0, ecke: p.ecken[0] });
    expect(summe(s.spieler[0].hand)).toBe(0);
    expect(s.spieler[0].siedlungenUebrig).toBe(5);
    expect(s.spieler[0].staedteUebrig).toBe(3);
    expect(s.spieler[0].strassenUebrig).toBe(14);
    gib(s, 0, { getreide: 2, erz: 3 });
    fehler(s, { typ: 'STADT_BAUEN', spieler: 0, ecke: p.ecken[0] }); // schon Stadt
    s.spieler[0].strassenUebrig = 0;
    gib(s, 0, { holz: 1, lehm: 1 });
    expect(fehler(s, { typ: 'STRASSE_BAUEN', spieler: 0, kante: p.kanten[1] })).toContain('keine Straßen');
  });
  it('vor dem Würfeln darf nicht gebaut oder gehandelt werden', () => {
    const s = nachSetup(spiel(3));
    gib(s, 0, { holz: 4, lehm: 4 });
    fehler(s, { typ: 'ENTW_KAUFEN', spieler: 0 });
    fehler(s, { typ: 'BANKHANDEL', spieler: 0, gib: 'holz', nimm: 'erz' });
    fehler(s, { typ: 'ZUG_BEENDEN', spieler: 0 });
    fehler(s, { typ: 'HANDEL_ANBIETEN', spieler: 0, gib: { holz: 1 }, nimm: { erz: 1 }, an: null });
  });
});

describe('Entwicklungskarten', () => {
  function mitKarte(typ: 'ritter' | 'strassenbau' | 'erfindung' | 'monopol' | 'siegpunkt', gekauftInZug = 0): GameState {
    const s = leer(4);
    s.zugNr = 5;
    const i = s.stapel.indexOf(typ);
    s.stapel.splice(i, 1);
    s.spieler[0].entw.push({ typ, gekauftInZug });
    return s;
  }
  it('Kauf: Kosten, verdeckt, nicht im selben Zug spielbar', () => {
    let s = leer();
    s.zugNr = 3;
    s.stapel[s.stapel.length - 1] = 'ritter';
    s.stapel[0] = s.stapel[0]; // (Bilanz bleibt: nur Reihenfolge)
    const vorher = s.stapel.filter((x) => x === 'ritter').length;
    void vorher;
    gib(s, 0, { wolle: 1, getreide: 1, erz: 1 });
    s = ok(s, { typ: 'ENTW_KAUFEN', spieler: 0 });
    expect(s.spieler[0].entw.length).toBe(1);
    expect(summe(s.spieler[0].hand)).toBe(0);
    const typ = s.spieler[0].entw[0].typ;
    expect(sichtFuer(s, 1).spieler[0].entw).toBe(null);
    expect(sichtFuer(s, 1).spieler[0].entwAnzahl).toBe(1);
    expect(sichtFuer(s, 0).spieler[0].entw![0].typ).toBe(typ);
    if (typ === 'ritter') expect(fehler(s, { typ: 'RITTER_SPIELEN', spieler: 0 })).toContain('erst in diesem Zug');
  });
  it('im Kaufzug nicht spielbar, im nächsten schon', () => {
    const s = mitKarte('ritter', 5);
    expect(fehler(s, { typ: 'RITTER_SPIELEN', spieler: 0 })).toContain('erst in diesem Zug');
    s.spieler[0].entw[0].gekauftInZug = 4;
    ok(s, { typ: 'RITTER_SPIELEN', spieler: 0 });
  });
  it('höchstens eine Karte pro Zug', () => {
    let s = mitKarte('ritter');
    s.spieler[0].entw.push({ typ: 'monopol', gekauftInZug: 0 });
    s.stapel.splice(s.stapel.indexOf('monopol'), 1);
    s = ok(s, { typ: 'MONOPOL_SPIELEN', spieler: 0, rohstoff: 'holz' });
    expect(fehler(s, { typ: 'RITTER_SPIELEN', spieler: 0 })).toContain('schon eine');
    expect(pruefeInvarianten(s)).toEqual([]);
  });
  it('Ritter vor dem Würfeln: danach wird gewürfelt; andere Karten nicht vor dem Würfeln', () => {
    let s = mitKarte('ritter');
    s.spieler[0].entw.push({ typ: 'monopol', gekauftInZug: 0 });
    s.stapel.splice(s.stapel.indexOf('monopol'), 1);
    s.phase = 'wuerfeln';
    fehler(s, { typ: 'MONOPOL_SPIELEN', spieler: 0, rohstoff: 'holz' });
    fehler(s, { typ: 'RITTER_SPIELEN', spieler: 1 });
    s = ok(s, { typ: 'RITTER_SPIELEN', spieler: 0 });
    expect(s.phase).toBe('raeuber');
    s = ok(s, { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
    while (s.phase === 'stehlen') s = ok(s, { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
    expect(s.phase).toBe('wuerfeln');
    expect(s.spieler[0].gespielteRitter).toBe(1);
  });
  it('Größte Rittermacht ab 3, Gleichstand bleibt beim Besitzer', () => {
    const s = leer(3);
    s.zugNr = 9;
    const spiele = (st: GameState, sp: number): GameState => {
      st.aktiv = sp;
      st.phase = 'aktion';
      st.entwGespielt = false;
      st.stapel.splice(st.stapel.indexOf('ritter'), 1);
      st.spieler[sp].entw.push({ typ: 'ritter', gekauftInZug: 0 });
      let t = ok(st, { typ: 'RITTER_SPIELEN', spieler: sp });
      while (t.phase !== 'aktion') t = ok(t, { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
      return t;
    };
    let t = spiele(spiele(s, 0), 0);
    expect(t.groessteMacht).toBe(null);
    t = spiele(t, 0);
    expect(t.groessteMacht).toBe(0);
    t = spiele(spiele(spiele(t, 1), 1), 1);
    expect(t.groessteMacht).toBe(0); // 3:3
    t = spiele(t, 1);
    expect(t.groessteMacht).toBe(1);
  });
  it('Straßenbau: zwei kostenlose Straßen, bei einer Reststraße nur eine', () => {
    let s = mitKarte('strassenbau');
    const p = pfad(s, 10, 3);
    setze(s, p.ecken[0], 0, 'siedlung');
    s = ok(s, { typ: 'STRASSENBAU_SPIELEN', spieler: 0 });
    expect(s.freieStrassen).toBe(2);
    expect(fehler(s, { typ: 'ENTW_KAUFEN', spieler: 0 })).toContain('kostenlosen');
    s = ok(s, { typ: 'STRASSE_BAUEN', spieler: 0, kante: p.kanten[0] });
    s = ok(s, { typ: 'STRASSE_BAUEN', spieler: 0, kante: p.kanten[1] });
    expect(s.freieStrassen).toBe(0);
    fehler(s, { typ: 'STRASSE_BAUEN', spieler: 0, kante: p.kanten[2] }); // jetzt wieder kostenpflichtig
    const t = mitKarte('strassenbau');
    setze(t, p.ecken[0], 0, 'siedlung');
    t.spieler[0].strassenUebrig = 1;
    expect(ok(t, { typ: 'STRASSENBAU_SPIELEN', spieler: 0 }).freieStrassen).toBe(1);
  });
  it('Erfindung nimmt zwei Rohstoffe aus der Bank; Monopol sammelt ein', () => {
    let s = mitKarte('erfindung');
    s = ok(s, { typ: 'ERFINDUNG_SPIELEN', spieler: 0, rohstoffe: ['erz', 'erz'] });
    expect(s.spieler[0].hand.erz).toBe(2);
    const leerBank = mitKarte('erfindung');
    gib(leerBank, 1, { erz: leerBank.bank.erz - 1 });
    expect(fehler(leerBank, { typ: 'ERFINDUNG_SPIELEN', spieler: 0, rohstoffe: ['erz', 'erz'] })).toContain('Bank');
    let m = mitKarte('monopol');
    gib(m, 1, { wolle: 3, holz: 1 });
    gib(m, 2, { wolle: 2 });
    m = ok(m, { typ: 'MONOPOL_SPIELEN', spieler: 0, rohstoff: 'wolle' });
    expect(m.spieler[0].hand.wolle).toBe(5);
    expect(m.spieler[1].hand).toMatchObject({ wolle: 0, holz: 1 });
    expect(pruefeInvarianten(m)).toEqual([]);
  });
  it('Siegpunktkarten zählen verdeckt und sofort', () => {
    const s = mitKarte('siegpunkt', 5);
    expect(gesamtPunkte(s, 0)).toBe(1);
    expect(sichtFuer(s, 1).spieler[0].punkte).toBe(0);
    expect(sichtFuer(s, 0).eigenePunkte).toBe(1);
  });
});

describe('Handel', () => {
  it('Bank 4:1, Hafen 3:1 und 2:1', () => {
    let s = leer();
    gib(s, 0, { holz: 4 });
    expect(tauschVerhaeltnis(s, 0, 'holz')).toBe(4);
    fehler(s, { typ: 'BANKHANDEL', spieler: 0, gib: 'holz', nimm: 'holz' });
    fehler(s, { typ: 'BANKHANDEL', spieler: 0, gib: 'erz', nimm: 'holz' });
    let t = ok(s, { typ: 'BANKHANDEL', spieler: 0, gib: 'holz', nimm: 'erz' });
    expect(t.spieler[0].hand).toMatchObject({ holz: 0, erz: 1 });
    // 3:1-Hafen
    const alle = s.brett.ecken.find((e) => e.hafen === 'alle')!.id;
    setze(s, alle, 0, 'siedlung');
    expect(tauschVerhaeltnis(s, 0, 'holz')).toBe(3);
    t = ok(s, { typ: 'BANKHANDEL', spieler: 0, gib: 'holz', nimm: 'erz' });
    expect(t.spieler[0].hand).toMatchObject({ holz: 1, erz: 1 });
    // 2:1-Hafen nur für den passenden Rohstoff
    const wolle = s.brett.ecken.find((e) => e.hafen === 'wolle')!.id;
    setze(s, wolle, 0, 'stadt');
    expect(tauschVerhaeltnis(s, 0, 'wolle')).toBe(2);
    expect(tauschVerhaeltnis(s, 0, 'holz')).toBe(3);
    expect(tauschVerhaeltnis(s, 1, 'wolle')).toBe(4); // Gegner profitiert nicht
    gib(s, 0, { wolle: 2 });
    t = ok(s, { typ: 'BANKHANDEL', spieler: 0, gib: 'wolle', nimm: 'lehm' });
    expect(t.spieler[0].hand).toMatchObject({ wolle: 0, lehm: 1 });
    expect(pruefeInvarianten(t)).toEqual([]);
    // Bank leer
    gib(s, 1, { erz: s.bank.erz });
    expect(fehler(s, { typ: 'BANKHANDEL', spieler: 0, gib: 'wolle', nimm: 'erz' })).toContain('Bank');
  });
  it('Spielerhandel: nur mit dem aktiven Spieler, keine Geschenke, zweite Annahme ungültig', () => {
    let s = leer(4);
    gib(s, 0, { holz: 2 });
    gib(s, 1, { erz: 1 });
    gib(s, 2, { erz: 1 });
    expect(fehler(s, { typ: 'HANDEL_ANBIETEN', spieler: 0, gib: { holz: 1 }, nimm: {}, an: null })).toContain('Geschenke');
    fehler(s, { typ: 'HANDEL_ANBIETEN', spieler: 0, gib: {}, nimm: { erz: 1 }, an: null });
    fehler(s, { typ: 'HANDEL_ANBIETEN', spieler: 0, gib: { holz: 1 }, nimm: { holz: 1 }, an: null });
    fehler(s, { typ: 'HANDEL_ANBIETEN', spieler: 0, gib: { lehm: 1 }, nimm: { erz: 1 }, an: null }); // hat er nicht
    s = ok(s, { typ: 'HANDEL_ANBIETEN', spieler: 0, gib: { holz: 1 }, nimm: { erz: 1 }, an: [1, 2] });
    const id = s.angebote[0].id;
    fehler(s, { typ: 'HANDEL_ANNEHMEN', spieler: 3, angebot: id }); // nicht adressiert
    const t = ok(s, { typ: 'HANDEL_ANNEHMEN', spieler: 1, angebot: id });
    expect(t.spieler[0].hand).toMatchObject({ holz: 1, erz: 1 });
    expect(t.spieler[1].hand).toMatchObject({ holz: 1, erz: 0 });
    expect(fehler(t, { typ: 'HANDEL_ANNEHMEN', spieler: 2, angebot: id })).toContain('nicht mehr gültig');
    // Gegenangebot geht nur an den aktiven Spieler
    let g = ok(s, { typ: 'HANDEL_ANBIETEN', spieler: 2, gib: { erz: 1 }, nimm: { holz: 2 }, an: [1] });
    const gegen = g.angebote.find((o) => o.von === 2)!;
    expect(gegen.an).toEqual([0]);
    fehler(g, { typ: 'HANDEL_ANNEHMEN', spieler: 1, angebot: gegen.id });
    g = ok(g, { typ: 'HANDEL_ANNEHMEN', spieler: 0, angebot: gegen.id });
    expect(g.spieler[0].hand).toMatchObject({ holz: 0, erz: 1 });
    // Ablehnen aller Empfänger entfernt das Angebot; Zugende räumt auf
    let a = ok(s, { typ: 'HANDEL_ABLEHNEN', spieler: 1, angebot: id });
    a = ok(a, { typ: 'HANDEL_ABLEHNEN', spieler: 2, angebot: id });
    expect(a.angebote.length).toBe(0);
    expect(ok(s, { typ: 'ZUG_BEENDEN', spieler: 0 }).angebote.length).toBe(0);
  });
});

describe('Sonderbauphase (5–6 Spieler)', () => {
  it('3–4 Spieler: keine Sonderbauphase', () => {
    const s = ok(leer(4), { typ: 'ZUG_BEENDEN', spieler: 0 });
    expect(s.phase).toBe('wuerfeln');
    expect(s.aktiv).toBe(1);
  });
  it('alle anderen bauen reihum; nur Bauen und Kaufen erlaubt', () => {
    let s = leer(5, { sonderbauAutoSkip: false });
    s.aktiv = 2;
    for (const i of [0, 1, 3, 4]) gib(s, i, { wolle: 4, getreide: 1, erz: 1, holz: 1 });
    s.spieler[3].entw.push({ typ: 'ritter', gekauftInZug: 0 });
    s.stapel.splice(s.stapel.indexOf('ritter'), 1);
    s = ok(s, { typ: 'ZUG_BEENDEN', spieler: 2 });
    expect(s.phase).toBe('sonderbau');
    expect(s.sonderbau!.reihenfolge).toEqual([3, 4, 0, 1]);
    fehler(s, { typ: 'ENTW_KAUFEN', spieler: 4 }); // noch nicht dran
    fehler(s, { typ: 'BANKHANDEL', spieler: 3, gib: 'wolle', nimm: 'lehm' });
    fehler(s, { typ: 'HANDEL_ANBIETEN', spieler: 3, gib: { wolle: 1 }, nimm: { lehm: 1 }, an: null });
    fehler(s, { typ: 'RITTER_SPIELEN', spieler: 3 });
    fehler(s, { typ: 'WUERFELN', spieler: 3 });
    s = ok(s, { typ: 'ENTW_KAUFEN', spieler: 3 });
    s = ok(s, { typ: 'SONDERBAU_FERTIG', spieler: 3 });
    s = ok(s, { typ: 'SONDERBAU_FERTIG', spieler: 4 });
    s = ok(s, { typ: 'ZEIT_ABGELAUFEN', spieler: 0 }); // Timer überspringt Spieler 0
    expect(s.sonderbau!.index).toBe(3);
    s = ok(s, { typ: 'SONDERBAU_FERTIG', spieler: 1 });
    expect(s.phase).toBe('wuerfeln');
    expect(s.aktiv).toBe(3);
    expect(pruefeInvarianten(s)).toEqual([]);
  });
  it('Auto-Skip überspringt Spieler, die nichts bauen können', () => {
    const s = leer(6);
    gib(s, 4, { wolle: 1, getreide: 1, erz: 1 });
    let t = ok(s, { typ: 'ZUG_BEENDEN', spieler: 0 });
    expect(t.phase).toBe('sonderbau');
    expect(t.sonderbau!.reihenfolge[t.sonderbau!.index]).toBe(4);
    t = ok(t, { typ: 'SONDERBAU_FERTIG', spieler: 4 });
    expect(t.phase).toBe('wuerfeln');
    leere(s, 4);
    expect(ok(s, { typ: 'ZUG_BEENDEN', spieler: 0 }).phase).toBe('wuerfeln');
  });
  it('wer in der Sonderbauphase 10 Punkte erreicht, gewinnt erst im eigenen Zug', () => {
    let s = leer(5, { sonderbauAutoSkip: false });
    for (const e of [0, 10, 20, 30]) setze(s, e, 1, 'stadt');
    s.spieler[1].staedteUebrig = 0;
    setze(s, 40, 1, 'siedlung');
    setze(s, 50, 1, 'siedlung');
    s.spieler[1].siedlungenUebrig = 3;
    expect(gesamtPunkte(s, 1)).toBe(10);
    s.aktiv = 3;
    s = ok(s, { typ: 'ZUG_BEENDEN', spieler: 3 });
    expect(s.phase).toBe('sonderbau');
    while (s.phase === 'sonderbau') s = ok(s, { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
    expect(s.gewinner).toBe(null); // Spieler 4 ist dran
    while (s.aktiv !== 1 && s.phase !== 'ende') s = ok(s, { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
    expect(s.phase).toBe('ende');
    expect(s.gewinner).toBe(1);
  });
});

describe('Siegbedingung', () => {
  function fastFertig(config = {}): GameState {
    const s = leer(3, config);
    for (const e of [0, 10, 20, 30]) setze(s, e, 0, 'stadt');
    s.spieler[0].staedteUebrig = 0;
    setze(s, 40, 0, 'siedlung');
    s.spieler[0].siedlungenUebrig = 4;
    return s; // 9 Punkte
  }
  it('10 Punkte im eigenen Zug beenden das Spiel; verdeckte Siegpunktkarte zählt', () => {
    const s = fastFertig();
    expect(gesamtPunkte(s, 0)).toBe(9);
    s.stapel[s.stapel.length - 1] = 'siegpunkt';
    s.stapel[s.stapel.indexOf('siegpunkt')] = 'ritter';
    s.stapel[s.stapel.length - 1] = 'siegpunkt';
    gib(s, 0, { wolle: 1, getreide: 1, erz: 1 });
    const t = ok(s, { typ: 'ENTW_KAUFEN', spieler: 0 });
    if (t.spieler[0].entw[0].typ === 'siegpunkt') {
      expect(t.phase).toBe('ende');
      expect(t.gewinner).toBe(0);
      expect(sichtFuer(t, 1).endstand).toEqual([10, 0, 0]);
      expect(anwenden(t, { typ: 'ZUG_BEENDEN', spieler: 0 }).ok).toBe(false);
    }
  });
  it('nicht aktiver Spieler mit 10 Punkten gewinnt erst zu Beginn seines Zugs', () => {
    let s = fastFertig();
    s.spieler[0].entw.push({ typ: 'siegpunkt', gekauftInZug: 0 });
    s.stapel.splice(s.stapel.indexOf('siegpunkt'), 1);
    s.aktiv = 1;
    gib(s, 1, { holz: 4 });
    s = ok(s, { typ: 'BANKHANDEL', spieler: 1, gib: 'holz', nimm: 'erz' });
    expect(s.phase).toBe('aktion');
    s = ok(s, { typ: 'ZUG_BEENDEN', spieler: 1 });
    s = ok(s, { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
    while (s.phase !== 'aktion' && s.phase !== 'ende') s = ok(s, { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
    if (s.phase !== 'ende') s = ok(s, { typ: 'ZUG_BEENDEN', spieler: 2 });
    expect(s.phase).toBe('ende');
    expect(s.gewinner).toBe(0);
  });
  it('Variante: 8 Siegpunkte', () => {
    const s = fastFertig({ siegpunkte: 8 });
    gib(s, 0, { holz: 4 });
    expect(ok(s, { typ: 'BANKHANDEL', spieler: 0, gib: 'holz', nimm: 'erz' }).gewinner).toBe(0);
  });
});

describe('Robustheit', () => {
  it('kaputte Nutzdaten werden abgelehnt, der Zustand bleibt unverändert', () => {
    const s = leer();
    const vorher = JSON.stringify(s);
    const kaputt: unknown[] = [
      null,
      { typ: 'GIBTS_NICHT', spieler: 0 },
      { typ: 'STRASSE_BAUEN', spieler: 0, kante: 'x' },
      { typ: 'STRASSE_BAUEN', spieler: 99, kante: 1 },
      { typ: 'RAEUBER_SETZEN', spieler: 0, hex: -1 },
      { typ: 'ABWERFEN', spieler: 0, karten: { gold: 3 } },
      { typ: 'HANDEL_ANBIETEN', spieler: 0, gib: { holz: -1 }, nimm: { erz: 1.5 }, an: 'alle' },
      { typ: 'ERFINDUNG_SPIELEN', spieler: 0 },
      { typ: 'BANKHANDEL', spieler: 0, gib: 'gold', nimm: 'holz' },
    ];
    for (const a of kaputt) expect(anwenden(s, a as never).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(vorher);
  });
  it('gleicher Seed, gleiche Aktionen -> gleicher Zustand', () => {
    const lauf = () => {
      let s = nachSetup(spiel(4, {}, 77));
      for (let i = 0; i < 40; i++) s = ok(s, { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
      return JSON.stringify(s);
    };
    expect(lauf()).toBe(lauf());
  });
});
