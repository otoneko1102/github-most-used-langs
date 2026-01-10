# GitHub Most Used Languages API

A simple HTTP API that aggregates byte counts per language across a GitHub user's public repositories and returns the language name, usage percentage (%), and color.

## Features

- Implemented in **TypeScript** + **Express**
- Server-side calculation of language usage percentages
- 1-hour cache (configurable)
- Rate-limit-aware implementation for the GitHub API
- `stale-if-error` behavior to preserve availability using stale cache on errors

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_USERNAME` | ✅ | - | GitHub username to aggregate |
| `GITHUB_TOKEN` | - | - | GitHub Personal Access Token (recommended to ease rate limits) |
| `PORT` | - | `3086` | Server port |
| `CACHE_TTL_SECONDS` | - | `3600` | Cache TTL in seconds |
| `ALLOWED_ORIGINS` | - | `*` | Allowed CORS origins (comma-separated) |
| `INCLUDE_PRIVATE` | - | `false` | Include private repositories (requires `GITHUB_TOKEN` and must be the same user) |

## Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## API Endpoints

### GET /

Returns aggregated language statistics, profile info, and recent commit activity for the configured GitHub user.

Example response:

```json
{
  "profile": {
    "login": "otoneko1102",
    "html_url": "https://github.com/otoneko1102",
    "avatar_url": "https://avatars.githubusercontent.com/u/...",
    "followers": 123,
    "public_repos": 42,
    "total_stars": 567,
    "fetched_at": "2026-01-10T12:00:00.000Z"
  },
  "languages": [
    { "name": "TypeScript", "bytes": 123456, "percentage": 56.12, "color": "#3178c6" },
    { "name": "JavaScript", "bytes": 65000, "percentage": 29.54, "color": "#f1e05a" }
  ],
  "commit_activity": [
    { "date": "2025-12-11", "count": 4 },
    { "date": "2025-12-12", "count": 2 }
  ],
  "meta": {
    "cached": false,
    "cached_at": "2026-01-10T12:00:00.000Z",
    "ttl_seconds": 3600
  }
}
```

Response fields:
- `profile`: User profile info including total stars across all repos
- `languages`: Language breakdown (bytes, percentage, color)
- `commit_activity`: Daily commit counts for the last 30 days (UTC, sorted ascending)
- `meta`: Cache status and TTL info

Error responses:

- `400 Bad Request` - `GITHUB_USERNAME` not set or invalid configuration
- `429 Too Many Requests` - GitHub API rate limit exceeded (stale cache returned if available)
- `500 Internal Server Error` - GitHub API failure (stale cache returned if available)

### GET /healthz

A simple health check endpoint.

Response: `ok`

## Deployment

### Start with PM2

```bash
# Edit `ecosystem.config.js` to set environment variables
npm run build
pm2 start ecosystem.config.js
```

### nginx reverse proxy

```nginx
server {
  listen 80;
  server_name github-most-used-langs.example.com;

  location / {
    proxy_pass http://127.0.0.1:3086;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Usage

```bash
curl -sS https://github-most-used-langs.example.com/ | jq
```

## License

MIT
