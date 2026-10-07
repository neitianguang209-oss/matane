// 部屋の切りかえ・新しい部屋をつくる権利（お願い／オーナーの承認）
import { html, React } from '../lib/html.js';
import { go, back } from '../lib/router.js';
import { listRooms } from '../lib/store.js';
import { usePass, checkPass, requestPass, claimOwner, listPasses, decidePass, canCreate } from '../lib/pass.js';
import { useOnline } from './hooks.js';
import { Icon } from './icons.js';
import { Sheet, toast, TopBar, AvatarStack, confirmDialog, celebrate } from './components.js';
import { JoinSheet, Sky } from './Welcome.js';

const { useState, useEffect } = React;

const roomName = (s) => s.members.map((m) => (m.placeholder ? '？' : m.name)).join(' と ');
// どこから来た人か（オーナーの承認画面に出す）
function viaText() {
  const s = listRooms()[0];
  return s ? `${roomName(s)} の部屋から` : null;
}
function myName() {
  const s = listRooms()[0];
  return s?.memberById.get(s.me)?.name ?? '';
}

// ---------------------------------------------------------------------
// 部屋の一覧（ホームの「またね」・設定から）
// ---------------------------------------------------------------------
export function RoomsSheet({ open, onClose, current }) {
  const [joinOpen, setJoinOpen] = useState(false);
  const pass = usePass();
  const rooms = listRooms();
  useEffect(() => { if (open) checkPass(); }, [open]);
  const ownerName = pass.owner ? `${pass.owner}` : 'オーナー';
  return html`<${Sheet} open=${open} onClose=${onClose} title="部屋">
    <div class="list">
      ${rooms.map((s) => html`<button key=${s.id} class="list-item" onClick=${() => { onClose(); if (s.id !== current) go('/r/' + s.id); }}>
        <${AvatarStack} members=${s.members} size="lg" />
        <div class="grow"><div class="bold">${roomName(s)}</div>
          <div class="tiny muted">${s.id === current ? 'いま開いている部屋' : `やりたいこと ${s.wishes.length}・会う日 ${s.plans.length}`}</div></div>
        ${s.id === current ? html`<span class="badge accent">いま</span>` : html`<${Icon} name="chevronRight" size=${18} />`}
      </button>`)}
    </div>
    <div class="stack" style=${{ marginTop: '14px' }}>
      <button class="btn accent block" onClick=${() => { onClose(); go('/new'); }}><${Icon} name="plus" />ほかの友だちと新しい部屋をつくる</button>
      ${pass.checked && !canCreate(pass) ? html`<div class="tiny muted" style=${{ textAlign: 'center' }}>
        ${pass.status === 'wait' ? `${ownerName}の承認を待っています` : `新しい部屋は、${ownerName}の承認があるとつくれます`}</div>` : null}
      <button class="btn block" onClick=${() => setJoinOpen(true)}><${Icon} name="link" />招待リンクで入る</button>
    </div>
    <${JoinSheet} open=${joinOpen} onClose=${() => { setJoinOpen(false); onClose(); }} />
  <//>`;
}

// ---------------------------------------------------------------------
// #/new の前に：つくれる人か確かめる。まだなら、オーナーにお願いを送る
// ---------------------------------------------------------------------
export function CreateGate({ children }) {
  const pass = usePass();
  const online = useOnline();
  const [name, setName] = useState(myName());
  const [busy, setBusy] = useState(false);
  useEffect(() => { checkPass(); }, [online]);

  if (canCreate(pass)) return children;
  const owner = pass.owner ?? 'オーナー';
  const frame = (body) => html`<div class="page no-nav">
    <${TopBar} title="新しい部屋をつくる" onBack=${() => back('/')} />
    ${body}
  </div>`;

  if (!pass.checked) return frame(html`<div class="empty"><div class="e">⏳</div><div class="t">確かめています…</div></div>`);
  if (pass.error) return frame(html`<div class="empty">
    <div class="e">📡</div><div class="t">${pass.error === 'network' ? 'オフラインです' : 'うまく確かめられませんでした'}</div>
    <div class="small" style=${{ marginTop: '6px' }}>新しい部屋をつくるときだけ、ネットにつながっている必要があります。</div>
    <button class="btn" style=${{ marginTop: '16px' }} onClick=${() => checkPass()}><${Icon} name="refresh" />もう一度</button>
  </div>`);

  if (pass.status === 'wait') return frame(html`<div class="empty">
    <div class="e">💌</div><div class="t">${owner}の承認を待っています</div>
    <div class="small" style=${{ marginTop: '6px', lineHeight: 1.8 }}>承認されたら、ここから新しい部屋をつくれます。<br />今ある部屋は、これまでどおり使えます。</div>
    <button class="btn" style=${{ marginTop: '16px' }} onClick=${() => checkPass()}><${Icon} name="refresh" />確かめる</button>
  </div>`);

  async function send() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await requestPass(name.trim(), viaText());
      toast(`${owner}にお願いを送りました`);
    } catch (err) {
      toast(err.kind === 'network' ? 'オフラインです' : '送れませんでした。少ししてからもう一度');
    } finally { setBusy(false); }
  }
  return frame(html`
    <div class="card" style=${{ marginTop: '8px', lineHeight: 1.8 }}>
      <div style=${{ fontSize: '30px', textAlign: 'center' }}>🔑</div>
      <div class="bold" style=${{ textAlign: 'center', margin: '4px 0 8px' }}>新しい部屋は、${owner}の承認がいります</div>
      <div class="small muted">
        ${pass.status === 'no' ? '前のお願いは見送りになりました。もう一度送ることもできます。' : `「またね」は${owner}がつくったアプリです。ほかの友だちとの部屋をつくりたいときは、${owner}にお願いを送ってください。承認されたら、すぐつくれます。`}
      </div>
      <div class="field" style=${{ marginTop: '14px' }}><label for="reqname">あなたの名前</label>
        <input id="reqname" class="input" placeholder="例）あこ" value=${name} onInput=${(e) => setName(e.target.value)}
          onKeyDown=${(e) => e.key === 'Enter' && send()} /></div>
    </div>
    <p class="tiny faint" style=${{ margin: '12px 6px', lineHeight: 1.7 }}>今ある部屋と、招待リンクで入る部屋は、承認なしでこれまでどおり使えます。</p>
    <div class="bottom-bar"><div class="inner">
      <button class="btn accent block" disabled=${!name.trim() || busy} onClick=${send}><${Icon} name="chat" />${busy ? '送っています…' : `${owner}にお願いを送る`}</button>
    </div></div>`);
}

// ---------------------------------------------------------------------
// #/owner/<合言葉>：この端末をオーナーにする（リンクはすぐURLから消す）
// ---------------------------------------------------------------------
export function OwnerClaim({ code }) {
  const [state, setState] = useState('busy');
  useEffect(() => {
    history.replaceState(null, '', '#/');
    claimOwner(code).then(() => { setState('ok'); celebrate(); }).catch(() => setState('ng'));
  }, []);
  return html`<div class="welcome"><${Sky}>
    <h1 style=${{ fontSize: '24px' }}>${state === 'ok' ? 'オーナーになりました' : state === 'ng' ? 'うまくいきませんでした' : '確かめています…'}</h1>
    <div class="lead">${state === 'ok' ? 'この端末で、部屋をつくれる人を決められます。' : state === 'ng' ? 'リンクが違うか、オフラインかもしれません。' : ''}</div>
  <//>
  <div class="body"><div class="stack" style=${{ marginTop: 'auto' }}>
    ${state === 'ok' ? html`<button class="btn accent block" onClick=${() => go('/passes', { replace: true })}>部屋をつくれる人を見る</button>` : null}
    <button class="btn block" onClick=${() => go('/', { replace: true })}>はじめの画面へ</button>
  </div></div></div>`;
}

// ---------------------------------------------------------------------
// #/passes：部屋をつくれる人（オーナーだけ）
// ---------------------------------------------------------------------
const STATUS = { wait: '承認待ち', ok: 'つくれる', no: '見送り', owner: 'オーナー', none: '' };
export function PassesPage() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  async function load() {
    try { setList(await listPasses()); setErr(null); } catch (e) { setErr(e.kind === 'network' ? 'オフラインです' : '見られませんでした（オーナーの端末だけで開けます）'); }
  }
  useEffect(() => { load(); }, []);
  async function decide(p, status) {
    if (status !== 'ok' && p.status === 'ok' && !(await confirmDialog({
      title: `${p.name ?? 'この人'}の権利を取り消しますか？`, body: 'これから新しい部屋はつくれなくなります。今ある部屋はそのまま使えます。', ok: '取り消す', danger: true,
    }))) return;
    try {
      await decidePass(p.id, status);
      toast(status === 'ok' ? `${p.name ?? ''}が部屋をつくれるようにしました` : status === 'no' ? '見送りにしました' : '取り消しました');
      load();
    } catch { toast('うまくいきませんでした'); }
  }
  const shown = (list ?? []).filter((p) => p.status !== 'none' && p.status !== 'owner');
  const groups = [['wait', '承認待ち'], ['ok', '部屋をつくれる人'], ['no', '見送った人']];
  const when = (s) => (s ? new Date(s).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '');

  return html`<div class="page no-nav">
    <${TopBar} title="部屋をつくれる人" onBack=${() => back('/')} />
    <p class="small muted" style=${{ margin: '6px 6px 4px', lineHeight: 1.8 }}>
      ここで認めた人は、ほかの友だちとの部屋を自分でつくって招待できます。その友だちが新しく部屋をつくるときは、またここに届きます。
    </p>
    ${err ? html`<div class="empty"><div class="e">🔒</div><div class="t">${err}</div></div>`
      : !list ? html`<div class="empty"><div class="e">⏳</div><div class="t">読み込んでいます…</div></div>`
      : !shown.length ? html`<div class="empty"><div class="e">🌙</div><div class="t">まだだれもいません</div>
          <div class="small" style=${{ marginTop: '6px' }}>部屋の設定で、相手を「部屋をつくれる人」にもできます。</div></div>`
      : groups.map(([k, label]) => {
        const xs = shown.filter((p) => p.status === k);
        if (!xs.length) return null;
        return html`<div key=${k}>
          <h2 class="section">${label} <span class="aside">${xs.length}人</span></h2>
          <div class="list">${xs.map((p) => html`<div key=${p.id} class="list-item">
            <span style=${{ fontSize: '22px' }}>${k === 'wait' ? '💌' : k === 'ok' ? '🔑' : '🌙'}</span>
            <div class="grow"><div class="bold">${p.name || '（名前なし）'}</div>
              <div class="tiny muted">${[p.via, k === 'wait' ? `${when(p.requestedAt)}にお願い` : `${when(p.decidedAt)}に${STATUS[k]}`].filter(Boolean).join('・')}</div></div>
            ${k === 'wait' ? html`<button class="btn small" onClick=${() => decide(p, 'no')}>見送る</button>
              <button class="btn accent small" onClick=${() => decide(p, 'ok')}>承認</button>`
              : k === 'ok' ? html`<button class="btn small" onClick=${() => decide(p, 'none')}>取り消す</button>`
              : html`<button class="btn small" onClick=${() => decide(p, 'ok')}>承認</button>`}
          </div>`)}</div>
        </div>`;
      })}
  </div>`;
}
