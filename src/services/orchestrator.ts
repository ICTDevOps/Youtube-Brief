import cron, { ScheduledTask } from "node-cron";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import {
  Channel,
  CreateChannelInput,
  ExecutionLog,
  ExecutionStatus,
  UpdateChannelInput,
} from "../types";
import { StorageService } from "../storage";
import { AppConfig } from "../config";
import { computeNextExecutionISO, isCronExpressionValid } from "../utils/cron";
import { JobStatusService } from "./jobStatusService";

interface TriggerContext {
  manual: boolean;
  requestedBy?: string;
}

interface WebhookParams {
  channelId: string;
  limit: number;
  daysBack: number;
  emails: string[];
}

class WebhookDispatchError extends Error {
  constructor(message: string, public readonly retries: number, options?: { cause?: unknown }) {
    super(message);
    this.name = "WebhookDispatchError";
    if (options?.cause) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class OrchestratorService {
  private readonly jobs = new Map<string, ScheduledTask>();
  private readonly jobStatusService: JobStatusService;

  constructor(
    private readonly storage: StorageService,
    private readonly config: AppConfig,
  ) {
    this.jobStatusService = new JobStatusService(storage, config);
  }

  async bootstrap(): Promise<void> {
    await this.ensureInitialSettings();
    const channels = await this.storage.listChannels();
    await Promise.all(channels.map((channel) => this.applySchedule(channel.id)));
  }

  async listChannels(): Promise<Channel[]> {
    return this.storage.listChannels();
  }

  async listLogs(offset = 0, limit = 50): Promise<{ total: number; items: ExecutionLog[] }> {
    return this.storage.listLogs(offset, limit);
  }

  async clearAllLogs(): Promise<void> {
    // Stop all active polling when clearing logs
    this.jobStatusService.stopAllPolling();
    return this.storage.clearAllLogs();
  }

  async cancelJob(jobId: string): Promise<boolean> {
    return this.jobStatusService.cancelJob(jobId);
  }

  async getSettingsSummary(): Promise<{
    n8nWebhookUrl: string;
    n8nStatusWebhookUrl: string;
    adminUsername: string;
    activeJobsCount: number;
    pollingIntervalMs: number;
    pollingTimeoutMs: number;
  }> {
    const {
      n8nWebhookUrl,
      n8nStatusWebhookUrl,
      adminUsername,
      pollingIntervalMs,
      pollingTimeoutMs
    } = this.storage.settings;
    const activeJobsCount = this.jobStatusService.getActiveJobsCount();
    return {
      n8nWebhookUrl,
      n8nStatusWebhookUrl,
      adminUsername,
      activeJobsCount,
      pollingIntervalMs,
      pollingTimeoutMs
    };
  }

  async updateWebhookUrl(n8nWebhookUrl: string): Promise<void> {
    await this.storage.updateSettings({ n8nWebhookUrl: n8nWebhookUrl.trim() });
  }

  async updatePollingSettings(settings: {
    n8nStatusWebhookUrl?: string;
    pollingIntervalMs?: number;
    pollingTimeoutMs?: number;
  }): Promise<void> {
    const updates: Partial<SettingsUpdate> = {};

    if (settings.n8nStatusWebhookUrl !== undefined) {
      updates.n8nStatusWebhookUrl = settings.n8nStatusWebhookUrl.trim();
    }

    if (settings.pollingIntervalMs !== undefined) {
      updates.pollingIntervalMs = Math.max(1000, settings.pollingIntervalMs); // Min 1 second
    }

    if (settings.pollingTimeoutMs !== undefined) {
      updates.pollingTimeoutMs = Math.max(60000, settings.pollingTimeoutMs); // Min 1 minute
    }

    if (Object.keys(updates).length > 0) {
      await this.storage.updateSettings(updates);
    }
  }

  async updateAdminCredentials(username?: string, password?: string): Promise<void> {
    const updates: Partial<SettingsUpdate> = {};

    if (username) {
      updates.adminUsername = username.trim();
    }

    if (password) {
      updates.adminPasswordHash = await bcrypt.hash(password, 12);
    }

    if (Object.keys(updates).length === 0) {
      return;
    }

    await this.storage.updateSettings(updates);
  }

  async createChannel(input: CreateChannelInput): Promise<Channel> {
    if (!isCronExpressionValid(input.cronExpression)) {
      throw new Error("Invalid cron expression");
    }

    const now = new Date().toISOString();
    const channel: Channel = {
      id: randomUUID(),
      youtubeChannelId: input.youtubeChannelId.trim(),
      channelName: input.channelName.trim(),
      cronExpression: input.cronExpression.trim(),
      isActive: input.isActive ?? true,
      videoLimit: input.videoLimit ?? 5,
      daysBack: input.daysBack ?? 7,
      emails: input.emails ?? [],
      createdAt: now,
      lastExecution: undefined,
      nextExecution: undefined,
    };

    const created = await this.storage.addChannel(channel);
    await this.applySchedule(created.id);
    const refreshed = await this.storage.findChannel(created.id);
    return refreshed ?? created;
  }

  async updateChannel(channelId: string, input: UpdateChannelInput): Promise<Channel> {
    if (input.cronExpression && !isCronExpressionValid(input.cronExpression)) {
      throw new Error("Invalid cron expression");
    }

    const updated = await this.storage.updateChannel(channelId, (channel) => ({
      ...channel,
      channelName: input.channelName?.trim() ?? channel.channelName,
      cronExpression: input.cronExpression?.trim() ?? channel.cronExpression,
      isActive: input.isActive ?? channel.isActive,
      videoLimit: input.videoLimit ?? channel.videoLimit,
      daysBack: input.daysBack ?? channel.daysBack,
      emails: input.emails ?? channel.emails,
    }));

    if (!updated) {
      throw new Error("Channel not found");
    }

    await this.applySchedule(channelId);
    const refreshed = await this.storage.findChannel(channelId);
    return refreshed ?? updated;
  }

  async deleteChannel(channelId: string): Promise<void> {
    this.unschedule(channelId);
    await this.storage.removeChannel(channelId);
  }

  async triggerChannel(channelId: string, context: TriggerContext = { manual: true }): Promise<void> {
    await this.executeChannel(channelId, context);
  }

  async refreshSchedules(): Promise<void> {
    const channels = await this.storage.listChannels();
    await Promise.all(channels.map((channel) => this.applySchedule(channel.id)));
  }

  private get timezone(): string | undefined {
    return this.config.timezone || undefined;
  }

  private async applySchedule(channelId: string): Promise<void> {
    this.unschedule(channelId);
    const channel = await this.storage.findChannel(channelId);
    if (!channel) {
      return;
    }

    if (!channel.isActive) {
      await this.storage.updateChannel(channelId, (current) => ({
        ...current,
        nextExecution: undefined,
      }));
      return;
    }

    const nextExecution = computeNextExecutionISO(
      channel.cronExpression,
      new Date(),
      this.timezone,
    );

    await this.storage.updateChannel(channelId, (current) => ({
      ...current,
      nextExecution: nextExecution ?? undefined,
    }));

    const task = cron.schedule(
      channel.cronExpression,
      () => {
        void this.executeChannel(channelId, { manual: false });
      },
      {
        timezone: this.timezone,
      },
    );

    this.jobs.set(channelId, task);
  }

  private unschedule(channelId: string): void {
    const job = this.jobs.get(channelId);
    if (job) {
      job.stop();
      job.destroy();
      this.jobs.delete(channelId);
    }
  }

  private async executeChannel(channelId: string, context: TriggerContext): Promise<void> {
    const channel = await this.storage.findChannel(channelId);
    if (!channel) {
      return;
    }

    if (!channel.isActive && !context.manual) {
      return;
    }

    const webhookUrl = await this.resolveWebhookUrl();
    if (!webhookUrl) {
      throw new Error("N8N webhook URL is not configured");
    }

    const startedAt = new Date();
    const logId = randomUUID();

    // Create initial log entry with "pending" status
    const pendingLogEntry: ExecutionLog = {
      id: logId,
      channelId,
      status: "pending",
      startedAt: startedAt.toISOString(),
      message: "Exécution en cours...",
      retries: 0,
    };

    await this.storage.appendLog(pendingLogEntry);

    // Update channel last execution time
    await this.storage.updateChannel(channelId, (current) => ({
      ...current,
      lastExecution: startedAt.toISOString(),
      nextExecution:
        computeNextExecutionISO(current.cronExpression, new Date(), this.timezone) ?? current.nextExecution,
    }));

    // Execute webhook and update log with final result
    let status: ExecutionStatus = "success";
    let message = "Exécution terminée avec succès";
    let retries = 0;

    try {
      const result = await this.dispatchWebhook(webhookUrl, channel, context);
      retries = result.retries;

      // If we got a jobId, update the log and start polling after delay
      if (result.jobId) {
        await this.storage.updateLog(logId, {
          jobId: result.jobId,
          status: "started",
          message: "Job démarré, surveillance démarrera dans 10 secondes...",
        });

        // Start polling for job status after 10 seconds delay
        setTimeout(() => {
          if (result.jobId) {
            this.jobStatusService.startPolling(result.jobId, logId);
          }
        }, 10000);

        return; // Don't update to final status yet
      }
    } catch (error) {
      status = "error";
      if (error instanceof WebhookDispatchError) {
        retries = error.retries;
        message = error.message;
      } else if (error instanceof Error) {
        message = error.message;
      } else {
        message = "Erreur inconnue";
      }
    }

    const finishedAt = new Date();

    // Update the log entry with final status
    await this.storage.updateLog(logId, {
      status,
      finishedAt: finishedAt.toISOString(),
      message,
      retries,
    });
  }

  private async dispatchWebhook(
    webhookUrl: string,
    channel: Channel,
    context: TriggerContext,
  ): Promise<{ retries: number; jobId?: string }> {
    const params: WebhookParams = {
      channelId: channel.youtubeChannelId,
      limit: channel.videoLimit,
      daysBack: channel.daysBack,
      emails: channel.emails,
    };

    const attempts = Math.max(1, this.config.retryAttempts);
    const delayMs = Math.max(0, this.config.retryDelayMs);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const jobId = await this.getWithParams(webhookUrl, params);
        return { retries: attempt - 1, jobId };
      } catch (error) {
        lastError = error;
        if (attempt < attempts && delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : "Failed to trigger N8N webhook";

    throw new WebhookDispatchError(message, attempts - 1, { cause: lastError });
  }

  private async getWithParams(url: string, params: WebhookParams): Promise<string | undefined> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    const searchParams = new URLSearchParams({
      channelId: params.channelId,
      limit: params.limit.toString(),
      daysBack: params.daysBack.toString(),
      emails: params.emails.join(','),
    });

    const finalUrl = `${url}?${searchParams.toString()}`;

    try {
      const response = await fetch(finalUrl, {
        method: "GET",
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Webhook responded with status ${response.status}: ${text}`);
      }

      // Extract job_id from response header
      const jobId = response.headers.get('job_id');
      return jobId || undefined;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Webhook request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveWebhookUrl(): Promise<string | undefined> {
    const settings = this.storage.settings;
    if (settings.n8nWebhookUrl) {
      return settings.n8nWebhookUrl;
    }

    if (this.config.n8nWebhookUrl) {
      await this.storage.updateSettings({ n8nWebhookUrl: this.config.n8nWebhookUrl });
      return this.config.n8nWebhookUrl;
    }

    return undefined;
  }

  private async ensureInitialSettings(): Promise<void> {
    const current = this.storage.settings;
    const updates: Partial<SettingsUpdate> = {};

    // Always update with .env values on startup
    if (this.config.n8nWebhookUrl) {
      updates.n8nWebhookUrl = this.config.n8nWebhookUrl;
    }

    if (this.config.n8nStatusWebhookUrl) {
      updates.n8nStatusWebhookUrl = this.config.n8nStatusWebhookUrl;
    }

    if (this.config.adminUsername && this.config.adminUsername !== current.adminUsername) {
      updates.adminUsername = this.config.adminUsername;
    }

    // Always update polling settings with .env values
    updates.pollingIntervalMs = this.config.pollingIntervalMs;
    updates.pollingTimeoutMs = this.config.pollingTimeoutMs;

    if (this.config.adminPassword) {
      const hasPassword = current.adminPasswordHash;
      const samePassword = hasPassword
        ? await bcrypt.compare(this.config.adminPassword, hasPassword)
        : false;

      if (!samePassword) {
        updates.adminPasswordHash = await bcrypt.hash(this.config.adminPassword, 12);
      }
    }

    if (this.config.sessionSecret && this.config.sessionSecret !== current.sessionSecret) {
      updates.sessionSecret = this.config.sessionSecret;
    }

    if (!updates.sessionSecret && !current.sessionSecret) {
      updates.sessionSecret = randomUUID();
    }

    if (!current.adminUsername && !this.config.adminUsername && !updates.adminUsername) {
      throw new Error(
        "Administrator username is not configured. Provide ADMIN_USERNAME environment variable or set it in data store.",
      );
    }

    if (!current.adminPasswordHash && !updates.adminPasswordHash) {
      throw new Error(
        "Administrator password is not configured. Provide ADMIN_PASSWORD environment variable on first run.",
      );
    }

    if (Object.keys(updates).length > 0) {
      await this.storage.updateSettings(updates);
    }
  }
}

interface SettingsUpdate {
  n8nWebhookUrl?: string;
  n8nStatusWebhookUrl?: string;
  adminUsername?: string;
  adminPasswordHash?: string;
  sessionSecret?: string;
  pollingIntervalMs?: number;
  pollingTimeoutMs?: number;
}

