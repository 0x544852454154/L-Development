/*
 * L Audit Log Cache — the #1 performance optimization.
 *
 * Problem: the old antinuke handler called guild.fetchAuditLogs() on EVERY
 * destructive event (channel delete, role delete, ban remove, etc). Each call
 * is a Discord API request (~200-500ms) and counts against rate limits.
 * During a nuke with 50 channel deletions, that's 50 sequential API calls
 * before any restoration happens — extremely slow.
 *
 * Solution: fetch audit logs once per guild per few seconds and cache the
 * entries. Concurrent events for the same guild reuse the cached fetch
 * (deduplication), so a 50-channel nuke does ONE audit-log fetch, not 50.
 */

const CACHE_TTL = 4000; // 4 seconds — balances freshness vs API usage
const inflight = new Map(); // guildId -> Promise<entries>
const cache = new Map(); // guildId -> { entries, expires }

async function getAuditLogs(guild, type, limit = 25) {
  const key = guild.id;
  const now = Date.now();

  // Return cached if fresh
  const c = cache.get(key);
  if (c && c.expires > now) {
    return c.entries.filter((e) => !type || e.action === type);
  }

  // Dedupe concurrent fetches for the same guild
  if (inflight.has(key)) {
    try {
      const entries = await inflight.get(key);
      return entries.filter((e) => !type || e.action === type);
    } catch {
      // fall through to fresh fetch
    }
  }

  const p = (async () => {
    try {
      const logs = await guild.fetchAuditLogs({ limit, type: type || undefined });
      const entries = [...logs.entries.values()];
      cache.set(key, { entries, expires: now + CACHE_TTL });
      return entries;
    } catch (e) {
      // On failure, cache an empty result briefly to avoid hammering the API
      cache.set(key, { entries: [], expires: now + 1000 });
      return [];
    } finally {
      // Keep the inflight promise briefly so concurrent waiters resolve, then clear
      setTimeout(() => inflight.delete(key), 100);
    }
  })();
  inflight.set(key, p);
  return p;
}

// Find the executor of a specific action targeting a specific id.
// Uses the cached audit logs — O(1) API calls per guild per TTL window.
async function fetchExecutor(guild, eventType, targetId) {
  try {
    const entries = await getAuditLogs(guild, eventType);
    // Match by target id; fall back to the most recent entry of that type
    let entry = entries.find((e) => e.targetId === targetId || e.target?.id === targetId);
    if (!entry && entries.length) entry = entries[0];
    return entry?.executor || null;
  } catch {
    return null;
  }
}

// Invalidate the cache for a guild (e.g. after we know a fresh action happened)
function invalidate(guildId) {
  cache.delete(guildId);
  inflight.delete(guildId);
}

module.exports = { getAuditLogs, fetchExecutor, invalidate, CACHE_TTL };
