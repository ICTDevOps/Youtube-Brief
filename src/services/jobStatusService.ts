import { StorageService } from "../storage";
import { AppConfig } from "../config";

interface JobPollingContext {
  jobId: string;
  logId: string;
  timerId: NodeJS.Timeout;
  startTime: number;
}

export class JobStatusService {
  private readonly activePolls = new Map<string, JobPollingContext>();

  constructor(
    private readonly storage: StorageService,
    private readonly config: AppConfig,
  ) {}

  startPolling(jobId: string, logId: string): void {
    // Stop existing polling for this job if any
    this.stopPolling(jobId);

    // Update log to indicate polling has started
    this.storage.updateLog(logId, {
      message: "Surveillance du statut en cours...",
    }).catch(error => {
      console.error(`Failed to update log ${logId}:`, error);
    });

    const startTime = Date.now();
    const timerId = setInterval(() => {
      void this.pollJobStatus(jobId, logId, startTime);
    }, this.config.pollingIntervalMs);

    this.activePolls.set(jobId, {
      jobId,
      logId,
      timerId,
      startTime,
    });

    console.log(`Started polling for job ${jobId} every ${this.config.pollingIntervalMs}ms`);
  }

  stopPolling(jobId: string): void {
    const context = this.activePolls.get(jobId);
    if (context) {
      clearInterval(context.timerId);
      this.activePolls.delete(jobId);
      console.log(`Stopped polling for job ${jobId}`);
    }
  }

  stopAllPolling(): void {
    for (const [jobId] of this.activePolls) {
      this.stopPolling(jobId);
    }
  }

  getActiveJobsCount(): number {
    return this.activePolls.size;
  }

  cancelJob(jobId: string): boolean {
    const context = this.activePolls.get(jobId);
    if (!context) {
      return false; // Job not found or already stopped
    }

    // Stop the polling
    this.stopPolling(jobId);

    // Update the log to indicate cancellation
    this.storage.updateLog(context.logId, {
      status: 'cancelled',
      message: 'Exécution annulée par l\'utilisateur',
      finishedAt: new Date().toISOString(),
    }).catch(error => {
      console.error(`Failed to update log ${context.logId} for cancellation:`, error);
    });

    console.log(`Job ${jobId} cancelled by user - polling stopped and status updated to 'cancelled'`);
    return true;
  }

  getActiveJobs(): Array<{ jobId: string; logId: string; startTime: number }> {
    return Array.from(this.activePolls.values()).map(context => ({
      jobId: context.jobId,
      logId: context.logId,
      startTime: context.startTime,
    }));
  }

  private async pollJobStatus(jobId: string, logId: string, startTime: number): Promise<void> {
    try {
      // Check timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= this.config.pollingTimeoutMs) {
        await this.handleTimeout(jobId, logId);
        return;
      }

      const statusWebhookUrl = this.resolveStatusWebhookUrl();
      if (!statusWebhookUrl) {
        console.error("N8N status webhook URL is not configured");
        this.stopPolling(jobId);
        return;
      }

      const status = await this.fetchJobStatus(statusWebhookUrl, jobId);
      if (status) {
        await this.updateLogWithStatus(logId, status);

        // Stop polling if job is finished
        if (this.isJobFinished(status)) {
          this.stopPolling(jobId);
        }
      }
    } catch (error) {
      console.error(`Error polling job ${jobId}:`, error);
      // Continue polling on error unless it's a critical error
    }
  }

  private async fetchJobStatus(baseUrl: string, jobId: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const url = `${baseUrl}?jobId=${encodeURIComponent(jobId)}`;
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      if (!response.ok) {
        console.error(`Status webhook responded with status ${response.status}`);
        return null;
      }

      // Extract status from response header
      const status = response.headers.get('status');
      return status;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error("Status webhook request timed out");
      } else {
        console.error("Status webhook request failed:", error);
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async updateLogWithStatus(logId: string, status: string): Promise<void> {
    const mappedStatus = this.mapN8NStatusToExecutionStatus(status);
    const message = this.getStatusMessage(status);

    const updateData: any = {
      status: mappedStatus,
      message,
    };

    // If job is finished, set finishedAt timestamp
    if (this.isJobFinished(status)) {
      updateData.finishedAt = new Date().toISOString();
    }

    await this.storage.updateLog(logId, updateData);
  }

  private mapN8NStatusToExecutionStatus(n8nStatus: string): string {
    switch (n8nStatus.toLowerCase()) {
      case 'en_cours':
      case 'running':
      case 'processing':
        return 'running';
      case 'complete':
      case 'completed':
      case 'success':
      case 'termine':
        return 'success';
      case 'error':
      case 'failed':
      case 'erreur':
        return 'error';
      case 'started':
      case 'demarré':
        return 'started';
      default:
        return 'running'; // Default to running for unknown statuses
    }
  }

  private getStatusMessage(status: string): string {
    switch (status.toLowerCase()) {
      case 'en_cours':
      case 'running':
      case 'processing':
        return 'Traitement en cours...';
      case 'complete':
      case 'completed':
      case 'success':
      case 'termine':
        return 'Exécution terminée avec succès';
      case 'error':
      case 'failed':
      case 'erreur':
        return 'Erreur lors de l\'exécution';
      case 'started':
      case 'demarré':
        return 'Job démarré';
      default:
        return `Statut: ${status}`;
    }
  }

  private isJobFinished(status: string): boolean {
    const finishedStatuses = [
      'complete', 'completed', 'success', 'termine',
      'error', 'failed', 'erreur', 'cancelled'
    ];
    return finishedStatuses.includes(status.toLowerCase());
  }

  private async handleTimeout(jobId: string, logId: string): Promise<void> {
    console.log(`Job ${jobId} polling timed out after ${this.config.pollingTimeoutMs}ms`);

    await this.storage.updateLog(logId, {
      status: 'error',
      message: 'Timeout: Surveillance du job interrompue',
      finishedAt: new Date().toISOString(),
    });

    this.stopPolling(jobId);
  }

  private resolveStatusWebhookUrl(): string | undefined {
    const settings = this.storage.settings;
    if (settings.n8nWebhookUrl && this.config.n8nStatusWebhookUrl) {
      return this.config.n8nStatusWebhookUrl;
    }

    if (this.config.n8nStatusWebhookUrl) {
      return this.config.n8nStatusWebhookUrl;
    }

    return undefined;
  }
}