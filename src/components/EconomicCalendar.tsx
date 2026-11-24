import React, { useState } from 'react';
import { EconomicEvent } from '../types/trading';
import { Calendar } from 'lucide-react';

const MOCK_EVENTS: EconomicEvent[] = [
  {
    id: 'ev-1',
    time: '13:30 GMT',
    currency: 'USD',
    event: 'US Core Consumer Price Index (CPI) MoM',
    impact: 'HIGH',
    forecast: '0.3%',
    previous: '0.3%',
  },
  {
    id: 'ev-2',
    time: '14:00 GMT',
    currency: 'USD',
    event: 'Federal Reserve Interest Rate Decision',
    impact: 'HIGH',
    forecast: '4.75%',
    previous: '5.00%',
  },
  {
    id: 'ev-3',
    time: '12:45 GMT',
    currency: 'EUR',
    event: 'ECB Main Refinancing Rate',
    impact: 'HIGH',
    forecast: '3.25%',
    previous: '3.40%',
  },
  {
    id: 'ev-4',
    time: '07:00 GMT',
    currency: 'GBP',
    event: 'UK Gross Domestic Product (GDP) MoM',
    impact: 'MEDIUM',
    forecast: '0.2%',
    previous: '0.1%',
  },
  {
    id: 'ev-5',
    time: '00:30 GMT',
    currency: 'AUD',
    event: 'Reserve Bank of Australia Rate Decision',
    impact: 'HIGH',
    forecast: '4.35%',
    previous: '4.35%',
  },
  {
    id: 'ev-6',
    time: '15:30 GMT',
    currency: 'USD',
    event: 'EIA Crude Oil Stockpiles Change',
    impact: 'MEDIUM',
    forecast: '-1.2M',
    previous: '+2.1M',
  },
  {
    id: 'ev-7',
    time: '08:30 GMT',
    currency: 'CHF',
    event: 'Swiss Consumer Confidence Index',
    impact: 'LOW',
    forecast: '-34.0',
    previous: '-36.5',
  },
];

export const EconomicCalendar: React.FC = () => {
  const [filterImpact, setFilterImpact] = useState<'ALL' | 'HIGH' | 'MEDIUM'>('ALL');
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');

  const filteredEvents = MOCK_EVENTS.filter((e) => {
    if (filterImpact !== 'ALL' && e.impact !== filterImpact) return false;
    if (currencyFilter !== 'ALL' && e.currency !== currencyFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-xl p-4 md:p-5 text-xs shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0b1930] text-white flex items-center justify-center">
            <Calendar className="w-4 h-4 text-[#2bbbad]" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Global Forex Economic Calendar</h3>
            <p className="text-[11px] text-slate-500">High-impact macro releases & central bank schedules</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setFilterImpact('ALL')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                filterImpact === 'ALL' ? 'bg-[#0b1930] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Impact
            </button>
            <button
              type="button"
              onClick={() => setFilterImpact('HIGH')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                filterImpact === 'HIGH' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              High Only
            </button>
          </div>

          <select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
            className="bg-white border border-slate-300 text-slate-800 font-medium py-1.5 px-2.5 rounded-lg text-[11px] focus:outline-none focus:border-[#0b1930]"
          >
            <option value="ALL">All Currencies</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="AUD">AUD</option>
            <option value="CHF">CHF</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto mt-3">
        <table className="w-full text-left font-mono tabular-nums">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase border-b border-slate-200">
              <th className="pb-2.5 font-semibold">Time</th>
              <th className="pb-2.5 font-semibold">Currency</th>
              <th className="pb-2.5 font-semibold">Impact</th>
              <th className="pb-2.5 font-semibold">Event Description</th>
              <th className="pb-2.5 font-semibold text-right">Forecast</th>
              <th className="pb-2.5 font-semibold text-right">Previous</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[11px]">
            {filteredEvents.map((ev) => (
              <tr key={ev.id} className="hover:bg-slate-50 transition-colors">
                <td className="py-3 text-slate-600 whitespace-nowrap">{ev.time}</td>
                <td className="py-3">
                  <span className="font-bold text-slate-800 px-2 py-0.5 bg-slate-100 rounded border border-slate-200">
                    {ev.currency}
                  </span>
                </td>
                <td className="py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                      ev.impact === 'HIGH'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : ev.impact === 'MEDIUM'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {ev.impact}
                  </span>
                </td>
                <td className="py-3 font-sans text-slate-900 font-semibold">{ev.event}</td>
                <td className="py-3 text-right text-slate-900 font-bold">{ev.forecast}</td>
                <td className="py-3 text-right text-slate-500">{ev.previous}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
