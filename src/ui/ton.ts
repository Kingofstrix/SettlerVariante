// Dezente Töne per WebAudio (keine Audiodateien nötig). Abschaltbar.
import { lese, schreibe } from '../netz/speicher';

let an = lese<boolean>('ton') ?? true;
let ctx: AudioContext | null = null;

export function tonAn(): boolean {
  return an;
}
export function setzeTon(wert: boolean): void {
  an = wert;
  schreibe('ton', wert);
}

function piep(frequenz: number, start: number, dauer: number, lautstaerke = 0.05, form: OscillatorType = 'sine'): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = form;
  o.frequency.value = frequenz;
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(lautstaerke, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dauer + 0.02);
}

export function ton(art: 'dran' | 'wuerfel' | 'bau' | 'fehler' | 'handel' | 'fremd'): void {
  if (!an) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    switch (art) {
      case 'dran':
        piep(660, 0, 0.18);
        piep(880, 0.14, 0.25);
        break;
      case 'wuerfel':
        for (let i = 0; i < 4; i++) piep(180 + Math.random() * 120, i * 0.05, 0.05, 0.04, 'triangle');
        break;
      case 'bau':
        piep(330, 0, 0.12, 0.04, 'triangle');
        break;
      case 'handel':
        piep(520, 0, 0.12);
        break;
      case 'fremd': // ein Mitspieler baut, kauft oder versetzt den Räuber
        piep(392, 0, 0.1, 0.035, 'triangle');
        piep(294, 0.09, 0.14, 0.035, 'triangle');
        break;
      case 'fehler':
        piep(160, 0, 0.2, 0.04, 'sawtooth');
        break;
    }
  } catch {
    /* Ton ist optional */
  }
}
