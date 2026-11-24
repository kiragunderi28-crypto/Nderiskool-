import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { derivWsService } from '../services/derivWs';
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
  KeyRound,
  Link2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wallet,
  XCircle,
  AlertCircle,
} from 'lucide-react';

interface PaymentAgentOption {
  loginId: string;
  name: string;
  minWithdrawal: number;
  maxWithdrawal: number;
  withdrawalCommission: number;
  depositCommission: number;
  telephone: string;
  url: string;
  summary: string;
  isLiveAgent: boolean;
}

const DEFAULT_DCASH_AGENTS: PaymentAgentOption[] = [
  {
    loginId: 'CR-DCASH-KE',
    name: 'D Cash App Kenya',
    minWithdrawal: 10,
    maxWithdrawal: 2500,
    withdrawalCommission: 0,
    depositCommission: 0,
    telephone: '0793950512',
    url: 'https://app.deriv.com/cashier/payment-agent',
    summary: 'Primary D Cash App bridge for Safaricom M-Pesa KES deposits & Deriv Real CR withdrawals.',
    isLiveAgent: false,
  },
  {
    loginId: 'CR-DCASH-MPE',
    name: 'D Cash Instant M-Pesa Desk',
    minWithdrawal: 10,
    maxWithdrawal: 5000,
    withdrawalCommission: 0,
    depositCommission: 0,
    telephone: '+254793950512',
    url: 'https://app.deriv.com/cashier/payment-agent',
    summary: 'High-limit Kenyan Deriv Payment Agent supporting instant Paybill #247247 & M-Pesa B2C.',
    isLiveAgent: false,
  },
];

export const DCashPanel: React.FC = () => {
  const {
    account,
    realAccount,
    safaricomPhone,
    cashierTransactions,
    createDCashTransaction,
    confirmMpesaTransaction,
    cancelPendingWithdrawal,
    setIsConnectModalOpen,
    setIsCashierOpen,
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
  const [dcashTag, setDcashTag] = useState<string>(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('phone');
      if (p && p.trim()) return p.trim();
    } catch {}
    return safaricomPhone;
  });
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [targetAccount, setTargetAccount] = useState<'REAL' | 'CURRENT'>('REAL');

  const [agents, setAgents] = useState<PaymentAgentOption[]>(DEFAULT_DCASH_AGENTS);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(DEFAULT_DCASH_AGENTS[0].loginId);
  const [isLiveAgents, setIsLiveAgents] = useState<boolean>(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState<boolean>(false);
  const [copiedUrlKey, setCopiedUrlKey] = useState<string | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<{
    loaded: boolean;
    dcashApiConfigured: boolean;
    dcashBuiltinReady: boolean;
    bridgeMode: 'EXTERNAL_API' | 'BUILTIN_BRIDGE';
    paybill: string;
    warnings: string[];
    urls: {
      checkoutUrl: string;
      apiBaseUrl: string;
      transferUrl: string;
      builtInTransferUrl: string;
      callbackUrl: string;
      externalApiUrl: string | null;
      paymentAgentUrl: string;
    };
  }>(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return {
      loaded: false,
      dcashApiConfigured: false,
      dcashBuiltinReady: true,
      bridgeMode: 'BUILTIN_BRIDGE',
      paybill: '247247',
      warnings: [],
      urls: {
        checkoutUrl: origin ? `${origin}/?cashier=dcash` : '/?cashier=dcash',
        apiBaseUrl: origin ? `${origin}/api/dcash` : '/api/dcash',
        transferUrl: origin ? `${origin}/api/dcash/v1/transfers` : '/api/dcash/v1/transfers',
        builtInTransferUrl: origin ? `${origin}/api/dcash/v1/transfers` : '/api/dcash/v1/transfers',
        callbackUrl: origin ? `${origin}/api/dcash/callback` : '/api/dcash/callback',
        externalApiUrl: null,
        paymentAgentUrl: 'https://app.deriv.com/cashier/payment-agent',
      },
    };
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
    cashierUrl?: string;
  } | null>(null);

  const [receiptInputs, setReceiptInputs] = useState<Record<string, string>>({});
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const hasLiveToken = Boolean(realAccount.token && realAccount.token !== 'CR-NDERISKOOL-LIVE');

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('phone');
      if (p && p.trim()) return;
    } catch {}
    setPhone(safaricomPhone);
    setDcashTag(safaricomPhone);
  }, [safaricomPhone]);

  const loadBridgeAndAgents = useCallback(async () => {
    setIsLoadingAgents(true);
    try {
      const [statusRes, paRes] = await Promise.all([
        fetch('/api/dcash/status').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        derivWsService.fetchKenyanPaymentAgents(),
      ]);

      if (statusRes) {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        setBridgeStatus((prev) => ({
          loaded: true,
          dcashApiConfigured: Boolean(statusRes.dcashApiConfigured),
          dcashBuiltinReady: statusRes.dcashBuiltinReady !== false,
          bridgeMode: statusRes.bridgeMode === 'EXTERNAL_API' ? 'EXTERNAL_API' : 'BUILTIN_BRIDGE',
          paybill: statusRes.paybill || '247247',
          warnings: Array.isArray(statusRes.warnings) ? statusRes.warnings : [],
          urls: statusRes.urls || {
            checkoutUrl: origin ? `${origin}/?cashier=dcash` : prev.urls.checkoutUrl,
            apiBaseUrl: origin ? `${origin}/api/dcash` : prev.urls.apiBaseUrl,
            transferUrl: origin ? `${origin}/api/dcash/v1/transfers` : prev.urls.transferUrl,
            builtInTransferUrl: origin ? `${origin}/api/dcash/v1/transfers` : prev.urls.builtInTransferUrl,
            callbackUrl: statusRes.callbackUrl || prev.urls.callbackUrl,
            externalApiUrl: null,
            paymentAgentUrl: 'https://app.deriv.com/cashier/payment-agent',
          },
        }));
      } else {
        setBridgeStatus((prev) => ({ ...prev, loaded: true }));
      }

      if (paRes.liveFromDeriv && paRes.agents.length > 0) {
        const merged = [...DEFAULT_DCASH_AGENTS, ...paRes.agents];
        setAgents(merged);
        setSelectedAgentId(paRes.agents[0].loginId);
        setIsLiveAgents(true);
      } else {
        setAgents(DEFAULT_DCASH_AGENTS);
        setSelectedAgentId(DEFAULT_DCASH_AGENTS[0].loginId);
        setIsLiveAgents(false);
      }
    } finally {
      setIsLoadingAgents(false);
    }
  }, []);

  useEffect(() => {
    loadBridgeAndAgents();
  }, [loadBridgeAndAgents]);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.loginId === selectedAgentId) || agents[0],
    [agents, selectedAgentId]
  );

  const parsedPhone = normalizeKenyanPhone(phone);
  const kesAmount = usdToKes(Math.max(0, usdAmount));

  const amountValidationError = useMemo(() => {
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      return 'Enter a valid amount in USD.';
    }
    if (usdAmount < 10) {
      return 'Minimum D Cash App transaction is $10.00 USD.';
    }
    if (direction === 'TRANSFER') {
      if (usdAmount > 10000) {
        return `Maximum single D Cash transfer is $10,000.00 USD (KES ${usdToKes(10000).toLocaleString()}).`;
      }
      return null;
    }
    if (direction === 'WITHDRAWAL' && usdAmount > realAccount.balance) {
      return `Insufficient Deriv Real balance ($${realAccount.balance.toFixed(2)} available on ${realAccount.loginId}).`;
    }
    return null;
  }, [direction, realAccount.balance, realAccount.loginId, usdAmount]);

  const dcashHistory = useMemo(
    () => cashierTransactions.filter((t) => t.method === 'D_CASH').slice(0, 6),
    [cashierTransactions]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (amountValidationError) {
      setFeedback({ type: 'error', text: amountValidationError });
      return;
    }

    if (!parsedPhone.valid) {
      setFeedback({
        type: 'error',
        text: 'Enter a valid Safaricom M-Pesa number connected to D Cash App (e.g. 0793950512).',
      });
      return;
    }

    setIsSubmitting(true);
    const res = await createDCashTransaction({
      direction,
      usdAmount,
      kesAmount,
      phone: parsedPhone.local,
      dcashTag: dcashTag.trim() || parsedPhone.local,
      agentLoginId: selectedAgent.loginId,
      agentName: selectedAgent.name,
      verificationCode: direction === 'WITHDRAWAL' ? verificationCode.trim() || undefined : undefined,
      targetAccount,
      fundingSource: direction === 'TRANSFER' ? 'STANDALONE_GATEWAY' : 'DERIV_REAL',
    });
    setIsSubmitting(false);

    if (!res.success) {
      setFeedback({ type: 'error', text: res.message, cashierUrl: res.cashierUrl });
      return;
    }

    setFeedback({
      type: res.liveExecuted ? 'success' : 'info',
      text: res.message,
      cashierUrl: direction === 'TRANSFER' ? undefined : res.cashierUrl || 'https://app.deriv.com/cashier/payment-agent',
    });
    setVerificationCode('');
  };

  const handleConfirmReceipt = (txId: string) => {
    setReceiptError(null);
    const code = receiptInputs[txId] || '';
    const res = confirmMpesaTransaction(txId, code);
    if (!res.success) {
      setReceiptError(res.message);
      return;
    }
    setReceiptInputs((prev) => {
      const next = { ...prev };
      delete next[txId];
      return next;
    });
  };

  const handleCopyUrl = (key: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedUrlKey(key);
    setTimeout(() => setCopiedUrlKey((cur) => (cur === key ? null : cur)), 1800);
  };

  const directDcashLink = useMemo(() => {
    const base = bridgeStatus.urls.checkoutUrl || '/?cashier=dcash';
    const sep = base.includes('?') ? '&' : '?';
    const cleanPhone = parsedPhone.local || phone || safaricomPhone;
    const safeAmt = Number.isFinite(usdAmount) && usdAmount >= 10 ? usdAmount : 25;
    return `${base}${sep}direction=${direction}&amount=${safeAmt}&phone=${encodeURIComponent(cleanPhone)}`;
  }, [bridgeStatus.urls.checkoutUrl, direction, parsedPhone.local, phone, safaricomPhone, usdAmount]);

  return (
    <div className="space-y-4">
      {/* D Cash App Connection Header */}
      <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm">D Cash App · Deriv Real &amp; M-Pesa Bridge</h3>
              <span
                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                  bridgeStatus.dcashApiConfigured
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-teal-50 text-teal-800 border border-teal-200'
                }`}
              >
                {bridgeStatus.dcashApiConfigured ? 'D Cash External API Ready' : 'D Cash Bridge URL Active'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Linked to Safaricom <strong className="text-slate-800 font-mono">{safaricomPhone}</strong>{' '}
              {direction === 'TRANSFER' ? (
                <>
                  · <strong className="text-indigo-700 font-mono">Independent Transfer (No Deriv Required)</strong>
                </>
              ) : (
                <>
                  &amp; Deriv Real{' '}
                  <strong className="text-emerald-700 font-mono">
                    {realAccount.loginId} (${realAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                  </strong>
                </>
              )}
            </p>
          </div>
        </div>

        <a
          href="https://app.deriv.com/cashier/payment-agent"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white font-mono text-[11px] font-bold transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5 text-[#2bbbad]" />
          <span>Deriv Payment Agents</span>
        </a>
      </div>

      {/* Generated D Cash URLs Panel */}
      <div className="p-3.5 bg-white border border-emerald-200 rounded-xl shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <h4 className="font-bold text-slate-900 text-xs">D Cash App URLs &amp; Bridge Endpoints</h4>
              <p className="text-[10px] text-slate-500">
                Shareable D Cash Cashier link (auto-opens this terminal with current amount/phone) and webhook endpoints
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[10px] font-bold">
            {bridgeStatus.bridgeMode === 'EXTERNAL_API' ? 'EXTERNAL + BUILT-IN' : 'BUILT-IN ACTIVE'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 font-mono text-[10px]">
          {[
            {
              key: 'checkout',
              label: 'D Cash Direct App URL (Auto-Prefill Checkout)',
              value: directDcashLink,
              openHref: directDcashLink,
            },
            {
              key: 'transfer',
              label: 'D Cash API Transfer URL (POST JSON)',
              value: bridgeStatus.urls.transferUrl,
            },
            {
              key: 'callback',
              label: 'D Cash Webhook Callback URL (POST)',
              value: bridgeStatus.urls.callbackUrl,
            },
            {
              key: 'derivPa',
              label: 'Deriv Official Payment Agent URL',
              value: bridgeStatus.urls.paymentAgentUrl,
              openHref: bridgeStatus.urls.paymentAgentUrl,
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
                  onClick={() => handleCopyUrl(item.key, item.value)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold cursor-pointer"
                >
                  {copiedUrlKey === item.key ? (
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
      </div>

      {bridgeStatus.warnings.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 font-mono text-[10px] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>{bridgeStatus.warnings.join(' ')}</span>
        </div>
      )}

      {/* Mode Switch: Deposit vs Real Withdrawal vs Independent Transfer */}
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
          <span>D Cash Deposit</span>
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
          <span>Real Withdrawal</span>
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

      {/* D Cash Agent Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-bold text-slate-900 text-xs block">
              Select D Cash / Deriv Kenya Payment Agent
            </span>
            <span className="text-[10px] text-slate-500">
              {isLiveAgents
                ? 'Includes live Kenya Payment Agents from Deriv WebSocket paymentagent_list'
                : `Paybill #${bridgeStatus.paybill} · Zero-fee Kenya M-Pesa settlement`}
            </span>
          </div>
          <button
            type="button"
            onClick={loadBridgeAndAgents}
            disabled={isLoadingAgents}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 font-mono text-[10px] font-semibold cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingAgents ? 'animate-spin' : ''}`} />
            <span>Sync Agents</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {agents.slice(0, 4).map((ag) => {
            const isSelected = selectedAgent.loginId === ag.loginId;
            return (
              <button
                key={ag.loginId}
                type="button"
                onClick={() => setSelectedAgentId(ag.loginId)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                  isSelected
                    ? direction === 'DEPOSIT'
                      ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500/30'
                      : 'bg-rose-50 border-rose-500 ring-1 ring-rose-500/30'
                    : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 text-xs">{ag.name}</span>
                  <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px] font-bold text-slate-700">
                    {ag.loginId}
                  </span>
                </div>
                <span className="text-[10px] text-slate-600 line-clamp-1">{ag.summary}</span>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-200/70">
                  <span>Limits: ${ag.minWithdrawal}–${ag.maxWithdrawal}</span>
                  <span className="text-emerald-700 font-semibold">
                    {ag.isLiveAgent ? 'Live Deriv PA' : 'Kenya M-Pesa'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border font-mono text-[11px] space-y-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : feedback.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : feedback.type === 'error' ? (
              <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{feedback.text}</span>
          </div>

          {feedback.cashierUrl && (
            <div className="pl-6">
              <a
                href={feedback.cashierUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white text-[11px] font-bold"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#2bbbad]" />
                <span>Open Deriv Official Payment Agent Cashier</span>
              </a>
            </div>
          )}
        </div>
      )}

      {/* Transaction Form */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
              {direction === 'DEPOSIT'
                ? 'Target Deriv Account'
                : direction === 'TRANSFER'
                ? 'D Cash Standalone Money Transfer · No Deriv Required'
                : 'Source Deriv Real Account'}
            </span>
            <span className="font-mono font-bold text-slate-900 text-xs">
              {direction === 'TRANSFER'
                ? 'D Cash App Direct Transfer -> Safaricom M-Pesa (Up to $10,000 USD)'
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
                ? 'Deposit Amount (USD)'
                : direction === 'TRANSFER'
                ? 'D Cash Transfer Amount (USD)'
                : 'Real Withdrawal Amount (USD)'}
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

        {/* D Cash App Account & Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="font-bold text-slate-800 block mb-1">D Cash App Account / Phone</label>
            <input
              type="text"
              value={dcashTag}
              onChange={(e) => setDcashTag(e.target.value)}
              placeholder="0793950512 or @dcash_id"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-emerald-600"
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
                    setDcashTag('0728424076');
                  }}
                  className="text-[10px] font-mono font-bold text-emerald-700 hover:underline cursor-pointer"
                >
                  Use 0728424076
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhone('0793950512');
                    setDcashTag('0793950512');
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
              placeholder="0793950512"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {/* Optional Deriv Payment Agent Email Verification Code for Live Real Withdrawal */}
        {direction === 'WITHDRAWAL' && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="font-bold text-slate-800 flex items-center gap-1.5 text-[11px]">
                <KeyRound className="w-3.5 h-3.5 text-[#2bbbad]" />
                <span>Deriv Email Verification Code (Optional · For Live API Payout)</span>
              </label>
              {!hasLiveToken && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCashierOpen(false);
                    setIsConnectModalOpen(true);
                  }}
                  className="text-[10px] font-mono font-bold text-[#0b1930] hover:underline cursor-pointer"
                >
                  Connect Deriv Token (Payments Scope)
                </button>
              )}
            </div>
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="Paste Deriv withdrawal email verification code if authorized, or leave blank"
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs text-slate-900 focus:outline-none focus:border-[#0b1930]"
            />
          </div>
        )}

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
              ? 'PROCESSING D CASH APP REQUEST...'
              : direction === 'DEPOSIT'
              ? `DEPOSIT $${usdAmount.toFixed(2)} (KES ${kesAmount.toLocaleString()}) VIA D CASH`
              : direction === 'TRANSFER'
              ? `TRANSFER $${usdAmount.toFixed(2)} (KES ${kesAmount.toLocaleString()}) TO D CASH ${parsedPhone.local || phone}`
              : `REAL WITHDRAWAL $${usdAmount.toFixed(2)} (KES ${kesAmount.toLocaleString()}) TO D CASH ${parsedPhone.local || phone}`}
          </span>
        </button>

        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-[#2bbbad] shrink-0" />
          <span>
            {direction === 'TRANSFER'
              ? 'Standalone D Cash transfers settle independently without affecting any Deriv trading balance.'
              : `Real withdrawals deduct from ${realAccount.loginId} only upon live Deriv Payment Agent API execution, D Cash confirmation, or M-Pesa receipt entry.`}
          </span>
        </div>
      </form>

      {/* D Cash Orders Ledger */}
      {dcashHistory.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900 text-xs">Recent D Cash App Deposits &amp; Real Withdrawals</span>
            <span className="text-[10px] font-mono text-slate-500">Synced with M-Pesa History</span>
          </div>

          {receiptError && (
            <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-mono text-[11px]">
              {receiptError}
            </div>
          )}

          <div className="space-y-2">
            {dcashHistory.map((item) => {
              const isDep = item.type === 'DEPOSIT';
              const isStandaloneTx = Boolean(item.standaloneTransfer || item.fundingSource === 'STANDALONE_GATEWAY');
              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border font-mono text-[11px] space-y-2 ${
                    item.status === 'PENDING'
                      ? 'bg-amber-50/70 border-amber-300'
                      : item.status === 'COMPLETED'
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isDep
                              ? 'bg-emerald-600 text-white'
                              : isStandaloneTx
                              ? 'bg-indigo-700 text-white'
                              : 'bg-rose-600 text-white'
                          }`}
                        >
                          {isDep ? 'D CASH DEPOSIT' : isStandaloneTx ? 'D CASH TRANSFER' : 'D CASH REAL WITHDRAWAL'}
                        </span>
                        <span className="font-bold text-slate-900">${item.amount.toFixed(2)} USD</span>
                        <span className="text-slate-500">Ref: {item.reference}</span>
                      </div>
                      <span className="text-[10px] text-slate-600 block mt-0.5">{item.note}</span>
                    </div>

                    <div>
                      {item.status === 'PENDING' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                          <Clock className="w-3 h-3" />
                          <span>Pending</span>
                        </span>
                      )}
                      {item.status === 'COMPLETED' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Success</span>
                        </span>
                      )}
                      {item.status === 'REJECTED' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">
                          <XCircle className="w-3 h-3" />
                          <span>Failed/Cancelled</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {item.status === 'PENDING' && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-amber-200/80">
                      <input
                        type="text"
                        value={receiptInputs[item.id] || ''}
                        onChange={(e) => {
                          setReceiptError(null);
                          setReceiptInputs((prev) => ({ ...prev, [item.id]: e.target.value }));
                        }}
                        placeholder="Required M-Pesa / D Cash Code (e.g. SLK82940PQ)"
                        className="flex-1 min-w-[180px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-[11px] focus:outline-none focus:border-emerald-600"
                      />
                      <button
                        type="button"
                        onClick={() => handleConfirmReceipt(item.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                      >
                        Confirm Receipt
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReceiptError(null);
                          cancelPendingWithdrawal(item.id);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
