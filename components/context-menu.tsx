'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type ContextAnchor = { x: number; y: number; trigger: HTMLElement };
export type ContextAction = {
  id: string; label: string; icon: ReactNode; run: () => void;
  disabled?: boolean; danger?: boolean; separator?: boolean; shortcut?: string;
};

export default function ContextMenu({ anchor, label, actions, onClose }: {
  anchor: ContextAnchor; label: string; actions: ContextAction[]; onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const [position, setPosition] = useState({ left: anchor.x, top: anchor.y });
  const host = anchor.trigger.closest('.notion-app');
  useLayoutEffect(() => {
    const panel = menu.current; if (!panel) return;
    const rect = panel.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8)), top: Math.max(8, Math.min(anchor.y, window.innerHeight - rect.height - 8)) });
    panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [anchor]);
  useEffect(() => {
    function outside(event: PointerEvent) { if (!menu.current?.contains(event.target as Node)) closeRef.current(); }
    function scroll(event: Event) { if (menu.current?.contains(event.target as Node)) return; closeRef.current(); }
    function dismiss() { closeRef.current(); }
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scroll, true);
    function shortcut(event: KeyboardEvent) {
      if (!event.isComposing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') dismiss();
    }
    window.addEventListener('resize', dismiss); window.addEventListener('blur', dismiss); window.addEventListener('popstate', dismiss); window.addEventListener('keydown', shortcut);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', dismiss); window.removeEventListener('blur', dismiss); window.removeEventListener('popstate', dismiss); window.removeEventListener('keydown', shortcut); };
  }, []);
  function closeAndFocus() { closeRef.current(); if (anchor.trigger.isConnected) anchor.trigger.focus({ preventScroll: true }); }
  if (!host) return null;
  return createPortal(<div className="n-context-layer"><div ref={menu} role="menu" aria-label={label} className="n-popover n-context-menu" style={position}
    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (['Escape', 'Tab'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); closeAndFocus(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const current = buttons.findIndex(button => button === document.activeElement);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[index]?.focus();
    }}>
    <div className="n-context-caption">{label}</div>
    {actions.map(action => <div key={action.id} role="none">{action.separator && <div className="n-context-separator" role="separator" />}<button type="button" role="menuitem" tabIndex={-1} disabled={action.disabled} className={action.danger ? 'n-danger' : ''} onClick={() => { if (anchor.trigger.isConnected) anchor.trigger.focus({ preventScroll: true }); closeRef.current(); action.run(); }}>{action.icon}<span>{action.label}</span>{action.shortcut && <kbd>{action.shortcut}</kbd>}</button></div>)}
  </div></div>, host);
}
