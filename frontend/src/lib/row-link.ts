import type { KeyboardEvent, MouseEvent } from 'react';

// Makes a whole table row navigate, not just the id cell. A row of data whose
// only live target is a 12-character link reads as broken — you aim at the
// company name, nothing happens.
//
// The row keeps its real <Link> on the id: that's what preserves middle-click
// and cmd-click "open in new tab", plus screen-reader semantics. This just
// widens the mouse target around it.
//
// Usage:
//   <tr {...rowLink(() => router.push(href))} className="... cursor-pointer">
export function rowLink(navigate: () => void) {
  return {
    onClick: (e: MouseEvent<HTMLElement>) => {
      // Clicks that land on a nested control (the id link itself, an Edit
      // link, a delete button, a checkbox) belong to that control — firing
      // row navigation as well would either double-navigate or hijack the
      // action the user actually aimed at.
      if ((e.target as HTMLElement).closest('a,button,input,select,textarea,label')) return;
      // Let modified clicks fall through to the browser's own behaviour
      // rather than force a same-tab navigation.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      navigate();
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      // Only when the row itself holds focus — otherwise Enter inside a
      // nested control would trigger both.
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate();
      }
    },
    tabIndex: 0,
  };
}
