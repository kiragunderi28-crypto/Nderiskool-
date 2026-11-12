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

export type OrderType = 'RISE_FALL' | 'MULTIPLIER';
export type Direction = 'BUY' | 'SELL'; // BUY = Rise / Long, SELL = Fall / Short

export interface ActivePosition {
  id: string;
  symbol: string;
  symbolName: string;
  type: OrderType;
  direction: Direction;
  stake: number;
  multiplier: number; // for multiplier contracts (e.g. 50x, 100x)
  entryPrice: number;
  currentPrice: number;
  entryEpoch: number;
  expiryEpoch?: number; // for Rise/Fall
  durationSeconds?: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
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
  pnl: number;
  pnlPercentage: number;
  status: 'WON' | 'LOST' | 'CLOSED';
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
