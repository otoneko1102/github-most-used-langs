export interface Config {
  port: number
  githubUsername: string
  githubToken: string | undefined
  cacheTtlSeconds: number
  allowedOrigins: string
  includePrivate: boolean
  cacheDir: string
  targetUsernames: string[]
}

export function loadConfig(): Config {
  const targetUsers = process.env.TARGET_USERNAMES || process.env.GITHUB_USERNAME || ''
  const usernames = targetUsers.split(',').map(u => u.trim()).filter(u => u.length > 0)

  return {
    port: Number(process.env.PORT) || 3086,
    githubUsername: process.env.GITHUB_USERNAME || '',
    githubToken: process.env.GITHUB_TOKEN,
    cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS) || 3600,
    allowedOrigins: process.env.ALLOWED_ORIGINS || '*',
    includePrivate: process.env.INCLUDE_PRIVATE === 'true' || process.env.INCLUDE_PRIVATE === '1',
    cacheDir: process.env.CACHE_DIR || './cache',
    targetUsernames: usernames,
  }
}
