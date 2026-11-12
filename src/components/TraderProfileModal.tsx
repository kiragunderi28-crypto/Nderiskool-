import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { X, Award, Shield, Calculator, Check, TrendingUp, AlertCircle, UserCheck } from 'lucide-react';

export const TraderProfileModal: React.FC = () => {
  const { isProfileModalOpen, setIsProfileModalOpen, account, tradeHistory, activePositions } = useTrading();

  // Position sizing calculator state
  const [riskPercent, setRiskPercent] = useState<number>(1.5);
  const [stopLossPips, setStopLossPips] = useState<number>(25);

  // Daily Risk limits state
  const [maxDailyLoss, setMaxDailyLoss] = useState<number>(300);
  const [dailyProfitTarget, setDailyProfitTarget] = useState<number>(500);

  if (!isProfileModalOpen) return null;

  // Calculate statistics
  const totalTrades = tradeHistory.length;
  const wonTrades = tradeHistory.filter((t) => t.status === 'WON' || t.pnl > 0).length;
  const winRate = totalTrades > 0 ? ((wonTrades / totalTrades) * 100).toFixed(1) : '0.0';

  const grossProfit = tradeHistory
    .filter((t) => t.pnl > 0)
    .reduce((acc, t) => acc + t.pnl, 0);

  const grossLoss = Math.abs(
    tradeHistory.filter((t) => t.pnl < 0).reduce((acc, t) => acc + t.pnl, 0)
  );

  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? 'MAX' : '0.00';
  const totalNetPnl = tradeHistory.reduce((acc, t) => acc + t.pnl, 0);

  // Risk sizing formula:
  // Risk Capital = Balance * (RiskPercent / 100)
  // Pip value for 1 std lot (EUR/USD) = $10 / pip
  // Recommended Stake / Lot
  const riskAmount = (account.balance * (riskPercent / 100));
  const recommendedLotSize = (riskAmount / (stopLossPips * 10)).toFixed(2);
  const recommendedStake = Math.round(riskAmount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs select-none">
      <div className="relative w-full max-w-xl bg-[#0f141f] border border-slate-800 rounded-xl shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white text-base shadow-md">
              N
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-100 text-sm">nderiskool</h3>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-950 text-blue-400 border border-blue-800/60 font-mono">
                  <UserCheck className="w-2.5 h-2.5" />
                  VERIFIED TRADER
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">Deriv Terminal Account · ID: {account.loginId}</p>
            </div>
          </div>
          <button
            onClick={() => setIsProfileModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-4 gap-2 font-mono">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <span className="text-slate-500 text-[10px] block">Win Rate</span>
              <span className="text-emerald-400 text-lg font-bold">{winRate}%</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">{wonTrades}/{totalTrades} Trades</span>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <span className="text-slate-500 text-[10px] block">Net P&L</span>
              <span
                className={`text-lg font-bold ${
                  totalNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {totalNetPnl >= 0 ? '+' : ''}${totalNetPnl.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">USD</span>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <span className="text-slate-500 text-[10px] block">Profit Factor</span>
              <span className="text-blue-400 text-lg font-bold">{profitFactor}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Ratio</span>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <span className="text-slate-500 text-[10px] block">Active Stakes</span>
              <span className="text-slate-200 text-lg font-bold">{activePositions.length}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Open Orders</span>
            </div>
          </div>

          {/* Risk Management / Position Sizing Calculator */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs">
              <Calculator className="w-4 h-4 text-blue-400" />
              <span>nderiskool Position Size & Risk Calculator</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Risk per trade: {riskPercent}%</label>
                <input
                  type="range"
                  min={0.5}
                  max={5.0}
                  step={0.5}
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <span className="font-mono text-slate-300 text-[11px] block mt-1">
                  Risk Amount: <strong className="text-white">${riskAmount.toFixed(2)}</strong>
                </span>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Stop Loss: {stopLossPips} pips</label>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={stopLossPips}
                  onChange={(e) => setStopLossPips(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <span className="font-mono text-slate-300 text-[11px] block mt-1">
                  Est. Pip Risk: <strong className="text-white">{stopLossPips} pips</strong>
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex items-center justify-between font-mono text-[11px]">
              <div>
                <span className="text-slate-500 block text-[10px]">Recommended Lot Size</span>
                <span className="text-blue-400 font-bold text-sm">{recommendedLotSize} Lots</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[10px]">Optimal Multiplier Stake</span>
                <span className="text-emerald-400 font-bold text-sm">${recommendedStake}</span>
              </div>
            </div>
          </div>

          {/* Daily Risk Guardian */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Daily Risk Guardian Rules</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Daily Max Loss Threshold</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-500 font-mono">$</span>
                  <input
                    type="number"
                    value={maxDailyLoss}
                    onChange={(e) => setMaxDailyLoss(Number(e.target.value))}
                    className="w-full pl-6 pr-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Daily Take Profit Goal</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-500 font-mono">$</span>
                  <input
                    type="number"
                    value={dailyProfitTarget}
                    onChange={(e) => setDailyProfitTarget(Number(e.target.value))}
                    className="w-full pl-6 pr-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-mono"
                  />
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              The terminal monitors open P&L and warns nderiskool when approaching risk thresholds to preserve capital.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={() => setIsProfileModalOpen(false)}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors cursor-pointer"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
};
