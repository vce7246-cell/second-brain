import { useCallback, useState } from 'react';
import { resolveWikilink } from '../lib/api.js';
import { InlineNotice } from '../components/InlineNotice.js';

export function useWikilinkNavigation(onNavigate: (filePath: string) => void) {
  const [error, setError] = useState<string | null>(null);

  const handleWikilinkClick = useCallback(async (target: string) => {
    try {
      setError(null);
      const resolution = await resolveWikilink(target);
      if (resolution.status === 'found') {
        onNavigate(resolution.path);
        return;
      }
      setError(resolution.status === 'ambiguous'
        ? `“${target}”对应多篇笔记，请在链接中写明文件夹路径。`
        : `没有找到“${target}”对应的笔记。`);
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : '链接解析失败');
    }
  }, [onNavigate]);

  const wikilinkNotice = error ? (
    <InlineNotice tone="warning" className="border-x-0 border-t-0 px-4" onClose={() => setError(null)}>
      {error}
    </InlineNotice>
  ) : null;

  return { handleWikilinkClick, wikilinkNotice };
}
