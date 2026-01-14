export interface LanguageData {
  name: string;
  bytes: number;
  percentage: number;
  color: string;
}

export interface Profile {
  login: string;
  name: string | null;
  html_url: string;
  avatar_url: string;
  followers: number;
  public_repos: number;
  total_stars: number;
  fetched_at: string;
}

export interface CommitActivity {
  date: string;
  count: number;
}

export interface ResponseMeta {
  cached: boolean;
  cached_at: string;
  ttl_seconds: number;
}

export interface ApiResponse {
  profile: Profile;
  languages: LanguageData[];
  commit_activity: CommitActivity[];
  meta: ResponseMeta;
}

export interface CacheEntry {
  generatedAt: number;
  data: ApiResponse;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  fork: boolean;
  languages_url: string;
  owner: { login: string };
  stargazers_count: number;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  html_url: string;
  avatar_url: string;
  followers: number;
  public_repos: number;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    author: {
      date: string;
    };
  };
}

export interface GitHubLanguages {
  [language: string]: number;
}

export interface GitHubColors {
  [language: string]: {
    color: string | null;
    url?: string;
  };
}

export interface RateLimitError extends Error {
  retryAfter?: number;
  resetTime?: number;
}

export interface LanguageStats {
  username: string;
  totalBytes: number;
  generatedAt: string;
  cached: boolean;
  languages: LanguageData[];
}
