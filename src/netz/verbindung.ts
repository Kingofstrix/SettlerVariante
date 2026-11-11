// Schnittstellen der Transportschicht (ohne Abhängigkeit zu PeerJS, damit Host und Client testbar bleiben).
import type { Weg } from './sitzung';

export interface Verbindung {
  senden(daten: unknown): void;
  schliessen(): void;
  onDaten: ((daten: unknown) => void) | null;
  onZu: (() => void) | null;
  /** Direkt (P2P) oder über einen TURN-Relay? */
  weg(): Promise<Weg>;
}

export class TransportFehler extends Error {
  constructor(
    public art: 'belegt' | 'nicht-gefunden' | 'server' | 'zeit' | 'webrtc',
    text: string,
  ) {
    super(text);
  }
}

export interface HostTransport {
  start(id: string): Promise<void>;
  onVerbindung: ((v: Verbindung) => void) | null;
  /** Signalisierungsserver erreichbar? (Bestehende Verbindungen laufen auch ohne weiter.) */
  onStatus: ((online: boolean) => void) | null;
  stop(): void;
}

export interface ClientTransport {
  verbinden(id: string): Promise<Verbindung>;
  stop(): void;
}
