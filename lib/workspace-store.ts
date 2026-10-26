import { validateWorkspace, type Workspace } from './workspace';

type StoredWorkspace = { id: 'workspace'; revision: number; data: Workspace };
export class WorkspaceConflict extends Error { constructor() { super('다른 탭에서 작업 공간을 변경했습니다.'); } }
let connection: Promise<IDBDatabase> | undefined;
function database() {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('yotion-workspace', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = undefined; reject(request.error); };
  });
}
export async function readWorkspace(): Promise<StoredWorkspace | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readonly');
    const request = tx.objectStore('state').get('workspace');
    request.onsuccess = () => {
      try {
        const stored = request.result as StoredWorkspace | undefined;
        if (stored && (!Number.isSafeInteger(stored.revision) || stored.revision < 1)) throw new Error('저장 버전이 올바르지 않습니다.');
        resolve(stored ? { ...stored, data: validateWorkspace(stored.data) } : null);
      } catch (error) { reject(error); }
    };
    request.onerror = () => reject(request.error);
  });
}
export async function writeWorkspace(data: Workspace, expectedRevision: number): Promise<number> {
  validateWorkspace(data);
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite');
    const store = tx.objectStore('state');
    const request = store.get('workspace');
    let conflict = false;
    let failure: unknown;
    request.onsuccess = () => {
      if ((request.result?.revision ?? 0) !== expectedRevision) { conflict = true; tx.abort(); return; }
      try { store.put({ id: 'workspace', revision: expectedRevision + 1, data }); }
      catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(expectedRevision + 1);
    tx.onabort = () => reject(conflict ? new WorkspaceConflict() : failure ?? tx.error ?? new Error('저장하지 못했습니다.'));
    tx.onerror = () => reject(tx.error);
  });
}
