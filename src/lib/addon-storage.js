function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("rainflix-private", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("settings");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addonRegistrations(value, key = "addons") {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(
        "settings",
        value ? "readwrite" : "readonly",
      );
      const store = transaction.objectStore("settings");
      const request = value ? store.put(value, key) : store.get(key);
      transaction.oncomplete = () => resolve(value || request.result || []);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
