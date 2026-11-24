import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { OrderType } from '../types/trading';
import {
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Zap,
  Sliders,
  Flame,
  Hash,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';

export const OrderPanel: React.FC = () => {
  const {
    activeSymbol,
    executeTrade,
    account,
    activePositions,
    closePosition,
    recentDigits,
  } = useTrading();

  // Mode: HIGHER_LOWER (Lower trade focus), DIGIT_UNDER_OVER (Under trade focus), MULTIPLIER, ACCUMULATOR
  const [orderType, setOrderType] = useState<OrderType>('HIGHER_LOWER');
  const [stake, setStake] = useState<number>(50);

  // Multiplier mode parameters
  const [multiplier, setMultiplier] = useState<number>(50);
  const [useTakeProfit, setUseTakeProfit] = useState<boolean>(true);
  const [tpAmount, setTpAmount] = useState<number>(25);
  const [useStopLoss, setUseStopLoss] = useState<boolean>(true);
  const [slAmount, setSlAmount] = useState<number>(25);

  // Higher / Lower (Barrier) mode parameters
  const [barrierOffsetPips, setBarrierOffsetPips] = useState<number>(0); // 0 = spot entry barrier
  const [durationSeconds, setDurationSeconds] = useState<number>(30);

  // Digit Under / Over mode parameters
  const [selectedDigit, setSelectedDigit] = useState<number>(5);
  const [durationTicks, setDurationTicks] = useState<number>(1);

  // Accumulator mode parameters
  const [growthRate, setGrowthRate] = useState<number>(0.03);
  const [accumAutoProfit, setAccumAutoProfit] = useState<number>(30);
  const [useAccumAutoProfit, setUseAccumAutoProfit] = useState<boolean>(true);

  // Check if active accumulator position is running on current symbol
  const activeAccumulator = activePositions.find(
    (p) => p.type === 'ACCUMULATOR' && p.symbol === activeSymbol.symbol
  );

  const currentPrice = activeSymbol.currentPrice;
  const isJpy = activeSymbol.symbol.includes('JPY');
  const decimals = isJpy ? 3 : activeSymbol.symbol.startsWith('R_') ? 2 : 5;

  // Barrier calculation for Higher / Lower
  const targetBarrier = Number(
    (currentPrice + barrierOffsetPips * activeSymbol.pipSize).toFixed(decimals)
  );

  // Payout calculation for Digit Under / Over
  // Digit Under: wins on digits 0..(selectedDigit - 1) -> win count = selectedDigit
  const underWinCount = Math.max(1, Math.min(9, selectedDigit));
  const underMultiplier = Number((9.5 / underWinCount).toFixed(2));
  const underPotentialPayout = Number((stake * underMultiplier).toFixed(2));
  const underProfitPct = Number(((underMultiplier - 1) * 100).toFixed(0));

  // Digit Over: wins on digits (selectedDigit + 1)..9 -> win count = 9 - selectedDigit
  const overWinCount = Math.max(1, Math.min(9, 9 - selectedDigit));
  const overMultiplier = Number((9.5 / overWinCount).toFixed(2));
  const overPotentialPayout = Number((stake * overMultiplier).toFixed(2));
  const overProfitPct = Number(((overMultiplier - 1) * 100).toFixed(0));

  // Multiplier levels calculation
  const calculateLevels = (direction: 'BUY' | 'SELL') => {
    const moveFrac = tpAmount / (stake * multiplier);
    const slMoveFrac = slAmount / (stake * multiplier);

    if (direction === 'BUY') {
      const tpPrice = Number((currentPrice * (1 + moveFrac)).toFixed(decimals));
      const slPrice = Number((currentPrice * (1 - slMoveFrac)).toFixed(decimals));
      return { tpPrice, slPrice };
    } else {
      const tpPrice = Number((currentPrice * (1 - moveFrac)).toFixed(decimals));
      const slPrice = Number((currentPrice * (1 + slMoveFrac)).toFixed(decimals));
      return { tpPrice, slPrice };
    }
  };

  const buyLevels = calculateLevels('BUY');
  const sellLevels = calculateLevels('SELL');

  // Trade Execution Handlers
  const handleLowerHigherTrade = (direction: 'SELL' | 'BUY') => {
    executeTrade({
      type: 'HIGHER_LOWER',
      direction, // SELL = LOWER, BUY = HIGHER
      stake,
      barrier: targetBarrier,
      barrierOffsetPips,
      durationSeconds,
      payoutMultiplier: 1.95,
    });
  };

  const handleUnderOverTrade = (direction: 'SELL' | 'BUY') => {
    executeTrade({
      type: 'DIGIT_UNDER_OVER',
      direction, // SELL = UNDER, BUY = OVER
      stake,
      selectedDigit,
      durationTicks,
      payoutMultiplier: direction === 'SELL' ? underMultiplier : overMultiplier,
    });
  };

  const handleMultiplierTrade = (direction: 'BUY' | 'SELL') => {
    executeTrade({
      type: 'MULTIPLIER',
      direction,
      stake,
      multiplier,
      takeProfit: useTakeProfit ? (direction === 'BUY' ? buyLevels.tpPrice : sellLevels.tpPrice) : undefined,
      stopLoss: useStopLoss ? (direction === 'BUY' ? buyLevels.slPrice : sellLevels.slPrice) : undefined,
    });
  };

  const handleStartAccumulator = () => {
    executeTrade({
      type: 'ACCUMULATOR',
      direction: 'BUY',
      stake,
      growthRate,
      takeProfitProfit: useAccumAutoProfit ? accumAutoProfit : undefined,
    });
  };

  const latestDigit = recentDigits[0] ?? 0;
  const isLatestUnder = latestDigit < selectedDigit;

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-2xl shadow-xs p-4 text-xs select-none">
      {/* 4-Mode Contract Switcher with focus on Under & Lower */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl mb-3.5 text-[11px]">
        <button
          onClick={() => setOrderType('HIGHER_LOWER')}
          className={`py-2 text-center font-medium rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer ${
            orderType === 'HIGHER_LOWER'
              ? 'bg-rose-600 text-white font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Lower / Higher Price Barrier Trade"
        >
          <TrendingDown className="w-3.5 h-3.5" />
          <span>Lower</span>
        </button>

        <button
          onClick={() => setOrderType('DIGIT_UNDER_OVER')}
          className={`py-2 text-center font-medium rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer ${
            orderType === 'DIGIT_UNDER_OVER'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Digit Under / Over Trade"
        >
          <Hash className="w-3.5 h-3.5" />
          <span>Under</span>
        </button>

        <button
          onClick={() => setOrderType('MULTIPLIER')}
          className={`py-2 text-center font-medium rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer ${
            orderType === 'MULTIPLIER'
              ? 'bg-[#0b1930] text-white font-semibold shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Mult</span>
        </button>

        <button
          onClick={() => setOrderType('ACCUMULATOR')}
          className={`py-2 text-center font-medium rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer ${
            orderType === 'ACCUMULATOR'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>Accum</span>
        </button>
      </div>

      {/* Stake Amount */}
      <div className="mb-3.5">
        <div className="flex items-center justify-between text-slate-600 mb-1.5">
          <span className="font-semibold">Stake (USD)</span>
          <span className="font-mono text-slate-500">
            Avail: ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="relative mb-2">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-mono">
            $
          </div>
          <input
            type="number"
            min={1}
            max={account.balance}
            disabled={orderType === 'ACCUMULATOR' && !!activeAccumulator}
            value={stake}
            onChange={(e) => setStake(Math.max(1, Number(e.target.value)))}
            className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-sm text-slate-900 focus:outline-none focus:border-teal-500 disabled:opacity-60"
          />
        </div>
        {/* Quick Stake Presets */}
        <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
          {[10, 25, 50, 100, 250].map((val) => (
            <button
              key={val}
              type="button"
              disabled={orderType === 'ACCUMULATOR' && !!activeAccumulator}
              onClick={() => setStake(val)}
              className={`py-1 rounded-md border transition-colors cursor-pointer ${
                stake === val
                  ? 'bg-teal-50 text-teal-700 border-teal-400 font-bold'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              ${val}
            </button>
          ))}
        </div>
      </div>

      {/* 1. HIGHER / LOWER (Barrier Mode) Settings */}
      {orderType === 'HIGHER_LOWER' && (
        <div className="space-y-3 mb-3.5">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium">Target Price Barrier</span>
              <span className="font-mono text-rose-600 font-bold text-sm">
                {targetBarrier.toFixed(decimals)}
              </span>
            </div>

            <div>
              <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                <span>Barrier Offset (Pips)</span>
                <span className="font-mono text-slate-600">
                  {barrierOffsetPips > 0 ? `+${barrierOffsetPips}` : barrierOffsetPips} pips
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
                {[-10, -5, 0, 5, 10].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setBarrierOffsetPips(p)}
                    className={`py-1 rounded-md border transition-colors cursor-pointer ${
                      barrierOffsetPips === p
                        ? 'bg-rose-50 text-rose-700 border-rose-400 font-bold'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {p > 0 ? `+${p}` : p}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[10px] text-slate-600 pt-1 border-t border-slate-200 flex justify-between">
              <span>LOWER Trade Target:</span>
              <strong className="text-rose-600 font-mono">
                Exit Spot &lt; {targetBarrier.toFixed(decimals)}
              </strong>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-slate-600 mb-1.5">
              <span className="font-medium">Contract Duration</span>
              <span className="text-teal-700 font-mono font-semibold">
                {durationSeconds < 60 ? `${durationSeconds}s` : `${durationSeconds / 60}m`}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 font-mono text-[11px]">
              {[
                { label: '15s', sec: 15 },
                { label: '30s', sec: 30 },
                { label: '60s', sec: 60 },
                { label: '2m', sec: 120 },
              ].map((d) => (
                <button
                  key={d.sec}
                  type="button"
                  onClick={() => setDurationSeconds(d.sec)}
                  className={`py-1.5 rounded-md border transition-colors cursor-pointer ${
                    durationSeconds === d.sec
                      ? 'bg-rose-600 text-white font-semibold border-rose-600 shadow-xs'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1 font-mono text-[11px]">
            <div className="flex justify-between text-slate-600">
              <span>Payout Return:</span>
              <span className="text-emerald-600 font-bold">+95.0%</span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>Total Payout:</span>
              <span className="text-slate-900 font-bold">${(stake * 1.95).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. DIGIT UNDER / OVER Mode Settings */}
      {orderType === 'DIGIT_UNDER_OVER' && (
        <div className="space-y-3 mb-3.5">
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
              <span className="font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Live Last Digits Tape</span>
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                Latest: <strong className="text-slate-900">{latestDigit}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto py-1 px-1.5 bg-slate-50 rounded-lg border border-slate-200 font-mono text-xs">
              {recentDigits.slice(0, 10).map((digit, idx) => (
                <div
                  key={idx}
                  className={`flex-1 py-1 text-center rounded font-bold transition-all ${
                    idx === 0
                      ? isLatestUnder
                        ? 'bg-rose-600 text-white'
                        : 'bg-emerald-600 text-white'
                      : digit < selectedDigit
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  {digit}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-slate-600 mb-1.5">
              <span className="font-medium">Prediction Digit Target</span>
              <span className="font-mono text-amber-700 font-bold">Under {selectedDigit}</span>
            </div>
            <div className="grid grid-cols-10 gap-1 font-mono text-[11px]">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => setSelectedDigit(digit)}
                  className={`py-1.5 rounded border transition-colors cursor-pointer ${
                    selectedDigit === digit
                      ? 'bg-amber-500 text-slate-950 font-bold border-amber-500 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {digit}
                </button>
              ))}
            </div>
          </div>

          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 font-mono text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 text-[10px]">UNDER {selectedDigit} Wins On:</span>
              <div className="flex gap-1 text-[10px]">
                {Array.from({ length: selectedDigit }, (_, i) => i).map((d) => (
                  <span
                    key={d}
                    className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold"
                  >
                    {d}
                  </span>
                ))}
                {selectedDigit === 0 && <span className="text-slate-500">None (select &gt; 0)</span>}
              </div>
            </div>

            <div className="flex items-center justify-between text-slate-700 pt-1 border-t border-slate-200">
              <span className="text-slate-600">Under Payout:</span>
              <span className="text-rose-600 font-bold">
                {underMultiplier}x (+{underProfitPct}%) = ${underPotentialPayout}
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-slate-600 mb-1.5">
              <span className="font-medium">Duration (Ticks)</span>
              <span className="text-teal-700 font-mono font-semibold">{durationTicks} Tick{durationTicks > 1 ? 's' : ''}</span>
            </div>
            <div className="grid grid-cols-4 gap-1 font-mono text-[11px]">
              {[1, 2, 5, 10].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDurationTicks(t)}
                  className={`py-1.5 rounded-md border transition-colors cursor-pointer ${
                    durationTicks === t
                      ? 'bg-[#0b1930] text-white font-semibold border-[#0b1930]'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {t} Tick{t > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. MULTIPLIER Mode Settings */}
      {orderType === 'MULTIPLIER' && (
        <div className="space-y-3 mb-3.5">
          <div>
            <div className="flex items-center justify-between text-slate-600 mb-1.5">
              <span className="font-medium">Multiplier (Leverage)</span>
              <span className="text-teal-700 font-mono font-semibold">x{multiplier}</span>
            </div>
            <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
              {[10, 20, 50, 100, 200].map((m) => (
                <button
                  key={m}
                  onClick={() => setMultiplier(m)}
                  className={`py-1.5 rounded-md border transition-colors cursor-pointer ${
                    multiplier === m
                      ? 'bg-[#0b1930] text-white font-semibold border-[#0b1930]'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {m}x
                </button>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono">
              Position value: ${(stake * multiplier).toLocaleString()}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div>
              <div className="flex items-center justify-between text-slate-600 mb-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useTakeProfit}
                    onChange={(e) => setUseTakeProfit(e.target.checked)}
                    className="rounded border-slate-300 text-teal-600 focus:ring-0"
                  />
                  <span>Take Profit</span>
                </label>
                {useTakeProfit && (
                  <span className="font-mono text-emerald-600 font-semibold">
                    +${tpAmount.toFixed(2)} (+{((tpAmount / stake) * 100).toFixed(0)}%)
                  </span>
                )}
              </div>
              {useTakeProfit && (
                <input
                  type="range"
                  min={5}
                  max={stake * 3}
                  step={5}
                  value={tpAmount}
                  onChange={(e) => setTpAmount(Number(e.target.value))}
                  className="w-full accent-emerald-600"
                />
              )}
            </div>

            <div>
              <div className="flex items-center justify-between text-slate-600 mb-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useStopLoss}
                    onChange={(e) => setUseStopLoss(e.target.checked)}
                    className="rounded border-slate-300 text-rose-600 focus:ring-0"
                  />
                  <span>Stop Loss</span>
                </label>
                {useStopLoss && (
                  <span className="font-mono text-rose-600 font-semibold">
                    -${slAmount.toFixed(2)} (-{((slAmount / stake) * 100).toFixed(0)}%)
                  </span>
                )}
              </div>
              {useStopLoss && (
                <input
                  type="range"
                  min={5}
                  max={stake}
                  step={5}
                  value={slAmount}
                  onChange={(e) => setSlAmount(Number(e.target.value))}
                  className="w-full accent-rose-600"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. ACCUMULATOR Mode Settings */}
      {orderType === 'ACCUMULATOR' && (
        <div className="space-y-3 mb-3.5">
          <div>
            <div className="flex items-center justify-between text-slate-600 mb-1.5">
              <span className="font-medium">Growth Rate per Tick</span>
              <span className="text-amber-700 font-mono font-bold">{(growthRate * 100).toFixed(0)}%</span>
            </div>
            <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
              {[0.01, 0.02, 0.03, 0.04, 0.05].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  disabled={!!activeAccumulator}
                  onClick={() => setGrowthRate(rate)}
                  className={`py-1.5 rounded-md border transition-colors cursor-pointer ${
                    growthRate === rate
                      ? 'bg-amber-500 text-slate-950 font-bold border-amber-500 shadow-xs'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {(rate * 100).toFixed(0)}%
                </button>
              ))}
            </div>
          </div>

          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1 font-mono text-[11px]">
            <div className="flex justify-between text-slate-600">
              <span>10 Ticks Payout:</span>
              <span className="text-emerald-600 font-bold">${(stake * Math.pow(1 + growthRate, 10)).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>20 Ticks Payout:</span>
              <span className="text-emerald-600 font-bold">${(stake * Math.pow(1 + growthRate, 20)).toFixed(2)}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-slate-600 mb-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useAccumAutoProfit}
                  onChange={(e) => setUseAccumAutoProfit(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500 focus:ring-0"
                />
                <span>Auto Cash Out Profit</span>
              </label>
              {useAccumAutoProfit && (
                <span className="font-mono text-emerald-600 font-bold">+${accumAutoProfit.toFixed(2)}</span>
              )}
            </div>
            {useAccumAutoProfit && (
              <input
                type="range"
                min={5}
                max={stake * 4}
                step={5}
                value={accumAutoProfit}
                onChange={(e) => setAccumAutoProfit(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            )}
          </div>
        </div>
      )}

      {/* Live Ask / Bid Spread Pill */}
      <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 py-1.5 px-2.5 bg-slate-50 rounded-lg border border-slate-200 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Spread:</span>
          <span className="text-slate-800 font-semibold">{activeSymbol.spreadPips} pips</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Live Quote:</span>
          <span className="text-slate-900 font-bold">{activeSymbol.currentPrice.toFixed(decimals)}</span>
        </div>
      </div>

      {/* Execution Buttons Area */}
      {orderType === 'HIGHER_LOWER' && (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => handleLowerHigherTrade('BUY')}
            className="group relative flex flex-col items-center justify-center py-3 px-2 bg-[#2bbbad] hover:bg-[#239b8e] active:scale-[0.98] text-white rounded-xl shadow-sm transition-all cursor-pointer font-medium"
          >
            <div className="flex items-center gap-1.5 text-sm font-bold tracking-wide">
              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
              <span>HIGHER</span>
            </div>
            <div className="font-mono text-[10px] opacity-95 mt-0.5">
              &gt; {targetBarrier.toFixed(decimals)}
            </div>
            <span className="text-[10px] bg-black/15 px-1.5 py-0.2 rounded mt-1 font-mono">
              +95% (${(stake * 1.95).toFixed(2)})
            </span>
          </button>

          <button
            onClick={() => handleLowerHigherTrade('SELL')}
            className="group relative flex flex-col items-center justify-center py-3 px-2 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white rounded-xl shadow-sm transition-all cursor-pointer font-medium"
          >
            <div className="flex items-center gap-1.5 text-sm font-bold tracking-wide">
              <ArrowDownRight className="w-4 h-4 stroke-[2.5]" />
              <span>PURCHASE LOWER</span>
            </div>
            <div className="font-mono text-[10px] opacity-95 mt-0.5">
              &lt; {targetBarrier.toFixed(decimals)}
            </div>
            <span className="text-[10px] bg-black/15 px-1.5 py-0.2 rounded mt-1 font-mono font-bold">
              +95% (${(stake * 1.95).toFixed(2)})
            </span>
          </button>
        </div>
      )}

      {orderType === 'DIGIT_UNDER_OVER' && (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => handleUnderOverTrade('BUY')}
            disabled={selectedDigit === 9}
            className="group relative flex flex-col items-center justify-center py-3 px-2 bg-[#2bbbad] hover:bg-[#239b8e] active:scale-[0.98] text-white rounded-xl shadow-sm transition-all cursor-pointer font-medium disabled:opacity-50"
          >
            <div className="flex items-center gap-1.5 text-sm font-bold tracking-wide">
              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
              <span>OVER {selectedDigit}</span>
            </div>
            <div className="font-mono text-[10px] opacity-95 mt-0.5">
              Digit &gt; {selectedDigit}
            </div>
            <span className="text-[10px] bg-black/15 px-1.5 py-0.2 rounded mt-1 font-mono">
              +{overProfitPct}% (${overPotentialPayout})
            </span>
          </button>

          <button
            onClick={() => handleUnderOverTrade('SELL')}
            disabled={selectedDigit === 0}
            className="group relative flex flex-col items-center justify-center py-3 px-2 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white rounded-xl shadow-sm transition-all cursor-pointer font-medium disabled:opacity-50"
          >
            <div className="flex items-center gap-1.5 text-sm font-bold tracking-wide">
              <TrendingDown className="w-4 h-4 stroke-[2.5]" />
              <span>PURCHASE UNDER {selectedDigit}</span>
            </div>
            <div className="font-mono text-[10px] opacity-95 mt-0.5">
              Digit &lt; {selectedDigit}
            </div>
            <span className="text-[10px] bg-black/15 px-1.5 py-0.2 rounded mt-1 font-mono font-bold">
              +{underProfitPct}% (${underPotentialPayout})
            </span>
          </button>
        </div>
      )}

      {orderType === 'MULTIPLIER' && (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => handleMultiplierTrade('BUY')}
            className="group relative flex flex-col items-center justify-center py-3 px-2 bg-[#2bbbad] hover:bg-[#239b8e] active:scale-[0.98] text-white rounded-xl shadow-sm transition-all cursor-pointer font-medium"
          >
            <div className="flex items-center gap-1.5 text-sm font-bold tracking-wide">
              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
              <span>BUY / LONG</span>
            </div>
            <div className="font-mono text-[11px] opacity-95 tracking-tight mt-0.5">
              Ask: {activeSymbol.ask.toFixed(decimals)}
            </div>
          </button>

          <button
            onClick={() => handleMultiplierTrade('SELL')}
            className="group relative flex flex-col items-center justify-center py-3 px-2 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white rounded-xl shadow-sm transition-all cursor-pointer font-medium"
          >
            <div className="flex items-center gap-1.5 text-sm font-bold tracking-wide">
              <ArrowDownRight className="w-4 h-4 stroke-[2.5]" />
              <span>SELL / LOWER</span>
            </div>
            <div className="font-mono text-[11px] opacity-95 tracking-tight mt-0.5">
              Bid: {activeSymbol.bid.toFixed(decimals)}
            </div>
          </button>
        </div>
      )}

      {orderType === 'ACCUMULATOR' && (
        activeAccumulator ? (
          <button
            onClick={() => closePosition(activeAccumulator.id)}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold rounded-xl shadow-sm font-mono text-sm transition-all cursor-pointer animate-pulse flex items-center justify-center gap-2"
          >
            <span>CASH OUT NOW ${(activeAccumulator.currentPayout || activeAccumulator.stake).toFixed(2)}</span>
            <span className="bg-black/20 px-2 py-0.5 rounded text-xs">
              +${(activeAccumulator.pnl || 0).toFixed(2)}
            </span>
          </button>
        ) : (
          <button
            onClick={handleStartAccumulator}
            className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-bold rounded-xl shadow-sm font-mono text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Flame className="w-4 h-4 fill-current" />
            <span>START ACCUMULATOR (${stake})</span>
          </button>
        )
      )}

      {/* Risk Guardian Note */}
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 justify-center mt-3 pt-2 border-t border-slate-100">
        <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
        <span>nderiskool Risk Guardian active · Max loss bounded to stake</span>
      </div>
    </div>
  );
};
