// Abyssal geometry (enlarged for visibility on the AMY scene): 8px dot, 34px ring locked to it (no lag), 56px mint hover ring.
export function mountAbyssalCursor({root = document.body} = {}) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const fine = win.matchMedia('(pointer: fine) and (hover: hover)');
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const attribute = 'data-amy-abyssal-cursor';
  const previous = root.getAttribute(attribute);
  const dot = doc.createElement('div'), ring = doc.createElement('div');
  dot.className = 'amy-abyssal-dot'; ring.className = 'amy-abyssal-ring';
  for (const element of [dot, ring]) {element.setAttribute('aria-hidden', 'true');element.hidden = true;root.appendChild(element);}
  let disposed = false, visible = false, hot = false, frame = 0;
  let x = 0, y = 0, ringX = 0, ringY = 0, lastTime = 0;
  const nativeSurface = () => Boolean(root.querySelector('.startup-cover:not(.startup-cover--leaving), .jj-navbar.menu-is-open'));
  const enabled = () => fine.matches && !reduced.matches && !doc.hidden && !nativeSurface();
  function restoreNative() {
    if (previous === null) root.removeAttribute(attribute); else root.setAttribute(attribute, previous);
  }
  function hide() {
    visible = false;hot = false;dot.hidden = ring.hidden = true;ring.dataset.hot = 'false';
    win.cancelAnimationFrame(frame);frame = 0;restoreNative();
  }
  function move(event) {
    if (disposed || event.pointerType === 'touch' || !enabled()) {hide();return;}
    x = event.clientX;y = event.clientY;
    if (!visible) {
      visible = true;dot.hidden = ring.hidden = false;root.setAttribute(attribute, 'on');
    }
    hot = Boolean(event.target?.closest?.('a, button, input, select, textarea, [data-interactive], [role="button"]'));
    ring.dataset.hot = String(hot);
    ringX = x;ringY = y;
    dot.style.transform = ring.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }
  const keyboard = event => {if (event.key === 'Tab' || event.key.startsWith('Arrow') || event.key === 'Escape') hide();};
  const visibility = () => {if (doc.hidden) hide();};
  root.addEventListener('pointermove', move, {passive: true});
  root.addEventListener('pointerleave', hide);
  root.addEventListener('pointercancel', hide);
  win.addEventListener('blur', hide);doc.addEventListener('visibilitychange', visibility);
  doc.addEventListener('keydown', keyboard);fine.addEventListener('change', hide);reduced.addEventListener('change', hide);
  return {
    stats: () => ({mounted: !disposed, visible, enabled: enabled(), reduced: reduced.matches,
      fine: fine.matches, hot, x, y, ringX, ringY, lagLambda: 0}),
    dispose() {
      if (disposed) return;disposed = true;hide();
      root.removeEventListener('pointermove', move);root.removeEventListener('pointerleave', hide);
      root.removeEventListener('pointercancel', hide);win.removeEventListener('blur', hide);
      doc.removeEventListener('visibilitychange', visibility);doc.removeEventListener('keydown', keyboard);
      fine.removeEventListener('change', hide);reduced.removeEventListener('change', hide);
      dot.remove();ring.remove();
    }
  };
}
