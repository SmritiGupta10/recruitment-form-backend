// utils/cache.js
const { Redis } = require("@upstash/redis");

// Ensure environment variables are set
if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.error("❌ Redis environment variables are not set!");
  process.exit(1);
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function setCache(key, value, ttlSeconds = 604800) {
  try {
    const strValue = JSON.stringify(value);
    await redis.set(key, strValue, { ex: ttlSeconds });
  } catch (err) {
    console.error(`❌ [CACHE] Failed to set ${key}:`, err.message);
  }
}

async function getCache(key) {
  try {
    const cached = await redis.get(key);
    if (!cached) return null;
    return JSON.parse(cached);
  } catch (err) {
    console.warn(`⚠️ [CACHE] Corrupted cache for ${key}, resetting...${err}`);
    await redis.del(key); // nuke bad cache
    return null;
  }
}

module.exports = { setCache, getCache };