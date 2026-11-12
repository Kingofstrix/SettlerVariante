// Host: einzige Instanz, die Aktionen anwendet. Verwaltet Sitze, Verbindungen, Timer und Persistenz.
import {
  ROHSTOFFE,
  STANDARD_CONFIG,
  amZug,
  anwenden,
  istKarte,
  leereStatistik,
  neuesSpiel,
  sichtFuer,
  waehleKarte,
  zaehleStimmen,
  zufall,
  type GameState,
  type KartenId,
  type RngTraeger,
  type Rohstoff,
} from '../engine';
import { partieAus, partien, uebernimm } from './rangliste';
import { PROTOKOLL_VERSION, pruefeClientNachricht, type EndeGrund, type HostNachricht, type SichtOhneBrett } from './protokoll';
import {
  Beobachtbar,
  CHAT_MAX_LAENGE,
  FARBEN,
  type ChatEintrag,
  STANDARD_EINSTELLUNGEN,
  type Absicht,
  type Einstellungen,
  type HostFunktionen,
  type SitzInfo,
  type Sitzung,
  type SitzungsZustand,
  type TimerArt,
  type Weg,
} from './sitzung';
import { loesche, neuerRaumCode, peerId, schreibe, zufallsSeed, type Profil } from './speicher';
import { TransportFehler, type HostTransport, type Verbindung } from './verbindung';

export interface HostDaten {
  v: 1;
  raumCode: string;
  hostToken: string;
  sitze: { token: string; name: string; farbe: string; stimme?: KartenId | null }[];
  einstellungen: Einstellungen;
  spiel: GameState | null;
  /** Token je Spielerindex des laufenden Spiels. */
  spielerTokens: string[];
  spielNr: number;
  pausiert: boolean;
  chat: ChatEintrag[];
  chatNr: number;
}

/** Prüft einen importierten Spielstand grob auf die erwartete Form. */
export function pruefeHostDaten(d: unknown): HostDaten | null {
  if (typeof d !== 'object' || d === null) return null;
  const x = d as Partial<HostDaten>;
  if (x.v !== 1 || typeof x.raumCode !== 'string' || !Array.isArray(x.sitze) || !Array.isArray(x.spielerTokens)) return null;
  if (typeof x.einstellungen !== 'object' || x.einstellungen === null) return null;
  if (x.spiel !== null && (typeof x.spiel !== 'object' || !Array.isArray(x.spiel.spieler) || !x.spiel.brett)) return null;
  if (!x.sitze.every((s) => s && typeof s.token === 'string' && typeof s.name === 'string' && typeof s.farbe === 'string')) return null;
  // Ältere Spielstände ohne Bewegungsliste, Statistik, Wunschliste oder neue Einstellungen ergänzen
  const spiel = x.spiel
    ? {
        ...x.spiel,
        config: { ...STANDARD_CONFIG, ...x.spiel.config },
        spieler: x.spiel.spieler.map((p) => ({ ...p, wunsch: p.wunsch ?? { suche: [], biete: [] } })),
        bewegungen: x.spiel.bewegungen ?? [],
        bewegungNr: x.spiel.bewegungNr ?? 0,
        statistik: x.spiel.statistik ?? leereStatistik(x.spiel.spieler.length),
        gluecksrad: x.spiel.gluecksrad ?? [],
        gluecksradNr: x.spiel.gluecksradNr ?? 0,
        gedreht: x.spiel.gedreht ?? [],
        wurfStatistik: x.spiel.wurfStatistik ?? Array<number>(13).fill(0),
      }
    : null;
  return {
    v: 1,
    raumCode: x.raumCode,
    hostToken: typeof x.hostToken === 'string' ? x.hostToken : '',
    sitze: x.sitze.map((s) => ({ token: s.token, name: s.name, farbe: s.farbe, stimme: istKarte(s.stimme) ? s.stimme : null })),
    einstellungen: { ...STANDARD_EINSTELLUNGEN, ...x.einstellungen },
    spiel,
    spielerTokens: x.spielerTokens,
    spielNr: typeof x.spielNr === 'number' ? x.spielNr : 1,
    pausiert: !!x.pausiert,
    chat: Array.isArray(x.chat) ? x.chat.slice(-CHAT_BEHALTEN) : [],
    chatNr: typeof x.chatNr === 'number' ? x.chatNr : 0,
  };
}

interface Gast {
  conn: Verbindung;
  token: string | null;
  rolle: 'spieler' | 'beamer' | null;
  letzterPong: number;
  latenz: number | null;
  weg: Weg;
  pings: Map<number, number>;
  /** Spielnummer, für die das Brett schon gesendet wurde. */
  brettFuer: number;
  /** Zeitpunkte der letzten Chatnachrichten (Spam-Bremse). */
  chatZeiten: number[];
}

interface HostTimer {
  schluessel: string;
  art: TimerArt;
  gesamtMs: number;
  endetUm: number | null;
  restMs: number;
  fallback: boolean;
}

const PING_MS = 2000;
const TOT_MS = 8000;
const LOG_SENDEN = 80;
const CHAT_BEHALTEN = 100;
/** Höchstens so viele Chatnachrichten je Spieler in 10 Sekunden. */
const CHAT_PRO_10S = 5;

/** Schlüssel des aktuellen Zeitabschnitts: Wechselt er, beginnt ein neuer Timer. */
function schritt(s: GameState): [string, TimerArt] {
  if (s.phase === 'setup') return [`s:${s.setup.schritt}:${s.setup.erwartet}`, 'zug'];
  // Nach einem Dreh am Glücksrad beginnt die Abwurfzeit neu (die Animation soll keine Zeit kosten).
  if (s.phase === 'abwerfen') return [`a:${s.zugNr}:${s.gedreht.length}`, 'abwerfen'];
  if (s.phase === 'sonderbau') return [`b:${s.zugNr}:${s.sonderbau!.index}`, 'sonderbau'];
  return [`z:${s.zugNr}`, 'zug'];
}

function saeubereName(name: string): string {
  return name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Spieler';
}

export class Host extends Beobachtbar implements Sitzung {
  zustand: SitzungsZustand;
  readonly host: HostFunktionen;
  private gaeste = new Set<Gast>();
  private timer: HostTimer | null = null;
  private zugGemerkt: { schluessel: string; restMs: number } | null = null;
  private intervalle: ReturnType<typeof setInterval>[] = [];
  private pingNr = 0;
  private schlag = 0;
  private hinweisNr = 0;
  private letzteSitze = '';

  constructor(
    private transport: HostTransport,
    private daten: HostDaten,
  ) {
    super();
    this.zustand = {
      status: 'verbinde',
      online: false,
      meldung: null,
      rolle: 'host',
      raumCode: daten.raumCode,
      sitze: [],
      meinSitz: null,
      beamer: 0,
      einstellungen: daten.einstellungen,
      sicht: null,
      verbunden: [],
      timer: null,
      pausiert: daten.pausiert,
      chat: daten.chat,
      hinweis: null,
    };
    this.host = {
      einstellungen: (e) => this.setzeEinstellungen(e),
      starten: () => this.starten(),
      pause: (an) => this.pause(an),
      zurLobby: () => this.zurLobby(),
      entfernen: (i) => this.entfernen(i),
      exportieren: () => JSON.stringify(this.daten),
      seed: () => this.daten.spiel?.seed ?? null,
      debugGib: (sp, r, n) => this.debugGib(sp, r, n),
      debugZustand: () => JSON.stringify(this.daten.spiel, null, 1),
      debugSetze: (json) => this.debugSetze(json),
    };
  }

  /** Neuen Raum anlegen. Bei belegtem Code wird ein neuer gewürfelt. */
  static async erstellen(transport: () => HostTransport, profil: Profil, token: string): Promise<Host> {
    let letzter: unknown = null;
    for (let versuch = 0; versuch < 5; versuch++) {
      const daten: HostDaten = {
        v: 1,
        raumCode: neuerRaumCode(),
        hostToken: token,
        sitze: [{ token, name: saeubereName(profil.name), farbe: profil.farbe }],
        einstellungen: { ...STANDARD_EINSTELLUNGEN },
        spiel: null,
        spielerTokens: [],
        spielNr: 0,
        pausiert: false,
        chat: [],
        chatNr: 0,
      };
      const t = transport();
      try {
        await t.start(peerId(daten.raumCode));
        const h = new Host(t, daten);
        h.laufe();
        return h;
      } catch (e) {
        t.stop();
        letzter = e;
        if (!(e instanceof TransportFehler) || e.art !== 'belegt') throw e;
      }
    }
    throw letzter;
  }

  /** Bestehenden Raum wieder öffnen (nach Reload oder Import). Der alte Raumcode kann kurz noch belegt sein. */
  static async fortsetzen(transport: () => HostTransport, daten: HostDaten): Promise<Host> {
    let letzter: unknown = null;
    for (let versuch = 0; versuch < 8; versuch++) {
      const t = transport();
      try {
        await t.start(peerId(daten.raumCode));
        const h = new Host(t, daten);
        h.laufe();
        return h;
      } catch (e) {
        t.stop();
        letzter = e;
        if (!(e instanceof TransportFehler) || e.art !== 'belegt') throw e;
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    throw letzter;
  }

  private laufe(): void {
    this.transport.onVerbindung = (conn) => this.neueVerbindung(conn);
    this.transport.onStatus = (online) => {
      this.zustand = { ...this.zustand, online };
      this.melde();
    };
    this.zustand.online = true;
    // Versehentliches Schließen des Host-Tabs während einer Partie abfangen.
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', this.vorSchliessen);
    this.intervalle.push(setInterval(() => this.herzschlag(), PING_MS));
    this.intervalle.push(setInterval(() => this.tick(), 250));
    this.timerAktualisieren();
    this.speichern();
    this.rundsenden();
  }

  // ---------- Verbindungen ----------

  private neueVerbindung(conn: Verbindung): void {
    const g: Gast = { conn, token: null, rolle: null, letzterPong: Date.now(), latenz: null, weg: null, pings: new Map(), brettFuer: -1, chatZeiten: [] };
    this.gaeste.add(g);
    conn.onDaten = (d) => {
      const n = pruefeClientNachricht(d);
      if (!n) return; // Unbekanntes/Ungültiges ignorieren
      if (n.v !== PROTOKOLL_VERSION) return this.beende(g, 'version');
      switch (n.t) {
        case 'hallo':
          return this.hallo(g, n.token, n.name, n.farbe, n.rolle);
        case 'pong': {
          const t = g.pings.get(n.id);
          if (t !== undefined) {
            g.latenz = Date.now() - t;
            g.pings.delete(n.id);
          }
          g.letzterPong = Date.now();
          return;
        }
        case 'rangliste':
          if (g.rolle && uebernimm(n.partien)) this.sendeRangliste();
          return;
        case 'chat':
          if (g.rolle !== 'spieler' || !g.token) return;
          g.chatZeiten = g.chatZeiten.filter((t) => Date.now() - t < 10000);
          if (g.chatZeiten.length >= CHAT_PRO_10S) return; // Spam: still verwerfen
          g.chatZeiten.push(Date.now());
          return this.chatHinzu(g.token, n.text);
        case 'profil':
          if (g.rolle === 'spieler' && g.token && !this.daten.spiel) this.setzeProfil(g.token, n.name, n.farbe);
          return;
        case 'stimme':
          if (g.rolle === 'spieler' && g.token) this.setzeStimme(g.token, n.karte);
          return;
        case 'absicht': {
          if (g.rolle !== 'spieler' || !g.token) return;
          const fehler = this.verarbeite(g.token, n.aktion);
          if (fehler) this.sende(g, { v: PROTOKOLL_VERSION, t: 'abgelehnt', nr: n.nr, grund: fehler });
          return;
        }
      }
    };
    conn.onZu = () => {
      if (!this.gaeste.delete(g)) return;
      this.timerAktualisieren();
      this.rundsenden();
    };
    void conn.weg().then((w) => (g.weg = w));
  }

  private sende(g: Gast, n: HostNachricht): void {
    g.conn.senden(n);
  }

  private beende(g: Gast, grund: EndeGrund): void {
    this.sende(g, { v: PROTOKOLL_VERSION, t: 'ende', grund });
    this.gaeste.delete(g);
    // Kurz warten, damit die Nachricht noch ankommt.
    setTimeout(() => g.conn.schliessen(), 300);
  }

  private gastFuer(token: string): Gast | undefined {
    for (const g of this.gaeste) if (g.rolle === 'spieler' && g.token === token) return g;
    return undefined;
  }

  private hallo(g: Gast, token: string, name: string, farbe: string, rolle: 'spieler' | 'beamer'): void {
    if (g.rolle) return;
    if (rolle === 'beamer') {
      g.rolle = 'beamer';
      g.token = token;
      this.sendeChat(g);
      this.sendeRangliste(g);
      return this.rundsenden();
    }
    const bekannt = this.daten.sitze.some((s) => s.token === token);
    if (!bekannt) {
      if (this.daten.spiel) return this.beende(g, 'laeuft');
      if (this.daten.sitze.length >= this.daten.einstellungen.maxSpieler) return this.beende(g, 'voll');
      this.daten.sitze.push({ token, name: '', farbe: '', stimme: null });
      this.setzeProfil(token, name, farbe, true);
    }
    // Doppelter Tab: der neue übernimmt, der alte bekommt einen Hinweis.
    const alt = this.gastFuer(token);
    if (alt) this.beende(alt, 'uebernommen');
    g.rolle = 'spieler';
    g.token = token;
    this.timerAktualisieren();
    this.speichern();
    this.rundsenden();
    this.sendeChat(g);
    this.sendeRangliste(g);
  }

  // ---------- Rangliste ----------

  /** An einen Gast oder an alle. */
  private sendeRangliste(nur?: Gast): void {
    const n: HostNachricht = { v: PROTOKOLL_VERSION, t: 'rangliste', partien: partien() };
    for (const g of nur ? [nur] : this.gaeste) if (g.rolle) this.sende(g, n);
  }

  /** Beendete Partie einmalig in die Rangliste eintragen und verteilen. */
  private pruefeEnde(): void {
    const s = this.daten.spiel;
    if (s?.phase === 'ende' && uebernimm([partieAus(s, this.daten.raumCode)])) this.sendeRangliste();
  }

  // ---------- Chat ----------

  private sendeChat(g: Gast): void {
    this.sende(g, { v: PROTOKOLL_VERSION, t: 'chat', eintraege: this.daten.chat });
  }

  private chatHinzu(token: string, roh: string): void {
    const sitz = this.daten.sitze.find((s) => s.token === token);
    if (!sitz) return;
    const text = roh.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, CHAT_MAX_LAENGE);
    if (!text) return;
    const d = this.daten;
    d.chat = [...d.chat, { nr: ++d.chatNr, name: sitz.name, farbe: sitz.farbe, text, zeit: Date.now() }].slice(-CHAT_BEHALTEN);
    this.speichern();
    for (const g of this.gaeste) if (g.rolle) this.sendeChat(g);
    this.zustand = { ...this.zustand, chat: d.chat };
    this.melde();
  }

  chat(text: string): void {
    this.chatHinzu(this.daten.hostToken, text);
  }

  private setzeProfil(token: string, name: string, farbe: string, still = false): void {
    const sitz = this.daten.sitze.find((s) => s.token === token);
    if (!sitz) return;
    let n = saeubereName(name);
    const andere = this.daten.sitze.filter((s) => s !== sitz);
    let i = 2;
    const basis = n.slice(0, 14);
    while (andere.some((s) => s.name.toLowerCase() === n.toLowerCase())) n = `${basis} ${i++}`;
    sitz.name = n;
    const belegt = new Set(andere.map((s) => s.farbe));
    const gueltig = FARBEN.some((f) => f.id === farbe) && !belegt.has(farbe);
    sitz.farbe = gueltig ? farbe : (FARBEN.find((f) => !belegt.has(f.id))?.id ?? 'rot');
    if (!still) {
      this.speichern();
      this.rundsenden();
    }
  }

  private herzschlag(): void {
    const jetzt = Date.now();
    this.schlag++;
    for (const g of [...this.gaeste]) {
      if (jetzt - g.letzterPong > TOT_MS) {
        g.conn.schliessen(); // löst onZu aus
        continue;
      }
      const id = ++this.pingNr;
      g.pings.set(id, jetzt);
      if (g.pings.size > 10) g.pings.delete(g.pings.keys().next().value!);
      this.sende(g, { v: PROTOKOLL_VERSION, t: 'ping', id });
      if (this.schlag % 3 === 0) void g.conn.weg().then((w) => (g.weg = w));
    }
    // Lobby/Verbindungstest aktuell halten, aber nur senden, wenn sich etwas geändert hat.
    const sitze = JSON.stringify(this.sitzInfos());
    if (sitze !== this.letzteSitze) this.rundsenden();
  }

  // ---------- Zustand verteilen ----------

  private sitzInfos(): SitzInfo[] {
    return this.daten.sitze.map((s) => {
      const istHost = s.token === this.daten.hostToken;
      const g = this.gastFuer(s.token);
      return {
        name: s.name,
        farbe: s.farbe,
        verbunden: istHost || !!g,
        latenz: istHost ? 0 : g ? (g.latenz === null ? null : Math.round(g.latenz / 10) * 10) : null,
        weg: istHost ? 'lokal' : (g?.weg ?? null),
        istHost,
        stimme: s.stimme ?? null,
      };
    });
  }

  private spielerVerbunden(): boolean[] {
    return this.daten.spielerTokens.map((t) => t === this.daten.hostToken || !!this.gastFuer(t));
  }

  private timerRest(): number {
    if (!this.timer) return 0;
    return this.timer.endetUm === null ? this.timer.restMs : Math.max(0, this.timer.endetUm - Date.now());
  }

  private rundsenden(): void {
    const d = this.daten;
    const sitze = this.sitzInfos();
    this.letzteSitze = JSON.stringify(sitze);
    const beamer = [...this.gaeste].filter((g) => g.rolle === 'beamer').length;
    const verbunden = this.spielerVerbunden();
    const timer = this.timer
      ? { restMs: this.timerRest(), gesamtMs: this.timer.gesamtMs, art: this.timer.art, laeuft: this.timer.endetUm !== null }
      : null;
    for (const g of this.gaeste) {
      if (!g.rolle) continue;
      if (!d.spiel) {
        const meinSitz = g.rolle === 'spieler' ? d.sitze.findIndex((s) => s.token === g.token) : -1;
        this.sende(g, {
          v: PROTOKOLL_VERSION,
          t: 'lobby',
          raumCode: d.raumCode,
          sitze,
          meinSitz: meinSitz < 0 ? null : meinSitz,
          beamer,
          einstellungen: d.einstellungen,
        });
        continue;
      }
      const idx = g.rolle === 'spieler' ? d.spielerTokens.indexOf(g.token!) : -1;
      const voll = sichtFuer(d.spiel, idx < 0 ? null : idx);
      const sicht: SichtOhneBrett = { ...voll, log: voll.log.slice(-LOG_SENDEN) };
      if (g.brettFuer === d.spielNr) delete sicht.brett;
      else g.brettFuer = d.spielNr;
      this.sende(g, { v: PROTOKOLL_VERSION, t: 'spiel', spielNr: d.spielNr, sicht, sitze, verbunden, timer, pausiert: d.pausiert });
    }
    // Eigene Ansicht
    const meinSitz = d.sitze.findIndex((s) => s.token === d.hostToken);
    const ich = d.spielerTokens.indexOf(d.hostToken);
    this.zustand = {
      ...this.zustand,
      status: d.spiel ? 'spiel' : 'lobby',
      raumCode: d.raumCode,
      sitze,
      meinSitz: meinSitz < 0 ? null : meinSitz,
      beamer,
      einstellungen: d.einstellungen,
      sicht: d.spiel ? sichtFuer(d.spiel, ich < 0 ? null : ich) : null,
      verbunden,
      timer: this.timer
        ? { endetUm: this.timer.endetUm, restMs: this.timerRest(), gesamtMs: this.timer.gesamtMs, art: this.timer.art }
        : null,
      pausiert: d.pausiert,
    };
    this.melde();
  }

  private speichern(): void {
    schreibe('host', this.daten);
  }

  private hinweis(text: string): void {
    this.zustand = { ...this.zustand, hinweis: { nr: ++this.hinweisNr, text } };
    this.melde();
  }

  // ---------- Aktionen ----------

  /** Wendet die Absicht eines Spielers an. Aktionen werden strikt nacheinander verarbeitet. */
  private verarbeite(token: string, absicht: Absicht): string | null {
    const s = this.daten.spiel;
    if (!s) return 'Es läuft kein Spiel.';
    const spieler = this.daten.spielerTokens.indexOf(token);
    if (spieler < 0) return 'Du spielst in dieser Partie nicht mit.';
    if (this.daten.pausiert) return 'Das Spiel ist pausiert.';
    const e = anwenden(s, { ...absicht, spieler } as Parameters<typeof anwenden>[1]);
    if (!e.ok) return e.fehler;
    this.daten.spiel = e.state;
    this.pruefeEnde();
    this.timerAktualisieren();
    this.speichern();
    this.rundsenden();
    return null;
  }

  aktion(a: Absicht): void {
    const fehler = this.verarbeite(this.daten.hostToken, a);
    if (fehler) this.hinweis(fehler);
  }

  profil(name: string, farbe: string): void {
    if (!this.daten.spiel) this.setzeProfil(this.daten.hostToken, name, farbe);
  }

  stimme(karte: KartenId | null): void {
    this.setzeStimme(this.daten.hostToken, karte);
  }

  /** Abgestimmt wird nur in der Lobby; die Stimme gehört zum Sitz und bleibt für die nächste Partie stehen. */
  private setzeStimme(token: string, karte: KartenId | null): void {
    const sitz = this.daten.sitze.find((s) => s.token === token);
    if (!sitz || this.daten.spiel || (sitz.stimme ?? null) === karte) return;
    sitz.stimme = karte;
    this.speichern();
    this.rundsenden();
  }

  private vorSchliessen = (e: BeforeUnloadEvent): void => {
    if (this.daten.spiel && this.daten.spiel.phase !== 'ende') e.preventDefault();
  };

  verlassen(): void {
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', this.vorSchliessen);
    for (const i of this.intervalle) clearInterval(i);
    this.transport.stop();
    loesche('host');
    loesche('sitzung');
  }

  // ---------- Host-Funktionen ----------

  private setzeEinstellungen(e: Partial<Einstellungen>): void {
    const n = { ...this.daten.einstellungen, ...e };
    n.maxSpieler = Math.min(6, Math.max(3, Math.max(n.maxSpieler, this.daten.sitze.length)));
    this.daten.einstellungen = n;
    this.timerAktualisieren();
    this.speichern();
    this.rundsenden();
  }

  private starten(): void {
    const d = this.daten;
    if (d.spiel || d.sitze.length < 3) return this.hinweis('Zum Starten braucht es mindestens 3 Spieler.');
    const seed = zufallsSeed();
    // Auszählen: Die meisten Stimmen gewinnen. Das Los bei Gleichstand hängt am Seed, zieht aber
    // nicht aus dem Spiel-RNG (gleicher Seed und gleiche Karte ergeben weiter dasselbe Brett).
    const stimmen = d.sitze.map((s) => s.stimme ?? null);
    const los: RngTraeger = { rngState: seed ^ 0x4b617274 };
    const wahl = waehleKarte(stimmen, () => zufall(los));
    const zaehlung = zaehleStimmen(stimmen);
    const kartenHinweis =
      zaehlung.abgegeben === 0
        ? undefined
        : wahl.los
          ? `per Los bei Gleichstand, je ${zaehlung.stimmen[wahl.karte]} von ${d.sitze.length} Stimmen`
          : `${zaehlung.stimmen[wahl.karte]} von ${d.sitze.length} Stimmen`;
    d.spiel = neuesSpiel({
      spieler: d.sitze.map((s) => ({ name: s.name, farbe: s.farbe })),
      seed,
      kartenHinweis,
      config: {
        karte: wahl.karte,
        layout: d.einstellungen.layout,
        siegpunkte: d.einstellungen.siegpunkte,
        freundlicherRaeuber: d.einstellungen.freundlicherRaeuber,
        sonderbauphase: d.einstellungen.sonderbauphase,
        abwurfGrenze: d.einstellungen.abwurfGrenze,
        gluecksrad: d.einstellungen.gluecksrad,
      },
    });
    // Die Engine mischt die Sitzreihenfolge; Namen sind in der Lobby eindeutig.
    d.spielerTokens = d.spiel.spieler.map((p) => d.sitze.find((s) => s.name === p.name)!.token);
    d.spielNr++;
    d.pausiert = false;
    this.zugGemerkt = null;
    console.info(`[Inselreich] Spiel ${d.spielNr} gestartet, Seed ${seed}`);
    this.timerAktualisieren();
    this.speichern();
    this.rundsenden();
  }

  private zurLobby(): void {
    this.daten.spiel = null;
    this.daten.spielerTokens = [];
    this.daten.pausiert = false;
    this.timer = null;
    this.speichern();
    this.rundsenden();
  }

  private entfernen(sitz: number): void {
    const s = this.daten.sitze[sitz];
    if (!s || this.daten.spiel || s.token === this.daten.hostToken) return;
    this.daten.sitze.splice(sitz, 1);
    const g = this.gastFuer(s.token);
    if (g) this.beende(g, 'entfernt');
    this.speichern();
    this.rundsenden();
  }

  private pause(an: boolean): void {
    if (this.daten.pausiert === an) return;
    this.daten.pausiert = an;
    if (this.timer) {
      if (an) {
        this.timer.restMs = this.timerRest();
        this.timer.endetUm = null;
      } else this.timer.endetUm = Date.now() + this.timer.restMs;
    }
    this.speichern();
    this.rundsenden();
  }

  // ---------- Timer (läuft nur auf dem Host) ----------

  private timerAktualisieren(): void {
    const s = this.daten.spiel;
    if (!s || s.phase === 'ende') {
      this.timer = null;
      return;
    }
    const e = this.daten.einstellungen;
    const [schluessel, art] = schritt(s);

    let sek = e.zugZeit === 0 ? 0 : art === 'zug' ? e.zugZeit : art === 'sonderbau' ? e.sonderbauZeit : e.abwerfZeit;
    // Timer aus, aber alle, die handeln müssten, sind getrennt: Notfall-Timer, damit das Spiel nicht hängt.
    const verbunden = this.spielerVerbunden();
    let fallback = false;
    if (sek === 0 && amZug(s).every((i) => !verbunden[i])) {
      sek = art === 'zug' ? 60 : art === 'sonderbau' ? 20 : 30;
      fallback = true;
    }
    const alt = this.timer;
    if (alt && alt.schluessel === schluessel && alt.fallback === fallback && sek > 0) return; // läuft weiter
    // Beim Wechsel Zug -> Abwerfen die Restzeit des Zugs merken.
    if (alt && alt.art === 'zug' && art === 'abwerfen') this.zugGemerkt = { schluessel: alt.schluessel, restMs: this.timerRest() };
    if (sek === 0) {
      this.timer = null;
      return;
    }
    let restMs = sek * 1000;
    if (this.zugGemerkt && this.zugGemerkt.schluessel === schluessel) restMs = Math.max(10000, this.zugGemerkt.restMs);
    if (art !== 'abwerfen') this.zugGemerkt = null;
    this.timer = {
      schluessel,
      art,
      gesamtMs: sek * 1000,
      restMs,
      endetUm: this.daten.pausiert ? null : Date.now() + restMs,
      fallback,
    };
  }

  private tick(): void {
    const t = this.timer;
    if (!t || t.endetUm === null || Date.now() < t.endetUm || !this.daten.spiel) return;
    // Zeit abgelaufen: Standardaktionen ausführen, bis dieser Schritt vorbei ist.
    this.timer = null;
    for (let i = 0; i < 20; i++) {
      const e = anwenden(this.daten.spiel, { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
      if (!e.ok) break;
      this.daten.spiel = e.state;
      if (e.state.phase === 'ende' || schritt(e.state)[0] !== t.schluessel) break;
    }
    this.pruefeEnde();
    this.timerAktualisieren();
    this.speichern();
    this.rundsenden();
  }

  // ---------- Debug ----------

  private debugGib(spieler: number, rohstoff: string, anzahl: number): void {
    const s = this.daten.spiel;
    if (!s || !s.spieler[spieler] || !(ROHSTOFFE as readonly string[]).includes(rohstoff)) return;
    const r = rohstoff as Rohstoff;
    // Aus der Bank nehmen, damit die Kartenbilanz stimmt.
    const n = Math.max(-s.spieler[spieler].hand[r], Math.min(anzahl, s.bank[r]));
    const neu: GameState = {
      ...s,
      bank: { ...s.bank, [r]: s.bank[r] - n },
      spieler: s.spieler.map((p) => (p.id === spieler ? { ...p, hand: { ...p.hand, [r]: p.hand[r] + n } } : p)),
    };
    this.daten.spiel = neu;
    this.speichern();
    this.rundsenden();
  }

  private debugSetze(json: string): string | null {
    try {
      const s = JSON.parse(json) as GameState;
      if (!s || !Array.isArray(s.spieler) || !s.brett || s.spieler.length !== this.daten.spielerTokens.length)
        return 'Zustand passt nicht zur laufenden Partie.';
      this.daten.spiel = s;
      this.daten.spielNr++; // Brett neu an alle senden
      this.timer = null;
      this.timerAktualisieren();
      this.speichern();
      this.rundsenden();
      return null;
    } catch {
      return 'Kein gültiges JSON.';
    }
  }
}
