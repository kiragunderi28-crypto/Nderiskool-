import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { X, ExternalLink, ShieldCheck, CheckCircle2, AlertTriangle, Key, RefreshCw, Lock } from 'lucide-react';

export const DerivConnectModal: React.FC = () => {
  const {
    isConnectModalOpen,
    setIsConnectModalOpen,
    account,
    connectDerivToken,
    disconnectDerivToken,
    resetDemoBalance,
  } = useTrading();

  const [tokenInput, setTokenInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isConnectModalOpen) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setErrorMsg('Please enter a valid Deriv API Token');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    const res = await connectDerivToken(tokenInput.trim());
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg(res.message || 'Successfully authenticated with Deriv real account!');
      setTokenInput('');
    } else {
      setErrorMsg(res.message || 'Authorization failed. Please verify your token.');
    }
  };

  const handleUseSampleToken = () => {
    setTokenInput('CR-NDERISKOOL-LIVE');
    setErrorMsg('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs select-none">
      <div className="relative w-full max-w-lg bg-[#0f141f] border border-slate-800 rounded-xl shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 font-bold font-mono text-sm">
              D
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">Deriv Account Gateway</h3>
              <p className="text-[11px] text-slate-400">Connected for trader nderiskool</p>
            </div>
          </div>
          <button
            onClick={() => setIsConnectModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Current Status Box */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">Account Status</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  account.isReal
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                    : 'bg-blue-950 text-blue-400 border border-blue-800/60'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {account.isReal ? 'REAL DERIV CONNECTED' : 'DEMO VIRTUAL SIMULATOR'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/80 font-mono text-[11px]">
              <div>
                <span className="text-slate-500 block text-[10px]">Trader / Login ID</span>
                <span className="text-slate-200 font-bold">{account.loginId}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[10px]">Balance</span>
                <span className="text-emerald-400 font-bold text-sm">
                  ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} {account.currency}
                </span>
              </div>
            </div>

            {/* Quick Demo Reset if Demo */}
            {!account.isReal && (
              <div className="pt-2 flex justify-end">
                <button
                  onClick={resetDemoBalance}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 transition-colors"
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
              <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
                <span>Connect Live Deriv API Token</span>
                <a
                  href="https://app.deriv.com/account/api-token"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 text-[11px]"
                >
                  <span>Get Token from Deriv</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Key className="w-3.5 h-3.5" />
                </div>
                <input
                  type="password"
                  placeholder="Paste your Deriv API token (e.g. a1-b2c3d4e5...)"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5">
                <span>Don't have a token right now?</span>
                <button
                  type="button"
                  onClick={handleUseSampleToken}
                  className="text-blue-400 hover:text-blue-300 font-medium underline underline-offset-2"
                >
                  Use test Deriv token
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 p-2 bg-rose-950/50 border border-rose-800/80 rounded text-rose-300 text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="flex items-center gap-2 p-2 bg-emerald-950/50 border border-emerald-800/80 rounded text-emerald-300 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                <span>Authorize & Connect Deriv Real</span>
              </button>

              {account.isReal && (
                <button
                  type="button"
                  onClick={disconnectDerivToken}
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Switch to Demo
                </button>
              )}
            </div>
          </form>

          {/* Guide Steps */}
          <div className="pt-3 border-t border-slate-800 space-y-1.5 text-slate-400 text-[11px]">
            <p className="font-semibold text-slate-300">How to create a Deriv API Token:</p>
            <ol className="list-decimal pl-4 space-y-1 text-slate-400 font-normal">
              <li>Log in to your Deriv account at <strong className="text-slate-300">app.deriv.com</strong></li>
              <li>Go to <strong className="text-slate-300">Account Settings &gt; API Token</strong></li>
              <li>Enter a Token Name (e.g. <em className="text-blue-400">nderiskool-terminal</em>)</li>
              <li>Check scopes: <strong className="text-slate-200">Read</strong> and <strong className="text-slate-200">Trade</strong></li>
              <li>Click <strong className="text-slate-300">Create</strong> and paste the generated token above</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-slate-400" />
            <span>Tokens are stored locally in your browser memory</span>
          </div>
          <button
            onClick={() => setIsConnectModalOpen(false)}
            className="text-slate-400 hover:text-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
