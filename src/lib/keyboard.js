// iPhone のキーボード対策
// Safari ではキーボードが出ても画面（layout viewport）の高さが変わらず、下にくっついた
// シートや保存ボタンがキーボードの裏に隠れる。見えている範囲（visualViewport）から
// キーボードの高さを出して、CSS の --kb に入れる（シートと保存ボタンはその分だけ上にずらす）。
// Android はキーボードぶん画面が縮むので --kb は 0 のまま。
export function watchKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let raf = 0;
  const update = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const open = kb > 80;
      root.style.setProperty('--kb', (open ? kb : 0) + 'px');
      root.style.setProperty('--vvh', Math.round(vv.height) + 'px');
      root.classList.toggle('kb-open', open);
    });
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}
