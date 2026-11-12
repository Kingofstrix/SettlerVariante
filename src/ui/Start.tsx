// Startbildschirm: Raum erstellen, beitreten, als Beamer verbinden, lokal spielen.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { KARTEN, KARTEN_NAME, type KartenId } from '../engine';
import { FARBEN } from '../netz/sitzung';
import { DEV, codeGueltig, lese, normalisiereCode, schreibe, type Profil } from '../netz/speicher';
import type { NetzOverride } from '../netz/transport';
import { HilfeDialog } from './Dialoge';

export interface StartAktionen {
  erstellen(profil: Profil): void;
  beitreten(code: string, rolle: 'spieler' | 'beamer', profil: Profil): void;
  importieren(json: string): void;
  lokal(anzahl: number, karte: KartenId): void;
}

export function Start({ aktionen, fehler, laedt }: { aktionen: StartAktionen; fehler: string | null; laedt: string | null }): JSX.Element {
  const gemerkt = lese<Profil>('profil');
  const [name, setName] = useState(gemerkt?.name ?? '');
  const [farbe, setFarbe] = useState(gemerkt?.farbe ?? FARBEN[Math.floor(Math.random() * FARBEN.length)].id);
  const [code, setCode] = useState(normalisiereCode(new URLSearchParams(location.search).get('raum') ?? ''));
  const [hilfe, setHilfe] = useState(false);
  const [netz, setNetz] = useState<NetzOverride>(lese<NetzOverride>('netz') ?? {});
  const [lokalAnzahl, setLokalAnzahl] = useState(4);
  const [lokalKarte, setLokalKarte] = useState<KartenId>('klassik');
  const profil = (): Profil => {
    const p = { name: name.trim() || 'Spieler', farbe };
    schreibe('profil', p);
    return p;
  };
  const setzeNetz = (teil: Partial<NetzOverride>): void => {
    const n = { ...netz, ...teil };
    setNetz(n);
    schreibe('netz', n);
  };
  const codeOk = codeGueltig(code);
  const nameFehlt = !name.trim();

  return (
    <div class="start">
      <div class="start-karte">
        <h1>
          <svg viewBox="0 0 24 24" width="54" height="54" aria-hidden="true">
            <path d="M12 1l9.5 5.5v11L12 23l-9.5-5.5v-11z" fill="#2f7d4f" stroke="#ead9a8" stroke-width="2" />
            <path d="M12 6l4 6h-2.2l3 5H7.2l3-5H8z" fill="#fff8e7" />
          </svg>
          Inselreich
        </h1>
        <p class="unter">Siedeln, handeln, bauen – für 3 bis 6 Spieler im selben Raum.{DEV && <b> · Dev-Modus</b>}</p>

        <div class="feld">
          <label for="name">Dein Name</label>
          <input id="name" value={name} maxLength={16} placeholder="z. B. Lena" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          <span class="farbwahl">
            {FARBEN.map((f) => (
              <button class={`farbe ${farbe === f.id ? 'an' : ''}`} style={{ background: f.hex }} data-tip={f.name} aria-label={f.name} onClick={() => setFarbe(f.id)} />
            ))}
          </span>
        </div>

        {laedt && <div class="banner">{laedt}</div>}
        {fehler && (
          <div class="banner warn">
            {fehler}
            <br />
            <small>Wenn es nicht klappt: alle in einen Handy-Hotspot.</small>
          </div>
        )}

        <div class="start-wahl">
          <div class="wahl">
            <h2>Raum erstellen</h2>
            <p>Du wirst Host. Dein Laptop rechnet das Spiel und bleibt bis zum Ende offen.</p>
            <span class="tip-halter block" data-tip={nameFehlt ? 'Bitte erst einen Namen eingeben.' : undefined}>
              <button class="knopf haupt" disabled={nameFehlt || !!laedt} onClick={() => aktionen.erstellen(profil())}>
                Raum erstellen
              </button>
            </span>
          </div>
          <div class="wahl">
            <h2>Raum beitreten</h2>
            <input
              class="code"
              value={code}
              placeholder="CODE"
              maxLength={6}
              aria-label="Raumcode"
              onInput={(e) => setCode(normalisiereCode((e.target as HTMLInputElement).value))}
            />
            <span class="tip-halter block" data-tip={nameFehlt ? 'Bitte erst einen Namen eingeben.' : !codeOk ? 'Raumcode eingeben (4–6 Zeichen).' : undefined}>
              <button class="knopf haupt" disabled={nameFehlt || !codeOk || !!laedt} onClick={() => aktionen.beitreten(code, 'spieler', profil())}>
                Beitreten
              </button>
            </span>
            <span class="tip-halter block" data-tip={!codeOk ? 'Raumcode eingeben (4–6 Zeichen).' : undefined}>
              <button class="knopf" disabled={!codeOk || !!laedt} onClick={() => aktionen.beitreten(code, 'beamer', { name: 'Beamer', farbe: 'weiss' })}>
                📽 Als Beamer verbinden
              </button>
            </span>
          </div>
        </div>

        <details>
          <summary>Lokal an einem Gerät spielen (zum Ausprobieren)</summary>
          <div class="feld">
            <label>Spieler</label>
            {[3, 4, 5, 6].map((n) => (
              <button class={`chip ${lokalAnzahl === n ? 'an' : ''}`} onClick={() => setLokalAnzahl(n)}>
                {n}
              </button>
            ))}
          </div>
          <div class="feld">
            <label>Karte</label>
            {KARTEN.map((k) => (
              <button class={`chip ${lokalKarte === k ? 'an' : ''}`} onClick={() => setLokalKarte(k)}>
                {KARTEN_NAME[k]}
              </button>
            ))}
            <button class="knopf" onClick={() => aktionen.lokal(lokalAnzahl, lokalKarte)}>
              Lokales Spiel starten
            </button>
          </div>
        </details>

        <details>
          <summary>Netzwerk-Einstellungen (TURN, eigener PeerJS-Server)</summary>
          <p class="hinweis">
            Nur nötig, wenn die direkte Verbindung scheitert (z. B. eduroam). Die Angaben gelten für diesen Browser. Für alle gemeinsam:
            Datei <code>netz-config.json</code> im Repo anpassen (siehe README).
          </p>
          <div class="netz">
            <label>TURN-URL</label>
            <input value={netz.turnUrl ?? ''} placeholder="turn:mein-server.de:3478" onInput={(e) => setzeNetz({ turnUrl: (e.target as HTMLInputElement).value.trim() })} />
            <label>TURN-Benutzer</label>
            <input value={netz.turnUser ?? ''} onInput={(e) => setzeNetz({ turnUser: (e.target as HTMLInputElement).value })} />
            <label>TURN-Passwort</label>
            <input value={netz.turnPass ?? ''} type="password" onInput={(e) => setzeNetz({ turnPass: (e.target as HTMLInputElement).value })} />
            <label>PeerJS-Server (Host)</label>
            <input value={netz.peerHost ?? ''} placeholder="leer = öffentlicher Server" onInput={(e) => setzeNetz({ peerHost: (e.target as HTMLInputElement).value.trim() })} />
          </div>
        </details>

        <details>
          <summary>Spielstand importieren (anderer Laptop übernimmt als Host)</summary>
          <p class="hinweis">Wähle die exportierte JSON-Datei. Dieser Browser öffnet den Raum mit demselben Code neu; alle anderen verbinden sich automatisch wieder.</p>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const datei = (e.target as HTMLInputElement).files?.[0];
              if (datei) void datei.text().then((t) => aktionen.importieren(t));
            }}
          />
        </details>

        <p class="fuss">
          <button class="knopf leise" onClick={() => setHilfe(true)}>
            Regeln ansehen
          </button>
        </p>
      </div>
      {hilfe && <HilfeDialog onZu={() => setHilfe(false)} />}
    </div>
  );
}
