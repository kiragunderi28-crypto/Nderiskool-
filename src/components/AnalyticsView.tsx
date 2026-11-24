import React, { useMemo, useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { BarChart3, Download } from 'lucide-react';

interface MonthlySummaryBucket {
  monthKey: string;
  label: string;
  shortLabel: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
}

export const AnalyticsView: React.FC = () => {
  const { tradeHistory, account } = useTrading();
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

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

    // Monthly Performance Summary buckets (chronological order)
    const buckets = new Map<string, MonthlySummaryBucket>();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (const t of tradeHistory) {
      const epochMs = (t.exitEpoch || t.entryEpoch || Math.floor(Date.now() / 1000)) * 1000;
      const d = new Date(epochMs);
      const year = d.getFullYear();
      const monthIdx = d.getMonth();
      const monthKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
      const existing = buckets.get(monthKey) || {
        monthKey,
        label: `${monthNames[monthIdx]} ${year}`,
        shortLabel: `${monthNames[monthIdx]} '${String(year).slice(-2)}`,
        trades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        grossProfit: 0,
        grossLoss: 0,
        netPnl: 0,
      };
      existing.trades += 1;
      if (t.pnl > 0) {
        existing.wins += 1;
        existing.grossProfit += t.pnl;
      } else if (t.pnl < 0) {
        existing.losses += 1;
        existing.grossLoss += Math.abs(t.pnl);
      }
      existing.netPnl = Number((existing.grossProfit - existing.grossLoss).toFixed(2));
      existing.winRate = existing.trades > 0 ? (existing.wins / existing.trades) * 100 : 0;
      buckets.set(monthKey, existing);
    }

    const monthlySummary = Array.from(buckets.values()).sort((a, b) =>
      a.monthKey.localeCompare(b.monthKey)
    );
    const maxAbsMonthlyPnl = Math.max(
      1,
      ...monthlySummary.map((m) => Math.abs(m.netPnl))
    );

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
      monthlySummary,
      maxAbsMonthlyPnl,
    };
  }, [tradeHistory, account.balance]);

  const activeMonth = useMemo(() => {
    if (metrics.monthlySummary.length === 0) return null;
    if (selectedMonthKey) {
      const found = metrics.monthlySummary.find((m) => m.monthKey === selectedMonthKey);
      if (found) return found;
    }
    return metrics.monthlySummary[metrics.monthlySummary.length - 1];
  }, [metrics.monthlySummary, selectedMonthKey]);

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
    <div className="flex flex-col bg-white border border-slate-200 rounded-2xl shadow-xs p-5 text-xs space-y-5">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">Trader Performance Analytics &amp; Journal</h3>
          <p className="text-[11px] text-slate-500">Trading metrics calculated for nderiskool</p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={!tradeHistory.length}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg border border-slate-300 font-semibold transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-emerald-600" />
          <span>Export Journal (CSV)</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
          <span className="text-slate-500 text-[10px] block">Net Realized P&amp;L</span>
          <span
            className={`text-xl font-bold ${
              metrics.netPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {metrics.netPnl >= 0 ? '+' : ''}${metrics.netPnl.toFixed(2)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-1">USD Capital</span>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
          <span className="text-slate-500 text-[10px] block">Win Rate</span>
          <span className="text-xl font-bold text-emerald-600">{metrics.winRate.toFixed(1)}%</span>
          <span className="text-[10px] text-slate-400 block mt-1">
            {metrics.wins} won / {metrics.losses} lost
          </span>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
          <span className="text-slate-500 text-[10px] block">Profit Factor</span>
          <span className="text-xl font-bold text-teal-700">{metrics.profitFactor.toFixed(2)}</span>
          <span className="text-[10px] text-slate-400 block mt-1">Gross Profit / Gross Loss</span>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
          <span className="text-slate-500 text-[10px] block">Avg Win / Avg Loss</span>
          <span className="text-sm font-bold text-slate-900">
            <span className="text-emerald-600">+${metrics.avgWin.toFixed(2)}</span> /{' '}
            <span className="text-rose-600">-${metrics.avgLoss.toFixed(2)}</span>
          </span>
          <span className="text-[10px] text-slate-400 block mt-1">
            Risk:Reward: 1:{(metrics.avgLoss > 0 ? metrics.avgWin / metrics.avgLoss : 1).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Monthly Performance Summary Bar Chart Widget */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#0b1930] text-[#2bbbad] flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-slate-900 font-bold text-xs block">
                Monthly Performance Summary (Win Rate &amp; Net Profit/Loss)
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {metrics.monthlySummary.length} active month{metrics.monthlySummary.length === 1 ? '' : 's'} · Click a month bar to inspect breakdown
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums">
            <div className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">
              <span className="text-slate-500 text-[10px] mr-1.5">Total Win Rate:</span>
              <strong className="text-teal-700">{metrics.winRate.toFixed(1)}%</strong>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">
              <span className="text-slate-500 text-[10px] mr-1.5">Total Net P&amp;L:</span>
              <strong className={metrics.netPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                {metrics.netPnl >= 0 ? '+' : '-'}${Math.abs(metrics.netPnl).toFixed(2)}
              </strong>
            </div>
          </div>
        </div>

        {/* Chart Legend */}
        <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
            <span>Net Profit ($)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
            <span>Net Loss ($)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#2bbbad] inline-block" />
            <span>Win Rate (0–100%)</span>
          </span>
        </div>

        {metrics.monthlySummary.length === 0 ? (
          <div className="h-44 flex items-center justify-center rounded-xl bg-white border border-dashed border-slate-200 text-slate-500 font-mono text-[11px]">
            Execute and close trades to populate the monthly performance bar chart.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Dual-Metric Bar Chart Grid */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 overflow-x-auto">
              <div
                className="grid gap-3 min-w-[320px]"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(metrics.monthlySummary.length, 1)}, minmax(76px, 1fr))`,
                }}
              >
                {metrics.monthlySummary.map((month) => {
                  const isProfit = month.netPnl >= 0;
                  const pnlRatio = Math.min(1, Math.abs(month.netPnl) / metrics.maxAbsMonthlyPnl);
                  const pnlBarHeight = Math.max(8, Math.round(pnlRatio * 52));
                  const winBarHeight = Math.max(6, Math.round((month.winRate / 100) * 96));
                  const isSelected = activeMonth?.monthKey === month.monthKey;

                  return (
                    <button
                      key={month.monthKey}
                      type="button"
                      onClick={() => setSelectedMonthKey(month.monthKey)}
                      className={`group flex flex-col items-center p-2 rounded-xl border transition-all cursor-pointer text-center ${
                        isSelected
                          ? 'bg-slate-50 border-[#2bbbad] ring-1 ring-[#2bbbad]/30'
                          : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
                      }`}
                    >
                      {/* Top value readout */}
                      <div className="font-mono text-[10px] font-bold tabular-nums leading-tight mb-1.5 space-y-0.5">
                        <span className={`block ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isProfit ? '+' : '-'}${Math.abs(month.netPnl).toFixed(0)}
                        </span>
                        <span className="block text-teal-700 text-[9px]">{month.winRate.toFixed(0)}% WR</span>
                      </div>

                      {/* Paired Bars Stage: Net P&L (zero-baseline centered) + Win Rate (0-100%) */}
                      <div className="flex items-end justify-center gap-2 h-28 w-full px-1">
                        {/* Net P&L Bar centered on horizontal zero line */}
                        <div className="relative w-5 h-28 flex flex-col justify-between items-center">
                          <div className="h-14 w-full flex items-end justify-center">
                            {isProfit && (
                              <div
                                className="w-4 rounded-t bg-emerald-500 group-hover:bg-emerald-400 transition-all"
                                style={{ height: `${pnlBarHeight}px` }}
                                title={`${month.label} Net P&L: +$${month.netPnl.toFixed(2)}`}
                              />
                            )}
                          </div>
                          <div className="w-full h-px bg-slate-300 shrink-0" />
                          <div className="h-14 w-full flex items-start justify-center">
                            {!isProfit && (
                              <div
                                className="w-4 rounded-b bg-rose-500 group-hover:bg-rose-400 transition-all"
                                style={{ height: `${pnlBarHeight}px` }}
                                title={`${month.label} Net P&L: -$${Math.abs(month.netPnl).toFixed(2)}`}
                              />
                            )}
                          </div>
                        </div>

                        {/* Win Rate Bar (0-100%) */}
                        <div className="relative w-5 h-28 flex items-end justify-center bg-slate-100 rounded-md overflow-hidden">
                          <div
                            className="w-full bg-[#2bbbad] group-hover:bg-teal-500 rounded-t transition-all"
                            style={{ height: `${winBarHeight}%` }}
                            title={`${month.label} Win Rate: ${month.winRate.toFixed(1)}%`}
                          />
                        </div>
                      </div>

                      {/* Month Label */}
                      <div className="mt-2 font-mono">
                        <span className="text-[10px] font-bold text-slate-900 block">{month.shortLabel}</span>
                        <span className="text-[9px] text-slate-500 block">
                          {month.wins}W / {month.losses}L
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Month Detailed Summary Bar */}
            {activeMonth && (
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 p-3 bg-white border border-slate-200 rounded-xl font-mono text-[10px] tabular-nums">
                <div>
                  <span className="text-slate-500 block">Month</span>
                  <strong className="text-slate-900 text-xs">{activeMonth.label}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Trades (W/L)</span>
                  <strong className="text-slate-900 text-xs">
                    {activeMonth.trades} ({activeMonth.wins}W / {activeMonth.losses}L)
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Win Rate</span>
                  <strong className="text-teal-700 text-xs">{activeMonth.winRate.toFixed(1)}%</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Gross Profit</span>
                  <strong className="text-emerald-600 text-xs">+${activeMonth.grossProfit.toFixed(2)}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Gross Loss</span>
                  <strong className="text-rose-600 text-xs">-${activeMonth.grossLoss.toFixed(2)}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Net P&amp;L</span>
                  <strong className={`text-xs ${activeMonth.netPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {activeMonth.netPnl >= 0 ? '+' : '-'}${Math.abs(activeMonth.netPnl).toFixed(2)}
                  </strong>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Equity Curve SVG */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-slate-900 font-semibold text-xs">Cumulative Account Equity Growth</span>
          <span className="text-[10px] font-mono text-slate-500">
            Current: ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="h-44 w-full pt-2">
          {metrics.equityCurve.length > 1 ? (
            <svg className="w-full h-full overflow-visible" viewBox="0 0 500 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0d9488" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#0d9488" stopOpacity="0.0" />
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
                    <path d={dLine} fill="none" stroke="#0d9488" strokeWidth="2.5" />
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

