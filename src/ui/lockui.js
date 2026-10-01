// 「自分だけ」の鍵まわりの画面部品
import { html, React } from '../lib/html.js';
import { saveItem, getItem } from '../lib/store.js';
import { getKey, loadKey, onKeyChange, setupLock, unlock, plainOf, openItem } from '../lib/lock.js';
import { Icon } from './icons.js';
import { Sheet, toast } from './components.js';

const { useState, useEffect, useReducer } = React;

// 鍵の状態（合言葉を決めてあるか・この端末で開けるか）
export function useLock(snap) {
  const [, force] = useReducer((x) => x + 1, 0);
  const me = snap.memberById.get(snap.me);
  useEffect(() => {
    const off = onKeyChange(force);
    if (snap.me) loadKey(snap.id, snap.me).then(() => force());
    return off;
  }, [snap.id, snap.me]);
  return { hasLock: !!me?.lockSalt, ready: !!getKey(snap.id, snap.me) };
}

// 鍵のかかった行を開いて返す（開けないときは null）
export function usePlain(snap, item) {
  const [, force] = useReducer((x) => x + 1, 0);
  const plain = plainOf(item);
  useEffect(() => {
    if (!item?.private || plain) return;
    let alive = true;
    openItem(snap.id, item).then((x) => { if (alive && x) force(); });
    const off = onKeyChange(() => openItem(snap.id, item).then((x) => { if (alive && x) force(); }));
    return () => { alive = false; off(); };
  }, [item?.id, item?.updatedAt]);
  return plain;
}

// 合言葉を決める／入れる
export function LockSheet({ open, onClose, snap, onReady }) {
  const me = snap.memberById.get(snap.me);
  const setupMode = !me?.lockSalt;
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setA(''); setB(''); setErr(''); setBusy(false); } }, [open]);
  if (!open) return null;

  async function submit() {
    setErr('');
    if (setupMode) {
      if (a.trim().length < 4) { setErr('4文字以上にしてください'); return; }
      if (a !== b) { setErr('2回目がちがいます'); return; }
      setBusy(true);
      try {
        const res = await setupLock(snap.id, snap.me, a);
        saveItem(snap.id, { ...getItem(snap.id, snap.me), ...res });
        toast('合言葉を決めたよ 🔒');
        onReady?.();
        onClose();
      } catch { setErr('うまくいきませんでした'); setBusy(false); }
    } else {
      setBusy(true);
      const ok = await unlock(snap.id, me, a);
      setBusy(false);
      if (!ok) { setErr('合言葉がちがうようです'); return; }
      toast('この端末でも開けるようになったよ 🔓');
      onReady?.();
      onClose();
    }
  }

  return html`<${Sheet} open=${open} onClose=${onClose} title=${setupMode ? '自分だけの合言葉を決める' : '合言葉を入れる'}>
    <div class="stack">
      <div class="note small" style=${{ lineHeight: 1.7 }}>
        <${Icon} name="lock" size=${18} />
        <div class="grow">${setupMode
          ? html`鍵をかけたメモは、この端末の中で暗号にしてから保存します。相手にもクラウドにも読めません。<br /><b>合言葉を忘れると、だれにも開けなくなります。</b>覚えやすい言葉にしてね。`
          : html`鍵のかかった自分のメモを、この端末でも読めるようにします。前に決めた合言葉を入れてください。`}</div>
      </div>
      <input class="input" type="password" autoComplete="off" value=${a} placeholder="合言葉" aria-label="合言葉" autoFocus
        onInput=${(e) => setA(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && !setupMode) submit(); }} />
      ${setupMode ? html`<input class="input" type="password" autoComplete="off" value=${b} placeholder="もう一度" aria-label="合言葉（もう一度）"
        onInput=${(e) => setB(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter') submit(); }} />` : null}
      ${err ? html`<div class="small" style=${{ color: 'var(--danger)' }}>${err}</div>` : null}
      <button class="btn primary block" disabled=${busy || !a} onClick=${submit}>${busy ? '鍵を作っています…' : setupMode ? '決める' : '開く'}</button>
    </div>
  <//>`;
}

// 「🔒 自分だけ」の切り替え（鍵が無ければ合言葉を決める画面へ）
export function LockToggle({ snap, on, onChange, compact = false }) {
  const { ready } = useLock(snap);
  const [sheet, setSheet] = useState(false);
  function click() {
    if (!on && !ready) { setSheet(true); return; }
    onChange(!on);
  }
  return html`<span>
    <button type="button" class=${'lock-toggle' + (on ? ' on' : '') + (compact ? ' compact' : '')} aria-pressed=${!!on} onClick=${click}
      title=${on ? '自分だけ（相手には見えません）' : 'ふたりで見る'}>
      <${Icon} name=${on ? 'lock' : 'unlock'} size=${15} />${on ? '自分だけ' : compact ? 'ふたりで' : 'ふたりで見る'}
    </button>
    <${LockSheet} open=${sheet} onClose=${() => setSheet(false)} snap=${snap} onReady=${() => onChange(true)} />
  </span>`;
}
