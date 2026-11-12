// Kartenflug-Animationen zwischen Hand, Bank und Mitspielern.
// Arbeitet direkt mit dem DOM (Web Animations API), damit Preact dafür nicht neu rendern muss.
import { render, type JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Sicht, SichtBewegung } from '../engine';
import { EntwIcon, KartenIcon, ROHSTOFF_FARBE, RohstoffIcon } from './Icons';

/** Bis zu diesem Zeitpunkt warten Kartenflüge (z. B. bis die Würfel gelandet sind). */
let ruheBis = 0;
export function warteBis(ms: number): void {
  ruheBis = Math.max(ruheBis, Date.now() + ms);
}

export function wenigBewegung(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const DAUER = 750;
const ABSTAND = 120;
const MAX_JE_BEWEGUNG = 4;
const MAX_GESAMT = 16;

function ebene(): HTMLElement {
  let e = document.getElementById('flugebene');
  if (!e) {
    e = document.createElement('div');
    e.id = 'flugebene';
    document.body.appendChild(e);
  }
  return e;
}

function mitte(el: Element): [number, number] {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

function sichtbar(el: Element | null): el is Element {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function inhalt(r: SichtBewegung['r']): JSX.Element {
  if (r === null) return <KartenIcon groesse={28} />;
  if (r === 'entw') return <EntwIcon typ="siegpunkt" groesse={24} />;
  return <RohstoffIcon typ={r} groesse={26} />;
}

function fliege(von: Element, nach: Element, r: SichtBewegung['r'], verzoegerung: number): void {
  const [x1, y1] = mitte(von);
  const [x2, y2] = mitte(nach);
  const el = document.createElement('div');
  el.className = `flugkarte ${r === null ? 'verdeckt' : r === 'entw' ? 'entw' : ''}`;
  if (r && r !== 'entw') el.style.setProperty('--kf', ROHSTOFF_FARBE[r]);
  el.style.left = `${x1}px`;
  el.style.top = `${y1}px`;
  el.style.opacity = '0';
  render(inhalt(r), el);
  ebene().appendChild(el);
  const dx = x2 - x1;
  const dy = y2 - y1;
  // Leichter Bogen nach oben, damit man die Richtung gut erkennt
  const bogen = Math.min(90, 30 + Math.hypot(dx, dy) * 0.12);
  const a = el.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 1, offset: 0.12 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - bogen}px) translate(-50%, -50%) scale(1.15)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) translate(-50%, -50%) scale(0.75)`, opacity: 0.9, offset: 0.95 },
      { transform: `translate(${dx}px, ${dy}px) translate(-50%, -50%) scale(0.6)`, opacity: 0 },
    ],
    { duration: DAUER, delay: verzoegerung, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' },
  );
  const weg = (): void => {
    render(null, el);
    el.remove();
  };
  a.onfinish = () => {
    weg();
    // Ziel kurz "aufnehmen" lassen
    nach.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 240 });
  };
  a.oncancel = weg;
}

/** Bildschirmelement für eine Seite der Bewegung: Bank, eigene Hand oder Zeile eines Spielers. */
function ziel(wer: number | null, r: SichtBewegung['r'], ich: number | null): Element | null {
  if (wer === null) {
    const genau = document.querySelector(`.bank [data-bank="${r ?? ''}"]`);
    return sichtbar(genau) ? genau : document.querySelector('.bank');
  }
  if (wer === ich) {
    const genau = r === 'entw' ? document.querySelector('.entw') : r ? document.querySelector(`.hand [data-hand="${r}"]`) : null;
    if (sichtbar(genau)) return genau;
  }
  const zeile = document.querySelector(`.spielerzeile[data-sp="${wer}"]`);
  return sichtbar(zeile) ? zeile : null;
}

/** Lässt für jede neue Kartenbewegung Karten zwischen Hand, Bank und Mitspielern fliegen. */
export function useKartenFluege(sicht: Sicht): void {
  const zuletzt = useRef<{ nr: number; ich: number | null; wurf: string } | null>(null);
  const maxNr = sicht.bewegungen.at(-1)?.nr ?? 0;
  const wurf = sicht.wurf ? `${sicht.zugNr}:${sicht.wurf.join()}` : '';
  useEffect(() => {
    const vorher = zuletzt.current;
    zuletzt.current = { nr: maxNr, ich: sicht.ich, wurf };
    // Erste Anzeige, Perspektivwechsel oder neue Partie: nichts nachspielen
    if (!vorher || vorher.ich !== sicht.ich || maxNr < vorher.nr || wenigBewegung()) return;
    const neu = sicht.bewegungen.filter((b) => b.nr > vorher.nr);
    if (neu.length === 0) return;
    let start = Math.max(0, ruheBis - Date.now());
    if (vorher.wurf !== wurf && sicht.wurf) start = Math.max(start, 450); // seitliche Würfel erst ausrollen lassen
    // Nicht synchron rendern: Preact führt ausstehende Effekte mitten im nächsten Render aus, und ein
    // verschachteltes render() würde dann die Hooks der gerade rendernden Komponente durcheinanderbringen.
    queueMicrotask(() => {
      let i = 0;
      for (const b of neu) {
        // Würfelertrag: vom Feld auf dem Brett statt von der Bank
        const feld = b.hex !== undefined ? document.querySelector(`.brett [data-hex="${b.hex}"] circle`) : null;
        const von = sichtbar(feld) ? feld : ziel(b.von, b.r, sicht.ich);
        const nach = ziel(b.nach, b.r, sicht.ich);
        if (!von || !nach || von === nach) continue;
        for (let k = 0; k < Math.min(b.n, MAX_JE_BEWEGUNG) && i < MAX_GESAMT; k++, i++) fliege(von, nach, b.r, start + i * ABSTAND);
      }
    });
  }, [maxNr, sicht.ich]);
}
