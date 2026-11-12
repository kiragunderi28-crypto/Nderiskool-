import React, { useState } from 'react';
import { EconomicEvent } from '../types/trading';
import { Calendar, Globe, AlertCircle, Filter } from 'lucide-react';

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
    <div className="flex flex-col bg-[#0f141f] border border-slate-800 rounded-lg p-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-400" />
          <h3 className="font-bold text-slate-100 text-sm">Global Forex Economic Calendar</h3>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {/* Impact filter */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 text-[11px]">
            <button
              onClick={() => setFilterImpact('ALL')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filterImpact === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Impact
            </button>
            <button
              onClick={() => setFilterImpact('HIGH')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filterImpact === 'HIGH' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              High Only
            </button>
          </div>

          {/* Currency filter */}
          <select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-slate-200 py-1 px-2 rounded text-[11px] focus:outline-none"
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
        <table className="w-full text-left font-mono">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase border-b border-slate-800 pb-2">
              <th className="pb-2 font-medium">Time</th>
              <th className="pb-2 font-medium">Currency</th>
              <th className="pb-2 font-medium">Impact</th>
              <th className="pb-2 font-medium">Event Description</th>
              <th className="pb-2 font-medium text-right">Forecast</th>
              <th className="pb-2 font-medium text-right">Previous</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-[11px]">
            {filteredEvents.map((ev) => (
              <tr key={ev.id} className="hover:bg-slate-900/40 transition-colors">
                <td className="py-2.5 text-slate-400">{ev.time}</td>
                <td className="py-2.5">
                  <span className="font-bold text-slate-200 px-1.5 py-0.5 bg-slate-900 rounded border border-slate-800">
                    {ev.currency}
                  </span>
                </td>
                <td className="py-2.5">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      ev.impact === 'HIGH'
                        ? 'bg-red-950 text-red-400 border border-red-800/60'
                        : ev.impact === 'MEDIUM'
                        ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    {ev.impact}
                  </span>
                </td>
                <td className="py-2.5 font-sans text-slate-200 font-medium">{ev.event}</td>
                <td className="py-2.5 text-right text-slate-300 font-bold">{ev.forecast}</td>
                <td className="py-2.5 text-right text-slate-500">{ev.previous}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
