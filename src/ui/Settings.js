import { html, React } from '../lib/html.js';
import { back, go } from '../lib/router.js';
import { saveItem, updateRoom, setMe, exportRoom, importRoom, forgetRoom, pendingCount, flushAll, pull } from '../lib/store.js';
import { downloadFile } from '../lib/share.js';
import { APP_VERSION } from '../config.js';
import { useRoom, useOnline } from './hooks.js';
import { Icon } from './icons.js';
import { Avatar, Sheet, Stepper, TopBar, toast, confirmDialog, MEMBER_COLORS } from './components.js';
import { InviteSheet } from './RoomGate.js';

const { useState, useEffect, useRef } = React;

export function Settings({ roomId }) {
  const { snap, sync, pending } = useRoom(roomId);
  const online = useOnline();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editM, setEditM] = useState(null);
  const fileRef = useRef(null);
  const meM = snap.memberById.get(snap.me);
  const other = snap.members.find((m) => m.id !== snap.me);
  const perMonth = snap.room.bookClub?.perMonth ?? 2;

  function backup() {
    const data = exportRoom(roomId);
    const names = snap.members.map((m) => m.name).join('と');
    downloadFile(`またね_${names}_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
  }
  async function onImport(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const id = importRoom(JSON.parse(await f.text()));
      toast('バックアップから戻しました（新しいほうの内容が残ります）');
      go('/r/' + id);
    } catch (err) {
      toast(err.message || '読み込めませんでした');
    }
  }
  async function forget() {
    const p = pendingCount(roomId);
    const ok = await confirmDialog({
      title: 'この端末から部屋を外しますか？',
      body: p ? `まだ送信できていない変更が${p}件あります。電波のあるところで送信が終わってから外すのがおすすめです。` : 'クラウドの記録は消えません。招待リンクを開けばまた入れます。',
      ok: '外す', danger: true,
    });
    if (!ok) return;
    await forgetRoom(roomId);
    go('/', { replace: true });
  }
  async function syncNow() {
    await flushAll();
    await pull(roomId);
    toast(online ? '最新にしました' : 'オフラインです。つながったら自動で送ります');
  }
  async function switchMe() {
    if (!(await confirmDialog({ title: 'この端末の「あなた」を選びなおしますか？', body: '間違えて相手の名前を選んだときに使います。データは消えません。', ok: '選びなおす' }))) return;
    setMe(roomId, null);
  }

  const syncText = !online || sync.state === 'offline' ? `オフライン${pending ? `・${pending}件あとで送信` : ''}`
    : sync.state === 'error' ? '同期できません（あとで自動で再試行）'
    : pending ? '送信中…' : sync.lastSync ? '最新です' : '確認中…';

  return html`<div class="page no-nav">
    <${TopBar} title="設定" onBack=${() => back(`/r/${roomId}`)} />

    <h2 class="section" style=${{ marginTop: '6px' }}>ふたり</h2>
    <div class="list">
      ${snap.members.map((m) => html`<button key=${m.id} class="list-item" onClick=${() => setEditM(m)}>
        <${Avatar} m=${m} />
        <div class="grow"><div class="bold">${m.name}${m.id === snap.me ? html` <span class="badge accent">あなた</span>` : null}</div>
          ${m.placeholder ? html`<div class="tiny muted">まだ部屋に入っていません</div>` : null}</div>
        <${Icon} name="edit" size=${18} />
      </button>`)}
      <button class="list-item" onClick=${() => setInviteOpen(true)}>
        <${Icon} name="share" /><div class="grow"><div class="bold">${other?.placeholder ? '友だちを招待する' : `${other?.name ?? '友だち'}に部屋のリンクを送る`}</div>
          <div class="tiny muted">LINE・リンク・QRコード</div></div><${Icon} name="chevronRight" size=${18} />
      </button>
    </div>

    <h2 class="section">読書会</h2>
    <div class="list">
      <div class="list-item">
        <span style=${{ fontSize: '22px' }}>📚</span>
        <div class="grow"><div class="bold">ひと月の回数</div><div class="tiny muted">ホームとカレンダーの「今月 ●●」の目標</div></div>
        <${Stepper} value=${perMonth} min=${1} max=${8} format=${(v) => `${v}回`}
          onChange=${(v) => updateRoom(roomId, { bookClub: { ...(snap.room.bookClub ?? {}), perMonth: v } })} />
      </div>
    </div>

    <h2 class="section">この端末</h2>
    <div class="list">
      <button class="list-item" onClick=${switchMe}>
        <${Avatar} m=${meM} />
        <div class="grow"><div class="bold">「${meM?.name}」として使っています</div><div class="tiny muted">タップで選びなおす</div></div>
        <${Icon} name="chevronRight" size=${18} />
      </button>
      <button class="list-item" onClick=${syncNow}>
        <${Icon} name="refresh" /><div class="grow"><div class="bold">同期</div><div class="tiny muted">${syncText}</div></div>
      </button>
    </div>

    <h2 class="section">データ</h2>
    <div class="list">
      <button class="list-item" onClick=${backup}><${Icon} name="download" /><div class="grow"><div class="bold">バックアップを保存</div><div class="tiny muted">JSONファイル。「バックアップから戻す」で復元できます</div></div></button>
      <button class="list-item" onClick=${() => fileRef.current?.click()}><${Icon} name="upload" /><div class="grow"><div class="bold">バックアップから戻す</div><div class="tiny muted">今のデータは消さずに、新しいほうを残して合わせます</div></div></button>
      <button class="list-item" onClick=${forget}><${Icon} name="trash" /><div class="grow"><div class="bold" style=${{ color: 'var(--danger)' }}>この端末から部屋を外す</div><div class="tiny muted">クラウドの記録は消えません</div></div></button>
    </div>
    <input type="file" accept="application/json,.json" hidden ref=${fileRef} onChange=${onImport} />

    <h2 class="section">iPhoneのホーム画面に置く</h2>
    <div class="card small muted" style=${{ lineHeight: 1.8 }}>
      Safariでこのページを開き、共有ボタン <${Icon} name="share" size=${14} /> →「ホーム画面に追加」。<br />アプリのように全画面で開けます。
    </div>

    <p class="tiny faint" style=${{ textAlign: 'center', marginTop: '24px', lineHeight: 1.7 }}>
      またね v${APP_VERSION}<br />データはこの端末とクラウドの両方に保存されます。電波がないときは端末に保存し、つながったら自動で送ります。部屋のリンクを知っているふたりだけが見られます。
    </p>

    <${InviteSheet} open=${inviteOpen} onClose=${() => setInviteOpen(false)} snap=${snap} />
    <${MemberSheet} m=${editM} onClose=${() => setEditM(null)} snap=${snap} />
  </div>`;
}

function MemberSheet({ m, onClose, snap }) {
  const [v, setV] = useState(m);
  useEffect(() => { setV(m); }, [m]);
  if (!m || !v) return null;
  const usedColor = snap.members.find((x) => x.id !== m.id)?.color;
  function save() {
    saveItem(snap.id, { ...m, name: v.name.trim(), color: v.color, placeholder: m.placeholder && v.name.trim() === m.name ? m.placeholder : false });
    toast('保存したよ');
    onClose();
  }
  return html`<${Sheet} open=${!!m} onClose=${onClose} title="名前と色">
    <div class="stack">
      <div class="row">
        <${Avatar} m=${{ ...v, name: v.name || '?' }} size="lg" />
        <input class="input grow" placeholder="名前" value=${v.name} aria-label="名前" onInput=${(e) => setV({ ...v, name: e.target.value })} />
      </div>
      <div class="field"><span class="label">色</span>
        <div class="row wrap" style=${{ gap: '10px' }}>
          ${MEMBER_COLORS.map((c, i) => html`<button key=${c} aria-label=${'色' + (i + 1)} aria-pressed=${v.color === i} onClick=${() => setV({ ...v, color: i })}
            disabled=${usedColor === i}
            style=${{ width: '36px', height: '36px', borderRadius: '50%', background: c, opacity: usedColor === i ? 0.25 : 1, border: v.color === i ? '3px solid var(--ink)' : '3px solid transparent', boxShadow: '0 0 0 2px var(--surface) inset' }}></button>`)}
        </div>
      </div>
      <button class="btn primary block" disabled=${!(v.name ?? '').trim()} onClick=${save}>保存</button>
    </div>
  <//>`;
}
