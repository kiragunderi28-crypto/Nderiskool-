import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { ChevronUp, ChevronDown, Play, Square, X, ShieldAlert, Trash2 } from 'lucide-react';

export const BottomBotBar: React.FC = () => {
  const {
    botStrategy,
    botLogs,
    executionSpeed,
    toggleExecutionSpeed,
    startBot,
    stopBot,
    clearBotLogs,
    activePositions,
    closePosition,
  } = useTrading();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);

  return (
    <>
      {/* Expandable Bottom Sheet for Bot Logs & Live Positions */}
      {isDrawerOpen && (
        <div className="fixed inset-x-0 bottom-14 z-30 bg-white border-t border-slate-200 shadow-[0_-12px_36px_rgba(15,23,42,0.12)] rounded-t-3xl max-h-[55vh] flex flex-col">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-bold text-slate-900">Bot Execution Feed</span>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {botStrategy.wins}W / {botStrategy.losses}L · Net{' '}
                <strong className={botStrategy.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {botStrategy.netProfit >= 0 ? '+' : ''}${botStrategy.netProfit.toFixed(2)}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearBotLogs}
                title="Clear logs"
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded cursor-pointer"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Open Positions quick view */}
            <div className="space-y-2">
              <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                Active Positions ({activePositions.length})
              </div>
              {activePositions.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-center">
                  No open contracts. Press Run or open a Manual Trade.
                </div>
              ) : (
                <div className="space-y-2">
                  {activePositions.map((p) => (
                    <div
                      key={p.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between font-mono"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{p.symbolName}</div>
                        <div className="text-[10px] text-slate-500">
                          {p.type} · ${p.stake.toFixed(2)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${p.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {p.pnl >= 0 ? '+' : ''}${p.pnl.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => closePosition(p.id)}
                          className="px-2 py-1 rounded bg-slate-900 text-white text-[10px] font-bold cursor-pointer"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bot Execution Journal */}
            <div className="space-y-2">
              <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                Bot Journal Logs
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto font-mono text-[11px]">
                {botLogs.slice(0, 15).map((log) => (
                  <div
                    key={log.id}
                    className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-2"
                  >
                    <span
                      className={
                        log.type === 'WIN'
                          ? 'text-emerald-700 font-semibold'
                          : log.type === 'LOSS'
                          ? 'text-rose-600 font-semibold'
                          : log.type === 'ALERT'
                          ? 'text-amber-700 font-semibold'
                          : 'text-slate-700'
                      }
                    >
                      {log.message}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Footer Container matching Screenshot */}
      <footer className="sticky bottom-0 z-30 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] select-none">
        {/* Top Pull-up Handle + Risk Disclaimer Pill */}
        <div className="relative h-0">
          {/* Risk Disclaimer Floating Amber Pill (Left) */}
          <button
            type="button"
            onClick={() => setIsRiskModalOpen(true)}
            className="absolute left-3 -top-9 px-3 py-1.5 rounded-md bg-[#eab308] hover:bg-amber-400 text-slate-950 font-semibold text-xs shadow-md transition-colors cursor-pointer whitespace-nowrap"
          >
            Risk Disclaimer
          </button>

          {/* Centered Grab Bar & Pull-up Chevron */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen((o) => !o)}
            aria-label="Toggle Bot Activity Drawer"
            className="absolute left-1/2 -translate-x-1/2 -top-7 px-6 py-1 flex flex-col items-center justify-center bg-white/90 hover:bg-white rounded-t-xl border-t border-x border-slate-200 shadow-xs cursor-pointer"
          >
            <span className="w-8 h-1 rounded-full bg-slate-300 mb-0.5" />
            {isDrawerOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-700" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-700" />
            )}
          </button>
        </div>

        {/* Bottom 3-Column Execution Controls */}
        <div className="max-w-5xl mx-auto px-3 py-2 flex items-center gap-2 sm:gap-3">
          {/* 1. Run / Stop Button */}
          {botStrategy.isRunning ? (
            <button
              type="button"
              onClick={stopBot}
              className="min-h-[42px] px-4 sm:px-5 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm transition-all active:scale-[0.98] cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={startBot}
              className="min-h-[42px] px-4 sm:px-5 rounded-md bg-[#2bbbad] hover:bg-[#239b8e] text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm transition-all active:scale-[0.98] cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run</span>
            </button>
          )}

          {/* 2. EXECUTION FAST Toggle Switch */}
          <button
            type="button"
            onClick={toggleExecutionSpeed}
            className={`min-h-[42px] px-2.5 sm:px-3 py-1 rounded-md border flex items-center gap-2.5 transition-colors cursor-pointer shrink-0 ${
              executionSpeed === 'FAST'
                ? 'bg-amber-50/80 border-amber-200/80'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="text-left leading-tight">
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                EXECUTION
              </div>
              <div className="text-xs font-extrabold text-slate-900">
                {executionSpeed}
              </div>
            </div>

            <div
              className={`w-10 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                executionSpeed === 'FAST' ? 'bg-amber-400/80 justify-end' : 'bg-slate-300 justify-start'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
            </div>
          </button>

          {/* 3. Status Indicator Box */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen((o) => !o)}
            className={`min-h-[42px] flex-1 px-3 py-1.5 rounded-md border flex flex-col items-center justify-center relative cursor-pointer transition-colors ${
              botStrategy.isRunning
                ? 'bg-emerald-50/60 border-emerald-400'
                : 'bg-white border-teal-400/50 hover:bg-slate-50'
            }`}
          >
            <span className="text-xs font-semibold text-slate-800 truncate max-w-full">
              {botStrategy.isRunning
                ? `Bot running (${botStrategy.symbol}) · ${botStrategy.totalRuns} trades`
                : 'Bot is not running'}
            </span>

            {/* Bottom 3-dot progress track matching screenshot */}
            <div className="w-4/5 max-w-[220px] flex items-center justify-between mt-1.5 relative">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] bg-slate-200" />
              <span
                className={`relative w-1.5 h-1.5 rounded-full ${
                  botStrategy.isRunning ? 'bg-emerald-500 animate-ping' : 'bg-slate-600'
                }`}
              />
              <span
                className={`relative w-1.5 h-1.5 rounded-full ${
                  botStrategy.isRunning ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              />
              <span
                className={`relative w-1.5 h-1.5 rounded-full ${
                  botStrategy.isRunning ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              />
            </div>
          </button>
        </div>
      </footer>

      {/* Risk Disclaimer Modal */}
      {isRiskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs">
            <div className="px-5 py-4 bg-[#0b1930] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm">Risk Disclaimer</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRiskModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-slate-600 leading-relaxed">
              <p>
                Deriv offers complex derivatives, including options, accumulators, and multipliers. Trading carries significant risk of capital loss and is not suitable for every investor.
              </p>
              <p>
                Always test automated strategies and Martingale parameters on your <strong>Demo Virtual</strong> account before trading live Real funds via <strong>nderiskool</strong> or SafariCom M-Pesa.
              </p>
              <button
                type="button"
                onClick={() => setIsRiskModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-[#0b1930] hover:bg-slate-800 text-white font-bold cursor-pointer"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
