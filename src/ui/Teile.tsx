// Bausteine, die Spieler- und Beameransicht gemeinsam nutzen.
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { ROHSTOFFE, ROHSTOFF_NAME, kartenProRohstoff, type Handelsangebot, type Rohstoffe, type Sicht } from '../engine';
import { farbHex, type Absicht, type TimerAnzeige } from '../netz/sitzung';
import { RohstoffListe } from './Dialoge';
import { useRestzeit } from './hooks';
import { EntwIcon, KartenIcon, RohstoffIcon, Wuerfel } from './Icons';

/** Kurzer Text, was gerade passiert. */
export function statusText(sicht: Sicht): { text: string; ich: boolean } {
  const name = (i: number): string => sicht.spieler[i].name;
  const ich = sicht.ich !== null && sicht.amZug.includes(sicht.ich);
  const wer = (i: number, verb: string, verbDu: string): string => (i === sicht.ich ? `Du bist dran: ${verbDu}` : `${name(i)} ${verb}`);
  switch (sicht.phase) {
    case 'ende':
      return { text: `${name(sicht.gewinner!)} hat gewonnen!`, ich: false };
    case 'setup': {
      const sp = sicht.amZug[0];
      const was = sicht.setup.erwartet === 'siedlung' ? 'Siedlung' : 'Straße';
      return { text: `Gründung – ${wer(sp, `setzt eine ${was}`, `${was} setzen`)}`, ich };
    }
    case 'wuerfeln':
      return { text: wer(sicht.aktiv, 'würfelt', 'würfeln'), ich };
    case 'abwerfen':
      return {
        text: ich ? 'Eine 7: Du musst Karten abwerfen' : `Eine 7 – es werfen ab: ${sicht.amZug.map(name).join(', ')}`,
        ich,
      };
    case 'raeuber':
      return { text: wer(sicht.aktiv, 'versetzt den Räuber', 'Räuber versetzen'), ich };
    case 'stehlen':
      return { text: wer(sicht.aktiv, 'wählt, wen er bestiehlt', 'jemanden bestehlen'), ich };
    case 'aktion':
      return sicht.freieStrassen > 0
        ? { text: wer(sicht.aktiv, 'baut kostenlose Straßen', `${sicht.freieStrassen} kostenlose Straße(n) bauen`), ich }
        : { text: wer(sicht.aktiv, 'handelt und baut', 'handeln und bauen'), ich };
    case 'sonderbau': {
      const sp = sicht.amZug[0];
      return { text: `Sonderbauphase – ${sp === sicht.ich ? 'du darfst bauen' : name(sp)}`, ich };
    }
  }
}

export function TimerBalken({ timer, pausiert }: { timer: TimerAnzeige | null; pausiert: boolean }): JSX.Element | null {
  const rest = useRestzeit(timer);
  if (pausiert) return <div class="timer pause">⏸ Pause</div>;
  if (!timer || rest === null) return null;
  const anteil = Math.max(0, Math.min(1, (rest * 1000) / timer.gesamtMs));
  const titel = timer.art === 'zug' ? 'Zugzeit' : timer.art === 'sonderbau' ? 'Sonderbau' : 'Abwerfen';
  return (
    <div class={`timer ${rest <= 10 ? 'knapp' : ''}`} role="timer" aria-label={`${titel}: ${rest} Sekunden`}>
      <div class="timer-fuellung" style={{ width: `${anteil * 100}%` }} />
      <span>
        {titel} · {Math.floor(rest / 60)}:{String(rest % 60).padStart(2, '0')}
      </span>
    </div>
  );
}

export function SpielerTafel({ sicht, verbunden }: { sicht: Sicht; verbunden: boolean[] }): JSX.Element {
  return (
    <div class="spielerliste">
      {sicht.spieler.map((p) => {
        const dran = sicht.amZug.includes(p.id);
        const punkte = sicht.endstand ? sicht.endstand[p.id] : p.id === sicht.ich ? sicht.eigenePunkte! : p.punkte;
        return (
          <div class={`spielerzeile ${dran ? 'dran' : ''} ${p.id === sicht.ich ? 'ich' : ''}`} data-sp={p.id}>
            <i class="punkt gross" style={{ background: farbHex(p.farbe) }} />
            <div class="sname">
              <b>{p.name}</b>
              {p.id === sicht.ich && <em> (du)</em>}
              {!verbunden[p.id] && <span class="marke warn">getrennt</span>}
              {sicht.laengsteStrasse === p.id && (
                <span class="marke" data-tip="Längste Handelsstraße (+2)">
                  <EntwIcon typ="strassenbau" groesse={13} /> +2
                </span>
              )}
              {sicht.groessteMacht === p.id && (
                <span class="marke" data-tip="Größte Rittermacht (+2)">
                  <EntwIcon typ="ritter" groesse={13} /> +2
                </span>
              )}
            </div>
            <div class="swerte">
              <span data-tip="Rohstoffkarten">
                <KartenIcon /> {p.handAnzahl}
              </span>
              <span data-tip="Entwicklungskarten">
                <KartenIcon entw /> {p.entwAnzahl}
              </span>
              <span data-tip="Gespielte Ritter">
                <EntwIcon typ="ritter" groesse={14} /> {p.gespielteRitter}
              </span>
              <span data-tip="Längste eigene Straße">
                <EntwIcon typ="strassenbau" groesse={14} /> {p.strassenLaenge}
              </span>
            </div>
            <div class="spunkte" data-tip={p.id === sicht.ich ? 'Deine Siegpunkte (inkl. verdeckter Karten)' : 'Sichtbare Siegpunkte'}>
              {punkte}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LogListe({ sicht, max }: { sicht: Sicht; max?: number }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const letzte = sicht.log.at(-1)?.nr;
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [letzte]);
  const zeilen = max ? sicht.log.slice(-max) : sicht.log;
  return (
    <div class="log" ref={ref} aria-live="polite">
      {zeilen.map((l) => (
        <p key={l.nr}>{l.text}</p>
      ))}
    </div>
  );
}

export function WurfAnzeige({
  sicht,
  groesse = 44,
  versteckt = false,
  still = false,
}: {
  sicht: Sicht;
  groesse?: number;
  versteckt?: boolean;
  /** ohne eigene Wurf-Animation (die Würfel sind gerade aus der Mitte hierher geflogen) */
  still?: boolean;
}): JSX.Element | null {
  if (!sicht.wurf) return null;
  if (versteckt) return <div class="wurf" style={{ visibility: 'hidden' }}><Wuerfel wert={1} groesse={groesse} /></div>;
  const summe = sicht.wurf[0] + sicht.wurf[1];
  // key: neue Animation bei jedem Wurf
  return (
    <div class={`wurf ${still ? 'still' : ''}`} key={`${sicht.zugNr}`}>
      <Wuerfel wert={sicht.wurf[0]} groesse={groesse} />
      <Wuerfel wert={sicht.wurf[1]} groesse={groesse} rot />
      <span class={`wurfsumme ${summe === 7 ? 'sieben' : ''}`}>= {summe}</span>
    </div>
  );
}

/** Bankübersicht: Karten je Rohstoff in der Bank und bei den Spielern (Rest bis zur Gesamtzahl). */
export function BankAnzeige({ sicht }: { sicht: Sicht }): JSX.Element {
  const gesamt = kartenProRohstoff(sicht.spieler.length);
  return (
    <div class="bank" aria-label="Bank">
      <div class="bank-kopf">
        <b>Bank</b>
        <small>
          oben: in der Bank · unten: bei Spielern (von je {gesamt})
        </small>
      </div>
      <div class="bank-stapel-reihe">
        {ROHSTOFFE.map((r) => {
          const n = sicht.bank[r];
          return (
            <div
              class={`bank-stapel ${n === 0 ? 'leer' : n <= 3 ? 'knapp' : ''}`}
              data-bank={r}
              data-tip={`${ROHSTOFF_NAME[r]}: ${n} in der Bank, ${gesamt - n} bei Spielern`}
            >
              <RohstoffIcon typ={r} groesse={20} />
              <b>{n}</b>
              <small>{gesamt - n}</small>
            </div>
          );
        })}
        <div class="bank-stapel entwstapel" data-bank="entw" data-tip={`${sicht.stapelAnzahl} Entwicklungskarten im Stapel`}>
          <KartenIcon entw groesse={20} />
          <b>{sicht.stapelAnzahl}</b>
          <small>Entw.</small>
        </div>
      </div>
    </div>
  );
}

function fehltFuer(hand: Rohstoffe, bedarf: Rohstoffe): Partial<Rohstoffe> | null {
  const f: Partial<Rohstoffe> = {};
  let fehlt = false;
  for (const r of ROHSTOFFE) {
    if (hand[r] < bedarf[r]) {
      f[r] = bedarf[r] - hand[r];
      fehlt = true;
    }
  }
  return fehlt ? f : null;
}

/** Offene Handelsangebote. Angebote an mich stehen groß oben, aus meiner Sicht formuliert. */
export function AngebotsListe({
  sicht,
  aktion,
  onGegen,
}: {
  sicht: Sicht;
  aktion?: (a: Absicht) => void;
  onGegen?: (o: Handelsangebot) => void;
}): JSX.Element | null {
  if (sicht.phase !== 'aktion' || sicht.angebote.length === 0) return null;
  const ich = sicht.ich;
  const hand = ich !== null ? sicht.spieler[ich].hand : null;
  const name = (i: number): string => sicht.spieler[i].name;
  const fuerMich = sicht.angebote.filter((o) => ich !== null && o.an.includes(ich));
  const meine = sicht.angebote.filter((o) => o.von === ich);
  const andere = sicht.angebote.filter((o) => !fuerMich.includes(o) && !meine.includes(o));
  return (
    <div class="angebote" aria-live="polite">
      {fuerMich.map((o) => {
        const von = sicht.spieler[o.von];
        const fehlt = hand ? fehltFuer(hand, o.nimm) : null;
        return (
          <div class="angebot fuer-mich" key={o.id} style={{ '--sf': farbHex(von.farbe) }}>
            <div class="angebot-kopf">
              <i class="punkt gross" style={{ background: farbHex(von.farbe) }} />
              <b>{von.name}</b> {o.von === sicht.aktiv ? 'bietet dir einen Handel an' : 'macht dir ein Gegenangebot'}
            </div>
            <div class="angebot-tausch">
              <div class="tauschseite bekommst">
                <small>Du bekommst</small>
                <RohstoffListe r={o.gib} groesse={30} namen />
              </div>
              <div class="tauschpfeil" aria-hidden="true">
                ⇄
              </div>
              <div class="tauschseite gibst">
                <small>Du gibst</small>
                <RohstoffListe r={o.nimm} groesse={30} namen />
              </div>
            </div>
            {fehlt && (
              <p class="fehlt">
                Dir fehlt: <RohstoffListe r={fehlt} />
              </p>
            )}
            {aktion && (
              <div class="angebot-knoepfe">
                <button class="knopf haupt" disabled={!!fehlt} onClick={() => aktion({ typ: 'HANDEL_ANNEHMEN', angebot: o.id })}>
                  ✓ Annehmen
                </button>
                <button class="knopf" onClick={() => aktion({ typ: 'HANDEL_ABLEHNEN', angebot: o.id })}>
                  ✕ Ablehnen
                </button>
                {onGegen && o.von === sicht.aktiv && (
                  <button class="knopf" onClick={() => onGegen(o)}>
                    ⇄ Gegenangebot
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {meine.map((o) => (
        <div class="angebot eigenes" key={o.id}>
          <div>
            <b>Dein Angebot:</b> du gibst <RohstoffListe r={o.gib} groesse={22} /> und bekommst <RohstoffListe r={o.nimm} groesse={22} />
          </div>
          <div class="angebot-knoepfe">
            {o.an.map((i) => (
              <span class="status-chip wartet">
                <i class="punkt" style={{ background: farbHex(sicht.spieler[i].farbe) }} /> {name(i)}: überlegt …
              </span>
            ))}
            {o.abgelehnt.map((i) => (
              <span class="status-chip abgelehnt">
                <i class="punkt" style={{ background: farbHex(sicht.spieler[i].farbe) }} /> {name(i)}: abgelehnt
              </span>
            ))}
            {aktion && (
              <button class="knopf klein" onClick={() => aktion({ typ: 'HANDEL_ZURUECKZIEHEN', angebot: o.id })}>
                Zurückziehen
              </button>
            )}
          </div>
        </div>
      ))}
      {andere.map((o) => (
        <div class="angebot fremd" key={o.id}>
          <i class="punkt" style={{ background: farbHex(sicht.spieler[o.von].farbe) }} /> <b>{name(o.von)}</b> bietet <RohstoffListe r={o.gib} /> für{' '}
          <RohstoffListe r={o.nimm} /> <small>an {o.an.map(name).join(', ') || '–'}</small>
        </div>
      ))}
    </div>
  );
}
