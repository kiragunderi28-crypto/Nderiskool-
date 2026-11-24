import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { TradingChart } from './TradingChart';
import {
  Flame,
  Zap,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  History,
  Play,
  RotateCcw,
} from 'lucide-react';

export const AccumulatorsView: React.FC = () => {
  const {
    activeSymbol,
    account,
    activePositions,
    executeTrade,
    closePosition,
    tradeHistory,
  } = useTrading();

  const [stake, setStake] = useState<number>(20);
  const [growthRate, setGrowthRate] = useState<number>(0.03); // 3% per tick default
  const [takeProfitProfit, setTakeProfitProfit] = useState<number>(30); // auto cashout at $30
  const [useAutoProfit, setUseAutoProfit] = useState<boolean>(true);
  const [takeProfitTicks, setTakeProfitTicks] = useState<number>(15);
  const [useAutoTicks, setUseAutoTicks] = useState<boolean>(false);

  // Find active accumulator position for current symbol
  const activeAccumulator = activePositions.find(
    (p) => p.type === 'ACCUMULATOR' && p.symbol === activeSymbol.symbol
  );

  // Past accumulator trades
  const accumulatorHistory = tradeHistory.filter((t) => t.type === 'ACCUMULATOR');

  const handleStartAccumulator = () => {
    executeTrade({
      type: 'ACCUMULATOR',
      direction: 'BUY',
      stake,
      growthRate,
      takeProfitProfit: useAutoProfit ? takeProfitProfit : undefined,
      takeProfitTicks: useAutoTicks ? takeProfitTicks : undefined,
    });
  };

  const handleCashOut = () => {
    if (activeAccumulator) {
      closePosition(activeAccumulator.id);
    }
  };

  // Barrier calculation
  const currentPrice = activeSymbol.currentPrice;
  const barrierDelta = (activeSymbol.pipSize * 30) || (currentPrice * 0.0005);
  const upperBarrier = activeAccumulator?.upperBarrier ?? (currentPrice + barrierDelta);
  const lowerBarrier = activeAccumulator?.lowerBarrier ?? (currentPrice - barrierDelta);

  const decimals = activeSymbol.symbol.includes('JPY') ? 3 : activeSymbol.symbol.startsWith('R_') ? 2 : 5;

  return (
    <div className="max-w-[1680px] mx-auto p-3 md:p-5 w-full space-y-4 text-xs select-none">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <Flame className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Deriv Accumulators Studio</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
                <Zap className="w-3 h-3" />
                EXPONENTIAL COMPOUNDING
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Compound profit on every single tick price stays within barrier · Cash out anytime
            </p>
          </div>
        </div>

        {/* Live Active Contract Quick Pill */}
        {activeAccumulator ? (
          <div className="flex items-center gap-4 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl">
            <div>
              <span className="text-[10px] text-emerald-700 font-mono block font-semibold">LIVE ACCUMULATION</span>
              <span className="text-base font-bold text-slate-900 font-mono">
                {activeAccumulator.tickCount || 0} Ticks ({(activeAccumulator.growthRate! * 100).toFixed(0)}%/tick)
              </span>
            </div>
            <button
              onClick={handleCashOut}
              className="py-2 px-4 bg-[#2bbbad] hover:bg-[#239b8e] active:scale-95 text-white font-bold rounded-xl shadow-sm font-mono text-sm transition-all cursor-pointer animate-pulse"
            >
              CASH OUT ${(activeAccumulator.currentPayout || activeAccumulator.stake).toFixed(2)}
            </button>
          </div>
        ) : (
          <div className="text-right font-mono text-[11px]">
            <span className="text-slate-500 block text-[10px]">Ready for trader nderiskool</span>
            <span className="text-slate-700">
              Balance: <strong className="text-teal-700">${account.balance.toFixed(2)}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Main Grid: Left Chart Viewport + Right Accumulator Control Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 flex flex-col gap-3 min-h-[500px]">
          <div className="flex-1 min-h-[460px]">
            <TradingChart />
          </div>

          {/* Barrier Range Status Strip */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-white border border-slate-200 rounded-2xl shadow-xs font-mono text-[11px]">
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-rose-600 text-[10px] block font-bold">UPPER BARRIER</span>
              <span className="text-slate-900 font-bold">{upperBarrier.toFixed(decimals)}</span>
              <span className="text-[9px] text-slate-500 block mt-0.5">Breach = Knockout</span>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-slate-500 text-[10px] block font-medium">CURRENT QUOTE</span>
              <span className="text-slate-900 text-sm font-bold">{currentPrice.toFixed(decimals)}</span>
              <span className="text-[9px] text-emerald-600 block mt-0.5 font-bold">In Safe Zone</span>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-right">
              <span className="text-rose-600 text-[10px] block font-bold">LOWER BARRIER</span>
              <span className="text-slate-900 font-bold">{lowerBarrier.toFixed(decimals)}</span>
              <span className="text-[9px] text-slate-500 block mt-0.5">Breach = Knockout</span>
            </div>
          </div>
        </div>

        {/* Right: Accumulator Order & Compounding Engine */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl shadow-xs p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>Accumulator Setup</span>
              </h3>
              <span className="font-mono text-slate-500 text-[11px]">{activeSymbol.displayName}</span>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-slate-600 mb-1.5">
                <span className="font-medium">Growth Rate per Tick</span>
                <span className="font-mono text-amber-600 font-bold">{(growthRate * 100).toFixed(0)}%</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 font-mono text-[11px]">
                {[0.01, 0.02, 0.03, 0.04, 0.05].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    disabled={!!activeAccumulator}
                    onClick={() => setGrowthRate(rate)}
                    className={`py-2 rounded-lg border transition-colors cursor-pointer disabled:opacity-60 ${
                      growthRate === rate
                        ? 'bg-amber-500 text-slate-950 font-bold border-amber-500 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {(rate * 100).toFixed(0)}%
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-slate-600 mb-1.5">
                <span className="font-medium">Stake (USD)</span>
                <span className="font-mono text-slate-500">Avail: ${account.balance.toFixed(2)}</span>
              </div>
              <div className="relative mb-2">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-mono">$</span>
                <input
                  type="number"
                  min={1}
                  max={account.balance}
                  disabled={!!activeAccumulator}
                  value={stake}
                  onChange={(e) => setStake(Math.max(1, Number(e.target.value)))}
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-900 text-sm focus:outline-none focus:border-amber-500 disabled:opacity-60"
                />
              </div>
              <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
                {[5, 10, 25, 50, 100].map((v) => (
                  <button
                    key={v}
                    type="button"
                    disabled={!!activeAccumulator}
                    onClick={() => setStake(v)}
                    className={`py-1 rounded-md border transition-colors cursor-pointer ${
                      stake === v
                        ? 'bg-amber-50 text-amber-700 border-amber-400 font-bold'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    ${v}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 font-mono text-[11px]">
              <div className="text-slate-500 font-medium text-[10px] uppercase border-b border-slate-200 pb-1">
                Projected Exponential Payout:
              </div>
              <div className="flex justify-between text-slate-700">
                <span>5 Ticks:</span>
                <span className="text-emerald-600 font-bold">${(stake * Math.pow(1 + growthRate, 5)).toFixed(2)} (+{((Math.pow(1 + growthRate, 5) - 1) * 100).toFixed(0)}%)</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>10 Ticks:</span>
                <span className="text-emerald-600 font-bold">${(stake * Math.pow(1 + growthRate, 10)).toFixed(2)} (+{((Math.pow(1 + growthRate, 10) - 1) * 100).toFixed(0)}%)</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>20 Ticks:</span>
                <span className="text-emerald-600 font-bold">${(stake * Math.pow(1 + growthRate, 20)).toFixed(2)} (+{((Math.pow(1 + growthRate, 20) - 1) * 100).toFixed(0)}%)</span>
              </div>
            </div>

            <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useAutoProfit}
                    onChange={(e) => setUseAutoProfit(e.target.checked)}
                    className="rounded border-slate-300 text-amber-500 focus:ring-0"
                  />
                  <span>Auto Cash Out at Profit</span>
                </label>
                {useAutoProfit && (
                  <span className="font-mono text-emerald-600 font-bold">+${takeProfitProfit.toFixed(2)}</span>
                )}
              </div>
              {useAutoProfit && (
                <input
                  type="range"
                  min={5}
                  max={stake * 5}
                  step={5}
                  value={takeProfitProfit}
                  onChange={(e) => setTakeProfitProfit(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              )}
            </div>
          </div>

          <div className="pt-3">
            {activeAccumulator ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleCashOut}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold rounded-xl shadow-md font-mono text-base transition-all cursor-pointer animate-pulse flex items-center justify-center gap-2"
                >
                  <span>CASH OUT ${(activeAccumulator.currentPayout || activeAccumulator.stake).toFixed(2)}</span>
                  <span className="text-xs bg-black/20 px-2 py-0.5 rounded">
                    +${(activeAccumulator.pnl || 0).toFixed(2)}
                  </span>
                </button>
                <div className="text-center font-mono text-[11px] text-slate-600">
                  Surviving tick count: <strong className="text-slate-900">{activeAccumulator.tickCount || 0}</strong> ticks
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartAccumulator}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-bold rounded-xl shadow-sm font-mono text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Flame className="w-4 h-4 fill-current" />
                <span>START ACCUMULATOR (${stake})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Past Accumulators Table */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="font-bold text-slate-900 text-sm">Accumulator Performance History</h3>
          </div>
          <span className="text-slate-500 font-mono text-[11px]">
            {accumulatorHistory.length} completed contracts
          </span>
        </div>

        {accumulatorHistory.length === 0 ? (
          <div className="py-6 text-center text-slate-500">
            No accumulator trades completed yet. Start your first contract above to test tick compounding!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono">
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase border-b border-slate-200 pb-1.5">
                  <th className="pb-1.5 font-medium">Symbol</th>
                  <th className="pb-1.5 font-medium">Stake</th>
                  <th className="pb-1.5 font-medium">Entry Price</th>
                  <th className="pb-1.5 font-medium">Exit Price</th>
                  <th className="pb-1.5 font-medium">Outcome</th>
                  <th className="pb-1.5 font-medium text-right">Net P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {accumulatorHistory.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="py-2 text-slate-900 font-bold">{t.symbolName}</td>
                    <td className="py-2 text-slate-700">${t.stake.toFixed(2)}</td>
                    <td className="py-2 text-slate-500">{t.entryPrice}</td>
                    <td className="py-2 text-slate-800">{t.exitPrice}</td>
                    <td className="py-2">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold ${
                          t.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {t.pnl >= 0 ? 'CASHED OUT' : 'KNOCKED OUT'}
                      </span>
                    </td>
                    <td className="py-2 text-right font-bold">
                      <span className={t.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                        {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
