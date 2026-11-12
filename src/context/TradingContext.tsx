import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import {
  ActivePosition,
  BotLog,
  BotStrategy,
  Candle,
  DerivAccount,
  Direction,
  MarketSymbol,
  OrderType,
  PriceAlert,
  Tick,
  TradeRecord,
} from '../types/trading';
import { INITIAL_MARKETS } from '../data/markets';
import { derivWsService } from '../services/derivWs';
import { soundManager } from '../utils/audio';
import { calculateEMA, calculateRSI } from '../utils/indicators';

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
  connectDerivToken: (token: string) => Promise<{ success: boolean; message?: string }>;
  disconnectDerivToken: () => void;
  resetDemoBalance: () => void;
  switchAccountMode: (isReal: boolean) => void;

  // Trading
  activePositions: ActivePosition[];
  tradeHistory: TradeRecord[];
  executeTrade: (params: {
    type: OrderType;
    direction: Direction;
    stake: number;
    multiplier?: number;
    durationSeconds?: number;
    takeProfit?: number;
    stopLoss?: number;
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
  startBot: () => void;
  stopBot: () => void;
  updateBotStrategy: (params: Partial<BotStrategy>) => void;
  clearBotLogs: () => void;

  // Audio & UI
  isMuted: boolean;
  toggleMute: () => void;
  activeView: 'terminal' | 'watchlist' | 'orders' | 'bot' | 'analytics' | 'calendar';
  setActiveView: (view: 'terminal' | 'watchlist' | 'orders' | 'bot' | 'analytics' | 'calendar') => void;
  isConnectModalOpen: boolean;
  setIsConnectModalOpen: (open: boolean) => void;
  isProfileModalOpen: boolean;
  setIsProfileModalOpen: (open: boolean) => void;

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
  const [activeView, setActiveView] = useState<'terminal' | 'watchlist' | 'orders' | 'bot' | 'analytics' | 'calendar'>('terminal');
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [lastTick, setLastTick] = useState<Tick | null>(null);

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

  // Sync account to storage
  useEffect(() => {
    try {
      localStorage.setItem('nderiskool_deriv_acc', JSON.stringify(account));
    } catch {}
  }, [account]);

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
      takeProfit?: number;
      stopLoss?: number;
    }) => {
      if (account.balance < params.stake) {
        alert('Insufficient account balance.');
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const entryPrice = activeSymbol.currentPrice;

      // Sound
      if (params.direction === 'BUY') {
        soundManager.playBuySound();
      } else {
        soundManager.playSellSound();
      }

      // Deduct stake from balance
      setAccount((acc) => ({
        ...acc,
        balance: Number((acc.balance - params.stake).toFixed(2)),
      }));

      const newPosition: ActivePosition = {
        id: `pos-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        symbol: activeSymbol.symbol,
        symbolName: activeSymbol.displayName,
        type: params.type,
        direction: params.direction,
        stake: params.stake,
        multiplier: params.multiplier || 50,
        entryPrice,
        currentPrice: entryPrice,
        entryEpoch: now,
        expiryEpoch: params.type === 'RISE_FALL' ? now + (params.durationSeconds || 60) : undefined,
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

        if (pnl > 0) {
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

  // Connect Deriv API Token
  const connectDerivToken = useCallback(
    async (token: string): Promise<{ success: boolean; message?: string }> => {
      try {
        const authData = await derivWsService.authorize(token);
        const loginId = authData.loginid || 'CR-DERIV';
        const fullname = authData.fullname || 'nderiskool';
        const balance = typeof authData.balance === 'number' ? authData.balance : 5000.0;
        const currency = authData.currency || 'USD';

        setAccount({
          isReal: true,
          loginId,
          fullname,
          email: authData.email || 'nderiskool@deriv.trader',
          currency,
          balance,
          token,
          connected: true,
        });

        derivWsService.onBalanceChange((newBal, curr) => {
          setAccount((prev) => ({
            ...prev,
            balance: newBal,
            currency: curr,
          }));
        });

        return {
          success: true,
          message: `Connected successfully as ${loginId} (${fullname})`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: err?.message || 'Could not authorize with Deriv. Please check your token scopes.',
        };
      }
    },
    []
  );

  const disconnectDerivToken = useCallback(() => {
    setAccount(DEMO_ACCOUNT_INITIAL);
  }, []);

  const resetDemoBalance = useCallback(() => {
    setAccount((prev) => ({
      ...prev,
      balance: 10000.0,
    }));
  }, []);

  const switchAccountMode = useCallback((isReal: boolean) => {
    if (!isReal) {
      setAccount(DEMO_ACCOUNT_INITIAL);
    } else {
      setIsConnectModalOpen(true);
    }
  }, []);

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
    }, 3000);

    return () => clearInterval(botInterval);
  }, [botStrategy.isRunning, activePositions, account.balance, markets, activeSymbol, candles]);

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
        connectDerivToken,
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
        startBot,
        stopBot,
        updateBotStrategy,
        clearBotLogs,
        isMuted,
        toggleMute,
        activeView,
        setActiveView,
        isConnectModalOpen,
        setIsConnectModalOpen,
        isProfileModalOpen,
        setIsProfileModalOpen,
        isWsConnected,
        lastTick,
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
