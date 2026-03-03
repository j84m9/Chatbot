import { useEffect } from 'react';

interface ShortcutMap {
  [key: string]: () => void;
}

/**
 * Registers global keyboard shortcuts.
 * Skips firing when user is typing in input/textarea (except Escape).
 *
 * Key format: "meta+k", "meta+n", "meta+/", "escape"
 * "meta" maps to Cmd on Mac, Ctrl on other platforms.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable;

      // Build key string
      const parts: string[] = [];
      if (e.metaKey || e.ctrlKey) parts.push('meta');
      if (e.shiftKey) parts.push('shift');
      parts.push(e.key.toLowerCase());
      const combo = parts.join('+');

      const action = shortcuts[combo];
      if (!action) return;

      // Allow Escape even when typing
      if (isTyping && e.key !== 'Escape') return;

      e.preventDefault();
      action();
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
