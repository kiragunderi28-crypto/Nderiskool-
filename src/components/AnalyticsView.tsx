import React, { useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { BarChart3, TrendingUp, TrendingDown, Download, Award, ShieldAlert, Target } from 'lucide-react';

export const AnalyticsView: React.FC = () => {
  const { tradeHistory, account } = useTrading();

  const metrics = useMemo(() => {
    const total = tradeHistory.length;
    const wins = tradeHistory.filter((t) => t.pnl > 0);
    const losses = tradeHistory.filter((t) => t.pnl < 0);

    const totalProfit = wins.reduce((acc, t) => acc + t.pnl, 0);
    const totalLoss = Math.abs(losses.reduce((acc, t) => acc + t.pnl, 0));
    const netPnl = totalProfit - totalLoss;

    const winRate = total > 0 ? (wins.length / total) * 100 : 0;
    const avgWin = wins.length > 0 ? totalProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 99 : 0;

    // Equity curve points
    let currentBalance = account.balance - netPnl;
    const equityCurve = [currentBalance];
    // Traverse in chronological order
    [...tradeHistory].reverse().forEach((t) => {
      currentBalance += t.pnl;
      equityCurve.push(currentBalance);
    });

    return {
      total,
      wins: wins.length,
      losses: losses.length,
      winRate,
      totalProfit,
      totalLoss,
      netPnl,
      avgWin,
      avgLoss,
      profitFactor,
      equityCurve,
    };
  }, [tradeHistory, account.balance]);

  // Export to CSV
  const handleExportCSV = () => {
    if (!tradeHistory.length) return;
    const headers = 'ID,Symbol,Type,Direction,Stake,Multiplier,EntryPrice,ExitPrice,EntryDate,ExitDate,PnL,Status\n';
    const rows = tradeHistory
      .map(
        (t) =>
          `${t.id},${t.symbolName},${t.type},${t.direction},${t.stake},${t.multiplier},${t.entryPrice},${t.exitPrice},${new Date(t.entryEpoch * 1000).toISOString()},${new Date(t.exitEpoch * 1000).toISOString()},${t.pnl},${t.status}`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nderiskool_deriv_trades_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="flex flex-col bg-[#0f141f] border border-slate-800 rounded-lg p-5 text-xs space-y-5">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h3 className="font-bold text-slate-100 text-sm">Trader Performance Analytics & Journal</h3>
          <p className="text-[11px] text-slate-400">Trading metrics calculated for nderiskool</p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={!tradeHistory.length}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded border border-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Journal (CSV)</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg">
          <span className="text-slate-500 text-[10px] block">Net Realized P&L</span>
          <span
            className={`text-xl font-bold ${
              metrics.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {metrics.netPnl >= 0 ? '+' : ''}${metrics.netPnl.toFixed(2)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-1">USD Capital</span>
        </div>

        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg">
          <span className="text-slate-500 text-[10px] block">Win Rate</span>
          <span className="text-xl font-bold text-emerald-400">{metrics.winRate.toFixed(1)}%</span>
          <span className="text-[10px] text-slate-500 block mt-1">
            {metrics.wins} won / {metrics.losses} lost
          </span>
        </div>

        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg">
          <span className="text-slate-500 text-[10px] block">Profit Factor</span>
          <span className="text-xl font-bold text-blue-400">{metrics.profitFactor.toFixed(2)}</span>
          <span className="text-[10px] text-slate-500 block mt-1">Gross Profit / Gross Loss</span>
        </div>

        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg">
          <span className="text-slate-500 text-[10px] block">Avg Win / Avg Loss</span>
          <span className="text-sm font-bold text-slate-200">
            <span className="text-emerald-400">+${metrics.avgWin.toFixed(2)}</span> /{' '}
            <span className="text-rose-400">-${metrics.avgLoss.toFixed(2)}</span>
          </span>
          <span className="text-[10px] text-slate-500 block mt-1">
            Risk:Reward: 1:{(metrics.avgLoss > 0 ? metrics.avgWin / metrics.avgLoss : 1).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Equity Curve SVG */}
      <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-slate-300 font-semibold text-xs">Cumulative Account Equity Growth</span>
          <span className="text-[10px] font-mono text-slate-500">
            Current: ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="h-44 w-full pt-2">
          {metrics.equityCurve.length > 1 ? (
            <svg className="w-full h-full overflow-visible" viewBox="0 0 500 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {(() => {
                const min = Math.min(...metrics.equityCurve) * 0.995;
                const max = Math.max(...metrics.equityCurve) * 1.005;
                const range = max - min || 1;
                const points = metrics.equityCurve.map((val, idx) => {
                  const x = (idx / (metrics.equityCurve.length - 1)) * 500;
                  const y = 120 - ((val - min) / range) * 105 - 10;
                  return `${x},${y}`;
                });
                const dLine = `M ${points.join(' L ')}`;
                const dArea = `${dLine} L 500,120 L 0,120 Z`;

                return (
                  <>
                    <path d={dArea} fill="url(#equityGrad)" />
                    <path d={dLine} fill="none" stroke="#10b981" strokeWidth="2.5" />
                  </>
                );
              })()}
            </svg>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500">
              Complete more trades to generate an equity growth curve.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
