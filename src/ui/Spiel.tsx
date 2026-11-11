// Spieleransicht: Brett, Hand, Mitspieler, Bauen, Handel.
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ENTW_NAME,
  KOSTEN,
  ROHSTOFFE,
  ROHSTOFF_NAME,
  gueltigeRaeuberHexes,
  gueltigeSetupEcken,
  gueltigeSiedlungsEcken,
  gueltigeStadtEcken,
  gueltigeStrassenKanten,
  type EntwTyp,
  type Handelsangebot,
  type Rohstoffe,
  type Sicht,
} from '../engine';
import { LokalSitzung } from '../netz/lokal';
import { farbHex, type Absicht, type Sitzung, type SitzungsZustand } from '../netz/sitzung';
import { DEV } from '../netz/speicher';
import { Brett, KEINE_ZIELE, type Ziele } from './Brett';
import { AbwerfenDialog, ErfindungDialog, HandelDialog, HilfeDialog, Modal, MonopolDialog, RohstoffListe, StehlenDialog } from './Dialoge';
import { EntwIcon, ROHSTOFF_FARBE, RohstoffIcon } from './Icons';
import { LogListe, SpielerTafel, TimerBalken, WurfAnzeige, statusText } from './Teile';
import { toast, useRestzeit, useSitzung } from './hooks';
import { setzeTon, ton, tonAn } from './ton';

type Bauart = 'strasse' | 'siedlung' | 'stadt';

const BAU_NAME: Record<Bauart | 'entwicklung', string> = {
  strasse: 'Straße',
  siedlung: 'Siedlung',
  stadt: 'Stadt',
  entwicklung: 'Entwicklung',
};

function fehlend(hand: Rohstoffe, kosten: Partial<Rohstoffe>): string | null {
  const f = ROHSTOFFE.filter((r) => hand[r] < (kosten[r] ?? 0)).map((r) => ROHSTOFF_NAME[r]);
  return f.length ? `Zu wenig ${f.join(', ')}` : null;
}

/** Ereignisse (Töne, Toasts, Tab-Titel) aus Zustandsänderungen ableiten. */
function useEreignisse(z: SitzungsZustand, sicht: Sicht): void {
  const ich = sicht.ich;
  const dran = ich !== null && sicht.amZug.includes(ich) && sicht.phase !== 'ende';
  const dranSchluessel = dran ? `${sicht.zugNr}:${sicht.phase}:${sicht.setup.schritt}:${sicht.sonderbau?.index ?? ''}` : '';
  const warDran = useRef(false);
  const lokal = z.rolle === 'lokal';

  useEffect(() => {
    if (z.hinweis) {
      toast(z.hinweis.text, 'fehler');
      ton('fehler');
    }
  }, [z.hinweis?.nr]);

  useEffect(() => {
    if (dran && !warDran.current && !lokal) {
      toast('Du bist dran!', 'dran');
      ton('dran');
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted')
        new Notification('Inselreich', { body: 'Du bist dran!' });
    }
    warDran.current = dran;
    document.title = dran && !lokal ? '● Du bist dran! – Inselreich' : 'Inselreich';
  }, [dranSchluessel]);

  useEffect(() => {
    if (sicht.wurf) ton('wuerfel');
  }, [sicht.zugNr, sicht.wurf?.[0], sicht.wurf?.[1]]);

  // Wichtige Logzeilen als Toast
  const letzteNr = useRef(sicht.log.at(-1)?.nr ?? 0);
  useEffect(() => {
    for (const l of sicht.log) {
      if (l.nr <= letzteNr.current) continue;
      if (/stiehlt|Längste Handelsstraße|Größte Rittermacht|Monopol|gewinnt/.test(l.text)) toast(l.text);
    }
    letzteNr.current = sicht.log.at(-1)?.nr ?? 0;
  }, [sicht.log.at(-1)?.nr]);

  const angebote = useRef(0);
  useEffect(() => {
    const n = sicht.angebote.filter((o) => ich !== null && o.an.includes(ich)).length;
    if (n > angebote.current) {
      toast('Neues Handelsangebot für dich');
      ton('handel');
    }
    angebote.current = n;
  }, [sicht.angebote]);
}

export function SpielAnsicht({ sitzung, onVerlassen }: { sitzung: Sitzung; onVerlassen: () => void }): JSX.Element {
  const z = useSitzung(sitzung);
  const sicht = z.sicht!;
  const ich = sicht.ich!;
  const mein = sicht.spieler[ich];
  const hand = mein.hand!;
  const aktion = (a: Absicht): void => sitzung.aktion(a);

  const [bauart, setBauart] = useState<Bauart | null>(null);
  const [dialog, setDialog] = useState<null | 'handel' | 'erfindung' | 'monopol' | 'hilfe' | 'menue'>(null);
  const [gegen, setGegen] = useState<Handelsangebot | undefined>(undefined);
  const [, neu] = useState(0);
  const rest = useRestzeit(z.timer);
  useEreignisse(z, sicht);

  const binAktiv = sicht.aktiv === ich;
  const dran = sicht.amZug.includes(ich);
  const darfBauen = (sicht.phase === 'aktion' && binAktiv) || (sicht.phase === 'sonderbau' && dran);
  const gratis = sicht.phase === 'aktion' && binAktiv && sicht.freieStrassen > 0;

  // Bauauswahl zurücksetzen, sobald sich der Spielabschnitt ändert
  useEffect(() => setBauart(null), [sicht.phase, sicht.aktiv, sicht.zugNr, sicht.sonderbau?.index]);

  const plaetze = useMemo(
    () => ({
      strasse: gueltigeStrassenKanten(sicht, ich),
      siedlung: gueltigeSiedlungsEcken(sicht, ich, false),
      stadt: gueltigeStadtEcken(sicht, ich),
    }),
    [sicht.gebaeude, sicht.strassen, ich],
  );

  const ziele: Ziele = useMemo(() => {
    if (z.pausiert || !dran) return KEINE_ZIELE;
    if (sicht.phase === 'setup')
      return sicht.setup.erwartet === 'siedlung'
        ? { art: 'siedlung', ecken: gueltigeSetupEcken(sicht), kanten: [], hexes: [] }
        : { art: 'strasse', ecken: [], kanten: gueltigeStrassenKanten(sicht, ich, sicht.setup.letzteEcke), hexes: [] };
    if (sicht.phase === 'raeuber') return { art: 'raeuber', ecken: [], kanten: [], hexes: gueltigeRaeuberHexes(sicht, ich) };
    if (!darfBauen) return KEINE_ZIELE;
    const art = gratis ? 'strasse' : bauart;
    if (art === 'strasse') return { art, ecken: [], kanten: plaetze.strasse, hexes: [] };
    if (art === 'siedlung') return { art, ecken: plaetze.siedlung, kanten: [], hexes: [] };
    if (art === 'stadt') return { art, ecken: plaetze.stadt, kanten: [], hexes: [] };
    return KEINE_ZIELE;
  }, [sicht, bauart, z.pausiert]);

  const bauGrund = (art: Bauart | 'entwicklung'): string | null => {
    if (z.pausiert) return 'Das Spiel ist pausiert.';
    if (!darfBauen) {
      if (!dran) return 'Du bist nicht dran.';
      return sicht.phase === 'wuerfeln' ? 'Erst würfeln.' : 'Gerade nicht möglich.';
    }
    if (gratis) return art === 'strasse' ? null : 'Baue zuerst deine kostenlosen Straßen.';
    if (art === 'entwicklung') {
      if (sicht.stapelAnzahl === 0) return 'Keine Entwicklungskarten mehr im Stapel.';
      return fehlend(hand, KOSTEN.entwicklung);
    }
    const vorrat = art === 'strasse' ? mein.strassenUebrig : art === 'siedlung' ? mein.siedlungenUebrig : mein.staedteUebrig;
    if (vorrat <= 0) return `Keine ${art === 'strasse' ? 'Straßen' : art === 'siedlung' ? 'Siedlungen' : 'Städte'} mehr im Vorrat.`;
    const f = fehlend(hand, KOSTEN[art]);
    if (f) return f;
    if (plaetze[art].length === 0) return art === 'stadt' ? 'Du hast keine Siedlung zum Ausbauen.' : 'Kein gültiger Bauplatz.';
    return null;
  };

  const entwGrund = (typ: EntwTyp): string | null => {
    if (typ === 'siegpunkt') return 'Bleibt verdeckt und zählt automatisch.';
    if (z.pausiert) return 'Das Spiel ist pausiert.';
    if (!binAktiv || sicht.phase === 'sonderbau') return 'Nur in deinem eigenen Zug spielbar.';
    if (!(sicht.phase === 'aktion' || (typ === 'ritter' && sicht.phase === 'wuerfeln')))
      return sicht.phase === 'wuerfeln' ? 'Erst würfeln (nur der Ritter geht vorher).' : 'Gerade nicht möglich.';
    if (gratis) return 'Baue zuerst deine kostenlosen Straßen.';
    if (sicht.entwGespielt) return 'Du hast in diesem Zug schon eine Karte gespielt.';
    if (!mein.entw!.some((k) => k.typ === typ && k.gekauftInZug < sicht.zugNr)) return 'In diesem Zug gekauft – erst nächste Runde spielbar.';
    if (typ === 'strassenbau' && (mein.strassenUebrig <= 0 || plaetze.strasse.length === 0)) return 'Du kannst gerade keine Straße bauen.';
    return null;
  };

  const spieleEntw = (typ: EntwTyp): void => {
    if (typ === 'ritter') aktion({ typ: 'RITTER_SPIELEN' });
    else if (typ === 'strassenbau') aktion({ typ: 'STRASSENBAU_SPIELEN' });
    else if (typ === 'erfindung') setDialog('erfindung');
    else if (typ === 'monopol') setDialog('monopol');
  };

  const status = statusText(sicht);
  const handelGrund = z.pausiert
    ? 'Das Spiel ist pausiert.'
    : sicht.phase !== 'aktion'
      ? sicht.phase === 'sonderbau'
        ? 'In der Sonderbauphase wird nicht gehandelt.'
        : binAktiv && sicht.phase === 'wuerfeln'
          ? 'Erst würfeln.'
          : 'Gerade wird nicht gehandelt.'
      : gratis
        ? 'Baue zuerst deine kostenlosen Straßen.'
        : null;
  const entwTypen = (['ritter', 'strassenbau', 'erfindung', 'monopol', 'siegpunkt'] as EntwTyp[]).filter((t) => mein.entw!.some((k) => k.typ === t));
  const offeneAngebote = sicht.angebote;

  return (
    <div class="spiel">
      <main class="brettbereich">
        <div class={`statuszeile ${status.ich ? 'ich' : ''}`}>
          {status.text}
          {bauart && darfBauen && !gratis && (
            <button class="knopf klein" onClick={() => setBauart(null)}>
              {BAU_NAME[bauart]} abbrechen
            </button>
          )}
        </div>
        <Brett
          sicht={sicht}
          ziele={ziele}
          meineFarbe={farbHex(mein.farbe)}
          onEcke={(ecke) => {
            ton('bau');
            aktion(ziele.art === 'stadt' ? { typ: 'STADT_BAUEN', ecke } : { typ: 'SIEDLUNG_BAUEN', ecke });
            setBauart(null);
          }}
          onKante={(kante) => {
            ton('bau');
            aktion({ typ: 'STRASSE_BAUEN', kante });
          }}
          onHex={(hex) => aktion({ typ: 'RAEUBER_SETZEN', hex })}
        />

        {offeneAngebote.length > 0 && (
          <div class="angebote">
            <h3>Handelsangebote</h3>
            {offeneAngebote.map((o) => {
              const von = sicht.spieler[o.von];
              const fuerMich = o.an.includes(ich);
              const kannIch = ROHSTOFFE.every((r) => hand[r] >= o.nimm[r]);
              return (
                <div class="angebot" key={o.id}>
                  <div>
                    <i class="punkt" style={{ background: farbHex(von.farbe) }} />
                    <b>{o.von === ich ? 'Du' : von.name}</b> {o.von === ich ? 'gibst' : 'gibt'} <RohstoffListe r={o.gib} /> für <RohstoffListe r={o.nimm} />
                  </div>
                  <div class="angebot-knoepfe">
                    {o.von === ich ? (
                      <>
                        <small>
                          an {o.an.map((i) => sicht.spieler[i].name).join(', ')}
                          {o.abgelehnt.length > 0 && ` · abgelehnt: ${o.abgelehnt.map((i) => sicht.spieler[i].name).join(', ')}`}
                        </small>
                        <button class="knopf klein" onClick={() => aktion({ typ: 'HANDEL_ZURUECKZIEHEN', angebot: o.id })}>
                          Zurückziehen
                        </button>
                      </>
                    ) : fuerMich ? (
                      <>
                        <span class="tip-halter" data-tip={kannIch ? undefined : 'Dir fehlen die Rohstoffe dafür.'}>
                          <button class="knopf klein haupt" disabled={!kannIch} onClick={() => aktion({ typ: 'HANDEL_ANNEHMEN', angebot: o.id })}>
                            Annehmen
                          </button>
                        </span>
                        <button class="knopf klein" onClick={() => aktion({ typ: 'HANDEL_ABLEHNEN', angebot: o.id })}>
                          Ablehnen
                        </button>
                        {o.von === sicht.aktiv && (
                          <button
                            class="knopf klein"
                            onClick={() => {
                              setGegen(o);
                              setDialog('handel');
                            }}
                          >
                            Gegenangebot
                          </button>
                        )}
                      </>
                    ) : (
                      <small>nicht an dich</small>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sitzung instanceof LokalSitzung && (
          <div class="perspektive">
            <span>Sicht:</span>
            {sicht.spieler.map((p) => (
              <button class={`chip ${p.id === ich ? 'an' : ''}`} onClick={() => sitzung.perspektive(p.id)}>
                <i class="punkt" style={{ background: farbHex(p.farbe) }} /> {p.name}
              </button>
            ))}
          </div>
        )}
      </main>

      <aside class="seite">
        <div class="kopf">
          <b class="logo">Inselreich</b>
          {z.raumCode && <span class="raum">Raum {z.raumCode}</span>}
          <span class="kopf-knoepfe">
            <button class="knopf leise" data-tip="Regeln" onClick={() => setDialog('hilfe')}>
              ?
            </button>
            <button
              class="knopf leise"
              data-tip={tonAn() ? 'Ton aus' : 'Ton an'}
              onClick={() => {
                setzeTon(!tonAn());
                neu((n) => n + 1);
              }}
            >
              {tonAn() ? '🔊' : '🔇'}
            </button>
            <button class="knopf leise" data-tip="Menü" onClick={() => setDialog('menue')}>
              ☰
            </button>
          </span>
        </div>
        {!z.online && <div class="banner warn">{z.meldung ?? 'Keine Verbindung …'}</div>}
        <TimerBalken timer={z.timer} pausiert={z.pausiert} />
        <SpielerTafel sicht={sicht} verbunden={z.verbunden} />

        <div class="aktionen">
          <div class="wuerfelzeile">
            {sicht.phase === 'wuerfeln' && binAktiv ? (
              <button class="knopf haupt riesig" disabled={z.pausiert} onClick={() => aktion({ typ: 'WUERFELN' })}>
                🎲 Würfeln
              </button>
            ) : (
              <WurfAnzeige sicht={sicht} />
            )}
          </div>
          <div class="baumenue">
            {(['strasse', 'siedlung', 'stadt', 'entwicklung'] as const).map((art) => {
              const grund = bauGrund(art);
              const gewaehlt = art !== 'entwicklung' && (bauart === art || (gratis && art === 'strasse'));
              return (
                <span class="tip-halter" data-tip={grund ?? undefined}>
                  <button
                    class={`knopf bau ${gewaehlt ? 'gewaehlt' : ''}`}
                    disabled={!!grund}
                    onClick={() => (art === 'entwicklung' ? aktion({ typ: 'ENTW_KAUFEN' }) : setBauart(bauart === art ? null : art))}
                  >
                    <b>{BAU_NAME[art]}</b>
                    <RohstoffListe r={KOSTEN[art]} />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
        <LogListe sicht={sicht} />
      </aside>

      <footer class="handleiste">
        <div class="hand">
          {ROHSTOFFE.map((r) => (
            <div class={`karte ${hand[r] === 0 ? 'leer' : ''}`} style={{ '--kf': ROHSTOFF_FARBE[r] }} data-tip={ROHSTOFF_NAME[r]}>
              <RohstoffIcon typ={r} groesse={30} />
              <span class="kname">{ROHSTOFF_NAME[r]}</span>
              <b>{hand[r]}</b>
            </div>
          ))}
        </div>
        <div class="entw">
          {entwTypen.length === 0 && <small class="leerhinweis">Keine Entwicklungskarten</small>}
          {entwTypen.map((typ) => {
            const n = mein.entw!.filter((k) => k.typ === typ).length;
            const grund = entwGrund(typ);
            return (
              <span class="tip-halter" data-tip={grund ?? `${ENTW_NAME[typ]} ausspielen`}>
                <button class="knopf entwkarte" disabled={!!grund} onClick={() => spieleEntw(typ)}>
                  <EntwIcon typ={typ} groesse={24} />
                  {ENTW_NAME[typ]}
                  {n > 1 && <b> ×{n}</b>}
                </button>
              </span>
            );
          })}
        </div>
        <div class="zugknoepfe">
          <span class="tip-halter" data-tip={handelGrund ?? undefined}>
            <button
              class="knopf"
              disabled={!!handelGrund}
              onClick={() => {
                setGegen(undefined);
                setDialog('handel');
              }}
            >
              ⇄ Handeln
            </button>
          </span>
          {sicht.phase === 'sonderbau' ? (
            <button class="knopf haupt" disabled={!dran || z.pausiert} onClick={() => aktion({ typ: 'SONDERBAU_FERTIG' })}>
              Fertig / Überspringen
            </button>
          ) : (
            <span class="tip-halter" data-tip={sicht.phase === 'aktion' && binAktiv ? undefined : binAktiv && sicht.phase === 'wuerfeln' ? 'Erst würfeln.' : 'Gerade nicht möglich.'}>
              <button class="knopf haupt" disabled={!(sicht.phase === 'aktion' && binAktiv) || z.pausiert} onClick={() => aktion({ typ: 'ZUG_BEENDEN' })}>
                Zug beenden
              </button>
            </span>
          )}
        </div>
      </footer>

      {sicht.phase === 'abwerfen' && sicht.abwerfen[ich] !== undefined && <AbwerfenDialog sicht={sicht} aktion={aktion} rest={z.timer?.art === 'abwerfen' ? rest : null} />}
      {sicht.phase === 'stehlen' && binAktiv && <StehlenDialog sicht={sicht} aktion={aktion} />}
      {dialog === 'handel' && sicht.phase === 'aktion' && <HandelDialog sicht={sicht} vorlage={gegen} aktion={aktion} onZu={() => setDialog(null)} />}
      {dialog === 'erfindung' && <ErfindungDialog sicht={sicht} aktion={aktion} onZu={() => setDialog(null)} />}
      {dialog === 'monopol' && <MonopolDialog aktion={aktion} onZu={() => setDialog(null)} />}
      {dialog === 'hilfe' && <HilfeDialog onZu={() => setDialog(null)} />}
      {dialog === 'menue' && <Menue sitzung={sitzung} z={z} onZu={() => setDialog(null)} onVerlassen={onVerlassen} />}
      {sicht.phase === 'ende' && <EndeDialog sitzung={sitzung} sicht={sicht} onVerlassen={onVerlassen} />}
    </div>
  );
}

export function EndeDialog({ sitzung, sicht, onVerlassen }: { sitzung: Sitzung; sicht: Sicht; onVerlassen: () => void }): JSX.Element {
  const [zu, setZu] = useState(false);
  if (zu) return <button class="knopf haupt ende-wieder" onClick={() => setZu(false)}>🏆 Ergebnis</button>;
  const rang = [...sicht.spieler].sort((a, b) => sicht.endstand![b.id] - sicht.endstand![a.id]);
  return (
    <Modal titel={`🏆 ${sicht.spieler[sicht.gewinner!].name} gewinnt!`} onZu={() => setZu(true)}>
      <table class="endstand">
        <tbody>
          {rang.map((p, i) => (
            <tr>
              <td>{i + 1}.</td>
              <td>
                <i class="punkt" style={{ background: farbHex(p.farbe) }} /> {p.name}
              </td>
              <td>
                <b>{sicht.endstand![p.id]}</b> Punkte
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer>
        <button class="knopf" onClick={onVerlassen}>
          Verlassen
        </button>
        {sitzung.host && (
          <button class="knopf haupt" onClick={() => sitzung.host!.zurLobby()}>
            Zurück zur Lobby
          </button>
        )}
      </footer>
    </Modal>
  );
}

export function herunterladen(name: string, inhalt: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([inhalt], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function Menue({ sitzung, z, onZu, onVerlassen }: { sitzung: Sitzung; z: SitzungsZustand; onZu: () => void; onVerlassen: () => void }): JSX.Element {
  const h = sitzung.host;
  const [debug, setDebug] = useState('');
  const [debugFehler, setDebugFehler] = useState<string | null>(null);
  const [benachr, setBenachr] = useState('Notification' in window ? Notification.permission : 'denied');
  return (
    <Modal titel="Menü" onZu={onZu} breit={!!h && DEV}>
      <div class="menue">
        {'Notification' in window && benachr !== 'granted' && (
          <button class="knopf" onClick={() => void Notification.requestPermission().then(setBenachr)}>
            🔔 Browser-Benachrichtigung „Du bist dran“ erlauben
          </button>
        )}
        {h && (
          <>
            <button class="knopf" onClick={() => h.pause(!z.pausiert)}>
              {z.pausiert ? '▶ Spiel fortsetzen' : '⏸ Spiel pausieren'}
            </button>
            <button class="knopf" onClick={() => herunterladen(`inselreich-${z.raumCode}.json`, h.exportieren())}>
              ⬇ Spielstand exportieren (JSON)
            </button>
            <button
              class="knopf"
              onClick={() => {
                if (confirm('Laufende Partie wirklich abbrechen und zur Lobby zurück?')) {
                  h.zurLobby();
                  onZu();
                }
              }}
            >
              ↩ Partie abbrechen, zurück zur Lobby
            </button>
            <p class="hinweis">
              Du bist Host. Lass diesen Tab offen. Nach einem Neuladen geht der Raum automatisch wieder auf. Seed dieser Partie: {h.seed() ?? '–'}
            </p>
            {DEV && z.sicht && (
              <div class="debug">
                <h3>Debug (nur Dev-Modus)</h3>
                <div class="debug-gib">
                  {z.sicht.spieler.map((p) => (
                    <div>
                      <i class="punkt" style={{ background: farbHex(p.farbe) }} /> {p.name}:{' '}
                      {ROHSTOFFE.map((r) => (
                        <button class="knopf klein" data-tip={`+1 ${ROHSTOFF_NAME[r]}`} onClick={() => h.debugGib(p.id, r, 1)}>
                          <RohstoffIcon typ={r} groesse={16} />
                        </button>
                      ))}
                      <button class="knopf klein" onClick={() => ROHSTOFFE.forEach((r) => h.debugGib(p.id, r, 3))}>
                        +3 von allem
                      </button>
                    </div>
                  ))}
                </div>
                <textarea rows={5} placeholder="Spielzustand als JSON" value={debug} onInput={(e) => setDebug((e.target as HTMLTextAreaElement).value)} />
                <div>
                  <button class="knopf klein" onClick={() => setDebug(h.debugZustand())}>
                    Zustand laden
                  </button>
                  <button class="knopf klein" onClick={() => setDebugFehler(h.debugSetze(debug))}>
                    Zustand setzen
                  </button>
                  {debugFehler && <span class="fehler"> {debugFehler}</span>}
                </div>
              </div>
            )}
          </>
        )}
        <button
          class="knopf"
          onClick={() => {
            if (confirm(h ? 'Raum wirklich schließen? Das beendet das Spiel für alle.' : 'Spiel wirklich verlassen?')) onVerlassen();
          }}
        >
          🚪 {h ? 'Raum schließen' : 'Spiel verlassen'}
        </button>
      </div>
    </Modal>
  );
}
