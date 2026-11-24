import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { derivWsService } from '../services/derivWs';
import { B2BCommandId } from '../types/trading';
import { detectKenyanCarrier, normalizeKenyanPhone } from '../utils/mpesa';
import {
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  ExternalLink,
  CheckCircle2,
  Clock,
  Users,
  AlertCircle,
  XCircle,
  UserCheck,
  Building2,
} from 'lucide-react';

interface Dp2pPeerAdvert {
  id: string;
  advertiserName: string;
  rate: number;
  minAmount: number;
  maxAmount: number;
  completionRate: number;
  ordersCount: number;
  releaseTimeMins: number;
  paymentMethods: string[];
  description: string;
  isLiveAdvert: boolean;
}

const FALLBACK_SELL_PEERS_FOR_DEPOSIT: Dp2pPeerAdvert[] = [
  {
    id: 'ke-p2p-dep-1',
    advertiserName: 'NairobiFX_P2P',
    rate: 129.8,
    minAmount: 10,
    maxAmount: 2500,
    completionRate: 99.6,
    ordersCount: 1420,
    releaseTimeMins: 8,
    paymentMethods: ['M-Pesa Kenya', 'Safaricom STK'],
    description: 'Verified Kenya DP2P desk · Instant USD escrow release on M-Pesa receipt.',
    isLiveAdvert: false,
  },
  {
    id: 'ke-p2p-dep-2',
    advertiserName: 'MpesaSwift_KE',
    rate: 130.1,
    minAmount: 10,
    maxAmount: 1500,
    completionRate: 99.2,
    ordersCount: 980,
    releaseTimeMins: 10,
    paymentMethods: ['M-Pesa Paybill', 'Safaricom Till'],
    description: '24/7 Nairobi liquidity provider · Accepts 07xx / +254 M-Pesa transfers.',
    isLiveAdvert: false,
  },
  {
    id: 'ke-p2p-dep-3',
    advertiserName: 'KenyattaExchange',
    rate: 130.4,
    minAmount: 20,
    maxAmount: 5000,
    completionRate: 98.9,
    ordersCount: 645,
    releaseTimeMins: 12,
    paymentMethods: ['M-Pesa Kenya'],
    description: 'High-limit Deriv DP2P merchant for fast Real account funding.',
    isLiveAdvert: false,
  },
];

const FALLBACK_BUY_PEERS_FOR_WITHDRAWAL: Dp2pPeerAdvert[] = [
  {
    id: 'ke-p2p-wth-1',
    advertiserName: 'MpesaSwift_KE',
    rate: 129.1,
    minAmount: 10,
    maxAmount: 2000,
    completionRate: 99.7,
    ordersCount: 1680,
    releaseTimeMins: 6,
    paymentMethods: ['M-Pesa Direct Send'],
    description: 'Pays KES directly to verified Safaricom M-Pesa receiver within minutes of escrow lock.',
    isLiveAdvert: false,
  },
  {
    id: 'ke-p2p-wth-2',
    advertiserName: 'NairobiFX_P2P',
    rate: 128.9,
    minAmount: 10,
    maxAmount: 3000,
    completionRate: 99.4,
    ordersCount: 1420,
    releaseTimeMins: 9,
    paymentMethods: ['M-Pesa Kenya', 'Pochi la Biashara'],
    description: 'Instant KES M-Pesa cashout from Deriv Real CR accounts.',
    isLiveAdvert: false,
  },
  {
    id: 'ke-p2p-wth-3',
    advertiserName: 'RiftValley_P2P',
    rate: 128.5,
    minAmount: 15,
    maxAmount: 1200,
    completionRate: 98.8,
    ordersCount: 512,
    releaseTimeMins: 11,
    paymentMethods: ['M-Pesa Kenya'],
    description: 'Zero-fee local Safaricom payout after DP2P verification.',
    isLiveAdvert: false,
  },
];

export const Dp2pMpesaPanel: React.FC = () => {
  const {
    account,
    realAccount,
    mpesaGatewayStatus,
    safaricomPhone,
    verifiedP2pReceivers,
    activeP2pReceiverPhone,
    setActiveP2pReceiverPhone,
    verifyP2pReceiver,
    cashierTransactions,
    createDp2pMpesaOrder,
    confirmMpesaTransaction,
    cancelPendingWithdrawal,
    p2pAutoRefreshEnabled,
    setP2pAutoRefreshEnabled,
    p2pLastRefreshedAt,
    isRefreshingP2p,
    refreshP2pTransactions,
  } = useTrading();

  const [settlementRail, setSettlementRail] = useState<'DP2P_PHONE' | 'DARAJA_B2B'>('DP2P_PHONE');
  const [direction, setDirection] = useState<'DEPOSIT' | 'WITHDRAWAL'>('WITHDRAWAL');
  const [usdAmount, setUsdAmount] = useState<number>(50);
  const [phone, setPhone] = useState<string>(activeP2pReceiverPhone || safaricomPhone);
  const [targetAccount, setTargetAccount] = useState<'REAL' | 'CURRENT'>(account.isReal ? 'REAL' : 'REAL');

  // Daraja B2B Paybill / Till Settlement state
  const [b2bStandalone, setB2bStandalone] = useState<boolean>(true);
  const [b2bCommandId, setB2bCommandId] = useState<B2BCommandId>('BusinessPayBill');
  const [b2bPartyB, setB2bPartyB] = useState<string>('247247');
  const [b2bAccountRef, setB2bAccountRef] = useState<string>('B2B-TRANSFER');
  const [isVerifyingB2b, setIsVerifyingB2b] = useState<boolean>(false);
  const [b2bOAuthFeedback, setB2bOAuthFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [isSubmittingB2b, setIsSubmittingB2b] = useState<boolean>(false);

  // P2P Receiver verification state
  const [verifyPhoneDraft, setVerifyPhoneDraft] = useState<string>('0728424076');
  const [verifyNameDraft, setVerifyNameDraft] = useState<string>('');
  const [isVerifyingReceiver, setIsVerifyingReceiver] = useState<boolean>(false);
  const [verifyBanner, setVerifyBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [adverts, setAdverts] = useState<Dp2pPeerAdvert[]>(FALLBACK_BUY_PEERS_FOR_WITHDRAWAL);
  const [selectedAdvertId, setSelectedAdvertId] = useState<string>(FALLBACK_BUY_PEERS_FOR_WITHDRAWAL[0].id);
  const [isLiveFeed, setIsLiveFeed] = useState<boolean>(false);
  const [isLoadingAdverts, setIsLoadingAdverts] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [orderFeedback, setOrderFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
    cashierUrl?: string;
  } | null>(null);

  const [receiptInputs, setReceiptInputs] = useState<Record<string, string>>({});
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number>(30);
  const mountedAtRef = React.useRef<number>(Date.now());

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

  useEffect(() => {
    setPhone(direction === 'WITHDRAWAL' ? activeP2pReceiverPhone || safaricomPhone : safaricomPhone);
  }, [activeP2pReceiverPhone, direction, safaricomPhone]);

  useEffect(() => {
    if (!b2bStandalone && realAccount.loginId) {
      setB2bAccountRef(realAccount.loginId);
    } else if (b2bStandalone && b2bAccountRef === realAccount.loginId) {
      setB2bAccountRef('B2B-TRANSFER');
    }
  }, [b2bStandalone, realAccount.loginId]);

  const loadAdverts = useCallback(async () => {
    setIsLoadingAdverts(true);
    const counterpartyType = direction === 'DEPOSIT' ? 'sell' : 'buy';
    const fallback =
      direction === 'DEPOSIT' ? FALLBACK_SELL_PEERS_FOR_DEPOSIT : FALLBACK_BUY_PEERS_FOR_WITHDRAWAL;

    try {
      const res = await derivWsService.fetchDp2pAdverts({
        counterpartyType,
        amount: usdAmount >= 10 ? usdAmount : undefined,
      });

      if (res.liveFromDeriv && res.adverts.length > 0) {
        setAdverts(res.adverts);
        setSelectedAdvertId(res.adverts[0].id);
        setIsLiveFeed(true);
      } else {
        setAdverts(fallback);
        setSelectedAdvertId(fallback[0].id);
        setIsLiveFeed(false);
      }
    } catch {
      setAdverts(fallback);
      setSelectedAdvertId(fallback[0].id);
      setIsLiveFeed(false);
    } finally {
      setIsLoadingAdverts(false);
    }
  }, [direction, usdAmount]);

  useEffect(() => {
    loadAdverts();
  }, [direction]); // reload cleanly when switching Buy/Sell mode

  const selectedAdvert = useMemo(
    () => adverts.find((a) => a.id === selectedAdvertId) || adverts[0],
    [adverts, selectedAdvertId]
  );

  const parsedPhone = normalizeKenyanPhone(phone);
  const kesAmount = Math.round(Math.max(0, usdAmount) * (selectedAdvert?.rate || 129.5));

  const dp2pOrders = useMemo(
    () => cashierTransactions.filter((t) => t.method === 'DERIV_P2P').slice(0, 6),
    [cashierTransactions]
  );

  const matchedVerifiedReceiver = useMemo(
    () =>
      parsedPhone.valid
        ? verifiedP2pReceivers.find((r) => r.phone === parsedPhone.local)
        : undefined,
    [parsedPhone.local, parsedPhone.valid, verifiedP2pReceivers]
  );

  const handleVerifyReceiverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyBanner(null);
    setIsVerifyingReceiver(true);
    const res = await verifyP2pReceiver({
      phone: verifyPhoneDraft,
      receiverName: verifyNameDraft,
    });
    setIsVerifyingReceiver(false);
    if (!res.success || !res.receiver) {
      setVerifyBanner({ type: 'error', text: res.message });
      return;
    }
    setPhone(res.receiver.phone);
    setVerifyNameDraft('');
    setVerifyBanner({ type: 'success', text: res.message });
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderFeedback(null);

    if (!selectedAdvert) {
      setOrderFeedback({ type: 'error', text: 'Select a Deriv DP2P merchant to continue.' });
      return;
    }

    if (usdAmount < selectedAdvert.minAmount || usdAmount > selectedAdvert.maxAmount) {
      setOrderFeedback({
        type: 'error',
        text: `Amount must be between $${selectedAdvert.minAmount} and $${selectedAdvert.maxAmount} for ${selectedAdvert.advertiserName}.`,
      });
      return;
    }

    if (!parsedPhone.valid) {
      setOrderFeedback({
        type: 'error',
        text: 'Please enter a valid Safaricom M-Pesa number (e.g. 0728424076 or 0793950512).',
      });
      return;
    }

    setIsSubmitting(true);
    if (direction === 'WITHDRAWAL' && !matchedVerifiedReceiver) {
      await verifyP2pReceiver({ phone: parsedPhone.local });
    }

    const res = await createDp2pMpesaOrder({
      direction,
      usdAmount,
      kesAmount,
      rate: selectedAdvert.rate,
      phone: parsedPhone.local,
      agentName: selectedAdvert.advertiserName,
      agentId: selectedAdvert.id,
      isLiveAdvert: selectedAdvert.isLiveAdvert,
      targetAccount,
    });
    setIsSubmitting(false);

    if (!res.success) {
      setOrderFeedback({ type: 'error', text: res.message, cashierUrl: res.cashierUrl });
      return;
    }

    setOrderFeedback({
      type: res.liveOrderCreated ? 'success' : 'info',
      text: res.message,
      cashierUrl: res.cashierUrl || 'https://app.deriv.com/cashier/p2p',
    });
  };

  const handleConfirmOrderReceipt = (txId: string) => {
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

  const handleVerifyB2bOAuth = async () => {
    setIsVerifyingB2b(true);
    setB2bOAuthFeedback(null);
    try {
      const res = await fetch('/api/mpesa/b2b-verify-oauth', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setB2bOAuthFeedback({
        ok: Boolean(data.ok),
        text: data.message || data.error || 'Checked Safaricom Daraja B2B OAuth status.',
      });
    } catch {
      setB2bOAuthFeedback({
        ok: false,
        text: 'Unable to reach /api/mpesa/b2b-verify-oauth.',
      });
    } finally {
      setIsVerifyingB2b(false);
    }
  };

  const handleSubmitB2bTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderFeedback(null);

    const cleanPartyB = b2bPartyB.replace(/\D/g, '');
    if (!cleanPartyB || cleanPartyB.length < 5) {
      setOrderFeedback({
        type: 'error',
        text: 'Enter a valid Paybill, BuyGoods Till, or Business Shortcode (5-12 digits, e.g. 247247).',
      });
      return;
    }

    if (kesAmount < 10) {
      setOrderFeedback({
        type: 'error',
        text: 'Minimum Daraja B2B settlement amount is KES 10.',
      });
      return;
    }

    setIsSubmittingB2b(true);
    try {
      const res = await fetch('/api/mpesa/b2b-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyB: cleanPartyB,
          commandId: b2bCommandId,
          accountReference: b2bAccountRef || (b2bStandalone ? 'B2B-TRANSFER' : realAccount.loginId),
          usdAmount,
          kesAmount,
          requesterPhone: parsedPhone.valid ? parsedPhone.msisdn : undefined,
          merchantName: b2bStandalone ? undefined : selectedAdvert?.advertiserName,
          loginId: b2bStandalone ? undefined : realAccount.loginId,
          standalone: b2bStandalone,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setOrderFeedback({
          type: 'error',
          text: data.error || 'Safaricom Daraja B2B transfer was rejected or gateway secrets are incomplete.',
        });
      } else {
        setOrderFeedback({
          type: 'success',
          text: `${data.message} ConversationID: ${data.conversationId} (tracked in Diagnostics & Webhooks).`,
        });
        await refreshP2pTransactions(true);
      }
    } catch {
      setOrderFeedback({
        type: 'error',
        text: 'Network error calling /api/mpesa/b2b-transfer.',
      });
    } finally {
      setIsSubmittingB2b(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#0b1930] text-white flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-[#2bbbad]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm">Deriv DP2P &amp; Daraja B2B · Safaricom Kenya</h3>
              <span
                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                  isLiveFeed
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {isLiveFeed ? 'Live Deriv DP2P Feed' : 'Kenya M-Pesa DP2P & B2B Desk'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              P2P M-Pesa Escrow ({activeP2pReceiverPhone}) &amp; Daraja B2B Paybill/Till settlement from{' '}
              <strong className="text-emerald-700 font-mono">{realAccount.loginId}</strong>
            </p>
          </div>
        </div>

        <a
          href="https://app.deriv.com/cashier/p2p"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white font-mono text-[11px] font-bold transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5 text-[#2bbbad]" />
          <span>Deriv DP2P Portal</span>
        </a>
      </div>

      {/* Settlement Rail Switch: DP2P Phone Escrow vs Daraja B2B Business Paybill/Till */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-white border border-slate-200 rounded-xl shadow-xs font-mono text-xs">
        <button
          type="button"
          onClick={() => {
            setSettlementRail('DP2P_PHONE');
            setOrderFeedback(null);
          }}
          className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer font-bold ${
            settlementRail === 'DP2P_PHONE'
              ? 'bg-[#0b1930] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 text-[#2bbbad]" />
          <span>P2P M-Pesa Phone Escrow</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSettlementRail('DARAJA_B2B');
            setOrderFeedback(null);
          }}
          className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer font-bold ${
            settlementRail === 'DARAJA_B2B'
              ? 'bg-[#0b1930] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Building2 className="w-3.5 h-3.5 text-[#2bbbad]" />
          <span>Daraja B2B (Paybill / Till)</span>
        </button>
      </div>

      {/* Mode Switch: Buy USD (Deposit) vs Sell USD (Withdrawal) */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-white border border-slate-200 rounded-xl shadow-xs font-mono text-xs">
        <button
          type="button"
          onClick={() => {
            setDirection('DEPOSIT');
            setOrderFeedback(null);
          }}
          className={`py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer font-bold ${
            direction === 'DEPOSIT'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          <span>Buy USD (M-Pesa Deposit)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setDirection('WITHDRAWAL');
            setOrderFeedback(null);
          }}
          className={`py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer font-bold ${
            direction === 'WITHDRAWAL'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>Sell USD (M-Pesa Withdrawal)</span>
        </button>
      </div>

      {/* Verified P2P Withdrawal Receiver Registry */}
      <div className="bg-white border border-emerald-200 rounded-xl p-3.5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-900 text-xs block">
                P2P Verified Withdrawal Receivers ({realAccount.loginId})
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                Safaricom M-Pesa MSISDN &amp; network verification for withdrawal funds
              </span>
            </div>
          </div>

          <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[10px] font-bold">
            Active Receiver: {activeP2pReceiverPhone}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {verifiedP2pReceivers.map((rec) => {
            const isSelected = normalizeKenyanPhone(phone).local === rec.phone;
            return (
              <button
                key={rec.phone}
                type="button"
                onClick={() => {
                  setActiveP2pReceiverPhone(rec.phone);
                  setPhone(rec.phone);
                  setVerifyPhoneDraft(rec.phone);
                }}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500/30'
                    : 'bg-slate-50/70 border-slate-200 hover:border-emerald-300'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-xs text-slate-900">{rec.phone}</span>
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono text-[9px] font-bold">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      <span>VERIFIED</span>
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-600 font-mono block mt-0.5">
                    {rec.formatted} · {rec.carrier}
                  </span>
                  {rec.label && (
                    <span className="text-[10px] text-emerald-800 block truncate max-w-[230px]">
                      {rec.label}
                    </span>
                  )}
                </div>

                <span className="text-[10px] font-mono font-bold text-emerald-700 shrink-0">
                  {isSelected ? 'Selected' : 'Select'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Verify New or Existing P2P Receiver Form */}
        <form onSubmit={handleVerifyReceiverSubmit} className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <input
            type="text"
            value={verifyPhoneDraft}
            onChange={(e) => setVerifyPhoneDraft(e.target.value)}
            placeholder="0728424076"
            className="w-36 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-emerald-600"
          />
          <input
            type="text"
            value={verifyNameDraft}
            onChange={(e) => setVerifyNameDraft(e.target.value)}
            placeholder="Receiver Name / Label (optional)"
            className="flex-1 min-w-[160px] px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
          />
          <button
            type="submit"
            disabled={isVerifyingReceiver}
            className="px-3 py-1.5 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white font-mono text-[11px] font-bold cursor-pointer disabled:opacity-50"
          >
            {isVerifyingReceiver ? 'Verifying...' : 'Verify Receiver'}
          </button>
        </form>

        {verifyBanner && (
          <div
            className={`px-3 py-2 rounded-lg border font-mono text-[10px] flex items-start gap-2 ${
              verifyBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {verifyBanner.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <span>{verifyBanner.text}</span>
          </div>
        )}
      </div>

      {/* Peer Advert Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-bold text-slate-900 text-xs block">
              {direction === 'DEPOSIT'
                ? 'Select Kenya M-Pesa Seller (Deposit USD to Deriv)'
                : 'Select Kenya M-Pesa Buyer (Withdraw USD to M-Pesa KES)'}
            </span>
            <span className="text-[10px] text-slate-500">
              {isLiveFeed
                ? 'Live advertisers fetched from Deriv WebSocket p2p_advert_list'
                : 'Verified Kenya DP2P peer desk rates · Complete escrow confirmation with M-Pesa SMS receipt'}
            </span>
          </div>
          <button
            type="button"
            onClick={loadAdverts}
            disabled={isLoadingAdverts}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 font-mono text-[10px] font-semibold cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingAdverts ? 'animate-spin' : ''}`} />
            <span>Refresh Peers</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {adverts.map((ad) => {
            const isSelected = selectedAdvert?.id === ad.id;
            return (
              <button
                key={ad.id}
                type="button"
                onClick={() => setSelectedAdvertId(ad.id)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                  isSelected
                    ? direction === 'DEPOSIT'
                      ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500/30'
                      : 'bg-rose-50 border-rose-500 ring-1 ring-rose-500/30'
                    : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-900 text-xs block">{ad.advertiserName}</span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {ad.completionRate}% · {ad.ordersCount} orders · ~{ad.releaseTimeMins}m
                    </span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono font-bold text-[11px] text-slate-900 tabular-nums">
                    {ad.rate.toFixed(2)} KES
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-600 pt-1 border-t border-slate-200/70">
                  <span>
                    Limit: ${ad.minAmount}–${ad.maxAmount}
                  </span>
                  <span className="text-emerald-700 font-semibold">M-Pesa KE</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback Banner */}
      {orderFeedback && (
        <div
          className={`p-3.5 rounded-xl border font-mono text-[11px] space-y-2.5 ${
            orderFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : orderFeedback.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {orderFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : orderFeedback.type === 'error' ? (
              <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{orderFeedback.text}</span>
          </div>

          {orderFeedback.cashierUrl && (
            <div className="pl-6">
              <a
                href={orderFeedback.cashierUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white text-[11px] font-bold"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#2bbbad]" />
                <span>Open Official Deriv DP2P to Complete Escrow</span>
              </a>
            </div>
          )}
        </div>
      )}

      {settlementRail === 'DARAJA_B2B' ? (
        <form onSubmit={handleSubmitB2bTransfer} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div>
              <span className="font-bold text-slate-900 text-xs block">
                Safaricom Daraja B2B Business Settlement (/mpesa/b2b/v1/paymentrequest)
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                Settle P2P Paybill, BuyGoods Till, or Payment Agent shortcodes directly ({mpesaGatewayStatus.environment.toUpperCase()})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() => setB2bStandalone(true)}
                  className={`px-2 py-1 rounded-md cursor-pointer font-bold ${
                    b2bStandalone ? 'bg-[#0b1930] text-white' : 'text-slate-600'
                  }`}
                >
                  No Deriv (Direct B2B)
                </button>
                <button
                  type="button"
                  onClick={() => setB2bStandalone(false)}
                  className={`px-2 py-1 rounded-md cursor-pointer font-bold ${
                    !b2bStandalone ? 'bg-[#2bbbad] text-white' : 'text-slate-600'
                  }`}
                >
                  Deriv P2P Linked
                </button>
              </div>
              <button
                type="button"
                onClick={handleVerifyB2bOAuth}
                disabled={isVerifyingB2b}
                className="px-2.5 py-1.5 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white font-mono text-[10px] font-bold cursor-pointer disabled:opacity-50"
              >
                {isVerifyingB2b ? 'Verifying B2B...' : 'Test B2B OAuth (/mpesa/B2B)'}
              </button>
            </div>
          </div>

          {b2bOAuthFeedback && (
            <div
              className={`px-3 py-2 rounded-lg border font-mono text-[10px] flex items-start gap-2 ${
                b2bOAuthFeedback.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {b2bOAuthFeedback.ok ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span>{b2bOAuthFeedback.text}</span>
            </div>
          )}

          {/* Command ID + Presets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-800 text-xs block mb-1">Daraja B2B CommandID</label>
              <select
                value={b2bCommandId}
                onChange={(e) => setB2bCommandId(e.target.value as B2BCommandId)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-[#2bbbad]"
              >
                <option value="BusinessPayBill">BusinessPayBill (Paybill · Type 4)</option>
                <option value="BusinessBuyGoods">BusinessBuyGoods (Till · Type 2)</option>
                <option value="BusinessToBusinessTransfer">BusinessToBusinessTransfer (MMF/Utility)</option>
                <option value="MerchantToMerchantTransfer">MerchantToMerchantTransfer</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-800 text-xs">Destination Paybill / Till (PartyB)</label>
                <div className="flex gap-1 font-mono text-[9px]">
                  <button
                    type="button"
                    onClick={() => {
                      setB2bCommandId('BusinessPayBill');
                      setB2bPartyB('247247');
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                  >
                    Paybill 247247
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setB2bCommandId('BusinessBuyGoods');
                      setB2bPartyB('600000');
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                  >
                    Till 600000
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={b2bPartyB}
                onChange={(e) => setB2bPartyB(e.target.value)}
                placeholder="e.g. 247247"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-bold focus:outline-none focus:border-[#2bbbad]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-800 text-xs block mb-1">Account Reference</label>
              <input
                type="text"
                value={b2bAccountRef}
                onChange={(e) => setB2bAccountRef(e.target.value)}
                placeholder="CR-NDERISKOOL-LIVE"
                maxLength={20}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-[#2bbbad]"
              />
            </div>

            <div>
              <label className="font-bold text-slate-800 text-xs block mb-1">Requester MSISDN (Optional)</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0728424076"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-[#2bbbad]"
              />
            </div>
          </div>

          {/* USD & KES Amount */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label className="font-bold text-slate-800">B2B Settlement Amount (USD → KES)</label>
              <span className="font-mono font-bold text-emerald-700 tabular-nums">
                = KES {kesAmount.toLocaleString()} @ {(selectedAdvert?.rate || 129.5).toFixed(2)} KES/USD
              </span>
            </div>
            <div className="relative mb-2">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-mono text-sm">$</span>
              <input
                type="number"
                min={1}
                step={5}
                value={usdAmount}
                onChange={(e) => setUsdAmount(Number(e.target.value))}
                className="w-full pl-8 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-base text-slate-900 font-bold focus:outline-none focus:border-[#2bbbad] tabular-nums"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmittingB2b || kesAmount < 10}
            className="w-full py-3.5 rounded-xl font-mono text-sm font-bold text-white bg-[#0b1930] hover:bg-slate-800 shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Building2 className="w-4 h-4 text-[#2bbbad]" />
            <span>
              {isSubmittingB2b
                ? 'SUBMITTING DARAJA B2B TRANSFER...'
                : `SEND DARAJA B2B · KES ${kesAmount.toLocaleString()} -> ${b2bPartyB || 'Paybill'}`}
            </span>
          </button>

          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-[#2bbbad] shrink-0" />
            <span>
              Daraja B2B callbacks stream to {mpesaGatewayStatus.callbackUrls?.b2bResultUrl || '/api/mpesa/b2b-result'} and appear live in Diagnostics.
            </span>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSubmitOrder} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
              {direction === 'DEPOSIT' ? 'Target Deriv Account' : 'Withdrawable Deriv Real Balance'}
            </span>
            <span className="font-mono font-bold text-slate-900 text-xs">
              {direction === 'WITHDRAWAL'
                ? `${realAccount.loginId} · $${realAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`
                : targetAccount === 'REAL' || account.isReal
                ? `Deriv Real (${realAccount.loginId})`
                : `Demo Virtual (${account.loginId})`}
            </span>
          </div>

          {direction === 'DEPOSIT' && !account.isReal && (
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
          )}
        </div>

        {/* USD Amount & KES Calculation */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <label className="font-bold text-slate-800">
              {direction === 'DEPOSIT' ? 'USD Amount to Buy (Deposit)' : 'USD Amount to Sell (Withdraw)'}
            </label>
            <span className="font-mono font-bold text-emerald-700 tabular-nums">
              = KES {kesAmount.toLocaleString()} @ {selectedAdvert?.rate.toFixed(2)} KES/USD
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
              className="w-full pl-8 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-base text-slate-900 font-bold focus:outline-none focus:border-[#2bbbad] tabular-nums"
            />
          </div>

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

        {/* Safaricom M-Pesa Phone Number */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                {direction === 'DEPOSIT'
                  ? 'Safaricom M-Pesa Number Sending KES'
                  : 'Safaricom M-Pesa Number Receiving KES'}
              </span>
            </label>
            <span className="text-[10px] font-mono text-emerald-700 font-semibold">
              {parsedPhone.valid ? `MSISDN: ${parsedPhone.msisdn}` : 'Enter valid KE number'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0728424076"
              className="flex-1 min-w-[160px] px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-sm text-slate-900 font-semibold focus:outline-none focus:border-emerald-600"
            />
            {verifiedP2pReceivers.slice(0, 2).map((rec) => (
              <button
                key={rec.phone}
                type="button"
                onClick={() => {
                  setPhone(rec.phone);
                  setActiveP2pReceiverPhone(rec.phone);
                }}
                className={`px-2.5 py-2 rounded-xl border font-mono text-[11px] font-bold cursor-pointer whitespace-nowrap transition-colors ${
                  parsedPhone.local === rec.phone
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800'
                }`}
              >
                Use {rec.phone}
              </button>
            ))}
          </div>
          {parsedPhone.valid && (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-3 h-3" />
                <span>
                  {matchedVerifiedReceiver
                    ? `Verified P2P Receiver (${detectKenyanCarrier(parsedPhone.local)}) · ${parsedPhone.formatted}`
                    : `Valid ${detectKenyanCarrier(parsedPhone.local)} · Click Verify Receiver above to save`}
                </span>
              </span>
              <span className="text-slate-500">Source: {realAccount.loginId}</span>
            </div>
          )}
        </div>

        {/* Submit CTA */}
        <button
          type="submit"
          disabled={isSubmitting || usdAmount < 10}
          className={`w-full py-3.5 rounded-xl font-mono text-sm font-bold text-white shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 ${
            direction === 'DEPOSIT'
              ? 'bg-emerald-600 hover:bg-emerald-500'
              : 'bg-rose-600 hover:bg-rose-500'
          }`}
        >
          {direction === 'DEPOSIT' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
          <span>
            {isSubmitting
              ? 'CREATING DERIV DP2P M-PESA ORDER...'
              : direction === 'DEPOSIT'
              ? `START DP2P M-PESA DEPOSIT · $${usdAmount.toFixed(2)} (KES ${kesAmount.toLocaleString()})`
              : `START DP2P M-PESA WITHDRAWAL · $${usdAmount.toFixed(2)} -> ${parsedPhone.local || phone}`}
          </span>
        </button>

        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-[#2bbbad] shrink-0" />
          <span>
            DP2P orders remain PENDING until M-Pesa SMS receipt confirmation or Deriv DP2P escrow release.
          </span>
        </div>
      </form>
      )}

      {/* Active & Recent DP2P M-Pesa Orders (Auto-refreshes every 30s) */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 text-xs">Recent DP2P M-Pesa Escrow Orders</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
              {dp2pOrders.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {p2pLastRefreshedAt && (
              <span className="text-[10px] font-mono text-slate-500">
                Synced {new Date(p2pLastRefreshedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <button
              type="button"
              onClick={() => setP2pAutoRefreshEnabled(!p2pAutoRefreshEnabled)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[10px] font-bold transition-colors cursor-pointer ${
                p2pAutoRefreshEnabled
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
              }`}
              title="Toggle 30-second automatic polling for Confirmed P2P updates"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  p2pAutoRefreshEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span>
                {p2pAutoRefreshEnabled
                  ? `Auto 30s (${isRefreshingP2p ? 'syncing...' : `${secondsUntilRefresh}s`})`
                  : 'Auto 30s: Paused'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => refreshP2pTransactions(false)}
              disabled={isRefreshingP2p}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-mono text-[10px] font-semibold cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshingP2p ? 'animate-spin' : ''}`} />
              <span>{isRefreshingP2p ? 'Polling...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {receiptError && (
          <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-mono text-[11px]">
            {receiptError}
          </div>
        )}

        {dp2pOrders.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-center font-mono text-[11px] text-slate-500">
            No DP2P M-Pesa orders yet. Submit an order or Daraja B2B settlement above — this list polls every 30s for Confirmed updates.
          </div>
        ) : (
          <div className="space-y-2">
            {dp2pOrders.map((order) => {
              const isDep = order.type === 'DEPOSIT';
              return (
                <div
                  key={order.id}
                  className={`p-3 rounded-xl border font-mono text-[11px] space-y-2 ${
                    order.status === 'PENDING'
                      ? 'bg-amber-50/70 border-amber-300'
                      : order.status === 'COMPLETED'
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isDep ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                          }`}
                        >
                          {isDep ? 'DP2P BUY' : 'DP2P SELL'}
                        </span>
                        <span className="font-bold text-slate-900">${order.amount.toFixed(2)} USD</span>
                        <span className="text-slate-500">Ref: {order.mpesaReceipt || order.reference}</span>
                      </div>
                      {order.safaricomConfirmationText && (
                        <span className="text-[10px] text-emerald-700 font-semibold block mt-1">
                          {order.safaricomConfirmationText}
                        </span>
                      )}
                      {order.note && order.note !== order.safaricomConfirmationText && (
                        <span className="text-[10px] text-slate-600 block mt-0.5">{order.note}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {order.status === 'PENDING' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                          <Clock className="w-3 h-3" />
                          <span>Pending</span>
                        </span>
                      )}
                      {order.status === 'COMPLETED' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[10px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Confirmed</span>
                        </span>
                      )}
                      {order.status === 'REJECTED' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">
                          <XCircle className="w-3 h-3" />
                          <span>Failed/Cancelled</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {order.status === 'PENDING' && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-amber-200/80">
                      <input
                        type="text"
                        value={receiptInputs[order.id] || ''}
                        onChange={(e) => {
                          setReceiptError(null);
                          setReceiptInputs((prev) => ({ ...prev, [order.id]: e.target.value }));
                        }}
                        placeholder="Required M-Pesa / DP2P Code (e.g. SLK82940PQ)"
                        className="flex-1 min-w-[180px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-[11px] focus:outline-none focus:border-emerald-600"
                      />
                      <button
                        type="button"
                        onClick={() => handleConfirmOrderReceipt(order.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                      >
                        Confirm Receipt
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReceiptError(null);
                          cancelPendingWithdrawal(order.id);
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
        )}
      </div>
    </div>
  );
};
