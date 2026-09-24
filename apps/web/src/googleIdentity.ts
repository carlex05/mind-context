import { GOOGLE_DRIVE_FILE_SCOPE } from "@mind-context/storage-google-drive";

const GOOGLE_IDENTITY_SCRIPT =
  "https://accounts.google.com/gsi/client";
const SCRIPT_ID = "google-identity-services";

interface GoogleTokenResponse {
  readonly access_token?: string;
  readonly expires_in?: string;
  readonly error?: string;
  readonly error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken(config?: { readonly prompt?: string }): void;
}

interface GoogleOAuth2Api {
  initTokenClient(config: {
    readonly client_id: string;
    readonly scope: string;
    readonly callback: (response: GoogleTokenResponse) => void;
    readonly error_callback?: (error: unknown) => void;
  }): GoogleTokenClient;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: GoogleOAuth2Api;
      };
    };
  }
}

export interface GoogleDriveAuthSession {
  readonly accessToken: string;
  readonly expiresAt: number;
}

let scriptPromise: Promise<void> | undefined;

export async function requestGoogleDriveAccess(
  clientId: string,
): Promise<GoogleDriveAuthSession> {
  await loadGoogleIdentityServices();

  const oauth2 = window.google?.accounts.oauth2;
  if (!oauth2) {
    throw new Error("Google Identity Services did not initialize.");
  }

  return new Promise<GoogleDriveAuthSession>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_FILE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description ??
                response.error ??
                "Google authorization did not return an access token.",
            ),
          );
          return;
        }

        const expiresInSeconds = Number.parseInt(
          response.expires_in ?? "3600",
          10,
        );

        resolve({
          accessToken: response.access_token,
          expiresAt:
            Date.now() +
            (Number.isFinite(expiresInSeconds) ? expiresInSeconds : 3600) *
              1000,
        });
      },
      error_callback: () => {
        reject(new Error("Google authorization was interrupted."));
      },
    });

    client.requestAccessToken();
  });
}

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts.oauth2) {
    return Promise.resolve();
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Could not load Google Identity Services.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = GOOGLE_IDENTITY_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Could not load Google Identity Services."));
    document.head.append(script);
  });

  return scriptPromise;
}
