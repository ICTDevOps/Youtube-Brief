# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run dev` - Start development server with TypeScript hot reload using nodemon
- `npm run build` - Compile TypeScript to JavaScript in the `dist/` directory
- `npm start` - Run the compiled production server from `dist/server.js`

### Docker
- `./scripts/start.sh` - Build and start Docker containers in the background
- `./scripts/stop.sh` - Stop and remove Docker containers
- `docker compose up -d --build` - Manual Docker Compose startup

## Architecture Overview

### Core Components

**Backend (TypeScript/Express)**
- `src/server.ts` - Main Express application with REST API routes and session-based authentication
- `src/storage.ts` - JSON file-based storage service with atomic writes and queued operations
- `src/services/orchestrator.ts` - Core business logic for channel management, cron scheduling, and N8N webhook integration
- `src/services/authService.ts` - Authentication service using bcrypt for password hashing

**Data Flow**
- Configuration loaded from environment variables and stored in `data/data.json`
- Channels are scheduled using `node-cron` with timezone support
- Webhook requests to N8N include retry logic with configurable attempts and delays
- Execution logs are stored with automatic pruning (max 500 entries)

**Frontend (Vanilla JS)**
- `public/index.html` - Single-page application with Bootstrap UI
- `public/app.js` - Client-side JavaScript for dashboard interactions
- `public/styles.css` - Custom CSS styling

### Key Data Structures

**Channel** (`src/types.ts:1-10`)
- Stores YouTube channel ID, name, cron expression, and scheduling metadata
- Tracks last execution time and calculates next execution automatically

**ExecutionLog** (`src/types.ts:14-22`)
- Records webhook execution results with timing, status, and retry information

**DataStore** (`src/types.ts:31-35`)
- Root data structure persisted to `data/data.json` containing channels, logs, and settings

### Storage Architecture

The `StorageService` class provides atomic JSON file operations with:
- Queued writes to prevent data corruption
- Automatic data normalization and validation
- Log rotation with configurable limits
- Clone-based immutability for thread safety

### Authentication & Security

- Session-based authentication with httpOnly cookies
- Bcrypt password hashing (cost factor 12)
- Helmet.js security headers
- Admin credentials stored as hashed values in data store

## Configuration

Environment variables are defined in `.env.example`. Key settings:
- `N8N_WEBHOOK_URL` - Target webhook for channel triggers
- `ADMIN_USERNAME`/`ADMIN_PASSWORD` - Initial admin credentials (password hashed on startup)
- `CRON_TIMEZONE` - Timezone for cron expression evaluation
- Retry configuration for webhook failures (`N8N_RETRY_ATTEMPTS`, `N8N_RETRY_DELAY_MS`, `N8N_TIMEOUT_MS`)

## Development Notes

- TypeScript compilation target is ES2021 with CommonJS modules
- Custom type definitions in `src/@types/express-session/` extend Express session types
- The application uses a multi-stage Docker build for production optimization
- Data persistence via Docker volume (`orchestrator-data:/app/data`)