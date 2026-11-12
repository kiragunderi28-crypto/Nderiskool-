import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { X, CheckCircle2, AlertCircle, Clock, Check, TrendingUp, TrendingDown } from 'lucide-react';

export const PositionsManager: React.FC = () => {
  const { activePositions, tradeHistory, closePosition } = useTrading();
  const [tab, setTab] = useState<'positions' | 'history'>('positions');

  return (
    <div className="flex flex-col bg-[#0f141f] border border-slate-800 rounded-lg overflow-hidden text-xs">
      {/* Tab Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab('positions')}
            className={`flex items-center gap-2 py-1.5 px-3 rounded font-medium transition-colors ${
              tab === 'positions'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Open Positions</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activePositions.length > 0 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {activePositions.length}
            </span>
          </button>
          <button
            onClick={() => setTab('history')}
            className={`flex items-center gap-2 py-1.5 px-3 rounded font-medium transition-colors ${
              tab === 'history'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Trade History</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-800 text-slate-400">
              {tradeHistory.length}
            </span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-3 overflow-x-auto min-h-[160px] max-h-[300px] overflow-y-auto">
        {tab === 'positions' ? (
          activePositions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500">
              <Clock className="w-8 h-8 stroke-[1.5] mb-2 opacity-50" />
              <p className="font-medium text-slate-400">No active positions open</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Execute a trade via the order panel above to see real-time P&L updates.
              </p>
            </div>
          ) : (
            <table className="w-full text-left font-mono">
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase border-b border-slate-800/80 pb-2">
                  <th className="pb-2 font-medium">Asset</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Direction</th>
                  <th className="pb-2 font-medium">Stake</th>
                  <th className="pb-2 font-medium">Entry Price</th>
                  <th className="pb-2 font-medium">Current</th>
                  <th className="pb-2 font-medium text-right">Floating P&L</th>
                  <th className="pb-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-[11px]">
                {activePositions.map((pos) => {
                  const isProfit = pos.pnl >= 0;
                  const isRiseFall = pos.type === 'RISE_FALL';
                  const remainingSec = pos.expiryEpoch
                    ? Math.max(0, pos.expiryEpoch - Math.floor(Date.now() / 1000))
                    : null;

                  return (
                    <tr key={pos.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-2.5 font-bold text-slate-200">{pos.symbolName}</td>
                      <td className="py-2.5 text-slate-400 text-[10px]">
                        {isRiseFall ? 'Rise/Fall' : `x${pos.multiplier} Multiplier`}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            pos.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {pos.direction === 'BUY' ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {pos.direction}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-300">${pos.stake.toFixed(2)}</td>
                      <td className="py-2.5 text-slate-400">{pos.entryPrice}</td>
                      <td className="py-2.5 text-slate-200">{pos.currentPrice}</td>
                      <td className="py-2.5 text-right font-bold">
                        <span className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>
                          {isProfit ? '+' : ''}${pos.pnl.toFixed(2)} ({isProfit ? '+' : ''}
                          {pos.pnlPercentage.toFixed(1)}%)
                        </span>
                        {isRiseFall && remainingSec !== null && (
                          <div className="text-[10px] text-slate-400 font-normal">
                            Exp in: {remainingSec}s
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => closePosition(pos.id)}
                          className="px-2.5 py-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded transition-colors"
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : (
          tradeHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500">
              <Check className="w-8 h-8 stroke-[1.5] mb-2 opacity-50" />
              <p className="font-medium text-slate-400">No closed trades yet</p>
            </div>
          ) : (
            <table className="w-full text-left font-mono">
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase border-b border-slate-800/80 pb-2">
                  <th className="pb-2 font-medium">Asset</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Direction</th>
                  <th className="pb-2 font-medium">Stake</th>
                  <th className="pb-2 font-medium">Entry</th>
                  <th className="pb-2 font-medium">Exit</th>
                  <th className="pb-2 font-medium">Result</th>
                  <th className="pb-2 font-medium text-right">Net P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-[11px]">
                {tradeHistory.map((trade) => {
                  const isWon = trade.pnl >= 0;
                  return (
                    <tr key={trade.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-2.5 font-bold text-slate-200">{trade.symbolName}</td>
                      <td className="py-2.5 text-slate-400 text-[10px]">
                        {trade.type === 'RISE_FALL' ? 'Rise/Fall' : `x${trade.multiplier}`}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`font-semibold ${
                            trade.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {trade.direction}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-300">${trade.stake.toFixed(2)}</td>
                      <td className="py-2.5 text-slate-400">{trade.entryPrice}</td>
                      <td className="py-2.5 text-slate-300">{trade.exitPrice}</td>
                      <td className="py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                            isWon ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isWon ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          {trade.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-bold">
                        <span className={isWon ? 'text-emerald-400' : 'text-rose-400'}>
                          {isWon ? '+' : ''}${trade.pnl.toFixed(2)} ({isWon ? '+' : ''}
                          {trade.pnlPercentage.toFixed(1)}%)
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
};
