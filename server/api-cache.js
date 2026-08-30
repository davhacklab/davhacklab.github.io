/**
 * In-memory TTL cache for Astra-backed API reads.
 * Writes should call invalidateApiCache() so users see fresh data after mutations.
 */
export function createMemoryCache(ttlMs = 30000) {
    const entries = new Map();

    return {
        get(key) {
            const entry = entries.get(key);
            if (!entry) return undefined;
            if (Date.now() > entry.expiresAt) {
                entries.delete(key);
                return undefined;
            }
            return entry.value;
        },
        set(key, value, customTtlMs) {
            entries.set(key, {
                value,
                expiresAt: Date.now() + (customTtlMs ?? ttlMs)
            });
        },
        delete(key) {
            entries.delete(key);
        },
        deletePrefix(prefix) {
            for (const key of entries.keys()) {
                if (key.startsWith(prefix)) {
                    entries.delete(key);
                }
            }
        },
        clear() {
            entries.clear();
        }
    };
}
