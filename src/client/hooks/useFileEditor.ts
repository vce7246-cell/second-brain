import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchFile, saveFile } from '../lib/api.js';

const CONFLICT_MESSAGE = '磁盘上的文件已发生变化，已保留当前未保存内容。';

export function useFileEditor(selectedFile: string | null) {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const selectedFileRef = useRef(selectedFile);
  const savingRef = useRef(false);
  const loadIdRef = useRef(0);

  selectedFileRef.current = selectedFile;
  const dirty = content !== savedContent;

  const applyLoadedFile = useCallback((loaded: {
    content: string;
    version: string;
  }) => {
    setContent(loaded.content);
    setSavedContent(loaded.content);
    setVersion(loaded.version);
    setError(null);
    setConflict(false);
  }, []);

  useEffect(() => {
    const loadId = ++loadIdRef.current;
    if (!selectedFile) {
      setContent('');
      setSavedContent('');
      setVersion(null);
      setError(null);
      setConflict(false);
      return;
    }

    setContent('');
    setSavedContent('');
    setVersion(null);
    setLoading(true);
    setSaving(false);
    setError(null);
    setConflict(false);

    fetchFile(selectedFile)
      .then((loaded) => {
        if (loadId === loadIdRef.current) applyLoadedFile(loaded);
      })
      .catch((loadError: unknown) => {
        if (loadId === loadIdRef.current) {
          setError(loadError instanceof Error ? loadError.message : '加载失败');
        }
      })
      .finally(() => {
        if (loadId === loadIdRef.current) setLoading(false);
      });
  }, [applyLoadedFile, selectedFile]);

  const persist = useCallback(async (force: boolean) => {
    if (!selectedFile || !dirty || savingRef.current) return;
    if (!force && version === null) {
      setError('文件版本尚未加载，无法安全保存。');
      return;
    }

    const targetFile = selectedFile;
    const contentToSave = content;
    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      const result = await saveFile(
        targetFile,
        contentToSave,
        force ? undefined : version ?? undefined
      );
      if (selectedFileRef.current === targetFile) {
        setSavedContent(contentToSave);
        setVersion(result.version);
        setConflict(false);
      }
    } catch (saveError) {
      if (selectedFileRef.current !== targetFile) return;
      if (saveError instanceof ApiError && saveError.status === 409) {
        setConflict(true);
        setError(CONFLICT_MESSAGE);
      } else {
        setError(saveError instanceof Error ? saveError.message : '保存失败');
      }
    } finally {
      savingRef.current = false;
      if (selectedFileRef.current === targetFile) setSaving(false);
    }
  }, [content, dirty, selectedFile, version]);

  const save = useCallback(() => persist(false), [persist]);
  const forceSave = useCallback(() => persist(true), [persist]);

  const reloadFromDisk = useCallback(async () => {
    if (!selectedFile) return;
    const targetFile = selectedFile;
    setLoading(true);
    try {
      const loaded = await fetchFile(targetFile);
      if (selectedFileRef.current === targetFile) applyLoadedFile(loaded);
    } catch (loadError) {
      if (selectedFileRef.current === targetFile) {
        setError(loadError instanceof Error ? loadError.message : '加载失败');
      }
    } finally {
      if (selectedFileRef.current === targetFile) setLoading(false);
    }
  }, [applyLoadedFile, selectedFile]);

  const handleExternalChange = useCallback(async (filePath: string) => {
    if (filePath !== selectedFileRef.current || savingRef.current) return;

    try {
      const loaded = await fetchFile(filePath);
      if (filePath !== selectedFileRef.current || loaded.version === version) return;
      if (dirty) {
        setConflict(true);
        setError(CONFLICT_MESSAGE);
      } else {
        applyLoadedFile(loaded);
      }
    } catch {
      if (filePath === selectedFileRef.current) {
        setError('检测到文件变化，但重新读取失败。');
      }
    }
  }, [applyLoadedFile, dirty, version]);

  const handleExternalDelete = useCallback(async (filePath: string): Promise<boolean> => {
    if (filePath !== selectedFileRef.current) return false;
    if (savingRef.current) return false;

    try {
      const loaded = await fetchFile(filePath);
      if (filePath !== selectedFileRef.current || loaded.version === version) return false;
      if (dirty) {
        setConflict(true);
        setError(CONFLICT_MESSAGE);
      } else {
        applyLoadedFile(loaded);
      }
      return false;
    } catch {
      if (filePath !== selectedFileRef.current) return false;
    }

    if (dirty) {
      setConflict(true);
      setError('磁盘上的文件已被删除，已保留当前未保存内容。');
      return false;
    }
    return true;
  }, [applyLoadedFile, dirty, version]);

  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  return {
    content,
    setContent,
    dirty,
    loading,
    saving,
    error,
    conflict,
    save,
    forceSave,
    reloadFromDisk,
    handleExternalChange,
    handleExternalDelete,
  };
}
