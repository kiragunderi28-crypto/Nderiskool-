import React, { useState, useEffect } from 'react';
import { useBiometric } from '../context/BiometricContext';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  ScanFace,
  ShieldCheck,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';

export const BiometricSecurityModal: React.FC = () => {
  const {
    status,
    capabilities,
    isSecurityModalOpen,
    setIsSecurityModalOpen,
    enrollCurrentDevice,
    unlockWithBiometrics,
    saveQuickPin,
    unlockWithPin,
    updateSettings,
    revokePasskey,
    lockNow,
  } = useBiometric();

  const [deviceLabel, setDeviceLabel] = useState<string>(capabilities.suggestedDeviceName);
  const [newPin, setNewPin] = useState<string>('');
  const [currentPinForEdit, setCurrentPinForEdit] = useState<string>('');
  const [unlockPinDraft, setUnlockPinDraft] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    setDeviceLabel(capabilities.suggestedDeviceName);
  }, [capabilities.suggestedDeviceName]);

  useEffect(() => {
    if (!isSecurityModalOpen) {
      setFeedback(null);
      setNewPin('');
      setCurrentPinForEdit('');
      setUnlockPinDraft('');
    }
  }, [isSecurityModalOpen]);

  if (!isSecurityModalOpen) return null;

  const needsReAuthToManage = status.protectionConfigured && !status.sessionVerified;
  const standaloneUrl = typeof window !== 'undefined' ? window.location.href : '/';
  const isApplePlatform = /Face ID|Touch ID/i.test(capabilities.platformLabel);

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setBusyAction('enroll');
    const res = await enrollCurrentDevice(deviceLabel);
    setBusyAction(null);
    if (res.ok) {
      setFeedback({
        type: 'success',
        text: `Enrolled "${res.deviceName || deviceLabel}" for ${capabilities.platformLabel}. You can now unlock or confirm transfers with a single touch.`,
      });
    } else {
      setFeedback({ type: 'error', text: res.error || 'Could not enroll biometric device.' });
    }
  };

  const handleTestOrVerifyBiometrics = async () => {
    setFeedback(null);
    setBusyAction('verify-bio');
    const res = await unlockWithBiometrics();
    setBusyAction(null);
    if (res.ok) {
      setFeedback({
        type: 'success',
        text: `Verified "${res.deviceName || capabilities.platformLabel}". Session authorized for security changes.`,
      });
    } else {
      setFeedback({ type: 'error', text: res.error || 'Biometric verification failed.' });
    }
  };

  const handleVerifySessionPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setBusyAction('verify-pin');
    const res = await unlockWithPin(unlockPinDraft);
    setBusyAction(null);
    if (res.ok) {
      setUnlockPinDraft('');
      setFeedback({ type: 'success', text: 'Quick PIN verified. Security controls unlocked.' });
    } else {
      setFeedback({ type: 'error', text: res.error || 'Incorrect Quick PIN.' });
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(newPin.trim())) {
      setFeedback({ type: 'error', text: 'Enter 4 to 8 numeric digits for your Quick PIN (6 digits recommended).' });
      return;
    }
    setFeedback(null);
    setBusyAction('save-pin');
    const res = await saveQuickPin(newPin.trim(), currentPinForEdit.trim() || undefined);
    setBusyAction(null);
    if (res.ok) {
      setNewPin('');
      setCurrentPinForEdit('');
      setFeedback({
        type: 'success',
        text: 'Quick PIN saved with server-side scrypt hashing.',
      });
    } else {
      setFeedback({ type: 'error', text: res.error || 'Unable to save Quick PIN.' });
    }
  };

  const handleToggleSetting = async (key: 'lockOnLaunch' | 'requireForTransfers', nextVal: boolean) => {
    setFeedback(null);
    setBusyAction(key);
    const res = await updateSettings({ [key]: nextVal });
    setBusyAction(null);
    if (res.ok) {
      setFeedback({
        type: 'success',
        text:
          key === 'lockOnLaunch'
            ? nextVal
              ? 'Terminal will require TouchID/FaceID or PIN on launch.'
              : 'Launch lock disabled.'
            : nextVal
            ? 'Mobile money transfers and withdrawals now require TouchID/FaceID confirmation.'
            : 'Transfer biometric confirmation disabled.',
      });
    } else {
      setFeedback({ type: 'error', text: res.error || 'Unable to update policy.' });
    }
  };

  const handleRevoke = async (id: string, name: string) => {
    setFeedback(null);
    setBusyAction(`revoke-${id}`);
    const res = await revokePasskey(id);
    setBusyAction(null);
    if (res.ok) {
      setFeedback({ type: 'info', text: `Removed biometric passkey "${name}".` });
    } else {
      setFeedback({ type: 'error', text: res.error || 'Unable to remove passkey.' });
    }
  };

  const handleLockTerminal = async () => {
    setFeedback(null);
    setBusyAction('lock-now');
    const res = await lockNow();
    setBusyAction(null);
    if (res.ok) {
      setIsSecurityModalOpen(false);
    } else {
      setFeedback({ type: 'error', text: res.error || 'Unable to lock terminal.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-3xl bg-white sm:rounded-2xl rounded-t-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-[#0b1930] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2bbbad]/20 border border-[#2bbbad]/40 flex items-center justify-center shrink-0">
              {isApplePlatform ? (
                <ScanFace className="w-5 h-5 text-[#2bbbad]" />
              ) : (
                <Fingerprint className="w-5 h-5 text-[#2bbbad]" />
              )}
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base text-white">
                Touch ID, Face ID &amp; Quick Access Security
              </h2>
              <p className="text-[11px] font-mono text-slate-300">
                {capabilities.platformLabel} ·{' '}
                {status.hasPasskeys
                  ? `${status.credentials.length} passkey${status.credentials.length === 1 ? '' : 's'} enrolled`
                  : 'No biometric passkey enrolled yet'}
                {status.hasPin ? ' · PIN Active' : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsSecurityModalOpen(false)}
            aria-label="Close Security Settings"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs">
          {feedback && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : feedback.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    feedback.type === 'error' ? 'text-rose-600' : 'text-slate-600'
                  }`}
                />
              )}
              <div className="space-y-1">
                <p className="font-medium leading-relaxed">{feedback.text}</p>
                {feedback.type === 'error' && capabilities.inIframe && (
                  <a
                    href={standaloneUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-[#0b1930] hover:underline"
                  >
                    <span>Open App in Full Browser Tab for TouchID / FaceID</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Iframe Mobile Tip */}
          {capabilities.inIframe && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-bold text-xs text-amber-900">
                  Mobile Preview Notice (Embedded Frame)
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  iOS Safari and Android Chrome sometimes block WebAuthn TouchID/FaceID prompts inside embedded preview iframes. Open the standalone tab on your phone for native biometrics, or set a 6-digit Quick PIN below.
                </p>
              </div>
              <a
                href={standaloneUrl}
                target="_blank"
                rel="noreferrer"
                className="min-h-[44px] px-3.5 rounded-xl bg-amber-900 hover:bg-amber-800 text-white font-semibold text-xs inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <span>Open Full Tab</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Verify Existing Session Gate (when protection exists & token isn't in memory yet) */}
          {needsReAuthToManage && (
            <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-3">
              <div className="flex items-center gap-2 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-[#2bbbad]" />
                <span>Verify Identity to Modify Security Keys or Policies</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5">
                {status.hasPasskeys && (
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={handleTestOrVerifyBiometrics}
                    className="min-h-[44px] px-4 rounded-xl bg-[#2bbbad] hover:bg-[#239b8f] text-[#0b1930] font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Fingerprint className="w-4 h-4" />
                    <span>{busyAction === 'verify-bio' ? 'Verifying...' : `Verify with ${capabilities.platformLabel}`}</span>
                  </button>
                )}
                {status.hasPin && (
                  <form onSubmit={handleVerifySessionPin} className="flex items-center gap-2 flex-1">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={unlockPinDraft}
                      onChange={(e) => setUnlockPinDraft(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter Quick PIN"
                      className="flex-1 min-h-[44px] px-3 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-[#2bbbad]"
                    />
                    <button
                      type="submit"
                      disabled={busyAction !== null || unlockPinDraft.length < 4}
                      className="min-h-[44px] px-4 rounded-xl bg-white text-slate-900 font-bold text-xs cursor-pointer disabled:opacity-50"
                    >
                      Verify PIN
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Column: WebAuthn Biometric Passkey Enrollment & Device List */}
            <div className="space-y-4">
              <form
                onSubmit={handleEnroll}
                className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
                    <Smartphone className="w-4 h-4 text-[#2bbbad]" />
                    <span>Enroll {capabilities.platformLabel}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">
                    {capabilities.platformAuthenticatorAvailable
                      ? 'Sensor Ready'
                      : capabilities.webauthnSupported
                      ? 'WebAuthn Ready'
                      : 'PIN Fallback Only'}
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Device Name
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={deviceLabel}
                    onChange={(e) => setDeviceLabel(e.target.value)}
                    placeholder="e.g. iPhone 15 Face ID"
                    className="w-full min-h-[44px] px-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-none focus:border-[#0b1930]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busyAction !== null || !capabilities.webauthnSupported}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-[#0b1930] hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Fingerprint className="w-4 h-4 text-[#2bbbad]" />
                  <span>
                    {busyAction === 'enroll'
                      ? 'Touch Biometric Sensor...'
                      : `Enable ${capabilities.platformLabel} on This Device`}
                  </span>
                </button>

                {status.hasPasskeys && (
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={handleTestOrVerifyBiometrics}
                    className="w-full min-h-[44px] px-4 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <ScanFace className="w-4 h-4 text-emerald-600" />
                    <span>{busyAction === 'verify-bio' ? 'Verifying...' : 'Test Biometric Prompt Now'}</span>
                  </button>
                )}
              </form>

              {/* Registered Passkeys List */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2.5">
                <div className="font-bold text-slate-900 text-xs">
                  Enrolled Biometric Devices ({status.credentials.length})
                </div>
                {status.credentials.length === 0 ? (
                  <p className="text-[11px] text-slate-500 py-2">
                    No TouchID / FaceID passkeys registered yet. Enroll your mobile phone or laptop above for 1-tap access.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {status.credentials.map((cred) => (
                      <div key={cred.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">{cred.deviceName}</div>
                          <div className="font-mono text-[10px] text-slate-500">
                            {cred.credentialDeviceType === 'multiDevice' ? 'Synced Passkey' : 'Device-Bound'} · Added{' '}
                            {new Date(cred.createdAt).toLocaleDateString()}
                            {cred.lastUsedAt ? ` · Used ${new Date(cred.lastUsedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => handleRevoke(cred.id, cred.deviceName)}
                          aria-label={`Remove ${cred.deviceName}`}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Quick PIN Fallback & Security Policies */}
            <div className="space-y-4">
              <form
                onSubmit={handleSavePin}
                className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
                    <KeyRound className="w-4 h-4 text-[#2bbbad]" />
                    <span>{status.hasPin ? 'Update 6-Digit Quick PIN' : 'Set Fallback Quick PIN'}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">
                    {status.hasPin ? 'Configured' : 'Optional'}
                  </span>
                </div>

                {status.hasPin && !status.sessionVerified && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Current Quick PIN
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={currentPinForEdit}
                      onChange={(e) => setCurrentPinForEdit(e.target.value.replace(/\D/g, ''))}
                      placeholder="Current PIN"
                      className="w-full min-h-[44px] px-3 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 focus:outline-none focus:border-[#0b1930]"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    New 4–8 Digit PIN (6 digits recommended)
                  </label>
                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={8}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••••"
                      className="w-full min-h-[44px] pl-3 pr-11 bg-white border border-slate-300 rounded-xl font-mono text-sm tracking-widest text-slate-900 focus:outline-none focus:border-[#0b1930]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin((s) => !s)}
                      aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                      className="absolute right-0 top-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busyAction !== null || newPin.length < 4}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold text-xs cursor-pointer transition-colors"
                >
                  {busyAction === 'save-pin' ? 'Hashing & Saving...' : status.hasPin ? 'Update Quick PIN' : 'Save Quick PIN'}
                </button>
              </form>

              {/* Access Policies */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
                <div className="font-bold text-slate-900 text-xs">Access &amp; Transfer Policies</div>

                <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer min-h-[44px]">
                  <div>
                    <div className="font-semibold text-slate-800">Lock Terminal on App Launch</div>
                    <div className="text-[11px] text-slate-500">
                      Prompt TouchID / FaceID or Quick PIN before loading charts and cashier.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={status.settings.lockOnLaunch}
                    disabled={busyAction !== null || !status.protectionConfigured}
                    onChange={(e) => handleToggleSetting('lockOnLaunch', e.target.checked)}
                    className="w-5 h-5 accent-[#2bbbad] shrink-0 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 py-1.5 border-t border-slate-100 cursor-pointer min-h-[44px]">
                  <div>
                    <div className="font-semibold text-slate-800">Confirm Transfers with Biometrics</div>
                    <div className="text-[11px] text-slate-500">
                      Require TouchID / FaceID approval before dispatching PayHero, KCB App, or M-Pesa payouts.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={status.settings.requireForTransfers}
                    disabled={busyAction !== null || !status.protectionConfigured}
                    onChange={(e) => handleToggleSetting('requireForTransfers', e.target.checked)}
                    className="w-5 h-5 accent-[#2bbbad] shrink-0 cursor-pointer"
                  />
                </label>

                <button
                  type="button"
                  disabled={!status.protectionConfigured || busyAction !== null}
                  onClick={handleLockTerminal}
                  className="w-full min-h-[48px] mt-1 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-900 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Lock className="w-4 h-4 text-[#0b1930]" />
                  <span>Lock Terminal Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const BiometricStepUpModal: React.FC = () => {
  const { status, capabilities, stepUpRequest, resolveStepUp, unlockWithBiometrics, unlockWithPin } = useBiometric();
  const [pinInput, setPinInput] = useState<string>('');
  const [usePinMode, setUsePinMode] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (stepUpRequest) {
      setErr(null);
      setPinInput('');
      setUsePinMode(!status.hasPasskeys && status.hasPin);
    }
  }, [stepUpRequest, status.hasPasskeys, status.hasPin]);

  if (!stepUpRequest) return null;

  const handleBioConfirm = async () => {
    setErr(null);
    setIsBusy(true);
    const res = await unlockWithBiometrics();
    setIsBusy(false);
    if (res.ok) {
      resolveStepUp(true);
    } else {
      setErr(res.error || 'Biometric approval failed.');
    }
  };

  const handlePinConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setIsBusy(true);
    const res = await unlockWithPin(pinInput);
    setIsBusy(false);
    if (res.ok) {
      resolveStepUp(true);
    } else {
      setErr(res.error || 'Incorrect Quick PIN.');
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/70 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-white sm:rounded-2xl rounded-t-3xl border border-slate-200 shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#0b1930] text-[#2bbbad] flex items-center justify-center shrink-0">
              <Fingerprint className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">{stepUpRequest.title}</h3>
              {stepUpRequest.subtitle && (
                <p className="text-xs text-slate-600 mt-0.5">{stepUpRequest.subtitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => resolveStepUp(false)}
            aria-label="Cancel Verification"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {err && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{err}</span>
          </div>
        )}

        {!usePinMode && status.hasPasskeys ? (
          <div className="space-y-2.5">
            <button
              type="button"
              disabled={isBusy}
              onClick={handleBioConfirm}
              className="w-full min-h-[48px] rounded-xl bg-[#0b1930] hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Fingerprint className="w-4 h-4 text-[#2bbbad]" />
              <span>{isBusy ? 'Verifying...' : `Confirm with ${capabilities.platformLabel}`}</span>
            </button>
            {status.hasPin && (
              <button
                type="button"
                onClick={() => setUsePinMode(true)}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs cursor-pointer"
              >
                Use Quick PIN Instead
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handlePinConfirm} className="space-y-3">
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter Quick PIN"
              className="w-full min-h-[48px] px-3 rounded-xl border border-slate-300 font-mono text-base tracking-widest text-center text-slate-900 focus:outline-none focus:border-[#0b1930]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => resolveStepUp(false)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isBusy || pinInput.length < 4}
                className="flex-1 min-h-[44px] rounded-xl bg-[#0b1930] text-white font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                {isBusy ? 'Verifying...' : 'Authorize'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
