import { CacheEntry, ApiResponse } from "./types";
import { logger } from "./logger";
import * as fs from "fs";
import * as path from "path";

export class CacheManager {
  private cache: Record<string, CacheEntry> = {};
  private inFlight: Record<string, Promise<ApiResponse> | null> = {};
  private ttlSeconds: number;
  private cacheDir: string;

  constructor(ttlSeconds: number, cacheDir: string = "./cache") {
    this.ttlSeconds = ttlSeconds;
    this.cacheDir = cacheDir;
    this.ensureCacheDir();
  }

  isCacheValid(key: string): boolean {
    const entry = this.cache[key];
    if (!entry) return false;

    const now = Math.floor(Date.now() / 1000);
    return now - entry.generatedAt < this.ttlSeconds;
  }

  getRemainingTtl(key: string): number {
    const entry = this.cache[key];
    if (!entry) return 0;
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, this.ttlSeconds - (now - entry.generatedAt));
  }

  get(key: string): ApiResponse | null {
    const entry = this.cache[key];
    if (!entry) return null;
    return entry.data;
  }

  getValidCache(key: string): ApiResponse | null {
    if (!this.isCacheValid(key)) return null;
    return this.get(key);
  }

  set(key: string, data: ApiResponse): void {
    this.cache[key] = {
      generatedAt: Math.floor(Date.now() / 1000),
      data,
    };
    logger.info("Cache updated", {
      key,
      generatedAt: this.cache[key].generatedAt,
    });
  }

  hasInFlight(key: string): boolean {
    return this.inFlight[key] !== null && this.inFlight[key] !== undefined;
  }

  getInFlight(key: string): Promise<ApiResponse> | null {
    return this.inFlight[key] || null;
  }

  setInFlight(key: string, promise: Promise<ApiResponse>): void {
    this.inFlight[key] = promise;
    logger.debug("In-flight request registered", { key });
  }

  clearInFlight(key: string): void {
    this.inFlight[key] = null;
    logger.debug("In-flight request cleared", { key });
  }

  getStats(): { cacheCount: number; inFlightCount: number } {
    return {
      cacheCount: Object.keys(this.cache).length,
      inFlightCount: Object.values(this.inFlight).filter((v) => v !== null)
        .length,
    };
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      logger.info("Cache directory created", { cacheDir: this.cacheDir });
    }
  }

  private getCacheFilePath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9-_]/g, "_");
    return path.join(this.cacheDir, `${safeKey}.json`);
  }

  saveToDisk(key: string): void {
    const entry = this.cache[key];
    if (!entry) {
      logger.warn("Cannot save to disk, cache entry not found", { key });
      return;
    }

    try {
      const filePath = this.getCacheFilePath(key);
      fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf-8");
      logger.info("Cache saved to disk", { key, filePath });
    } catch (error) {
      logger.error("Failed to save cache to disk", {
        key,
        error: String(error),
      });
    }
  }

  loadFromDisk(key: string): boolean {
    try {
      const filePath = this.getCacheFilePath(key);
      if (!fs.existsSync(filePath)) {
        logger.debug("Cache file not found", { key, filePath });
        return false;
      }

      const data = fs.readFileSync(filePath, "utf-8");
      const entry = JSON.parse(data) as CacheEntry;
      this.cache[key] = entry;
      logger.info("Cache loaded from disk", {
        key,
        generatedAt: entry.generatedAt,
      });
      return true;
    } catch (error) {
      logger.error("Failed to load cache from disk", {
        key,
        error: String(error),
      });
      return false;
    }
  }

  loadAllFromDisk(): number {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        return 0;
      }

      const files = fs.readdirSync(this.cacheDir);
      let loaded = 0;

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        try {
          const filePath = path.join(this.cacheDir, file);
          const data = fs.readFileSync(filePath, "utf-8");
          const entry = JSON.parse(data) as CacheEntry;
          const key = file.replace(".json", "").replace(/_/g, "-");
          this.cache[key] = entry;
          loaded++;
        } catch (error) {
          logger.error("Failed to load cache file", {
            file,
            error: String(error),
          });
        }
      }

      logger.info("All cache loaded from disk", { count: loaded });
      return loaded;
    } catch (error) {
      logger.error("Failed to load all cache from disk", {
        error: String(error),
      });
      return 0;
    }
  }
}
