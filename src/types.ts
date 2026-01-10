export interface LanguageData {
  name: string
  bytes: number
  percentage: number
  color: string
}

export interface LanguageStats {
  username: string
  totalBytes: number
  generatedAt: string
  cached: boolean
  languages: LanguageData[]
}

export interface CacheEntry {
  generatedAt: number
  data: LanguageStats
}

export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  fork: boolean
  languages_url: string
}

export interface GitHubLanguages {
  [language: string]: number
}

export interface GitHubColors {
  [language: string]: {
    color: string | null
    url?: string
  }
}

export interface RateLimitError extends Error {
  retryAfter?: number
  resetTime?: number
}
