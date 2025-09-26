import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

export interface AppConfig {
  port: number;
  dataFile: string;
  adminUsername?: string;
  adminPassword?: string;
  sessionSecret?: string;
  n8nWebhookUrl?: string;
  n8nStatusWebhookUrl?: string;
  retryAttempts: number;
  retryDelayMs: number;
  requestTimeoutMs: number;
  pollingIntervalMs: number;
  pollingTimeoutMs: number;
  timezone?: string;
}

function toInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(cwd = process.cwd()): AppConfig {
  const dataFile = process.env.DATA_FILE
    ? path.resolve(cwd, process.env.DATA_FILE)
    : path.resolve(cwd, "data/data.json");

  return {
    port: toInt(process.env.PORT, 8080),
    dataFile,
    adminUsername: process.env.ADMIN_USERNAME,
    adminPassword: process.env.ADMIN_PASSWORD,
    sessionSecret: process.env.SESSION_SECRET,
    n8nWebhookUrl: process.env.N8N_WEBHOOK_URL,
    n8nStatusWebhookUrl: process.env.N8N_STATUS_WEBHOOK_URL,
    retryAttempts: toInt(process.env.N8N_RETRY_ATTEMPTS, 3),
    retryDelayMs: toInt(process.env.N8N_RETRY_DELAY_MS, 5000),
    requestTimeoutMs: toInt(process.env.N8N_TIMEOUT_MS, 60000),
    pollingIntervalMs: toInt(process.env.POLLING_INTERVAL_MS, 5000),
    pollingTimeoutMs: toInt(process.env.POLLING_TIMEOUT_MS, 600000),
    timezone: process.env.CRON_TIMEZONE,
  };
}

