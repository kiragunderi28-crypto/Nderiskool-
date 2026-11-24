import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { CheckCircle2, AlertCircle, Clock, Check, TrendingUp, TrendingDown, Download } from 'lucide-react';

export const PositionsManager: React.FC = () => {
  const { activePositions, tradeHistory, closePosition } = useTrading();
  const [tab, setTab] = useState<'positions' | 'history'>('positions');

  const escapeCsvCell = (value: string | number | undefined | null): string => {
    if (value === undefined || value === null) return '';
    const str = String(value);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleDownloadCsv = () => {
    if (tradeHistory.length === 0) return;

    const headers = [
      'Trade ID',
      'Asset Symbol',
      'Asset Name',
      'Contract Type',
      'Direction',
      'Stake (USD)',
      'Multiplier',
      'Entry Price',
      'Exit Price',
      'Barrier',
      'Selected Digit',
      'Exit Digit',
      'Entry Time (ISO)',
      'Exit Time (ISO)',
      'Duration (Seconds)',
      'Status',
      'Net P&L (USD)',
      'ROI (%)',
      'Gross Return (USD)',
    ];

    const rows = tradeHistory.map((trade) => {
      const durationSec = Math.max(0, trade.exitEpoch - trade.entryEpoch);
      const grossReturn = Number((trade.stake + trade.pnl).toFixed(2));
      return [
        trade.id,
        trade.symbol,
        trade.symbolName,
        trade.type,
        trade.direction,
        trade.stake.toFixed(2),
        trade.multiplier,
        trade.entryPrice,
        trade.exitPrice,
        trade.barrier ?? '',
        trade.selectedDigit ?? '',
        trade.exitDigit ?? '',
        new Date(trade.entryEpoch * 1000).toISOString(),
        new Date(trade.exitEpoch * 1000).toISOString(),
        durationSec,
        trade.status,
        trade.pnl.toFixed(2),
        trade.pnlPercentage.toFixed(2),
        grossReturn.toFixed(2),
      ]
        .map(escapeCsvCell)
        .join(',');
    });

    const csvContent = `\uFEFF${[headers.map(escapeCsvCell).join(','), ...rows].join('\r\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const dateSlug = new Date().toISOString().slice(0, 10);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nderiskool-trade-history-${dateSlug}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden text-xs">
      {/* Tab Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab('positions')}
            className={`flex items-center gap-2 py-1.5 px-3 rounded-lg font-semibold transition-colors cursor-pointer ${
              tab === 'positions'
                ? 'bg-[#0b1930] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>Open Positions</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activePositions.length > 0 ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {activePositions.length}
            </span>
          </button>
          <button
            onClick={() => setTab('history')}
            className={`flex items-center gap-2 py-1.5 px-3 rounded-lg font-semibold transition-colors cursor-pointer ${
              tab === 'history'
                ? 'bg-[#0b1930] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>Trade History</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-200 text-slate-700">
              {tradeHistory.length}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleDownloadCsv}
          disabled={tradeHistory.length === 0}
          title={
            tradeHistory.length === 0
              ? 'No closed trades to export'
              : 'Export closed trade history as CSV for tax & accounting'
          }
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-mono text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5 text-emerald-600" />
          <span>Download CSV</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="p-3 overflow-x-auto min-h-[160px] max-h-[300px] overflow-y-auto">
        {tab === 'positions' ? (
          activePositions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500">
              <Clock className="w-8 h-8 stroke-[1.5] mb-2 opacity-50" />
              <p className="font-semibold text-slate-700">No active positions open</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Execute a trade via the order panel above to see real-time P&amp;L updates.
              </p>
            </div>
          ) : (
            <table className="w-full text-left font-mono">
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase border-b border-slate-200 pb-2">
                  <th className="pb-2 font-medium">Asset</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Direction</th>
                  <th className="pb-2 font-medium">Stake</th>
                  <th className="pb-2 font-medium">Entry Price</th>
                  <th className="pb-2 font-medium">Current</th>
                  <th className="pb-2 font-medium text-right">Floating P&amp;L</th>
                  <th className="pb-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {activePositions.map((pos) => {
                  const isProfit = pos.pnl >= 0;
                  const remainingSec = pos.expiryEpoch
                    ? Math.max(0, pos.expiryEpoch - Math.floor(Date.now() / 1000))
                    : null;

                  const typeLabel =
                    pos.type === 'HIGHER_LOWER'
                      ? 'Higher/Lower'
                      : pos.type === 'DIGIT_UNDER_OVER'
                      ? 'Digit Under/Over'
                      : pos.type === 'ACCUMULATOR'
                      ? 'Accumulator'
                      : pos.type === 'RISE_FALL'
                      ? 'Rise/Fall'
                      : `x${pos.multiplier} Multiplier`;

                  const directionLabel =
                    pos.type === 'HIGHER_LOWER'
                      ? pos.direction === 'SELL'
                        ? 'LOWER'
                        : 'HIGHER'
                      : pos.type === 'DIGIT_UNDER_OVER'
                      ? pos.direction === 'SELL'
                        ? `UNDER ${pos.selectedDigit ?? 5}`
                        : `OVER ${pos.selectedDigit ?? 5}`
                      : pos.type === 'MULTIPLIER'
                      ? pos.direction === 'BUY'
                        ? 'BUY (LONG)'
                        : 'SELL (LOWER)'
                      : pos.direction === 'BUY'
                      ? 'RISE'
                      : 'FALL (LOWER)';

                  return (
                    <tr key={pos.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 font-bold text-slate-900">
                        <div>{pos.symbolName}</div>
                        {pos.barrier !== undefined && (
                          <div className="text-[9px] text-slate-500 font-normal">
                            Barrier: {pos.barrier}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-slate-600 text-[10px]">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                          {typeLabel}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 font-bold ${
                            pos.direction === 'BUY' ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {pos.direction === 'BUY' ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {directionLabel}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-900 font-bold">${pos.stake.toFixed(2)}</td>
                      <td className="py-2.5 text-slate-600">{pos.entryPrice}</td>
                      <td className="py-2.5 text-slate-900">{pos.currentPrice}</td>
                      <td className="py-2.5 text-right font-bold">
                        <span className={isProfit ? 'text-emerald-600' : 'text-rose-600'}>
                          {isProfit ? '+' : ''}${pos.pnl.toFixed(2)} ({isProfit ? '+' : ''}
                          {pos.pnlPercentage.toFixed(1)}%)
                        </span>
                        {pos.remainingTicks !== undefined && pos.remainingTicks > 0 && (
                          <div className="text-[10px] text-amber-600 font-normal">
                            {pos.remainingTicks} tick{pos.remainingTicks > 1 ? 's' : ''} left
                          </div>
                        )}
                        {remainingSec !== null && pos.type !== 'DIGIT_UNDER_OVER' && (
                          <div className="text-[10px] text-slate-500 font-normal">
                            Exp: {remainingSec}s
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => closePosition(pos.id)}
                          className="px-2.5 py-1 text-[10px] bg-slate-900 hover:bg-slate-800 text-white rounded transition-colors cursor-pointer"
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
              <p className="font-medium text-slate-600">No closed trades yet</p>
            </div>
          ) : (
            <table className="w-full text-left font-mono">
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase border-b border-slate-200 pb-2">
                  <th className="pb-2 font-medium">Asset</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Direction</th>
                  <th className="pb-2 font-medium">Stake</th>
                  <th className="pb-2 font-medium">Entry</th>
                  <th className="pb-2 font-medium">Exit</th>
                  <th className="pb-2 font-medium">Result</th>
                  <th className="pb-2 font-medium text-right">Net P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {tradeHistory.map((trade) => {
                  const isWon = trade.pnl >= 0;
                  const typeLabel =
                    trade.type === 'HIGHER_LOWER'
                      ? 'Higher/Lower'
                      : trade.type === 'DIGIT_UNDER_OVER'
                      ? 'Digit Under/Over'
                      : trade.type === 'ACCUMULATOR'
                      ? 'Accumulator'
                      : trade.type === 'RISE_FALL'
                      ? 'Rise/Fall'
                      : `x${trade.multiplier}`;

                  const directionLabel =
                    trade.type === 'HIGHER_LOWER'
                      ? trade.direction === 'SELL'
                        ? 'LOWER'
                        : 'HIGHER'
                      : trade.type === 'DIGIT_UNDER_OVER'
                      ? trade.direction === 'SELL'
                        ? `UNDER ${trade.selectedDigit ?? 5}`
                        : `OVER ${trade.selectedDigit ?? 5}`
                      : trade.direction === 'BUY'
                      ? 'BUY'
                      : 'SELL';

                  return (
                    <tr key={trade.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 font-bold text-slate-900">
                        <div>{trade.symbolName}</div>
                        {trade.exitDigit !== undefined && (
                          <div className="text-[9px] text-slate-500">
                            Exit Digit: {trade.exitDigit}
                          </div>
                        )}
                        {trade.barrier !== undefined && (
                          <div className="text-[9px] text-slate-500">
                            Barrier: {trade.barrier}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-slate-600 text-[10px]">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                          {typeLabel}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`font-semibold ${
                            trade.direction === 'BUY' ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {directionLabel}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-800">${trade.stake.toFixed(2)}</td>
                      <td className="py-2.5 text-slate-600">{trade.entryPrice}</td>
                      <td className="py-2.5 text-slate-800">{trade.exitPrice}</td>
                      <td className="py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                            isWon ? 'text-emerald-600' : 'text-rose-600'
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
                        <span className={isWon ? 'text-emerald-600' : 'text-rose-600'}>
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
