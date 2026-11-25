import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { useBiometric } from '../context/BiometricContext';
import { KES_PER_USD_RATE, normalizeKenyanPhone, usdToKes } from '../utils/mpesa';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Landmark,
  Link2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wallet,
  XCircle,
} from 'lucide-react';

interface PayHeroBridgeStatus {
  loaded: boolean;
  connected: boolean;
  mode: 'PAYHERO_API_V2' | 'PAYHERO_WEBHOOK_BRIDGE';
  apiBaseUrl: string;
  apiConfigured: boolean;
  channelIdConfigured: boolean;
  channelId?: string;
  webhookSecretConfigured: boolean;
  merchantAccountId: string;
  callbackAuthGated: boolean;
  apiWarning?: string | null;
  urls: {
    checkoutUrl: string;
    apiBaseUrl: string;
    depositUrl: string;
    withdrawUrl: string;
    transferUrl: string;
    callbackUrl: string;
    confirmUrl: string;
    walletUrl: string;
  };
  stats: {
    total: number;
    pending: number;
    confirmed: number;
    rejected: number;
  };
}

interface PayHeroPanelProps {
  initialAction?: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
}

export const PayHeroPanel: React.FC<PayHeroPanelProps> = ({ initialAction }) => {
  const {
    account,
    realAccount,
    safaricomPhone,
    cashierTransactions,
    createPayHeroTransaction,
    verifyPayHeroTransactionStatus,
    cancelPendingWithdrawal,
  } = useTrading();
  const { requireStepUpAuth } = useBiometric();

  const [action, setAction] = useState<'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER'>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const d = params.get('direction')?.toUpperCase();
      if (d === 'DEPOSIT' || d === 'WITHDRAWAL' || d === 'TRANSFER') return d;
      const c = params.get('cashier')?.toLowerCase();
      if (c === 'transfer' || c === 'money_transfer') return 'TRANSFER';
    } catch {}
    return initialAction || 'DEPOSIT';
  });

  useEffect(() => {
    if (initialAction) {
      setAction(initialAction);
    }
  }, [initialAction]);
  const [transferFundingSource, setTransferFundingSource] = useState<'STANDALONE_GATEWAY' | 'DERIV_REAL'>('STANDALONE_GATEWAY');

  const [transferRail, setTransferRail] = useState<'mobile' | 'paybill' | 'till' | 'bank'>('mobile');
  const [usdAmount, setUsdAmount] = useState<number>(() => {
    try {
      const a = Number(new URLSearchParams(window.location.search).get('amount'));
      if (Number.isFinite(a) && a >= 10) return a;
    } catch {}
    return 25;
  });

  const [phone, setPhone] = useState<string>(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('phone');
      if (p && p.trim()) return p.trim();
    } catch {}
    return safaricomPhone;
  });

  const [networkCode, setNetworkCode] = useState<string>('63902');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountName, setAccountName] = useState<string>('');
  const [accountReference, setAccountReference] = useState<string>('');
  const [bankCode, setBankCode] = useState<string>('');
  const [targetAccount, setTargetAccount] = useState<'REAL' | 'CURRENT'>('REAL');

  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
  const [walletState, setWalletState] = useState<{
    checked: boolean;
    loading: boolean;
    balance?: number;
    currency?: string;
    error?: string;
  }>({ checked: false, loading: false });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [verifyingTxId, setVerifyingTxId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);
  const [rowStatusFeedback, setRowStatusFeedback] = useState<{
    txId: string;
    ok: boolean;
    text: string;
  } | null>(null);

  const [statusInfo, setStatusInfo] = useState<PayHeroBridgeStatus>(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return {
      loaded: false,
      connected: true,
      mode: 'PAYHERO_WEBHOOK_BRIDGE',
      apiBaseUrl: 'https://backend.payhero.co.ke',
      apiConfigured: false,
      channelIdConfigured: false,
      webhookSecretConfigured: false,
      merchantAccountId: 'PAYHERO-NDERISKOOL',
      callbackAuthGated: false,
      apiWarning: null,
      urls: {
        checkoutUrl: origin ? `${origin}/?cashier=payhero` : '/?cashier=payhero',
        apiBaseUrl: origin ? `${origin}/api/payhero` : '/api/payhero',
        depositUrl: origin ? `${origin}/api/payhero/deposit` : '/api/payhero/deposit',
        withdrawUrl: origin ? `${origin}/api/payhero/withdraw` : '/api/payhero/withdraw',
        transferUrl: origin ? `${origin}/api/payhero/transfer` : '/api/payhero/transfer',
        callbackUrl: origin ? `${origin}/api/payhero/callback` : '/api/payhero/callback',
        confirmUrl: origin ? `${origin}/api/payhero/confirm` : '/api/payhero/confirm',
        walletUrl: origin ? `${origin}/api/payhero/wallet` : '/api/payhero/wallet',
      },
      stats: { total: 0, pending: 0, confirmed: 0, rejected: 0 },
    };
  });

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('phone');
      if (p && p.trim()) return;
    } catch {}
    setPhone(safaricomPhone);
  }, [safaricomPhone]);

  const loadPayHeroStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/payhero/status');
      if (res.ok) {
        const data = await res.json();
        setStatusInfo((prev) => ({
          loaded: true,
          connected: data.connected !== false,
          mode: data.mode === 'PAYHERO_API_V2' ? 'PAYHERO_API_V2' : 'PAYHERO_WEBHOOK_BRIDGE',
          apiBaseUrl: String(data.apiBaseUrl || prev.apiBaseUrl),
          apiConfigured: Boolean(data.apiConfigured),
          channelIdConfigured: Boolean(data.channelIdConfigured),
          channelId: data.channelId ? String(data.channelId) : undefined,
          webhookSecretConfigured: Boolean(data.webhookSecretConfigured),
          merchantAccountId: String(data.merchantAccountId || prev.merchantAccountId),
          callbackAuthGated: Boolean(data.callbackAuthGated),
          apiWarning: data.apiWarning || null,
          urls: data.urls || prev.urls,
          stats: data.stats || prev.stats,
        }));
      } else {
        setStatusInfo((prev) => ({ ...prev, loaded: true }));
      }
    } catch {
      setStatusInfo((prev) => ({ ...prev, loaded: true }));
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    loadPayHeroStatus();
  }, [loadPayHeroStatus]);

  const handleCheckWallet = async () => {
    setWalletState({ checked: false, loading: true });
    try {
      const res = await fetch('/api/payhero/wallet');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setWalletState({
          checked: true,
          loading: false,
          balance: Number(data.balance ?? 0),
          currency: String(data.currency || 'KES'),
        });
      } else {
        setWalletState({
          checked: true,
          loading: false,
          error: String(data.error || 'PayHero service wallet unavailable.'),
        });
      }
    } catch {
      setWalletState({
        checked: true,
        loading: false,
        error: 'Unable to reach /api/payhero/wallet.',
      });
    }
  };

  const parsedPhone = normalizeKenyanPhone(phone);
  const kesAmount = usdToKes(Math.max(0, usdAmount));

  const effectiveFundingSource: 'STANDALONE_GATEWAY' | 'DERIV_REAL' =
    action === 'TRANSFER' ? transferFundingSource : 'DERIV_REAL';

  const amountValidationError = useMemo(() => {
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      return 'Enter a valid amount in USD.';
    }
    if (usdAmount < 10) {
      return 'Minimum PayHero transaction is $10.00 USD.';
    }
    if (action === 'TRANSFER' && effectiveFundingSource === 'STANDALONE_GATEWAY') {
      const maxStandaloneUsd = 10000;
      if (usdAmount > maxStandaloneUsd) {
        return `Maximum single PayHero transfer is $${maxStandaloneUsd.toLocaleString()} USD (KES ${usdToKes(
          maxStandaloneUsd
        ).toLocaleString()}).`;
      }
      return null;
    }
    if ((action === 'WITHDRAWAL' || (action === 'TRANSFER' && effectiveFundingSource === 'DERIV_REAL')) && usdAmount > realAccount.balance) {
      return `Insufficient Deriv Real balance ($${realAccount.balance.toFixed(2)} available on ${realAccount.loginId}).`;
    }
    return null;
  }, [action, effectiveFundingSource, realAccount.balance, realAccount.loginId, usdAmount]);

  const payheroHistory = useMemo(
    () => cashierTransactions.filter((t) => t.method === 'PAYHERO').slice(0, 10),
    [cashierTransactions]
  );

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1800);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setRowStatusFeedback(null);

    if (amountValidationError) {
      setFeedback({ type: 'error', text: amountValidationError });
      return;
    }

    if ((action !== 'TRANSFER' || transferRail === 'mobile') && !parsedPhone.valid) {
      setFeedback({
        type: 'error',
        text: 'Enter a valid Kenyan mobile number for PayHero (e.g. 0728424076 or +254793950512).',
      });
      return;
    }

    if (action === 'TRANSFER' && transferRail !== 'mobile' && accountNumber.trim().length < 4) {
      setFeedback({
        type: 'error',
        text: `Enter a valid ${transferRail.toUpperCase()} account/till/paybill number.`,
      });
      return;
    }

    if (action === 'TRANSFER' && transferRail === 'bank' && !bankCode.trim()) {
      setFeedback({
        type: 'error',
        text: 'Enter the destination Bank Code for PayHero bank transfer (e.g. 01 for KCB, 68 for Equity).',
      });
      return;
    }

    if (action === 'WITHDRAWAL' || action === 'TRANSFER') {
      const approved = await requireStepUpAuth(
        `Authorize PayHero ${action === 'TRANSFER' ? 'Transfer' : 'Withdrawal'}`,
        `$${usdAmount.toFixed(2)} USD (KES ${kesAmount.toLocaleString()})`
      );
      if (!approved) {
        setFeedback({ type: 'error', text: 'Biometric confirmation cancelled. Transfer was not sent.' });
        return;
      }
    }

    setIsSubmitting(true);
    const res = await createPayHeroTransaction({
      action,
      usdAmount,
      kesAmount,
      phone: parsedPhone.valid ? parsedPhone.local : undefined,
      transferRail,
      accountNumber: accountNumber.trim() || undefined,
      accountName: accountName.trim() || undefined,
      accountReference: accountReference.trim() || undefined,
      bankCode: bankCode.trim() || undefined,
      networkCode,
      targetAccount,
      fundingSource: effectiveFundingSource,
    });
    setIsSubmitting(false);

    if (!res.success) {
      setFeedback({ type: 'error', text: res.message });
      return;
    }

    setFeedback({
      type: res.confirmed ? 'success' : 'info',
      text: res.message,
    });
    loadPayHeroStatus();
  };

  const handleVerifyStatus = async (txId: string, refOrId: string) => {
    setVerifyingTxId(txId);
    setRowStatusFeedback(null);
    const res = await verifyPayHeroTransactionStatus(refOrId);
    setVerifyingTxId(null);
    setRowStatusFeedback({
      txId,
      ok: res.ok,
      text: res.message,
    });
    loadPayHeroStatus();
  };

  const safeAmt = Number.isFinite(usdAmount) && usdAmount >= 10 ? usdAmount : 25;
  const safePhone = encodeURIComponent(parsedPhone.local || phone || safaricomPhone);

  return (
    <div className="space-y-4">
      {/* PayHero Header */}
      <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-950 text-emerald-300 flex items-center justify-center shrink-0">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm">
                PayHero Kenya · Deposits, Withdrawals &amp; Money Transfers
              </h3>
              <span
                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                  statusInfo.apiConfigured
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                }`}
              >
                {statusInfo.apiConfigured ? 'PAYHERO API v2 LIVE' : 'PAYHERO WEBHOOK BRIDGE'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Account <strong className="font-mono text-slate-800">{statusInfo.merchantAccountId}</strong>
              {statusInfo.channelId ? (
                <>
                  {' '}
                  · Channel <strong className="font-mono text-slate-800">#{statusInfo.channelId}</strong>
                </>
              ) : null}{' '}
              {action === 'TRANSFER' && effectiveFundingSource === 'STANDALONE_GATEWAY' ? (
                <>
                  · <strong className="text-indigo-700 font-mono">Independent Money Transfer (No Deriv Required)</strong>
                </>
              ) : (
                <>
                  · Deriv Real{' '}
                  <strong className="text-emerald-700 font-mono">
                    {realAccount.loginId} (${realAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                  </strong>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCheckWallet}
            disabled={walletState.loading}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 font-mono text-[10px] font-bold cursor-pointer disabled:opacity-60"
          >
            <Landmark className="w-3 h-3" />
            <span>{walletState.loading ? 'Checking...' : 'Service Wallet'}</span>
          </button>
          <button
            type="button"
            onClick={loadPayHeroStatus}
            disabled={isLoadingStatus}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-800 font-mono text-[10px] font-bold cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingStatus ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {walletState.checked && (
        <div
          className={`px-3.5 py-2.5 rounded-xl border font-mono text-[11px] flex items-center justify-between gap-2 ${
            walletState.error
              ? 'bg-amber-50 border-amber-200 text-amber-950'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          {walletState.error ? (
            <span>{walletState.error}</span>
          ) : (
            <span>
              PayHero Service Wallet Balance:{' '}
              <strong>
                {walletState.currency} {Number(walletState.balance || 0).toLocaleString()}
              </strong>
            </span>
          )}
        </div>
      )}

      {/* PayHero Endpoints & Callback URLs */}
      <div className="p-3.5 bg-white border border-indigo-200 rounded-xl shadow-xs space-y-2.5">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-indigo-900 shrink-0" />
          <div>
            <h4 className="font-bold text-slate-900 text-xs">PayHero API v2 &amp; Webhook Bridge Endpoints</h4>
            <p className="text-[10px] text-slate-500">
              API credentials stay in server Secrets (PAYHERO_AUTH_TOKEN or PAYHERO_API_USERNAME + PAYHERO_API_PASSWORD, PAYHERO_CHANNEL_ID).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 font-mono text-[10px]">
          {[
            {
              key: 'deposit',
              label: 'PayHero Deposit STK Endpoint (GET opens UI · POST JSON triggers STK)',
              value: statusInfo.urls.depositUrl,
              openHref: `${statusInfo.urls.depositUrl}?amount=${safeAmt}&phone=${safePhone}`,
            },
            {
              key: 'withdraw',
              label: 'PayHero Withdrawal Endpoint (GET opens UI · POST JSON withdraws)',
              value: statusInfo.urls.withdrawUrl,
              openHref: `${statusInfo.urls.withdrawUrl}?amount=${safeAmt}&phone=${safePhone}`,
            },
            {
              key: 'transfer',
              label: 'PayHero Money Transfer Endpoint (Mobile / Paybill / Till / Bank)',
              value: statusInfo.urls.transferUrl,
              openHref: `${statusInfo.urls.transferUrl}?amount=${safeAmt}&phone=${safePhone}`,
            },
            {
              key: 'callback',
              label: 'PayHero Payment Webhook Callback URL (POST)',
              value: statusInfo.urls.callbackUrl,
            },
          ].map((item) => (
            <div
              key={item.key}
              className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-50 border border-slate-200"
            >
              <div className="min-w-0 flex-1">
                <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-bold">
                  {item.label}
                </span>
                <span className="text-slate-900 font-semibold break-all select-all">{item.value}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopy(item.key, item.value)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold cursor-pointer"
                >
                  {copiedKey === item.key ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-700">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                {item.openHref && (
                  <a
                    href={item.openHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-950 hover:bg-indigo-900 text-white font-bold"
                  >
                    <ExternalLink className="w-3 h-3 text-emerald-300" />
                    <span>Open</span>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        {statusInfo.loaded && statusInfo.apiWarning && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 font-mono text-[10px] leading-relaxed flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <span>{statusInfo.apiWarning}</span>
          </div>
        )}

        {statusInfo.loaded && statusInfo.callbackAuthGated && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 font-mono text-[10px] leading-relaxed flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Preview domain is auth-gated for external PayHero POST callbacks: set a public{' '}
              <strong>MPESA_CALLBACK_BASE_URL</strong> / <strong>APP_URL</strong> for instant{' '}
              <strong>/api/payhero/callback</strong> webhooks, or use <strong>Verify Status</strong> to poll{' '}
              <strong>/api/v2/transaction-status</strong> directly when PayHero API credentials are set.
            </span>
          </div>
        )}
      </div>

      {/* Action Switch: Deposit vs Withdrawal vs Money Transfer */}
      <div className="grid grid-cols-3 gap-2 p-1 bg-white border border-slate-200 rounded-xl shadow-xs font-mono text-xs">
        <button
          type="button"
          onClick={() => {
            setAction('DEPOSIT');
            setFeedback(null);
          }}
          className={`py-2.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer font-bold ${
            action === 'DEPOSIT'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4 shrink-0" />
          <span>Deposit</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setAction('WITHDRAWAL');
            setFeedback(null);
          }}
          className={`py-2.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer font-bold ${
            action === 'WITHDRAWAL'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <ArrowUpRight className="w-4 h-4 shrink-0" />
          <span>Withdraw</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setAction('TRANSFER');
            setFeedback(null);
          }}
          className={`py-2.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer font-bold ${
            action === 'TRANSFER'
              ? 'bg-indigo-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4 shrink-0" />
          <span>Money Transfer</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border font-mono text-[11px] flex items-start gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : feedback.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : feedback.type === 'error' ? (
            <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          )}
          <span className="leading-relaxed">{feedback.text}</span>
        </div>
      )}

      {/* PayHero Form */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
              {action === 'DEPOSIT'
                ? 'Target Deriv Account (PayHero STK Push)'
                : action === 'WITHDRAWAL'
                ? 'Source Deriv Real Account (PayHero B2C Payout)'
                : effectiveFundingSource === 'STANDALONE_GATEWAY'
                ? 'PayHero Standalone Money Transfer · No Deriv Account Required'
                : 'Source Deriv Real Account (PayHero Money Transfer)'}
            </span>
            <span className="font-mono font-bold text-slate-900 text-xs">
              {action === 'TRANSFER' && effectiveFundingSource === 'STANDALONE_GATEWAY'
                ? walletState.checked && walletState.balance !== undefined
                  ? `PayHero Service Wallet (${walletState.currency} ${Number(walletState.balance).toLocaleString()}) · Up to $10,000 USD`
                  : 'PayHero Service Wallet Direct Transfer · Up to $10,000 USD'
                : action !== 'DEPOSIT'
                ? `${realAccount.loginId} · $${realAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD Available`
                : targetAccount === 'REAL' || account.isReal
                ? `Deriv Real (${realAccount.loginId})`
                : `Demo Virtual (${account.loginId})`}
            </span>
          </div>

          {action === 'DEPOSIT' && !account.isReal ? (
            <div className="flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 font-mono text-[10px]">
              <button
                type="button"
                onClick={() => setTargetAccount('REAL')}
                className={`px-2.5 py-1 rounded-md cursor-pointer font-bold ${
                  targetAccount === 'REAL' ? 'bg-[#2bbbad] text-white' : 'text-slate-600'
                }`}
              >
                Deriv Real
              </button>
              <button
                type="button"
                onClick={() => setTargetAccount('CURRENT')}
                className={`px-2.5 py-1 rounded-md cursor-pointer font-bold ${
                  targetAccount === 'CURRENT' ? 'bg-[#0b1930] text-white' : 'text-slate-600'
                }`}
              >
                Demo Virtual
              </button>
            </div>
          ) : action === 'TRANSFER' ? (
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() => setTransferFundingSource('STANDALONE_GATEWAY')}
                  className={`px-2 py-1 rounded-md cursor-pointer font-bold ${
                    transferFundingSource === 'STANDALONE_GATEWAY' ? 'bg-indigo-700 text-white' : 'text-slate-600'
                  }`}
                >
                  No Deriv (Direct)
                </button>
                <button
                  type="button"
                  onClick={() => setTransferFundingSource('DERIV_REAL')}
                  className={`px-2 py-1 rounded-md cursor-pointer font-bold ${
                    transferFundingSource === 'DERIV_REAL' ? 'bg-slate-800 text-white' : 'text-slate-600'
                  }`}
                >
                  From Deriv Real
                </button>
              </div>
              {transferFundingSource === 'DERIV_REAL' && (
                <button
                  type="button"
                  onClick={() => setUsdAmount(Math.floor(realAccount.balance))}
                  className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-mono text-[10px] font-bold cursor-pointer"
                >
                  Max (${Math.floor(realAccount.balance)})
                </button>
              )}
            </div>
          ) : (
            action === 'WITHDRAWAL' && (
              <button
                type="button"
                onClick={() => setUsdAmount(Math.floor(realAccount.balance))}
                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-mono text-[10px] font-bold cursor-pointer"
              >
                Max Real (${Math.floor(realAccount.balance)})
              </button>
            )
          )}
        </div>

        {/* Money Transfer Destination Rail Switch */}
        {action === 'TRANSFER' && (
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-800 block">Transfer Destination Channel</span>
            <div className="grid grid-cols-4 gap-1.5 font-mono text-[10px]">
              {(
                [
                  { id: 'mobile', label: 'Mobile Wallet', icon: Smartphone },
                  { id: 'paybill', label: 'M-Pesa Paybill', icon: Building2 },
                  { id: 'till', label: 'BuyGoods Till', icon: Building2 },
                  { id: 'bank', label: 'Bank Account', icon: Landmark },
                ] as const
              ).map((rail) => {
                const Icon = rail.icon;
                return (
                  <button
                    key={rail.id}
                    type="button"
                    onClick={() => setTransferRail(rail.id)}
                    className={`py-2 px-2 rounded-lg border flex items-center justify-center gap-1 cursor-pointer font-bold transition-colors ${
                      transferRail === rail.id
                        ? 'bg-indigo-950 text-white border-indigo-950'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{rail.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Amount Input */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <label className="font-bold text-slate-800">
              {action === 'DEPOSIT'
                ? 'PayHero Deposit Amount (USD)'
                : action === 'WITHDRAWAL'
                ? 'PayHero Withdrawal Amount (USD)'
                : 'PayHero Transfer Amount (USD)'}
            </label>
            <span className="font-mono font-bold text-emerald-700 tabular-nums">
              = KES {kesAmount.toLocaleString()} @ {KES_PER_USD_RATE.toFixed(2)}
            </span>
          </div>

          <div className="relative mb-2">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-mono text-sm">$</span>
            <input
              type="number"
              min={10}
              step={5}
              value={usdAmount}
              onChange={(e) => setUsdAmount(Number(e.target.value))}
              className={`w-full pl-8 pr-3 py-2.5 bg-white border rounded-xl font-mono text-base text-slate-900 font-bold focus:outline-none tabular-nums ${
                amountValidationError
                  ? 'border-rose-400 focus:border-rose-600 bg-rose-50/30'
                  : 'border-slate-300 focus:border-indigo-600'
              }`}
            />
          </div>

          {amountValidationError && (
            <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-mono text-[10px] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>{amountValidationError}</span>
            </div>
          )}

          <div className="grid grid-cols-6 gap-1 font-mono text-[11px]">
            {[10, 25, 50, 100, 250, 500].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setUsdAmount(amt)}
                className={`py-1.5 rounded-lg border transition-colors cursor-pointer ${
                  usdAmount === amt
                    ? 'bg-indigo-950 text-white border-indigo-950 font-bold'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>

        {/* Phone / Destination Account Fields */}
        {action !== 'TRANSFER' || transferRail === 'mobile' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-800 text-xs flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Mobile Phone Number</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPhone('0728424076')}
                    className="text-[10px] font-mono font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    0728424076
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhone('0793950512')}
                    className="text-[10px] font-mono font-bold text-slate-600 hover:underline cursor-pointer"
                  >
                    0793950512
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0728424076"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-emerald-600"
              />
              {parsedPhone.valid && (
                <span className="text-[10px] font-mono text-emerald-700 block mt-1">
                  MSISDN: {parsedPhone.msisdn}
                </span>
              )}
            </div>

            <div>
              <label className="font-bold text-slate-800 text-xs block mb-1">
                {action === 'DEPOSIT' ? 'Customer Name (Optional)' : 'Mobile Network Code'}
              </label>
              {action === 'DEPOSIT' ? (
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="nderiskool Trader"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-indigo-600"
                />
              ) : (
                <select
                  value={networkCode}
                  onChange={(e) => setNetworkCode(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-indigo-600"
                >
                  <option value="63902">63902 · Safaricom M-Pesa</option>
                  <option value="63903">63903 · Airtel Money Kenya</option>
                </select>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-800 text-xs block mb-1">
                {transferRail === 'paybill'
                  ? 'Paybill Business Number'
                  : transferRail === 'till'
                  ? 'BuyGoods Till Number'
                  : 'Destination Bank Account Number'}
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder={transferRail === 'paybill' ? 'e.g. 247247' : transferRail === 'till' ? 'e.g. 123456' : 'e.g. 1100293847'}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-indigo-600"
              />
            </div>

            {transferRail === 'bank' ? (
              <div>
                <label className="font-bold text-slate-800 text-xs block mb-1">PayHero Bank Code</label>
                <input
                  type="text"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  placeholder="e.g. 01 (KCB) / 68 (Equity) / 11 (Co-op)"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-indigo-600"
                />
              </div>
            ) : (
              <div>
                <label className="font-bold text-slate-800 text-xs block mb-1">Account Reference / Description</label>
                <input
                  type="text"
                  value={accountReference}
                  onChange={(e) => setAccountReference(e.target.value)}
                  placeholder="Optional Paybill Account No."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-indigo-600"
                />
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="font-bold text-slate-800 text-xs block mb-1">Recipient / Account Name</label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Recipient full name or merchant name"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-indigo-600"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || Boolean(amountValidationError)}
          className={`w-full py-3.5 rounded-xl font-mono text-sm font-bold text-white shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 ${
            action === 'DEPOSIT'
              ? 'bg-emerald-600 hover:bg-emerald-500'
              : action === 'WITHDRAWAL'
              ? 'bg-rose-600 hover:bg-rose-500'
              : 'bg-indigo-700 hover:bg-indigo-600'
          }`}
        >
          {action === 'DEPOSIT' ? (
            <ArrowDownLeft className="w-4 h-4" />
          ) : action === 'WITHDRAWAL' ? (
            <ArrowUpRight className="w-4 h-4" />
          ) : (
            <ArrowRightLeft className="w-4 h-4" />
          )}
          <span>
            {isSubmitting
              ? 'SENDING TO PAYHERO...'
              : action === 'DEPOSIT'
              ? `PAYHERO STK DEPOSIT $${usdAmount.toFixed(2)} (KES ${kesAmount.toLocaleString()})`
              : action === 'WITHDRAWAL'
              ? `PAYHERO WITHDRAW $${usdAmount.toFixed(2)} (KES ${kesAmount.toLocaleString()})`
              : `PAYHERO TRANSFER $${usdAmount.toFixed(2)} (KES ${kesAmount.toLocaleString()})`}
          </span>
        </button>

        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span>
            Strict verification: PayHero transactions remain PENDING until PayHero API v2 /api/v2/transaction-status or callback webhook ({statusInfo.urls.callbackUrl}) confirms a provider receipt.
          </span>
        </div>
      </form>

      {/* PayHero Transactions Ledger */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-900 text-xs">PayHero Deposits, Withdrawals &amp; Money Transfers</span>
          <span className="text-[10px] font-mono text-slate-500">
            {payheroHistory.length} record{payheroHistory.length === 1 ? '' : 's'}
          </span>
        </div>

        {rowStatusFeedback && (
          <div
            className={`px-3 py-2 rounded-lg border font-mono text-[11px] ${
              rowStatusFeedback.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            {rowStatusFeedback.text}
          </div>
        )}

        {payheroHistory.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-center font-mono text-[11px] text-slate-500">
            No PayHero transactions submitted yet. Submit a deposit, withdrawal, or money transfer above.
          </div>
        ) : (
          <div className="space-y-2">
            {payheroHistory.map((item) => {
              const isDep = item.type === 'DEPOSIT';
              const isTransfer = item.payheroAction === 'TRANSFER';
              const isConfirmed = item.status === 'COMPLETED';
              const isRejected = item.status === 'REJECTED';
              const remoteRef = item.conversationId || item.reference;
              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border font-mono text-[11px] space-y-2 ${
                    isConfirmed
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : isRejected
                      ? 'bg-rose-50/40 border-rose-200'
                      : 'bg-amber-50/70 border-amber-300'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isDep
                              ? 'bg-emerald-600 text-white'
                              : isTransfer
                              ? 'bg-indigo-700 text-white'
                              : 'bg-rose-600 text-white'
                          }`}
                        >
                          {isDep ? 'PAYHERO DEPOSIT' : isTransfer ? 'PAYHERO TRANSFER' : 'PAYHERO WITHDRAWAL'}
                        </span>
                        <span className="font-bold text-slate-900">${item.amount.toFixed(2)} USD</span>
                        <span className="text-slate-500">Ref: {item.mpesaReceipt || item.reference}</span>
                      </div>
                      <span className="text-[10px] text-slate-600 block mt-0.5">
                        {item.safaricomConfirmationText || item.note}
                      </span>
                    </div>

                    <div className="shrink-0">
                      {isConfirmed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[10px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Confirmed</span>
                        </span>
                      ) : isRejected ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 font-bold text-[10px]">
                          <XCircle className="w-3 h-3" />
                          <span>Failed</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px]">
                          <Clock className="w-3 h-3" />
                          <span>Pending PayHero</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {!isConfirmed && !isRejected && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-amber-200/80">
                      <span className="text-[10px] text-amber-900">
                        Awaiting PayHero confirmation for {item.recipientPhone || item.destinationOrSource}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={verifyingTxId === item.id}
                          onClick={() => handleVerifyStatus(item.id, remoteRef)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-white text-[10px] font-bold cursor-pointer disabled:opacity-60"
                        >
                          <RefreshCw
                            className={`w-3 h-3 text-emerald-300 ${verifyingTxId === item.id ? 'animate-spin' : ''}`}
                          />
                          <span>{verifyingTxId === item.id ? 'Checking...' : 'Verify Status'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRowStatusFeedback(null);
                            cancelPendingWithdrawal(item.id);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
