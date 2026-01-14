import * as cron from "node-cron";
import { CacheManager } from "./cache";
import { fetchFullStats } from "./github";
import { logger } from "./logger";
import { Config } from "./config";

export class DataScheduler {
  private config: Config;
  private cache: CacheManager;
  private tasks: cron.ScheduledTask[] = [];

  constructor(config: Config, cache: CacheManager) {
    this.config = config;
    this.cache = cache;
  }

  start(): void {
    if (this.config.targetUsernames.length === 0) {
      logger.warn("No target usernames configured, scheduler not started");
      return;
    }

    const everyThreeHoursTask = cron.schedule(
      "0 */3 * * *",
      () => {
        this.fetchAllUserData("scheduled");
      },
      {
        timezone: "Asia/Tokyo",
      },
    );

    this.tasks.push(everyThreeHoursTask);

    logger.info("Scheduler started", {
      targetUsernames: this.config.targetUsernames,
      schedules: [
        "Every 3 hours (00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00 JST)",
      ],
    });

    this.fetchAllUserData("startup");
  }

  stop(): void {
    this.tasks.forEach((task) => task.stop());
    this.tasks = [];
    logger.info("Scheduler stopped");
  }

  private async fetchAllUserData(trigger: string): Promise<void> {
    logger.info("Starting scheduled data fetch", {
      trigger,
      userCount: this.config.targetUsernames.length,
    });

    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;

    for (const username of this.config.targetUsernames) {
      try {
        logger.info("Fetching data for user", { username, trigger });

        const stats = await fetchFullStats(
          username,
          this.config.githubToken,
          this.config.includePrivate,
          this.config.cacheTtlSeconds,
        );

        this.cache.set(username, stats);
        this.cache.saveToDisk(username);

        successCount++;
        logger.info("Successfully fetched and cached data", {
          username,
          trigger,
        });

        if (this.config.targetUsernames.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error) {
        failureCount++;
        logger.error("Failed to fetch data for user", {
          username,
          trigger,
          error: String(error),
        });

        continue;
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info("Scheduled data fetch completed", {
      trigger,
      successCount,
      failureCount,
      elapsedMs: elapsed,
    });
  }
}
