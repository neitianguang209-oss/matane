// アイコンの写真：切り抜き（丸に入る所を合わせる）・大きく見る・何枚も登録して入れ替える
import { html, React } from '../lib/html.js';
import { saveItem, getItem } from '../lib/store.js';
import { ROTATE_MODES } from '../lib/photos.js';
import { Icon } from './icons.js';
import { Avatar, Sheet, Seg, toast, confirmDialog, memberColor } from './components.js';

const { useState, useEffect, useRef } = React;
const OUT = 1024;   // 保存する大きさ（画質を落とさない）

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした'));
    img.src = src;
  });
}
function drawSquare(img, sx, sy, size, out, type = 'image/jpeg', q = 0.9) {
  const c = document.createElement('canvas');
  c.width = c.height = out;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.fillStyle = '#fff';
  g.fillRect(0, 0, out, out);
  g.drawImage(img, sx, sy, size, size, 0, 0, out, out);
  return c.toDataURL(type, q);
}
export async function thumbOf(dataUrl, size = 192) {
  const img = await loadImage(dataUrl);
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  return drawSquare(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, size, 'image/jpeg', 0.85);
}

// ---------------------------------------------------------------------
// 切り抜き：ドラッグで動かす・ピンチ／つまみで大きさ・丸の中が使われる
// ---------------------------------------------------------------------
export function PhotoCropper({ file, onDone, onCancel }) {
  const [img, setImg] = useState(null);
  const [z, setZ] = useState(1);            // 拡大（1 = 丸いっぱいに入る大きさ）
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const stage = useRef(null);
  const [S, setS] = useState(300);
  const pts = useRef(new Map());
  const pinch = useRef(null);

  useEffect(() => {
    const url = typeof file === 'string' ? file : URL.createObjectURL(file);
    loadImage(url).then(setImg).catch(() => { toast('その画像は使えませんでした'); onCancel(); });
    const measure = () => setS(Math.round(stage.current?.getBoundingClientRect().width || 300));
    measure();
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('resize', measure); if (typeof file !== 'string') URL.revokeObjectURL(url); };
  }, []);

  const w = img?.naturalWidth ?? 1, h = img?.naturalHeight ?? 1;
  const base = Math.max(S / w, S / h);       // 丸（正方形）をちょうど覆う大きさ
  const k = base * z;
  const clamp = (p, zz = z) => {
    const kk = base * zz;
    const mx = Math.max(0, (w * kk - S) / 2), my = Math.max(0, (h * kk - S) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  };
  const setZoom = (nz, center) => {
    const zz = Math.min(5, Math.max(1, nz));
    // 指の真ん中（無ければ丸の真ん中）を中心に拡大する
    const cx = center?.x ?? 0, cy = center?.y ?? 0;
    const r = zz / z;
    setPos((p) => clamp({ x: cx - (cx - p.x) * r, y: cy - (cy - p.y) * r }, zz));
    setZ(zz);
  };

  function local(e) {
    const r = stage.current.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  }
  function down(e) {
    e.preventDefault();
    stage.current.setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, local(e));
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z };
    }
  }
  function move(e) {
    if (!pts.current.has(e.pointerId)) return;
    const prev = pts.current.get(e.pointerId);
    const cur = local(e);
    pts.current.set(e.pointerId, cur);
    if (pts.current.size >= 2 && pinch.current) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom(pinch.current.z * (d / pinch.current.d), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    } else {
      setPos((p) => clamp({ x: p.x + cur.x - prev.x, y: p.y + cur.y - prev.y }));
    }
  }
  function up(e) {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
  }
  function wheel(e) {
    e.preventDefault();
    setZoom(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), local(e));
  }
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  async function done() {
    if (!img) return;
    setBusy(true);
    try {
      const size = S / k;                               // 元の画像での一辺
      const sx = w / 2 - pos.x / k - size / 2;
      const sy = h / 2 - pos.y / k - size / 2;
      const out = Math.round(Math.min(OUT, Math.max(256, size)));
      const data = drawSquare(img, sx, sy, size, out, 'image/jpeg', 0.9);
      await onDone(data);
    } catch { toast('うまく切り抜けませんでした'); setBusy(false); }
  }

  return html`<div class="cropper" role="dialog" aria-modal="true" aria-label="写真の位置と大きさを合わせる">
    <div class="cropper-in">
      <div class="row between" style=${{ color: '#fff' }}>
        <button class="btn ghost small" style=${{ color: '#fff' }} onClick=${onCancel}>やめる</button>
        <span class="round bold">丸に入る所を合わせる</span>
        <button class="btn accent small" disabled=${!img || busy} onClick=${done}>${busy ? '…' : '決定'}</button>
      </div>
      <div class="crop-stage" ref=${stage} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}>
        ${img ? html`<img src=${img.src} alt="" draggable="false" style=${{
          width: w * k + 'px', height: h * k + 'px',
          transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
        }} />` : html`<div class="crop-loading">読み込み中…</div>`}
        <div class="crop-ring" aria-hidden="true"></div>
      </div>
      <div class="row" style=${{ color: '#fff', gap: '12px', marginTop: '18px' }}>
        <${Icon} name="image" size=${16} />
        <input type="range" min="1" max="5" step="0.01" value=${z} aria-label="大きさ" style=${{ flex: 1, accentColor: 'var(--star)' }}
          onInput=${(e) => setZoom(Number(e.target.value))} />
        <${Icon} name="image" size=${24} />
      </div>
      <div class="tiny" style=${{ color: 'rgba(255,255,255,.7)', textAlign: 'center', marginTop: '10px' }}>
        ドラッグで動かす・2本指かつまみで大きさを変える
      </div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------
// ふたりのアイコンを大きく見る
// ---------------------------------------------------------------------
export function PhotoViewer({ open, onClose, snap, initial, onEdit }) {
  const [who, setWho] = useState(initial ?? snap.me);
  const [sel, setSel] = useState(null);
  useEffect(() => { if (open) { setWho(initial ?? snap.me); setSel(null); } }, [open, initial]);
  if (!open) return null;
  const m = snap.memberById.get(who) ?? snap.members[0];
  const photos = m?._photos ?? [];
  const showing = sel ? photos.find((p) => p.id === sel)?.data : m?._photo;
  const mode = ROTATE_MODES.find((x) => x.id === (m?.photoRotate ?? 'open'));
  return html`<${Sheet} open=${open} onClose=${onClose} title="ふたりのアイコン">
    <div class="viewer-who">
      ${snap.members.map((x) => html`<button key=${x.id} class=${'vw' + (x.id === m?.id ? ' on' : '')} onClick=${() => { setWho(x.id); setSel(null); }}>
        <${Avatar} m=${x} size="lg" /><span>${x.name}${x.id === snap.me ? '（あなた）' : ''}</span>
      </button>`)}
    </div>
    <div class="viewer-big" style=${{ '--c': memberColor(m) }}>
      ${showing ? html`<img src=${showing} alt=${`${m?.name}のアイコン`} />` : html`<${Avatar} m=${m} size="huge" />`}
    </div>
    ${photos.length > 1 ? html`<div class="tiny muted" style=${{ textAlign: 'center', marginTop: '8px' }}>${photos.length}枚を「${mode?.label}」で入れ替え中</div>
      <div class="thumbs">
        ${photos.map((p) => html`<button key=${p.id} class=${'thumb' + ((sel ?? m._photoId) === p.id ? ' on' : '')} onClick=${() => setSel(p.id)} aria-label="この写真を見る">
          <img src=${p.data} alt="" />${m._photoId === p.id ? html`<span class="now">いま</span>` : null}
        </button>`)}
      </div>` : null}
    ${m?.id === snap.me ? html`<button class="btn block" style=${{ marginTop: '14px' }} onClick=${() => { onClose(); onEdit?.(m); }}>
      <${Icon} name="camera" />写真を追加・入れ替えの設定</button>` : null}
  <//>`;
}

// ---------------------------------------------------------------------
// 自分の写真を何枚も登録する
// ---------------------------------------------------------------------
export function PhotoManager({ snap, m }) {
  const [crop, setCrop] = useState(null);   // { file } or { src, replace }
  const fileRef = useRef(null);
  const photos = m._photos ?? [];
  const legacy = !photos.length && m.photo ? m.photo : null;

  async function syncThumb(list) {
    // 前の版のアプリ向けに、いちばん新しい写真の小さい版をメンバー情報にも入れておく
    const cur = getItem(snap.id, m.id);
    const last = list[list.length - 1];
    const photo = last ? await thumbOf(last.data, 192) : null;
    saveItem(snap.id, { ...cur, photo });
  }
  async function addPhoto(data) {
    const order = Math.max(0, ...photos.map((p) => p.order ?? 0)) + 1;
    const saved = saveItem(snap.id, { kind: 'photo', memberId: m.id, data, order });
    await syncThumb([...photos, saved]);
    setCrop(null);
    toast(photos.length ? `写真を追加したよ（${photos.length + 1}枚）` : 'アイコンを写真にしたよ');
  }
  async function replacePhoto(p, data) {
    saveItem(snap.id, { ...getItem(snap.id, p.id), data });
    await syncThumb(photos.map((x) => (x.id === p.id ? { ...x, data } : x)));
    setCrop(null);
    toast('位置を直したよ');
  }
  async function removePhoto(p) {
    if (!(await confirmDialog({ title: 'この写真を外しますか？', ok: '外す', danger: true }))) return;
    saveItem(snap.id, { ...getItem(snap.id, p.id), deleted: true, data: null });   // 大きい写真はクラウドからも消す
    const rest = photos.filter((x) => x.id !== p.id);
    const cur = getItem(snap.id, m.id);
    if (cur.photoFixed === p.id) saveItem(snap.id, { ...cur, photoFixed: null });
    await syncThumb(rest);
  }
  function setMode(mode) {
    const cur = getItem(snap.id, m.id);
    saveItem(snap.id, { ...cur, photoRotate: mode, photoFixed: mode === 'fixed' ? (cur.photoFixed ?? m._photoId ?? photos[0]?.id ?? null) : cur.photoFixed });
  }
  function fix(p) {
    saveItem(snap.id, { ...getItem(snap.id, m.id), photoRotate: 'fixed', photoFixed: p.id });
    toast('この写真に固定したよ');
  }

  return html`<div class="field">
    <span class="label">写真 <span class="opt">何枚でも。入れ替えて表示します</span></span>
    <div class="photo-grid">
      ${photos.map((p) => html`<div key=${p.id} class=${'pg-item' + (m._photoId === p.id ? ' now' : '')}>
        <img src=${p.data} alt="" />
        ${m._photoId === p.id ? html`<span class="now">いま</span>` : null}
        <div class="pg-actions">
          <button aria-label="位置を直す" onClick=${() => setCrop({ src: p.data, replace: p })}><${Icon} name="edit" size=${14} /></button>
          <button aria-label="これに固定" onClick=${() => fix(p)}><${Icon} name="star" size=${14} fill=${m.photoRotate === 'fixed' && m.photoFixed === p.id} /></button>
          <button aria-label="外す" onClick=${() => removePhoto(p)}><${Icon} name="trash" size=${14} /></button>
        </div>
      </div>`)}
      ${legacy ? html`<div class="pg-item legacy"><img src=${legacy} alt="" /><span class="now">前の写真</span></div>` : null}
      <button class="pg-add" onClick=${() => fileRef.current?.click()}><${Icon} name="plus" /><span>写真を追加</span></button>
    </div>
    <input type="file" accept="image/*" hidden ref=${fileRef} onChange=${(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setCrop({ file: f }); }} />
    ${photos.length > 1 ? html`<div style=${{ marginTop: '10px' }}>
      <span class="label">入れ替え</span>
      <div style=${{ marginTop: '6px' }}><${Seg} small=${true} value=${m.photoRotate ?? 'open'} onChange=${setMode} label="入れ替え"
        options=${ROTATE_MODES.map((x) => ({ value: x.id, label: x.label }))} /></div>
      <div class="tiny faint" style=${{ marginTop: '6px' }}>「1時間ごと」「毎日」はふたりの画面で同じ写真になります。☆で1枚に固定。</div>
    </div>` : null}
    ${crop ? html`<${PhotoCropper} file=${crop.file ?? crop.src} onCancel=${() => setCrop(null)}
      onDone=${(data) => (crop.replace ? replacePhoto(crop.replace, data) : addPhoto(data))} />` : null}
  </div>`;
}
