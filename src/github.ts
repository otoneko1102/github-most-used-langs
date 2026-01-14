import {
  GitHubRepo,
  GitHubLanguages,
  GitHubColors,
  GitHubUser,
  GitHubCommit,
  LanguageData,
  RateLimitError,
  Profile,
  CommitActivity,
  ApiResponse,
} from "./types";
import { logger } from "./logger";
import { fetch, Agent, Response } from "undici";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_COLORS_URL =
  "https://raw.githubusercontent.com/ozh/github-colors/master/colors.json";
const DEFAULT_COLOR = "#8b8b8b";
const PER_PAGE = 100;
const COMMIT_WINDOW_DAYS = 30;

let colorsCache: GitHubColors | null = null;
let colorsCacheTime = 0;
const COLORS_CACHE_TTL = 86400 * 1000;

const agent = new Agent({
  keepAliveTimeout: 30000,
  keepAliveMaxTimeout: 60000,
  connections: 50,
});

function getHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "github-most-used-langs-api",
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }
  return headers;
}

function createRateLimitError(response: Response): RateLimitError {
  const error = new Error("GitHub API rate limit exceeded") as RateLimitError;
  const retryAfter = response.headers.get("Retry-After");
  const resetTime = response.headers.get("X-RateLimit-Reset");

  if (retryAfter) {
    error.retryAfter = parseInt(retryAfter, 10);
  }
  if (resetTime) {
    error.resetTime = parseInt(resetTime, 10);
  }

  return error;
}

async function checkResponse(response: Response): Promise<void> {
  if (response.status === 403) {
    const body = await response.text();
    if (
      body.includes("rate limit") ||
      body.includes("API rate limit exceeded")
    ) {
      throw createRateLimitError(response);
    }
    throw new Error(`GitHub API forbidden: ${body}`);
  }

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`,
    );
  }
}

async function fetchAllRepos(
  username: string,
  token?: string,
  includePrivate = false,
): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  let page = 1;
  const headers = getHeaders(token);

  if (includePrivate && token) {
    const userResp = await fetch(`${GITHUB_API_BASE}/user`, {
      headers,
      dispatcher: agent,
    });
    await checkResponse(userResp);
    const authUser = (await userResp.json()) as { login?: string };
    if (authUser?.login === username) {
      while (true) {
        const url = `${GITHUB_API_BASE}/user/repos?per_page=${PER_PAGE}&page=${page}&visibility=all`;
        logger.debug("Fetching user repos page", { page, url });

        const response = await fetch(url, { headers, dispatcher: agent });
        await checkResponse(response);

        const pageRepos = (await response.json()) as GitHubRepo[];
        const owned = pageRepos.filter((r) => r.owner?.login === username);

        if (owned.length === 0) {
          break;
        }

        repos.push(...owned);
        page++;

        if (page > 20) {
          logger.warn("Reached maximum page limit", {
            totalRepos: repos.length,
          });
          break;
        }
      }

      logger.info("Fetched all repos (including private)", {
        count: repos.length,
      });
      return repos;
    }

    logger.warn(
      "INCLUDE_PRIVATE requested but token owner does not match username; falling back to public repos",
      { username, tokenOwner: authUser?.login },
    );
  }

  while (true) {
    const url = `${GITHUB_API_BASE}/users/${encodeURIComponent(username)}/repos?per_page=${PER_PAGE}&page=${page}&type=owner`;
    logger.debug("Fetching repos page", { page, url });

    const response = await fetch(url, { headers, dispatcher: agent });
    await checkResponse(response);

    const pageRepos = (await response.json()) as GitHubRepo[];

    if (pageRepos.length === 0) {
      break;
    }

    repos.push(...pageRepos);
    page++;

    if (page > 20) {
      logger.warn("Reached maximum page limit", { totalRepos: repos.length });
      break;
    }
  }

  logger.info("Fetched all repos", { count: repos.length });
  return repos;
}

async function fetchUserProfile(
  username: string,
  token?: string,
): Promise<GitHubUser> {
  const headers = getHeaders(token);
  const url = `${GITHUB_API_BASE}/users/${encodeURIComponent(username)}`;
  const response = await fetch(url, { headers, dispatcher: agent });
  await checkResponse(response);
  return (await response.json()) as GitHubUser;
}

async function fetchRepoCommitsSince(
  owner: string,
  repo: string,
  since: string,
  token?: string,
): Promise<GitHubCommit[]> {
  const headers = getHeaders(token);
  const commits: GitHubCommit[] = [];
  let page = 1;

  while (true) {
    const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?since=${since}&per_page=${PER_PAGE}&page=${page}`;
    const response = await fetch(url, { headers, dispatcher: agent });

    if (response.status === 409) {
      return [];
    }

    await checkResponse(response);
    const pageCommits = (await response.json()) as GitHubCommit[];

    if (pageCommits.length === 0) break;

    commits.push(...pageCommits);
    page++;

    if (page > 10) break;
  }

  return commits;
}

function buildCommitActivity(
  commits: GitHubCommit[],
  windowDays: number,
): CommitActivity[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const dateMap: Record<string, number> = {};

  for (let i = 0; i < windowDays; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - (windowDays - 1 - i));
    const dateStr = d.toISOString().slice(0, 10);
    dateMap[dateStr] = 0;
  }

  for (const commit of commits) {
    const dateStr = commit.commit.author.date.slice(0, 10);
    if (dateStr in dateMap) {
      dateMap[dateStr]++;
    }
  }

  return Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

async function fetchRepoLanguages(
  languagesUrl: string,
  token?: string,
): Promise<GitHubLanguages> {
  const headers = getHeaders(token);
  const response = await fetch(languagesUrl, { headers, dispatcher: agent });
  await checkResponse(response);
  return (await response.json()) as GitHubLanguages;
}

async function fetchGitHubColors(): Promise<GitHubColors> {
  const now = Date.now();

  if (colorsCache && now - colorsCacheTime < COLORS_CACHE_TTL) {
    return colorsCache;
  }

  try {
    logger.debug("Fetching GitHub colors");
    const response = await fetch(GITHUB_COLORS_URL, { dispatcher: agent });
    if (!response.ok) {
      throw new Error(`Failed to fetch colors: ${response.status}`);
    }
    colorsCache = (await response.json()) as GitHubColors;
    colorsCacheTime = now;
    logger.info("Fetched GitHub colors", {
      count: Object.keys(colorsCache).length,
    });
    return colorsCache;
  } catch (error) {
    logger.warn("Failed to fetch GitHub colors, using cached or empty", {
      error: String(error),
    });
    return colorsCache || {};
  }
}

function getLanguageColor(language: string, colors: GitHubColors): string {
  const colorData = colors[language];
  return colorData?.color || DEFAULT_COLOR;
}

export async function fetchFullStats(
  username: string,
  token?: string,
  includePrivate = false,
  ttlSeconds = 3600,
): Promise<ApiResponse> {
  const startTime = Date.now();
  logger.info("Starting full stats fetch", { username });

  const [userProfile, colors, repos] = await Promise.all([
    fetchUserProfile(username, token),
    fetchGitHubColors(),
    fetchAllRepos(username, token, includePrivate),
  ]);

  let totalStars = 0;
  const languageBytes: Record<string, number> = {};
  let totalBytes = 0;
  const allCommits: GitHubCommit[] = [];

  const sinceDate = new Date();
  sinceDate.setUTCDate(sinceDate.getUTCDate() - COMMIT_WINDOW_DAYS);
  const sinceISO = sinceDate.toISOString();

  const BATCH_SIZE = 10;
  const processedRepos: Array<{
    stars: number;
    languages?: GitHubLanguages;
    commits?: GitHubCommit[];
  }> = [];

  for (let i = 0; i < repos.length; i += BATCH_SIZE) {
    const batch = repos.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (repo) => {
        const result: {
          stars: number;
          languages?: GitHubLanguages;
          commits?: GitHubCommit[];
        } = {
          stars: repo.stargazers_count || 0,
        };

        if (!repo.fork) {
          try {
            result.languages = await fetchRepoLanguages(
              repo.languages_url,
              token,
            );
          } catch (error) {
            if (isRateLimitError(error)) throw error;
            logger.warn("Failed to fetch languages for repo", {
              repo: repo.full_name,
              error: String(error),
            });
          }

          try {
            result.commits = await fetchRepoCommitsSince(
              repo.owner.login,
              repo.name,
              sinceISO,
              token,
            );
          } catch (error) {
            if (isRateLimitError(error)) throw error;
            logger.warn("Failed to fetch commits for repo", {
              repo: repo.full_name,
              error: String(error),
            });
          }
        }

        return result;
      }),
    );

    processedRepos.push(...batchResults);
  }

  for (const result of processedRepos) {
    totalStars += result.stars;

    if (result.languages) {
      for (const [lang, bytes] of Object.entries(result.languages)) {
        languageBytes[lang] = (languageBytes[lang] || 0) + bytes;
        totalBytes += bytes;
      }
    }

    if (result.commits) {
      allCommits.push(...result.commits);
    }
  }

  const languages: LanguageData[] = Object.entries(languageBytes)
    .map(([name, bytes]) => ({
      name,
      bytes,
      percentage:
        totalBytes > 0 ? Math.round((bytes / totalBytes) * 10000) / 100 : 0,
      color: getLanguageColor(name, colors),
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const commitActivity = buildCommitActivity(allCommits, COMMIT_WINDOW_DAYS);

  const fetchedAt = new Date().toISOString();
  const elapsed = Date.now() - startTime;

  const profile: Profile = {
    login: userProfile.login,
    name: userProfile.name,
    html_url: userProfile.html_url,
    avatar_url: userProfile.avatar_url,
    followers: userProfile.followers,
    public_repos: userProfile.public_repos,
    total_stars: totalStars,
    fetched_at: fetchedAt,
  };

  logger.info("Full stats fetch completed", {
    username,
    totalBytes,
    languageCount: languages.length,
    totalStars,
    commitCount: allCommits.length,
    elapsedMs: elapsed,
  });

  return {
    profile,
    languages,
    commit_activity: commitActivity,
    meta: {
      cached: false,
      cached_at: fetchedAt,
      ttl_seconds: ttlSeconds,
    },
  };
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return (
    error instanceof Error &&
    ((error as RateLimitError).retryAfter !== undefined ||
      (error as RateLimitError).resetTime !== undefined)
  );
}
