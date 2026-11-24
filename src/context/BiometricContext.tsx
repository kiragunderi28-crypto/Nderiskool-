import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  BiometricCapabilities,
  BiometricSettings,
  BiometricStatus,
  authenticateWithBiometrics,
  clearBiometricAccessToken,
  detectBiometricCapabilities,
  enrollBiometricPasskey,
  fetchBiometricStatus,
  lockTerminalSession,
  revokeBiometricCredential,
  setupQuickPin,
  updateBiometricSettings,
  verifyQuickPin,
} from '../services/biometricAuth';

interface StepUpRequest {
  title: string;
  subtitle?: string;
}

interface BiometricContextValue {
  status: BiometricStatus;
  capabilities: BiometricCapabilities;
  isLoading: boolean;
  isSecurityModalOpen: boolean;
  setIsSecurityModalOpen: (open: boolean) => void;
  stepUpRequest: StepUpRequest | null;
  resolveStepUp: (approved: boolean) => void;
  refreshStatus: () => Promise<void>;
  enrollCurrentDevice: (deviceName?: string) => Promise<{ ok: boolean; deviceName?: string; error?: string }>;
  unlockWithBiometrics: () => Promise<{ ok: boolean; deviceName?: string; error?: string }>;
  saveQuickPin: (pin: string, currentPin?: string) => Promise<{ ok: boolean; error?: string }>;
  unlockWithPin: (pin: string) => Promise<{ ok: boolean; error?: string; retryAfterSec?: number }>;
  updateSettings: (patch: Partial<BiometricSettings>) => Promise<{ ok: boolean; error?: string }>;
  revokePasskey: (id: string) => Promise<{ ok: boolean; error?: string }>;
  lockNow: () => Promise<{ ok: boolean; error?: string }>;
  requireStepUpAuth: (title: string, subtitle?: string) => Promise<boolean>;
}

const DEFAULT_STATUS: BiometricStatus = {
  protectionConfigured: false,
  hasPasskeys: false,
  hasPin: false,
  isLocked: false,
  sessionVerified: false,
  sessionMethod: null,
  sessionDeviceName: null,
  sessionExpiresAt: null,
  settings: {
    lockOnLaunch: false,
    requireForTransfers: false,
  },
  credentials: [],
};

const DEFAULT_CAPABILITIES: BiometricCapabilities = {
  webauthnSupported: false,
  platformAuthenticatorAvailable: false,
  inIframe: false,
  platformLabel: 'Touch ID / Face ID',
  suggestedDeviceName: 'Mobile Device',
};

const BiometricContext = createContext<BiometricContextValue | undefined>(undefined);

export const BiometricProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<BiometricStatus>(DEFAULT_STATUS);
  const [capabilities, setCapabilities] = useState<BiometricCapabilities>(DEFAULT_CAPABILITIES);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState<boolean>(false);
  const [stepUpRequest, setStepUpRequest] = useState<StepUpRequest | null>(null);
  const stepUpResolverRef = useRef<((approved: boolean) => void) | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await fetchBiometricStatus();
      setStatus(next);
    } catch {
      // preserve prior state on transient network failure
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const [caps] = await Promise.all([detectBiometricCapabilities(), refreshStatus()]);
      if (active) {
        setCapabilities(caps);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshStatus]);

  const enrollCurrentDevice = useCallback(
    async (deviceName?: string) => {
      const res = await enrollBiometricPasskey(
        deviceName?.trim() || capabilities.suggestedDeviceName,
        capabilities.inIframe
      );
      if (res.ok) {
        await refreshStatus();
      }
      return res;
    },
    [capabilities.inIframe, capabilities.suggestedDeviceName, refreshStatus]
  );

  const unlockWithBiometrics = useCallback(async () => {
    const res = await authenticateWithBiometrics(capabilities.inIframe);
    if (res.ok) {
      await refreshStatus();
    }
    return res;
  }, [capabilities.inIframe, refreshStatus]);

  const saveQuickPin = useCallback(
    async (pin: string, currentPin?: string) => {
      const res = await setupQuickPin(pin, currentPin);
      if (res.ok) {
        await refreshStatus();
      }
      return res;
    },
    [refreshStatus]
  );

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const res = await verifyQuickPin(pin);
      if (res.ok) {
        await refreshStatus();
      }
      return res;
    },
    [refreshStatus]
  );

  const updateSettings = useCallback(
    async (patch: Partial<BiometricSettings>) => {
      const res = await updateBiometricSettings(patch);
      if (res.ok) {
        await refreshStatus();
      }
      return { ok: res.ok, error: res.error };
    },
    [refreshStatus]
  );

  const revokePasskey = useCallback(
    async (id: string) => {
      const res = await revokeBiometricCredential(id);
      if (res.ok) {
        await refreshStatus();
      }
      return res;
    },
    [refreshStatus]
  );

  const lockNow = useCallback(async () => {
    const res = await lockTerminalSession();
    if (res.ok) {
      clearBiometricAccessToken();
      await refreshStatus();
    }
    return res;
  }, [refreshStatus]);

  const resolveStepUp = useCallback((approved: boolean) => {
    setStepUpRequest(null);
    if (stepUpResolverRef.current) {
      const resolver = stepUpResolverRef.current;
      stepUpResolverRef.current = null;
      resolver(approved);
    }
  }, []);

  const requireStepUpAuth = useCallback(
    async (title: string, subtitle?: string): Promise<boolean> => {
      if (!status.settings.requireForTransfers || !status.protectionConfigured) {
        return true;
      }
      return new Promise<boolean>((resolve) => {
        if (stepUpResolverRef.current) {
          stepUpResolverRef.current(false);
        }
        stepUpResolverRef.current = resolve;
        setStepUpRequest({ title, subtitle });
      });
    },
    [status.protectionConfigured, status.settings.requireForTransfers]
  );

  return (
    <BiometricContext.Provider
      value={{
        status,
        capabilities,
        isLoading,
        isSecurityModalOpen,
        setIsSecurityModalOpen,
        stepUpRequest,
        resolveStepUp,
        refreshStatus,
        enrollCurrentDevice,
        unlockWithBiometrics,
        saveQuickPin,
        unlockWithPin,
        updateSettings,
        revokePasskey,
        lockNow,
        requireStepUpAuth,
      }}
    >
      {children}
    </BiometricContext.Provider>
  );
};

export function useBiometric(): BiometricContextValue {
  const ctx = useContext(BiometricContext);
  if (!ctx) {
    throw new Error('useBiometric must be used within a BiometricProvider');
  }
  return ctx;
}
