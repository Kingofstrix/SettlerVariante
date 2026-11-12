// Das Spielbrett: zwei deckungsgleich gestapelte SVGs.
//  - Grundebene: Meeressaum, Insel, Felder, Zahlenchips, Häfen. Hängt nur vom Brett ab, wird
//    einmal gezeichnet und liegt als eigener Layer unter dem Rest.
//  - Spielebene: Ertrag, Straßen, Gebäude, Räuber und die klickbaren Bauplätze.
// Wiederkehrende Formen stehen einmal in <defs> und werden per <use> eingesetzt. Keine SVG-Filter.
import type { JSX } from 'preact';
import { useMemo, useRef } from 'preact/hooks';
import { punkte, type Brett as BrettDaten, type Ort, type Sicht } from '../engine';
import { farbHex } from '../netz/sitzung';
import { GelaendeDefs } from './Gelaende';
import { rohstoffForm } from './Icons';

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
  /** Neue Bauten anderer (seit meinem letzten Zug): markiert. */
  markiert?: { ecken: Set<number>; kanten: Set<number> };
  /** Kurz hervorgehobene Stelle (Klick im Verlauf). */
  fokus?: Ort | null;
}

const S = 100; // Pixel je Brett-Einheit
const FELD = 0.915; // Oberseite eines Felds, etwas kleiner als das Raster: dazwischen bleibt Sand
const LIPPE = 7; // sichtbare Unterkante eines Felds
const CHIP_Y = 26; // Zahlenchip unterhalb der Feldmitte
const STRASSE = 33; // halbe Länge einer Straße

/** Regelmäßiges Sechseck (Spitze oben) um den Ursprung. */
const HEX_PUNKTE = Array.from({ length: 6 }, (_, i) => {
  const w = (Math.PI / 180) * (60 * i - 30);
  return `${(Math.cos(w) * S * FELD).toFixed(1)},${(Math.sin(w) * S * FELD).toFixed(1)}`;
}).join(' ');

/** Die drei Kantenrichtungen des Rasters: 30°, 90°, 150°. */
const RICHTUNGEN = [30, 90, 150].map((grad) => {
  const w = (Math.PI / 180) * grad;
  return [Math.cos(w) * STRASSE, Math.sin(w) * STRASSE] as const;
});

function richtung(ax: number, ay: number, bx: number, by: number): number {
  const grad = ((Math.atan2(by - ay, bx - ax) * 180) / Math.PI + 360) % 180;
  return ((Math.round((grad - 30) / 60) % 3) + 3) % 3;
}

const HAUS: Record<'siedlung' | 'stadt', [number, number][]> = {
  siedlung: [[-17, 16], [-17, -4], [0, -21], [17, -4], [17, 16]],
  stadt: [[-26, 18], [-26, -8], [-13, -24], [0, -8], [0, -2], [26, -2], [26, 18]],
};

const FIGUR = 1.18; // Gebäude etwas größer als ihr Grundmaß, damit man sie vom Beamer aus erkennt

function hausPfad(x: number, y: number, stadt: boolean, k = FIGUR): string {
  return 'M' + HAUS[stadt ? 'stadt' : 'siedlung'].map(([dx, dy]) => `${x + dx * k},${y + dy * k}`).join('L') + 'Z';
}

function viewBox(b: BrettDaten): string {
  const xs = b.ecken.map((e) => e.x);
  const ys = b.ecken.map((e) => e.y);
  const rand = 1.15;
  const x0 = (Math.min(...xs) - rand) * S;
  const y0 = (Math.min(...ys) - rand) * S;
  return `${x0} ${y0} ${(Math.max(...xs) + rand) * S - x0} ${(Math.max(...ys) + rand) * S - y0}`;
}

/** Alles, was sich während einer Partie nicht ändert. */
function Grundebene({ b, box }: { b: BrettDaten; box: string }): JSX.Element {
  const ecke = (id: number): string => `${b.ecken[id].x * S},${b.ecken[id].y * S}`;
  return (
    <svg class="brett brett-grund" viewBox={box} aria-hidden="true">
      <defs>
        <polygon id="b-hex" points={HEX_PUNKTE} />
        <g id="b-insel">
          {b.hexes.map((h) => (
            <polygon points={h.ecken.map(ecke).join(' ')} />
          ))}
        </g>
        <linearGradient id="v-chip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style="stop-color:var(--chip-1)" />
          <stop offset="1" style="stop-color:var(--chip-2)" />
        </linearGradient>
        <GelaendeDefs />
      </defs>

      {/* Flachwasser, Schatten, Sockel, Strand: fünfmal dieselbe Inselform */}
      <use href="#b-insel" class="insel saum weit" />
      <use href="#b-insel" class="insel saum nah" />
      <use href="#b-insel" class="insel schlag" y="30" />
      <use href="#b-insel" class="insel sockel-tief" y="21" />
      <use href="#b-insel" class="insel sockel" y="11" />
      <use href="#b-insel" class="insel strand" />

      {/* Häfen: Steg von beiden Ecken zur Plakette */}
      {b.haefen.map((h) => {
        const k = b.kanten[h.kante];
        const [x, y] = [h.x * S, h.y * S];
        const steg = `M${ecke(k.a)}L${x},${y}L${ecke(k.b)}`;
        return (
          <g class="hafen">
            <path d={steg} class="steg" />
            <path d={steg} class="steg-planken" />
            <circle cx={x} cy={y + 5} r="31" class="plakette-kante" />
            <circle cx={x} cy={y} r="31" class="plakette" />
            {h.typ === 'alle' ? (
              <text x={x} y={y + 9} text-anchor="middle" class="hafen-text">
                3:1
              </text>
            ) : (
              <>
                <g transform={`translate(${x - 15},${y - 27}) scale(1.25)`}>{rohstoffForm(h.typ)}</g>
                <text x={x} y={y + 24} text-anchor="middle" class="hafen-text klein">
                  2:1
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* Felder: Unterkante, Oberseite mit Verlauf, Geländebild, Zahlenchip */}
      {b.hexes.map((h) => {
        const rot = h.zahl === 6 || h.zahl === 8;
        const p = punkte(h.zahl);
        return (
          <g class={`feld g-${h.gelaende}`} transform={`translate(${h.x * S},${h.y * S})`}>
            <use href="#b-hex" class="feld-kante" y={LIPPE} />
            <use href="#b-hex" class="feld-oben" fill={`url(#v-${h.gelaende})`} stroke={`url(#v-${h.gelaende})`} />
            <use href="#b-hex" class="feld-licht" />
            <use href={`#a-${h.gelaende}`} />
            {h.zahl !== null && (
              <g class={rot ? 'chip rot' : 'chip'}>
                <circle cy={CHIP_Y + 4} r="31" class="chip-kante" />
                <circle cy={CHIP_Y} r="31" class="chip-flaeche" fill="url(#v-chip)" />
                <text y={CHIP_Y + 8} text-anchor="middle" class="zahl" font-size={31 + p * 2}>
                  {h.zahl}
                </text>
                {Array.from({ length: p }, (_, i) => (
                  <circle cx={(i - (p - 1) / 2) * 7.6} cy={CHIP_Y + 20} r="2.7" class="chip-punkt" />
                ))}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Brett({ sicht, ziele = KEINE_ZIELE, meineFarbe, onEcke, onKante, onHex, markiert, fokus }: Props): JSX.Element {
  const b = sicht.brett;
  const box = useMemo(() => viewBox(b), [b]);
  // Gleicher VNode bei gleichem Brett: Preact überspringt die Grundebene dann komplett.
  const grund = useMemo(() => <Grundebene b={b} box={box} />, [b, box]);

  // Die Klick-Handler laufen über eine Ref, damit die Spielebene nicht bei jedem Render der
  // Eltern (Timer, Würfelanimation, Chat) neu aufgebaut wird.
  const klick = useRef({ onEcke, onKante, onHex });
  klick.current = { onEcke, onKante, onHex };

  const spiel = useMemo(() => {
    const wurf = sicht.wurf ? sicht.wurf[0] + sicht.wurf[1] : null;
    const ecke = (id: number): [number, number] => [b.ecken[id].x * S, b.ecken[id].y * S];
    const farbe = (sp: number): string => farbHex(sicht.spieler[sp].farbe);
    const raeuber = b.hexes[sicht.raeuber];
    return (
      <svg class="brett brett-spiel" viewBox={box} style={{ '--ich': meineFarbe ?? '#fff' }} role="img" aria-label="Spielbrett">
        <defs>
          {RICHTUNGEN.map(([dx, dy], i) => (
            <g id={`b-str-${i}`} stroke-linecap="round">
              <line x1={-dx} y1={-dy + 4} x2={dx} y2={dy + 4} class="str-schatten" />
              <line x1={-dx} y1={-dy} x2={dx} y2={dy} class="str-rand" />
              <line x1={-dx} y1={-dy} x2={dx} y2={dy} class="str-farbe" />
              <line x1={-dx * 0.8 - 1.5} y1={-dy * 0.8 - 2} x2={dx * 0.8 - 1.5} y2={dy * 0.8 - 2} class="str-glanz" />
            </g>
          ))}
          <g id="b-siedlung" transform={`scale(${FIGUR})`}>
            <ellipse cx="3" cy="18" rx="25" ry="7" class="fig-schatten" />
            <path d={hausPfad(0, 0, false, 1)} class="fig-koerper" />
            <path d="M-17,-4 0,-21 17,-4Z" class="fig-dunkel" />
            <path d="M-14.5,-1.5h6v15h-6Z" class="fig-hell" />
            <path d="M-3.5,16v-10a3.5,3.5 0 0 1 7,0v10Z" class="fig-tuer" />
            <path d={hausPfad(0, 0, false, 1)} class="fig-umriss" />
          </g>
          <g id="b-stadt" transform={`scale(${FIGUR})`}>
            <ellipse cx="3" cy="20" rx="34" ry="8" class="fig-schatten" />
            <path d={hausPfad(0, 0, true, 1)} class="fig-koerper" />
            <path d="M-26,-8-13,-24 0,-8ZM0,-2H26V4H0Z" class="fig-dunkel" />
            <path d="M-23.5,-5.5h6v21h-6Z" class="fig-hell" />
            <path d="M-11,18v-9a3.5,3.5 0 0 1 7,0v9ZM6,8h5.5v6H6ZM15,8h5.5v6H15Z" class="fig-tuer" />
            <path d={hausPfad(0, 0, true, 1)} class="fig-umriss" />
          </g>
          <linearGradient id="v-raeuber" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#4a4556" />
            <stop offset="0.55" style="stop-color:var(--raeuber)" />
            <stop offset="1" stop-color="#17151c" />
          </linearGradient>
        </defs>

        {/* Ertrag des letzten Wurfs und das vom Räuber gesperrte Feld */}
        {wurf !== null &&
          b.hexes
            .filter((h) => h.zahl === wurf && h.id !== sicht.raeuber)
            .map((h) => (
              <g class="ertrag" data-hex={h.id} transform={`translate(${h.x * S},${h.y * S})`} key={`${sicht.zugNr}-${h.id}`}>
                <use href="#b-hex" class="ertrag-licht" />
                <circle cy={CHIP_Y} r="35" class="ertrag-ring" />
              </g>
            ))}
        <use href="#b-hex" class="gesperrt" x={raeuber.x * S} y={raeuber.y * S} />

        {/* Räuber-Ziele */}
        {ziele.hexes.map((id) => {
          const h = b.hexes[id];
          return <circle class="ziel ziel-hex" cx={h.x * S} cy={h.y * S} r="62" onClick={() => klick.current.onHex?.(id)} />;
        })}

        {/* Straßen */}
        {Object.entries(sicht.strassen).map(([kid, sp]) => {
          const k = b.kanten[Number(kid)];
          const [ax, ay] = ecke(k.a);
          const [bx, by] = ecke(k.b);
          const strasse = <use class="strasse" href={`#b-str-${richtung(ax, ay, bx, by)}`} x={(ax + bx) / 2} y={(ay + by) / 2} style={{ color: farbe(sp) }} />;
          if (!markiert?.kanten.has(Number(kid))) return strasse;
          return (
            <g class="neu-strasse" key={`k${kid}`}>
              <line x1={ax + (bx - ax) * 0.17} y1={ay + (by - ay) * 0.17} x2={bx - (bx - ax) * 0.17} y2={by - (by - ay) * 0.17} class="markierung" />
              {strasse}
            </g>
          );
        })}

        {/* Straßen-Ziele */}
        {ziele.kanten.map((kid) => {
          const k = b.kanten[kid];
          const [ax, ay] = ecke(k.a);
          const [bx, by] = ecke(k.b);
          const [x1, y1, x2, y2] = [ax + (bx - ax) * 0.2, ay + (by - ay) * 0.2, bx - (bx - ax) * 0.2, by - (by - ay) * 0.2];
          return (
            <g class="ziel ziel-kante" onClick={() => klick.current.onKante?.(kid)}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} class="kante-grund" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} class="kante-strich" />
            </g>
          );
        })}

        {/* Gebäude */}
        {Object.entries(sicht.gebaeude).map(([eid, g]) => {
          const [x, y] = ecke(Number(eid));
          const neu = markiert?.ecken.has(Number(eid));
          return (
            <g key={`e${eid}-${g.typ}`}>
              {neu && <circle class="markierung" cx={x} cy={y} r="40" style={{ stroke: farbe(g.spieler) }} />}
              <use class={`gebaeude ${neu ? 'neu' : ''}`} href={g.typ === 'stadt' ? '#b-stadt' : '#b-siedlung'} x={x} y={y} style={{ color: farbe(g.spieler) }} />
            </g>
          );
        })}

        {/* Fokus aus dem Verlauf */}
        {fokus &&
          (() => {
            let x: number, y: number;
            if (fokus.ecke !== undefined) [x, y] = ecke(fokus.ecke);
            else if (fokus.kante !== undefined) {
              const k = b.kanten[fokus.kante];
              x = (ecke(k.a)[0] + ecke(k.b)[0]) / 2;
              y = (ecke(k.a)[1] + ecke(k.b)[1]) / 2;
            } else if (fokus.hex !== undefined) [x, y] = [b.hexes[fokus.hex].x * S, b.hexes[fokus.hex].y * S];
            else return null;
            return <circle class="fokus" key={`f${x},${y}`} cx={x} cy={y} r={fokus.hex !== undefined ? 70 : 42} />;
          })()}

        {/* Ecken-Ziele (Siedlung/Stadt) mit Vorschau beim Überfahren */}
        {ziele.ecken.map((eid) => {
          const [x, y] = ecke(eid);
          return (
            <g class="ziel ziel-ecke" onClick={() => klick.current.onEcke?.(eid)}>
              <circle cx={x} cy={y} r="24" class="ring" />
              <path class="vorschau" d={hausPfad(x, y, ziele.art === 'stadt')} />
            </g>
          );
        })}

        {/* Räuber */}
        <g class="raeuber" transform={`translate(${raeuber.x * S - 47},${raeuber.y * S + 22})`}>
          <ellipse cx="3" cy="25" rx="20" ry="6.5" class="fig-schatten" />
          <path d="M-15,24c-3,-23 3,-36 15,-36s18,13 15,36Z" fill="url(#v-raeuber)" class="raeuber-form" />
          <circle cy="-18" r="11.5" fill="url(#v-raeuber)" class="raeuber-form" />
          <path d="M-5,-23a8,8 0 0 1 7,-3" class="raeuber-glanz" />
        </g>
      </svg>
    );
  }, [sicht, ziele, meineFarbe, b, box, markiert, fokus]);

  return (
    <div class="brett-stapel">
      {grund}
      {spiel}
    </div>
  );
}
