import React, { useState, useEffect } from 'react';
import { useBiometric } from '../context/BiometricContext';
import {
  AlertCircle,
  Delete,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Lock,
  ScanFace,
  ShieldCheck,
} from 'lucide-react';

export const BiometricLockScreen: React.FC = () => {
  const { status, capabilities, unlockWithBiometrics, unlockWithPin } = useBiometric();

  const [mode, setMode] = useState<'biometric' | 'pin'>(() =>
    status.hasPasskeys ? 'biometric' : 'pin'
  );
  const [pinDigits, setPinDigits] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldownSec, setCooldownSec] = useState<number>(0);

  useEffect(() => {
    if (!status.isLocked) {
      setPinDigits('');
      setErrorMsg(null);
      setIsVerifying(false);
    } else if (!status.hasPasskeys && status.hasPin) {
      setMode('pin');
    } else if (status.hasPasskeys) {
      setMode('biometric');
    }
  }, [status.isLocked, status.hasPasskeys, status.hasPin]);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setInterval(() => {
      setCooldownSec((s) => (s > 1 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSec]);

  if (!status.isLocked) return null;

  const handleBiometricUnlock = async () => {
    setErrorMsg(null);
    setIsVerifying(true);
    const res = await unlockWithBiometrics();
    setIsVerifying(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'Biometric authentication failed.');
    }
  };

  const submitPin = async (value: string) => {
    if (value.length < 4 || cooldownSec > 0) return;
    setErrorMsg(null);
    setIsVerifying(true);
    const res = await unlockWithPin(value);
    setIsVerifying(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'Incorrect Quick PIN.');
      setPinDigits('');
      if (res.retryAfterSec) {
        setCooldownSec(res.retryAfterSec);
      }
    }
  };

  const handleDigitPress = (digit: string) => {
    if (isVerifying || cooldownSec > 0) return;
    if (pinDigits.length >= 6) return;
    const next = `${pinDigits}${digit}`;
    setPinDigits(next);
    setErrorMsg(null);
    if (next.length === 6) {
      void submitPin(next);
    }
  };

  const handleBackspace = () => {
    if (isVerifying) return;
    setPinDigits((prev) => prev.slice(0, -1));
  };

  const standaloneUrl = typeof window !== 'undefined' ? window.location.href : '/';
  const isApplePlatform = /Face ID|Touch ID/i.test(capabilities.platformLabel);

  return (
    <div
      className="fixed inset-0 z-[100] bg-[#0b1930] text-white flex flex-col items-center justify-between p-5 sm:p-8 overflow-y-auto select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Terminal Biometric Lock Screen"
    >
      {/* Top Brand Header */}
      <div className="w-full max-w-md flex items-center justify-between pt-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-slate-900 ring-1 ring-[#2bbbad]/50 flex items-center justify-center">
            <Lock className="w-4 h-4 text-[#2bbbad]" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight text-white">nderiskool Terminal</div>
            <div className="text-[11px] font-mono text-slate-400">Session Locked · Quick Access</div>
          </div>
        </div>
        <ShieldCheck className="w-5 h-5 text-[#2bbbad]" />
      </div>

      {/* Center Biometric / Keypad Card */}
      <div className="w-full max-w-md my-auto py-6">
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#2bbbad]/15 border border-[#2bbbad]/30 flex items-center justify-center">
              {mode === 'biometric' ? (
                isApplePlatform ? (
                  <ScanFace className="w-8 h-8 text-[#2bbbad]" />
                ) : (
                  <Fingerprint className="w-8 h-8 text-[#2bbbad]" />
                )
              ) : (
                <KeyRound className="w-8 h-8 text-[#2bbbad]" />
              )}
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {mode === 'biometric' ? `Unlock with ${capabilities.platformLabel}` : 'Enter Trader Quick PIN'}
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed">
              {mode === 'biometric'
                ? 'Verify your registered mobile or hardware biometric passkey to resume trading and transfers.'
                : 'Enter your 6-digit Quick PIN to unlock the terminal.'}
            </p>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p>{errorMsg}</p>
                {capabilities.inIframe && (
                  <a
                    href={standaloneUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-semibold text-[#2bbbad] hover:underline"
                  >
                    <span>Open Full Tab for Native TouchID / FaceID</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          )}

          {mode === 'biometric' ? (
            <div className="space-y-3">
              <button
                type="button"
                disabled={isVerifying}
                onClick={handleBiometricUnlock}
                className="w-full min-h-[52px] rounded-2xl bg-[#2bbbad] hover:bg-[#239b8f] disabled:opacity-60 text-[#0b1930] font-bold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-[#2bbbad]/20 active:scale-[0.98] transition-all cursor-pointer"
              >
                <Fingerprint className="w-5 h-5" />
                <span>{isVerifying ? 'Waiting for Biometric Sensor...' : `Unlock with ${capabilities.platformLabel}`}</span>
              </button>

              {status.hasPin && (
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setMode('pin');
                  }}
                  className="w-full min-h-[44px] rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <KeyRound className="w-4 h-4 text-slate-400" />
                  <span>Use 6-Digit Quick PIN Instead</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* 6-Dot PIN Indicator */}
              <div className="flex items-center justify-center gap-3" aria-label={`Entered ${pinDigits.length} of 6 digits`}>
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const filled = idx < pinDigits.length;
                  return (
                    <div
                      key={idx}
                      className={`w-3.5 h-3.5 rounded-full transition-colors ${
                        filled ? 'bg-[#2bbbad]' : 'bg-slate-700 border border-slate-600'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Mobile Thumb Keypad (>= 52px targets) */}
              <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    disabled={isVerifying || cooldownSec > 0}
                    onClick={() => handleDigitPress(digit)}
                    className="min-h-[52px] rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-40 text-white font-mono text-lg font-bold transition-all cursor-pointer"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!status.hasPasskeys || isVerifying}
                  onClick={() => {
                    setErrorMsg(null);
                    setMode('biometric');
                  }}
                  aria-label="Switch to TouchID / FaceID"
                  className="min-h-[52px] rounded-2xl bg-slate-800/60 hover:bg-slate-700 disabled:opacity-30 text-[#2bbbad] flex items-center justify-center cursor-pointer transition-colors"
                >
                  <Fingerprint className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  disabled={isVerifying || cooldownSec > 0}
                  onClick={() => handleDigitPress('0')}
                  className="min-h-[52px] rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-40 text-white font-mono text-lg font-bold transition-all cursor-pointer"
                >
                  0
                </button>
                <button
                  type="button"
                  disabled={isVerifying || pinDigits.length === 0}
                  onClick={handleBackspace}
                  aria-label="Delete digit"
                  className="min-h-[52px] rounded-2xl bg-slate-800/60 hover:bg-slate-700 disabled:opacity-30 text-slate-300 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>

              {pinDigits.length >= 4 && pinDigits.length < 6 && (
                <button
                  type="button"
                  disabled={isVerifying || cooldownSec > 0}
                  onClick={() => submitPin(pinDigits)}
                  className="w-full min-h-[48px] rounded-xl bg-[#2bbbad] hover:bg-[#239b8f] text-[#0b1930] font-bold text-xs cursor-pointer"
                >
                  {isVerifying ? 'Verifying PIN...' : 'Unlock Terminal'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Subtle Security Summary */}
      <div className="w-full max-w-md text-center text-[11px] font-mono text-slate-400 pb-2">
        WebAuthn FIDO2 Platform Passkeys · Cryptographic Challenge Verification
      </div>
    </div>
  );
};
