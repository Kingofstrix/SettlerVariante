// Chat: Verlauf und Eingabe. Nachrichten laufen über den Host.
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { CHAT_MAX_LAENGE, farbHex, type ChatEintrag } from '../netz/sitzung';

function uhrzeit(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ChatVerlauf({ eintraege, meinName }: { eintraege: ChatEintrag[]; meinName: string | null }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const letzte = eintraege.at(-1)?.nr;
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [letzte]);
  return (
    <div class="chat-verlauf" ref={ref} aria-live="polite">
      {eintraege.length === 0 && <p class="leerhinweis">Noch keine Nachrichten.</p>}
      {eintraege.map((e) => (
        <p key={e.nr} class={e.name === meinName ? 'eigen' : ''}>
          <i class="punkt" style={{ background: farbHex(e.farbe) }} />
          <b>{e.name}</b> <small>{uhrzeit(e.zeit)}</small>
          <br />
          {e.text}
        </p>
      ))}
    </div>
  );
}

export function ChatEingabe({ onSenden, aus }: { onSenden: (text: string) => void; aus?: string }): JSX.Element {
  const [text, setText] = useState('');
  const senden = (): void => {
    const t = text.trim();
    if (!t) return;
    onSenden(t);
    setText('');
  };
  return (
    <form
      class="chat-eingabe"
      onSubmit={(e) => {
        e.preventDefault();
        senden();
      }}
    >
      <input
        value={text}
        maxLength={CHAT_MAX_LAENGE}
        placeholder={aus ?? 'Nachricht …'}
        disabled={!!aus}
        aria-label="Chatnachricht"
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
      />
      <button class="knopf klein haupt" type="submit" disabled={!!aus || !text.trim()}>
        Senden
      </button>
    </form>
  );
}

/** Verlauf und Eingabe zusammen (Lobby). */
export function ChatBox({
  eintraege,
  meinName,
  onSenden,
}: {
  eintraege: ChatEintrag[];
  meinName: string | null;
  onSenden: ((text: string) => void) | null;
}): JSX.Element {
  return (
    <div class="chat">
      <ChatVerlauf eintraege={eintraege} meinName={meinName} />
      {onSenden && <ChatEingabe onSenden={onSenden} />}
    </div>
  );
}
