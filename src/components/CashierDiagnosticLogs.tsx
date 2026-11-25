import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import {
  CashierDiagnosticLog,
  DiagnosticChannel,
  WebhookCallbackEntry,
  WebhookCallbackKind,
} from '../types/trading';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Check,
  RefreshCw,
  ShieldAlert,
  Terminal,
  Trash2,
  Wifi,
  XCircle,
  Link2,
  Webhook,
  Send,
} from 'lucide-react';

interface BackendDiagnosticsHealth {
  darajaEnv: 'sandbox' | 'production';
  stkConfigured: boolean;
  b2cConfigured: boolean;
  b2bConfigured?: boolean;
  b2bCommandId?: string;
  darajaWarnings: string[];
  dcashApiConfigured: boolean;
  dcashBuiltinReady?: boolean;
  dcashBridgeMode?: 'EXTERNAL_API' | 'BUILTIN_BRIDGE';
  valtexExternalConfigured?: boolean;
  valtexMode?: 'EXTERNAL_VALTEX_API' | 'VALTEX_WEBHOOK_BRIDGE';
  valtexUrls?: {
    checkoutUrl: string;
    apiBaseUrl: string;
    depositUrl: string;
    withdrawUrl: string;
    transferUrl: string;
    callbackUrl: string;
    confirmUrl: string;
  };
  payheroApiConfigured?: boolean;
  payheroChannelConfigured?: boolean;
  payheroMode?: 'PAYHERO_API_V2' | 'PAYHERO_WEBHOOK_BRIDGE';
  payheroUrls?: {
    checkoutUrl: string;
    apiBaseUrl: string;
    depositUrl: string;
    withdrawUrl: string;
    transferUrl: string;
    callbackUrl: string;
    confirmUrl: string;
    walletUrl: string;
  };
  kcbBuniConfigured?: boolean;
  kcbDarajaB2bReady?: boolean;
  kcbDarajaStkReady?: boolean;
  kcbPayheroBank01Ready?: boolean;
  kcbIbankConnected?: boolean;
  kcbMode?: 'KCB_BUNI_API' | 'DARAJA_B2B_522522' | 'PAYHERO_BANK_01' | 'KCB_WEBHOOK_BRIDGE';
  kcbUrls?: {
    checkoutUrl: string;
    apiBaseUrl: string;
    depositUrl?: string;
    withdrawUrl?: string;
    transferUrl: string;
    inquiryUrl?: string;
    ipnUrl?: string;
    callbackUrl: string;
    confirmUrl: string;
  };
  dcashUrlValid: boolean;
  dcashUrlPresent: boolean;
  dcashUrls?: {
    checkoutUrl: string;
    apiBaseUrl: string;
    transferUrl: string;
    builtInTransferUrl: string;
    callbackUrl: string;
    externalApiUrl: string | null;
    paymentAgentUrl: string;
  };
  dcashWarnings: string[];
  verifiedP2pReceiversCount: number;
  callbackConfig?: {
    publicBaseUrl: string;
    source: 'RUNTIME_CONFIG' | 'ENV_SECRET' | 'APP_URL_ENV' | 'REQUEST_HOST' | 'UNRESOLVED';
    runtimeOverrideUrl?: string;
    envCallbackBaseUrl?: string;
    envAppUrl?: string;
    callbackAuthGated: boolean;
    isHttps: boolean;
    isDarajaCompatible: boolean;
    warning?: string | null;
  };
  callbackUrls?: {
    healthUrl?: string;
    stkCallbackUrl?: string;
    b2cResultUrl: string;
    b2cTimeoutUrl?: string;
    b2bResultUrl?: string;
    b2bTimeoutUrl?: string;
    c2bValidationUrl?: string;
    c2bConfirmationUrl?: string;
    dcashTransferUrl?: string;
    dcashCallbackUrl: string;
    dcashCheckoutUrl?: string;
    valtexCallbackUrl?: string;
    valtexTransferUrl?: string;
    payheroCallbackUrl?: string;
    payheroDepositUrl?: string;
    payheroWithdrawUrl?: string;
    payheroTransferUrl?: string;
    kcbIpnUrl?: string;
    kcbCallbackUrl?: string;
    kcbDepositUrl?: string;
    kcbWithdrawUrl?: string;
    kcbTransferUrl?: string;
  };
}

export const CashierDiagnosticLogs: React.FC = () => {
  const {
    realAccount,
    activeP2pReceiverPhone,
    clientDiagnosticLogs,
    clearClientDiagnosticLogs,
    setIsCashierOpen,
    setIsConnectModalOpen,
  } = useTrading();

  const [backendLogs, setBackendLogs] = useState<CashierDiagnosticLog[]>([]);
  const [webhookCallbacks, setWebhookCallbacks] = useState<WebhookCallbackEntry[]>([]);
  const [health, setHealth] = useState<BackendDiagnosticsHealth | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProbing, setIsProbing] = useState<boolean>(false);
  const [isSendingWebhookTest, setIsSendingWebhookTest] = useState<boolean>(false);
  const [autoPoll, setAutoPoll] = useState<boolean>(true);
  const [activeView, setActiveView] = useState<'ALL' | 'WEBHOOKS' | 'RESPONSES'>('ALL');
  const [webhookKindFilter, setWebhookKindFilter] = useState<'ALL' | WebhookCallbackKind>('ALL');
  const [channelFilter, setChannelFilter] = useState<'ALL' | DiagnosticChannel | 'DERIV_SOURCE'>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'ISSUES' | 'HEALTHY'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsedWebhooks, setCollapsedWebhooks] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [callbackBaseInput, setCallbackBaseInput] = useState<string>('');
  const [callbackInputDirty, setCallbackInputDirty] = useState<boolean>(false);
  const [isSavingCallbackBase, setIsSavingCallbackBase] = useState<boolean>(false);
  const [isProbingCallbackBase, setIsProbingCallbackBase] = useState<boolean>(false);
  const [callbackFeedback, setCallbackFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const hasRealDerivToken = Boolean(realAccount.token && realAccount.token !== 'CR-NDERISKOOL-LIVE');

  const fetchBackendDiagnostics = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      try {
        const res = await fetch('/api/cashier/diagnostics');
        if (res.ok) {
          const data = await res.json();
          if (data?.health) {
            setHealth(data.health);
            if (!callbackInputDirty) {
              const cfgUrl =
                data.health?.callbackConfig?.runtimeOverrideUrl ||
                data.health?.callbackConfig?.envCallbackBaseUrl ||
                data.health?.callbackConfig?.publicBaseUrl ||
                '';
              setCallbackBaseInput(cfgUrl);
            }
          }
          if (Array.isArray(data?.logs)) setBackendLogs(data.logs);
          if (Array.isArray(data?.webhookCallbacks)) setWebhookCallbacks(data.webhookCallbacks);
          setLastUpdated(Date.now());
        }
      } catch {
        // Backend unreachable
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [callbackInputDirty]
  );

  useEffect(() => {
    fetchBackendDiagnostics();
  }, [fetchBackendDiagnostics]);

  useEffect(() => {
    if (!autoPoll) return;
    const timer = setInterval(() => {
      fetchBackendDiagnostics(true);
    }, 4000);
    return () => clearInterval(timer);
  }, [autoPoll, fetchBackendDiagnostics]);

  const handleRunLiveProbe = async () => {
    setIsProbing(true);
    try {
      await Promise.allSettled([
        fetch('/api/mpesa/verify-oauth', { method: 'POST' }),
        fetch('/api/mpesa/b2c-verify-oauth', { method: 'POST' }),
        fetch('/api/mpesa/b2b-verify-oauth', { method: 'POST' }),
        fetch('/api/p2p/verify-receiver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: activeP2pReceiverPhone || '0728424076',
            loginId: realAccount.loginId,
          }),
        }),
        fetch('/api/dcash/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            direction: 'WITHDRAWAL',
            phone: '254728424076',
            usdAmount: 10,
            kesAmount: 1295,
            loginId: realAccount.loginId,
            dcashTag: activeP2pReceiverPhone || '0728424076',
          }),
        }),
      ]);
      await fetchBackendDiagnostics();
    } finally {
      setIsProbing(false);
    }
  };

  const handleLoopbackWebhookTest = async (target: 'B2C' | 'B2B' | 'DCASH' | 'VALTEX' | 'KCB') => {
    setIsSendingWebhookTest(true);
    const pingRef = `PING-LOOPBACK-${Date.now()}`;
    try {
      if (target === 'B2C') {
        await fetch('/api/mpesa/b2c-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Result: {
              ResultType: 0,
              ResultCode: 0,
              ResultDesc: 'LOOPBACK ROUTE CHECK (unmatched diagnostic ping — no balance changed)',
              OriginatorConversationID: pingRef,
              ConversationID: `AG_${pingRef}`,
              TransactionID: 'PING000000',
              ResultParameters: {
                ResultParameter: [
                  { Key: 'TransactionAmount', Value: 0 },
                  { Key: 'ReceiverPartyPublicName', Value: '254728424076 - Diagnostic Loopback' },
                ],
              },
            },
          }),
        });
      } else if (target === 'B2B') {
        await fetch('/api/mpesa/b2b-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Result: {
              ResultType: 0,
              ResultCode: 0,
              ResultDesc: 'B2B LOOPBACK ROUTE CHECK (unmatched diagnostic ping — no balance changed)',
              OriginatorConversationID: pingRef,
              ConversationID: `AG_B2B_${pingRef}`,
              TransactionID: 'PINGB2B000',
              ResultParameters: {
                ResultParameter: [
                  { Key: 'Amount', Value: 0 },
                  { Key: 'ReceiverPartyPublicName', Value: '247247 - B2B Paybill Diagnostic' },
                ],
              },
            },
          }),
        });
      } else if (target === 'VALTEX') {
        await fetch('/api/valtex/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference: pingRef,
            status: 'PING_ACK',
            message: 'VALTEX LOOPBACK ROUTE CHECK (unmatched diagnostic ping — no balance changed)',
            targetPhone: activeP2pReceiverPhone || '0728424076',
          }),
        });
      } else if (target === 'KCB') {
        await fetch('/api/kcb/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            externalReference: pingRef,
            status: 'PING_ACK',
            message: 'KCB IPN LOOPBACK ROUTE CHECK (unmatched diagnostic ping — no balance changed)',
          }),
        });
      } else {
        await fetch('/api/dcash/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference: pingRef,
            status: 'PING_ACK',
            message: 'LOOPBACK ROUTE CHECK (unmatched diagnostic ping — no balance changed)',
            targetPhone: activeP2pReceiverPhone || '0728424076',
          }),
        });
      }
      await fetchBackendDiagnostics();
    } finally {
      setIsSendingWebhookTest(false);
    }
  };

  const handleClearLogs = async () => {
    clearClientDiagnosticLogs();
    setBackendLogs([]);
    setWebhookCallbacks([]);
    try {
      await fetch('/api/cashier/diagnostics?scope=all', { method: 'DELETE' });
      await fetchBackendDiagnostics();
    } catch {
      // ignore
    }
  };

  const handleClearWebhooksOnly = async () => {
    setWebhookCallbacks([]);
    try {
      await fetch('/api/cashier/webhooks', { method: 'DELETE' });
      await fetchBackendDiagnostics();
    } catch {
      // ignore
    }
  };

  const handleSaveCallbackBaseUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCallbackFeedback(null);
    setIsSavingCallbackBase(true);
    try {
      const res = await fetch('/api/cashier/callback-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackBaseUrl: callbackBaseInput }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setCallbackFeedback({
          type: 'error',
          text: data.error || 'Failed to save MPESA_CALLBACK_BASE_URL.',
        });
      } else {
        setCallbackInputDirty(false);
        setCallbackBaseInput(data.publicBaseUrl || '');
        setCallbackFeedback({
          type: data.isDarajaCompatible ? 'success' : 'warning',
          text: data.isDarajaCompatible
            ? `Saved public callback base URL: ${data.publicBaseUrl}`
            : data.warning || `Saved ${data.publicBaseUrl}`,
        });
        await fetchBackendDiagnostics(true);
      }
    } catch {
      setCallbackFeedback({ type: 'error', text: 'Network error saving callback base URL.' });
    } finally {
      setIsSavingCallbackBase(false);
    }
  };

  const handleResetCallbackBaseUrl = async () => {
    setCallbackFeedback(null);
    setIsSavingCallbackBase(true);
    try {
      const res = await fetch('/api/cashier/callback-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      });
      const data = await res.json();
      setCallbackInputDirty(false);
      setCallbackBaseInput(data.publicBaseUrl || '');
      setCallbackFeedback({
        type: data.isDarajaCompatible ? 'success' : 'warning',
        text: `Reset to environment default (${data.publicBaseUrl || 'request host'}).`,
      });
      await fetchBackendDiagnostics(true);
    } catch {
      setCallbackFeedback({ type: 'error', text: 'Unable to reset callback base URL.' });
    } finally {
      setIsSavingCallbackBase(false);
    }
  };

  const handleProbeCallbackReachability = async () => {
    setCallbackFeedback(null);
    setIsProbingCallbackBase(true);
    try {
      const res = await fetch('/api/cashier/callback-config/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackBaseUrl: callbackBaseInput.trim() || undefined }),
      });
      const data = await res.json();
      setCallbackFeedback({
        type: data.reachable ? 'success' : 'warning',
        text: data.summary || data.error || 'Reachability check finished.',
      });
      await fetchBackendDiagnostics(true);
    } catch {
      setCallbackFeedback({ type: 'error', text: 'Unable to reach probe endpoint.' });
    } finally {
      setIsProbingCallbackBase(false);
    }
  };

  const mergedLogs = useMemo(() => {
    return [...backendLogs, ...clientDiagnosticLogs].sort((a, b) => b.timestamp - a.timestamp);
  }, [backendLogs, clientDiagnosticLogs]);

  const filteredLogs = useMemo(() => {
    return mergedLogs.filter((log) => {
      if (channelFilter === 'DERIV_SOURCE') {
        if (log.source !== 'DERIV_WS') return false;
      } else if (channelFilter !== 'ALL') {
        if (log.channel !== channelFilter) return false;
      }

      if (outcomeFilter === 'ISSUES') {
        if (log.outcome !== 'REJECTED' && log.outcome !== 'WARNING' && log.outcome !== 'UNCONFIGURED') {
          return false;
        }
      } else if (outcomeFilter === 'HEALTHY') {
        if (log.outcome !== 'OK' && log.outcome !== 'PENDING') return false;
      }

      return true;
    });
  }, [channelFilter, mergedLogs, outcomeFilter]);

  const filteredWebhooks = useMemo(() => {
    if (webhookKindFilter === 'ALL') return webhookCallbacks;
    return webhookCallbacks.filter((cb) => cb.kind === webhookKindFilter);
  }, [webhookCallbacks, webhookKindFilter]);

  const issueCount = useMemo(
    () =>
      mergedLogs.filter(
        (l) => l.outcome === 'REJECTED' || l.outcome === 'WARNING' || l.outcome === 'UNCONFIGURED'
      ).length,
    [mergedLogs]
  );

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleCopyJson = (log: CashierDiagnosticLog) => {
    const payload = JSON.stringify(
      {
        id: log.id,
        timestamp: new Date(log.timestamp).toISOString(),
        source: log.source,
        channel: log.channel,
        endpoint: `${log.method} ${log.endpoint}`,
        httpStatus: log.httpStatus,
        outcome: log.outcome,
        phoneOrTarget: log.phoneOrTarget,
        reference: log.reference,
        summary: log.summary,
        responsePayload: log.responsePayload,
      },
      null,
      2
    );
    handleCopyText(log.id, payload);
  };

  const formatRawPayload = (cb: WebhookCallbackEntry): string => {
    if (cb.rawPayload !== undefined && cb.rawPayload !== null) {
      if (typeof cb.rawPayload === 'string') {
        return cb.rawPayload;
      }
      try {
        return JSON.stringify(cb.rawPayload, null, 2);
      } catch {
        // fallback below
      }
    }
    return cb.rawBodyText || '{}';
  };

  const renderWebhookKindBadge = (kind: WebhookCallbackKind) => {
    switch (kind) {
      case 'MPESA_B2C_RESULT':
        return (
          <span className="px-1.5 py-0.5 rounded bg-emerald-700 text-white font-bold text-[10px]">
            M-PESA B2C RESULT
          </span>
        );
      case 'MPESA_B2C_TIMEOUT':
        return (
          <span className="px-1.5 py-0.5 rounded bg-amber-600 text-white font-bold text-[10px]">
            M-PESA B2C TIMEOUT
          </span>
        );
      case 'MPESA_B2B_RESULT':
        return (
          <span className="px-1.5 py-0.5 rounded bg-indigo-700 text-white font-bold text-[10px]">
            M-PESA B2B RESULT
          </span>
        );
      case 'MPESA_B2B_TIMEOUT':
        return (
          <span className="px-1.5 py-0.5 rounded bg-amber-700 text-white font-bold text-[10px]">
            M-PESA B2B TIMEOUT
          </span>
        );
      case 'MPESA_STK_CALLBACK':
        return (
          <span className="px-1.5 py-0.5 rounded bg-teal-700 text-white font-bold text-[10px]">
            M-PESA STK
          </span>
        );
      case 'MPESA_C2B_VALIDATION':
        return (
          <span className="px-1.5 py-0.5 rounded bg-sky-700 text-white font-bold text-[10px]">
            C2B VALIDATION
          </span>
        );
      case 'MPESA_C2B_CONFIRMATION':
        return (
          <span className="px-1.5 py-0.5 rounded bg-emerald-800 text-white font-bold text-[10px]">
            C2B CONFIRMATION
          </span>
        );
      case 'MPESA_BALANCE_RESULT':
        return (
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-bold text-[10px]">
            DARAJA BALANCE
          </span>
        );
      case 'MPESA_TX_STATUS_RESULT':
        return (
          <span className="px-1.5 py-0.5 rounded bg-cyan-800 text-white font-bold text-[10px]">
            TX STATUS
          </span>
        );
      case 'DCASH_CALLBACK':
        return (
          <span className="px-1.5 py-0.5 rounded bg-[#0b1930] text-[#2bbbad] font-bold text-[10px]">
            D CASH WEBHOOK
          </span>
        );
      case 'VALTEX_CALLBACK':
        return (
          <span className="px-1.5 py-0.5 rounded bg-[#0b1930] text-emerald-300 font-bold text-[10px]">
            VALTEX WEBHOOK
          </span>
        );
      case 'PAYHERO_CALLBACK':
        return (
          <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-emerald-300 font-bold text-[10px]">
            PAYHERO WEBHOOK
          </span>
        );
      case 'KCB_CALLBACK':
        return (
          <span className="px-1.5 py-0.5 rounded bg-[#004d25] text-[#84bd00] font-bold text-[10px]">
            KCB IPN WEBHOOK
          </span>
        );
    }
  };

  type NormalizedPayloadStatus = 'Success' | 'Pending' | 'Failed';

  const resolvePayloadStatusBadge = (
    payload: unknown,
    fallbackValue?: string | number
  ): { label: NormalizedPayloadStatus; rawStatus: string } | null => {
    let rawValue: unknown;

    if (payload && typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;
      if (obj.status !== undefined && obj.status !== null && obj.status !== '') {
        rawValue = obj.status;
      } else if (
        obj.receiver &&
        typeof obj.receiver === 'object' &&
        (obj.receiver as Record<string, unknown>).status !== undefined
      ) {
        rawValue = (obj.receiver as Record<string, unknown>).status;
      } else if (
        obj.transaction &&
        typeof obj.transaction === 'object' &&
        (obj.transaction as Record<string, unknown>).status !== undefined
      ) {
        rawValue = (obj.transaction as Record<string, unknown>).status;
      } else if (
        obj.p2p_order_create &&
        typeof obj.p2p_order_create === 'object' &&
        (obj.p2p_order_create as Record<string, unknown>).status !== undefined
      ) {
        rawValue = (obj.p2p_order_create as Record<string, unknown>).status;
      } else if (
        obj.Result &&
        typeof obj.Result === 'object' &&
        (obj.Result as Record<string, unknown>).ResultCode !== undefined
      ) {
        const code = (obj.Result as Record<string, unknown>).ResultCode;
        rawValue = Number(code) === 0 ? 'SUCCESS' : `FAILED (${String(code)})`;
      } else if (
        obj.Body &&
        typeof obj.Body === 'object' &&
        (obj.Body as Record<string, unknown>).stkCallback &&
        typeof (obj.Body as Record<string, unknown>).stkCallback === 'object' &&
        ((obj.Body as Record<string, unknown>).stkCallback as Record<string, unknown>).ResultCode !== undefined
      ) {
        const code = ((obj.Body as Record<string, unknown>).stkCallback as Record<string, unknown>).ResultCode;
        rawValue = Number(code) === 0 ? 'SUCCESS' : `FAILED (${String(code)})`;
      } else if (obj.ResponseCode !== undefined) {
        rawValue = String(obj.ResponseCode) === '0' ? 'PENDING' : `FAILED (${String(obj.ResponseCode)})`;
      } else if (obj.error) {
        rawValue = 'FAILED';
      } else if (typeof obj.ok === 'boolean') {
        rawValue = obj.ok ? 'SUCCESS' : 'FAILED';
      }
    } else if (typeof payload === 'string' && payload.trim().startsWith('{')) {
      try {
        return resolvePayloadStatusBadge(JSON.parse(payload), fallbackValue);
      } catch {
        // ignore invalid JSON text
      }
    }

    if (rawValue === undefined && fallbackValue !== undefined && fallbackValue !== '') {
      rawValue = fallbackValue;
    }

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return null;
    }

    const rawText = String(rawValue).trim();
    const upper = rawText.toUpperCase();

    if (
      upper === '0' ||
      upper === 'OK' ||
      upper === 'ACCEPTED' ||
      upper.includes('SUCCESS') ||
      upper.includes('COMPLETE') ||
      upper.includes('VERIFIED') ||
      upper.includes('SETTLED')
    ) {
      return { label: 'Success', rawStatus: rawText };
    }

    if (
      upper.includes('PENDING') ||
      upper.includes('PROCESS') ||
      upper.includes('QUEUE') ||
      upper.includes('INITIATED') ||
      upper.includes('AWAIT') ||
      upper.includes('BUYER-CONFIRMED') ||
      upper.includes('PING')
    ) {
      return { label: 'Pending', rawStatus: rawText };
    }

    return { label: 'Failed', rawStatus: rawText };
  };

  const renderPayloadStatusBadge = (payload: unknown, fallbackValue?: string | number) => {
    const resolved = resolvePayloadStatusBadge(payload, fallbackValue);
    if (!resolved) return null;

    if (resolved.label === 'Success') {
      return (
        <span
          title={`Raw JSON status: ${resolved.rawStatus}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]"
        >
          <CheckCircle2 className="w-3 h-3" />
          <span>Success</span>
        </span>
      );
    }

    if (resolved.label === 'Pending') {
      return (
        <span
          title={`Raw JSON status: ${resolved.rawStatus}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-bold text-[10px]"
        >
          <Clock className="w-3 h-3" />
          <span>Pending</span>
        </span>
      );
    }

    return (
      <span
        title={`Raw JSON status: ${resolved.rawStatus}`}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[10px]"
      >
        <XCircle className="w-3 h-3" />
        <span>Failed</span>
      </span>
    );
  };

  const renderOutcomeBadge = (outcome: CashierDiagnosticLog['outcome']) => {
    switch (outcome) {
      case 'OK':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">
            <CheckCircle2 className="w-3 h-3" />
            <span>OK</span>
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-bold text-[10px]">
            <Clock className="w-3 h-3" />
            <span>PENDING</span>
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300 font-bold text-[10px]">
            <AlertCircle className="w-3 h-3" />
            <span>WARNING</span>
          </span>
        );
      case 'UNCONFIGURED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300 font-bold text-[10px]">
            <ShieldAlert className="w-3 h-3" />
            <span>UNCONFIGURED</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[10px]">
            <XCircle className="w-3 h-3" />
            <span>REJECTED</span>
          </span>
        );
    }
  };

  const callbackEndpoints = [
    {
      key: 'b2cResult',
      label: 'M-Pesa B2C ResultURL',
      url: health?.callbackUrls?.b2cResultUrl || '/api/mpesa/b2c-result',
    },
    {
      key: 'b2bResult',
      label: 'M-Pesa B2B ResultURL',
      url: health?.callbackUrls?.b2bResultUrl || '/api/mpesa/b2b-result',
    },
    {
      key: 'b2cTimeout',
      label: 'M-Pesa B2C QueueTimeOutURL',
      url: health?.callbackUrls?.b2cTimeoutUrl || '/api/mpesa/b2c-timeout',
    },
    {
      key: 'b2bTimeout',
      label: 'M-Pesa B2B QueueTimeOutURL',
      url: health?.callbackUrls?.b2bTimeoutUrl || '/api/mpesa/b2b-timeout',
    },
    {
      key: 'stkCallback',
      label: 'M-Pesa STK CallBackURL',
      url: health?.callbackUrls?.stkCallbackUrl || '/api/mpesa/callback',
    },
    {
      key: 'dcashCheckout',
      label: 'D Cash App Direct URL',
      url: health?.callbackUrls?.dcashCheckoutUrl || '/?cashier=dcash',
    },
    {
      key: 'dcashTransfer',
      label: 'D Cash App Transfer URL',
      url: health?.callbackUrls?.dcashTransferUrl || '/api/dcash/v1/transfers',
    },
    {
      key: 'dcashCallback',
      label: 'D Cash App Callback URL',
      url: health?.callbackUrls?.dcashCallbackUrl || '/api/dcash/callback',
    },
    {
      key: 'valtexTransfer',
      label: 'Valtex Transfer API URL',
      url: health?.callbackUrls?.valtexTransferUrl || health?.valtexUrls?.transferUrl || '/api/valtex/v1/transfers',
    },
    {
      key: 'valtexCallback',
      label: 'Valtex Payment Callback URL',
      url: health?.callbackUrls?.valtexCallbackUrl || health?.valtexUrls?.callbackUrl || '/api/valtex/callback',
    },
    {
      key: 'payheroTransfer',
      label: 'PayHero Money Transfer URL',
      url: health?.callbackUrls?.payheroTransferUrl || health?.payheroUrls?.transferUrl || '/api/payhero/transfer',
    },
    {
      key: 'payheroCallback',
      label: 'PayHero Payment Callback URL',
      url: health?.callbackUrls?.payheroCallbackUrl || health?.payheroUrls?.callbackUrl || '/api/payhero/callback',
    },
    {
      key: 'kcbDeposit',
      label: 'KCB iBank Deposit URL',
      url: health?.callbackUrls?.kcbDepositUrl || health?.kcbUrls?.depositUrl || '/api/kcb/deposit',
    },
    {
      key: 'kcbWithdraw',
      label: 'KCB iBank Withdrawal URL',
      url: health?.callbackUrls?.kcbWithdrawUrl || health?.kcbUrls?.withdrawUrl || '/api/kcb/withdraw',
    },
    {
      key: 'kcbTransfer',
      label: 'KCB iBank Real Money Transfer URL',
      url: health?.callbackUrls?.kcbTransferUrl || health?.kcbUrls?.transferUrl || '/api/kcb/transfer',
    },
    {
      key: 'kcbIpn',
      label: 'KCB Buni IPN URL',
      url: health?.callbackUrls?.kcbIpnUrl || health?.kcbUrls?.ipnUrl || '/api/kcb/ipn',
    },
    {
      key: 'kcbCallback',
      label: 'KCB Buni Callback URL',
      url: health?.callbackUrls?.kcbCallbackUrl || health?.kcbUrls?.callbackUrl || '/api/kcb/callback',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#0b1930] text-white flex items-center justify-center shrink-0">
            <Terminal className="w-4 h-4 text-[#2bbbad]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm">Cashier Backend &amp; Webhook Diagnostic Logs</h3>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                  autoPoll
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                <Activity className="w-3 h-3" />
                <span>{autoPoll ? 'Live 4s Poll' : 'Paused'}</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Monitors real-time P2P, D Cash, M-Pesa B2C responses &amp; raw incoming webhook JSON callbacks
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
          <button
            type="button"
            onClick={() => setAutoPoll((v) => !v)}
            className={`px-2.5 py-1.5 rounded-lg border font-bold cursor-pointer transition-colors ${
              autoPoll
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {autoPoll ? 'Pause Poll' : 'Resume Poll'}
          </button>

          <button
            type="button"
            onClick={handleRunLiveProbe}
            disabled={isProbing}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white font-bold cursor-pointer disabled:opacity-50"
          >
            <Wifi className={`w-3 h-3 text-[#2bbbad] ${isProbing ? 'animate-pulse' : ''}`} />
            <span>{isProbing ? 'Probing...' : 'Run Gateway Probe'}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchBackendDiagnostics()}
            disabled={isLoading}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleClearLogs}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 font-semibold cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear All</span>
          </button>
        </div>
      </div>

      {/* 3-Card Real-Time Gateway Diagnosis Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono text-[11px]">
        {/* Card 1: Deriv Live Token */}
        <div
          className={`p-3 rounded-xl border space-y-1.5 ${
            hasRealDerivToken ? 'bg-emerald-50/70 border-emerald-200' : 'bg-amber-50/80 border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900">1. Deriv Payments WS</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                hasRealDerivToken ? 'bg-emerald-600 text-white' : 'bg-amber-200 text-amber-950'
              }`}
            >
              {hasRealDerivToken ? 'LIVE TOKEN' : 'LOCAL LEDGER'}
            </span>
          </div>
          <p className="text-[10px] text-slate-700 font-sans leading-snug">
            {hasRealDerivToken
              ? `Connected to ${realAccount.loginId}. Live DP2P & Payment Agent calls authorized.`
              : `${realAccount.loginId} uses local ledger only. Connect a Payments-scoped Deriv API Token to reflect real withdrawals.`}
          </p>
          {!hasRealDerivToken && (
            <button
              type="button"
              onClick={() => {
                setIsCashierOpen(false);
                setIsConnectModalOpen(true);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#0b1930] text-white text-[10px] font-bold cursor-pointer"
            >
              <Link2 className="w-3 h-3 text-[#2bbbad]" />
              <span>Connect Deriv Token</span>
            </button>
          )}
        </div>

        {/* Card 2: Daraja B2C & B2B / P2P */}
        <div
          className={`p-3 rounded-xl border space-y-1.5 ${
            health?.darajaWarnings?.length
              ? 'bg-amber-50/80 border-amber-300'
              : health?.b2cConfigured || health?.b2bConfigured
              ? 'bg-emerald-50/70 border-emerald-200'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900">2. P2P &amp; Daraja B2C / B2B</span>
            <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[9px] font-bold text-slate-800">
              {(health?.darajaEnv || 'production').toUpperCase()}
            </span>
          </div>
          <p className="text-[10px] text-slate-700 font-sans leading-snug">
            {health?.darajaWarnings?.length
              ? health.darajaWarnings[0]
              : health?.b2bConfigured || health?.b2cConfigured
              ? `B2C & B2B configured (${health?.b2bCommandId || 'BusinessPayBill'}) · ${health.verifiedP2pReceiversCount} verified receiver(s) (${activeP2pReceiverPhone}).`
              : 'Daraja B2C & B2B awaiting full Safaricom Consumer Key/Secret.'}
          </p>
        </div>

        {/* Card 3: D Cash Bridge */}
        <div
          className={`p-3 rounded-xl border space-y-1.5 ${
            health?.dcashApiConfigured || health?.dcashBuiltinReady
              ? health?.dcashWarnings?.length
                ? 'bg-teal-50/80 border-teal-300'
                : 'bg-emerald-50/70 border-emerald-200'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900">3. D Cash App Bridge</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                health?.dcashApiConfigured
                  ? 'bg-emerald-600 text-white'
                  : health?.dcashBuiltinReady
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {health?.dcashApiConfigured
                ? 'API READY'
                : health?.dcashBuiltinReady
                ? 'URL ACTIVE'
                : 'LOCAL QUEUE'}
            </span>
          </div>
          <p className="text-[10px] text-slate-700 font-sans leading-snug">
            {health?.dcashApiConfigured
              ? 'External D Cash API & built-in D Cash URLs active.'
              : health?.dcashWarnings?.length
              ? health.dcashWarnings[0]
              : `Built-in D Cash Checkout & Transfer URL active (${health?.dcashUrls?.transferUrl || '/api/dcash/v1/transfers'}).`}
          </p>
        </div>
      </div>

      {/* View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-2 font-mono text-[10px]">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveView('ALL')}
            className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors ${
              activeView === 'ALL'
                ? 'bg-[#0b1930] text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            Combined View
          </button>
          <button
            type="button"
            onClick={() => setActiveView('WEBHOOKS')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors ${
              activeView === 'WEBHOOKS'
                ? 'bg-[#0b1930] text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Webhook className="w-3 h-3 text-[#2bbbad]" />
            <span>Incoming Webhooks ({webhookCallbacks.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('RESPONSES')}
            className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors ${
              activeView === 'RESPONSES'
                ? 'bg-[#0b1930] text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            API &amp; WS Stream ({mergedLogs.length})
          </button>
        </div>
        <span className="text-slate-500 px-2 tabular-nums">
          {lastUpdated ? `Synced ${new Date(lastUpdated).toLocaleTimeString()}` : 'Syncing...'}
        </span>
      </div>

      {/* LIVE INCOMING WEBHOOK CALLBACKS FEED */}
      {(activeView === 'ALL' || activeView === 'WEBHOOKS') && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Webhook className="w-4 h-4 text-[#0b1930]" />
              <div>
                <h4 className="font-bold text-slate-900 text-xs">
                  Incoming M-Pesa B2C &amp; D Cash Webhook Callbacks ({webhookCallbacks.length})
                </h4>
                <p className="text-[10px] text-slate-500">
                  Live raw JSON payloads captured directly as POST requests arrive at backend callback endpoints
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
              <button
                type="button"
                onClick={() => handleLoopbackWebhookTest('B2C')}
                disabled={isSendingWebhookTest}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold cursor-pointer disabled:opacity-50"
                title="Sends a safe unmatched PING payload to /api/mpesa/b2c-result to verify Express callback ingestion"
              >
                <Send className="w-3 h-3 text-emerald-600" />
                <span>Ping B2C Route</span>
              </button>
              <button
                type="button"
                onClick={() => handleLoopbackWebhookTest('B2B')}
                disabled={isSendingWebhookTest}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold cursor-pointer disabled:opacity-50"
                title="Sends a safe unmatched PING payload to /api/mpesa/b2b-result to verify Express B2B callback ingestion"
              >
                <Send className="w-3 h-3 text-indigo-600" />
                <span>Ping B2B Route</span>
              </button>
              <button
                type="button"
                onClick={() => handleLoopbackWebhookTest('DCASH')}
                disabled={isSendingWebhookTest}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold cursor-pointer disabled:opacity-50"
                title="Sends a safe unmatched PING payload to /api/dcash/callback to verify Express callback ingestion"
              >
                <Send className="w-3 h-3 text-teal-600" />
                <span>Ping D Cash Route</span>
              </button>
              <button
                type="button"
                onClick={() => handleLoopbackWebhookTest('VALTEX')}
                disabled={isSendingWebhookTest}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold cursor-pointer disabled:opacity-50"
                title="Sends a safe unmatched PING payload to /api/valtex/callback to verify Express callback ingestion"
              >
                <Send className="w-3 h-3 text-[#2bbbad]" />
                <span>Ping Valtex Route</span>
              </button>
              <button
                type="button"
                onClick={() => handleLoopbackWebhookTest('KCB')}
                disabled={isSendingWebhookTest}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold cursor-pointer disabled:opacity-50"
                title="Sends a safe unmatched PING payload to /api/kcb/callback to verify Express callback ingestion"
              >
                <Send className="w-3 h-3 text-[#004d25]" />
                <span>Ping KCB Route</span>
              </button>
              {webhookCallbacks.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearWebhooksOnly}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 font-semibold cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Feed</span>
                </button>
              )}
            </div>
          </div>

          {/* Public MPESA_CALLBACK_BASE_URL Configurator & Registered Callback Endpoints */}
          <div className="p-3 bg-slate-50/60 border-b border-slate-200 space-y-2.5">
            <form
              onSubmit={handleSaveCallbackBaseUrl}
              className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-[#0b1930]" />
                  <span className="text-[11px] font-bold text-slate-900">
                    Public M-Pesa &amp; Webhook Callback Base URL (MPESA_CALLBACK_BASE_URL)
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold ${
                    health?.callbackConfig?.isDarajaCompatible
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  {health?.callbackConfig?.isDarajaCompatible
                    ? `PUBLIC HTTPS (${health.callbackConfig.source})`
                    : health?.callbackConfig?.callbackAuthGated
                    ? 'AUTH-GATED PREVIEW'
                    : 'CHECK HTTPS'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                <input
                  type="url"
                  value={callbackBaseInput}
                  onChange={(e) => {
                    setCallbackBaseInput(e.target.value);
                    setCallbackInputDirty(true);
                  }}
                  placeholder="https://your-public-domain-or-tunnel.example.com"
                  className="flex-1 min-w-[220px] px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-semibold focus:outline-none focus:border-[#0b1930]"
                />
                <button
                  type="submit"
                  disabled={isSavingCallbackBase}
                  className="px-2.5 py-1.5 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {isSavingCallbackBase ? 'Saving...' : 'Save Base URL'}
                </button>
                <button
                  type="button"
                  onClick={handleProbeCallbackReachability}
                  disabled={isProbingCallbackBase}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {isProbingCallbackBase ? 'Testing...' : 'Test Reachability'}
                </button>
                {health?.callbackConfig?.runtimeOverrideUrl && (
                  <button
                    type="button"
                    onClick={handleResetCallbackBaseUrl}
                    disabled={isSavingCallbackBase}
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold cursor-pointer disabled:opacity-50"
                  >
                    Reset
                  </button>
                )}
              </div>

              {callbackFeedback && (
                <div
                  className={`px-2.5 py-1.5 rounded-lg border font-mono text-[10px] ${
                    callbackFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : callbackFeedback.type === 'error'
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {callbackFeedback.text}
                </div>
              )}

              {health?.callbackConfig?.warning && (
                <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 leading-snug">
                  {health.callbackConfig.warning}
                </p>
              )}
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[10px]">
              {callbackEndpoints.map((ep) => (
                <div
                  key={ep.key}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200"
                >
                  <div className="min-w-0">
                    <div className="text-[9px] text-slate-500 font-sans font-semibold">{ep.label}</div>
                    <div className="text-slate-800 truncate">{ep.url}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyText(`ep-${ep.key}`, ep.url)}
                    className="p-1 rounded hover:bg-slate-100 text-slate-600 shrink-0 cursor-pointer"
                    title="Copy callback URL"
                  >
                    {copiedId === `ep-${ep.key}` ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Webhook Kind Filters */}
            <div className="flex flex-wrap items-center gap-1 font-mono text-[10px] pt-0.5">
              {(
                [
                  { id: 'ALL', label: `All Webhooks (${webhookCallbacks.length})` },
                  { id: 'MPESA_B2C_RESULT', label: 'B2C Result' },
                  { id: 'MPESA_B2C_TIMEOUT', label: 'B2C Timeout' },
                  { id: 'MPESA_B2B_RESULT', label: 'B2B Result' },
                  { id: 'MPESA_B2B_TIMEOUT', label: 'B2B Timeout' },
                  { id: 'MPESA_STK_CALLBACK', label: 'M-Pesa STK' },
                  { id: 'DCASH_CALLBACK', label: 'D Cash' },
                  { id: 'VALTEX_CALLBACK', label: 'Valtex' },
                  { id: 'PAYHERO_CALLBACK', label: 'PayHero' },
                  { id: 'KCB_CALLBACK', label: 'KCB App' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setWebhookKindFilter(tab.id)}
                  className={`px-2 py-1 rounded border font-bold cursor-pointer transition-colors ${
                    webhookKindFilter === tab.id
                      ? 'bg-[#0b1930] text-white border-[#0b1930]'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredWebhooks.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <p className="text-xs text-slate-600">
                No incoming M-Pesa B2C or D Cash webhook POST callbacks have reached the backend server yet.
              </p>
              <p className="text-[11px] text-slate-500">
                When Safaricom Daraja or D Cash posts to <span className="font-mono">/api/mpesa/b2c-result</span> or{' '}
                <span className="font-mono">/api/dcash/callback</span>, the raw JSON body will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredWebhooks.map((cb) => {
                const rawJson = formatRawPayload(cb);
                const isCollapsed = Boolean(collapsedWebhooks[cb.id]);
                return (
                  <div key={cb.id} className="p-3.5 space-y-2 hover:bg-slate-50/50 transition-colors">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                          <span className="text-slate-500 tabular-nums font-semibold">
                            {new Date(cb.receivedAt).toLocaleTimeString()}
                          </span>
                          {renderWebhookKindBadge(cb.kind)}
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-bold">
                            {cb.method} {cb.endpoint}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold ${
                              cb.matchedTransaction
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border border-amber-300'
                            }`}
                          >
                            {cb.matchedTransaction ? 'MATCHED TX' : 'UNMATCHED REF'}
                          </span>
                          {cb.resultCode !== undefined && (
                            <span className="px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200 font-semibold">
                              ResultCode: {String(cb.resultCode)}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-slate-500">
                          {cb.reference && <span>Ref: {cb.reference}</span>}
                          {cb.mpesaReceipt && (
                            <span className="text-emerald-700 font-bold">Receipt: {cb.mpesaReceipt}</span>
                          )}
                          <span>Source IP: {cb.sourceIp}</span>
                          <span className="truncate max-w-[220px]" title={cb.userAgent}>
                            UA: {cb.userAgent}
                          </span>
                          <span>Type: {cb.contentType}</span>
                        </div>

                        {cb.resultDesc && (
                          <p className="text-[11px] text-slate-800 font-medium">{cb.resultDesc}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 font-mono">
                        {renderPayloadStatusBadge(cb.rawPayload ?? cb.rawBodyText, cb.resultCode)}
                        <button
                          type="button"
                          onClick={() => handleCopyText(`wh-${cb.id}`, rawJson)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-semibold cursor-pointer"
                          title="Copy Raw Webhook JSON"
                        >
                          {copiedId === `wh-${cb.id}` ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>Copy Raw</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedWebhooks((prev) => ({
                              ...prev,
                              [cb.id]: !prev[cb.id],
                            }))
                          }
                          className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-semibold cursor-pointer"
                        >
                          <span>{isCollapsed ? 'Show JSON' : 'Hide JSON'}</span>
                          {isCollapsed ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronUp className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <pre className="p-2.5 rounded-lg bg-slate-900 text-emerald-300 font-mono text-[10px] overflow-x-auto leading-relaxed">
                        {rawJson}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* API & DERIV WS DIAGNOSTIC RESPONSE STREAM */}
      {(activeView === 'ALL' || activeView === 'RESPONSES') && (
        <>
          {/* Filters Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px]">
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  { id: 'ALL', label: `All (${mergedLogs.length})` },
                  { id: 'P2P', label: 'P2P' },
                  { id: 'D_CASH', label: 'D Cash' },
                  { id: 'VALTEX', label: 'Valtex' },
                  { id: 'PAYHERO', label: 'PayHero' },
                  { id: 'KCB_BANK', label: 'KCB App' },
                  { id: 'MPESA_B2C', label: 'M-Pesa B2C' },
                  { id: 'MPESA_B2B', label: 'M-Pesa B2B' },
                  { id: 'DERIV_SOURCE', label: 'Deriv WS' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setChannelFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-md border font-bold cursor-pointer transition-colors ${
                    channelFilter === tab.id
                      ? 'bg-[#0b1930] text-white border-[#0b1930]'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setOutcomeFilter('ALL')}
                className={`px-2 py-1 rounded-md border font-semibold cursor-pointer ${
                  outcomeFilter === 'ALL'
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                All Outcomes
              </button>
              <button
                type="button"
                onClick={() => setOutcomeFilter('ISSUES')}
                className={`px-2 py-1 rounded-md border font-semibold cursor-pointer ${
                  outcomeFilter === 'ISSUES'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-slate-50 text-rose-700 border-slate-200'
                }`}
              >
                Issues / Warnings ({issueCount})
              </button>
              <button
                type="button"
                onClick={() => setOutcomeFilter('HEALTHY')}
                className={`px-2 py-1 rounded-md border font-semibold cursor-pointer ${
                  outcomeFilter === 'HEALTHY'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-slate-50 text-emerald-700 border-slate-200'
                }`}
              >
                OK / Pending
              </button>
            </div>
          </div>

          {/* Diagnostic Log Stream */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between font-mono text-[10px] text-slate-500">
              <span>
                Showing {filteredLogs.length} response event{filteredLogs.length === 1 ? '' : 's'}
              </span>
              <span>
                {lastUpdated ? `Last synced ${new Date(lastUpdated).toLocaleTimeString()}` : 'Syncing...'}
              </span>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center space-y-2.5">
                <p className="text-xs text-slate-600">
                  No backend or Deriv WebSocket response events recorded yet for this filter.
                </p>
                <button
                  type="button"
                  onClick={handleRunLiveProbe}
                  disabled={isProbing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white font-mono text-[11px] font-bold cursor-pointer"
                >
                  <Wifi className="w-3.5 h-3.5 text-[#2bbbad]" />
                  <span>Run Gateway Probe Now</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredLogs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  return (
                    <div key={log.id} className="p-3 hover:bg-slate-50/70 transition-colors space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                            <span className="text-slate-400 tabular-nums">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold ${
                                log.source === 'DERIV_WS'
                                  ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {log.source === 'DERIV_WS' ? 'DERIV WS' : 'BACKEND'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-[#0b1930] text-white font-bold">
                              {log.channel}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold tabular-nums ${
                                log.httpStatus >= 400
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-slate-50 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {log.method} · {log.httpStatus}
                            </span>
                            <span className="text-slate-600 font-semibold truncate max-w-[260px]">
                              {log.endpoint}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-800 font-medium leading-relaxed">
                            {log.summary}
                          </p>

                          {(log.phoneOrTarget || log.usdAmount || log.reference) && (
                            <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-slate-500 tabular-nums">
                              {log.phoneOrTarget && <span>Target: {log.phoneOrTarget}</span>}
                              {typeof log.usdAmount === 'number' && log.usdAmount > 0 && (
                                <span>
                                  Amount: ${log.usdAmount.toFixed(2)}
                                  {log.kesAmount ? ` (KES ${log.kesAmount.toLocaleString()})` : ''}
                                </span>
                              )}
                              {log.reference && <span>Ref: {log.reference}</span>}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 font-mono">
                          {renderPayloadStatusBadge(log.responsePayload, log.outcome) ||
                            renderOutcomeBadge(log.outcome)}
                          {(log.outcome === 'WARNING' || log.outcome === 'UNCONFIGURED') &&
                            resolvePayloadStatusBadge(log.responsePayload, log.outcome) &&
                            renderOutcomeBadge(log.outcome)}

                          <button
                            type="button"
                            onClick={() => handleCopyJson(log)}
                            className="p-1.5 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 cursor-pointer"
                            title="Copy Diagnostic JSON"
                          >
                            {copiedId === log.id ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>

                          {log.responsePayload && (
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : log.id)}
                              className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-semibold cursor-pointer"
                            >
                              <span>Payload</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpanded && log.responsePayload && (
                        <pre className="p-2.5 rounded-lg bg-slate-900 text-emerald-300 font-mono text-[10px] overflow-x-auto leading-relaxed">
                          {JSON.stringify(log.responsePayload, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
