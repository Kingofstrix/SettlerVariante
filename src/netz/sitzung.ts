// Gemeinsame Schnittstelle, gegen die die Oberfläche arbeitet – egal ob Host, Client, Beamer oder lokales Spiel.
import type { Aktion, Layout, Sicht } from '../engine';

type OhneSpieler<T> = T extends unknown ? Omit<T, 'spieler'> : never;
/** Absicht eines Spielers: eine Aktion ohne Spielerindex (den setzt der Host). */
export type Absicht = OhneSpieler<Exclude<Aktion, { typ: 'ZEIT_ABGELAUFEN' }>>;

export type Rolle = 'host' | 'spieler' | 'beamer' | 'lokal';
export type Weg = 'direkt' | 'relay' | 'lokal' | null;

export interface SitzInfo {
  name: string;
  farbe: string;
  verbunden: boolean;
  latenz: number | null;
  weg: Weg;
  istHost: boolean;
}

export interface Einstellungen {
  maxSpieler: number; // 3–6
  layout: Layout;
  siegpunkte: number; // 8, 10, 12
  freundlicherRaeuber: boolean;
  zugZeit: number; // Sekunden; 0 = aus
  sonderbauZeit: number;
  abwerfZeit: number;
}

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  maxSpieler: 6,
  layout: 'zufall',
  siegpunkte: 10,
  freundlicherRaeuber: false,
  zugZeit: 90,
  sonderbauZeit: 20,
  abwerfZeit: 30,
};

export type TimerArt = 'zug' | 'sonderbau' | 'abwerfen';

export interface TimerAnzeige {
  /** Lokale Uhrzeit (ms), zu der der Timer endet; null = angehalten. */
  endetUm: number | null;
  restMs: number;
  gesamtMs: number;
  art: TimerArt;
}

export interface SitzungsZustand {
  status: 'verbinde' | 'lobby' | 'spiel' | 'beendet';
  /** Verbindung zum Host steht (beim Host selbst: Signalisierungsserver erreichbar). */
  online: boolean;
  /** Grund, falls status === 'beendet' (z. B. Tab übernommen) oder Verbindungsproblem. */
  meldung: string | null;
  rolle: Rolle;
  raumCode: string;
  sitze: SitzInfo[];
  meinSitz: number | null;
  beamer: number;
  einstellungen: Einstellungen;
  sicht: Sicht | null;
  /** Verbindungsstatus je Spieler (Index wie in sicht.spieler). */
  verbunden: boolean[];
  timer: TimerAnzeige | null;
  pausiert: boolean;
  /** Letzte Ablehnung durch den Host, für einen Toast. */
  hinweis: { nr: number; text: string } | null;
}

export interface HostFunktionen {
  einstellungen(e: Partial<Einstellungen>): void;
  starten(): void;
  pause(an: boolean): void;
  zurLobby(): void;
  entfernen(sitz: number): void;
  exportieren(): string;
  seed(): number | null;
  /** Debug: aktive Spieler-Sicht wechseln, Karten geben, Zustand setzen. */
  debugGib(spieler: number, rohstoff: string, anzahl: number): void;
  debugZustand(): string;
  debugSetze(json: string): string | null;
}

export interface Sitzung {
  readonly zustand: SitzungsZustand;
  abonniere(cb: () => void): () => void;
  aktion(a: Absicht): void;
  profil(name: string, farbe: string): void;
  verlassen(): void;
  readonly host: HostFunktionen | null;
}

export const FARBEN: { id: string; name: string; hex: string }[] = [
  { id: 'rot', name: 'Rot', hex: '#d83a34' },
  { id: 'blau', name: 'Blau', hex: '#2b6fdb' },
  { id: 'orange', name: 'Orange', hex: '#f28c1e' },
  { id: 'weiss', name: 'Weiß', hex: '#f3f1ea' },
  { id: 'gruen', name: 'Grün', hex: '#2fa35b' },
  { id: 'braun', name: 'Braun', hex: '#8b5a2b' },
];

export function farbHex(id: string): string {
  return FARBEN.find((f) => f.id === id)?.hex ?? '#888888';
}

/** Kleine Basisklasse für Abonnenten. */
export class Beobachtbar {
  private abos = new Set<() => void>();
  abonniere(cb: () => void): () => void {
    this.abos.add(cb);
    return () => this.abos.delete(cb);
  }
  protected melde(): void {
    for (const cb of [...this.abos]) cb();
  }
}
