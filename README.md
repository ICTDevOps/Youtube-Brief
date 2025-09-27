# YouTube Orchestrator for N8N

Lightweight application to schedule and trigger N8N workflows from multiple YouTube channels, with web interface and persistent JSON storage.

## Key Features

- Responsive web dashboard (Bootstrap) with session-based authentication
- Multi-channel management: add, edit, enable/disable, delete, manual trigger
- Individual scheduling via cron expressions (5 or 6 fields) with automatic next execution calculation
- Detailed execution history (success/error, timestamps, retries) with pagination
- HTTP integration with configurable N8N webhook, automatic retries and configurable timeout
- JSON storage on disk (Docker volume) with preserved logs (500 entries limit)
- Docker Compose startup/shutdown scripts

## Prerequisites

- Node.js 18+ (for local deployment outside Docker)
- Docker / Docker Compose (for containerized deployment)

## Environment Variables Configuration

Copy `.env.example` to `.env` and adapt the values:

```env
PORT=8080
N8N_WEBHOOK_URL=https://n8n.example.com/webhook/youtube
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
SESSION_SECRET=replace-this
N8N_RETRY_ATTEMPTS=3
N8N_RETRY_DELAY_MS=5000
N8N_TIMEOUT_MS=60000
CRON_TIMEZONE=Europe/Paris
```

> ⚠️ The `ADMIN_USERNAME` / `ADMIN_PASSWORD` pair must be provided on first startup to generate the hash stored in `data/data.json`.

### Variable Descriptions

| Variable | Description |
| --- | --- |
| `PORT` | HTTP port exposed by the server (default 8080). |
| `N8N_WEBHOOK_URL` | N8N webhook URL to trigger during scheduling. |
| `ADMIN_USERNAME` | Administrator username for UI login. |
| `ADMIN_PASSWORD` | Administrator password (hashed and stored at startup). |
| `SESSION_SECRET` | Secret used to sign Express sessions. |
| `N8N_RETRY_ATTEMPTS` | Number of webhook attempts (1 = no retry). |
| `N8N_RETRY_DELAY_MS` | Delay (ms) between attempts on failure. |
| `N8N_TIMEOUT_MS` | Timeout (ms) applied to webhook calls. |
| `CRON_TIMEZONE` | Timezone applied to cron expressions (ex: `Europe/Paris`). |

## Docker Deployment

```bash
# Build and start in background
./scripts/start.sh

# Stop and remove containers
./scripts/stop.sh
```

The Docker volume `orchestrator-data` contains `data/data.json` (channels, settings, logs). For first startup without shell scripts:

```bash
docker compose up -d --build
```

The application is accessible at `http://localhost:8080` (adjust according to `PORT`).

## Local Deployment (outside Docker)

```bash
npm install
npm run build
npm start
```

For development with TypeScript hot reload:

```bash
npm run dev
```

Data persists in `data/data.json`. Consider versioning only an example file if needed (`.env.example`).

## HTTP API

All `/api/*` routes require an authenticated session (except `/api/login`, `/api/session`, `/api/health`). Responses are in JSON format.

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Check service status (returns `{status: "ok"}`). |
| `POST` | `/api/login` | Authentication `{username, password}`. |
| `POST` | `/api/logout` | Logout current session. |
| `GET` | `/api/session` | Returns `{authenticated, username}`. |
| `GET` | `/api/channels` | List configured channels. |
| `POST` | `/api/channels` | Add channel `{youtubeChannelId, channelName, cronExpression, isActive?}`. |
| `PUT` | `/api/channels/:id` | Update channel. |
| `DELETE` | `/api/channels/:id` | Delete channel. |
| `POST` | `/api/channels/:id/trigger` | Manually trigger webhook for channel. |
| `GET` | `/api/logs?offset&limit` | Execution history (pagination). |
| `GET` | `/api/settings` | Current settings (webhook + admin credentials). |
| `PUT` | `/api/settings` | Update webhook and/or admin credentials. |

Error responses contain `{ error: string }` and optional `stack` in development mode.

## Project Structure

```
.
├─ src/                 # TypeScript backend (Express, scheduling, storage)
├─ public/              # Static UI (Bootstrap)
├─ data/data.json       # JSON storage (persistent via volume)
├─ scripts/             # Docker Compose start/stop scripts
├─ Dockerfile
├─ docker-compose.yml
├─ README.md
└─ .env.example
```

## Security Notes

- Passwords stored hashed with `bcrypt` (cost factor 12)
- Signed sessions, `httpOnly` and `sameSite=lax` cookies. Enable HTTPS via reverse proxy in production
- Simple server-side validation on required fields and cron expressions (via `node-cron`)
- The `data/data.json` file must be protected (contains admin hash and history)

## Quick Tests

```bash
# Check TypeScript compilation
npm run build

# Run in development
npm run dev
```

To verify scheduling, you can set a short cron expression (`*/1 * * * *`) and observe logs in the UI and `data/data.json`.

## License

MIT
