// Lokales Spiel an einem Gerät (Hot-Seat): alle Spieler teilen sich einen Bildschirm.
import { amZug, anwenden, neuesSpiel, sichtFuer, type GameState } from '../engine';
import { Beobachtbar, type Absicht, type Einstellungen, type Sitzung, type SitzungsZustand } from './sitzung';
import { zufallsSeed, type Profil } from './speicher';

export class LokalSitzung extends Beobachtbar implements Sitzung {
  zustand: SitzungsZustand;
  readonly host = null;
  private spiel: GameState;
  private wer = 0;
  private hinweisNr = 0;

  constructor(spieler: Profil[], einstellungen: Einstellungen) {
    super();
    this.spiel = neuesSpiel({
      spieler,
      seed: zufallsSeed(),
      config: { layout: einstellungen.layout, siegpunkte: einstellungen.siegpunkte, freundlicherRaeuber: einstellungen.freundlicherRaeuber },
    });
    this.wer = amZug(this.spiel)[0] ?? 0;
    this.zustand = {
      status: 'spiel',
      online: true,
      meldung: null,
      rolle: 'lokal',
      raumCode: '',
      sitze: this.spiel.spieler.map((p) => ({ name: p.name, farbe: p.farbe, verbunden: true, latenz: 0, weg: 'lokal', istHost: false })),
      meinSitz: null,
      beamer: 0,
      einstellungen: { ...einstellungen, zugZeit: 0 },
      sicht: sichtFuer(this.spiel, this.wer),
      verbunden: this.spiel.spieler.map(() => true),
      timer: null,
      pausiert: false,
      chat: [],
      hinweis: null,
    };
  }

  /** Perspektive wechseln (z. B. damit ein Mitspieler ein Handelsangebot beantworten kann). */
  perspektive(spieler: number): void {
    this.wer = spieler;
    this.zustand = { ...this.zustand, sicht: sichtFuer(this.spiel, this.wer) };
    this.melde();
  }

  aktion(a: Absicht): void {
    const e = anwenden(this.spiel, { ...a, spieler: this.wer } as Parameters<typeof anwenden>[1]);
    if (!e.ok) {
      this.zustand = { ...this.zustand, hinweis: { nr: ++this.hinweisNr, text: e.fehler } };
      return this.melde();
    }
    const vorher = amZug(this.spiel);
    this.spiel = e.state;
    const dran = amZug(this.spiel);
    // Automatisch zum nächsten Spieler wechseln, der handeln muss.
    if (dran.length && (!dran.includes(this.wer) || vorher.join() !== dran.join())) this.wer = dran[0];
    this.zustand = { ...this.zustand, sicht: sichtFuer(this.spiel, this.wer) };
    this.melde();
  }

  profil(): void {}
  chat(): void {}
  verlassen(): void {}
}
