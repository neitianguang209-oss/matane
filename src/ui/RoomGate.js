// 部屋に入るまで：読み込み中・見つからない・「あなたはどっち？」・名前の入力
import { html, React } from '../lib/html.js';
import { go } from '../lib/router.js';
import { openRoom, closeRoom, setMe, saveItem, getItem, flushAll } from '../lib/store.js';
import { currentPass, usePass, claimCreator } from '../lib/pass.js';
import { APP_VERSION } from '../config.js';
import { inviteUrl, lineShareUrl } from '../lib/share.js';
import qrcode from 'qrcode-generator';
import { useRoom, useOnline } from './hooks.js';
import { Icon } from './icons.js';
import { Avatar, Sheet, toast, copyText, TopBar, celebrate } from './components.js';
import { Sky } from './Welcome.js';

const { useEffect, useState } = React;

export function RoomGate({ roomId, children }) {
  useEffect(() => { openRoom(roomId); return () => closeRoom(roomId); }, [roomId]);
  const { snap, sync } = useRoom(roomId);
  const online = useOnline();

  if (!snap?.room) {
    const nf = sync.state === 'notfound';
    const off = !online || sync.state === 'offline';
    return html`<div class="page no-nav">
      <${TopBar} title="またね" onBack=${() => go('/')} />
      <div class="empty">
        <div class="e">${nf ? '🔍' : off ? '📡' : '⏳'}</div>
        <div class="t">${nf ? 'この部屋は見つかりませんでした' : off ? 'オフラインです' : '部屋を読み込んでいます…'}</div>
        <div class="small" style=${{ marginTop: '6px' }}>${nf ? 'リンクが途中で切れていないか確かめてください。' : off ? '電波のあるところでもう一度開いてください。' : ''}</div>
        ${nf || off ? html`<button class="btn" style=${{ marginTop: '16px' }} onClick=${() => go('/')}>はじめの画面へ</button>` : null}
      </div>
    </div>`;
  }
  if (!snap.me || !snap.memberById.get(snap.me)) return html`<${WhoAmI} snap=${snap} />`;
  const meM = snap.memberById.get(snap.me);
  if (meM.placeholder) return html`<${NameYourself} snap=${snap} m=${meM} />`;
  return html`<${LinkPass} snap=${snap} m=${meM} />${children}`;
}

// この端末のパスを「自分」のメンバー情報に書いておく（オーナーが設定画面から「部屋をつくれる人」にできるように）
function LinkPass({ snap, m }) {
  const pass = usePass();
  useEffect(() => {
    const pid = currentPass()?.id;
    if (!pid || !pass.checked || pass.error) return;   // サーバーに名乗れてから（承認のときに見つかるように）
    const ids = m.passIds ?? [];
    // どの版で使っているかも書いておく（設定画面で相手が新しい版か確かめられるように）
    if (!ids.includes(pid) || m.appVersion !== APP_VERSION) {
      saveItem(snap.id, { ...getItem(snap.id, m.id), passIds: ids.includes(pid) ? ids : [...ids, pid].slice(-5), appVersion: APP_VERSION });
    }
    // 部屋をつくった人（1人目）で、まだオーナーがいなければ、この端末がオーナーになる
    if (m.order === 0 && !pass.owner && pass.status !== 'owner') {
      // パスを書いたメンバー情報がサーバーに届いてから頼む（届くのが遅れたら数回やり直す）
      let alive = true;
      const tryClaim = (n) => flushAll().then(() => claimCreator(snap.id))
        .catch(() => { if (alive && n < 4) setTimeout(() => tryClaim(n + 1), 4000); });   // 前からある部屋でなければ何もしない
      tryClaim(0);
      return () => { alive = false; };
    }
  }, [snap.id, m.id, m.appVersion, pass.checked, pass.error, pass.owner]);
  return null;
}

function WhoAmI({ snap }) {
  return html`<div class="welcome">
    <${Sky}>
      <h1 style=${{ fontSize: '26px' }}>ようこそ！</h1>
      <div class="lead">${snap.members.map((m) => m.placeholder ? '?' : m.name).join(' と ')} の部屋です。<br />あなたはどっち？</div>
    <//>
    <div class="body">
    <div class="who-pick">
      ${snap.members.map((m) => html`<button key=${m.id} onClick=${() => setMe(snap.id, m.id)}>
        <${Avatar} m=${m.placeholder ? { ...m, name: '?' } : m} size="xl" />
        ${m.placeholder ? '名前を入れる' : m.name}
        <span class="s">${m.placeholder ? '招待された人はこちら' : 'この人として使う'}</span>
      </button>`)}
    </div>
    <p class="tiny faint" style=${{ textAlign: 'center', marginTop: 'auto', paddingTop: '24px', lineHeight: 1.7 }}>
      選んだ人はこの端末に覚えておきます（設定からいつでも変えられます）。
    </p>
    </div>
  </div>`;
}

function NameYourself({ snap, m }) {
  const [name, setName] = useState('');
  const other = snap.members.find((x) => x.id !== m.id);
  function save() {
    if (!name.trim()) return;
    saveItem(snap.id, { ...m, name: name.trim(), placeholder: false });
    toast(`ようこそ、${name.trim()}！`);
    celebrate();
  }
  return html`<div class="welcome">
    <${Sky}>
      <h1 style=${{ fontSize: '26px' }}>はじめまして</h1>
      <div class="lead">${other ? `${other.name}が部屋をつくって待ってるよ。` : ''}<br />あなたの名前を教えてね。</div>
    <//>
    <div class="stack" style=${{ marginTop: '26px' }}>
      <div class="row">
        <${Avatar} m=${{ ...m, name: name || '?' }} size="lg" />
        <input class="input grow" placeholder="あなたの名前" value=${name} autoFocus aria-label="あなたの名前"
          onInput=${(e) => setName(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && save()} />
      </div>
      <button class="btn accent block" disabled=${!name.trim()} onClick=${save}>はじめる</button>
      <button class="link-btn" style=${{ alignSelf: 'center' }} onClick=${() => setMe(snap.id, null)}>選びなおす</button>
    </div>
  </div>`;
}

// 招待（リンク・LINE・QR）
export function InviteSheet({ open, onClose, snap }) {
  const url = inviteUrl(snap.id);
  const other = snap.members.find((m) => m.id !== snap.me);
  const me = snap.memberById.get(snap.me);
  const text = `「またね」で、行きたいところ・やりたいこと・会う日・読書会の本をいっしょにメモしよう！\n${url}`;
  const qrSvg = React.useMemo(() => {
    try {
      const q = qrcode(0, 'M');
      q.addData(url);
      q.make();
      return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch { return ''; }
  }, [url]);
  async function copy() {
    if (await copyText(url)) toast('リンクをコピーしました');
  }
  async function share() {
    try { await navigator.share({ title: 'またね', text: text.replace(url, '').trim(), url }); } catch { /* 閉じただけ */ }
  }
  return html`<${Sheet} open=${open} onClose=${onClose} title=${other?.placeholder ? '友だちを招待しよう' : `${other?.name ?? '友だち'}を招待`}>
    <div class="stack">
      <div class="muted small" style=${{ lineHeight: 1.7 }}>
        このリンクを開いて「${other?.placeholder ? '名前を入れる' : other?.name}」を選ぶと、${me?.name ?? 'あなた'}と同じ部屋が使えます。ログインは要りません。
      </div>
      <a class="btn block" style=${{ background: '#06c755', borderColor: '#06c755', color: '#fff' }} href=${lineShareUrl(text)} target="_blank" rel="noopener">
        <${Icon} name="chat" />LINEで送る
      </a>
      <div class="row">
        <button class="btn grow" onClick=${copy}><${Icon} name="copy" />リンクをコピー</button>
        ${navigator.share ? html`<button class="btn grow" onClick=${share}><${Icon} name="share" />ほかの方法</button>` : null}
      </div>
      ${qrSvg ? html`<div>
        <div class="qr" dangerouslySetInnerHTML=${{ __html: qrSvg }}></div>
        <div class="tiny faint" style=${{ textAlign: 'center', marginTop: '6px' }}>となりにいるなら、スマホのカメラで読み取ってもOK</div>
      </div>` : null}
      <div class="tiny faint" style=${{ wordBreak: 'break-all', textAlign: 'center' }}>${url}</div>
    </div>
  <//>`;
}
