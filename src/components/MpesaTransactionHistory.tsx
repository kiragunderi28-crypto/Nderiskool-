import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { CashierTransaction, TransactionStatus } from '../types/trading';
import { usdToKes } from '../utils/mpesa';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Copy,
  Check,
  Smartphone,
} from 'lucide-react';

export interface DarajaMpesaApiRecord {
  id: string;
  type:
    | 'STK_DEPOSIT'
    | 'B2C_WITHDRAWAL'
    | 'B2B_TRANSFER'
    | 'C2B_DEPOSIT'
    | 'VALTEX_DEPOSIT'
    | 'VALTEX_WITHDRAWAL'
    | 'PAYHERO_DEPOSIT'
    | 'PAYHERO_WITHDRAWAL'
    | 'PAYHERO_TRANSFER'
    | 'KCB_DEPOSIT'
    | 'KCB_WITHDRAWAL'
    | 'KCB_TRANSFER';
  environment?: 'sandbox' | 'production';
  phone: string;
  recipientPhone?: string;
  valtexAccountId?: string;
  usdAmount: number;
  kesAmount: number;
  loginId?: string;
  status: 'PENDING' | 'COMPLETED' | 'REJECTED';
  mpesaReceipt?: string;
  resultDesc?: string;
  safaricomConfirmationText?: string;
  receiverPublicName?: string;
  completedAtText?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface MpesaTransactionHistoryProps {
  /** Optional external/local transactions list; falls back to TradingContext state when omitted */
  transactions?: CashierTransaction[];
  /** Optional M-Pesa API response records; fetched from /api/mpesa/transactions automatically when omitted */
  apiTransactions?: DarajaMpesaApiRecord[];
  /** Show only MPESA method records by default, with toggle to include all gateway methods */
  mpesaOnlyDefault?: boolean;
}

type UiStatusLabel = 'Pending' | 'Confirmed' | 'Failed';

function mapStatusLabel(status: TransactionStatus | 'PENDING' | 'COMPLETED' | 'REJECTED'): UiStatusLabel {
  if (status === 'COMPLETED') return 'Confirmed';
  if (status === 'REJECTED') return 'Failed';
  return 'Pending';
}

export const MpesaTransactionHistory: React.FC<MpesaTransactionHistoryProps> = ({
  transactions: externalTransactions,
  apiTransactions: externalApiTransactions,
  mpesaOnlyDefault = true,
}) => {
  const {
    cashierTransactions,
    mpesaGatewayStatus,
    safaricomPhone,
    cancelPendingWithdrawal,
    confirmMpesaTransaction,
    verifyValtexTransactionStatus,
    verifyPayHeroTransactionStatus,
    verifyKcbTransferStatus,
    p2pAutoRefreshEnabled,
    setP2pAutoRefreshEnabled,
    p2pLastRefreshedAt,
    isRefreshingP2p,
    refreshP2pTransactions,
  } = useTrading();

  const [apiRecords, setApiRecords] = useState<DarajaMpesaApiRecord[]>(externalApiTransactions || []);
  const [isLoadingApi, setIsLoadingApi] = useState<boolean>(false);
  const [apiSourceNote, setApiSourceNote] = useState<string>('Local State');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'DEPOSIT' | 'WITHDRAWAL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | UiStatusLabel>('ALL');
  const [mpesaOnly, setMpesaOnly] = useState<boolean>(mpesaOnlyDefault);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [verifyTargetId, setVerifyTargetId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState<string>('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number>(30);
  const mountedAtRef = React.useRef<number>(Date.now());

  const fetchApiTransactions = useCallback(async () => {
    if (externalApiTransactions) {
      setApiRecords(externalApiTransactions);
      setApiSourceNote('API Prop Response');
      return;
    }

    setIsLoadingApi(true);
    try {
      const res = await fetch('/api/mpesa/transactions');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.transactions)) {
          setApiRecords(data.transactions);
          setApiSourceNote(
            data.darajaConfigured
              ? data.environment === 'production'
                ? 'Safaricom M-Pesa Production (Live Confirmations)'
                : 'Safaricom Daraja API + Cashier Ledger'
              : 'Local State + M-Pesa Server API'
          );
        }
      }
    } catch {
      setApiSourceNote('Local State');
    } finally {
      setIsLoadingApi(false);
    }
  }, [externalApiTransactions]);

  useEffect(() => {
    fetchApiTransactions();
  }, [fetchApiTransactions, p2pLastRefreshedAt]);

  useEffect(() => {
    if (!p2pAutoRefreshEnabled) {
      setSecondsUntilRefresh(30);
      return;
    }
    const updateCountdown = () => {
      const base = p2pLastRefreshedAt || mountedAtRef.current;
      const elapsed = Math.floor((Date.now() - base) / 1000);
      const remaining = 30 - (elapsed % 30);
      setSecondsUntilRefresh(remaining === 30 && elapsed > 0 ? 0 : remaining);
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [p2pAutoRefreshEnabled, p2pLastRefreshedAt]);

  const mergedRows = useMemo(() => {
    const localSource = externalTransactions ?? cashierTransactions;
    const byKey = new Map<string, {
      id: string;
      localTxId?: string;
      type: 'DEPOSIT' | 'WITHDRAWAL';
      timestamp: number;
      method: string;
      methodName: string;
      phoneOrDest: string;
      loginId?: string;
      usdAmount: number;
      kesAmount: number;
      reference: string;
      status: UiStatusLabel;
      rawStatus: TransactionStatus;
      note?: string;
      safaricomConfirmationText?: string;
      gatewayEnvironment?: 'sandbox' | 'production';
      source: 'LOCAL' | 'API';
    }>();

    for (const tx of localSource) {
      const key = tx.conversationId || tx.reference || tx.id;
      const isMpesa =
        tx.method === 'MPESA' ||
        tx.method === 'DERIV_P2P' ||
        tx.method === 'D_CASH' ||
        tx.method === 'VALTEX' ||
        tx.method === 'PAYHERO' ||
        tx.method === 'KCB_BANK';
      byKey.set(key, {
        id: tx.id,
        localTxId: tx.id,
        type: tx.type,
        timestamp: tx.timestamp,
        method: tx.method,
        methodName: tx.methodName,
        phoneOrDest: tx.destinationOrSource || tx.recipientPhone || (isMpesa ? safaricomPhone : 'Deriv Cashier'),
        loginId: tx.loginId,
        usdAmount: tx.amount,
        kesAmount: usdToKes(tx.amount),
        reference: tx.mpesaReceipt || tx.reference,
        status: mapStatusLabel(tx.status),
        rawStatus: tx.status,
        note: tx.note,
        safaricomConfirmationText: tx.safaricomConfirmationText,
        gatewayEnvironment: tx.gatewayEnvironment,
        source: 'LOCAL',
      });
    }

    for (const rec of apiRecords) {
      const existing = byKey.get(rec.id);
      const isValtexRec = rec.type === 'VALTEX_DEPOSIT' || rec.type === 'VALTEX_WITHDRAWAL';
      const isPayHeroRec =
        rec.type === 'PAYHERO_DEPOSIT' || rec.type === 'PAYHERO_WITHDRAWAL' || rec.type === 'PAYHERO_TRANSFER';
      const isKcbRec = rec.type === 'KCB_DEPOSIT' || rec.type === 'KCB_WITHDRAWAL' || rec.type === 'KCB_TRANSFER';
      const mappedType =
        rec.type === 'STK_DEPOSIT' ||
        rec.type === 'C2B_DEPOSIT' ||
        rec.type === 'VALTEX_DEPOSIT' ||
        rec.type === 'PAYHERO_DEPOSIT' ||
        rec.type === 'KCB_DEPOSIT'
          ? 'DEPOSIT'
          : 'WITHDRAWAL';
      const mappedStatus = mapStatusLabel(rec.status);
      if (existing) {
        if (!(existing.rawStatus === 'COMPLETED' && rec.status === 'PENDING')) {
          existing.status = mappedStatus;
          existing.rawStatus = rec.status;
        }
        if (rec.mpesaReceipt) existing.reference = rec.mpesaReceipt;
        if (rec.safaricomConfirmationText) existing.safaricomConfirmationText = rec.safaricomConfirmationText;
        if (rec.resultDesc && existing.rawStatus !== 'COMPLETED') {
          existing.note = rec.safaricomConfirmationText || rec.resultDesc;
        } else if (rec.safaricomConfirmationText) {
          existing.note = rec.safaricomConfirmationText;
        }
        if (rec.environment) existing.gatewayEnvironment = rec.environment;
        existing.source = 'API';
      } else {
        byKey.set(rec.id, {
          id: rec.id,
          type: mappedType,
          timestamp: rec.createdAt,
          method: isKcbRec ? 'KCB_BANK' : isPayHeroRec ? 'PAYHERO' : isValtexRec ? 'VALTEX' : 'MPESA',
          methodName:
            rec.type === 'KCB_DEPOSIT'
              ? 'KCB iBank Deposit'
              : rec.type === 'KCB_WITHDRAWAL'
              ? 'KCB iBank Withdrawal'
              : rec.type === 'KCB_TRANSFER'
              ? 'KCB iBank Real Money Transfer'
              : rec.type === 'PAYHERO_DEPOSIT'
              ? 'PayHero STK Deposit'
              : rec.type === 'PAYHERO_TRANSFER'
              ? 'PayHero Money Transfer'
              : rec.type === 'PAYHERO_WITHDRAWAL'
              ? 'PayHero Withdrawal'
              : rec.type === 'VALTEX_DEPOSIT'
              ? 'Valtex App Deposit'
              : rec.type === 'VALTEX_WITHDRAWAL'
              ? 'Valtex App Withdrawal'
              : rec.type === 'STK_DEPOSIT'
              ? 'Safaricom M-Pesa STK'
              : rec.type === 'C2B_DEPOSIT'
              ? 'Safaricom M-Pesa C2B'
              : rec.type === 'B2B_TRANSFER'
              ? 'Safaricom Daraja B2B'
              : 'Safaricom M-Pesa B2C',
          phoneOrDest: rec.receiverPublicName || rec.recipientPhone || rec.phone,
          loginId: rec.loginId,
          usdAmount: rec.usdAmount,
          kesAmount: rec.kesAmount || usdToKes(rec.usdAmount),
          reference: rec.mpesaReceipt || rec.id,
          status: mappedStatus,
          rawStatus: rec.status,
          note: rec.safaricomConfirmationText || rec.resultDesc,
          safaricomConfirmationText: rec.safaricomConfirmationText,
          gatewayEnvironment: rec.environment,
          source: 'API',
        });
      }
    }

    return Array.from(byKey.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [apiRecords, cashierTransactions, externalTransactions, safaricomPhone]);

  const filteredRows = useMemo(() => {
    return mergedRows.filter((row) => {
      if (
        mpesaOnly &&
        row.method !== 'MPESA' &&
        row.method !== 'DERIV_P2P' &&
        row.method !== 'D_CASH' &&
        row.method !== 'VALTEX' &&
        row.method !== 'PAYHERO' &&
        row.method !== 'KCB_BANK'
      ) {
        return false;
      }
      if (typeFilter !== 'ALL' && row.type !== typeFilter) return false;
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      return true;
    });
  }, [mergedRows, mpesaOnly, typeFilter, statusFilter]);

  const summary = useMemo(() => {
    const base = mpesaOnly
      ? mergedRows.filter(
          (r) =>
            r.method === 'MPESA' ||
            r.method === 'DERIV_P2P' ||
            r.method === 'D_CASH' ||
            r.method === 'VALTEX' ||
            r.method === 'PAYHERO' ||
            r.method === 'KCB_BANK'
        )
      : mergedRows;
    return {
      total: base.length,
      pending: base.filter((r) => r.status === 'Pending').length,
      confirmed: base.filter((r) => r.status === 'Confirmed').length,
      failed: base.filter((r) => r.status === 'Failed').length,
    };
  }, [mergedRows, mpesaOnly]);

  const handleCopy = (ref: string, id: string) => {
    navigator.clipboard?.writeText(ref);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleVerifySubmit = (localTxId: string) => {
    setVerifyError(null);
    const res = confirmMpesaTransaction(localTxId, verifyCode);
    if (!res.success) {
      setVerifyError(res.message);
      return;
    }
    setVerifyTargetId(null);
    setVerifyCode('');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden text-xs">
      {/* Header Bar */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#0b1930] text-white flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4 text-[#2bbbad]" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">M-Pesa Transaction History</h3>
            <p className="text-[10px] text-slate-500 font-mono">
              {apiSourceNote} · Withdrawal Confirm:{' '}
              {mpesaGatewayStatus.liveWithdrawalReady
                ? 'Live Production (api.safaricom.co.ke · SMS Active)'
                : mpesaGatewayStatus.oauthVerified
                ? `Daraja OAuth Verified (${(mpesaGatewayStatus.withdrawalConfirmationEnvironment || 'production').toUpperCase()})`
                : mpesaGatewayStatus.darajaConfigured
                ? 'PRODUCTION (api.safaricom.co.ke · Verify Production OAuth)'
                : 'Unconfigured / Local'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setP2pAutoRefreshEnabled(!p2pAutoRefreshEnabled)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[10px] font-bold transition-colors cursor-pointer ${
              p2pAutoRefreshEnabled
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                p2pAutoRefreshEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span>
              {p2pAutoRefreshEnabled
                ? `Auto 30s (${isRefreshingP2p || isLoadingApi ? 'syncing...' : `${secondsUntilRefresh}s`})`
                : 'Auto 30s: Paused'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMpesaOnly((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border font-mono text-[10px] font-bold transition-colors cursor-pointer ${
              mpesaOnly
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
          >
            {mpesaOnly ? 'M-Pesa Only' : 'All Cashier Methods'}
          </button>

          <button
            type="button"
            onClick={async () => {
              await refreshP2pTransactions(false);
              await fetchApiTransactions();
            }}
            disabled={isLoadingApi || isRefreshingP2p}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-mono text-[10px] font-semibold cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingApi || isRefreshingP2p ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Status Summary & Filters */}
      <div className="px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-white">
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
          {(['ALL', 'DEPOSIT', 'WITHDRAWAL'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`px-2.5 py-1 rounded-md border font-bold transition-colors cursor-pointer ${
                typeFilter === t
                  ? 'bg-[#0b1930] text-white border-[#0b1930]'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {t === 'ALL' ? 'All Types' : t === 'DEPOSIT' ? 'Deposits' : 'Withdrawals'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
          {(['ALL', 'Pending', 'Confirmed', 'Failed'] as const).map((st) => {
            const count =
              st === 'ALL'
                ? summary.total
                : st === 'Pending'
                ? summary.pending
                : st === 'Confirmed'
                ? summary.confirmed
                : summary.failed;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2 py-1 rounded-md border font-semibold transition-colors cursor-pointer ${
                  statusFilter === st
                    ? st === 'Confirmed'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : st === 'Failed'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : st === 'Pending'
                      ? 'bg-amber-500 text-slate-950 border-amber-500'
                      : 'bg-[#0b1930] text-white border-[#0b1930]'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {st} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Inline receipt verify error */}
      {verifyError && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-mono text-[11px]">
          {verifyError}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono tabular-nums">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="py-2.5 px-3 font-semibold">Date / Time</th>
              <th className="py-2.5 px-3 font-semibold">Type</th>
              <th className="py-2.5 px-3 font-semibold">SafariCom / Account</th>
              <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
              <th className="py-2.5 px-3 font-semibold">Reference</th>
              <th className="py-2.5 px-3 font-semibold text-center">Status</th>
              <th className="py-2.5 px-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[11px]">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                  No M-Pesa deposits or withdrawals match the selected filter.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const isDeposit = row.type === 'DEPOSIT';
                const dateObj = new Date(row.timestamp);
                const dateStr = dateObj.toLocaleDateString();
                const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                return (
                  <React.Fragment key={row.id}>
                    <tr className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                        <span className="font-semibold text-slate-800 block">{dateStr}</span>
                        <span className="text-[10px] text-slate-400">{timeStr}</span>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px] ${
                            isDeposit
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {isDeposit ? (
                            <ArrowDownLeft className="w-3 h-3" />
                          ) : (
                            <ArrowUpRight className="w-3 h-3" />
                          )}
                          <span>{isDeposit ? 'Deposit' : 'Withdrawal'}</span>
                        </span>
                      </td>

                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-900 block truncate max-w-[220px]">
                          {row.phoneOrDest}
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate max-w-[220px] font-sans">
                          {row.loginId ? `${row.loginId} · ` : ''}
                          {row.methodName}
                        </span>
                        {(row.safaricomConfirmationText || row.note) && (
                          <span
                            className={`text-[10px] block truncate max-w-[240px] font-mono mt-0.5 ${
                              row.safaricomConfirmationText
                                ? 'text-emerald-700 font-semibold'
                                : row.status === 'Failed'
                                ? 'text-rose-600'
                                : 'text-slate-500'
                            }`}
                            title={row.safaricomConfirmationText || row.note}
                          >
                            {row.safaricomConfirmationText || row.note}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span
                          className={`font-bold block ${
                            isDeposit ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {isDeposit ? '+' : '-'}${row.usdAmount.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          KES {row.kesAmount.toLocaleString()}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleCopy(row.reference, row.id)}
                          className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-950 cursor-pointer"
                          title="Copy Reference"
                        >
                          <span className="max-w-[120px] truncate">{row.reference}</span>
                          {copiedId === row.id ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3 text-slate-400" />
                          )}
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {row.status === 'Confirmed' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Confirmed</span>
                          </span>
                        )}
                        {row.status === 'Pending' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300 font-bold text-[10px]">
                            <Clock className="w-3 h-3" />
                            <span>Pending</span>
                          </span>
                        )}
                        {row.status === 'Failed' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[10px]">
                            <XCircle className="w-3 h-3" />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {row.status === 'Pending' && row.localTxId ? (
                          <div className="inline-flex items-center gap-1.5">
                            {row.method === 'KCB_BANK' ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  setVerifyError(null);
                                  const res = await verifyKcbTransferStatus(row.reference || row.localTxId!);
                                  await fetchApiTransactions();
                                  if (!res.ok) {
                                    setVerifyError(res.message);
                                  }
                                }}
                                className="px-2 py-1 rounded bg-[#004d25] hover:bg-[#006633] text-white text-[10px] font-bold cursor-pointer"
                              >
                                Verify KCB
                              </button>
                            ) : row.method === 'PAYHERO' ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  setVerifyError(null);
                                  const res = await verifyPayHeroTransactionStatus(row.reference || row.localTxId!);
                                  await fetchApiTransactions();
                                  if (!res.ok) {
                                    setVerifyError(res.message);
                                  }
                                }}
                                className="px-2 py-1 rounded bg-indigo-950 hover:bg-indigo-900 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Verify PayHero
                              </button>
                            ) : row.method === 'VALTEX' ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  setVerifyError(null);
                                  const res = await verifyValtexTransactionStatus(row.reference || row.localTxId!);
                                  await fetchApiTransactions();
                                  if (!res.ok) {
                                    setVerifyError(res.message);
                                  }
                                }}
                                className="px-2 py-1 rounded bg-[#0b1930] hover:bg-slate-800 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Verify Valtex
                              </button>
                            ) : row.method === 'MPESA' ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  setVerifyError(null);
                                  try {
                                    const res = await fetch('/api/mpesa/transaction-status', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ transactionId: row.reference || row.id }),
                                    });
                                    const d = await res.json().catch(() => ({}));
                                    await refreshP2pTransactions(false);
                                    await fetchApiTransactions();
                                    if (!res.ok || !d.ok) {
                                      setVerifyError(
                                        String(
                                          d.error ||
                                            d.message ||
                                            'Awaiting verified Safaricom callback before marking Confirmed.'
                                        )
                                      );
                                    }
                                  } catch {
                                    setVerifyError('Unable to reach /api/mpesa/transaction-status.');
                                  }
                                }}
                                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Query Status
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setVerifyTargetId((prev) => (prev === row.localTxId ? null : row.localTxId!));
                                  setVerifyError(null);
                                }}
                                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Confirm
                              </button>
                            )}
                            {(row.type === 'WITHDRAWAL' ||
                              row.method === 'DERIV_P2P' ||
                              row.method === 'D_CASH' ||
                              row.method === 'VALTEX' ||
                              row.method === 'PAYHERO' ||
                              row.method === 'KCB_BANK') && (
                              <button
                                type="button"
                                onClick={() => {
                                  setVerifyError(null);
                                  cancelPendingWithdrawal(row.localTxId!);
                                }}
                                className="px-2 py-1 rounded bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold cursor-pointer"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            {row.source === 'API' ? 'API' : 'Ledger'}
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* Expandable Receipt Confirmation Row for External Escrow Items */}
                    {verifyTargetId === row.localTxId &&
                      (row.method === 'DERIV_P2P' || row.method === 'D_CASH') && (
                      <tr className="bg-amber-50/70">
                        <td colSpan={7} className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] text-amber-900 font-semibold">
                              Enter verified Safaricom M-Pesa / DP2P Receipt Code to confirm:
                            </span>
                            <input
                              type="text"
                              value={verifyCode}
                              onChange={(e) => {
                                setVerifyError(null);
                                setVerifyCode(e.target.value);
                              }}
                              placeholder="Required receipt code (e.g. SLK82940PQ)"
                              className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-slate-900 text-[11px] focus:outline-none focus:border-emerald-600"
                            />
                            <button
                              type="button"
                              onClick={() => handleVerifySubmit(row.localTxId!)}
                              className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                            >
                              Save Receipt
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setVerifyError(null);
                                setVerifyTargetId(null);
                              }}
                              className="px-2 py-1 rounded-md bg-white border border-slate-300 text-slate-600 text-[10px] cursor-pointer"
                            >
                              Dismiss
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
