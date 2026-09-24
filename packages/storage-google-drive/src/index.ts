import type { StorageProvider } from "@mind-context/storage";

export interface GoogleDriveProviderConfiguration {
  readonly clientId: string;
  readonly workspaceFolderId: string;
}

export const GOOGLE_DRIVE_PROVIDER_ID = "google-drive";

/**
 * Slice 1 will implement this adapter using browser-side Google OAuth/Drive APIs.
 * The adapter boundary exists now so Google Drive never leaks into the core domain.
 */
export function createGoogleDriveStorageProvider(
  _configuration: GoogleDriveProviderConfiguration,
): StorageProvider {
  throw new Error("Google Drive storage provider is not implemented yet.");
}
