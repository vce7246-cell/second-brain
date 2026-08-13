import { useEffect, useState } from 'react';
import { fetchTextPreview } from '../lib/api.js';

export function useTextFilePreview(filePath: string, revision: number, enabled: boolean) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setContent('');
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchTextPreview(filePath, revision, controller.signal)
      .then(setContent)
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        setContent('');
        setError(loadError instanceof Error ? loadError.message : '文本预览加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, filePath, revision]);

  return { content, loading, error };
}
