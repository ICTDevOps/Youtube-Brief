/// <reference path="./@types/express-session/index.d.ts" />
import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import path from "node:path";
import helmet from "helmet";
import { loadConfig } from "./config";
import { StorageService } from "./storage";
import { OrchestratorService } from "./services/orchestrator";
import { AuthService } from "./services/authService";
import { validateEmailsList } from "./utils/validation";

const NODE_ENV = process.env.NODE_ENV ?? "development";

function asyncHandler<Handler extends express.RequestHandler>(handler: Handler): express.RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function createError(message: string, status = 400): Error & { status?: number } {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const storage = new StorageService(config.dataFile);
  await storage.init();

  const orchestrator = new OrchestratorService(storage, config);
  const authService = new AuthService(storage);
  await orchestrator.bootstrap();

  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
        fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use(
    session({
      secret: authService.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    }),
  );

  const requireAuth: express.RequestHandler = (req, res, next) => {
    if (req.session?.user) {
      next();
    } else {
      res.status(401).json({ error: "Authentication required" });
    }
  };

  app.get(
    "/api/health",
    asyncHandler(async (_req, res) => {
      res.json({ status: "ok" });
    }),
  );

  app.get(
    "/api/session",
    asyncHandler(async (req, res) => {
      res.json({
        authenticated: Boolean(req.session?.user),
        username: req.session?.user?.username ?? null,
      });
    }),
  );

  app.post(
    "/api/login",
    asyncHandler(async (req, res) => {
      const { username, password } = req.body as { username?: string; password?: string };

      if (!username || !password) {
        throw createError("Username and password are required", 400);
      }

      const isValid = await authService.validateCredentials(username, password);
      if (!isValid) {
        throw createError("Invalid credentials", 401);
      }

      req.session.user = { username };
      res.json({ username });
    }),
  );

  app.post(
    "/api/logout",
    asyncHandler(async (req, res) => {
      if (!req.session) {
        res.status(204).send();
        return;
      }

      await new Promise<void>((resolve, reject) => {
        req.session?.destroy((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      res.status(204).send();
    }),
  );

  const apiRouter = express.Router();
  apiRouter.use(requireAuth);

  apiRouter.get(
    "/settings",
    asyncHandler(async (_req, res) => {
      const settings = await orchestrator.getSettingsSummary();
      res.json(settings);
    }),
  );

  apiRouter.put(
    "/settings",
    asyncHandler(async (req, res) => {
      const {
        n8nWebhookUrl,
        n8nStatusWebhookUrl,
        adminUsername,
        adminPassword,
        pollingIntervalMs,
        pollingTimeoutMs
      } = req.body as {
        n8nWebhookUrl?: string;
        n8nStatusWebhookUrl?: string;
        adminUsername?: string;
        adminPassword?: string;
        pollingIntervalMs?: number;
        pollingTimeoutMs?: number;
      };

      if (n8nWebhookUrl) {
        await orchestrator.updateWebhookUrl(n8nWebhookUrl);
      }

      if (n8nStatusWebhookUrl !== undefined || pollingIntervalMs !== undefined || pollingTimeoutMs !== undefined) {
        await orchestrator.updatePollingSettings({
          n8nStatusWebhookUrl,
          pollingIntervalMs,
          pollingTimeoutMs
        });
      }

      if (adminUsername || adminPassword) {
        await orchestrator.updateAdminCredentials(adminUsername, adminPassword);
      }

      res.json(await orchestrator.getSettingsSummary());
    }),
  );

  apiRouter.get(
    "/channels",
    asyncHandler(async (_req, res) => {
      const channels = await orchestrator.listChannels();
      res.json(channels);
    }),
  );

  apiRouter.post(
    "/channels",
    asyncHandler(async (req, res) => {
      const { youtubeChannelId, channelName, cronExpression, isActive, videoLimit, daysBack, emails } = req.body as {
        youtubeChannelId?: string;
        channelName?: string;
        cronExpression?: string;
        isActive?: boolean;
        videoLimit?: number;
        daysBack?: number;
        emails?: string[];
      };

      if (!youtubeChannelId || !channelName || !cronExpression) {
        throw createError("youtubeChannelId, channelName and cronExpression are required", 400);
      }

      // Validate emails (required)
      if (!emails || emails.length === 0) {
        throw createError("Au moins une adresse email est requise", 400);
      }

      const emailValidation = validateEmailsList(emails);
      if (!emailValidation.valid) {
        throw createError(emailValidation.error || "Invalid emails", 400);
      }

      const channel = await orchestrator.createChannel({
        youtubeChannelId,
        channelName,
        cronExpression,
        isActive,
        videoLimit,
        daysBack,
        emails,
      });

      res.status(201).json(channel);
    }),
  );

  apiRouter.put(
    "/channels/:id",
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { channelName, cronExpression, isActive, videoLimit, daysBack, emails } = req.body as {
        channelName?: string;
        cronExpression?: string;
        isActive?: boolean;
        videoLimit?: number;
        daysBack?: number;
        emails?: string[];
      };

      // Validate emails if provided (and require them if explicitly set)
      if (emails !== undefined) {
        if (emails.length === 0) {
          throw createError("Au moins une adresse email est requise", 400);
        }
        
        const emailValidation = validateEmailsList(emails);
        if (!emailValidation.valid) {
          throw createError(emailValidation.error || "Invalid emails", 400);
        }
      }

      const channel = await orchestrator.updateChannel(id, {
        channelName,
        cronExpression,
        isActive,
        videoLimit,
        daysBack,
        emails,
      });

      res.json(channel);
    }),
  );

  apiRouter.delete(
    "/channels/:id",
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      await orchestrator.deleteChannel(id);
      res.status(204).send();
    }),
  );

  apiRouter.post(
    "/channels/:id/trigger",
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const username = req.session?.user?.username ?? "unknown";
      await orchestrator.triggerChannel(id, { manual: true, requestedBy: username });
      res.status(202).json({ status: "queued" });
    }),
  );

  apiRouter.get(
    "/logs",
    asyncHandler(async (req, res) => {
      const offset = Number.parseInt((req.query.offset as string) ?? "0", 10) || 0;
      const limit = Number.parseInt((req.query.limit as string) ?? "5", 10) || 5;
      const logs = await orchestrator.listLogs(offset, limit);
      res.json(logs);
    }),
  );

  apiRouter.delete(
    "/logs",
    asyncHandler(async (req, res) => {
      await orchestrator.clearAllLogs();
      res.status(204).send();
    }),
  );

  apiRouter.post(
    "/jobs/:jobId/cancel",
    asyncHandler(async (req, res) => {
      const { jobId } = req.params;
      const cancelled = await orchestrator.cancelJob(jobId);

      if (cancelled) {
        res.json({ success: true, message: "Job cancelled successfully" });
      } else {
        res.status(404).json({ success: false, message: "Job not found or already finished" });
      }
    }),
  );

  app.use("/api", apiRouter);

  const publicDir = path.resolve(__dirname, "../public");
  app.use(express.static(publicDir));

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }

    res.sendFile(path.join(publicDir, "index.html"), (error) => {
      if (error) {
        next(error);
      }
    });
  });

  app.use(
    (err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status ?? 500;
      const payload: Record<string, unknown> = {
        error: err.message || "Internal server error",
      };
      if (NODE_ENV !== "production" && err.stack) {
        payload.stack = err.stack;
      }
      res.status(status).json(payload);
    },
  );

  app.listen(config.port, () => {
    console.log(`YouTube orchestrator listening on port ${config.port}`);
  });
}

main().catch((error) => {
  console.error("Failed to start application", error);
  process.exit(1);
});

