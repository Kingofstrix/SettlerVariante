// Würfelstatistik der laufenden Partie: Häufigkeit je Augensumme, mit Erwartungswert als Vergleich.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Sicht } from '../engine';

const SUMMEN = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Wahrscheinlichkeit einer Augensumme mit zwei Würfeln */
export function wahrscheinlichkeit(summe: number): number {
  return (6 - Math.abs(7 - summe)) / 36;
}

function zahl(x: number): string {
  return x.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

// Diagramm-Maße im viewBox-Koordinatensystem
const B = 320;
const H = 132;
const OBEN = 10;
const UNTEN = 4;
const SLOT = B / SUMMEN.length;
const BALKEN = SLOT - 2; // 2px Abstand zwischen den Balken

export function WuerfelStatistik({ sicht }: { sicht: Sicht }): JSX.Element {
  const zaehler = sicht.wurfStatistik ?? [];
  const werte = SUMMEN.map((s) => zaehler[s] ?? 0);
  const gesamt = werte.reduce((a, b) => a + b, 0);
  const erwartet = SUMMEN.map((s) => gesamt * wahrscheinlichkeit(s));
  const max = Math.max(1, ...werte, ...erwartet) * 1.08;
  const y = (v: number): number => OBEN + (H - OBEN - UNTEN) * (1 - v / max);
  const [aktiv, setAktiv] = useState<number | null>(null);
  const letzte = sicht.wurf ? sicht.wurf[0] + sicht.wurf[1] : null;

  let kopf: string;
  if (gesamt === 0) kopf = 'Noch nicht gewürfelt.';
  else if (aktiv !== null) {
    const s = SUMMEN[aktiv];
    kopf = `${s}: ${werte[aktiv]}× gefallen (${zahl((werte[aktiv] / gesamt) * 100)} %) · erwartet ${zahl(erwartet[aktiv])}× (${zahl(wahrscheinlichkeit(s) * 100)} %)`;
  } else {
    const spitze = Math.max(...werte);
    const oft = SUMMEN.filter((_, i) => werte[i] === spitze);
    kopf = `${gesamt} Würfe · am häufigsten: ${oft.join(', ')} (${spitze}×)`;
  }

  return (
    <div class="statistik">
      <p class="statistik-kopf" aria-live="polite">
        {kopf}
      </p>
      <svg
        class="statistik-diagramm"
        viewBox={`0 0 ${B} ${H}`}
        role="img"
        aria-label={`Würfelstatistik: ${SUMMEN.map((s, i) => `${s}: ${werte[i]}`).join(', ')}`}
        onMouseLeave={() => setAktiv(null)}
      >
        {/* Grundlinie */}
        <line x1="0" x2={B} y1={H - UNTEN} y2={H - UNTEN} class="st-achse" />
        {SUMMEN.map((s, i) => {
          const x = i * SLOT + 1;
          const top = y(werte[i]);
          const hoehe = H - UNTEN - top;
          const r = Math.min(4, hoehe / 2, BALKEN / 2);
          // Balken: oben abgerundet, unten gerade auf der Grundlinie
          const pfad =
            hoehe > 0
              ? `M${x},${H - UNTEN} V${top + r} Q${x},${top} ${x + r},${top} H${x + BALKEN - r} Q${x + BALKEN},${top} ${x + BALKEN},${top + r} V${H - UNTEN} Z`
              : '';
          const ey = y(erwartet[i]);
          return (
            <g class={`st-slot ${aktiv === i ? 'aktiv' : ''} ${s === 7 ? 'sieben' : ''} ${s === letzte ? 'letzte' : ''}`}>
              {pfad && <path d={pfad} class="st-balken" />}
              {gesamt > 0 && <line x1={x + 3} x2={x + BALKEN - 3} y1={ey} y2={ey} class="st-erwartet" />}
              {/* Trefferfläche größer als der Balken */}
              <rect
                x={i * SLOT}
                y="0"
                width={SLOT}
                height={H}
                fill="transparent"
                onMouseEnter={() => setAktiv(i)}
                onFocus={() => setAktiv(i)}
                onBlur={() => setAktiv(null)}
                tabIndex={0}
                aria-label={`${s}: ${werte[i]}-mal, erwartet ${zahl(erwartet[i])}`}
              />
            </g>
          );
        })}
      </svg>
      {/* Tabellenzeile: Augensumme und Anzahl unter jedem Balken */}
      <div class="statistik-tabelle" aria-hidden="true">
        {SUMMEN.map((s, i) => (
          <div class={`${aktiv === i ? 'aktiv' : ''} ${s === letzte ? 'letzte' : ''}`}>
            <b class={s === 6 || s === 8 ? 'rot' : ''}>{s}</b>
            <span>{werte[i]}</span>
          </div>
        ))}
      </div>
      <p class="statistik-legende">
        <i class="lg-balken" /> gewürfelt <i class="lg-erwartet" /> erwartet bei {gesamt} Würfen
        {letzte !== null && (
          <>
            {' '}
            · <i class="lg-letzte" /> letzter Wurf
          </>
        )}
      </p>
    </div>
  );
}
