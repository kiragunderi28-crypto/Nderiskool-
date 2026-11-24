import React from 'react';
import { useTrading } from '../context/TradingContext';
import {
  Play,
  Square,
  Bot,
  Activity,
  Zap,
  TrendingUp,
  RotateCcw,
  Shield,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';

export const DerivBotView: React.FC = () => {
  const {
    botStrategy,
    botLogs,
    startBot,
    stopBot,
    updateBotStrategy,
    clearBotLogs,
    markets,
    activeSymbol,
    account,
  } = useTrading();

  const isRunning = botStrategy.isRunning;
  const winRate =
    botStrategy.totalRuns > 0
      ? ((botStrategy.wins / botStrategy.totalRuns) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 w-full space-y-4 text-xs select-none">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">nderiskool Deriv Bot Builder</h2>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  isRunning
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {isRunning ? 'BOT EXECUTING' : 'BOT STANDBY'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Automated algorithmic trade engine running directly on Deriv live tick streams
            </p>
          </div>
        </div>

        {/* Start / Stop Master Switch */}
        <div className="flex items-center gap-3">
          {isRunning ? (
            <button
              onClick={stopBot}
              className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-bold rounded-xl shadow-sm transition-all cursor-pointer text-sm"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop Bot</span>
            </button>
          ) : (
            <button
              onClick={startBot}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#2bbbad] hover:bg-[#239b8e] active:scale-[0.98] text-white font-bold rounded-xl shadow-sm transition-all cursor-pointer text-sm"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Run Automated Bot</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 font-mono">
        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <span className="text-slate-500 text-[10px] block">Net Bot Profit</span>
          <span
            className={`text-lg font-bold ${
              botStrategy.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {botStrategy.netProfit >= 0 ? '+' : ''}${botStrategy.netProfit.toFixed(2)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Realized Gain</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <span className="text-slate-500 text-[10px] block">Bot Win Rate</span>
          <span className="text-lg font-bold text-emerald-600">{winRate}%</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {botStrategy.wins} W / {botStrategy.losses} L
          </span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <span className="text-slate-500 text-[10px] block">Total Executions</span>
          <span className="text-lg font-bold text-slate-900">{botStrategy.totalRuns}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Completed Trades</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <span className="text-slate-500 text-[10px] block">Next Trade Stake</span>
          <span className="text-lg font-bold text-teal-700">${botStrategy.currentStake.toFixed(2)}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Dynamic Sizing</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <span className="text-slate-500 text-[10px] block">Account Balance</span>
          <span className="text-lg font-bold text-slate-900">
            ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5 font-normal">
            {account.isReal ? 'Deriv Real' : 'Demo Virtual'}
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-xs p-4 space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Sliders className="w-4 h-4 text-teal-600" />
            <span>Algorithm &amp; Risk Parameters</span>
          </h3>

          <div>
            <label className="text-slate-600 block mb-1.5 font-medium">Select Trading Strategy</label>
            <div className="grid grid-cols-1 gap-2">
              {[
                {
                  id: 'EMA_CROSS',
                  name: 'EMA 9 / 21 Trend Crossover',
                  desc: 'Buys on bullish crossover, Sells on bearish crossover',
                },
                {
                  id: 'RSI_REVERSAL',
                  name: 'RSI (14) Mean Reversion',
                  desc: 'Buys when oversold (< 35), Sells when overbought (> 65)',
                },
                {
                  id: 'MARTINGALE_SCALPER',
                  name: 'Martingale Tick Scalper',
                  desc: 'High-frequency Rise/Fall with 2x recovery stake on loss',
                },
              ].map((strat) => (
                <button
                  key={strat.id}
                  type="button"
                  disabled={isRunning}
                  onClick={() => updateBotStrategy({ strategyType: strat.id as any })}
                  className={`p-3 rounded-xl border text-left transition-colors cursor-pointer disabled:opacity-60 ${
                    botStrategy.strategyType === strat.id
                      ? 'bg-teal-50 border-teal-500 text-slate-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-bold text-xs flex items-center justify-between">
                    <span>{strat.name}</span>
                    {botStrategy.strategyType === strat.id && (
                      <CheckCircle2 className="w-4 h-4 text-teal-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 font-normal">{strat.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-slate-600 block mb-1 font-medium">Target Market Asset</label>
            <select
              disabled={isRunning}
              value={botStrategy.symbol}
              onChange={(e) => updateBotStrategy({ symbol: e.target.value })}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono text-xs focus:outline-none focus:border-teal-500 disabled:opacity-60"
            >
              {markets.map((m) => (
                <option key={m.symbol} value={m.symbol}>
                  {m.displayName} ({m.category.replace('_', ' ')})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-600 block mb-1 font-medium">Base Stake ($)</label>
              <input
                type="number"
                disabled={isRunning}
                min={1}
                max={500}
                value={botStrategy.baseStake}
                onChange={(e) =>
                  updateBotStrategy({
                    baseStake: Number(e.target.value),
                    currentStake: Number(e.target.value),
                  })
                }
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 font-mono text-xs focus:outline-none focus:border-teal-500 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-slate-600 block mb-1 font-medium">Duration (Sec)</label>
              <select
                disabled={isRunning}
                value={botStrategy.durationSeconds}
                onChange={(e) => updateBotStrategy({ durationSeconds: Number(e.target.value) })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 font-mono text-xs focus:outline-none focus:border-teal-500 disabled:opacity-60"
              >
                <option value={15}>15 Seconds</option>
                <option value={30}>30 Seconds</option>
                <option value={60}>60 Seconds</option>
              </select>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="text-slate-800 font-semibold text-xs flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span>Automated Safety Guardrails</span>
            </span>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px]">Take Profit Stop</span>
                <div className="relative mt-1">
                  <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-500 font-mono">$</span>
                  <input
                    type="number"
                    disabled={isRunning}
                    value={botStrategy.takeProfitTarget}
                    onChange={(e) => updateBotStrategy({ takeProfitTarget: Number(e.target.value) })}
                    className="w-full pl-6 pr-2 py-1 bg-white border border-slate-300 rounded-md text-slate-900 font-mono disabled:opacity-60"
                  />
                </div>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Max Loss Stop</span>
                <div className="relative mt-1">
                  <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-500 font-mono">$</span>
                  <input
                    type="number"
                    disabled={isRunning}
                    value={botStrategy.stopLossLimit}
                    onChange={(e) => updateBotStrategy({ stopLossLimit: Number(e.target.value) })}
                    className="w-full pl-6 pr-2 py-1 bg-white border border-slate-300 rounded-md text-slate-900 font-mono disabled:opacity-60"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Bot Execution Feed */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-xs p-4 flex flex-col min-h-[460px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-slate-900 text-sm">Bot Execution Live Feed</h3>
            </div>
            <button
              onClick={clearBotLogs}
              className="text-slate-500 hover:text-slate-900 flex items-center gap-1 text-[11px] cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Clear Terminal</span>
            </button>
          </div>

          <div className="flex-1 mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono text-[11px] overflow-y-auto max-h-[420px] space-y-2">
            {botLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-500">No logs yet. Click Run Bot to begin.</div>
            ) : (
              botLogs.map((log) => {
                const date = new Date(log.timestamp);
                const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                return (
                  <div key={log.id} className="flex items-start gap-2.5 leading-relaxed">
                    <span className="text-slate-400 shrink-0">[{time}]</span>
                    {log.type === 'TRADE' && (
                      <span className="text-blue-600 font-bold shrink-0">[ORDER]</span>
                    )}
                    {log.type === 'WIN' && (
                      <span className="text-emerald-600 font-bold shrink-0">[WIN]</span>
                    )}
                    {log.type === 'LOSS' && (
                      <span className="text-rose-600 font-bold shrink-0">[LOSS]</span>
                    )}
                    {log.type === 'ALERT' && (
                      <span className="text-amber-600 font-bold shrink-0">[ALERT]</span>
                    )}
                    {log.type === 'INFO' && (
                      <span className="text-slate-500 font-medium shrink-0">[INFO]</span>
                    )}
                    <span
                      className={
                        log.type === 'WIN'
                          ? 'text-emerald-700 font-semibold'
                          : log.type === 'LOSS'
                          ? 'text-rose-700 font-semibold'
                          : log.type === 'ALERT'
                          ? 'text-amber-700 font-semibold'
                          : 'text-slate-700'
                      }
                    >
                      {log.message}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
