// Versioniertes JSON-Protokoll zwischen Host und Clients. Jede eingehende Nachricht wird geprüft;
// Unbekanntes oder Ungültiges wird verworfen (null), nie geworfen.
import type { Brett, Sicht } from '../engine';
import type { Absicht, Einstellungen, SitzInfo, TimerArt } from './sitzung';

export const PROTOKOLL_VERSION = 1;

// ---- Client -> Host ----
export type ClientNachricht =
  | { v: number; t: 'hallo'; token: string; name: string; farbe: string; rolle: 'spieler' | 'beamer' }
  | { v: number; t: 'profil'; name: string; farbe: string }
  | { v: number; t: 'absicht'; nr: number; aktion: Absicht }
  | { v: number; t: 'pong'; id: number };

// ---- Host -> Client ----
export type SichtOhneBrett = Omit<Sicht, 'brett'> & { brett?: Brett };
export type EndeGrund = 'uebernommen' | 'voll' | 'laeuft' | 'version' | 'entfernt';
export type HostNachricht =
  | { v: number; t: 'lobby'; raumCode: string; sitze: SitzInfo[]; meinSitz: number | null; beamer: number; einstellungen: Einstellungen }
  | {
      v: number;
      t: 'spiel';
      spielNr: number;
      sicht: SichtOhneBrett;
      sitze: SitzInfo[];
      verbunden: boolean[];
      timer: { restMs: number; gesamtMs: number; art: TimerArt; laeuft: boolean } | null;
      pausiert: boolean;
    }
  | { v: number; t: 'abgelehnt'; nr: number; grund: string }
  | { v: number; t: 'ping'; id: number }
  | { v: number; t: 'ende'; grund: EndeGrund };

const ABSICHT_TYPEN = new Set([
  'WUERFELN', 'ABWERFEN', 'RAEUBER_SETZEN', 'STEHLEN', 'STRASSE_BAUEN', 'SIEDLUNG_BAUEN', 'STADT_BAUEN',
  'ENTW_KAUFEN', 'RITTER_SPIELEN', 'STRASSENBAU_SPIELEN', 'ERFINDUNG_SPIELEN', 'MONOPOL_SPIELEN', 'BANKHANDEL',
  'HANDEL_ANBIETEN', 'HANDEL_ANNEHMEN', 'HANDEL_ABLEHNEN', 'HANDEL_ZURUECKZIEHEN', 'ZUG_BEENDEN', 'SONDERBAU_FERTIG',
]);

function istObjekt(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
function text(x: unknown, max: number): x is string {
  return typeof x === 'string' && x.length <= max;
}
function zahl(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Prüft eine Nachricht eines Clients. Die Feinprüfung der Aktion übernimmt die Engine. */
export function pruefeClientNachricht(d: unknown): ClientNachricht | null {
  try {
    if (!istObjekt(d) || !zahl(d.v) || typeof d.t !== 'string') return null;
    if (JSON.stringify(d).length > 4000) return null;
    switch (d.t) {
      case 'hallo':
        if (!text(d.token, 64) || d.token.length < 8 || !text(d.name, 40) || !text(d.farbe, 16)) return null;
        if (d.rolle !== 'spieler' && d.rolle !== 'beamer') return null;
        return { v: d.v, t: 'hallo', token: d.token, name: d.name, farbe: d.farbe, rolle: d.rolle };
      case 'profil':
        if (!text(d.name, 40) || !text(d.farbe, 16)) return null;
        return { v: d.v, t: 'profil', name: d.name, farbe: d.farbe };
      case 'absicht':
        if (!zahl(d.nr) || !istObjekt(d.aktion) || typeof d.aktion.typ !== 'string') return null;
        if (!ABSICHT_TYPEN.has(d.aktion.typ)) return null; // insbesondere kein ZEIT_ABGELAUFEN von außen
        return { v: d.v, t: 'absicht', nr: d.nr, aktion: d.aktion as unknown as Absicht };
      case 'pong':
        if (!zahl(d.id)) return null;
        return { v: d.v, t: 'pong', id: d.id };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Prüft eine Nachricht des Hosts (Grundform; der Host ist die vertrauenswürdige Instanz). */
export function pruefeHostNachricht(d: unknown): HostNachricht | null {
  try {
    if (!istObjekt(d) || !zahl(d.v) || typeof d.t !== 'string') return null;
    switch (d.t) {
      case 'lobby':
        if (!text(d.raumCode, 12) || !Array.isArray(d.sitze) || !istObjekt(d.einstellungen)) return null;
        return d as unknown as HostNachricht;
      case 'spiel':
        if (!istObjekt(d.sicht) || !Array.isArray(d.sicht.spieler) || !Array.isArray(d.verbunden) || !zahl(d.spielNr)) return null;
        return d as unknown as HostNachricht;
      case 'abgelehnt':
        if (!zahl(d.nr) || !text(d.grund, 300)) return null;
        return d as unknown as HostNachricht;
      case 'ping':
        if (!zahl(d.id)) return null;
        return d as unknown as HostNachricht;
      case 'ende':
        if (typeof d.grund !== 'string') return null;
        return d as unknown as HostNachricht;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export const ENDE_TEXT: Record<EndeGrund, string> = {
  uebernommen: 'Dieses Spiel wurde in einem anderen Tab geöffnet. Dieser Tab ist jetzt inaktiv.',
  voll: 'Der Raum ist voll.',
  laeuft: 'Das Spiel läuft bereits. Neue Spieler können nicht mehr beitreten (als Beamer zuschauen geht).',
  version: 'Versionen passen nicht zusammen. Bitte alle die Seite neu laden (Strg+F5).',
  entfernt: 'Der Host hat dich aus dem Raum entfernt.',
};
