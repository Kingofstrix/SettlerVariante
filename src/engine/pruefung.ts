// Invarianten und Zufallsaktionen – für Simulationstests und den Debug-Modus.
import { amZug, entwStapel, goldSoll, gueltigeSetupEcken, kartenProRohstoff, setupSpieler } from './engine';
import { waehle, zufall, type RngTraeger } from './rng';
import {
  beweglicheSchiffe,
  eckeAnLand,
  gueltigeRaeuberHexes,
  gueltigeSchiffKanten,
  landKante,
  meerKante,
  schiffZiele,
  gueltigeSiedlungsEcken,
  gueltigeStadtEcken,
  gueltigeStrassenKanten,
  kannZahlen,
  tauschVerhaeltnis,
} from './regeln';
import { KOSTEN, ROHSTOFFE, SCHIFFE_JE_SPIELER, leereRohstoffe, summe, type Aktion, type GameState, type Rohstoff } from './typen';

/** Prüft die Kartenbilanz und weitere Invarianten. Liefert eine Liste von Verstößen (leer = alles gut). */
export function pruefeInvarianten(s: GameState): string[] {
  const fehler: string[] = [];
  const n = s.spieler.length;
  for (const r of ROHSTOFFE) {
    if (s.bank[r] < 0) fehler.push(`Bank negativ: ${r}`);
    let gesamt = s.bank[r];
    for (const p of s.spieler) {
      if (p.hand[r] < 0 || !Number.isInteger(p.hand[r])) fehler.push(`Hand ungültig: ${p.name} ${r}`);
      gesamt += p.hand[r];
    }
    if (gesamt !== kartenProRohstoff(n)) fehler.push(`Kartenbilanz ${r}: ${gesamt}`);
  }
  const entw = s.stapel.length + s.gespielteEntw + s.spieler.reduce((a, p) => a + p.entw.length, 0);
  if (entw !== entwStapel(n).length) fehler.push(`Entwicklungskarten-Bilanz: ${entw}`);
  for (const p of s.spieler) {
    const geb = Object.values(s.gebaeude).filter((g) => g.spieler === p.id);
    const sied = geb.filter((g) => g.typ === 'siedlung').length;
    const stadt = geb.length - sied;
    const str = Object.values(s.strassen).filter((x) => x === p.id).length;
    if (sied + p.siedlungenUebrig !== 5) fehler.push(`Siedlungen ${p.name}`);
    if (stadt + p.staedteUebrig !== 4) fehler.push(`Städte ${p.name}`);
    if (str + p.strassenUebrig !== 15) fehler.push(`Straßen ${p.name}`);
    if (p.siedlungenUebrig < 0 || p.staedteUebrig < 0 || p.strassenUebrig < 0) fehler.push(`Figuren negativ ${p.name}`);
    const schiffe = Object.values(s.schiffe).filter((x) => x === p.id).length;
    const soll = s.config.variante === 'seefahrer' ? SCHIFFE_JE_SPIELER : 0;
    if (schiffe + p.schiffeUebrig !== soll || p.schiffeUebrig < 0) fehler.push(`Schiffe ${p.name}`);
  }
  // Seefahrer: Straßen an Land, Schiffe auf dem Wasser, nie beides auf einer Kante, Gebäude an Land
  for (const k of Object.keys(s.strassen).map(Number)) {
    if (!landKante(s.brett, k)) fehler.push(`Straße im Meer an Kante ${k}`);
    if (s.schiffe[k] !== undefined) fehler.push(`Straße und Schiff an Kante ${k}`);
  }
  for (const k of Object.keys(s.schiffe).map(Number)) if (!meerKante(s.brett, k)) fehler.push(`Schiff an Land an Kante ${k}`);
  for (const e of Object.keys(s.gebaeude).map(Number)) if (!eckeAnLand(s.brett, e)) fehler.push(`Gebäude im Meer an Ecke ${e}`);
  if (s.brett.hexes[s.raeuber].gelaende === 'meer') fehler.push('Räuber im Meer');
  if (s.pirat !== null && s.brett.hexes[s.pirat].gelaende !== 'meer') fehler.push('Pirat an Land');
  if (s.phase === 'gold' && Object.keys(s.gold).length === 0) fehler.push('Goldphase ohne Gold');
  // Abstandsregel
  for (const e of Object.keys(s.gebaeude).map(Number))
    for (const nb of s.brett.ecken[e].nachbarn) if (s.gebaeude[nb]) fehler.push(`Abstandsregel verletzt an Ecke ${e}`);
  if (s.phase !== 'ende' && amZug(s).length === 0) fehler.push('Niemand ist am Zug');
  return fehler;
}

/** Die Kante, die am nächsten an Land abseits der Startinseln liegt (Seefahrer-Simulation). */
function naechsteZuNeuemLand(s: GameState, kanten: number[]): number {
  const start = s.brett.startInseln ?? [];
  const ziele = s.brett.hexes.filter((h) => h.insel !== undefined && !start.includes(h.insel));
  if (!ziele.length) return kanten[0];
  const abstand = (kid: number): number => {
    const k = s.brett.kanten[kid];
    const x = (s.brett.ecken[k.a].x + s.brett.ecken[k.b].x) / 2;
    const y = (s.brett.ecken[k.a].y + s.brett.ecken[k.b].y) / 2;
    return Math.min(...ziele.map((h) => Math.hypot(h.x - x, h.y - y)));
  };
  return kanten.reduce((best, k) => (abstand(k) < abstand(best) ? k : best));
}

/** Wählt zufällig eine gültige Aktion (bevorzugt Bauen, damit Simulationen vorankommen). */
export function zufallsAktion(s: GameState, rng: RngTraeger): Aktion | null {
  const dran = amZug(s);
  if (dran.length === 0) return null;
  switch (s.phase) {
    case 'setup': {
      const sp = setupSpieler(s);
      if (s.setup.erwartet === 'siedlung') return { typ: 'SIEDLUNG_BAUEN', spieler: sp, ecke: waehle(rng, gueltigeSetupEcken(s)) };
      const strassen = gueltigeStrassenKanten(s, sp, s.setup.letzteEcke);
      const schiffe = gueltigeSchiffKanten(s, sp, s.setup.letzteEcke);
      if (schiffe.length && (!strassen.length || zufall(rng) < 0.5)) return { typ: 'SCHIFF_BAUEN', spieler: sp, kante: waehle(rng, schiffe) };
      return { typ: 'STRASSE_BAUEN', spieler: sp, kante: waehle(rng, strassen) };
    }
    case 'gold': {
      const sp = waehle(rng, dran);
      const bank = { ...s.bank };
      const karten = leereRohstoffe();
      for (let i = 0; i < goldSoll(s, sp); i++) {
        const r = waehle(rng, ROHSTOFFE.filter((x) => bank[x] > 0));
        bank[r]--;
        karten[r]++;
      }
      return { typ: 'GOLD_WAEHLEN', spieler: sp, rohstoffe: karten };
    }
    case 'abwerfen': {
      const sp = waehle(rng, dran);
      if (s.config.gluecksrad && !s.gedreht.includes(sp) && zufall(rng) < 0.5) return { typ: 'GLUECKSRAD_DREHEN', spieler: sp };
      const hand = { ...s.spieler[sp].hand };
      const karten = leereRohstoffe();
      for (let i = 0; i < s.abwerfen[sp]; i++) {
        const r = waehle(rng, ROHSTOFFE.filter((x) => hand[x] > 0));
        hand[r]--;
        karten[r]++;
      }
      return { typ: 'ABWERFEN', spieler: sp, karten };
    }
    case 'raeuber':
      return { typ: 'RAEUBER_SETZEN', spieler: s.aktiv, hex: waehle(rng, gueltigeRaeuberHexes(s, s.aktiv)) };
    case 'stehlen':
      return { typ: 'STEHLEN', spieler: s.aktiv, opfer: waehle(rng, s.stehlenKandidaten) };
    case 'wuerfeln': {
      const p = s.spieler[s.aktiv];
      if (!s.entwGespielt && p.entw.some((k) => k.typ === 'ritter' && k.gekauftInZug < s.zugNr) && zufall(rng) < 0.3)
        return { typ: 'RITTER_SPIELEN', spieler: s.aktiv };
      return { typ: 'WUERFELN', spieler: s.aktiv };
    }
    case 'aktion':
    case 'sonderbau': {
      const sp = dran[0];
      const p = s.spieler[sp];
      const kandidaten: Aktion[] = [];
      const strassen = gueltigeStrassenKanten(s, sp);
      const schiffe = gueltigeSchiffKanten(s, sp);
      if (s.freieStrassen > 0 && s.phase === 'aktion') {
        if (schiffe.length && (!strassen.length || zufall(rng) < 0.5)) return { typ: 'SCHIFF_BAUEN', spieler: sp, kante: waehle(rng, schiffe) };
        return strassen.length ? { typ: 'STRASSE_BAUEN', spieler: sp, kante: waehle(rng, strassen) } : { typ: 'ZUG_BEENDEN', spieler: sp };
      }
      // Seefahrer: Schiffe bauen (gern, damit Inseln erreicht werden) und versetzen
      if (kannZahlen(p.hand, KOSTEN.schiff) && schiffe.length && zufall(rng) < 0.7)
        kandidaten.push({ typ: 'SCHIFF_BAUEN', spieler: sp, kante: zufall(rng) < 0.7 ? naechsteZuNeuemLand(s, schiffe) : waehle(rng, schiffe) });
      if (s.phase === 'aktion' && !s.schiffBewegt && zufall(rng) < 0.2) {
        const beweglich = beweglicheSchiffe(s, sp, s.schiffeNeu);
        if (beweglich.length) {
          const von = waehle(rng, beweglich);
          const ziele = schiffZiele(s, sp, von);
          if (ziele.length) kandidaten.push({ typ: 'SCHIFF_VERSETZEN', spieler: sp, von, nach: waehle(rng, ziele) });
        }
      }
      const staedte = gueltigeStadtEcken(s, sp);
      if (kannZahlen(p.hand, KOSTEN.stadt) && staedte.length) kandidaten.push({ typ: 'STADT_BAUEN', spieler: sp, ecke: waehle(rng, staedte) });
      const sied = gueltigeSiedlungsEcken(s, sp, false);
      if (kannZahlen(p.hand, KOSTEN.siedlung) && sied.length) {
        // Seefahrer: neue Inseln und Gold bevorzugen, damit Simulationen diese Regeln oft genug durchlaufen
        const start = s.brett.startInseln;
        const reizvoll = start
          ? sied.filter((e) => s.brett.ecken[e].hexes.some((h) => {
              const hex = s.brett.hexes[h];
              return hex.gelaende === 'gold' || (hex.insel !== undefined && !start.includes(hex.insel));
            }))
          : [];
        kandidaten.push({ typ: 'SIEDLUNG_BAUEN', spieler: sp, ecke: waehle(rng, reizvoll.length ? reizvoll : sied) });
      }
      if (kannZahlen(p.hand, KOSTEN.entwicklung) && s.stapel.length) kandidaten.push({ typ: 'ENTW_KAUFEN', spieler: sp });
      if (kannZahlen(p.hand, KOSTEN.strasse) && strassen.length && zufall(rng) < 0.6)
        kandidaten.push({ typ: 'STRASSE_BAUEN', spieler: sp, kante: waehle(rng, strassen) });
      if (s.phase === 'aktion') {
        if (!s.entwGespielt) {
          for (const k of p.entw) {
            if (k.gekauftInZug >= s.zugNr) continue;
            if (k.typ === 'ritter') kandidaten.push({ typ: 'RITTER_SPIELEN', spieler: sp });
            if (k.typ === 'monopol') kandidaten.push({ typ: 'MONOPOL_SPIELEN', spieler: sp, rohstoff: waehle(rng, ROHSTOFFE) });
            if (k.typ === 'strassenbau' && (strassen.length || schiffe.length)) kandidaten.push({ typ: 'STRASSENBAU_SPIELEN', spieler: sp });
            if (k.typ === 'erfindung') {
              const da = ROHSTOFFE.filter((r) => s.bank[r] >= 2);
              if (da.length) kandidaten.push({ typ: 'ERFINDUNG_SPIELEN', spieler: sp, rohstoffe: [waehle(rng, da), waehle(rng, da)] });
            }
          }
        }
        // Bankhandel
        const tauschbar = ROHSTOFFE.filter((r) => p.hand[r] >= tauschVerhaeltnis(s, sp, r));
        if (tauschbar.length && zufall(rng) < 0.5) {
          const gib = waehle(rng, tauschbar);
          const ziele = ROHSTOFFE.filter((r) => r !== gib && s.bank[r] > 0);
          if (ziele.length) kandidaten.push({ typ: 'BANKHANDEL', spieler: sp, gib, nimm: waehle(rng, ziele) });
        }
        // Spielerhandel: Angebot, Annahme, Ablehnung, Gegenangebot
        const x = zufall(rng);
        if (x < 0.15 && summe(p.hand) > 0) {
          const gib = waehle(rng, ROHSTOFFE.filter((r) => p.hand[r] > 0));
          const nimm = waehle(rng, ROHSTOFFE.filter((r) => r !== gib));
          kandidaten.push({ typ: 'HANDEL_ANBIETEN', spieler: sp, gib: { [gib]: 1 }, nimm: { [nimm]: 1 }, an: null });
        } else if (x < 0.4 && s.angebote.length) {
          const o = waehle(rng, s.angebote);
          if (o.an.length) {
            const wer = waehle(rng, o.an);
            return zufall(rng) < 0.6
              ? { typ: 'HANDEL_ANNEHMEN', spieler: wer, angebot: o.id }
              : { typ: 'HANDEL_ABLEHNEN', spieler: wer, angebot: o.id };
          }
        } else if (x < 0.45) {
          const andere = s.spieler.filter((q) => q.id !== sp && summe(q.hand) > 0);
          if (andere.length) {
            const q = waehle(rng, andere);
            const gib: Rohstoff = waehle(rng, ROHSTOFFE.filter((r) => q.hand[r] > 0));
            const nimm = waehle(rng, ROHSTOFFE.filter((r) => r !== gib));
            return { typ: 'HANDEL_ANBIETEN', spieler: q.id, gib: { [gib]: 1 }, nimm: { [nimm]: 1 }, an: null };
          }
        }
      }
      if (kandidaten.length && zufall(rng) < 0.85) return waehle(rng, kandidaten);
      return s.phase === 'aktion' ? { typ: 'ZUG_BEENDEN', spieler: sp } : { typ: 'SONDERBAU_FERTIG', spieler: sp };
    }
    default:
      return null;
  }
}
