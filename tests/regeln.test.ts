import { describe, expect, it } from 'vitest';
import { gueltigeSiedlungsEcken, gueltigeStrassenKanten, strassenLaenge, eckeFrei } from '../src/engine';
import { fehler, gib, kanteZwischen, nachSetup, ok, pfad, spiel } from './hilfe';

/** Leeres Brett in der Aktionsphase von Spieler 0. */
function leer(n = 3) {
  const s = spiel(n);
  s.phase = 'aktion';
  s.zugNr = 1;
  return s;
}

describe('Abstandsregel', () => {
  it('Gründungsphase: Nachbarecken einer Siedlung sind gesperrt', () => {
    let s = spiel(3);
    s = ok(s, { typ: 'SIEDLUNG_BAUEN', spieler: 0, ecke: 0 });
    const nachbar = s.brett.ecken[0].nachbarn[0];
    s = ok(s, { typ: 'STRASSE_BAUEN', spieler: 0, kante: kanteZwischen(s, 0, nachbar) });
    expect(eckeFrei(s, nachbar)).toBe(false);
    fehler(s, { typ: 'SIEDLUNG_BAUEN', spieler: 1, ecke: nachbar });
    fehler(s, { typ: 'SIEDLUNG_BAUEN', spieler: 1, ecke: 0 });
    // Zwei Kanten entfernt ist erlaubt
    const weiter = s.brett.ecken[nachbar].nachbarn.find((e) => e !== 0)!;
    ok(s, { typ: 'SIEDLUNG_BAUEN', spieler: 1, ecke: weiter });
  });
  it('Bauphase: Siedlung braucht eigene Straße und Abstand', () => {
    const s = leer();
    const p = pfad(s, 10, 3);
    s.gebaeude[p.ecken[0]] = { spieler: 0, typ: 'siedlung' };
    s.spieler[0].siedlungenUebrig--;
    for (const k of p.kanten.slice(0, 2)) {
      s.strassen[k] = 0;
      s.spieler[0].strassenUebrig--;
    }
    gib(s, 0, { holz: 2, lehm: 2, wolle: 2, getreide: 2 });
    expect(gueltigeSiedlungsEcken(s, 0, false)).toEqual([p.ecken[2]]);
    fehler(s, { typ: 'SIEDLUNG_BAUEN', spieler: 0, ecke: p.ecken[1] }); // direkt neben eigener Siedlung
    fehler(s, { typ: 'SIEDLUNG_BAUEN', spieler: 0, ecke: p.ecken[3] }); // keine Straße dorthin
    ok(s, { typ: 'SIEDLUNG_BAUEN', spieler: 0, ecke: p.ecken[2] });
  });
});

describe('Straßenanschluss', () => {
  it('Straße muss ans eigene Netz anschließen', () => {
    const s = leer();
    const p = pfad(s, 10, 4);
    s.gebaeude[p.ecken[0]] = { spieler: 0, typ: 'siedlung' };
    gib(s, 0, { holz: 5, lehm: 5 });
    fehler(s, { typ: 'STRASSE_BAUEN', spieler: 0, kante: p.kanten[2] });
    let t = ok(s, { typ: 'STRASSE_BAUEN', spieler: 0, kante: p.kanten[0] });
    t = ok(t, { typ: 'STRASSE_BAUEN', spieler: 0, kante: p.kanten[1] });
    fehler(t, { typ: 'STRASSE_BAUEN', spieler: 0, kante: p.kanten[1] }); // belegt
    fehler(t, { typ: 'STRASSE_BAUEN', spieler: 1, kante: p.kanten[2] }); // nicht am Zug
  });
  it('fremde Siedlung blockiert das Weiterbauen', () => {
    const s = leer();
    const p = pfad(s, 10, 4);
    s.gebaeude[p.ecken[0]] = { spieler: 0, typ: 'siedlung' };
    s.strassen[p.kanten[0]] = 0;
    s.strassen[p.kanten[1]] = 0;
    s.gebaeude[p.ecken[2]] = { spieler: 1, typ: 'siedlung' };
    expect(gueltigeStrassenKanten(s, 0)).not.toContain(p.kanten[2]);
    delete s.gebaeude[p.ecken[2]];
    expect(gueltigeStrassenKanten(s, 0)).toContain(p.kanten[2]);
  });
  it('Gründungsphase: Straße muss an die neue Siedlung grenzen', () => {
    let s = spiel(3);
    s = ok(s, { typ: 'SIEDLUNG_BAUEN', spieler: 0, ecke: 0 });
    const fremd = s.brett.kanten.find((k) => k.a !== 0 && k.b !== 0)!.id;
    fehler(s, { typ: 'STRASSE_BAUEN', spieler: 0, kante: fremd });
    expect(gueltigeStrassenKanten(s, 0, 0).sort()).toEqual([...s.brett.ecken[0].kanten].sort());
  });
});

describe('Längste Handelsstraße', () => {
  it('einfacher Pfad', () => {
    const s = leer();
    for (const k of pfad(s, 0, 7).kanten) s.strassen[k] = 0;
    expect(strassenLaenge(s, 0)).toBe(7);
    expect(strassenLaenge(s, 1)).toBe(0);
  });
  it('Schleife um ein Feld zählt 6, mit Stichstraße 7', () => {
    const s = leer();
    const h = s.brett.hexes[9]; // Mittelfeld
    for (let i = 0; i < 6; i++) s.strassen[kanteZwischen(s, h.ecken[i], h.ecken[(i + 1) % 6])] = 0;
    expect(strassenLaenge(s, 0)).toBe(6);
    const aussen = s.brett.ecken[h.ecken[0]].kanten.find((k) => s.strassen[k] === undefined)!;
    s.strassen[aussen] = 0;
    expect(strassenLaenge(s, 0)).toBe(7);
  });
  it('Verzweigung: nur der längste Ast zählt', () => {
    const s = leer();
    const stamm = pfad(s, 0, 3);
    for (const k of stamm.kanten) s.strassen[k] = 0;
    const gabel = stamm.ecken[3];
    const aeste = s.brett.ecken[gabel].kanten.filter((k) => s.strassen[k] === undefined);
    expect(aeste.length).toBe(2);
    s.strassen[aeste[0]] = 0;
    s.strassen[aeste[1]] = 0;
    expect(strassenLaenge(s, 0)).toBe(4); // 3 + ein Ast, nicht 5
  });
  it('zwei Schleifen (Acht) werden korrekt durchlaufen', () => {
    const s = leer();
    const a = s.brett.hexes[9];
    const b = s.brett.hexes[a.nachbarn[0]];
    for (const h of [a, b]) for (let i = 0; i < 6; i++) s.strassen[kanteZwischen(s, h.ecken[i], h.ecken[(i + 1) % 6])] = 0;
    // 11 Kanten; als Kantenzug sind alle 11 erreichbar (zwei Ecken mit Grad 3 = Eulerweg)
    expect(Object.keys(s.strassen).length).toBe(11);
    expect(strassenLaenge(s, 0)).toBe(11);
  });
  it('fremde Siedlung unterbricht, eigene nicht', () => {
    const s = leer();
    const p = pfad(s, 0, 6);
    for (const k of p.kanten) s.strassen[k] = 0;
    s.gebaeude[p.ecken[2]] = { spieler: 0, typ: 'siedlung' };
    expect(strassenLaenge(s, 0)).toBe(6);
    s.gebaeude[p.ecken[2]] = { spieler: 1, typ: 'siedlung' };
    expect(strassenLaenge(s, 0)).toBe(4);
  });
  it('Vergabe ab 5, Gleichstand lässt die Karte beim Besitzer, Überholen wechselt', () => {
    let s = leer();
    const p0 = pfad(s, 0, 6);
    const tabu = [...p0.ecken, ...p0.ecken.flatMap((e) => s.brett.ecken[e].nachbarn)];
    const start1 = s.brett.ecken.find((e) => !tabu.includes(e.id) && e.nachbarn.every((n) => !tabu.includes(n)))!.id;
    const p1 = pfad(s, start1, 6, tabu);
    s.gebaeude[p0.ecken[0]] = { spieler: 0, typ: 'siedlung' };
    s.gebaeude[p1.ecken[0]] = { spieler: 1, typ: 'siedlung' };
    gib(s, 0, { holz: 6, lehm: 6 });
    gib(s, 1, { holz: 6, lehm: 6 });
    for (let i = 0; i < 4; i++) s = ok(s, { typ: 'STRASSE_BAUEN', spieler: 0, kante: p0.kanten[i] });
    expect(s.laengsteStrasse).toBe(null);
    s = ok(s, { typ: 'STRASSE_BAUEN', spieler: 0, kante: p0.kanten[4] });
    expect(s.laengsteStrasse).toBe(0);
    s.aktiv = 1;
    for (let i = 0; i < 5; i++) s = ok(s, { typ: 'STRASSE_BAUEN', spieler: 1, kante: p1.kanten[i] });
    expect(s.laengsteStrasse).toBe(0); // Gleichstand 5:5
    s = ok(s, { typ: 'STRASSE_BAUEN', spieler: 1, kante: p1.kanten[5] });
    expect(s.laengsteStrasse).toBe(1);
  });
  it('unterbrochen: der neue Längste bekommt sie; bei Gleichstand niemand', () => {
    // Spieler 0 hält mit 6, Spieler 1 und 2 haben je 5. Spieler 1 unterbricht -> Gleichstand 1/2 -> niemand.
    const s = leer(3);
    const p0 = pfad(s, 0, 6);
    for (const k of p0.kanten) s.strassen[k] = 0;
    s.laengsteStrasse = 0;
    const belegt = () => {
      const e = new Set<number>();
      for (const k of Object.keys(s.strassen).map(Number)) {
        e.add(s.brett.kanten[k].a);
        e.add(s.brett.kanten[k].b);
      }
      return [...e].flatMap((x) => [x, ...s.brett.ecken[x].nachbarn]);
    };
    for (const sp of [1, 2]) {
      const tabu = belegt();
      const start = s.brett.ecken.find((e) => !tabu.includes(e.id))!.id;
      for (const k of pfad(s, start, 5, tabu).kanten) s.strassen[k] = sp;
    }
    expect([0, 1, 2].map((i) => strassenLaenge(s, i))).toEqual([6, 5, 5]);
    // Spieler 1 baut mitten auf die Straße von 0 (dafür braucht er dort eine eigene Straße)
    const mitte = p0.ecken[3];
    const frei = s.brett.ecken[mitte].kanten.find((k) => s.strassen[k] === undefined)!;
    s.strassen[frei] = 1;
    s.aktiv = 1;
    gib(s, 1, { holz: 1, lehm: 1, wolle: 1, getreide: 1 });
    const t = ok(s, { typ: 'SIEDLUNG_BAUEN', spieler: 1, ecke: mitte });
    expect(strassenLaenge(t, 0)).toBe(3);
    expect(t.laengsteStrasse).toBe(null);
    // Variante: nur Spieler 1 hat 5 -> er bekommt sie
    for (const k of Object.keys(s.strassen).map(Number)) if (s.strassen[k] === 2) delete s.strassen[k];
    const u = ok(s, { typ: 'SIEDLUNG_BAUEN', spieler: 1, ecke: mitte });
    expect(u.laengsteStrasse).toBe(1);
  });
});

describe('Gründungsphase', () => {
  it('Schlangenreihenfolge und Startrohstoffe erst ab der zweiten Siedlung', () => {
    let s = spiel(4);
    const reihenfolge: number[] = [];
    while (s.phase === 'setup') {
      if (s.setup.erwartet === 'siedlung') {
        const n = s.spieler.length;
        reihenfolge.push(s.setup.schritt < n ? s.setup.schritt : 2 * n - 1 - s.setup.schritt);
        if (s.setup.schritt === n) expect(s.spieler.every((p) => Object.values(p.hand).every((x) => x === 0))).toBe(true);
      }
      s = ok(s, { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
    }
    expect(reihenfolge).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
    expect(s.phase).toBe('wuerfeln');
    expect(s.aktiv).toBe(0);
    for (const p of s.spieler) {
      expect(p.siedlungenUebrig).toBe(3);
      expect(p.strassenUebrig).toBe(13);
    }
    expect(s.spieler.some((p) => Object.values(p.hand).some((x) => x > 0))).toBe(true);
  });
  it('falscher Spieler wird abgelehnt', () => {
    const s = spiel(3);
    fehler(s, { typ: 'SIEDLUNG_BAUEN', spieler: 1, ecke: 0 });
    fehler(s, { typ: 'WUERFELN', spieler: 0 });
    expect(nachSetup(s).zugNr).toBe(1);
  });
});
