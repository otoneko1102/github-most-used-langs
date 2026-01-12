import * as cron from 'node-cron'
import { CacheManager } from './cache'
import { fetchFullStats } from './github'
import { logger } from './logger'
import { Config } from './config'

export class DataScheduler {
  private config: Config
  private cache: CacheManager
  private tasks: cron.ScheduledTask[] = []

  constructor(config: Config, cache: CacheManager) {
    this.config = config
    this.cache = cache
  }

  start(): void {
    if (this.config.targetUsernames.length === 0) {
      logger.warn('No target usernames configured, scheduler not started')
      return
    }

    const midnightTask = cron.schedule('0 0 * * *', () => {
      this.fetchAllUserData('midnight')
    }, {
      timezone: 'Asia/Tokyo'
    })

    const noonTask = cron.schedule('0 12 * * *', () => {
      this.fetchAllUserData('noon')
    }, {
      timezone: 'Asia/Tokyo'
    })

    this.tasks.push(midnightTask, noonTask)

    logger.info('Scheduler started', {
      targetUsernames: this.config.targetUsernames,
      schedules: ['00:00 JST', '12:00 JST'],
    })

    this.fetchAllUserData('startup')
  }

  stop(): void {
    this.tasks.forEach(task => task.stop())
    this.tasks = []
    logger.info('Scheduler stopped')
  }

  private async fetchAllUserData(trigger: string): Promise<void> {
    logger.info('Starting scheduled data fetch', {
      trigger,
      userCount: this.config.targetUsernames.length,
    })

    const startTime = Date.now()
    let successCount = 0
    let failureCount = 0

    for (const username of this.config.targetUsernames) {
      try {
        logger.info('Fetching data for user', { username, trigger })

        const stats = await fetchFullStats(
          username,
          this.config.githubToken,
          this.config.includePrivate,
          this.config.cacheTtlSeconds
        )

        this.cache.set(username, stats)
        this.cache.saveToDisk(username)

        successCount++
        logger.info('Successfully fetched and cached data', { username, trigger })

        if (this.config.targetUsernames.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      } catch (error) {
        failureCount++
        logger.error('Failed to fetch data for user', {
          username,
          trigger,
          error: String(error),
        })

        continue
      }
    }

    const elapsed = Date.now() - startTime
    logger.info('Scheduled data fetch completed', {
      trigger,
      successCount,
      failureCount,
      elapsedMs: elapsed,
    })
  }
}
