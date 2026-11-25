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

interface KcbBridgeStatus {
  loaded: boolean;
  connected: boolean;
  ibankConnected: boolean;
  environment: 'sandbox' | 'production';
  mode: 'KCB_BUNI_API' | 'DARAJA_B2B_522522' | 'PAYHERO_BANK_01' | 'KCB_WEBHOOK_BRIDGE';
  buniBaseUrl: string;
  ibankPortalUrl: string;
  buniConfigured: boolean;
  darajaB2bConfigured: boolean;
  darajaStkConfigured: boolean;
  payheroBank01Ready: boolean;
  debitAccountMasked?: string;
  ibankAccountMasked?: string;
  webhookSecretConfigured: boolean;
  kcbPaybill: string;
  companyCode: string;
  merchantId: string;
  callbackAuthGated: boolean;
  apiWarning?: string | null;
  urls: {
    checkoutUrl: string;
    apiBaseUrl: string;
    depositUrl: string;
    withdrawUrl: string;
    transferUrl: string;
    inquiryUrl: string;
    ipnUrl: string;
    callbackUrl: string;
    confirmUrl: string;
  };
  stats: {
    total: number;
    deposits?: number;
    withdrawals?: number;
    transfers?: number;
    pending: number;
    confirmed: number;
    rejected: number;
  };
}

interface KcbIpnWebhookItem {
  id: string;
  receivedAt: number;
  endpoint?: string;
  reference?: string;
  resultCode?: string;
  resultDesc?: string;
  mpesaReceipt?: string;
  matchedTransaction: boolean;
  sourceIp?: string;
}

interface KcbTransferPanelProps {
  initialAction?: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
}

export const KcbTransferPanel: React.FC<KcbTransferPanelProps> = ({ initialAction }) => {
  const {
    account,
    realAccount,
    safaricomPhone,
    cashierTransactions,
    createKcbDirectTransfer,
    verifyKcbTransferStatus,
    cancelPendingWithdrawal,
  } = useTrading();
  const { requireStepUpAuth } = useBiometric();

  const [action, setAction] = useState<'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER'>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const d = (params.get('direction') || params.get('action') || '').toUpperCase();
      if (d === 'DEPOSIT' || d === 'WITHDRAWAL' || d === 'TRANSFER') return d;
    } catch {}
    return initialAction || 'DEPOSIT';
  });

  useEffect(() => {
    if (initialAction) {
      setAction(initialAction);
    }
  }, [initialAction]);

  const [kcbRail, setKcbRail] = useState<'kcb_account' | 'paybill_522522' | 'kcb_vooma' | 'pesalink'>(() => {
    try {
      const r = new URLSearchParams(window.location.search).get('rail')?.toLowerCase();
      if (r === 'paybill_522522' || r === 'paybill') return 'paybill_522522';
      if (r === 'kcb_vooma' || r === 'vooma') return 'kcb_vooma';
      if (r === 'pesalink') return 'pesalink';
    } catch {}
    return 'kcb_account';
  });

  const [usdAmount, setUsdAmount] = useState<number>(() => {
    try {
      const a = Number(new URLSearchParams(window.location.search).get('amount'));
      if (Number.isFinite(a) && a >= 10) return a;
    } catch {}
    return 25;
  });

  const [accountNumber, setAccountNumber] = useState<string>(() => {
    try {
      const acct = new URLSearchParams(window.location.search).get('account');
      if (acct && acct.trim()) return acct.trim();
    } catch {}
    return '';
  });

  const [accountName, setAccountName] = useState<string>('');
  const [phone, setPhone] = useState<string>(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('phone');
      if (p && p.trim()) return p.trim();
    } catch {}
    return safaricomPhone;
  });
  const [narration, setNarration] = useState<string>('');
  const [dispatchVia, setDispatchVia] = useState<
    'auto' | 'buni' | 'daraja_b2b' | 'daraja_stk' | 'payhero_bank' | 'bridge'
  >('auto');
  const [targetAccount, setTargetAccount] = useState<'REAL' | 'CURRENT'>('REAL');
  const [transferFundingSource, setTransferFundingSource] = useState<'STANDALONE_GATEWAY' | 'DERIV_REAL'>(
    'STANDALONE_GATEWAY'
  );

  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
  const [isVerifyingOauth, setIsVerifyingOauth] = useState<boolean>(false);
  const [inquiryState, setInquiryState] = useState<{
    checked: boolean;
    loading: boolean;
    ok?: boolean;
    accountMasked?: string;
    accountTitle?: string;
    currency?: string;
    availableBalance?: number;
    status?: string;
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

  const [ipnFeed, setIpnFeed] = useState<KcbIpnWebhookItem[]>([]);
  const [isLoadingIpn, setIsLoadingIpn] = useState<boolean>(false);

  const [statusInfo, setStatusInfo] = useState<KcbBridgeStatus>(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return {
      loaded: false,
      connected: true,
      ibankConnected: false,
      environment: 'production',
      mode: 'KCB_WEBHOOK_BRIDGE',
      buniBaseUrl: 'https://api.buni.kcbgroup.com',
      ibankPortalUrl: 'https://onlinebanking.kcbgroup.com',
      buniConfigured: false,
      darajaB2bConfigured: false,
      darajaStkConfigured: false,
      payheroBank01Ready: false,
      webhookSecretConfigured: false,
      kcbPaybill: '522522',
      companyCode: 'KE0010001',
      merchantId: 'KCB-NDERISKOOL',
      callbackAuthGated: false,
      apiWarning: null,
      urls: {
        checkoutUrl: origin ? `${origin}/?cashier=kcb` : '/?cashier=kcb',
        apiBaseUrl: origin ? `${origin}/api/kcb` : '/api/kcb',
        depositUrl: origin ? `${origin}/api/kcb/deposit` : '/api/kcb/deposit',
        withdrawUrl: origin ? `${origin}/api/kcb/withdraw` : '/api/kcb/withdraw',
        transferUrl: origin ? `${origin}/api/kcb/transfer` : '/api/kcb/transfer',
        inquiryUrl: origin ? `${origin}/api/kcb/account-inquiry` : '/api/kcb/account-inquiry',
        ipnUrl: origin ? `${origin}/api/kcb/ipn` : '/api/kcb/ipn',
        callbackUrl: origin ? `${origin}/api/kcb/callback` : '/api/kcb/callback',
        confirmUrl: origin ? `${origin}/api/kcb/confirm` : '/api/kcb/confirm',
      },
      stats: { total: 0, deposits: 0, withdrawals: 0, transfers: 0, pending: 0, confirmed: 0, rejected: 0 },
    };
  });

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('phone');
      if (p && p.trim()) return;
    } catch {}
    setPhone(safaricomPhone);
  }, [safaricomPhone]);

  // Reset dispatch route override if switching actions to an incompatible route
  useEffect(() => {
    if (action === 'DEPOSIT' && (dispatchVia === 'daraja_b2b' || dispatchVia === 'payhero_bank')) {
      setDispatchVia('auto');
    } else if (action !== 'DEPOSIT' && dispatchVia === 'daraja_stk') {
      setDispatchVia('auto');
    }
  }, [action, dispatchVia]);

  const loadKcbStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/kcb/status');
      if (res.ok) {
        const data = await res.json();
        setStatusInfo((prev) => ({
          loaded: true,
          connected: data.connected !== false,
          ibankConnected: Boolean(data.ibankConnected),
          environment: data.environment === 'sandbox' ? 'sandbox' : 'production',
          mode: data.mode || 'KCB_WEBHOOK_BRIDGE',
          buniBaseUrl: String(data.buniBaseUrl || prev.buniBaseUrl),
          ibankPortalUrl: String(data.ibankPortalUrl || prev.ibankPortalUrl),
          buniConfigured: Boolean(data.buniConfigured),
          darajaB2bConfigured: Boolean(data.darajaB2bConfigured),
          darajaStkConfigured: Boolean(data.darajaStkConfigured),
          payheroBank01Ready: Boolean(data.payheroBank01Ready),
          debitAccountMasked: data.debitAccountMasked || undefined,
          ibankAccountMasked: data.ibankAccountMasked || undefined,
          webhookSecretConfigured: Boolean(data.webhookSecretConfigured),
          kcbPaybill: String(data.kcbPaybill || '522522'),
          companyCode: String(data.companyCode || 'KE0010001'),
          merchantId: String(data.merchantId || prev.merchantId),
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

  const loadKcbIpnFeed = useCallback(async () => {
    setIsLoadingIpn(true);
    try {
      const res = await fetch('/api/kcb/ipn');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.recentWebhooks)) {
          setIpnFeed(data.recentWebhooks);
        }
      }
    } catch {
      // keep existing feed
    } finally {
      setIsLoadingIpn(false);
    }
  }, []);

  useEffect(() => {
    loadKcbStatus();
    loadKcbIpnFeed();
  }, [loadKcbStatus, loadKcbIpnFeed]);

  const parsedPhone = normalizeKenyanPhone(phone);
  const kesAmount = usdToKes(Math.max(0, usdAmount));
  const cleanedAccount = accountNumber.trim().replace(/\s+/g, '');
  const accountValid = /^[A-Za-z0-9-]{6,20}$/.test(cleanedAccount);

  const effectiveFundingSource: 'STANDALONE_GATEWAY' | 'DERIV_REAL' =
    action === 'WITHDRAWAL' ? 'DERIV_REAL' : action === 'TRANSFER' ? transferFundingSource : 'DERIV_REAL';

  const amountValidationError = useMemo(() => {
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      return `Enter a valid KCB iBank ${action.toLowerCase()} amount in USD.`;
    }
    if (usdAmount < 10) {
      return `Minimum KCB iBank ${action.toLowerCase()} is $10.00 USD.`;
    }
    if (action === 'TRANSFER' && effectiveFundingSource === 'STANDALONE_GATEWAY') {
      const maxStandaloneUsd = 10000;
      if (usdAmount > maxStandaloneUsd) {
        return `Maximum single KCB direct transfer is $${maxStandaloneUsd.toLocaleString()} USD (KES ${usdToKes(
          maxStandaloneUsd
        ).toLocaleString()}).`;
      }
      return null;
    }
    if (
      (action === 'WITHDRAWAL' || (action === 'TRANSFER' && effectiveFundingSource === 'DERIV_REAL')) &&
      usdAmount > realAccount.balance
    ) {
      return `Exceeds available Deriv Real balance ($${realAccount.balance.toFixed(2)} USD on ${realAccount.loginId}).`;
    }
    return null;
  }, [action, effectiveFundingSource, realAccount.balance, realAccount.loginId, usdAmount]);

  const kcbHistory = useMemo(
    () => cashierTransactions.filter((t) => t.method === 'KCB_BANK').slice(0, 10),
    [cashierTransactions]
  );

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1800);
  };

  const handleAccountInquiry = async () => {
    setInquiryState({ checked: false, loading: true });
    try {
      const res = await fetch('/api/kcb/account-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(cleanedAccount ? { accountNumber: cleanedAccount } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setInquiryState({
          checked: true,
          loading: false,
          ok: true,
          accountMasked: data.accountMasked,
          accountTitle: data.accountTitle,
          currency: data.currency || 'KES',
          availableBalance: data.availableBalance,
          status: data.status || 'ACTIVE',
        });
      } else {
        setInquiryState({
          checked: true,
          loading: false,
          ok: false,
          accountMasked: data.accountMasked,
          error: String(data.error || 'Unable to query KCB iBank account details.'),
        });
      }
    } catch {
      setInquiryState({
        checked: true,
        loading: false,
        ok: false,
        error: 'Unable to reach /api/kcb/account-inquiry.',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setRowStatusFeedback(null);

    if (amountValidationError) {
      setFeedback({ type: 'error', text: amountValidationError });
      return;
    }

    if (kcbRail === 'kcb_vooma') {
      if (!parsedPhone.valid) {
        setFeedback({
          type: 'error',
          text: 'Enter a valid Kenyan mobile number registered on KCB App / Vooma (e.g. 0728424076).',
        });
        return;
      }
    } else if (action !== 'DEPOSIT' && !accountValid) {
      setFeedback({
        type: 'error',
        text: 'Enter a valid KCB iBank Account Number (6–20 digits/characters, e.g. 1100293847).',
      });
      return;
    } else if (action === 'DEPOSIT' && cleanedAccount && !/^[A-Za-z0-9-]{4,24}$/.test(cleanedAccount)) {
      setFeedback({
        type: 'error',
        text: 'KCB iBank deposit reference/account must be 4–24 alphanumeric or digit characters.',
      });
      return;
    }

    if (action === 'WITHDRAWAL' || action === 'TRANSFER') {
      const approved = await requireStepUpAuth(
        action === 'WITHDRAWAL' ? 'Authorize KCB iBank Withdrawal' : 'Authorize KCB iBank Real Money Transfer',
        `$${usdAmount.toFixed(2)} USD (KES ${kesAmount.toLocaleString()})`
      );
      if (!approved) {
        setFeedback({
          type: 'error',
          text: `Biometric confirmation cancelled. KCB iBank ${action.toLowerCase()} was not submitted.`,
        });
        return;
      }
    }

    setIsSubmitting(true);
    const res = await createKcbDirectTransfer({
      action,
      kcbRail,
      usdAmount,
      kesAmount,
      accountNumber: kcbRail === 'kcb_vooma' ? parsedPhone.local : cleanedAccount || undefined,
      accountName: accountName.trim() || undefined,
      phone: parsedPhone.valid ? parsedPhone.local : undefined,
      narration: narration.trim() || undefined,
      dispatchVia,
      fundingSource: effectiveFundingSource,
      targetAccount: action === 'DEPOSIT' ? targetAccount : undefined,
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
    loadKcbStatus();
  };

  const handleVerifyStatus = async (txId: string, refOrId: string) => {
    setVerifyingTxId(txId);
    setRowStatusFeedback(null);
    const res = await verifyKcbTransferStatus(refOrId);
    setVerifyingTxId(null);
    setRowStatusFeedback({
      txId,
      ok: res.ok,
      text: res.message,
    });
    loadKcbStatus();
  };

  const handleVerifyKcbOauth = async () => {
    setIsVerifyingOauth(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/kcb/verify-oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: true }),
      });
      const data = await res.json();
      setFeedback({
        type: data.ok ? 'success' : 'error',
        text: data.message || data.error || 'KCB Buni OAuth verification finished.',
      });
      await loadKcbStatus();
    } catch {
      setFeedback({ type: 'error', text: 'Unable to reach /api/kcb/verify-oauth.' });
    } finally {
      setIsVerifyingOauth(false);
    }
  };

  const safeAmt = Number.isFinite(usdAmount) && usdAmount >= 10 ? usdAmount : 25;
  const safeAcct = encodeURIComponent(cleanedAccount || '1100293847');
  const safePhone = encodeURIComponent(parsedPhone.local || phone || safaricomPhone);

  const modeBadgeLabel =
    statusInfo.mode === 'KCB_BUNI_API'
      ? `KCB BUNI API (${statusInfo.environment.toUpperCase()})`
      : statusInfo.mode === 'DARAJA_B2B_522522'
      ? 'DARAJA B2B -> KCB 522522'
      : statusInfo.mode === 'PAYHERO_BANK_01'
      ? 'PAYHERO BANK 01 (KCB)'
      : 'KCB IBANK IPN BRIDGE';

  return (
    <div className="space-y-4">
      {/* KCB iBank & KCB App Header */}
      <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#004d25] text-[#84bd00] flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm">
                KCB iBank &amp; KCB App · Deposits, Withdrawals &amp; Money Transfer
              </h3>
              <span
                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                  statusInfo.ibankConnected
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-100 text-slate-800 border border-slate-300'
                }`}
              >
                {modeBadgeLabel}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Paybill <strong className="font-mono text-slate-800">#{statusInfo.kcbPaybill}</strong> · Company{' '}
              <strong className="font-mono text-slate-800">{statusInfo.companyCode}</strong>
              {statusInfo.ibankAccountMasked ? (
                <>
                  {' '}
                  · iBank Acct <strong className="font-mono text-slate-800">{statusInfo.ibankAccountMasked}</strong>
                </>
              ) : null}{' '}
              ·{' '}
              {action === 'TRANSFER' && effectiveFundingSource === 'STANDALONE_GATEWAY' ? (
                <strong className="text-emerald-700 font-mono">Standalone Real Transfer (No Deriv Required)</strong>
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

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleAccountInquiry}
            disabled={inquiryState.loading}
            className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 font-mono text-[10px] font-bold cursor-pointer disabled:opacity-60"
            title="Check linked KCB iBank account status & balance via KCB Buni Account Inquiry"
          >
            <Wallet className="w-3 h-3 text-[#004d25]" />
            <span>{inquiryState.loading ? 'Querying...' : 'iBank Balance'}</span>
          </button>
          <button
            type="button"
            onClick={handleVerifyKcbOauth}
            disabled={isVerifyingOauth}
            className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#004d25] hover:bg-[#006633] text-white font-mono text-[10px] font-bold cursor-pointer disabled:opacity-60"
            title={`Test OAuth2 token handshake against ${statusInfo.buniBaseUrl}/token`}
          >
            <ShieldCheck className="w-3 h-3 text-[#84bd00]" />
            <span>{isVerifyingOauth ? 'Verifying...' : 'Verify OAuth'}</span>
          </button>
          <a
            href={statusInfo.ibankPortalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-mono text-[10px] font-bold"
          >
            <ExternalLink className="w-3 h-3 text-[#84bd00]" />
            <span>KCB iBank</span>
          </a>
          <button
            type="button"
            onClick={loadKcbStatus}
            disabled={isLoadingStatus}
            className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-800 font-mono text-[10px] font-bold cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingStatus ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Optional KCB iBank Account Inquiry Result Banner */}
      {inquiryState.checked && (
        <div
          className={`px-3.5 py-2.5 rounded-xl border font-mono text-[11px] flex flex-wrap items-center justify-between gap-2 ${
            inquiryState.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-amber-50 border-amber-200 text-amber-950'
          }`}
        >
          {inquiryState.ok ? (
            <>
              <span>
                KCB iBank Account <strong>{inquiryState.accountMasked}</strong>
                {inquiryState.accountTitle ? ` (${inquiryState.accountTitle})` : ''} · Status:{' '}
                <strong>{inquiryState.status}</strong>
              </span>
              <span className="font-bold text-emerald-800">
                {inquiryState.availableBalance !== undefined
                  ? `${inquiryState.currency} ${inquiryState.availableBalance.toLocaleString()}`
                  : 'Connected'}
              </span>
            </>
          ) : (
            <span>{inquiryState.error}</span>
          )}
        </div>
      )}

      {/* KCB iBank Action Switch: Deposit vs Withdrawal vs Real Money Transfer */}
      <div className="grid grid-cols-3 gap-2 p-1 bg-white border border-slate-200 rounded-xl shadow-xs font-mono text-xs">
        <button
          type="button"
          onClick={() => {
            setAction('DEPOSIT');
            setFeedback(null);
          }}
          className={`min-h-[44px] py-2.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer font-bold ${
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
          className={`min-h-[44px] py-2.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer font-bold ${
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
          className={`min-h-[44px] py-2.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer font-bold ${
            action === 'TRANSFER'
              ? 'bg-[#004d25] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4 shrink-0" />
          <span>Money Transfer</span>
        </button>
      </div>

      {/* KCB Endpoints & Callback URLs */}
      <div className="p-3.5 bg-white border border-emerald-200 rounded-xl shadow-xs space-y-2.5">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-[#004d25] shrink-0" />
          <div>
            <h4 className="font-bold text-slate-900 text-xs">
              KCB iBank, Buni Open Banking &amp; Paybill {statusInfo.kcbPaybill} Endpoints
            </h4>
            <p className="text-[10px] text-slate-500">
              Secrets stay on server (`KCB_CONSUMER_KEY`, `KCB_CONSUMER_SECRET`, `KCB_DEBIT_ACCOUNT`, `KCB_IBANK_ACCOUNT`). Supports KCB Buni, Daraja STK/B2B 522522, PayHero Bank 01, and IPN callbacks.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 font-mono text-[10px]">
          {[
            {
              key: 'deposit',
              label: 'KCB iBank Deposit Endpoint (Collection / Vooma STK / Paybill 522522)',
              value: statusInfo.urls.depositUrl,
              openHref: `${statusInfo.urls.depositUrl}?amount=${safeAmt}&account=${safeAcct}&phone=${safePhone}&rail=${kcbRail}`,
            },
            {
              key: 'withdraw',
              label: 'KCB iBank Withdrawal Endpoint (Deriv Real -> KCB iBank Account)',
              value: statusInfo.urls.withdrawUrl,
              openHref: `${statusInfo.urls.withdrawUrl}?amount=${safeAmt}&account=${safeAcct}&phone=${safePhone}&rail=${kcbRail}`,
            },
            {
              key: 'transfer',
              label: 'KCB Real Money Transfer Endpoint (IFT / Paybill 522522 / Vooma / PesaLink)',
              value: statusInfo.urls.transferUrl,
              openHref: `${statusInfo.urls.transferUrl}?amount=${safeAmt}&account=${safeAcct}&rail=${kcbRail}`,
            },
            {
              key: 'ipn',
              label: 'KCB Buni Instant Payment Notification (IPN) URL (POST)',
              value: statusInfo.urls.ipnUrl,
            },
            {
              key: 'callback',
              label: 'KCB Buni Funds Transfer Callback URL (POST)',
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
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#004d25] hover:bg-[#006633] text-white font-bold"
                  >
                    <ExternalLink className="w-3 h-3 text-[#84bd00]" />
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
              Preview URL is auth-gated for external IPN webhooks: set public{' '}
              <strong>MPESA_CALLBACK_BASE_URL</strong> / <strong>APP_URL</strong> for automated KCB Buni callbacks at{' '}
              <strong>/api/kcb/callback</strong>.
            </span>
          </div>
        )}
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

      {/* KCB iBank Action Form */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
              {action === 'DEPOSIT'
                ? 'Target Account (KCB iBank Collection -> Terminal Credit on Verification)'
                : action === 'WITHDRAWAL'
                ? 'Source Deriv Real Account -> Payout to KCB iBank Account'
                : effectiveFundingSource === 'STANDALONE_GATEWAY'
                ? 'Independent Real Money Transfer -> Direct KCB iBank (No Deriv Needed)'
                : 'Source Deriv Real Account -> Real Money Transfer to KCB iBank'}
            </span>
            <span className="font-mono font-bold text-slate-900 text-xs">
              {action === 'DEPOSIT'
                ? targetAccount === 'REAL' || account.isReal
                  ? `Deriv Real (${realAccount.loginId})`
                  : `Demo Virtual (${account.loginId})`
                : action === 'TRANSFER' && effectiveFundingSource === 'STANDALONE_GATEWAY'
                ? `KCB iBank / Buni Direct · Up to $10,000 USD (${statusInfo.mode})`
                : `${realAccount.loginId} · $${realAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD Available`}
            </span>
          </div>

          {action === 'DEPOSIT' && !account.isReal ? (
            <div className="flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 font-mono text-[10px]">
              <button
                type="button"
                onClick={() => setTargetAccount('REAL')}
                className={`px-2.5 py-1 rounded-md cursor-pointer font-bold ${
                  targetAccount === 'REAL' ? 'bg-emerald-600 text-white' : 'text-slate-600'
                }`}
              >
                Deriv Real
              </button>
              <button
                type="button"
                onClick={() => setTargetAccount('CURRENT')}
                className={`px-2.5 py-1 rounded-md cursor-pointer font-bold ${
                  targetAccount === 'CURRENT' ? 'bg-slate-800 text-white' : 'text-slate-600'
                }`}
              >
                Demo Virtual
              </button>
            </div>
          ) : action === 'WITHDRAWAL' ? (
            <button
              type="button"
              onClick={() => setUsdAmount(Math.floor(realAccount.balance))}
              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-mono text-[10px] font-bold cursor-pointer"
            >
              Max Real (${Math.floor(realAccount.balance)})
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() => setTransferFundingSource('STANDALONE_GATEWAY')}
                  className={`px-2 py-1 rounded-md cursor-pointer font-bold ${
                    transferFundingSource === 'STANDALONE_GATEWAY' ? 'bg-[#004d25] text-white' : 'text-slate-600'
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
                  className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-mono text-[10px] font-bold cursor-pointer"
                >
                  Max (${Math.floor(realAccount.balance)})
                </button>
              )}
            </div>
          )}
        </div>

        {/* KCB iBank Rail Switch */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-slate-800 block">
            {action === 'DEPOSIT' ? 'KCB iBank Collection Channel' : 'KCB iBank Settlement Channel'}
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[10px]">
            {(
              [
                { id: 'kcb_account', label: 'KCB iBank (IFT)', icon: Landmark },
                { id: 'paybill_522522', label: `Paybill ${statusInfo.kcbPaybill}`, icon: Building2 },
                { id: 'kcb_vooma', label: 'KCB Vooma App', icon: Smartphone },
                { id: 'pesalink', label: 'KCB PesaLink', icon: ArrowRightLeft },
              ] as const
            ).map((rail) => {
              const Icon = rail.icon;
              return (
                <button
                  key={rail.id}
                  type="button"
                  onClick={() => setKcbRail(rail.id)}
                  className={`min-h-[40px] py-2 px-2 rounded-lg border flex items-center justify-center gap-1 cursor-pointer font-bold transition-colors ${
                    kcbRail === rail.id
                      ? 'bg-[#004d25] text-white border-[#004d25]'
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

        {/* Amount Input + Real-Time Validation */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <label className="font-bold text-slate-800">
              {action === 'DEPOSIT'
                ? 'KCB iBank Deposit Amount (USD)'
                : action === 'WITHDRAWAL'
                ? 'KCB iBank Withdrawal Amount (USD)'
                : 'KCB Real Money Transfer Amount (USD)'}
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
                  : 'border-slate-300 focus:border-[#004d25]'
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
                    ? 'bg-[#004d25] text-white border-[#004d25] font-bold'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>

        {/* Account / Vooma Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {kcbRail === 'kcb_vooma' ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-800 text-xs flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5 text-[#004d25]" />
                  <span>KCB Vooma / M-Pesa Mobile</span>
                </label>
                <button
                  type="button"
                  onClick={() => setPhone('0728424076')}
                  className="text-[10px] font-mono font-bold text-emerald-700 hover:underline cursor-pointer"
                >
                  0728424076
                </button>
              </div>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0728424076"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-[#004d25]"
              />
              {parsedPhone.valid && (
                <span className="text-[10px] font-mono text-emerald-700 block mt-1">
                  MSISDN: {parsedPhone.msisdn}
                </span>
              )}
            </div>
          ) : (
            <div>
              <label className="font-bold text-slate-800 text-xs block mb-1">
                {action === 'DEPOSIT'
                  ? 'Sender / KCB iBank Account Reference (Optional)'
                  : kcbRail === 'paybill_522522'
                  ? 'KCB Paybill 522522 Account Number'
                  : 'KCB iBank Account Number'}
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder={action === 'DEPOSIT' ? 'Defaults to KCB merchant / iBank account' : 'e.g. 1100293847'}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-[#004d25]"
              />
              {action !== 'DEPOSIT' && accountNumber.trim().length > 0 && !accountValid && (
                <span className="text-[10px] font-mono text-rose-600 block mt-1">
                  Enter 6–20 digits/alphanumeric characters.
                </span>
              )}
            </div>
          )}

          <div>
            <label className="font-bold text-slate-800 text-xs block mb-1">
              {action === 'DEPOSIT' ? 'Depositor / KCB Account Holder' : 'Beneficiary Account Holder Name'}
            </label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Account holder name on KCB iBank"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-[#004d25]"
            />
          </div>

          <div>
            <label className="font-bold text-slate-800 text-xs block mb-1">
              {kcbRail === 'kcb_vooma'
                ? 'Upstream Execution Route'
                : action === 'DEPOSIT'
                ? 'Mobile Number for STK Prompt (Optional)'
                : 'SMS Alert Mobile (Optional)'}
            </label>
            {kcbRail === 'kcb_vooma' ? (
              <select
                value={dispatchVia}
                onChange={(e) => setDispatchVia(e.target.value as typeof dispatchVia)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-[#004d25]"
              >
                <option value="auto">Auto (KCB Buni -&gt; Bridge)</option>
                <option value="buni">KCB Buni Vooma / STK API</option>
                {action === 'DEPOSIT' && <option value="daraja_stk">Safaricom Daraja STK Push</option>}
                <option value="bridge">KCB iBank Webhook Bridge</option>
              </select>
            ) : (
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0728424076"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-[#004d25]"
              />
            )}
          </div>

          <div>
            <label className="font-bold text-slate-800 text-xs block mb-1">
              {kcbRail === 'kcb_vooma' ? 'Narration / Reference' : 'Narration / Upstream Route'}
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder={`KCB iBank ${action.toLowerCase()} reference`}
                className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-[#004d25]"
              />
              {kcbRail !== 'kcb_vooma' && (
                <select
                  value={dispatchVia}
                  onChange={(e) => setDispatchVia(e.target.value as typeof dispatchVia)}
                  title="Select upstream dispatch rail"
                  className="px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-[10px] text-slate-800 font-bold focus:outline-none focus:border-[#004d25]"
                >
                  <option value="auto">Auto</option>
                  <option value="buni">{action === 'DEPOSIT' ? 'Buni STK' : 'Buni IFT'}</option>
                  {action === 'DEPOSIT' ? (
                    <option value="daraja_stk">Daraja STK</option>
                  ) : (
                    <>
                      <option value="daraja_b2b">B2B 522522</option>
                      <option value="payhero_bank">PayHero Bank 01</option>
                    </>
                  )}
                  <option value="bridge">KCB Bridge</option>
                </select>
              )}
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || Boolean(amountValidationError)}
          className={`w-full min-h-[46px] py-3.5 rounded-xl font-mono text-sm font-bold text-white shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 ${
            action === 'DEPOSIT'
              ? 'bg-emerald-600 hover:bg-emerald-500'
              : action === 'WITHDRAWAL'
              ? 'bg-rose-600 hover:bg-rose-500'
              : 'bg-[#004d25] hover:bg-[#006633]'
          }`}
        >
          {action === 'DEPOSIT' ? (
            <ArrowDownLeft className="w-4 h-4" />
          ) : action === 'WITHDRAWAL' ? (
            <ArrowUpRight className="w-4 h-4" />
          ) : (
            <Landmark className="w-4 h-4 text-[#84bd00]" />
          )}
          <span>
            {isSubmitting
              ? `PROCESSING KCB IBANK ${action}...`
              : action === 'DEPOSIT'
              ? `DEPOSIT VIA KCB IBANK $${usdAmount.toFixed(2)} (KES ${kesAmount.toLocaleString()})`
              : action === 'WITHDRAWAL'
              ? `WITHDRAW TO KCB IBANK $${usdAmount.toFixed(2)} (KES ${kesAmount.toLocaleString()})`
              : `REAL MONEY TRANSFER VIA KCB IBANK $${usdAmount.toFixed(2)} (KES ${kesAmount.toLocaleString()})`}
          </span>
        </button>

        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-[#004d25] shrink-0" />
          <span>
            Strict verification: All KCB iBank deposits, withdrawals, and real money transfers remain PENDING until verified by KCB Buni IPN ({statusInfo.urls.callbackUrl}), Daraja 522522, or bank receipt.
          </span>
        </div>
      </form>

      {/* KCB iBank Ledger */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-900 text-xs">
            KCB iBank Deposits, Withdrawals &amp; Money Transfers
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            {kcbHistory.length} record{kcbHistory.length === 1 ? '' : 's'}
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

        {kcbHistory.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-center font-mono text-[11px] text-slate-500">
            No KCB iBank transactions submitted yet. Choose Deposit, Withdraw, or Money Transfer above.
          </div>
        ) : (
          <div className="space-y-2">
            {kcbHistory.map((item) => {
              const isDep = item.type === 'DEPOSIT' || item.kcbAction === 'DEPOSIT';
              const isWth = item.kcbAction === 'WITHDRAWAL';
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
                              : isWth
                              ? 'bg-rose-600 text-white'
                              : 'bg-[#004d25] text-[#84bd00]'
                          }`}
                        >
                          {isDep ? 'KCB IBANK DEPOSIT' : isWth ? 'KCB IBANK WITHDRAWAL' : 'KCB IBANK TRANSFER'}
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
                          <span>Pending KCB</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {!isConfirmed && !isRejected && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-amber-200/80">
                      <span className="text-[10px] text-amber-900">
                        Awaiting KCB iBank confirmation for {item.kcbAccountNumber || item.destinationOrSource}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={verifyingTxId === item.id}
                          onClick={() => handleVerifyStatus(item.id, remoteRef)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#004d25] hover:bg-[#006633] text-white text-[10px] font-bold cursor-pointer disabled:opacity-60"
                        >
                          <RefreshCw
                            className={`w-3 h-3 text-[#84bd00] ${verifyingTxId === item.id ? 'animate-spin' : ''}`}
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

      {/* KCB Buni IPN Webhook Listener & Recent Notifications */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-bold text-slate-900 text-xs block">
              KCB IPN (Instant Payment Notification) Receiver
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              Accepts KCB Buni IPN &amp; Paybill {statusInfo.kcbPaybill} webhooks (Signature HMAC-SHA256 hex/base64 or Bearer/API-Key when secret is set) and replies &#123;statusCode: &quot;0&quot;, statusMessage: &quot;Success&quot;&#125;.
            </span>
          </div>
          <button
            type="button"
            onClick={loadKcbIpnFeed}
            disabled={isLoadingIpn}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono text-[10px] font-bold cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingIpn ? 'animate-spin' : ''}`} />
            <span>Refresh IPN</span>
          </button>
        </div>

        {ipnFeed.length === 0 ? (
          <div className="p-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 font-mono text-[10px] text-slate-500">
            No incoming KCB IPN notifications recorded yet. Register <strong>{statusInfo.urls.ipnUrl}</strong> in KCB Buni IPN settings to auto-credit Paybill {statusInfo.kcbPaybill} &amp; iBank deposits in real time.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {ipnFeed.map((w) => (
              <div
                key={w.id}
                className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[10px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-slate-900">{w.mpesaReceipt || w.reference || 'UNMATCHED'}</span>
                    {w.resultCode && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 text-[9px] font-bold">
                        {w.resultCode}
                      </span>
                    )}
                    <span className="text-slate-400">{new Date(w.receivedAt).toLocaleTimeString()}</span>
                  </div>
                  {w.resultDesc && <span className="text-slate-600 block truncate">{w.resultDesc}</span>}
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                    w.matchedTransaction
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-900 border border-amber-200'
                  }`}
                >
                  {w.matchedTransaction ? 'Matched Tx' : 'Logged IPN'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
