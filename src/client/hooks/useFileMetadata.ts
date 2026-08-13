import { useEffect, useState } from 'react';
import { fetchFileMetadata } from '../lib/api.js';
import type { FileMetadata } from '../types/index.js';

export function useFileMetadata(filePath: string, refreshKey = 0) {
  const [metadata, setMetadata] = useState<FileMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setMetadata(null);
    setError(null);
    void fetchFileMetadata(filePath)
      .then((value) => {
        if (alive) setMetadata(value);
      })
      .catch((metadataError) => {
        if (alive) {
          setError(metadataError instanceof Error ? metadataError.message : '文件元数据加载失败');
        }
      });
    return () => {
      alive = false;
    };
  }, [filePath, refreshKey]);

  return { metadata, error };
}
