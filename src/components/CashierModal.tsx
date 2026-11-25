import React, { useState, useEffect } from 'react';
import { useTrading } from '../context/TradingContext';
import { useBiometric } from '../context/BiometricContext';
import { CashierMethod } from '../types/trading';
import { KES_PER_USD_RATE, normalizeKenyanPhone, usdToKes } from '../utils/mpesa';
import { MpesaTransactionHistory } from './MpesaTransactionHistory';
import { Dp2pMpesaPanel } from './Dp2pMpesaPanel';
import { DCashPanel } from './DCashPanel';
import { ValtexPanel } from './ValtexPanel';
import { PayHeroPanel } from './PayHeroPanel';
import { KcbTransferPanel } from './KcbTransferPanel';
import { CashierDiagnosticLogs } from './CashierDiagnosticLogs';
import { PendingCashierTracker } from './PendingCashierTracker';
import {
  X,
  Wallet,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  History,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Smartphone,
  CreditCard,
  Coins,
  Building,
  Landmark,
  RefreshCw,
  AlertCircle,
  QrCode,
  Lock,
  Zap,
  Link2,
  Edit3,
  Users,
  Terminal,
} from 'lucide-react';

export const CashierModal: React.FC = () => {
  const {
    isCashierOpen,
    setIsCashierOpen,
    cashierTab,
    setCashierTab,
    account,
    realAccount,
    updateRealAccountId,
    setIsConnectModalOpen,
    mpesaGatewayStatus,
    refreshMpesaGatewayStatus,
    verifyDarajaOAuth,
    safaricomPhone,
    safaricomMsisdn,
    safaricomFormatted,
    updateSafaricomPhone,
    depositFunds,
    withdrawFunds,
    syncMpesaBalance,
    cashierTransactions,
    clientDiagnosticLogs,
    switchAccountMode,
    syncDerivRealBalance,
    transferBetweenDerivAccounts,
  } = useTrading();
  const { requireStepUpAuth } = useBiometric();

  // Deposit state
  const [depositMethod, setDepositMethod] = useState<CashierMethod>('MPESA');
  const [depositTarget, setDepositTarget] = useState<'REAL' | 'CURRENT'>(account.isReal ? 'REAL' : 'CURRENT');
  const [depositAmount, setDepositAmount] = useState<number>(100);
  const [mpesaPhone, setMpesaPhone] = useState<string>(safaricomPhone);
  const [cryptoNetwork, setCryptoNetwork] = useState<'TRC20' | 'ERC20' | 'BTC'>('TRC20');
  const [cardNumber] = useState<string>('•••• •••• •••• 4242');
  const [isDepositLoading, setIsDepositLoading] = useState<boolean>(false);
  const [depositSuccessMsg, setDepositSuccessMsg] = useState<string | null>(null);
  const [depositErrorMsg, setDepositErrorMsg] = useState<string | null>(null);
  const [depositCashierUrl, setDepositCashierUrl] = useState<string | null>(null);
  const [isSyncingDerivBalance, setIsSyncingDerivBalance] = useState<boolean>(false);

  // Withdrawal state (external payouts)
  const [withdrawMethod, setWithdrawMethod] = useState<CashierMethod>('MPESA');
  const [withdrawAmount, setWithdrawAmount] = useState<number>(50);
  const [withdrawDestination, setWithdrawDestination] = useState<string>(safaricomPhone);
  const [securityPin, setSecurityPin] = useState<string>('1234');
  const [isWithdrawLoading, setIsWithdrawLoading] = useState<boolean>(false);
  const [withdrawSuccessMsg, setWithdrawSuccessMsg] = useState<string | null>(null);
  const [withdrawErrorMsg, setWithdrawErrorMsg] = useState<string | null>(null);
  const [withdrawCashierUrl, setWithdrawCashierUrl] = useState<string | null>(null);

  // Dedicated Deriv Transfer state (Terminal/Demo <-> Deriv Real CR & WS/API routing)
  const [transferTargetId, setTransferTargetId] = useState<string>(realAccount.loginId);
  const [realTransferToId, setRealTransferToId] = useState<string>(() => {
    const alt = realAccount.accountList?.find(
      (a) => a.loginid && a.loginid !== realAccount.loginId && !a.is_virtual
    );
    return alt?.loginid || '';
  });
  const [transferAmount, setTransferAmount] = useState<number>(50);
  const [transferPin, setTransferPin] = useState<string>('1234');
  const [isTransferLoading, setIsTransferLoading] = useState<boolean>(false);
  const [transferSuccessMsg, setTransferSuccessMsg] = useState<string | null>(null);
  const [transferErrorMsg, setTransferErrorMsg] = useState<string | null>(null);
  const [transferCashierUrl, setTransferCashierUrl] = useState<string | null>(null);
  const [latestSubmittedWithdrawalId, setLatestSubmittedWithdrawalId] = useState<string | null>(null);
  const [isEditingRealId, setIsEditingRealId] = useState<boolean>(false);
  const [realIdDraft, setRealIdDraft] = useState<string>(realAccount.loginId);
  const [isEditingSafaricom, setIsEditingSafaricom] = useState<boolean>(false);
  const [safaricomDraft, setSafaricomDraft] = useState<string>(safaricomPhone);
  const [, setCopiedRef] = useState<string | null>(null);
  const [b2cVerifyResult, setB2cVerifyResult] = useState<{ ok: boolean; msg: string; confirmed?: boolean } | null>(null);
  const [isCheckingB2c, setIsCheckingB2c] = useState<boolean>(false);
  const b2cWatchTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (b2cWatchTimerRef.current) {
        clearInterval(b2cWatchTimerRef.current);
      }
    };
  }, []);
  const [isSyncingMpesaBalance, setIsSyncingMpesaBalance] = useState<boolean>(false);
  const [isVerifyingStkOAuth, setIsVerifyingStkOAuth] = useState<boolean>(false);
  const [darajaActionFeedback, setDarajaActionFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [txStatusQueryInput, setTxStatusQueryInput] = useState<string>('');
  const [isRunningDarajaTool, setIsRunningDarajaTool] = useState<boolean>(false);
  const [mpesaSyncBanner, setMpesaSyncBanner] = useState<{
    ok: boolean;
    text: string;
    confirmedCount?: number;
    pendingCount?: number;
    rejectedCount?: number;
    creditedUsd?: number;
  } | null>(null);
  const [payheroInitialAction, setPayheroInitialAction] = useState<'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' | undefined>(
    undefined
  );
  const [kcbInitialAction, setKcbInitialAction] = useState<'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' | undefined>(
    undefined
  );

  useEffect(() => {
    setRealIdDraft(realAccount.loginId);
    setTransferTargetId(realAccount.loginId);
    const alt = realAccount.accountList?.find(
      (a) => a.loginid && a.loginid !== realAccount.loginId && !a.is_virtual
    );
    if (alt?.loginid) {
      setRealTransferToId((prev) =>
        !prev || prev === realAccount.loginId ? alt.loginid : prev
      );
    }
  }, [realAccount.loginId, realAccount.accountList]);

  useEffect(() => {
    setSafaricomDraft(safaricomPhone);
    setMpesaPhone(safaricomPhone);
    if (withdrawMethod === 'MPESA') {
      setWithdrawDestination(safaricomPhone);
    }
  }, [safaricomPhone, withdrawMethod]);

  // Immediately upgrade the withdrawal confirmation banner when SSE / fast poll resolves PENDING -> COMPLETED/REJECTED
  useEffect(() => {
    if (!latestSubmittedWithdrawalId) return;
    const matched = cashierTransactions.find((t) => t.id === latestSubmittedWithdrawalId);
    if (!matched) return;
    if (matched.status === 'COMPLETED') {
      const elapsedSec = Math.max(0.1, (Date.now() - matched.timestamp) / 1000).toFixed(1);
      const liveText =
        matched.safaricomConfirmationText ||
        matched.note ||
        `${matched.mpesaReceipt || matched.reference} Confirmed via Safaricom M-Pesa.`;
      setWithdrawErrorMsg(null);
      setWithdrawSuccessMsg(`Safaricom M-Pesa Confirmed (${elapsedSec}s): ${liveText}`);
      setLatestSubmittedWithdrawalId(null);
    } else if (matched.status === 'REJECTED') {
      setWithdrawSuccessMsg(null);
      setWithdrawErrorMsg(matched.note || 'Safaricom Daraja B2C payout was rejected.');
      setLatestSubmittedWithdrawalId(null);
    }
  }, [cashierTransactions, latestSubmittedWithdrawalId]);

  if (!isCashierOpen) return null;

  const withdrawableBalance = realAccount.balance;
  const hasLiveToken = Boolean(realAccount.token && realAccount.token !== 'CR-NDERISKOOL-LIVE');

  const getMethodName = (method: CashierMethod): string => {
    switch (method) {
      case 'DERIV_REAL_ACCOUNT':
        return 'Deriv Real Account (Direct)';
      case 'MPESA':
        return 'SafariCom M-Pesa Express';
      case 'D_CASH':
        return 'D Cash App (Deriv Payment Agent)';
      case 'VALTEX':
        return 'Valtex App Deposits & Withdrawals';
      case 'PAYHERO':
        return 'PayHero Kenya Gateway';
      case 'KCB_BANK':
        return 'KCB Bank App Direct Transfer';
      case 'AIRTEL_MONEY':
        return 'Airtel Money Mobile Wallet';
      case 'CRYPTO_USDT':
        return `USDT (${cryptoNetwork}) Stablecoin`;
      case 'CRYPTO_BTC':
        return 'Bitcoin (BTC) Network';
      case 'CARD_VISA_MC':
        return 'Visa / Mastercard Debit/Credit';
      case 'BANK_TRANSFER':
        return 'Direct Wire / Local Bank Transfer';
      case 'E_WALLET':
        return 'Skrill / Neteller / Perfect Money';
      case 'DERIV_P2P':
        return 'Deriv P2P Local Currency Exchange';
      case 'DEMO_VIRTUAL':
        return 'Deriv Virtual Instant Refill';
      default:
        return 'Deriv Cashier Payment';
    }
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDepositLoading(true);
    setDepositSuccessMsg(null);
    setDepositErrorMsg(null);
    setDepositCashierUrl(null);

    if (depositAmount < 10) {
      setDepositErrorMsg('Minimum deposit amount is $10.00 USD.');
      setIsDepositLoading(false);
      return;
    }

    if (depositMethod === 'MPESA') {
      const parsed = normalizeKenyanPhone(mpesaPhone);
      if (!parsed.valid) {
        setDepositErrorMsg('Please enter a valid Safaricom M-Pesa number (e.g. 0793950512 or +254793950512).');
        setIsDepositLoading(false);
        return;
      }
      updateSafaricomPhone(parsed.local);
    }

    const methodName = getMethodName(depositMethod);
    const sourceDetails =
      depositMethod === 'MPESA'
        ? normalizeKenyanPhone(mpesaPhone).local
        : depositMethod === 'CRYPTO_USDT'
        ? `USDT ${cryptoNetwork} Deposit`
        : depositMethod === 'CARD_VISA_MC'
        ? `Card ${cardNumber}`
        : 'Instant Deriv Gateway';

    await new Promise((res) => setTimeout(res, 750));

    const result = await depositFunds({
      amount: depositAmount,
      method: depositMethod,
      methodName,
      sourceDetails,
      targetAccount: depositTarget,
    });

    setIsDepositLoading(false);
    if (result.cashierUrl) {
      setDepositCashierUrl(result.cashierUrl);
    }
    if (result.success) {
      setDepositSuccessMsg(result.message);
    } else {
      setDepositErrorMsg(result.message);
    }
  };

  const handleSyncDerivBalance = async () => {
    setIsSyncingDerivBalance(true);
    const res = await syncDerivRealBalance();
    setIsSyncingDerivBalance(false);
    if (res.ok) {
      setDepositSuccessMsg(res.message);
      setTransferSuccessMsg(res.message);
    } else {
      setTransferErrorMsg(res.message);
    }
  };

  const handleDerivTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTransferLoading(true);
    setTransferSuccessMsg(null);
    setTransferErrorMsg(null);
    setTransferCashierUrl(null);

    if (transferAmount <= 0 || transferAmount < 10) {
      setTransferErrorMsg('Minimum Deriv transfer amount is $10.00 USD.');
      setIsTransferLoading(false);
      return;
    }

    if (account.isReal) {
      const targetAcc = realTransferToId.trim().toUpperCase();
      if (!targetAcc || targetAcc === realAccount.loginId.toUpperCase()) {
        setTransferErrorMsg('Enter a valid destination Deriv CR / MT5 / sub-account login ID.');
        setIsTransferLoading(false);
        return;
      }
      if (transferAmount > realAccount.balance) {
        setTransferErrorMsg(
          `Cannot transfer more than available Deriv Real (${realAccount.loginId}) balance ($${realAccount.balance.toFixed(2)}).`
        );
        setIsTransferLoading(false);
        return;
      }

      const approved = await requireStepUpAuth(
        'Authorize Deriv Account Transfer',
        `$${transferAmount.toFixed(2)} USD: ${realAccount.loginId} -> ${targetAcc}`
      );
      if (!approved) {
        setTransferErrorMsg('Biometric confirmation cancelled. Deriv account transfer was not executed.');
        setIsTransferLoading(false);
        return;
      }

      const res = await transferBetweenDerivAccounts({
        accountFrom: realAccount.loginId,
        accountTo: targetAcc,
        amount: transferAmount,
        currency: realAccount.currency || 'USD',
      });
      setIsTransferLoading(false);
      setTransferCashierUrl('https://app.deriv.com/cashier/account-transfer');
      if (res.success) {
        setTransferSuccessMsg(res.message);
      } else {
        setTransferErrorMsg(res.message);
      }
      return;
    }

    if (transferAmount > account.balance) {
      setTransferErrorMsg(`Cannot transfer more than available terminal balance ($${account.balance.toFixed(2)}).`);
      setIsTransferLoading(false);
      return;
    }

    if (transferPin.trim().length < 4) {
      setTransferErrorMsg('Enter your 4-digit Security Verification PIN.');
      setIsTransferLoading(false);
      return;
    }

    const result = await withdrawFunds({
      amount: transferAmount,
      method: 'DERIV_REAL_ACCOUNT',
      methodName: getMethodName('DERIV_REAL_ACCOUNT'),
      destinationDetails: transferTargetId.trim() || realAccount.loginId,
      withdrawalDirection: 'TO_REAL',
    });

    setIsTransferLoading(false);
    if (result.cashierUrl) {
      setTransferCashierUrl(result.cashierUrl);
    }
    if (result.success) {
      setTransferSuccessMsg(result.message);
    } else {
      setTransferErrorMsg(result.message);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsWithdrawLoading(true);
    setWithdrawSuccessMsg(null);
    setWithdrawErrorMsg(null);
    setWithdrawCashierUrl(null);

    if (withdrawAmount <= 0) {
      setWithdrawErrorMsg('Please enter a valid amount.');
      setIsWithdrawLoading(false);
      return;
    }

    if (withdrawAmount > withdrawableBalance) {
      setWithdrawErrorMsg(
        `Cannot withdraw more than available Deriv Real (${realAccount.loginId}) balance ($${withdrawableBalance.toFixed(2)}).`
      );
      setIsWithdrawLoading(false);
      return;
    }

    if (withdrawAmount < 10) {
      setWithdrawErrorMsg('Minimum withdrawal amount is $10.00 USD.');
      setIsWithdrawLoading(false);
      return;
    }

    if (withdrawMethod === 'MPESA') {
      const parsed = normalizeKenyanPhone(withdrawDestination);
      if (!parsed.valid) {
        setWithdrawErrorMsg('Please enter a valid Safaricom M-Pesa recipient number (e.g. 0793950512).');
        setIsWithdrawLoading(false);
        return;
      }
      updateSafaricomPhone(parsed.local);
    }

    const approved = await requireStepUpAuth(
      'Authorize Withdrawal',
      `$${withdrawAmount.toFixed(2)} USD via ${getMethodName(withdrawMethod)}`
    );
    if (!approved) {
      setIsWithdrawLoading(false);
      setWithdrawErrorMsg('Biometric confirmation cancelled. Withdrawal was not processed.');
      return;
    }

    const result = await withdrawFunds({
      amount: withdrawAmount,
      method: withdrawMethod,
      methodName: getMethodName(withdrawMethod),
      destinationDetails:
        withdrawMethod === 'MPESA'
          ? normalizeKenyanPhone(withdrawDestination).local
          : withdrawDestination,
      withdrawalDirection: 'FROM_REAL',
    });

    setIsWithdrawLoading(false);
    if (result.cashierUrl) {
      setWithdrawCashierUrl(result.cashierUrl);
    }
    if (result.success) {
      setLatestSubmittedWithdrawalId(result.tx?.status === 'PENDING' ? result.tx.id : null);
      setWithdrawSuccessMsg(result.message);
    } else {
      setLatestSubmittedWithdrawalId(null);
      setWithdrawErrorMsg(result.message);
    }
  };

  const handleSaveRealId = () => {
    const trimmed = realIdDraft.trim();
    if (trimmed) {
      updateRealAccountId(trimmed);
      setTransferTargetId(trimmed);
    }
    setIsEditingRealId(false);
  };

  const handleSaveSafaricom = () => {
    const parsed = normalizeKenyanPhone(safaricomDraft);
    if (parsed.valid) {
      updateSafaricomPhone(parsed.local);
      setMpesaPhone(parsed.local);
      if (withdrawMethod === 'MPESA') {
        setWithdrawDestination(parsed.local);
      }
    }
    setIsEditingSafaricom(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedRef(text);
    setTimeout(() => setCopiedRef(null), 2000);
  };

  const handleSyncMpesaBalance = async () => {
    if (isSyncingMpesaBalance) return;
    setIsSyncingMpesaBalance(true);
    setMpesaSyncBanner(null);
    const result = await syncMpesaBalance();
    setIsSyncingMpesaBalance(false);
    if (result.ok) {
      setWithdrawErrorMsg(null);
    }
    setMpesaSyncBanner({
      ok: result.ok,
      text: result.message,
      confirmedCount: result.confirmedCount,
      pendingCount: result.pendingCount,
      rejectedCount: result.rejectedCount,
      creditedUsd: result.creditedUsd,
    });
  };

  const handleVerifyDarajaAuth = async () => {
    if (isVerifyingStkOAuth) return;
    setIsVerifyingStkOAuth(true);
    setDarajaActionFeedback(null);
    const res = await verifyDarajaOAuth();
    setIsVerifyingStkOAuth(false);
    setDarajaActionFeedback({ ok: res.ok, text: res.message });
  };

  const handleDarajaEndpointTool = async (action: 'C2B_REGISTER' | 'ACCOUNT_BALANCE' | 'TX_STATUS') => {
    if (isRunningDarajaTool) return;
    setIsRunningDarajaTool(true);
    setDarajaActionFeedback(null);
    try {
      const endpoint =
        action === 'C2B_REGISTER'
          ? '/api/mpesa/c2b-register'
          : action === 'ACCOUNT_BALANCE'
          ? '/api/mpesa/account-balance'
          : '/api/mpesa/transaction-status';
      const body =
        action === 'TX_STATUS'
          ? { transactionId: txStatusQueryInput.trim() }
          : action === 'C2B_REGISTER'
          ? { responseType: 'Completed' }
          : {};
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      await refreshMpesaGatewayStatus(false);
      setDarajaActionFeedback({
        ok: Boolean(res.ok && data.ok),
        text: String(data.message || data.error || 'Daraja request completed.'),
      });
    } catch {
      setDarajaActionFeedback({ ok: false, text: 'Network error contacting Safaricom Daraja backend route.' });
    } finally {
      setIsRunningDarajaTool(false);
    }
  };

  const pendingStkDepositCount = cashierTransactions.filter(
    (tx) => tx.method === 'MPESA' && tx.type === 'DEPOSIT' && tx.status === 'PENDING'
  ).length;

  const totalDeposited = cashierTransactions
    .filter((tx) => !tx.standaloneTransfer && tx.fundingSource !== 'STANDALONE_GATEWAY' && tx.type === 'DEPOSIT')
    .reduce((acc, tx) => acc + tx.amount, 0);

  const totalWithdrawn = cashierTransactions
    .filter((tx) => !tx.standaloneTransfer && tx.fundingSource !== 'STANDALONE_GATEWAY' && tx.type === 'WITHDRAWAL')
    .reduce((acc, tx) => acc + tx.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="relative w-full max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cashier Top Banner */}
        <div className="p-4 md:p-5 bg-[#0b1930] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2bbbad]/20 border border-[#2bbbad]/40 flex items-center justify-center text-[#2bbbad]">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  nderiskool <span className="text-[#2bbbad] font-mono text-sm">Cashier &amp; Money Transfers</span>
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    account.isReal
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                      : 'bg-white/10 text-teal-200 border border-white/20'
                  }`}
                >
                  {account.isReal ? 'Real Account' : 'Demo Virtual'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Independent Money Transfers (KCB App, PayHero, Valtex, D Cash, B2B — No Deriv needed) &amp; Deriv M-Pesa Cashier ({safaricomPhone})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={handleSyncMpesaBalance}
              disabled={isSyncingMpesaBalance}
              title="Check Safaricom Daraja API for recent M-Pesa STK Push confirmations"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#2bbbad]/15 hover:bg-[#2bbbad]/25 border border-[#2bbbad]/45 text-[#2bbbad] text-[11px] font-mono font-bold transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingMpesaBalance ? 'animate-spin' : ''}`} />
              <span>{isSyncingMpesaBalance ? 'Syncing...' : 'Sync M-Pesa Balance'}</span>
              {pendingStkDepositCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-[#0b1930] text-[9px] font-extrabold tabular-nums">
                  {pendingStkDepositCount}
                </span>
              )}
            </button>

            <div className="text-right font-mono tabular-nums hidden sm:block">
              <span className="text-[10px] text-slate-300 block leading-tight">Current Balance</span>
              <span className="text-base font-bold text-[#2bbbad] leading-tight">
                ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsCashierOpen(false)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-4 bg-slate-50 border-b border-slate-200 text-xs font-medium overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => {
              setCashierTab('deposit');
              setDepositMethod('MPESA');
              setDepositSuccessMsg(null);
            }}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              cashierTab === 'deposit'
                ? 'border-emerald-600 text-emerald-900 font-bold bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <span>M-Pesa Deposit</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCashierTab('deriv_transfer');
              setTransferSuccessMsg(null);
              setTransferErrorMsg(null);
              setTransferCashierUrl(null);
            }}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              cashierTab === 'deriv_transfer'
                ? 'border-[#2bbbad] text-[#0b1930] font-bold bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4 text-[#2bbbad]" />
            <span>Deriv Transfer</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCashierTab('withdrawal');
              if (withdrawMethod === 'DERIV_REAL_ACCOUNT') {
                setWithdrawMethod('MPESA');
                setWithdrawDestination(safaricomPhone);
              }
              setWithdrawSuccessMsg(null);
              setWithdrawErrorMsg(null);
              setB2cVerifyResult(null);
              setWithdrawCashierUrl(null);
            }}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              cashierTab === 'withdrawal'
                ? 'border-rose-500 text-rose-700 font-bold bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <ArrowUpRight className="w-4 h-4 text-rose-600" />
            <span>Withdraw Funds</span>
          </button>

          <button
            type="button"
            onClick={() => setCashierTab('dp2p')}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              cashierTab === 'dp2p'
                ? 'border-emerald-600 text-emerald-800 font-bold bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-emerald-600" />
            <span>DP2P M-Pesa</span>
            {cashierTransactions.some((t) => t.method === 'DERIV_P2P' && t.status === 'PENDING') && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-100 text-amber-800 font-bold">
                {cashierTransactions.filter((t) => t.method === 'DERIV_P2P' && t.status === 'PENDING').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCashierTab('dcash')}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              cashierTab === 'dcash'
                ? 'border-teal-600 text-teal-800 font-bold bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Wallet className="w-4 h-4 text-teal-600" />
            <span>D Cash App</span>
            {cashierTransactions.some((t) => t.method === 'D_CASH' && t.status === 'PENDING') && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-100 text-amber-800 font-bold">
                {cashierTransactions.filter((t) => t.method === 'D_CASH' && t.status === 'PENDING').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCashierTab('valtex')}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              cashierTab === 'valtex'
                ? 'border-[#0b1930] text-[#0b1930] font-bold bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Zap className="w-4 h-4 text-[#2bbbad]" />
            <span>Valtex</span>
            {cashierTransactions.some((t) => t.method === 'VALTEX' && t.status === 'PENDING') && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-100 text-amber-800 font-bold">
                {cashierTransactions.filter((t) => t.method === 'VALTEX' && t.status === 'PENDING').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCashierTab('payhero')}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              cashierTab === 'payhero'
                ? 'border-indigo-700 text-indigo-900 font-bold bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Wallet className="w-4 h-4 text-indigo-600" />
            <span>PayHero</span>
            {cashierTransactions.some((t) => t.method === 'PAYHERO' && t.status === 'PENDING') && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-100 text-amber-800 font-bold">
                {cashierTransactions.filter((t) => t.method === 'PAYHERO' && t.status === 'PENDING').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCashierTab('kcb')}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              cashierTab === 'kcb'
                ? 'border-[#004d25] text-[#004d25] font-bold bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Landmark className="w-4 h-4 text-[#004d25]" />
            <span>KCB iBank</span>
            {cashierTransactions.some((t) => t.method === 'KCB_BANK' && t.status === 'PENDING') && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-100 text-amber-800 font-bold">
                {cashierTransactions.filter((t) => t.method === 'KCB_BANK' && t.status === 'PENDING').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCashierTab('history')}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              cashierTab === 'history'
                ? 'border-[#0b1930] text-[#0b1930] font-bold bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4 text-[#0b1930]" />
            <span>Transactions</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-slate-200 text-slate-700 font-bold">
              {cashierTransactions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCashierTab('diagnostics')}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              cashierTab === 'diagnostics'
                ? 'border-[#0b1930] text-[#0b1930] font-bold bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Terminal className="w-4 h-4 text-[#0b1930]" />
            <span>Diagnostics</span>
            {clientDiagnosticLogs.some((l) => l.outcome === 'REJECTED' || l.outcome === 'WARNING') && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-100 text-amber-800 font-bold">
                {clientDiagnosticLogs.filter((l) => l.outcome === 'REJECTED' || l.outcome === 'WARNING').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCashierTab('deriv_portal')}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-colors cursor-pointer ml-auto whitespace-nowrap ${
              cashierTab === 'deriv_portal'
                ? 'border-amber-500 text-amber-700 font-bold bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">Deriv Official Cashier</span>
            <span className="sm:hidden">Official</span>
          </button>
        </div>

        {/* M-Pesa Daraja STK Balance Sync Banner */}
        {mpesaSyncBanner && (
          <div
            className={`px-4 py-2.5 border-b text-xs font-mono flex flex-wrap items-center justify-between gap-2 ${
              mpesaSyncBanner.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {mpesaSyncBanner.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span className="leading-snug">{mpesaSyncBanner.text}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {typeof mpesaSyncBanner.confirmedCount === 'number' && (
                <span className="px-2 py-0.5 rounded bg-white/80 border border-slate-200 text-[10px] font-bold text-slate-700 tabular-nums">
                  {mpesaSyncBanner.confirmedCount} Confirmed · {mpesaSyncBanner.pendingCount ?? 0} Pending ·{' '}
                  {mpesaSyncBanner.rejectedCount ?? 0} Failed
                </span>
              )}
              <button
                type="button"
                onClick={() => setMpesaSyncBanner(null)}
                className="p-1 rounded hover:bg-black/5 text-slate-500 hover:text-slate-800 cursor-pointer"
                aria-label="Dismiss M-Pesa sync notice"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 text-xs space-y-4 bg-[#f8fafc]">
          {/* Real-Time Pending Deposits & Withdrawals Tracker across M-Pesa & Bank Integrations */}
          {cashierTab !== 'history' && cashierTab !== 'diagnostics' && (
            <PendingCashierTracker
              defaultFilter={
                cashierTab === 'deposit' ? 'DEPOSIT' : cashierTab === 'withdrawal' ? 'WITHDRAWAL' : 'ALL'
              }
              collapsedByDefault={
                cashierTab !== 'deposit' && cashierTab !== 'withdrawal' && cashierTab !== 'kcb'
              }
              onStatusFeedback={(fb) => {
                if (fb.txType === 'DEPOSIT') {
                  if (fb.ok) {
                    setDepositErrorMsg(null);
                    setDepositSuccessMsg(fb.message);
                  } else {
                    setDepositErrorMsg(fb.message);
                  }
                } else {
                  if (fb.ok) {
                    setWithdrawErrorMsg(null);
                    setWithdrawSuccessMsg(fb.message);
                  } else {
                    setWithdrawErrorMsg(fb.message);
                  }
                }
              }}
            />
          )}

          {/* TAB 1: M-PESA DEPOSIT */}
          {cashierTab === 'deposit' && (
            <div className="space-y-4">
              {/* Authentic Safaricom Daraja M-Pesa Status & Env Config Banner */}
              <div
                className={`p-3.5 rounded-xl border space-y-2.5 ${
                  mpesaGatewayStatus.oauthVerified
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-amber-50 border-amber-300'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-lg text-white flex items-center justify-center shrink-0 ${
                        mpesaGatewayStatus.oauthVerified ? 'bg-emerald-600' : 'bg-amber-600'
                      }`}
                    >
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-white ${
                            mpesaGatewayStatus.oauthVerified ? 'bg-emerald-600' : 'bg-amber-600'
                          }`}
                        >
                          {mpesaGatewayStatus.oauthVerified
                            ? mpesaGatewayStatus.environment === 'production'
                              ? 'SAFARICOM M-PESA PRODUCTION (LIVE SMS)'
                              : 'SAFARICOM DARAJA CONNECTED (SANDBOX)'
                            : `DARAJA AUTH REQUIRED (${mpesaGatewayStatus.environment.toUpperCase()})`}
                        </span>
                        <span className="text-[10px] text-slate-700 font-mono font-semibold">
                          MSISDN: {safaricomMsisdn}
                        </span>
                      </div>
                      {isEditingSafaricom ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="text"
                            value={safaricomDraft}
                            onChange={(e) => setSafaricomDraft(e.target.value)}
                            placeholder="0793950512"
                            className="px-2 py-0.5 bg-white border border-emerald-400 rounded text-xs font-mono text-slate-900 w-36 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleSaveSafaricom}
                            className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-mono font-bold cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsEditingSafaricom(true)}
                          className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-slate-900 hover:text-emerald-700 mt-0.5 cursor-pointer"
                        >
                          <span>
                            {safaricomPhone} ({safaricomFormatted})
                          </span>
                          <Edit3 className="w-3 h-3 text-emerald-700" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 font-mono text-[10px]">
                    <span className="text-slate-800 font-bold">
                      Shortcode #{mpesaGatewayStatus.shortcode || 'Unset'} ·{' '}
                      {mpesaGatewayStatus.stkTransactionType || 'CustomerPayBillOnline'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600">1 USD = KES {KES_PER_USD_RATE.toFixed(2)}</span>
                      <button
                        type="button"
                        onClick={handleVerifyDarajaAuth}
                        disabled={isVerifyingStkOAuth}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold cursor-pointer disabled:opacity-60"
                      >
                        <RefreshCw className={`w-2.5 h-2.5 ${isVerifyingStkOAuth ? 'animate-spin' : ''}`} />
                        <span>{isVerifyingStkOAuth ? 'Checking...' : 'Verify Daraja OAuth'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Existing Env Variables API Configuration Readout */}
                <div className="p-2 rounded-lg bg-white/80 border border-slate-200 font-mono text-[10px] text-slate-700 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span>
                    MPESA_ENV: <strong className="text-slate-900">{mpesaGatewayStatus.environment.toUpperCase()}</strong>
                    {' · '}API Base:{' '}
                    <strong className="text-slate-900">
                      {mpesaGatewayStatus.baseUrl ||
                        (mpesaGatewayStatus.environment === 'production'
                          ? 'https://api.safaricom.co.ke'
                          : 'https://sandbox.safaricom.co.ke')}
                    </strong>
                  </span>
                  {mpesaGatewayStatus.callbackUrls?.stkCallbackUrl && (
                    <span className="truncate max-w-full">
                      STK CallBackURL: <strong className="text-slate-900">{mpesaGatewayStatus.callbackUrls.stkCallbackUrl}</strong>
                    </span>
                  )}
                </div>

                {!mpesaGatewayStatus.oauthVerified &&
                  (mpesaGatewayStatus.oauthError ||
                    (mpesaGatewayStatus.warnings && mpesaGatewayStatus.warnings.length > 0)) && (
                    <div className="p-2 rounded-lg bg-white/80 border border-amber-200 text-[10px] font-mono text-amber-950 space-y-1">
                      {mpesaGatewayStatus.oauthError && (
                        <div className="font-semibold text-rose-700">{mpesaGatewayStatus.oauthError}</div>
                      )}
                      {mpesaGatewayStatus.warnings &&
                        mpesaGatewayStatus.warnings.slice(0, 3).map((w, idx) => (
                          <div key={idx} className="text-amber-900">
                            • {w}
                          </div>
                        ))}
                    </div>
                  )}

                {darajaActionFeedback && (
                  <div
                    className={`p-2 rounded-lg border text-[10px] font-mono ${
                      darajaActionFeedback.ok
                        ? 'bg-emerald-100/70 border-emerald-300 text-emerald-950'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {darajaActionFeedback.text}
                  </div>
                )}
              </div>

              {/* Account Mode Notice & Target Account Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
                <div>
                  <span className="text-slate-500 text-[11px] block">Depositing into:</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">
                    {depositTarget === 'REAL' || account.isReal
                      ? `DERIV REAL ACCOUNT (${realAccount.loginId})`
                      : 'DEMO VIRTUAL ACCOUNT ($10,000)'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!account.isReal && (
                    <div className="flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 font-mono text-[10px]">
                      <button
                        type="button"
                        onClick={() => setDepositTarget('REAL')}
                        className={`px-2.5 py-1 rounded-md cursor-pointer font-bold ${
                          depositTarget === 'REAL' ? 'bg-[#2bbbad] text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Deriv Real
                      </button>
                      <button
                        type="button"
                        onClick={() => setDepositTarget('CURRENT')}
                        className={`px-2.5 py-1 rounded-md cursor-pointer font-bold ${
                          depositTarget === 'CURRENT' ? 'bg-[#0b1930] text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Demo Virtual
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {hasLiveToken && (
                      <button
                        type="button"
                        disabled={isSyncingDerivBalance}
                        onClick={handleSyncDerivBalance}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-mono text-[11px] font-semibold transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSyncingDerivBalance ? 'animate-spin' : ''}`} />
                        <span>{isSyncingDerivBalance ? 'Syncing...' : 'Sync Balance'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => switchAccountMode(!account.isReal)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-mono text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Switch to {account.isReal ? 'Demo' : 'Real'}
                    </button>
                  </div>
                </div>
              </div>

              {depositSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-mono space-y-2">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{depositSuccessMsg}</span>
                  </div>
                  {depositCashierUrl && (
                    <div className="pl-7">
                      <a
                        href={depositCashierUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-bold"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Connected Deriv Cashier Deposit</span>
                      </a>
                    </div>
                  )}
                </div>
              )}

              {depositErrorMsg && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 font-mono space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{depositErrorMsg}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pl-7">
                    <a
                      href="https://app.deriv.com/cashier/deposit"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white text-[11px] font-bold"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Deposit via Deriv Official Cashier</span>
                    </a>
                    <a
                      href="https://app.deriv.com/cashier/p2p"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Use Deriv DP2P (M-Pesa Kenya)</span>
                    </a>
                  </div>
                </div>
              )}

              {/* Deposit Method Selection (M-Pesa Deposit Primary + Crypto / Demo) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-slate-700 font-bold">Select M-Pesa / Funding Method</label>
                  <button
                    type="button"
                    onClick={() => setCashierTab('deriv_transfer')}
                    className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#0b1930] hover:text-[#2bbbad] cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3 h-3" />
                    <span>Need internal Deriv Transfer?</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDepositMethod('MPESA')}
                    className={`p-3 rounded-xl border flex flex-col items-start gap-1.5 transition-all cursor-pointer ${
                      depositMethod === 'MPESA'
                        ? 'bg-emerald-50 border-emerald-500 text-slate-900 shadow-xs ring-1 ring-emerald-500/30'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-xs text-slate-900">M-Pesa STK Push</span>
                    <span className="text-[10px] text-emerald-700 font-mono font-semibold">
                      {mpesaGatewayStatus.stkConfigured
                        ? mpesaGatewayStatus.stkTransactionType === 'CustomerBuyGoodsOnline' && mpesaGatewayStatus.tillNumber
                          ? `Till #${mpesaGatewayStatus.tillNumber} · Store #${mpesaGatewayStatus.storeNumber || mpesaGatewayStatus.shortcode}`
                          : `Paybill #${mpesaGatewayStatus.shortcode}`
                        : 'Daraja Online'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPayheroInitialAction('DEPOSIT');
                      setCashierTab('payhero');
                    }}
                    className="p-3 rounded-xl border flex flex-col items-start gap-1.5 transition-all cursor-pointer bg-indigo-50/50 border-indigo-300 text-slate-900 hover:border-indigo-600 hover:bg-indigo-50"
                  >
                    <Wallet className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-xs text-slate-900">PayHero STK</span>
                    <span className="text-[10px] text-indigo-700 font-mono font-semibold">M-Pesa API v2</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setKcbInitialAction('DEPOSIT');
                      setCashierTab('kcb');
                    }}
                    className="p-3 rounded-xl border flex flex-col items-start gap-1.5 transition-all cursor-pointer bg-emerald-50/40 border-emerald-300 text-slate-900 hover:border-[#004d25] hover:bg-emerald-50"
                  >
                    <Landmark className="w-4 h-4 text-[#004d25]" />
                    <span className="font-bold text-xs text-slate-900">KCB iBank</span>
                    <span className="text-[10px] text-[#004d25] font-mono font-semibold">Buni STK · Paybill</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCashierTab('valtex')}
                    className="p-3 rounded-xl border flex flex-col items-start gap-1.5 transition-all cursor-pointer bg-slate-50 border-slate-300 text-slate-900 hover:border-[#2bbbad] hover:bg-teal-50/40"
                  >
                    <Zap className="w-4 h-4 text-[#2bbbad]" />
                    <span className="font-bold text-xs text-slate-900">Valtex App</span>
                    <span className="text-[10px] text-teal-700 font-mono font-semibold">Verified Deposit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCashierTab('dcash')}
                    className="p-3 rounded-xl border flex flex-col items-start gap-1.5 transition-all cursor-pointer bg-teal-50/50 border-teal-300 text-slate-900 hover:border-teal-600 hover:bg-teal-50"
                  >
                    <Wallet className="w-4 h-4 text-teal-700" />
                    <span className="font-bold text-xs text-slate-900">D Cash App</span>
                    <span className="text-[10px] text-teal-800 font-mono font-semibold">Payment Agent KE</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDepositMethod('CRYPTO_USDT')}
                    className={`p-3 rounded-xl border flex flex-col items-start gap-1.5 transition-all cursor-pointer ${
                      depositMethod === 'CRYPTO_USDT'
                        ? 'bg-teal-50 border-[#2bbbad] text-slate-900 shadow-xs ring-1 ring-[#2bbbad]/30'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Coins className="w-4 h-4 text-[#2bbbad]" />
                    <span className="font-bold text-xs text-slate-900">USDT / Crypto</span>
                    <span className="text-[10px] text-slate-500 font-mono">TRC20 · Zero Fee</span>
                  </button>

                  {!account.isReal && (
                    <button
                      type="button"
                      onClick={() => setDepositMethod('DEMO_VIRTUAL')}
                      className={`p-3 rounded-xl border flex flex-col items-start gap-1.5 transition-all cursor-pointer ${
                        depositMethod === 'DEMO_VIRTUAL'
                          ? 'bg-slate-100 border-[#0b1930] text-slate-900 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <RefreshCw className="w-4 h-4 text-[#0b1930]" />
                      <span className="font-bold text-xs text-slate-900">Demo Instant Refill</span>
                      <span className="text-[10px] text-slate-500 font-mono">Virtual Practice</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Deposit Form */}
              <form onSubmit={handleDepositSubmit} className="space-y-4">
                {depositMethod === 'MPESA' && (
                  <div className="p-3.5 bg-white border border-emerald-200 rounded-xl space-y-2.5 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-slate-800 font-bold">Daraja Lipa Na M-Pesa Online (STK Push)</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-emerald-700 font-mono font-semibold">
                          {mpesaGatewayStatus.stkTransactionType === 'CustomerBuyGoodsOnline'
                            ? `Store #${mpesaGatewayStatus.storeNumber || mpesaGatewayStatus.shortcode || '1470353'} -> Till #${mpesaGatewayStatus.tillNumber || '1953263'}`
                            : `Paybill #${mpesaGatewayStatus.shortcode || 'Unset'}`}{' '}
                          · Acc: {realAccount.loginId}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            const useBuyGoods = mpesaGatewayStatus.stkTransactionType !== 'CustomerBuyGoodsOnline';
                            await fetch('/api/mpesa/till-config', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(
                                useBuyGoods
                                  ? { transactionType: 'CustomerBuyGoodsOnline', storeNumber: '1470353', tillNumber: '1953263' }
                                  : { transactionType: 'CustomerPayBillOnline', shortcode: '8167850' }
                              ),
                            });
                            await refreshMpesaGatewayStatus(false);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-mono text-[10px] font-bold cursor-pointer"
                        >
                          <span>
                            {mpesaGatewayStatus.stkTransactionType === 'CustomerBuyGoodsOnline'
                              ? 'Switch to Paybill 8167850'
                              : 'Use Till 1953263 (Store 1470353)'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={handleSyncMpesaBalance}
                          disabled={isSyncingMpesaBalance}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-mono text-[10px] font-bold cursor-pointer disabled:opacity-60"
                        >
                          <RefreshCw className={`w-3 h-3 ${isSyncingMpesaBalance ? 'animate-spin' : ''}`} />
                          <span>{isSyncingMpesaBalance ? 'Syncing...' : 'Sync M-Pesa Balance'}</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={mpesaPhone}
                        onChange={(e) => setMpesaPhone(e.target.value)}
                        placeholder="0793950512"
                        className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-sm font-semibold focus:outline-none focus:border-emerald-600"
                      />
                      <button
                        type="button"
                        onClick={() => setMpesaPhone('0793950512')}
                        className="px-2.5 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-mono text-[11px] font-bold cursor-pointer whitespace-nowrap"
                      >
                        Use 0793950512
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                      <span className="text-slate-600">
                        STK Push prompt sent to <strong className="text-emerald-700">{normalizeKenyanPhone(mpesaPhone).formatted}</strong>
                      </span>
                      <span className="text-emerald-700 font-bold">
                        KES {usdToKes(depositAmount).toLocaleString()} will be charged
                      </span>
                    </div>

                    {/* Authentic Safaricom Daraja Operational Tools */}
                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-1.5 font-mono text-[10px]">
                        <span className="font-bold text-slate-700">Safaricom Daraja Live Tools</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isRunningDarajaTool}
                            onClick={() => handleDarajaEndpointTool('C2B_REGISTER')}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-bold cursor-pointer disabled:opacity-50"
                          >
                            Register C2B URLs
                          </button>
                          <button
                            type="button"
                            disabled={isRunningDarajaTool}
                            onClick={() => handleDarajaEndpointTool('ACCOUNT_BALANCE')}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-bold cursor-pointer disabled:opacity-50"
                          >
                            Query Shortcode Balance
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                        <input
                          type="text"
                          value={txStatusQueryInput}
                          onChange={(e) => setTxStatusQueryInput(e.target.value)}
                          placeholder="Verify M-Pesa Receipt (e.g. SLK82940PQ)"
                          className="flex-1 min-w-[180px] px-2.5 py-1 bg-slate-50 border border-slate-300 rounded text-slate-900 focus:outline-none focus:border-emerald-600"
                        />
                        <button
                          type="button"
                          disabled={isRunningDarajaTool || !txStatusQueryInput.trim()}
                          onClick={() => handleDarajaEndpointTool('TX_STATUS')}
                          className="px-2.5 py-1 rounded bg-[#0b1930] hover:bg-slate-800 text-white font-bold cursor-pointer disabled:opacity-50"
                        >
                          Query Tx Status
                        </button>
                      </div>

                      {mpesaGatewayStatus.accountBalanceSnapshot?.accounts &&
                        mpesaGatewayStatus.accountBalanceSnapshot.accounts.length > 0 && (
                          <div className="p-2 rounded bg-emerald-50 border border-emerald-200 font-mono text-[10px] text-emerald-950">
                            <span className="font-bold block mb-0.5">
                              Latest Daraja Shortcode Balance Snapshot:
                            </span>
                            {mpesaGatewayStatus.accountBalanceSnapshot.accounts.map((acc, i) => (
                              <span key={i} className="inline-block mr-3">
                                {acc.name}: <strong>{acc.currency} {acc.available}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                )}

                {depositMethod === 'CRYPTO_USDT' && (
                  <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-800 font-bold">Select Network</span>
                      <div className="flex gap-1 font-mono text-[10px]">
                        {(['TRC20', 'ERC20', 'BTC'] as const).map((net) => (
                          <button
                            key={net}
                            type="button"
                            onClick={() => setCryptoNetwork(net)}
                            className={`px-2.5 py-0.5 rounded border cursor-pointer ${
                              cryptoNetwork === net
                                ? 'bg-[#0b1930] text-white border-[#0b1930] font-bold'
                                : 'bg-slate-100 text-slate-600 border-slate-300'
                            }`}
                          >
                            {net}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 block mb-1">
                        Your Dedicated Deriv USDT ({cryptoNetwork}) Deposit Address:
                      </span>
                      <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200 font-mono text-xs text-slate-800 break-all">
                        <QrCode className="w-4 h-4 text-slate-500 shrink-0" />
                        <span>TL3aK8JzXv8gq4w1m8aVn42x9pRtW9bQkL</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard('TL3aK8JzXv8gq4w1m8aVn42x9pRtW9bQkL')}
                          className="ml-auto p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Amount Input */}
                <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                  <div className="flex items-center justify-between text-slate-600 mb-1.5">
                    <span className="font-bold text-slate-800">Deposit Amount (USD)</span>
                    <span className="text-emerald-700 font-mono font-bold tabular-nums">
                      {depositMethod === 'MPESA'
                        ? `≈ KES ${usdToKes(depositAmount).toLocaleString()} @ ${KES_PER_USD_RATE}`
                        : 'Min: $10.00'}
                    </span>
                  </div>
                  <div className="relative mb-2">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-mono text-sm">$</span>
                    <input
                      type="number"
                      min={10}
                      step={5}
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(Number(e.target.value))}
                      className="w-full pl-8 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-base text-slate-900 font-bold focus:outline-none focus:border-[#2bbbad] tabular-nums"
                    />
                  </div>
                  <div className="grid grid-cols-6 gap-1 font-mono text-[11px]">
                    {[20, 50, 100, 250, 500, 1000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setDepositAmount(amt)}
                        className={`py-1.5 rounded-lg border transition-colors cursor-pointer ${
                          depositAmount === amt
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-400 font-bold'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit Deposit Button */}
                <button
                  type="submit"
                  disabled={isDepositLoading || depositAmount <= 0}
                  className="w-full py-3.5 bg-[#2bbbad] hover:bg-[#239b8f] active:scale-[0.98] text-white font-bold rounded-xl shadow-md font-mono text-sm transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>
                    {isDepositLoading
                      ? depositMethod === 'MPESA'
                        ? `SENDING STK PUSH TO ${normalizeKenyanPhone(mpesaPhone).msisdn}...`
                        : 'PROCESSING DEPOSIT...'
                      : depositMethod === 'MPESA'
                      ? `DEPOSIT $${depositAmount.toFixed(2)} (KES ${usdToKes(depositAmount).toLocaleString()}) VIA M-PESA ${normalizeKenyanPhone(mpesaPhone).local}`
                      : `CONFIRM & DEPOSIT $${depositAmount.toFixed(2)} USD`}
                  </span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: DERIV TRANSFER (SEPARATE FROM M-PESA DEPOSIT) */}
          {cashierTab === 'deriv_transfer' && (
            <div className="space-y-4">
              {/* Deriv Real Account Sync & WebSocket / Env API Config Card */}
              <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#0b1930] text-[#2bbbad] flex items-center justify-center shrink-0">
                      <ArrowLeftRight className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-xs">
                          Deriv Account Transfer &amp; Server API Config
                        </h3>
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono text-[9px] font-bold ${
                            hasLiveToken
                              ? 'bg-emerald-600 text-white'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          {hasLiveToken ? 'LIVE DERIV WS TOKEN' : 'LOCAL LEDGER SYNC'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono block">
                        Transfer USD between Terminal ({account.loginId}) &amp; Deriv Real ({realAccount.loginId})
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {!hasLiveToken && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCashierOpen(false);
                          setIsConnectModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white text-[10px] font-mono font-bold cursor-pointer"
                      >
                        <Link2 className="w-3 h-3 text-[#2bbbad]" />
                        <span>Connect Deriv Token</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => switchAccountMode(!account.isReal)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-mono text-[10px] font-bold cursor-pointer"
                    >
                      Switch to {account.isReal ? 'Demo' : 'Real'}
                    </button>
                  </div>
                </div>

                {/* Existing Environment Variable API Configuration Summary */}
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[10px] space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 uppercase tracking-wider text-[9px]">
                      Active Environment API Configuration
                    </span>
                    <button
                      type="button"
                      onClick={handleVerifyDarajaAuth}
                      disabled={isVerifyingStkOAuth}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isVerifyingStkOAuth ? 'animate-spin' : ''}`} />
                      <span>{isVerifyingStkOAuth ? 'Verifying...' : 'Verify Env API'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-slate-700">
                    <span>
                      Deriv WS: <strong className="text-slate-900">ws.derivws.com (App #1089)</strong>
                    </span>
                    <span>
                      MPESA_ENV:{' '}
                      <strong className="text-slate-900">
                        {mpesaGatewayStatus.environment.toUpperCase()} (
                        {mpesaGatewayStatus.oauthVerified ? 'OAuth Verified' : 'Auth Pending'})
                      </strong>
                    </span>
                    <span>
                      Shortcodes:{' '}
                      <strong className="text-slate-900">
                        STK #{mpesaGatewayStatus.shortcode || 'Unset'} · B2C #{mpesaGatewayStatus.b2cShortcode || mpesaGatewayStatus.shortcode || 'Unset'} · B2B #{mpesaGatewayStatus.b2bShortcode || mpesaGatewayStatus.shortcode || 'Unset'}
                      </strong>
                    </span>
                    <span>
                      Command IDs:{' '}
                      <strong className="text-slate-900">
                        {mpesaGatewayStatus.b2cCommandId || 'BusinessPayment'} / {mpesaGatewayStatus.b2bCommandId || 'BusinessPayBill'}
                      </strong>
                    </span>
                  </div>
                  {mpesaGatewayStatus.callbackUrls?.b2cResultUrl && (
                    <div className="text-slate-500 break-all">
                      Gateway Base:{' '}
                      <strong className="text-slate-800">
                        {mpesaGatewayStatus.baseUrl ||
                          (mpesaGatewayStatus.environment === 'sandbox'
                            ? 'https://sandbox.safaricom.co.ke'
                            : 'https://api.safaricom.co.ke')}
                      </strong>{' '}
                      · Callback: <strong className="text-slate-800">{mpesaGatewayStatus.callbackUrls.b2cResultUrl}</strong>
                    </div>
                  )}
                </div>

                {darajaActionFeedback && (
                  <div
                    className={`p-2 rounded-lg border text-[10px] font-mono ${
                      darajaActionFeedback.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {darajaActionFeedback.text}
                  </div>
                )}
              </div>

              {/* Balances Overview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                  <span className="text-slate-500 text-[10px] font-mono block">
                    {account.isReal ? 'Active Terminal (Real)' : 'Source Terminal (Demo Virtual)'}
                  </span>
                  <span className="text-lg font-bold text-slate-900 font-mono tabular-nums">
                    ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 block mt-0.5">{account.loginId}</span>
                </div>

                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-800 text-[10px] font-mono font-bold">
                      Target Deriv Real Account
                    </span>
                    {isEditingRealId ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={realIdDraft}
                          onChange={(e) => setRealIdDraft(e.target.value)}
                          className="px-2 py-0.5 bg-white border border-emerald-400 rounded text-[11px] font-mono text-slate-900 w-28 focus:outline-none"
                          placeholder="CR1234567"
                        />
                        <button
                          type="button"
                          onClick={handleSaveRealId}
                          className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-mono font-bold cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditingRealId(true)}
                        className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-800 hover:underline cursor-pointer"
                      >
                        <span>{realAccount.loginId}</span>
                        <Edit3 className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                  <span className="text-lg font-bold text-emerald-700 font-mono tabular-nums block mt-0.5">
                    ${realAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} {realAccount.currency}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-700 block mt-0.5">
                    Synced with Deriv Cashier &amp; DP2P
                  </span>
                </div>
              </div>

              {transferSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-mono space-y-2">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{transferSuccessMsg}</span>
                  </div>
                  {transferCashierUrl && (
                    <a
                      href={transferCashierUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Deriv Official Cashier</span>
                    </a>
                  )}
                </div>
              )}

              {transferErrorMsg && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 font-mono flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{transferErrorMsg}</span>
                </div>
              )}

              {account.isReal ? (
                <form onSubmit={handleDerivTransferSubmit} className="space-y-3.5">
                  <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2.5 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-slate-800 font-bold">
                        Deriv Real Account-to-Account Transfer (CR / MT5 / Sub-Account)
                      </label>
                      <span className="text-[10px] font-mono text-emerald-700 font-semibold">
                        {hasLiveToken ? 'Deriv WS transfer_between_accounts' : 'Test Real Ledger'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <span className="block text-[10px] font-mono text-slate-500 mb-1">From Connected Account</span>
                        <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-900">
                          {realAccount.loginId} (${realAccount.balance.toFixed(2)} {realAccount.currency})
                        </div>
                      </div>
                      <div>
                        <span className="block text-[10px] font-mono text-slate-500 mb-1">
                          To Destination Deriv Account (CR / MTR / MT5)
                        </span>
                        <input
                          type="text"
                          value={realTransferToId}
                          onChange={(e) => setRealTransferToId(e.target.value)}
                          placeholder="e.g. MTR123456 or CR7654321"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 font-semibold focus:outline-none focus:border-[#2bbbad]"
                        />
                      </div>
                    </div>

                    {realAccount.accountList && realAccount.accountList.length > 1 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10px] text-slate-500 font-mono">Quick select:</span>
                        {realAccount.accountList
                          .filter((a) => a.loginid && a.loginid !== realAccount.loginId && !a.is_virtual)
                          .map((sub) => (
                            <button
                              key={sub.loginid}
                              type="button"
                              onClick={() => setRealTransferToId(sub.loginid)}
                              className={`px-2 py-1 rounded border font-mono text-[10px] cursor-pointer ${
                                realTransferToId === sub.loginid
                                  ? 'bg-[#0b1930] text-white border-[#0b1930] font-bold'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {sub.loginid} ({sub.currency})
                            </button>
                          ))}
                      </div>
                    )}
                  </div>

                  <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                    <div className="flex items-center justify-between text-slate-600 mb-1.5">
                      <span className="font-bold text-slate-800">Transfer Amount (USD)</span>
                      <span className="text-emerald-700 font-mono font-bold tabular-nums">
                        Available: ${realAccount.balance.toFixed(2)}
                      </span>
                    </div>
                    <div className="relative mb-2">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-mono text-sm">
                        $
                      </span>
                      <input
                        type="number"
                        min={10}
                        max={realAccount.balance}
                        step={5}
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(Number(e.target.value))}
                        className="w-full pl-8 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-base text-slate-900 font-bold focus:outline-none focus:border-[#2bbbad] tabular-nums"
                      />
                    </div>
                    <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
                      {[25, 50, 100, 250].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setTransferAmount(amt)}
                          className={`py-1.5 rounded-lg border transition-colors cursor-pointer ${
                            transferAmount === amt
                              ? 'bg-[#0b1930] text-white border-[#0b1930] font-bold'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          ${amt}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setTransferAmount(Math.floor(realAccount.balance))}
                        className="py-1.5 rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 cursor-pointer font-bold"
                      >
                        Max
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      isTransferLoading ||
                      transferAmount < 10 ||
                      transferAmount > realAccount.balance ||
                      !realTransferToId.trim()
                    }
                    className="w-full min-h-[46px] py-3 bg-[#0b1930] hover:bg-slate-800 active:scale-[0.98] text-white font-bold rounded-xl shadow-md font-mono text-xs transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <ArrowLeftRight className="w-4 h-4 text-[#2bbbad]" />
                    <span>
                      {isTransferLoading
                        ? 'EXECUTING DERIV TRANSFER...'
                        : `TRANSFER $${transferAmount.toFixed(2)} USD: ${realAccount.loginId} -> ${
                            realTransferToId.trim().toUpperCase() || 'TARGET'
                          }`}
                    </span>
                  </button>

                  {hasLiveToken && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={isSyncingDerivBalance}
                        onClick={handleSyncDerivBalance}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono text-[11px] font-semibold cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSyncingDerivBalance ? 'animate-spin' : ''}`} />
                        <span>{isSyncingDerivBalance ? 'Syncing Balance...' : 'Sync Live Deriv Balance'}</span>
                      </button>
                    </div>
                  )}
                </form>
              ) : (
                <form onSubmit={handleDerivTransferSubmit} className="space-y-3.5">
                  <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-800 font-bold">Destination Deriv Real Login ID</label>
                      <span className="text-[10px] font-mono text-emerald-700 font-semibold">
                        Direct Terminal -&gt; Deriv Real
                      </span>
                    </div>
                    <input
                      type="text"
                      value={transferTargetId}
                      onChange={(e) => setTransferTargetId(e.target.value)}
                      placeholder="CR1234567"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-sm text-slate-900 font-semibold focus:outline-none focus:border-[#2bbbad]"
                    />
                  </div>

                  <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                    <div className="flex items-center justify-between text-slate-600 mb-1.5">
                      <span className="font-bold text-slate-800">Transfer Amount (USD)</span>
                      <span className="text-emerald-700 font-mono font-bold tabular-nums">
                        Available: ${account.balance.toFixed(2)}
                      </span>
                    </div>
                    <div className="relative mb-2">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-mono text-sm">
                        $
                      </span>
                      <input
                        type="number"
                        min={10}
                        max={account.balance}
                        step={5}
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(Number(e.target.value))}
                        className="w-full pl-8 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-base text-slate-900 font-bold focus:outline-none focus:border-[#2bbbad] tabular-nums"
                      />
                    </div>
                    <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
                      {[25, 50, 100, 250].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setTransferAmount(amt)}
                          className={`py-1.5 rounded-lg border transition-colors cursor-pointer ${
                            transferAmount === amt
                              ? 'bg-[#0b1930] text-white border-[#0b1930] font-bold'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          ${amt}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setTransferAmount(Math.floor(account.balance))}
                        className="py-1.5 rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 cursor-pointer font-bold"
                      >
                        Max
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-1.5 shadow-xs">
                    <div className="flex items-center gap-1.5 text-slate-800">
                      <Lock className="w-3.5 h-3.5 text-amber-600" />
                      <span className="font-bold">Security Verification PIN</span>
                    </div>
                    <input
                      type="password"
                      maxLength={6}
                      value={transferPin}
                      onChange={(e) => setTransferPin(e.target.value)}
                      placeholder="Enter 4-digit PIN"
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono text-sm focus:outline-none focus:border-[#0b1930]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isTransferLoading || transferAmount < 10 || transferAmount > account.balance}
                    className="w-full py-3.5 bg-[#0b1930] hover:bg-slate-800 active:scale-[0.98] text-white font-bold rounded-xl shadow-md font-mono text-sm transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <ArrowLeftRight className="w-4 h-4 text-[#2bbbad]" />
                    <span>
                      {isTransferLoading
                        ? 'TRANSFERRING TO DERIV REAL...'
                        : `TRANSFER $${transferAmount.toFixed(2)} USD TO DERIV REAL (${
                            transferTargetId.trim() || realAccount.loginId
                          })`}
                    </span>
                  </button>
                </form>
              )}

              {/* Cross-Rail Navigation */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setKcbInitialAction('TRANSFER');
                    setCashierTab('kcb');
                  }}
                  className="p-2.5 rounded-xl bg-emerald-50/60 hover:bg-emerald-100 border border-emerald-300 text-[#004d25] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Landmark className="w-3.5 h-3.5 text-[#004d25]" />
                  <span>KCB iBank Transfer</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPayheroInitialAction('TRANSFER');
                    setCashierTab('payhero');
                  }}
                  className="p-2.5 rounded-xl bg-indigo-50/60 hover:bg-indigo-100 border border-indigo-300 text-indigo-900 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Wallet className="w-3.5 h-3.5 text-indigo-600" />
                  <span>PayHero Transfer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCashierTab('dp2p')}
                  className="p-2.5 rounded-xl bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-800 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Daraja B2B / DP2P</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCashierTab('deposit')}
                  className="p-2.5 rounded-xl bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-800 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>M-Pesa Deposit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCashierTab('valtex')}
                  className="p-2.5 rounded-xl bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-slate-800 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-[#2bbbad]" />
                  <span>Valtex Transfer</span>
                </button>
                <a
                  href="https://app.deriv.com/cashier/account-transfer"
                  target="_blank"
                  rel="noreferrer"
                  className="p-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#2bbbad]" />
                  <span>Official Deriv Transfer</span>
                </a>
              </div>
            </div>
          )}

          {/* TAB 3: WITHDRAWAL (EXTERNAL PAYOUTS) */}
          {cashierTab === 'withdrawal' && (
            <div className="space-y-4">
              {/* Deriv Real Account Direct Sync Banner */}
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 text-[10px] font-mono font-bold text-white">
                      <Zap className="w-3 h-3" />
                      DERIV REAL DIRECT SYNC
                    </span>
                    {isEditingRealId ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={realIdDraft}
                          onChange={(e) => setRealIdDraft(e.target.value)}
                          className="px-2 py-0.5 bg-white border border-emerald-400 rounded text-xs font-mono text-slate-900 w-36 focus:outline-none"
                          placeholder="CR1234567"
                        />
                        <button
                          type="button"
                          onClick={handleSaveRealId}
                          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-mono font-bold cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditingRealId(true)}
                        className="inline-flex items-center gap-1 text-xs font-mono font-bold text-emerald-950 hover:text-emerald-700 transition-colors cursor-pointer"
                        title="Edit Deriv Real Account ID (CR...)"
                      >
                        <span>{realAccount.loginId}</span>
                        <Edit3 className="w-3 h-3 text-emerald-700" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCashierTab('deriv_transfer')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-[10px] font-mono font-semibold text-[#0b1930] transition-colors cursor-pointer"
                    >
                      <ArrowLeftRight className="w-3 h-3 text-[#2bbbad]" />
                      <span>Deriv Transfer</span>
                    </button>
                    {!hasLiveToken && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCashierOpen(false);
                          setIsConnectModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-[10px] font-mono font-semibold text-[#0b1930] transition-colors cursor-pointer"
                      >
                        <Link2 className="w-3 h-3" />
                        <span>Connect Deriv API Token</span>
                      </button>
                    )}
                    {!account.isReal && (
                      <button
                        type="button"
                        onClick={() => switchAccountMode(true)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[10px] font-mono font-bold text-white transition-colors cursor-pointer"
                      >
                        Switch Terminal to Real
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono pt-2 border-t border-emerald-200 tabular-nums">
                  <span className="text-emerald-800">
                    Deriv Real Account Balance ({realAccount.loginId}):
                  </span>
                  <span className="text-sm font-bold text-emerald-700">
                    ${realAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} {realAccount.currency}
                  </span>
                </div>
              </div>

              {/* Account Balance Card */}
              <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between shadow-xs">
                <div>
                  <span className="text-slate-500 text-[10px] block">
                    {`Withdrawable Deriv Real Balance (${realAccount.loginId})`}
                  </span>
                  <span className="text-xl font-bold text-slate-900 font-mono tabular-nums">
                    ${withdrawableBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Real Account: <strong className="text-emerald-700 font-mono">{realAccount.loginId}</strong>
                    {hasLiveToken ? ' · Live WS Authorized' : ' · Direct Ledger Synced'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setWithdrawAmount(Math.floor(withdrawableBalance))}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-mono text-xs font-bold transition-colors cursor-pointer"
                >
                  Withdraw All Max
                </button>
              </div>

              {/* Recommended Money Receiver from AI Studio Withdrawal */}
              <div className="p-3.5 bg-white border border-emerald-300 rounded-xl shadow-xs space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-xs">
                          Recommended Money Receiver (AI Studio Withdrawal)
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono text-[9px] font-bold">
                          VERIFIED KE WALLET
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono block">
                        0728424076 (+254 728 424 076) · Safaricom Kenya M-Pesa · Alternate: 0793950512
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                    <button
                      type="button"
                      onClick={() => {
                        setWithdrawMethod('MPESA');
                        setWithdrawDestination('0728424076');
                      }}
                      className={`px-2.5 py-1.5 rounded-lg border font-bold cursor-pointer transition-colors ${
                        withdrawMethod === 'MPESA' &&
                        normalizeKenyanPhone(withdrawDestination).local === '0728424076'
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800'
                      }`}
                    >
                      Select 0728424076 (M-Pesa)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCashierTab('dp2p')}
                      className="px-2.5 py-1.5 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white font-bold cursor-pointer transition-colors"
                    >
                      Send via DP2P / B2B
                    </button>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] font-mono text-slate-700 space-y-1">
                  <div>
                    <strong className="text-slate-900">Best Live Rail Right Now:</strong>{' '}
                    {hasLiveToken
                      ? 'Deriv DP2P Escrow or Payment Agent to 0728424076 (live token connected).'
                      : 'Deriv DP2P Portal / Official Cashier to 0728424076 (connect a Payments-scoped Deriv API Token for in-app WS dispatch).'}
                  </div>
                  <div className="text-slate-500">
                    {mpesaGatewayStatus.liveWithdrawalReady
                      ? `Connected Secrets Active: Daraja B2C (Shortcode #${
                          mpesaGatewayStatus.b2cShortcode || mpesaGatewayStatus.shortcode
                        }), Daraja B2B (Shortcode #${
                          mpesaGatewayStatus.b2bShortcode || mpesaGatewayStatus.shortcode
                        }), KCB Buni OAuth, & PayHero API v2 are online for live payouts & transfers.`
                      : 'Direct server payouts (Daraja B2C, Daraja B2B, KCB Buni, & PayHero) activate automatically from saved Secrets.'}
                  </div>
                </div>
              </div>

              {/* Safaricom Daraja M-Pesa B2C Live Withdrawal & SMS Gateway */}
              <div
                className={`p-3.5 rounded-xl border space-y-2.5 text-[11px] font-mono ${
                  mpesaGatewayStatus.liveWithdrawalReady
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : mpesaGatewayStatus.oauthVerified && mpesaGatewayStatus.b2cConfigured
                    ? 'bg-teal-50/70 border-teal-300 text-slate-900'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 shrink-0 text-emerald-700" />
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>Safaricom Daraja B2C Gateway:</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            mpesaGatewayStatus.liveWithdrawalReady
                              ? 'bg-emerald-600 text-white'
                              : mpesaGatewayStatus.oauthVerified && mpesaGatewayStatus.b2cConfigured
                              ? 'bg-[#0b1930] text-[#2bbbad]'
                              : 'bg-amber-600 text-white'
                          }`}
                        >
                          {mpesaGatewayStatus.liveWithdrawalReady
                            ? 'PRODUCTION LIVE · REAL SMS ACTIVE'
                            : mpesaGatewayStatus.oauthVerified && mpesaGatewayStatus.b2cConfigured
                            ? `OAUTH VERIFIED (${(mpesaGatewayStatus.withdrawalConfirmationEnvironment || 'production').toUpperCase()})`
                            : mpesaGatewayStatus.b2cConfigured
                            ? `VERIFY PRODUCTION OAUTH (${(mpesaGatewayStatus.withdrawalConfirmationEnvironment || 'production').toUpperCase()})`
                            : 'AWAITING SERVER SECRETS'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-600 block break-all mt-0.5">
                        B2C API: {mpesaGatewayStatus.b2cEndpoint || 'https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest'} · PartyA: #{mpesaGatewayStatus.b2cShortcode || mpesaGatewayStatus.shortcode || 'Unset'}
                      </span>
                      <span className="text-[10px] text-slate-600 block break-all mt-0.5">
                        Confirm API: {mpesaGatewayStatus.txStatusEndpoint || 'https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isCheckingB2c}
                      onClick={async () => {
                        setIsCheckingB2c(true);
                        setB2cVerifyResult(null);
                        await refreshMpesaGatewayStatus(true);
                        try {
                          const r = await fetch('/api/mpesa/b2c-verify-oauth', { method: 'POST' });
                          const d = await r.json().catch(() => ({}));
                          setB2cVerifyResult({
                            ok: Boolean(d.ok),
                            msg: d.message || d.error || 'Checked Daraja B2C status.',
                          });
                        } catch {
                          setB2cVerifyResult({ ok: false, msg: 'Could not reach /api/mpesa/b2c-verify-oauth.' });
                        } finally {
                          setIsCheckingB2c(false);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-[10px] font-bold cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3 h-3 ${isCheckingB2c ? 'animate-spin' : ''}`} />
                      <span>Test B2C OAuth</span>
                    </button>

                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-emerald-50 border-emerald-300 text-emerald-900 text-[10px] font-bold"
                      title="Withdrawals stay Pending until Safaricom Daraja callback or Transaction Status verifies settlement"
                    >
                      <ShieldCheck className="w-3 h-3 text-emerald-700" />
                      <span>Callback-Verified Only</span>
                    </span>

                    <button
                      type="button"
                      disabled={isCheckingB2c || !mpesaGatewayStatus.b2cConfigured}
                      onClick={async () => {
                        setB2cVerifyResult(null);
                        const parsedTarget = normalizeKenyanPhone(withdrawDestination || safaricomPhone);
                        if (!parsedTarget.valid) {
                          setB2cVerifyResult({
                            ok: false,
                            confirmed: false,
                            msg: 'Enter a valid Kenyan Safaricom M-Pesa recipient phone number (e.g. 0728424076 or 254793950512) before sending B2C.',
                          });
                          return;
                        }
                        setIsCheckingB2c(true);
                        try {
                          const r = await fetch('/api/mpesa/b2c-withdraw', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              phone: parsedTarget.msisdn,
                              usdAmount: 1,
                              kesAmount: 10,
                              loginId: realAccount.loginId,
                            }),
                          });
                          const d = await r.json().catch(() => ({}));
                          const convId = d.conversationId ? String(d.conversationId) : '';
                          setB2cVerifyResult({
                            ok: Boolean(r.ok && d.ok),
                            confirmed: false,
                            msg:
                              r.ok && d.ok
                                ? `B2C paymentrequest accepted for ${parsedTarget.msisdn} (${String(d.environment || mpesaGatewayStatus.environment).toUpperCase()}): ${d.message} (ConversationID: ${convId}) — Waiting for Safaricom callback...`
                                : d.error || 'B2C paymentrequest rejected by Safaricom.',
                          });
                          if (d.ok && convId) {
                            if (b2cWatchTimerRef.current) {
                              clearInterval(b2cWatchTimerRef.current);
                            }
                            const startedAt = Date.now();
                            let attempts = 0;
                            b2cWatchTimerRef.current = setInterval(async () => {
                              attempts += 1;
                              try {
                                const probe = attempts >= 6 ? '?probe=1' : '';
                                const tr = await fetch(`/api/mpesa/tx/${encodeURIComponent(convId)}${probe}`);
                                if (tr.ok) {
                                  const td = await tr.json();
                                  const rec = td?.transaction;
                                  if (rec?.status === 'COMPLETED' && rec?.callbackVerified === true) {
                                    if (b2cWatchTimerRef.current) {
                                      clearInterval(b2cWatchTimerRef.current);
                                      b2cWatchTimerRef.current = null;
                                    }
                                    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
                                    setB2cVerifyResult({
                                      ok: true,
                                      confirmed: true,
                                      msg: `Confirmed (${secs}s): ${rec.safaricomConfirmationText || rec.resultDesc || rec.mpesaReceipt}`,
                                    });
                                  } else if (rec?.status === 'REJECTED') {
                                    if (b2cWatchTimerRef.current) {
                                      clearInterval(b2cWatchTimerRef.current);
                                      b2cWatchTimerRef.current = null;
                                    }
                                    setB2cVerifyResult({
                                      ok: false,
                                      confirmed: false,
                                      msg: `Rejected by Safaricom: ${rec.resultDesc || 'B2C callback failed'}`,
                                    });
                                  }
                                }
                              } catch {
                                // ignore transient poll failure
                              }
                              if (attempts >= 25 && b2cWatchTimerRef.current) {
                                clearInterval(b2cWatchTimerRef.current);
                                b2cWatchTimerRef.current = null;
                              }
                            }, 650);
                          }
                        } catch {
                          setB2cVerifyResult({ ok: false, msg: 'Network error calling /api/mpesa/b2c-withdraw.' });
                        } finally {
                          setIsCheckingB2c(false);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white text-[10px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      <Zap className="w-3 h-3 text-[#2bbbad]" />
                      <span>
                        Dispatch Live B2C (KES 10)
                      </span>
                    </button>
                  </div>
                </div>

                {/* Live Carrier SMS & Production Withdrawal Readiness Row */}
                <div className="p-2 rounded-lg bg-white/80 border border-slate-200 text-[10px] space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">
                      Safaricom Withdrawal Confirmation:{' '}
                      <span
                        className={
                          mpesaGatewayStatus.liveWithdrawalReady ? 'text-emerald-700' : 'text-amber-700'
                        }
                      >
                        {mpesaGatewayStatus.liveWithdrawalReady
                          ? 'PRODUCTION LIVE · M-PESA SMS ENABLED'
                          : 'PRODUCTION MODE · VERIFY LIVE PAYBILL & OAUTH'}
                      </span>
                    </span>
                    <span className="text-slate-600 font-bold">
                      {(mpesaGatewayStatus.withdrawalConfirmationBaseUrl || 'https://api.safaricom.co.ke').replace(/^https?:\/\//, '')}
                    </span>
                  </div>
                  {mpesaGatewayStatus.smsDeliveryReason && (
                    <span className="text-slate-600 block leading-relaxed">
                      {mpesaGatewayStatus.smsDeliveryReason}
                    </span>
                  )}
                  {mpesaGatewayStatus.oauthError && (
                    <span className="text-rose-700 font-semibold block leading-relaxed">
                      {mpesaGatewayStatus.oauthError}
                    </span>
                  )}
                  {mpesaGatewayStatus.warnings && mpesaGatewayStatus.warnings.length > 0 && (
                    <span className="text-amber-800 block leading-relaxed">
                      {mpesaGatewayStatus.warnings[0]}
                    </span>
                  )}
                </div>

                {!mpesaGatewayStatus.b2cConfigured &&
                  mpesaGatewayStatus.missingB2cVars &&
                  mpesaGatewayStatus.missingB2cVars.length > 0 && (
                    <div className="text-[10px] text-amber-900 bg-white/70 border border-amber-200 rounded-lg p-2 space-y-1">
                      <span className="font-bold block">Missing Server Env Secrets:</span>
                      <span className="block break-words">{mpesaGatewayStatus.missingB2cVars.join(' · ')}</span>
                    </div>
                  )}

                {mpesaGatewayStatus.callbackUrls && (
                  <div className="text-[10px] text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>
                      ResultURL: <strong className="text-slate-900">{mpesaGatewayStatus.callbackUrls.b2cResultUrl}</strong>
                    </span>
                    <span>
                      TimeoutURL: <strong className="text-slate-900">{mpesaGatewayStatus.callbackUrls.b2cTimeoutUrl}</strong>
                    </span>
                  </div>
                )}

                {b2cVerifyResult && (
                  <div
                    className={`text-[10px] px-2.5 py-1.5 rounded-lg border ${
                      b2cVerifyResult.ok
                        ? 'bg-emerald-100/70 border-emerald-300 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {b2cVerifyResult.msg}
                  </div>
                )}

                {(() => {
                  const latestLiveConfirmation = cashierTransactions.find(
                    (t) => t.type === 'WITHDRAWAL' && t.status === 'COMPLETED' && Boolean(t.safaricomConfirmationText)
                  );
                  if (!latestLiveConfirmation?.safaricomConfirmationText) return null;
                  return (
                    <div className="p-2.5 rounded-lg bg-emerald-100/80 border border-emerald-300 text-emerald-950 space-y-0.5">
                      <span className="text-[9px] uppercase tracking-wider font-bold text-emerald-800 block">
                        Latest Live Safaricom M-Pesa Confirmation Callback
                      </span>
                      <span className="text-[11px] font-bold block">
                        {latestLiveConfirmation.safaricomConfirmationText}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {withdrawSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-mono space-y-2">
                  <div className="flex items-start gap-2.5">
                    {latestSubmittedWithdrawalId ? (
                      <RefreshCw className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <span className="block">{withdrawSuccessMsg}</span>
                      {latestSubmittedWithdrawalId && (
                        <span className="text-[10px] text-emerald-700 font-semibold block">
                          Live callback stream connected — confirmation message updates instantaneously on Safaricom reply.
                        </span>
                      )}
                    </div>
                  </div>
                  {withdrawCashierUrl && (
                    <a
                      href={withdrawCashierUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Deriv Official Cashier Verification</span>
                    </a>
                  )}
                </div>
              )}

              {withdrawErrorMsg && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 font-mono space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{withdrawErrorMsg}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pl-7">
                    <a
                      href={withdrawCashierUrl || 'https://app.deriv.com/cashier/withdrawal'}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white text-[11px] font-bold transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Withdraw on Deriv Official Cashier</span>
                    </a>
                    <a
                      href="https://app.deriv.com/cashier/p2p"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Deriv DP2P (Send KES to {safaricomPhone})</span>
                    </a>
                  </div>
                </div>
              )}

              {/* Withdrawal Method Selection */}
              <div>
                <label className="text-slate-700 font-bold block mb-2">Select Withdrawal Destination</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawMethod('MPESA');
                      setWithdrawDestination(safaricomPhone);
                    }}
                    className={`p-3 rounded-xl border flex flex-col items-start gap-1.5 transition-all cursor-pointer ${
                      withdrawMethod === 'MPESA'
                        ? 'bg-rose-50 border-rose-500 text-slate-900 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-rose-600" />
                    <span className="font-bold text-xs text-slate-900">M-Pesa Mobile</span>
                    <span className="text-[10px] text-emerald-700 font-mono font-semibold">{safaricomPhone}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setKcbInitialAction('WITHDRAWAL');
                      setCashierTab('kcb');
                    }}
                    className="p-3 rounded-xl border flex flex-col items-start gap-1.5 transition-all cursor-pointer bg-emerald-50/50 border-emerald-300 text-slate-900 hover:border-[#004d25] hover:bg-emerald-50"
                  >
                    <Landmark className="w-4 h-4 text-[#004d25]" />
                    <span className="font-bold text-xs text-slate-900">KCB iBank</span>
                    <span className="text-[10px] text-[#004d25] font-mono font-semibold">IFT / 522522</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPayheroInitialAction('WITHDRAWAL');
                      setCashierTab('payhero');
                    }}
                    className="p-3 rounded-xl border flex flex-col items-start gap-1.5 transition-all cursor-pointer bg-indigo-50/50 border-indigo-300 text-slate-900 hover:border-indigo-600 hover:bg-indigo-50"
                  >
                    <Wallet className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-xs text-slate-900">PayHero Payout</span>
                    <span className="text-[10px] text-indigo-700 font-mono font-semibold">M-Pesa / Bank</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCashierTab('valtex')}
                    className="p-3 rounded-xl border flex flex-col items-start gap-1.5 transition-all cursor-pointer bg-slate-50 border-slate-300 text-slate-900 hover:border-[#2bbbad] hover:bg-teal-50/40"
                  >
                    <Zap className="w-4 h-4 text-[#2bbbad]" />
                    <span className="font-bold text-xs text-slate-900">Valtex App</span>
                    <span className="text-[10px] text-teal-700 font-mono font-semibold">Callback Payout</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawMethod('CRYPTO_USDT');
                      setWithdrawDestination('TL3aK8JzXv8gq4w1m8aVn42x9pRtW9bQkL');
                    }}
                    className={`p-3 rounded-xl border flex flex-col items-start gap-1.5 transition-all cursor-pointer ${
                      withdrawMethod === 'CRYPTO_USDT'
                        ? 'bg-rose-50 border-rose-500 text-slate-900 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Coins className="w-4 h-4 text-rose-600" />
                    <span className="font-bold text-xs text-slate-900">USDT (TRC20)</span>
                    <span className="text-[10px] text-slate-500 font-mono">Crypto Wallet</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCashierTab('dcash')}
                    className="p-3 rounded-xl border flex flex-col items-start gap-1.5 transition-all cursor-pointer bg-teal-50/70 border-teal-300 text-slate-900 hover:bg-teal-100/70"
                  >
                    <Wallet className="w-4 h-4 text-teal-700" />
                    <span className="font-bold text-xs text-slate-900">D Cash App</span>
                    <span className="text-[10px] text-teal-800 font-mono font-semibold">Real Payout KE</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCashierTab('dp2p')}
                    className="p-3 rounded-xl border flex flex-col items-start gap-1.5 transition-all cursor-pointer bg-emerald-50/60 border-emerald-300 text-slate-900 hover:bg-emerald-100/70"
                  >
                    <Users className="w-4 h-4 text-emerald-700" />
                    <span className="font-bold text-xs text-slate-900">Deriv DP2P</span>
                    <span className="text-[10px] text-emerald-700 font-mono font-semibold">M-Pesa / B2B</span>
                  </button>
                </div>
              </div>

              {/* Withdrawal Form */}
              <form onSubmit={handleWithdrawSubmit} className="space-y-4">
                <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-700 font-bold">
                      {withdrawMethod === 'MPESA'
                        ? 'Recipient SafariCom M-Pesa Phone Number'
                        : withdrawMethod === 'CRYPTO_USDT'
                        ? 'Recipient USDT TRC20 Wallet Address'
                        : 'Recipient Account Details'}
                    </label>
                    {withdrawMethod === 'MPESA' && (
                      <span className="text-[10px] font-mono text-emerald-700 font-semibold">
                        MSISDN: {normalizeKenyanPhone(withdrawDestination).msisdn}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={withdrawDestination}
                      onChange={(e) => setWithdrawDestination(e.target.value)}
                      className="flex-1 min-w-[160px] px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-sm text-slate-900 font-semibold focus:outline-none focus:border-rose-500"
                    />
                    {withdrawMethod === 'MPESA' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setWithdrawDestination('0728424076')}
                          className={`px-2.5 py-2 rounded-xl border font-mono text-[11px] font-bold cursor-pointer whitespace-nowrap ${
                            normalizeKenyanPhone(withdrawDestination).local === '0728424076'
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800'
                          }`}
                        >
                          Recommended: 0728424076
                        </button>
                        <button
                          type="button"
                          onClick={() => setWithdrawDestination('0793950512')}
                          className={`px-2.5 py-2 rounded-xl border font-mono text-[11px] font-bold cursor-pointer whitespace-nowrap ${
                            normalizeKenyanPhone(withdrawDestination).local === '0793950512'
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800'
                          }`}
                        >
                          Use 0793950512
                        </button>
                        <button
                          type="button"
                          onClick={() => setWithdrawDestination('+254183974572')}
                          className={`px-2.5 py-2 rounded-xl border font-mono text-[11px] font-bold cursor-pointer whitespace-nowrap ${
                            normalizeKenyanPhone(withdrawDestination).local === '0183974572'
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800'
                          }`}
                        >
                          Till Line +254183974572
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Amount input */}
                <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                  <div className="flex items-center justify-between text-slate-600 mb-1.5">
                    <span className="font-bold text-slate-800">Withdrawal Amount (USD)</span>
                    <span className="text-emerald-700 font-mono font-bold tabular-nums">
                      {withdrawMethod === 'MPESA'
                        ? `≈ KES ${usdToKes(withdrawAmount).toLocaleString()} payout`
                        : 'Min: $10.00'}
                    </span>
                  </div>
                  <div className="relative mb-2">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-mono text-sm">$</span>
                    <input
                      type="number"
                      min={10}
                      max={withdrawableBalance}
                      step={5}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                      className="w-full pl-8 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-base text-slate-900 font-bold focus:outline-none focus:border-rose-500 tabular-nums"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-1 font-mono text-[11px]">
                    {[0.25, 0.5, 0.75, 1.0].map((pct) => {
                      const calculated = Math.max(10, Math.floor(withdrawableBalance * pct));
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setWithdrawAmount(calculated)}
                          className="py-1.5 rounded-lg border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer font-semibold"
                        >
                          {(pct * 100).toFixed(0)}% (${calculated})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Security Verification PIN */}
                <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-1.5 shadow-xs">
                  <div className="flex items-center gap-1.5 text-slate-800">
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    <span className="font-bold">Security Verification PIN</span>
                  </div>
                  <input
                    type="password"
                    maxLength={6}
                    value={securityPin}
                    onChange={(e) => setSecurityPin(e.target.value)}
                    placeholder="Enter 4-digit PIN"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono text-sm focus:outline-none focus:border-[#0b1930]"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    {`Zero commission Deriv Real withdrawal from ${realAccount.loginId} · Instant balance reflection`}
                  </span>
                </div>

                {/* Submit Withdrawal Button */}
                <button
                  type="submit"
                  disabled={isWithdrawLoading || withdrawAmount <= 0 || withdrawAmount > withdrawableBalance}
                  className="w-full py-3.5 active:scale-[0.98] text-white font-bold rounded-xl shadow-md font-mono text-sm transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 bg-rose-600 hover:bg-rose-500"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>
                    {isWithdrawLoading
                      ? 'SYNCING WITH DERIV REAL & M-PESA...'
                      : withdrawMethod === 'MPESA'
                      ? `WITHDRAW $${withdrawAmount.toFixed(2)} (KES ${usdToKes(withdrawAmount).toLocaleString()}) TO M-PESA ${normalizeKenyanPhone(withdrawDestination).local}`
                      : `WITHDRAW $${withdrawAmount.toFixed(2)} USD FROM DERIV REAL (${realAccount.loginId})`}
                  </span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: DERIV DP2P SAFARICOM M-PESA */}
          {cashierTab === 'dp2p' && <Dp2pMpesaPanel />}

          {/* TAB 4: D CASH APP */}
          {cashierTab === 'dcash' && <DCashPanel />}

          {/* TAB 5: VALTEX APP */}
          {cashierTab === 'valtex' && <ValtexPanel />}

          {/* TAB 6: PAYHERO KENYA APP */}
          {cashierTab === 'payhero' && <PayHeroPanel initialAction={payheroInitialAction} />}

          {/* TAB 7: KCB BANK APP DIRECT TRANSFER */}
          {cashierTab === 'kcb' && <KcbTransferPanel initialAction={kcbInitialAction} />}

          {/* TAB 5: TRANSACTION HISTORY */}
          {cashierTab === 'history' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 font-mono tabular-nums">
                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
                  <span className="text-slate-500 text-[10px] block">Total Deposited</span>
                  <span className="text-base font-bold text-emerald-600">
                    +${totalDeposited.toFixed(2)}
                  </span>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
                  <span className="text-slate-500 text-[10px] block">Total Withdrawn</span>
                  <span className="text-base font-bold text-rose-600">
                    -${totalWithdrawn.toFixed(2)}
                  </span>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
                  <span className="text-slate-500 text-[10px] block">Net Capital Flow</span>
                  <span className="text-base font-bold text-slate-900">
                    ${(totalDeposited - totalWithdrawn).toFixed(2)}
                  </span>
                </div>
              </div>

              <MpesaTransactionHistory mpesaOnlyDefault={false} />
            </div>
          )}

          {/* TAB 6: BACKEND DIAGNOSTIC LOGS */}
          {cashierTab === 'diagnostics' && <CashierDiagnosticLogs />}

          {/* TAB 7: DERIV OFFICIAL CASHIER PORTAL */}
          {cashierTab === 'deriv_portal' && (
            <div className="space-y-4 font-mono text-xs">
              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-xs">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <ShieldCheck className="w-4 h-4 text-[#2bbbad]" />
                  <span>Deriv Official Cashier Cloud Integration</span>
                </div>
                <p className="text-[11px] text-slate-600 font-sans leading-relaxed">
                  Connect directly with Deriv&apos;s centralized financial infrastructure for your real trading account.
                  You can fund your account, request automated withdrawals, or trade peer-to-peer with local payment agents.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <a
                    href="https://app.deriv.com/cashier/deposit"
                    target="_blank"
                    rel="noreferrer"
                    className="p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl flex items-center justify-between text-slate-900 transition-colors"
                  >
                    <div>
                      <span className="font-bold text-emerald-700 block">Deriv Official Deposit</span>
                      <span className="text-[10px] text-slate-500">app.deriv.com/cashier/deposit</span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                  </a>

                  <a
                    href="https://app.deriv.com/cashier/withdrawal"
                    target="_blank"
                    rel="noreferrer"
                    className="p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl flex items-center justify-between text-slate-900 transition-colors"
                  >
                    <div>
                      <span className="font-bold text-rose-700 block">Deriv Official Withdrawal</span>
                      <span className="text-[10px] text-slate-500">app.deriv.com/cashier/withdrawal</span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                  </a>

                  <a
                    href="https://app.deriv.com/cashier/payment-agent"
                    target="_blank"
                    rel="noreferrer"
                    className="p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl flex items-center justify-between text-slate-900 transition-colors"
                  >
                    <div>
                      <span className="font-bold text-amber-700 block">Payment Agents Gateway</span>
                      <span className="text-[10px] text-slate-500">Instant local cash deposits</span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                  </a>

                  <a
                    href="https://app.deriv.com/cashier/p2p"
                    target="_blank"
                    rel="noreferrer"
                    className="p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl flex items-center justify-between text-slate-900 transition-colors"
                  >
                    <div>
                      <span className="font-bold text-[#0b1930] block">Deriv DP2P Exchange</span>
                      <span className="text-[10px] text-slate-500">Zero-fee peer-to-peer transfers</span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                  </a>
                </div>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-[11px] shadow-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-slate-800 font-semibold">Deriv App ID: 1089</span>
                </div>
                <span className="text-slate-500">WebSocket Endpoint: ws.derivws.com</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>256-bit SSL Encrypted Deriv Cashier</span>
          </div>
          <button
            type="button"
            onClick={() => setIsCashierOpen(false)}
            className="px-3.5 py-1.5 bg-[#0b1930] hover:bg-slate-800 text-white font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close Cashier
          </button>
        </div>
      </div>
    </div>
  );
};
