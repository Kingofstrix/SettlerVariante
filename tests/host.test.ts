// Host-Logik ohne Netzwerk: gefälschter Transport, gefälschte Uhr.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GLUECKSRAD_CHANCE, pruefeInvarianten, summe, zufall, type GameState } from '../src/engine';
import { Host, pruefeHostDaten } from '../src/netz/host';
import { PROTOKOLL_VERSION, pruefeClientNachricht, type HostNachricht } from '../src/netz/protokoll';
import type { HostTransport, Verbindung } from '../src/netz/verbindung';

class Gegenstelle {
  empfangen: HostNachricht[] = [];
  antwortet = true;
  zu = false;
  hostSeite: Verbindung;
  constructor() {
    this.hostSeite = {
      onDaten: null,
      onZu: null,
      senden: (d) => {
        if (this.zu) return;
        const n = structuredClone(d) as HostNachricht;
        this.empfangen.push(n);
        if (n.t === 'ping' && this.antwortet) this.sende({ v: PROTOKOLL_VERSION, t: 'pong', id: n.id });
      },
      schliessen: () => this.schliesse(),
      weg: async () => 'direkt',
    };
  }
  sende(d: unknown): void {
    if (!this.zu) this.hostSeite.onDaten?.(structuredClone(d));
  }
  schliesse(): void {
    if (this.zu) return;
    this.zu = true;
    this.hostSeite.onZu?.();
  }
  letzte<T extends HostNachricht['t']>(t: T): Extract<HostNachricht, { t: T }> | undefined {
    return this.empfangen.filter((n) => n.t === t).at(-1) as Extract<HostNachricht, { t: T }> | undefined;
  }
  absicht(aktion: Record<string, unknown>): void {
    this.sende({ v: PROTOKOLL_VERSION, t: 'absicht', nr: this.empfangen.length, aktion });
  }
}

class FakeTransport implements HostTransport {
  onVerbindung: ((v: Verbindung) => void) | null = null;
  onStatus: ((online: boolean) => void) | null = null;
  async start(): Promise<void> {}
  stop(): void {}
  gast(token: string, name: string, rolle: 'spieler' | 'beamer' = 'spieler', farbe = 'blau'): Gegenstelle {
    const g = new Gegenstelle();
    this.onVerbindung?.(g.hostSeite);
    g.sende({ v: PROTOKOLL_VERSION, t: 'hallo', token, name, farbe, rolle });
    return g;
  }
}

const HOST_TOKEN = 'host-token-1234';
const tok = (i: number): string => `spieler-token-${i}`;

async function raum(gaeste: number, einst: Record<string, unknown> = {}) {
  const t = new FakeTransport();
  const h = await Host.erstellen(() => t, { name: 'Anna', farbe: 'rot' }, HOST_TOKEN);
  h.host.einstellungen(einst);
  const g = Array.from({ length: gaeste }, (_, i) => t.gast(tok(i), `Gast${i}`));
  return { t, h, g };
}

const zustand = (h: Host): GameState => JSON.parse(h.host.debugZustand()) as GameState;

/** Lässt die Uhr laufen, bis die Bedingung erfüllt ist. */
function bis(h: Host, bedingung: (s: GameState) => boolean, maxSek = 3000): GameState {
  for (let i = 0; i < maxSek; i++) {
    const s = zustand(h);
    if (bedingung(s)) return s;
    vi.advanceTimersByTime(1000);
  }
  throw new Error('Bedingung nie erfüllt');
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Protokoll', () => {
  it('verwirft Ungültiges und lässt ZEIT_ABGELAUFEN von außen nicht durch', () => {
    for (const d of [null, 5, 'x', [], {}, { v: 1 }, { v: 1, t: 'gibtsnicht' }, { v: 1, t: 'hallo', token: 'kurz', name: 'A', farbe: 'rot', rolle: 'spieler' },
      { v: 1, t: 'hallo', token: 'lang-genug-1', name: 'A', farbe: 'rot', rolle: 'admin' }, { v: 1, t: 'absicht', nr: 1, aktion: { typ: 'ZEIT_ABGELAUFEN' } },
      { v: 1, t: 'absicht', nr: 1, aktion: 'x' }, { v: 1, t: 'pong', id: 'a' }, { v: 1, t: 'profil', name: 'x'.repeat(5000), farbe: 'rot' }])
      expect(pruefeClientNachricht(d)).toBe(null);
    expect(pruefeClientNachricht({ v: 1, t: 'absicht', nr: 1, aktion: { typ: 'WUERFELN' } })).not.toBe(null);
  });
});

describe('Lobby', () => {
  it('Beitritt, eindeutige Namen und Farben, voller Raum, falsche Version', async () => {
    const { t, h, g } = await raum(2, { maxSpieler: 4 });
    expect(h.zustand.status).toBe('lobby');
    expect(h.zustand.raumCode).toMatch(/^[A-HJKMNP-Z2-9]{5}$/);
    expect(g[1].letzte('lobby')!.sitze.map((s) => s.name)).toEqual(['Anna', 'Gast0', 'Gast1']);
    expect(g[1].letzte('lobby')!.meinSitz).toBe(2);
    const doppelt = t.gast(tok(7), 'anna', 'spieler', 'rot'); // Name und Farbe schon vergeben
    const sitze = doppelt.letzte('lobby')!.sitze;
    expect(sitze[3].name).toBe('anna 2');
    expect(new Set(sitze.map((s) => s.farbe)).size).toBe(4);
    expect(t.gast(tok(8), 'Zuviel').letzte('ende')!.grund).toBe('voll');
    const alt = new Gegenstelle();
    t.onVerbindung!(alt.hostSeite);
    alt.sende({ v: 99, t: 'hallo', token: 'irgendein-token', name: 'Alt', farbe: 'rot', rolle: 'spieler' });
    expect(alt.letzte('ende')!.grund).toBe('version');
    // Müll bringt den Host nicht aus dem Tritt
    g[0].sende('kaputt');
    g[0].sende({ v: PROTOKOLL_VERSION, t: 'absicht', nr: 1, aktion: { typ: 'WUERFELN' } });
    expect(h.zustand.sitze.length).toBe(4);
  });
  it('Start erst ab 3 Spielern', async () => {
    const { h, t } = await raum(1);
    h.host.starten();
    expect(h.zustand.status).toBe('lobby');
    t.gast(tok(5), 'Dritter');
    h.host.starten();
    expect(h.zustand.status).toBe('spiel');
  });
});

describe('Abstimmung über die Karte', () => {
  it('Stimmen stehen in der Lobby; die Mehrheit bestimmt die Karte der Partie', async () => {
    const { t, h, g } = await raum(3);
    expect(g[0].letzte('lobby')!.sitze.map((s) => s.stimme)).toEqual([null, null, null, null]);
    g[0].sende({ v: PROTOKOLL_VERSION, t: 'stimme', karte: 'spirale' });
    g[1].sende({ v: PROTOKOLL_VERSION, t: 'stimme', karte: 'spirale' });
    g[2].sende({ v: PROTOKOLL_VERSION, t: 'stimme', karte: 'fjorde' });
    h.stimme('fjorde');
    expect(g[2].letzte('lobby')!.sitze.map((s) => s.stimme)).toEqual(['fjorde', 'spirale', 'spirale', 'fjorde']);
    // umentscheiden und zurücknehmen
    g[2].sende({ v: PROTOKOLL_VERSION, t: 'stimme', karte: 'spirale' });
    h.stimme(null);
    expect(h.zustand.sitze.map((s) => s.stimme)).toEqual([null, 'spirale', 'spirale', 'spirale']);
    // Ungültiges und Stimmen vom Beamer zählen nicht
    g[0].sende({ v: PROTOKOLL_VERSION, t: 'stimme', karte: 'atlantis' });
    g[0].sende({ v: PROTOKOLL_VERSION, t: 'stimme' });
    const beamer = t.gast('beamer-token-1', 'Beamer', 'beamer');
    beamer.sende({ v: PROTOKOLL_VERSION, t: 'stimme', karte: 'klassik' });
    expect(h.zustand.sitze.map((s) => s.stimme)).toEqual([null, 'spirale', 'spirale', 'spirale']);
    h.host.starten();
    const s = zustand(h);
    expect(s.config.karte).toBe('spirale');
    expect(s.brett.hexes.length).toBe(33);
    expect(s.log.some((l) => l.text === 'Karte: Spirale (3 von 4 Stimmen).')).toBe(true);
    expect(g[0].letzte('spiel')!.sicht.brett!.hexes.length).toBe(33);
    // Im laufenden Spiel wird nicht mehr abgestimmt; zurück in der Lobby stehen die Stimmen noch
    g[0].sende({ v: PROTOKOLL_VERSION, t: 'stimme', karte: 'klassik' });
    h.host.zurLobby();
    expect(h.zustand.sitze.map((x) => x.stimme)).toEqual([null, 'spirale', 'spirale', 'spirale']);
  });
  it('ohne Stimmen wird Klassik gespielt; bei Gleichstand entscheidet das Los unter den führenden Karten', async () => {
    const ohne = await raum(2);
    ohne.h.host.starten();
    expect(zustand(ohne.h).config.karte).toBe('klassik');
    expect(zustand(ohne.h).brett.hexes.length).toBe(19);
    expect(zustand(ohne.h).log.some((l) => l.text.startsWith('Karte:'))).toBe(false);
    const gezogen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const { h, g } = await raum(3);
      g[0].sende({ v: PROTOKOLL_VERSION, t: 'stimme', karte: 'zwillinge' });
      g[1].sende({ v: PROTOKOLL_VERSION, t: 'stimme', karte: 'fjorde' });
      h.host.starten();
      const s = zustand(h);
      expect(['zwillinge', 'fjorde']).toContain(s.config.karte);
      expect(s.log.some((l) => /^Karte: .+ \(per Los bei Gleichstand, je 1 von 4 Stimmen\)\.$/.test(l.text))).toBe(true);
      gezogen.add(s.config.karte);
    }
    expect(gezogen.size).toBe(2); // nicht immer dieselbe Karte
  });
  it('Stimmen überstehen Export und Import; alte Spielstände ohne Stimmen laden weiter', async () => {
    const { h, g } = await raum(2);
    g[0].sende({ v: PROTOKOLL_VERSION, t: 'stimme', karte: 'zwillinge' });
    const daten = pruefeHostDaten(JSON.parse(h.host.exportieren()))!;
    expect(daten.sitze.map((s) => s.stimme)).toEqual([null, 'zwillinge', null]);
    const alt = JSON.parse(h.host.exportieren());
    for (const s of alt.sitze) delete s.stimme;
    alt.sitze[1].stimme = 'atlantis';
    expect(pruefeHostDaten(alt)!.sitze.map((s) => s.stimme)).toEqual([null, null, null]);
  });
});

describe('Spiel über den Host', () => {
  it('gefilterte Sicht: eigene Karten ja, fremde nur als Anzahl; Beamer sieht keine Hände', async () => {
    const { t, h, g } = await raum(3);
    const beamer = t.gast('beamer-token-1', 'Beamer', 'beamer');
    h.host.starten();
    bis(h, (s) => s.phase !== 'setup');
    for (const c of g) {
      const n = c.letzte('spiel')!;
      const ich = n.sicht.ich!;
      expect(n.sicht.spieler[ich].hand).not.toBe(null);
      expect(n.sicht.spieler.filter((p) => p.id !== ich).every((p) => p.hand === null && p.entw === null)).toBe(true);
      expect(JSON.stringify(n)).not.toContain('rngState');
      expect(JSON.stringify(n)).not.toContain('"stapel"');
      expect(JSON.stringify(n)).not.toContain('token');
    }
    const b = beamer.letzte('spiel')!;
    expect(b.sicht.ich).toBe(null);
    expect(b.sicht.spieler.every((p) => p.hand === null)).toBe(true);
    // Brett nur in der ersten Nachricht
    const spielNachrichten = g[0].empfangen.filter((n) => n.t === 'spiel');
    expect(spielNachrichten[0].t === 'spiel' && spielNachrichten[0].sicht.brett).toBeTruthy();
    expect(spielNachrichten.slice(1).every((n) => n.t === 'spiel' && n.sicht.brett === undefined)).toBe(true);
  });

  it('falscher Spieler wird sauber abgelehnt; Nachzügler kommen nicht mehr rein', async () => {
    const { t, h, g } = await raum(2, { zugZeit: 0 });
    h.host.starten();
    const s = zustand(h);
    const dran = s.setup.schritt;
    const falscher = g.find((c) => c.letzte('spiel')!.sicht.ich !== dran)!;
    const vorher = h.host.debugZustand();
    falscher.absicht({ typ: 'SIEDLUNG_BAUEN', ecke: 0 });
    expect(falscher.letzte('abgelehnt')).toBeTruthy();
    expect(h.host.debugZustand()).toBe(vorher);
    expect(t.gast(tok(9), 'Spät').letzte('ende')!.grund).toBe('laeuft');
    expect(t.gast('beamer-2-token', 'B', 'beamer').letzte('spiel')).toBeTruthy();
  });

  it('doppelter Tab übernimmt den Sitz, der alte bekommt einen Hinweis; Reconnect landet auf demselben Sitz', async () => {
    const { t, h, g } = await raum(2);
    h.host.starten();
    const ich = g[0].letzte('spiel')!.sicht.ich;
    const neu = t.gast(tok(0), 'Gast0');
    expect(g[0].letzte('ende')!.grund).toBe('uebernommen');
    expect(neu.letzte('spiel')!.sicht.ich).toBe(ich);
    expect(neu.letzte('spiel')!.sicht.brett).toBeTruthy(); // neue Verbindung bekommt das Brett wieder
    // Verbindungsabbruch -> "getrennt", danach Wiedereinstieg
    neu.schliesse();
    expect(g[1].letzte('spiel')!.verbunden[ich!]).toBe(false);
    const wieder = t.gast(tok(0), 'Gast0');
    expect(wieder.letzte('spiel')!.sicht.ich).toBe(ich);
    expect(g[1].letzte('spiel')!.verbunden[ich!]).toBe(true);
  });

  it('Heartbeat erkennt tote Verbindungen', async () => {
    const { h, g } = await raum(2);
    g[0].antwortet = false;
    vi.advanceTimersByTime(12000);
    expect(h.zustand.sitze[1].verbunden).toBe(false);
    expect(h.zustand.sitze[2].verbunden).toBe(true);
    expect(h.zustand.sitze[2].latenz).not.toBe(null);
    expect(h.zustand.sitze[2].weg).toBe('direkt');
  });

  it('gleichzeitige Annahme eines Handels: die zweite ist „nicht mehr gültig“', async () => {
    const { h, g } = await raum(3, { zugZeit: 60 });
    h.host.starten();
    let s = bis(h, (x) => x.phase !== 'setup');
    for (const p of s.spieler) for (const r of ['holz', 'erz']) h.host.debugGib(p.id, r, 2);
    const alle = [...g];
    const clientVon = (i: number) => alle.find((c) => c.letzte('spiel')!.sicht.ich === i);
    // Bis ein Gast (nicht der Host) in der Aktionsphase ist
    s = bis(h, (x) => x.phase === 'wuerfeln' && !!clientVon(x.aktiv));
    const aktiv = clientVon(s.aktiv)!;
    aktiv.absicht({ typ: 'WUERFELN' });
    s = bis(h, (x) => x.phase === 'aktion' || x.aktiv !== s.aktiv);
    if (s.phase !== 'aktion' || !clientVon(s.aktiv)) return; // Sonderfall 7 mit Timer: hier nicht relevant
    aktiv.absicht({ typ: 'HANDEL_ANBIETEN', gib: { holz: 1 }, nimm: { erz: 1 }, an: null });
    const id = zustand(h).angebote[0].id;
    const andere = alle.filter((c) => c !== aktiv);
    andere[0].absicht({ typ: 'HANDEL_ANNEHMEN', angebot: id });
    andere[1].absicht({ typ: 'HANDEL_ANNEHMEN', angebot: id });
    expect(andere[0].letzte('abgelehnt')).toBeUndefined();
    expect(andere[1].letzte('abgelehnt')!.grund).toContain('nicht mehr gültig');
    expect(zustand(h).angebote.length).toBe(0);
    expect(pruefeInvarianten(zustand(h))).toEqual([]);
  });
});

describe('Timer', () => {
  it('nach Ablauf wird automatisch gesetzt, gewürfelt und der Zug beendet', async () => {
    const { h, g } = await raum(2, { zugZeit: 60 });
    h.host.starten();
    expect(g[0].letzte('spiel')!.timer).toMatchObject({ gesamtMs: 60000, art: 'zug', laeuft: true });
    expect(zustand(h).setup.schritt).toBe(0);
    vi.advanceTimersByTime(59000);
    expect(Object.keys(zustand(h).gebaeude).length).toBe(0);
    vi.advanceTimersByTime(1500);
    expect(Object.keys(zustand(h).gebaeude).length).toBe(1); // zufällig, aber gültig gesetzt
    const s = bis(h, (x) => x.zugNr >= 3);
    expect(s.wurf === null || s.phase !== 'setup').toBe(true);
    expect(pruefeInvarianten(s)).toEqual([]);
  });
  it('Pause hält Timer und Aktionen an', async () => {
    const { h, g } = await raum(2, { zugZeit: 60 });
    h.host.starten();
    vi.advanceTimersByTime(20000);
    h.host.pause(true);
    expect(g[0].letzte('spiel')!.pausiert).toBe(true);
    expect(g[0].letzte('spiel')!.timer!.laeuft).toBe(false);
    vi.advanceTimersByTime(300000);
    expect(Object.keys(zustand(h).gebaeude).length).toBe(0);
    const dran = g.find((c) => c.letzte('spiel')!.sicht.ich === 0);
    if (dran) {
      dran.absicht({ typ: 'SIEDLUNG_BAUEN', ecke: 0 });
      expect(dran.letzte('abgelehnt')!.grund).toContain('pausiert');
    }
    h.host.pause(false);
    vi.advanceTimersByTime(39000);
    expect(Object.keys(zustand(h).gebaeude).length).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(Object.keys(zustand(h).gebaeude).length).toBe(1);
  });
  it('Timer aus: es passiert nichts von selbst – außer der Spieler am Zug ist getrennt', async () => {
    const { h, g } = await raum(2, { zugZeit: 0 });
    h.host.starten();
    expect(g[0].letzte('spiel')!.timer).toBe(null);
    vi.advanceTimersByTime(600000);
    expect(zustand(h).setup.schritt).toBe(0);
    const dran = g.find((c) => c.letzte('spiel')!.sicht.ich === 0);
    if (!dran) return; // Host selbst ist dran: kann nicht getrennt sein
    dran.schliesse();
    vi.advanceTimersByTime(50000);
    expect(Object.keys(zustand(h).gebaeude).length).toBe(0);
    vi.advanceTimersByTime(15000);
    expect(Object.keys(zustand(h).gebaeude).length).toBe(1); // Notfall-Timer (60 s) hat für ihn gesetzt
  });
  it('Sonderbauphase und Abwerfen haben eigene Zeiten', async () => {
    const { t, h } = await raum(2, { zugZeit: 60, sonderbauZeit: 20, abwerfZeit: 30, maxSpieler: 6 });
    const extra = [t.gast(tok(3), 'D'), t.gast(tok(4), 'E')];
    h.host.starten();
    let s = bis(h, (x) => x.phase !== 'setup');
    for (const p of s.spieler) for (const r of ['holz', 'lehm', 'wolle', 'getreide', 'erz']) h.host.debugGib(p.id, r, 3);
    s = bis(h, (x) => x.phase === 'sonderbau');
    expect(extra[0].letzte('spiel')!.timer).toMatchObject({ gesamtMs: 20000, art: 'sonderbau' });
    const index = s.sonderbau!.index;
    vi.advanceTimersByTime(21000);
    const danach = zustand(h);
    expect(danach.phase !== 'sonderbau' || danach.sonderbau!.index > index || danach.zugNr > s.zugNr).toBe(true);
    // Irgendwann fällt eine 7: alle haben 15+ Karten -> Abwurfphase mit eigenem Timer, danach geht es weiter
    bis(h, (x) => x.phase === 'abwerfen');
    expect(extra[0].letzte('spiel')!.timer).toMatchObject({ gesamtMs: 30000, art: 'abwerfen' });
    vi.advanceTimersByTime(31000);
    expect(zustand(h).phase).not.toBe('abwerfen');
    expect(pruefeInvarianten(zustand(h))).toEqual([]);
  });
});

describe('Host-Ausfall', () => {
  it('Export/Import: anderer Host übernimmt, alle Sitze bleiben erhalten', async () => {
    const { h, g } = await raum(2);
    h.host.starten();
    bis(h, (x) => x.zugNr >= 2);
    const ichAlt = g[0].letzte('spiel')!.sicht.ich;
    const json = h.host.exportieren();
    const vorher = zustand(h);
    h.verlassen();

    expect(pruefeHostDaten(JSON.parse('{"v":2}'))).toBe(null);
    expect(pruefeHostDaten('quatsch')).toBe(null);
    const daten = pruefeHostDaten(JSON.parse(json))!;
    const t2 = new FakeTransport();
    // Gast0 übernimmt als neuer Host
    const h2 = await Host.fortsetzen(() => t2, { ...daten, hostToken: tok(0) });
    expect(h2.zustand.raumCode).toBe(daten.raumCode);
    expect(zustand(h2)).toEqual(vorher);
    expect(h2.zustand.sicht!.ich).toBe(ichAlt);
    const alterHost = t2.gast(HOST_TOKEN, 'Anna');
    expect(alterHost.letzte('spiel')!.sicht.ich).toBe(daten.spielerTokens.indexOf(HOST_TOKEN));
    expect(h2.zustand.verbunden.filter(Boolean).length).toBe(2);
    h2.verlassen();
  });
});

describe('Chat', () => {
  it('verteilt Nachrichten an alle, bremst Spam, Beamer darf nur lesen, bleibt beim Export erhalten', async () => {
    const { t, h, g } = await raum(2);
    const beamer = t.gast('beamer-token-9', 'B', 'beamer');
    g[0].sende({ v: PROTOKOLL_VERSION, t: 'chat', text: '  Hallo <b>zusammen</b>\n ' });
    expect(g[1].letzte('chat')!.eintraege.at(-1)).toMatchObject({ name: 'Gast0', text: 'Hallo <b>zusammen</b>' });
    expect(beamer.letzte('chat')!.eintraege.length).toBe(1);
    expect(h.zustand.chat.length).toBe(1);
    h.chat('Host hier');
    expect(g[0].letzte('chat')!.eintraege.at(-1)).toMatchObject({ name: 'Anna', text: 'Host hier' });
    // Beamer kann nicht schreiben, leere Nachrichten werden verworfen
    beamer.sende({ v: PROTOKOLL_VERSION, t: 'chat', text: 'Ich bin der Beamer' });
    g[1].sende({ v: PROTOKOLL_VERSION, t: 'chat', text: '   ' });
    expect(h.zustand.chat.length).toBe(2);
    // Zu lange Nachrichten werden gekürzt
    g[1].sende({ v: PROTOKOLL_VERSION, t: 'chat', text: 'x'.repeat(350) });
    expect(h.zustand.chat.at(-1)!.text.length).toBe(200);
    // Spam-Bremse: höchstens 5 in 10 Sekunden
    for (let i = 0; i < 8; i++) g[0].sende({ v: PROTOKOLL_VERSION, t: 'chat', text: `Spam ${i}` });
    expect(h.zustand.chat.filter((c) => c.name === 'Gast0').length).toBe(5);
    vi.advanceTimersByTime(10500);
    g[0].sende({ v: PROTOKOLL_VERSION, t: 'chat', text: 'wieder da' });
    expect(h.zustand.chat.at(-1)!.text).toBe('wieder da');
    // Neuer Mitspieler bekommt den bisherigen Verlauf
    const spaet = t.gast(tok(5), 'Spät');
    expect(spaet.letzte('chat')!.eintraege.length).toBe(h.zustand.chat.length);
    // Export enthält den Chat
    expect(pruefeHostDaten(JSON.parse(h.host.exportieren()))!.chat.length).toBe(h.zustand.chat.length);
  });
});

describe('Rangliste und neue Einstellungen', () => {
  it('Einstellungen Sonderbauphase und Abwurfgrenze landen in der Spielkonfiguration', async () => {
    const { h } = await raum(4, { sonderbauphase: false, abwurfGrenze: 9 });
    h.host.starten();
    expect(zustand(h).config).toMatchObject({ sonderbauphase: false, abwurfGrenze: 9 });
  });
  it('Spielende wird einmal eingetragen und an alle verteilt; fremde Partien werden zusammengeführt', async () => {
    const { t, h, g } = await raum(2, { zugZeit: 60 });
    h.host.starten();
    let s = bis(h, (x) => x.phase !== 'setup');
    s.config.siegpunkte = 2; // jeder hat nach der Gründung 2 Punkte: der nächste Schritt gewinnt
    expect(h.host.debugSetze(JSON.stringify(s))).toBeNull();
    s = bis(h, (x) => x.phase === 'ende');
    const id = `${h.zustand.raumCode}-${s.seed}`;
    const liste = g[0].letzte('rangliste')!.partien;
    expect(liste.filter((p) => p.id === id).length).toBe(1);
    const p = liste.find((x) => x.id === id)!;
    expect(p.sieger).toBe(s.spieler[s.gewinner!].name);
    expect(p.spieler.map((x) => x.name).sort()).toEqual(['Anna', 'Gast0', 'Gast1']);
    // Ein Gast bringt eine Partie mit, die der Host nicht kennt: alle bekommen sie
    const fremd = { id: 'ALT-1', datum: 1, sieger: 'Bea', spieler: ['Bea', 'Cem', 'Dora'].map((name) => ({ name, punkte: 5, titel: [] })) };
    g[1].sende({ v: PROTOKOLL_VERSION, t: 'rangliste', partien: [fremd, { kaputt: true }] });
    expect(g[0].letzte('rangliste')!.partien.map((x) => x.id)).toContain('ALT-1');
    const neu = t.gast(tok(9), 'Beamer', 'beamer');
    expect(neu.letzte('rangliste')!.partien.map((x) => x.id)).toEqual(expect.arrayContaining(['ALT-1', id]));
    // Doppeltes wird nicht noch einmal verteilt
    const vorher = g[0].empfangen.filter((n) => n.t === 'rangliste').length;
    g[1].sende({ v: PROTOKOLL_VERSION, t: 'rangliste', partien: [fremd] });
    expect(g[0].empfangen.filter((n) => n.t === 'rangliste').length).toBe(vorher);
  });
  it('alte Spielstände ohne Statistik und Wunschliste lassen sich laden', async () => {
    const { h } = await raum(2);
    h.host.starten();
    const d = JSON.parse(h.host.exportieren());
    delete d.spiel.statistik;
    for (const p of d.spiel.spieler) delete p.wunsch;
    delete d.spiel.config.abwurfGrenze;
    const x = pruefeHostDaten(d)!;
    expect(x.spiel!.statistik.wuerfe.length).toBe(13);
    expect(x.spiel!.spieler[0].wunsch).toEqual({ suche: [], biete: [] });
    expect(x.spiel!.config.abwurfGrenze).toBe(7);
  });
});

describe('Glücksrad über den Host', () => {
  it('Lobby-Schalter landet in der Spielkonfiguration; nach dem Dreh startet die Abwurfzeit neu', async () => {
    const { h, g } = await raum(2, { zugZeit: 60, abwerfZeit: 30, gluecksrad: true });
    h.host.starten();
    let s = bis(h, (x) => x.phase === 'wuerfeln');
    expect(s.config.gluecksrad).toBe(true);
    // Eine 7 erzwingen, bei der ein Gast abwerfen muss
    const gast = g.find((c) => c.letzte('spiel')!.sicht.ich !== null)!;
    const ich = gast.letzte('spiel')!.sicht.ich!;
    // RNG so wählen, dass der Dreh verliert (deterministischer Test)
    let verlust = 1;
    while (zufall({ rngState: verlust }) < GLUECKSRAD_CHANCE) verlust++;
    s = { ...s, phase: 'abwerfen', abwerfen: { [ich]: 4 }, gedreht: [], rngState: verlust };
    for (const r of ['holz', 'lehm', 'wolle']) s.spieler[ich].hand[r as 'holz'] += 3;
    for (const r of ['holz', 'lehm', 'wolle']) s.bank[r as 'holz'] -= 3;
    expect(h.host.debugSetze(JSON.stringify(s))).toBe(null);
    vi.advanceTimersByTime(25000); // 25 von 30 s verbraucht
    gast.absicht({ typ: 'GLUECKSRAD_DREHEN' });
    const nach = zustand(h);
    expect(nach.gluecksrad.at(-1)!.spieler).toBe(ich);
    expect(nach.gluecksrad.at(-1)).toMatchObject({ gewonnen: false, nachher: 8 });
    expect(nach.abwerfen[ich]).toBe(8);
    // Verloren: volle 30 s für das neue Soll statt der restlichen 5 s
    expect(gast.letzte('spiel')!.timer).toMatchObject({ art: 'abwerfen', restMs: 30000 });
    vi.advanceTimersByTime(29000);
    expect(zustand(h).phase).toBe('abwerfen');
    vi.advanceTimersByTime(2000);
    expect(zustand(h).phase).not.toBe('abwerfen');
    expect(summe(zustand(h).spieler[ich].hand)).toBe(summe(s.spieler[ich].hand) - 8); // Zeitablauf wirft 8 zufällig ab
    expect(pruefeInvarianten(zustand(h))).toEqual([]);
  });
});
