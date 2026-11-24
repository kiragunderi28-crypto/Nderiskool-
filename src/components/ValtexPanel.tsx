import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { KES_PER_USD_RATE, normalizeKenyanPhone, usdToKes } from '../utils/mpesa';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Link2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wallet,
  XCircle,
  AlertCircle,
} from 'lucide-react';

interface ValtexBridgeStatus {
  loaded: boolean;
  connected: boolean;
  mode: 'EXTERNAL_VALTEX_API' | 'VALTEX_WEBHOOK_BRIDGE';
  externalApiConfigured: boolean;
  invalidExternalApiUrl?: boolean;
  externalApiWarning?: string | null;
  webhookSecretConfigured: boolean;
  merchantId: string;
  callbackAuthGated: boolean;
  urls: {
    checkoutUrl: string;
    apiBaseUrl: string;
    depositUrl: string;
    withdrawUrl: string;
    transferUrl: string;
    callbackUrl: string;
    confirmUrl: string;
  };
  stats: {
    total: number;
    pending: number;
    confirmed: number;
    rejected: number;
  };
}

export const ValtexPanel: React.FC = () => {
  const {
    account,
    realAccount,
    safaricomPhone,
    cashierTransactions,
    createValtexTransaction,
    verifyValtexTransactionStatus,
    cancelPendingWithdrawal,
  } = useTrading();

  const [direction, setDirection] = useState<'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER'>(() => {
    try {
      const d = new URLSearchParams(window.location.search).get('direction')?.toUpperCase();
      if (d === 'DEPOSIT' || d === 'WITHDRAWAL' || d === 'TRANSFER') return d;
    } catch {}
    return 'WITHDRAWAL';
  });
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
  const [valtexAccountId, setValtexAccountId] = useState<string>(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('valtexId');
      if (v && v.trim()) return v.trim();
    } catch {}
    return safaricomPhone;
  });
  const [targetAccount, setTargetAccount] = useState<'REAL' | 'CURRENT'>('REAL');
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
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

  const [statusInfo, setStatusInfo] = useState<ValtexBridgeStatus>(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return {
      loaded: false,
      connected: true,
      mode: 'VALTEX_WEBHOOK_BRIDGE',
      externalApiConfigured: false,
      webhookSecretConfigured: false,
      merchantId: 'VALTEX-NDERISKOOL',
      callbackAuthGated: false,
      urls: {
        checkoutUrl: origin ? `${origin}/?cashier=valtex` : '/?cashier=valtex',
        apiBaseUrl: origin ? `${origin}/api/valtex` : '/api/valtex',
        depositUrl: origin ? `${origin}/api/valtex/deposit` : '/api/valtex/deposit',
        withdrawUrl: origin ? `${origin}/api/valtex/withdraw` : '/api/valtex/withdraw',
        transferUrl: origin ? `${origin}/api/valtex/v1/transfers` : '/api/valtex/v1/transfers',
        callbackUrl: origin ? `${origin}/api/valtex/callback` : '/api/valtex/callback',
        confirmUrl: origin ? `${origin}/api/valtex/confirm` : '/api/valtex/confirm',
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
    setValtexAccountId((prev) => (prev ? prev : safaricomPhone));
  }, [safaricomPhone]);

  const loadValtexStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/valtex/status');
      if (res.ok) {
        const data = await res.json();
        setStatusInfo((prev) => ({
          loaded: true,
          connected: data.connected !== false,
          mode: data.mode === 'EXTERNAL_VALTEX_API' ? 'EXTERNAL_VALTEX_API' : 'VALTEX_WEBHOOK_BRIDGE',
          externalApiConfigured: Boolean(data.externalApiConfigured),
          invalidExternalApiUrl: Boolean(data.invalidExternalApiUrl),
          externalApiWarning: data.externalApiWarning || null,
          webhookSecretConfigured: Boolean(data.webhookSecretConfigured),
          merchantId: String(data.merchantId || prev.merchantId),
          callbackAuthGated: Boolean(data.callbackAuthGated),
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
    loadValtexStatus();
  }, [loadValtexStatus]);

  const parsedPhone = normalizeKenyanPhone(phone);
  const kesAmount = usdToKes(Math.max(0, usdAmount));

  const amountValidationError = useMemo(() => {
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      return 'Enter a valid amount in USD.';
    }
    if (usdAmount < 10) {
      return 'Minimum Valtex transaction is $10.00 USD.';
    }
    if (direction === 'TRANSFER') {
      if (usdAmount > 10000) {
        return `Maximum single Valtex money transfer is $10,000.00 USD (KES ${usdToKes(10000).toLocaleString()}).`;
      }
      return null;
    }
    if (direction === 'WITHDRAWAL' && usdAmount > realAccount.balance) {
      return `Insufficient Deriv Real balance ($${realAccount.balance.toFixed(2)} available on ${realAccount.loginId}).`;
    }
    return null;
  }, [direction, realAccount.balance, realAccount.loginId, usdAmount]);

  const valtexHistory = useMemo(
    () => cashierTransactions.filter((t) => t.method === 'VALTEX').slice(0, 8),
    [cashierTransactions]
  );

  const directValtexLink = useMemo(() => {
    const base = statusInfo.urls.checkoutUrl || '/?cashier=valtex';
    const sep = base.includes('?') ? '&' : '?';
    const cleanPhone = parsedPhone.local || phone || safaricomPhone;
    const safeAmt = Number.isFinite(usdAmount) && usdAmount >= 10 ? usdAmount : 25;
    return `${base}${sep}direction=${direction}&amount=${safeAmt}&phone=${encodeURIComponent(cleanPhone)}`;
  }, [statusInfo.urls.checkoutUrl, direction, parsedPhone.local, phone, safaricomPhone, usdAmount]);

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

    if (!parsedPhone.valid) {
      setFeedback({
        type: 'error',
        text: 'Enter a valid Safaricom M-Pesa number linked to your Valtex account (e.g. 0728424076 or +254793950512).',
      });
      return;
    }

    setIsSubmitting(true);
    const res = await createValtexTransaction({
      direction,
      usdAmount,
      kesAmount,
      phone: parsedPhone.local,
      valtexAccountId: valtexAccountId.trim() || parsedPhone.local,
      targetAccount,
      fundingSource: direction === 'TRANSFER' ? 'STANDALONE_GATEWAY' : 'DERIV_REAL',
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
    loadValtexStatus();
  };

  const handleVerifyStatus = async (txId: string, refOrId: string) => {
    setVerifyingTxId(txId);
    setRowStatusFeedback(null);
    const res = await verifyValtexTransactionStatus(refOrId);
    setVerifyingTxId(null);
    setRowStatusFeedback({
      txId,
      ok: res.ok,
      text: res.message,
    });
    loadValtexStatus();
  };

  return (
    <div className="space-y-4">
      {/* Valtex App Connection Header */}
      <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#0b1930] text-[#2bbbad] flex items-center justify-center shrink-0">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm">
                Valtex App · Deposits &amp; Verified Withdrawal Confirmations
              </h3>
              <span
                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                  statusInfo.externalApiConfigured
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-teal-50 text-teal-800 border border-teal-200'
                }`}
              >
                {statusInfo.externalApiConfigured ? 'EXTERNAL VALTEX API' : 'VALTEX WEBHOOK BRIDGE ACTIVE'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Merchant <strong className="font-mono text-slate-800">{statusInfo.merchantId}</strong> ·{' '}
              {direction === 'TRANSFER' ? (
                <strong className="text-indigo-700 font-mono">Independent Transfer (No Deriv Required)</strong>
              ) : (
                <>
                  Deriv Real{' '}
                  <strong className="text-emerald-700 font-mono">
                    {realAccount.loginId} (${realAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                  </strong>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 rounded-lg border font-mono text-[10px] font-bold ${
              statusInfo.webhookSecretConfigured
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            {statusInfo.webhookSecretConfigured ? 'HMAC-SHA256 Verified' : 'Callback-Verified Only'}
          </span>
          <button
            type="button"
            onClick={loadValtexStatus}
            disabled={isLoadingStatus}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-800 font-mono text-[10px] font-bold cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingStatus ? 'animate-spin' : ''}`} />
            <span>Sync Valtex</span>
          </button>
        </div>
      </div>

      {/* Valtex Endpoints & Webhook URLs */}
      <div className="p-3.5 bg-white border border-teal-200 rounded-xl shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[#0b1930] shrink-0" />
            <div>
              <h4 className="font-bold text-slate-900 text-xs">Valtex Bridge Endpoints &amp; Webhook Configuration</h4>
              <p className="text-[10px] text-slate-500">
                Credentials stay in server environment secrets (VALTEX_API_URL / VALTEX_API_KEY / VALTEX_WEBHOOK_SECRET).
                Withdrawals and deposits confirm strictly after Valtex callback or upstream verification.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 font-mono text-[10px]">
          {[
            {
              key: 'checkout',
              label: 'Valtex Direct Checkout URL',
              value: directValtexLink,
              openHref: directValtexLink,
            },
            {
              key: 'deposit',
              label: 'Valtex Deposit Endpoint (GET opens UI · POST JSON creates)',
              value: statusInfo.urls.depositUrl,
              openHref: `${statusInfo.urls.depositUrl}?amount=${Number.isFinite(usdAmount) && usdAmount >= 10 ? usdAmount : 25}&phone=${encodeURIComponent(parsedPhone.local || phone || safaricomPhone)}`,
            },
            {
              key: 'withdraw',
              label: 'Valtex Withdrawal Endpoint (GET opens UI · POST JSON creates)',
              value: statusInfo.urls.withdrawUrl,
              openHref: `${statusInfo.urls.withdrawUrl}?amount=${Number.isFinite(usdAmount) && usdAmount >= 10 ? usdAmount : 25}&phone=${encodeURIComponent(parsedPhone.local || phone || safaricomPhone)}`,
            },
            {
              key: 'transfer',
              label: 'Valtex Transfer API Endpoint (POST/GET JSON)',
              value: statusInfo.urls.transferUrl,
              openHref: `${statusInfo.urls.transferUrl}?format=json`,
            },
            {
              key: 'callback',
              label: 'Valtex Payment Confirmation Webhook URL (POST)',
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
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#0b1930] hover:bg-slate-800 text-white font-bold"
                  >
                    <ExternalLink className="w-3 h-3 text-[#2bbbad]" />
                    <span>Open</span>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        {statusInfo.loaded && statusInfo.externalApiWarning && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 font-mono text-[10px] leading-relaxed flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
            <span>{statusInfo.externalApiWarning}</span>
          </div>
        )}

        {statusInfo.loaded && statusInfo.callbackAuthGated && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 font-mono text-[10px] leading-relaxed flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Preview domain is auth-gated for external servers: set a non-auth-gated{' '}
              <strong>MPESA_CALLBACK_BASE_URL</strong> / <strong>APP_URL</strong> for inbound{' '}
              <strong>/api/valtex/callback</strong> HMAC-SHA256 webhooks, or configure{' '}
              <strong>VALTEX_API_URL</strong> + <strong>VALTEX_API_KEY</strong> for outbound confirmation polling.
            </span>
          </div>
        )}
      </div>

      {/* Mode Switch: Deposit vs Withdrawal vs Independent Transfer */}
      <div className="grid grid-cols-3 gap-2 p-1 bg-white border border-slate-200 rounded-xl shadow-xs font-mono text-xs">
        <button
          type="button"
          onClick={() => {
            setDirection('DEPOSIT');
            setFeedback(null);
          }}
          className={`py-2.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer font-bold ${
            direction === 'DEPOSIT'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4 shrink-0" />
          <span>Valtex Deposit</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setDirection('WITHDRAWAL');
            setFeedback(null);
          }}
          className={`py-2.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer font-bold ${
            direction === 'WITHDRAWAL'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <ArrowUpRight className="w-4 h-4 shrink-0" />
          <span>Valtex Withdrawal</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setDirection('TRANSFER');
            setFeedback(null);
          }}
          className={`py-2.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer font-bold ${
            direction === 'TRANSFER'
              ? 'bg-indigo-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4 shrink-0" />
          <span>Transfer (No Deriv)</span>
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

      {/* Valtex Deposit / Withdrawal Form */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
              {direction === 'DEPOSIT'
                ? 'Target Deriv Account'
                : direction === 'TRANSFER'
                ? 'Valtex Standalone Transfer · No Deriv Account Required'
                : 'Source Deriv Real Account'}
            </span>
            <span className="font-mono font-bold text-slate-900 text-xs">
              {direction === 'TRANSFER'
                ? 'Valtex Wallet -> Safaricom M-Pesa (Independent · Up to $10,000 USD)'
                : direction === 'WITHDRAWAL'
                ? `${realAccount.loginId} · $${realAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD Available`
                : targetAccount === 'REAL' || account.isReal
                ? `Deriv Real (${realAccount.loginId})`
                : `Demo Virtual (${account.loginId})`}
            </span>
          </div>

          {direction === 'DEPOSIT' && !account.isReal ? (
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
          ) : (
            direction === 'WITHDRAWAL' && (
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

        {/* Amount Input */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <label className="font-bold text-slate-800">
              {direction === 'DEPOSIT'
                ? 'Valtex Deposit Amount (USD)'
                : direction === 'TRANSFER'
                ? 'Valtex Transfer Amount (USD)'
                : 'Valtex Withdrawal Amount (USD)'}
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
                  : 'border-slate-300 focus:border-[#2bbbad]'
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
                    ? 'bg-[#0b1930] text-white border-[#0b1930] font-bold'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>

        {/* Valtex Account ID & Safaricom Number */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="font-bold text-slate-800 block mb-1">Valtex Account ID / Wallet Handle</label>
            <input
              type="text"
              value={valtexAccountId}
              onChange={(e) => setValtexAccountId(e.target.value)}
              placeholder="VTX-ACCT or 0728424076"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-[#0b1930]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-800 flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Safaricom M-Pesa Number</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPhone('0728424076');
                    setValtexAccountId('0728424076');
                  }}
                  className="text-[10px] font-mono font-bold text-emerald-700 hover:underline cursor-pointer"
                >
                  Use 0728424076
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhone('0793950512');
                    setValtexAccountId('0793950512');
                  }}
                  className="text-[10px] font-mono font-bold text-slate-600 hover:underline cursor-pointer"
                >
                  Use 0793950512
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
                Normalized MSISDN: {parsedPhone.msisdn}
              </span>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || Boolean(amountValidationError)}
          className={`w-full py-3.5 rounded-xl font-mono text-sm font-bold text-white shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 ${
            direction === 'DEPOSIT'
              ? 'bg-emerald-600 hover:bg-emerald-500'
              : direction === 'TRANSFER'
              ? 'bg-indigo-700 hover:bg-indigo-600'
              : 'bg-rose-600 hover:bg-rose-500'
          }`}
        >
          {direction === 'DEPOSIT' ? (
            <ArrowDownLeft className="w-4 h-4" />
          ) : direction === 'TRANSFER' ? (
            <ArrowRightLeft className="w-4 h-4" />
          ) : (
            <ArrowUpRight className="w-4 h-4" />
          )}
          <span>
            {isSubmitting
              ? 'DISPATCHING VALTEX REQUEST...'
              : direction === 'DEPOSIT'
              ? `DEPOSIT $${usdAmount.toFixed(2)} (KES ${kesAmount.toLocaleString()}) VIA VALTEX`
              : direction === 'TRANSFER'
              ? `TRANSFER $${usdAmount.toFixed(2)} (KES ${kesAmount.toLocaleString()}) VIA VALTEX TO ${parsedPhone.local || phone}`
              : `WITHDRAW $${usdAmount.toFixed(2)} (KES ${kesAmount.toLocaleString()}) VIA VALTEX TO ${parsedPhone.local || phone}`}
          </span>
        </button>

        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-[#2bbbad] shrink-0" />
          <span>
            Valtex deposits credit balances and Valtex withdrawals are marked Confirmed strictly upon verified Valtex callback confirmation ({statusInfo.urls.callbackUrl}).
          </span>
        </div>
      </form>

      {/* Valtex Transactions Ledger */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-900 text-xs">Valtex Deposits &amp; Withdrawal Confirmations</span>
          <span className="text-[10px] font-mono text-slate-500">
            {valtexHistory.length} record{valtexHistory.length === 1 ? '' : 's'}
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

        {valtexHistory.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-center font-mono text-[11px] text-slate-500">
            No Valtex transactions submitted yet. Submit a deposit or withdrawal above to track callback verification.
          </div>
        ) : (
          <div className="space-y-2">
            {valtexHistory.map((item) => {
              const isDep = item.type === 'DEPOSIT';
              const isStandaloneTx = Boolean(item.standaloneTransfer || item.fundingSource === 'STANDALONE_GATEWAY');
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
                              : isStandaloneTx
                              ? 'bg-indigo-700 text-white'
                              : 'bg-rose-600 text-white'
                          }`}
                        >
                          {isDep ? 'VALTEX DEPOSIT' : isStandaloneTx ? 'VALTEX TRANSFER' : 'VALTEX WITHDRAWAL'}
                        </span>
                        <span className="font-bold text-slate-900">${item.amount.toFixed(2)} USD</span>
                        <span className="text-slate-500">
                          Ref: {item.mpesaReceipt || item.reference}
                        </span>
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
                          <span>Pending Callback</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {!isConfirmed && !isRejected && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-amber-200/80">
                      <span className="text-[10px] text-amber-900">
                        Awaiting Valtex webhook verification for {item.recipientPhone || item.valtexAccountId}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={verifyingTxId === item.id}
                          onClick={() => handleVerifyStatus(item.id, remoteRef)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white text-[10px] font-bold cursor-pointer disabled:opacity-60"
                        >
                          <RefreshCw className={`w-3 h-3 text-[#2bbbad] ${verifyingTxId === item.id ? 'animate-spin' : ''}`} />
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
