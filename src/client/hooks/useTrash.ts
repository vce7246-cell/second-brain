import { useCallback, useEffect, useState } from 'react';
import type { TrashItem } from '../../shared/file-types.js';
import { fetchTrash, restoreTrashItem } from '../lib/api.js';

export function useTrash(active: boolean) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTrash();
      setItems(result.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '回收站加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) void reload();
  }, [active, reload]);

  const restore = useCallback(async (id: string) => {
    setRestoringId(id);
    setError(null);
    try {
      await restoreTrashItem(id);
      await reload();
      return true;
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : '恢复失败');
      return false;
    } finally {
      setRestoringId(null);
    }
  }, [reload]);

  return { items, loading, restoringId, error, reload, restore };
}
