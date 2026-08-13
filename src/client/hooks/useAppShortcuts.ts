import { useEffect } from 'react';

interface AppShortcutOptions {
  openQuickSwitcher: () => void;
  openSearch: () => void;
  save: () => void;
}

export function useAppShortcuts({
  openQuickSwitcher,
  openSearch,
  save,
}: AppShortcutOptions): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const primaryModifier = event.ctrlKey || event.metaKey;
      if (!primaryModifier) return;

      if (event.shiftKey && event.key.toLocaleLowerCase() === 'f') {
        event.preventDefault();
        openSearch();
      } else if (event.key.toLocaleLowerCase() === 'o') {
        event.preventDefault();
        openQuickSwitcher();
      } else if (event.key.toLocaleLowerCase() === 's') {
        event.preventDefault();
        save();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openQuickSwitcher, openSearch, save]);
}
