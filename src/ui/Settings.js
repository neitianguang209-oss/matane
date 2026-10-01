import { html, React } from '../lib/html.js';
import { back, go } from '../lib/router.js';
import { saveItem, updateRoom, setMe, exportRoom, importRoom, forgetRoom, pendingCount, flushAll, pull } from '../lib/store.js';
import { downloadFile } from '../lib/share.js';
import { APP_VERSION } from '../config.js';
import { useRoom, useOnline } from './hooks.js';
import { Icon } from './icons.js';
import { HOME_ICONS, homeIconId, homeIconSrc, setHomeIcon } from '../lib/homeicon.js';
import { Avatar, Sheet, Stepper, TopBar, toast, confirmDialog, MEMBER_COLORS } from './components.js';
import { InviteSheet } from './RoomGate.js';
import { PhotoManager, PhotoViewer, PhotoCropper, thumbOf } from './photo.js';
import { LockSheet, useLock } from './lockui.js';
import { forgetKey } from '../lib/lock.js';

const { useState, useEffect, useRef } = React;

export function Settings({ roomId }) {
  const { snap, sync, pending } = useRoom(roomId);
  const online = useOnline();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editM, setEditM] = useState(null);
  const [viewM, setViewM] = useState(null);
  const [lockOpen, setLockOpen] = useState(false);
  const lock = useLock(snap);
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
      ${snap.members.map((m) => html`<div key=${m.id} class="list-item">
        <button class="avatar-btn" aria-label=${`${m.name}のアイコンを大きく見る`} onClick=${() => setViewM(m.id)}><${Avatar} m=${m} size="lg" /></button>
        <button class="grow" style=${{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick=${() => setEditM(m)}>
          <div class="bold">${m.name}${m.id === snap.me ? html` <span class="badge accent">あなた</span>` : null}</div>
          <div class="tiny muted">${m.placeholder ? 'まだ部屋に入っていません' : m.id === snap.me ? '写真（何枚でも）・名前・色を変える' : 'アイコンをタップで大きく見る'}</div>
        </button>
        <button class="icon-btn" aria-label="編集" onClick=${() => setEditM(m)}><${Icon} name="edit" size=${18} /></button>
      </div>`)}
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

    <h2 class="section">自分だけのメモの鍵</h2>
    <div class="list">
      <button class="list-item" onClick=${() => (lock.hasLock && lock.ready ? null : setLockOpen(true))}>
        <${Icon} name=${lock.ready ? 'lock' : 'unlock'} />
        <div class="grow"><div class="bold">${!lock.hasLock ? '合言葉を決める' : lock.ready ? 'この端末で使えます' : 'この端末で開く（合言葉を入れる）'}</div>
          <div class="tiny muted">${!lock.hasLock ? '読書会のメモや付箋に鍵をかけて、自分だけが読めるようにできます' : '鍵をかけたメモは暗号のまま保存され、相手には読めません'}</div></div>
        ${lock.hasLock && lock.ready ? null : html`<${Icon} name="chevronRight" size=${18} />`}
      </button>
      ${lock.ready ? html`<button class="list-item" onClick=${async () => {
        if (!(await confirmDialog({ title: 'この端末の鍵を外しますか？', body: '鍵のかかったメモは、合言葉を入れるまでこの端末では読めなくなります。メモ自体は消えません。', ok: '外す' }))) return;
        await forgetKey(snap.id, snap.me);
        toast('この端末の鍵を外しました');
      }}><${Icon} name="close" /><div class="grow"><div class="bold">この端末の鍵を外す</div><div class="tiny muted">人に貸すときなど</div></div></button>` : null}
    </div>

    <h2 class="section">データ</h2>
    <div class="list">
      <button class="list-item" onClick=${backup}><${Icon} name="download" /><div class="grow"><div class="bold">バックアップを保存</div><div class="tiny muted">JSONファイル。「バックアップから戻す」で復元できます</div></div></button>
      <button class="list-item" onClick=${() => fileRef.current?.click()}><${Icon} name="upload" /><div class="grow"><div class="bold">バックアップから戻す</div><div class="tiny muted">今のデータは消さずに、新しいほうを残して合わせます</div></div></button>
      <button class="list-item" onClick=${forget}><${Icon} name="trash" /><div class="grow"><div class="bold" style=${{ color: 'var(--danger)' }}>この端末から部屋を外す</div><div class="tiny muted">クラウドの記録は消えません</div></div></button>
    </div>
    <input type="file" accept="application/json,.json" hidden ref=${fileRef} onChange=${onImport} />

    <${HomeIconPicker} />

    <p class="tiny faint" style=${{ textAlign: 'center', marginTop: '24px', lineHeight: 1.7 }}>
      またね v${APP_VERSION}<br />データはこの端末とクラウドの両方に保存されます。電波がないときは端末に保存し、つながったら自動で送ります。部屋のリンクを知っているふたりだけが見られます。
    </p>

    <${InviteSheet} open=${inviteOpen} onClose=${() => setInviteOpen(false)} snap=${snap} />
    <${MemberSheet} m=${editM} onClose=${() => setEditM(null)} snap=${snap} />
    <${PhotoViewer} open=${!!viewM} onClose=${() => setViewM(null)} snap=${snap} initial=${viewM} onEdit=${(m) => setEditM(m)} />
    <${LockSheet} open=${lockOpen} onClose=${() => setLockOpen(false)} snap=${snap} />
  </div>`;
}

function MemberSheet({ m, onClose, snap }) {
  const [v, setV] = useState(m);
  useEffect(() => { setV(m); }, [m?.id]);
  if (!m || !v) return null;
  const live = snap.memberById.get(m.id) ?? m;   // 写真は保存したらすぐ反映
  const mine = m.id === snap.me;
  const usedColor = snap.members.find((x) => x.id !== m.id)?.color;
  function save() {
    const cur = snap.memberById.get(m.id) ?? m;
    saveItem(snap.id, { ...cur, name: v.name.trim(), color: v.color, placeholder: m.placeholder && v.name.trim() === m.name ? m.placeholder : false });
    toast('保存したよ');
    onClose();
  }
  return html`<${Sheet} open=${!!m} onClose=${onClose} title=${mine ? 'あなたのアイコン' : `${m.name}のアイコン`}>
    <div class="stack">
      ${mine ? html`<${PhotoManager} snap=${snap} m=${live} />` : html`<div class="photo-pick">
        <${Avatar} m=${{ ...live, color: v.color }} size="xl" />
        <div class="small muted grow">写真は${m.name}が自分の端末で選びます。${(live._photos ?? []).length ? `（${live._photos.length}枚）` : ''}</div>
      </div>`}
      <div class="field"><label for="mname">名前</label>
        <input id="mname" class="input" placeholder="名前" value=${v.name} onInput=${(e) => setV({ ...v, name: e.target.value })} /></div>
      <div class="field"><span class="label">色 <span class="opt">写真のふち・グラフの色</span></span>
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

// ホーム画面のアイコン（この端末だけ）
function HomeIconPicker() {
  const [cur, setCur] = useState(homeIconId());
  const [photo, setPhoto] = useState(cur === 'photo' ? homeIconSrc() : null);
  const ref = useRef(null);
  async function pick(id) {
    if (id === 'photo') { ref.current?.click(); return; }
    await setHomeIcon({ id });
    setCur(id);
    toast('アイコンを変えました');
  }
  const [crop, setCrop] = useState(null);
  function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) setCrop(f);
  }
  async function onCropped(big) {
    try {
      const data = await thumbOf(big, 180);
      await setHomeIcon({ id: 'photo', data });
      setPhoto(data);
      setCur('photo');
      setCrop(null);
      toast('写真をアイコンにしました');
    } catch { toast('その画像は使えませんでした'); setCrop(null); }
  }
  const tiles = [...HOME_ICONS.map((x) => ({ ...x })), { id: 'photo', label: '好きな写真', src: photo }];
  return html`<h2 class="section">ホーム画面のアイコン <span class="aside">この端末だけ</span></h2>
    <div class="card">
      <div class="icon-tiles">
        ${tiles.map((t) => html`<button key=${t.id} class=${'icon-tile' + (cur === t.id ? ' on' : '')} aria-pressed=${cur === t.id} onClick=${() => pick(t.id)}>
          ${t.src ? html`<img src=${t.src} alt="" />` : html`<span class="ph"><${Icon} name="camera" /></span>`}
          <span class="l">${t.label}</span>
        </button>`)}
      </div>
      <input type="file" accept="image/*" hidden ref=${ref} onChange=${onFile} />
      ${crop ? html`<${PhotoCropper} file=${crop} onCancel=${() => setCrop(null)} onDone=${onCropped} />` : null}
      <div class="tiny muted" style=${{ marginTop: '12px', lineHeight: 1.8 }}>
        iPhone：Safariでこのページを開き、共有ボタン <${Icon} name="share" size=${13} /> →「ホーム画面に追加」で、選んだアイコンで置けます。
        もう置いてあるアイコンを変えたいときは、いちど削除してから追加しなおしてください。
      </div>
    </div>`;
}
