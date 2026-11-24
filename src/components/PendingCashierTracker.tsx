import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { CashierTransaction } from '../types/trading';
import { usdToKes } from '../utils/mpesa';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wallet,
  XCircle,
} from 'lucide-react';

interface PendingCashierTrackerProps {
  defaultFilter?: 'ALL' | 'DEPOSIT' | 'WITHDRAWAL';
  collapsedByDefault?: boolean;
  onStatusFeedback?: (feedback: { ok: boolean; message: string; txType: string }) => void;
}

interface IntegrationProgressMeta {
  integrationLabel: string;
  integrationFamily: 'MPESA' | 'BANK' | 'PARTNER';
  estimatedWindowLabel: string;
  estimatedSeconds: number;
  stageIndex: 1 | 2 | 3 | 4;
  stageLabel: string;
  stageDetail: string;
  progressPct: number;
  elapsedLabel: string;
  etaLabel: string;
  isDelayed: boolean;
}

const formatDurationClock = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe < 60) return `${safe}s`;
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  if (mins < 60) return `${mins}m ${String(secs).padStart(2, '0')}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
};

const getIntegrationProgressMeta = (
  tx: CashierTransaction,
  nowMs: number,
  gatewayShortcode?: string
): IntegrationProgressMeta => {
  const elapsedSec = Math.max(0, (nowMs - tx.timestamp) / 1000);
  const elapsedLabel = formatDurationClock(elapsedSec);

  let integrationLabel = tx.methodName || 'Cashier Gateway';
  let integrationFamily: 'MPESA' | 'BANK' | 'PARTNER' = 'PARTNER';
  let estimatedWindowLabel = '15s – 60s';
  let estimatedSeconds = 45;
  let stepLabels: [string, string, string] = [
    'Request Validated',
    'Gateway Processing',
    'Callback Verified',
  ];

  if (tx.method === 'MPESA') {
    integrationFamily = 'MPESA';
    if (tx.type === 'DEPOSIT') {
      integrationLabel = `M-Pesa STK Push · Shortcode #${gatewayShortcode || 'Daraja'}`;
      estimatedWindowLabel = '15s – 45s';
      estimatedSeconds = 35;
      stepLabels = [
        'STK Push Sent',
        'Awaiting M-Pesa PIN Entry',
        'Safaricom IPN Settlement',
      ];
    } else {
      integrationLabel = `Safaricom Daraja B2C · ${tx.recipientPhone || tx.destinationOrSource || 'Mobile'}`;
      estimatedWindowLabel = '10s – 30s';
      estimatedSeconds = 25;
      stepLabels = [
        'Payout Authorized',
        'Daraja B2C Queue Processing',
        'M-Pesa SMS & Receipt Confirmed',
      ];
    }
  } else if (tx.method === 'KCB_BANK') {
    integrationFamily = 'BANK';
    const rail = tx.kcbTransferRail || 'kcb_account';
    if (rail === 'pesalink') {
      integrationLabel = 'KCB iBank · PesaLink Interbank';
      estimatedWindowLabel = '30s – 2m';
      estimatedSeconds = 75;
      stepLabels = [
        'KCB Order Signed',
        'PesaLink Switch Clearing',
        'Bank IPN Settled',
      ];
    } else if (rail === 'kcb_vooma') {
      integrationFamily = 'MPESA';
      integrationLabel = 'KCB Vooma · Mobile Wallet';
      estimatedWindowLabel = '20s – 60s';
      estimatedSeconds = 45;
      stepLabels = [
        'Vooma Request Sent',
        'KCB Mobile Processing',
        'Receipt Verified',
      ];
    } else if (rail === 'paybill_522522') {
      integrationLabel = 'KCB iBank · Paybill 522522';
      estimatedWindowLabel = '15s – 90s';
      estimatedSeconds = 60;
      stepLabels = [
        'Paybill 522522 Initiated',
        'KCB Buni Clearing',
        'IPN Callback Confirmed',
      ];
    } else {
      integrationLabel = 'KCB iBank · Direct IFT Account';
      estimatedWindowLabel = '15s – 90s';
      estimatedSeconds = 60;
      stepLabels = [
        'IFT Instruction Signed',
        'KCB Core Banking Clearing',
        'FT Reference Confirmed',
      ];
    }
  } else if (tx.method === 'BANK_TRANSFER') {
    integrationFamily = 'BANK';
    integrationLabel = 'Direct Local / Wire Bank Transfer';
    estimatedWindowLabel = '15m – 45m (local)';
    estimatedSeconds = 1800;
    stepLabels = [
      'Instruction Logged',
      'Interbank Clearing Window',
      'Beneficiary Bank Settled',
    ];
  } else if (tx.method === 'PAYHERO') {
    if (tx.transferRail === 'bank') {
      integrationFamily = 'BANK';
      integrationLabel = 'PayHero · Bank 01 / PesaLink';
      estimatedWindowLabel = '30s – 2m';
      estimatedSeconds = 75;
    } else {
      integrationFamily = 'MPESA';
      integrationLabel = `PayHero · M-Pesa ${tx.transferRail ? tx.transferRail.toUpperCase() : 'STK/B2C'}`;
      estimatedWindowLabel = '15s – 45s';
      estimatedSeconds = 35;
    }
    stepLabels = [
      'PayHero Dispatched',
      'Channel Settlement Pending',
      'Webhook Confirmed',
    ];
  } else if (tx.method === 'VALTEX') {
    integrationFamily = 'MPESA';
    integrationLabel = 'Valtex M-Pesa Gateway';
    estimatedWindowLabel = '15s – 60s';
    estimatedSeconds = 45;
    stepLabels = [
      'Valtex Request Signed',
      'Awaiting Valtex Callback',
      'Callback Settled',
    ];
  } else if (tx.method === 'D_CASH') {
    integrationFamily = 'MPESA';
    integrationLabel = 'D Cash Payment Agent';
    estimatedWindowLabel = '1m – 5m';
    estimatedSeconds = 180;
    stepLabels = [
      'Agent Order Created',
      'D Cash / Safaricom Dispatch',
      'Receipt Confirmed',
    ];
  } else if (tx.method === 'DERIV_P2P') {
    integrationFamily = 'MPESA';
    integrationLabel = 'Deriv DP2P Local M-Pesa';
    estimatedWindowLabel = '2m – 10m';
    estimatedSeconds = 300;
    stepLabels = [
      'Escrow Created',
      'Agent Transfer in Progress',
      'Receipt Confirmed',
    ];
  } else if (tx.method === 'CRYPTO_BTC') {
    integrationLabel = 'Bitcoin (BTC) Blockchain';
    estimatedWindowLabel = '10m – 30m';
    estimatedSeconds = 900;
  } else if (tx.method === 'CRYPTO_USDT') {
    integrationLabel = 'USDT Stablecoin Network';
    estimatedWindowLabel = '1m – 3m';
    estimatedSeconds = 120;
  }

  if (tx.status === 'COMPLETED') {
    return {
      integrationLabel,
      integrationFamily,
      estimatedWindowLabel,
      estimatedSeconds,
      stageIndex: 4,
      stageLabel: 'Settled & Verified',
      stageDetail:
        tx.safaricomConfirmationText ||
        (tx.mpesaReceipt ? `Confirmed receipt ${tx.mpesaReceipt}` : 'Gateway callback verified'),
      progressPct: 100,
      elapsedLabel,
      etaLabel: `Completed in ${elapsedLabel}`,
      isDelayed: false,
    };
  }

  if (tx.status === 'REJECTED') {
    return {
      integrationLabel,
      integrationFamily,
      estimatedWindowLabel,
      estimatedSeconds,
      stageIndex: 4,
      stageLabel: 'Failed / Reversed',
      stageDetail: tx.note || 'Gateway rejected or cancelled — balance restored where applicable.',
      progressPct: 100,
      elapsedLabel,
      etaLabel: `Closed at ${elapsedLabel}`,
      isDelayed: false,
    };
  }

  const hasGatewayDispatched = Boolean(
    tx.conversationId ||
      tx.gatewayStatus === 'AWAITING_MPESA_CALLBACK' ||
      tx.gatewayStatus === 'AWAITING_KCB_CALLBACK' ||
      tx.gatewayStatus === 'AWAITING_PAYHERO_CALLBACK' ||
      tx.gatewayStatus === 'AWAITING_VALTEX_CALLBACK'
  );

  const ratio = Math.max(0, elapsedSec / estimatedSeconds);
  const asymptoticProgress = hasGatewayDispatched
    ? 40 + 50 * (1 - Math.exp(-2.15 * ratio))
    : 20 + 25 * (1 - Math.exp(-2.0 * ratio));
  const progressPct = Math.min(90, Math.max(hasGatewayDispatched ? 38 : 20, Math.round(asymptoticProgress)));

  let stageIndex: 1 | 2 | 3 = 1;
  let stageLabel = stepLabels[0];
  if (progressPct >= 62 && hasGatewayDispatched) {
    stageIndex = 3;
    stageLabel = stepLabels[2];
  } else if (hasGatewayDispatched || elapsedSec >= 3) {
    stageIndex = 2;
    stageLabel = stepLabels[1];
  }

  const remainingSec = Math.max(0, Math.ceil(estimatedSeconds - elapsedSec));
  const isDelayed = elapsedSec > estimatedSeconds * 1.25;
  const etaLabel = isDelayed
    ? `Awaiting callback (+${formatDurationClock(elapsedSec - estimatedSeconds)} over est.)`
    : remainingSec > 0
    ? `~${formatDurationClock(remainingSec)} remaining`
    : 'Finalizing gateway callback...';

  const stageDetail =
    tx.note ||
    (integrationFamily === 'BANK'
      ? 'Awaiting bank switch & IPN settlement confirmation.'
      : 'Awaiting Safaricom M-Pesa confirmation callback.');

  return {
    integrationLabel,
    integrationFamily,
    estimatedWindowLabel,
    estimatedSeconds,
    stageIndex,
    stageLabel,
    stageDetail,
    progressPct,
    elapsedLabel,
    etaLabel,
    isDelayed,
  };
};

export const PendingCashierTracker: React.FC<PendingCashierTrackerProps> = ({
  defaultFilter = 'ALL',
  collapsedByDefault = false,
  onStatusFeedback,
}) => {
  const {
    cashierTransactions,
    mpesaGatewayStatus,
    syncMpesaBalance,
    verifyKcbTransferStatus,
    verifyPayHeroTransactionStatus,
    verifyValtexTransactionStatus,
    confirmMpesaTransaction,
    cancelPendingWithdrawal,
  } = useTrading();

  const [filter, setFilter] = useState<'ALL' | 'DEPOSIT' | 'WITHDRAWAL'>(defaultFilter);
  const [isExpanded, setIsExpanded] = useState<boolean>(!collapsedByDefault);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [checkingTxId, setCheckingTxId] = useState<string | null>(null);
  const [isCheckingAll, setIsCheckingAll] = useState<boolean>(false);
  const [manualReceiptTxId, setManualReceiptTxId] = useState<string | null>(null);
  const [receiptInputs, setReceiptInputs] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  // Track recently settled items for 10 seconds so users see the 100% completion state cleanly
  const prevPendingIdsRef = useRef<Set<string>>(new Set());
  const [recentlySettled, setRecentlySettled] = useState<Record<string, number>>({});

  useEffect(() => {
    setFilter(defaultFilter);
  }, [defaultFilter]);

  useEffect(() => {
    const currentPending = new Set<string>();
    const newlyResolved: Record<string, number> = {};

    for (const tx of cashierTransactions) {
      if (tx.status === 'PENDING' || tx.status === 'PROCESSING') {
        currentPending.add(tx.id);
      } else if (prevPendingIdsRef.current.has(tx.id)) {
        newlyResolved[tx.id] = Date.now();
      }
    }
    prevPendingIdsRef.current = currentPending;

    if (Object.keys(newlyResolved).length > 0) {
      setRecentlySettled((prev) => ({ ...prev, ...newlyResolved }));
    }
  }, [cashierTransactions]);

  // Clean up expired recent-settled entries
  useEffect(() => {
    const settledEntries = Object.entries(recentlySettled);
    if (settledEntries.length === 0) return;

    const timer = setTimeout(() => {
      const cutoff = Date.now() - 10_000;
      setRecentlySettled((prev) => {
        const next: Record<string, number> = {};
        for (const [id, ts] of Object.entries(prev)) {
          if (ts > cutoff) next[id] = ts;
        }
        return next;
      });
    }, 2500);
    return () => clearTimeout(timer);
  }, [recentlySettled, nowMs]);

  const activeTransactions = useMemo(() => {
    const cutoff = nowMs - 10_000;
    return cashierTransactions
      .filter((tx) => {
        if (tx.status === 'PENDING' || tx.status === 'PROCESSING') return true;
        const settledAt = recentlySettled[tx.id];
        return Boolean(settledAt && settledAt > cutoff);
      })
      .sort((a, b) => {
        const aPending = a.status === 'PENDING' || a.status === 'PROCESSING';
        const bPending = b.status === 'PENDING' || b.status === 'PROCESSING';
        if (aPending && !bPending) return -1;
        if (bPending && !aPending) return 1;
        return b.timestamp - a.timestamp;
      });
  }, [cashierTransactions, nowMs, recentlySettled]);

  const hasPendingItems = activeTransactions.some(
    (t) => t.status === 'PENDING' || t.status === 'PROCESSING'
  );

  // 1-second live elapsed/ETA timer only while active items are visible
  useEffect(() => {
    if (activeTransactions.length === 0) return;
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTransactions.length]);

  const counts = useMemo(() => {
    const pendingOnly = activeTransactions.filter(
      (t) => t.status === 'PENDING' || t.status === 'PROCESSING'
    );
    const deposits = pendingOnly.filter((t) => t.type === 'DEPOSIT').length;
    const withdrawals = pendingOnly.filter((t) => t.type === 'WITHDRAWAL').length;
    return {
      totalPending: pendingOnly.length,
      deposits,
      withdrawals,
    };
  }, [activeTransactions]);

  const filteredTransactions = useMemo(() => {
    if (filter === 'DEPOSIT') {
      return activeTransactions.filter((t) => t.type === 'DEPOSIT');
    }
    if (filter === 'WITHDRAWAL') {
      return activeTransactions.filter((t) => t.type === 'WITHDRAWAL');
    }
    return activeTransactions;
  }, [activeTransactions, filter]);

  if (activeTransactions.length === 0) {
    return null;
  }

  const handleVerifySingle = async (tx: CashierTransaction) => {
    if (checkingTxId) return;
    setLocalError(null);
    setCheckingTxId(tx.id);
    try {
      const ref = tx.conversationId || tx.reference || tx.id;
      if (tx.method === 'KCB_BANK') {
        const res = await verifyKcbTransferStatus(ref);
        if (!res.ok) setLocalError(res.message);
        onStatusFeedback?.({ ok: res.ok, message: res.message, txType: tx.type });
      } else if (tx.method === 'PAYHERO') {
        const res = await verifyPayHeroTransactionStatus(ref);
        if (!res.ok) setLocalError(res.message);
        onStatusFeedback?.({ ok: res.ok, message: res.message, txType: tx.type });
      } else if (tx.method === 'VALTEX') {
        const res = await verifyValtexTransactionStatus(ref);
        if (!res.ok) setLocalError(res.message);
        onStatusFeedback?.({ ok: res.ok, message: res.message, txType: tx.type });
      } else if (tx.method === 'MPESA') {
        if (tx.type === 'WITHDRAWAL' && (tx.mpesaReceipt || tx.conversationId || tx.reference)) {
          await fetch('/api/mpesa/transaction-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactionId: tx.mpesaReceipt || tx.conversationId || tx.reference }),
          }).catch(() => null);
        }
        const res = await syncMpesaBalance();
        if (!res.ok) setLocalError(res.message);
        onStatusFeedback?.({ ok: res.ok, message: res.message, txType: tx.type });
      } else {
        const res = await syncMpesaBalance();
        if (!res.ok) setLocalError(res.message);
        onStatusFeedback?.({ ok: res.ok, message: res.message, txType: tx.type });
      }
    } catch {
      setLocalError('Unable to check gateway status right now. Please try again.');
    } finally {
      setCheckingTxId(null);
    }
  };

  const handleRefreshAll = async () => {
    if (isCheckingAll) return;
    setIsCheckingAll(true);
    setLocalError(null);
    try {
      const pending = activeTransactions.filter(
        (t) => t.status === 'PENDING' || t.status === 'PROCESSING'
      );
      const hasMpesa = pending.some((t) => t.method === 'MPESA' || t.method === 'D_CASH');
      if (hasMpesa) {
        await syncMpesaBalance();
      }
      const kcbRefs = pending.filter((t) => t.method === 'KCB_BANK').slice(0, 2);
      for (const tx of kcbRefs) {
        await verifyKcbTransferStatus(tx.conversationId || tx.reference || tx.id);
      }
      const phRefs = pending.filter((t) => t.method === 'PAYHERO').slice(0, 2);
      for (const tx of phRefs) {
        await verifyPayHeroTransactionStatus(tx.conversationId || tx.reference || tx.id);
      }
      const vxRefs = pending.filter((t) => t.method === 'VALTEX').slice(0, 2);
      for (const tx of vxRefs) {
        await verifyValtexTransactionStatus(tx.conversationId || tx.reference || tx.id);
      }
    } catch {
      setLocalError('Failed to refresh live gateway statuses.');
    } finally {
      setIsCheckingAll(false);
    }
  };

  const handleSubmitReceipt = (txId: string) => {
    setLocalError(null);
    const code = receiptInputs[txId] || '';
    const res = confirmMpesaTransaction(txId, code);
    if (!res.success) {
      setLocalError(res.message);
    } else {
      setManualReceiptTxId(null);
      setReceiptInputs((prev) => {
        const next = { ...prev };
        delete next[txId];
        return next;
      });
      onStatusFeedback?.({ ok: true, message: res.message, txType: 'RECEIPT' });
    }
  };

  return (
    <section
      aria-label="Real-Time Pending Deposits and Withdrawals Tracker"
      className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden"
    >
      {/* Header Row */}
      <div className="px-4 py-3 bg-[#0b1930] text-white flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {hasPendingItems ? (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[#2bbbad] shrink-0" />
          )}
          <div className="min-w-0">
            <h3 className="text-xs font-bold tracking-tight text-white truncate">
              Live M-Pesa &amp; Bank Settlement Tracker
            </h3>
            <p className="text-[11px] font-mono text-slate-300 tabular-nums">
              {counts.totalPending > 0
                ? `${counts.deposits} pending deposit${counts.deposits === 1 ? '' : 's'} · ${counts.withdrawals} pending withdrawal${counts.withdrawals === 1 ? '' : 's'}`
                : 'Recent gateway settlements verified'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Interactive Segmented Filter */}
          <div className="flex items-center gap-0.5 p-0.5 bg-white/10 rounded-lg font-mono text-[10px]">
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                filter === 'ALL' ? 'bg-white text-[#0b1930]' : 'text-slate-200 hover:text-white'
              }`}
            >
              All ({activeTransactions.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('DEPOSIT')}
              className={`px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                filter === 'DEPOSIT' ? 'bg-[#2bbbad] text-[#0b1930]' : 'text-slate-200 hover:text-white'
              }`}
            >
              Deposits ({counts.deposits})
            </button>
            <button
              type="button"
              onClick={() => setFilter('WITHDRAWAL')}
              className={`px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                filter === 'WITHDRAWAL' ? 'bg-amber-400 text-[#0b1930]' : 'text-slate-200 hover:text-white'
              }`}
            >
              Withdrawals ({counts.withdrawals})
            </button>
          </div>

          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={isCheckingAll}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#2bbbad]/20 hover:bg-[#2bbbad]/30 border border-[#2bbbad]/45 text-[#2bbbad] font-mono text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-60"
            title="Poll Safaricom Daraja, KCB Buni, PayHero, and Valtex for live callback settlement"
          >
            <RefreshCw className={`w-3 h-3 ${isCheckingAll ? 'animate-spin' : ''}`} />
            <span>{isCheckingAll ? 'Syncing...' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors cursor-pointer"
            aria-label={isExpanded ? 'Collapse live tracker' : 'Expand live tracker'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expandable Body */}
      {isExpanded && (
        <div className="divide-y divide-slate-200">
          {localError && (
            <div className="px-4 py-2 bg-rose-50 text-rose-800 text-[11px] font-mono flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>{localError}</span>
            </div>
          )}

          {filteredTransactions.length === 0 ? (
            <div className="px-4 py-4 text-center text-[11px] font-mono text-slate-500">
              No active {filter === 'DEPOSIT' ? 'pending deposits' : filter === 'WITHDRAWAL' ? 'pending withdrawals' : 'pending transactions'} right now.
            </div>
          ) : (
            filteredTransactions.slice(0, 6).map((tx) => {
              const meta = getIntegrationProgressMeta(tx, nowMs, mpesaGatewayStatus.shortcode);
              const isTransferAction = tx.kcbAction === 'TRANSFER' || tx.payheroAction === 'TRANSFER';
              const isCompleted = tx.status === 'COMPLETED';
              const isRejected = tx.status === 'REJECTED';
              const isEscrow = tx.method === 'DERIV_P2P' || tx.method === 'D_CASH';
              const kesEquivalent = usdToKes(tx.amount);

              const IntegrationIcon =
                meta.integrationFamily === 'BANK'
                  ? Landmark
                  : meta.integrationFamily === 'MPESA'
                  ? Smartphone
                  : Wallet;

              const barFillClass = isCompleted
                ? 'bg-emerald-600'
                : isRejected
                ? 'bg-rose-600'
                : meta.isDelayed
                ? 'bg-amber-500'
                : tx.type === 'DEPOSIT'
                ? 'bg-[#2bbbad]'
                : 'bg-[#0b1930]';

              return (
                <div
                  key={tx.id}
                  className={`p-4 space-y-2.5 transition-colors ${
                    isCompleted
                      ? 'bg-emerald-50/50'
                      : isRejected
                      ? 'bg-rose-50/40'
                      : 'bg-white'
                  }`}
                >
                  {/* Top Summary Line */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isCompleted
                            ? 'bg-emerald-100 text-emerald-700'
                            : isRejected
                            ? 'bg-rose-100 text-rose-700'
                            : tx.type === 'DEPOSIT'
                            ? 'bg-teal-50 text-teal-800'
                            : 'bg-slate-100 text-[#0b1930]'
                        }`}
                      >
                        <IntegrationIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-900">
                          {tx.type === 'DEPOSIT' ? (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : isTransferAction ? (
                            <ArrowLeftRight className="w-3.5 h-3.5 text-[#0b1930] shrink-0" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          )}
                          <span>
                            {tx.type === 'DEPOSIT'
                              ? 'Deposit'
                              : isTransferAction
                              ? 'Real Money Transfer'
                              : 'Withdrawal'}
                          </span>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <span className="truncate">{meta.integrationLabel}</span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                          <span>Ref: {tx.reference}</span>
                          {tx.destinationOrSource && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate max-w-[220px]">{tx.destinationOrSource}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="text-sm font-bold text-slate-900">
                        {tx.type === 'DEPOSIT' ? '+' : '-'}${tx.amount.toFixed(2)} USD
                      </div>
                      <div className="text-[11px] text-slate-500">
                        KES {kesEquivalent.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar & Live Stage */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                      <span
                        className={`font-semibold inline-flex items-center gap-1.5 ${
                          isCompleted
                            ? 'text-emerald-700'
                            : isRejected
                            ? 'text-rose-700'
                            : meta.isDelayed
                            ? 'text-amber-700'
                            : 'text-slate-800'
                        }`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : isRejected ? (
                          <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-[#2bbbad] shrink-0" />
                        )}
                        <span>
                          Stage {Math.min(meta.stageIndex, 3)}/3: {meta.stageLabel}
                        </span>
                      </span>

                      <span className="font-bold text-slate-900 tabular-nums">
                        {meta.progressPct}%
                      </span>
                    </div>

                    <div
                      role="progressbar"
                      aria-valuenow={meta.progressPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${tx.type} progress via ${meta.integrationLabel}`}
                      className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/80"
                    >
                      <div
                        className={`h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${barFillClass}`}
                        style={{ width: `${meta.progressPct}%` }}
                      />
                    </div>

                    {/* Elapsed & Estimated Completion Metadata */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-600 tabular-nums">
                      <span>
                        Elapsed: <strong className="text-slate-900">{meta.elapsedLabel}</strong>
                        {' · '}
                        Est. window: <strong className="text-slate-900">{meta.estimatedWindowLabel}</strong>
                      </span>
                      <span
                        className={
                          isCompleted
                            ? 'text-emerald-700 font-semibold'
                            : isRejected
                            ? 'text-rose-700 font-semibold'
                            : meta.isDelayed
                            ? 'text-amber-700 font-semibold'
                            : 'text-slate-700'
                        }
                      >
                        {meta.etaLabel}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      {meta.stageDetail}
                    </p>
                  </div>

                  {/* Interactive Actions */}
                  {(tx.status === 'PENDING' || tx.status === 'PROCESSING') && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-700">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>Callback-verified settlement active</span>
                      </span>

                      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                        <button
                          type="button"
                          onClick={() => handleVerifySingle(tx)}
                          disabled={checkingTxId === tx.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white font-bold transition-colors cursor-pointer disabled:opacity-60"
                        >
                          <RefreshCw className={`w-3 h-3 ${checkingTxId === tx.id ? 'animate-spin' : ''}`} />
                          <span>{checkingTxId === tx.id ? 'Checking...' : 'Check Status'}</span>
                        </button>

                        {isEscrow && (
                          <button
                            type="button"
                            onClick={() => {
                              setLocalError(null);
                              setManualReceiptTxId((prev) => (prev === tx.id ? null : tx.id));
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold transition-colors cursor-pointer"
                          >
                            Enter Receipt
                          </button>
                        )}

                        {tx.type === 'WITHDRAWAL' && (
                          <button
                            type="button"
                            onClick={() => {
                              setLocalError(null);
                              cancelPendingWithdrawal(tx.id);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 font-bold transition-colors cursor-pointer"
                          >
                            Cancel &amp; Refund
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {isEscrow &&
                    (tx.status === 'PENDING' || tx.status === 'PROCESSING') &&
                    manualReceiptTxId === tx.id && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200">
                      <input
                        type="text"
                        value={receiptInputs[tx.id] || ''}
                        onChange={(e) => {
                          setLocalError(null);
                          setReceiptInputs((prev) => ({ ...prev, [tx.id]: e.target.value }));
                        }}
                        placeholder="Safaricom / Escrow Code (e.g. SLK82940PQ)"
                        className="flex-1 min-w-[180px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-[11px] focus:outline-none focus:border-emerald-600"
                      />
                      <button
                        type="button"
                        onClick={() => handleSubmitReceipt(tx.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] font-bold cursor-pointer"
                      >
                        Verify Receipt
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
};
