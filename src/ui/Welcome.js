import { html, React } from '../lib/html.js';
import { go, back } from '../lib/router.js';
import { createRoom, importRoom } from '../lib/store.js';
import { homeIconSrc } from '../lib/homeicon.js';
import { Icon } from './icons.js';
import { Sheet, toast, TopBar, Avatar, Sparkles } from './components.js';

const { useState, useRef } = React;

export function extractRoomId(text) {
  const s = String(text ?? '').trim();
  const m = s.match(/#\/r\/([A-Za-z0-9]{12,32})/) || s.match(/^([A-Za-z0-9]{12,32})$/);
  return m ? m[1] : null;
}

export function Welcome() {
  const [joinOpen, setJoinOpen] = useState(false);
  const fileRef = useRef(null);

  async function onImport(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const id = importRoom(JSON.parse(await f.text()));
      toast('バックアップから戻しました');
      go('/r/' + id);
    } catch (err) {
      toast(err.message || '読み込めませんでした');
    }
  }

  return html`<div class="welcome">
    <${Sky}>
      <h1>またね</h1>
      <div class="lead">行きたいところ、やりたいこと、<br />次に会う日。ふたりで育てるノート。</div>
    <//>
    <div class="body">
    <div style=${{ margin: '4px 0 30px' }}>
      <div class="feat">
        <div class="ic" style=${{ background: 'var(--star-soft)' }}>⭐</div>
        <div><div class="t">やりたいことを登録し合う</div><div class="s">思いついたら書いておくだけ。季節や期限で、今ちょうどいいものが上に来ます。</div></div>
      </div>
      <div class="feat">
        <div class="ic" style=${{ background: 'var(--accent-soft)' }}>📅</div>
        <div><div class="t">会う日と、その日にやること</div><div class="s">カレンダーで予定を共有。リストから「この日にやる」を選べます。</div></div>
      </div>
      <div class="feat">
        <div class="ic" style=${{ background: 'var(--book-soft)' }}>📚</div>
        <div><div class="t">読書会の本と、読み進み</div><div class="s">次回・次々回の本、月の回数、語りたいことのメモまで。</div></div>
      </div>
    </div>

    <div class="stack" style=${{ marginTop: 'auto' }}>
      <button class="btn accent block" onClick=${() => go('/new')}><${Icon} name="plus" />ふたりの部屋をつくる</button>
      <button class="btn block" onClick=${() => setJoinOpen(true)}><${Icon} name="link" />招待リンクで入る</button>
      <button class="btn ghost block small" onClick=${() => fileRef.current?.click()}><${Icon} name="upload" />バックアップから戻す</button>
      <input type="file" accept="application/json,.json" hidden ref=${fileRef} onChange=${onImport} />
    </div>
    <p class="tiny faint" style=${{ textAlign: 'center', marginTop: '18px', lineHeight: 1.7 }}>
      ログインは不要です。部屋のリンクを知っているふたりだけが見られます。
    </p>
    </div>
    <${JoinSheet} open=${joinOpen} onClose=${() => setJoinOpen(false)} />
  </div>`;
}

// はじめの画面の夜空（星がまたたき、下に虹）
export function Sky({ children }) {
  return html`<div class="sky">
    <${Sparkles} kind="sky" />
    <img class="logo" src=${homeIconSrc()} alt="" />
    ${children}
  </div>`;
}

export function JoinSheet({ open, onClose }) {
  const [text, setText] = useState('');
  const id = extractRoomId(text);
  async function paste() {
    try { setText(await navigator.clipboard.readText()); } catch { toast('貼り付けできませんでした。長押しで貼り付けてください'); }
  }
  return html`<${Sheet} open=${open} onClose=${onClose} title="招待リンクで入る">
    <div class="stack">
      <div class="muted small">友だちから届いた「またね」のリンクを貼り付けてください。LINEのリンクをそのままタップしても入れます。</div>
      <input class="input" placeholder="https://…/#/r/…" value=${text} onInput=${(e) => setText(e.target.value)} />
      <div class="row">
        <button class="btn grow" onClick=${paste}><${Icon} name="copy" />貼り付け</button>
        <button class="btn primary grow" disabled=${!id} onClick=${() => { onClose(); go('/r/' + id); }}>入る</button>
      </div>
      ${text && !id ? html`<div class="small" style=${{ color: 'var(--danger)' }}>リンクの形が違うようです</div>` : null}
    </div>
  <//>`;
}

export function CreateRoom() {
  const [mine, setMine] = useState('');
  const [friend, setFriend] = useState('');
  const ok = mine.trim().length > 0;
  function create() {
    if (!ok) return;
    const id = createRoom({ myName: mine, friendName: friend });
    go('/r/' + id + '?invite=1', { replace: true });
  }
  return html`<div class="page no-nav">
    <${TopBar} title="ふたりの部屋をつくる" onBack=${() => back('/')} />
    <div class="card" style=${{ marginTop: '8px' }}>
      <div class="row" style=${{ justifyContent: 'center', gap: '18px', padding: '6px 0 18px' }}>
        <${Avatar} m=${{ name: mine || 'あ', color: 0 }} size="xl" />
        <span style=${{ fontSize: '22px' }}>🤝</span>
        <${Avatar} m=${{ name: friend || 'と', color: 1 }} size="xl" />
      </div>
      <div class="stack">
        <div class="field"><label for="mine">あなたの名前</label>
          <input id="mine" class="input" placeholder="例）ひかる" value=${mine} autoFocus
            onInput=${(e) => setMine(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && document.getElementById('friend')?.focus()} /></div>
        <div class="field"><label for="friend">友だちの名前 <span class="opt">（あとで本人が変えられます）</span></label>
          <input id="friend" class="input" placeholder="例）さき" value=${friend}
            onInput=${(e) => setFriend(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && create()} /></div>
      </div>
    </div>
    <p class="small muted" style=${{ margin: '14px 6px', lineHeight: 1.8 }}>
      つくったら、招待リンクをLINEで友だちに送ります。<br />リンクを開いた友だちが「自分はこっち」を選べば、同じ部屋を一緒に使えます。
    </p>
    <div class="bottom-bar"><div class="inner">
      <button class="btn accent block" disabled=${!ok} onClick=${create}>部屋をつくる</button>
    </div></div>
  </div>`;
}
