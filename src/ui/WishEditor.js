import { html, React } from '../lib/html.js';
import { back, go } from '../lib/router.js';
import { saveItem, deleteItem } from '../lib/store.js';
import { SEASONS, todayStr, addDays, seasonOfDate } from '../lib/dates.js';
import { guessEmoji, EMOJI_CHOICES } from '../lib/emoji.js';
import { suggestPlaces, mapUrlFor, biasFrom, isMapsLink, resolveMapsLink, mapsSearchUrl } from '../lib/places.js';
import { useRoom } from './hooks.js';
import { Icon } from './icons.js';
import { Seg, Sheet, TopBar, toast, confirmDialog } from './components.js';
import { fold } from './WishTab.js';
import { wishEmoji } from './rows.js';

const { useState, useMemo, useEffect, useRef } = React;

export function WishEditor({ roomId, id, query }) {
  const { snap } = useRoom(roomId);
  const orig = id ? snap.wishById.get(id) : null;
  const [w, setW] = useState(() => orig ? { ...orig } : {
    type: query?.type === 'do' ? 'do' : 'go',
    title: query?.title ?? '',
    area: '', place: null, url: '', memo: '', seasons: [], until: '', emoji: '',
  });
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const resolved = useRef(orig?.place?.gmaps ?? null);
  const set = (patch) => setW((cur) => ({ ...cur, ...patch }));

  // Googleマップのリンクから場所を入れる（貼る・打つ・「リンクを貼る」ボタン）
  async function fromMapsLink(text) {
    const link = isMapsLink(text);
    if (!link || resolved.current === link) return false;
    resolved.current = link;
    setLinkBusy(true);
    try {
      const p = await resolveMapsLink(roomId, link);
      if (!p) { toast('リンクから場所を読み取れませんでした'); return true; }
      setW((cur) => ({
        ...cur,
        place: p,
        area: [p.name, p.where].filter(Boolean).join('（') + (p.where ? '）' : ''),
        url: cur.url?.trim() ? cur.url : link,
        title: cur.title?.trim() ? cur.title : p.name,
      }));
      toast(`📍「${p.name}」を場所に入れたよ`);
    } catch { toast('リンクを開けませんでした。電波を確かめてください'); resolved.current = null; }
    finally { setLinkBusy(false); }
    return true;
  }
  const autoEmoji = useMemo(() => guessEmoji(w.title, w.type), [w.title, w.type]);
  const emoji = w.emoji || autoEmoji;
  const ok = w.title.trim().length > 0;
  const urlOk = !w.url || /^https?:\/\//i.test(w.url.trim());
  // もう同じようなものが入っていないか（ふたりで同じものを足さないように）
  const similar = useMemo(() => {
    const t = fold(w.title);
    if (t.length < 3) return null;
    return snap.wishes.find((x) => x.id !== orig?.id && (() => { const f = fold(x.title); return f === t || (f.length >= 3 && (f.includes(t) || t.includes(f))); })()) ?? null;
  }, [w.title, snap.wishes]);

  if (id && !orig) {
    return html`<div class="page no-nav"><${TopBar} title="やりたいこと" onBack=${() => back(`/r/${roomId}/wish`)} />
      <div class="empty"><div class="e">🫥</div><div class="t">見つかりませんでした</div></div></div>`;
  }

  function toggleSeason(s) {
    const cur = w.seasons ?? [];
    set({ seasons: cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s] });
  }
  async function pasteUrl() {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      const m = t.match(/https?:\/\/\S+/);
      if (m) { set({ url: m[0] }); fromMapsLink(m[0]); }
      else toast('リンクが見つかりませんでした');
    } catch { toast('貼り付けできませんでした。長押しで貼り付けてください'); }
  }
  // 場所の欄の「Googleマップのリンクを貼る」
  async function pasteMaps() {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (!isMapsLink(t)) { toast('コピーしたものがGoogleマップのリンクではないようです'); return; }
      resolved.current = null;
      await fromMapsLink(t);
    } catch { toast('貼り付けできませんでした。下の「リンク」欄に長押しで貼ってください'); }
  }
  function save() {
    if (!ok || !urlOk) return;
    const saved = saveItem(roomId, {
      ...(orig ?? {}),
      kind: 'wish',
      type: w.type,
      title: w.title.trim(),
      area: w.area?.trim() || null,
      place: w.place ?? null,
      url: w.url?.trim() || null,
      memo: w.memo?.trim() || null,
      seasons: SEASONS.map((s) => s.id).filter((s) => (w.seasons ?? []).includes(s)),
      until: w.until || null,
      emoji: w.emoji || null,
    });
    if (orig) { toast('保存したよ'); back(`/r/${roomId}/w/${saved.id}`); }
    else {
      toast(`「${saved.title}」を追加したよ`, { action: '見る', onAction: () => go(`/r/${roomId}/w/${saved.id}`) });
      back(`/r/${roomId}/wish`);
    }
  }
  async function remove() {
    if (!(await confirmDialog({ title: `「${orig.title}」を消しますか？`, ok: '消す', danger: true }))) return;
    const undo = deleteItem(roomId, orig.id);
    toast('消しました', { action: '元に戻す', onAction: undo });
    go(`/r/${roomId}/wish`, { replace: true });
  }

  const today = todayStr();
  const cur = seasonOfDate(today);
  return html`<div class="page no-nav">
    <${TopBar} title=${orig ? '編集' : '行きたい・やりたいを追加'} onBack=${() => back(`/r/${roomId}/wish`)} />
    <div class="stack" style=${{ gap: '18px' }}>
      <${Seg} big=${true} value=${w.type} onChange=${(v) => set({ type: v })} label="種類"
        options=${[{ value: 'go', label: '📍 行きたいところ' }, { value: 'do', label: '✨ やりたいこと' }]} />

      <div class="stack tight">
        <div class="row" style=${{ alignItems: 'stretch' }}>
          <button class="emoji-btn" type="button" aria-label="絵文字を選ぶ" onClick=${() => setEmojiOpen(true)}>${emoji}</button>
          <input class="input title-input grow" autoFocus=${!orig} value=${w.title} aria-label="タイトル"
            placeholder=${w.type === 'go' ? '例）高尾山、鎌倉のしらす丼' : '例）ボウリングで100点こえる'}
            onInput=${(e) => set({ title: e.target.value })} />
        </div>
        ${similar ? html`<div class="note accent" style=${{ fontSize: '12.5px' }}>
          <${Icon} name="info" size=${18} />
          <div class="grow">似たものがもうあります：<b>${wishEmoji(similar)} ${similar.title}</b>（${snap.memberById.get(similar.createdBy)?.name ?? ''}が追加）<br />
            ${similar.createdBy !== snap.me ? '同じ気持ちなら、そちらに ☆ を押すと「ふたりとも」になります。' : ''}
            <button class="link-btn" onClick=${() => go(`/r/${roomId}/w/${similar.id}`)}>そちらを見る</button></div>
        </div>` : null}
      </div>

      <${PlaceField} w=${w} set=${set} bias=${biasFrom(snap.wishes)} linkBusy=${linkBusy} onPasteMaps=${pasteMaps} />

      <div class="field">
        <span class="label">いつやりたい？ <span class="opt">選ばなければ「いつでも」</span></span>
        <div class="season-chips">
          ${SEASONS.map((s) => {
            const on = (w.seasons ?? []).includes(s.id);
            return html`<button type="button" key=${s.id} class=${'season-btn' + (on ? ' on' : '')} aria-pressed=${on}
              style=${{ '--c': `var(--${s.id})`, '--cs': `var(--${s.id}-soft)` }} onClick=${() => toggleSeason(s.id)}>
              <span class="e">${s.emoji}</span>${s.label}${s.id === cur ? html`<span class="tiny" style=${{ fontWeight: 600, marginTop: '-2px' }}>いま</span>` : null}
            </button>`;
          })}
        </div>
      </div>

      <div class="field">
        <label for="until">期限 <span class="opt">期間限定のイベント・「〜までに」など</span></label>
        <div class="row">
          <input id="until" type="date" class="input grow" value=${w.until ?? ''} min=${today} onInput=${(e) => set({ until: e.target.value })} />
          ${w.until ? html`<button class="btn soft small" type="button" onClick=${() => set({ until: '' })}>なし</button>` : null}
        </div>
        ${!w.until ? html`<div class="chips" style=${{ marginTop: '2px' }}>
          ${[['今月中', endOfMonth(today)], ['1か月以内', addDays(today, 30)], ['年内', today.slice(0, 4) + '-12-31']].map(([l, d]) => html`
            <button key=${l} type="button" class="chip" style=${{ minHeight: '32px', fontSize: '13px' }} onClick=${() => set({ until: d })}>${l}</button>`)}
        </div>` : null}
      </div>

      <div class="field">
        <label for="url">リンク <span class="opt">お店のページ・インスタ・Googleマップなど</span></label>
        <div class="row">
          <input id="url" class="input grow" type="url" inputmode="url" value=${w.url ?? ''} placeholder="https://…" onInput=${(e) => { set({ url: e.target.value }); fromMapsLink(e.target.value); }} />
          <button class="btn soft small" type="button" onClick=${pasteUrl}><${Icon} name="copy" />貼る</button>
        </div>
        ${!urlOk ? html`<div class="tiny" style=${{ color: 'var(--danger)' }}>https:// から始まるリンクを入れてください</div>` : null}
        ${linkBusy ? html`<div class="tiny muted">📍 Googleマップのリンクから場所を読み取っています…</div>` : null}
      </div>

      <div class="field">
        <label for="memo">メモ <span class="opt">任意</span></label>
        <textarea id="memo" class="input" rows="3" value=${w.memo ?? ''} placeholder="予約が必要、平日がすいてる、など" onInput=${(e) => set({ memo: e.target.value })}></textarea>
      </div>

      ${orig ? html`<button class="btn ghost danger block" onClick=${remove}><${Icon} name="trash" />これを消す</button>` : null}
    </div>

    <div class="bottom-bar"><div class="inner">
      <button class="btn primary block" disabled=${!ok || !urlOk} onClick=${save}>${orig ? '保存' : '追加する'}</button>
    </div></div>

    <${Sheet} open=${emojiOpen} onClose=${() => setEmojiOpen(false)} title="絵文字をえらぶ">
      <div class="emoji-grid">
        ${EMOJI_CHOICES.map((e) => html`<button key=${e} type="button" class=${emoji === e ? 'on' : ''} aria-pressed=${emoji === e}
          onClick=${() => { set({ emoji: e === autoEmoji ? '' : e }); setEmojiOpen(false); }}>${e}</button>`)}
      </div>
      <button class="btn ghost block small" style=${{ marginTop: '12px' }} onClick=${() => { set({ emoji: '' }); setEmojiOpen(false); }}>タイトルから自動で決める（${autoEmoji}）</button>
    <//>
  </div>`;
}

// ---------------------------------------------------------------------
// 場所：タイトル（か、ここに打った言葉）から候補を出して、タップで決める
// ---------------------------------------------------------------------
function PlaceField({ w, set, bias, linkBusy, onPasteMaps }) {
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);   // 場所の欄に自分で打っている
  const ctrl = useRef(null);
  const source = (typing ? w.area : w.title)?.trim() ?? '';

  useEffect(() => {
    if (w.place || source.length < 2) { setList([]); setBusy(false); return; }
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      setBusy(true);
      try {
        const res = await suggestPlaces(source, c.signal, bias);
        if (!c.signal.aborted) setList(res);
      } catch { if (!c.signal.aborted) setList([]); }
      finally { if (!c.signal.aborted) setBusy(false); }
    }, 700);
    return () => { clearTimeout(t); ctrl.current?.abort(); };
  }, [source, !!w.place]);

  if (w.place) {
    return html`<div class="field">
      <span class="label">場所</span>
      <div class="place-card">
        <span class="pin"><${Icon} name="mapPin" size=${20} /></span>
        <div class="grow">
          <div class="bold">${w.place.name}</div>
          <div class="tiny muted">${[w.place.kind, w.place.where].filter(Boolean).join('・')}</div>
        </div>
        <a class="icon-btn" href=${mapUrlFor(w)} target="_blank" rel="noopener noreferrer" aria-label="地図で見る"><${Icon} name="external" size=${18} /></a>
        <button class="icon-btn" type="button" aria-label="場所を外す" onClick=${() => { set({ place: null, area: '' }); setTyping(false); }}><${Icon} name="close" size=${18} /></button>
      </div>
    </div>`;
  }
  return html`<div class="field">
    <label for="area">場所 <span class="opt">任意・候補をタップで決まります</span></label>
    <div class="input-wrap">
      <${Icon} name="search" />
      <input id="area" class="input" value=${w.area ?? ''} placeholder="お店・駅・地名でさがす（例：鎌倉）"
        onInput=${(e) => { set({ area: e.target.value }); setTyping(!!e.target.value.trim()); }} />
    </div>
    ${busy || list.length ? html`<div class="place-sugs" aria-live="polite">
      <span class="tiny faint" style=${{ width: '100%' }}>${busy && !list.length ? '場所をさがしています…' : `「${source}」の場所の候補`}</span>
      ${list.map((p, i) => html`<button key=${i} type="button" class="place-sug" onClick=${() => set({ place: { name: p.name, where: p.where, kind: p.kind, lat: p.lat, lon: p.lon }, area: [p.name, p.where].filter(Boolean).join('（') + (p.where ? '）' : '') })}>
        <${Icon} name="mapPin" size=${14} /><span class="n">${p.name}</span>${p.where || p.kind ? html`<span class="w">${[p.kind, p.where].filter(Boolean).join('・')}</span>` : null}
      </button>`)}
    </div>` : null}
    <div class="row" style=${{ marginTop: '6px', gap: '8px' }}>
      <a class="btn soft small grow" href=${mapsSearchUrl([w.title, w.area].filter(Boolean).join(' ') || '')} target="_blank" rel="noopener noreferrer">
        <${Icon} name="mapPin" />Googleマップで探す</a>
      <button class="btn soft small grow" type="button" disabled=${linkBusy} onClick=${onPasteMaps}><${Icon} name="copy" />${linkBusy ? '読み取り中…' : 'リンクを貼る'}</button>
    </div>
    <div class="tiny faint" style=${{ lineHeight: 1.6 }}>候補に無いお店は、Googleマップで探して「共有 → リンクをコピー」してから「リンクを貼る」を押すと、そのまま入ります。</div>
  </div>`;
}

function endOfMonth(s) {
  const [y, m] = s.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${y}-${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

