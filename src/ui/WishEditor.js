import { html, React } from '../lib/html.js';
import { back, go } from '../lib/router.js';
import { saveItem, deleteItem } from '../lib/store.js';
import { SEASONS, todayStr, addDays, seasonOfDate } from '../lib/dates.js';
import { guessEmoji, EMOJI_CHOICES } from '../lib/emoji.js';
import { useRoom } from './hooks.js';
import { Icon } from './icons.js';
import { Seg, Sheet, TopBar, toast, confirmDialog } from './components.js';

const { useState, useMemo } = React;

export function WishEditor({ roomId, id, query }) {
  const { snap } = useRoom(roomId);
  const orig = id ? snap.wishById.get(id) : null;
  const [w, setW] = useState(() => orig ? { ...orig } : {
    type: query?.type === 'do' ? 'do' : 'go',
    title: query?.title ?? '',
    area: '', url: '', memo: '', seasons: [], until: '', emoji: '',
  });
  const [emojiOpen, setEmojiOpen] = useState(false);
  const set = (patch) => setW((cur) => ({ ...cur, ...patch }));
  const autoEmoji = useMemo(() => guessEmoji(w.title, w.type), [w.title, w.type]);
  const emoji = w.emoji || autoEmoji;
  const ok = w.title.trim().length > 0;
  const urlOk = !w.url || /^https?:\/\//i.test(w.url.trim());

  if (id && !orig) {
    return html`<div class="page no-nav"><${TopBar} title="いつか" onBack=${() => back(`/r/${roomId}/wish`)} />
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
      if (m) set({ url: m[0] });
      else toast('リンクが見つかりませんでした');
    } catch { toast('貼り付けできませんでした。長押しで貼り付けてください'); }
  }
  function save() {
    if (!ok || !urlOk) return;
    const saved = saveItem(roomId, {
      ...(orig ?? {}),
      kind: 'wish',
      type: w.type,
      title: w.title.trim(),
      area: w.area?.trim() || null,
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
    <${TopBar} title=${orig ? '編集' : 'いつかを追加'} onBack=${() => back(`/r/${roomId}/wish`)} />
    <div class="stack" style=${{ gap: '18px' }}>
      <${Seg} big=${true} value=${w.type} onChange=${(v) => set({ type: v })} label="種類"
        options=${[{ value: 'go', label: '📍 行きたいところ' }, { value: 'do', label: '✨ やりたいこと' }]} />

      <div class="row" style=${{ alignItems: 'stretch' }}>
        <button class="emoji-btn" type="button" aria-label="絵文字を選ぶ" onClick=${() => setEmojiOpen(true)}>${emoji}</button>
        <input class="input title-input grow" autoFocus=${!orig} value=${w.title} aria-label="タイトル"
          placeholder=${w.type === 'go' ? '例）鎌倉のしらす丼のお店' : '例）ボウリングで100点こえる'}
          onInput=${(e) => set({ title: e.target.value })} />
      </div>

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
        <label for="area">場所・エリア <span class="opt">任意</span></label>
        <input id="area" class="input" value=${w.area ?? ''} placeholder="例）鎌倉、下北沢のあたり" onInput=${(e) => set({ area: e.target.value })} />
      </div>

      <div class="field">
        <label for="url">リンク <span class="opt">お店のページ・インスタ・Googleマップなど</span></label>
        <div class="row">
          <input id="url" class="input grow" type="url" inputmode="url" value=${w.url ?? ''} placeholder="https://…" onInput=${(e) => set({ url: e.target.value })} />
          <button class="btn soft small" type="button" onClick=${pasteUrl}><${Icon} name="copy" />貼る</button>
        </div>
        ${!urlOk ? html`<div class="tiny" style=${{ color: 'var(--danger)' }}>https:// から始まるリンクを入れてください</div>` : null}
      </div>

      <div class="field">
        <label for="memo">メモ <span class="opt">任意</span></label>
        <textarea id="memo" class="input" rows="3" value=${w.memo ?? ''} placeholder="予約が必要、平日がすいてる、など" onInput=${(e) => set({ memo: e.target.value })}></textarea>
      </div>

      ${orig ? html`<button class="btn ghost danger block" onClick=${remove}><${Icon} name="trash" />このいつかを消す</button>` : null}
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

function endOfMonth(s) {
  const [y, m] = s.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${y}-${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

