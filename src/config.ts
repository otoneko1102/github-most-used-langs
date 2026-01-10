export interface Config {
  port: number
  githubUsername: string
  githubToken: string | undefined
  cacheTtlSeconds: number
  allowedOrigins: string
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT) || 3086,
    githubUsername: process.env.GITHUB_USERNAME || '',
    githubToken: process.env.GITHUB_TOKEN,
    cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS) || 3600,
    allowedOrigins: process.env.ALLOWED_ORIGINS || '*',
  }
}
