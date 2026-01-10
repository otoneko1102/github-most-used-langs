import 'dotenv/config'
import express, { Request, Response } from 'express'
import cors from 'cors'
import { loadConfig } from './config'
import { CacheManager } from './cache'
import { fetchLanguageStats, isRateLimitError } from './github'
import { logger } from './logger'
import { LanguageStats, RateLimitError } from './types'

const config = loadConfig()
const cache = new CacheManager(config.cacheTtlSeconds)

const app = express()

app.use(cors({ origin: config.allowedOrigins === '*' ? '*' : config.allowedOrigins.split(',') }))

app.use(express.json())

app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const elapsed = Date.now() - start
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      elapsedMs: elapsed,
    })
  })
  next()
})

app.get('/', async (req: Request, res: Response) => {
  if (!config.githubUsername) {
    logger.error('GITHUB_USERNAME not set')
    return res.status(400).json({ error: 'GITHUB_USERNAME not set' })
  }

  const key = config.githubUsername

  const validCache = cache.getValidCache(key)
  if (validCache) {
    logger.info('Cache hit', { key })
    return res.json({ ...validCache, cached: true })
  }

  const existingFlight = cache.getInFlight(key)
  if (existingFlight) {
    logger.info('Waiting for in-flight request', { key })
    try {
      const data = await existingFlight
      return res.json({ ...data, cached: false })
    } catch (error) {
      const staleCache = cache.get(key)
      if (staleCache) {
        logger.warn('In-flight failed, returning stale cache', { key })
        return res.json({ ...staleCache, cached: true })
      }
    }
  }

  if (config.includePrivate && !config.githubToken) {
    logger.error('INCLUDE_PRIVATE set but GITHUB_TOKEN not provided')
    return res.status(400).json({ error: 'INCLUDE_PRIVATE set but GITHUB_TOKEN not provided' })
  }

  const fetchPromise = (async (): Promise<LanguageStats> => {
    try {
      const stats = await fetchLanguageStats(config.githubUsername, config.githubToken, config.includePrivate)
      cache.set(key, stats)
      return stats
    } finally {
      cache.clearInFlight(key)
    }
  })()

  cache.setInFlight(key, fetchPromise)
  logger.info('Cache miss, fetching data', { key })

  try {
    const data = await fetchPromise
    return res.json({ ...data, cached: false })
  } catch (error) {
    if (isRateLimitError(error)) {
      const rateLimitError = error as RateLimitError
      logger.error('GitHub rate limit exceeded', {
        retryAfter: rateLimitError.retryAfter,
        resetTime: rateLimitError.resetTime,
      })

      const staleCache = cache.get(key)
      if (staleCache) {
        logger.warn('Rate limited, returning stale cache', { key })
        return res.json({ ...staleCache, cached: true })
      }

      if (rateLimitError.retryAfter) {
        res.set('Retry-After', String(rateLimitError.retryAfter))
      } else if (rateLimitError.resetTime) {
        const retryAfter = Math.max(0, rateLimitError.resetTime - Math.floor(Date.now() / 1000))
        res.set('Retry-After', String(retryAfter))
      }

      return res.status(429).json({ error: 'GitHub API rate limit exceeded' })
    }

    logger.error('Failed to fetch GitHub data', { error: String(error) })

    const staleCache = cache.get(key)
    if (staleCache) {
      logger.warn('Fetch failed, returning stale cache', { key })
      return res.json({ ...staleCache, cached: true })
    }

    return res.status(503).json({ error: 'Failed to fetch GitHub data' })
  }
})

app.get('/healthz', (req: Request, res: Response) => {
  res.send('ok')
})

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' })
})

app.listen(config.port, () => {
  logger.info(`Server listening on port ${config.port}`, {
    username: config.githubUsername || '(not set)',
    cacheTtl: config.cacheTtlSeconds,
    hasToken: !!config.githubToken,
  })
})
