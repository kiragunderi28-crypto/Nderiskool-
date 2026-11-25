import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import {
  ActivePosition,
  AutoTradeRule,
  BotLog,
  BotStrategy,
  Candle,
  CashierDiagnosticLog,
  CashierMethod,
  CashierTransaction,
  DerivAccount,
  DerivSubAccount,
  Direction,
  MarketSymbol,
  OrderType,
  PriceAlert,
  Tick,
  TradeRecord,
  TradeSignal,
  VerifiedP2pReceiver,
} from '../types/trading';
import { INITIAL_MARKETS } from '../data/markets';
import { derivWsService } from '../services/derivWs';
import { soundManager } from '../utils/audio';
import { calculateEMA, calculateRSI } from '../utils/indicators';
import {
  DEFAULT_SAFARICOM_PHONE,
  VERIFIED_P2P_RECEIVER_PHONE,
  detectKenyanCarrier,
  normalizeKenyanPhone,
  usdToKes,
} from '../utils/mpesa';

interface TradingContextType {
  markets: MarketSymbol[];
  activeSymbol: MarketSymbol;
  setActiveSymbol: (symbol: MarketSymbol) => void;
  candles: Candle[];
  timeframe: number; // in seconds (e.g. 60, 300, 900)
  setTimeframe: (seconds: number) => void;
  chartType: 'candle' | 'line';
  setChartType: (type: 'candle' | 'line') => void;
  indicators: {
    ema: boolean;
    bollinger: boolean;
    rsi: boolean;
    macd: boolean;
  };
  toggleIndicator: (key: 'ema' | 'bollinger' | 'rsi' | 'macd') => void;

  // Account
  account: DerivAccount;
  realAccount: DerivAccount;
  updateRealAccountId: (loginId: string) => void;
  connectDerivToken: (
    token: string,
    customAppId?: string
  ) => Promise<{
    success: boolean;
    message?: string;
    isLiveVerified?: boolean;
    scopes?: string[];
  }>;
  syncDerivRealBalance: () => Promise<{ ok: boolean; balance?: number; message: string }>;
  transferBetweenDerivAccounts: (params: {
    accountFrom: string;
    accountTo: string;
    amount: number;
    currency?: string;
  }) => Promise<{
    success: boolean;
    liveExecuted: boolean;
    message: string;
    tx?: CashierTransaction;
  }>;
  disconnectDerivToken: () => void;
  resetDemoBalance: () => void;
  switchAccountMode: (isReal: boolean) => void;

  // Trading
  activePositions: ActivePosition[];
  tradeHistory: TradeRecord[];
  recentDigits: number[];
  executeTrade: (params: {
    type: OrderType;
    direction: Direction;
    stake: number;
    multiplier?: number;
    durationSeconds?: number;
    durationTicks?: number;
    barrier?: number;
    barrierOffsetPips?: number;
    selectedDigit?: number;
    payoutMultiplier?: number;
    takeProfit?: number;
    stopLoss?: number;
    growthRate?: number;
    takeProfitProfit?: number;
    takeProfitTicks?: number;
  }) => void;
  closePosition: (positionId: string) => void;

  // Price Alerts
  priceAlerts: PriceAlert[];
  addPriceAlert: (targetPrice: number, condition: 'ABOVE' | 'BELOW') => void;
  removePriceAlert: (id: string) => void;
  activeToast: string | null;
  dismissToast: () => void;

  // Deriv DBot Automation
  botStrategy: BotStrategy;
  botLogs: BotLog[];
  executionSpeed: 'NORMAL' | 'FAST';
  toggleExecutionSpeed: () => void;
  startBot: () => void;
  stopBot: () => void;
  updateBotStrategy: (params: Partial<BotStrategy>) => void;
  clearBotLogs: () => void;

  // Automatic Trade & Signals
  isAutoTradeActive: boolean;
  toggleAutoTrade: () => void;
  autoTradeRules: AutoTradeRule[];
  addAutoTradeRule: (rule: Omit<AutoTradeRule, 'id' | 'tradesToday' | 'totalProfit'>) => void;
  toggleAutoTradeRule: (id: string) => void;
  deleteAutoTradeRule: (id: string) => void;
  tradeSignals: TradeSignal[];
  executeSignalTrade: (signal: TradeSignal) => void;

  // Audio & UI
  isMuted: boolean;
  toggleMute: () => void;
  activeView: 'dashboard' | 'terminal' | 'accumulators' | 'bot' | 'autotrade' | 'watchlist' | 'orders' | 'analytics' | 'calendar';
  setActiveView: (view: 'dashboard' | 'terminal' | 'accumulators' | 'bot' | 'autotrade' | 'watchlist' | 'orders' | 'analytics' | 'calendar') => void;
  isConnectModalOpen: boolean;
  setIsConnectModalOpen: (open: boolean) => void;
  isProfileModalOpen: boolean;
  setIsProfileModalOpen: (open: boolean) => void;

  // Cashier (Deposit & Withdrawal) & Connected Safaricom M-Pesa
  mpesaGatewayStatus: {
    loaded: boolean;
    environment: 'sandbox' | 'production';
    withdrawalConfirmationEnvironment?: 'sandbox' | 'production';
    withdrawalConfirmationBaseUrl?: string;
    baseUrl?: string;
    b2cEndpoint?: string;
    b2bEndpoint?: string;
    txStatusEndpoint?: string;
    shortcode?: string;
    storeNumber?: string;
    tillNumber?: string;
    stkPartyB?: string;
    b2cShortcode?: string;
    b2bShortcode?: string;
    stkTransactionType?: string;
    stkConfigured: boolean;
    b2cConfigured: boolean;
    b2bConfigured: boolean;
    liveWithdrawalReady?: boolean;
    smsDeliveryStatus?: 'LIVE_SMS_ACTIVE' | 'SANDBOX_NO_SMS' | 'AWAITING_B2C_SECRETS';
    smsDeliveryReason?: string;
    darajaConfigured: boolean;
    oauthVerified?: boolean;
    oauthCheckedAt?: number;
    oauthError?: string;
    warnings?: string[];
    accountBalanceSnapshot?: {
      updatedAt: number;
      conversationId?: string;
      rawBalanceString?: string;
      accounts?: Array<{ name: string; currency: string; available: string; uncleared?: string }>;
      resultDesc?: string;
    } | null;
    b2cCommandId?: string;
    b2bCommandId?: string;
    missingB2cVars?: string[];
    missingB2bVars?: string[];
    callbackUrls?: {
      stkCallbackUrl: string;
      b2cResultUrl: string;
      b2cTimeoutUrl: string;
      b2bResultUrl?: string;
      b2bTimeoutUrl?: string;
      c2bValidationUrl?: string;
      c2bConfirmationUrl?: string;
      balanceResultUrl?: string;
      txStatusResultUrl?: string;
    };
  };
  refreshMpesaGatewayStatus: (probe?: boolean) => Promise<void>;
  verifyDarajaOAuth: () => Promise<{ ok: boolean; message: string }>;
  safaricomPhone: string;
  safaricomMsisdn: string;
  safaricomFormatted: string;
  updateSafaricomPhone: (phone: string) => void;
  verifiedP2pReceivers: VerifiedP2pReceiver[];
  activeP2pReceiverPhone: string;
  setActiveP2pReceiverPhone: (phone: string) => void;
  verifyP2pReceiver: (params: { phone: string; receiverName?: string }) => Promise<{
    success: boolean;
    message: string;
    receiver?: VerifiedP2pReceiver;
  }>;
  removeVerifiedP2pReceiver: (phone: string) => void;
  cashierTransactions: CashierTransaction[];
  depositFunds: (params: {
    amount: number;
    method: CashierMethod;
    methodName: string;
    sourceDetails?: string;
    targetAccount?: 'CURRENT' | 'REAL';
    note?: string;
  }) => Promise<{
    success: boolean;
    message: string;
    tx?: CashierTransaction;
    cashierUrl?: string;
    pendingConfirmation?: boolean;
    gatewayUnconfigured?: boolean;
  }>;
  withdrawFunds: (params: {
    amount: number;
    method: CashierMethod;
    methodName: string;
    destinationDetails: string;
    withdrawalDirection?: 'FROM_REAL' | 'TO_REAL';
    note?: string;
  }) => Promise<{
    success: boolean;
    message: string;
    tx?: CashierTransaction;
    cashierUrl?: string;
    newRealBalance?: number;
    pendingConfirmation?: boolean;
    gatewayUnconfigured?: boolean;
  }>;
  confirmMpesaTransaction: (txId: string, mpesaReceiptCode: string) => { success: boolean; message: string };
  syncMpesaBalance: () => Promise<{
    ok: boolean;
    confirmedCount: number;
    pendingCount: number;
    rejectedCount: number;
    creditedUsd: number;
    message: string;
  }>;
  cancelPendingWithdrawal: (txId: string) => void;
  createDp2pMpesaOrder: (params: {
    direction: 'DEPOSIT' | 'WITHDRAWAL';
    usdAmount: number;
    kesAmount: number;
    rate: number;
    phone: string;
    agentName: string;
    agentId: string;
    isLiveAdvert?: boolean;
    targetAccount?: 'CURRENT' | 'REAL';
  }) => Promise<{
    success: boolean;
    message: string;
    tx?: CashierTransaction;
    cashierUrl?: string;
    pendingConfirmation?: boolean;
    liveOrderCreated?: boolean;
  }>;
  createDCashTransaction: (params: {
    direction: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
    usdAmount: number;
    kesAmount: number;
    phone: string;
    dcashTag?: string;
    agentLoginId: string;
    agentName: string;
    verificationCode?: string;
    targetAccount?: 'CURRENT' | 'REAL';
    fundingSource?: 'STANDALONE_GATEWAY' | 'DERIV_REAL';
  }) => Promise<{
    success: boolean;
    message: string;
    tx?: CashierTransaction;
    cashierUrl?: string;
    pendingConfirmation?: boolean;
    liveExecuted?: boolean;
  }>;
  createValtexTransaction: (params: {
    direction: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
    usdAmount: number;
    kesAmount: number;
    phone: string;
    valtexAccountId?: string;
    targetAccount?: 'CURRENT' | 'REAL';
    fundingSource?: 'STANDALONE_GATEWAY' | 'DERIV_REAL';
  }) => Promise<{
    success: boolean;
    message: string;
    tx?: CashierTransaction;
    pendingConfirmation?: boolean;
    confirmed?: boolean;
    callbackUrl?: string;
  }>;
  verifyValtexTransactionStatus: (referenceOrId: string) => Promise<{
    ok: boolean;
    status?: string;
    message: string;
  }>;
  createPayHeroTransaction: (params: {
    action: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
    usdAmount: number;
    kesAmount: number;
    phone?: string;
    transferRail?: 'mobile' | 'paybill' | 'till' | 'bank';
    accountNumber?: string;
    accountName?: string;
    accountReference?: string;
    bankCode?: string;
    networkCode?: string;
    targetAccount?: 'CURRENT' | 'REAL';
    fundingSource?: 'STANDALONE_GATEWAY' | 'DERIV_REAL';
  }) => Promise<{
    success: boolean;
    message: string;
    tx?: CashierTransaction;
    pendingConfirmation?: boolean;
    confirmed?: boolean;
    callbackUrl?: string;
  }>;
  verifyPayHeroTransactionStatus: (referenceOrId: string) => Promise<{
    ok: boolean;
    status?: string;
    message: string;
  }>;
  createKcbDirectTransfer: (params: {
    action?: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
    kcbRail: 'kcb_account' | 'paybill_522522' | 'kcb_vooma' | 'pesalink';
    usdAmount: number;
    kesAmount: number;
    accountNumber?: string;
    accountName?: string;
    phone?: string;
    narration?: string;
    dispatchVia?: 'auto' | 'buni' | 'daraja_b2b' | 'daraja_stk' | 'payhero_bank' | 'bridge';
    fundingSource?: 'STANDALONE_GATEWAY' | 'DERIV_REAL';
    targetAccount?: 'CURRENT' | 'REAL';
  }) => Promise<{
    success: boolean;
    message: string;
    tx?: CashierTransaction;
    pendingConfirmation?: boolean;
    confirmed?: boolean;
    callbackUrl?: string;
  }>;
  verifyKcbTransferStatus: (referenceOrId: string) => Promise<{
    ok: boolean;
    status?: string;
    message: string;
  }>;
  p2pAutoRefreshEnabled: boolean;
  setP2pAutoRefreshEnabled: (enabled: boolean) => void;
  p2pLastRefreshedAt: number | null;
  isRefreshingP2p: boolean;
  refreshP2pTransactions: (silent?: boolean) => Promise<{
    updatedCount: number;
    confirmedCount: number;
    checkedAt: number;
  }>;
  autoConfirmWithdrawals: boolean;
  setAutoConfirmWithdrawals: (enabled: boolean) => void;
  clientDiagnosticLogs: CashierDiagnosticLog[];
  appendClientDiagnosticLog: (
    entry: Omit<CashierDiagnosticLog, 'id' | 'timestamp'>
  ) => void;
  clearClientDiagnosticLogs: () => void;
  isCashierOpen: boolean;
  setIsCashierOpen: (open: boolean) => void;
  cashierTab:
    | 'deposit'
    | 'deriv_transfer'
    | 'withdrawal'
    | 'dp2p'
    | 'dcash'
    | 'valtex'
    | 'payhero'
    | 'kcb'
    | 'history'
    | 'diagnostics'
    | 'deriv_portal';
  setCashierTab: (
    tab:
      | 'deposit'
      | 'deriv_transfer'
      | 'withdrawal'
      | 'dp2p'
      | 'dcash'
      | 'valtex'
      | 'payhero'
      | 'kcb'
      | 'history'
      | 'diagnostics'
      | 'deriv_portal'
  ) => void;
  openCashier: (
    tab?:
      | 'deposit'
      | 'deriv_transfer'
      | 'withdrawal'
      | 'dp2p'
      | 'dcash'
      | 'valtex'
      | 'payhero'
      | 'kcb'
      | 'history'
      | 'diagnostics'
      | 'deriv_portal'
  ) => void;

  // Live status
  isWsConnected: boolean;
  lastTick: Tick | null;
}

const TradingContext = createContext<TradingContextType | undefined>(undefined);

const DEMO_ACCOUNT_INITIAL: DerivAccount = {
  isReal: false,
  loginId: 'VRTC-NDERISKOOL',
  fullname: 'nderiskool',
  email: 'nderiskool@deriv.trader',
  currency: 'USD',
  balance: 10000.0,
  connected: true,
};

const REAL_ACCOUNT_INITIAL: DerivAccount = {
  isReal: true,
  loginId: 'CR-NDERISKOOL',
  fullname: 'nderiskool',
  email: 'kiragunderi28@gmail.com',
  currency: 'USD',
  balance: 5450.0,
  connected: true,
};

export const TradingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [markets, setMarkets] = useState<MarketSymbol[]>(INITIAL_MARKETS);
  const [activeSymbol, setActiveSymbolState] = useState<MarketSymbol>(INITIAL_MARKETS[0]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [timeframe, setTimeframe] = useState<number>(60);
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');
  const [indicators, setIndicators] = useState({
    ema: true,
    bollinger: false,
    rsi: false,
    macd: false,
  });

  const [realAccount, setRealAccount] = useState<DerivAccount>(() => {
    try {
      const savedReal = localStorage.getItem('nderiskool_deriv_real_acc');
      if (savedReal) return JSON.parse(savedReal);
      const savedAcc = localStorage.getItem('nderiskool_deriv_acc');
      if (savedAcc) {
        const parsed = JSON.parse(savedAcc);
        if (parsed.isReal) return parsed;
      }
    } catch {}
    return REAL_ACCOUNT_INITIAL;
  });

  const [account, setAccount] = useState<DerivAccount>(() => {
    try {
      const saved = localStorage.getItem('nderiskool_deriv_acc');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEMO_ACCOUNT_INITIAL;
  });

  const [activePositions, setActivePositions] = useState<ActivePosition[]>(() => {
    try {
      const saved = localStorage.getItem('nderiskool_positions');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>(() => {
    try {
      const saved = localStorage.getItem('nderiskool_history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'init-1',
        symbol: 'frxEURUSD',
        symbolName: 'EUR/USD',
        type: 'MULTIPLIER',
        direction: 'BUY',
        stake: 100,
        multiplier: 50,
        entryPrice: 1.0821,
        exitPrice: 1.0854,
        entryEpoch: Math.floor(Date.now() / 1000) - 7200,
        exitEpoch: Math.floor(Date.now() / 1000) - 3600,
        pnl: 152.45,
        pnlPercentage: 152.45,
        status: 'WON',
      },
      {
        id: 'init-2',
        symbol: 'frxGBPUSD',
        symbolName: 'GBP/USD',
        type: 'RISE_FALL',
        direction: 'BUY',
        stake: 50,
        multiplier: 1,
        entryPrice: 1.2960,
        exitPrice: 1.2975,
        entryEpoch: Math.floor(Date.now() / 1000) - 14400,
        exitEpoch: Math.floor(Date.now() / 1000) - 14100,
        pnl: 47.50,
        pnlPercentage: 95.0,
        status: 'WON',
      },
    ];
  });

  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [executionSpeed, setExecutionSpeed] = useState<'NORMAL' | 'FAST'>('FAST');
  const [activeView, setActiveView] = useState<'dashboard' | 'terminal' | 'accumulators' | 'bot' | 'autotrade' | 'watchlist' | 'orders' | 'analytics' | 'calendar'>('dashboard');
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [lastTick, setLastTick] = useState<Tick | null>(null);
  const [recentDigits, setRecentDigits] = useState<number[]>([7, 3, 9, 2, 8, 4, 1, 6, 5, 0]);

  // Connected Safaricom M-Pesa Number (persisted, defaults to 0793950512)
  const [safaricomPhone, setSafaricomPhone] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('nderiskool_safaricom_phone');
      if (saved && normalizeKenyanPhone(saved).valid) {
        return normalizeKenyanPhone(saved).local;
      }
    } catch {}
    return DEFAULT_SAFARICOM_PHONE;
  });

  const normalizedSafaricom = normalizeKenyanPhone(safaricomPhone);
  const safaricomMsisdn = normalizedSafaricom.msisdn;
  const safaricomFormatted = normalizedSafaricom.formatted;

  useEffect(() => {
    try {
      localStorage.setItem('nderiskool_safaricom_phone', safaricomPhone);
    } catch {}
  }, [safaricomPhone]);

  const updateSafaricomPhone = useCallback((phone: string) => {
    const parsed = normalizeKenyanPhone(phone);
    setSafaricomPhone(parsed.valid ? parsed.local : phone.trim() || DEFAULT_SAFARICOM_PHONE);
  }, []);

  // Verified P2P Withdrawal Receivers (pre-verified 0728424076 from AI Studio account + 0793950512)
  const buildDefaultVerifiedReceivers = (): VerifiedP2pReceiver[] => {
    const primaryNorm = normalizeKenyanPhone(VERIFIED_P2P_RECEIVER_PHONE);
    const secondaryNorm = normalizeKenyanPhone(DEFAULT_SAFARICOM_PHONE);
    return [
      {
        phone: primaryNorm.local,
        msisdn: primaryNorm.msisdn,
        formatted: primaryNorm.formatted,
        carrier: detectKenyanCarrier(primaryNorm.local),
        label: 'Verified Withdrawal Receiver (AI Studio Account)',
        sourceAccountId: realAccount.loginId,
        verifiedAt: Date.now(),
        status: 'VERIFIED',
        b2cLiveReady: false,
      },
      {
        phone: secondaryNorm.local,
        msisdn: secondaryNorm.msisdn,
        formatted: secondaryNorm.formatted,
        carrier: detectKenyanCarrier(secondaryNorm.local),
        label: 'Primary Safaricom M-Pesa Wallet',
        sourceAccountId: realAccount.loginId,
        verifiedAt: Date.now(),
        status: 'VERIFIED',
        b2cLiveReady: false,
      },
    ];
  };

  const [verifiedP2pReceivers, setVerifiedP2pReceivers] = useState<VerifiedP2pReceiver[]>(() => {
    try {
      const saved = localStorage.getItem('nderiskool_verified_p2p_receivers');
      if (saved) {
        const parsed = JSON.parse(saved) as VerifiedP2pReceiver[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const has0728 = parsed.some((r) => r.phone === VERIFIED_P2P_RECEIVER_PHONE);
          if (!has0728) {
            return [buildDefaultVerifiedReceivers()[0], ...parsed];
          }
          return parsed;
        }
      }
    } catch {}
    return buildDefaultVerifiedReceivers();
  });

  const [activeP2pReceiverPhone, setActiveP2pReceiverPhoneState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('nderiskool_active_p2p_receiver');
      if (saved && normalizeKenyanPhone(saved).valid) {
        return normalizeKenyanPhone(saved).local;
      }
    } catch {}
    return VERIFIED_P2P_RECEIVER_PHONE;
  });

  useEffect(() => {
    try {
      localStorage.setItem('nderiskool_verified_p2p_receivers', JSON.stringify(verifiedP2pReceivers));
    } catch {}
  }, [verifiedP2pReceivers]);

  useEffect(() => {
    try {
      localStorage.setItem('nderiskool_active_p2p_receiver', activeP2pReceiverPhone);
    } catch {}
  }, [activeP2pReceiverPhone]);

  const setActiveP2pReceiverPhone = useCallback((phone: string) => {
    const parsed = normalizeKenyanPhone(phone);
    if (parsed.valid) {
      setActiveP2pReceiverPhoneState(parsed.local);
    }
  }, []);

  // M-Pesa Daraja Gateway Status
  const [mpesaGatewayStatus, setMpesaGatewayStatus] = useState<{
    loaded: boolean;
    environment: 'sandbox' | 'production';
    withdrawalConfirmationEnvironment?: 'sandbox' | 'production';
    withdrawalConfirmationBaseUrl?: string;
    baseUrl?: string;
    b2cEndpoint?: string;
    b2bEndpoint?: string;
    txStatusEndpoint?: string;
    shortcode?: string;
    storeNumber?: string;
    tillNumber?: string;
    stkPartyB?: string;
    b2cShortcode?: string;
    b2bShortcode?: string;
    stkTransactionType?: string;
    stkConfigured: boolean;
    b2cConfigured: boolean;
    b2bConfigured: boolean;
    liveWithdrawalReady?: boolean;
    smsDeliveryStatus?: 'LIVE_SMS_ACTIVE' | 'SANDBOX_NO_SMS' | 'AWAITING_B2C_SECRETS';
    smsDeliveryReason?: string;
    darajaConfigured: boolean;
    oauthVerified?: boolean;
    oauthCheckedAt?: number;
    oauthError?: string;
    warnings?: string[];
    accountBalanceSnapshot?: {
      updatedAt: number;
      conversationId?: string;
      rawBalanceString?: string;
      accounts?: Array<{ name: string; currency: string; available: string; uncleared?: string }>;
      resultDesc?: string;
    } | null;
    b2cCommandId?: string;
    b2bCommandId?: string;
    missingB2cVars?: string[];
    missingB2bVars?: string[];
    callbackUrls?: {
      stkCallbackUrl: string;
      b2cResultUrl: string;
      b2cTimeoutUrl: string;
      b2bResultUrl?: string;
      b2bTimeoutUrl?: string;
      c2bValidationUrl?: string;
      c2bConfirmationUrl?: string;
      balanceResultUrl?: string;
      txStatusResultUrl?: string;
    };
  }>({
    loaded: false,
    environment: 'production',
    withdrawalConfirmationEnvironment: 'production',
    withdrawalConfirmationBaseUrl: 'https://api.safaricom.co.ke',
    txStatusEndpoint: 'https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query',
    stkConfigured: false,
    b2cConfigured: false,
    b2bConfigured: false,
    liveWithdrawalReady: false,
    smsDeliveryStatus: 'AWAITING_B2C_SECRETS',
    darajaConfigured: false,
    oauthVerified: false,
    warnings: [],
    missingB2cVars: [],
    missingB2bVars: [],
  });

  const refreshMpesaGatewayStatus = useCallback(async (probe = false) => {
    try {
      const res = await fetch(probe ? '/api/mpesa/status?probe=1' : '/api/mpesa/status');
      if (res.ok) {
        const data = await res.json();
        setMpesaGatewayStatus({
          loaded: true,
          environment: data.environment === 'sandbox' ? 'sandbox' : 'production',
          withdrawalConfirmationEnvironment:
            data.withdrawalConfirmationEnvironment === 'sandbox' ? 'sandbox' : 'production',
          withdrawalConfirmationBaseUrl:
            data.withdrawalConfirmationBaseUrl || 'https://api.safaricom.co.ke',
          baseUrl: data.baseUrl || 'https://api.safaricom.co.ke',
          b2cEndpoint:
            data.b2cEndpoint || 'https://api.safaricom.co.ke/mpesa/b2c/v3/paymentrequest',
          b2bEndpoint:
            data.b2bEndpoint || 'https://api.safaricom.co.ke/mpesa/b2b/v1/paymentrequest',
          txStatusEndpoint:
            data.txStatusEndpoint || 'https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query',
          shortcode: data.shortcode,
          storeNumber: data.storeNumber,
          tillNumber: data.tillNumber,
          stkPartyB: data.stkPartyB,
          b2cShortcode: data.b2cShortcode,
          b2bShortcode: data.b2bShortcode,
          stkTransactionType: data.stkTransactionType,
          stkConfigured: Boolean(data.stkConfigured),
          b2cConfigured: Boolean(data.b2cConfigured),
          b2bConfigured: Boolean(data.b2bConfigured),
          liveWithdrawalReady: Boolean(data.liveWithdrawalReady),
          smsDeliveryStatus: data.smsDeliveryStatus,
          smsDeliveryReason: data.smsDeliveryReason,
          darajaConfigured: Boolean(data.darajaConfigured),
          oauthVerified: Boolean(data.oauthVerified),
          oauthCheckedAt: data.oauthCheckedAt,
          oauthError: data.oauthError,
          warnings: Array.isArray(data.warnings) ? data.warnings : [],
          accountBalanceSnapshot: data.accountBalanceSnapshot ?? null,
          b2cCommandId: data.b2cCommandId,
          b2bCommandId: data.b2bCommandId,
          missingB2cVars: Array.isArray(data.missingB2cVars) ? data.missingB2cVars : [],
          missingB2bVars: Array.isArray(data.missingB2bVars) ? data.missingB2bVars : [],
          callbackUrls: data.callbackUrls,
        });
        return;
      }
    } catch {
      // Backend unavailable
    }
    setMpesaGatewayStatus((prev) => ({ ...prev, loaded: true }));
  }, []);

  const verifyDarajaOAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/mpesa/verify-oauth', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      await refreshMpesaGatewayStatus(false);
      return {
        ok: Boolean(data.ok),
        message: String(data.message || data.error || 'Checked Safaricom Daraja OAuth connectivity.'),
      };
    } catch {
      return {
        ok: false,
        message: 'Unable to reach /api/mpesa/verify-oauth.',
      };
    }
  }, [refreshMpesaGatewayStatus]);

  useEffect(() => {
    refreshMpesaGatewayStatus();
  }, [refreshMpesaGatewayStatus]);

  const verifyP2pReceiver = useCallback(
    async (params: { phone: string; receiverName?: string }) => {
      const parsed = normalizeKenyanPhone(params.phone);
      if (!parsed.valid) {
        return {
          success: false,
          message: 'Enter a valid Kenyan M-Pesa phone number (e.g. 0728424076 or +254728424076).',
        };
      }

      const fallbackRecord: VerifiedP2pReceiver = {
        phone: parsed.local,
        msisdn: parsed.msisdn,
        formatted: parsed.formatted,
        carrier: detectKenyanCarrier(parsed.local),
        label: params.receiverName?.trim() || 'Verified Withdrawal Receiver (AI Studio Account)',
        sourceAccountId: realAccount.loginId,
        verifiedAt: Date.now(),
        status: 'VERIFIED',
        b2cLiveReady: mpesaGatewayStatus.b2cConfigured,
      };

      try {
        const res = await fetch('/api/p2p/verify-receiver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: parsed.local,
            receiverName: params.receiverName?.trim() || undefined,
            loginId: realAccount.loginId,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok || !data?.receiver) {
          return {
            success: false,
            message: data?.error || 'Could not verify P2P receiver number.',
          };
        }

        const verifiedRecord = data.receiver as VerifiedP2pReceiver;
        setVerifiedP2pReceivers((prev) => [
          verifiedRecord,
          ...prev.filter((r) => r.phone !== verifiedRecord.phone),
        ]);
        setActiveP2pReceiverPhoneState(verifiedRecord.phone);
        soundManager.playWinSound();
        setActiveToast(
          `P2P RECEIVER VERIFIED: ${verifiedRecord.phone} (${verifiedRecord.carrier}) for ${realAccount.loginId} withdrawals`
        );

        return {
          success: true,
          receiver: verifiedRecord,
          message:
            data.settlementNote ||
            `Verified ${verifiedRecord.phone} (${verifiedRecord.carrier}) as P2P withdrawal receiver.`,
        };
      } catch {
        setVerifiedP2pReceivers((prev) => [
          fallbackRecord,
          ...prev.filter((r) => r.phone !== fallbackRecord.phone),
        ]);
        setActiveP2pReceiverPhoneState(fallbackRecord.phone);
        soundManager.playWinSound();
        setActiveToast(
          `P2P RECEIVER VERIFIED: ${fallbackRecord.phone} (${fallbackRecord.carrier})`
        );
        return {
          success: true,
          receiver: fallbackRecord,
          message: `P2P receiver ${fallbackRecord.phone} (${fallbackRecord.carrier}) verified on MSISDN ${fallbackRecord.msisdn} for withdrawal funds from ${realAccount.loginId}.`,
        };
      }
    },
    [mpesaGatewayStatus.b2cConfigured, realAccount.loginId]
  );

  const removeVerifiedP2pReceiver = useCallback((phone: string) => {
    setVerifiedP2pReceivers((prev) => prev.filter((r) => r.phone !== phone));
  }, []);

  // Cashier State (Deposits, Withdrawals, History, Diagnostics)
  const [clientDiagnosticLogs, setClientDiagnosticLogs] = useState<CashierDiagnosticLog[]>([]);

  const appendClientDiagnosticLog = useCallback(
    (entry: Omit<CashierDiagnosticLog, 'id' | 'timestamp'>) => {
      setClientDiagnosticLogs((prev) => [
        {
          id: `cdiag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          ...entry,
        },
        ...prev.slice(0, 49),
      ]);
    },
    []
  );

  const clearClientDiagnosticLogs = useCallback(() => {
    setClientDiagnosticLogs([]);
  }, []);

  const [isCashierOpen, setIsCashierOpen] = useState<boolean>(() => {
    try {
      const cashier = new URLSearchParams(window.location.search).get('cashier')?.toLowerCase();
      return Boolean(
        cashier &&
          [
            'deposit',
            'mpesa_deposit',
            'deriv_transfer',
            'withdrawal',
            'dp2p',
            'dcash',
            'valtex',
            'payhero',
            'kcb',
            'transfer',
            'money_transfer',
            'history',
            'diagnostics',
            'deriv_portal',
          ].includes(cashier)
      );
    } catch {
      return false;
    }
  });
  const [cashierTab, setCashierTab] = useState<
    | 'deposit'
    | 'deriv_transfer'
    | 'withdrawal'
    | 'dp2p'
    | 'dcash'
    | 'valtex'
    | 'payhero'
    | 'kcb'
    | 'history'
    | 'diagnostics'
    | 'deriv_portal'
  >(() => {
    try {
      const cashier = new URLSearchParams(window.location.search).get('cashier')?.toLowerCase();
      if (cashier === 'mpesa_deposit') return 'deposit';
      if (cashier === 'transfer' || cashier === 'money_transfer') return 'payhero';
      if (
        cashier &&
        [
          'deposit',
          'deriv_transfer',
          'withdrawal',
          'dp2p',
          'dcash',
          'valtex',
          'payhero',
          'kcb',
          'history',
          'diagnostics',
          'deriv_portal',
        ].includes(cashier)
      ) {
        return cashier as
          | 'deposit'
          | 'deriv_transfer'
          | 'withdrawal'
          | 'dp2p'
          | 'dcash'
          | 'valtex'
          | 'payhero'
          | 'kcb'
          | 'history'
          | 'diagnostics'
          | 'deriv_portal';
      }
    } catch {}
    return 'deposit';
  });
  const [cashierTransactions, setCashierTransactions] = useState<CashierTransaction[]>(() => {
    try {
      const saved = localStorage.getItem('nderiskool_cashier_txs');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'tx-dep-1',
        type: 'DEPOSIT',
        amount: 10000.0,
        currency: 'USD',
        method: 'DEMO_VIRTUAL',
        methodName: 'Demo Virtual Starting Capital',
        accountMode: 'DEMO',
        destinationOrSource: 'Deriv Virtual Gateway',
        reference: 'DRV-DEP-99412',
        timestamp: Date.now() - 86400000 * 3,
        status: 'COMPLETED',
        note: 'Initial nderiskool virtual trading balance',
      },
    ];
  });

  const [autoConfirmWithdrawals, setAutoConfirmWithdrawals] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('nderiskool_auto_confirm_withdrawals');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  useEffect(() => {
    try {
      localStorage.setItem('nderiskool_auto_confirm_withdrawals', String(autoConfirmWithdrawals));
    } catch {}
  }, [autoConfirmWithdrawals]);

  const [p2pAutoRefreshEnabled, setP2pAutoRefreshEnabled] = useState<boolean>(true);
  const [p2pLastRefreshedAt, setP2pLastRefreshedAt] = useState<number | null>(null);
  const [isRefreshingP2p, setIsRefreshingP2p] = useState<boolean>(false);
  const cashierTransactionsRef = useRef<CashierTransaction[]>(cashierTransactions);
  const settledP2pTxIdsRef = useRef<Set<string>>(new Set());
  const accountIsRealRef = useRef<boolean>(account.isReal);
  const realLoginIdRef = useRef<string>(realAccount.loginId);

  useEffect(() => {
    accountIsRealRef.current = account.isReal;
  }, [account.isReal]);

  useEffect(() => {
    realLoginIdRef.current = realAccount.loginId;
  }, [realAccount.loginId]);

  useEffect(() => {
    cashierTransactionsRef.current = cashierTransactions;
    try {
      localStorage.setItem('nderiskool_cashier_txs', JSON.stringify(cashierTransactions));
    } catch {}
  }, [cashierTransactions]);

  const openCashier = useCallback(
    (
      tab:
        | 'deposit'
        | 'deriv_transfer'
        | 'withdrawal'
        | 'dp2p'
        | 'dcash'
        | 'valtex'
        | 'payhero'
        | 'kcb'
        | 'history'
        | 'diagnostics'
        | 'deriv_portal' = 'deposit'
    ) => {
      setCashierTab(tab);
      setIsCashierOpen(true);
      refreshMpesaGatewayStatus();
    },
    [refreshMpesaGatewayStatus]
  );

  const applyDarajaTxSettlement = useCallback(
    (
      localTxId: string,
      remoteId: string,
      txRecord: {
        id?: string;
        type?: string;
        status?: string;
        callbackVerified?: boolean;
        verificationSource?: string;
        mpesaReceipt?: string;
        resultDesc?: string;
        environment?: 'sandbox' | 'production';
        safaricomConfirmationText?: string;
        receiverPublicName?: string;
        completedAtText?: string;
      },
      kind: 'DEPOSIT' | 'WITHDRAWAL',
      amountUsd: number,
      creditReal: boolean
    ) => {
      if (txRecord.status !== 'COMPLETED' && txRecord.status !== 'REJECTED') {
        return false;
      }
      if (txRecord.status === 'COMPLETED' && txRecord.callbackVerified === false) {
        return false;
      }
      if (settledP2pTxIdsRef.current.has(localTxId)) {
        return true;
      }
      settledP2pTxIdsRef.current.add(localTxId);

      const existingLocalTx = cashierTransactionsRef.current.find((t) => t.id === localTxId);
      const isValtex = existingLocalTx?.method === 'VALTEX' || String(txRecord.type || '').startsWith('VALTEX_');
      const isPayHero = existingLocalTx?.method === 'PAYHERO' || String(txRecord.type || '').startsWith('PAYHERO_');
      const isKcb = existingLocalTx?.method === 'KCB_BANK' || String(txRecord.type || '').startsWith('KCB_');
      const isStandalone = Boolean(
        existingLocalTx?.standaloneTransfer || existingLocalTx?.fundingSource === 'STANDALONE_GATEWAY'
      );
      const providerLabel = isKcb ? 'KCB IBANK' : isPayHero ? 'PAYHERO' : isValtex ? 'VALTEX' : 'SAFARICOM M-PESA';
      const deferredBalanceDeduction =
        existingLocalTx?.gatewayStatus === 'DERIV_CASHIER_REQUIRED' ||
        existingLocalTx?.gatewayStatus === 'GATEWAY_UNCONFIGURED';

      if (txRecord.status === 'COMPLETED') {
        const receipt = txRecord.mpesaReceipt || remoteId;
        const liveText =
          txRecord.safaricomConfirmationText ||
          txRecord.resultDesc ||
          (isKcb
            ? `KCB iBank Confirmed (${receipt}).`
            : isPayHero
            ? `PayHero Confirmed (${receipt}).`
            : isValtex
            ? `Valtex Confirmed (${receipt}).`
            : `${receipt} Confirmed by Safaricom M-Pesa.`);
        setCashierTransactions((prev) =>
          prev.map((item) =>
            item.id === localTxId
              ? {
                  ...item,
                  status: 'COMPLETED',
                  reference: receipt,
                  mpesaReceipt: receipt,
                  callbackVerified: true,
                  verificationSource: txRecord.verificationSource || item.verificationSource,
                  gatewayStatus: isKcb
                    ? 'KCB_CONFIRMED'
                    : isPayHero
                    ? 'PAYHERO_CONFIRMED'
                    : isValtex
                    ? 'VALTEX_CONFIRMED'
                    : 'DARAJA_CONFIRMED',
                  gatewayEnvironment: txRecord.environment || item.gatewayEnvironment,
                  safaricomConfirmationText: txRecord.safaricomConfirmationText,
                  receiverPublicName: txRecord.receiverPublicName,
                  completedAtText: txRecord.completedAtText,
                  note: liveText,
                }
              : item
          )
        );
        if (kind === 'DEPOSIT' && !isStandalone) {
          if (creditReal) {
            setRealAccount((prev) => ({
              ...prev,
              balance: Number((prev.balance + amountUsd).toFixed(2)),
            }));
          }
          if ((creditReal && accountIsRealRef.current) || (!creditReal && !accountIsRealRef.current)) {
            setAccount((prev) => ({
              ...prev,
              balance: Number((prev.balance + amountUsd).toFixed(2)),
            }));
          }
          soundManager.playWinSound();
          setActiveToast(`${providerLabel} DEPOSIT CONFIRMED: +$${amountUsd.toFixed(2)} USD · ${liveText}`);
        } else if (kind === 'DEPOSIT' && isStandalone) {
          soundManager.playWinSound();
          setActiveToast(`${providerLabel} DEPOSIT CONFIRMED: $${amountUsd.toFixed(2)} USD · ${liveText}`);
        } else {
          if (deferredBalanceDeduction && !isStandalone) {
            setRealAccount((prev) => ({
              ...prev,
              balance: Number(Math.max(0, prev.balance - amountUsd).toFixed(2)),
            }));
            if (accountIsRealRef.current) {
              setAccount((prev) => ({
                ...prev,
                balance: Number(Math.max(0, prev.balance - amountUsd).toFixed(2)),
              }));
            }
          }
          soundManager.playCashOutSound();
          const outboundVerb = isKcb
            ? existingLocalTx?.kcbAction === 'WITHDRAWAL'
              ? 'WITHDRAWAL'
              : 'TRANSFER'
            : isStandalone || existingLocalTx?.payheroAction === 'TRANSFER'
            ? 'TRANSFER'
            : 'WITHDRAWAL';
          setActiveToast(
            `${isKcb ? 'KCB IBANK' : isPayHero ? 'PAYHERO' : isValtex ? 'VALTEX' : 'SAFARICOM'} ${outboundVerb} CONFIRMED: $${amountUsd.toFixed(2)} USD · ${liveText}`
          );
        }
        return true;
      }

      setCashierTransactions((prev) =>
        prev.map((item) =>
          item.id === localTxId
            ? {
                ...item,
                status: 'REJECTED',
                callbackVerified: txRecord.callbackVerified,
                verificationSource: txRecord.verificationSource || item.verificationSource,
                note:
                  txRecord.resultDesc ||
                  `Rejected by ${isKcb ? 'KCB Bank' : isPayHero ? 'PayHero' : isValtex ? 'Valtex' : 'Safaricom M-Pesa'}`,
              }
            : item
        )
      );
      if (kind === 'WITHDRAWAL' && !deferredBalanceDeduction && !isStandalone) {
        setRealAccount((prev) => ({
          ...prev,
          balance: Number((prev.balance + amountUsd).toFixed(2)),
        }));
        if (accountIsRealRef.current) {
          setAccount((prev) => ({
            ...prev,
            balance: Number((prev.balance + amountUsd).toFixed(2)),
          }));
        }
      }
      soundManager.playLossSound();
      setActiveToast(
        `${isKcb ? 'KCB App' : isPayHero ? 'PayHero' : isValtex ? 'Valtex' : 'M-Pesa'} transaction rejected: ${
          txRecord.resultDesc || 'Try again'
        }`
      );
      return true;
    },
    []
  );

  // Instant Server-Sent Events (SSE) listener for zero-latency Safaricom / Valtex / PayHero / KCB callback confirmation
  const hasPendingMpesaTx = cashierTransactions.some(
    (t) =>
      t.status === 'PENDING' &&
      (t.method === 'MPESA' ||
        t.method === 'DERIV_P2P' ||
        t.method === 'D_CASH' ||
        t.method === 'VALTEX' ||
        t.method === 'PAYHERO' ||
        t.method === 'KCB_BANK') &&
      Boolean(t.conversationId || t.reference)
  );

  useEffect(() => {
    if (!isCashierOpen && !hasPendingMpesaTx) return;
    if (typeof EventSource === 'undefined') return;

    const es = new EventSource('/api/mpesa/events');
    const onTxUpdate = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as {
          transaction?: {
            id: string;
            type?: string;
            status: 'PENDING' | 'COMPLETED' | 'REJECTED';
            callbackVerified?: boolean;
            verificationSource?: string;
            mpesaReceipt?: string;
            resultDesc?: string;
            environment?: 'sandbox' | 'production';
            safaricomConfirmationText?: string;
            receiverPublicName?: string;
            completedAtText?: string;
          };
        };
        const txRecord = parsed?.transaction;
        if (!txRecord?.id) return;
        if (txRecord.status !== 'COMPLETED' && txRecord.status !== 'REJECTED') return;

        const matches = cashierTransactionsRef.current.filter(
          (t) =>
            t.status === 'PENDING' &&
            (t.conversationId === txRecord.id || t.reference === txRecord.id)
        );
        for (const match of matches) {
          const creditReal = match.accountMode === 'REAL';
          applyDarajaTxSettlement(
            match.id,
            txRecord.id,
            txRecord,
            match.type,
            match.amount,
            creditReal
          );
        }
      } catch {
        // ignore malformed SSE chunk
      }
    };

    es.addEventListener('mpesa_tx_update', onTxUpdate as EventListener);
    return () => {
      es.removeEventListener('mpesa_tx_update', onTxUpdate as EventListener);
      es.close();
    };
  }, [isCashierOpen, hasPendingMpesaTx, applyDarajaTxSettlement]);

  const pollDarajaTx = useCallback(
    (localTxId: string, remoteId: string, kind: 'DEPOSIT' | 'WITHDRAWAL', amountUsd: number, creditReal: boolean) => {
      let attempts = 0;
      const maxAttempts = 40;
      let cancelled = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const scheduleNext = (delayMs: number) => {
        if (cancelled || attempts >= maxAttempts || settledP2pTxIdsRef.current.has(localTxId)) {
          return;
        }
        timeoutHandle = setTimeout(runCheck, delayMs);
      };

      const runCheck = async () => {
        if (cancelled || settledP2pTxIdsRef.current.has(localTxId)) return;
        attempts += 1;
        try {
          const shouldProbe = kind === 'WITHDRAWAL' && attempts >= 6 && attempts % 6 === 0;
          const res = await fetch(
            `/api/mpesa/tx/${encodeURIComponent(remoteId)}${shouldProbe ? '?probe=1' : ''}`
          );
          if (res.ok) {
            const data = await res.json();
            const txRecord = data?.transaction;
            if (txRecord && applyDarajaTxSettlement(localTxId, remoteId, txRecord, kind, amountUsd, creditReal)) {
              cancelled = true;
              if (timeoutHandle) clearTimeout(timeoutHandle);
              return;
            }
          }
        } catch {
          // keep polling
        }
        // Adaptive cadence: 700ms for first ~8.5s (12 tries), then 2000ms up to ~65s
        scheduleNext(attempts < 12 ? 700 : 2000);
      };

      // Quick initial probe at 400ms so fast Daraja callbacks confirm immediately
      scheduleNext(400);
    },
    [applyDarajaTxSettlement]
  );

  const depositFunds = useCallback(
    async (params: {
      amount: number;
      method: CashierMethod;
      methodName: string;
      sourceDetails?: string;
      targetAccount?: 'CURRENT' | 'REAL';
      note?: string;
    }) => {
      if (params.amount <= 0) {
        return { success: false, message: 'Deposit amount must be greater than 0.' };
      }

      const creditReal = params.targetAccount === 'REAL' || account.isReal;
      const targetLoginId = creditReal ? realAccount.loginId : account.loginId;
      const isMpesa = params.method === 'MPESA';
      const parsedPhone = isMpesa
        ? normalizeKenyanPhone(params.sourceDetails || safaricomPhone)
        : null;
      const kesAmount = isMpesa ? usdToKes(params.amount) : 0;

      if (isMpesa) {
        try {
          const res = await fetch('/api/mpesa/stkpush', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: parsedPhone?.msisdn || safaricomMsisdn,
              usdAmount: params.amount,
              kesAmount,
              loginId: targetLoginId,
            }),
          });
          const data = await res.json().catch(() => ({}));

          if (!res.ok || !data.configured) {
            const tx: CashierTransaction = {
              id: `tx-dep-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              type: 'DEPOSIT',
              amount: Number(params.amount.toFixed(2)),
              currency: 'USD',
              method: 'MPESA',
              methodName: params.methodName,
              accountMode: creditReal ? 'REAL' : 'DEMO',
              loginId: targetLoginId,
              derivSynced: false,
              destinationOrSource: `SafariCom M-Pesa (${parsedPhone?.formatted || safaricomFormatted})`,
              reference: 'UNCONFIRMED-NO-DARAJA',
              timestamp: Date.now(),
              status: 'PENDING',
              gatewayStatus: 'GATEWAY_UNCONFIGURED',
              note: `Safaricom Daraja STK Push not configured — deposit via Deriv Official Cashier / P2P or add MPESA_* keys.`,
            };
            setCashierTransactions((prev) => [tx, ...prev]);
            return {
              success: false,
              gatewayUnconfigured: true,
              tx,
              message:
                data?.error ||
                `Safaricom Daraja M-Pesa STK Push is not configured on the server, so no STK prompt was sent to ${
                  parsedPhone?.local || safaricomPhone
                }. Use Deriv Official Cashier or add MPESA_* API secrets.`,
            };
          }

          const localTxId = `tx-dep-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
          const tx: CashierTransaction = {
            id: localTxId,
            type: 'DEPOSIT',
            amount: Number(params.amount.toFixed(2)),
            currency: 'USD',
            method: 'MPESA',
            methodName: params.methodName,
            accountMode: creditReal ? 'REAL' : 'DEMO',
            loginId: targetLoginId,
            derivSynced: false,
            destinationOrSource: `SafariCom M-Pesa (${parsedPhone?.formatted || safaricomFormatted})`,
            reference: data.checkoutRequestId,
            conversationId: data.checkoutRequestId,
            timestamp: Date.now(),
            status: 'PENDING',
            gatewayStatus: 'AWAITING_MPESA_CALLBACK',
            note: `STK Push sent to ${parsedPhone?.local || safaricomPhone} (KES ${kesAmount.toLocaleString()}) — enter M-Pesa PIN on phone`,
          };
          setCashierTransactions((prev) => [tx, ...prev]);
          pollDarajaTx(localTxId, data.checkoutRequestId, 'DEPOSIT', params.amount, creditReal);
          setActiveToast(`STK Push sent to ${parsedPhone?.local || safaricomPhone}. Enter M-Pesa PIN to confirm.`);
          return {
            success: true,
            pendingConfirmation: true,
            tx,
            message: `STK Push sent to Safaricom ${parsedPhone?.formatted || safaricomFormatted} for KES ${kesAmount.toLocaleString()}. Awaiting M-Pesa PIN confirmation...`,
          };
        } catch {
          return {
            success: false,
            gatewayUnconfigured: true,
            message: 'Unable to reach server M-Pesa STK Push endpoint.',
          };
        }
      }

      let derivDepositUrl: string | undefined;
      let syncedWithDerivCashier = false;
      if (creditReal && realAccount.token && realAccount.token !== 'CR-NDERISKOOL-LIVE') {
        const wsDep = await derivWsService.requestRealDeposit();
        derivDepositUrl = wsDep.cashierUrl;
        syncedWithDerivCashier = wsDep.syncedWithDeriv;
      }

      const reference = `DRV-DEP-${Math.floor(100000 + Math.random() * 900000)}`;
      const destinationOrSource = params.sourceDetails || 'Deriv Cashier';

      const tx: CashierTransaction = {
        id: `tx-dep-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: 'DEPOSIT',
        amount: Number(params.amount.toFixed(2)),
        currency: 'USD',
        method: params.method,
        methodName: params.methodName,
        accountMode: creditReal ? 'REAL' : 'DEMO',
        loginId: targetLoginId,
        derivSynced: creditReal && (syncedWithDerivCashier || !realAccount.isLiveVerified),
        destinationOrSource,
        reference,
        timestamp: Date.now(),
        status: 'COMPLETED',
        cashierUrl: derivDepositUrl,
        note:
          params.note ||
          `Deposit via ${params.methodName} to ${creditReal ? `Deriv Real (${targetLoginId})` : 'Demo Virtual'}`,
      };

      if (creditReal) {
        setRealAccount((prev) => ({
          ...prev,
          balance: Number((prev.balance + params.amount).toFixed(2)),
        }));
      }

      if ((creditReal && account.isReal) || (!creditReal && !account.isReal)) {
        setAccount((prev) => ({
          ...prev,
          balance: Number((prev.balance + params.amount).toFixed(2)),
        }));
      }

      setCashierTransactions((prev) => [tx, ...prev]);
      soundManager.playWinSound();
      setActiveToast(
        `DEPOSIT CONFIRMED: +$${params.amount.toFixed(2)} USD to ${
          creditReal ? `Deriv Real (${targetLoginId})` : 'Demo Virtual'
        }! Ref: ${reference}`
      );

      return {
        success: true,
        message: syncedWithDerivCashier
          ? `Deposit of $${params.amount.toFixed(2)} USD initialized for connected Deriv Real Account (${targetLoginId}). Use the Official Deriv Deposit link to fund via card/crypto/payment agent and click Sync Balance.`
          : `Successfully deposited $${params.amount.toFixed(2)} USD into ${
              creditReal ? `your Deriv Real Account (${targetLoginId})` : 'your Demo Virtual account'
            }.`,
        tx,
        cashierUrl: derivDepositUrl,
      };
    },
    [
      account.isReal,
      account.loginId,
      pollDarajaTx,
      realAccount.isLiveVerified,
      realAccount.loginId,
      realAccount.token,
      safaricomFormatted,
      safaricomMsisdn,
      safaricomPhone,
    ]
  );

  const withdrawFunds = useCallback(
    async (params: {
      amount: number;
      method: CashierMethod;
      methodName: string;
      destinationDetails: string;
      withdrawalDirection?: 'FROM_REAL' | 'TO_REAL';
      note?: string;
    }) => {
      if (params.amount <= 0) {
        return { success: false, message: 'Withdrawal amount must be greater than 0.' };
      }

      if (params.amount < 10) {
        return { success: false, message: 'Minimum withdrawal amount on Deriv is $10.00 USD.' };
      }

      const direction =
        params.withdrawalDirection ||
        (params.method === 'DERIV_REAL_ACCOUNT' && !account.isReal ? 'TO_REAL' : 'FROM_REAL');

      if (direction === 'TO_REAL') {
        if (params.amount > account.balance) {
          return {
            success: false,
            message: `Insufficient terminal balance ($${account.balance.toFixed(2)} available).`,
          };
        }

        const newRealBalance = Number((realAccount.balance + params.amount).toFixed(2));
        const targetLoginId = params.destinationDetails.trim() || realAccount.loginId;

        const wsSync = await derivWsService.requestRealWithdrawal({
          amount: params.amount,
          currency: realAccount.currency,
          destination: targetLoginId,
          method: params.methodName,
          token: realAccount.token,
        });

        const tx: CashierTransaction = {
          id: `tx-wth-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          type: 'WITHDRAWAL',
          amount: Number(params.amount.toFixed(2)),
          currency: realAccount.currency || 'USD',
          method: params.method,
          methodName: params.methodName,
          accountMode: 'REAL',
          loginId: targetLoginId,
          derivSynced: wsSync.syncedWithDeriv,
          destinationOrSource: `Direct to Deriv Real (${targetLoginId})`,
          reference: `DRV-REAL-${Math.floor(100000 + Math.random() * 900000)}`,
          timestamp: Date.now(),
          status: 'COMPLETED',
          cashierUrl: wsSync.cashierUrl,
          note: params.note || `Internal transfer reflected in terminal Real ledger (${targetLoginId})`,
        };

        setAccount((prev) => ({
          ...prev,
          balance: Number((prev.balance - params.amount).toFixed(2)),
        }));

        setRealAccount((prev) => ({
          ...prev,
          loginId: targetLoginId,
          balance: newRealBalance,
          connected: true,
        }));

        setCashierTransactions((prev) => [tx, ...prev]);
        soundManager.playCashOutSound();
        setActiveToast(
          `DIRECT TO DERIV REAL: +$${params.amount.toFixed(2)} USD reflected in ${targetLoginId} (Real Bal: $${newRealBalance.toFixed(
            2
          )})`
        );

        return {
          success: true,
          message: `Withdrawal of $${params.amount.toFixed(
            2
          )} USD reflected on terminal Deriv Real ledger (${targetLoginId}). New Real Balance: $${newRealBalance.toFixed(
            2
          )} USD.`,
          tx,
          cashierUrl: wsSync.cashierUrl,
          newRealBalance,
        };
      }

      // FROM_REAL
      if (params.amount > realAccount.balance) {
        return {
          success: false,
          message: `Insufficient Deriv Real Account balance ($${realAccount.balance.toFixed(
            2
          )} available on ${realAccount.loginId}).`,
        };
      }

      const isMpesa = params.method === 'MPESA';
      const parsedPhone = isMpesa
        ? normalizeKenyanPhone(params.destinationDetails)
        : null;
      if (isMpesa && (!parsedPhone || !parsedPhone.valid)) {
        return {
          success: false,
          message: 'Enter a valid Kenyan Safaricom M-Pesa recipient number (e.g. 0728424076 or +254793950512).',
        };
      }
      const kesAmount = isMpesa ? usdToKes(params.amount) : 0;
      const resolvedDestination = isMpesa
        ? `SafariCom M-Pesa (${parsedPhone!.formatted})`
        : params.destinationDetails;

      if (isMpesa) {
        try {
          // Dispatch Daraja B2C payout in parallel with Deriv WS request so Safaricom confirmation starts immediately
          const [wsResult, b2cRes] = await Promise.all([
            derivWsService.requestRealWithdrawal({
              amount: params.amount,
              currency: realAccount.currency,
              destination: resolvedDestination,
              method: params.methodName,
              token: realAccount.token,
            }),
            fetch('/api/mpesa/b2c-withdraw', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone: parsedPhone!.msisdn,
                usdAmount: params.amount,
                kesAmount,
                loginId: realAccount.loginId,
              }),
            }),
          ]);

          const b2cData = await b2cRes.json().catch(() => ({}));

          if (!b2cData.configured) {
            const localTxId = `tx-wth-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
            const pendingTx: CashierTransaction = {
              id: localTxId,
              type: 'WITHDRAWAL',
              amount: Number(params.amount.toFixed(2)),
              currency: realAccount.currency || 'USD',
              method: 'MPESA',
              methodName: params.methodName,
              accountMode: 'REAL',
              loginId: realAccount.loginId,
              derivSynced: wsResult.syncedWithDeriv,
              destinationOrSource: resolvedDestination,
              recipientPhone: parsedPhone!.local,
              recipientMsisdn: parsedPhone!.msisdn,
              callbackVerified: false,
              reference: 'AWAITING-B2C-SECRETS',
              timestamp: Date.now(),
              status: 'PENDING',
              gatewayStatus: 'DERIV_CASHIER_REQUIRED',
              gatewayEnvironment: mpesaGatewayStatus.withdrawalConfirmationEnvironment || 'production',
              cashierUrl: wsResult.cashierUrl,
              note: `Unconfirmed to Safaricom ${parsedPhone!.local}: Daraja B2C secrets incomplete. Complete via Deriv Official Cashier / Deriv P2P.`,
            };

            setCashierTransactions((prev) => [pendingTx, ...prev]);
            soundManager.playLossSound();
            setActiveToast(
              `WITHDRAWAL NOT CONFIRMED TO ${parsedPhone!.local} — Daraja B2C secrets required. Use Deriv Cashier / P2P.`
            );

            return {
              success: false,
              gatewayUnconfigured: true,
              pendingConfirmation: true,
              tx: pendingTx,
              cashierUrl: wsResult.cashierUrl,
              message:
                b2cData?.error ||
                `Withdrawal of $${params.amount.toFixed(2)} USD (KES ${kesAmount.toLocaleString()}) has NOT been sent to Safaricom ${
                  parsedPhone!.formatted
                } because Safaricom Daraja B2C credentials are incomplete. Your balance was NOT deducted. Complete real M-Pesa payout via Deriv Official Cashier / Deriv P2P below.`,
            };
          }

          if (!b2cRes.ok || !b2cData.ok) {
            const localTxId = `tx-wth-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
            const errDetail =
              b2cData?.error ||
              `Safaricom Daraja B2C v3 rejected payout request (HTTP ${b2cRes.status}).`;
            const rejectedTx: CashierTransaction = {
              id: localTxId,
              type: 'WITHDRAWAL',
              amount: Number(params.amount.toFixed(2)),
              currency: realAccount.currency || 'USD',
              method: 'MPESA',
              methodName: params.methodName,
              accountMode: 'REAL',
              loginId: realAccount.loginId,
              derivSynced: wsResult.syncedWithDeriv,
              destinationOrSource: resolvedDestination,
              recipientPhone: parsedPhone!.local,
              recipientMsisdn: parsedPhone!.msisdn,
              callbackVerified: false,
              reference: `DARAJA-ERR-${Date.now().toString().slice(-6)}`,
              timestamp: Date.now(),
              status: 'REJECTED',
              gatewayStatus: 'DERIV_CASHIER_REQUIRED',
              gatewayEnvironment: mpesaGatewayStatus.withdrawalConfirmationEnvironment || 'production',
              cashierUrl: wsResult.cashierUrl,
              note: `Safaricom Daraja B2C rejected: ${errDetail}`,
            };

            setCashierTransactions((prev) => [rejectedTx, ...prev]);
            soundManager.playLossSound();
            setActiveToast(`Daraja B2C rejected (${parsedPhone!.local}): ${errDetail}`);

            return {
              success: false,
              gatewayUnconfigured: false,
              tx: rejectedTx,
              cashierUrl: wsResult.cashierUrl,
              message: `${errDetail} Your balance was NOT deducted.`,
            };
          }

          // Daraja B2C accepted request -> reserve balance while strictly awaiting Safaricom payment result callback
          const newRealBalance = Number((realAccount.balance - params.amount).toFixed(2));
          const localTxId = `tx-wth-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
          const isProdEnv = b2cData.environment !== 'sandbox';
          const pendingTx: CashierTransaction = {
            id: localTxId,
            type: 'WITHDRAWAL',
            amount: Number(params.amount.toFixed(2)),
            currency: realAccount.currency || 'USD',
            method: 'MPESA',
            methodName: params.methodName,
            accountMode: 'REAL',
            loginId: realAccount.loginId,
            derivSynced: wsResult.syncedWithDeriv,
            destinationOrSource: resolvedDestination,
            recipientPhone: parsedPhone!.local,
            recipientMsisdn: parsedPhone!.msisdn,
            callbackVerified: false,
            reference: b2cData.conversationId,
            conversationId: b2cData.conversationId,
            timestamp: Date.now(),
            status: 'PENDING',
            gatewayStatus: 'AWAITING_MPESA_CALLBACK',
            gatewayEnvironment: isProdEnv ? 'production' : 'sandbox',
            cashierUrl: wsResult.cashierUrl,
            note: isProdEnv
              ? `Live Safaricom B2C payout of KES ${kesAmount.toLocaleString()} sent to ${parsedPhone!.local} (${parsedPhone!.msisdn}) — awaiting Safaricom payment result callback`
              : `Daraja B2C payout of KES ${kesAmount.toLocaleString()} submitted to ${parsedPhone!.local} (${parsedPhone!.msisdn}) — awaiting Safaricom callback`,
          };

          setRealAccount((prev) => ({
            ...prev,
            balance: newRealBalance,
          }));
          if (account.isReal) {
            setAccount((prev) => ({
              ...prev,
              balance: newRealBalance,
            }));
          }

          setCashierTransactions((prev) => [pendingTx, ...prev]);
          pollDarajaTx(localTxId, b2cData.conversationId, 'WITHDRAWAL', params.amount, true);
          soundManager.playCashOutSound();
          setActiveToast(
            `M-Pesa B2C submitted to ${parsedPhone!.local} — status stays Pending until Safaricom payment result callback.`
          );

          return {
            success: true,
            pendingConfirmation: true,
            tx: pendingTx,
            cashierUrl: wsResult.cashierUrl,
            newRealBalance,
            message: isProdEnv
              ? `Live Safaricom B2C payout of $${params.amount.toFixed(2)} USD (KES ${kesAmount.toLocaleString()}) submitted to ${
                  parsedPhone!.formatted
                }. Status will update to Confirmed only after Safaricom verifies the payment.`
              : `M-Pesa B2C payout of $${params.amount.toFixed(2)} USD (KES ${kesAmount.toLocaleString()}) submitted to Safaricom (${
                  parsedPhone!.formatted
                }). Awaiting verified Safaricom ResultURL payment callback.`,
          };
        } catch {
          return {
            success: false,
            gatewayUnconfigured: true,
            cashierUrl: 'https://app.deriv.com/cashier/withdrawal',
            message: `Could not reach M-Pesa B2C backend for ${parsedPhone!.local}. Complete payout via Deriv Official Cashier.`,
          };
        }
      }

      const wsResult = await derivWsService.requestRealWithdrawal({
        amount: params.amount,
        currency: realAccount.currency,
        destination: resolvedDestination,
        method: params.methodName,
        token: realAccount.token,
      });

      const reference = `DRV-WTH-${Math.floor(100000 + Math.random() * 900000)}`;
      const newRealBalance = Number((realAccount.balance - params.amount).toFixed(2));
      const localTxId = `tx-wth-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

      const tx: CashierTransaction = {
        id: localTxId,
        type: 'WITHDRAWAL',
        amount: Number(params.amount.toFixed(2)),
        currency: realAccount.currency || 'USD',
        method: params.method,
        methodName: params.methodName,
        accountMode: 'REAL',
        loginId: realAccount.loginId,
        derivSynced: wsResult.syncedWithDeriv,
        destinationOrSource: resolvedDestination,
        reference,
        timestamp: Date.now(),
        status: wsResult.syncedWithDeriv ? 'COMPLETED' : 'PENDING',
        cashierUrl: wsResult.cashierUrl,
        note: wsResult.syncedWithDeriv
          ? `Deriv Real (${realAccount.loginId}) withdrawal initialized to ${params.destinationDetails}`
          : `Pending Deriv Official Cashier verification for ${realAccount.loginId}`,
      };

      setRealAccount((prev) => ({
        ...prev,
        balance: newRealBalance,
      }));

      if (account.isReal) {
        setAccount((prev) => ({
          ...prev,
          balance: newRealBalance,
        }));
      }

      setCashierTransactions((prev) => [tx, ...prev]);

      soundManager.playCashOutSound();
      setActiveToast(
        wsResult.syncedWithDeriv
          ? `DERIV REAL WITHDRAWAL: -$${params.amount.toFixed(2)} USD initialized on ${realAccount.loginId}`
          : `WITHDRAWAL PENDING VERIFICATION: Open Deriv Official Cashier to complete -$${params.amount.toFixed(2)} USD`
      );

      return {
        success: true,
        pendingConfirmation: !wsResult.syncedWithDeriv,
        message: wsResult.syncedWithDeriv
          ? `Withdrawal of $${params.amount.toFixed(2)} USD initialized on Deriv Real Account (${
              realAccount.loginId
            }). Remaining Real Balance: $${newRealBalance.toFixed(2)} USD.`
          : `Withdrawal of $${params.amount.toFixed(2)} USD recorded as PENDING for ${
              realAccount.loginId
            }. Open Deriv Official Cashier below to complete verification.`,
        tx,
        cashierUrl: wsResult.cashierUrl,
        newRealBalance,
      };
    },
    [
      account.balance,
      account.isReal,
      mpesaGatewayStatus.withdrawalConfirmationEnvironment,
      pollDarajaTx,
      realAccount,
    ]
  );

  const confirmMpesaTransaction = useCallback(
    (txId: string, mpesaReceiptCode: string) => {
      const target =
        cashierTransactionsRef.current.find((t) => t.id === txId) ||
        cashierTransactions.find((t) => t.id === txId);
      if (!target) {
        return { success: false, message: 'Transaction not found.' };
      }

      if (target.status === 'COMPLETED') {
        settledP2pTxIdsRef.current.add(txId);
        return {
          success: true,
          message: `Withdrawal / M-Pesa transaction already confirmed (${target.mpesaReceipt || target.reference}).`,
        };
      }

      // Strictly block client-side unverified confirmation for Safaricom M-Pesa, Valtex, PayHero, or KCB Bank transactions
      if (
        target.method === 'MPESA' ||
        target.method === 'VALTEX' ||
        target.method === 'PAYHERO' ||
        target.method === 'KCB_BANK' ||
        (Boolean(target.conversationId) && target.method !== 'D_CASH')
      ) {
        return {
          success: false,
          message:
            target.method === 'KCB_BANK'
              ? 'KCB App direct transfers can only be marked Confirmed after KCB Buni IPN, Daraja B2B, or bank receipt confirmation. Click Verify Status.'
              : target.method === 'PAYHERO'
              ? 'PayHero transactions can only be marked Confirmed after PayHero returns a verified confirmation webhook or API status. Click Verify Status.'
              : target.method === 'VALTEX'
              ? 'Valtex transactions can only be marked Confirmed after Valtex returns a verified confirmation webhook or API response. Click Verify Status.'
              : 'M-Pesa transactions can only be marked Confirmed when Safaricom returns a verified payment result callback. Click Check Status or Query Safaricom.',
        };
      }

      const rawCode = mpesaReceiptCode.trim().toUpperCase().replace(/\s+/g, '');
      if (!rawCode || !/^[A-Z0-9_-]{6,64}$/.test(rawCode)) {
        return {
          success: false,
          message: 'Enter an actual M-Pesa SMS confirmation code / Bridge Receipt (6+ letters/digits, e.g. SLK82940PQ).',
        };
      }

      const cleaned = rawCode;

      const wasGatewayUnconfigured =
        target.gatewayStatus === 'DERIV_CASHIER_REQUIRED' ||
        target.gatewayStatus === 'GATEWAY_UNCONFIGURED';
      const isStandalone = Boolean(target.standaloneTransfer || target.fundingSource === 'STANDALONE_GATEWAY');
      if (!isStandalone && target.type === 'WITHDRAWAL' && wasGatewayUnconfigured && !settledP2pTxIdsRef.current.has(txId)) {
        if (target.amount > realAccount.balance) {
          return {
            success: false,
            message: `Insufficient Real balance ($${realAccount.balance.toFixed(2)}) to mark this withdrawal confirmed.`,
          };
        }
        const newBal = Number((realAccount.balance - target.amount).toFixed(2));
        setRealAccount((prev) => ({ ...prev, balance: newBal }));
        if (account.isReal) {
          setAccount((prev) => ({ ...prev, balance: newBal }));
        }
      } else if (!isStandalone && target.type === 'DEPOSIT' && wasGatewayUnconfigured && !settledP2pTxIdsRef.current.has(txId)) {
        const creditReal = target.accountMode === 'REAL';
        if (creditReal) {
          setRealAccount((prev) => ({ ...prev, balance: Number((prev.balance + target.amount).toFixed(2)) }));
        }
        if ((creditReal && account.isReal) || (!creditReal && !account.isReal)) {
          setAccount((prev) => ({ ...prev, balance: Number((prev.balance + target.amount).toFixed(2)) }));
        }
      }

      settledP2pTxIdsRef.current.add(txId);
      const confirmationNote = `Confirmed Escrow / Bridge Receipt: ${cleaned}`;

      setCashierTransactions((prev) =>
        prev.map((item) =>
          item.id === txId
            ? {
                ...item,
                status: 'COMPLETED',
                reference: cleaned,
                mpesaReceipt: cleaned,
                gatewayStatus: 'DARAJA_CONFIRMED',
                safaricomConfirmationText: item.safaricomConfirmationText || confirmationNote,
                note: confirmationNote,
              }
            : item
        )
      );

      if (target.method === 'D_CASH') {
        const remoteId = target.conversationId || target.reference || target.id;
        fetch('/api/mpesa/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: remoteId,
            receipt: cleaned,
            phone: target.destinationOrSource,
            usdAmount: target.amount,
            kesAmount: usdToKes(target.amount),
          }),
        }).catch(() => {});
      }

      soundManager.playCashOutSound();
      setActiveToast(
        `${target.type === 'WITHDRAWAL' ? 'Withdrawal' : 'Transaction'} Confirmed (${cleaned})`
      );
      return { success: true, message: `Confirmed with code ${cleaned}.` };
    },
    [account.isReal, cashierTransactions, realAccount.balance]
  );

  const syncMpesaBalance = useCallback(async () => {
    const currentTxs = cashierTransactionsRef.current;
    const pendingStkRows = currentTxs.filter(
      (t) => t.method === 'MPESA' && t.type === 'DEPOSIT' && t.status === 'PENDING'
    );
    const pendingWthRows = currentTxs.filter(
      (t) =>
        (t.method === 'MPESA' || t.method === 'DERIV_P2P' || t.method === 'D_CASH') &&
        t.type === 'WITHDRAWAL' &&
        t.status === 'PENDING'
    );

    const checkoutRequestIds = Array.from(
      new Set(
        pendingStkRows
          .map((t) => t.conversationId || t.reference)
          .filter(
            (id): id is string =>
              Boolean(id) &&
              id !== 'UNCONFIRMED-NO-DARAJA' &&
              !id.startsWith('DRV-')
          )
      )
    );

    const withdrawalIds = Array.from(
      new Set(
        pendingWthRows
          .map((t) => t.conversationId || t.reference)
          .filter(
            (id): id is string =>
              Boolean(id) &&
              id !== 'AWAITING-B2C-SECRETS' &&
              !id.startsWith('DRV-')
          )
      )
    );

    try {
      const res = await fetch('/api/mpesa/stk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutRequestIds, withdrawalIds }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        environment?: 'sandbox' | 'production';
        confirmedTransactions?: Array<{
          id: string;
          mpesaReceipt?: string;
          resultDesc?: string;
          safaricomConfirmationText?: string;
          receiverPublicName?: string;
          completedAtText?: string;
        }>;
        rejectedTransactions?: Array<{
          id: string;
          resultDesc?: string;
        }>;
        pendingTransactions?: Array<{ id: string }>;
        confirmedWithdrawals?: Array<{
          id: string;
          mpesaReceipt?: string;
          resultDesc?: string;
          safaricomConfirmationText?: string;
          receiverPublicName?: string;
          completedAtText?: string;
        }>;
        rejectedWithdrawals?: Array<{
          id: string;
          resultDesc?: string;
        }>;
        pendingWithdrawals?: Array<{ id: string }>;
        error?: string;
        message?: string;
      };

      await refreshMpesaGatewayStatus();

      const confirmedList = Array.isArray(data.confirmedTransactions) ? data.confirmedTransactions : [];
      const rejectedList = Array.isArray(data.rejectedTransactions) ? data.rejectedTransactions : [];
      const pendingList = Array.isArray(data.pendingTransactions) ? data.pendingTransactions : [];
      const confirmedWthList = Array.isArray(data.confirmedWithdrawals) ? data.confirmedWithdrawals : [];
      const rejectedWthList = Array.isArray(data.rejectedWithdrawals) ? data.rejectedWithdrawals : [];
      const pendingWthServerList = Array.isArray(data.pendingWithdrawals) ? data.pendingWithdrawals : [];

      const confirmedMap = new Map([...confirmedList, ...confirmedWthList].map((tx) => [tx.id, tx]));
      const rejectedMap = new Map([...rejectedList, ...rejectedWthList].map((tx) => [tx.id, tx]));
      const rejectedWthSet = new Set(rejectedWthList.map((tx) => tx.id));

      let newlyConfirmedRealUsd = 0;
      let newlyConfirmedDemoUsd = 0;
      let newlyRefundedRealUsd = 0;
      let newlyDeductedWthUsd = 0;
      let newlyConfirmedDepCount = 0;
      let newlyConfirmedWthCount = 0;
      let newlyRejectedCount = 0;

      for (const item of pendingStkRows) {
        const lookupId = item.conversationId || item.reference;
        const isStandalone = Boolean(item.standaloneTransfer || item.fundingSource === 'STANDALONE_GATEWAY');
        if (lookupId && confirmedMap.has(lookupId) && !settledP2pTxIdsRef.current.has(item.id)) {
          settledP2pTxIdsRef.current.add(item.id);
          newlyConfirmedDepCount += 1;
          if (!isStandalone) {
            if (item.accountMode === 'REAL') {
              newlyConfirmedRealUsd += item.amount;
            } else {
              newlyConfirmedDemoUsd += item.amount;
            }
          }
        } else if (lookupId && rejectedMap.has(lookupId) && !settledP2pTxIdsRef.current.has(item.id)) {
          settledP2pTxIdsRef.current.add(item.id);
          newlyRejectedCount += 1;
        }
      }

      for (const item of pendingWthRows) {
        const lookupId = item.conversationId || item.reference;
        const isStandalone = Boolean(item.standaloneTransfer || item.fundingSource === 'STANDALONE_GATEWAY');
        if (!lookupId) continue;
        if (confirmedMap.has(lookupId) && !settledP2pTxIdsRef.current.has(item.id)) {
          settledP2pTxIdsRef.current.add(item.id);
          newlyConfirmedWthCount += 1;
          if (
            !isStandalone &&
            (item.gatewayStatus === 'DERIV_CASHIER_REQUIRED' ||
              item.gatewayStatus === 'GATEWAY_UNCONFIGURED')
          ) {
            newlyDeductedWthUsd += item.amount;
          }
        } else if (rejectedWthSet.has(lookupId) && !settledP2pTxIdsRef.current.has(item.id)) {
          settledP2pTxIdsRef.current.add(item.id);
          newlyRejectedCount += 1;
          if (!isStandalone && item.gatewayStatus === 'AWAITING_MPESA_CALLBACK') {
            newlyRefundedRealUsd += item.amount;
          }
        }
      }

      if (confirmedMap.size > 0 || rejectedMap.size > 0) {
        setCashierTransactions((prev) =>
          prev.map((item) => {
            if (item.status !== 'PENDING') {
              return item;
            }
            const lookupId = item.conversationId || item.reference;
            if (!lookupId) return item;

            const confirmedTx = confirmedMap.get(lookupId);
            if (confirmedTx) {
              const receipt = confirmedTx.mpesaReceipt || lookupId;
              return {
                ...item,
                status: 'COMPLETED',
                reference: receipt,
                mpesaReceipt: receipt,
                gatewayStatus: 'DARAJA_CONFIRMED',
                gatewayEnvironment: data.environment || item.gatewayEnvironment,
                safaricomConfirmationText: confirmedTx.safaricomConfirmationText,
                receiverPublicName: confirmedTx.receiverPublicName,
                completedAtText: confirmedTx.completedAtText,
                note:
                  confirmedTx.safaricomConfirmationText ||
                  confirmedTx.resultDesc ||
                  `${receipt} Confirmed by Safaricom M-Pesa.`,
              };
            }

            const rejectedTx = rejectedMap.get(lookupId);
            if (rejectedTx) {
              return {
                ...item,
                status: 'REJECTED',
                note: rejectedTx.resultDesc || 'Transaction rejected by Safaricom M-Pesa',
              };
            }

            return item;
          })
        );
      }

      const totalCreditedUsd = Number((newlyConfirmedRealUsd + newlyConfirmedDemoUsd).toFixed(2));
      const realDelta = Number((newlyConfirmedRealUsd + newlyRefundedRealUsd - newlyDeductedWthUsd).toFixed(2));

      if (realDelta !== 0) {
        setRealAccount((prev) => ({
          ...prev,
          balance: Math.max(0, Number((prev.balance + realDelta).toFixed(2))),
        }));
      }

      const activeAccountDelta = account.isReal ? realDelta : newlyConfirmedDemoUsd;
      if (activeAccountDelta !== 0) {
        setAccount((prev) => ({
          ...prev,
          balance: Math.max(0, Number((prev.balance + activeAccountDelta).toFixed(2))),
        }));
      }

      const totalConfirmedCount = Math.max(
        newlyConfirmedDepCount + newlyConfirmedWthCount,
        confirmedList.length + confirmedWthList.length
      );
      const totalPendingCount = pendingList.length + pendingWthServerList.length;
      const totalRejectedCount = rejectedList.length + rejectedWthList.length;

      if (totalCreditedUsd > 0) {
        soundManager.playWinSound();
        const msg = `Synced with Daraja: +$${totalCreditedUsd.toFixed(2)} USD confirmed and credited to your balance.`;
        setActiveToast(msg);
        return {
          ok: true,
          confirmedCount: totalConfirmedCount,
          pendingCount: totalPendingCount,
          rejectedCount: totalRejectedCount,
          creditedUsd: totalCreditedUsd,
          message: msg,
        };
      }

      if (newlyConfirmedWthCount > 0) {
        soundManager.playCashOutSound();
        const msg = `Synced with Daraja: ${newlyConfirmedWthCount} pending withdrawal${
          newlyConfirmedWthCount > 1 ? 's' : ''
        } confirmed.`;
        setActiveToast(msg);
        return {
          ok: true,
          confirmedCount: totalConfirmedCount,
          pendingCount: totalPendingCount,
          rejectedCount: totalRejectedCount,
          creditedUsd: 0,
          message: msg,
        };
      }

      if (newlyRejectedCount > 0) {
        soundManager.playLossSound();
      }

      const fallbackMessage =
        data.error ||
        data.message ||
        (res.ok
          ? 'M-Pesa status synced with Safaricom Daraja.'
          : 'Unable to verify M-Pesa status with Safaricom Daraja.');

      if (res.ok && data.ok) {
        setActiveToast(fallbackMessage);
      }

      return {
        ok: Boolean(res.ok && data.ok),
        confirmedCount: totalConfirmedCount,
        pendingCount: totalPendingCount,
        rejectedCount: totalRejectedCount,
        creditedUsd: 0,
        message: fallbackMessage,
      };
    } catch {
      return {
        ok: false,
        confirmedCount: 0,
        pendingCount: pendingStkRows.length + pendingWthRows.length,
        rejectedCount: 0,
        creditedUsd: 0,
        message: 'Network error while contacting /api/mpesa/stk-sync.',
      };
    }
  }, [account.isReal, realAccount.balance, refreshMpesaGatewayStatus]);

  const refreshP2pTransactions = useCallback(
    async (silent = false): Promise<{ updatedCount: number; confirmedCount: number; checkedAt: number }> => {
      setIsRefreshingP2p(true);
      const checkedAt = Date.now();
      let updatedCount = 0;
      let confirmedCount = 0;

      try {
        const [mpesaRes, dp2pRes] = await Promise.allSettled([
          fetch('/api/mpesa/transactions'),
          derivWsService.fetchDp2pOrderList(),
        ]);

        type ApiMpesaRec = {
          id: string;
          type: 'STK_DEPOSIT' | 'B2C_WITHDRAWAL' | 'B2B_TRANSFER' | 'C2B_DEPOSIT';
          environment?: 'sandbox' | 'production';
          phone: string;
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
        };

        let apiEnvironment: 'sandbox' | 'production' | undefined;
        const apiRecords: ApiMpesaRec[] = [];
        if (mpesaRes.status === 'fulfilled' && mpesaRes.value.ok) {
          const data = (await mpesaRes.value.json().catch(() => ({}))) as {
            environment?: 'sandbox' | 'production';
            transactions?: ApiMpesaRec[];
          };
          apiEnvironment = data.environment;
          if (Array.isArray(data.transactions)) {
            apiRecords.push(...data.transactions);
          }
        }

        const apiMap = new Map<string, ApiMpesaRec>(apiRecords.map((rec) => [rec.id, rec]));

        const derivOrders =
          dp2pRes.status === 'fulfilled' && dp2pRes.value.liveFromDeriv ? dp2pRes.value.orders : [];
        const derivOrderMap = new Map(derivOrders.map((ord) => [ord.id, ord]));

        const currentTxs = cashierTransactionsRef.current;
        let newlyConfirmedRealUsd = 0;
        let newlyConfirmedDemoUsd = 0;
        let newlyRefundedRealUsd = 0;
        let newlyDeductedExternalWthUsd = 0;
        let anyRejected = false;

        const nextTxs: CashierTransaction[] = currentTxs.map((item) => {
          if (
            item.method !== 'DERIV_P2P' &&
            item.method !== 'MPESA' &&
            item.method !== 'D_CASH' &&
            item.method !== 'VALTEX' &&
            item.method !== 'PAYHERO' &&
            item.method !== 'KCB_BANK'
          ) {
            return item;
          }
          if (item.status !== 'PENDING') {
            return item;
          }

          const lookupIds = [item.conversationId, item.reference, item.id].filter(
            (v): v is string => Boolean(v)
          );
          const apiMatch = lookupIds.map((id) => apiMap.get(id)).find(Boolean) as
            | (ApiMpesaRec & { callbackVerified?: boolean; verificationSource?: string })
            | undefined;
          const derivMatch =
            item.method === 'DERIV_P2P'
              ? lookupIds.map((id) => derivOrderMap.get(id)).find(Boolean)
              : undefined;

          const isApiConfirmed =
            apiMatch?.status === 'COMPLETED' && apiMatch.callbackVerified !== false;
          const isDerivConfirmed = derivMatch?.status === 'completed';

          if (isApiConfirmed || isDerivConfirmed) {
            updatedCount += 1;
            confirmedCount += 1;

            const receipt =
              apiMatch?.mpesaReceipt ||
              derivMatch?.verificationCode ||
              item.mpesaReceipt ||
              item.reference;
            const liveText =
              apiMatch?.safaricomConfirmationText ||
              apiMatch?.resultDesc ||
              (isDerivConfirmed
                ? `Deriv DP2P escrow #${derivMatch?.id} confirmed (${receipt}).`
                : `${receipt} Confirmed by ${
                    item.method === 'KCB_BANK'
                      ? 'KCB App'
                      : item.method === 'PAYHERO'
                      ? 'PayHero'
                      : item.method === 'VALTEX'
                      ? 'Valtex'
                      : 'Safaricom M-Pesa'
                  }.`);

            const isStandalone = Boolean(item.standaloneTransfer || item.fundingSource === 'STANDALONE_GATEWAY');
            if (!settledP2pTxIdsRef.current.has(item.id)) {
              settledP2pTxIdsRef.current.add(item.id);
              if (!isStandalone) {
                if (item.type === 'DEPOSIT') {
                  if (item.accountMode === 'REAL') {
                    newlyConfirmedRealUsd += item.amount;
                  } else {
                    newlyConfirmedDemoUsd += item.amount;
                  }
                } else if (
                  item.type === 'WITHDRAWAL' &&
                  item.gatewayStatus === 'DERIV_CASHIER_REQUIRED'
                ) {
                  newlyDeductedExternalWthUsd += item.amount;
                }
              }
            }

            return {
              ...item,
              status: 'COMPLETED' as const,
              reference: receipt,
              mpesaReceipt: receipt,
              callbackVerified: true,
              verificationSource: apiMatch?.verificationSource || item.verificationSource,
              gatewayStatus:
                item.method === 'KCB_BANK'
                  ? ('KCB_CONFIRMED' as const)
                  : item.method === 'PAYHERO'
                  ? ('PAYHERO_CONFIRMED' as const)
                  : item.method === 'VALTEX'
                  ? ('VALTEX_CONFIRMED' as const)
                  : ('DARAJA_CONFIRMED' as const),
              gatewayEnvironment: apiMatch?.environment || apiEnvironment || item.gatewayEnvironment,
              safaricomConfirmationText: apiMatch?.safaricomConfirmationText || item.safaricomConfirmationText,
              receiverPublicName: apiMatch?.receiverPublicName || item.receiverPublicName,
              completedAtText: apiMatch?.completedAtText || item.completedAtText,
              note: liveText,
            };
          }

          const isApiRejected = apiMatch?.status === 'REJECTED';
          const isDerivRejected =
            derivMatch !== undefined &&
            ['cancelled', 'timed-out', 'refunded'].includes(derivMatch.status);

          if (isApiRejected || isDerivRejected) {
            updatedCount += 1;
            anyRejected = true;
            const isStandalone = Boolean(item.standaloneTransfer || item.fundingSource === 'STANDALONE_GATEWAY');

            if (
              !isStandalone &&
              item.type === 'WITHDRAWAL' &&
              (item.gatewayStatus === 'AWAITING_MPESA_CALLBACK' ||
                item.gatewayStatus === 'AWAITING_VALTEX_CALLBACK' ||
                item.gatewayStatus === 'AWAITING_PAYHERO_CALLBACK' ||
                item.gatewayStatus === 'AWAITING_KCB_CALLBACK') &&
              !settledP2pTxIdsRef.current.has(item.id)
            ) {
              settledP2pTxIdsRef.current.add(item.id);
              newlyRefundedRealUsd += item.amount;
            }

            return {
              ...item,
              status: 'REJECTED' as const,
              note:
                apiMatch?.resultDesc ||
                (derivMatch ? `Deriv DP2P order ${derivMatch.status}` : 'Transaction rejected'),
            };
          }

          return item;
        });

        // Prepend any server B2B_TRANSFER records not yet in local P2P list
        const existingKeys = new Set<string>();
        for (const tx of nextTxs) {
          existingKeys.add(tx.id);
          if (tx.conversationId) existingKeys.add(tx.conversationId);
          if (tx.reference) existingKeys.add(tx.reference);
        }

        const missingRecords: CashierTransaction[] = [];
        for (const rec of apiRecords) {
          if (rec.type === 'B2B_TRANSFER' && !existingKeys.has(rec.id)) {
            existingKeys.add(rec.id);
            updatedCount += 1;
            if (rec.status === 'COMPLETED') confirmedCount += 1;
            const b2bStandalone = !rec.loginId || rec.loginId === 'STANDALONE';
            missingRecords.push({
              id: `tx-b2b-${rec.id}`,
              type: 'WITHDRAWAL',
              amount: Number((rec.usdAmount || 0).toFixed(2)),
              currency: 'USD',
              method: 'DERIV_P2P',
              methodName: 'Daraja B2B Paybill/Till',
              accountMode: 'REAL',
              loginId: b2bStandalone ? 'STANDALONE' : rec.loginId,
              standaloneTransfer: b2bStandalone,
              fundingSource: b2bStandalone ? 'STANDALONE_GATEWAY' : 'DERIV_REAL',
              derivSynced: false,
              destinationOrSource: rec.receiverPublicName || rec.phone,
              reference: rec.mpesaReceipt || rec.id,
              conversationId: rec.id,
              mpesaReceipt: rec.mpesaReceipt,
              timestamp: rec.createdAt || checkedAt,
              status: rec.status,
              gatewayStatus:
                rec.status === 'COMPLETED'
                  ? 'DARAJA_CONFIRMED'
                  : 'AWAITING_MPESA_CALLBACK',
              gatewayEnvironment: rec.environment || apiEnvironment,
              safaricomConfirmationText: rec.safaricomConfirmationText,
              receiverPublicName: rec.receiverPublicName,
              completedAtText: rec.completedAtText,
              note:
                rec.safaricomConfirmationText ||
                rec.resultDesc ||
                `Daraja B2B Settlement (${rec.phone}) · KES ${(rec.kesAmount || 0).toLocaleString()}`,
            });
          }
        }

        // Prepend any live Deriv DP2P orders not yet in local list
        for (const ord of derivOrders) {
          if (ord.id && !existingKeys.has(ord.id)) {
            existingKeys.add(ord.id);
            updatedCount += 1;
            const mappedStatus: 'PENDING' | 'COMPLETED' | 'REJECTED' =
              ord.status === 'completed'
                ? 'COMPLETED'
                : ['cancelled', 'timed-out', 'refunded'].includes(ord.status)
                ? 'REJECTED'
                : 'PENDING';
            if (mappedStatus === 'COMPLETED') confirmedCount += 1;
            missingRecords.push({
              id: `tx-deriv-p2p-${ord.id}`,
              type: ord.type === 'sell' ? 'WITHDRAWAL' : 'DEPOSIT',
              amount: Number((ord.amount || 0).toFixed(2)),
              currency: 'USD',
              method: 'DERIV_P2P',
              methodName: ord.type === 'sell' ? 'Deriv DP2P Sell (Live)' : 'Deriv DP2P Buy (Live)',
              accountMode: 'REAL',
              loginId: realLoginIdRef.current,
              derivSynced: true,
              destinationOrSource: `Deriv DP2P Order #${ord.id}`,
              reference: ord.verificationCode || ord.id,
              conversationId: ord.id,
              mpesaReceipt: ord.verificationCode,
              timestamp: checkedAt,
              status: mappedStatus,
              gatewayStatus: mappedStatus === 'COMPLETED' ? 'DARAJA_CONFIRMED' : 'AWAITING_MPESA_CALLBACK',
              note: `Synced live from Deriv DP2P API (status: ${ord.status})`,
            });
          }
        }

        if (updatedCount > 0 || missingRecords.length > 0) {
          setCashierTransactions([...missingRecords, ...nextTxs]);
        }

        const realDelta = Number(
          (newlyConfirmedRealUsd + newlyRefundedRealUsd - newlyDeductedExternalWthUsd).toFixed(2)
        );
        if (realDelta !== 0) {
          setRealAccount((prev) => ({
            ...prev,
            balance: Math.max(0, Number((prev.balance + realDelta).toFixed(2))),
          }));
        }

        const activeDelta = accountIsRealRef.current ? realDelta : newlyConfirmedDemoUsd;
        if (activeDelta !== 0) {
          setAccount((prev) => ({
            ...prev,
            balance: Math.max(0, Number((prev.balance + activeDelta).toFixed(2))),
          }));
        }

        if (confirmedCount > 0) {
          soundManager.playWinSound();
          setActiveToast(
            `${confirmedCount} P2P / M-Pesa transaction${confirmedCount > 1 ? 's' : ''} Confirmed.`
          );
        } else if (anyRejected) {
          soundManager.playLossSound();
        } else if (!silent) {
          setActiveToast('P2P transaction list refreshed.');
        }

        setP2pLastRefreshedAt(checkedAt);
        return { updatedCount, confirmedCount, checkedAt };
      } catch {
        setP2pLastRefreshedAt(checkedAt);
        return { updatedCount: 0, confirmedCount: 0, checkedAt };
      } finally {
        setIsRefreshingP2p(false);
      }
    },
    []
  );

  // Automatic 30-second P2P & M-Pesa transaction poller while Cashier modal is open
  useEffect(() => {
    if (!isCashierOpen) return;

    if (cashierTab === 'dp2p' || cashierTab === 'history') {
      refreshP2pTransactions(true);
    }

    if (!p2pAutoRefreshEnabled) return;

    const timer = setInterval(() => {
      refreshP2pTransactions(true);
    }, 30000);

    return () => clearInterval(timer);
  }, [isCashierOpen, cashierTab, p2pAutoRefreshEnabled, refreshP2pTransactions]);

  const cancelPendingWithdrawal = useCallback(
    (txId: string) => {
      const target =
        cashierTransactionsRef.current.find((t) => t.id === txId) ||
        cashierTransactions.find((t) => t.id === txId);
      if (!target || target.status !== 'PENDING') return;

      const isStandalone = Boolean(target.standaloneTransfer || target.fundingSource === 'STANDALONE_GATEWAY');
      const wasDeducted =
        !isStandalone &&
        (target.gatewayStatus === 'AWAITING_MPESA_CALLBACK' ||
          target.gatewayStatus === 'AWAITING_VALTEX_CALLBACK' ||
          target.gatewayStatus === 'AWAITING_PAYHERO_CALLBACK' ||
          target.gatewayStatus === 'AWAITING_KCB_CALLBACK') &&
        !settledP2pTxIdsRef.current.has(txId);
      settledP2pTxIdsRef.current.add(txId);

      if (wasDeducted && target.type === 'WITHDRAWAL') {
        const restored = Number((realAccount.balance + target.amount).toFixed(2));
        setRealAccount((prev) => ({ ...prev, balance: restored }));
        if (account.isReal) {
          setAccount((prev) => ({ ...prev, balance: restored }));
        }
      }

      setCashierTransactions((prev) =>
        prev.map((item) =>
          item.id === txId
            ? {
                ...item,
                status: 'REJECTED',
                note: 'Cancelled by user before gateway confirmation',
              }
            : item
        )
      );

      const remoteId = target.conversationId || target.reference || target.id;
      fetch('/api/mpesa/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: remoteId,
          reason: 'Cancelled by user before gateway confirmation',
        }),
      }).catch(() => {});

      setActiveToast(
        isStandalone
          ? 'Pending money transfer cancelled.'
          : target.type === 'DEPOSIT'
          ? 'Pending deposit / DP2P order cancelled.'
          : 'Pending withdrawal request cancelled.'
      );
    },
    [account.isReal, cashierTransactions, realAccount.balance]
  );

  const createDp2pMpesaOrder = useCallback(
    async (params: {
      direction: 'DEPOSIT' | 'WITHDRAWAL';
      usdAmount: number;
      kesAmount: number;
      rate: number;
      phone: string;
      agentName: string;
      agentId: string;
      isLiveAdvert?: boolean;
      targetAccount?: 'CURRENT' | 'REAL';
    }) => {
      if (params.usdAmount < 10) {
        return { success: false, message: 'Minimum Deriv DP2P order amount is $10.00 USD.' };
      }

      const parsedPhone = normalizeKenyanPhone(params.phone || safaricomPhone);
      if (!parsedPhone.valid) {
        return {
          success: false,
          message: 'Enter a valid Safaricom M-Pesa number (e.g. 0793950512 or +254793950512).',
        };
      }

      if (params.direction === 'WITHDRAWAL') {
        setActiveP2pReceiverPhoneState(parsedPhone.local);
      } else {
        updateSafaricomPhone(parsedPhone.local);
      }

      if (params.direction === 'WITHDRAWAL' && params.usdAmount > realAccount.balance) {
        return {
          success: false,
          message: `Insufficient Deriv Real balance ($${realAccount.balance.toFixed(2)} available on ${realAccount.loginId}).`,
        };
      }

      const creditReal = params.direction === 'WITHDRAWAL' ? true : params.targetAccount === 'REAL' || account.isReal;
      const targetLoginId = creditReal ? realAccount.loginId : account.loginId;
      const p2pCashierUrl = 'https://app.deriv.com/cashier/p2p';

      let liveOrderId: string | undefined;
      let liveError: string | undefined;
      if (params.isLiveAdvert) {
        const wsOrder = await derivWsService.createDp2pOrder({
          advertId: params.agentId,
          amount: params.usdAmount,
          contactInfo: parsedPhone.local,
          paymentInfo: `Safaricom M-Pesa Kenya ${parsedPhone.formatted}`,
        });
        if (wsOrder.liveCreated && wsOrder.orderId) {
          liveOrderId = wsOrder.orderId;
          appendClientDiagnosticLog({
            source: 'DERIV_WS',
            channel: 'P2P',
            method: 'WS',
            endpoint: 'ws.derivws.com -> p2p_order_create',
            httpStatus: 200,
            outcome: 'OK',
            phoneOrTarget: `${parsedPhone.local} (${params.agentName})`,
            usdAmount: params.usdAmount,
            kesAmount: params.kesAmount,
            reference: wsOrder.orderId,
            summary: `Live Deriv DP2P order #${wsOrder.orderId} created.`,
            responsePayload: { liveCreated: true, orderId: wsOrder.orderId },
          });
        } else {
          liveError = wsOrder.error;
          appendClientDiagnosticLog({
            source: 'DERIV_WS',
            channel: 'P2P',
            method: 'WS',
            endpoint: 'ws.derivws.com -> p2p_order_create',
            httpStatus: 400,
            outcome: 'REJECTED',
            phoneOrTarget: `${parsedPhone.local} (${params.agentName})`,
            usdAmount: params.usdAmount,
            kesAmount: params.kesAmount,
            summary: wsOrder.error || 'Deriv DP2P order not executed on live WS.',
            responsePayload: { liveCreated: false, error: wsOrder.error },
          });
        }
      } else {
        appendClientDiagnosticLog({
          source: 'DERIV_WS',
          channel: 'P2P',
          method: 'WS',
          endpoint: 'ws.derivws.com -> p2p_advert_list / order',
          httpStatus: 200,
          outcome: 'WARNING',
          phoneOrTarget: `${parsedPhone.local} (${params.agentName})`,
          usdAmount: params.usdAmount,
          kesAmount: params.kesAmount,
          summary: `Fallback P2P desk selected (no live Deriv API token/advert). External DP2P balance unaffected until settled on app.deriv.com/cashier/p2p.`,
          responsePayload: {
            reason: 'Fallback advert / unauthenticated Deriv Payments session',
            loginId: targetLoginId,
            receiver: parsedPhone.local,
          },
        });
      }

      let darajaStarted = false;
      let darajaRef: string | undefined;
      try {
        if (params.direction === 'DEPOSIT') {
          const res = await fetch('/api/mpesa/stkpush', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: parsedPhone.msisdn,
              usdAmount: params.usdAmount,
              kesAmount: params.kesAmount,
              loginId: targetLoginId,
            }),
          });
          const data = await res.json();
          if (res.ok && data?.configured && data?.checkoutRequestId) {
            darajaStarted = true;
            darajaRef = data.checkoutRequestId;
          }
        } else {
          const res = await fetch('/api/mpesa/b2c-withdraw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: parsedPhone.msisdn,
              usdAmount: params.usdAmount,
              kesAmount: params.kesAmount,
              loginId: realAccount.loginId,
            }),
          });
          const data = await res.json();
          if (res.ok && data?.configured && data?.conversationId) {
            darajaStarted = true;
            darajaRef = data.conversationId;
          }
        }
      } catch {
        // Server M-Pesa gateway optional
      }

      const localTxId = `tx-p2p-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const reference = liveOrderId || darajaRef || `DP2P-${Math.floor(100000 + Math.random() * 900000)}`;
      const isAwaitingCallback = darajaStarted || Boolean(liveOrderId);

      // Reserve Real balance only when a live Daraja B2C payout or live Deriv DP2P sell order actually fired
      if (params.direction === 'WITHDRAWAL' && isAwaitingCallback) {
        const updatedBal = Number((realAccount.balance - params.usdAmount).toFixed(2));
        setRealAccount((prev) => ({ ...prev, balance: updatedBal }));
        if (account.isReal) {
          setAccount((prev) => ({ ...prev, balance: updatedBal }));
        }
      }

      const carrierName = detectKenyanCarrier(parsedPhone.local);
      const tx: CashierTransaction = {
        id: localTxId,
        type: params.direction,
        amount: Number(params.usdAmount.toFixed(2)),
        currency: 'USD',
        method: 'DERIV_P2P',
        methodName:
          params.direction === 'DEPOSIT'
            ? `Deriv DP2P Buy (${params.agentName})`
            : `Deriv DP2P Sell (${params.agentName})`,
        accountMode: creditReal ? 'REAL' : 'DEMO',
        loginId: targetLoginId,
        derivSynced: Boolean(liveOrderId),
        destinationOrSource: `DP2P ${carrierName} ${parsedPhone.formatted} · ${params.agentName}`,
        reference,
        conversationId: darajaRef,
        timestamp: Date.now(),
        status: 'PENDING',
        gatewayStatus: isAwaitingCallback ? 'AWAITING_MPESA_CALLBACK' : 'DERIV_CASHIER_REQUIRED',
        gatewayEnvironment: params.direction === 'WITHDRAWAL' ? 'production' : mpesaGatewayStatus.environment,
        cashierUrl: p2pCashierUrl,
        note:
          params.direction === 'DEPOSIT'
            ? `DP2P Buy $${params.usdAmount.toFixed(2)} @ KES ${params.rate.toFixed(2)} = KES ${params.kesAmount.toLocaleString()} via ${params.agentName} (${parsedPhone.local})${
                liveError ? ` · Open Deriv DP2P to release escrow` : ''
              }`
            : `Verified P2P Receiver: ${parsedPhone.local} (${carrierName}) · Sell $${params.usdAmount.toFixed(2)} @ KES ${params.rate.toFixed(2)} = KES ${params.kesAmount.toLocaleString()} via ${params.agentName}${
                liveError ? ` · Open Deriv DP2P to confirm peer payment` : ''
              }`,
      };

      setCashierTransactions((prev) => [tx, ...prev]);

      if (darajaStarted && darajaRef) {
        pollDarajaTx(localTxId, darajaRef, params.direction, params.usdAmount, creditReal);
      } else if (liveOrderId) {
        // Fast 4-second live Deriv DP2P order status check for the first 28 seconds
        let dp2pChecks = 0;
        const dp2pFastTimer = setInterval(async () => {
          dp2pChecks += 1;
          await refreshP2pTransactions(true);
          const cur = cashierTransactionsRef.current.find((t) => t.id === localTxId);
          if (!cur || cur.status !== 'PENDING' || dp2pChecks >= 7) {
            clearInterval(dp2pFastTimer);
          }
        }, 4000);
      }

      if (params.direction === 'WITHDRAWAL') {
        soundManager.playCashOutSound();
      } else {
        soundManager.playWinSound();
      }

      const msg = liveOrderId
        ? `Live Deriv DP2P Order #${liveOrderId} created with ${params.agentName} for KES ${params.kesAmount.toLocaleString()} to verified receiver ${parsedPhone.local}. Awaiting Deriv DP2P / Safaricom confirmation...`
        : darajaStarted
        ? `DP2P M-Pesa payout (${reference}) submitted for verified receiver ${parsedPhone.local} (KES ${params.kesAmount.toLocaleString()}). Status updates to Confirmed upon Safaricom payment result callback.`
        : `DP2P M-Pesa Escrow Order ${reference} created (${params.direction === 'DEPOSIT' ? 'Buy' : 'Sell'} $${params.usdAmount.toFixed(2)} = KES ${params.kesAmount.toLocaleString()} with ${params.agentName} for verified receiver ${parsedPhone.local}). Complete peer transfer on Deriv DP2P or enter verified M-Pesa SMS code.`;

      setActiveToast(
        liveOrderId || darajaStarted
          ? `DP2P M-Pesa order ${reference} submitted for ${parsedPhone.local} — awaiting confirmation...`
          : `DP2P order ${reference} queued for ${parsedPhone.local}. Complete on Deriv DP2P.`
      );

      return {
        success: true,
        pendingConfirmation: true,
        liveOrderCreated: Boolean(liveOrderId),
        tx,
        cashierUrl: p2pCashierUrl,
        message: msg,
      };
    },
    [account.isReal, account.loginId, autoConfirmWithdrawals, pollDarajaTx, realAccount.balance, realAccount.loginId, refreshP2pTransactions, safaricomPhone, updateSafaricomPhone]
  );

  const createDCashTransaction = useCallback(
    async (params: {
      direction: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
      usdAmount: number;
      kesAmount: number;
      phone: string;
      dcashTag?: string;
      agentLoginId: string;
      agentName: string;
      verificationCode?: string;
      targetAccount?: 'CURRENT' | 'REAL';
      fundingSource?: 'STANDALONE_GATEWAY' | 'DERIV_REAL';
    }) => {
      if (params.usdAmount < 10) {
        return { success: false, message: 'Minimum D Cash App transaction is $10.00 USD.' };
      }

      const parsedPhone = normalizeKenyanPhone(params.phone || safaricomPhone);
      if (!parsedPhone.valid) {
        return {
          success: false,
          message: 'Enter a valid Safaricom M-Pesa number linked to D Cash App (e.g. 0793950512).',
        };
      }

      updateSafaricomPhone(parsedPhone.local);

      const resolvedFundingSource: 'STANDALONE_GATEWAY' | 'DERIV_REAL' =
        params.fundingSource || (params.direction === 'TRANSFER' ? 'STANDALONE_GATEWAY' : 'DERIV_REAL');
      const isStandalone = resolvedFundingSource === 'STANDALONE_GATEWAY';

      if (!isStandalone && params.direction === 'WITHDRAWAL' && params.usdAmount > realAccount.balance) {
        return {
          success: false,
          message: `Insufficient Deriv Real balance ($${realAccount.balance.toFixed(2)} available on ${realAccount.loginId}).`,
        };
      }

      const creditReal = isStandalone
        ? false
        : params.direction === 'WITHDRAWAL'
        ? true
        : params.targetAccount === 'REAL' || account.isReal;
      const targetLoginId = isStandalone ? undefined : creditReal ? realAccount.loginId : account.loginId;
      const paymentAgentCashierUrl = 'https://app.deriv.com/cashier/payment-agent';
      const resolvedDcashTag = (params.dcashTag || parsedPhone.local).trim();

      // 1) For REAL WITHDRAWAL (Deriv-linked only): if user entered a Deriv email verification code and WS is authorized, call live paymentagent_withdraw
      let livePaTxId: string | undefined;
      let livePaError: string | undefined;
      if (!isStandalone && params.direction === 'WITHDRAWAL' && params.verificationCode?.trim()) {
        const paRes = await derivWsService.requestPaymentAgentWithdrawal({
          paymentagentLoginid: params.agentLoginId,
          amount: params.usdAmount,
          currency: realAccount.currency || 'USD',
          verificationCode: params.verificationCode.trim(),
          description: `D Cash App (${resolvedDcashTag}) payout to ${parsedPhone.local}`,
          token: realAccount.token,
        });
        if (paRes.liveExecuted && paRes.transactionId) {
          livePaTxId = paRes.transactionId;
          appendClientDiagnosticLog({
            source: 'DERIV_WS',
            channel: 'D_CASH',
            method: 'WS',
            endpoint: 'ws.derivws.com -> paymentagent_withdraw',
            httpStatus: 200,
            outcome: 'OK',
            phoneOrTarget: `${parsedPhone.local} (Agent: ${params.agentLoginId})`,
            usdAmount: params.usdAmount,
            kesAmount: params.kesAmount,
            reference: paRes.transactionId,
            summary: `Live Deriv paymentagent_withdraw executed (#${paRes.transactionId}).`,
            responsePayload: { liveExecuted: true, transactionId: paRes.transactionId },
          });
        } else {
          livePaError = paRes.error;
          appendClientDiagnosticLog({
            source: 'DERIV_WS',
            channel: 'D_CASH',
            method: 'WS',
            endpoint: 'ws.derivws.com -> paymentagent_withdraw',
            httpStatus: 400,
            outcome: 'REJECTED',
            phoneOrTarget: `${parsedPhone.local} (Agent: ${params.agentLoginId})`,
            usdAmount: params.usdAmount,
            kesAmount: params.kesAmount,
            summary: paRes.error || 'Deriv paymentagent_withdraw failed.',
            responsePayload: { liveExecuted: false, error: paRes.error },
          });
        }
      } else if (!isStandalone && params.direction === 'WITHDRAWAL') {
        const hasRealToken = Boolean(realAccount.token && realAccount.token !== 'CR-NDERISKOOL-LIVE');
        appendClientDiagnosticLog({
          source: 'DERIV_WS',
          channel: 'D_CASH',
          method: 'WS',
          endpoint: 'ws.derivws.com -> paymentagent_withdraw',
          httpStatus: hasRealToken ? 422 : 401,
          outcome: 'WARNING',
          phoneOrTarget: `${parsedPhone.local} (Agent: ${params.agentLoginId})`,
          usdAmount: params.usdAmount,
          kesAmount: params.kesAmount,
          summary: hasRealToken
            ? 'Deriv Email Verification Code missing — skipped live paymentagent_withdraw; queued via D Cash server bridge.'
            : `No live Deriv API token connected (${realAccount.loginId}) — skipped live paymentagent_withdraw.`,
          responsePayload: {
            hasRealToken,
            hasVerificationCode: Boolean(params.verificationCode?.trim()),
            agentLoginId: params.agentLoginId,
          },
        });
      }

      // 2) Try D Cash App Server Bridge (/api/dcash/transfer — external API or built-in D Cash URL)
      let bridgeConfigured = false;
      let builtInBridgeActive = false;
      let bridgeCompleted = false;
      let bridgeRef: string | undefined;
      let bridgeReceipt: string | undefined;
      let bridgeError: string | undefined;
      let bridgeTransferUrl: string | undefined;

      if (!livePaTxId) {
        try {
          const res = await fetch('/api/dcash/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              direction: params.direction,
              phone: parsedPhone.msisdn,
              usdAmount: params.usdAmount,
              kesAmount: params.kesAmount,
              loginId: targetLoginId,
              standalone: isStandalone,
              dcashTag: resolvedDcashTag,
              agentLoginId: params.agentLoginId,
            }),
          });
          const data = await res.json();
          bridgeTransferUrl = data?.transferUrl;
          if (data?.configured) {
            bridgeConfigured = true;
            if (!res.ok) {
              bridgeError = data?.error || 'D Cash App API rejected the request.';
            } else {
              bridgeRef = data?.reference;
              bridgeReceipt = data?.mpesaReceipt;
              bridgeCompleted = data?.status === 'COMPLETED';
            }
          } else if (data?.builtInBridge && res.ok) {
            builtInBridgeActive = true;
            bridgeRef = data?.reference;
            bridgeReceipt = data?.mpesaReceipt;
            bridgeCompleted = data?.status === 'COMPLETED';
          }
        } catch {
          // Bridge unavailable; fall back to honest local escrow/cashier workflow
        }
      }

      if (bridgeError) {
        return {
          success: false,
          cashierUrl: isStandalone ? undefined : paymentAgentCashierUrl,
          message: `D Cash App error: ${bridgeError}`,
        };
      }

      const localTxId = `tx-dcash-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const reference =
        livePaTxId ||
        bridgeReceipt ||
        bridgeRef ||
        `DCASH-${Math.floor(100000 + Math.random() * 900000)}`;

      const isCompletedNow = Boolean(livePaTxId || bridgeCompleted);
      const isAwaitingCallback = Boolean(bridgeConfigured && !bridgeCompleted);
      const isBuiltInTracking = Boolean(builtInBridgeActive && bridgeRef && !bridgeCompleted);
      const txType: 'DEPOSIT' | 'WITHDRAWAL' = params.direction === 'DEPOSIT' ? 'DEPOSIT' : 'WITHDRAWAL';

      if (!isStandalone && params.direction === 'WITHDRAWAL' && (isCompletedNow || isAwaitingCallback)) {
        const updatedBal = Number((realAccount.balance - params.usdAmount).toFixed(2));
        setRealAccount((prev) => ({ ...prev, balance: updatedBal }));
        if (account.isReal) {
          setAccount((prev) => ({ ...prev, balance: updatedBal }));
        }
      }

      const tx: CashierTransaction = {
        id: localTxId,
        type: txType,
        amount: Number(params.usdAmount.toFixed(2)),
        currency: 'USD',
        method: 'D_CASH',
        methodName: isStandalone
          ? `D Cash Money Transfer (${params.agentName})`
          : params.direction === 'DEPOSIT'
          ? `D Cash App Deposit (${params.agentName})`
          : `D Cash App Real Withdrawal (${params.agentName})`,
        accountMode: creditReal ? 'REAL' : 'DEMO',
        loginId: isStandalone ? 'STANDALONE' : targetLoginId,
        standaloneTransfer: isStandalone,
        fundingSource: resolvedFundingSource,
        derivSynced: Boolean(livePaTxId),
        destinationOrSource: `D Cash App (${resolvedDcashTag}) · ${parsedPhone.formatted}`,
        reference,
        mpesaReceipt: bridgeReceipt,
        conversationId: bridgeRef,
        timestamp: Date.now(),
        status: isCompletedNow ? 'COMPLETED' : 'PENDING',
        gatewayStatus: isCompletedNow
          ? 'DARAJA_CONFIRMED'
          : isAwaitingCallback || isStandalone
          ? 'AWAITING_MPESA_CALLBACK'
          : 'DERIV_CASHIER_REQUIRED',
        cashierUrl: isStandalone ? undefined : paymentAgentCashierUrl,
        note: isStandalone
          ? `Independent D Cash Transfer $${params.usdAmount.toFixed(2)} (KES ${params.kesAmount.toLocaleString()}) -> ${resolvedDcashTag} (${parsedPhone.local})${bridgeTransferUrl ? ` · URL: ${bridgeTransferUrl}` : ''}`
          : params.direction === 'DEPOSIT'
          ? `D Cash Deposit $${params.usdAmount.toFixed(2)} (KES ${params.kesAmount.toLocaleString()}) from ${parsedPhone.local} -> ${targetLoginId} via ${params.agentLoginId}`
          : `D Cash Real Withdrawal $${params.usdAmount.toFixed(2)} (KES ${params.kesAmount.toLocaleString()}) from ${realAccount.loginId} -> D Cash (${resolvedDcashTag} / ${parsedPhone.local})${
              livePaError ? ` · ${livePaError}` : ''
            }${bridgeTransferUrl ? ` · URL: ${bridgeTransferUrl}` : ''}`,
      };

      setCashierTransactions((prev) => [tx, ...prev]);

      if ((isAwaitingCallback || isBuiltInTracking) && bridgeRef) {
        pollDarajaTx(localTxId, bridgeRef, txType, params.usdAmount, creditReal);
      }

      if (!isStandalone && params.direction === 'DEPOSIT' && isCompletedNow) {
        if (creditReal) {
          setRealAccount((prev) => ({
            ...prev,
            balance: Number((prev.balance + params.usdAmount).toFixed(2)),
          }));
        }
        if ((creditReal && account.isReal) || (!creditReal && !account.isReal)) {
          setAccount((prev) => ({
            ...prev,
            balance: Number((prev.balance + params.usdAmount).toFixed(2)),
          }));
        }
      }

      if (txType === 'WITHDRAWAL') {
        soundManager.playCashOutSound();
      } else {
        soundManager.playWinSound();
      }

      const msg = livePaTxId
        ? `Live Deriv Payment Agent Real Withdrawal #${livePaTxId} executed via D Cash (${params.agentLoginId}) for $${params.usdAmount.toFixed(
            2
          )} USD (KES ${params.kesAmount.toLocaleString()}) to ${parsedPhone.local}.`
        : isStandalone
        ? `Independent D Cash Money Transfer ${reference} queued ($${params.usdAmount.toFixed(
            2
          )} USD = KES ${params.kesAmount.toLocaleString()} -> ${parsedPhone.local}) without Deriv dependency.`
        : bridgeConfigured
        ? `D Cash App ${params.direction.toLowerCase()} submitted (Ref: ${reference}) for KES ${params.kesAmount.toLocaleString()} (${parsedPhone.local}) — auto-confirmation active.`
        : `D Cash Bridge URL Order ${reference} created ($${params.usdAmount.toFixed(
            2
          )} USD = KES ${params.kesAmount.toLocaleString()} via ${params.agentName} for ${
            parsedPhone.local
          }). Confirm via Deriv Payment Agent Cashier, webhook callback, or enter M-Pesa code below.`;

      setActiveToast(
        isCompletedNow
          ? `D Cash Confirmed (${reference})`
          : isStandalone
          ? `D Cash Transfer ${reference} queued (Independent)`
          : isAwaitingCallback
          ? `D Cash order ${reference} submitted — auto-confirming...`
          : `D Cash Bridge URL order ${reference} active.`
      );

      return {
        success: true,
        pendingConfirmation: !isCompletedNow,
        liveExecuted: isCompletedNow,
        tx,
        cashierUrl: isStandalone ? undefined : paymentAgentCashierUrl,
        message: msg,
      };
    },
    [account.isReal, account.loginId, pollDarajaTx, realAccount.balance, realAccount.currency, realAccount.loginId, realAccount.token, safaricomPhone, updateSafaricomPhone]
  );

  const createValtexTransaction = useCallback(
    async (params: {
      direction: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
      usdAmount: number;
      kesAmount: number;
      phone: string;
      valtexAccountId?: string;
      targetAccount?: 'CURRENT' | 'REAL';
      fundingSource?: 'STANDALONE_GATEWAY' | 'DERIV_REAL';
    }) => {
      if (params.usdAmount < 10) {
        return { success: false, message: 'Minimum Valtex transaction is $10.00 USD.' };
      }

      const parsedPhone = normalizeKenyanPhone(params.phone || safaricomPhone);
      if (!parsedPhone.valid) {
        return {
          success: false,
          message: 'Enter a valid Safaricom M-Pesa number linked to your Valtex wallet (e.g. 0728424076 or +254793950512).',
        };
      }

      updateSafaricomPhone(parsedPhone.local);

      const resolvedFundingSource: 'STANDALONE_GATEWAY' | 'DERIV_REAL' =
        params.fundingSource || (params.direction === 'TRANSFER' ? 'STANDALONE_GATEWAY' : 'DERIV_REAL');
      const isStandalone = resolvedFundingSource === 'STANDALONE_GATEWAY';

      if (!isStandalone && params.direction === 'WITHDRAWAL' && params.usdAmount > realAccount.balance) {
        return {
          success: false,
          message: `Insufficient Deriv Real balance ($${realAccount.balance.toFixed(2)} available on ${realAccount.loginId}).`,
        };
      }

      const creditReal = isStandalone
        ? false
        : params.direction === 'WITHDRAWAL'
        ? true
        : params.targetAccount === 'REAL' || account.isReal;
      const targetLoginId = isStandalone ? undefined : creditReal ? realAccount.loginId : account.loginId;
      const resolvedValtexAccount = (params.valtexAccountId || parsedPhone.local).trim();

      try {
        const endpoint =
          params.direction === 'TRANSFER'
            ? '/api/valtex/v1/transfers'
            : params.direction === 'WITHDRAWAL'
            ? '/api/valtex/withdraw'
            : '/api/valtex/deposit';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            direction: params.direction,
            phone: parsedPhone.msisdn,
            valtexAccountId: resolvedValtexAccount,
            usdAmount: params.usdAmount,
            kesAmount: params.kesAmount,
            standalone: isStandalone,
            ...(targetLoginId ? { loginId: targetLoginId } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok || !data.reference) {
          return {
            success: false,
            message: String(data?.error || `Valtex gateway rejected request (HTTP ${res.status}).`),
          };
        }

        const remoteRef = String(data.reference);
        const isConfirmedNow = data.status === 'COMPLETED' && data.callbackVerified === true;
        const localTxId = `tx-vtx-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        const txType: 'DEPOSIT' | 'WITHDRAWAL' = params.direction === 'DEPOSIT' ? 'DEPOSIT' : 'WITHDRAWAL';

        if (!isStandalone) {
          if (params.direction === 'WITHDRAWAL') {
            const updatedBal = Number((realAccount.balance - params.usdAmount).toFixed(2));
            setRealAccount((prev) => ({ ...prev, balance: updatedBal }));
            if (account.isReal) {
              setAccount((prev) => ({ ...prev, balance: updatedBal }));
            }
          } else if (isConfirmedNow && params.direction === 'DEPOSIT') {
            if (creditReal) {
              setRealAccount((prev) => ({ ...prev, balance: Number((prev.balance + params.usdAmount).toFixed(2)) }));
            }
            if ((creditReal && account.isReal) || (!creditReal && !account.isReal)) {
              setAccount((prev) => ({ ...prev, balance: Number((prev.balance + params.usdAmount).toFixed(2)) }));
            }
          }
        }

        if (isConfirmedNow) {
          settledP2pTxIdsRef.current.add(localTxId);
        }

        const tx: CashierTransaction = {
          id: localTxId,
          type: txType,
          amount: Number(params.usdAmount.toFixed(2)),
          currency: 'USD',
          method: 'VALTEX',
          methodName:
            params.direction === 'TRANSFER'
              ? 'Valtex Money Transfer'
              : params.direction === 'DEPOSIT'
              ? 'Valtex App Deposit'
              : 'Valtex App Withdrawal',
          accountMode: creditReal ? 'REAL' : 'DEMO',
          loginId: isStandalone ? 'STANDALONE' : targetLoginId,
          standaloneTransfer: isStandalone,
          fundingSource: resolvedFundingSource,
          derivSynced: false,
          destinationOrSource: `Valtex (${resolvedValtexAccount}) · ${parsedPhone.formatted}`,
          recipientPhone: parsedPhone.local,
          recipientMsisdn: parsedPhone.msisdn,
          valtexAccountId: resolvedValtexAccount,
          callbackVerified: Boolean(isConfirmedNow),
          reference: data.mpesaReceipt || remoteRef,
          conversationId: remoteRef,
          mpesaReceipt: data.mpesaReceipt,
          timestamp: Date.now(),
          status: isConfirmedNow ? 'COMPLETED' : 'PENDING',
          gatewayStatus: isConfirmedNow ? 'VALTEX_CONFIRMED' : 'AWAITING_VALTEX_CALLBACK',
          gatewayEnvironment: txType === 'WITHDRAWAL' ? 'production' : mpesaGatewayStatus.environment,
          note: String(data.message || `Valtex ${params.direction.toLowerCase()} ${remoteRef} awaiting confirmation.`),
        };

        setCashierTransactions((prev) => [tx, ...prev]);
        if (!isConfirmedNow) {
          pollDarajaTx(localTxId, remoteRef, txType, params.usdAmount, creditReal);
        }

        if (txType === 'WITHDRAWAL') {
          soundManager.playCashOutSound();
        } else {
          soundManager.playWinSound();
        }
        setActiveToast(
          isConfirmedNow
            ? `Valtex ${params.direction.toLowerCase()} Confirmed (${remoteRef})`
            : `Valtex ${params.direction.toLowerCase()} (${remoteRef}) submitted — awaiting Valtex confirmation`
        );

        return {
          success: true,
          pendingConfirmation: !isConfirmedNow,
          confirmed: isConfirmedNow,
          tx,
          callbackUrl: data.callbackUrl,
          message: String(data.message || `Valtex transfer ${remoteRef} created.`),
        };
      } catch {
        return {
          success: false,
          message: 'Network error communicating with Valtex server bridge (/api/valtex/*).',
        };
      }
    },
    [account.isReal, account.loginId, mpesaGatewayStatus.environment, pollDarajaTx, realAccount.balance, realAccount.loginId, safaricomPhone, updateSafaricomPhone]
  );

  const verifyValtexTransactionStatus = useCallback(
    async (referenceOrId: string): Promise<{ ok: boolean; status?: string; message: string }> => {
      const target = cashierTransactionsRef.current.find(
        (t) => t.id === referenceOrId || t.conversationId === referenceOrId || t.reference === referenceOrId
      );
      const remoteRef = target?.conversationId || target?.reference || referenceOrId;
      try {
        const res = await fetch('/api/valtex/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: remoteRef }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.ok && data?.transaction) {
          if (target) {
            applyDarajaTxSettlement(
              target.id,
              remoteRef,
              data.transaction,
              target.type,
              target.amount,
              target.accountMode === 'REAL'
            );
          }
          return {
            ok: true,
            status: 'COMPLETED',
            message: String(data.transaction.safaricomConfirmationText || data.transaction.resultDesc || 'Confirmed by Valtex.'),
          };
        }
        if (data?.transaction?.status === 'REJECTED' && target) {
          applyDarajaTxSettlement(
            target.id,
            remoteRef,
            data.transaction,
            target.type,
            target.amount,
            target.accountMode === 'REAL'
          );
        }
        return {
          ok: false,
          status: String(data?.status || 'PENDING'),
          message: String(data?.error || 'Awaiting verified Valtex payment confirmation callback.'),
        };
      } catch {
        return {
          ok: false,
          message: 'Unable to reach /api/valtex/confirm.',
        };
      }
    },
    [applyDarajaTxSettlement]
  );

  // PayHero Kenya App: Deposit (STK), Withdrawal (M-Pesa/Mobile), & Money Transfer (Independent without Deriv by default)
  const createPayHeroTransaction = useCallback(
    async (params: {
      action: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
      usdAmount: number;
      kesAmount: number;
      phone?: string;
      transferRail?: 'mobile' | 'paybill' | 'till' | 'bank';
      accountNumber?: string;
      accountName?: string;
      accountReference?: string;
      bankCode?: string;
      networkCode?: string;
      targetAccount?: 'CURRENT' | 'REAL';
      fundingSource?: 'STANDALONE_GATEWAY' | 'DERIV_REAL';
    }) => {
      if (params.usdAmount < 10) {
        return { success: false, message: 'Minimum PayHero transaction is $10.00 USD.' };
      }

      const transferRail = params.transferRail || 'mobile';
      const parsedPhone = params.phone ? normalizeKenyanPhone(params.phone) : normalizeKenyanPhone(safaricomPhone);
      if (params.action !== 'TRANSFER' || transferRail === 'mobile') {
        if (!parsedPhone.valid) {
          return {
            success: false,
            message: 'Enter a valid Kenyan mobile number for PayHero (e.g. 0728424076 or +254793950512).',
          };
        }
        updateSafaricomPhone(parsedPhone.local);
      } else if (!params.accountNumber || params.accountNumber.trim().length < 4) {
        return {
          success: false,
          message: `Enter a valid ${transferRail.toUpperCase()} account/till/paybill number.`,
        };
      } else if (transferRail === 'bank' && !params.bankCode?.trim()) {
        return {
          success: false,
          message: 'Enter a valid PayHero bank code for bank transfer.',
        };
      }

      const resolvedFundingSource: 'STANDALONE_GATEWAY' | 'DERIV_REAL' =
        params.fundingSource || (params.action === 'TRANSFER' ? 'STANDALONE_GATEWAY' : 'DERIV_REAL');
      const isStandalone = resolvedFundingSource === 'STANDALONE_GATEWAY';
      const isDebit = params.action === 'WITHDRAWAL' || params.action === 'TRANSFER';

      if (!isStandalone && isDebit && params.usdAmount > realAccount.balance) {
        return {
          success: false,
          message: `Insufficient Deriv Real balance ($${realAccount.balance.toFixed(2)} available on ${realAccount.loginId}).`,
        };
      }

      const creditReal = isStandalone ? false : isDebit ? true : params.targetAccount === 'REAL' || account.isReal;
      const targetLoginId = isStandalone ? undefined : creditReal ? realAccount.loginId : account.loginId;

      try {
        const endpoint =
          params.action === 'DEPOSIT'
            ? '/api/payhero/deposit'
            : params.action === 'WITHDRAWAL'
            ? '/api/payhero/withdraw'
            : '/api/payhero/transfer';

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: params.action,
            transferRail,
            phone: parsedPhone.valid ? parsedPhone.msisdn : undefined,
            accountNumber: params.accountNumber?.trim(),
            accountName: params.accountName?.trim(),
            accountReference: params.accountReference?.trim(),
            bankCode: params.bankCode?.trim(),
            networkCode: params.networkCode?.trim() || '63902',
            usdAmount: params.usdAmount,
            kesAmount: params.kesAmount,
            standalone: isStandalone,
            ...(targetLoginId ? { loginId: targetLoginId } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok || !data.reference) {
          return {
            success: false,
            message: String(data?.error || `PayHero gateway rejected request (HTTP ${res.status}).`),
          };
        }

        const remoteRef = String(data.reference);
        const isConfirmedNow = data.status === 'COMPLETED' && data.callbackVerified === true;
        const localTxId = `tx-ph-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        const txDirection: 'DEPOSIT' | 'WITHDRAWAL' = isDebit ? 'WITHDRAWAL' : 'DEPOSIT';

        if (!isStandalone) {
          if (isDebit) {
            const updatedBal = Number((realAccount.balance - params.usdAmount).toFixed(2));
            setRealAccount((prev) => ({ ...prev, balance: updatedBal }));
            if (account.isReal) {
              setAccount((prev) => ({ ...prev, balance: updatedBal }));
            }
          } else if (isConfirmedNow) {
            if (creditReal) {
              setRealAccount((prev) => ({ ...prev, balance: Number((prev.balance + params.usdAmount).toFixed(2)) }));
            }
            if ((creditReal && account.isReal) || (!creditReal && !account.isReal)) {
              setAccount((prev) => ({ ...prev, balance: Number((prev.balance + params.usdAmount).toFixed(2)) }));
            }
          }
        }

        if (isConfirmedNow) {
          settledP2pTxIdsRef.current.add(localTxId);
        }

        const targetDisplay =
          data.targetLabel ||
          (transferRail !== 'mobile' && params.accountNumber
            ? `${transferRail.toUpperCase()} ${params.accountNumber}`
            : parsedPhone.formatted);

        const tx: CashierTransaction = {
          id: localTxId,
          type: txDirection,
          amount: Number(params.usdAmount.toFixed(2)),
          currency: 'USD',
          method: 'PAYHERO',
          methodName:
            params.action === 'DEPOSIT'
              ? 'PayHero STK Deposit'
              : params.action === 'WITHDRAWAL'
              ? isStandalone
                ? 'PayHero Direct Payout'
                : 'PayHero Withdrawal'
              : `PayHero Money Transfer (${transferRail.toUpperCase()})`,
          accountMode: creditReal ? 'REAL' : 'DEMO',
          loginId: isStandalone ? 'STANDALONE' : targetLoginId,
          standaloneTransfer: isStandalone,
          fundingSource: resolvedFundingSource,
          derivSynced: false,
          destinationOrSource: `PayHero · ${targetDisplay}`,
          recipientPhone: parsedPhone.valid ? parsedPhone.local : params.accountNumber?.trim(),
          recipientMsisdn: parsedPhone.valid ? parsedPhone.msisdn : params.accountNumber?.trim(),
          payheroAction: params.action,
          transferRail,
          callbackVerified: Boolean(isConfirmedNow),
          reference: data.mpesaReceipt || remoteRef,
          conversationId: remoteRef,
          mpesaReceipt: data.mpesaReceipt,
          timestamp: Date.now(),
          status: isConfirmedNow ? 'COMPLETED' : 'PENDING',
          gatewayStatus: isConfirmedNow ? 'PAYHERO_CONFIRMED' : 'AWAITING_PAYHERO_CALLBACK',
          gatewayEnvironment: 'production',
          note: String(data.message || `PayHero ${params.action.toLowerCase()} ${remoteRef} awaiting confirmation.`),
        };

        setCashierTransactions((prev) => [tx, ...prev]);
        if (!isConfirmedNow) {
          pollDarajaTx(localTxId, remoteRef, txDirection, params.usdAmount, creditReal);
        }

        if (isDebit) {
          soundManager.playCashOutSound();
        } else {
          soundManager.playWinSound();
        }
        setActiveToast(
          isConfirmedNow
            ? `PayHero ${params.action.toLowerCase()} Confirmed (${remoteRef})`
            : `PayHero ${params.action.toLowerCase()} (${remoteRef}) submitted — awaiting confirmation`
        );

        return {
          success: true,
          pendingConfirmation: !isConfirmedNow,
          confirmed: isConfirmedNow,
          tx,
          callbackUrl: data.callbackUrl,
          message: String(data.message || `PayHero ${params.action.toLowerCase()} ${remoteRef} created.`),
        };
      } catch {
        return {
          success: false,
          message: 'Network error communicating with PayHero server bridge (/api/payhero/*).',
        };
      }
    },
    [account.isReal, account.loginId, pollDarajaTx, realAccount.balance, realAccount.loginId, safaricomPhone, updateSafaricomPhone]
  );

  const verifyPayHeroTransactionStatus = useCallback(
    async (referenceOrId: string): Promise<{ ok: boolean; status?: string; message: string }> => {
      const target = cashierTransactionsRef.current.find(
        (t) => t.id === referenceOrId || t.conversationId === referenceOrId || t.reference === referenceOrId
      );
      const remoteRef = target?.conversationId || target?.reference || referenceOrId;
      try {
        const res = await fetch('/api/payhero/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: remoteRef }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.ok && data?.transaction) {
          if (target) {
            applyDarajaTxSettlement(
              target.id,
              remoteRef,
              data.transaction,
              target.type,
              target.amount,
              target.accountMode === 'REAL'
            );
          }
          return {
            ok: true,
            status: 'COMPLETED',
            message: String(data.transaction.safaricomConfirmationText || data.transaction.resultDesc || 'Confirmed by PayHero.'),
          };
        }
        if (data?.transaction?.status === 'REJECTED' && target) {
          applyDarajaTxSettlement(
            target.id,
            remoteRef,
            data.transaction,
            target.type,
            target.amount,
            target.accountMode === 'REAL'
          );
        }
        return {
          ok: false,
          status: String(data?.status || 'PENDING'),
          message: String(data?.error || 'Awaiting verified PayHero confirmation callback or API status.'),
        };
      } catch {
        return {
          ok: false,
          message: 'Unable to reach /api/payhero/confirm.',
        };
      }
    },
    [applyDarajaTxSettlement]
  );

  // KCB iBank & KCB App (Deposits, Withdrawals & Real Money Transfers)
  const createKcbDirectTransfer = useCallback(
    async (params: {
      action?: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
      kcbRail: 'kcb_account' | 'paybill_522522' | 'kcb_vooma' | 'pesalink';
      usdAmount: number;
      kesAmount: number;
      accountNumber?: string;
      accountName?: string;
      phone?: string;
      narration?: string;
      dispatchVia?: 'auto' | 'buni' | 'daraja_b2b' | 'daraja_stk' | 'payhero_bank' | 'bridge';
      fundingSource?: 'STANDALONE_GATEWAY' | 'DERIV_REAL';
      targetAccount?: 'CURRENT' | 'REAL';
    }) => {
      const action: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' = params.action || 'TRANSFER';
      if (params.usdAmount < 10) {
        return { success: false, message: `Minimum KCB iBank ${action.toLowerCase()} is $10.00 USD.` };
      }

      const resolvedFundingSource: 'STANDALONE_GATEWAY' | 'DERIV_REAL' =
        action === 'WITHDRAWAL'
          ? 'DERIV_REAL'
          : params.fundingSource || (action === 'TRANSFER' ? 'STANDALONE_GATEWAY' : 'DERIV_REAL');
      const isStandalone = resolvedFundingSource === 'STANDALONE_GATEWAY';
      const isDebit = action === 'WITHDRAWAL' || action === 'TRANSFER';

      if (!isStandalone && isDebit && params.usdAmount > realAccount.balance) {
        return {
          success: false,
          message: `Insufficient Deriv Real balance ($${realAccount.balance.toFixed(2)} available on ${realAccount.loginId}).`,
        };
      }

      const parsedPhone = params.phone ? normalizeKenyanPhone(params.phone) : null;
      const acct = (params.accountNumber || '').trim().replace(/\s+/g, '');
      if (params.kcbRail === 'kcb_vooma') {
        if (!parsedPhone || !parsedPhone.valid) {
          return {
            success: false,
            message: 'Enter a valid Kenyan mobile number registered on KCB App / Vooma (e.g. 0728424076).',
          };
        }
        updateSafaricomPhone(parsedPhone.local);
      } else if (action !== 'DEPOSIT' && !/^[A-Za-z0-9-]{6,20}$/.test(acct)) {
        return {
          success: false,
          message: 'Enter a valid KCB iBank Account Number (6–20 digits/alphanumeric characters).',
        };
      } else if (acct && !/^[A-Za-z0-9-]{4,24}$/.test(acct)) {
        return {
          success: false,
          message: 'KCB Account reference must be 4–24 alphanumeric or digit characters.',
        };
      }

      const creditReal = isStandalone ? false : isDebit ? true : params.targetAccount === 'REAL' || account.isReal;
      const targetLoginId = isStandalone ? undefined : creditReal ? realAccount.loginId : account.loginId;

      try {
        const endpoint =
          action === 'DEPOSIT'
            ? '/api/kcb/deposit'
            : action === 'WITHDRAWAL'
            ? '/api/kcb/withdraw'
            : '/api/kcb/transfer';

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            kcbRail: params.kcbRail,
            usdAmount: params.usdAmount,
            kesAmount: params.kesAmount,
            accountNumber: acct || undefined,
            accountName: params.accountName?.trim() || undefined,
            phone: parsedPhone?.valid ? parsedPhone.msisdn : undefined,
            narration: params.narration?.trim() || undefined,
            dispatchVia: params.dispatchVia || 'auto',
            standalone: isStandalone,
            ...(targetLoginId ? { loginId: targetLoginId } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok || !data.reference) {
          return {
            success: false,
            message: String(data?.error || `KCB iBank gateway rejected request (HTTP ${res.status}).`),
          };
        }

        const remoteRef = String(data.reference);
        const isConfirmedNow = data.status === 'COMPLETED' && data.callbackVerified === true;
        const localTxId = `tx-kcb-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        const txDirection: 'DEPOSIT' | 'WITHDRAWAL' = isDebit ? 'WITHDRAWAL' : 'DEPOSIT';

        if (!isStandalone) {
          if (isDebit) {
            const updatedBal = Number((realAccount.balance - params.usdAmount).toFixed(2));
            setRealAccount((prev) => ({ ...prev, balance: updatedBal }));
            if (account.isReal) {
              setAccount((prev) => ({ ...prev, balance: updatedBal }));
            }
          } else if (isConfirmedNow) {
            if (creditReal) {
              setRealAccount((prev) => ({ ...prev, balance: Number((prev.balance + params.usdAmount).toFixed(2)) }));
            }
            if ((creditReal && account.isReal) || (!creditReal && !account.isReal)) {
              setAccount((prev) => ({ ...prev, balance: Number((prev.balance + params.usdAmount).toFixed(2)) }));
            }
          }
        }
        if (isConfirmedNow) {
          settledP2pTxIdsRef.current.add(localTxId);
        }

        const targetDisplay =
          data.targetLabel ||
          (params.kcbRail === 'kcb_vooma' && parsedPhone?.valid
            ? `KCB Vooma (${parsedPhone.formatted})`
            : `KCB iBank Account ${acct || data.kcbAccountNumber || '522522'}`);

        const railSuffix =
          params.kcbRail === 'paybill_522522'
            ? 'Paybill 522522'
            : params.kcbRail === 'kcb_vooma'
            ? 'Vooma'
            : params.kcbRail === 'pesalink'
            ? 'PesaLink'
            : 'IFT';

        const tx: CashierTransaction = {
          id: localTxId,
          type: txDirection,
          amount: Number(params.usdAmount.toFixed(2)),
          currency: 'USD',
          method: 'KCB_BANK',
          methodName:
            action === 'DEPOSIT'
              ? `KCB iBank Deposit (${railSuffix})`
              : action === 'WITHDRAWAL'
              ? `KCB iBank Withdrawal (${railSuffix})`
              : `KCB iBank Money Transfer (${railSuffix})`,
          accountMode: isStandalone ? 'DEMO' : creditReal ? 'REAL' : 'DEMO',
          loginId: isStandalone ? 'STANDALONE' : targetLoginId,
          standaloneTransfer: isStandalone,
          fundingSource: resolvedFundingSource,
          derivSynced: false,
          destinationOrSource: targetDisplay,
          recipientPhone: parsedPhone?.valid ? parsedPhone.local : acct,
          recipientMsisdn: parsedPhone?.valid ? parsedPhone.msisdn : acct,
          kcbAction: action,
          kcbTransferRail: params.kcbRail,
          kcbAccountNumber: acct || data.kcbAccountNumber || (parsedPhone?.local ?? ''),
          kcbAccountName: params.accountName?.trim() || undefined,
          callbackVerified: Boolean(isConfirmedNow),
          reference: data.mpesaReceipt || remoteRef,
          conversationId: remoteRef,
          mpesaReceipt: data.mpesaReceipt,
          timestamp: Date.now(),
          status: isConfirmedNow ? 'COMPLETED' : 'PENDING',
          gatewayStatus: isConfirmedNow ? 'KCB_CONFIRMED' : 'AWAITING_KCB_CALLBACK',
          gatewayEnvironment: 'production',
          note: String(data.message || `KCB iBank ${action.toLowerCase()} ${remoteRef} awaiting confirmation.`),
        };

        setCashierTransactions((prev) => [tx, ...prev]);
        if (!isConfirmedNow) {
          pollDarajaTx(localTxId, remoteRef, txDirection, params.usdAmount, creditReal);
        }

        if (isDebit) {
          soundManager.playCashOutSound();
        } else {
          soundManager.playWinSound();
        }
        setActiveToast(
          isConfirmedNow
            ? `KCB iBank ${action.toLowerCase()} Confirmed (${remoteRef})`
            : `KCB iBank ${action.toLowerCase()} (${remoteRef}) queued — awaiting confirmation`
        );

        return {
          success: true,
          pendingConfirmation: !isConfirmedNow,
          confirmed: isConfirmedNow,
          tx,
          callbackUrl: data.callbackUrl,
          message: String(data.message || `KCB iBank ${action.toLowerCase()} ${remoteRef} submitted.`),
        };
      } catch {
        return {
          success: false,
          message: 'Network error communicating with KCB iBank gateway bridge (/api/kcb/*).',
        };
      }
    },
    [account.isReal, account.loginId, pollDarajaTx, realAccount.balance, realAccount.loginId, updateSafaricomPhone]
  );

  const verifyKcbTransferStatus = useCallback(
    async (referenceOrId: string): Promise<{ ok: boolean; status?: string; message: string }> => {
      const target = cashierTransactionsRef.current.find(
        (t) => t.id === referenceOrId || t.conversationId === referenceOrId || t.reference === referenceOrId
      );
      const remoteRef = target?.conversationId || target?.reference || referenceOrId;
      try {
        const res = await fetch('/api/kcb/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: remoteRef }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.ok && data?.transaction) {
          if (target) {
            applyDarajaTxSettlement(
              target.id,
              remoteRef,
              data.transaction,
              target.type,
              target.amount,
              target.accountMode === 'REAL'
            );
          }
          return {
            ok: true,
            status: 'COMPLETED',
            message: String(data.transaction.safaricomConfirmationText || data.transaction.resultDesc || 'Confirmed by KCB Bank.'),
          };
        }
        if (data?.transaction?.status === 'REJECTED' && target) {
          applyDarajaTxSettlement(
            target.id,
            remoteRef,
            data.transaction,
            target.type,
            target.amount,
            target.accountMode === 'REAL'
          );
        }
        return {
          ok: false,
          status: String(data?.status || 'PENDING'),
          message: String(data?.error || 'Awaiting verified KCB Buni IPN callback or bank receipt.'),
        };
      } catch {
        return {
          ok: false,
          message: 'Unable to reach /api/kcb/confirm.',
        };
      }
    },
    [applyDarajaTxSettlement]
  );

  // Automatic Trade Rules & Signals State
  const [isAutoTradeActive, setIsAutoTradeActive] = useState<boolean>(false);
  const [autoTradeRules, setAutoTradeRules] = useState<AutoTradeRule[]>(() => {
    try {
      const saved = localStorage.getItem('nderiskool_autotrade_rules');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'rule-1',
        name: 'Deriv Volatility 75 Accumulator Compounder',
        symbol: 'R_75',
        strategyType: 'VOLATILITY_ACCUMULATOR',
        contractType: 'ACCUMULATOR',
        stake: 25,
        growthRate: 0.03,
        takeProfitTarget: 50,
        stopLossLimit: 25,
        isActive: true,
        maxDailyTrades: 10,
        tradesToday: 2,
        totalProfit: 48.60,
      },
      {
        id: 'rule-2',
        name: 'EUR/USD Trend Follower (EMA Cross)',
        symbol: 'frxEURUSD',
        strategyType: 'TREND_FOLLOW',
        contractType: 'MULTIPLIER',
        stake: 50,
        multiplier: 50,
        takeProfitTarget: 30,
        stopLossLimit: 25,
        isActive: true,
        maxDailyTrades: 5,
        tradesToday: 1,
        totalProfit: 28.50,
      },
    ];
  });

  const [tradeSignals, setTradeSignals] = useState<TradeSignal[]>([
    {
      id: 'sig-1',
      symbol: 'R_75',
      symbolName: 'Volatility 75 Index',
      direction: 'BUY',
      contractType: 'ACCUMULATOR',
      confidence: 88,
      reason: 'Bollinger Band compression + low volatility breakout detected for 3% accumulator expansion.',
      timestamp: Date.now() - 120000,
      entryPrice: 98450.2,
      targetPrice: 98720.0,
      stopLossPrice: 98200.0,
    },
    {
      id: 'sig-2',
      symbol: 'frxEURUSD',
      symbolName: 'EUR/USD',
      direction: 'BUY',
      contractType: 'MULTIPLIER',
      confidence: 82,
      reason: 'EMA 9 crossed above EMA 21 with positive MACD divergence on 1M chart.',
      timestamp: Date.now() - 360000,
      entryPrice: 1.0845,
      targetPrice: 1.0875,
      stopLossPrice: 1.0825,
    },
    {
      id: 'sig-3',
      symbol: 'frxXAUUSD',
      symbolName: 'Gold (XAU/USD)',
      direction: 'BUY',
      contractType: 'RISE_FALL',
      confidence: 78,
      reason: 'RSI(14) rebound from oversold (32.4) near support zone.',
      timestamp: Date.now() - 600000,
      entryPrice: 2685.4,
      targetPrice: 2692.0,
      stopLossPrice: 2679.0,
    },
  ]);

  // Price Alerts
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>(() => {
    try {
      const saved = localStorage.getItem('nderiskool_alerts');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'alt-1',
        symbol: 'frxEURUSD',
        symbolName: 'EUR/USD',
        targetPrice: 1.0880,
        condition: 'ABOVE',
        createdAt: Date.now() - 3600000,
        triggered: false,
      },
    ];
  });
  const [activeToast, setActiveToast] = useState<string | null>(null);

  // Deriv Bot Strategy State
  const [botStrategy, setBotStrategy] = useState<BotStrategy>(() => {
    try {
      const saved = localStorage.getItem('nderiskool_bot');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      id: 'bot-1',
      name: 'nderiskool DBot Scalper',
      description: 'Automated trend crossover & Martingale risk manager for Deriv volatility and Forex',
      symbol: 'frxEURUSD',
      strategyType: 'EMA_CROSS',
      baseStake: 10,
      currentStake: 10,
      multiplierFactor: 2.0,
      takeProfitTarget: 150,
      stopLossLimit: 100,
      durationSeconds: 30,
      isRunning: false,
      totalRuns: 0,
      wins: 0,
      losses: 0,
      netProfit: 0,
    };
  });

  const [botLogs, setBotLogs] = useState<BotLog[]>(() => [
    {
      id: 'log-1',
      timestamp: Date.now() - 60000,
      message: 'nderiskool Deriv Bot initialized and ready.',
      type: 'INFO',
    },
  ]);

  // Sync positions to storage
  useEffect(() => {
    try {
      localStorage.setItem('nderiskool_positions', JSON.stringify(activePositions));
    } catch {}
  }, [activePositions]);

  // Sync history to storage
  useEffect(() => {
    try {
      localStorage.setItem('nderiskool_history', JSON.stringify(tradeHistory));
    } catch {}
  }, [tradeHistory]);

  // Sync account & realAccount to storage
  useEffect(() => {
    try {
      localStorage.setItem('nderiskool_deriv_acc', JSON.stringify(account));
      if (!account.isReal) {
        localStorage.setItem('nderiskool_deriv_demo_acc', JSON.stringify(account));
      } else {
        setRealAccount((prev) => {
          if (
            prev.balance === account.balance &&
            prev.loginId === account.loginId &&
            prev.token === account.token
          ) {
            return prev;
          }
          return account;
        });
      }
    } catch {}
  }, [account]);

  useEffect(() => {
    try {
      localStorage.setItem('nderiskool_deriv_real_acc', JSON.stringify(realAccount));
    } catch {}
  }, [realAccount]);

  // Re-authorize persisted live Deriv token on startup
  useEffect(() => {
    if (realAccount.token && realAccount.token !== 'CR-NDERISKOOL-LIVE') {
      derivWsService.authorize(realAccount.token).catch(() => {});
      const unsub = derivWsService.onBalanceChange((newBal, curr) => {
        setRealAccount((prev) => ({ ...prev, balance: newBal, currency: curr }));
        setAccount((prev) => (prev.isReal ? { ...prev, balance: newBal, currency: curr } : prev));
      });
      return () => {
        unsub();
      };
    }
  }, [realAccount.token]);

  // Load candles on active symbol or timeframe change
  const loadCandles = useCallback(async (symbol: string, tf: number) => {
    const historical = await derivWsService.fetchHistoricalCandles(symbol, tf, 90);
    setCandles(historical);
  }, []);

  useEffect(() => {
    loadCandles(activeSymbol.symbol, timeframe);
  }, [activeSymbol.symbol, timeframe, loadCandles]);

  // Subscribe to ticks
  useEffect(() => {
    derivWsService.subscribeTicks(activeSymbol.symbol);
    const tickHandler = (tick: Tick) => {
      setLastTick(tick);
      setIsWsConnected(true);

      // Extract tick last digit for Over/Under contracts
      const isJpy = tick.symbol.includes('JPY');
      const dec = isJpy ? 3 : tick.symbol.startsWith('R_') ? 2 : 5;
      const parsedLastDigit = Math.abs(parseInt(tick.quote.toFixed(dec).slice(-1), 10)) % 10;
      setRecentDigits((prev) => [parsedLastDigit, ...prev.slice(0, 19)]);

      // Decrement remaining ticks for tick-based active positions
      setActivePositions((prev) =>
        prev.map((p) => {
          if (p.symbol === tick.symbol && p.remainingTicks !== undefined && p.remainingTicks > 0) {
            return {
              ...p,
              remainingTicks: p.remainingTicks - 1,
              lastDigit: parsedLastDigit,
              currentPrice: tick.quote,
            };
          }
          return p;
        })
      );

      // Update current market quote
      setMarkets((prev) =>
        prev.map((m) => {
          if (m.symbol === tick.symbol) {
            const spread = tick.ask && tick.bid ? Number(((tick.ask - tick.bid) / m.pipSize).toFixed(1)) : m.spreadPips;
            return {
              ...m,
              currentPrice: tick.quote,
              ask: tick.ask || tick.quote + (tick.quote * 0.0001),
              bid: tick.bid || tick.quote - (tick.quote * 0.0001),
              spreadPips: spread,
            };
          }
          return m;
        })
      );

      // Check price alerts for this symbol
      setPriceAlerts((prevAlerts) =>
        prevAlerts.map((alt) => {
          if (!alt.triggered && alt.symbol === tick.symbol) {
            const hit =
              (alt.condition === 'ABOVE' && tick.quote >= alt.targetPrice) ||
              (alt.condition === 'BELOW' && tick.quote <= alt.targetPrice);
            if (hit) {
              soundManager.playWinSound();
              setActiveToast(`PRICE ALERT: ${alt.symbolName} reached ${tick.quote}!`);
              return { ...alt, triggered: true, triggeredAt: Date.now() };
            }
          }
          return alt;
        })
      );

      // Update candles with real-time tick
      setCandles((prev) => {
        if (!prev.length) return prev;
        const lastCandle = prev[prev.length - 1];
        const now = tick.epoch;

        if (now - lastCandle.epoch < timeframe) {
          // Update the open candle
          const updated: Candle = {
            ...lastCandle,
            high: Math.max(lastCandle.high, tick.quote),
            low: Math.min(lastCandle.low, tick.quote),
            close: tick.quote,
          };
          return [...prev.slice(0, -1), updated];
        } else {
          // Start new candle
          const newCandle: Candle = {
            epoch: now,
            open: tick.quote,
            high: tick.quote,
            low: tick.quote,
            close: tick.quote,
            volume: 1,
          };
          return [...prev.slice(1), newCandle];
        }
      });
    };

    derivWsService.subscribeTicks(activeSymbol.symbol, tickHandler);

    return () => {
      derivWsService.unsubscribeTicks(tickHandler);
    };
  }, [activeSymbol.symbol, timeframe]);

  // Continuous monitoring for open positions (Floating P&L, TP/SL, Rise/Fall Expiry)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);

      setActivePositions((prevPositions) => {
        if (!prevPositions.length) return prevPositions;

        const updated: ActivePosition[] = [];
        const closed: TradeRecord[] = [];

        for (const pos of prevPositions) {
          const market = markets.find((m) => m.symbol === pos.symbol) || activeSymbol;
          const currentPrice = market.currentPrice;

          // Check for Rise/Fall expiration
          if (pos.type === 'RISE_FALL' && pos.expiryEpoch && now >= pos.expiryEpoch) {
            const won =
              (pos.direction === 'BUY' && currentPrice > pos.entryPrice) ||
              (pos.direction === 'SELL' && currentPrice < pos.entryPrice);

            const pnl = won ? Number((pos.stake * 0.95).toFixed(2)) : -pos.stake;
            const pnlPercentage = won ? 95 : -100;

            if (won) soundManager.playWinSound();
            else soundManager.playLossSound();

            closed.push({
              id: pos.id,
              symbol: pos.symbol,
              symbolName: pos.symbolName,
              type: pos.type,
              direction: pos.direction,
              stake: pos.stake,
              multiplier: pos.multiplier,
              entryPrice: pos.entryPrice,
              exitPrice: currentPrice,
              entryEpoch: pos.entryEpoch,
              exitEpoch: now,
              pnl,
              pnlPercentage,
              status: won ? 'WON' : 'LOST',
            });

            // Update bot statistics if position belonged to Deriv DBot
            if (pos.id.startsWith('bot-pos-')) {
              setBotStrategy((b) => {
                const totalRuns = b.totalRuns + 1;
                const wins = won ? b.wins + 1 : b.wins;
                const losses = won ? b.losses : b.losses + 1;
                const netProfit = Number((b.netProfit + pnl).toFixed(2));
                const currentStake = won
                  ? b.baseStake
                  : Math.min(500, Number((b.currentStake * b.multiplierFactor).toFixed(2)));

                let isRunning = b.isRunning;
                if (netProfit >= b.takeProfitTarget) {
                  isRunning = false;
                  setBotLogs((l) => [
                    {
                      id: `log-${Date.now()}-tp`,
                      timestamp: Date.now(),
                      message: `TAKE PROFIT TARGET REACHED (+$${netProfit.toFixed(2)})! Deriv Bot safely stopped.`,
                      type: 'ALERT',
                    },
                    ...l,
                  ]);
                } else if (netProfit <= -b.stopLossLimit) {
                  isRunning = false;
                  setBotLogs((l) => [
                    {
                      id: `log-${Date.now()}-sl`,
                      timestamp: Date.now(),
                      message: `STOP LOSS LIMIT REACHED (-$${Math.abs(netProfit).toFixed(2)})! Deriv Bot stopped to preserve capital.`,
                      type: 'ALERT',
                    },
                    ...l,
                  ]);
                }

                return {
                  ...b,
                  totalRuns,
                  wins,
                  losses,
                  netProfit,
                  currentStake,
                  isRunning,
                };
              });

              setBotLogs((l) => [
                {
                  id: `log-${Date.now()}`,
                  timestamp: Date.now(),
                  message: won
                    ? `Bot Contract Won! (+$${pnl.toFixed(2)}). Stake reset to $${botStrategy.baseStake}.`
                    : `Bot Contract Expired OTM (-$${pos.stake}). Martingale scaled stake to $${(pos.stake * botStrategy.multiplierFactor).toFixed(2)}.`,
                  type: won ? 'WIN' : 'LOSS',
                },
                ...l,
              ]);
            }

            // Update account balance
            setAccount((acc) => ({
              ...acc,
              balance: Number((acc.balance + pos.stake + pnl).toFixed(2)),
            }));
            continue;
          }

          // Check for Higher / Lower (Barrier) contract expiration
          if (pos.type === 'HIGHER_LOWER' && ((pos.expiryEpoch && now >= pos.expiryEpoch) || (pos.remainingTicks !== undefined && pos.remainingTicks <= 0))) {
            const barrier = pos.barrier ?? pos.entryPrice;
            // SELL = LOWER (predicts exit price strictly lower than barrier)
            // BUY = HIGHER (predicts exit price strictly higher than barrier)
            const won =
              (pos.direction === 'SELL' && currentPrice < barrier) ||
              (pos.direction === 'BUY' && currentPrice > barrier);

            const payoutMult = pos.payoutMultiplier || 1.95;
            const pnl = won ? Number((pos.stake * (payoutMult - 1)).toFixed(2)) : -pos.stake;
            const pnlPercentage = won ? Number(((payoutMult - 1) * 100).toFixed(1)) : -100;

            if (won) {
              soundManager.playWinSound();
              setActiveToast(`LOWER/HIGHER Trade WON! Exit (${currentPrice}) was ${pos.direction === 'SELL' ? 'below' : 'above'} barrier (${barrier}). +$${pnl.toFixed(2)}`);
            } else {
              soundManager.playLossSound();
              setActiveToast(`LOWER/HIGHER Trade Lost. Exit (${currentPrice}) did not finish ${pos.direction === 'SELL' ? 'below' : 'above'} barrier. -$${pos.stake}`);
            }

            closed.push({
              id: pos.id,
              symbol: pos.symbol,
              symbolName: pos.symbolName,
              type: pos.type,
              direction: pos.direction,
              stake: pos.stake,
              multiplier: 1,
              entryPrice: pos.entryPrice,
              exitPrice: currentPrice,
              barrier,
              entryEpoch: pos.entryEpoch,
              exitEpoch: now,
              pnl,
              pnlPercentage,
              status: won ? 'WON' : 'LOST',
            });

            setAccount((acc) => ({
              ...acc,
              balance: Number((acc.balance + pos.stake + pnl).toFixed(2)),
            }));
            continue;
          }

          // Check for Digit Over / Under contract expiration
          if (pos.type === 'DIGIT_UNDER_OVER' && ((pos.expiryEpoch && now >= pos.expiryEpoch) || (pos.remainingTicks !== undefined && pos.remainingTicks <= 0))) {
            const isJpy = pos.symbol.includes('JPY');
            const dec = isJpy ? 3 : pos.symbol.startsWith('R_') ? 2 : 5;
            const exitDigit = Math.abs(parseInt(currentPrice.toFixed(dec).slice(-1), 10)) % 10;
            const targetDigit = pos.selectedDigit ?? 5;

            // SELL = UNDER (predicts exit digit strictly less than targetDigit)
            // BUY = OVER (predicts exit digit strictly greater than targetDigit)
            const won =
              (pos.direction === 'SELL' && exitDigit < targetDigit) ||
              (pos.direction === 'BUY' && exitDigit > targetDigit);

            const payoutMult = pos.payoutMultiplier || 1.95;
            const pnl = won ? Number((pos.stake * (payoutMult - 1)).toFixed(2)) : -pos.stake;
            const pnlPercentage = won ? Number(((payoutMult - 1) * 100).toFixed(1)) : -100;

            if (won) {
              soundManager.playWinSound();
              setActiveToast(`UNDER/OVER Digit WON! Exit digit ${exitDigit} is ${pos.direction === 'SELL' ? 'UNDER' : 'OVER'} ${targetDigit}. +$${pnl.toFixed(2)}`);
            } else {
              soundManager.playLossSound();
              setActiveToast(`UNDER/OVER Digit Lost. Exit digit ${exitDigit} is not ${pos.direction === 'SELL' ? 'UNDER' : 'OVER'} ${targetDigit}. -$${pos.stake}`);
            }

            closed.push({
              id: pos.id,
              symbol: pos.symbol,
              symbolName: pos.symbolName,
              type: pos.type,
              direction: pos.direction,
              stake: pos.stake,
              multiplier: 1,
              entryPrice: pos.entryPrice,
              exitPrice: currentPrice,
              selectedDigit: targetDigit,
              exitDigit,
              entryEpoch: pos.entryEpoch,
              exitEpoch: now,
              pnl,
              pnlPercentage,
              status: won ? 'WON' : 'LOST',
            });

            setAccount((acc) => ({
              ...acc,
              balance: Number((acc.balance + pos.stake + pnl).toFixed(2)),
            }));
            continue;
          }

          // Calculate Accumulator tick compounding and barrier knockout
          if (pos.type === 'ACCUMULATOR') {
            const growthRate = pos.growthRate || 0.02;
            const barrierDelta = (market.pipSize * 30) || (currentPrice * 0.0005);
            const lower = pos.lowerBarrier ?? (pos.entryPrice - barrierDelta);
            const upper = pos.upperBarrier ?? (pos.entryPrice + barrierDelta);

            // Check if current tick breached barrier (Knockout)
            const isKnockedOut = currentPrice < lower || currentPrice > upper;

            if (isKnockedOut) {
              soundManager.playLossSound();
              setActiveToast(`Accumulator Knockout! Price breached barrier after ${pos.tickCount || 0} ticks.`);
              closed.push({
                id: pos.id,
                symbol: pos.symbol,
                symbolName: pos.symbolName,
                type: pos.type,
                direction: pos.direction,
                stake: pos.stake,
                multiplier: 1,
                entryPrice: pos.entryPrice,
                exitPrice: currentPrice,
                entryEpoch: pos.entryEpoch,
                exitEpoch: now,
                pnl: -pos.stake,
                pnlPercentage: -100,
                status: 'LOST',
              });
              continue;
            } else {
              // Tick stayed within barrier -> compound!
              const nextTicks = (pos.tickCount || 0) + 1;
              const nextPayout = Number((pos.stake * Math.pow(1 + growthRate, nextTicks)).toFixed(2));
              const nextPnl = Number((nextPayout - pos.stake).toFixed(2));
              const nextPnlPct = Number(((nextPnl / pos.stake) * 100).toFixed(1));

              // Auto take profit triggers
              const hitProfitTarget = pos.takeProfitProfit && nextPnl >= pos.takeProfitProfit;
              const hitTickTarget = pos.takeProfitTicks && nextTicks >= pos.takeProfitTicks;

              if (hitProfitTarget || hitTickTarget) {
                soundManager.playCashOutSound();
                setActiveToast(`Accumulator Auto Cash Out! +$${nextPnl.toFixed(2)} (${nextTicks} ticks)`);
                closed.push({
                  id: pos.id,
                  symbol: pos.symbol,
                  symbolName: pos.symbolName,
                  type: pos.type,
                  direction: pos.direction,
                  stake: pos.stake,
                  multiplier: 1,
                  entryPrice: pos.entryPrice,
                  exitPrice: currentPrice,
                  entryEpoch: pos.entryEpoch,
                  exitEpoch: now,
                  pnl: nextPnl,
                  pnlPercentage: nextPnlPct,
                  status: 'WON',
                });
                setAccount((acc) => ({
                  ...acc,
                  balance: Number((acc.balance + nextPayout).toFixed(2)),
                }));
                continue;
              }

              // Shift barrier for the next tick
              const nextUpper = currentPrice + barrierDelta;
              const nextLower = currentPrice - barrierDelta;

              updated.push({
                ...pos,
                currentPrice,
                tickCount: nextTicks,
                currentPayout: nextPayout,
                upperBarrier: nextUpper,
                lowerBarrier: nextLower,
                pnl: nextPnl,
                pnlPercentage: nextPnlPct,
              });
              continue;
            }
          }

          // Calculate Multiplier / CFD floating P&L
          let pnl = 0;
          let pnlPercentage = 0;
          if (pos.type === 'MULTIPLIER') {
            const priceDelta = currentPrice - pos.entryPrice;
            const factor = pos.direction === 'BUY' ? 1 : -1;
            const relativeMove = (priceDelta / pos.entryPrice) * factor;
            pnlPercentage = Number((relativeMove * pos.multiplier * 100).toFixed(2));
            pnl = Number(((pos.stake * pnlPercentage) / 100).toFixed(2));

            // Max loss bounded to stake (no negative balance debt)
            if (pnl <= -pos.stake) {
              pnl = -pos.stake;
              pnlPercentage = -100;
              soundManager.playLossSound();
              closed.push({
                id: pos.id,
                symbol: pos.symbol,
                symbolName: pos.symbolName,
                type: pos.type,
                direction: pos.direction,
                stake: pos.stake,
                multiplier: pos.multiplier,
                entryPrice: pos.entryPrice,
                exitPrice: currentPrice,
                entryEpoch: pos.entryEpoch,
                exitEpoch: now,
                pnl,
                pnlPercentage,
                status: 'LOST',
              });
              continue;
            }

            // Check Take Profit hit
            if (pos.takeProfitPrice) {
              const tpHit =
                (pos.direction === 'BUY' && currentPrice >= pos.takeProfitPrice) ||
                (pos.direction === 'SELL' && currentPrice <= pos.takeProfitPrice);
              if (tpHit) {
                soundManager.playWinSound();
                closed.push({
                  id: pos.id,
                  symbol: pos.symbol,
                  symbolName: pos.symbolName,
                  type: pos.type,
                  direction: pos.direction,
                  stake: pos.stake,
                  multiplier: pos.multiplier,
                  entryPrice: pos.entryPrice,
                  exitPrice: currentPrice,
                  entryEpoch: pos.entryEpoch,
                  exitEpoch: now,
                  pnl,
                  pnlPercentage,
                  status: 'WON',
                });
                setAccount((acc) => ({
                  ...acc,
                  balance: Number((acc.balance + pos.stake + pnl).toFixed(2)),
                }));
                continue;
              }
            }

            // Check Stop Loss hit
            if (pos.stopLossPrice) {
              const slHit =
                (pos.direction === 'BUY' && currentPrice <= pos.stopLossPrice) ||
                (pos.direction === 'SELL' && currentPrice >= pos.stopLossPrice);
              if (slHit) {
                soundManager.playLossSound();
                closed.push({
                  id: pos.id,
                  symbol: pos.symbol,
                  symbolName: pos.symbolName,
                  type: pos.type,
                  direction: pos.direction,
                  stake: pos.stake,
                  multiplier: pos.multiplier,
                  entryPrice: pos.entryPrice,
                  exitPrice: currentPrice,
                  entryEpoch: pos.entryEpoch,
                  exitEpoch: now,
                  pnl,
                  pnlPercentage,
                  status: 'LOST',
                });
                setAccount((acc) => ({
                  ...acc,
                  balance: Number((acc.balance + pos.stake + pnl).toFixed(2)),
                }));
                continue;
              }
            }
          }

          updated.push({
            ...pos,
            currentPrice,
            pnl,
            pnlPercentage,
          });
        }

        if (closed.length) {
          setTradeHistory((hist) => [...closed, ...hist]);
        }

        return updated;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [markets, activeSymbol]);

  // Execute trade
  const executeTrade = useCallback(
    (params: {
      type: OrderType;
      direction: Direction;
      stake: number;
      multiplier?: number;
      durationSeconds?: number;
      durationTicks?: number;
      barrier?: number;
      barrierOffsetPips?: number;
      selectedDigit?: number;
      payoutMultiplier?: number;
      takeProfit?: number;
      stopLoss?: number;
      growthRate?: number;
      takeProfitProfit?: number;
      takeProfitTicks?: number;
    }) => {
      if (account.balance < params.stake) {
        setActiveToast('Insufficient account balance. Please deposit funds in Cashier.');
        soundManager.playLossSound();
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const entryPrice = activeSymbol.currentPrice;

      // Sound
      if (params.type === 'ACCUMULATOR') {
        soundManager.playBuySound();
      } else if (params.direction === 'BUY') {
        soundManager.playBuySound();
      } else {
        soundManager.playSellSound();
      }

      // Deduct stake from balance
      setAccount((acc) => ({
        ...acc,
        balance: Number((acc.balance - params.stake).toFixed(2)),
      }));

      const growthRate = params.growthRate || 0.02;
      const barrierDelta = activeSymbol.pipSize * 30 || entryPrice * 0.0005;

      // Expiry calculation
      let expiryEpoch: number | undefined;
      if (params.type === 'RISE_FALL' || params.type === 'HIGHER_LOWER') {
        expiryEpoch = now + (params.durationSeconds || 60);
      } else if (params.type === 'DIGIT_UNDER_OVER') {
        expiryEpoch = params.durationSeconds
          ? now + params.durationSeconds
          : now + Math.max(5, (params.durationTicks || 5) * 2);
      }

      const newPosition: ActivePosition = {
        id: `pos-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        symbol: activeSymbol.symbol,
        symbolName: activeSymbol.displayName,
        type: params.type,
        direction: params.direction,
        stake: params.stake,
        multiplier: params.multiplier || 50,
        growthRate,
        tickCount: 0,
        currentPayout: params.stake,
        upperBarrier: entryPrice + barrierDelta,
        lowerBarrier: entryPrice - barrierDelta,
        barrier: params.barrier,
        barrierOffsetPips: params.barrierOffsetPips,
        selectedDigit: params.selectedDigit,
        targetDigit: params.selectedDigit,
        durationTicks: params.durationTicks,
        remainingTicks: params.durationTicks,
        payoutMultiplier: params.payoutMultiplier || 1.95,
        takeProfitProfit: params.takeProfitProfit,
        takeProfitTicks: params.takeProfitTicks,
        entryPrice,
        currentPrice: entryPrice,
        entryEpoch: now,
        expiryEpoch,
        durationSeconds: params.durationSeconds,
        takeProfitPrice: params.takeProfit,
        stopLossPrice: params.stopLoss,
        pnl: 0,
        pnlPercentage: 0,
      };

      setActivePositions((prev) => [newPosition, ...prev]);
    },
    [account.balance, activeSymbol]
  );

  // Manual close position
  const closePosition = useCallback(
    (positionId: string) => {
      setActivePositions((prev) => {
        const pos = prev.find((p) => p.id === positionId);
        if (!pos) return prev;

        const now = Math.floor(Date.now() / 1000);
        const pnl = pos.pnl;
        const returnAmount = Number((pos.stake + pnl).toFixed(2));

        if (pos.type === 'ACCUMULATOR') {
          if (pnl > 0) {
            soundManager.playCashOutSound();
            setActiveToast(`Accumulator Cashed Out! +$${pnl.toFixed(2)} (${pos.tickCount || 0} ticks)`);
          } else {
            soundManager.playLossSound();
          }
        } else if (pnl > 0) {
          soundManager.playWinSound();
        } else {
          soundManager.playLossSound();
        }

        setAccount((acc) => ({
          ...acc,
          balance: Number((acc.balance + Math.max(0, returnAmount)).toFixed(2)),
        }));

        setTradeHistory((hist) => [
          {
            id: pos.id,
            symbol: pos.symbol,
            symbolName: pos.symbolName,
            type: pos.type,
            direction: pos.direction,
            stake: pos.stake,
            multiplier: pos.multiplier,
            entryPrice: pos.entryPrice,
            exitPrice: pos.currentPrice,
            entryEpoch: pos.entryEpoch,
            exitEpoch: now,
            pnl: pos.pnl,
            pnlPercentage: pos.pnlPercentage,
            status: 'CLOSED',
          },
          ...hist,
        ]);

        return prev.filter((p) => p.id !== positionId);
      });
    },
    []
  );

  // Connect Deriv API Token (or OAuth Token)
  const connectDerivToken = useCallback(
    async (
      token: string,
      customAppId?: string
    ): Promise<{
      success: boolean;
      message?: string;
      isLiveVerified?: boolean;
      scopes?: string[];
    }> => {
      try {
        const authData = await derivWsService.authorize(token, customAppId);
        const loginId = authData.loginid || 'CR-DERIV';
        const fullname = authData.fullname || 'nderiskool';
        const balance = typeof authData.balance === 'number' ? authData.balance : 5450.0;
        const currency = authData.currency || 'USD';
        const isLiveVerified = Boolean(authData.isLiveVerified);
        const scopes: string[] = Array.isArray(authData.scopes) ? authData.scopes : ['read', 'trade'];
        const accountList: DerivSubAccount[] = Array.isArray(authData.account_list)
          ? authData.account_list.map((a: any) => ({
              loginid: String(a.loginid || ''),
              currency: String(a.currency || 'USD'),
              is_virtual: Boolean(a.is_virtual),
              account_type: a.account_type ? String(a.account_type) : undefined,
              landing_company_name: a.landing_company_name ? String(a.landing_company_name) : undefined,
            }))
          : [];

        const realAcc: DerivAccount = {
          isReal: !authData.is_virtual,
          loginId,
          fullname,
          email: authData.email || 'kiragunderi28@gmail.com',
          currency,
          balance,
          token,
          connected: true,
          isLiveVerified,
          scopes,
          appId: authData.appId || derivWsService.getAppId(),
          accountList,
        };

        // Ensure realAccount always represents the connected Real CR terminal profile
        const normalizedReal: DerivAccount = {
          ...realAcc,
          isReal: true,
        };

        setRealAccount(normalizedReal);
        setAccount(normalizedReal);

        derivWsService.onBalanceChange((newBal, curr) => {
          setRealAccount((prev) => ({
            ...prev,
            balance: newBal,
            currency: curr,
          }));
          setAccount((prev) =>
            prev.isReal
              ? {
                  ...prev,
                  balance: newBal,
                  currency: curr,
                }
              : prev
          );
        });

        const virtualNotice =
          authData.is_virtual && accountList.some((a) => !a.is_virtual)
            ? ` Note: This token points to Virtual (${loginId}); pick a Real (CR) token or sign in with Deriv OAuth to transact directly on your Real CR balance.`
            : '';

        return {
          success: true,
          isLiveVerified,
          scopes,
          message: `${
            isLiveVerified ? 'Live Deriv WebSocket verified' : 'Test Deriv Real ledger connected'
          } as ${loginId} (${fullname}) · Balance: $${balance.toFixed(2)} ${currency}.${virtualNotice}`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: err?.message || 'Could not authorize with Deriv. Please check your token and scopes.',
        };
      }
    },
    []
  );

  // Auto-capture Deriv OAuth redirect tokens (?acct1=CR...&token1=...&cur1=USD) and scrub URL bar
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const oauthEntries: Array<{ acct: string; token: string; cur: string }> = [];
      for (let i = 1; i <= 10; i++) {
        const acct = params.get(`acct${i}`);
        const tok = params.get(`token${i}`);
        const cur = params.get(`cur${i}`) || 'USD';
        if (acct && tok) {
          oauthEntries.push({ acct, token: tok, cur });
        }
      }
      if (oauthEntries.length > 0) {
        const preferredReal =
          oauthEntries.find((e) => !e.acct.toUpperCase().startsWith('VRTC')) || oauthEntries[0];
        // Clean tokens from browser history URL immediately
        for (let i = 1; i <= 10; i++) {
          params.delete(`acct${i}`);
          params.delete(`token${i}`);
          params.delete(`cur${i}`);
        }
        const cleanedQuery = params.toString();
        const cleanedUrl = `${window.location.pathname}${cleanedQuery ? `?${cleanedQuery}` : ''}${window.location.hash || ''}`;
        window.history.replaceState({}, document.title, cleanedUrl);

        void connectDerivToken(preferredReal.token).then((res) => {
          if (res.success) {
            setActiveToast(`Deriv OAuth connected: ${preferredReal.acct}`);
          }
        });
      }
    } catch {
      // ignore invalid URL search params
    }
  }, [connectDerivToken]);

  const syncDerivRealBalance = useCallback(async () => {
    if (!realAccount.token || realAccount.token === 'CR-NDERISKOOL-LIVE') {
      return {
        ok: false,
        balance: realAccount.balance,
        message: 'Connect a live Deriv API token (Read + Payments scopes) to sync live balance from Deriv.',
      };
    }
    const freshBal = await derivWsService.refreshBalance();
    if (freshBal === null) {
      return {
        ok: false,
        balance: realAccount.balance,
        message: 'Could not reach Deriv WebSocket for balance refresh. Check your connection or token.',
      };
    }
    setRealAccount((prev) => ({ ...prev, balance: freshBal, isLiveVerified: true }));
    setAccount((prev) => (prev.isReal ? { ...prev, balance: freshBal, isLiveVerified: true } : prev));
    setActiveToast(`Live Deriv Real balance synced: $${freshBal.toFixed(2)} ${realAccount.currency}`);
    return {
      ok: true,
      balance: freshBal,
      message: `Live balance synced from Deriv: $${freshBal.toFixed(2)} ${realAccount.currency}`,
    };
  }, [realAccount.balance, realAccount.currency, realAccount.token]);

  const transferBetweenDerivAccounts = useCallback(
    async (params: {
      accountFrom: string;
      accountTo: string;
      amount: number;
      currency?: string;
    }) => {
      const cleanFrom = params.accountFrom.trim().toUpperCase();
      const cleanTo = params.accountTo.trim().toUpperCase();
      if (!cleanFrom || !cleanTo || cleanFrom === cleanTo) {
        return {
          success: false,
          liveExecuted: false,
          message: 'Source and destination Deriv account IDs must be valid and different.',
        };
      }
      if (!Number.isFinite(params.amount) || params.amount < 10) {
        return {
          success: false,
          liveExecuted: false,
          message: 'Minimum Deriv account transfer is $10.00 USD.',
        };
      }
      if (params.amount > realAccount.balance) {
        return {
          success: false,
          liveExecuted: false,
          message: `Insufficient balance on ${cleanFrom} ($${realAccount.balance.toFixed(2)} available).`,
        };
      }

      const wsRes = await derivWsService.transferBetweenAccounts({
        accountFrom: cleanFrom,
        accountTo: cleanTo,
        amount: params.amount,
        currency: params.currency || realAccount.currency || 'USD',
      });

      const isSample = !realAccount.token || realAccount.token === 'CR-NDERISKOOL-LIVE';
      if (!wsRes.liveExecuted && !isSample) {
        return {
          success: false,
          liveExecuted: false,
          message:
            wsRes.error ||
            'Deriv transfer_between_accounts rejected or requires Payments scope on your API token.',
        };
      }

      const txRef = wsRes.transactionId || `DRV-XFER-${Math.floor(100000 + Math.random() * 900000)}`;
      const tx: CashierTransaction = {
        id: `tx-xfer-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: 'WITHDRAWAL',
        amount: Number(params.amount.toFixed(2)),
        currency: params.currency || realAccount.currency || 'USD',
        method: 'DERIV_REAL_ACCOUNT',
        methodName: 'Deriv Account Transfer (WS API)',
        accountMode: 'REAL',
        loginId: cleanFrom,
        derivSynced: wsRes.liveExecuted,
        destinationOrSource: `${cleanFrom} -> ${cleanTo}`,
        reference: txRef,
        timestamp: Date.now(),
        status: 'COMPLETED',
        cashierUrl: 'https://app.deriv.com/cashier/account-transfer',
        note: wsRes.liveExecuted
          ? `Live Deriv WS transfer_between_accounts: ${cleanFrom} -> ${cleanTo} (Ref: ${txRef})`
          : `Test ledger transfer recorded: ${cleanFrom} -> ${cleanTo}`,
      };

      const nextBal = Number((realAccount.balance - params.amount).toFixed(2));
      setRealAccount((prev) => ({ ...prev, balance: nextBal }));
      if (account.isReal) {
        setAccount((prev) => ({ ...prev, balance: nextBal }));
      }
      setCashierTransactions((prev) => [tx, ...prev]);
      soundManager.playCashOutSound();
      setActiveToast(`Transferred $${params.amount.toFixed(2)} USD from ${cleanFrom} to ${cleanTo}`);

      if (wsRes.liveExecuted) {
        void derivWsService.refreshBalance().then((fresh) => {
          if (typeof fresh === 'number') {
            setRealAccount((prev) => ({ ...prev, balance: fresh }));
            setAccount((prev) => (prev.isReal ? { ...prev, balance: fresh } : prev));
          }
        });
      }

      return {
        success: true,
        liveExecuted: wsRes.liveExecuted,
        message: wsRes.liveExecuted
          ? `Live Deriv transfer completed: $${params.amount.toFixed(2)} USD sent from ${cleanFrom} to ${cleanTo} (Transaction #${txRef}).`
          : `Simulated transfer recorded: $${params.amount.toFixed(2)} USD from ${cleanFrom} to ${cleanTo}. Connect a live Deriv API token with Payments scope for real execution.`,
        tx,
      };
    },
    [account.isReal, realAccount.balance, realAccount.currency, realAccount.token]
  );

  const updateRealAccountId = useCallback((loginId: string) => {
    const cleanId = loginId.trim().toUpperCase() || 'CR-NDERISKOOL';
    setRealAccount((prev) => ({ ...prev, loginId: cleanId }));
    setAccount((prev) => (prev.isReal ? { ...prev, loginId: cleanId } : prev));
  }, []);

  const disconnectDerivToken = useCallback(() => {
    try {
      const savedDemo = localStorage.getItem('nderiskool_deriv_demo_acc');
      if (savedDemo) {
        setAccount(JSON.parse(savedDemo));
        return;
      }
    } catch {}
    setAccount(DEMO_ACCOUNT_INITIAL);
  }, []);

  const resetDemoBalance = useCallback(() => {
    setAccount((prev) => ({
      ...prev,
      balance: 10000.0,
    }));
  }, []);

  const switchAccountMode = useCallback(
    (isReal: boolean) => {
      if (!isReal) {
        try {
          const savedDemo = localStorage.getItem('nderiskool_deriv_demo_acc');
          if (savedDemo) {
            setAccount(JSON.parse(savedDemo));
            return;
          }
        } catch {}
        setAccount(DEMO_ACCOUNT_INITIAL);
      } else {
        setAccount({ ...realAccount, isReal: true, connected: true });
      }
    },
    [realAccount]
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      soundManager.setMuted(next);
      return next;
    });
  }, []);

  const toggleIndicator = useCallback((key: 'ema' | 'bollinger' | 'rsi' | 'macd') => {
    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setActiveSymbol = useCallback((symbol: MarketSymbol) => {
    setActiveSymbolState(symbol);
    derivWsService.subscribeTicks(symbol.symbol);
  }, []);

  // Price Alerts Methods
  const addPriceAlert = useCallback(
    (targetPrice: number, condition: 'ABOVE' | 'BELOW') => {
      const newAlert: PriceAlert = {
        id: `alt-${Date.now()}`,
        symbol: activeSymbol.symbol,
        symbolName: activeSymbol.displayName,
        targetPrice,
        condition,
        createdAt: Date.now(),
        triggered: false,
      };
      setPriceAlerts((prev) => [newAlert, ...prev]);
      setActiveToast(`Alert set for ${activeSymbol.displayName} at ${targetPrice}`);
    },
    [activeSymbol]
  );

  const removePriceAlert = useCallback((id: string) => {
    setPriceAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
  }, []);

  // Deriv DBot Methods
  const startBot = useCallback(() => {
    setBotStrategy((prev) => ({
      ...prev,
      isRunning: true,
      lastActionTime: Date.now(),
    }));
    setBotLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        message: `Bot started on ${botStrategy.symbol} with ${botStrategy.strategyType} strategy. Base stake: $${botStrategy.baseStake}`,
        type: 'INFO',
      },
      ...prev,
    ]);
  }, [botStrategy.symbol, botStrategy.strategyType, botStrategy.baseStake]);

  const stopBot = useCallback(() => {
    setBotStrategy((prev) => ({ ...prev, isRunning: false }));
    setBotLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        message: 'Bot stopped by trader.',
        type: 'INFO',
      },
      ...prev,
    ]);
  }, []);

  const updateBotStrategy = useCallback((params: Partial<BotStrategy>) => {
    setBotStrategy((prev) => ({ ...prev, ...params }));
  }, []);

  const toggleExecutionSpeed = useCallback(() => {
    setExecutionSpeed((prev) => (prev === 'FAST' ? 'NORMAL' : 'FAST'));
  }, []);

  const clearBotLogs = useCallback(() => {
    setBotLogs([]);
  }, []);

  // Automated Deriv Bot Execution Loop
  useEffect(() => {
    if (!botStrategy.isRunning) return;

    const botInterval = setInterval(() => {
      setBotStrategy((currentBot) => {
        if (!currentBot.isRunning) return currentBot;

        // Check if there is already an active position for the bot's symbol
        const hasOpenBotTrade = activePositions.some(
          (p) => p.symbol === currentBot.symbol && p.id.startsWith('bot-pos-')
        );
        if (hasOpenBotTrade) return currentBot;

        // Check account balance
        if (account.balance < currentBot.currentStake) {
          setBotLogs((l) => [
            {
              id: `log-${Date.now()}`,
              timestamp: Date.now(),
              message: 'Insufficient balance to execute next bot stake. Stopping bot.',
              type: 'ALERT',
            },
            ...l,
          ]);
          return { ...currentBot, isRunning: false };
        }

        // Determine signal based on strategyType
        let signal: Direction = 'BUY';
        const targetMarket = markets.find((m) => m.symbol === currentBot.symbol) || activeSymbol;

        if (currentBot.strategyType === 'EMA_CROSS') {
          const closes = candles.map((c) => c.close);
          const ema9 = calculateEMA(closes, 9);
          const ema21 = calculateEMA(closes, 21);
          const last9 = ema9[ema9.length - 1];
          const last21 = ema21[ema21.length - 1];
          if (last9 !== null && last21 !== null) {
            signal = last9 >= last21 ? 'BUY' : 'SELL';
          }
        } else if (currentBot.strategyType === 'RSI_REVERSAL') {
          const rsi = calculateRSI(candles, 14);
          const lastRsi = rsi[rsi.length - 1];
          if (lastRsi !== null && lastRsi !== undefined) {
            signal = lastRsi < 45 ? 'BUY' : 'SELL';
          }
        } else {
          // MARTINGALE_SCALPER
          signal = Math.random() > 0.48 ? 'BUY' : 'SELL';
        }

        // Execute bot trade
        const now = Math.floor(Date.now() / 1000);
        const stake = currentBot.currentStake;
        const entryPrice = targetMarket.currentPrice;

        if (signal === 'BUY') soundManager.playBuySound();
        else soundManager.playSellSound();

        setAccount((acc) => ({
          ...acc,
          balance: Number((acc.balance - stake).toFixed(2)),
        }));

        const botPos: ActivePosition = {
          id: `bot-pos-${Date.now()}`,
          symbol: targetMarket.symbol,
          symbolName: targetMarket.displayName,
          type: 'RISE_FALL',
          direction: signal,
          stake,
          multiplier: 1,
          entryPrice,
          currentPrice: entryPrice,
          entryEpoch: now,
          expiryEpoch: now + currentBot.durationSeconds,
          durationSeconds: currentBot.durationSeconds,
          pnl: 0,
          pnlPercentage: 0,
        };

        setActivePositions((prev) => [botPos, ...prev]);

        setBotLogs((l) => [
          {
            id: `log-${Date.now()}`,
            timestamp: Date.now(),
            message: `[ORDER] Automated ${signal} ${currentBot.durationSeconds}s placed on ${targetMarket.displayName} @ ${entryPrice} ($${stake.toFixed(2)} stake)`,
            type: 'TRADE',
          },
          ...l,
        ]);

        return { ...currentBot, lastActionTime: Date.now() };
      });
    }, executionSpeed === 'FAST' ? 1500 : 3000);

    return () => clearInterval(botInterval);
  }, [botStrategy.isRunning, executionSpeed, activePositions, account.balance, markets, activeSymbol, candles]);

  // Auto-Trade Management
  const toggleAutoTrade = useCallback(() => {
    setIsAutoTradeActive((prev) => {
      const next = !prev;
      setActiveToast(next ? 'Auto-Trade Engine Activated' : 'Auto-Trade Engine Paused');
      return next;
    });
  }, []);

  const addAutoTradeRule = useCallback(
    (rule: Omit<AutoTradeRule, 'id' | 'tradesToday' | 'totalProfit'>) => {
      const newRule: AutoTradeRule = {
        ...rule,
        id: `rule-${Date.now()}`,
        tradesToday: 0,
        totalProfit: 0,
      };
      setAutoTradeRules((prev) => [newRule, ...prev]);
      setActiveToast(`Auto-Trade Rule "${newRule.name}" created`);
    },
    []
  );

  const toggleAutoTradeRule = useCallback((id: string) => {
    setAutoTradeRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r))
    );
  }, []);

  const deleteAutoTradeRule = useCallback((id: string) => {
    setAutoTradeRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const executeSignalTrade = useCallback(
    (sig: TradeSignal) => {
      executeTrade({
        type: sig.contractType,
        direction: sig.direction,
        stake: sig.contractType === 'ACCUMULATOR' ? 25 : 50,
        growthRate: 0.03,
        multiplier: 50,
        durationSeconds: 30,
        takeProfit: sig.targetPrice,
        stopLoss: sig.stopLossPrice,
      });
      setActiveToast(`Executed ${sig.direction} Signal on ${sig.symbolName}!`);
    },
    [executeTrade]
  );

  // Automated Trade Engine Loop
  useEffect(() => {
    if (!isAutoTradeActive) return;

    const interval = setInterval(() => {
      autoTradeRules.forEach((rule) => {
        if (!rule.isActive) return;
        if (rule.tradesToday >= rule.maxDailyTrades) return;

        // Check if position already open for this symbol
        const alreadyOpen = activePositions.some((p) => p.symbol === rule.symbol);
        if (alreadyOpen) return;

        // Check balance
        if (account.balance < rule.stake) return;

        const targetMarket = markets.find((m) => m.symbol === rule.symbol) || activeSymbol;

        // Determine direction based on price vs EMA/history
        const closes = candles.map((c) => c.close);
        const ema9 = calculateEMA(closes, 9);
        const lastEma = ema9[ema9.length - 1];
        const dir: Direction = lastEma && targetMarket.currentPrice >= lastEma ? 'BUY' : 'SELL';

        executeTrade({
          type: rule.contractType,
          direction: dir,
          stake: rule.stake,
          growthRate: rule.growthRate || 0.03,
          multiplier: rule.multiplier || 50,
          durationSeconds: rule.durationSeconds || 30,
        });

        setAutoTradeRules((rules) =>
          rules.map((r) => (r.id === rule.id ? { ...r, tradesToday: r.tradesToday + 1 } : r))
        );

        setActiveToast(`[Auto-Trade] ${rule.name} triggered on ${targetMarket.displayName}`);
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoTradeActive, autoTradeRules, activePositions, account.balance, markets, activeSymbol, candles, executeTrade]);

  return (
    <TradingContext.Provider
      value={{
        markets,
        activeSymbol,
        setActiveSymbol,
        candles,
        timeframe,
        setTimeframe,
        chartType,
        setChartType,
        indicators,
        toggleIndicator,
        account,
        realAccount,
        updateRealAccountId,
        connectDerivToken,
        syncDerivRealBalance,
        transferBetweenDerivAccounts,
        disconnectDerivToken,
        resetDemoBalance,
        switchAccountMode,
        activePositions,
        tradeHistory,
        executeTrade,
        closePosition,
        priceAlerts,
        addPriceAlert,
        removePriceAlert,
        activeToast,
        dismissToast,
        botStrategy,
        botLogs,
        executionSpeed,
        toggleExecutionSpeed,
        startBot,
        stopBot,
        updateBotStrategy,
        clearBotLogs,
        isAutoTradeActive,
        toggleAutoTrade,
        autoTradeRules,
        addAutoTradeRule,
        toggleAutoTradeRule,
        deleteAutoTradeRule,
        tradeSignals,
        executeSignalTrade,
        isMuted,
        toggleMute,
        activeView,
        setActiveView,
        isConnectModalOpen,
        setIsConnectModalOpen,
        isProfileModalOpen,
        setIsProfileModalOpen,
        mpesaGatewayStatus,
        refreshMpesaGatewayStatus,
        verifyDarajaOAuth,
        safaricomPhone,
        safaricomMsisdn,
        safaricomFormatted,
        updateSafaricomPhone,
        verifiedP2pReceivers,
        activeP2pReceiverPhone,
        setActiveP2pReceiverPhone,
        verifyP2pReceiver,
        removeVerifiedP2pReceiver,
        cashierTransactions,
        depositFunds,
        withdrawFunds,
        confirmMpesaTransaction,
        syncMpesaBalance,
        cancelPendingWithdrawal,
        createDp2pMpesaOrder,
        createDCashTransaction,
        createValtexTransaction,
        verifyValtexTransactionStatus,
        createPayHeroTransaction,
        verifyPayHeroTransactionStatus,
        createKcbDirectTransfer,
        verifyKcbTransferStatus,
        p2pAutoRefreshEnabled,
        setP2pAutoRefreshEnabled,
        p2pLastRefreshedAt,
        isRefreshingP2p,
        refreshP2pTransactions,
        autoConfirmWithdrawals,
        setAutoConfirmWithdrawals,
        clientDiagnosticLogs,
        appendClientDiagnosticLog,
        clearClientDiagnosticLogs,
        isCashierOpen,
        setIsCashierOpen,
        cashierTab,
        setCashierTab,
        openCashier,
        isWsConnected,
        lastTick,
        recentDigits,
      }}
    >
      {children}
    </TradingContext.Provider>
  );
};

export const useTrading = () => {
  const context = useContext(TradingContext);
  if (!context) {
    throw new Error('useTrading must be used within a TradingProvider');
  }
  return context;
};
