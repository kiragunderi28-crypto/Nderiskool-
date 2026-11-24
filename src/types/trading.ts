export interface Candle {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface Tick {
  epoch: number;
  quote: number;
  symbol: string;
  ask?: number;
  bid?: number;
}

export interface MarketSymbol {
  symbol: string;
  displayName: string;
  category: 'forex_major' | 'forex_minor' | 'metals' | 'synthetic';
  pipSize: number;
  baseCurrency: string;
  quoteCurrency: string;
  currentPrice: number;
  bid: number;
  ask: number;
  spreadPips: number;
  change24h: number;
  high24h: number;
  low24h: number;
  isFavorite?: boolean;
}

export type OrderType = 'RISE_FALL' | 'MULTIPLIER' | 'ACCUMULATOR' | 'HIGHER_LOWER' | 'DIGIT_UNDER_OVER';
export type Direction = 'BUY' | 'SELL'; // BUY = Rise / Higher / Over / Long, SELL = Fall / Lower / Under / Short

export interface ActivePosition {
  id: string;
  symbol: string;
  symbolName: string;
  type: OrderType;
  direction: Direction;
  stake: number;
  multiplier: number; // for multiplier contracts (e.g. 50x, 100x)
  growthRate?: number; // for Accumulators (e.g. 0.01 to 0.05)
  tickCount?: number; // for Accumulators
  currentPayout?: number; // for Accumulators
  upperBarrier?: number; // for Accumulators
  lowerBarrier?: number; // for Accumulators
  barrier?: number; // for Higher/Lower contract target barrier
  barrierOffsetPips?: number;
  selectedDigit?: number; // for Digit Under/Over (0-9)
  targetDigit?: number;
  lastDigit?: number;
  durationTicks?: number; // for tick-based contracts (e.g. 1 tick, 5 ticks)
  remainingTicks?: number;
  payoutMultiplier?: number; // calculated payout multiplier e.g. 1.95 or 3.8
  entryPrice: number;
  currentPrice: number;
  entryEpoch: number;
  expiryEpoch?: number; // for Rise/Fall & Higher/Lower
  durationSeconds?: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
  takeProfitProfit?: number; // Auto take-profit amount for Accumulator
  takeProfitTicks?: number; // Auto take-profit ticks for Accumulator
  pnl: number;
  pnlPercentage: number;
  isClosing?: boolean;
}

export interface TradeRecord {
  id: string;
  symbol: string;
  symbolName: string;
  type: OrderType;
  direction: Direction;
  stake: number;
  multiplier: number;
  entryPrice: number;
  exitPrice: number;
  entryEpoch: number;
  exitEpoch: number;
  barrier?: number;
  selectedDigit?: number;
  exitDigit?: number;
  pnl: number;
  pnlPercentage: number;
  status: 'WON' | 'LOST' | 'CLOSED';
}

export interface DerivSubAccount {
  loginid: string;
  currency: string;
  is_virtual: boolean;
  account_type?: string;
  landing_company_name?: string;
  balance?: number;
  token?: string;
}

export interface DerivAccount {
  isReal: boolean;
  loginId: string;
  fullname: string;
  email: string;
  currency: string;
  balance: number;
  token?: string;
  connected: boolean;
  isLiveVerified?: boolean;
  scopes?: string[];
  appId?: string;
  accountList?: DerivSubAccount[];
}

export interface EconomicEvent {
  id: string;
  time: string;
  currency: string;
  event: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  actual?: string;
  forecast: string;
  previous: string;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  symbolName: string;
  targetPrice: number;
  condition: 'ABOVE' | 'BELOW';
  createdAt: number;
  triggered: boolean;
  triggeredAt?: number;
}

export type BotStrategyType = 'EMA_CROSS' | 'RSI_REVERSAL' | 'MARTINGALE_SCALPER';

export interface BotStrategy {
  id: string;
  name: string;
  description: string;
  symbol: string;
  strategyType: BotStrategyType;
  baseStake: number;
  currentStake: number;
  multiplierFactor: number; // e.g. 2.0 for Martingale
  takeProfitTarget: number;
  stopLossLimit: number;
  durationSeconds: number;
  isRunning: boolean;
  totalRuns: number;
  wins: number;
  losses: number;
  netProfit: number;
  lastActionTime?: number;
}

export interface BotLog {
  id: string;
  timestamp: number;
  message: string;
  type: 'INFO' | 'TRADE' | 'WIN' | 'LOSS' | 'ALERT';
}

export type AutoStrategyType = 'TREND_FOLLOW' | 'NEWS_BREAKOUT' | 'VOLATILITY_ACCUMULATOR' | 'GRID_SYSTEM';

export interface AutoTradeRule {
  id: string;
  name: string;
  symbol: string;
  strategyType: AutoStrategyType;
  contractType: OrderType;
  stake: number;
  growthRate?: number; // for accumulators
  multiplier?: number; // for multipliers
  durationSeconds?: number;
  takeProfitTarget: number;
  stopLossLimit: number;
  isActive: boolean;
  maxDailyTrades: number;
  tradesToday: number;
  totalProfit: number;
}

export interface TradeSignal {
  id: string;
  symbol: string;
  symbolName: string;
  direction: Direction;
  contractType: OrderType;
  confidence: number; // 0-100%
  reason: string;
  timestamp: number;
  entryPrice: number;
  targetPrice: number;
  stopLossPrice: number;
}

export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL';
export type TransactionStatus = 'COMPLETED' | 'PROCESSING' | 'PENDING' | 'REJECTED';
export type CashierMethod =
  | 'DERIV_REAL_ACCOUNT'
  | 'MPESA'
  | 'D_CASH'
  | 'VALTEX'
  | 'PAYHERO'
  | 'KCB_BANK'
  | 'AIRTEL_MONEY'
  | 'CRYPTO_USDT'
  | 'CRYPTO_BTC'
  | 'CARD_VISA_MC'
  | 'BANK_TRANSFER'
  | 'E_WALLET'
  | 'DERIV_P2P'
  | 'DEMO_VIRTUAL';

export type MpesaGatewayStatus =
  | 'DARAJA_CONFIRMED'
  | 'AWAITING_MPESA_CALLBACK'
  | 'VALTEX_CONFIRMED'
  | 'AWAITING_VALTEX_CALLBACK'
  | 'PAYHERO_CONFIRMED'
  | 'AWAITING_PAYHERO_CALLBACK'
  | 'KCB_CONFIRMED'
  | 'AWAITING_KCB_CALLBACK'
  | 'GATEWAY_UNCONFIGURED'
  | 'DERIV_CASHIER_REQUIRED';

export interface CashierTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  method: CashierMethod;
  methodName: string;
  accountMode: 'REAL' | 'DEMO';
  loginId?: string;
  derivSynced?: boolean;
  destinationOrSource?: string;
  reference: string;
  timestamp: number;
  status: TransactionStatus;
  note?: string;
  gatewayStatus?: MpesaGatewayStatus;
  gatewayEnvironment?: 'sandbox' | 'production';
  mpesaReceipt?: string;
  conversationId?: string;
  recipientPhone?: string;
  recipientMsisdn?: string;
  callbackVerified?: boolean;
  verificationSource?: string;
  safaricomConfirmationText?: string;
  receiverPublicName?: string;
  completedAtText?: string;
  valtexAccountId?: string;
  payheroChannelId?: string;
  payheroAction?: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
  transferRail?: 'mobile' | 'paybill' | 'till' | 'bank';
  kcbAction?: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
  kcbTransferRail?: 'kcb_account' | 'paybill_522522' | 'kcb_vooma' | 'pesalink';
  kcbAccountNumber?: string;
  kcbAccountName?: string;
  standaloneTransfer?: boolean;
  fundingSource?: 'STANDALONE_GATEWAY' | 'DERIV_REAL';
  cashierUrl?: string;
}

export interface VerifiedP2pReceiver {
  phone: string;
  msisdn: string;
  formatted: string;
  carrier: string;
  label?: string;
  sourceAccountId?: string;
  verifiedAt: number;
  status: 'VERIFIED' | 'UNVERIFIED';
  b2cLiveReady: boolean;
}

export type DiagnosticChannel =
  | 'P2P'
  | 'D_CASH'
  | 'VALTEX'
  | 'PAYHERO'
  | 'KCB_BANK'
  | 'MPESA_B2C'
  | 'MPESA_B2B'
  | 'MPESA_STK'
  | 'DERIV_WS';
export type DiagnosticOutcome = 'OK' | 'PENDING' | 'WARNING' | 'REJECTED' | 'UNCONFIGURED';

export type B2BCommandId =
  | 'BusinessPayBill'
  | 'BusinessBuyGoods'
  | 'MerchantToMerchantTransfer'
  | 'BusinessTransferFromMMFToUtility'
  | 'BusinessToBusinessTransfer';

export interface CashierDiagnosticLog {
  id: string;
  timestamp: number;
  source: 'BACKEND' | 'DERIV_WS';
  channel: DiagnosticChannel;
  method: 'GET' | 'POST' | 'WS';
  endpoint: string;
  httpStatus: number;
  outcome: DiagnosticOutcome;
  phoneOrTarget?: string;
  usdAmount?: number;
  kesAmount?: number;
  reference?: string;
  summary: string;
  responsePayload?: Record<string, unknown>;
}

export type WebhookCallbackKind =
  | 'MPESA_B2C_RESULT'
  | 'MPESA_B2C_TIMEOUT'
  | 'MPESA_B2B_RESULT'
  | 'MPESA_B2B_TIMEOUT'
  | 'MPESA_STK_CALLBACK'
  | 'MPESA_C2B_VALIDATION'
  | 'MPESA_C2B_CONFIRMATION'
  | 'MPESA_BALANCE_RESULT'
  | 'MPESA_TX_STATUS_RESULT'
  | 'DCASH_CALLBACK'
  | 'VALTEX_CALLBACK'
  | 'PAYHERO_CALLBACK'
  | 'KCB_CALLBACK';

export interface WebhookCallbackEntry {
  id: string;
  receivedAt: number;
  kind: WebhookCallbackKind;
  endpoint: string;
  method: 'POST';
  reference?: string;
  conversationId?: string;
  originatorConversationId?: string;
  resultCode?: string | number;
  resultDesc?: string;
  mpesaReceipt?: string;
  matchedTransaction: boolean;
  sourceIp: string;
  userAgent: string;
  contentType: string;
  rawBodyText?: string;
  rawPayload: unknown;
}
