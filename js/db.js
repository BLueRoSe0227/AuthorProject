// IndexedDB data layer
const DB_NAME = 'AuthorProjectDB';
const DB_VERSION = 3;
const STORE_NAMES = ['works', 'chapters', 'scenes', 'sceneVersions', 'characters', 'settingNotes', 'memos', 'schedules', 'writingLog', 'relationshipTags', 'characterGroups'];

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('works')) {
        const works = db.createObjectStore('works', { keyPath: 'id' });
        works.createIndex('updatedAt', 'updatedAt');
      }

      if (!db.objectStoreNames.contains('chapters')) {
        const chapters = db.createObjectStore('chapters', { keyPath: 'id' });
        chapters.createIndex('workId', 'workId');
      }

      if (!db.objectStoreNames.contains('scenes')) {
        const scenes = db.createObjectStore('scenes', { keyPath: 'id' });
        scenes.createIndex('chapterId', 'chapterId');
        scenes.createIndex('workId', 'workId');
      }

      if (!db.objectStoreNames.contains('sceneVersions')) {
        const sceneVersions = db.createObjectStore('sceneVersions', { keyPath: 'id' });
        sceneVersions.createIndex('sceneId', 'sceneId');
      }

      if (!db.objectStoreNames.contains('characters')) {
        const characters = db.createObjectStore('characters', { keyPath: 'id' });
        characters.createIndex('workId', 'workId');
      }

      if (!db.objectStoreNames.contains('settingNotes')) {
        const settingNotes = db.createObjectStore('settingNotes', { keyPath: 'id' });
        settingNotes.createIndex('workId', 'workId');
      }

      if (!db.objectStoreNames.contains('memos')) {
        const memos = db.createObjectStore('memos', { keyPath: 'id' });
        memos.createIndex('workId', 'workId');
      }

      if (!db.objectStoreNames.contains('schedules')) {
        const schedules = db.createObjectStore('schedules', { keyPath: 'id' });
        schedules.createIndex('workId', 'workId');
        schedules.createIndex('date', 'date');
      }

      if (!db.objectStoreNames.contains('writingLog')) {
        const writingLog = db.createObjectStore('writingLog', { keyPath: 'id' });
        writingLog.createIndex('workId', 'workId');
        writingLog.createIndex('workId_date', ['workId', 'date'], { unique: true });
      }

      if (!db.objectStoreNames.contains('relationshipTags')) {
        const relationshipTags = db.createObjectStore('relationshipTags', { keyPath: 'id' });
        relationshipTags.createIndex('workId', 'workId');
      }

      if (!db.objectStoreNames.contains('characterGroups')) {
        const characterGroups = db.createObjectStore('characterGroups', { keyPath: 'id' });
        characterGroups.createIndex('workId', 'workId');
      }
    };
    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const DB = {
  uuid,

  async getAll(storeName) {
    const store = await tx(storeName);
    return reqToPromise(store.getAll());
  },

  async getAllByIndex(storeName, indexName, value) {
    const store = await tx(storeName);
    return reqToPromise(store.index(indexName).getAll(value));
  },

  async get(storeName, id) {
    const store = await tx(storeName);
    return reqToPromise(store.get(id));
  },

  async put(storeName, item) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.put(item));
  },

  async add(storeName, item) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.add(item));
  },

  async delete(storeName, id) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.delete(id));
  },

  async deleteByIndex(storeName, indexName, value) {
    const store = await tx(storeName, 'readwrite');
    const idx = store.index(indexName);
    const items = await reqToPromise(idx.getAll(value));
    for (const item of items) {
      await reqToPromise(store.delete(item.id));
    }
    return items.length;
  },

  async clearAll() {
    const db = await openDB();
    await Promise.all(
      STORE_NAMES.map(
        (n) =>
          new Promise((resolve, reject) => {
            const req = db.transaction(n, 'readwrite').objectStore(n).clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          })
      )
    );
  },

  async exportAll() {
    const data = {};
    for (const n of STORE_NAMES) data[n] = await DB.getAll(n);
    return { exportedAt: new Date().toISOString(), data };
  },

  async importAll(payload, mode = 'merge') {
    if (mode === 'replace') await DB.clearAll();
    for (const n of STORE_NAMES) {
      const items = (payload.data && payload.data[n]) || [];
      for (const item of items) await DB.put(n, item);
    }
  },
};
