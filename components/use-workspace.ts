'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { seedWorkspace, type Workspace } from '@/lib/workspace';
import { readWorkspace, writeWorkspace, WorkspaceConflict } from '@/lib/workspace-store';

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [status, setStatus] = useState<'loading' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'>('loading');
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  const latest = useRef<Workspace | null>(null);
  const saved = useRef<Workspace | null>(null);
  const revision = useRef(0);
  const running = useRef<Promise<void> | null>(null);
  const blocked = useRef(false);
  const composing = useRef(false);
  const mounted = useRef(false);
  const update = useCallback((change: (current: Workspace) => Workspace, persist = true) => {
    if (!latest.current) return;
    const clean = latest.current === saved.current;
    const next = change(latest.current);
    latest.current = next;
    if (!persist && clean) saved.current = next;
    setWorkspace(next);
    if (!blocked.current && (persist || !clean)) setStatus('dirty');
  }, []);
  const flush = useCallback(() => {
    if (running.current) return running.current;
    if (blocked.current || composing.current) return Promise.resolve();
    const save = async () => {
      try {
        while (latest.current && latest.current !== saved.current && !blocked.current && !composing.current) {
          const snapshot = latest.current;
          if (mounted.current) setStatus('saving');
          revision.current = await writeWorkspace(snapshot, revision.current);
          saved.current = snapshot;
        }
        if (mounted.current) { setStatus(composing.current || latest.current !== saved.current ? 'dirty' : 'saved'); setError(''); }
      } catch (error) {
        blocked.current = true;
        if (mounted.current) {
          setStatus(error instanceof WorkspaceConflict ? 'conflict' : 'error');
          setError(error instanceof Error ? error.message : '저장하지 못했습니다.');
        }
      } finally { running.current = null; }
    };
    running.current = save();
    return running.current;
  }, []);
  const load = useCallback(async () => {
    try {
      const stored = await readWorkspace();
      if (!mounted.current) return;
      const data = stored?.data ?? seedWorkspace();
      latest.current = data; saved.current = stored?.data ?? null; revision.current = stored?.revision ?? 0;
      blocked.current = false; setWorkspace(data); setGeneration(value => value + 1); setError(''); setStatus(stored ? 'saved' : 'dirty');
    } catch (error) {
      if (mounted.current) { blocked.current = true; setError(error instanceof Error ? error.message : '저장소를 열 수 없습니다.'); setStatus('error'); }
    }
  }, []);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);
  useEffect(() => {
    if (!workspace || status !== 'dirty') return;
    const timer = setTimeout(() => void flush(), 600);
    return () => clearTimeout(timer);
  }, [workspace, status, flush]);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (composing.current || latest.current !== saved.current) { event.preventDefault(); }
    }
    function onVisibility() { if (document.visibilityState === 'hidden') void flush(); }
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('visibilitychange', onVisibility); };
  }, [flush]);
  function retry() { blocked.current = false; void flush(); }
  const setComposing = useCallback((value: boolean) => {
    composing.current = value;
    if (value && !blocked.current) setStatus('dirty');
  }, []);
  return { workspace, status, error, update, flush, reload: load, retry, generation, setComposing };
}
