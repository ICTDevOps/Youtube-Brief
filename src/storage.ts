import { ensureFile, readJson, writeJson } from "fs-extra";
import path from "node:path";
import {
  Channel,
  DataStore,
  ExecutionLog,
  Settings,
} from "./types";

const MAX_LOG_ENTRIES = 500;

const clone = <T>(value: T): T => {
  const structured = (globalThis as typeof globalThis & {
    structuredClone?: <Value>(value: Value) => Value;
  }).structuredClone;

  if (typeof structured === "function") {
    return structured(value);
  }

  return JSON.parse(JSON.stringify(value));
};

const DEFAULT_DATA: DataStore = {
  channels: [],
  logs: [],
  settings: {
    n8nWebhookUrl: "",
    n8nStatusWebhookUrl: "",
    adminUsername: "",
    adminPasswordHash: "",
    sessionSecret: "",
    pollingIntervalMs: 5000,
    pollingTimeoutMs: 600000,
  },
};

function normalizeData(input: Partial<DataStore> | undefined): DataStore {
  const merged = {
    ...clone(DEFAULT_DATA),
    ...(input ?? {}),
  } as DataStore;

  merged.channels = Array.isArray(merged.channels) ? merged.channels : [];
  merged.logs = Array.isArray(merged.logs) ? merged.logs : [];
  merged.settings = {
    ...DEFAULT_DATA.settings,
    ...(merged.settings ?? {}),
  };

  // Normalize channels to include new fields with defaults
  merged.channels = merged.channels.map((channel) => ({
    ...channel,
    videoLimit: channel.videoLimit ?? 5,
    daysBack: channel.daysBack ?? 7,
  }));

  return merged;
}

export class StorageService {
  private data: DataStore = clone(DEFAULT_DATA);
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    await ensureFile(this.filePath);

    try {
      const existing = (await readJson(this.filePath)) as Partial<DataStore>;
      this.data = normalizeData(existing);
    } catch (error) {
      this.data = clone(DEFAULT_DATA);
      await this.persist();
    }
  }

  get snapshot(): DataStore {
    return clone(this.data);
  }

  get settings(): Settings {
    return clone(this.data.settings);
  }

  async updateSettings(update: Partial<Settings>): Promise<Settings> {
    await this.enqueue(async (draft) => {
      draft.settings = { ...draft.settings, ...update };
    });
    return this.settings;
  }

  async listChannels(): Promise<Channel[]> {
    return clone(this.data.channels);
  }

  async findChannel(channelId: string): Promise<Channel | undefined> {
    const found = this.data.channels.find((channel) => channel.id === channelId);
    return found ? clone(found) : undefined;
  }

  async addChannel(channel: Channel): Promise<Channel> {
    let stored: Channel = clone(channel);
    await this.enqueue(async (draft) => {
      stored = clone(channel);
      draft.channels.push(stored);
    });
    return clone(stored);
  }

  async updateChannel(
    channelId: string,
    mutator: (channel: Channel) => Channel | void,
  ): Promise<Channel | undefined> {
    let updated: Channel | undefined;
    await this.enqueue(async (draft) => {
      const index = draft.channels.findIndex((channel) => channel.id === channelId);
      if (index === -1) {
        return;
      }

      const base = draft.channels[index];
      const workingCopy = clone(base);
      const result = mutator(workingCopy);
      const nextChannel = (result as Channel | undefined) ?? workingCopy;
      draft.channels[index] = nextChannel;
      updated = clone(nextChannel);
    });
    return updated;
  }

  async removeChannel(channelId: string): Promise<boolean> {
    let removed = false;
    await this.enqueue(async (draft) => {
      const initialLength = draft.channels.length;
      draft.channels = draft.channels.filter((channel) => channel.id !== channelId);
      removed = draft.channels.length !== initialLength;
    });
    return removed;
  }

  async appendLog(entry: ExecutionLog): Promise<void> {
    await this.enqueue(async (draft) => {
      draft.logs.push(clone(entry));
      if (draft.logs.length > MAX_LOG_ENTRIES) {
        draft.logs = draft.logs.slice(-MAX_LOG_ENTRIES);
      }
    });
  }

  async updateLog(
    logId: string,
    updates: Partial<Pick<ExecutionLog, 'status' | 'finishedAt' | 'message' | 'retries' | 'jobId' | 'progress' | 'step' | 'estimatedTime'>>,
  ): Promise<ExecutionLog | undefined> {
    let updated: ExecutionLog | undefined;
    await this.enqueue(async (draft) => {
      const index = draft.logs.findIndex((log) => log.id === logId);
      if (index === -1) {
        return;
      }

      const currentLog = draft.logs[index];
      const updatedLog = { ...currentLog, ...updates };
      draft.logs[index] = updatedLog;
      updated = clone(updatedLog);
    });
    return updated;
  }

  async listLogs(offset = 0, limit = 50): Promise<{ total: number; items: ExecutionLog[] }> {
    const total = this.data.logs.length;
    const items = this.data.logs
      .slice()
      .reverse()
      .slice(offset, offset + limit)
      .map((entry) => clone(entry));
    return { total, items };
  }

  async clearAllLogs(): Promise<void> {
    await this.enqueue(async (draft) => {
      draft.logs = [];
    });
  }

  private async enqueue(mutator: (draft: DataStore) => Promise<void> | void): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const draft = clone(this.data);
      await mutator(draft);
      this.data = normalizeData(draft);
      await this.persist();
    });

    await this.writeQueue;
  }

  private async persist(): Promise<void> {
    await writeJson(this.filePath, this.data, { spaces: 2 });
  }
}

export function resolveDataFilePath(relativePath = "data/data.json"): string {
  return path.resolve(process.cwd(), relativePath);
}

