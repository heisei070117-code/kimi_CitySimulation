import type { SaveData } from './types';

// IndexedDB による自動保存 + JSONエクスポート/インポート
const DB_NAME = 'diorama-city';
const STORE = 'cities';
const KEY = 'autosave';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveToDB(data: SaveData): Promise<void> {
  // localStorageにもミラー(IDBのフラッシュ漏れ対策・容量超過時はIDBのみ)
  try {
    localStorage.setItem('diorama-city-autosave', JSON.stringify(data));
  } catch { /* 容量超過時はIDBのみ */ }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadFromDB(): Promise<SaveData | null> {
  try {
    const db = await openDB();
    const data = await new Promise<SaveData | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as SaveData) ?? null);
      req.onerror = () => reject(req.error);
    });
    if (data) return data;
  } catch { /* IDB失敗時はミラーへ */ }
  try {
    const raw = localStorage.getItem('diorama-city-autosave');
    return raw ? (JSON.parse(raw) as SaveData) : null;
  } catch {
    return null;
  }
}

export function exportJSON(data: SaveData) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `diorama-city-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importJSON(file: File): Promise<SaveData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as SaveData;
        if (data.version !== 1 || !data.heights) throw new Error('invalid');
        resolve(data);
      } catch {
        reject(new Error('都市データとして読み込めませんでした'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
