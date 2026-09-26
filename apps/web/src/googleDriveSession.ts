import type { AccessTokenProvider } from "@mind-context/storage-google-drive";
import type { GoogleDriveAuthSession } from "./googleIdentity";

export class MutableGoogleDriveAccessTokenProvider
  implements AccessTokenProvider
{
  private session: GoogleDriveAuthSession | undefined;

  constructor(private readonly unauthorized: () => void) {}

  setSession(session: GoogleDriveAuthSession): void {
    this.session = session;
  }

  clearSession(): void {
    this.session = undefined;
  }

  getSession(): GoogleDriveAuthSession | undefined {
    return this.session;
  }

  getAccessToken(): string {
    if (!this.session) {
      throw new Error("Google Drive is not connected.");
    }
    return this.session.accessToken;
  }

  onUnauthorized(accessToken: string): void {
    if (this.session?.accessToken !== accessToken) return;
    this.unauthorized();
  }
}
