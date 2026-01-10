import { GitHubRepo, GitHubLanguages, GitHubColors, LanguageStats, LanguageData, RateLimitError } from './types'
import { logger } from './logger'

const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_COLORS_URL = 'https://raw.githubusercontent.com/ozh/github-colors/master/colors.json'
const DEFAULT_COLOR = '#8b8b8b'
const PER_PAGE = 100

let colorsCache: GitHubColors | null = null
let colorsCacheTime = 0
const COLORS_CACHE_TTL = 86400 * 1000

function getHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'github-most-used-langs-api',
  }
  if (token) {
    headers['Authorization'] = `token ${token}`
  }
  return headers
}

function createRateLimitError(response: Response): RateLimitError {
  const error = new Error('GitHub API rate limit exceeded') as RateLimitError
  const retryAfter = response.headers.get('Retry-After')
  const resetTime = response.headers.get('X-RateLimit-Reset')

  if (retryAfter) {
    error.retryAfter = parseInt(retryAfter, 10)
  }
  if (resetTime) {
    error.resetTime = parseInt(resetTime, 10)
  }

  return error
}

async function checkResponse(response: Response): Promise<void> {
  if (response.status === 403) {
    const body = await response.text()
    if (body.includes('rate limit') || body.includes('API rate limit exceeded')) {
      throw createRateLimitError(response)
    }
    throw new Error(`GitHub API forbidden: ${body}`)
  }

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
  }
}

async function fetchAllRepos(username: string, token?: string, includePrivate = false): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = []
  let page = 1
  const headers = getHeaders(token)

  if (includePrivate && token) {
    const userResp = await fetch(`${GITHUB_API_BASE}/user`, { headers })
    await checkResponse(userResp)
    const authUser = (await userResp.json()) as { login?: string }
    if (authUser?.login === username) {
      while (true) {
        const url = `${GITHUB_API_BASE}/user/repos?per_page=${PER_PAGE}&page=${page}&visibility=all`
        logger.debug('Fetching user repos page', { page, url })

        const response = await fetch(url, { headers })
        await checkResponse(response)

        const pageRepos = (await response.json()) as GitHubRepo[]
        const owned = pageRepos.filter(r => r.owner?.login === username)

        if (owned.length === 0) {
          break
        }

        repos.push(...owned)
        page++

        if (page > 20) {
          logger.warn('Reached maximum page limit', { totalRepos: repos.length })
          break
        }
      }

      logger.info('Fetched all repos (including private)', { count: repos.length })
      return repos
    }

    logger.warn('INCLUDE_PRIVATE requested but token owner does not match username; falling back to public repos', { username, tokenOwner: authUser?.login })
  }

  while (true) {
    const url = `${GITHUB_API_BASE}/users/${encodeURIComponent(username)}/repos?per_page=${PER_PAGE}&page=${page}&type=owner`
    logger.debug('Fetching repos page', { page, url })

    const response = await fetch(url, { headers })
    await checkResponse(response)

    const pageRepos = (await response.json()) as GitHubRepo[]

    if (pageRepos.length === 0) {
      break
    }

    repos.push(...pageRepos)
    page++

    if (page > 20) {
      logger.warn('Reached maximum page limit', { totalRepos: repos.length })
      break
    }
  }

  logger.info('Fetched all repos', { count: repos.length })
  return repos
}

export async function fetchLanguageStats(username: string, token?: string, includePrivate = false): Promise<LanguageStats> {
  const startTime = Date.now()
  logger.info('Starting language stats fetch', { username })

  const colors = await fetchGitHubColors()

  const repos = await fetchAllRepos(username, token, includePrivate)

  const languageBytes: Record<string, number> = {}
  let totalBytes = 0

  for (const repo of repos) {
    if (repo.fork) {
      continue
    }

    try {
      const languages = await fetchRepoLanguages(repo.languages_url, token)

      for (const [lang, bytes] of Object.entries(languages)) {
        languageBytes[lang] = (languageBytes[lang] || 0) + bytes
        totalBytes += bytes
      }
    } catch (error) {
      if ((error as RateLimitError).retryAfter !== undefined || (error as RateLimitError).resetTime !== undefined) {
        throw error
      }
      logger.warn('Failed to fetch languages for repo', { repo: repo.full_name, error: String(error) })
    }

    await new Promise(resolve => setTimeout(resolve, 50))
  }

  const languages: LanguageData[] = Object.entries(languageBytes)
    .map(([name, bytes]) => ({
      name,
      bytes,
      percentage: totalBytes > 0 ? Math.round((bytes / totalBytes) * 10000) / 100 : 0,
      color: getLanguageColor(name, colors),
    }))
    .sort((a, b) => b.bytes - a.bytes)

  const generatedAt = new Date().toISOString()
  const elapsed = Date.now() - startTime

  logger.info('Language stats fetch completed', {
    username,
    totalBytes,
    languageCount: languages.length,
    elapsedMs: elapsed,
  })

  return {
    username,
    totalBytes,
    generatedAt,
    cached: false,
    languages,
  }
}

async function fetchRepoLanguages(languagesUrl: string, token?: string): Promise<GitHubLanguages> {
  const headers = getHeaders(token)
  const response = await fetch(languagesUrl, { headers })
  await checkResponse(response)
  return (await response.json()) as GitHubLanguages
}

async function fetchGitHubColors(): Promise<GitHubColors> {
  const now = Date.now()

  if (colorsCache && now - colorsCacheTime < COLORS_CACHE_TTL) {
    return colorsCache
  }

  try {
    logger.debug('Fetching GitHub colors')
    const response = await fetch(GITHUB_COLORS_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch colors: ${response.status}`)
    }
    colorsCache = (await response.json()) as GitHubColors
    colorsCacheTime = now
    logger.info('Fetched GitHub colors', { count: Object.keys(colorsCache).length })
    return colorsCache
  } catch (error) {
    logger.warn('Failed to fetch GitHub colors, using cached or empty', { error: String(error) })
    return colorsCache || {}
  }
}

function getLanguageColor(language: string, colors: GitHubColors): string {
  const colorData = colors[language]
  return colorData?.color || DEFAULT_COLOR
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return (
    error instanceof Error &&
    ((error as RateLimitError).retryAfter !== undefined || (error as RateLimitError).resetTime !== undefined)
  )
}
