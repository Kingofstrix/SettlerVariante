// Host-Logik ohne Netzwerk: gefälschter Transport, gefälschte Uhr.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pruefeInvarianten, type GameState } from '../src/engine';
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
    g[0].sende({ v: 1, t: 'absicht', nr: 1, aktion: { typ: 'WUERFELN' } });
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
