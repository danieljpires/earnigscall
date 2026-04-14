import fs from "fs";
import path from "path";
import os from "os";
import { kv } from "@vercel/kv";

const CACHE_DIR = path.join(os.tmpdir(), "earnings-call-analyzer-cache");
const IS_KV_ENABLED = !!process.env.KV_REST_API_URL;

// Short-term in-memory cache to handle concurrent requests and reduce I/O
// RELOAD TRIGGERED: 2026-03-30
const MEMORY_CACHE = new Map<string, { data: any; expiry: number }>();
const MEMORY_CACHE_TTL = 1000 * 60 * 5; // 5 minutes

/**
 * Internal helper to check/set memory cache
 */
function getFromMemory(key: string): any | null {
  const item = MEMORY_CACHE.get(key);
  if (item && item.expiry > Date.now()) {
    return item.data;
  }
  if (item) MEMORY_CACHE.delete(key);
  return null;
}

function setToMemory(key: string, data: any) {
  MEMORY_CACHE.set(key, {
    data,
    expiry: Date.now() + MEMORY_CACHE_TTL
  });
  
  // Cleanup occasionally (if map gets too large)
  if (MEMORY_CACHE.size > 200) {
    const now = Date.now();
    for (const [k, v] of MEMORY_CACHE.entries()) {
      if (v.expiry < now) MEMORY_CACHE.delete(k);
    }
  }
}

// Ensure local cache directory exists (for dev only)
if (!IS_KV_ENABLED && process.env.NODE_ENV !== "production") {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  } catch (e) {
    console.warn("[Cache] Could not create local cache directory, skipping file caching.");
  }
}

/**
 * Generates a unique cache key for a specific analysis
 * UPDATED: Added v6 for the Super-Block strategy (100k context).
 */
function getCacheKey(ticker: string, year: number, quarter: number, lang: string): string {
  return `analysis:v7:${ticker.toUpperCase()}:${year}:${quarter}:${lang.toLowerCase()}`;
}

function getLocalCachePath(key: string): string {
  const filename = `${key.replace(/:/g, "_")}.json`;
  return path.join(CACHE_DIR, filename);
}

/**
 * Retrieves cached analysis if it exists
 */
export async function getAnalysisCache(ticker: string, year: number, quarter: number, lang: string) {
  const key = getCacheKey(ticker, year, quarter, lang);
  
  // 1. Check Memory Cache first
  const memData = getFromMemory(key);
  if (memData) {
    console.log(`[Cache:Memory] Hit for ${key}`);
    return memData;
  }

  // 2. Check Persisted Cache (KV or Disk)
  if (IS_KV_ENABLED) {
    try {
      const data = await kv.get(key);
      if (data) {
        console.log(`[Cache:KV] Hit for ${key}`);
        setToMemory(key, data);
        return data;
      }
    } catch (e) {
      console.error(`[Cache:KV] Error reading key: ${key}`, e);
    }
  } else {
    const cachePath = getLocalCachePath(key);
    if (fs.existsSync(cachePath)) {
      try {
        const data = fs.readFileSync(cachePath, "utf8");
        const parsed = JSON.parse(data);
        console.log(`[Cache:File] Hit for ${key}`);
        setToMemory(key, parsed);
        return parsed;
      } catch (e) {
        console.error(`[Cache:File] Error reading file: ${cachePath}`, e);
      }
    }
  }
  
  return null;
}

/**
 * Saves analysis result to cache
 */
export async function setAnalysisCache(ticker: string, year: number, quarter: number, lang: string, data: any) {
  const key = getCacheKey(ticker, year, quarter, lang);
  
  // Save to memory
  setToMemory(key, data);

  if (IS_KV_ENABLED) {
    try {
      await kv.set(key, data, { ex: 60 * 60 * 24 * 30 }); // Cache for 30 days
      console.log(`[Cache:KV] Saved ${key}`);
    } catch (e) {
      console.error(`[Cache:KV] Error saving key: ${key}`, e);
    }
  } else if (process.env.NODE_ENV !== "production") {
    const cachePath = getLocalCachePath(key);
    try {
      if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), "utf8");
      console.log(`[Cache:File] Saved ${key}`);
    } catch (e) {
      console.error(`[Cache:File] Error writing file: ${cachePath}`, e);
    }
  }
}

/**
 * Optimized Raw Transcript Cache (Shared across languages)
 */
export async function getTranscriptCache(ticker: string, year: number, quarter: number) {
  const key = `transcript:v2:${ticker.toUpperCase()}:${year}:${quarter}`;
  
  // 1. Check Memory Cache
  const memData = getFromMemory(key);
  if (memData) {
    return memData;
  }

  // 2. Check Persisted Cache
  let data = null;
  if (IS_KV_ENABLED) {
    data = await kv.get(key);
  } else {
    const cachePath = getLocalCachePath(key);
    if (fs.existsSync(cachePath)) {
      data = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    }
  }

  if (data) {
    setToMemory(key, data);
  }
  return data;
}

export async function setTranscriptCache(ticker: string, year: number, quarter: number, transcript: string) {
  const key = `transcript:v2:${ticker.toUpperCase()}:${year}:${quarter}`;
  const data = { transcript };

  // Save to memory
  setToMemory(key, data);

  if (IS_KV_ENABLED) {
    await kv.set(key, data, { ex: 60 * 60 * 24 * 30 });
  } else if (process.env.NODE_ENV !== "production") {
    const cachePath = getLocalCachePath(key);
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), "utf8");
  }
}

/**
 * Basic IP-based rate limiting using Vercel KV
 */
export async function checkRateLimit(ip: string, limit: number = 20, windowSeconds: number = 3600): Promise<{ success: boolean; current: number }> {
  if (!IS_KV_ENABLED) return { success: true, current: 0 };
  
  const key = `ratelimit:${ip}`;
  try {
    const current = await kv.incr(key);
    if (current === 1) {
      await kv.expire(key, windowSeconds);
    }
    
    return {
      success: current <= limit,
      current
    };
  } catch (e) {
    console.error(`[RateLimit] Error checking IP ${ip}`, e);
    return { success: true, current: 0 }; // Fail open
  }
}
