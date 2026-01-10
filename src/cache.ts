import { CacheEntry, LanguageStats } from './types'
import { logger } from './logger'

export class CacheManager {
  private cache: Record<string, CacheEntry> = {}
  private inFlight: Record<string, Promise<LanguageStats> | null> = {}
  private ttlSeconds: number

  constructor(ttlSeconds: number) {
    this.ttlSeconds = ttlSeconds
  }

  isCacheValid(key: string): boolean {
    const entry = this.cache[key]
    if (!entry) return false

    const now = Math.floor(Date.now() / 1000)
    return now - entry.generatedAt < this.ttlSeconds
  }

  get(key: string): LanguageStats | null {
    const entry = this.cache[key]
    if (!entry) return null
    return entry.data
  }

  getValidCache(key: string): LanguageStats | null {
    if (!this.isCacheValid(key)) return null
    return this.get(key)
  }

  set(key: string, data: LanguageStats): void {
    this.cache[key] = {
      generatedAt: Math.floor(Date.now() / 1000),
      data: { ...data, cached: false },
    }
    logger.info('Cache updated', { key, generatedAt: this.cache[key].generatedAt })
  }

  hasInFlight(key: string): boolean {
    return this.inFlight[key] !== null && this.inFlight[key] !== undefined
  }

  getInFlight(key: string): Promise<LanguageStats> | null {
    return this.inFlight[key] || null
  }

  setInFlight(key: string, promise: Promise<LanguageStats>): void {
    this.inFlight[key] = promise
    logger.debug('In-flight request registered', { key })
  }

  clearInFlight(key: string): void {
    this.inFlight[key] = null
    logger.debug('In-flight request cleared', { key })
  }

  getStats(): { cacheCount: number; inFlightCount: number } {
    return {
      cacheCount: Object.keys(this.cache).length,
      inFlightCount: Object.values(this.inFlight).filter(v => v !== null).length,
    }
  }
}
