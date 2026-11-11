// Würfelbühne: Ist man dran, liegen die Würfel groß in der Brettmitte. Nach dem Wurf
// rollen sie dort aus, zeigen das Ergebnis und fliegen dann an ihren Platz in der Seitenleiste.
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Sicht } from '../engine';
import { warteBis, wenigBewegung } from './animation';
import { Wuerfel } from './Icons';

const ROLLEN = 600;
const ZEIGEN = 850;
const FLIEGEN = 600;

export interface WuerfelAnim {
  stufe: 'rollt' | 'zeigt' | 'fliegt';
  /** null, solange auf das Ergebnis vom Host gewartet wird */
  wurf: [number, number] | null;
}

/** Steuert die Animation. Startet von selbst, wenn für mich ein neuer Wurf ankommt (auch beim Zeitablauf). */
export function useWuerfelAnimation(
  sicht: Sicht,
  hinweisNr: number | undefined,
): { anim: WuerfelAnim | null; starte: () => void; zentral: boolean } {
  const [anim, setAnim] = useState<WuerfelAnim | null>(null);
  const zeiten = useRef<ReturnType<typeof setTimeout>[]>([]);
  const schluessel = sicht.wurf ? `${sicht.zugNr}:${sicht.wurf.join()}` : '';
  const letzter = useRef(schluessel);
  // Wurf, der in der Mitte animiert wurde: Die Seitenleiste zeigt ihn danach ohne eigene Wurf-Animation.
  const zentralFuer = useRef('');
  const leeren = (): void => {
    zeiten.current.forEach(clearTimeout);
    zeiten.current = [];
  };
  useEffect(() => leeren, []);

  useEffect(() => {
    if (schluessel === letzter.current) return;
    letzter.current = schluessel;
    leeren();
    if (!sicht.wurf || sicht.aktiv !== sicht.ich || wenigBewegung()) return setAnim(null);
    const w = sicht.wurf;
    zentralFuer.current = schluessel;
    warteBis(ROLLEN + ZEIGEN + FLIEGEN); // Kartenflüge erst nach der Landung
    setAnim({ stufe: 'rollt', wurf: w });
    zeiten.current.push(
      setTimeout(() => setAnim({ stufe: 'zeigt', wurf: w }), ROLLEN),
      setTimeout(() => setAnim({ stufe: 'fliegt', wurf: w }), ROLLEN + ZEIGEN),
      setTimeout(() => setAnim(null), ROLLEN + ZEIGEN + FLIEGEN),
    );
  }, [schluessel]);

  // Host lehnt ab (z. B. Pause): Warten abbrechen
  useEffect(() => {
    if (anim && !anim.wurf) {
      leeren();
      setAnim(null);
    }
  }, [hinweisNr]);

  const starte = (): void => {
    if (wenigBewegung()) return;
    leeren();
    setAnim({ stufe: 'rollt', wurf: null });
    zeiten.current.push(setTimeout(() => setAnim((a) => (a && !a.wurf ? null : a)), 4000));
  };
  return { anim, starte, zentral: !!schluessel && zentralFuer.current === schluessel };
}

export function WuerfelBuehne({
  anim,
  wartet,
  pausiert,
  onWuerfeln,
}: {
  anim: WuerfelAnim | null;
  /** Ich bin dran und muss würfeln */
  wartet: boolean;
  pausiert: boolean;
  onWuerfeln: () => void;
}): JSX.Element | null {
  const [flaechen, setFlaechen] = useState<[number, number]>([3, 5]);
  const inhalt = useRef<HTMLDivElement>(null);
  const knopf = useRef<HTMLButtonElement>(null);
  const bereit = wartet && !anim && !pausiert;

  // Beim Rollen zufällige Augen zeigen
  useEffect(() => {
    if (anim?.stufe !== 'rollt') return;
    const i = setInterval(() => setFlaechen([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), 85);
    return () => clearInterval(i);
  }, [anim?.stufe]);

  useEffect(() => {
    if (bereit) knopf.current?.focus();
  }, [bereit]);

  // Leertaste/Enter würfelt, solange kein Eingabefeld oder Dialog aktiv ist
  useEffect(() => {
    if (!bereit) return;
    const taste = (e: KeyboardEvent): void => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const ziel = e.target as HTMLElement | null;
      if (ziel && (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel === knopf.current)) return;
      if (document.querySelector('.modal')) return;
      e.preventDefault();
      onWuerfeln();
    };
    addEventListener('keydown', taste);
    return () => removeEventListener('keydown', taste);
  }, [bereit, onWuerfeln]);

  // Zum Platz in der Seitenleiste fliegen
  useEffect(() => {
    if (anim?.stufe !== 'fliegt' || !inhalt.current) return;
    const ziel = document.querySelector('.wuerfelzeile');
    if (!ziel) return;
    const a = inhalt.current.getBoundingClientRect();
    const b = ziel.getBoundingClientRect();
    const skala = Math.min(1, (b.height * 0.9) / a.height);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    inhalt.current.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${skala})` }], {
      duration: FLIEGEN,
      easing: 'cubic-bezier(.55,0,.35,1)',
      fill: 'forwards',
    });
  }, [anim?.stufe]);

  if (!anim && !wartet) return null;
  const werte: [number, number] = anim?.stufe === 'rollt' ? flaechen : (anim?.wurf ?? [0, 0]);
  const summe = anim?.wurf && anim.stufe !== 'rollt' ? anim.wurf[0] + anim.wurf[1] : null;

  return (
    <div class={`wuerfelbuehne ${anim?.stufe ?? 'wartet'}`}>
      <div class="buehne-inhalt" ref={inhalt}>
        <button class="buehne-wuerfel" disabled={!bereit} onClick={onWuerfeln} aria-label="Würfeln" tabIndex={-1}>
          <Wuerfel wert={werte[0]} groesse={112} />
          <Wuerfel wert={werte[1]} groesse={112} rot />
        </button>
      </div>
      {summe !== null && <div class={`buehne-summe ${summe === 7 ? 'sieben' : ''}`}>{summe === 7 ? '7 – Räuber!' : summe}</div>}
      {wartet && !anim && (
        <>
          <button ref={knopf} class="knopf haupt riesig buehne-knopf" disabled={pausiert} onClick={onWuerfeln}>
            🎲 Würfeln
          </button>
          <p class="buehne-hinweis">{pausiert ? 'Das Spiel ist pausiert.' : 'Klick, Leertaste oder Enter · einen Ritter kannst du vorher unten ausspielen'}</p>
        </>
      )}
    </div>
  );
}
