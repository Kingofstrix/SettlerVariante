// Lokale Ablage (Token, Profil, Host-Spielstand, Netzwerk-Einstellungen).
// Im Dev-Modus (?dev=1) liegt alles im sessionStorage, damit mehrere Tabs verschiedene Spieler sein können.

const imBrowser = typeof location !== 'undefined' && typeof localStorage !== 'undefined';

export const DEV = imBrowser && new URLSearchParams(location.search).has('dev');

/** Ersatzablage für Umgebungen ohne Web Storage (Tests in Node). */
class Arbeitsspeicher {
  private daten = new Map<string, string>();
  getItem(k: string): string | null {
    return this.daten.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.daten.set(k, v);
  }
  removeItem(k: string): void {
    this.daten.delete(k);
  }
}

const lager: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = !imBrowser ? new Arbeitsspeicher() : DEV ? sessionStorage : localStorage;
const PRAEFIX = 'inselreich.';

export function lese<T>(schluessel: string): T | null {
  try {
    const roh = lager.getItem(PRAEFIX + schluessel);
    return roh === null ? null : (JSON.parse(roh) as T);
  } catch {
    return null;
  }
}

export function schreibe(schluessel: string, wert: unknown): void {
  try {
    lager.setItem(PRAEFIX + schluessel, JSON.stringify(wert));
  } catch {
    // Speicher voll oder gesperrt: Spiel läuft weiter, nur ohne Persistenz.
  }
}

export function loesche(schluessel: string): void {
  try {
    lager.removeItem(PRAEFIX + schluessel);
  } catch {
    /* egal */
  }
}

function zufallsText(laenge: number, alphabet: string): string {
  const bytes = new Uint32Array(laenge);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Zufälliges, dauerhaftes Spieler-Token für den Wiedereinstieg auf denselben Sitz. */
export function meinToken(): string {
  let t = lese<string>('token');
  if (!t) {
    t = zufallsText(20, 'abcdefghijklmnopqrstuvwxyz0123456789');
    schreibe('token', t);
  }
  return t;
}

/** Raumcode ohne verwechselbare Zeichen (kein 0/O, 1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function neuerRaumCode(): string {
  return zufallsText(5, CODE_ALPHABET);
}
export function normalisiereCode(eingabe: string): string {
  return [...eingabe.toUpperCase()]
    .filter((c) => CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, 6);
}
export function codeGueltig(code: string): boolean {
  return code.length >= 4 && code.length <= 6 && [...code].every((c) => CODE_ALPHABET.includes(c));
}

/** Festes, app-spezifisches Präfix gegen Kollisionen mit anderen Nutzern des öffentlichen PeerJS-Servers. */
const PEER_PRAEFIX = 'inselreich-q7x4m2-';
export function peerId(raumCode: string): string {
  return PEER_PRAEFIX + raumCode.toLowerCase();
}

export function zufallsSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] & 0x7fffffff;
}

export interface Profil {
  name: string;
  farbe: string;
}
export interface GemerkteSitzung {
  art: 'host' | 'client';
  raumCode: string;
  rolle: 'spieler' | 'beamer';
}
