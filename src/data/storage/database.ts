import { DB_NAME, DB_VERSION } from "../../shared/constants";

let pending: Promise<IDBDatabase> | undefined;

export function database(): Promise<IDBDatabase> {
  return (pending ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let abandoned = false;
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      if (!db.objectStoreNames.contains("games")) {
        const store = db.createObjectStore("games", { keyPath: "id" });
        store.createIndex("username", "username");
        store.createIndex("platform", "platform");
      } else {
        const store = req.transaction?.objectStore("games");
        if (store && !store.indexNames.contains("platform")) {
          store.createIndex("platform", "platform");
        }
      }

      if (!db.objectStoreNames.contains("archives")) {
        const store = db.createObjectStore("archives", { keyPath: "id" });
        store.createIndex("username", "username");
      }
      if (!db.objectStoreNames.contains("users"))
        db.createObjectStore("users", { keyPath: "username" });

      if (!db.objectStoreNames.contains("puzzleAttempts")) {
        const store = db.createObjectStore("puzzleAttempts", { keyPath: "id" });
        store.createIndex("username", "username");
        store.createIndex("platform", "platform");
        store.createIndex("localDate", ["username", "localDate"]);
        store.createIndex("attemptedAt", ["username", "attemptedAt"]);
      } else {
        const store = req.transaction?.objectStore("puzzleAttempts");
        if (store && !store.indexNames.contains("platform")) {
          store.createIndex("platform", "platform");
        }
      }

      if (!db.objectStoreNames.contains("puzzleTrackingState"))
        db.createObjectStore("puzzleTrackingState", { keyPath: "username" });

      if (!db.objectStoreNames.contains("lichessSync")) {
        db.createObjectStore("lichessSync", { keyPath: "username" });
      }
    };
    req.onsuccess = () => {
      if (abandoned) {
        req.result.close();
        return;
      }
      req.result.onversionchange = () => {
        req.result.close();
        pending = undefined;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      if (!abandoned) pending = undefined;
      abandoned = true;
      reject(req.error);
    };
    req.onblocked = () => {
      abandoned = true;
      pending = undefined;
      reject(
        new Error(
          "Database upgrade blocked. Close other Chess.com tabs and retry.",
        ),
      );
    };
  }));
}

export const idbResult = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const transactionDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(tx.error ?? new Error("Storage transaction aborted"));
    tx.onerror = () => reject(tx.error);
  });
