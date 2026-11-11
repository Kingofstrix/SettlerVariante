// Transportschicht: PeerJS (WebRTC) für den echten Betrieb, BroadcastChannel für den Dev-Modus (mehrere Tabs, kein Netz).
import { Peer, type DataConnection, type PeerOptions } from 'peerjs';
import { lese } from './speicher';
import { TransportFehler, type ClientTransport, type HostTransport, type Verbindung } from './verbindung';

export { TransportFehler, type ClientTransport, type HostTransport, type Verbindung } from './verbindung';

// ---------- Netzwerk-Konfiguration ----------

export interface NetzConfig {
  /** Eigener PeerJS-Server; null = öffentlicher PeerJS-Cloud-Server. */
  peerServer: { host: string; port?: number; path?: string; secure?: boolean } | null;
  iceServers: RTCIceServer[];
}

export interface NetzOverride {
  turnUrl?: string;
  turnUser?: string;
  turnPass?: string;
  peerHost?: string;
  peerPort?: number;
  peerPath?: string;
}

const STANDARD_NETZ: NetzConfig = {
  peerServer: null,
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

let geladen: NetzConfig | null = null;

/** Lädt public/netz-config.json (gilt für alle) und mischt lokale Einstellungen des Browsers darüber. */
export async function ladeNetzConfig(): Promise<NetzConfig> {
  if (!geladen) {
    geladen = { ...STANDARD_NETZ };
    try {
      const antwort = await fetch('./netz-config.json', { cache: 'no-cache' });
      if (antwort.ok) {
        const d = (await antwort.json()) as Partial<NetzConfig>;
        if (Array.isArray(d.iceServers) && d.iceServers.length) geladen.iceServers = d.iceServers;
        if (d.peerServer && typeof d.peerServer.host === 'string' && d.peerServer.host) geladen.peerServer = d.peerServer;
      }
    } catch {
      // Datei fehlt oder ist kaputt: Standardwerte reichen.
    }
  }
  const lokal = lese<NetzOverride>('netz') ?? {};
  const cfg: NetzConfig = { peerServer: geladen.peerServer, iceServers: [...geladen.iceServers] };
  if (lokal.turnUrl) cfg.iceServers.push({ urls: lokal.turnUrl, username: lokal.turnUser ?? '', credential: lokal.turnPass ?? '' });
  if (lokal.peerHost) cfg.peerServer = { host: lokal.peerHost, port: lokal.peerPort || 443, path: lokal.peerPath || '/', secure: true };
  return cfg;
}

function peerOptionen(cfg: NetzConfig): PeerOptions {
  const o: PeerOptions = { config: { iceServers: cfg.iceServers }, debug: 1 };
  if (cfg.peerServer) Object.assign(o, cfg.peerServer);
  return o;
}

// ---------- PeerJS ----------

function verpacke(conn: DataConnection): Verbindung {
  let zu = false;
  const v: Verbindung = {
    onDaten: null,
    onZu: null,
    senden(daten) {
      if (zu || !conn.open) return;
      try {
        // Als JSON-Text über den Binärkanal: PeerJS zerlegt große Nachrichten dort automatisch in Stücke.
        // (Der reine JSON-Kanal von PeerJS verwirft alles über ca. 16 kB – das Brett ist größer.)
        conn.send(JSON.stringify(daten));
      } catch {
        /* Verbindung bricht gerade ab; der Heartbeat räumt auf */
      }
    },
    schliessen() {
      schliesse();
      try {
        conn.close();
      } catch {
        /* egal */
      }
    },
    async weg() {
      try {
        const pc = conn.peerConnection;
        if (!pc) return null;
        const stats = await pc.getStats();
        let paarId: string | undefined;
        const alle = new Map<string, Record<string, unknown>>();
        stats.forEach((r: Record<string, unknown>) => {
          alle.set(r.id as string, r);
          if (r.type === 'transport' && r.selectedCandidatePairId) paarId = r.selectedCandidatePairId as string;
        });
        let paar = paarId ? alle.get(paarId) : undefined;
        if (!paar)
          for (const r of alle.values())
            if (r.type === 'candidate-pair' && (r.selected === true || (r.nominated === true && r.state === 'succeeded'))) paar = r;
        if (!paar) return null;
        const lokal = alle.get(paar.localCandidateId as string);
        const fern = alle.get(paar.remoteCandidateId as string);
        return lokal?.candidateType === 'relay' || fern?.candidateType === 'relay' ? 'relay' : 'direkt';
      } catch {
        return null;
      }
    },
  };
  const schliesse = (): void => {
    if (zu) return;
    zu = true;
    v.onZu?.();
  };
  conn.on('data', (d) => {
    if (typeof d !== 'string') return;
    let daten: unknown;
    try {
      daten = JSON.parse(d);
    } catch {
      return; // kein gültiges JSON: ignorieren
    }
    v.onDaten?.(daten);
  });
  conn.on('close', schliesse);
  conn.on('error', schliesse);
  conn.on('iceStateChanged', (status) => {
    if (status === 'failed' || status === 'closed') schliesse();
  });
  return v;
}

export class PeerHostTransport implements HostTransport {
  onVerbindung: ((v: Verbindung) => void) | null = null;
  onStatus: ((online: boolean) => void) | null = null;
  private peer: Peer | null = null;
  private gestoppt = false;

  async start(id: string): Promise<void> {
    const cfg = await ladeNetzConfig();
    return new Promise((ok, fehler) => {
      let offen = false;
      const peer = new Peer(id, peerOptionen(cfg));
      this.peer = peer;
      const zeit = setTimeout(() => {
        if (!offen) fehler(new TransportFehler('zeit', 'Der Verbindungsserver antwortet nicht.'));
      }, 15000);
      peer.on('open', () => {
        offen = true;
        clearTimeout(zeit);
        this.onStatus?.(true);
        ok();
      });
      peer.on('connection', (conn) => {
        conn.on('open', () => this.onVerbindung?.(verpacke(conn)));
      });
      peer.on('disconnected', () => {
        // Nur die Signalisierung ist weg; laufende Spielerverbindungen bleiben bestehen.
        this.onStatus?.(false);
        if (!this.gestoppt) setTimeout(() => !this.gestoppt && !peer.destroyed && peer.reconnect(), 3000);
      });
      peer.on('error', (e) => {
        if (!offen) {
          clearTimeout(zeit);
          fehler(
            e.type === 'unavailable-id'
              ? new TransportFehler('belegt', 'Dieser Raumcode ist gerade belegt.')
              : e.type === 'browser-incompatible'
                ? new TransportFehler('webrtc', 'Dieser Browser unterstützt kein WebRTC.')
                : new TransportFehler('server', 'Der Verbindungsserver ist nicht erreichbar.'),
          );
        }
      });
    });
  }

  stop(): void {
    this.gestoppt = true;
    this.peer?.destroy();
  }
}

export class PeerClientTransport implements ClientTransport {
  private peer: Peer | null = null;

  private async holePeer(): Promise<Peer> {
    if (this.peer && !this.peer.destroyed && this.peer.open) return this.peer;
    this.peer?.destroy();
    const cfg = await ladeNetzConfig();
    return new Promise((ok, fehler) => {
      const peer = new Peer(peerOptionen(cfg));
      this.peer = peer;
      const zeit = setTimeout(() => fehler(new TransportFehler('zeit', 'Der Verbindungsserver antwortet nicht.')), 15000);
      peer.on('open', () => {
        clearTimeout(zeit);
        ok(peer);
      });
      peer.on('error', (e) => {
        if (!peer.open) {
          clearTimeout(zeit);
          fehler(
            e.type === 'browser-incompatible'
              ? new TransportFehler('webrtc', 'Dieser Browser unterstützt kein WebRTC.')
              : new TransportFehler('server', 'Der Verbindungsserver ist nicht erreichbar.'),
          );
        }
      });
    });
  }

  async verbinden(id: string): Promise<Verbindung> {
    const peer = await this.holePeer();
    return new Promise((ok, fehler) => {
      let fertig = false;
      const conn = peer.connect(id, { reliable: true });
      const ende = (f: TransportFehler): void => {
        if (fertig) return;
        fertig = true;
        clearTimeout(zeit);
        peer.off('error', beiFehler);
        try {
          conn.close();
        } catch {
          /* egal */
        }
        fehler(f);
      };
      const beiFehler = (e: { type: string }): void => {
        if (e.type === 'peer-unavailable') ende(new TransportFehler('nicht-gefunden', 'Raum nicht gefunden. Stimmt der Code und ist der Host online?'));
        else ende(new TransportFehler('server', 'Verbindungsfehler.'));
      };
      // Server erreichbar, Host bekannt, aber der Datenkanal kommt nicht zustande: typisch für gesperrte Netze.
      const zeit = setTimeout(
        () => ende(new TransportFehler('webrtc', 'Direkte Verbindung zum Host nicht möglich (Netzwerk blockiert WebRTC).')),
        15000,
      );
      peer.on('error', beiFehler);
      conn.on('open', () => {
        if (fertig) return;
        fertig = true;
        clearTimeout(zeit);
        peer.off('error', beiFehler);
        ok(verpacke(conn));
      });
    });
  }

  stop(): void {
    this.peer?.destroy();
    this.peer = null;
  }
}

// ---------- BroadcastChannel (Dev-Modus) ----------

interface Umschlag {
  an: string;
  von: string;
  art: 'auf' | 'ok' | 'daten' | 'zu';
  daten?: unknown;
}

function kanalVerbindung(kanal: BroadcastChannel, ich: string, gegen: string): { v: Verbindung; empfange(u: Umschlag): void } {
  let zu = false;
  const v: Verbindung = {
    onDaten: null,
    onZu: null,
    senden(daten) {
      if (!zu) kanal.postMessage({ an: gegen, von: ich, art: 'daten', daten } satisfies Umschlag);
    },
    schliessen() {
      if (zu) return;
      zu = true;
      kanal.postMessage({ an: gegen, von: ich, art: 'zu' } satisfies Umschlag);
      v.onZu?.();
    },
    weg: async () => 'lokal',
  };
  return {
    v,
    empfange(u) {
      if (zu) return;
      if (u.art === 'daten') v.onDaten?.(u.daten);
      if (u.art === 'zu') {
        zu = true;
        v.onZu?.();
      }
    },
  };
}

export class KanalHostTransport implements HostTransport {
  onVerbindung: ((v: Verbindung) => void) | null = null;
  onStatus: ((online: boolean) => void) | null = null;
  private kanal: BroadcastChannel | null = null;
  private partner = new Map<string, { v: Verbindung; empfange(u: Umschlag): void }>();

  async start(id: string): Promise<void> {
    const kanal = new BroadcastChannel(id);
    this.kanal = kanal;
    kanal.onmessage = (ev: MessageEvent<Umschlag>) => {
      const u = ev.data;
      if (!u || u.an !== 'host') return;
      if (u.art === 'auf') {
        this.partner.get(u.von)?.v.schliessen();
        const p = kanalVerbindung(kanal, 'host', u.von);
        this.partner.set(u.von, p);
        kanal.postMessage({ an: u.von, von: 'host', art: 'ok' } satisfies Umschlag);
        this.onVerbindung?.(p.v);
      } else this.partner.get(u.von)?.empfange(u);
    };
    addEventListener('pagehide', () => this.stop());
    this.onStatus?.(true);
  }

  stop(): void {
    for (const p of this.partner.values()) p.v.schliessen();
    this.partner.clear();
    this.kanal?.close();
    this.kanal = null;
  }
}

export class KanalClientTransport implements ClientTransport {
  private kanal: BroadcastChannel | null = null;
  private aktuell: Verbindung | null = null;

  verbinden(id: string): Promise<Verbindung> {
    this.stop();
    const ich = 'c' + Math.random().toString(36).slice(2, 10);
    const kanal = new BroadcastChannel(id);
    this.kanal = kanal;
    return new Promise((ok, fehler) => {
      const p = kanalVerbindung(kanal, ich, 'host');
      const zeit = setTimeout(() => fehler(new TransportFehler('nicht-gefunden', 'Raum nicht gefunden (Dev-Modus: Host-Tab offen?).')), 1500);
      kanal.onmessage = (ev: MessageEvent<Umschlag>) => {
        const u = ev.data;
        if (!u || u.an !== ich) return;
        if (u.art === 'ok') {
          clearTimeout(zeit);
          this.aktuell = p.v;
          ok(p.v);
        } else p.empfange(u);
      };
      addEventListener('pagehide', () => p.v.schliessen());
      kanal.postMessage({ an: 'host', von: ich, art: 'auf' } satisfies Umschlag);
    });
  }

  stop(): void {
    this.aktuell?.schliessen();
    this.aktuell = null;
    this.kanal?.close();
    this.kanal = null;
  }
}
