// Das Spielbrett als SVG. Zeigt nur gültige Bauplätze als klickbare Ziele.
import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import { GELAENDE_ROHSTOFF, punkte, type Sicht } from '../engine';
import { farbHex } from '../netz/sitzung';
import { GELAENDE_FARBE, rohstoffForm } from './Icons';

export interface Ziele {
  art: 'strasse' | 'siedlung' | 'stadt' | 'raeuber' | null;
  ecken: number[];
  kanten: number[];
  hexes: number[];
}

export const KEINE_ZIELE: Ziele = { art: null, ecken: [], kanten: [], hexes: [] };

interface Props {
  sicht: Sicht;
  ziele?: Ziele;
  meineFarbe?: string;
  onEcke?: (id: number) => void;
  onKante?: (id: number) => void;
  onHex?: (id: number) => void;
}

const S = 100; // Pixel je Brett-Einheit

function hausPfad(x: number, y: number, stadt: boolean): string {
  const p = stadt
    ? [[-26, 18], [-26, -8], [-13, -24], [0, -8], [0, -2], [26, -2], [26, 18]]
    : [[-17, 16], [-17, -4], [0, -21], [17, -4], [17, 16]];
  return 'M' + p.map(([dx, dy]) => `${x + dx},${y + dy}`).join('L') + 'Z';
}

export function Brett({ sicht, ziele = KEINE_ZIELE, meineFarbe, onEcke, onKante, onHex }: Props): JSX.Element {
  const b = sicht.brett;
  const box = useMemo(() => {
    const xs = b.ecken.map((e) => e.x);
    const ys = b.ecken.map((e) => e.y);
    const rand = 1.15;
    const x0 = (Math.min(...xs) - rand) * S;
    const y0 = (Math.min(...ys) - rand) * S;
    return `${x0} ${y0} ${(Math.max(...xs) + rand) * S - x0} ${(Math.max(...ys) + rand) * S - y0}`;
  }, [b]);
  const wurf = sicht.wurf ? sicht.wurf[0] + sicht.wurf[1] : null;
  const ecke = (id: number): [number, number] => [b.ecken[id].x * S, b.ecken[id].y * S];
  const hexPunkte = (ecken: number[]): string => ecken.map((e) => ecke(e).join(',')).join(' ');

  return (
    <svg class="brett" viewBox={box} style={{ '--ich': meineFarbe ?? '#fff' }} role="img" aria-label="Spielbrett">
      {/* Strand */}
      <g fill="#ead9a8" stroke="#ead9a8" stroke-width="26" stroke-linejoin="round">
        {b.hexes.map((h) => (
          <polygon points={hexPunkte(h.ecken)} />
        ))}
      </g>

      {/* Häfen */}
      {b.haefen.map((h) => {
        const k = b.kanten[h.kante];
        const [ax, ay] = ecke(k.a);
        const [bx, by] = ecke(k.b);
        const [x, y] = [h.x * S, h.y * S];
        return (
          <g class="hafen">
            <path d={`M${ax},${ay}L${x},${y}L${bx},${by}`} fill="none" stroke="#7a5230" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 12" />
            <circle cx={x} cy={y} r="31" fill="#fffaf0" stroke="#7a5230" stroke-width="4" />
            {h.typ === 'alle' ? (
              <text x={x} y={y + 9} text-anchor="middle" class="hafen-text">3:1</text>
            ) : (
              <>
                <g transform={`translate(${x - 15},${y - 26}) scale(1.25)`}>{rohstoffForm(h.typ)}</g>
                <text x={x} y={y + 24} text-anchor="middle" class="hafen-text klein">2:1</text>
              </>
            )}
          </g>
        );
      })}

      {/* Felder */}
      {b.hexes.map((h) => {
        const [x, y] = [h.x * S, h.y * S];
        const r = GELAENDE_ROHSTOFF[h.gelaende];
        const aktiv = wurf !== null && wurf === h.zahl && sicht.raeuber !== h.id;
        const rot = h.zahl === 6 || h.zahl === 8;
        const p = punkte(h.zahl);
        return (
          <g class={`hex ${aktiv ? 'ertrag' : ''}`}>
            <polygon points={hexPunkte(h.ecken)} fill={GELAENDE_FARBE[h.gelaende]} stroke="#ead9a8" stroke-width="5" stroke-linejoin="round" />
            {r && <g transform={`translate(${x - 24},${y - 78}) scale(2)`} opacity="0.92">{rohstoffForm(r)}</g>}
            {h.zahl !== null && (
              <g>
                <circle cx={x} cy={y + 22} r="30" fill="#fff8e7" stroke={aktiv ? '#fff' : '#5a4630'} stroke-width={aktiv ? 6 : 2.5} />
                <text x={x} y={y + 30} text-anchor="middle" class={`zahl ${rot ? 'rot' : ''}`} font-size={30 + p * 2}>
                  {h.zahl}
                </text>
                {Array.from({ length: p }, (_, i) => (
                  <circle cx={x + (i - (p - 1) / 2) * 7.5} cy={y + 41} r="2.6" fill={rot ? '#c8372d' : '#5a4630'} />
                ))}
              </g>
            )}
            {h.gelaende === 'wueste' && (
              <path d={`M${x - 40},${y + 5}q20,-22 40,0t40,0M${x - 30},${y + 28}q15,-16 30,0t30,0`} fill="none" stroke="#c9b178" stroke-width="5" stroke-linecap="round" />
            )}
          </g>
        );
      })}

      {/* Räuber-Ziele */}
      {ziele.hexes.map((id) => {
        const h = b.hexes[id];
        return <circle class="ziel ziel-hex" cx={h.x * S} cy={h.y * S} r="62" onClick={() => onHex?.(id)} />;
      })}

      {/* Straßen */}
      {Object.entries(sicht.strassen).map(([kid, sp]) => {
        const k = b.kanten[Number(kid)];
        const [ax, ay] = ecke(k.a);
        const [bx, by] = ecke(k.b);
        const [x1, y1, x2, y2] = [ax + (bx - ax) * 0.17, ay + (by - ay) * 0.17, bx - (bx - ax) * 0.17, by - (by - ay) * 0.17];
        return (
          <g class="strasse">
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1d1a16" stroke-width="19" stroke-linecap="round" />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={farbHex(sicht.spieler[sp].farbe)} stroke-width="12" stroke-linecap="round" />
          </g>
        );
      })}

      {/* Straßen-Ziele */}
      {ziele.kanten.map((kid) => {
        const k = b.kanten[kid];
        const [ax, ay] = ecke(k.a);
        const [bx, by] = ecke(k.b);
        return (
          <line
            class="ziel ziel-kante"
            x1={ax + (bx - ax) * 0.2}
            y1={ay + (by - ay) * 0.2}
            x2={bx - (bx - ax) * 0.2}
            y2={by - (by - ay) * 0.2}
            onClick={() => onKante?.(kid)}
          />
        );
      })}

      {/* Gebäude */}
      {Object.entries(sicht.gebaeude).map(([eid, g]) => {
        const [x, y] = ecke(Number(eid));
        return (
          <path
            class="gebaeude"
            d={hausPfad(x, y, g.typ === 'stadt')}
            fill={farbHex(sicht.spieler[g.spieler].farbe)}
            stroke="#1d1a16"
            stroke-width="5"
            stroke-linejoin="round"
          />
        );
      })}

      {/* Ecken-Ziele (Siedlung/Stadt) mit Vorschau beim Überfahren */}
      {ziele.ecken.map((eid) => {
        const [x, y] = ecke(eid);
        return (
          <g class="ziel ziel-ecke" onClick={() => onEcke?.(eid)}>
            <circle cx={x} cy={y} r="24" class="ring" />
            <path class="vorschau" d={hausPfad(x, y, ziele.art === 'stadt')} />
          </g>
        );
      })}

      {/* Räuber */}
      {(() => {
        const h = b.hexes[sicht.raeuber];
        const [x, y] = [h.x * S - 46, h.y * S + 22];
        return (
          <g class="raeuber">
            <ellipse cx={x} cy={y + 24} rx="17" ry="6" fill="rgba(0,0,0,.35)" />
            <path d={`M${x - 14},${y + 24}c-3,-22 3,-34 14,-34s17,12 14,34z`} fill="#2a2731" stroke="#fff" stroke-width="3" />
            <circle cx={x} cy={y - 16} r="11" fill="#2a2731" stroke="#fff" stroke-width="3" />
          </g>
        );
      })()}
    </svg>
  );
}
