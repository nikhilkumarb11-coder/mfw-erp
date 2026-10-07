/**
 * IndexedDB persistence for the offline cache.
 *   rows   — every synced record, key "Table:id"
 *   outbox — writes waiting to reach the server, in order
 *   meta   — small values such as the last sync time
 */
const DB = (() => {
  const NAME = 'mfw-erp';
  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore('rows', { keyPath: 'k' });
          db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
          db.createObjectStore('meta');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function run(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const result = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    allRows: () => run('rows', 'readonly', s => s.getAll()),

    putRows(entries) {
      if (!entries.length) return Promise.resolve();
      return run('rows', 'readwrite', s => { entries.forEach(([table, row]) => s.put({ k: `${table}:${row.id}`, t: table, d: row })); });
    },

    deleteRow: (table, id) => run('rows', 'readwrite', s => s.delete(`${table}:${id}`)),

    outboxAll: () => run('outbox', 'readonly', s => s.getAll()),
    outboxPut: op => run('outbox', 'readwrite', s => s.put(op)),
    outboxDelete: seq => run('outbox', 'readwrite', s => s.delete(seq)),

    getMeta: key => run('meta', 'readonly', s => s.get(key)),
    setMeta: (key, value) => run('meta', 'readwrite', s => s.put(value, key)),

    async clearAll() {
      for (const store of ['rows', 'outbox', 'meta']) await run(store, 'readwrite', s => s.clear());
    }
  };
})();
