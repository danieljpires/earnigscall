import fs from "fs";
import path from "path";
import { FullReportData } from "@/types";
import { createClient } from "@vercel/kv";

const CACHE_DIR = path.join(process.cwd(), "cache");
const IS_KV_ENABLED = !!process.env.KV_REST_API_URL;

// Use @vercel/kv if available
const kv = createClient({
  url: process.env.KV_REST_API_URL || "",
  token: process.env.KV_REST_API_TOKEN || "",
});

// Polyfill dynamic memory cache
const memoryCache = new Map<string, { data: any, expires: number }>();

function setMemory(key: string, data: any, ttl: number = 600000) {
  memoryCache.set(key, { data, expires: Date.now() + ttl });
}

function getMemory(key: string): any | null {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) {
    memoryCache.delete(key);
    return null;
  }
  return item.data;
}

function getCacheKey(ticker: string, year: number, quarter: number, lang: string): string {
  // Versão v9 (Final Stability)
  return `analysis:v9:${ticker.toUpperCase()}:${year}:${quarter}:${lang.toLowerCase()}`;
}

function getLocalCachePath(key: string): string {
  return path.join(CACHE_DIR, `${key.replace(/:/g, "_")}.json`);
}

/**
 * DISABLED CACHE FOR TESTING - Returns null to force fresh AI generation
 */
export async function getAnalysisCache(ticker: string, year: number, quarter: number, lang: string): Promise<FullReportData | null> {
  console.log("[Cache] Analysis cache is currently DISABLED to force fresh results.");
  return null;
}

export async function setAnalysisCache(ticker: string, year: number, quarter: number, lang: string, data: any) {
  const key = getCacheKey(ticker, year, quarter, lang);
  setMemory(key, data);
  
  if (IS_KV_ENABLED) {
    try { await kv.set(key, data, { ex: 3600 }); } catch (e) {}
  }
}

export async function getTranscriptCache(ticker: string, year: number, quarter: number) {
  const key = `transcript:v3:${ticker.toUpperCase()}:${year}:${quarter}`;
  const mem = getMemory(key);
  if (mem) return { transcript: mem };

  if (IS_KV_ENABLED) {
    try {
      const val = await kv.get<string>(key);
      if (val) {
        setMemory(key, val);
        return { transcript: val };
      }
    } catch (e) {}
  }
  return null;
}

export async function setTranscriptCache(ticker: string, year: number, quarter: number, transcript: string) {
  const key = `transcript:v3:${ticker.toUpperCase()}:${year}:${quarter}`;
  setMemory(key, transcript);
  if (IS_KV_ENABLED) {
    try { await kv.set(key, transcript, { ex: 3600 * 24 }); } catch (e) {}
  }
}

interface RateLimitResult { success: boolean; current: number; limit: number; reset: number; }

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const limit = 50;
  const window = 3600;
  const key = `ratelimit:${ip}`;
  const now = Date.now();
  
  if (IS_KV_ENABLED) {
    try {
       const res: any = await kv.get(key);
       const current = res ? res.count + 1 : 1;
       if (current > limit) return { success: false, current, limit, reset: 0 };
       await kv.set(key, { count: current, timestamp: now }, { ex: window });
       return { success: true, current, limit, reset: 0 };
    } catch (e) {}
  }
  return { success: true, current: 1, limit: 100, reset: 0 };
}
