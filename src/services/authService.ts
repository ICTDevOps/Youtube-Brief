import bcrypt from "bcryptjs";
import { StorageService } from "../storage";

export class AuthService {
  constructor(private readonly storage: StorageService) {}

  async validateCredentials(username: string, password: string): Promise<boolean> {
    const { adminUsername, adminPasswordHash } = this.storage.settings;
    if (!adminUsername || !adminPasswordHash) {
      throw new Error("Administrator credentials are not configured");
    }

    if (username !== adminUsername) {
      return false;
    }

    return bcrypt.compare(password, adminPasswordHash);
  }

  get sessionSecret(): string {
    const { sessionSecret } = this.storage.settings;
    if (!sessionSecret) {
      throw new Error("Session secret is not configured");
    }
    return sessionSecret;
  }
}

