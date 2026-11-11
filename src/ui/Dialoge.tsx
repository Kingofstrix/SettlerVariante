// Dialoge: Handel, Abwerfen, Stehlen, Erfindung, Monopol, Regelhilfe.
import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
import {
  ROHSTOFFE,
  ROHSTOFF_NAME,
  leereRohstoffe,
  summe,
  tauschVerhaeltnis,
  type Handelsangebot,
  type Rohstoff,
  type Rohstoffe,
  type Sicht,
} from '../engine';
import { farbHex, type Absicht } from '../netz/sitzung';
import { RohstoffIcon } from './Icons';

export function Modal({
  titel,
  children,
  onZu,
  breit,
}: {
  titel: string;
  children: ComponentChildren;
  onZu?: () => void;
  breit?: boolean;
}): JSX.Element {
  return (
    <div class="modal-hg" onClick={(e) => e.target === e.currentTarget && onZu?.()}>
      <div class={`modal ${breit ? 'breit' : ''}`} role="dialog" aria-label={titel}>
        <header>
          <h2>{titel}</h2>
          {onZu && (
            <button class="knopf leise" onClick={onZu} aria-label="Schließen">
              ✕
            </button>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

function Zaehler({ wert, max, onChange }: { wert: number; max: number; onChange: (n: number) => void }): JSX.Element {
  return (
    <div class="zaehler">
      <button class="knopf klein" disabled={wert <= 0} onClick={() => onChange(wert - 1)} aria-label="weniger">
        −
      </button>
      <span class={wert > 0 ? 'aktiv' : ''}>{wert}</span>
      <button class="knopf klein" disabled={wert >= max} onClick={() => onChange(wert + 1)} aria-label="mehr">
        +
      </button>
    </div>
  );
}

export function RohstoffListe({ r, groesse = 18, namen = false }: { r: Partial<Rohstoffe>; groesse?: number; namen?: boolean }): JSX.Element {
  return (
    <span class="rliste">
      {ROHSTOFFE.filter((k) => (r[k] ?? 0) > 0).map((k) => (
        <span class="rchip" title={ROHSTOFF_NAME[k]}>
          {r[k]}× <RohstoffIcon typ={k} groesse={groesse} />
          {namen && <span class="rname">{ROHSTOFF_NAME[k]}</span>}
        </span>
      ))}
    </span>
  );
}

// ---------- Handel ----------

export function HandelDialog({
  sicht,
  vorlage,
  aktion,
  onZu,
}: {
  sicht: Sicht;
  vorlage?: Handelsangebot;
  aktion: (a: Absicht) => void;
  onZu: () => void;
}): JSX.Element {
  const ich = sicht.ich!;
  const hand = sicht.spieler[ich].hand!;
  const aktiv = sicht.aktiv === ich;
  // Gegenangebot: Seiten der Vorlage vertauschen
  const [gib, setGib] = useState<Rohstoffe>(vorlage ? { ...vorlage.nimm } : leereRohstoffe());
  const [nimm, setNimm] = useState<Rohstoffe>(vorlage ? { ...vorlage.gib } : leereRohstoffe());
  const andere = sicht.spieler.filter((p) => p.id !== ich);
  const [an, setAn] = useState<number[]>(andere.map((p) => p.id));

  const verh = Object.fromEntries(ROHSTOFFE.map((r) => [r, tauschVerhaeltnis(sicht, ich, r)])) as Rohstoffe;
  const ueberschneidung = ROHSTOFFE.some((r) => gib[r] > 0 && nimm[r] > 0);
  const zuViel = ROHSTOFFE.some((r) => gib[r] > hand[r]);
  let spielerGrund: string | null = null;
  if (summe(gib) === 0 || summe(nimm) === 0) spielerGrund = 'Beide Seiten müssen etwas geben (keine Geschenke).';
  else if (ueberschneidung) spielerGrund = 'Derselbe Rohstoff kann nicht auf beiden Seiten stehen.';
  else if (zuViel) spielerGrund = 'So viel hast du nicht.';
  else if (aktiv && an.length === 0) spielerGrund = 'Wähle mindestens einen Mitspieler.';

  // Bankhandel: jede Gabe muss ein Vielfaches des Verhältnisses sein
  const einheiten = ROHSTOFFE.reduce((a, r) => a + gib[r] / verh[r], 0);
  let bankGrund: string | null = null;
  if (!aktiv) bankGrund = 'Mit der Bank tauschst du nur in deinem eigenen Zug.';
  else if (summe(gib) === 0 || summe(nimm) === 0) bankGrund = 'Wähle, was du gibst und was du bekommst.';
  else if (ueberschneidung) bankGrund = 'Derselbe Rohstoff kann nicht auf beiden Seiten stehen.';
  else if (zuViel) bankGrund = 'So viel hast du nicht.';
  else if (ROHSTOFFE.some((r) => gib[r] % verh[r] !== 0)) bankGrund = 'Gib jeweils ein Vielfaches des Tauschkurses (siehe Kurs unter dem Rohstoff).';
  else if (einheiten !== summe(nimm)) bankGrund = `Dafür bekommst du genau ${einheiten} Karte(n).`;
  else if (ROHSTOFFE.some((r) => nimm[r] > sicht.bank[r])) bankGrund = 'Die Bank hat nicht genug davon.';

  const bankTausch = (): void => {
    const geben: Rohstoff[] = ROHSTOFFE.flatMap((r) => Array<Rohstoff>(gib[r] / verh[r]).fill(r));
    const nehmen: Rohstoff[] = ROHSTOFFE.flatMap((r) => Array<Rohstoff>(nimm[r]).fill(r));
    geben.forEach((g, i) => aktion({ typ: 'BANKHANDEL', gib: g, nimm: nehmen[i] }));
    onZu();
  };

  return (
    <Modal titel={vorlage ? 'Gegenangebot' : 'Handeln'} onZu={onZu} breit>
      <table class="handel-matrix">
        <thead>
          <tr>
            <th />
            {ROHSTOFFE.map((r) => (
              <th>
                <RohstoffIcon typ={r} groesse={30} />
                <div>{ROHSTOFF_NAME[r]}</div>
                <small>
                  du hast {hand[r]} · Bank {verh[r]}:1
                </small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Ich gebe</th>
            {ROHSTOFFE.map((r) => (
              <td>
                <Zaehler wert={gib[r]} max={hand[r]} onChange={(n) => setGib({ ...gib, [r]: n })} />
              </td>
            ))}
          </tr>
          <tr>
            <th>Ich bekomme</th>
            {ROHSTOFFE.map((r) => (
              <td>
                <Zaehler wert={nimm[r]} max={19} onChange={(n) => setNimm({ ...nimm, [r]: n })} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {aktiv ? (
        <div class="empfaenger">
          <span>Angebot an:</span>
          <button class={`chip ${an.length === andere.length ? 'an' : ''}`} onClick={() => setAn(an.length === andere.length ? [] : andere.map((p) => p.id))}>
            Alle
          </button>
          {andere.map((p) => (
            <button
              class={`chip ${an.includes(p.id) ? 'an' : ''}`}
              onClick={() => setAn(an.includes(p.id) ? an.filter((i) => i !== p.id) : [...an, p.id])}
            >
              <i class="punkt" style={{ background: farbHex(p.farbe) }} /> {p.name}
            </button>
          ))}
        </div>
      ) : (
        <p class="hinweis">Du bist nicht am Zug: dein Angebot geht nur an {sicht.spieler[sicht.aktiv].name}.</p>
      )}

      <footer>
        <span class="tip-halter" data-tip={bankGrund ?? undefined}>
          <button class="knopf" disabled={!!bankGrund} onClick={bankTausch}>
            Mit Bank / Hafen tauschen
          </button>
        </span>
        <span class="tip-halter" data-tip={spielerGrund ?? undefined}>
          <button
            class="knopf haupt"
            disabled={!!spielerGrund}
            onClick={() => {
              aktion({ typ: 'HANDEL_ANBIETEN', gib, nimm, an: aktiv ? (an.length === andere.length ? null : an) : null });
              onZu();
            }}
          >
            {aktiv ? 'Mitspielern anbieten' : 'Gegenangebot senden'}
          </button>
        </span>
      </footer>
    </Modal>
  );
}

// ---------- Abwerfen ----------

export function AbwerfenDialog({ sicht, aktion, rest }: { sicht: Sicht; aktion: (a: Absicht) => void; rest: number | null }): JSX.Element {
  const ich = sicht.ich!;
  const hand = sicht.spieler[ich].hand!;
  const soll = sicht.abwerfen[ich];
  const [karten, setKarten] = useState<Rohstoffe>(leereRohstoffe());
  const n = summe(karten);
  return (
    <Modal titel={`Eine 7! Wirf ${soll} Karten ab`} breit>
      <p class="hinweis">
        Du hast mehr als 7 Karten und musst die Hälfte (abgerundet) abgeben.
        {rest !== null && <b> Noch {rest} s – danach wird zufällig abgeworfen.</b>}
      </p>
      <div class="abwurf">
        {ROHSTOFFE.map((r) => (
          <div class={`abwurf-karte ${hand[r] === 0 ? 'leer' : ''}`}>
            <RohstoffIcon typ={r} groesse={34} />
            <div>{ROHSTOFF_NAME[r]}</div>
            <small>von {hand[r]}</small>
            <Zaehler wert={karten[r]} max={Math.min(hand[r], karten[r] + soll - n)} onChange={(x) => setKarten({ ...karten, [r]: x })} />
          </div>
        ))}
      </div>
      <footer>
        <span>
          {n} / {soll} gewählt
        </span>
        <button class="knopf haupt" disabled={n !== soll} onClick={() => aktion({ typ: 'ABWERFEN', karten })}>
          Abwerfen
        </button>
      </footer>
    </Modal>
  );
}

// ---------- Stehlen ----------

export function StehlenDialog({ sicht, aktion }: { sicht: Sicht; aktion: (a: Absicht) => void }): JSX.Element {
  return (
    <Modal titel="Wen bestiehlst du?">
      <div class="auswahl">
        {sicht.stehlenKandidaten.map((i) => {
          const p = sicht.spieler[i];
          return (
            <button class="knopf gross" onClick={() => aktion({ typ: 'STEHLEN', opfer: i })}>
              <i class="punkt" style={{ background: farbHex(p.farbe) }} /> {p.name}
              <small>{p.handAnzahl} Karten</small>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ---------- Erfindung / Monopol ----------

export function ErfindungDialog({ sicht, aktion, onZu }: { sicht: Sicht; aktion: (a: Absicht) => void; onZu: () => void }): JSX.Element {
  const [wahl, setWahl] = useState<Rohstoff[]>([]);
  const frei = (r: Rohstoff): boolean => sicht.bank[r] > wahl.filter((x) => x === r).length;
  return (
    <Modal titel="Erfindung: nimm 2 Rohstoffe aus der Bank" onZu={onZu}>
      <div class="auswahl">
        {ROHSTOFFE.map((r) => (
          <button class="knopf gross" disabled={wahl.length >= 2 || !frei(r)} onClick={() => setWahl([...wahl, r])}>
            <RohstoffIcon typ={r} groesse={32} />
            {ROHSTOFF_NAME[r]}
            <small>Bank: {sicht.bank[r]}</small>
          </button>
        ))}
      </div>
      <footer>
        <span>
          Gewählt: {wahl.length ? wahl.map((r) => ROHSTOFF_NAME[r]).join(' + ') : '–'}{' '}
          {wahl.length > 0 && (
            <button class="knopf leise" onClick={() => setWahl([])}>
              zurücksetzen
            </button>
          )}
        </span>
        <button
          class="knopf haupt"
          disabled={wahl.length !== 2}
          onClick={() => {
            aktion({ typ: 'ERFINDUNG_SPIELEN', rohstoffe: [wahl[0], wahl[1]] });
            onZu();
          }}
        >
          Nehmen
        </button>
      </footer>
    </Modal>
  );
}

export function MonopolDialog({ aktion, onZu }: { aktion: (a: Absicht) => void; onZu: () => void }): JSX.Element {
  return (
    <Modal titel="Monopol: welchen Rohstoff müssen dir alle geben?" onZu={onZu}>
      <div class="auswahl">
        {ROHSTOFFE.map((r) => (
          <button
            class="knopf gross"
            onClick={() => {
              aktion({ typ: 'MONOPOL_SPIELEN', rohstoff: r });
              onZu();
            }}
          >
            <RohstoffIcon typ={r} groesse={32} />
            {ROHSTOFF_NAME[r]}
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ---------- Regelhilfe ----------

export function HilfeDialog({ onZu }: { onZu: () => void }): JSX.Element {
  return (
    <Modal titel="Regeln in Kürze" onZu={onZu} breit>
      <div class="hilfe">
        <section>
          <h3>Ziel</h3>
          <p>
            Wer in seinem eigenen Zug als Erste:r die eingestellte Zahl an Siegpunkten erreicht (Standard 10), gewinnt. Siedlung = 1,
            Stadt = 2, Längste Handelsstraße = 2, Größte Rittermacht = 2, Siegpunktkarte = 1 (bleibt verdeckt, zählt aber).
          </p>
          <h3>Gründung</h3>
          <p>
            Reihum setzt jede:r eine Siedlung mit angrenzender Straße, dann in umgekehrter Reihenfolge noch einmal. Für die zweite
            Siedlung gibt es je angrenzendem Feld einen Rohstoff.
          </p>
          <h3>Dein Zug</h3>
          <ol>
            <li>
              <b>Würfeln.</b> Alle Felder mit der Zahl liefern: 1 Rohstoff je Siedlung, 2 je Stadt. Das Räuberfeld liefert nichts.
            </li>
            <li>
              <b>Handeln und Bauen</b> in beliebiger Reihenfolge. Handel mit Mitspielern nur mit dir als aktivem Spieler; mit der Bank
              4:1, an Häfen 3:1 oder 2:1.
            </li>
            <li>
              <b>Zug beenden.</b>
            </li>
          </ol>
          <h3>Die 7</h3>
          <p>
            Wer mehr als 7 Karten hält, gibt die Hälfte (abgerundet) ab. Danach versetzt du den Räuber auf ein anderes Feld und ziehst
            einer dort angrenzenden Person eine zufällige Karte.
          </p>
        </section>
        <section>
          <h3>Baukosten</h3>
          <table class="kosten">
            <tbody>
              <tr>
                <td>Straße</td>
                <td>
                  <RohstoffListe r={{ holz: 1, lehm: 1 }} />
                </td>
              </tr>
              <tr>
                <td>Siedlung</td>
                <td>
                  <RohstoffListe r={{ holz: 1, lehm: 1, wolle: 1, getreide: 1 }} />
                </td>
              </tr>
              <tr>
                <td>Stadt</td>
                <td>
                  <RohstoffListe r={{ getreide: 2, erz: 3 }} />
                </td>
              </tr>
              <tr>
                <td>Entwicklungskarte</td>
                <td>
                  <RohstoffListe r={{ wolle: 1, getreide: 1, erz: 1 }} />
                </td>
              </tr>
            </tbody>
          </table>
          <h3>Bauregeln</h3>
          <p>
            Zwischen zwei Siedlungen/Städten muss immer mindestens eine Kreuzung frei bleiben. Straßen schließen an dein eigenes Netz an
            und führen nicht durch fremde Siedlungen. Vorrat: 5 Siedlungen, 4 Städte, 15 Straßen.
          </p>
          <h3>Entwicklungskarten</h3>
          <p>
            Pro Zug höchstens eine ausspielen, und nicht im Zug des Kaufs. <b>Ritter</b>: Räuber versetzen (geht auch vor dem Würfeln).{' '}
            <b>Straßenbau</b>: 2 Straßen gratis. <b>Erfindung</b>: 2 Rohstoffe aus der Bank. <b>Monopol</b>: alle geben dir einen
            Rohstoff komplett.
          </p>
          <h3>Sonderkarten</h3>
          <p>
            Längste Handelsstraße ab 5 zusammenhängenden Straßen, Größte Rittermacht ab 3 Rittern. Wer gleichzieht, bekommt die Karte
            nicht – man muss überbieten.
          </p>
          <h3>Sonderbauphase (5–6 Spieler)</h3>
          <p>
            Nach jedem Zug dürfen alle anderen reihum bauen und Entwicklungskarten kaufen – aber nicht handeln und keine Karten
            ausspielen. Wer nichts bauen kann, wird übersprungen.
          </p>
        </section>
      </div>
    </Modal>
  );
}
