import React, { useEffect, useState, useCallback } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  X,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Download,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Terminal,
  FileCode2,
  Star,
} from 'lucide-react';

interface PlayStorePublishModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ReadinessChecks {
  secureOrigin: boolean;
  manifestReady: boolean;
  serviceWorkerActive: boolean;
  assetLinksReachable: boolean;
  iconsReady: boolean;
  checkedAt: string | null;
}

const DEFAULT_SHA256 =
  '00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00';

export const PlayStorePublishModal: React.FC<PlayStorePublishModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const defaultHostUrl =
    typeof window !== 'undefined' && window.location.origin.startsWith('https://')
      ? window.location.origin
      : 'https://ais-pre-jz25fafjzxt24p4sipkpl5-1003283581462.europe-west2.run.app';

  const [packageId, setPackageId] = useState<string>('com.nderiskool.derivterminal');
  const [appTitle] = useState<string>('nderiskool | Deriv Forex Terminal');
  const [hostUrl, setHostUrl] = useState<string>(defaultHostUrl);
  const [sha256Fingerprint, setSha256Fingerprint] = useState<string>(DEFAULT_SHA256);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const [checks, setChecks] = useState<ReadinessChecks>({
    secureOrigin: typeof window !== 'undefined' ? window.isSecureContext : true,
    manifestReady: false,
    serviceWorkerActive: false,
    assetLinksReachable: false,
    iconsReady: false,
    checkedAt: null,
  });

  const runReadinessChecks = useCallback(async () => {
    setIsChecking(true);
    let manifestReady = false;
    let iconsReady = false;
    let serviceWorkerActive = false;
    let assetLinksReachable = false;

    try {
      const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      const manifestHref = manifestLink?.getAttribute('href') || '/manifest.webmanifest';
      const manifestRes = await fetch(manifestHref);
      if (manifestRes.ok) {
        const manifestData = await manifestRes.json();
        manifestReady = Boolean(manifestData?.name && manifestData?.start_url && manifestData?.display);
        const iconSizes = Array.isArray(manifestData?.icons)
          ? manifestData.icons.map((i: { sizes?: string }) => i.sizes)
          : [];
        iconsReady = iconSizes.includes('192x192') && iconSizes.includes('512x512');
      }
    } catch {
      manifestReady = false;
    }

    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        serviceWorkerActive = regs.length > 0;
      }
    } catch {
      serviceWorkerActive = false;
    }

    try {
      const assetRes = await fetch('/.well-known/assetlinks.json');
      if (assetRes.ok) {
        const assetData = await assetRes.json();
        assetLinksReachable = Array.isArray(assetData) && assetData.length > 0;
      }
    } catch {
      assetLinksReachable = false;
    }

    setChecks({
      secureOrigin: window.isSecureContext,
      manifestReady,
      serviceWorkerActive,
      assetLinksReachable,
      iconsReady,
      checkedAt: new Date().toLocaleTimeString(),
    });
    setIsChecking(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      runReadinessChecks();
    }
  }, [isOpen, runReadinessChecks]);

  if (!isOpen) return null;

  const cleanHost = hostUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const cleanOrigin = hostUrl.replace(/\/+$/, '');
  const manifestUrl = `${cleanOrigin}/manifest.webmanifest`;
  const pwabuilderUrl = `https://www.pwabuilder.com/?url=${encodeURIComponent(cleanOrigin)}`;

  const assetLinksJson = JSON.stringify(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: packageId.trim() || 'com.nderiskool.derivterminal',
          sha256_cert_fingerprints: [sha256Fingerprint.trim() || DEFAULT_SHA256],
        },
      },
    ],
    null,
    2
  );

  const twaManifestJson = JSON.stringify(
    {
      packageId: packageId.trim() || 'com.nderiskool.derivterminal',
      host: cleanHost,
      name: appTitle.trim() || 'nderiskool | Deriv Forex Terminal',
      launcherName: 'nderiskool',
      display: 'standalone',
      themeColor: '#0b1930',
      themeColorDark: '#0b1930',
      navigationColor: '#0b1930',
      navigationColorDark: '#0b1930',
      navigationDividerColor: '#E2E8F0',
      navigationDividerColorDark: '#1E293B',
      backgroundColor: '#f8fafc',
      enableNotifications: true,
      startUrl: '/',
      iconUrl: `${cleanOrigin}/pwa-512x512.png`,
      maskableIconUrl: `${cleanOrigin}/pwa-maskable-512x512.png`,
      splashScreenFadeOutDuration: 300,
      signingKey: {
        path: './android.keystore',
        alias: 'nderiskool',
      },
      appVersionName: '1.0.0',
      appVersionCode: 1,
      shortcuts: [
        {
          name: 'Manual Trade',
          shortName: 'Trade',
          url: `${cleanOrigin}/?view=terminal`,
          chosenIconUrl: `${cleanOrigin}/pwa-192x192.png`,
        },
        {
          name: 'Deriv Cashier',
          shortName: 'Cashier',
          url: `${cleanOrigin}/?view=cashier`,
          chosenIconUrl: `${cleanOrigin}/pwa-192x192.png`,
        },
      ],
      generatorApp: 'bubblewrap-cli',
      webManifestUrl: manifestUrl,
      fallbackType: 'customtabs',
      features: {},
      alphaDependencies: { enabled: false },
      enableSiteSettingsShortcut: true,
      isChromeOSOnly: false,
      isMetaQuest: false,
      minSdkVersion: 21,
      orientation: 'default',
    },
    null,
    2
  );

  const bubblewrapCommands = `npx @bubblewrap/cli init --manifest="${manifestUrl}"\nnpx @bubblewrap/cli build`;

  const copyText = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isFingerprintDefault = sha256Fingerprint.trim() === DEFAULT_SHA256;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 md:p-5 bg-[#0b1930] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2bbbad]/20 border border-[#2bbbad]/40 flex items-center justify-center text-[#2bbbad]">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Google Play Store &amp; Android TWA Publisher
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#2bbbad]/20 text-[#2bbbad] border border-[#2bbbad]/40 uppercase">
                  PWA + TWA Ready
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Package <strong className="text-white">{packageId}</strong> as a signed Android App Bundle (.aab) for Google Play Console
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 text-xs bg-[#f8fafc]">
          {/* Play Store Listing Preview Card */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                Google Play Store Listing Preview
              </span>
              {isInstallable && !isInstalled && (
                <button
                  type="button"
                  onClick={install}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2bbbad] hover:bg-[#239b8f] text-white font-mono text-[11px] font-bold transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Install Now on This Device</span>
                </button>
              )}
              {isInstalled && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono text-[10px] font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Installed in Standalone Mode</span>
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <img
                src="/pwa-192x192.png"
                alt="nderiskool App Icon"
                className="w-16 h-16 rounded-2xl border border-slate-200 shadow-md shrink-0"
              />
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-slate-900 truncate">{appTitle}</h3>
                <p className="text-emerald-700 font-semibold text-xs">
                  nderiskool · kiragunderi28@gmail.com
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-slate-500 font-mono">
                  <span className="inline-flex items-center gap-1 text-amber-600 font-bold">
                    <Star className="w-3 h-3 fill-current" /> 5.0 · Finance
                  </span>
                  <span>·</span>
                  <span>v1.0.0 (TWA)</span>
                  <span>·</span>
                  <span className="text-slate-700 font-semibold">{packageId}</span>
                </div>
              </div>
              <div className="flex flex-col sm:items-end gap-2 shrink-0">
                <a
                  href={pwabuilderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#2bbbad] hover:bg-[#239b8f] text-white font-bold font-mono text-xs shadow-sm transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Build Android .aab (PWABuilder)</span>
                </a>
                <a
                  href="https://play.google.com/console"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-mono text-[11px] font-semibold transition-colors"
                >
                  <ExternalLink className="w-3 h-3 text-[#0b1930]" />
                  <span>Open Google Play Console</span>
                </a>
              </div>
            </div>
          </div>

          {/* Live Technical Readiness Checks */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Google Play TWA Technical Readiness</span>
                {checks.checkedAt && (
                  <span className="text-[10px] text-slate-500 font-mono font-normal">
                    Verified {checks.checkedAt}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={runReadinessChecks}
                disabled={isChecking}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-mono text-[11px] font-medium cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
                <span>Re-verify</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 font-mono text-[11px]">
              {[
                { label: 'Web App Manifest', ok: checks.manifestReady, detail: 'standalone + shortcuts' },
                { label: 'Service Worker Active', ok: checks.serviceWorkerActive, detail: 'offline caching' },
                { label: '192px & 512px Maskable Icons', ok: checks.iconsReady, detail: 'Android adaptive safe-zone' },
                { label: 'HTTPS Secure Origin', ok: checks.secureOrigin, detail: 'Required for Play TWA' },
                {
                  label: 'Digital Asset Links JSON',
                  ok: checks.assetLinksReachable,
                  detail: '/.well-known/assetlinks.json',
                },
                {
                  label: 'Play Signing SHA-256 Set',
                  ok: !isFingerprintDefault,
                  detail: isFingerprintDefault ? 'Paste Play Console SHA-256 below' : 'Custom SHA-256 configured',
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`p-2.5 rounded-lg border flex items-start gap-2 ${
                    item.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {item.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold">{item.label}</div>
                    <div className="text-[10px] opacity-80">{item.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TWA & Asset Links Configurator */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-xs">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <FileCode2 className="w-4 h-4 text-[#0b1930]" />
              <span>Android Package &amp; Digital Asset Links Generator</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
              <div>
                <label className="text-[11px] text-slate-600 font-semibold block mb-1">Android Package ID</label>
                <input
                  type="text"
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:outline-none focus:border-[#0b1930]"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-600 font-semibold block mb-1">Hosted App URL (Shared HTTPS URL)</label>
                <input
                  type="text"
                  value={hostUrl}
                  onChange={(e) => setHostUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:outline-none focus:border-[#0b1930]"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-[11px] text-slate-600 font-semibold block mb-1">
                  Google Play Console App Signing SHA-256 Certificate Fingerprint
                </label>
                <input
                  type="text"
                  value={sha256Fingerprint}
                  onChange={(e) => setSha256Fingerprint(e.target.value)}
                  placeholder="AA:BB:CC:..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-emerald-700 font-semibold text-xs focus:outline-none focus:border-emerald-600"
                />
                <span className="text-[10px] text-slate-500 block mt-1 font-sans">
                  Found in Google Play Console &rarr; Release &rarr; Setup &rarr; App signing &rarr; SHA-256 certificate fingerprint.
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => downloadFile(assetLinksJson, 'assetlinks.json')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-mono text-[11px] font-bold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>Download assetlinks.json</span>
              </button>
              <button
                type="button"
                onClick={() => downloadFile(twaManifestJson, 'twa-manifest.json')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-mono text-[11px] font-bold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#0b1930]" />
                <span>Download twa-manifest.json</span>
              </button>
              <button
                type="button"
                onClick={() => copyText(assetLinksJson, 'assetlinks')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-mono text-[11px] cursor-pointer"
              >
                {copiedId === 'assetlinks' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedId === 'assetlinks' ? 'Copied assetlinks.json' : 'Copy assetlinks.json'}</span>
              </button>
            </div>
          </div>

          {/* Bubblewrap CLI Packaging Guide */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Terminal className="w-4 h-4 text-amber-600" />
                <span>3-Step Google Play Store Submission Flow</span>
              </div>
              <button
                type="button"
                onClick={() => copyText(bubblewrapCommands, 'cli')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-mono text-[10px] font-semibold cursor-pointer"
              >
                {copiedId === 'cli' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedId === 'cli' ? 'Copied CLI' : 'Copy Bubblewrap CLI'}</span>
              </button>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-700 leading-relaxed">
              <li>
                Use <strong className="text-emerald-700">Build Android .aab (PWABuilder)</strong> above or run Google Bubblewrap locally to compile <code className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-amber-700 font-mono">app-release-bundle.aab</code>:
                <pre className="mt-1.5 p-3 rounded-lg bg-[#0b1930] border border-slate-800 font-mono text-[11px] text-[#2bbbad] overflow-x-auto">
                  {bubblewrapCommands}
                </pre>
              </li>
              <li>
                Upload the <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-900 font-mono">.aab</code> to your{' '}
                <strong className="text-slate-900">Google Play Console</strong> developer account, copy the Play App Signing SHA-256 fingerprint, and replace it in{' '}
                <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-900 font-mono">public/.well-known/assetlinks.json</code> so Android launches the app full-screen without a browser URL bar.
              </li>
              <li>
                Complete Play Store listing assets (the wide &amp; mobile screenshots and 512&times;512 icon are already generated under <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-900 font-mono">/public</code>) and submit for Google Play review.
              </li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>Manifest: /manifest.webmanifest · Asset Links: /.well-known/assetlinks.json</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-[#0b1930] hover:bg-slate-800 text-white font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
