import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';

export interface BiometricCredentialInfo {
  id: string;
  deviceName: string;
  credentialDeviceType: string;
  backedUp: boolean;
  transports: string[];
  createdAt: number;
  lastUsedAt: number | null;
}

export interface BiometricSettings {
  lockOnLaunch: boolean;
  requireForTransfers: boolean;
}

export interface BiometricStatus {
  protectionConfigured: boolean;
  hasPasskeys: boolean;
  hasPin: boolean;
  isLocked: boolean;
  sessionVerified: boolean;
  sessionMethod: 'webauthn' | 'pin' | 'enroll' | null;
  sessionDeviceName: string | null;
  sessionExpiresAt: number | null;
  settings: BiometricSettings;
  credentials: BiometricCredentialInfo[];
}

export interface BiometricCapabilities {
  webauthnSupported: boolean;
  platformAuthenticatorAvailable: boolean;
  inIframe: boolean;
  platformLabel: string;
  suggestedDeviceName: string;
}

// Security invariant: Bearer session token lives exclusively in JS memory (never localStorage/sessionStorage).
let inMemoryAccessToken: string | null = null;

export function getBiometricAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function clearBiometricAccessToken(): void {
  inMemoryAccessToken = null;
}

function buildAuthHeaders(extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
  if (inMemoryAccessToken) {
    headers.Authorization = `Bearer ${inMemoryAccessToken}`;
  }
  return headers;
}

export async function detectBiometricCapabilities(): Promise<BiometricCapabilities> {
  const webauthnSupported = typeof window !== 'undefined' && browserSupportsWebAuthn();
  let platformAuthenticatorAvailable = false;
  if (webauthnSupported) {
    try {
      platformAuthenticatorAvailable = await platformAuthenticatorIsAvailable();
    } catch {
      platformAuthenticatorAvailable = false;
    }
  }

  let inIframe = false;
  try {
    inIframe = typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    inIframe = true;
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  let platformLabel = 'Touch ID / Face ID';
  let suggestedDeviceName = 'Device Passkey';

  if (/iPhone/i.test(ua)) {
    platformLabel = 'Face ID / Touch ID';
    suggestedDeviceName = 'iPhone Face ID';
  } else if (/iPad/i.test(ua)) {
    platformLabel = 'Face ID / Touch ID';
    suggestedDeviceName = 'iPad Biometrics';
  } else if (/Android/i.test(ua)) {
    platformLabel = 'Fingerprint / Face Unlock';
    suggestedDeviceName = 'Android Biometrics';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    platformLabel = 'Touch ID';
    suggestedDeviceName = 'MacBook Touch ID';
  } else if (/Windows/i.test(ua)) {
    platformLabel = 'Windows Hello';
    suggestedDeviceName = 'Windows Hello Biometric';
  }

  return {
    webauthnSupported,
    platformAuthenticatorAvailable,
    inIframe,
    platformLabel,
    suggestedDeviceName,
  };
}

function mapWebAuthnError(err: unknown, inIframe: boolean): string {
  const name = (err as { name?: string })?.name || '';
  const message = (err as { message?: string })?.message || 'Biometric verification could not be completed.';

  if (name === 'NotAllowedError') {
    if (inIframe) {
      return 'Biometric prompt was blocked inside the embedded preview frame or cancelled. Use Open Full Tab for native TouchID/FaceID, or unlock with your 6-digit Quick PIN.';
    }
    return 'Biometric prompt was cancelled or timed out. Tap Unlock to try again or use your Quick PIN.';
  }
  if (name === 'SecurityError') {
    return 'Browser restricted WebAuthn inside this frame/origin. Open the terminal in its own browser tab for TouchID/FaceID or use your Quick PIN.';
  }
  if (name === 'InvalidStateError') {
    return 'This device authenticator is already enrolled on your trader profile.';
  }
  if (name === 'NotSupportedError') {
    return 'This browser or device does not expose a platform biometric authenticator. Set up a 6-digit Quick PIN instead.';
  }
  return message;
}

export async function fetchBiometricStatus(): Promise<BiometricStatus> {
  const res = await fetch('/api/auth/biometric/status', {
    method: 'GET',
    headers: buildAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || 'Unable to load biometric security status.');
  }
  return {
    protectionConfigured: Boolean(data.protectionConfigured),
    hasPasskeys: Boolean(data.hasPasskeys),
    hasPin: Boolean(data.hasPin),
    isLocked: Boolean(data.isLocked),
    sessionVerified: Boolean(data.sessionVerified),
    sessionMethod: data.sessionMethod || null,
    sessionDeviceName: data.sessionDeviceName || null,
    sessionExpiresAt: data.sessionExpiresAt || null,
    settings: {
      lockOnLaunch: Boolean(data.settings?.lockOnLaunch),
      requireForTransfers: Boolean(data.settings?.requireForTransfers),
    },
    credentials: Array.isArray(data.credentials) ? data.credentials : [],
  };
}

export async function enrollBiometricPasskey(
  deviceName?: string,
  inIframe = false
): Promise<{ ok: boolean; deviceName?: string; error?: string }> {
  try {
    const optRes = await fetch('/api/auth/biometric/register/options', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({}),
    });
    const optData = await optRes.json();
    if (!optRes.ok || !optData?.ok) {
      return { ok: false, error: optData?.error || 'Could not start biometric registration.' };
    }

    const registrationResponse = await startRegistration({ optionsJSON: optData.options });

    const verifyRes = await fetch('/api/auth/biometric/register/verify', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        challengeId: optData.challengeId,
        credential: registrationResponse,
        deviceName,
      }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || !verifyData?.verified) {
      return { ok: false, error: verifyData?.error || 'Server could not verify biometric passkey.' };
    }

    if (typeof verifyData.token === 'string' && verifyData.token) {
      inMemoryAccessToken = verifyData.token;
    }

    return { ok: true, deviceName: verifyData.credential?.deviceName || deviceName };
  } catch (err) {
    return { ok: false, error: mapWebAuthnError(err, inIframe) };
  }
}

export async function authenticateWithBiometrics(
  inIframe = false
): Promise<{ ok: boolean; deviceName?: string; error?: string }> {
  try {
    const optRes = await fetch('/api/auth/biometric/auth/options', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({}),
    });
    const optData = await optRes.json();
    if (!optRes.ok || !optData?.ok) {
      return { ok: false, error: optData?.error || 'No enrolled biometric credentials available.' };
    }

    const authResponse = await startAuthentication({ optionsJSON: optData.options });

    const verifyRes = await fetch('/api/auth/biometric/auth/verify', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        challengeId: optData.challengeId,
        credential: authResponse,
      }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || !verifyData?.verified) {
      return { ok: false, error: verifyData?.error || 'Biometric verification failed.' };
    }

    if (typeof verifyData.token === 'string' && verifyData.token) {
      inMemoryAccessToken = verifyData.token;
    }

    return { ok: true, deviceName: verifyData.deviceName };
  } catch (err) {
    return { ok: false, error: mapWebAuthnError(err, inIframe) };
  }
}

export async function setupQuickPin(
  pin: string,
  currentPin?: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/auth/pin/setup', {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ pin, currentPin }),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || 'Failed to save Quick PIN.' };
  }
  if (typeof data.token === 'string' && data.token) {
    inMemoryAccessToken = data.token;
  }
  return { ok: true };
}

export async function verifyQuickPin(
  pin: string
): Promise<{ ok: boolean; error?: string; retryAfterSec?: number }> {
  const res = await fetch('/api/auth/pin/verify', {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ pin }),
  });
  const data = await res.json();
  if (!res.ok || !data?.verified) {
    return {
      ok: false,
      error: data?.error || 'Incorrect Quick PIN.',
      retryAfterSec: data?.retryAfterSec,
    };
  }
  if (typeof data.token === 'string' && data.token) {
    inMemoryAccessToken = verifyTokenSafe(data.token);
  }
  return { ok: true };
}

function verifyTokenSafe(tok: unknown): string | null {
  return typeof tok === 'string' && tok.includes('.') ? tok : null;
}

export async function updateBiometricSettings(
  patch: Partial<BiometricSettings>
): Promise<{ ok: boolean; settings?: BiometricSettings; error?: string }> {
  const res = await fetch('/api/auth/biometric/settings', {
    method: 'PATCH',
    headers: buildAuthHeaders(),
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || 'Unable to update biometric policy.' };
  }
  return { ok: true, settings: data.settings };
}

export async function revokeBiometricCredential(
  credentialId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/auth/biometric/credentials/${encodeURIComponent(credentialId)}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || 'Unable to revoke passkey.' };
  }
  return { ok: true };
}

export async function lockTerminalSession(): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/auth/biometric/lock', {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || 'Unable to lock terminal.' };
  }
  clearBiometricAccessToken();
  return { ok: true };
}
