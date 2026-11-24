import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { AutoStrategyType, OrderType } from '../types/trading';
import {
  Cpu,
  Power,
  Plus,
  Play,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Flame,
  Zap,
  Sliders,
  Shield,
  Clock,
  Sparkles,
} from 'lucide-react';

export const AutoTradeView: React.FC = () => {
  const {
    isAutoTradeActive,
    toggleAutoTrade,
    autoTradeRules,
    addAutoTradeRule,
    toggleAutoTradeRule,
    deleteAutoTradeRule,
    tradeSignals,
    executeSignalTrade,
    markets,
    account,
  } = useTrading();

  const [showAddModal, setShowAddModal] = useState(false);
  const [ruleName, setRuleName] = useState('New Auto-Trade Strategy');
  const [ruleSymbol, setRuleSymbol] = useState(markets[0].symbol);
  const [strategyType, setStrategyType] = useState<AutoStrategyType>('TREND_FOLLOW');
  const [contractType, setContractType] = useState<OrderType>('ACCUMULATOR');
  const [stake, setStake] = useState(25);
  const [takeProfitTarget, setTakeProfitTarget] = useState(50);
  const [stopLossLimit, setStopLossLimit] = useState(30);
  const [maxDailyTrades, setMaxDailyTrades] = useState(8);

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    addAutoTradeRule({
      name: ruleName,
      symbol: ruleSymbol,
      strategyType,
      contractType,
      stake,
      growthRate: contractType === 'ACCUMULATOR' ? 0.03 : undefined,
      multiplier: contractType === 'MULTIPLIER' ? 50 : undefined,
      durationSeconds: contractType === 'RISE_FALL' ? 30 : undefined,
      takeProfitTarget,
      stopLossLimit,
      isActive: true,
      maxDailyTrades,
    });
    setShowAddModal(false);
  };

  const totalAutoProfit = autoTradeRules.reduce((acc, r) => acc + r.totalProfit, 0);
  const totalTradesToday = autoTradeRules.reduce((acc, r) => acc + r.tradesToday, 0);

  return (
    <div className="max-w-[1680px] mx-auto p-4 md:p-6 w-full space-y-4 text-xs select-none">
      {/* Top Banner with Master Switch */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 bg-white border border-slate-200 rounded-2xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Automatic Trade &amp; Signal Engine</h2>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                  isAutoTradeActive
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {isAutoTradeActive ? 'ENGINE RUNNING (AUTO-EXECUTING)' : 'ENGINE PAUSED'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Rule-based auto-execution for Forex Multipliers, Rise/Fall, and Accumulators with safety guardrails
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Auto-Trade Rule</span>
          </button>

          <button
            onClick={toggleAutoTrade}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer shadow-sm ${
              isAutoTradeActive
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-[#2bbbad] hover:bg-[#239b8e] text-white'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{isAutoTradeActive ? 'Disable Auto-Trading' : 'Enable Auto-Trading'}</span>
          </button>
        </div>
      </div>

      {/* Stats KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <span className="text-slate-500 text-[10px] block">Auto-Trade Net Profit</span>
          <span
            className={`text-xl font-bold ${
              totalAutoProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {totalAutoProfit >= 0 ? '+' : ''}${totalAutoProfit.toFixed(2)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Realized Strategy Gains</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <span className="text-slate-500 text-[10px] block">Auto Trades Today</span>
          <span className="text-xl font-bold text-teal-700">{totalTradesToday}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Automated Orders</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <span className="text-slate-500 text-[10px] block">Active Rules</span>
          <span className="text-xl font-bold text-slate-900">
            {autoTradeRules.filter((r) => r.isActive).length}/{autoTradeRules.length}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Running Filters</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <span className="text-slate-500 text-[10px] block">Trader Account</span>
          <span className="text-xl font-bold text-emerald-600">
            ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {account.isReal ? 'Deriv Real Account' : 'Demo Virtual Account'}
          </span>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-teal-600" />
              <h3 className="font-bold text-slate-900 text-sm">Automated Trade Execution Rules</h3>
            </div>
            <span className="text-slate-500 text-[11px] font-mono">
              Evaluated every 5 seconds on tick stream
            </span>
          </div>

          <div className="space-y-3">
            {autoTradeRules.length === 0 ? (
              <div className="py-8 text-center text-slate-500">No auto-trade rules configured. Click New Rule above.</div>
            ) : (
              autoTradeRules.map((rule) => {
                const targetMarket = markets.find((m) => m.symbol === rule.symbol);

                return (
                  <div
                    key={rule.id}
                    className={`p-3.5 rounded-xl border transition-colors ${
                      rule.isActive
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-slate-50/50 border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{rule.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            rule.contractType === 'ACCUMULATOR'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : rule.contractType === 'MULTIPLIER'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {rule.contractType}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleAutoTradeRule(rule.id)}
                          className={`px-2.5 py-1 text-[11px] font-mono rounded-md transition-colors cursor-pointer ${
                            rule.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {rule.isActive ? 'Active' : 'Paused'}
                        </button>
                        <button
                          onClick={() => deleteAutoTradeRule(rule.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 mt-3 pt-2 border-t border-slate-200 font-mono text-[11px] text-slate-500">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Market</span>
                        <span className="text-slate-900 font-semibold">{targetMarket?.displayName || rule.symbol}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Stake</span>
                        <span className="text-slate-900 font-bold">${rule.stake}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Daily Limit</span>
                        <span className="text-slate-900">
                          {rule.tradesToday}/{rule.maxDailyTrades} trades
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 text-[10px] block">Net Profit</span>
                        <span className="text-emerald-600 font-bold">+${rule.totalProfit.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Algorithmic Signal Scanner */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h3 className="font-bold text-slate-900 text-sm">Algorithmic Signals Scanner</h3>
            </div>
            <span className="text-[10px] text-emerald-600 font-mono font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" /> Live Scan
            </span>
          </div>

          <div className="space-y-2.5">
            {tradeSignals.map((sig) => {
              const isBuy = sig.direction === 'BUY';

              return (
                <div
                  key={sig.id}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">{sig.symbolName}</span>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          isBuy ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
                        }`}
                      >
                        {isBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {sig.direction}
                      </span>
                    </div>

                    <span className="font-mono text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      {sig.confidence}% Confidence
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-relaxed font-sans">{sig.reason}</p>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 font-mono text-[10px] text-slate-500">
                    <div>
                      Entry: <strong className="text-slate-900">{sig.entryPrice}</strong> · TP: <strong className="text-emerald-600">{sig.targetPrice}</strong>
                    </div>

                    <button
                      onClick={() => executeSignalTrade(sig)}
                      className="px-2.5 py-1 bg-[#2bbbad] hover:bg-[#239b8e] text-white font-semibold rounded-md transition-colors cursor-pointer text-[10px]"
                    >
                      Execute Signal
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Create Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">Add Auto-Trade Rule</h3>

            <form onSubmit={handleCreateRule} className="space-y-3">
              <div>
                <label className="text-slate-600 block mb-1 font-medium">Rule Name</label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-600 block mb-1 font-medium">Market Symbol</label>
                  <select
                    value={ruleSymbol}
                    onChange={(e) => setRuleSymbol(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs font-mono"
                  >
                    {markets.map((m) => (
                      <option key={m.symbol} value={m.symbol}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-600 block mb-1 font-medium">Contract Type</label>
                  <select
                    value={contractType}
                    onChange={(e) => setContractType(e.target.value as OrderType)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs font-mono"
                  >
                    <option value="ACCUMULATOR">Accumulator</option>
                    <option value="MULTIPLIER">Multiplier (CFD)</option>
                    <option value="RISE_FALL">Rise / Fall</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono">
                <div>
                  <label className="text-slate-500 block mb-1 text-[10px]">Stake ($)</label>
                  <input
                    type="number"
                    value={stake}
                    onChange={(e) => setStake(Number(e.target.value))}
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1 text-[10px]">Take Profit ($)</label>
                  <input
                    type="number"
                    value={takeProfitTarget}
                    onChange={(e) => setTakeProfitTarget(Number(e.target.value))}
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1 text-[10px]">Max Loss ($)</label>
                  <input
                    type="number"
                    value={stopLossLimit}
                    onChange={(e) => setStopLossLimit(Number(e.target.value))}
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#2bbbad] text-white rounded-lg font-bold hover:bg-[#239b8e] transition-colors cursor-pointer"
                >
                  Create Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
