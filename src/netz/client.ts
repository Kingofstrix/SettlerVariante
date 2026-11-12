// Client (Spieler oder Beamer): sendet Absichten an den Host und zeigt dessen gefilterte Sicht an.
import type { Brett, KartenId, Sicht } from '../engine';
import { ENDE_TEXT, PROTOKOLL_VERSION, pruefeHostNachricht, type ClientNachricht } from './protokoll';
import { partien, uebernimm } from './rangliste';
import { Beobachtbar, STANDARD_EINSTELLUNGEN, type Absicht, type Sitzung, type SitzungsZustand } from './sitzung';
import { loesche, peerId, type Profil } from './speicher';
import { TransportFehler, type ClientTransport, type Verbindung } from './verbindung';

const STILLE_MS = 9000;

export class Client extends Beobachtbar implements Sitzung {
  zustand: SitzungsZustand;
  readonly host = null;
  private conn: Verbindung | null = null;
  private brett: { spielNr: number; brett: Brett } | null = null;
  private absichtNr = 0;
  private hinweisNr = 0;
  private letzteNachricht = 0;
  private beendet = false;
  private wache: ReturnType<typeof setInterval>;
  private neuVersuch: ReturnType<typeof setTimeout> | null = null;
  private versuche = 0;

  constructor(
    private transport: ClientTransport,
    raumCode: string,
    private rolle: 'spieler' | 'beamer',
    private meinProfil: Profil,
    private token: string,
  ) {
    super();
    this.zustand = {
      status: 'verbinde',
      online: false,
      meldung: null,
      rolle,
      raumCode,
      sitze: [],
      meinSitz: null,
      beamer: 0,
      einstellungen: STANDARD_EINSTELLUNGEN,
      sicht: null,
      verbunden: [],
      timer: null,
      pausiert: false,
      chat: [],
      hinweis: null,
    };
    // Heartbeat-Wache: kommt länger nichts vom Host, gilt die Verbindung als tot.
    this.wache = setInterval(() => {
      if (this.conn && Date.now() - this.letzteNachricht > STILLE_MS) this.conn.schliessen();
    }, 1000);
    void this.verbinde();
  }

  private setze(teil: Partial<SitzungsZustand>): void {
    this.zustand = { ...this.zustand, ...teil };
    this.melde();
  }

  private async verbinde(): Promise<void> {
    if (this.beendet) return;
    this.versuche++;
    try {
      const conn = await this.transport.verbinden(peerId(this.zustand.raumCode));
      if (this.beendet) return conn.schliessen();
      this.conn = conn;
      this.versuche = 0;
      this.letzteNachricht = Date.now();
      conn.onDaten = (d) => this.empfange(d);
      conn.onZu = () => {
        if (this.conn !== conn) return;
        this.conn = null;
        if (this.beendet) return;
        this.setze({ online: false, meldung: 'Verbindung zum Host verloren – verbinde neu …' });
        this.plane(1500);
      };
      this.sende({ v: PROTOKOLL_VERSION, t: 'hallo', token: this.token, name: this.meinProfil.name, farbe: this.meinProfil.farbe, rolle: this.rolle });
      this.sende({ v: PROTOKOLL_VERSION, t: 'rangliste', partien: partien() });
    } catch (e) {
      if (this.beendet) return;
      const text = e instanceof TransportFehler ? e.message : 'Verbindung fehlgeschlagen.';
      this.setze({ online: false, meldung: `${text} Neuer Versuch läuft … (${this.versuche})` });
      this.plane(2500);
    }
  }

  private plane(ms: number): void {
    if (this.neuVersuch) clearTimeout(this.neuVersuch);
    this.neuVersuch = setTimeout(() => void this.verbinde(), ms);
  }

  private sende(n: ClientNachricht): void {
    this.conn?.senden(n);
  }

  private empfange(d: unknown): void {
    const n = pruefeHostNachricht(d);
    if (!n) return;
    this.letzteNachricht = Date.now();
    switch (n.t) {
      case 'ping':
        return this.sende({ v: PROTOKOLL_VERSION, t: 'pong', id: n.id });
      case 'lobby':
        return this.setze({
          status: 'lobby',
          online: true,
          meldung: null,
          raumCode: n.raumCode,
          sitze: n.sitze,
          meinSitz: n.meinSitz,
          beamer: n.beamer,
          einstellungen: n.einstellungen,
          sicht: null,
          timer: null,
        });
      case 'spiel': {
        if (n.sicht.brett) this.brett = { spielNr: n.spielNr, brett: n.sicht.brett };
        if (!this.brett || this.brett.spielNr !== n.spielNr) return; // Brett fehlt (sollte nicht passieren)
        const sicht = { ...n.sicht, brett: this.brett.brett } as Sicht;
        return this.setze({
          status: 'spiel',
          online: true,
          meldung: null,
          sicht,
          sitze: n.sitze,
          verbunden: n.verbunden,
          pausiert: n.pausiert,
          timer: n.timer
            ? { endetUm: n.timer.laeuft ? Date.now() + n.timer.restMs : null, restMs: n.timer.restMs, gesamtMs: n.timer.gesamtMs, art: n.timer.art }
            : null,
        });
      }
      case 'chat':
        return this.setze({ chat: n.eintraege });
      case 'rangliste':
        uebernimm(n.partien);
        return;
      case 'abgelehnt':
        return this.setze({ hinweis: { nr: ++this.hinweisNr, text: n.grund } });
      case 'ende':
        this.beendet = true;
        this.setze({ status: 'beendet', online: false, meldung: ENDE_TEXT[n.grund] ?? 'Verbindung beendet.' });
        this.aufraeumen();
        if (n.grund !== 'uebernommen') loesche('sitzung');
        return;
    }
  }

  aktion(a: Absicht): void {
    if (!this.conn) return this.setze({ hinweis: { nr: ++this.hinweisNr, text: 'Keine Verbindung zum Host.' } });
    this.sende({ v: PROTOKOLL_VERSION, t: 'absicht', nr: ++this.absichtNr, aktion: a });
  }

  chat(text: string): void {
    this.sende({ v: PROTOKOLL_VERSION, t: 'chat', text });
  }

  profil(name: string, farbe: string): void {
    this.meinProfil = { name, farbe };
    this.sende({ v: PROTOKOLL_VERSION, t: 'profil', name, farbe });
  }

  stimme(karte: KartenId | null): void {
    this.sende({ v: PROTOKOLL_VERSION, t: 'stimme', karte });
  }

  private aufraeumen(): void {
    clearInterval(this.wache);
    if (this.neuVersuch) clearTimeout(this.neuVersuch);
    this.conn?.schliessen();
    this.conn = null;
    this.transport.stop();
  }

  verlassen(): void {
    this.beendet = true;
    this.aufraeumen();
    loesche('sitzung');
  }
}
