import fs from "fs";
import path from "path";
import { FullReportData } from "../types";
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

/**
 * CACHE DISABLED BY USER REQUEST
 * This ensures every analysis is fresh.
 */
export async function getAnalysisCache(ticker: string, year: number, quarter: number, lang: string): Promise<FullReportData | null> {
  console.log("[Cache] Analysis cache DISABLED. Fetching fresh data...");
  return null;
}

export async function setAnalysisCache(ticker: string, year: number, quarter: number, lang: string, data: any) {
  // We can still set it just in case, but getTask will always return null for now.
  const key = `analysis:v10:${ticker}:${year}:${quarter}:${lang}`;
  setMemory(key, data);
}

export async function getTranscriptCache(ticker: string, year: number, quarter: number) {
  console.log("[Cache] Transcript cache DISABLED. Fetching fresh transcript...");
  return null;
}

export async function setTranscriptCache(ticker: string, year: number, quarter: number, transcript: string) {
  const key = `transcript:v4:${ticker.toUpperCase()}:${year}:${quarter}`;
  setMemory(key, transcript);
}

interface RateLimitResult { success: boolean; current: number; limit: number; reset: number; }

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  // Allow high limits for development
  return { success: true, current: 1, limit: 1000, reset: 0 };
}
