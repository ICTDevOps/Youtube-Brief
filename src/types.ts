export interface Channel {
  id: string;
  youtubeChannelId: string;
  channelName: string;
  cronExpression: string;
  isActive: boolean;
  videoLimit: number;
  daysBack: number;
  emails: string[];
  createdAt: string;
  lastExecution?: string;
  nextExecution?: string;
}

export type ExecutionStatus = 'pending' | 'started' | 'running' | 'success' | 'error' | 'cancelled';

export interface ExecutionLog {
  id: string;
  channelId: string;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  message: string;
  retries: number;
  jobId?: string;
  progress?: string;
  step?: string;
  estimatedTime?: string;
}

export interface Settings {
  n8nWebhookUrl: string;
  n8nStatusWebhookUrl: string;
  adminUsername: string;
  adminPasswordHash: string;
  sessionSecret: string;
  pollingIntervalMs: number;
  pollingTimeoutMs: number;
}

export interface DataStore {
  channels: Channel[];
  logs: ExecutionLog[];
  settings: Settings;
}

export interface CreateChannelInput {
  youtubeChannelId: string;
  channelName: string;
  cronExpression: string;
  isActive?: boolean;
  videoLimit?: number;
  daysBack?: number;
  emails?: string[];
}

export interface UpdateChannelInput {
  channelName?: string;
  cronExpression?: string;
  isActive?: boolean;
  videoLimit?: number;
  daysBack?: number;
  emails?: string[];
}

