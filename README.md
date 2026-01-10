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

Returns the aggregated language statistics for the configured GitHub user.

Example response:

```json
{
  "username": "otoneko1102",
  "totalBytes": 1234567,
  "generatedAt": "2026-01-10T12:00:00.000Z",
  "cached": false,
  "languages": [
    { "name": "JavaScript", "bytes": 650000, "percentage": 52.64, "color": "#f1e05a" },
    { "name": "HTML", "bytes": 225000, "percentage": 18.21, "color": "#e34c26" }
  ]
}
```

Error responses:

- `400 Bad Request` - `GITHUB_USERNAME` not set
- `429 Too Many Requests` - GitHub API rate limit exceeded
- `503 Service Unavailable` - GitHub API error (when no cache is available)

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
