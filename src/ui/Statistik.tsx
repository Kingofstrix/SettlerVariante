// Statistik am Spielende: Würfelverteilung, Punkteverlauf, Kennzahlen je Spieler.
import type { JSX } from 'preact';
import type { Sicht, Statistik } from '../engine';
import { farbHex } from '../netz/sitzung';

/** Möglichkeiten je Augensumme mit zwei Würfeln (von 36). */
const WEGE = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];

export function WuerfelVerteilung({ st }: { st: Statistik }): JSX.Element {
  const gesamt = st.wuerfe.reduce((a, b) => a + b, 0);
  const summen = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const max = Math.max(1, ...summen.map((z) => Math.max(st.wuerfe[z], (gesamt * WEGE[z]) / 36)));
  const [B, H, unten] = [330, 120, 18];
  const breite = B / summen.length;
  const y = (n: number): number => H - unten - (n / max) * (H - unten - 6);
  return (
    <figure class="diagramm">
      <figcaption>
        Würfelverteilung <small>({gesamt} Würfe · Balken: gewürfelt, Strich: erwartet)</small>
      </figcaption>
      <svg viewBox={`0 0 ${B} ${H}`} role="img" aria-label="Würfelverteilung">
        <line x1="0" x2={B} y1={H - unten} y2={H - unten} class="achse" />
        {summen.map((z, i) => {
          const x = i * breite;
          const erwartet = (gesamt * WEGE[z]) / 36;
          return (
            <g class="balken-gruppe">
              <title>{`${z}: ${st.wuerfe[z]}× gewürfelt, erwartet ${erwartet.toFixed(1)}×`}</title>
              <rect x={x} y="0" width={breite} height={H} fill="transparent" />
              {st.wuerfe[z] > 0 && (
                <rect class={`balken ${z === 7 ? 'sieben' : ''}`} x={x + 3} y={y(st.wuerfe[z])} width={breite - 6} height={H - unten - y(st.wuerfe[z])} rx="3" />
              )}
              <line class="erwartet" x1={x + 2} x2={x + breite - 2} y1={y(erwartet)} y2={y(erwartet)} />
              <text x={x + breite / 2} y={H - 4} text-anchor="middle" class="achsentext">
                {z}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function PunkteVerlauf({ sicht, st }: { sicht: Sicht; st: Statistik }): JSX.Element | null {
  const reihen = st.punkte;
  if (reihen.length < 2) return null;
  const [B, H, links, rechts, oben, unten] = [330, 150, 22, 70, 8, 16];
  const maxP = Math.max(sicht.config.siegpunkte, ...reihen.flat());
  const x = (i: number): number => links + (i / (reihen.length - 1)) * (B - links - rechts);
  const y = (p: number): number => oben + (1 - p / maxP) * (H - oben - unten);
  // Namen am Linienende, ohne sich zu überlappen
  const ende = sicht.spieler.map((p) => ({ id: p.id, y: y(reihen.at(-1)![p.id]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ende.length; i++) ende[i].y = Math.max(ende[i].y, ende[i - 1].y + 12);
  const schritt = (B - links - rechts) / (reihen.length - 1);
  return (
    <figure class="diagramm">
      <figcaption>
        Siegpunkte im Verlauf <small>(nach jedem Zug, inkl. verdeckter Punkte)</small>
      </figcaption>
      <svg viewBox={`0 0 ${B} ${H}`} role="img" aria-label="Siegpunkte im Verlauf">
        {[0, Math.round(maxP / 2), maxP].map((p) => (
          <g>
            <line x1={links} x2={B - rechts} y1={y(p)} y2={y(p)} class="raster" />
            <text x={links - 5} y={y(p) + 4} text-anchor="end" class="achsentext">
              {p}
            </text>
          </g>
        ))}
        {sicht.spieler.map((p) => {
          const pkt = reihen.map((r, i) => `${x(i)},${y(r[p.id])}`).join(' ');
          return (
            <g>
              <polyline points={pkt} class="linie-rand" />
              <polyline points={pkt} class="linie" stroke={farbHex(p.farbe)} />
            </g>
          );
        })}
        {ende.map((e) => {
          const p = sicht.spieler[e.id];
          return (
            <g>
              <circle cx={B - rechts + 8} cy={e.y} r="4.5" fill={farbHex(p.farbe)} stroke-width="1.5" style={{ stroke: 'var(--umriss)' }} />
              <text x={B - rechts + 16} y={e.y + 4} class="linientext">
                {p.name}
              </text>
            </g>
          );
        })}
        {/* Hover: je Zug alle Punktestände */}
        {reihen.map((r, i) => (
          <rect x={x(i) - schritt / 2} y={oben} width={schritt} height={H - oben - unten} fill="transparent">
            <title>{`${i === 0 ? 'Nach der Gründung' : `Nach Zug ${i}`}\n${sicht.spieler.map((p) => `${p.name}: ${r[p.id]}`).join('\n')}`}</title>
          </rect>
        ))}
      </svg>
    </figure>
  );
}
