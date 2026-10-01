import { html, React } from '../lib/html.js';
import { useRoute, go } from '../lib/router.js';
import { listRooms, onNews, getRoom } from '../lib/store.js';
import { ToastHost, DialogHost, toast } from './components.js';
import { Welcome, CreateRoom } from './Welcome.js';
import { RoomGate } from './RoomGate.js';
import { Room } from './Room.js';
import { WishPage } from './WishPage.js';
import { WishEditor } from './WishEditor.js';
import { PlanPage } from './PlanPage.js';
import { PlanEditor } from './PlanEditor.js';
import { BookPage } from './BookPage.js';
import { Settings } from './Settings.js';

const scrollMemory = new Map();

// 相手が足したものを知らせる
function useNewsToasts() {
  React.useEffect(() => onNews((roomId, items) => {
    const snap = getRoom(roomId);
    const first = items[0];
    const who = snap?.memberById.get(first.createdBy)?.name ?? '相手';
    const what = {
      wish: () => `「${first.title}」をいつかリストに追加したよ`,
      plan: () => '会う日を追加したよ',
      book: () => `読書会の本『${first.title}』を追加したよ`,
    }[first.kind];
    if (!what) return;
    const more = items.filter((x) => ['wish', 'plan', 'book'].includes(x.kind)).length - 1;
    const base = first.kind === 'wish' ? `/r/${roomId}/w/${first.id}` : first.kind === 'plan' ? `/r/${roomId}/p/${first.id}` : `/r/${roomId}/b/${first.id}`;
    toast(`${who}が${what()}${more > 0 ? `（ほか${more}件）` : ''}`, { action: '見る', onAction: () => go(base), duration: 6000 });
  }), []);
}

export function App() {
  const route = useRoute();
  const key = location.hash;
  useNewsToasts();

  // 一覧 → 詳細 → 一覧 と戻ったとき、元のスクロール位置に戻す
  const prevKey = React.useRef(key);
  React.useLayoutEffect(() => {
    if (prevKey.current !== key) {
      scrollMemory.set(prevKey.current, window.scrollY);
      prevKey.current = key;
      window.scrollTo(0, scrollMemory.get(key) ?? 0);
    }
  }, [key]);

  // 最後にひらいた部屋へ
  const rooms = listRooms();
  React.useEffect(() => {
    if (route.name === 'root' && rooms.length) go('/r/' + rooms[0].id, { replace: true });
  }, [route.name, rooms.length]);

  let page;
  const r = route;
  switch (r.name) {
    case 'create': page = html`<${CreateRoom} />`; break;
    case 'room': page = html`<${Room} roomId=${r.roomId} tab=${r.tab} query=${r.query} />`; break;
    case 'wish': page = html`<${WishPage} roomId=${r.roomId} id=${r.id} />`; break;
    case 'wishEdit': page = html`<${WishEditor} key=${r.id ?? 'new'} roomId=${r.roomId} id=${r.id} query=${r.query} />`; break;
    case 'plan': page = html`<${PlanPage} roomId=${r.roomId} id=${r.id} />`; break;
    case 'planEdit': page = html`<${PlanEditor} key=${(r.id ?? 'new') + (r.query.date ?? '')} roomId=${r.roomId} id=${r.id} query=${r.query} />`; break;
    case 'book': page = html`<${BookPage} roomId=${r.roomId} id=${r.id} />`; break;
    case 'settings': page = html`<${Settings} roomId=${r.roomId} />`; break;
    default: page = rooms.length ? null : html`<${Welcome} />`;
  }
  if (r.roomId) page = html`<${RoomGate} key=${r.roomId} roomId=${r.roomId}>${page}<//>`;
  return html`<div class="app">${page}<${ToastHost} /><${DialogHost} /></div>`;
}
