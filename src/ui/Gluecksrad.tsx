// Las Vegas: Glücksrad statt Abwerfen bei einer 7.
// Das Ergebnis zieht der Host. Das Rad dreht los, sobald man klickt, und bremst dann
// genau auf ein Feld, das zum Ergebnis passt.
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GluecksradDreh, Sicht } from '../engine';
import { warteBis, wenigBewegung } from './animation';
import { toast } from './hooks';
import { ton } from './ton';

const FELDER = 10;
const WINKEL = 360 / FELDER;
/** Gewinnfelder (3 von 10 = 30 %, passend zur echten Chance) */
const GEWINN = [0, 3, 7];
const V_MAX = 1250; // Grad pro Sekunde
const ANLAUF_MS = 450;
const MIN_VOLLGAS_MS = 900;
const BREMSWEG_MIN = 1700; // Grad, etwa 4,7 Umdrehungen
const AUTO_ZU_MS = 3800;

/** Deterministische „Zufallszahl“ aus der Dreh-Nummer: Spieler und Beamer sehen dasselbe Feld. */
function hash(n: number, salz: number): number {
  let x = (n * 2654435761 + salz * 40503) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0x5bd1e995) >>> 0;
  return (x ^ (x >>> 15)) >>> 0;
}

/** Ziel-Drehwinkel (mod 360) für ein Ergebnis. Verluste landen gern knapp neben einem Gewinnfeld. */
export function zielWinkel(d: GluecksradDreh): number {
  let feld: number;
  let versatz: number;
  if (d.gewonnen) {
    feld = GEWINN[hash(d.nr, 1) % GEWINN.length];
    versatz = ((hash(d.nr, 2) % 21) - 10) * 1.2; // irgendwo im Feld
  } else {
    const verlust = Array.from({ length: FELDER }, (_, i) => i).filter((i) => !GEWINN.includes(i));
    const knapp = verlust.filter((i) => GEWINN.includes((i + 1) % FELDER) || GEWINN.includes((i + FELDER - 1) % FELDER));
    const liste = hash(d.nr, 3) % 10 < 6 ? knapp : verlust;
    feld = liste[hash(d.nr, 4) % liste.length];
    // Knapp daneben: Richtung Gewinnfeld an den Rand schieben
    if (GEWINN.includes((feld + 1) % FELDER)) versatz = 14 + (hash(d.nr, 5) % 3);
    else if (GEWINN.includes((feld + FELDER - 1) % FELDER)) versatz = -14 - (hash(d.nr, 5) % 3);
    else versatz = ((hash(d.nr, 2) % 21) - 10) * 1.2;
  }
  const mitte = feld * WINKEL + WINKEL / 2 + versatz;
  return (((360 - mitte) % 360) + 360) % 360;
}

// ---------- Steuerung ----------

let anzeigeNr = 0;

export interface RadAnzeige {
  /** Feste ID für die ganze Show (bleibt gleich, wenn das Ergebnis nachträglich ankommt) */
  id: number;
  /** Ergebnis vom Host; null, solange noch gewartet wird */
  dreh: GluecksradDreh | null;
  name: string;
  ich: boolean;
}

/**
 * Verwaltet, welcher Dreh gerade gezeigt wird.
 * alle = true (Beamer): jeden Dreh zeigen. Sonst nur eigene; fremde gibt es als kurze Einblendung.
 */
export function useGluecksrad(
  sicht: Sicht,
  alle: boolean,
  hinweisNr: number | undefined,
): { anzeige: RadAnzeige | null; starte: () => void; fertig: () => void; wartend: number } {
  const [anzeige, setAnzeigeRoh] = useState<RadAnzeige | null>(null);
  const aktuell = useRef<RadAnzeige | null>(null);
  const warteschlange = useRef<GluecksradDreh[]>([]);
  const letzte = sicht.gluecksrad.at(-1)?.nr ?? 0;
  const gesehen = useRef(letzte);
  const zeitlimit = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setAnzeige = (a: RadAnzeige | null): void => {
    aktuell.current = a;
    setAnzeigeRoh(a);
  };
  const ausDreh = (d: GluecksradDreh): RadAnzeige => ({ id: ++anzeigeNr, dreh: d, name: sicht.spieler[d.spieler]?.name ?? '?', ich: d.spieler === sicht.ich });
  const naechster = (): void => {
    const d = warteschlange.current.shift();
    setAnzeige(d ? ausDreh(d) : null);
  };

  useEffect(() => {
    if (letzte < gesehen.current) gesehen.current = letzte; // neue Partie
    const neu = sicht.gluecksrad.filter((d) => d.nr > gesehen.current);
    gesehen.current = letzte;
    for (const d of neu) {
      const meins = d.spieler === sicht.ich;
      if (!alle && !meins) {
        // Mitspieler: nur Einblendung, das Ergebnis erst nach der Drehzeit
        const name = sicht.spieler[d.spieler].name;
        toast(`🎰 ${name} dreht am Glücksrad …`);
        setTimeout(
          () => toast(d.gewonnen ? `🎉 ${name} gewinnt am Glücksrad – kein Abwurf!` : `💥 ${name} verliert am Glücksrad – ${d.nachher} statt ${d.vorher} Karten!`),
          4200,
        );
        continue;
      }
      // Kartenflüge erst nach der Show
      warteBis(5000);
      const a = aktuell.current;
      if (a && a.dreh === null && meins) {
        if (zeitlimit.current) clearTimeout(zeitlimit.current);
        setAnzeige({ ...a, dreh: d });
      } else warteschlange.current.push(d);
    }
    if (!aktuell.current && warteschlange.current.length) naechster();
  }, [letzte]);

  // Host lehnt ab: Warten abbrechen
  useEffect(() => {
    if (aktuell.current && aktuell.current.dreh === null) setAnzeige(null);
  }, [hinweisNr]);

  return {
    anzeige,
    starte: () => {
      if (sicht.ich === null) return;
      setAnzeige({ id: ++anzeigeNr, dreh: null, name: sicht.spieler[sicht.ich].name, ich: true });
      if (zeitlimit.current) clearTimeout(zeitlimit.current);
      zeitlimit.current = setTimeout(() => {
        if (aktuell.current && aktuell.current.dreh === null) naechster();
      }, 6000);
    },
    fertig: naechster,
    wartend: warteschlange.current.length,
  };
}

// ---------- Darstellung ----------

function segmentPfad(i: number, r: number): string {
  const a1 = ((i * WINKEL - 90) * Math.PI) / 180;
  const a2 = (((i + 1) * WINKEL - 90) * Math.PI) / 180;
  return `M0,0 L${r * Math.cos(a1)},${r * Math.sin(a1)} A${r},${r} 0 0 1 ${r * Math.cos(a2)},${r * Math.sin(a2)} Z`;
}

function Rad({ radRef }: { radRef: preact.Ref<SVGGElement> }): JSX.Element {
  const R = 200;
  return (
    <svg class="gr-rad" viewBox="-250 -250 500 500" aria-hidden="true">
      <defs>
        <radialGradient id="gr-gold" cx="50%" cy="30%" r="80%">
          <stop offset="0%" stop-color="#fff6c2" />
          <stop offset="45%" stop-color="#ffd23f" />
          <stop offset="100%" stop-color="#d98f00" />
        </radialGradient>
        <radialGradient id="gr-rot" cx="50%" cy="40%" r="80%">
          <stop offset="0%" stop-color="#ff4d6d" />
          <stop offset="100%" stop-color="#8c0f26" />
        </radialGradient>
        <radialGradient id="gr-schwarz" cx="50%" cy="40%" r="80%">
          <stop offset="0%" stop-color="#3b3355" />
          <stop offset="100%" stop-color="#120c22" />
        </radialGradient>
        <radialGradient id="gr-nabe" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stop-color="#fff" />
          <stop offset="40%" stop-color="#ffd23f" />
          <stop offset="100%" stop-color="#9c6500" />
        </radialGradient>
      </defs>
      {/* Außenring mit Glühbirnen */}
      <circle r={R + 34} fill="#2b0a3d" stroke="#ffd23f" stroke-width="6" />
      {Array.from({ length: 24 }, (_, i) => {
        const w = (i * 15 * Math.PI) / 180;
        return <circle class={`gr-birne ${i % 2 ? 'b' : 'a'}`} cx={(R + 18) * Math.cos(w)} cy={(R + 18) * Math.sin(w)} r="7" />;
      })}
      <g ref={radRef}>
        {Array.from({ length: FELDER }, (_, i) => {
          const gewinn = GEWINN.includes(i);
          const fill = gewinn ? 'url(#gr-gold)' : i % 2 ? 'url(#gr-rot)' : 'url(#gr-schwarz)';
          const mitte = i * WINKEL + WINKEL / 2;
          return (
            <g>
              <path d={segmentPfad(i, R)} fill={fill} stroke="#ffd23f" stroke-width="3" />
              <g transform={`rotate(${mitte}) translate(0 ${-R * 0.66})`}>
                {gewinn ? (
                  <>
                    <text class="gr-text gewinn" y="-6">FREI!</text>
                    <text class="gr-text stern" y="26">★</text>
                  </>
                ) : (
                  <>
                    <text class="gr-text verlust" y="4">×2</text>
                    <text class="gr-text klein" y="30">PECH</text>
                  </>
                )}
              </g>
            </g>
          );
        })}
      </g>
      <circle r="44" fill="url(#gr-nabe)" stroke="#7a4b00" stroke-width="4" />
      <text class="gr-nabe-text" y="9">
        VEGAS
      </text>
    </svg>
  );
}

const KONFETTI_FARBEN = ['#ffd23f', '#ff4d6d', '#4dd0e1', '#7cff6b', '#c77dff', '#fff'];

function Konfetti(): JSX.Element {
  const teile = useRef(
    Array.from({ length: 140 }, (_, i) => ({
      x: Math.random() * 100,
      dx: (Math.random() - 0.5) * 50,
      verz: Math.random() * 0.6,
      dauer: 1.8 + Math.random() * 1.6,
      dreh: (Math.random() - 0.5) * 1440,
      farbe: KONFETTI_FARBEN[i % KONFETTI_FARBEN.length],
      form: i % 3,
    })),
  );
  return (
    <div class="gr-konfetti" aria-hidden="true">
      {teile.current.map((t) => (
        <i
          class={`f${t.form}`}
          style={{
            left: `${t.x}%`,
            background: t.farbe,
            '--dx': `${t.dx}vw`,
            '--dreh': `${t.dreh}deg`,
            animationDelay: `${t.verz}s`,
            animationDuration: `${t.dauer}s`,
          }}
        />
      ))}
    </div>
  );
}

export function GluecksradBuehne({
  anzeige,
  onFertig,
  eilig = false,
}: {
  anzeige: RadAnzeige;
  onFertig: () => void;
  /** Weitere Drehs warten (Beamer): Ergebnis kürzer zeigen */
  eilig?: boolean;
}): JSX.Element {
  const radRef = useRef<SVGGElement>(null);
  const zeigerRef = useRef<SVGSVGElement>(null);
  const [stufe, setStufe] = useState<'dreht' | 'ergebnis'>(wenigBewegung() && anzeige.dreh ? 'ergebnis' : 'dreht');
  const dreh = anzeige.dreh;
  const drehRef = useRef(dreh);
  drehRef.current = dreh;

  // Drehphysik: Anlauf, Vollgas bis das Ergebnis da ist, dann gleichmäßig bremsen bis genau aufs Zielfeld.
  useEffect(() => {
    if (stufe !== 'dreht') return;
    let winkel = 0;
    let letzteZeit = performance.now();
    const start = letzteZeit;
    let bremse: { a0: number; v0: number; t0: number; weg: number; verz: number; dauer: number } | null = null;
    let letztesFeld = 0;
    let letzterTick = 0;
    let frame = 0;
    const schritt = (jetzt: number): void => {
      const dt = (jetzt - letzteZeit) / 1000;
      letzteZeit = jetzt;
      if (!bremse) {
        const v = V_MAX * Math.min(1, (jetzt - start) / ANLAUF_MS);
        winkel += v * dt;
        const d = drehRef.current;
        if (d && jetzt - start > MIN_VOLLGAS_MS) {
          const ziel = zielWinkel(d);
          const rest = (((ziel - (winkel % 360)) % 360) + 360) % 360;
          const weg = rest + 360 * Math.ceil(Math.max(0, BREMSWEG_MIN - rest) / 360);
          bremse = { a0: winkel, v0: V_MAX, t0: jetzt, weg, verz: (V_MAX * V_MAX) / (2 * weg), dauer: (2 * weg) / V_MAX };
        }
      } else {
        const t = (jetzt - bremse.t0) / 1000;
        if (t >= bremse.dauer) {
          winkel = bremse.a0 + bremse.weg;
          if (radRef.current) radRef.current.setAttribute('transform', `rotate(${winkel})`);
          setStufe('ergebnis');
          return;
        }
        winkel = bremse.a0 + bremse.v0 * t - 0.5 * bremse.verz * t * t;
      }
      if (radRef.current) radRef.current.setAttribute('transform', `rotate(${winkel})`);
      // Tick bei jedem Feldwechsel: Zeiger schnippt, Ton klickt
      const feld = Math.floor(winkel / WINKEL);
      if (feld !== letztesFeld) {
        letztesFeld = feld;
        if (jetzt - letzterTick > 45) {
          letzterTick = jetzt;
          ton('tick');
          zeigerRef.current?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-22deg)' }, { transform: 'rotate(0)' }], { duration: 110 });
        }
      }
      frame = requestAnimationFrame(schritt);
    };
    frame = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(frame);
  }, [stufe]);

  // Bei reduzierter Bewegung direkt aufs Ziel stellen
  useEffect(() => {
    if (stufe === 'ergebnis' && dreh && radRef.current && wenigBewegung()) radRef.current.setAttribute('transform', `rotate(${zielWinkel(dreh)})`);
  }, [stufe, dreh?.nr]);

  useEffect(() => {
    if (stufe !== 'ergebnis' || !dreh) return;
    ton(dreh.gewonnen ? 'jackpot' : 'verloren');
    const zu = setTimeout(onFertig, eilig ? 1600 : AUTO_ZU_MS);
    return () => clearTimeout(zu);
  }, [stufe]);

  const ergebnis = stufe === 'ergebnis' && dreh;
  const klasse = ergebnis ? (dreh.gewonnen ? 'gewonnen' : 'verloren') : 'laeuft';

  return (
    <div class={`gr-buehne ${klasse}`} role="dialog" aria-label="Glücksrad">
      <div class="gr-blitz" />
      <h2 class="gr-titel">
        <span>GLÜCKS</span>
        <span>RAD</span>
      </h2>
      <p class="gr-unter">
        {anzeige.ich ? 'Du drehst!' : `${anzeige.name} dreht!`} · 30 % frei · 70 % doppelt abwerfen
      </p>
      <div class="gr-rad-rahmen">
        <svg class="gr-zeiger" ref={zeigerRef} viewBox="-30 -10 60 70" aria-hidden="true">
          <path d="M-22,0 L22,0 L0,52 Z" fill="#fff" stroke="#ffd23f" stroke-width="5" stroke-linejoin="round" />
          <circle cy="10" r="7" fill="#ff4d6d" />
        </svg>
        <Rad radRef={radRef} />
      </div>
      <div class="gr-ergebnis" aria-live="assertive">
        {ergebnis &&
          (dreh.gewonnen ? (
            <>
              <div class="gr-gross gewinn">JACKPOT!</div>
              <div class="gr-text-zeile">{anzeige.ich ? 'Du musst nichts abwerfen!' : `${anzeige.name} muss nichts abwerfen!`}</div>
            </>
          ) : (
            <>
              <div class="gr-gross verlust">×2</div>
              <div class="gr-text-zeile">
                {dreh.alle
                  ? `Pech gehabt! ${anzeige.ich ? 'Deine' : `${anzeige.name}s`} ${dreh.nachher} Karten sind alle weg.`
                  : `Pech gehabt! ${anzeige.ich ? 'Wirf' : `${anzeige.name} wirft`} ${dreh.nachher} statt ${dreh.vorher} Karten ab.`}
              </div>
            </>
          ))}
        {!ergebnis && <div class="gr-text-zeile spannung">Rien ne va plus …</div>}
      </div>
      {ergebnis && (
        <button class="knopf gr-weiter" onClick={onFertig}>
          {dreh.gewonnen ? 'Weiter 🎉' : 'Weiter'}
        </button>
      )}
      {ergebnis && dreh.gewonnen && <Konfetti />}
    </div>
  );
}
