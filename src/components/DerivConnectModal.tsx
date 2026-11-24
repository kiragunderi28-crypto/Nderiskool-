import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { derivWsService } from '../services/derivWs';
import {
  X,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Key,
  RefreshCw,
  Lock,
  ArrowDownLeft,
  ArrowLeftRight,
} from 'lucide-react';

export const DerivConnectModal: React.FC = () => {
  const {
    isConnectModalOpen,
    setIsConnectModalOpen,
    account,
    realAccount,
    connectDerivToken,
    syncDerivRealBalance,
    disconnectDerivToken,
    resetDemoBalance,
    openCashier,
  } = useTrading();

  const [tokenInput, setTokenInput] = useState('');
  const [appIdInput, setAppIdInput] = useState(realAccount.appId || derivWsService.getAppId());
  const [showAdvancedAppId, setShowAdvancedAppId] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isConnectModalOpen) return null;

  const hasLiveToken = Boolean(realAccount.token && realAccount.token !== 'CR-NDERISKOOL-LIVE');
  const activeScopes = realAccount.scopes || [];
  const hasPaymentsScope = activeScopes.includes('payments');
  const linkedAccounts = realAccount.accountList || [];

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setErrorMsg('Please enter a valid Deriv API Token');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    const res = await connectDerivToken(tokenInput.trim(), appIdInput.trim() || undefined);
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg(res.message || 'Successfully authenticated with Deriv real account!');
      setTokenInput('');
    } else {
      setErrorMsg(res.message || 'Authorization failed. Please verify your token.');
    }
  };

  const handleSyncBalance = async () => {
    setIsSyncing(true);
    setErrorMsg('');
    setSuccessMsg('');
    const res = await syncDerivRealBalance();
    setIsSyncing(false);
    if (res.ok) {
      setSuccessMsg(res.message);
    } else {
      setErrorMsg(res.message);
    }
  };

  const handleUseSampleToken = () => {
    setTokenInput('CR-NDERISKOOL-LIVE');
    setErrorMsg('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden text-xs max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#0b1930] text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#2bbbad]/20 border border-[#2bbbad]/40 flex items-center justify-center text-[#2bbbad] font-bold font-mono text-sm">
              D
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Deriv Real Account Gateway</h3>
              <p className="text-[11px] text-slate-300">
                Connect live CR account for Deposits, Transfers &amp; Trading
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsConnectModalOpen(false)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-300 hover:text-white rounded-md hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Current Status Box */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-600 font-semibold">Account Status</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  account.isReal
                    ? realAccount.isLiveVerified
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-teal-50 text-teal-700 border border-teal-200'
                }`}
              >
                {account.isReal
                  ? realAccount.isLiveVerified
                    ? 'LIVE DERIV WS VERIFIED'
                    : 'REAL LEDGER (SAMPLE TOKEN)'
                  : 'DEMO VIRTUAL SIMULATOR'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 font-mono text-[11px] tabular-nums">
              <div>
                <span className="text-slate-500 block text-[10px]">Active Real Login ID</span>
                <span className="text-slate-900 font-bold">{realAccount.loginId}</span>
                {activeScopes.length > 0 && (
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Scopes: {activeScopes.join(' · ')}
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[10px]">Real Balance</span>
                <span className="text-emerald-600 font-bold text-sm">
                  ${realAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} {realAccount.currency}
                </span>
                {hasLiveToken && (
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={handleSyncBalance}
                    className="inline-flex items-center gap-1 text-[10px] text-teal-700 hover:text-teal-900 font-semibold mt-0.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-2.5 h-2.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Syncing...' : 'Sync Live Balance'}</span>
                  </button>
                )}
              </div>
            </div>

            {linkedAccounts.length > 0 && (
              <div className="pt-2 border-t border-slate-200">
                <div className="text-[10px] font-semibold text-slate-600 mb-1">
                  Linked Deriv Accounts ({linkedAccounts.length})
                </div>
                <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                  {linkedAccounts.map((sub) => (
                    <span
                      key={sub.loginid}
                      className={`px-2 py-0.5 rounded border ${
                        sub.loginid === realAccount.loginId
                          ? 'bg-[#0b1930] text-white border-[#0b1930] font-bold'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {sub.loginid} · {sub.currency} {sub.is_virtual ? '(Demo)' : '(Real)'}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {hasLiveToken && !hasPaymentsScope && (
              <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
                This token is missing the <strong>Payments</strong> scope. Re-create your token on Deriv with{' '}
                <strong>Read + Trade + Payments</strong> enabled to execute live deposits and transfers.
              </div>
            )}

            {/* Quick Deposit & Transfer Shortcuts for Connected Real Account */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setIsConnectModalOpen(false);
                  openCashier('deposit');
                }}
                className="min-h-[42px] px-3 rounded-lg bg-[#2bbbad] hover:bg-[#239b8f] text-white font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Deposit to Real</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConnectModalOpen(false);
                  openCashier('deriv_transfer');
                }}
                className="min-h-[42px] px-3 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-[#2bbbad]" />
                <span>Transfer Funds</span>
              </button>
            </div>

            {!account.isReal && (
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={resetDemoBalance}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] bg-white hover:bg-slate-100 text-slate-700 font-medium rounded-lg border border-slate-300 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Reset Demo to $10,000.00</span>
                </button>
              </div>
            )}
          </div>

          {/* Connect Real Token Form */}
          <form onSubmit={handleConnect} className="space-y-3">
            <div>
              <label className="text-slate-700 font-semibold mb-1 flex items-center justify-between">
                <span>Connect Live Deriv API Token</span>
                <a
                  href="https://app.deriv.com/account/api-token"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-700 hover:text-teal-800 inline-flex items-center gap-1 text-[11px] font-medium"
                >
                  <span>Get Token from Deriv</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Key className="w-3.5 h-3.5" />
                </div>
                <input
                  type="password"
                  placeholder="Paste your Deriv API token (Read + Trade + Payments scopes)"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0b1930] text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 mt-1.5">
                <button
                  type="button"
                  onClick={() => setShowAdvancedAppId((s) => !s)}
                  className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                >
                  {showAdvancedAppId ? 'Hide App ID' : `App ID: ${appIdInput || '1089'} (Customize)`}
                </button>
                <button
                  type="button"
                  onClick={handleUseSampleToken}
                  className="text-teal-700 hover:text-teal-800 font-semibold underline underline-offset-2 cursor-pointer"
                >
                  Use test Deriv token
                </button>
              </div>

              {showAdvancedAppId && (
                <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-600 font-medium">Deriv App ID:</span>
                  <input
                    type="text"
                    value={appIdInput}
                    onChange={(e) => setAppIdInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="1089"
                    className="w-28 px-2 py-1 bg-white border border-slate-300 rounded font-mono text-xs text-slate-900 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="flex items-start gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 min-h-[44px] py-2.5 px-3 bg-[#2bbbad] hover:bg-[#239b8f] active:scale-[0.98] text-white font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                <span>Authorize &amp; Connect Deriv Real</span>
              </button>

              {account.isReal && (
                <button
                  type="button"
                  onClick={disconnectDerivToken}
                  className="min-h-[44px] py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg border border-slate-300 transition-colors cursor-pointer"
                >
                  Switch to Demo
                </button>
              )}
            </div>
          </form>

          {/* Guide Steps */}
          <div className="pt-3 border-t border-slate-200 space-y-1.5 text-slate-600 text-[11px]">
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-800">How to enable Real Deposits &amp; Transfers:</p>
              <a
                href={derivWsService.getOAuthAuthorizeUrl(appIdInput)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0b1930] hover:underline font-semibold inline-flex items-center gap-1"
              >
                <span>Deriv OAuth</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <ol className="list-decimal pl-4 space-y-1 text-slate-600">
              <li>
                Log in to your Real account at <strong className="text-slate-900">app.deriv.com</strong>
              </li>
              <li>
                Open <strong className="text-slate-900">Account Settings &gt; API Token</strong>
              </li>
              <li>
                Check scopes: <strong className="text-slate-900">Read</strong>,{' '}
                <strong className="text-slate-900">Trade</strong>, and{' '}
                <strong className="text-teal-700">Payments</strong> (required for Deposits &amp; Transfers)
              </li>
              <li>
                Click <strong className="text-slate-900">Create</strong>, copy the token, and authorize above
              </li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500 shrink-0">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-slate-400" />
            <span>Authenticated via official Deriv WebSocket v3</span>
          </div>
          <button
            type="button"
            onClick={() => setIsConnectModalOpen(false)}
            className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-md font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
