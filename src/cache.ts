import { CacheEntry, ApiResponse } from './types'
import { logger } from './logger'

export class CacheManager {
  private cache: Record<string, CacheEntry> = {}
  private inFlight: Record<string, Promise<ApiResponse> | null> = {}
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

  getRemainingTtl(key: string): number {
    const entry = this.cache[key]
    if (!entry) return 0
    const now = Math.floor(Date.now() / 1000)
    return Math.max(0, this.ttlSeconds - (now - entry.generatedAt))
  }

  get(key: string): ApiResponse | null {
    const entry = this.cache[key]
    if (!entry) return null
    return entry.data
  }

  getValidCache(key: string): ApiResponse | null {
    if (!this.isCacheValid(key)) return null
    return this.get(key)
  }

  set(key: string, data: ApiResponse): void {
    this.cache[key] = {
      generatedAt: Math.floor(Date.now() / 1000),
      data,
    }
    logger.info('Cache updated', { key, generatedAt: this.cache[key].generatedAt })
  }

  hasInFlight(key: string): boolean {
    return this.inFlight[key] !== null && this.inFlight[key] !== undefined
  }

  getInFlight(key: string): Promise<ApiResponse> | null {
    return this.inFlight[key] || null
  }

  setInFlight(key: string, promise: Promise<ApiResponse>): void {
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
