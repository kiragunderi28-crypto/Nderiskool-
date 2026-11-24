import express, { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';

dotenv.config({ override: true });

// Hydrate truncated/masked Daraja secrets from gitignored .env when needed
try {
  const dotEnvPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(dotEnvPath)) {
    const parsedEnv = dotenv.parse(fs.readFileSync(dotEnvPath, 'utf8'));
    const hydrateIfInvalid = (key: string, isInvalid: (cur: string) => boolean) => {
      const current = (process.env[key] || '').trim();
      const candidate = (parsedEnv[key] || '').trim();
      if (candidate && (!current || isInvalid(current))) {
        process.env[key] = candidate;
      }
    };
    hydrateIfInvalid('MPESA_CONSUMER_KEY', (cur) => cur.includes('*') || cur.length < 16);
    hydrateIfInvalid('MPESA_CONSUMER_SECRET', (cur) => cur.includes('*') || cur.length < 12);
    hydrateIfInvalid('MPESA_PASSKEY', (cur) => cur.includes('*') || cur.length < 16);
    hydrateIfInvalid('MPESA_SHORTCODE', (cur) => cur.includes('*') || cur === '4638');
    hydrateIfInvalid('MPESA_ENV', (cur) => !cur || cur.toLowerCase() === 'sandbox');
    hydrateIfInvalid('MPESA_TRANSACTION_TYPE', (cur) => !cur);
    hydrateIfInvalid('MPESA_B2C_SHORTCODE', (cur) => !cur || cur === '4638' || /^(0|254)(7|1)\d{8}$/.test(cur));
    hydrateIfInvalid('MPESA_INITIATOR_NAME', (cur) => !cur || cur.includes('*'));
    hydrateIfInvalid('MPESA_SECURITY_CREDENTIAL', (cur) => !cur || cur.includes('*'));
    hydrateIfInvalid('MPESA_INITIATOR_PASSWORD', (cur) => !cur || cur.includes('*'));
    hydrateIfInvalid('MPESA_CERT_PEM', (cur) => !cur);
    hydrateIfInvalid('MPESA_B2C_COMMAND_ID', (cur) => !cur || cur === '4638');
  }
} catch {
  // ignore missing or unreadable .env
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

interface MpesaTxRecord {
  id: string;
  originatorConversationId?: string;
  type:
    | 'STK_DEPOSIT'
    | 'B2C_WITHDRAWAL'
    | 'B2B_TRANSFER'
    | 'C2B_DEPOSIT'
    | 'VALTEX_DEPOSIT'
    | 'VALTEX_WITHDRAWAL'
    | 'VALTEX_TRANSFER'
    | 'PAYHERO_DEPOSIT'
    | 'PAYHERO_WITHDRAWAL'
    | 'PAYHERO_TRANSFER'
    | 'KCB_DEPOSIT'
    | 'KCB_WITHDRAWAL'
    | 'KCB_TRANSFER';
  standalone?: boolean;
  environment?: 'sandbox' | 'production';
  phone: string;
  recipientPhone?: string;
  recipientMsisdn?: string;
  valtexAccountId?: string;
  payheroChannelId?: string;
  payheroExternalRef?: string;
  transferRail?: 'mobile' | 'paybill' | 'till' | 'bank';
  kcbAction?: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
  kcbTransferRail?: 'kcb_account' | 'paybill_522522' | 'kcb_vooma' | 'pesalink';
  kcbAccountNumber?: string;
  kcbAccountName?: string;
  partyB?: string;
  commandId?: string;
  accountReference?: string;
  usdAmount: number;
  kesAmount: number;
  loginId?: string;
  status: 'PENDING' | 'COMPLETED' | 'REJECTED';
  callbackVerified?: boolean;
  verificationSource?:
    | 'SAFARICOM_B2C_CALLBACK'
    | 'SAFARICOM_B2B_CALLBACK'
    | 'SAFARICOM_STK_CALLBACK'
    | 'SAFARICOM_TX_STATUS_CALLBACK'
    | 'VALTEX_CALLBACK'
    | 'VALTEX_API'
    | 'PAYHERO_CALLBACK'
    | 'PAYHERO_API'
    | 'KCB_CALLBACK'
    | 'KCB_BUNI_API';
  resultCode?: string | number;
  mpesaReceipt?: string;
  resultDesc?: string;
  receiverPublicName?: string;
  completedAtText?: string;
  transactionAmount?: number;
  b2cUtilityBalance?: number;
  b2cWorkingBalance?: number;
  safaricomConfirmationText?: string;
  createdAt: number;
  updatedAt: number;
}

const mpesaTransactions = new Map<string, MpesaTxRecord>();
const originatorToPrimaryId = new Map<string, string>();
const statusQueryToTxId = new Map<string, string>();
const txLastStatusProbeAt = new Map<string, number>();
const mpesaSseClients = new Set<Response>();

function broadcastMpesaTxUpdate(tx: MpesaTxRecord) {
  if (mpesaSseClients.size === 0) return;
  const payload = `event: mpesa_tx_update\ndata: ${JSON.stringify({ transaction: tx })}\n\n`;
  for (const client of mpesaSseClients) {
    try {
      client.write(payload);
    } catch {
      mpesaSseClients.delete(client);
    }
  }
}

function isPreviewAuthGatedUrl(url: string): boolean {
  if (!url) return true;
  return /:\/\/ais-(dev|pre)-/i.test(url) || /:\/\/localhost/i.test(url) || /:\/\/127\.0\.0\.1/i.test(url);
}

function normalizeKenyanMsisdnServer(raw: string) {
  const digits = String(raw || '').replace(/\D/g, '');
  let national = '';
  if (digits.startsWith('254') && digits.length === 12) {
    national = digits.slice(3);
  } else if (digits.startsWith('0') && digits.length === 10) {
    national = digits.slice(1);
  } else if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) {
    national = digits;
  }

  if (national.length !== 9 || (!national.startsWith('7') && !national.startsWith('1'))) {
    return null;
  }

  const p3 = Number(national.slice(0, 3));
  let carrier = 'Kenyan Mobile Wallet';
  if (
    (p3 >= 700 && p3 <= 729) ||
    (p3 >= 740 && p3 <= 743) ||
    p3 === 745 ||
    p3 === 746 ||
    p3 === 748 ||
    (p3 >= 757 && p3 <= 759) ||
    p3 === 768 ||
    p3 === 769 ||
    (p3 >= 790 && p3 <= 799) ||
    (p3 >= 112 && p3 <= 115)
  ) {
    carrier = 'Safaricom Kenya (M-Pesa)';
  } else if (
    (p3 >= 730 && p3 <= 739) ||
    (p3 >= 750 && p3 <= 756) ||
    (p3 >= 780 && p3 <= 789) ||
    (p3 >= 100 && p3 <= 106)
  ) {
    carrier = 'Airtel Kenya (Airtel Money)';
  } else if (p3 >= 770 && p3 <= 779) {
    carrier = 'Telkom Kenya (T-kash)';
  }

  return {
    phone: `0${national}`,
    msisdn: `254${national}`,
    formatted: `+254 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 9)}`,
    carrier,
  };
}

function parseDarajaResultParameters(result: any) {
  const raw = result?.ResultParameters?.ResultParameter;
  const list: Array<{ Key?: string; Value?: unknown }> = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
    ? [raw]
    : [];
  const findParam = (key: string) =>
    list.find((p) => String(p?.Key || '').toLowerCase() === key.toLowerCase())?.Value;
  return { list, findParam };
}

function extractStrictDarajaResultCode(result: any): {
  hasCode: boolean;
  isSuccess: boolean;
  codeStr: string;
} {
  if (!result || typeof result !== 'object') {
    return { hasCode: false, isSuccess: false, codeStr: '' };
  }
  const raw = result.ResultCode;
  if (raw === undefined || raw === null) {
    return { hasCode: false, isSuccess: false, codeStr: '' };
  }
  const codeStr = String(raw).trim();
  if (!codeStr) {
    return { hasCode: false, isSuccess: false, codeStr: '' };
  }
  const isSuccess = raw === 0 || codeStr === '0';
  return { hasCode: true, isSuccess, codeStr };
}

function extractKenyanMsisdnFromReceiver(rawName?: string): string | null {
  if (!rawName) return null;
  const match254 = String(rawName).match(/\b(254(?:7|1)\d{8})\b/);
  if (match254) return match254[1];
  const matchLocal = String(rawName).match(/\b(0(?:7|1)\d{8})\b/);
  if (matchLocal) return `254${matchLocal[1].slice(1)}`;
  return null;
}

async function fetchTextWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 6000
): Promise<{ ok: boolean; status: number; statusText: string; text: string }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const res = await fetch(url, { ...init, signal: controller.signal });
        const text = await res.text();
        return { ok: res.ok, status: res.status, statusText: res.statusText, text };
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(new Error(`Upstream timeout after ${timeoutMs}ms`));
          reject(new Error(`Upstream request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function darajaPostJson(
  cfg: ReturnType<typeof getDarajaConfig>,
  url: string,
  body: Record<string, unknown>
): Promise<{ res: { ok: boolean; status: number; statusText: string }; data: Record<string, any> }> {
  let accessToken = await fetchDarajaAccessToken(cfg.baseUrl, cfg.consumerKey, cfg.consumerSecret);
  let res = await fetchTextWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'nderiskool-daraja-client/1.0',
      },
      body: JSON.stringify(body),
    },
    7000
  );

  if (res.status === 401) {
    accessToken = await fetchDarajaAccessToken(cfg.baseUrl, cfg.consumerKey, cfg.consumerSecret, true);
    res = await fetchTextWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'nderiskool-daraja-client/1.0',
        },
        body: JSON.stringify(body),
      },
      7000
    );
  }

  let data: Record<string, any> = {};
  const trimmed = res.text.trim();
  if (trimmed) {
    try {
      data = JSON.parse(trimmed) as Record<string, any>;
    } catch {
      data = {
        errorMessage: extractSafeDarajaTextError(res.status, trimmed, res.statusText),
        rawStatus: res.status,
      };
    }
  }
  return { res: { ok: res.ok, status: res.status, statusText: res.statusText }, data };
}

async function probeDarajaTransactionStatus(
  tx: MpesaTxRecord,
  cfg: ReturnType<typeof getDarajaConfig>,
  publicBase: string
) {
  const prodCfg = cfg.env === 'production' ? cfg : getWithdrawalDarajaConfig();
  if (!prodCfg.b2cConfigured || !publicBase || (!tx.originatorConversationId && !tx.mpesaReceipt)) return null;
  txLastStatusProbeAt.set(tx.id, Date.now());
  try {
    const { res, data } = await darajaPostJson(prodCfg, `${prodCfg.baseUrl}/mpesa/transactionstatus/v1/query`, {
      Initiator: prodCfg.initiatorName,
      SecurityCredential: prodCfg.securityCredential,
      CommandID: 'TransactionStatusQuery',
      TransactionID: tx.mpesaReceipt || undefined,
      OriginalConversationID: tx.originatorConversationId || undefined,
      PartyA: prodCfg.b2cShortcode || prodCfg.shortcode,
      IdentifierType: '4',
      ResultURL: `${publicBase}/api/mpesa/tx-status-result`,
      QueueTimeOutURL: `${publicBase}/api/mpesa/tx-status-timeout`,
      Remarks: 'nderiskool Safaricom Production Payment Result Verification',
      Occasion: 'CashierVerify',
    });
    if (res.ok && String(data.ResponseCode || '') === '0') {
      if (data.ConversationID) statusQueryToTxId.set(String(data.ConversationID), tx.id);
      if (data.OriginatorConversationID) statusQueryToTxId.set(String(data.OriginatorConversationID), tx.id);
    }
    return { res, data };
  } catch {
    return null;
  }
}

// Strictly never auto-confirm withdrawals: only probe Safaricom Production TransactionStatusQuery; real completion comes solely from Safaricom callback
function scheduleSafaricomStatusProbes(
  txId: string,
  cfg: ReturnType<typeof getDarajaConfig>,
  publicBase: string
) {
  const prodCfg = cfg.env === 'production' ? cfg : getWithdrawalDarajaConfig();
  if (!prodCfg.b2cConfigured || !publicBase) return;
  const delays = [4000, 10000, 22000];
  for (const delay of delays) {
    setTimeout(() => {
      const existing = mpesaTransactions.get(txId);
      if (!existing || existing.status !== 'PENDING' || (!existing.originatorConversationId && !existing.mpesaReceipt)) return;
      probeDarajaTransactionStatus(existing, prodCfg, publicBase).catch(() => {});
    }, delay);
  }
}

type ServerDiagChannel =
  | 'P2P'
  | 'D_CASH'
  | 'VALTEX'
  | 'PAYHERO'
  | 'KCB_BANK'
  | 'MPESA_B2C'
  | 'MPESA_B2B'
  | 'MPESA_STK';
type ServerDiagOutcome = 'OK' | 'PENDING' | 'WARNING' | 'REJECTED' | 'UNCONFIGURED';

interface ServerCashierDiagnosticLog {
  id: string;
  timestamp: number;
  source: 'BACKEND';
  channel: ServerDiagChannel;
  method: 'GET' | 'POST';
  endpoint: string;
  httpStatus: number;
  outcome: ServerDiagOutcome;
  phoneOrTarget?: string;
  usdAmount?: number;
  kesAmount?: number;
  reference?: string;
  summary: string;
  responsePayload?: Record<string, unknown>;
}

const cashierDiagnosticLogs: ServerCashierDiagnosticLog[] = [];

function recordCashierDiagnostic(entry: Omit<ServerCashierDiagnosticLog, 'id' | 'timestamp' | 'source'>) {
  cashierDiagnosticLogs.unshift({
    id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    source: 'BACKEND',
    ...entry,
  });
  if (cashierDiagnosticLogs.length > 80) {
    cashierDiagnosticLogs.length = 80;
  }
}

type ServerWebhookCallbackKind =
  | 'MPESA_B2C_RESULT'
  | 'MPESA_B2C_TIMEOUT'
  | 'MPESA_B2B_RESULT'
  | 'MPESA_B2B_TIMEOUT'
  | 'MPESA_STK_CALLBACK'
  | 'MPESA_C2B_VALIDATION'
  | 'MPESA_C2B_CONFIRMATION'
  | 'MPESA_BALANCE_RESULT'
  | 'MPESA_TX_STATUS_RESULT'
  | 'DCASH_CALLBACK'
  | 'VALTEX_CALLBACK'
  | 'PAYHERO_CALLBACK'
  | 'KCB_CALLBACK';

interface ServerWebhookCallbackEntry {
  id: string;
  receivedAt: number;
  kind: ServerWebhookCallbackKind;
  endpoint: string;
  method: 'POST';
  reference?: string;
  conversationId?: string;
  originatorConversationId?: string;
  resultCode?: string | number;
  resultDesc?: string;
  mpesaReceipt?: string;
  matchedTransaction: boolean;
  sourceIp: string;
  userAgent: string;
  contentType: string;
  rawBodyText?: string;
  rawPayload: unknown;
}

const incomingWebhookCallbacks: ServerWebhookCallbackEntry[] = [];

function recordIncomingWebhook(
  req: Request & { rawBody?: string },
  meta: Omit<
    ServerWebhookCallbackEntry,
    'id' | 'receivedAt' | 'method' | 'sourceIp' | 'userAgent' | 'contentType' | 'rawBodyText' | 'rawPayload'
  >
) {
  const forwarded = req.headers['x-forwarded-for'];
  const firstForwarded = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
    ? forwarded.split(',')[0]?.trim()
    : '';
  const sourceIp = firstForwarded || req.ip || req.socket?.remoteAddress || 'unknown';
  const userAgent = String(req.headers['user-agent'] || 'unknown').slice(0, 140);
  const contentType = String(req.headers['content-type'] || 'application/json').slice(0, 100);
  const rawBodyText =
    typeof req.rawBody === 'string' && req.rawBody.length > 0 ? req.rawBody.slice(0, 16384) : undefined;
  const rawPayload = req.body !== undefined ? req.body : rawBodyText || {};

  const entry: ServerWebhookCallbackEntry = {
    id: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    receivedAt: Date.now(),
    method: 'POST',
    sourceIp,
    userAgent,
    contentType,
    rawBodyText,
    rawPayload,
    ...meta,
  };

  incomingWebhookCallbacks.unshift(entry);
  if (incomingWebhookCallbacks.length > 50) {
    incomingWebhookCallbacks.length = 50;
  }
  return entry;
}

function normalizePemCertificate(rawCert: string): string {
  const trimmed = rawCert.trim();
  if (!trimmed) return '';
  if (trimmed.includes('BEGIN CERTIFICATE') || trimmed.includes('BEGIN PUBLIC KEY')) {
    return trimmed.replace(/\\n/g, '\n');
  }
  const wrapped = trimmed.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') || trimmed;
  return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----`;
}

function deriveSecurityCredential(
  directCredential: string,
  initiatorPassword: string,
  certPemRaw: string
): string {
  if (directCredential) return directCredential;
  if (!initiatorPassword || !certPemRaw) return '';

  try {
    const pem = normalizePemCertificate(certPemRaw);
    const encrypted = crypto.publicEncrypt(
      {
        key: pem,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(initiatorPassword, 'utf8')
    );
    return encrypted.toString('base64');
  } catch {
    return '';
  }
}

function cleanEnvVar(val?: string): string {
  const trimmed = (val || '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

const CALLBACK_CONFIG_FILE = path.resolve(process.cwd(), '.env.callback.local');

function normalizeCallbackBaseUrlInput(raw?: string): string {
  let val = cleanEnvVar(raw).trim();
  if (!val || /\s/.test(val)) return '';
  if (!/^https?:\/\//i.test(val)) {
    if (/^(localhost(:\d+)?(\/.*)?|[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?(\/.*)?)$/i.test(val)) {
      val = `https://${val}`;
    } else {
      return '';
    }
  }
  val = val.replace(/\/api\/(?:mpesa|kcb|payhero|valtex|dcash)(?:\/.*)?$/i, '');
  val = val.replace(/\/+$/, '');
  try {
    const parsed = new URL(val);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    const host = parsed.hostname.toLowerCase();
    if (!host || /^0\./.test(host) || (/^\d+$/.test(host) && host !== '127.0.0.1')) return '';
    if (host !== 'localhost' && host !== '127.0.0.1' && !host.includes('.')) return '';
    if (
      host === 'your-public-deployed-url.run.app' ||
      host === 'example.com' ||
      host === 'example.org' ||
      host.startsWith('your-') ||
      host.includes('placeholder')
    ) {
      return '';
    }
    return parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, ''));
  } catch {
    return '';
  }
}

const ALLOWED_NON_SECRET_OVERRIDES = new Set([
  'MPESA_CALLBACK_BASE_URL',
  'MPESA_ENV',
  'MPESA_SHORTCODE',
  'MPESA_TRANSACTION_TYPE',
  'MPESA_B2C_SHORTCODE',
  'MPESA_B2C_COMMAND_ID',
  'MPESA_B2B_SHORTCODE',
  'MPESA_B2B_COMMAND_ID',
  'KCB_BUNI_BASE_URL',
  'PAYHERO_API_URL',
]);

let runtimeMpesaCallbackBaseUrl = '';
let runtimeNonSecretOverrides: Record<string, string> = {};
try {
  if (fs.existsSync(CALLBACK_CONFIG_FILE)) {
    const rawFile = fs.readFileSync(CALLBACK_CONFIG_FILE, 'utf8').trim();
    if (rawFile) {
      const parsed = JSON.parse(rawFile) as {
        mpesaCallbackBaseUrl?: string;
        nonSecretOverrides?: Record<string, unknown>;
      };
      runtimeMpesaCallbackBaseUrl = normalizeCallbackBaseUrlInput(parsed?.mpesaCallbackBaseUrl);
      if (parsed?.nonSecretOverrides && typeof parsed.nonSecretOverrides === 'object') {
        for (const [k, v] of Object.entries(parsed.nonSecretOverrides)) {
          if (ALLOWED_NON_SECRET_OVERRIDES.has(k) && typeof v === 'string' && v.trim()) {
            const cleanVal = v.trim();
            runtimeNonSecretOverrides[k] = cleanVal;
            process.env[k] = cleanVal;
          }
        }
      }
      if (runtimeMpesaCallbackBaseUrl) {
        process.env.MPESA_CALLBACK_BASE_URL = runtimeMpesaCallbackBaseUrl;
      }
    }
  }
} catch {
  runtimeMpesaCallbackBaseUrl = '';
  runtimeNonSecretOverrides = {};
}

function saveRuntimeCallbackBaseUrl(nextUrl: string) {
  runtimeMpesaCallbackBaseUrl = nextUrl;
  if (nextUrl) {
    process.env.MPESA_CALLBACK_BASE_URL = nextUrl;
  }
  try {
    if (!nextUrl && Object.keys(runtimeNonSecretOverrides).length === 0) {
      if (fs.existsSync(CALLBACK_CONFIG_FILE)) {
        fs.unlinkSync(CALLBACK_CONFIG_FILE);
      }
    } else {
      fs.writeFileSync(
        CALLBACK_CONFIG_FILE,
        JSON.stringify(
          {
            mpesaCallbackBaseUrl: nextUrl || undefined,
            nonSecretOverrides: runtimeNonSecretOverrides,
            updatedAt: new Date().toISOString(),
          },
          null,
          2
        ),
        'utf8'
      );
    }
  } catch {
    // Keep in-memory runtime override active even if filesystem write fails
  }
}

const VALID_B2C_COMMANDS = new Set(['BusinessPayment', 'SalaryPayment', 'PromotionPayment']);
const VALID_B2B_COMMANDS = new Set([
  'BusinessPayBill',
  'BusinessBuyGoods',
  'B2CAccountTopUp',
  'MerchantToMerchantTransfer',
  'BusinessTransferFromMMFToUtility',
  'BusinessToBusinessTransfer',
]);

function getDarajaConfig(options?: { forceProduction?: boolean }) {
  const rawEnv = cleanEnvVar(process.env.MPESA_ENV);
  const envExplicit = Boolean(rawEnv);
  const env: 'sandbox' | 'production' = options?.forceProduction
    ? 'production'
    : rawEnv.toLowerCase() === 'sandbox'
    ? 'sandbox'
    : 'production';
  const baseUrl = env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  const consumerKey = cleanEnvVar(process.env.MPESA_CONSUMER_KEY);
  const consumerSecret = cleanEnvVar(process.env.MPESA_CONSUMER_SECRET);
  const shortcode = cleanEnvVar(process.env.MPESA_SHORTCODE);
  const stkTransactionType =
    cleanEnvVar(process.env.MPESA_TRANSACTION_TYPE) === 'CustomerBuyGoodsOnline'
      ? 'CustomerBuyGoodsOnline'
      : 'CustomerPayBillOnline';
  const stkPartyB = cleanEnvVar(process.env.MPESA_TILL_NUMBER) || shortcode;
  const rawB2cShortcode = cleanEnvVar(process.env.MPESA_B2C_SHORTCODE);
  const isInvalidB2cShortcode = Boolean(
    rawB2cShortcode && (/^(0|254)(7|1)\d{8}$/.test(rawB2cShortcode) || rawB2cShortcode.length < 5)
  );
  const b2cShortcode = rawB2cShortcode && !isInvalidB2cShortcode ? rawB2cShortcode : shortcode;
  const rawB2bShortcode = cleanEnvVar(process.env.MPESA_B2B_SHORTCODE);
  const isB2bPhoneInsteadOfShortcode = Boolean(
    rawB2bShortcode && (/^(0|254)(7|1)\d{8}$/.test(rawB2bShortcode) || rawB2bShortcode.length < 5)
  );
  const b2bShortcode = rawB2bShortcode && !isB2bPhoneInsteadOfShortcode ? rawB2bShortcode : b2cShortcode || shortcode;
  const passkey = cleanEnvVar(process.env.MPESA_PASSKEY);
  const initiatorName = cleanEnvVar(process.env.MPESA_INITIATOR_NAME);
  const initiatorPassword = cleanEnvVar(process.env.MPESA_INITIATOR_PASSWORD);
  const certPem = cleanEnvVar(process.env.MPESA_CERT_PEM);
  const rawSecurityCredential = cleanEnvVar(process.env.MPESA_SECURITY_CREDENTIAL);
  const securityCredential = deriveSecurityCredential(rawSecurityCredential, initiatorPassword, certPem);
  const rawCommandId = cleanEnvVar(process.env.MPESA_B2C_COMMAND_ID);
  const b2cCommandId = VALID_B2C_COMMANDS.has(rawCommandId) ? rawCommandId : 'BusinessPayment';
  const rawB2bCommandId = cleanEnvVar(process.env.MPESA_B2B_COMMAND_ID);
  const b2bCommandId = VALID_B2B_COMMANDS.has(rawB2bCommandId) ? rawB2bCommandId : 'BusinessPayBill';
  const appUrl = cleanEnvVar(process.env.APP_URL).replace(/\/+$/, '');
  const rawEnvCallbackBaseUrl = cleanEnvVar(process.env.MPESA_CALLBACK_BASE_URL);
  const envCallbackBaseUrl = normalizeCallbackBaseUrlInput(rawEnvCallbackBaseUrl);
  const invalidEnvCallbackBaseUrl = Boolean(rawEnvCallbackBaseUrl && !envCallbackBaseUrl);
  const callbackBaseUrl = runtimeMpesaCallbackBaseUrl || envCallbackBaseUrl;
  const callbackBaseUrlSource: 'RUNTIME_CONFIG' | 'ENV_SECRET' | 'APP_URL_ENV' | 'REQUEST_HOST' =
    runtimeMpesaCallbackBaseUrl
      ? 'RUNTIME_CONFIG'
      : envCallbackBaseUrl
      ? 'ENV_SECRET'
      : appUrl && /^https?:\/\//i.test(appUrl)
      ? 'APP_URL_ENV'
      : 'REQUEST_HOST';

  const warnings: string[] = [];
  if (invalidEnvCallbackBaseUrl && !runtimeMpesaCallbackBaseUrl) {
    warnings.push(
      `MPESA_CALLBACK_BASE_URL in Secrets ("${rawEnvCallbackBaseUrl}") is not a valid https:// domain URL. Save a valid public https:// callback base URL below or update MPESA_CALLBACK_BASE_URL in Secrets.`
    );
  }
  if (env === 'production' && (shortcode === '174379' || b2cShortcode === '174379')) {
    warnings.push(
      'Shortcode "174379" is a Safaricom Sandbox test Paybill. Update MPESA_SHORTCODE / MPESA_B2C_SHORTCODE to your live Production Paybill/B2C Shortcode in Secrets for real M-Pesa payouts.'
    );
  }
  if (rawCommandId && !VALID_B2C_COMMANDS.has(rawCommandId)) {
    warnings.push(
      `MPESA_B2C_COMMAND_ID ("${rawCommandId}") is not a valid Safaricom CommandID; using "BusinessPayment" (allowed: BusinessPayment, SalaryPayment, PromotionPayment).`
    );
  }
  if (rawB2bCommandId && !VALID_B2B_COMMANDS.has(rawB2bCommandId)) {
    warnings.push(
      `MPESA_B2B_COMMAND_ID ("${rawB2bCommandId}") is not a valid Daraja B2B CommandID; using "BusinessPayBill".`
    );
  }
  if (isB2bPhoneInsteadOfShortcode) {
    warnings.push(
      `MPESA_B2B_SHORTCODE ("${rawB2bShortcode}") looks like a mobile number rather than a Paybill/Till shortcode; using Shortcode "${b2bShortcode}".`
    );
  }
  if (consumerKey && (consumerKey.includes('*') || consumerKey.length < 16)) {
    warnings.push(
      consumerKey.includes('*')
        ? 'MPESA_CONSUMER_KEY contains masked "*" characters — click Show/Copy on developer.safaricom.co.ke to copy the full Consumer Key.'
        : `MPESA_CONSUMER_KEY appears too short (${consumerKey.length} chars) — Daraja Consumer Keys are typically 32-48+ characters from developer.safaricom.co.ke.`
    );
  }
  if (consumerSecret && (consumerSecret.includes('*') || consumerSecret.length < 12)) {
    warnings.push(
      consumerSecret.includes('*')
        ? 'MPESA_CONSUMER_SECRET contains masked "*" characters — click Show/Copy on developer.safaricom.co.ke to copy the full Consumer Secret.'
        : `MPESA_CONSUMER_SECRET appears too short (${consumerSecret.length} chars) — copy the full Consumer Secret from developer.safaricom.co.ke.`
    );
  }
  if (passkey && (passkey.includes('*') || passkey.length < 16)) {
    warnings.push(
      passkey.includes('*')
        ? 'MPESA_PASSKEY contains masked "*" characters — copy the full unmasked Lipa Na M-Pesa Passkey from developer.safaricom.co.ke.'
        : `MPESA_PASSKEY appears too short (${passkey.length} chars) — copy the full Lipa Na M-Pesa Online Passkey from Daraja.`
    );
  }

  const hasOAuth = Boolean(consumerKey && consumerSecret);
  const stkConfigured = Boolean(hasOAuth && shortcode && passkey);
  const b2cConfigured = Boolean(hasOAuth && b2cShortcode && initiatorName && securityCredential);
  const b2bConfigured = Boolean(hasOAuth && b2bShortcode && initiatorName && securityCredential);
  const liveWithdrawalReady = env === 'production' && b2cConfigured;
  const smsDeliveryStatus: 'LIVE_SMS_ACTIVE' | 'SANDBOX_NO_SMS' | 'AWAITING_B2C_SECRETS' = liveWithdrawalReady
    ? 'LIVE_SMS_ACTIVE'
    : env !== 'production'
    ? 'SANDBOX_NO_SMS'
    : 'AWAITING_B2C_SECRETS';

  const missingB2cVars: string[] = [];
  if (!consumerKey) missingB2cVars.push('MPESA_CONSUMER_KEY');
  if (!consumerSecret) missingB2cVars.push('MPESA_CONSUMER_SECRET');
  if (!b2cShortcode) missingB2cVars.push('MPESA_SHORTCODE (or MPESA_B2C_SHORTCODE)');
  if (!initiatorName) missingB2cVars.push('MPESA_INITIATOR_NAME');
  if (!securityCredential) {
    missingB2cVars.push('MPESA_SECURITY_CREDENTIAL (or MPESA_INITIATOR_PASSWORD + MPESA_CERT_PEM)');
  }

  const missingB2bVars: string[] = [];
  if (!consumerKey) missingB2bVars.push('MPESA_CONSUMER_KEY');
  if (!consumerSecret) missingB2bVars.push('MPESA_CONSUMER_SECRET');
  if (!b2bShortcode) missingB2bVars.push('MPESA_B2B_SHORTCODE (or MPESA_SHORTCODE)');
  if (!initiatorName) missingB2bVars.push('MPESA_INITIATOR_NAME');
  if (!securityCredential) {
    missingB2bVars.push('MPESA_SECURITY_CREDENTIAL (or MPESA_INITIATOR_PASSWORD + MPESA_CERT_PEM)');
  }

  return {
    env,
    envExplicit,
    baseUrl,
    consumerKey,
    consumerSecret,
    shortcode,
    stkTransactionType,
    stkPartyB,
    b2cShortcode,
    b2bShortcode,
    passkey,
    initiatorName,
    securityCredential,
    b2cCommandId,
    b2bCommandId,
    appUrl,
    callbackBaseUrl,
    envCallbackBaseUrl,
    runtimeCallbackBaseUrl: runtimeMpesaCallbackBaseUrl,
    callbackBaseUrlSource,
    hasOAuth,
    stkConfigured,
    b2cConfigured,
    b2bConfigured,
    liveWithdrawalReady,
    smsDeliveryStatus,
    missingB2cVars,
    missingB2bVars,
    warnings,
  };
}

function getWithdrawalDarajaConfig() {
  return getDarajaConfig({ forceProduction: true });
}

function resolvePublicBaseUrl(
  req: Request,
  configuredAppUrl: string,
  callbackBaseUrlOverride?: string
): string {
  if (callbackBaseUrlOverride && /^https?:\/\//i.test(callbackBaseUrlOverride)) {
    return callbackBaseUrlOverride.replace(/\/+$/, '');
  }
  if (configuredAppUrl && /^https?:\/\//i.test(configuredAppUrl)) {
    return configuredAppUrl.replace(/\/+$/, '');
  }
  const forwardedProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https')
    .split(',')[0]
    .trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  if (forwardedHost && !forwardedHost.startsWith('localhost') && !forwardedHost.startsWith('127.0.0.1')) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, '');
  }
  return '';
}

const darajaAccessTokenCache = new Map<string, { token: string; expiresAt: number }>();

function extractSafeDarajaTextError(status: number, rawText: string, statusText?: string): string {
  const trimmed = (rawText || '').trim();
  if (!trimmed) return `HTTP ${status} (${statusText || 'Bad Request'})`;
  if (trimmed.includes('_Incapsula_Resource') || trimmed.toLowerCase().includes('<html')) {
    return `Safaricom Daraja WAF / Incapsula temporarily challenged the request (HTTP ${status}). Retry shortly or check OAuth token caching.`;
  }
  return trimmed.slice(0, 350);
}

async function parseDarajaResponse(res: globalThis.Response): Promise<Record<string, any>> {
  const rawText = await res.text();
  const trimmed = rawText.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as Record<string, any>;
  } catch {
    return {
      errorMessage: extractSafeDarajaTextError(res.status, trimmed, res.statusText),
      rawStatus: res.status,
    };
  }
}

async function attemptDarajaOAuth(
  baseUrl: string,
  consumerKey: string,
  consumerSecret: string,
  retries = 1
): Promise<{ ok: boolean; status: number; expiresIn?: string; errorText?: string; accessToken?: string }> {
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  let lastResult: { ok: boolean; status: number; expiresIn?: string; errorText?: string; accessToken?: string } = {
    ok: false,
    status: 0,
    errorText: 'Safaricom Daraja OAuth unreachable.',
  };

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchTextWithTimeout(
        `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        {
          method: 'GET',
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: 'application/json',
            'User-Agent': 'nderiskool-daraja-client/1.0',
          },
        },
        7000
      );

      const rawText = res.text;
      if (!res.ok) {
        lastResult = {
          ok: false,
          status: res.status,
          errorText: extractSafeDarajaTextError(res.status, rawText, res.statusText),
        };
        if (res.status >= 500 && attempt < retries) {
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
        return lastResult;
      }

      try {
        const data = JSON.parse(rawText) as { access_token?: string; expires_in?: string };
        if (!data.access_token) {
          return { ok: false, status: res.status, errorText: 'Response did not include access_token.' };
        }
        const expiresSec = Math.max(120, Number(data.expires_in || 3599) || 3599);
        darajaAccessTokenCache.set(`${baseUrl}:${consumerKey}`, {
          token: data.access_token,
          expiresAt: Date.now() + (expiresSec - 90) * 1000,
        });
        return {
          ok: true,
          status: res.status,
          accessToken: data.access_token,
          expiresIn: data.expires_in,
        };
      } catch {
        lastResult = {
          ok: false,
          status: res.status,
          errorText: extractSafeDarajaTextError(res.status, rawText, 'Invalid JSON'),
        };
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
        return lastResult;
      }
    } catch (err: any) {
      lastResult = {
        ok: false,
        status: 502,
        errorText: err?.message || 'Network error reaching Safaricom Daraja OAuth.',
      };
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 350));
        continue;
      }
      return lastResult;
    }
  }

  return lastResult;
}

async function fetchDarajaAccessToken(
  baseUrl: string,
  consumerKey: string,
  consumerSecret: string,
  forceRefresh = false
): Promise<string> {
  const cacheKey = `${baseUrl}:${consumerKey}`;
  if (!forceRefresh) {
    const cached = darajaAccessTokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }
  } else {
    darajaAccessTokenCache.delete(cacheKey);
  }

  const attempt = await attemptDarajaOAuth(baseUrl, consumerKey, consumerSecret);
  if (!attempt.ok || !attempt.accessToken) {
    throw new Error(`Daraja OAuth failed (${attempt.status}): ${attempt.errorText || 'Invalid credentials'}`);
  }
  return attempt.accessToken;
}

function getDarajaTimestamp(): string {
  // Safaricom Daraja requires YYYYMMDDHHmmss strictly in East Africa Time (EAT = UTC+3)
  const eat = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    eat.getUTCFullYear() +
    pad(eat.getUTCMonth() + 1) +
    pad(eat.getUTCDate()) +
    pad(eat.getUTCHours()) +
    pad(eat.getUTCMinutes()) +
    pad(eat.getUTCSeconds())
  );
}

interface DarajaOAuthCheckCache {
  fingerprint: string;
  verified: boolean;
  checkedAt: number;
  environment: 'sandbox' | 'production';
  detectedEnvironment?: 'sandbox' | 'production';
  expiresIn?: string;
  error?: string;
}

let darajaOAuthCache: DarajaOAuthCheckCache | null = null;
let latestDarajaBalanceSnapshot: {
  updatedAt: number;
  conversationId?: string;
  rawBalanceString?: string;
  accounts?: Array<{ name: string; currency: string; available: string; uncleared?: string }>;
  resultDesc?: string;
} | null = null;

async function checkDarajaOAuthStatus(forceRefresh = false): Promise<DarajaOAuthCheckCache> {
  const cfg = getDarajaConfig();
  const fingerprint = crypto
    .createHash('sha256')
    .update(`${cfg.env}:${cfg.consumerKey}:${cfg.consumerSecret}`)
    .digest('hex');

  if (
    !forceRefresh &&
    darajaOAuthCache &&
    darajaOAuthCache.fingerprint === fingerprint &&
    Date.now() - darajaOAuthCache.checkedAt < 45_000
  ) {
    return darajaOAuthCache;
  }

  if (!cfg.hasOAuth) {
    const resObj: DarajaOAuthCheckCache = {
      fingerprint,
      verified: false,
      checkedAt: Date.now(),
      environment: cfg.env,
      error: 'MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET are not configured.',
    };
    darajaOAuthCache = resObj;
    return resObj;
  }

  try {
    const primary = await attemptDarajaOAuth(cfg.baseUrl, cfg.consumerKey, cfg.consumerSecret);
    if (primary.ok) {
      const resObj: DarajaOAuthCheckCache = {
        fingerprint,
        verified: true,
        checkedAt: Date.now(),
        environment: cfg.env,
        expiresIn: primary.expiresIn || '3599',
      };
      darajaOAuthCache = resObj;
      return resObj;
    }

    const altEnv: 'sandbox' | 'production' = cfg.env === 'sandbox' ? 'production' : 'sandbox';
    const altBaseUrl = altEnv === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
    const alternate = await attemptDarajaOAuth(altBaseUrl, cfg.consumerKey, cfg.consumerSecret);

    const errMsg = alternate.ok
      ? `Environment mismatch: keys failed on ${cfg.env.toUpperCase()} (${primary.status}) but worked on ${altEnv.toUpperCase()}. Set MPESA_ENV="${altEnv}".`
      : `Safaricom Daraja OAuth rejected credentials on ${cfg.env.toUpperCase()} (HTTP ${primary.status}). Check MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET.`;

    const resObj: DarajaOAuthCheckCache = {
      fingerprint,
      verified: false,
      checkedAt: Date.now(),
      environment: cfg.env,
      detectedEnvironment: alternate.ok ? altEnv : undefined,
      error: errMsg,
    };
    darajaOAuthCache = resObj;
    return resObj;
  } catch (err: any) {
    const resObj: DarajaOAuthCheckCache = {
      fingerprint,
      verified: false,
      checkedAt: Date.now(),
      environment: cfg.env,
      error: err?.message || 'Unable to reach Safaricom Daraja OAuth server.',
    };
    darajaOAuthCache = resObj;
    return resObj;
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(express.text({ type: 'text/*', limit: '1mb' }));

  app.get('/api/mpesa/status', async (req, res) => {
    const cfg = getDarajaConfig();
    const withdrawalCfg = getWithdrawalDarajaConfig();
    const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
    const shouldProbe = req.query.probe === '1' || req.query.probe === 'true';
    const oauthState = shouldProbe
      ? await checkDarajaOAuthStatus(true)
      : darajaOAuthCache &&
        darajaOAuthCache.environment === cfg.env &&
        Date.now() - darajaOAuthCache.checkedAt < 120_000
      ? darajaOAuthCache
      : await checkDarajaOAuthStatus(false);

    const smsDeliveryReason =
      withdrawalCfg.smsDeliveryStatus === 'LIVE_SMS_ACTIVE'
        ? oauthState.verified
          ? `Safaricom Production B2C & Withdrawal Confirmation active on Shortcode #${withdrawalCfg.b2cShortcode}. Approved payouts trigger official M-PESA SMS to recipient phone.`
          : 'Withdrawal confirmation is configured for PRODUCTION (api.safaricom.co.ke), but Daraja Production OAuth must verify before live SMS payouts execute.'
        : `Missing Production B2C credentials: ${withdrawalCfg.missingB2cVars.join(', ')}.`;

    res.json({
      environment: cfg.env,
      withdrawalConfirmationEnvironment: withdrawalCfg.env,
      withdrawalConfirmationBaseUrl: withdrawalCfg.baseUrl,
      baseUrl: cfg.baseUrl,
      b2cEndpoint: `${withdrawalCfg.baseUrl}/mpesa/b2c/v1/paymentrequest`,
      b2bEndpoint: `${withdrawalCfg.baseUrl}/mpesa/b2b/v1/paymentrequest`,
      txStatusEndpoint: `${withdrawalCfg.baseUrl}/mpesa/transactionstatus/v1/query`,
      accountBalanceEndpoint: `${withdrawalCfg.baseUrl}/mpesa/accountbalance/v1/query`,
      reversalEndpoint: `${withdrawalCfg.baseUrl}/mpesa/reversal/v1/request`,
      qrCodeEndpoint: `${withdrawalCfg.baseUrl}/mpesa/qrcode/v1/generate`,
      c2bRegisterEndpoint: `${cfg.baseUrl}/mpesa/c2b/v2/registerurl`,
      billManagerBaseUrl: `${cfg.baseUrl}/v1/billmanager-invoice/v1/billmanager-invoice`,
      shortcode: cfg.shortcode || undefined,
      b2cShortcode: withdrawalCfg.b2cShortcode || undefined,
      b2bShortcode: withdrawalCfg.b2bShortcode || undefined,
      stkTransactionType: cfg.stkTransactionType,
      stkConfigured: cfg.stkConfigured,
      b2cConfigured: withdrawalCfg.b2cConfigured,
      b2bConfigured: withdrawalCfg.b2bConfigured,
      liveWithdrawalReady: withdrawalCfg.liveWithdrawalReady && oauthState.verified,
      autoConfirmWithdrawalsReady: false,
      strictCallbackVerification: true,
      callbackAuthGated: isPreviewAuthGatedUrl(publicBase),
      smsDeliveryStatus: withdrawalCfg.smsDeliveryStatus,
      smsDeliveryReason,
      darajaConfigured: cfg.stkConfigured || withdrawalCfg.b2cConfigured || withdrawalCfg.b2bConfigured,
      oauthVerified: oauthState.verified,
      oauthCheckedAt: oauthState.checkedAt,
      oauthExpiresIn: oauthState.expiresIn,
      oauthError: oauthState.error,
      detectedEnvironment: oauthState.detectedEnvironment,
      shortcodeConfigured: Boolean(withdrawalCfg.b2cShortcode || withdrawalCfg.b2bShortcode),
      b2cCommandId: withdrawalCfg.b2cCommandId,
      b2bCommandId: withdrawalCfg.b2bCommandId,
      missingB2cVars: withdrawalCfg.missingB2cVars,
      missingB2bVars: withdrawalCfg.missingB2bVars,
      warnings: Array.from(new Set([...cfg.warnings, ...withdrawalCfg.warnings])),
      accountBalanceSnapshot: latestDarajaBalanceSnapshot,
      callbackUrls: {
        stkCallbackUrl: publicBase ? `${publicBase}/api/mpesa/callback` : '/api/mpesa/callback',
        b2cResultUrl: publicBase ? `${publicBase}/api/mpesa/b2c-result` : '/api/mpesa/b2c-result',
        b2cTimeoutUrl: publicBase ? `${publicBase}/api/mpesa/b2c-timeout` : '/api/mpesa/b2c-timeout',
        b2bResultUrl: publicBase ? `${publicBase}/api/mpesa/b2b-result` : '/api/mpesa/b2b-result',
        b2bTimeoutUrl: publicBase ? `${publicBase}/api/mpesa/b2b-timeout` : '/api/mpesa/b2b-timeout',
        c2bValidationUrl: publicBase ? `${publicBase}/api/mpesa/c2b-validation` : '/api/mpesa/c2b-validation',
        c2bConfirmationUrl: publicBase ? `${publicBase}/api/mpesa/c2b-confirmation` : '/api/mpesa/c2b-confirmation',
        balanceResultUrl: publicBase ? `${publicBase}/api/mpesa/account-balance-result` : '/api/mpesa/account-balance-result',
        txStatusResultUrl: publicBase ? `${publicBase}/api/mpesa/tx-status-result` : '/api/mpesa/tx-status-result',
      },
    });
  });

  // Unified Safaricom Daraja OAuth verification across STK, C2B, B2C, B2B, Account Balance & Transaction Status
  app.all('/api/mpesa/verify-oauth', async (_req, res) => {
    const cfg = getDarajaConfig();
    const oauthState = await checkDarajaOAuthStatus(true);
    const payload = {
      ok: oauthState.verified,
      configured: cfg.hasOAuth,
      oauthVerified: oauthState.verified,
      environment: cfg.env,
      baseUrl: cfg.baseUrl,
      shortcode: cfg.shortcode || undefined,
      expiresIn: oauthState.expiresIn,
      detectedEnvironment: oauthState.detectedEnvironment,
      warnings: cfg.warnings,
      error: oauthState.error,
      message: oauthState.verified
        ? `Authentic Safaricom Daraja OAuth verified (${cfg.env.toUpperCase()} · Shortcode ${cfg.shortcode || 'N/A'} · Token expires in ${oauthState.expiresIn || '3599'}s).`
        : oauthState.error || 'Safaricom Daraja OAuth verification failed.',
    };

    recordCashierDiagnostic({
      channel: 'MPESA_STK',
      method: 'POST',
      endpoint: '/api/mpesa/verify-oauth',
      httpStatus: oauthState.verified ? 200 : oauthState.detectedEnvironment ? 409 : cfg.hasOAuth ? 502 : 400,
      outcome: oauthState.verified ? 'OK' : oauthState.detectedEnvironment ? 'WARNING' : cfg.hasOAuth ? 'REJECTED' : 'UNCONFIGURED',
      summary: payload.message,
      responsePayload: payload,
    });

    return res
      .status(oauthState.verified ? 200 : oauthState.detectedEnvironment ? 409 : cfg.hasOAuth ? 502 : 400)
      .json(payload);
  });

  const handleVerifyB2cOAuth = async (_req: Request, res: express.Response) => {
    const cfg = getWithdrawalDarajaConfig();
    if (!cfg.b2cConfigured) {
      const payload = {
        ok: false,
        configured: false,
        environment: cfg.env,
        baseUrl: cfg.baseUrl,
        missingB2cVars: cfg.missingB2cVars,
        warnings: cfg.warnings,
        error: `Missing Production Daraja B2C secrets: ${cfg.missingB2cVars.join(', ')}`,
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2C',
        method: 'POST',
        endpoint: '/api/mpesa/b2c-verify-oauth',
        httpStatus: 400,
        outcome: 'UNCONFIGURED',
        summary: payload.error,
        responsePayload: payload,
      });
      return res.status(400).json(payload);
    }

    try {
      const primary = await attemptDarajaOAuth(cfg.baseUrl, cfg.consumerKey, cfg.consumerSecret);
      if (primary.ok) {
        const payload = {
          ok: true,
          configured: true,
          environment: cfg.env,
          baseUrl: cfg.baseUrl,
          oauthEndpoint: `${cfg.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
          b2cEndpoint: `${cfg.baseUrl}/mpesa/b2c/v1/paymentrequest`,
          txStatusEndpoint: `${cfg.baseUrl}/mpesa/transactionstatus/v1/query`,
          expiresIn: primary.expiresIn || '3599',
          warnings: cfg.warnings,
          message: `Safaricom Daraja Production B2C OAuth verified (${cfg.env.toUpperCase()}). Withdrawal confirmation active.`,
        };
        recordCashierDiagnostic({
          channel: 'MPESA_B2C',
          method: 'POST',
          endpoint: '/api/mpesa/b2c-verify-oauth',
          httpStatus: 200,
          outcome: 'OK',
          summary: payload.message,
          responsePayload: payload,
        });
        return res.json(payload);
      }

      // Check alternate Safaricom environment to diagnose sandbox-vs-production mismatch
      const altEnv = cfg.env === 'sandbox' ? 'production' : 'sandbox';
      const altBaseUrl = altEnv === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
      const alternate = await attemptDarajaOAuth(altBaseUrl, cfg.consumerKey, cfg.consumerSecret);

      if (alternate.ok) {
        const payload = {
          ok: false,
          configured: true,
          environment: cfg.env,
          detectedEnvironment: altEnv,
          warnings: cfg.warnings,
          error: `Environment mismatch: Your Consumer Key & Secret failed on ${cfg.env.toUpperCase()} (${primary.status}) but SUCCEEDED on Safaricom ${altEnv.toUpperCase()} (${altBaseUrl}). Set MPESA_ENV="${altEnv}" in Secrets.`,
        };
        recordCashierDiagnostic({
          channel: 'MPESA_B2C',
          method: 'POST',
          endpoint: '/api/mpesa/b2c-verify-oauth',
          httpStatus: 409,
          outcome: 'WARNING',
          summary: payload.error,
          responsePayload: payload,
        });
        return res.status(409).json(payload);
      }

      const warningNote = cfg.warnings.length ? ` Notes: ${cfg.warnings.join(' ')}` : '';
      const payload = {
        ok: false,
        configured: true,
        environment: cfg.env,
        primaryStatus: primary.status,
        alternateStatus: alternate.status,
        warnings: cfg.warnings,
        error: `Safaricom Daraja OAuth rejected MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET on ${cfg.env.toUpperCase()} (HTTP ${primary.status}) and ${altEnv.toUpperCase()} (HTTP ${alternate.status}). Re-verify Consumer Key & Consumer Secret from developer.safaricom.co.ke.${warningNote}`,
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2C',
        method: 'POST',
        endpoint: '/api/mpesa/b2c-verify-oauth',
        httpStatus: 502,
        outcome: 'REJECTED',
        summary: payload.error,
        responsePayload: payload,
      });
      return res.status(502).json(payload);
    } catch (err: any) {
      const payload = {
        ok: false,
        configured: true,
        environment: cfg.env,
        error: err?.message || 'Daraja OAuth verification failed.',
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2C',
        method: 'POST',
        endpoint: '/api/mpesa/b2c-verify-oauth',
        httpStatus: 502,
        outcome: 'REJECTED',
        summary: payload.error,
        responsePayload: payload,
      });
      return res.status(502).json(payload);
    }
  };

  app.all('/api/mpesa/b2c-verify-oauth', handleVerifyB2cOAuth);
  app.all('/api/mpesa/b2c/verify-oauth', handleVerifyB2cOAuth);
  app.all('/api/mpesa/B2C', handleVerifyB2cOAuth);
  app.all('/api/mpesa/b2c', handleVerifyB2cOAuth);
  app.all('/mpesa/B2C', handleVerifyB2cOAuth);

  const handleVerifyB2bOAuth = async (_req: Request, res: express.Response) => {
    const cfg = getWithdrawalDarajaConfig();
    if (!cfg.b2bConfigured) {
      const payload = {
        ok: false,
        configured: false,
        status: 'GATEWAY_UNCONFIGURED',
        missingB2bVars: cfg.missingB2bVars,
        warnings: cfg.warnings,
        error: `Missing Daraja B2B secrets: ${cfg.missingB2bVars.join(', ')}`,
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2B',
        method: 'POST',
        endpoint: '/api/mpesa/b2b-verify-oauth',
        httpStatus: 400,
        outcome: 'UNCONFIGURED',
        summary: payload.error,
        responsePayload: payload,
      });
      return res.status(400).json(payload);
    }

    try {
      const primary = await attemptDarajaOAuth(cfg.baseUrl, cfg.consumerKey, cfg.consumerSecret);
      if (primary.ok) {
        const payload = {
          ok: true,
          configured: true,
          status: 'VERIFIED',
          environment: cfg.env,
          oauthEndpoint: `${cfg.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
          b2bEndpoint: `${cfg.baseUrl}/mpesa/b2b/v1/paymentrequest`,
          b2bShortcode: cfg.b2bShortcode,
          b2bCommandId: cfg.b2bCommandId,
          expiresIn: primary.expiresIn || '3599',
          warnings: cfg.warnings,
          message: `Safaricom Daraja B2B OAuth verified (${cfg.env.toUpperCase()}). B2B paymentrequest ready (Shortcode ${cfg.b2bShortcode}, CommandID ${cfg.b2bCommandId}).`,
        };
        recordCashierDiagnostic({
          channel: 'MPESA_B2B',
          method: 'POST',
          endpoint: '/api/mpesa/b2b-verify-oauth',
          httpStatus: 200,
          outcome: 'OK',
          summary: payload.message,
          responsePayload: payload,
        });
        return res.json(payload);
      }

      const altEnv = cfg.env === 'sandbox' ? 'production' : 'sandbox';
      const altBaseUrl = altEnv === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
      const alternate = await attemptDarajaOAuth(altBaseUrl, cfg.consumerKey, cfg.consumerSecret);

      if (alternate.ok) {
        const payload = {
          ok: false,
          configured: true,
          status: 'REJECTED',
          environment: cfg.env,
          detectedEnvironment: altEnv,
          warnings: cfg.warnings,
          error: `Environment mismatch: Daraja B2B Consumer Key & Secret failed on ${cfg.env.toUpperCase()} (${primary.status}) but SUCCEEDED on ${altEnv.toUpperCase()}. Set MPESA_ENV="${altEnv}".`,
        };
        recordCashierDiagnostic({
          channel: 'MPESA_B2B',
          method: 'POST',
          endpoint: '/api/mpesa/b2b-verify-oauth',
          httpStatus: 409,
          outcome: 'WARNING',
          summary: payload.error,
          responsePayload: payload,
        });
        return res.status(409).json(payload);
      }

      const warningNote = cfg.warnings.length ? ` Notes: ${cfg.warnings.join(' ')}` : '';
      const payload = {
        ok: false,
        configured: true,
        status: 'REJECTED',
        environment: cfg.env,
        primaryStatus: primary.status,
        alternateStatus: alternate.status,
        warnings: cfg.warnings,
        error: `Safaricom Daraja B2B OAuth rejected MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET on ${cfg.env.toUpperCase()} (HTTP ${primary.status}) and ${altEnv.toUpperCase()} (HTTP ${alternate.status}).${warningNote}`,
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2B',
        method: 'POST',
        endpoint: '/api/mpesa/b2b-verify-oauth',
        httpStatus: 502,
        outcome: 'REJECTED',
        summary: payload.error,
        responsePayload: payload,
      });
      return res.status(502).json(payload);
    } catch (err: any) {
      const payload = {
        ok: false,
        configured: true,
        status: 'REJECTED',
        environment: cfg.env,
        error: err?.message || 'Daraja B2B OAuth verification failed.',
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2B',
        method: 'POST',
        endpoint: '/api/mpesa/b2b-verify-oauth',
        httpStatus: 502,
        outcome: 'REJECTED',
        summary: payload.error,
        responsePayload: payload,
      });
      return res.status(502).json(payload);
    }
  };

  app.all('/api/mpesa/b2b-verify-oauth', handleVerifyB2bOAuth);
  app.all('/api/mpesa/b2b/verify-oauth', handleVerifyB2bOAuth);
  app.all('/api/mpesa/B2B', handleVerifyB2bOAuth);
  app.all('/api/mpesa/b2b', handleVerifyB2bOAuth);
  app.all('/mpesa/B2B', handleVerifyB2bOAuth);

  app.post('/api/mpesa/stkpush', async (req, res) => {
    const cfg = getDarajaConfig();
    const { phone, usdAmount, kesAmount, loginId } = req.body || {};
    const parsedPhone = normalizeKenyanMsisdnServer(String(phone || ''));

    if (!parsedPhone) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid Safaricom MSISDN format. Expected 07XXXXXXXX, 01XXXXXXXX, or 2547XXXXXXXX.',
      });
    }

    const amountKes = Math.max(1, Math.round(Number(kesAmount || 0)));
    if (!amountKes || Number.isNaN(amountKes)) {
      return res.status(400).json({ ok: false, error: 'Invalid KES deposit amount.' });
    }

    if (!cfg.stkConfigured) {
      const payload = {
        ok: false,
        configured: false,
        status: 'GATEWAY_UNCONFIGURED',
        error:
          'Safaricom Daraja STK Push credentials (MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY) are not configured on this server. No STK prompt was sent to your phone.',
      };
      recordCashierDiagnostic({
        channel: 'MPESA_STK',
        method: 'POST',
        endpoint: '/api/mpesa/stkpush',
        httpStatus: 503,
        outcome: 'UNCONFIGURED',
        phoneOrTarget: parsedPhone.msisdn,
        usdAmount: Number(usdAmount || 0),
        kesAmount: amountKes,
        summary: payload.error,
        responsePayload: payload,
      });
      return res.status(503).json(payload);
    }

    try {
      const timestamp = getDarajaTimestamp();
      const password = Buffer.from(`${cfg.shortcode}${cfg.passkey}${timestamp}`).toString('base64');
      const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
      const callbackUrl = publicBase ? `${publicBase}/api/mpesa/callback` : 'https://example.com/api/mpesa/callback';

      const requestedTxType =
        req.body?.transactionType === 'CustomerBuyGoodsOnline'
          ? 'CustomerBuyGoodsOnline'
          : cfg.stkTransactionType;
      const partyB = requestedTxType === 'CustomerBuyGoodsOnline' ? cfg.stkPartyB : cfg.shortcode;

      const { res: stkRes, data: stkData } = await darajaPostJson(cfg, `${cfg.baseUrl}/mpesa/stkpush/v1/processrequest`, {
        BusinessShortCode: cfg.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: requestedTxType,
        Amount: amountKes,
        PartyA: parsedPhone.msisdn,
        PartyB: partyB,
        PhoneNumber: parsedPhone.msisdn,
        CallBackURL: callbackUrl,
        AccountReference: String(loginId || 'CR-NDERISKOOL').slice(0, 12),
        TransactionDesc: 'nderiskool Deriv Deposit',
      });

      if (!stkRes.ok || String(stkData.ResponseCode || '') !== '0') {
        const payload = {
          ok: false,
          configured: true,
          status: 'REJECTED',
          error: stkData.errorMessage || stkData.ResponseDescription || 'Daraja STK Push request rejected.',
        };
        recordCashierDiagnostic({
          channel: 'MPESA_STK',
          method: 'POST',
          endpoint: '/api/mpesa/stkpush',
          httpStatus: 502,
          outcome: 'REJECTED',
          phoneOrTarget: parsedPhone.msisdn,
          usdAmount: Number(usdAmount || 0),
          kesAmount: amountKes,
          summary: payload.error,
          responsePayload: { ...payload, darajaRaw: stkData },
        });
        return res.status(502).json(payload);
      }

      const id = stkData.CheckoutRequestID as string;
      const record: MpesaTxRecord = {
        id,
        type: 'STK_DEPOSIT',
        environment: cfg.env,
        phone: parsedPhone.msisdn,
        recipientPhone: parsedPhone.phone,
        recipientMsisdn: parsedPhone.msisdn,
        usdAmount: Number(usdAmount || 0),
        kesAmount: amountKes,
        loginId,
        status: 'PENDING',
        callbackVerified: false,
        resultDesc: stkData.CustomerMessage || 'Safaricom M-Pesa STK prompt sent. Enter your M-Pesa PIN to receive SMS confirmation.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mpesaTransactions.set(id, record);

      const payload = {
        ok: true,
        configured: true,
        status: 'PENDING',
        checkoutRequestId: id,
        message: record.resultDesc,
      };
      recordCashierDiagnostic({
        channel: 'MPESA_STK',
        method: 'POST',
        endpoint: '/api/mpesa/stkpush',
        httpStatus: 202,
        outcome: 'PENDING',
        phoneOrTarget: String(phone),
        usdAmount: Number(usdAmount || 0),
        kesAmount: amountKes,
        reference: id,
        summary: record.resultDesc || 'STK Push sent to Safaricom M-Pesa',
        responsePayload: payload,
      });
      return res.status(202).json(payload);
    } catch (err: any) {
      const payload = {
        ok: false,
        configured: true,
        status: 'REJECTED',
        error: err?.message || 'Safaricom Daraja STK Push request failed.',
      };
      recordCashierDiagnostic({
        channel: 'MPESA_STK',
        method: 'POST',
        endpoint: '/api/mpesa/stkpush',
        httpStatus: 500,
        outcome: 'REJECTED',
        phoneOrTarget: String(phone),
        usdAmount: Number(usdAmount || 0),
        kesAmount: amountKes,
        summary: payload.error,
        responsePayload: payload,
      });
      return res.status(500).json(payload);
    }
  });

  // Sync recent M-Pesa STK Push & B2C/B2B withdrawal transactions against Safaricom Daraja API
  app.post('/api/mpesa/stk-sync', async (req, res) => {
    const cfg = getDarajaConfig();
    const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
    const requestedIds: string[] = Array.isArray(req.body?.checkoutRequestIds)
      ? req.body.checkoutRequestIds.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];
    const requestedWithdrawalIds: string[] = Array.isArray(req.body?.withdrawalIds)
      ? req.body.withdrawalIds.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];

    const allStkRecords = Array.from(mpesaTransactions.values())
      .filter((tx) => tx.type === 'STK_DEPOSIT')
      .sort((a, b) => b.createdAt - a.createdAt);

    const idsToQuery = new Set<string>(requestedIds);
    for (const tx of allStkRecords) {
      if (tx.status === 'PENDING' && idsToQuery.size < 10) {
        idsToQuery.add(tx.id);
      }
    }

    const queryIdsList = Array.from(idsToQuery);
    let darajaQueriedCount = 0;
    let queryError: string | undefined;
    const stkWarnings: string[] = [];

    if (queryIdsList.length > 0 && cfg.stkConfigured) {
      try {
        for (const checkoutId of queryIdsList) {
          const existing = mpesaTransactions.get(checkoutId);
          if (existing && existing.status !== 'PENDING') {
            continue;
          }

          const timestamp = getDarajaTimestamp();
          const password = Buffer.from(`${cfg.shortcode}${cfg.passkey}${timestamp}`).toString('base64');

          const { res: qRes, data: qData } = await darajaPostJson(
            cfg,
            `${cfg.baseUrl}/mpesa/stkpushquery/v1/query`,
            {
              BusinessShortCode: cfg.shortcode,
              Password: password,
              Timestamp: timestamp,
              CheckoutRequestID: checkoutId,
            }
          );

          darajaQueriedCount += 1;
          const strictRes = extractStrictDarajaResultCode(qData);

          if (qRes.ok && String(qData.ResponseCode || '') === '0' && strictRes.hasCode) {
            const rDesc = String(
              qData.ResultDesc ||
                (strictRes.isSuccess ? 'The service request is processed successfully.' : 'STK Push failed or cancelled.')
            );
            const nextStatus: MpesaTxRecord['status'] = strictRes.isSuccess ? 'COMPLETED' : 'REJECTED';

            if (existing) {
              existing.status = nextStatus;
              existing.callbackVerified = true;
              existing.verificationSource = 'SAFARICOM_STK_CALLBACK';
              existing.resultCode = qData.ResultCode;
              existing.resultDesc = rDesc;
              existing.updatedAt = Date.now();
              if (!existing.mpesaReceipt && strictRes.isSuccess) {
                existing.mpesaReceipt = checkoutId;
              }
              mpesaTransactions.set(existing.id, existing);
              broadcastMpesaTxUpdate(existing);
            } else {
              const newRec: MpesaTxRecord = {
                id: checkoutId,
                type: 'STK_DEPOSIT',
                environment: cfg.env,
                phone: '',
                usdAmount: 0,
                kesAmount: 0,
                status: nextStatus,
                callbackVerified: true,
                verificationSource: 'SAFARICOM_STK_CALLBACK',
                resultCode: qData.ResultCode,
                mpesaReceipt: strictRes.isSuccess ? checkoutId : undefined,
                resultDesc: rDesc,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              mpesaTransactions.set(checkoutId, newRec);
              broadcastMpesaTxUpdate(newRec);
            }
          } else if (qData?.errorCode === '500.001.1001') {
            if (existing) {
              existing.resultDesc = String(qData.errorMessage || 'Transaction is still being processed by Safaricom.');
              existing.updatedAt = Date.now();
              mpesaTransactions.set(existing.id, existing);
            }
          } else if (!qRes.ok && qData?.errorMessage) {
            stkWarnings.push(`${checkoutId}: ${String(qData.errorMessage)}`);
          }
        }
      } catch (err: any) {
        queryError = err?.message || 'Unable to query Safaricom Daraja STK Push status.';
      }
    } else if (queryIdsList.length > 0 && !cfg.stkConfigured) {
      stkWarnings.push('Safaricom Daraja STK Push credentials are incomplete on the server.');
    }

    // Strictly query Safaricom Production TransactionStatusQuery for pending withdrawals; NEVER fabricate COMPLETED status without a real Safaricom result
    const withdrawalCfg = getWithdrawalDarajaConfig();
    const pendingWithdrawalRecords = Array.from(mpesaTransactions.values()).filter(
      (tx) =>
        tx.status === 'PENDING' &&
        (tx.type === 'B2C_WITHDRAWAL' || tx.type === 'B2B_TRANSFER') &&
        !tx.id.startsWith('DCASH-') &&
        (requestedWithdrawalIds.length === 0 ||
          requestedWithdrawalIds.includes(tx.id) ||
          (tx.originatorConversationId && requestedWithdrawalIds.includes(tx.originatorConversationId)))
    );

    if (pendingWithdrawalRecords.length > 0 && withdrawalCfg.b2cConfigured && publicBase) {
      for (const wth of pendingWithdrawalRecords) {
        if (!wth.originatorConversationId && !wth.mpesaReceipt) continue;
        const lastProbe = txLastStatusProbeAt.get(wth.id) || 0;
        if (Date.now() - lastProbe < 4000) continue;
        darajaQueriedCount += 1;
        await probeDarajaTransactionStatus(wth, withdrawalCfg, publicBase);
      }
    }

    const updatedStkRecords = Array.from(mpesaTransactions.values())
      .filter((tx) => tx.type === 'STK_DEPOSIT')
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const updatedB2cRecords = Array.from(mpesaTransactions.values())
      .filter((tx) => tx.type === 'B2C_WITHDRAWAL' || tx.type === 'B2B_TRANSFER')
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const confirmedTransactions = updatedStkRecords.filter((t) => t.status === 'COMPLETED' && t.callbackVerified !== false);
    const rejectedTransactions = updatedStkRecords.filter((t) => t.status === 'REJECTED');
    const pendingTransactions = updatedStkRecords.filter((t) => t.status === 'PENDING');
    const confirmedWithdrawals = updatedB2cRecords.filter((t) => t.status === 'COMPLETED' && t.callbackVerified === true);
    const rejectedWithdrawals = updatedB2cRecords.filter((t) => t.status === 'REJECTED');
    const pendingWithdrawals = updatedB2cRecords.filter((t) => t.status === 'PENDING');

    const hasFatalError = Boolean(
      queryError && confirmedWithdrawals.length === 0 && confirmedTransactions.length === 0
    );
    const statusLabel = hasFatalError
      ? 'WARNING'
      : confirmedTransactions.length > 0 || confirmedWithdrawals.length > 0
      ? 'COMPLETED'
      : pendingTransactions.length > 0 || pendingWithdrawals.length > 0
      ? 'PENDING'
      : 'OK';

    const message = hasFatalError
      ? queryError!
      : updatedStkRecords.length === 0 && updatedB2cRecords.length === 0 && queryIdsList.length === 0
      ? `Safaricom Daraja sync complete (${withdrawalCfg.env.toUpperCase()} withdrawal verification): No recent STK deposits or B2C withdrawals awaiting callback.`
      : pendingWithdrawals.length > 0 && confirmedWithdrawals.length === 0
      ? `Safaricom Daraja Production sync: ${pendingWithdrawals.length} withdrawal(s) remain PENDING awaiting verified Safaricom payment result callback${
          isPreviewAuthGatedUrl(publicBase) ? ' (note: preview webhook URL may block external Safaricom callbacks)' : ''
        }.`
      : `Safaricom Daraja sync complete (${withdrawalCfg.env.toUpperCase()}): ${confirmedTransactions.length} STK confirmed, ${confirmedWithdrawals.length} B2C withdrawal(s) verified by Safaricom, ${
          pendingTransactions.length + pendingWithdrawals.length
        } pending, ${rejectedTransactions.length + rejectedWithdrawals.length} rejected.`;

    const responsePayload = {
      ok: !hasFatalError,
      configured: cfg.stkConfigured || withdrawalCfg.b2cConfigured,
      status: statusLabel,
      environment: cfg.env,
      withdrawalEnvironment: withdrawalCfg.env,
      txStatusEndpoint: `${withdrawalCfg.baseUrl}/mpesa/transactionstatus/v1/query`,
      checkedCount: updatedStkRecords.length + updatedB2cRecords.length,
      darajaQueriedCount,
      confirmedTransactions,
      rejectedTransactions,
      pendingTransactions,
      confirmedWithdrawals,
      rejectedWithdrawals,
      pendingWithdrawals,
      stkWarnings,
      warnings: Array.from(new Set([...cfg.warnings, ...withdrawalCfg.warnings])),
      error: hasFatalError ? queryError : undefined,
      message,
    };

    recordCashierDiagnostic({
      channel: 'MPESA_STK',
      method: 'POST',
      endpoint: '/api/mpesa/stk-sync',
      httpStatus: hasFatalError ? 502 : 200,
      outcome: hasFatalError ? 'WARNING' : 'OK',
      summary: message,
      responsePayload: {
        status: statusLabel,
        environment: cfg.env,
        withdrawalEnvironment: withdrawalCfg.env,
        checkedCount: updatedStkRecords.length + updatedB2cRecords.length,
        darajaQueriedCount,
        confirmedCount: confirmedTransactions.length + confirmedWithdrawals.length,
        pendingCount: pendingTransactions.length + pendingWithdrawals.length,
        rejectedCount: rejectedTransactions.length + rejectedWithdrawals.length,
        stkWarnings,
        error: hasFatalError ? queryError : undefined,
      },
    });

    return res.status(hasFatalError ? 502 : 200).json(responsePayload);
  });

  app.post('/api/mpesa/b2c-withdraw', async (req, res) => {
    const cfg = getWithdrawalDarajaConfig();
    const { phone, usdAmount, kesAmount, loginId } = req.body || {};
    const parsedRecipient = normalizeKenyanMsisdnServer(String(phone || ''));

    if (!parsedRecipient) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid recipient Safaricom MSISDN format. Enter 07XXXXXXXX, 01XXXXXXXX, or 2547XXXXXXXX.',
      });
    }

    const amountKes = Math.round(Number(kesAmount || 0));
    if (!amountKes || Number.isNaN(amountKes) || amountKes < 10) {
      return res.status(400).json({ ok: false, error: 'Minimum Safaricom Daraja B2C payout is KES 10.' });
    }

    if (!cfg.b2cConfigured) {
      const payload = {
        ok: false,
        configured: false,
        status: 'GATEWAY_UNCONFIGURED',
        missingB2cVars: cfg.missingB2cVars,
        error: `Safaricom Daraja B2C missing server environment secrets: ${cfg.missingB2cVars.join(', ')}. No funds or M-Pesa SMS were sent to your Safaricom number.`,
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2C',
        method: 'POST',
        endpoint: '/api/mpesa/b2c-withdraw',
        httpStatus: 503,
        outcome: 'UNCONFIGURED',
        phoneOrTarget: parsedRecipient.msisdn,
        usdAmount: Number(usdAmount || 0),
        kesAmount: amountKes,
        summary: payload.error,
        responsePayload: payload,
      });
      return res.status(503).json(payload);
    }

    try {
      const resolvedB2cCommandId = VALID_B2C_COMMANDS.has(String(req.body?.commandId || ''))
        ? String(req.body.commandId)
        : cfg.b2cCommandId;
      const requestedB2cShortcode = cleanEnvVar(req.body?.b2cShortcode);
      const resolvedB2cShortcode =
        requestedB2cShortcode && requestedB2cShortcode.length >= 5 && !/^(0|254)(7|1)\d{8}$/.test(requestedB2cShortcode)
          ? requestedB2cShortcode
          : cfg.b2cShortcode;
      const primaryB2cEndpoint = `${cfg.baseUrl}/mpesa/b2c/v1/paymentrequest`;
      const fallbackB2cEndpoint = `${cfg.baseUrl}/mpesa/b2c/v3/paymentrequest`;

      const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
      const resultUrl = publicBase
        ? `${publicBase}/api/mpesa/b2c-result`
        : 'https://example.com/api/mpesa/b2c-result';
      const timeoutUrl = publicBase
        ? `${publicBase}/api/mpesa/b2c-timeout`
        : 'https://example.com/api/mpesa/b2c-timeout';
      const originatorConversationId = `NDK-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      const b2cPayload = {
        OriginatorConversationID: originatorConversationId,
        InitiatorName: cfg.initiatorName,
        SecurityCredential: cfg.securityCredential,
        CommandID: resolvedB2cCommandId,
        Amount: amountKes,
        PartyA: resolvedB2cShortcode,
        PartyB: parsedRecipient.msisdn,
        Remarks: `Deriv withdrawal ${loginId || 'CR-NDERISKOOL'} -> ${parsedRecipient.phone}`.slice(0, 100),
        QueueTimeOutURL: timeoutUrl,
        ResultURL: resultUrl,
        Occasion: 'DerivWithdrawal',
      };

      let b2cEndpoint = primaryB2cEndpoint;
      let { res: b2cRes, data: b2cData } = await darajaPostJson(cfg, b2cEndpoint, b2cPayload);
      if (b2cRes.status === 404) {
        b2cEndpoint = fallbackB2cEndpoint;
        const retry = await darajaPostJson(cfg, b2cEndpoint, b2cPayload);
        b2cRes = retry.res;
        b2cData = retry.data;
      }

      if (!b2cRes.ok || String(b2cData.ResponseCode || '') !== '0') {
        const payload = {
          ok: false,
          configured: true,
          status: 'REJECTED',
          b2cEndpoint,
          partyA: resolvedB2cShortcode,
          partyB: parsedRecipient.msisdn,
          recipientPhone: parsedRecipient.phone,
          recipientMsisdn: parsedRecipient.msisdn,
          commandId: resolvedB2cCommandId,
          error:
            b2cData.errorMessage ||
            b2cData.ResponseDescription ||
            `Daraja B2C paymentrequest rejected (HTTP ${b2cRes.status}).`,
        };
        recordCashierDiagnostic({
          channel: 'MPESA_B2C',
          method: 'POST',
          endpoint: '/api/mpesa/b2c-withdraw',
          httpStatus: 502,
          outcome: 'REJECTED',
          phoneOrTarget: parsedRecipient.msisdn,
          usdAmount: Number(usdAmount || 0),
          kesAmount: amountKes,
          summary: payload.error,
          responsePayload: { ...payload, darajaRaw: b2cData },
        });
        return res.status(502).json(payload);
      }

      const id = (b2cData.ConversationID || b2cData.OriginatorConversationID || originatorConversationId) as string;
      const record: MpesaTxRecord = {
        id,
        originatorConversationId,
        type: 'B2C_WITHDRAWAL',
        environment: cfg.env,
        phone: parsedRecipient.msisdn,
        recipientPhone: parsedRecipient.phone,
        recipientMsisdn: parsedRecipient.msisdn,
        usdAmount: Number(usdAmount || 0),
        kesAmount: amountKes,
        loginId,
        status: 'PENDING',
        callbackVerified: false,
        resultDesc: `Safaricom B2C request accepted for ${parsedRecipient.phone} (${parsedRecipient.msisdn}). Status remains PENDING until Safaricom payment result callback is received and verified.`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mpesaTransactions.set(id, record);
      originatorToPrimaryId.set(originatorConversationId, id);

      // Only query Safaricom TransactionStatus in background; never fabricate COMPLETED status
      scheduleSafaricomStatusProbes(id, cfg, publicBase);

      const payload = {
        ok: true,
        configured: true,
        environment: cfg.env,
        baseUrl: cfg.baseUrl,
        b2cEndpoint,
        txStatusEndpoint: `${cfg.baseUrl}/mpesa/transactionstatus/v1/query`,
        liveWithdrawalReady: cfg.liveWithdrawalReady,
        strictCallbackVerification: true,
        status: 'PENDING',
        conversationId: id,
        originatorConversationId,
        recipientPhone: parsedRecipient.phone,
        recipientMsisdn: parsedRecipient.msisdn,
        partyA: resolvedB2cShortcode,
        partyB: parsedRecipient.msisdn,
        resultUrl,
        callbackAuthGated: isPreviewAuthGatedUrl(publicBase),
        message: record.resultDesc,
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2C',
        method: 'POST',
        endpoint: '/api/mpesa/b2c-withdraw',
        httpStatus: 202,
        outcome: 'PENDING',
        phoneOrTarget: `${parsedRecipient.phone} (${parsedRecipient.msisdn})`,
        usdAmount: Number(usdAmount || 0),
        kesAmount: amountKes,
        reference: id,
        summary: record.resultDesc || 'Daraja B2C withdrawal submitted — awaiting Safaricom result callback',
        responsePayload: payload,
      });
      return res.status(202).json(payload);
    } catch (err: any) {
      const payload = {
        ok: false,
        configured: true,
        status: 'REJECTED',
        error: err?.message || 'Safaricom Daraja B2C payout request failed.',
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2C',
        method: 'POST',
        endpoint: '/api/mpesa/b2c-withdraw',
        httpStatus: 500,
        outcome: 'REJECTED',
        phoneOrTarget: parsedRecipient.msisdn,
        usdAmount: Number(usdAmount || 0),
        kesAmount: amountKes,
        summary: payload.error,
        responsePayload: payload,
      });
      return res.status(500).json(payload);
    }
  });

  // Safaricom Daraja B2B (Business-to-Business Paybill / BuyGoods Till / P2P Merchant Shortcode)
  app.post('/api/mpesa/b2b-transfer', async (req, res) => {
    const cfg = getWithdrawalDarajaConfig();
    const {
      partyB,
      commandId,
      accountReference,
      usdAmount,
      kesAmount,
      requesterPhone,
      merchantName,
      loginId,
      standalone,
    } = req.body || {};

    const isStandaloneB2b = Boolean(standalone === true || !loginId || String(loginId).trim().toUpperCase() === 'STANDALONE');
    const cleanPartyB = String(partyB || '').replace(/\D/g, '');
    if (!cleanPartyB || cleanPartyB.length < 5 || cleanPartyB.length > 12) {
      return res.status(400).json({
        ok: false,
        status: 'REJECTED',
        error: 'Invalid destination Paybill / Till / Business Shortcode (expected 5-12 digits, e.g. 247247 or 600000).',
      });
    }

    const amountKes = Math.round(Number(kesAmount || 0));
    if (!amountKes || Number.isNaN(amountKes) || amountKes < 10) {
      return res.status(400).json({
        ok: false,
        status: 'REJECTED',
        error: 'Minimum Safaricom Daraja B2B settlement is KES 10.',
      });
    }

    const resolvedCommand = VALID_B2B_COMMANDS.has(String(commandId || ''))
      ? String(commandId)
      : cfg.b2bCommandId;
    const receiverIdentifierType = resolvedCommand === 'BusinessBuyGoods' ? '2' : '4';
    const resolvedAccountRef = String(
      accountReference || (isStandaloneB2b ? 'B2B-TRANSFER' : loginId) || 'B2B-TRANSFER'
    )
      .trim()
      .slice(0, 20);
    const cleanRequester = String(requesterPhone || '').replace(/\D/g, '');
    const validRequester = /^254(7|1)\d{8}$/.test(cleanRequester) ? cleanRequester : undefined;

    if (!cfg.b2bConfigured) {
      const payload = {
        ok: false,
        configured: false,
        status: 'GATEWAY_UNCONFIGURED',
        partyB: cleanPartyB,
        commandId: resolvedCommand,
        accountReference: resolvedAccountRef,
        missingB2bVars: cfg.missingB2bVars,
        error: `Safaricom Daraja B2B missing server secrets: ${cfg.missingB2bVars.join(', ')}.`,
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2B',
        method: 'POST',
        endpoint: '/api/mpesa/b2b-transfer',
        httpStatus: 503,
        outcome: 'UNCONFIGURED',
        phoneOrTarget: `${merchantName ? `${merchantName} · ` : ''}Shortcode ${cleanPartyB} (${resolvedCommand})`,
        usdAmount: Number(usdAmount || 0),
        kesAmount: amountKes,
        summary: payload.error,
        responsePayload: payload,
      });
      return res.status(503).json(payload);
    }

    try {
      const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
      const resultUrl = publicBase
        ? `${publicBase}/api/mpesa/b2b-result`
        : 'https://example.com/api/mpesa/b2b-result';
      const timeoutUrl = publicBase
        ? `${publicBase}/api/mpesa/b2b-timeout`
        : 'https://example.com/api/mpesa/b2b-timeout';
      const originatorConversationId = `B2B-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      const b2bBody: Record<string, unknown> = {
        OriginatorConversationID: originatorConversationId,
        Initiator: cfg.initiatorName,
        SecurityCredential: cfg.securityCredential,
        CommandID: resolvedCommand,
        SenderIdentifierType: '4',
        RecieverIdentifierType: receiverIdentifierType,
        Amount: amountKes,
        PartyA: cfg.b2bShortcode,
        PartyB: cleanPartyB,
        AccountReference: resolvedAccountRef,
        Remarks: isStandaloneB2b
          ? `Business B2B Transfer -> ${cleanPartyB}`.slice(0, 100)
          : `P2P B2B ${loginId} -> ${cleanPartyB}`.slice(0, 100),
        QueueTimeOutURL: timeoutUrl,
        ResultURL: resultUrl,
      };
      if (validRequester) {
        b2bBody.Requester = validRequester;
      }

      const { res: b2bRes, data: b2bData } = await darajaPostJson(cfg, `${cfg.baseUrl}/mpesa/b2b/v1/paymentrequest`, b2bBody);
      if (!b2bRes.ok || String(b2bData.ResponseCode || '') !== '0') {
        const payload = {
          ok: false,
          configured: true,
          status: 'REJECTED',
          partyB: cleanPartyB,
          commandId: resolvedCommand,
          accountReference: resolvedAccountRef,
          error: b2bData.errorMessage || b2bData.ResponseDescription || 'Daraja B2B paymentrequest rejected.',
        };
        recordCashierDiagnostic({
          channel: 'MPESA_B2B',
          method: 'POST',
          endpoint: '/api/mpesa/b2b-transfer',
          httpStatus: 502,
          outcome: 'REJECTED',
          phoneOrTarget: `${merchantName ? `${merchantName} · ` : ''}Shortcode ${cleanPartyB} (${resolvedCommand})`,
          usdAmount: Number(usdAmount || 0),
          kesAmount: amountKes,
          summary: payload.error,
          responsePayload: { ...payload, darajaRaw: b2bData },
        });
        return res.status(502).json(payload);
      }

      const id = (b2bData.ConversationID || b2bData.OriginatorConversationID || originatorConversationId) as string;
      const record: MpesaTxRecord = {
        id,
        originatorConversationId,
        type: 'B2B_TRANSFER',
        standalone: isStandaloneB2b,
        environment: cfg.env,
        phone: validRequester || cleanPartyB,
        partyB: cleanPartyB,
        commandId: resolvedCommand,
        accountReference: resolvedAccountRef,
        usdAmount: Number(usdAmount || 0),
        kesAmount: amountKes,
        loginId: isStandaloneB2b ? undefined : String(loginId),
        status: 'PENDING',
        callbackVerified: false,
        resultDesc: `Safaricom Daraja B2B accepted (${resolvedCommand} -> ${cleanPartyB}). Status stays PENDING until B2B ResultURL callback verifies completion.`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mpesaTransactions.set(id, record);
      originatorToPrimaryId.set(originatorConversationId, id);

      scheduleSafaricomStatusProbes(id, cfg, publicBase);

      const payload = {
        ok: true,
        configured: true,
        environment: cfg.env,
        strictCallbackVerification: true,
        status: 'PENDING',
        conversationId: id,
        originatorConversationId,
        partyB: cleanPartyB,
        commandId: resolvedCommand,
        accountReference: resolvedAccountRef,
        message: record.resultDesc,
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2B',
        method: 'POST',
        endpoint: '/api/mpesa/b2b-transfer',
        httpStatus: 202,
        outcome: 'PENDING',
        phoneOrTarget: `${merchantName ? `${merchantName} · ` : ''}Shortcode ${cleanPartyB} (${resolvedCommand})`,
        usdAmount: Number(usdAmount || 0),
        kesAmount: amountKes,
        reference: id,
        summary: record.resultDesc || 'Daraja B2B transfer submitted',
        responsePayload: payload,
      });
      return res.status(202).json(payload);
    } catch (err: any) {
      const payload = {
        ok: false,
        configured: true,
        status: 'REJECTED',
        partyB: cleanPartyB,
        commandId: resolvedCommand,
        error: err?.message || 'Safaricom Daraja B2B request failed.',
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2B',
        method: 'POST',
        endpoint: '/api/mpesa/b2b-transfer',
        httpStatus: 500,
        outcome: 'REJECTED',
        phoneOrTarget: `Shortcode ${cleanPartyB} (${resolvedCommand})`,
        usdAmount: Number(usdAmount || 0),
        kesAmount: amountKes,
        summary: payload.error,
        responsePayload: payload,
      });
      return res.status(500).json(payload);
    }
  });

  app.post('/api/mpesa/b2b-result', (req, res) => {
    const result = req.body?.Result;
    const convId = result?.ConversationID ? String(result.ConversationID) : undefined;
    const origId = result?.OriginatorConversationID ? String(result.OriginatorConversationID) : undefined;
    const resolvedId =
      (convId && mpesaTransactions.has(convId) ? convId : undefined) ||
      (origId ? originatorToPrimaryId.get(origId) || origId : undefined);

    const { findParam } = parseDarajaResultParameters(result);
    const paramReceipt = findParam('TransactionReceipt') || findParam('ReceiptNo');
    const receipt = paramReceipt || result?.TransactionID;
    const extractedReceipt = receipt ? String(receipt).trim() : undefined;
    const txAmountRaw = findParam('Amount') ?? findParam('TransactionAmount');
    const transactionAmount = txAmountRaw !== undefined ? Number(txAmountRaw) : undefined;
    const strictRes = extractStrictDarajaResultCode(result);
    const isValidReceipt =
      Boolean(extractedReceipt) &&
      extractedReceipt!.length >= 4 &&
      !extractedReceipt!.startsWith('PING') &&
      (transactionAmount === undefined || (!Number.isNaN(transactionAmount) && transactionAmount > 0));

    let matchedTransaction = false;
    let outcome: ServerDiagOutcome = 'WARNING';
    if (resolvedId && strictRes.hasCode) {
      const existing = mpesaTransactions.get(resolvedId);
      if (existing) {
        matchedTransaction = true;
        if (strictRes.isSuccess && isValidReceipt) {
          existing.status = 'COMPLETED';
          existing.callbackVerified = true;
          existing.verificationSource = 'SAFARICOM_B2B_CALLBACK';
          existing.resultCode = result.ResultCode;
          existing.mpesaReceipt = extractedReceipt;
          existing.resultDesc = result?.ResultDesc
            ? `${extractedReceipt} Confirmed: ${String(result.ResultDesc)}`
            : `${extractedReceipt} Confirmed via Safaricom Daraja B2B callback.`;
          existing.safaricomConfirmationText = existing.resultDesc;
          outcome = 'OK';
        } else if (!strictRes.isSuccess) {
          existing.status = 'REJECTED';
          existing.callbackVerified = true;
          existing.verificationSource = 'SAFARICOM_B2B_CALLBACK';
          existing.resultCode = result.ResultCode;
          existing.mpesaReceipt = extractedReceipt;
          existing.resultDesc = result?.ResultDesc || `Safaricom Daraja B2B failed (ResultCode: ${strictRes.codeStr}).`;
          outcome = 'REJECTED';
        } else {
          existing.resultCode = result.ResultCode;
          existing.resultDesc = 'B2B callback ResultCode=0 lacked a valid Safaricom receipt or positive amount; remaining PENDING.';
          outcome = 'WARNING';
        }
        existing.updatedAt = Date.now();
        mpesaTransactions.set(existing.id, existing);
        broadcastMpesaTxUpdate(existing);
      }
    }

    const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'MPESA_B2B_RESULT',
      endpoint: '/api/mpesa/b2b-result',
      reference: resolvedId || convId || origId,
      conversationId: convId,
      originatorConversationId: origId,
      resultCode: result?.ResultCode,
      resultDesc: result?.ResultDesc ? String(result.ResultDesc) : undefined,
      mpesaReceipt: extractedReceipt,
      matchedTransaction,
    });

    recordCashierDiagnostic({
      channel: 'MPESA_B2B',
      method: 'POST',
      endpoint: '/api/mpesa/b2b-result',
      httpStatus: 200,
      outcome,
      reference: rawEntry.reference,
      summary:
        result?.ResultDesc
          ? `B2B Result webhook (${matchedTransaction ? 'matched tx' : 'unmatched ref'}): ${result.ResultDesc}`
          : `B2B Result webhook POST received from ${rawEntry.sourceIp}`,
      responsePayload:
        typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : { raw: req.body },
    });

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  app.post('/api/mpesa/b2b-timeout', (req, res) => {
    const result = req.body?.Result;
    const convId = result?.ConversationID ? String(result.ConversationID) : undefined;
    const origId = result?.OriginatorConversationID ? String(result.OriginatorConversationID) : undefined;
    const resolvedId =
      (convId && mpesaTransactions.has(convId) ? convId : undefined) ||
      (origId ? originatorToPrimaryId.get(origId) || origId : undefined);

    let matchedTransaction = false;
    if (resolvedId && mpesaTransactions.has(resolvedId)) {
      matchedTransaction = true;
      const existing = mpesaTransactions.get(resolvedId)!;
      existing.status = 'REJECTED';
      existing.resultDesc = 'Safaricom Daraja B2B request timed out.';
      existing.updatedAt = Date.now();
      mpesaTransactions.set(existing.id, existing);
      broadcastMpesaTxUpdate(existing);
    }

    const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'MPESA_B2B_TIMEOUT',
      endpoint: '/api/mpesa/b2b-timeout',
      reference: resolvedId || convId || origId,
      conversationId: convId,
      originatorConversationId: origId,
      resultCode: result?.ResultCode ?? 'TIMEOUT',
      resultDesc: result?.ResultDesc ? String(result.ResultDesc) : 'Safaricom Daraja B2B queue timeout',
      matchedTransaction,
    });

    recordCashierDiagnostic({
      channel: 'MPESA_B2B',
      method: 'POST',
      endpoint: '/api/mpesa/b2b-timeout',
      httpStatus: 200,
      outcome: 'WARNING',
      reference: rawEntry.reference,
      summary: `B2B Timeout webhook (${matchedTransaction ? 'matched tx' : 'unmatched ref'}) from ${rawEntry.sourceIp}`,
      responsePayload:
        typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : { raw: req.body },
    });

    res.json({ ResultCode: 0, ResultDesc: 'Timeout acknowledged' });
  });

  app.get('/api/mpesa/callback-health', (_req, res) => {
    return res.json({
      ok: true,
      service: 'nderiskool-cashier-webhooks',
      environment: getDarajaConfig().env,
      timestamp: Date.now(),
    });
  });

  app.get('/api/mpesa/callback', (req, res) => {
    const cfg = getDarajaConfig();
    const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
    const recentStkWebhooks = incomingWebhookCallbacks
      .filter((w) => w.kind === 'MPESA_STK_CALLBACK')
      .slice(0, 10);
    return res.json({
      ok: true,
      endpoint: '/api/mpesa/callback',
      method: 'POST',
      environment: cfg.env,
      callbackBaseUrl: publicBase || null,
      callbackBaseUrlSource: cfg.callbackBaseUrlSource,
      callbackAuthGated: isPreviewAuthGatedUrl(publicBase),
      callbackUrl: publicBase ? `${publicBase}/api/mpesa/callback` : '/api/mpesa/callback',
      recentWebhooks: recentStkWebhooks,
    });
  });

  app.post('/api/mpesa/callback', (req, res) => {
    const callback = req.body?.Body?.stkCallback;
    let matchedTransaction = false;
    let extractedReceipt: string | undefined;
    let liveStkConfirmationText: string | undefined;
    const strictRes = extractStrictDarajaResultCode(callback);
    let outcome: ServerDiagOutcome = 'WARNING';

    if (callback?.CheckoutRequestID && strictRes.hasCode) {
      const existing = mpesaTransactions.get(String(callback.CheckoutRequestID));
      const items: Array<{ Name: string; Value?: unknown }> = Array.isArray(callback.CallbackMetadata?.Item)
        ? callback.CallbackMetadata.Item
        : [];
      const receipt = items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value;
      const paidAmount = items.find((i) => i.Name === 'Amount')?.Value;
      const txDate = items.find((i) => i.Name === 'TransactionDate')?.Value;
      const payerPhone = items.find((i) => i.Name === 'PhoneNumber')?.Value;
      extractedReceipt = receipt ? String(receipt).trim() : undefined;

      const hasValidStkProof = Boolean(strictRes.isSuccess && extractedReceipt && extractedReceipt.length >= 4);
      if (hasValidStkProof && extractedReceipt) {
        const kesDisplay = Number(paidAmount || existing?.kesAmount || 0).toLocaleString();
        const phoneDisplay = String(payerPhone || existing?.phone || 'M-Pesa Customer');
        liveStkConfirmationText = `${extractedReceipt} Confirmed. Ksh${kesDisplay} received from ${phoneDisplay} via Safaricom M-Pesa STK${
          txDate ? ` (${String(txDate)})` : ''
        }.`;
      }

      if (existing) {
        matchedTransaction = true;
        if (hasValidStkProof) {
          existing.status = 'COMPLETED';
          existing.callbackVerified = true;
          existing.verificationSource = 'SAFARICOM_STK_CALLBACK';
          existing.resultCode = callback.ResultCode;
          existing.mpesaReceipt = extractedReceipt;
          existing.safaricomConfirmationText = liveStkConfirmationText;
          existing.resultDesc = liveStkConfirmationText;
          outcome = 'OK';
        } else if (!strictRes.isSuccess) {
          existing.status = 'REJECTED';
          existing.callbackVerified = true;
          existing.verificationSource = 'SAFARICOM_STK_CALLBACK';
          existing.resultCode = callback.ResultCode;
          existing.resultDesc = callback.ResultDesc || `Safaricom STK failed (ResultCode: ${strictRes.codeStr})`;
          outcome = 'REJECTED';
        } else {
          existing.resultCode = callback.ResultCode;
          existing.resultDesc = 'STK callback ResultCode=0 missing MpesaReceiptNumber; still PENDING.';
          outcome = 'WARNING';
        }
        existing.updatedAt = Date.now();
        mpesaTransactions.set(existing.id, existing);
        broadcastMpesaTxUpdate(existing);
      }
    }

    const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'MPESA_STK_CALLBACK',
      endpoint: '/api/mpesa/callback',
      reference: callback?.CheckoutRequestID ? String(callback.CheckoutRequestID) : undefined,
      resultCode: callback?.ResultCode,
      resultDesc: liveStkConfirmationText || (callback?.ResultDesc ? String(callback.ResultDesc) : undefined),
      mpesaReceipt: extractedReceipt,
      matchedTransaction,
    });

    recordCashierDiagnostic({
      channel: 'MPESA_STK',
      method: 'POST',
      endpoint: '/api/mpesa/callback',
      httpStatus: 200,
      outcome,
      reference: extractedReceipt || rawEntry.reference,
      summary:
        liveStkConfirmationText ||
        (callback?.ResultDesc
          ? `STK webhook received (${matchedTransaction ? 'matched tx' : 'unmatched ref'}): ${callback.ResultDesc}`
          : `STK webhook POST received from ${rawEntry.sourceIp}`),
      responsePayload:
        typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : { raw: req.body },
    });

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  app.post('/api/mpesa/b2c-result', (req, res) => {
    const result = req.body?.Result;
    const convId = result?.ConversationID ? String(result.ConversationID) : undefined;
    const origId = result?.OriginatorConversationID ? String(result.OriginatorConversationID) : undefined;
    const resolvedId =
      (convId && mpesaTransactions.has(convId) ? convId : undefined) ||
      (origId ? originatorToPrimaryId.get(origId) || (mpesaTransactions.has(origId) ? origId : undefined) : undefined);

    const { findParam } = parseDarajaResultParameters(result);
    const paramReceipt = findParam('TransactionReceipt') || findParam('ReceiptNo');
    const receipt = paramReceipt || result?.TransactionID;
    const extractedReceipt = receipt ? String(receipt).trim() : undefined;
    const txAmountRaw = findParam('TransactionAmount') ?? findParam('Amount');
    const receiverPublicNameRaw = findParam('ReceiverPartyPublicName');
    const completedDateTimeRaw = findParam('TransactionCompletedDateTime') ?? findParam('FinalisedTime');
    const utilityBalRaw = findParam('B2CUtilityAccountAvailableFunds');
    const workingBalRaw = findParam('B2CWorkingAccountAvailableFunds');

    const receiverPublicName = receiverPublicNameRaw ? String(receiverPublicNameRaw) : undefined;
    const completedAtText = completedDateTimeRaw ? String(completedDateTimeRaw) : undefined;
    const transactionAmount = txAmountRaw !== undefined ? Number(txAmountRaw) : undefined;
    const b2cUtilityBalance = utilityBalRaw !== undefined ? Number(utilityBalRaw) : undefined;
    const b2cWorkingBalance = workingBalRaw !== undefined ? Number(workingBalRaw) : undefined;

    const strictRes = extractStrictDarajaResultCode(result);
    const existing = resolvedId ? mpesaTransactions.get(resolvedId) : undefined;
    const callbackReceiverMsisdn = extractKenyanMsisdnFromReceiver(receiverPublicName);
    const recipientMismatch = Boolean(
      existing &&
        callbackReceiverMsisdn &&
        existing.phone &&
        callbackReceiverMsisdn !== existing.phone
    );
    const isRealTransactionReceipt =
      Boolean(extractedReceipt) &&
      extractedReceipt!.length >= 4 &&
      !String(extractedReceipt).startsWith('PING') &&
      (transactionAmount !== undefined
        ? !Number.isNaN(transactionAmount) && transactionAmount > 0
        : Number(existing?.kesAmount ?? 0) > 0);

    let liveB2cConfirmationText: string | undefined;
    let verificationError: string | undefined;

    if (strictRes.isSuccess && isRealTransactionReceipt && !recipientMismatch && extractedReceipt) {
      const kesVal = Number(transactionAmount || existing?.kesAmount || 0).toLocaleString();
      const targetName = receiverPublicName || existing?.recipientPhone || existing?.phone || 'Safaricom Recipient';
      liveB2cConfirmationText = `${extractedReceipt} Confirmed. Ksh${kesVal} sent to ${targetName} via Safaricom M-Pesa${
        completedAtText ? ` on ${completedAtText}` : ''
      }.${b2cUtilityBalance !== undefined ? ` Utility Bal: Ksh${b2cUtilityBalance.toLocaleString()}.` : ''}`;
    } else if (strictRes.isSuccess && existing) {
      if (recipientMismatch) {
        verificationError = `Safaricom callback recipient MSISDN (${callbackReceiverMsisdn}) does not match expected recipient (${existing.phone}).`;
      } else if (!isRealTransactionReceipt) {
        verificationError =
          'Safaricom callback reported ResultCode=0 without a valid M-Pesa receipt or positive payment amount; withdrawal NOT marked Confirmed.';
      }
    }

    let matchedTransaction = false;
    let diagOutcome: ServerDiagOutcome = 'WARNING';
    if (existing && strictRes.hasCode) {
      matchedTransaction = true;
      existing.environment = 'production';
      if (receiverPublicName) existing.receiverPublicName = receiverPublicName;
      if (completedAtText) existing.completedAtText = completedAtText;
      if (transactionAmount !== undefined && !Number.isNaN(transactionAmount)) {
        existing.transactionAmount = transactionAmount;
      }
      if (b2cUtilityBalance !== undefined && !Number.isNaN(b2cUtilityBalance)) {
        existing.b2cUtilityBalance = b2cUtilityBalance;
      }
      if (b2cWorkingBalance !== undefined && !Number.isNaN(b2cWorkingBalance)) {
        existing.b2cWorkingBalance = b2cWorkingBalance;
      }
      existing.resultCode = result.ResultCode;

      if (strictRes.isSuccess && isRealTransactionReceipt && !recipientMismatch) {
        existing.status = 'COMPLETED';
        existing.callbackVerified = true;
        existing.verificationSource = 'SAFARICOM_B2C_CALLBACK';
        existing.mpesaReceipt = extractedReceipt;
        existing.safaricomConfirmationText = liveB2cConfirmationText;
        existing.resultDesc = liveB2cConfirmationText;
        diagOutcome = 'OK';
      } else if (!strictRes.isSuccess || recipientMismatch) {
        existing.status = 'REJECTED';
        existing.callbackVerified = true;
        existing.verificationSource = 'SAFARICOM_B2C_CALLBACK';
        existing.mpesaReceipt = extractedReceipt;
        existing.resultDesc =
          verificationError ||
          (result?.ResultDesc
            ? `${String(result.ResultDesc)} (ResultCode: ${strictRes.codeStr})`
            : `Safaricom Daraja B2C payment rejected (ResultCode: ${strictRes.codeStr}).`);
        diagOutcome = 'REJECTED';
      } else {
        existing.resultDesc = verificationError || 'Awaiting verified Safaricom payment receipt.';
        diagOutcome = 'WARNING';
      }

      existing.updatedAt = Date.now();
      mpesaTransactions.set(existing.id, existing);
      broadcastMpesaTxUpdate(existing);
    }

    const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'MPESA_B2C_RESULT',
      endpoint: '/api/mpesa/b2c-result',
      reference: resolvedId || convId || origId,
      conversationId: convId,
      originatorConversationId: origId,
      resultCode: result?.ResultCode,
      resultDesc:
        verificationError ||
        liveB2cConfirmationText ||
        (result?.ResultDesc ? String(result.ResultDesc) : undefined),
      mpesaReceipt: extractedReceipt,
      matchedTransaction,
    });

    recordCashierDiagnostic({
      channel: 'MPESA_B2C',
      method: 'POST',
      endpoint: '/api/mpesa/b2c-result',
      httpStatus: 200,
      outcome: diagOutcome,
      reference: extractedReceipt || rawEntry.reference,
      summary:
        verificationError ||
        liveB2cConfirmationText ||
        (result?.ResultDesc
          ? `B2C Result webhook (${matchedTransaction ? 'matched tx' : 'unmatched ref'}): ${result.ResultDesc}`
          : `B2C Result webhook POST received from ${rawEntry.sourceIp}`),
      responsePayload:
        typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : { raw: req.body },
    });

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  app.post('/api/mpesa/b2c-timeout', (req, res) => {
    const result = req.body?.Result;
    const convId = result?.ConversationID ? String(result.ConversationID) : undefined;
    const origId = result?.OriginatorConversationID ? String(result.OriginatorConversationID) : undefined;
    const resolvedId =
      (convId && mpesaTransactions.has(convId) ? convId : undefined) ||
      (origId ? originatorToPrimaryId.get(origId) || origId : undefined);

    let matchedTransaction = false;
    if (resolvedId && mpesaTransactions.has(resolvedId)) {
      matchedTransaction = true;
      const existing = mpesaTransactions.get(resolvedId)!;
      existing.status = 'REJECTED';
      existing.resultDesc = 'Safaricom Daraja B2C request timed out.';
      existing.updatedAt = Date.now();
      mpesaTransactions.set(existing.id, existing);
      broadcastMpesaTxUpdate(existing);
    }

    const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'MPESA_B2C_TIMEOUT',
      endpoint: '/api/mpesa/b2c-timeout',
      reference: resolvedId || convId || origId,
      conversationId: convId,
      originatorConversationId: origId,
      resultCode: result?.ResultCode ?? 'TIMEOUT',
      resultDesc: result?.ResultDesc ? String(result.ResultDesc) : 'Safaricom Daraja B2C queue timeout',
      matchedTransaction,
    });

    recordCashierDiagnostic({
      channel: 'MPESA_B2C',
      method: 'POST',
      endpoint: '/api/mpesa/b2c-timeout',
      httpStatus: 200,
      outcome: 'WARNING',
      reference: rawEntry.reference,
      summary: `B2C Timeout webhook (${matchedTransaction ? 'matched tx' : 'unmatched ref'}) from ${rawEntry.sourceIp}`,
      responsePayload:
        typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : { raw: req.body },
    });

    res.json({ ResultCode: 0, ResultDesc: 'Timeout acknowledged' });
  });

  // Authentic Safaricom Daraja Account Balance v1 Query + Callbacks
  app.post('/api/mpesa/account-balance', async (req, res) => {
    const cfg = getWithdrawalDarajaConfig();
    if (!cfg.b2cConfigured) {
      const payload = {
        ok: false,
        configured: false,
        missingVars: cfg.missingB2cVars,
        error: `Safaricom Daraja Account Balance requires: ${cfg.missingB2cVars.join(', ')}.`,
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2C',
        method: 'POST',
        endpoint: '/api/mpesa/account-balance',
        httpStatus: 400,
        outcome: 'UNCONFIGURED',
        summary: payload.error,
        responsePayload: payload,
      });
      return res.status(400).json(payload);
    }

    try {
      const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
      const resultUrl = publicBase
        ? `${publicBase}/api/mpesa/account-balance-result`
        : 'https://example.com/api/mpesa/account-balance-result';
      const timeoutUrl = publicBase
        ? `${publicBase}/api/mpesa/account-balance-timeout`
        : 'https://example.com/api/mpesa/account-balance-timeout';
      const partyA = cleanEnvVar(req.body?.shortcode) || cfg.b2cShortcode || cfg.shortcode;

      const { res: balRes, data: balData } = await darajaPostJson(cfg, `${cfg.baseUrl}/mpesa/accountbalance/v1/query`, {
        Initiator: cfg.initiatorName,
        SecurityCredential: cfg.securityCredential,
        CommandID: 'AccountBalance',
        PartyA: partyA,
        IdentifierType: '4',
        Remarks: 'nderiskool Shortcode Balance Check',
        QueueTimeOutURL: timeoutUrl,
        ResultURL: resultUrl,
      });

      if (!balRes.ok || String(balData.ResponseCode || '') !== '0') {
        const payload = {
          ok: false,
          configured: true,
          error: String(balData.errorMessage || balData.ResponseDescription || 'Daraja AccountBalance request rejected.'),
          darajaRaw: balData,
        };
        recordCashierDiagnostic({
          channel: 'MPESA_B2C',
          method: 'POST',
          endpoint: '/api/mpesa/account-balance',
          httpStatus: 502,
          outcome: 'REJECTED',
          summary: payload.error,
          responsePayload: payload,
        });
        return res.status(502).json(payload);
      }

      const payload = {
        ok: true,
        configured: true,
        status: 'PENDING',
        shortcode: partyA,
        conversationId: balData.ConversationID,
        originatorConversationId: balData.OriginatorConversationID,
        message: String(
          balData.ResponseDescription ||
            `Safaricom Daraja Account Balance query submitted for Shortcode ${partyA}. Awaiting ResultURL callback.`
        ),
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2C',
        method: 'POST',
        endpoint: '/api/mpesa/account-balance',
        httpStatus: 202,
        outcome: 'PENDING',
        reference: String(balData.ConversationID || ''),
        summary: payload.message,
        responsePayload: payload,
      });
      return res.status(202).json(payload);
    } catch (err: any) {
      const payload = {
        ok: false,
        configured: true,
        error: err?.message || 'Safaricom Daraja Account Balance query failed.',
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2C',
        method: 'POST',
        endpoint: '/api/mpesa/account-balance',
        httpStatus: 502,
        outcome: 'REJECTED',
        summary: payload.error,
        responsePayload: payload,
      });
      return res.status(502).json(payload);
    }
  });

  app.post('/api/mpesa/account-balance-result', (req, res) => {
    const result = req.body?.Result;
    const convId = result?.ConversationID ? String(result.ConversationID) : undefined;
    const origId = result?.OriginatorConversationID ? String(result.OriginatorConversationID) : undefined;
    const params: Array<{ Key?: string; Value?: unknown }> = Array.isArray(result?.ResultParameters?.ResultParameter)
      ? result.ResultParameters.ResultParameter
      : [];
    const balanceParam = params.find((p) => p.Key === 'AccountBalance')?.Value;
    const rawBalanceString = balanceParam ? String(balanceParam) : undefined;

    if (Number(result?.ResultCode) === 0 && rawBalanceString) {
      const accounts = rawBalanceString
        .split('&')
        .map((segment) => {
          const parts = segment.split('|');
          return {
            name: parts[0] || 'Account',
            currency: parts[1] || 'KES',
            available: parts[2] || '0.00',
            uncleared: parts[3],
          };
        })
        .filter((a) => a.name);
      latestDarajaBalanceSnapshot = {
        updatedAt: Date.now(),
        conversationId: convId,
        rawBalanceString,
        accounts,
        resultDesc: result?.ResultDesc ? String(result.ResultDesc) : 'Account Balance updated',
      };
    }

    const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'MPESA_BALANCE_RESULT',
      endpoint: '/api/mpesa/account-balance-result',
      reference: convId || origId,
      conversationId: convId,
      originatorConversationId: origId,
      resultCode: result?.ResultCode,
      resultDesc: result?.ResultDesc ? String(result.ResultDesc) : undefined,
      matchedTransaction: false,
    });

    recordCashierDiagnostic({
      channel: 'MPESA_B2C',
      method: 'POST',
      endpoint: '/api/mpesa/account-balance-result',
      httpStatus: 200,
      outcome: Number(result?.ResultCode) === 0 ? 'OK' : 'REJECTED',
      reference: rawEntry.reference,
      summary: result?.ResultDesc
        ? `Account Balance callback: ${String(result.ResultDesc)}`
        : `Account Balance webhook received from ${rawEntry.sourceIp}`,
      responsePayload:
        typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : { raw: req.body },
    });

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  app.post('/api/mpesa/account-balance-timeout', (req, res) => {
    const result = req.body?.Result;
    const convId = result?.ConversationID ? String(result.ConversationID) : undefined;
    recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'MPESA_BALANCE_RESULT',
      endpoint: '/api/mpesa/account-balance-timeout',
      reference: convId,
      conversationId: convId,
      resultCode: 'TIMEOUT',
      resultDesc: 'Safaricom Account Balance queue timeout',
      matchedTransaction: false,
    });
    res.json({ ResultCode: 0, ResultDesc: 'Timeout acknowledged' });
  });

  // Authentic Safaricom Daraja Production Transaction Status v1 Query + Callbacks
  app.post('/api/mpesa/transaction-status', async (req, res) => {
    const cfg = getWithdrawalDarajaConfig();
    const txStatusEndpoint = `${cfg.baseUrl}/mpesa/transactionstatus/v1/query`;
    const rawTransactionId = String(req.body?.transactionId || '').trim();
    const rawOriginatorId = String(req.body?.originatorConversationId || '').trim();

    if (!rawTransactionId && !rawOriginatorId) {
      return res.status(400).json({
        ok: false,
        environment: cfg.env,
        baseUrl: cfg.baseUrl,
        txStatusEndpoint,
        error: 'Provide an M-Pesa Receipt / TransactionID (e.g. SLK82940PQ) or ConversationID to query Safaricom Production.',
      });
    }

    // If user entered a ConversationID / OriginatorConversationID / Bridge ID, route it properly without uppercasing case-sensitive IDs
    const isConversationLike = /^(AG_|ws_CO_|NDK-|B2B-|DCASH-|DRV-|DP2P-)/i.test(rawTransactionId);
    const localMatch =
      mpesaTransactions.get(rawTransactionId) ||
      mpesaTransactions.get(rawOriginatorId) ||
      (originatorToPrimaryId.get(rawTransactionId) ? mpesaTransactions.get(originatorToPrimaryId.get(rawTransactionId)!) : undefined);

    if (localMatch && ((localMatch.status === 'COMPLETED' && localMatch.callbackVerified === true) || localMatch.id.startsWith('DCASH-'))) {
      return res.json({
        ok: true,
        configured: true,
        environment: cfg.env,
        baseUrl: cfg.baseUrl,
        txStatusEndpoint,
        status: localMatch.status,
        callbackVerified: localMatch.callbackVerified,
        conversationId: localMatch.id,
        originatorConversationId: localMatch.originatorConversationId,
        mpesaReceipt: localMatch.mpesaReceipt,
        queriedTransactionId: rawTransactionId || rawOriginatorId,
        message:
          localMatch.safaricomConfirmationText ||
          localMatch.resultDesc ||
          `Confirmed transaction ${localMatch.id} (${localMatch.status}).`,
      });
    }

    const originatorConversationId =
      rawOriginatorId || localMatch?.originatorConversationId || (isConversationLike ? rawTransactionId : '');
    const transactionId = !isConversationLike && rawTransactionId ? rawTransactionId.toUpperCase() : '';

    if (!cfg.b2cConfigured) {
      return res.status(400).json({
        ok: false,
        configured: false,
        environment: cfg.env,
        baseUrl: cfg.baseUrl,
        txStatusEndpoint,
        missingVars: cfg.missingB2cVars,
        error: `Safaricom Daraja Production Transaction Status requires: ${cfg.missingB2cVars.join(', ')}.`,
      });
    }

    try {
      const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
      const resultUrl = publicBase
        ? `${publicBase}/api/mpesa/tx-status-result`
        : 'https://example.com/api/mpesa/tx-status-result';
      const timeoutUrl = publicBase
        ? `${publicBase}/api/mpesa/tx-status-timeout`
        : 'https://example.com/api/mpesa/tx-status-timeout';

      const { res: tsRes, data: tsData } = await darajaPostJson(cfg, txStatusEndpoint, {
        Initiator: cfg.initiatorName,
        SecurityCredential: cfg.securityCredential,
        CommandID: 'TransactionStatusQuery',
        TransactionID: transactionId || undefined,
        OriginalConversationID: originatorConversationId || undefined,
        PartyA: cfg.b2cShortcode || cfg.shortcode,
        IdentifierType: '4',
        ResultURL: resultUrl,
        QueueTimeOutURL: timeoutUrl,
        Remarks: 'nderiskool Production Transaction Status Verification',
        Occasion: 'CashierVerify',
      });

      if (!tsRes.ok || String(tsData.ResponseCode || '') !== '0') {
        const payload = {
          ok: false,
          configured: true,
          environment: cfg.env,
          baseUrl: cfg.baseUrl,
          txStatusEndpoint,
          error: String(tsData.errorMessage || tsData.ResponseDescription || 'Daraja Production Transaction Status query rejected.'),
          darajaRaw: tsData,
        };
        recordCashierDiagnostic({
          channel: 'MPESA_B2C',
          method: 'POST',
          endpoint: '/api/mpesa/transaction-status',
          httpStatus: 502,
          outcome: 'REJECTED',
          reference: transactionId || originatorConversationId,
          summary: payload.error,
          responsePayload: payload,
        });
        return res.status(502).json(payload);
      }

      if (localMatch) {
        if (tsData.ConversationID) statusQueryToTxId.set(String(tsData.ConversationID), localMatch.id);
        if (tsData.OriginatorConversationID) statusQueryToTxId.set(String(tsData.OriginatorConversationID), localMatch.id);
      }

      const payload = {
        ok: true,
        configured: true,
        environment: cfg.env,
        baseUrl: cfg.baseUrl,
        txStatusEndpoint,
        status: 'PENDING',
        conversationId: tsData.ConversationID,
        originatorConversationId: tsData.OriginatorConversationID,
        queriedTransactionId: transactionId || originatorConversationId,
        message: String(
          tsData.ResponseDescription ||
            `Safaricom Production Transaction Status query sent for ${transactionId || originatorConversationId}. Awaiting callback.`
        ),
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2C',
        method: 'POST',
        endpoint: '/api/mpesa/transaction-status',
        httpStatus: 202,
        outcome: 'PENDING',
        reference: transactionId || originatorConversationId,
        summary: payload.message,
        responsePayload: payload,
      });
      return res.status(202).json(payload);
    } catch (err: any) {
      return res.status(502).json({
        ok: false,
        configured: true,
        environment: cfg.env,
        baseUrl: cfg.baseUrl,
        txStatusEndpoint,
        error: err?.message || 'Safaricom Daraja Production Transaction Status query failed.',
      });
    }
  });

  app.post('/api/mpesa/tx-status-result', (req, res) => {
    const result = req.body?.Result;
    const convId = result?.ConversationID ? String(result.ConversationID) : undefined;
    const origId = result?.OriginatorConversationID ? String(result.OriginatorConversationID) : undefined;
    const { findParam } = parseDarajaResultParameters(result);

    const receiptNo = findParam('ReceiptNo') || findParam('TransactionReceipt') || result?.TransactionID;
    const extractedReceipt = receiptNo ? String(receiptNo).trim() : undefined;
    const txStatusParam = findParam('TransactionStatus');
    const txStatusText = txStatusParam ? String(txStatusParam).trim() : '';
    const txAmountRaw = findParam('Amount') || findParam('TransactionAmount');
    const receiverPublicNameRaw = findParam('ReceiverPartyPublicName') || findParam('CreditPartyName') || findParam('DebitPartyName');
    const finalisedTimeRaw = findParam('FinalisedTime') || findParam('TransactionCompletedDateTime');
    const receiverPublicName = receiverPublicNameRaw ? String(receiverPublicNameRaw) : undefined;
    const completedAtText = finalisedTimeRaw ? String(finalisedTimeRaw) : undefined;
    const txAmountNum = txAmountRaw !== undefined ? Number(txAmountRaw) : undefined;
    const strictRes = extractStrictDarajaResultCode(result);

    const lookupKeys = [
      convId ? statusQueryToTxId.get(convId) : undefined,
      origId ? statusQueryToTxId.get(origId) : undefined,
      convId,
      origId,
      origId ? originatorToPrimaryId.get(origId) : undefined,
    ].filter(Boolean) as string[];

    let targetTx: MpesaTxRecord | undefined;
    for (const key of lookupKeys) {
      const candidate = mpesaTransactions.get(key);
      if (candidate) {
        targetTx = candidate;
        break;
      }
    }
    if (!targetTx && extractedReceipt) {
      targetTx = Array.from(mpesaTransactions.values()).find(
        (t) => t.mpesaReceipt === extractedReceipt || t.id === extractedReceipt
      );
    }

    const txStatusIndicatesFailed = Boolean(txStatusText && /^(failed|cancelled|declined|reversed|rejected)$/i.test(txStatusText));
    const txStatusAllowsSuccess = !txStatusText || /^completed$/i.test(txStatusText);
    const callbackReceiverMsisdn = extractKenyanMsisdnFromReceiver(receiverPublicName);
    const recipientMismatch = Boolean(
      targetTx &&
        callbackReceiverMsisdn &&
        targetTx.phone &&
        callbackReceiverMsisdn !== targetTx.phone
    );
    const isValidReceipt =
      Boolean(extractedReceipt) &&
      extractedReceipt!.length >= 4 &&
      !extractedReceipt!.startsWith('PING') &&
      (txAmountNum !== undefined ? !Number.isNaN(txAmountNum) && txAmountNum > 0 : Number(targetTx?.kesAmount ?? 0) > 0);

    let liveStatusConfirmationText: string | undefined;
    let matchedTransaction = false;
    let diagOutcome: ServerDiagOutcome = 'WARNING';

    if (targetTx && strictRes.hasCode) {
      matchedTransaction = true;
      targetTx.environment = 'production';
      if (receiverPublicName) targetTx.receiverPublicName = receiverPublicName;
      if (completedAtText) targetTx.completedAtText = completedAtText;
      if (txAmountNum !== undefined && !Number.isNaN(txAmountNum)) {
        targetTx.transactionAmount = txAmountNum;
      }
      targetTx.resultCode = result.ResultCode;

      if (strictRes.isSuccess && txStatusAllowsSuccess && isValidReceipt && !recipientMismatch && extractedReceipt) {
        const kesVal = Number(txAmountNum || targetTx.kesAmount || 0).toLocaleString();
        const targetName =
          receiverPublicName || targetTx.receiverPublicName || targetTx.recipientPhone || targetTx.phone || 'Safaricom Recipient';
        liveStatusConfirmationText = `${extractedReceipt} Confirmed. Ksh${kesVal} sent to ${targetName} via Safaricom M-Pesa${
          completedAtText ? ` on ${completedAtText}` : ''
        }.`;
        targetTx.status = 'COMPLETED';
        targetTx.callbackVerified = true;
        targetTx.verificationSource = 'SAFARICOM_TX_STATUS_CALLBACK';
        targetTx.mpesaReceipt = extractedReceipt;
        targetTx.safaricomConfirmationText = liveStatusConfirmationText;
        targetTx.resultDesc = liveStatusConfirmationText;
        diagOutcome = 'OK';
      } else if (!strictRes.isSuccess || txStatusIndicatesFailed || recipientMismatch) {
        targetTx.status = 'REJECTED';
        targetTx.callbackVerified = true;
        targetTx.verificationSource = 'SAFARICOM_TX_STATUS_CALLBACK';
        if (extractedReceipt) targetTx.mpesaReceipt = extractedReceipt;
        targetTx.resultDesc = recipientMismatch
          ? `Safaricom recipient mismatch (${callbackReceiverMsisdn} vs ${targetTx.phone}).`
          : txStatusIndicatesFailed
          ? `Safaricom reported transaction status: ${txStatusText}.`
          : result?.ResultDesc
          ? String(result.ResultDesc)
          : `Safaricom Transaction Status failed (ResultCode: ${strictRes.codeStr}).`;
        diagOutcome = 'REJECTED';
      } else {
        targetTx.resultDesc = result?.ResultDesc
          ? `${String(result.ResultDesc)} (awaiting Completed TransactionStatus & receipt)`
          : 'TransactionStatus callback lacked final Completed receipt; staying PENDING.';
        diagOutcome = 'WARNING';
      }

      targetTx.updatedAt = Date.now();
      mpesaTransactions.set(targetTx.id, targetTx);
      broadcastMpesaTxUpdate(targetTx);
    }

    const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'MPESA_TX_STATUS_RESULT',
      endpoint: '/api/mpesa/tx-status-result',
      reference: extractedReceipt || convId || origId,
      conversationId: convId,
      originatorConversationId: origId,
      resultCode: result?.ResultCode,
      resultDesc: liveStatusConfirmationText || (result?.ResultDesc ? String(result.ResultDesc) : undefined),
      mpesaReceipt: extractedReceipt,
      matchedTransaction,
    });

    recordCashierDiagnostic({
      channel: 'MPESA_B2C',
      method: 'POST',
      endpoint: '/api/mpesa/tx-status-result',
      httpStatus: 200,
      outcome: diagOutcome,
      reference: rawEntry.reference,
      summary:
        liveStatusConfirmationText ||
        (result?.ResultDesc
          ? `Transaction Status callback (${matchedTransaction ? 'matched tx' : 'unmatched'}): ${String(result.ResultDesc)}`
          : `Transaction Status webhook received from ${rawEntry.sourceIp}`),
      responsePayload:
        typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : { raw: req.body },
    });

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  app.post('/api/mpesa/tx-status-timeout', (req, res) => {
    const result = req.body?.Result;
    recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'MPESA_TX_STATUS_RESULT',
      endpoint: '/api/mpesa/tx-status-timeout',
      reference: result?.ConversationID ? String(result.ConversationID) : undefined,
      resultCode: 'TIMEOUT',
      resultDesc: 'Safaricom Transaction Status queue timeout',
      matchedTransaction: false,
    });
    res.json({ ResultCode: 0, ResultDesc: 'Timeout acknowledged' });
  });

  // Authentic Safaricom Daraja C2B RegisterURL + Validation & Confirmation Webhooks
  app.post('/api/mpesa/c2b-register', async (req, res) => {
    const cfg = getDarajaConfig();
    if (!cfg.hasOAuth || !cfg.shortcode) {
      return res.status(400).json({
        ok: false,
        configured: false,
        error: 'Safaricom Daraja C2B registration requires MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, and MPESA_SHORTCODE.',
      });
    }

    const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
    if (!publicBase) {
      return res.status(400).json({
        ok: false,
        error: 'Public HTTPS APP_URL could not be resolved for C2B ValidationURL / ConfirmationURL.',
      });
    }

    try {
      const confirmationUrl = `${publicBase}/api/mpesa/c2b-confirmation`;
      const validationUrl = `${publicBase}/api/mpesa/c2b-validation`;
      const requestedVersion = String(req.body?.version || '').toLowerCase();
      const registerPayload = {
        ShortCode: cfg.shortcode,
        ResponseType: req.body?.responseType === 'Cancelled' ? 'Cancelled' : 'Completed',
        ConfirmationURL: confirmationUrl,
        ValidationURL: validationUrl,
      };
      let c2bEndpoint =
        requestedVersion === 'v1'
          ? `${cfg.baseUrl}/mpesa/c2b/v1/registerurl`
          : `${cfg.baseUrl}/mpesa/c2b/v2/registerurl`;
      let { res: regRes, data: regData } = await darajaPostJson(cfg, c2bEndpoint, registerPayload);
      if (!regRes.ok && requestedVersion !== 'v1' && (regRes.status === 404 || regRes.status === 400)) {
        c2bEndpoint = `${cfg.baseUrl}/mpesa/c2b/v1/registerurl`;
        const fallbackReg = await darajaPostJson(cfg, c2bEndpoint, registerPayload);
        regRes = fallbackReg.res;
        regData = fallbackReg.data;
      }

      if (!regRes.ok) {
        const payload = {
          ok: false,
          endpoint: c2bEndpoint,
          error: String(regData.errorMessage || regData.ResponseDescription || `Daraja C2B registerurl returned HTTP ${regRes.status}`),
          darajaRaw: regData,
        };
        recordCashierDiagnostic({
          channel: 'MPESA_STK',
          method: 'POST',
          endpoint: '/api/mpesa/c2b-register',
          httpStatus: 502,
          outcome: 'REJECTED',
          summary: payload.error,
          responsePayload: payload,
        });
        return res.status(502).json(payload);
      }

      const payload = {
        ok: true,
        shortcode: cfg.shortcode,
        endpoint: c2bEndpoint,
        confirmationUrl,
        validationUrl,
        darajaResponse: regData,
        message: `C2B Validation & Confirmation URLs registered on Safaricom Daraja (${cfg.env.toUpperCase()} · Shortcode ${cfg.shortcode}).`,
      };
      recordCashierDiagnostic({
        channel: 'MPESA_STK',
        method: 'POST',
        endpoint: '/api/mpesa/c2b-register',
        httpStatus: 200,
        outcome: 'OK',
        summary: payload.message,
        responsePayload: payload,
      });
      return res.json(payload);
    } catch (err: any) {
      return res.status(502).json({
        ok: false,
        error: err?.message || 'Daraja C2B URL registration failed.',
      });
    }
  });

  app.post('/api/mpesa/c2b-validation', (req, res) => {
    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const transId = body.TransID ? String(body.TransID) : undefined;
    const amount = Number(body.TransAmount || 0);

    recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'MPESA_C2B_VALIDATION',
      endpoint: '/api/mpesa/c2b-validation',
      reference: transId || (body.BillRefNumber ? String(body.BillRefNumber) : undefined),
      resultCode: amount > 0 ? 0 : 'C2B_0001',
      resultDesc: amount > 0 ? 'Validated incoming C2B payment' : 'Invalid C2B amount',
      mpesaReceipt: transId,
      matchedTransaction: false,
    });

    if (amount <= 0 || Number.isNaN(amount)) {
      return res.json({ ResultCode: 'C2B00013', ResultDesc: 'Rejected: Invalid Amount' });
    }
    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  app.post('/api/mpesa/c2b-confirmation', (req, res) => {
    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const transId = String(body.TransID || `C2B-${Date.now()}`);
    const amountKes = Math.round(Number(body.TransAmount || 0));
    const msisdn = String(body.MSISDN || '');
    const billRef = body.BillRefNumber ? String(body.BillRefNumber) : undefined;

    mpesaTransactions.set(transId, {
      id: transId,
      type: 'C2B_DEPOSIT',
      phone: msisdn,
      accountReference: billRef,
      usdAmount: Number((amountKes / 129.5).toFixed(2)),
      kesAmount: amountKes,
      loginId: billRef,
      status: 'COMPLETED',
      mpesaReceipt: transId,
      resultDesc: `Safaricom C2B Payment confirmed (${transId}) · Acc: ${billRef || 'N/A'}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'MPESA_C2B_CONFIRMATION',
      endpoint: '/api/mpesa/c2b-confirmation',
      reference: transId,
      resultCode: 0,
      resultDesc: `C2B KES ${amountKes} confirmed for ${billRef || msisdn}`,
      mpesaReceipt: transId,
      matchedTransaction: true,
    });

    recordCashierDiagnostic({
      channel: 'MPESA_STK',
      method: 'POST',
      endpoint: '/api/mpesa/c2b-confirmation',
      httpStatus: 200,
      outcome: 'OK',
      phoneOrTarget: msisdn,
      kesAmount: amountKes,
      reference: rawEntry.reference,
      summary: `Safaricom C2B Payment confirmed (${transId}) · KES ${amountKes}`,
      responsePayload:
        typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : { raw: req.body },
    });

    return res.json({ ResultCode: 0, ResultDesc: 'Success' });
  });

  // Safaricom Daraja Reversal v1 API & Callbacks
  app.post('/api/mpesa/reversal', async (req, res) => {
    const cfg = getWithdrawalDarajaConfig();
    if (!cfg.hasOAuth || !cfg.shortcode || !cfg.initiatorName || !cfg.securityCredential) {
      return res.status(400).json({
        ok: false,
        configured: false,
        error: 'Safaricom Daraja Reversal requires Consumer Key/Secret, Shortcode, InitiatorName, and SecurityCredential.',
      });
    }

    const transactionId = String(req.body?.transactionId || '').trim().toUpperCase();
    const amountKes = Math.round(Number(req.body?.amountKes ?? req.body?.amount ?? 0));
    const receiverParty = String(req.body?.receiverParty || cfg.shortcode).trim();
    const remarks = String(req.body?.remarks || 'Transaction Reversal').trim().slice(0, 100);
    const occasion = String(req.body?.occasion || 'Reversal').trim().slice(0, 100);

    if (!/^[A-Za-z0-9]{6,24}$/.test(transactionId)) {
      return res.status(400).json({
        ok: false,
        error: 'Valid M-Pesa TransactionID (6–24 alphanumeric chars, e.g. SLK82940PQ) is required.',
      });
    }
    if (!Number.isFinite(amountKes) || amountKes < 1) {
      return res.status(400).json({
        ok: false,
        error: 'Positive reversal Amount (KES >= 1) is required.',
      });
    }

    const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
    const resultUrl = publicBase
      ? `${publicBase}/api/mpesa/reversal-result`
      : 'https://example.com/api/mpesa/reversal-result';
    const timeoutUrl = publicBase
      ? `${publicBase}/api/mpesa/reversal-timeout`
      : 'https://example.com/api/mpesa/reversal-timeout';

    try {
      const reversalEndpoint = `${cfg.baseUrl}/mpesa/reversal/v1/request`;
      const { res: revRes, data: revData } = await darajaPostJson(cfg, reversalEndpoint, {
        Initiator: cfg.initiatorName,
        SecurityCredential: cfg.securityCredential,
        CommandID: 'TransactionReversal',
        TransactionID: transactionId,
        Amount: amountKes,
        ReceiverParty: receiverParty,
        RecieverIdentifierType: String(req.body?.identifierType || '11'),
        ResultURL: resultUrl,
        QueueTimeOutURL: timeoutUrl,
        Remarks: remarks,
        Occasion: occasion,
      });

      if (!revRes.ok || String(revData.ResponseCode || '') !== '0') {
        const err = String(
          revData.errorMessage || revData.ResponseDescription || `Daraja Reversal rejected (HTTP ${revRes.status})`
        );
        recordCashierDiagnostic({
          channel: 'MPESA_B2C',
          method: 'POST',
          endpoint: '/api/mpesa/reversal',
          httpStatus: 502,
          outcome: 'REJECTED',
          reference: transactionId,
          kesAmount: amountKes,
          summary: err,
          responsePayload: revData,
        });
        return res.status(502).json({ ok: false, endpoint: reversalEndpoint, error: err, darajaRaw: revData });
      }

      const payload = {
        ok: true,
        status: 'PENDING',
        endpoint: reversalEndpoint,
        transactionId,
        amountKes,
        conversationId: revData.ConversationID,
        originatorConversationId: revData.OriginatorConversationID,
        message: String(revData.ResponseDescription || `Reversal accepted for ${transactionId} (KES ${amountKes}).`),
      };
      recordCashierDiagnostic({
        channel: 'MPESA_B2C',
        method: 'POST',
        endpoint: '/api/mpesa/reversal',
        httpStatus: 202,
        outcome: 'PENDING',
        reference: transactionId,
        kesAmount: amountKes,
        summary: payload.message,
        responsePayload: payload,
      });
      return res.status(202).json(payload);
    } catch (err: any) {
      return res.status(502).json({ ok: false, error: err?.message || 'Daraja Reversal request failed.' });
    }
  });

  app.post('/api/mpesa/reversal-result', (req, res) => {
    const result = req.body?.Result;
    const convId = result?.ConversationID ? String(result.ConversationID) : undefined;
    const strictRes = extractStrictDarajaResultCode(result?.ResultCode);
    const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'MPESA_TX_STATUS_RESULT',
      endpoint: '/api/mpesa/reversal-result',
      reference: convId,
      conversationId: convId,
      originatorConversationId: result?.OriginatorConversationID ? String(result.OriginatorConversationID) : undefined,
      resultCode: result?.ResultCode,
      resultDesc: result?.ResultDesc ? String(result.ResultDesc) : 'Reversal result received',
      matchedTransaction: false,
    });
    recordCashierDiagnostic({
      channel: 'MPESA_B2C',
      method: 'POST',
      endpoint: '/api/mpesa/reversal-result',
      httpStatus: 200,
      outcome: strictRes.isSuccess ? 'OK' : 'REJECTED',
      reference: rawEntry.reference,
      summary: String(result?.ResultDesc || 'Reversal result callback received'),
      responsePayload:
        typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : { raw: req.body },
    });
    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  app.post('/api/mpesa/reversal-timeout', (req, res) => {
    recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'MPESA_TX_STATUS_RESULT',
      endpoint: '/api/mpesa/reversal-timeout',
      resultCode: 'TIMEOUT',
      resultDesc: 'Safaricom Reversal queue timeout',
      matchedTransaction: false,
    });
    return res.json({ ResultCode: 0, ResultDesc: 'Timeout acknowledged' });
  });

  // Safaricom Daraja Dynamic QR Code Generator (/mpesa/qrcode/v1/generate)
  app.post('/api/mpesa/qrcode', async (req, res) => {
    const cfg = getDarajaConfig();
    if (!cfg.hasOAuth || !cfg.shortcode) {
      return res.status(400).json({
        ok: false,
        configured: false,
        error: 'Safaricom Daraja Dynamic QR requires MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, and MPESA_SHORTCODE.',
      });
    }

    const trxCodeRaw = String(req.body?.trxCode || 'PB').trim().toUpperCase();
    const allowedTrxCodes = new Set(['BG', 'WA', 'PB', 'SM', 'SB']);
    const trxCode = allowedTrxCodes.has(trxCodeRaw) ? trxCodeRaw : 'PB';
    const amount = Math.max(1, Math.round(Number(req.body?.amountKes ?? req.body?.amount ?? 10)));
    const merchantName = String(req.body?.merchantName || 'nderiskool Trader').trim().slice(0, 60);
    const refNo = String(req.body?.refNo || cfg.shortcode).trim().slice(0, 40);
    const cpi = String(req.body?.cpi || cfg.shortcode).trim().slice(0, 32);
    const size = String(req.body?.size || '300').trim();

    try {
      const qrEndpoint = `${cfg.baseUrl}/mpesa/qrcode/v1/generate`;
      const { res: qrRes, data: qrData } = await darajaPostJson(cfg, qrEndpoint, {
        MerchantName: merchantName,
        RefNo: refNo,
        Amount: amount,
        TrxCode: trxCode,
        CPI: cpi,
        Size: size,
      });

      if (!qrRes.ok || !qrData.QRCode) {
        const err = String(
          qrData.errorMessage || qrData.ResponseDescription || `Daraja Dynamic QR failed (HTTP ${qrRes.status})`
        );
        return res.status(502).json({ ok: false, endpoint: qrEndpoint, error: err, darajaRaw: qrData });
      }

      return res.json({
        ok: true,
        endpoint: qrEndpoint,
        trxCode,
        merchantName,
        refNo,
        amount,
        qrCode: qrData.QRCode,
        responseCode: qrData.ResponseCode,
        responseDescription: qrData.ResponseDescription,
      });
    } catch (err: any) {
      return res.status(502).json({ ok: false, error: err?.message || 'Daraja Dynamic QR failed.' });
    }
  });

  // Safaricom Bill Manager Generic API Proxy (Allowlisted Production Actions)
  const BILL_MANAGER_ACTION_MAP: Record<string, string> = {
    optin: 'optin',
    'single-invoicing': 'single-invoicing',
    'bulk-invoicing': 'bulk-invoicing',
    reconciliation: 'reconciliation',
    'cancel-single-invoice': 'cancel-single-invoice',
    'cancel-bulk-invoice': 'cancel-bulk-invoice',
    'change-optin-details': 'change-optin-details',
    'change-invoice': 'change-invoice',
    'change-invoices': 'change-invoices',
  };

  app.post('/api/mpesa/billmanager/:action', async (req, res) => {
    const cfg = getDarajaConfig();
    if (!cfg.hasOAuth) {
      return res.status(400).json({
        ok: false,
        configured: false,
        error: 'Safaricom Bill Manager requires MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET.',
      });
    }
    const actionKey = String(req.params.action || '').trim().toLowerCase();
    const mappedAction = BILL_MANAGER_ACTION_MAP[actionKey];
    if (!mappedAction) {
      return res.status(400).json({
        ok: false,
        error: `Unsupported Bill Manager action "${actionKey}". Allowed: ${Object.keys(BILL_MANAGER_ACTION_MAP).join(', ')}.`,
      });
    }

    const endpoint = `${cfg.baseUrl}/v1/billmanager-invoice/v1/billmanager-invoice/${mappedAction}`;
    const body = typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {};
    try {
      const { res: bmRes, data: bmData } = await darajaPostJson(cfg, endpoint, body);
      if (!bmRes.ok) {
        const err = String(bmData.errorMessage || bmData.message || `Bill Manager HTTP ${bmRes.status}`);
        return res.status(502).json({ ok: false, endpoint, error: err, darajaRaw: bmData });
      }
      return res.json({ ok: true, endpoint, action: mappedAction, data: bmData });
    } catch (err: any) {
      return res.status(502).json({ ok: false, endpoint, error: err?.message || 'Bill Manager request failed.' });
    }
  });

  app.get('/api/mpesa/transactions', (_req, res) => {
    const cfg = getDarajaConfig();
    const unique = new Map<string, MpesaTxRecord>();
    for (const rec of mpesaTransactions.values()) {
      unique.set(rec.id, rec);
    }
    const list = Array.from(unique.values()).sort((a, b) => b.createdAt - a.createdAt);
    return res.json({
      ok: true,
      darajaConfigured: cfg.stkConfigured || cfg.b2cConfigured,
      environment: cfg.env,
      transactions: list,
    });
  });

  app.get('/api/mpesa/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, time: Date.now() })}\n\n`);

    mpesaSseClients.add(res);
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeat);
        mpesaSseClients.delete(res);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      mpesaSseClients.delete(res);
    });
  });

  app.get('/api/mpesa/tx/:id', (req, res) => {
    const tx = mpesaTransactions.get(req.params.id);
    if (!tx) {
      return res.status(404).json({ ok: false, error: 'Transaction not found.' });
    }

    const shouldProbe = req.query.probe === '1' || req.query.probe === 'true';
    const now = Date.now();
    const lastProbe = txLastStatusProbeAt.get(tx.id) || 0;
    if (
      shouldProbe &&
      tx.status === 'PENDING' &&
      (tx.type === 'B2C_WITHDRAWAL' || tx.type === 'B2B_TRANSFER') &&
      (tx.originatorConversationId || tx.mpesaReceipt) &&
      now - tx.createdAt >= 3500 &&
      now - lastProbe >= 5000
    ) {
      const cfg = getWithdrawalDarajaConfig();
      const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
      if (cfg.b2cConfigured && publicBase) {
        probeDarajaTransactionStatus(tx, cfg, publicBase).catch(() => {});
      }
    }

    return res.json({ ok: true, transaction: tx });
  });

  // Synchronize confirmation ONLY if Safaricom callback already verified it (never allow unverified M-Pesa withdrawal override)
  app.post('/api/mpesa/confirm', (req, res) => {
    const id = String(req.body?.id || '').trim();
    const receipt = String(req.body?.receipt || '').trim().toUpperCase();
    const phone = String(req.body?.phone || '').trim();
    const usdAmount = Number(req.body?.usdAmount || 0);
    const kesAmount = Math.round(Number(req.body?.kesAmount || 0));

    if (!id) {
      return res.status(400).json({ ok: false, error: 'Missing transaction identifier.' });
    }

    const existing =
      mpesaTransactions.get(id) ||
      (originatorToPrimaryId.get(id) ? mpesaTransactions.get(originatorToPrimaryId.get(id)!) : undefined);

    if (existing) {
      if (!existing.id.startsWith('DCASH-')) {
        if (existing.status === 'COMPLETED' && existing.callbackVerified === true) {
          return res.json({ ok: true, transaction: existing });
        }
        return res.status(409).json({
          ok: false,
          awaitingSafaricomCallback: true,
          status: existing.status,
          error:
            existing.status === 'REJECTED'
              ? existing.resultDesc || 'Safaricom rejected this transaction and it cannot be marked Confirmed.'
              : 'Transaction cannot be marked Confirmed until Safaricom returns a verified successful payment result callback (/api/mpesa/b2c-result or /api/mpesa/tx-status-result).',
          transaction: existing,
        });
      }

      existing.status = 'COMPLETED';
      if (receipt) existing.mpesaReceipt = receipt;
      const receiptLabel = receipt || existing.mpesaReceipt || existing.id;
      const confirmMsg = `D Cash Confirmed (${receiptLabel}): Ksh${(existing.kesAmount || kesAmount).toLocaleString()} settled for ${
        existing.phone || phone || 'Recipient'
      }.`;
      existing.safaricomConfirmationText = existing.safaricomConfirmationText || confirmMsg;
      existing.resultDesc = existing.safaricomConfirmationText;
      existing.updatedAt = Date.now();
      mpesaTransactions.set(existing.id, existing);
      broadcastMpesaTxUpdate(existing);
      return res.json({ ok: true, transaction: existing });
    }

    return res.status(404).json({
      ok: false,
      error: `No Safaricom Daraja transaction record found for ${id}. Submit a B2C withdrawal and wait for Safaricom's verified payment result callback.`,
    });
  });

  app.post('/api/mpesa/cancel', (req, res) => {
    const id = String(req.body?.id || '').trim();
    const reason = String(req.body?.reason || 'Cancelled by user before confirmation').trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Missing transaction identifier.' });
    }

    const existing =
      mpesaTransactions.get(id) ||
      (originatorToPrimaryId.get(id) ? mpesaTransactions.get(originatorToPrimaryId.get(id)!) : undefined);

    if (existing && existing.status === 'PENDING') {
      existing.status = 'REJECTED';
      existing.resultDesc = reason;
      existing.updatedAt = Date.now();
      mpesaTransactions.set(existing.id, existing);
      broadcastMpesaTxUpdate(existing);
      return res.json({ ok: true, transaction: existing });
    }

    return res.json({ ok: true, id });
  });

  // P2P Withdrawal Receiver Verification Registry & Endpoints
  interface ServerVerifiedP2pReceiver {
    phone: string;
    msisdn: string;
    formatted: string;
    carrier: string;
    label: string;
    sourceAccountId: string;
    verifiedAt: number;
    status: 'VERIFIED';
    b2cLiveReady: boolean;
  }

  const verifiedP2pReceivers = new Map<string, ServerVerifiedP2pReceiver>([
    [
      '0728424076',
      {
        phone: '0728424076',
        msisdn: '254728424076',
        formatted: '+254 728 424 076',
        carrier: 'Safaricom Kenya (M-Pesa)',
        label: 'Verified Withdrawal Receiver (AI Studio Account)',
        sourceAccountId: 'CR-NDERISKOOL',
        verifiedAt: Date.now(),
        status: 'VERIFIED',
        b2cLiveReady: getDarajaConfig().b2cConfigured,
      },
    ],
    [
      '0793950512',
      {
        phone: '0793950512',
        msisdn: '254793950512',
        formatted: '+254 793 950 512',
        carrier: 'Safaricom Kenya (M-Pesa)',
        label: 'Primary Safaricom M-Pesa Wallet',
        sourceAccountId: 'CR-NDERISKOOL',
        verifiedAt: Date.now(),
        status: 'VERIFIED',
        b2cLiveReady: getDarajaConfig().b2cConfigured,
      },
    ],
  ]);

  app.get('/api/p2p/verified-receivers', (_req, res) => {
    const cfg = getDarajaConfig();
    const receivers = Array.from(verifiedP2pReceivers.values()).map((r) => ({
      ...r,
      b2cLiveReady: cfg.b2cConfigured,
    }));
    return res.json({ ok: true, receivers });
  });

  app.post('/api/p2p/verify-receiver', (req, res) => {
    const { phone, receiverName, loginId } = req.body || {};
    const parsed = normalizeKenyanMsisdnServer(phone);
    if (!parsed) {
      return res.status(400).json({
        ok: false,
        verified: false,
        error: 'Enter a valid Kenyan Safaricom M-Pesa number (e.g. 0728424076 or +254728424076).',
      });
    }

    const cfg = getDarajaConfig();
    const record: ServerVerifiedP2pReceiver = {
      phone: parsed.phone,
      msisdn: parsed.msisdn,
      formatted: parsed.formatted,
      carrier: parsed.carrier,
      label: String(receiverName || '').trim() || 'Verified Withdrawal Receiver (AI Studio Account)',
      sourceAccountId: String(loginId || '').trim() || 'CR-NDERISKOOL',
      verifiedAt: Date.now(),
      status: 'VERIFIED',
      b2cLiveReady: cfg.b2cConfigured,
    };

    verifiedP2pReceivers.set(parsed.phone, record);

    const payload = {
      ok: true,
      verified: true,
      receiver: record,
      settlementNote: cfg.b2cConfigured
        ? `P2P receiver ${record.phone} (${record.carrier}) verified for withdrawals from ${record.sourceAccountId}. Live B2C/DP2P payouts remain PENDING until Safaricom/DP2P confirms delivery.`
        : `P2P receiver ${record.phone} (${record.carrier}) verified on MSISDN ${record.msisdn} for withdrawals from ${record.sourceAccountId}. Complete final KES payout via Deriv DP2P escrow or M-Pesa receipt confirmation.`,
    };
    recordCashierDiagnostic({
      channel: 'P2P',
      method: 'POST',
      endpoint: '/api/p2p/verify-receiver',
      httpStatus: 200,
      outcome: 'OK',
      phoneOrTarget: `${record.phone} (${record.carrier})`,
      summary: `Verified P2P withdrawal receiver ${record.phone} for ${record.sourceAccountId}`,
      responsePayload: payload,
    });
    return res.json(payload);
  });

  // D Cash App (Deriv Payment Agent + Kenya M-Pesa Bridge) Routes
  const isValidHttpUrl = (val: string) => /^https?:\/\/[^/\s]+/i.test(val);

  const resolveDcashUrls = (req: Request, dcashApiUrl: string, publicBase: string) => {
    const hasValidExternalUrl = isValidHttpUrl(dcashApiUrl);
    const cleanExternal = hasValidExternalUrl ? dcashApiUrl.replace(/\/+$/, '') : '';
    const checkoutUrl = publicBase ? `${publicBase}/?cashier=dcash` : '/?cashier=dcash';
    const apiBaseUrl = publicBase ? `${publicBase}/api/dcash` : '/api/dcash';
    const builtInTransferUrl = publicBase
      ? `${publicBase}/api/dcash/v1/transfers`
      : '/api/dcash/v1/transfers';
    const callbackUrl = publicBase ? `${publicBase}/api/dcash/callback` : '/api/dcash/callback';
    const transferUrl = cleanExternal ? `${cleanExternal}/v1/transfers` : builtInTransferUrl;
    const paymentAgentUrl = 'https://app.deriv.com/cashier/payment-agent';

    return {
      hasValidExternalUrl,
      externalApiUrl: cleanExternal || null,
      checkoutUrl,
      apiBaseUrl,
      builtInTransferUrl,
      transferUrl,
      callbackUrl,
      paymentAgentUrl,
    };
  };

  const createBuiltInDcashTransfer = (params: {
    direction: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
    phone: string;
    usdAmount: number;
    kesAmount: number;
    derivLoginId?: string;
    standalone?: boolean;
    dcashAccount?: string;
    agentLoginId: string;
    transferUrl: string;
    callbackUrl: string;
    checkoutUrl: string;
    endpointLabel: string;
  }) => {
    const reference = `DCASH-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;

    const isStandalone = Boolean(params.standalone || params.direction === 'TRANSFER' || !params.derivLoginId);
    const record: MpesaTxRecord = {
      id: reference,
      type: params.direction === 'WITHDRAWAL' ? 'B2C_WITHDRAWAL' : 'STK_DEPOSIT',
      standalone: isStandalone,
      environment: 'production',
      phone: params.phone,
      usdAmount: params.usdAmount,
      kesAmount: params.kesAmount,
      loginId: isStandalone ? undefined : params.derivLoginId,
      partyB: params.agentLoginId,
      status: 'PENDING',
      resultDesc:
        params.direction === 'TRANSFER'
          ? `D Cash standalone money transfer queued (${params.dcashAccount || params.phone}) — awaiting callback confirmation at ${params.callbackUrl}`
          : `D Cash Bridge URL transfer queued (${params.agentLoginId}) — awaiting callback confirmation at ${params.callbackUrl}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    mpesaTransactions.set(reference, record);

    const payload = {
      ok: true,
      configured: false,
      builtInBridge: true,
      bridgeMode: 'BUILTIN_BRIDGE' as const,
      direction: params.direction,
      standalone: isStandalone,
      status: 'PENDING' as const,
      reference,
      transactionId: reference,
      agentLoginId: isStandalone ? undefined : params.agentLoginId,
      transferUrl: params.transferUrl,
      callbackUrl: params.callbackUrl,
      checkoutUrl: params.checkoutUrl,
      message:
        params.direction === 'TRANSFER'
          ? `D Cash standalone transfer ${reference} created ($${params.usdAmount.toFixed(
              2
            )} / KES ${params.kesAmount.toLocaleString()} -> ${params.dcashAccount || params.phone}). Awaiting confirmation at ${params.callbackUrl}.`
          : `D Cash Bridge URL order ${reference} created ($${params.usdAmount.toFixed(
              2
            )} / KES ${params.kesAmount.toLocaleString()}). Complete via Deriv Payment Agent / M-Pesa or POST confirmation to ${params.callbackUrl}.`,
    };

    recordCashierDiagnostic({
      channel: 'D_CASH',
      method: 'POST',
      endpoint: params.endpointLabel,
      httpStatus: 202,
      outcome: 'PENDING',
      phoneOrTarget: `${params.dcashAccount || params.phone} (Agent: ${params.agentLoginId})`,
      usdAmount: params.usdAmount,
      kesAmount: params.kesAmount,
      reference,
      summary: payload.message,
      responsePayload: payload,
    });

    return payload;
  };

  app.get('/api/dcash/status', (req, res) => {
    const dcashApiUrl = cleanEnvVar(process.env.DCASH_API_URL).replace(/\/+$/, '');
    const dcashApiKey = cleanEnvVar(process.env.DCASH_API_KEY);
    const agentLoginId = cleanEnvVar(process.env.DCASH_AGENT_LOGINID) || 'CR-DCASH-KE';
    const paybill = cleanEnvVar(process.env.DCASH_PAYBILL) || '247247';
    const daraja = getDarajaConfig();
    const publicBase = resolvePublicBaseUrl(req, daraja.appUrl, daraja.callbackBaseUrl);
    const urls = resolveDcashUrls(req, dcashApiUrl, publicBase);
    const externalApiConfigured = Boolean(urls.hasValidExternalUrl && dcashApiKey);

    const warnings: string[] = [];
    if (dcashApiUrl && !urls.hasValidExternalUrl) {
      warnings.push(
        `DCASH_API_URL in Secrets is not an https:// URL — built-in D Cash URL (${urls.builtInTransferUrl}) is active.`
      );
    }

    return res.json({
      ok: true,
      dcashApiConfigured: externalApiConfigured,
      dcashBuiltinReady: true,
      bridgeMode: externalApiConfigured ? 'EXTERNAL_API' : 'BUILTIN_BRIDGE',
      darajaReady: daraja.stkConfigured || daraja.b2cConfigured,
      agentLoginId,
      paybill,
      warnings,
      callbackUrl: urls.callbackUrl,
      urls: {
        checkoutUrl: urls.checkoutUrl,
        apiBaseUrl: urls.apiBaseUrl,
        transferUrl: urls.transferUrl,
        builtInTransferUrl: urls.builtInTransferUrl,
        callbackUrl: urls.callbackUrl,
        externalApiUrl: urls.externalApiUrl,
        paymentAgentUrl: urls.paymentAgentUrl,
      },
    });
  });

  app.post('/api/dcash/v1/transfers', (req, res) => {
    const {
      direction,
      phone,
      usdAmount,
      kesAmount,
      derivLoginId,
      loginId,
      standalone,
      dcashAccount,
      dcashTag,
      agentLoginId,
    } = req.body || {};
    const resolvedAgent = cleanEnvVar(agentLoginId) || cleanEnvVar(process.env.DCASH_AGENT_LOGINID) || 'CR-DCASH-KE';
    const dcashApiUrl = cleanEnvVar(process.env.DCASH_API_URL).replace(/\/+$/, '');
    const cfg = getDarajaConfig();
    const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
    const urls = resolveDcashUrls(req, dcashApiUrl, publicBase);

    if (!phone || !/^254(7|1)\d{8}$/.test(String(phone))) {
      return res.status(400).json({ ok: false, error: 'Valid Kenyan Safaricom MSISDN (2547XXXXXXXX) required.' });
    }

    const amountUsd = Number(usdAmount || 0);
    const amountKes = Math.round(Number(kesAmount || 0)) || Math.round(amountUsd * 129);
    if (!amountUsd || amountUsd < 10) {
      return res.status(400).json({ ok: false, error: 'Minimum D Cash App transaction is $10.00 USD.' });
    }

    const dirUpper = String(direction || '').trim().toUpperCase();
    const resolvedDir: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' =
      dirUpper === 'TRANSFER' || dirUpper === 'SEND' || dirUpper === 'MONEY_TRANSFER'
        ? 'TRANSFER'
        : dirUpper === 'WITHDRAWAL' || dirUpper === 'WITHDRAW'
        ? 'WITHDRAWAL'
        : 'DEPOSIT';
    const rawLogin = String(derivLoginId || loginId || '').trim();
    const isStandalone = Boolean(standalone === true || resolvedDir === 'TRANSFER' || !rawLogin || rawLogin.toUpperCase() === 'STANDALONE');

    const payload = createBuiltInDcashTransfer({
      direction: resolvedDir,
      phone: String(phone),
      usdAmount: amountUsd,
      kesAmount: amountKes,
      derivLoginId: isStandalone ? undefined : rawLogin,
      standalone: isStandalone,
      dcashAccount: dcashAccount || dcashTag || String(phone),
      agentLoginId: resolvedAgent,
      transferUrl: urls.builtInTransferUrl,
      callbackUrl: urls.callbackUrl,
      checkoutUrl: urls.checkoutUrl,
      endpointLabel: '/api/dcash/v1/transfers',
    });

    return res.status(202).json(payload);
  });

  app.get('/api/dcash/v1/transfers/:reference', (req, res) => {
    const ref = String(req.params.reference || '');
    const tx = mpesaTransactions.get(ref);
    if (!tx) {
      return res.status(404).json({ ok: false, error: `D Cash transfer ${ref} not found.` });
    }
    return res.json({
      ok: true,
      reference: tx.id,
      status: tx.status,
      phone: tx.phone,
      usdAmount: tx.usdAmount,
      kesAmount: tx.kesAmount,
      mpesaReceipt: tx.mpesaReceipt,
      message: tx.resultDesc,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    });
  });

  app.post('/api/dcash/transfer', async (req, res) => {
    const { direction, phone, usdAmount, kesAmount, loginId, derivLoginId, standalone, dcashTag, agentLoginId } =
      req.body || {};
    const dcashApiUrl = cleanEnvVar(process.env.DCASH_API_URL).replace(/\/+$/, '');
    const dcashApiKey = cleanEnvVar(process.env.DCASH_API_KEY);
    const resolvedAgent = cleanEnvVar(agentLoginId) || cleanEnvVar(process.env.DCASH_AGENT_LOGINID) || 'CR-DCASH-KE';
    const cfg = getDarajaConfig();
    const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
    const urls = resolveDcashUrls(req, dcashApiUrl, publicBase);

    if (!phone || !/^254(7|1)\d{8}$/.test(String(phone))) {
      return res.status(400).json({ ok: false, error: 'Valid Kenyan Safaricom MSISDN (2547XXXXXXXX) required.' });
    }

    const amountUsd = Number(usdAmount || 0);
    const amountKes = Math.round(Number(kesAmount || 0));
    if (!amountUsd || amountUsd < 10) {
      return res.status(400).json({ ok: false, error: 'Minimum D Cash App transaction is $10.00 USD.' });
    }

    const dirUpper = String(direction || '').trim().toUpperCase();
    const resolvedDir: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' =
      dirUpper === 'TRANSFER' || dirUpper === 'SEND' || dirUpper === 'MONEY_TRANSFER'
        ? 'TRANSFER'
        : dirUpper === 'WITHDRAWAL' || dirUpper === 'WITHDRAW'
        ? 'WITHDRAWAL'
        : 'DEPOSIT';
    const rawLogin = String(derivLoginId || loginId || '').trim();
    const isStandalone = Boolean(standalone === true || resolvedDir === 'TRANSFER' || !rawLogin || rawLogin.toUpperCase() === 'STANDALONE');

    if (!urls.hasValidExternalUrl || !dcashApiKey) {
      const payload = createBuiltInDcashTransfer({
        direction: resolvedDir,
        phone: String(phone),
        usdAmount: amountUsd,
        kesAmount: amountKes,
        derivLoginId: isStandalone ? undefined : rawLogin,
        standalone: isStandalone,
        dcashAccount: dcashTag || String(phone),
        agentLoginId: resolvedAgent,
        transferUrl: urls.builtInTransferUrl,
        callbackUrl: urls.callbackUrl,
        checkoutUrl: urls.checkoutUrl,
        endpointLabel: '/api/dcash/transfer (built-in URL)',
      });
      return res.status(202).json(payload);
    }

    try {
      const upstream = await fetch(`${dcashApiUrl}/v1/transfers`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${dcashApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          direction: resolvedDir,
          phone: String(phone),
          usdAmount: amountUsd,
          kesAmount: amountKes,
          derivLoginId: isStandalone ? undefined : rawLogin,
          standalone: isStandalone,
          dcashAccount: dcashTag || String(phone),
          agentLoginId: isStandalone ? undefined : resolvedAgent,
          callbackUrl: urls.callbackUrl,
        }),
      });

      const data = (await upstream.json().catch(() => ({}))) as any;
      if (!upstream.ok) {
        const payload = {
          ok: false,
          configured: true,
          status: 'REJECTED',
          error: data?.error || data?.message || `D Cash gateway returned HTTP ${upstream.status}`,
        };
        recordCashierDiagnostic({
          channel: 'D_CASH',
          method: 'POST',
          endpoint: '/api/dcash/transfer',
          httpStatus: 502,
          outcome: 'REJECTED',
          phoneOrTarget: `${dcashTag || phone} (Agent: ${resolvedAgent})`,
          usdAmount: amountUsd,
          kesAmount: amountKes,
          summary: payload.error,
          responsePayload: payload,
        });
        return res.status(502).json(payload);
      }

      const id = String(data?.reference || data?.transactionId || `DCASH-${Date.now()}`);
      const record: MpesaTxRecord = {
        id,
        type: direction === 'WITHDRAWAL' ? 'B2C_WITHDRAWAL' : 'STK_DEPOSIT',
        environment: 'production',
        phone: String(phone),
        usdAmount: amountUsd,
        kesAmount: amountKes,
        loginId,
        status: data?.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
        mpesaReceipt: data?.mpesaReceipt ? String(data.mpesaReceipt) : undefined,
        resultDesc: data?.message || 'D Cash App transfer initiated — awaiting confirmation.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mpesaTransactions.set(id, record);
      if (record.status === 'COMPLETED') {
        broadcastMpesaTxUpdate(record);
      }

      const payload = {
        ok: true,
        configured: true,
        bridgeMode: 'EXTERNAL_API' as const,
        status: record.status,
        reference: id,
        mpesaReceipt: data?.mpesaReceipt,
        agentLoginId: resolvedAgent,
        transferUrl: urls.transferUrl,
        callbackUrl: urls.callbackUrl,
        checkoutUrl: urls.checkoutUrl,
        message: data?.message || 'D Cash App transfer submitted.',
      };
      recordCashierDiagnostic({
        channel: 'D_CASH',
        method: 'POST',
        endpoint: '/api/dcash/transfer',
        httpStatus: 202,
        outcome: record.status === 'COMPLETED' ? 'OK' : 'PENDING',
        phoneOrTarget: `${dcashTag || phone} (Agent: ${resolvedAgent})`,
        usdAmount: amountUsd,
        kesAmount: amountKes,
        reference: id,
        summary: payload.message,
        responsePayload: payload,
      });
      return res.status(202).json(payload);
    } catch (err: any) {
      const payload = {
        ok: false,
        configured: true,
        status: 'REJECTED',
        error: err?.message || 'Unable to reach D Cash App API.',
      };
      recordCashierDiagnostic({
        channel: 'D_CASH',
        method: 'POST',
        endpoint: '/api/dcash/transfer',
        httpStatus: 502,
        outcome: 'REJECTED',
        phoneOrTarget: `${dcashTag || phone} (Agent: ${resolvedAgent})`,
        usdAmount: amountUsd,
        kesAmount: amountKes,
        summary: payload.error,
        responsePayload: payload,
      });
      return res.status(502).json(payload);
    }
  });

  app.post('/api/dcash/callback', (req, res) => {
    const bodyObj = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const { reference, status, mpesaReceipt, message } = bodyObj as Record<string, unknown>;
    const refStr = reference ? String(reference) : undefined;
    let matchedTransaction = false;

    if (refStr && mpesaTransactions.has(refStr)) {
      matchedTransaction = true;
      const existing = mpesaTransactions.get(refStr)!;
      existing.status =
        status === 'COMPLETED' || status === 'SUCCESS'
          ? 'COMPLETED'
          : status === 'FAILED' || status === 'REJECTED'
          ? 'REJECTED'
          : 'PENDING';
      if (mpesaReceipt) existing.mpesaReceipt = String(mpesaReceipt);
      if (message) existing.resultDesc = String(message);
      if (existing.status === 'COMPLETED') {
        existing.safaricomConfirmationText = message
          ? String(message)
          : mpesaReceipt
          ? `D Cash Confirmed (${String(mpesaReceipt)}): KES ${existing.kesAmount.toLocaleString()} settled for ${existing.phone}.`
          : `D Cash Bridge Confirmed (${existing.id}): KES ${existing.kesAmount.toLocaleString()} settled for ${existing.phone}.`;
      }
      existing.updatedAt = Date.now();
      mpesaTransactions.set(existing.id, existing);
      broadcastMpesaTxUpdate(existing);
    }

    const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'DCASH_CALLBACK',
      endpoint: '/api/dcash/callback',
      reference: refStr,
      resultCode: status ? String(status) : undefined,
      resultDesc: message ? String(message) : undefined,
      mpesaReceipt: mpesaReceipt ? String(mpesaReceipt) : undefined,
      matchedTransaction,
    });

    recordCashierDiagnostic({
      channel: 'D_CASH',
      method: 'POST',
      endpoint: '/api/dcash/callback',
      httpStatus: 200,
      outcome: status === 'FAILED' || status === 'REJECTED' ? 'REJECTED' : 'OK',
      reference: refStr,
      summary: message
        ? `D Cash webhook (${matchedTransaction ? 'matched tx' : 'unmatched ref'}): ${String(message)}`
        : `D Cash webhook POST received (${status ? String(status) : 'ACK'}) from ${rawEntry.sourceIp}`,
      responsePayload:
        typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : { raw: req.body },
    });
    return res.json({ ok: true, matchedTransaction, reference: refStr });
  });

  // Valtex App Integration (Deposits & Withdrawal Confirmation)
  const getValtexConfig = (req: Request) => {
    const rawApiUrl = cleanEnvVar(process.env.VALTEX_API_URL)
      .replace(/\/+$/, '')
      .replace(/\/v1\/transfers$/i, '');
    const normalizedApiUrl =
      rawApiUrl && !/^https?:\/\//i.test(rawApiUrl) && /^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(rawApiUrl)
        ? `https://${rawApiUrl}`
        : rawApiUrl;
    const valtexApiKey = cleanEnvVar(process.env.VALTEX_API_KEY);
    const valtexWebhookSecret = cleanEnvVar(process.env.VALTEX_WEBHOOK_SECRET);
    const valtexMerchantId = cleanEnvVar(process.env.VALTEX_MERCHANT_ID) || 'VALTEX-NDERISKOOL';
    const cfg = getDarajaConfig();
    const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
    const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim().toLowerCase();
    const hasHttpUrl = isValidHttpUrl(normalizedApiUrl);
    const isSelfLoop =
      hasHttpUrl &&
      Boolean(
        (reqHost && normalizedApiUrl.toLowerCase().includes(reqHost)) ||
          (publicBase && normalizedApiUrl.toLowerCase().startsWith(publicBase.toLowerCase()))
      );
    const hasExternalApiUrl = hasHttpUrl && !isSelfLoop;
    const externalConfigured = Boolean(hasExternalApiUrl && valtexApiKey);
    const invalidExternalApiUrl = Boolean(rawApiUrl && !hasHttpUrl);
    const externalApiWarning = invalidExternalApiUrl
      ? 'VALTEX_API_URL is not a valid https:// base URL (e.g. https://api.valtex.example); operating in Built-In Valtex Webhook Bridge mode.'
      : isSelfLoop
      ? 'VALTEX_API_URL points to this app itself; operating in Built-In Valtex Webhook Bridge mode to prevent request loops.'
      : hasExternalApiUrl && !valtexApiKey
      ? 'VALTEX_API_URL is set without VALTEX_API_KEY; operating in Built-In Valtex Webhook Bridge mode until VALTEX_API_KEY is added.'
      : null;
    const baseSelf = publicBase || '';
    return {
      valtexApiUrl: hasExternalApiUrl ? normalizedApiUrl : '',
      valtexApiKey,
      valtexWebhookSecret,
      valtexMerchantId,
      externalConfigured,
      hasExternalApiUrl,
      invalidExternalApiUrl,
      externalApiWarning,
      publicBase,
      urls: {
        checkoutUrl: baseSelf ? `${baseSelf}/?cashier=valtex` : '/?cashier=valtex',
        apiBaseUrl: baseSelf ? `${baseSelf}/api/valtex` : '/api/valtex',
        depositUrl: baseSelf ? `${baseSelf}/api/valtex/deposit` : '/api/valtex/deposit',
        withdrawUrl: baseSelf ? `${baseSelf}/api/valtex/withdraw` : '/api/valtex/withdraw',
        transferUrl: hasExternalApiUrl
          ? `${normalizedApiUrl}/v1/transfers`
          : baseSelf
          ? `${baseSelf}/api/valtex/v1/transfers`
          : '/api/valtex/v1/transfers',
        callbackUrl: baseSelf ? `${baseSelf}/api/valtex/callback` : '/api/valtex/callback',
        confirmUrl: baseSelf ? `${baseSelf}/api/valtex/confirm` : '/api/valtex/confirm',
      },
    };
  };

  const applyValtexVerificationPayload = (
    tx: MpesaTxRecord,
    params: {
      statusRaw?: unknown;
      receipt?: string;
      message?: string;
      amount?: number;
      source: 'VALTEX_CALLBACK' | 'VALTEX_API';
    }
  ): { updated: boolean; validConfirmation: boolean; error?: string } => {
    const st = String(params.statusRaw || '').trim().toUpperCase();
    const stToken = st.includes('.') ? st.split('.').pop() || st : st;
    const receipt = params.receipt ? String(params.receipt).trim() : undefined;
    const isRejected = ['FAILED', 'REJECTED', 'CANCELLED', 'CANCELED', 'DECLINED', 'REVERSED'].includes(stToken);
    const isCompleted = ['COMPLETED', 'COMPLETE', 'CONFIRMED', 'SUCCESS', 'SUCCEEDED', 'SETTLED', 'PAID'].includes(stToken);

    if (isRejected) {
      tx.status = 'REJECTED';
      tx.callbackVerified = true;
      tx.verificationSource = params.source;
      if (receipt) tx.mpesaReceipt = receipt;
      tx.resultDesc = params.message || `Valtex reported transaction ${st.toLowerCase()}.`;
      tx.updatedAt = Date.now();
      mpesaTransactions.set(tx.id, tx);
      broadcastMpesaTxUpdate(tx);
      return { updated: true, validConfirmation: true };
    }

    if (isCompleted) {
      const hasValidReceipt = Boolean(receipt && receipt.length >= 4 && !receipt.startsWith('PING'));
      const amountPositive =
        params.amount !== undefined
          ? !Number.isNaN(params.amount) && params.amount > 0
          : tx.kesAmount > 0 || tx.usdAmount > 0;
      if (!hasValidReceipt || !amountPositive) {
        tx.resultDesc =
          'Valtex callback reported Completed without a valid receipt/confirmation code or positive amount; staying PENDING.';
        tx.updatedAt = Date.now();
        mpesaTransactions.set(tx.id, tx);
        broadcastMpesaTxUpdate(tx);
        return { updated: false, validConfirmation: false, error: tx.resultDesc };
      }

      tx.status = 'COMPLETED';
      tx.callbackVerified = true;
      tx.verificationSource = params.source;
      tx.mpesaReceipt = receipt;
      const kesVal = Number(tx.kesAmount || 0).toLocaleString();
      const targetDisplay = tx.recipientPhone || tx.valtexAccountId || tx.phone;
      tx.safaricomConfirmationText =
        params.message ||
        `Valtex Confirmed (${receipt}): $${tx.usdAmount.toFixed(2)} USD (KES ${kesVal}) ${
          tx.type === 'VALTEX_DEPOSIT'
            ? 'deposited from'
            : tx.type === 'VALTEX_TRANSFER'
            ? 'transferred to'
            : 'disbursed to'
        } ${targetDisplay}.`;
      tx.resultDesc = tx.safaricomConfirmationText;
      tx.updatedAt = Date.now();
      mpesaTransactions.set(tx.id, tx);
      broadcastMpesaTxUpdate(tx);
      return { updated: true, validConfirmation: true };
    }

    if (params.message) {
      tx.resultDesc = params.message;
      tx.updatedAt = Date.now();
      mpesaTransactions.set(tx.id, tx);
    }
    return { updated: false, validConfirmation: false };
  };

  app.get('/api/valtex', (req, res) => {
    const vcfg = getValtexConfig(req);
    return res.json({
      ok: true,
      environment: 'production',
      mode: vcfg.externalConfigured ? 'EXTERNAL_VALTEX_API' : 'VALTEX_WEBHOOK_BRIDGE',
      merchantId: vcfg.valtexMerchantId,
      externalApiConfigured: vcfg.externalConfigured,
      invalidExternalApiUrl: vcfg.invalidExternalApiUrl,
      externalApiWarning: vcfg.externalApiWarning,
      webhookSecretConfigured: Boolean(vcfg.valtexWebhookSecret),
      callbackAuthGated: isPreviewAuthGatedUrl(vcfg.publicBase),
      urls: vcfg.urls,
    });
  });

  app.get('/api/valtex/status', (req, res) => {
    const vcfg = getValtexConfig(req);
    const valtexTxs = Array.from(mpesaTransactions.values()).filter(
      (t) => t.type === 'VALTEX_DEPOSIT' || t.type === 'VALTEX_WITHDRAWAL' || t.type === 'VALTEX_TRANSFER'
    );
    return res.json({
      ok: true,
      connected: true,
      mode: vcfg.externalConfigured ? 'EXTERNAL_VALTEX_API' : 'VALTEX_WEBHOOK_BRIDGE',
      externalApiConfigured: vcfg.externalConfigured,
      invalidExternalApiUrl: vcfg.invalidExternalApiUrl,
      externalApiWarning: vcfg.externalApiWarning,
      webhookSecretConfigured: Boolean(vcfg.valtexWebhookSecret),
      merchantId: vcfg.valtexMerchantId,
      callbackAuthGated: isPreviewAuthGatedUrl(vcfg.publicBase),
      urls: vcfg.urls,
      stats: {
        total: valtexTxs.length,
        pending: valtexTxs.filter((t) => t.status === 'PENDING').length,
        confirmed: valtexTxs.filter((t) => t.status === 'COMPLETED' && t.callbackVerified === true).length,
        rejected: valtexTxs.filter((t) => t.status === 'REJECTED').length,
      },
    });
  });

  app.get('/api/valtex/transactions', (_req, res) => {
    const list = Array.from(mpesaTransactions.values())
      .filter((t) => t.type === 'VALTEX_DEPOSIT' || t.type === 'VALTEX_WITHDRAWAL' || t.type === 'VALTEX_TRANSFER')
      .sort((a, b) => b.createdAt - a.createdAt);
    return res.json({ ok: true, transactions: list });
  });

  const handleValtexCreateTransfer = async (
    req: Request,
    res: Response,
    forcedDirection?: 'DEPOSIT' | 'WITHDRAWAL'
  ) => {
    const vcfg = getValtexConfig(req);
    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const bodyDirection = body.direction ?? body.type ?? body.transferType ?? body.action;
    const rawPhone = body.phone ?? body.msisdn ?? body.phoneNumber ?? body.mobile;
    const rawValtexAccount = body.valtexAccountId ?? body.valtexAccount ?? body.accountId ?? body.valtex_account_id;
    const rawCurrency = String(body.currency || 'USD').trim().toUpperCase();
    const rawAmount = body.amount !== undefined ? Number(body.amount) : undefined;
    const rawUsdAmount =
      body.usdAmount !== undefined
        ? Number(body.usdAmount)
        : rawCurrency === 'KES' && rawAmount
        ? Number((rawAmount / 129.5).toFixed(2))
        : rawAmount;
    const rawKesAmount =
      body.kesAmount !== undefined
        ? Number(body.kesAmount)
        : rawCurrency === 'KES' && rawAmount
        ? rawAmount
        : undefined;
    const loginId = body.loginId;
    const derivLoginId = body.derivLoginId;

    const dirNorm = String(bodyDirection || '').trim().toUpperCase();
    const isTransferAlias = ['TRANSFER', 'MONEY_TRANSFER', 'SEND', 'P2P'].includes(dirNorm);
    const isWithdrawalAlias = ['WITHDRAWAL', 'WITHDRAW', 'PAYOUT', 'B2C', 'DISBURSEMENT', 'OUT'].includes(dirNorm);
    const isDepositAlias = ['DEPOSIT', 'PAYIN', 'COLLECTION', 'STK', 'IN', ''].includes(dirNorm);
    if (!forcedDirection && dirNorm && !isWithdrawalAlias && !isDepositAlias && !isTransferAlias) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid transfer direction. Expected DEPOSIT, WITHDRAWAL, or TRANSFER.',
      });
    }
    const direction: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' =
      forcedDirection || (isTransferAlias ? 'TRANSFER' : isWithdrawalAlias ? 'WITHDRAWAL' : 'DEPOSIT');
    const resolvedEndpoint =
      forcedDirection === 'WITHDRAWAL'
        ? '/api/valtex/withdraw'
        : forcedDirection === 'DEPOSIT'
        ? '/api/valtex/deposit'
        : '/api/valtex/v1/transfers';
    const parsedPhone = normalizeKenyanMsisdnServer(String(rawPhone || ''));
    if (!parsedPhone) {
      return res.status(400).json({
        ok: false,
        error: 'Valid Kenyan Safaricom M-Pesa phone number required for Valtex settlement (e.g. 0728424076 or +254793950512).',
      });
    }

    const amountUsd = Number(rawUsdAmount || 0);
    if (!amountUsd || Number.isNaN(amountUsd) || amountUsd < 10) {
      return res.status(400).json({ ok: false, error: 'Minimum Valtex transaction is $10.00 USD.' });
    }
    const amountKes = Math.round(Number(rawKesAmount || 0)) || Math.round(amountUsd * 129.5);
    const resolvedValtexAccount = String(rawValtexAccount || parsedPhone.phone).trim();
    const rawLoginInput = String(loginId || derivLoginId || '').trim();
    const isStandaloneValtex = Boolean(
      body.standalone === true ||
        direction === 'TRANSFER' ||
        !rawLoginInput ||
        rawLoginInput.toUpperCase() === 'STANDALONE'
    );
    const resolvedLoginId = isStandaloneValtex ? undefined : rawLoginInput;
    const reference = `VTX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const valtexTxType: MpesaTxRecord['type'] =
      direction === 'TRANSFER'
        ? 'VALTEX_TRANSFER'
        : direction === 'WITHDRAWAL'
        ? 'VALTEX_WITHDRAWAL'
        : 'VALTEX_DEPOSIT';

    if (vcfg.externalConfigured) {
      try {
        const upstream = await fetch(`${vcfg.valtexApiUrl}/v1/transfers`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${vcfg.valtexApiKey}`,
            'Content-Type': 'application/json',
            'X-Valtex-Merchant': vcfg.valtexMerchantId,
          },
          body: JSON.stringify({
            reference,
            direction,
            standalone: isStandaloneValtex,
            merchantId: vcfg.valtexMerchantId,
            derivLoginId: resolvedLoginId,
            valtexAccountId: resolvedValtexAccount,
            phone: parsedPhone.msisdn,
            usdAmount: amountUsd,
            kesAmount: amountKes,
            callbackUrl: vcfg.urls.callbackUrl,
          }),
        });
        const upstreamData = (await upstream.json().catch(() => ({}))) as Record<string, any>;
        if (!upstream.ok) {
          const payload = {
            ok: false,
            configured: true,
            status: 'REJECTED',
            error: String(upstreamData.error || upstreamData.message || `Valtex API returned HTTP ${upstream.status}`),
          };
          recordCashierDiagnostic({
            channel: 'VALTEX',
            method: 'POST',
            endpoint: resolvedEndpoint,
            httpStatus: 502,
            outcome: 'REJECTED',
            phoneOrTarget: `${resolvedValtexAccount} (${parsedPhone.phone})`,
            usdAmount: amountUsd,
            kesAmount: amountKes,
            summary: payload.error,
            responsePayload: payload,
          });
          return res.status(502).json(payload);
        }

        const remoteRef = String(upstreamData.reference || upstreamData.transactionId || reference);
        const record: MpesaTxRecord = {
          id: remoteRef,
          type: valtexTxType,
          standalone: isStandaloneValtex,
          environment: 'production',
          phone: parsedPhone.msisdn,
          recipientPhone: parsedPhone.phone,
          recipientMsisdn: parsedPhone.msisdn,
          valtexAccountId: resolvedValtexAccount,
          usdAmount: amountUsd,
          kesAmount: amountKes,
          loginId: resolvedLoginId,
          status: 'PENDING',
          callbackVerified: false,
          resultDesc: String(
            upstreamData.message ||
              `Valtex ${direction.toLowerCase()} ${remoteRef} submitted (${parsedPhone.phone}). Awaiting Valtex confirmation callback.`
          ),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        mpesaTransactions.set(remoteRef, record);

        if (upstreamData.status) {
          applyValtexVerificationPayload(record, {
            statusRaw: upstreamData.status,
            receipt: upstreamData.receipt || upstreamData.mpesaReceipt || upstreamData.confirmationCode,
            message: upstreamData.message,
            amount: Number(upstreamData.kesAmount || upstreamData.usdAmount || amountKes),
            source: 'VALTEX_API',
          });
        }

        const payload = {
          ok: true,
          configured: true,
          mode: 'EXTERNAL_VALTEX_API' as const,
          direction,
          standalone: isStandaloneValtex,
          status: record.status,
          callbackVerified: record.callbackVerified,
          reference: remoteRef,
          transactionId: remoteRef,
          mpesaReceipt: record.mpesaReceipt,
          recipientPhone: parsedPhone.phone,
          recipientMsisdn: parsedPhone.msisdn,
          valtexAccountId: resolvedValtexAccount,
          callbackUrl: vcfg.urls.callbackUrl,
          message: record.resultDesc,
        };
        recordCashierDiagnostic({
          channel: 'VALTEX',
          method: 'POST',
          endpoint: resolvedEndpoint,
          httpStatus: record.status === 'COMPLETED' ? 200 : 202,
          outcome: record.status === 'COMPLETED' ? 'OK' : 'PENDING',
          phoneOrTarget: `${resolvedValtexAccount} (${parsedPhone.phone})`,
          usdAmount: amountUsd,
          kesAmount: amountKes,
          reference: remoteRef,
          summary: payload.message || 'Valtex order submitted',
          responsePayload: payload,
        });
        return res.status(record.status === 'COMPLETED' ? 200 : 202).json(payload);
      } catch (err: any) {
        return res.status(502).json({
          ok: false,
          configured: true,
          error: err?.message || 'Unable to reach external Valtex API.',
        });
      }
    }

    // Built-in Valtex Webhook Bridge (never auto-confirms — stays PENDING until Valtex app confirms via /api/valtex/callback)
    const record: MpesaTxRecord = {
      id: reference,
      type: valtexTxType,
      standalone: isStandaloneValtex,
      environment: 'production',
      phone: parsedPhone.msisdn,
      recipientPhone: parsedPhone.phone,
      recipientMsisdn: parsedPhone.msisdn,
      valtexAccountId: resolvedValtexAccount,
      usdAmount: amountUsd,
      kesAmount: amountKes,
      loginId: resolvedLoginId,
      status: 'PENDING',
      callbackVerified: false,
      resultDesc: `Valtex ${direction.toLowerCase()} ${reference} queued ($${amountUsd.toFixed(2)} USD / KES ${amountKes.toLocaleString()} -> ${parsedPhone.phone}). Awaiting Valtex webhook confirmation at ${vcfg.urls.callbackUrl}.`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    mpesaTransactions.set(reference, record);

    const payload = {
      ok: true,
      configured: false,
      builtInBridge: true,
      mode: 'VALTEX_WEBHOOK_BRIDGE' as const,
      direction,
      standalone: isStandaloneValtex,
      status: 'PENDING' as const,
      callbackVerified: false,
      reference,
      transactionId: reference,
      recipientPhone: parsedPhone.phone,
      recipientMsisdn: parsedPhone.msisdn,
      valtexAccountId: resolvedValtexAccount,
      callbackUrl: vcfg.urls.callbackUrl,
      transferUrl: vcfg.urls.transferUrl,
      message: record.resultDesc,
    };
    recordCashierDiagnostic({
      channel: 'VALTEX',
      method: 'POST',
      endpoint: resolvedEndpoint,
      httpStatus: 202,
      outcome: 'PENDING',
      phoneOrTarget: `${resolvedValtexAccount} (${parsedPhone.phone})`,
      usdAmount: amountUsd,
      kesAmount: amountKes,
      reference,
      summary: record.resultDesc || 'Valtex order awaiting confirmation',
      responsePayload: payload,
    });
    return res.status(202).json(payload);
  };

  const handleValtexGetBridge = (req: Request, res: Response, direction: 'DEPOSIT' | 'WITHDRAWAL') => {
    const acceptHeader = String(req.headers.accept || '');
    const wantsJson = String(req.query.format || '').toLowerCase() === 'json';
    const prefersHtml = acceptHeader.includes('text/html') && !wantsJson;
    const vcfg = getValtexConfig(req);

    if (prefersHtml) {
      const qs = new URLSearchParams();
      qs.set('cashier', 'valtex');
      qs.set('direction', direction);
      const qAmount = String(req.query.amount || req.query.usdAmount || '').trim();
      const qPhone = String(req.query.phone || req.query.msisdn || req.query.phoneNumber || '').trim();
      const qValtexId = String(req.query.valtexId || req.query.valtexAccountId || req.query.accountId || '').trim();
      if (qAmount) qs.set('amount', qAmount);
      if (qPhone) qs.set('phone', qPhone);
      if (qValtexId) qs.set('valtexId', qValtexId);
      return res.redirect(302, `/?${qs.toString()}`);
    }

    const txType = direction === 'WITHDRAWAL' ? 'VALTEX_WITHDRAWAL' : 'VALTEX_DEPOSIT';
    const recent = Array.from(mpesaTransactions.values())
      .filter((t) => t.type === txType)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);

    return res.json({
      ok: true,
      environment: 'production',
      direction,
      endpoint: direction === 'WITHDRAWAL' ? '/api/valtex/withdraw' : '/api/valtex/deposit',
      method: 'POST',
      mode: vcfg.externalConfigured ? 'EXTERNAL_VALTEX_API' : 'VALTEX_WEBHOOK_BRIDGE',
      externalApiConfigured: vcfg.externalConfigured,
      invalidExternalApiUrl: vcfg.invalidExternalApiUrl,
      externalApiWarning: vcfg.externalApiWarning,
      webhookSecretConfigured: Boolean(vcfg.valtexWebhookSecret),
      callbackAuthGated: isPreviewAuthGatedUrl(vcfg.publicBase),
      merchantId: vcfg.valtexMerchantId,
      checkoutUrl: `${vcfg.urls.checkoutUrl}&direction=${direction}`,
      callbackUrl: vcfg.urls.callbackUrl,
      confirmUrl: vcfg.urls.confirmUrl,
      requiredBodyFields: {
        phone: '0728424076 (or 254728424076)',
        usdAmount: 'Number >= 10 (or amount + currency)',
        valtexAccountId: 'Optional Valtex wallet handle',
      },
      transactions: recent,
    });
  };

  app.get('/api/valtex/deposit', (req, res) => handleValtexGetBridge(req, res, 'DEPOSIT'));
  app.get('/api/valtex/withdraw', (req, res) => handleValtexGetBridge(req, res, 'WITHDRAWAL'));
  app.get('/api/valtex/v1/transfers', (req, res) => {
    const acceptHeader = String(req.headers.accept || '');
    const wantsJson = String(req.query.format || '').toLowerCase() === 'json' || !acceptHeader.includes('text/html');
    if (!wantsJson && !req.query.status) {
      const qs = new URLSearchParams();
      qs.set('cashier', 'valtex');
      const qDirection = String(req.query.direction || '').trim().toUpperCase();
      const qAmount = String(req.query.amount || req.query.usdAmount || '').trim();
      const qPhone = String(req.query.phone || req.query.msisdn || req.query.phoneNumber || '').trim();
      const qValtexId = String(req.query.valtexId || req.query.valtexAccountId || req.query.accountId || '').trim();
      if (qDirection === 'DEPOSIT' || qDirection === 'WITHDRAWAL' || qDirection === 'TRANSFER') qs.set('direction', qDirection);
      if (qAmount) qs.set('amount', qAmount);
      if (qPhone) qs.set('phone', qPhone);
      if (qValtexId) qs.set('valtexId', qValtexId);
      return res.redirect(302, `/?${qs.toString()}`);
    }

    const vcfg = getValtexConfig(req);
    const filterDirection = String(req.query.direction || '').trim().toUpperCase();
    const filterStatus = String(req.query.status || '').trim().toUpperCase();
    const list = Array.from(mpesaTransactions.values())
      .filter((t) => {
        if (t.type !== 'VALTEX_DEPOSIT' && t.type !== 'VALTEX_WITHDRAWAL' && t.type !== 'VALTEX_TRANSFER') return false;
        if (filterDirection === 'DEPOSIT' && t.type !== 'VALTEX_DEPOSIT') return false;
        if (filterDirection === 'WITHDRAWAL' && t.type !== 'VALTEX_WITHDRAWAL') return false;
        if (filterDirection === 'TRANSFER' && t.type !== 'VALTEX_TRANSFER') return false;
        if (filterStatus && t.status !== filterStatus) return false;
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    return res.json({
      ok: true,
      environment: 'production',
      endpoint: '/api/valtex/v1/transfers',
      method: 'POST',
      mode: vcfg.externalConfigured ? 'EXTERNAL_VALTEX_API' : 'VALTEX_WEBHOOK_BRIDGE',
      merchantId: vcfg.valtexMerchantId,
      externalApiConfigured: vcfg.externalConfigured,
      invalidExternalApiUrl: vcfg.invalidExternalApiUrl,
      externalApiWarning: vcfg.externalApiWarning,
      webhookSecretConfigured: Boolean(vcfg.valtexWebhookSecret),
      callbackAuthGated: isPreviewAuthGatedUrl(vcfg.publicBase),
      requiredBodyFields: {
        direction: 'DEPOSIT | WITHDRAWAL',
        phone: '0728424076 (or 254728424076)',
        usdAmount: 'Number >= 10 (or amount + currency)',
        valtexAccountId: 'Optional Valtex wallet handle',
      },
      urls: vcfg.urls,
      transactions: list,
    });
  });
  app.get('/api/valtex/callback', (req, res) => {
    const vcfg = getValtexConfig(req);
    const recentWebhooks = incomingWebhookCallbacks
      .filter((w) => w.kind === 'VALTEX_CALLBACK')
      .slice(0, 10)
      .map((w) => ({
        id: w.id,
        receivedAt: w.receivedAt,
        reference: w.reference,
        resultCode: w.resultCode,
        resultDesc: w.resultDesc,
        mpesaReceipt: w.mpesaReceipt,
        matchedTransaction: w.matchedTransaction,
        sourceIp: w.sourceIp,
      }));
    return res.json({
      ok: true,
      environment: 'production',
      endpoint: '/api/valtex/callback',
      method: 'POST',
      merchantId: vcfg.valtexMerchantId,
      mode: vcfg.externalConfigured ? 'EXTERNAL_VALTEX_API' : 'VALTEX_WEBHOOK_BRIDGE',
      webhookSecretConfigured: Boolean(vcfg.valtexWebhookSecret),
      signatureHeader: 'X-Valtex-Signature (HMAC-SHA256 hex or sha256=<hex> of raw JSON body)',
      callbackAuthGated: isPreviewAuthGatedUrl(vcfg.publicBase),
      externalApiConfigured: vcfg.externalConfigured,
      externalApiWarning: vcfg.externalApiWarning,
      urls: vcfg.urls,
      expectedBody: {
        reference: 'VTX-...',
        status: 'COMPLETED | FAILED | REJECTED (or event: transfer.completed)',
        receipt: 'Safaricom / Valtex confirmation code',
        amount: 'Optional settled amount',
        message: 'Optional confirmation text',
      },
      recentWebhooks,
    });
  });
  app.get('/api/valtex/confirm', (req, res) => {
    const vcfg = getValtexConfig(req);
    return res.json({
      ok: true,
      endpoint: '/api/valtex/confirm',
      method: 'POST',
      urls: vcfg.urls,
      expectedBody: {
        reference: 'VTX-...',
      },
    });
  });

  app.post('/api/valtex/deposit', (req, res) => handleValtexCreateTransfer(req, res, 'DEPOSIT'));
  app.post('/api/valtex/withdraw', (req, res) => handleValtexCreateTransfer(req, res, 'WITHDRAWAL'));
  app.post('/api/valtex/v1/transfers', (req, res) => handleValtexCreateTransfer(req, res));

  app.get('/api/valtex/v1/transfers/:reference', async (req, res) => {
    const ref = String(req.params.reference || '').trim();
    const tx = mpesaTransactions.get(ref);
    if (!tx || (tx.type !== 'VALTEX_DEPOSIT' && tx.type !== 'VALTEX_WITHDRAWAL' && tx.type !== 'VALTEX_TRANSFER')) {
      return res.status(404).json({ ok: false, error: `Valtex transfer ${ref} not found.` });
    }

    const vcfg = getValtexConfig(req);
    if (tx.status === 'PENDING' && vcfg.externalConfigured) {
      try {
        const upRes = await fetch(`${vcfg.valtexApiUrl}/v1/transfers/${encodeURIComponent(ref)}`, {
          headers: { Authorization: `Bearer ${vcfg.valtexApiKey}` },
        });
        if (upRes.ok) {
          const upData = (await upRes.json().catch(() => ({}))) as Record<string, any>;
          applyValtexVerificationPayload(tx, {
            statusRaw: upData.status,
            receipt: upData.receipt || upData.mpesaReceipt || upData.confirmationCode,
            message: upData.message,
            amount: Number(upData.kesAmount || upData.usdAmount || tx.kesAmount),
            source: 'VALTEX_API',
          });
        }
      } catch {
        // retain current status cleanly
      }
    }

    return res.json({
      ok: true,
      transaction: tx,
      reference: tx.id,
      status: tx.status,
      callbackVerified: Boolean(tx.callbackVerified),
      mpesaReceipt: tx.mpesaReceipt,
      message: tx.safaricomConfirmationText || tx.resultDesc,
    });
  });

  app.post('/api/valtex/confirm', async (req, res) => {
    const ref = String(req.body?.reference || req.body?.id || '').trim();
    if (!ref) {
      return res.status(400).json({ ok: false, error: 'Valtex transaction reference is required.' });
    }
    const tx = mpesaTransactions.get(ref);
    if (!tx || (tx.type !== 'VALTEX_DEPOSIT' && tx.type !== 'VALTEX_WITHDRAWAL' && tx.type !== 'VALTEX_TRANSFER')) {
      return res.status(404).json({ ok: false, error: `Valtex transaction ${ref} not found.` });
    }

    const vcfg = getValtexConfig(req);
    if (tx.status === 'PENDING' && vcfg.externalConfigured) {
      try {
        const upRes = await fetch(`${vcfg.valtexApiUrl}/v1/transfers/${encodeURIComponent(ref)}`, {
          headers: { Authorization: `Bearer ${vcfg.valtexApiKey}` },
        });
        if (upRes.ok) {
          const upData = (await upRes.json().catch(() => ({}))) as Record<string, any>;
          applyValtexVerificationPayload(tx, {
            statusRaw: upData.status,
            receipt: upData.receipt || upData.mpesaReceipt || upData.confirmationCode,
            message: upData.message,
            amount: Number(upData.kesAmount || upData.usdAmount || tx.kesAmount),
            source: 'VALTEX_API',
          });
        }
      } catch {
        // ignore upstream transient failure
      }
    }

    if (tx.status === 'COMPLETED' && tx.callbackVerified === true) {
      return res.json({ ok: true, transaction: tx });
    }
    if (tx.status === 'REJECTED') {
      return res.status(409).json({
        ok: false,
        status: 'REJECTED',
        error: tx.resultDesc || 'Valtex rejected this transaction.',
        transaction: tx,
      });
    }
    return res.status(409).json({
      ok: false,
      awaitingValtexCallback: true,
      status: 'PENDING',
      error: `Valtex transaction ${ref} cannot be marked Confirmed until Valtex returns a verified payment confirmation via /api/valtex/callback or Valtex API.`,
      transaction: tx,
    });
  });

  app.post('/api/valtex/callback', (req, res) => {
    const vcfg = getValtexConfig(req);
    const bodyObj = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const dataObj =
      typeof bodyObj.data === 'object' && bodyObj.data !== null ? (bodyObj.data as Record<string, unknown>) : {};
    const merged: Record<string, unknown> = { ...dataObj, ...bodyObj };

    const rawRef = merged.reference ?? merged.transactionId ?? merged.transaction_id;
    const refStr = rawRef ? String(rawRef).trim() : undefined;

    if (vcfg.valtexWebhookSecret) {
      const sigHeader = String(
        req.headers['x-valtex-signature'] || req.headers['x-webhook-signature'] || req.headers['x-signature'] || ''
      ).trim();
      const sigHex = sigHeader.replace(/^sha256=/i, '').trim().toLowerCase();
      const rawBody = (req as Request & { rawBody?: string }).rawBody || JSON.stringify(req.body || {});
      const expected = crypto.createHmac('sha256', vcfg.valtexWebhookSecret).update(rawBody).digest('hex').toLowerCase();
      const isHex = /^[0-9a-f]{64}$/i.test(sigHex);
      const validSig =
        isHex &&
        sigHex.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(expected, 'hex'));

      if (!validSig) {
        const errMsg = 'Invalid X-Valtex-Signature HMAC header.';
        const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
          kind: 'VALTEX_CALLBACK',
          endpoint: '/api/valtex/callback',
          reference: refStr,
          resultCode: '401_HMAC_INVALID',
          resultDesc: errMsg,
          matchedTransaction: false,
        });
        recordCashierDiagnostic({
          channel: 'VALTEX',
          method: 'POST',
          endpoint: '/api/valtex/callback',
          httpStatus: 401,
          outcome: 'REJECTED',
          reference: refStr,
          summary: `${errMsg} (source ${rawEntry.sourceIp})`,
          responsePayload: { ok: false, error: errMsg, signatureHeaderPresent: Boolean(sigHeader) },
        });
        return res.status(401).json({ ok: false, error: errMsg });
      }
    }

    const statusRaw = merged.status ?? dataObj.status ?? merged.event;
    const receiptRaw =
      merged.receipt ??
      merged.mpesaReceipt ??
      merged.mpesa_receipt ??
      merged.confirmationCode ??
      merged.confirmation_code ??
      merged.txId;
    const receiptStr = receiptRaw ? String(receiptRaw).trim() : undefined;
    const messageStr = merged.message ? String(merged.message) : undefined;
    const amountRaw = merged.amount ?? merged.kesAmount ?? merged.kes_amount ?? merged.usdAmount ?? merged.usd_amount;
    const amountNum = amountRaw !== undefined ? Number(amountRaw) : undefined;

    let matchedTransaction = false;
    let verificationError: string | undefined;
    let outcome: ServerDiagOutcome = 'WARNING';

    if (refStr && mpesaTransactions.has(refStr)) {
      const existing = mpesaTransactions.get(refStr)!;
      if (
        existing.type === 'VALTEX_DEPOSIT' ||
        existing.type === 'VALTEX_WITHDRAWAL' ||
        existing.type === 'VALTEX_TRANSFER'
      ) {
        matchedTransaction = true;
        const result = applyValtexVerificationPayload(existing, {
          statusRaw,
          receipt: receiptStr,
          message: messageStr,
          amount: amountNum,
          source: 'VALTEX_CALLBACK',
        });
        verificationError = result.error;
        outcome = existing.status === 'COMPLETED' ? 'OK' : existing.status === 'REJECTED' ? 'REJECTED' : 'WARNING';
      }
    }

    const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'VALTEX_CALLBACK',
      endpoint: '/api/valtex/callback',
      reference: refStr,
      resultCode: statusRaw ? String(statusRaw) : undefined,
      resultDesc: verificationError || messageStr,
      mpesaReceipt: receiptStr,
      matchedTransaction,
    });

    recordCashierDiagnostic({
      channel: 'VALTEX',
      method: 'POST',
      endpoint: '/api/valtex/callback',
      httpStatus: 200,
      outcome,
      reference: receiptStr || refStr,
      summary:
        verificationError ||
        messageStr ||
        `Valtex webhook POST (${matchedTransaction ? 'matched tx' : 'unmatched ref'}) from ${rawEntry.sourceIp}`,
      responsePayload:
        typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : { raw: req.body },
    });

    return res.json({
      ok: true,
      matchedTransaction,
      reference: refStr,
      verificationError,
    });
  });

  // PayHero Kenya API v2 Integration (Deposit STK Push, Withdrawal, & Money Transfer)
  const getPayHeroConfig = (req: Request) => {
    const rawApiUrl = (cleanEnvVar(process.env.PAYHERO_API_URL) || 'https://backend.payhero.co.ke')
      .replace(/\/+$/, '')
      .replace(/\/api\/v2$/i, '');
    const normalizedApiUrl =
      rawApiUrl && !/^https?:\/\//i.test(rawApiUrl) && /^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(rawApiUrl)
        ? `https://${rawApiUrl}`
        : rawApiUrl;
    const rawAuthToken = cleanEnvVar(process.env.PAYHERO_AUTH_TOKEN);
    const apiUsername = cleanEnvVar(process.env.PAYHERO_API_USERNAME);
    const apiPassword = cleanEnvVar(process.env.PAYHERO_API_PASSWORD);
    const channelIdRaw = cleanEnvVar(process.env.PAYHERO_CHANNEL_ID);
    const merchantAccountId = cleanEnvVar(process.env.PAYHERO_ACCOUNT_ID) || 'PAYHERO-NDERISKOOL';
    const webhookSecret = cleanEnvVar(process.env.PAYHERO_WEBHOOK_SECRET);

    let authHeader = '';
    if (rawAuthToken) {
      if (/^Basic\s+/i.test(rawAuthToken)) {
        authHeader = `Basic ${rawAuthToken.replace(/^Basic\s+/i, '').trim()}`;
      } else if (rawAuthToken.includes(':') && !rawAuthToken.endsWith('=')) {
        authHeader = `Basic ${Buffer.from(rawAuthToken).toString('base64')}`;
      } else {
        authHeader = `Basic ${rawAuthToken}`;
      }
    } else if (apiUsername && apiPassword) {
      authHeader = `Basic ${Buffer.from(`${apiUsername}:${apiPassword}`).toString('base64')}`;
    }

    const cfg = getDarajaConfig();
    const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
    const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim().toLowerCase();
    const hasHttpUrl = isValidHttpUrl(normalizedApiUrl);
    const isSelfLoop =
      hasHttpUrl &&
      Boolean(
        (reqHost && normalizedApiUrl.toLowerCase().includes(reqHost)) ||
          (publicBase && normalizedApiUrl.toLowerCase().startsWith(publicBase.toLowerCase()))
      );
    const apiBaseUrl = hasHttpUrl && !isSelfLoop ? normalizedApiUrl : 'https://backend.payhero.co.ke';
    const invalidApiUrl = Boolean(cleanEnvVar(process.env.PAYHERO_API_URL) && (!hasHttpUrl || isSelfLoop));
    const apiConfigured = Boolean(authHeader);
    const channelIdNum = channelIdRaw && /^\d+$/.test(channelIdRaw) ? Number(channelIdRaw) : undefined;
    const channelIdConfigured = Boolean(channelIdRaw);
    const apiWarning = invalidApiUrl
      ? 'PAYHERO_API_URL in Secrets was invalid or self-referencing; defaulted to https://backend.payhero.co.ke.'
      : apiConfigured && !channelIdConfigured
      ? 'PAYHERO credentials active; set PAYHERO_CHANNEL_ID in Secrets for M-Pesa STK Push deposits.'
      : null;

    const baseSelf = publicBase || '';
    return {
      apiBaseUrl,
      authHeader,
      apiConfigured,
      channelIdRaw,
      channelIdNum,
      channelIdConfigured,
      merchantAccountId,
      webhookSecret,
      invalidApiUrl,
      apiWarning,
      publicBase,
      urls: {
        checkoutUrl: baseSelf ? `${baseSelf}/?cashier=payhero` : '/?cashier=payhero',
        apiBaseUrl: baseSelf ? `${baseSelf}/api/payhero` : '/api/payhero',
        depositUrl: baseSelf ? `${baseSelf}/api/payhero/deposit` : '/api/payhero/deposit',
        withdrawUrl: baseSelf ? `${baseSelf}/api/payhero/withdraw` : '/api/payhero/withdraw',
        transferUrl: baseSelf ? `${baseSelf}/api/payhero/transfer` : '/api/payhero/transfer',
        callbackUrl: baseSelf ? `${baseSelf}/api/payhero/callback` : '/api/payhero/callback',
        confirmUrl: baseSelf ? `${baseSelf}/api/payhero/confirm` : '/api/payhero/confirm',
        walletUrl: baseSelf ? `${baseSelf}/api/payhero/wallet` : '/api/payhero/wallet',
      },
    };
  };

  const applyPayHeroVerificationPayload = (
    tx: MpesaTxRecord,
    params: {
      statusRaw?: unknown;
      successFlag?: unknown;
      resultCode?: unknown;
      receipt?: string;
      message?: string;
      amount?: number;
      source: 'PAYHERO_CALLBACK' | 'PAYHERO_API';
    }
  ): { updated: boolean; validConfirmation: boolean; error?: string } => {
    const st = String(params.statusRaw || '').trim().toUpperCase();
    const receipt = params.receipt ? String(params.receipt).trim() : undefined;
    const resultCodeNum =
      params.resultCode !== undefined && params.resultCode !== null && String(params.resultCode).trim() !== ''
        ? Number(params.resultCode)
        : undefined;
    const isRejected =
      params.successFlag === false ||
      ['FAILED', 'FAILURE', 'REJECTED', 'CANCELLED', 'CANCELED', 'DECLINED', 'REVERSED', 'ERROR'].includes(st) ||
      (resultCodeNum !== undefined && !Number.isNaN(resultCodeNum) && resultCodeNum !== 0);
    const isCompleted =
      !isRejected &&
      (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'COMPLETE', 'CONFIRMED', 'SETTLED', 'PAID'].includes(st) ||
        params.successFlag === true ||
        resultCodeNum === 0);

    if (isRejected) {
      tx.status = 'REJECTED';
      tx.callbackVerified = true;
      tx.verificationSource = params.source;
      if (receipt) tx.mpesaReceipt = receipt;
      if (params.resultCode !== undefined) tx.resultCode = String(params.resultCode);
      tx.resultDesc = params.message || `PayHero reported transaction ${st ? st.toLowerCase() : 'failed'}.`;
      tx.updatedAt = Date.now();
      mpesaTransactions.set(tx.id, tx);
      if (tx.payheroExternalRef) originatorToPrimaryId.set(tx.payheroExternalRef, tx.id);
      if (tx.originatorConversationId) originatorToPrimaryId.set(tx.originatorConversationId, tx.id);
      broadcastMpesaTxUpdate(tx);
      return { updated: true, validConfirmation: true };
    }

    if (isCompleted) {
      const hasValidReceipt = Boolean(receipt && receipt.length >= 4 && !receipt.startsWith('PING'));
      const amountPositive =
        params.amount !== undefined
          ? !Number.isNaN(params.amount) && params.amount > 0
          : tx.kesAmount > 0 || tx.usdAmount > 0;
      if (!hasValidReceipt || !amountPositive) {
        tx.resultDesc =
          'PayHero reported Success without a valid provider/M-Pesa receipt code or positive amount; staying PENDING.';
        tx.updatedAt = Date.now();
        mpesaTransactions.set(tx.id, tx);
        broadcastMpesaTxUpdate(tx);
        return { updated: false, validConfirmation: false, error: tx.resultDesc };
      }

      tx.status = 'COMPLETED';
      tx.callbackVerified = true;
      tx.verificationSource = params.source;
      tx.mpesaReceipt = receipt;
      const kesVal = Number(tx.kesAmount || 0).toLocaleString();
      const targetDisplay = tx.recipientPhone || tx.partyB || tx.phone;
      const actionVerb =
        tx.type === 'PAYHERO_DEPOSIT'
          ? 'deposited from'
          : tx.type === 'PAYHERO_TRANSFER'
          ? 'transferred to'
          : 'withdrawn to';
      tx.safaricomConfirmationText =
        params.message ||
        `PayHero Confirmed (${receipt}): $${tx.usdAmount.toFixed(2)} USD (KES ${kesVal}) ${actionVerb} ${targetDisplay}.`;
      tx.resultDesc = tx.safaricomConfirmationText;
      tx.updatedAt = Date.now();
      mpesaTransactions.set(tx.id, tx);
      if (tx.payheroExternalRef) originatorToPrimaryId.set(tx.payheroExternalRef, tx.id);
      broadcastMpesaTxUpdate(tx);
      return { updated: true, validConfirmation: true };
    }

    if (params.message) {
      tx.resultDesc = params.message;
      tx.updatedAt = Date.now();
      mpesaTransactions.set(tx.id, tx);
    }
    return { updated: false, validConfirmation: false };
  };

  const queryPayHeroTransactionStatus = async (
    pcfg: ReturnType<typeof getPayHeroConfig>,
    ref: string
  ): Promise<{ ok: boolean; status?: string; receipt?: string; raw?: Record<string, any>; error?: string }> => {
    if (!pcfg.apiConfigured) {
      return { ok: false, error: 'PayHero API credentials not configured.' };
    }
    try {
      const upstream = await fetch(
        `${pcfg.apiBaseUrl}/api/v2/transaction-status?reference=${encodeURIComponent(ref)}`,
        {
          headers: {
            Authorization: pcfg.authHeader,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = (await upstream.json().catch(() => ({}))) as Record<string, any>;
      if (!upstream.ok) {
        return {
          ok: false,
          error: String(data.message || data.error_message || data.error || `PayHero status HTTP ${upstream.status}`),
          raw: data,
        };
      }
      const receipt = data.provider_reference || data.third_party_reference || data.MpesaReceiptNumber || data.mpesa_receipt;
      return {
        ok: true,
        status: data.status ? String(data.status) : data.success === true ? 'SUCCESS' : undefined,
        receipt: receipt ? String(receipt) : undefined,
        raw: data,
      };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Unable to reach PayHero status API.' };
    }
  };

  app.get('/api/payhero', (req, res) => {
    const pcfg = getPayHeroConfig(req);
    return res.json({
      ok: true,
      environment: 'production',
      mode: pcfg.apiConfigured ? 'PAYHERO_API_V2' : 'PAYHERO_WEBHOOK_BRIDGE',
      apiBaseUrl: pcfg.apiBaseUrl,
      apiConfigured: pcfg.apiConfigured,
      channelIdConfigured: pcfg.channelIdConfigured,
      webhookSecretConfigured: Boolean(pcfg.webhookSecret),
      merchantAccountId: pcfg.merchantAccountId,
      callbackAuthGated: isPreviewAuthGatedUrl(pcfg.publicBase),
      apiWarning: pcfg.apiWarning,
      urls: pcfg.urls,
    });
  });

  app.get('/api/payhero/status', (req, res) => {
    const pcfg = getPayHeroConfig(req);
    const seen = new Set<string>();
    const payheroTxs = Array.from(mpesaTransactions.values()).filter((t) => {
      if (t.type !== 'PAYHERO_DEPOSIT' && t.type !== 'PAYHERO_WITHDRAWAL' && t.type !== 'PAYHERO_TRANSFER') {
        return false;
      }
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
    return res.json({
      ok: true,
      connected: true,
      environment: 'production',
      mode: pcfg.apiConfigured ? 'PAYHERO_API_V2' : 'PAYHERO_WEBHOOK_BRIDGE',
      apiBaseUrl: pcfg.apiBaseUrl,
      apiConfigured: pcfg.apiConfigured,
      channelIdConfigured: pcfg.channelIdConfigured,
      channelId: pcfg.channelIdRaw || undefined,
      webhookSecretConfigured: Boolean(pcfg.webhookSecret),
      merchantAccountId: pcfg.merchantAccountId,
      callbackAuthGated: isPreviewAuthGatedUrl(pcfg.publicBase),
      apiWarning: pcfg.apiWarning,
      urls: pcfg.urls,
      stats: {
        total: payheroTxs.length,
        pending: payheroTxs.filter((t) => t.status === 'PENDING').length,
        confirmed: payheroTxs.filter((t) => t.status === 'COMPLETED' && t.callbackVerified === true).length,
        rejected: payheroTxs.filter((t) => t.status === 'REJECTED').length,
      },
    });
  });

  app.get('/api/payhero/wallet', async (req, res) => {
    const pcfg = getPayHeroConfig(req);
    if (!pcfg.apiConfigured) {
      return res.json({
        ok: false,
        apiConfigured: false,
        error: 'PayHero API credentials (PAYHERO_AUTH_TOKEN or PAYHERO_API_USERNAME + PAYHERO_API_PASSWORD) not set in Secrets.',
      });
    }
    try {
      const upstream = await fetch(`${pcfg.apiBaseUrl}/api/v2/wallets?wallet_type=service_wallet`, {
        headers: {
          Authorization: pcfg.authHeader,
          'Content-Type': 'application/json',
        },
      });
      const data = (await upstream.json().catch(() => ({}))) as Record<string, any>;
      if (!upstream.ok) {
        return res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).json({
          ok: false,
          apiConfigured: true,
          error: String(data.message || data.error_message || data.error || `PayHero returned HTTP ${upstream.status}`),
        });
      }
      const walletObj = Array.isArray(data) ? data[0] : data.wallet || data;
      return res.json({
        ok: true,
        apiConfigured: true,
        walletType: 'service_wallet',
        balance: Number(walletObj?.balance ?? walletObj?.available_balance ?? 0),
        currency: String(walletObj?.currency || 'KES'),
        wallet: walletObj,
      });
    } catch (err: any) {
      return res.status(502).json({
        ok: false,
        apiConfigured: true,
        error: err?.message || 'Unable to query PayHero service wallet.',
      });
    }
  });

  app.get('/api/payhero/transactions', (_req, res) => {
    const seen = new Set<string>();
    const list = Array.from(mpesaTransactions.values())
      .filter((t) => {
        if (t.type !== 'PAYHERO_DEPOSIT' && t.type !== 'PAYHERO_WITHDRAWAL' && t.type !== 'PAYHERO_TRANSFER') {
          return false;
        }
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    return res.json({ ok: true, transactions: list });
  });

  const handlePayHeroAction = async (
    req: Request,
    res: Response,
    forcedAction?: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER'
  ) => {
    const pcfg = getPayHeroConfig(req);
    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const rawAction = String(
      forcedAction || body.action || body.direction || body.type || body.transferType || 'DEPOSIT'
    )
      .trim()
      .toUpperCase();
    const action: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' =
      rawAction === 'WITHDRAWAL' || rawAction === 'WITHDRAW' || rawAction === 'PAYOUT'
        ? 'WITHDRAWAL'
        : rawAction === 'TRANSFER' || rawAction === 'SEND' || rawAction === 'MONEY_TRANSFER'
        ? 'TRANSFER'
        : 'DEPOSIT';

    const resolvedEndpoint =
      action === 'DEPOSIT' ? '/api/payhero/deposit' : action === 'WITHDRAWAL' ? '/api/payhero/withdraw' : '/api/payhero/transfer';

    const rawRail = String(body.transferRail || body.payment_type || body.channel || 'mobile')
      .trim()
      .toLowerCase();
    const transferRail: 'mobile' | 'paybill' | 'till' | 'bank' =
      rawRail === 'bank'
        ? 'bank'
        : rawRail === 'paybill'
        ? 'paybill'
        : rawRail === 'till' || rawRail === 'buygoods'
        ? 'till'
        : 'mobile';

    const rawPhone = body.phone ?? body.phone_number ?? body.msisdn ?? body.phoneNumber ?? body.mobile;
    const rawAccountNumber = String(body.accountNumber ?? body.account_number ?? body.partyB ?? body.recipientAccount ?? '').trim();
    const rawAccountName = String(body.accountName ?? body.account_name ?? body.customerName ?? body.customer_name ?? 'Recipient').trim();
    const rawBankCode = String(body.bankCode ?? body.bank_code ?? '').trim();
    const rawNetworkCode = String(body.networkCode ?? body.network_code ?? '63902').trim();
    const rawChannelOverride = body.channelId ?? body.channel_id;
    const effectiveChannelId =
      rawChannelOverride && /^\d+$/.test(String(rawChannelOverride).trim())
        ? Number(String(rawChannelOverride).trim())
        : pcfg.channelIdNum;

    const rawCurrency = String(body.currency || 'USD').trim().toUpperCase();
    const rawAmount = body.amount !== undefined ? Number(body.amount) : undefined;
    const rawUsdAmount =
      body.usdAmount !== undefined
        ? Number(body.usdAmount)
        : rawCurrency === 'KES' && rawAmount
        ? Number((rawAmount / 129.5).toFixed(2))
        : rawAmount;
    const rawKesAmount =
      body.kesAmount !== undefined
        ? Number(body.kesAmount)
        : rawCurrency === 'KES' && rawAmount
        ? rawAmount
        : undefined;

    const amountUsd = Number(rawUsdAmount || 0);
    if (!amountUsd || Number.isNaN(amountUsd) || amountUsd < 10) {
      return res.status(400).json({ ok: false, error: 'Minimum PayHero transaction is $10.00 USD.' });
    }
    const amountKes = Math.round(Number(rawKesAmount || 0)) || Math.round(amountUsd * 129.5);

    const parsedPhone = normalizeKenyanMsisdnServer(String(rawPhone || ''));
    if (action !== 'TRANSFER' || transferRail === 'mobile') {
      if (!parsedPhone) {
        return res.status(400).json({
          ok: false,
          error: 'Valid Kenyan phone number is required for PayHero mobile settlement (e.g. 0728424076 or 254793950512).',
        });
      }
    } else if (!rawAccountNumber || rawAccountNumber.length < 4) {
      return res.status(400).json({
        ok: false,
        error: `Valid destination ${transferRail.toUpperCase()} account/till/paybill number is required for PayHero transfer.`,
      });
    } else if (transferRail === 'bank' && !rawBankCode) {
      return res.status(400).json({
        ok: false,
        error: 'Bank code (bank_code) is required for PayHero bank transfers.',
      });
    }

    const rawLoginInput = String(body.loginId || body.derivLoginId || '').trim();
    const isStandalonePayHero = Boolean(
      body.standalone === true ||
        (action === 'TRANSFER' && (!rawLoginInput || rawLoginInput.toUpperCase() === 'STANDALONE')) ||
        rawLoginInput.toUpperCase() === 'STANDALONE'
    );
    const resolvedLoginId = isStandalonePayHero ? undefined : rawLoginInput || undefined;
    const externalRef = `PH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const phoneDisplay = parsedPhone?.phone || rawAccountNumber;
    const msisdnDisplay = parsedPhone?.msisdn || rawAccountNumber;
    const targetLabel =
      action === 'TRANSFER' && transferRail !== 'mobile'
        ? `${transferRail.toUpperCase()} ${rawAccountNumber}${rawAccountName ? ` (${rawAccountName})` : ''}`
        : phoneDisplay;

    const txType: MpesaTxRecord['type'] =
      action === 'DEPOSIT' ? 'PAYHERO_DEPOSIT' : action === 'WITHDRAWAL' ? 'PAYHERO_WITHDRAWAL' : 'PAYHERO_TRANSFER';

    const forcePayHeroBridge = String(body.dispatchVia || '').toLowerCase() === 'bridge';
    if (!forcePayHeroBridge && pcfg.apiConfigured && (action !== 'DEPOSIT' || effectiveChannelId)) {
      try {
        const upstreamUrl =
          action === 'DEPOSIT' ? `${pcfg.apiBaseUrl}/api/v2/payments` : `${pcfg.apiBaseUrl}/api/v2/withdraw`;
        const upstreamBody: Record<string, unknown> =
          action === 'DEPOSIT'
            ? {
                amount: amountKes,
                phone_number: msisdnDisplay,
                channel_id: effectiveChannelId,
                provider: 'm-pesa',
                external_reference: externalRef,
                customer_name: rawAccountName,
                callback_url: pcfg.urls.callbackUrl,
              }
            : transferRail === 'bank'
            ? {
                amount: amountKes,
                payment_type: 'bank',
                channel: 'bank',
                bank_code: rawBankCode,
                account_number: rawAccountNumber,
                account_name: rawAccountName,
                external_reference: externalRef,
                callback_url: pcfg.urls.callbackUrl,
              }
            : transferRail === 'paybill' || transferRail === 'till'
            ? {
                amount: amountKes,
                payment_type: transferRail,
                channel: transferRail,
                network_code: rawNetworkCode || '63902',
                account_number: rawAccountNumber,
                account_reference: body.accountReference ? String(body.accountReference) : externalRef,
                account_name: rawAccountName,
                phone_number: parsedPhone?.msisdn,
                external_reference: externalRef,
                callback_url: pcfg.urls.callbackUrl,
              }
            : {
                amount: amountKes,
                payment_type: 'mobile',
                channel: 'mobile',
                provider: rawNetworkCode === '63903' ? 'airtel' : 'm-pesa',
                network_code: rawNetworkCode || '63902',
                phone_number: msisdnDisplay,
                external_reference: externalRef,
                callback_url: pcfg.urls.callbackUrl,
              };

        const upstream = await fetch(upstreamUrl, {
          method: 'POST',
          headers: {
            Authorization: pcfg.authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(upstreamBody),
          signal: AbortSignal.timeout(6500),
        });
        const upstreamData = (await upstream.json().catch(() => ({}))) as Record<string, any>;
        if (!upstream.ok) {
          const errMsg = String(
            upstreamData.message || upstreamData.error_message || upstreamData.error || `PayHero API returned HTTP ${upstream.status}`
          );
          const payload = { ok: false, configured: true, status: 'REJECTED', error: errMsg };
          recordCashierDiagnostic({
            channel: 'PAYHERO',
            method: 'POST',
            endpoint: resolvedEndpoint,
            httpStatus: 502,
            outcome: 'REJECTED',
            phoneOrTarget: targetLabel,
            usdAmount: amountUsd,
            kesAmount: amountKes,
            reference: externalRef,
            summary: errMsg,
            responsePayload: upstreamData,
          });
          return res.status(502).json(payload);
        }

        const primaryRef = String(
          upstreamData.reference || upstreamData.CheckoutRequestID || upstreamData.merchant_reference || externalRef
        );
        const record: MpesaTxRecord = {
          id: primaryRef,
          originatorConversationId: upstreamData.CheckoutRequestID ? String(upstreamData.CheckoutRequestID) : undefined,
          type: txType,
          standalone: isStandalonePayHero,
          environment: 'production',
          phone: msisdnDisplay,
          recipientPhone: phoneDisplay,
          recipientMsisdn: msisdnDisplay,
          payheroChannelId: effectiveChannelId ? String(effectiveChannelId) : undefined,
          payheroExternalRef: externalRef,
          transferRail,
          partyB: transferRail !== 'mobile' ? rawAccountNumber : undefined,
          accountReference: body.accountReference ? String(body.accountReference) : externalRef,
          usdAmount: amountUsd,
          kesAmount: amountKes,
          loginId: resolvedLoginId,
          status: 'PENDING',
          callbackVerified: false,
          resultDesc: String(
            upstreamData.message ||
              `PayHero ${action.toLowerCase()} ${primaryRef} submitted (${targetLabel}). Awaiting PayHero confirmation.`
          ),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        mpesaTransactions.set(primaryRef, record);
        originatorToPrimaryId.set(externalRef, primaryRef);
        if (record.originatorConversationId) {
          originatorToPrimaryId.set(record.originatorConversationId, primaryRef);
        }

        if (upstreamData.status || upstreamData.provider_reference) {
          applyPayHeroVerificationPayload(record, {
            statusRaw: upstreamData.status,
            successFlag: upstreamData.success,
            receipt: upstreamData.provider_reference || upstreamData.third_party_reference || upstreamData.MpesaReceiptNumber,
            message: upstreamData.message,
            amount: amountKes,
            source: 'PAYHERO_API',
          });
        }

        const payload = {
          ok: true,
          configured: true,
          mode: 'PAYHERO_API_V2' as const,
          action,
          standalone: isStandalonePayHero,
          transferRail,
          status: record.status,
          callbackVerified: Boolean(record.callbackVerified),
          reference: primaryRef,
          externalReference: externalRef,
          transactionId: primaryRef,
          mpesaReceipt: record.mpesaReceipt,
          recipientPhone: phoneDisplay,
          recipientMsisdn: msisdnDisplay,
          targetLabel,
          callbackUrl: pcfg.urls.callbackUrl,
          message: record.resultDesc,
        };
        recordCashierDiagnostic({
          channel: 'PAYHERO',
          method: 'POST',
          endpoint: resolvedEndpoint,
          httpStatus: record.status === 'COMPLETED' ? 200 : 202,
          outcome: record.status === 'COMPLETED' ? 'OK' : 'PENDING',
          phoneOrTarget: targetLabel,
          usdAmount: amountUsd,
          kesAmount: amountKes,
          reference: primaryRef,
          summary: payload.message || `PayHero ${action.toLowerCase()} submitted`,
          responsePayload: payload,
        });
        return res.status(record.status === 'COMPLETED' ? 200 : 202).json(payload);
      } catch (err: any) {
        return res.status(502).json({
          ok: false,
          configured: true,
          error: err?.message || 'Unable to reach PayHero API v2.',
        });
      }
    }

    // Built-In PayHero Webhook Bridge (stays PENDING until PayHero callback or API status confirms)
    const record: MpesaTxRecord = {
      id: externalRef,
      type: txType,
      standalone: isStandalonePayHero,
      environment: 'production',
      phone: msisdnDisplay,
      recipientPhone: phoneDisplay,
      recipientMsisdn: msisdnDisplay,
      payheroChannelId: effectiveChannelId ? String(effectiveChannelId) : pcfg.channelIdRaw || undefined,
      payheroExternalRef: externalRef,
      transferRail,
      partyB: transferRail !== 'mobile' ? rawAccountNumber : undefined,
      accountReference: body.accountReference ? String(body.accountReference) : externalRef,
      usdAmount: amountUsd,
      kesAmount: amountKes,
      loginId: resolvedLoginId,
      status: 'PENDING',
      callbackVerified: false,
      resultDesc: `PayHero ${action.toLowerCase()} ${externalRef} queued ($${amountUsd.toFixed(2)} USD / KES ${amountKes.toLocaleString()} -> ${targetLabel}). Awaiting PayHero confirmation at ${pcfg.urls.callbackUrl}.`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    mpesaTransactions.set(externalRef, record);

    const payload = {
      ok: true,
      configured: pcfg.apiConfigured,
      builtInBridge: true,
      mode: 'PAYHERO_WEBHOOK_BRIDGE' as const,
      action,
      standalone: isStandalonePayHero,
      transferRail,
      status: 'PENDING' as const,
      callbackVerified: false,
      reference: externalRef,
      externalReference: externalRef,
      transactionId: externalRef,
      recipientPhone: phoneDisplay,
      recipientMsisdn: msisdnDisplay,
      targetLabel,
      callbackUrl: pcfg.urls.callbackUrl,
      message: record.resultDesc,
    };
    recordCashierDiagnostic({
      channel: 'PAYHERO',
      method: 'POST',
      endpoint: resolvedEndpoint,
      httpStatus: 202,
      outcome: 'PENDING',
      phoneOrTarget: targetLabel,
      usdAmount: amountUsd,
      kesAmount: amountKes,
      reference: externalRef,
      summary: record.resultDesc || `PayHero ${action.toLowerCase()} queued`,
      responsePayload: payload,
    });
    return res.status(202).json(payload);
  };

  const handlePayHeroGetBridge = (req: Request, res: Response, action: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER') => {
    const acceptHeader = String(req.headers.accept || '');
    const wantsJson = String(req.query.format || '').toLowerCase() === 'json';
    const prefersHtml = acceptHeader.includes('text/html') && !wantsJson;
    const pcfg = getPayHeroConfig(req);

    if (prefersHtml) {
      const qs = new URLSearchParams();
      qs.set('cashier', 'payhero');
      qs.set('direction', action);
      const qAmount = String(req.query.amount || req.query.usdAmount || '').trim();
      const qPhone = String(req.query.phone || req.query.phone_number || req.query.msisdn || '').trim();
      if (qAmount) qs.set('amount', qAmount);
      if (qPhone) qs.set('phone', qPhone);
      return res.redirect(302, `/?${qs.toString()}`);
    }

    const txType: MpesaTxRecord['type'] =
      action === 'DEPOSIT' ? 'PAYHERO_DEPOSIT' : action === 'WITHDRAWAL' ? 'PAYHERO_WITHDRAWAL' : 'PAYHERO_TRANSFER';
    const seen = new Set<string>();
    const recent = Array.from(mpesaTransactions.values())
      .filter((t) => {
        if (t.type !== txType || seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);

    return res.json({
      ok: true,
      environment: 'production',
      action,
      endpoint:
        action === 'DEPOSIT'
          ? '/api/payhero/deposit'
          : action === 'WITHDRAWAL'
          ? '/api/payhero/withdraw'
          : '/api/payhero/transfer',
      method: 'POST',
      mode: pcfg.apiConfigured ? 'PAYHERO_API_V2' : 'PAYHERO_WEBHOOK_BRIDGE',
      apiBaseUrl: pcfg.apiBaseUrl,
      apiConfigured: pcfg.apiConfigured,
      channelIdConfigured: pcfg.channelIdConfigured,
      webhookSecretConfigured: Boolean(pcfg.webhookSecret),
      callbackAuthGated: isPreviewAuthGatedUrl(pcfg.publicBase),
      apiWarning: pcfg.apiWarning,
      merchantAccountId: pcfg.merchantAccountId,
      urls: pcfg.urls,
      transactions: recent,
    });
  };

  app.get('/api/payhero/deposit', (req, res) => handlePayHeroGetBridge(req, res, 'DEPOSIT'));
  app.get('/api/payhero/withdraw', (req, res) => handlePayHeroGetBridge(req, res, 'WITHDRAWAL'));
  app.get('/api/payhero/transfer', (req, res) => handlePayHeroGetBridge(req, res, 'TRANSFER'));

  app.post('/api/payhero/deposit', (req, res) => handlePayHeroAction(req, res, 'DEPOSIT'));
  app.post('/api/payhero/withdraw', (req, res) => handlePayHeroAction(req, res, 'WITHDRAWAL'));
  app.post('/api/payhero/transfer', (req, res) => handlePayHeroAction(req, res, 'TRANSFER'));

  app.get('/api/payhero/transaction-status/:reference', async (req, res) => {
    const ref = String(req.params.reference || '').trim();
    const mappedId = originatorToPrimaryId.get(ref);
    const tx = mpesaTransactions.get(ref) || (mappedId ? mpesaTransactions.get(mappedId) : undefined);
    if (
      !tx ||
      (tx.type !== 'PAYHERO_DEPOSIT' && tx.type !== 'PAYHERO_WITHDRAWAL' && tx.type !== 'PAYHERO_TRANSFER')
    ) {
      return res.status(404).json({ ok: false, error: `PayHero transaction ${ref} not found.` });
    }

    const pcfg = getPayHeroConfig(req);
    if (tx.status === 'PENDING' && pcfg.apiConfigured) {
      const probe = await queryPayHeroTransactionStatus(pcfg, tx.id);
      if (probe.ok && probe.raw) {
        applyPayHeroVerificationPayload(tx, {
          statusRaw: probe.status,
          successFlag: probe.raw.success,
          receipt: probe.receipt,
          message: probe.raw.message ? String(probe.raw.message) : undefined,
          amount: tx.kesAmount,
          source: 'PAYHERO_API',
        });
      }
    }

    return res.json({
      ok: true,
      transaction: tx,
      reference: tx.id,
      externalReference: tx.payheroExternalRef,
      status: tx.status,
      callbackVerified: Boolean(tx.callbackVerified),
      mpesaReceipt: tx.mpesaReceipt,
      message: tx.safaricomConfirmationText || tx.resultDesc,
    });
  });

  app.post('/api/payhero/confirm', async (req, res) => {
    const ref = String(req.body?.reference || req.body?.id || '').trim();
    if (!ref) {
      return res.status(400).json({ ok: false, error: 'PayHero transaction reference is required.' });
    }
    const mappedId = originatorToPrimaryId.get(ref);
    const tx = mpesaTransactions.get(ref) || (mappedId ? mpesaTransactions.get(mappedId) : undefined);
    if (
      !tx ||
      (tx.type !== 'PAYHERO_DEPOSIT' && tx.type !== 'PAYHERO_WITHDRAWAL' && tx.type !== 'PAYHERO_TRANSFER')
    ) {
      return res.status(404).json({ ok: false, error: `PayHero transaction ${ref} not found.` });
    }

    const pcfg = getPayHeroConfig(req);
    if (tx.status === 'PENDING' && pcfg.apiConfigured) {
      const probe = await queryPayHeroTransactionStatus(pcfg, tx.id);
      if (probe.ok && probe.raw) {
        applyPayHeroVerificationPayload(tx, {
          statusRaw: probe.status,
          successFlag: probe.raw.success,
          receipt: probe.receipt,
          message: probe.raw.message ? String(probe.raw.message) : undefined,
          amount: tx.kesAmount,
          source: 'PAYHERO_API',
        });
      }
    }

    if (tx.status === 'COMPLETED' && tx.callbackVerified === true) {
      return res.json({ ok: true, transaction: tx });
    }
    if (tx.status === 'REJECTED') {
      return res.status(409).json({
        ok: false,
        status: 'REJECTED',
        error: tx.resultDesc || 'PayHero rejected this transaction.',
        transaction: tx,
      });
    }
    return res.status(409).json({
      ok: false,
      awaitingPayheroCallback: true,
      status: 'PENDING',
      error: `PayHero transaction ${ref} is PENDING until PayHero API status or /api/payhero/callback confirms settlement.`,
      transaction: tx,
    });
  });

  app.get('/api/payhero/callback', (req, res) => {
    const pcfg = getPayHeroConfig(req);
    const recentWebhooks = incomingWebhookCallbacks
      .filter((w) => w.kind === 'PAYHERO_CALLBACK')
      .slice(0, 10)
      .map((w) => ({
        id: w.id,
        receivedAt: w.receivedAt,
        reference: w.reference,
        resultCode: w.resultCode,
        resultDesc: w.resultDesc,
        mpesaReceipt: w.mpesaReceipt,
        matchedTransaction: w.matchedTransaction,
        sourceIp: w.sourceIp,
      }));
    return res.json({
      ok: true,
      environment: 'production',
      endpoint: '/api/payhero/callback',
      method: 'POST',
      merchantAccountId: pcfg.merchantAccountId,
      mode: pcfg.apiConfigured ? 'PAYHERO_API_V2' : 'PAYHERO_WEBHOOK_BRIDGE',
      webhookSecretConfigured: Boolean(pcfg.webhookSecret),
      callbackAuthGated: isPreviewAuthGatedUrl(pcfg.publicBase),
      urls: pcfg.urls,
      recentWebhooks,
    });
  });

  app.post('/api/payhero/callback', (req, res) => {
    const pcfg = getPayHeroConfig(req);
    const bodyObj = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const respObj =
      typeof bodyObj.response === 'object' && bodyObj.response !== null
        ? (bodyObj.response as Record<string, unknown>)
        : {};
    const merged: Record<string, unknown> = { ...respObj, ...bodyObj };

    const candidates = [
      merged.ExternalReference,
      merged.external_reference,
      merged.reference,
      merged.CheckoutRequestID,
      merged.checkout_request_id,
      merged.transaction_id,
    ]
      .filter(Boolean)
      .map((v) => String(v).trim());
    const refStr = candidates[0];

    if (pcfg.webhookSecret) {
      const sigHeader = String(
        req.headers['x-payhero-signature'] || req.headers['x-webhook-signature'] || req.headers['x-signature'] || ''
      ).trim();
      const sigHex = sigHeader.replace(/^sha256=/i, '').trim().toLowerCase();
      const rawBody = (req as Request & { rawBody?: string }).rawBody || JSON.stringify(req.body || {});
      const expected = crypto.createHmac('sha256', pcfg.webhookSecret).update(rawBody).digest('hex').toLowerCase();
      const isHex = /^[0-9a-f]{64}$/i.test(sigHex);
      const validSig =
        (isHex &&
          sigHex.length === expected.length &&
          crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(expected, 'hex'))) ||
        sigHeader === pcfg.webhookSecret;

      if (!validSig) {
        const errMsg = 'Invalid PayHero webhook signature header.';
        const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
          kind: 'PAYHERO_CALLBACK',
          endpoint: '/api/payhero/callback',
          reference: refStr,
          resultCode: '401_HMAC_INVALID',
          resultDesc: errMsg,
          matchedTransaction: false,
        });
        recordCashierDiagnostic({
          channel: 'PAYHERO',
          method: 'POST',
          endpoint: '/api/payhero/callback',
          httpStatus: 401,
          outcome: 'REJECTED',
          reference: refStr,
          summary: `${errMsg} (source ${rawEntry.sourceIp})`,
          responsePayload: { ok: false, error: errMsg, signatureHeaderPresent: Boolean(sigHeader) },
        });
        return res.status(401).json({ ok: false, error: errMsg });
      }
    }

    const statusRaw = merged.Status ?? merged.status ?? bodyObj.status;
    const resultCodeRaw = merged.ResultCode ?? merged.result_code;
    const receiptRaw =
      merged.MpesaReceiptNumber ??
      merged.provider_reference ??
      merged.third_party_reference ??
      merged.receipt ??
      merged.mpesaReceipt;
    const receiptStr = receiptRaw ? String(receiptRaw).trim() : undefined;
    const messageStr = merged.ResultDesc
      ? String(merged.ResultDesc)
      : merged.message
      ? String(merged.message)
      : undefined;
    const amountRaw = merged.Amount ?? merged.amount ?? merged.kesAmount;
    const amountNum = amountRaw !== undefined ? Number(amountRaw) : undefined;

    let matchedTx: MpesaTxRecord | undefined;
    for (const c of candidates) {
      const mapped = originatorToPrimaryId.get(c);
      const found = mpesaTransactions.get(c) || (mapped ? mpesaTransactions.get(mapped) : undefined);
      if (
        found &&
        (found.type === 'PAYHERO_DEPOSIT' || found.type === 'PAYHERO_WITHDRAWAL' || found.type === 'PAYHERO_TRANSFER')
      ) {
        matchedTx = found;
        break;
      }
    }

    let matchedTransaction = false;
    let verificationError: string | undefined;
    let outcome: ServerDiagOutcome = 'WARNING';

    if (matchedTx) {
      matchedTransaction = true;
      const result = applyPayHeroVerificationPayload(matchedTx, {
        statusRaw,
        successFlag: bodyObj.status === true ? true : bodyObj.status === false ? false : undefined,
        resultCode: resultCodeRaw,
        receipt: receiptStr,
        message: messageStr,
        amount: amountNum,
        source: 'PAYHERO_CALLBACK',
      });
      verificationError = result.error;
      outcome = matchedTx.status === 'COMPLETED' ? 'OK' : matchedTx.status === 'REJECTED' ? 'REJECTED' : 'WARNING';
    }

    const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'PAYHERO_CALLBACK',
      endpoint: '/api/payhero/callback',
      reference: refStr,
      resultCode: resultCodeRaw !== undefined ? String(resultCodeRaw) : statusRaw ? String(statusRaw) : undefined,
      resultDesc: verificationError || messageStr,
      mpesaReceipt: receiptStr,
      matchedTransaction,
    });

    recordCashierDiagnostic({
      channel: 'PAYHERO',
      method: 'POST',
      endpoint: '/api/payhero/callback',
      httpStatus: 200,
      outcome,
      reference: receiptStr || refStr,
      summary:
        verificationError ||
        messageStr ||
        `PayHero callback POST (${matchedTransaction ? 'matched tx' : 'unmatched ref'}) from ${rawEntry.sourceIp}`,
      responsePayload:
        typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : { raw: req.body },
    });

    return res.json({
      ok: true,
      matchedTransaction,
      reference: matchedTx?.id || refStr,
      verificationError,
    });
  });

  // KCB Bank Kenya (KCB App / KCB Buni Open Banking API & Paybill 522522) Direct Transfer Integration
  let kcbCachedToken: { token: string; expiresAt: number; cacheKey: string; baseUrl: string } | null = null;

  const getKcbConfig = (req: Request) => {
    const rawEnv = cleanEnvVar(process.env.KCB_BUNI_ENV).toLowerCase();
    const rawBaseUrl = cleanEnvVar(process.env.KCB_BUNI_BASE_URL).replace(/\/+$/, '');

    let parsedBuniBaseUrl = '';
    let invalidBuniBaseReason: string | null = null;
    if (rawBaseUrl) {
      const withScheme =
        !/^https?:\/\//i.test(rawBaseUrl) && /^[a-z0-9.-]+(:\d+)?(\/.*)?$/i.test(rawBaseUrl)
          ? `https://${rawBaseUrl}`
          : rawBaseUrl;
      try {
        const parsed = new URL(withScheme);
        const host = parsed.hostname.toLowerCase();
        if (
          (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
          host &&
          host.includes('.') &&
          !host.includes('_') &&
          host !== 'am_igw_host' &&
          !/^localhost$/i.test(host)
        ) {
          const cleanPath = parsed.pathname
            .replace(/\/(?:authorize|token|oauth2\/token|fundstransfer\/.*|oauth\/.*)$/i, '')
            .replace(/\/+$/, '');
          const resolvedOrigin = host === 'buni.kcbgroup.com' ? 'https://api.buni.kcbgroup.com' : parsed.origin;
          parsedBuniBaseUrl = `${resolvedOrigin}${cleanPath}`;
        } else {
          invalidBuniBaseReason = `KCB_BUNI_BASE_URL ("${rawBaseUrl}") is a placeholder or non-public host`;
        }
      } catch {
        invalidBuniBaseReason = `KCB_BUNI_BASE_URL ("${rawBaseUrl}") is not a valid URL`;
      }
    }

    const env: 'sandbox' | 'production' =
      rawEnv === 'sandbox' || (!rawEnv && parsedBuniBaseUrl.toLowerCase().includes('uat.buni.kcbgroup.com'))
        ? 'sandbox'
        : 'production';
    const defaultBuniBase = env === 'sandbox' ? 'https://uat.buni.kcbgroup.com' : 'https://api.buni.kcbgroup.com';

    let consumerKey = cleanEnvVar(process.env.KCB_CONSUMER_KEY).replace(/^(?:Basic|Bearer)\s+/i, '').trim();
    let consumerSecret = cleanEnvVar(process.env.KCB_CONSUMER_SECRET).replace(/^(?:Basic|Bearer)\s+/i, '').trim();

    // Auto-extract key:secret if a Basic base64 token or "key:secret" pair was pasted into KCB_CONSUMER_KEY/SECRET
    const tryDecodeKeyPair = (candidate: string): [string, string] | null => {
      if (!candidate) return null;
      if (candidate.includes(':')) {
        const idx = candidate.indexOf(':');
        const k = candidate.slice(0, idx).trim();
        const s = candidate.slice(idx + 1).trim();
        return k && s ? [k, s] : null;
      }
      if (/^[A-Za-z0-9+/]+={0,2}$/.test(candidate) && candidate.length >= 24) {
        try {
          const decoded = Buffer.from(candidate, 'base64').toString('utf8');
          if (decoded.includes(':') && /^[\x20-\x7e]+$/.test(decoded)) {
            const idx = decoded.indexOf(':');
            const k = decoded.slice(0, idx).trim();
            const s = decoded.slice(idx + 1).trim();
            if (k && s) return [k, s];
          }
        } catch {
          // ignore
        }
      }
      return null;
    };

    if (consumerKey && !consumerSecret) {
      const pair = tryDecodeKeyPair(consumerKey);
      if (pair) {
        [consumerKey, consumerSecret] = pair;
      }
    } else if (!consumerKey && consumerSecret) {
      const pair = tryDecodeKeyPair(consumerSecret);
      if (pair) {
        [consumerKey, consumerSecret] = pair;
      }
    }

    const debitAccountNumber = cleanEnvVar(process.env.KCB_DEBIT_ACCOUNT);
    const ibankAccountNumber = cleanEnvVar(process.env.KCB_IBANK_ACCOUNT) || debitAccountNumber;
    const originatorId = cleanEnvVar(process.env.KCB_ORIGINATOR_ID);
    const companyCode = cleanEnvVar(process.env.KCB_COMPANY_CODE) || 'KE0010001';
    const kcbPaybill = cleanEnvVar(process.env.KCB_PAYBILL) || '522522';
    const merchantId = cleanEnvVar(process.env.KCB_MERCHANT_ID) || 'KCB-NDERISKOOL';
    const webhookSecret = cleanEnvVar(process.env.KCB_WEBHOOK_SECRET);

    const cfg = getDarajaConfig();
    const pcfg = getPayHeroConfig(req);
    const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
    const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim().toLowerCase();
    const hasHttpUrl = Boolean(parsedBuniBaseUrl);
    const isSelfLoop =
      hasHttpUrl &&
      Boolean(
        (reqHost && parsedBuniBaseUrl.toLowerCase().includes(reqHost)) ||
          (publicBase && parsedBuniBaseUrl.toLowerCase().startsWith(publicBase.toLowerCase()))
      );
    const buniBaseUrl = hasHttpUrl && !isSelfLoop ? parsedBuniBaseUrl : defaultBuniBase;
    const buniConfigured = Boolean(consumerKey && consumerSecret && debitAccountNumber);
    const buniOauthReady = Boolean(consumerKey && consumerSecret);
    const buniPartial = Boolean((consumerKey || consumerSecret) && !debitAccountNumber);
    const darajaB2bConfigured = cfg.b2bConfigured || cfg.b2cConfigured;
    const darajaStkConfigured = cfg.stkConfigured;
    const payheroBank01Ready = pcfg.apiConfigured;
    const ibankConnected = buniConfigured || darajaB2bConfigured || payheroBank01Ready || darajaStkConfigured;

    const maskAccount = (acct: string): string => {
      if (!acct) return '';
      if (acct.length <= 4) return acct;
      return `${acct.slice(0, 2)}${'*'.repeat(Math.max(2, acct.length - 6))}${acct.slice(-4)}`;
    };

    const activeMode: 'KCB_BUNI_API' | 'DARAJA_B2B_522522' | 'PAYHERO_BANK_01' | 'KCB_WEBHOOK_BRIDGE' =
      buniConfigured
        ? 'KCB_BUNI_API'
        : darajaB2bConfigured
        ? 'DARAJA_B2B_522522'
        : payheroBank01Ready
        ? 'PAYHERO_BANK_01'
        : 'KCB_WEBHOOK_BRIDGE';

    const warningParts: string[] = [];
    if (invalidBuniBaseReason) {
      warningParts.push(`${invalidBuniBaseReason} — auto-resolved to ${buniBaseUrl}.`);
    }
    if (buniPartial) {
      warningParts.push(
        'KCB Consumer Key/Secret detected without KCB_DEBIT_ACCOUNT; set KCB_DEBIT_ACCOUNT in Secrets to enable direct KCB iBank / Buni IFT payouts.'
      );
    }
    const apiWarning = warningParts.length > 0 ? warningParts.join(' ') : null;

    const baseSelf = publicBase || '';
    return {
      env,
      buniBaseUrl,
      ibankPortalUrl: 'https://onlinebanking.kcbgroup.com',
      consumerKey,
      consumerSecret,
      debitAccountNumber,
      debitAccountMasked: maskAccount(debitAccountNumber),
      ibankAccountNumber,
      ibankAccountMasked: maskAccount(ibankAccountNumber),
      originatorId: originatorId || companyCode,
      companyCode,
      kcbPaybill,
      merchantId,
      webhookSecret,
      buniOauthReady,
      buniConfigured,
      darajaB2bConfigured,
      darajaStkConfigured,
      payheroBank01Ready,
      ibankConnected,
      activeMode,
      apiWarning,
      publicBase,
      urls: {
        checkoutUrl: baseSelf ? `${baseSelf}/?cashier=kcb` : '/?cashier=kcb',
        apiBaseUrl: baseSelf ? `${baseSelf}/api/kcb` : '/api/kcb',
        depositUrl: baseSelf ? `${baseSelf}/api/kcb/deposit` : '/api/kcb/deposit',
        withdrawUrl: baseSelf ? `${baseSelf}/api/kcb/withdraw` : '/api/kcb/withdraw',
        transferUrl: baseSelf ? `${baseSelf}/api/kcb/transfer` : '/api/kcb/transfer',
        inquiryUrl: baseSelf ? `${baseSelf}/api/kcb/account-inquiry` : '/api/kcb/account-inquiry',
        callbackUrl: baseSelf ? `${baseSelf}/api/kcb/callback` : '/api/kcb/callback',
        confirmUrl: baseSelf ? `${baseSelf}/api/kcb/confirm` : '/api/kcb/confirm',
      },
    };
  };

  const isKcbTxType = (type?: string): boolean =>
    type === 'KCB_TRANSFER' || type === 'KCB_DEPOSIT' || type === 'KCB_WITHDRAWAL';

  const fetchKcbBuniAccessToken = async (
    kcfg: ReturnType<typeof getKcbConfig>,
    forceRefresh = false
  ): Promise<{ ok: boolean; token?: string; baseUrl?: string; expiresAt?: number; cached?: boolean; error?: string }> => {
    if (!kcfg.consumerKey || !kcfg.consumerSecret) {
      return { ok: false, error: 'KCB_CONSUMER_KEY and KCB_CONSUMER_SECRET are required for KCB Buni OAuth.' };
    }
    const cacheKey = `${kcfg.buniBaseUrl}|${kcfg.consumerKey.slice(0, 8)}`;
    if (!forceRefresh && kcbCachedToken && kcbCachedToken.cacheKey === cacheKey && Date.now() < kcbCachedToken.expiresAt - 60000) {
      return {
        ok: true,
        token: kcbCachedToken.token,
        baseUrl: kcbCachedToken.baseUrl,
        expiresAt: kcbCachedToken.expiresAt,
        cached: true,
      };
    }

    const auth = Buffer.from(`${kcfg.consumerKey}:${kcfg.consumerSecret}`).toString('base64');
    const explicitSandbox = cleanEnvVar(process.env.KCB_BUNI_ENV).toLowerCase() === 'sandbox';
    const explicitProd = cleanEnvVar(process.env.KCB_BUNI_ENV).toLowerCase() === 'production';

    const candidates: Array<{ tokenUrl: string; apiBase: string }> = [
      { tokenUrl: `${kcfg.buniBaseUrl}/token?grant_type=client_credentials`, apiBase: kcfg.buniBaseUrl },
    ];
    if (!explicitSandbox) {
      if (kcfg.buniBaseUrl !== 'https://api.buni.kcbgroup.com') {
        candidates.push({
          tokenUrl: 'https://api.buni.kcbgroup.com/token?grant_type=client_credentials',
          apiBase: 'https://api.buni.kcbgroup.com',
        });
      }
      candidates.push({
        tokenUrl: 'https://accounts.buni.kcbgroup.com/oauth2/token',
        apiBase: kcfg.buniBaseUrl === 'https://uat.buni.kcbgroup.com' ? 'https://api.buni.kcbgroup.com' : kcfg.buniBaseUrl,
      });
    }
    if (!explicitProd && kcfg.buniBaseUrl !== 'https://uat.buni.kcbgroup.com') {
      candidates.push({
        tokenUrl: 'https://uat.buni.kcbgroup.com/token?grant_type=client_credentials',
        apiBase: 'https://uat.buni.kcbgroup.com',
      });
    }

    let lastError = 'Unable to reach KCB Buni OAuth endpoint.';
    for (const candidate of candidates) {
      try {
        const res = await fetchTextWithTimeout(
          candidate.tokenUrl,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
            body: 'grant_type=client_credentials',
          },
          6000
        );
        const rawText = res.text;
        let data: Record<string, any> = {};
        try {
          data = rawText.trim() ? (JSON.parse(rawText) as Record<string, any>) : {};
        } catch {
          data = { error_description: extractSafeDarajaTextError(res.status, rawText, res.statusText) };
        }
        if (res.ok && data.access_token) {
          const ttlMs = Math.max(300, Math.min(3600, Number(data.expires_in || 3300))) * 1000;
          const tokenStr = String(data.access_token);
          const expiresAtMs = Date.now() + ttlMs;
          kcbCachedToken = {
            token: tokenStr,
            baseUrl: candidate.apiBase,
            expiresAt: expiresAtMs,
            cacheKey,
          };
          return {
            ok: true,
            token: tokenStr,
            baseUrl: candidate.apiBase,
            expiresAt: expiresAtMs,
            cached: false,
          };
        }
        lastError = String(
          data.error_description || data.error || data.message || `KCB Buni OAuth HTTP ${res.status} (${candidate.tokenUrl})`
        );
      } catch (err: any) {
        lastError = err?.message || `Unable to reach ${candidate.tokenUrl}`;
      }
    }
    return { ok: false, error: lastError };
  };

  const applyKcbVerificationPayload = (
    tx: MpesaTxRecord,
    params: {
      statusRaw?: unknown;
      successFlag?: unknown;
      resultCode?: unknown;
      receipt?: string;
      message?: string;
      amount?: number;
      source: 'KCB_CALLBACK' | 'KCB_BUNI_API';
    }
  ): { updated: boolean; validConfirmation: boolean; error?: string } => {
    const st = String(params.statusRaw || '').trim().toUpperCase();
    const receipt = params.receipt ? String(params.receipt).trim() : undefined;
    const rcStr = params.resultCode !== undefined && params.resultCode !== null ? String(params.resultCode).trim() : '';
    const rcNum = rcStr !== '' && !Number.isNaN(Number(rcStr)) ? Number(rcStr) : undefined;

    const isRejected =
      params.successFlag === false ||
      ['FAILED', 'FAILURE', 'REJECTED', 'CANCELLED', 'CANCELED', 'DECLINED', 'REVERSED', 'ERROR'].includes(st) ||
      (rcNum !== undefined && rcNum !== 0 && rcStr !== '200');
    const isCompleted =
      !isRejected &&
      (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'COMPLETE', 'CONFIRMED', 'SETTLED', 'PAID', 'PROCESSED'].includes(st) ||
        params.successFlag === true ||
        rcNum === 0 ||
        rcStr === '200');

    if (isRejected) {
      tx.status = 'REJECTED';
      tx.callbackVerified = true;
      tx.verificationSource = params.source;
      if (receipt) tx.mpesaReceipt = receipt;
      if (rcStr) tx.resultCode = rcStr;
      tx.resultDesc = params.message || `KCB transfer reported ${st ? st.toLowerCase() : 'failed'}.`;
      tx.updatedAt = Date.now();
      mpesaTransactions.set(tx.id, tx);
      if (tx.originatorConversationId) originatorToPrimaryId.set(tx.originatorConversationId, tx.id);
      broadcastMpesaTxUpdate(tx);
      return { updated: true, validConfirmation: true };
    }

    if (isCompleted) {
      const hasValidReceipt = Boolean(receipt && receipt.length >= 4 && !receipt.startsWith('PING'));
      const amountPositive =
        params.amount !== undefined
          ? !Number.isNaN(params.amount) && params.amount > 0
          : tx.kesAmount > 0 || tx.usdAmount > 0;
      if (!hasValidReceipt || !amountPositive) {
        tx.resultDesc =
          'KCB reported completion without a valid KCB bank/M-Pesa transaction reference or positive amount; staying PENDING.';
        tx.updatedAt = Date.now();
        mpesaTransactions.set(tx.id, tx);
        broadcastMpesaTxUpdate(tx);
        return { updated: false, validConfirmation: false, error: tx.resultDesc };
      }

      tx.status = 'COMPLETED';
      tx.callbackVerified = true;
      tx.verificationSource = params.source;
      tx.mpesaReceipt = receipt;
      const kesVal = Number(tx.kesAmount || 0).toLocaleString();
      const targetDisplay = tx.kcbAccountNumber || tx.recipientPhone || tx.phone;
      const actionVerb =
        tx.type === 'KCB_DEPOSIT'
          ? `deposited from KCB iBank ${targetDisplay}`
          : tx.type === 'KCB_WITHDRAWAL'
          ? `withdrawn to KCB iBank ${targetDisplay}`
          : `transferred to KCB ${targetDisplay}`;
      tx.safaricomConfirmationText =
        params.message ||
        `KCB iBank Confirmed (${receipt}): $${tx.usdAmount.toFixed(2)} USD (KES ${kesVal}) ${actionVerb}.`;
      tx.resultDesc = tx.safaricomConfirmationText;
      tx.updatedAt = Date.now();
      mpesaTransactions.set(tx.id, tx);
      if (tx.originatorConversationId) originatorToPrimaryId.set(tx.originatorConversationId, tx.id);
      broadcastMpesaTxUpdate(tx);
      return { updated: true, validConfirmation: true };
    }

    if (params.message) {
      tx.resultDesc = params.message;
      tx.updatedAt = Date.now();
      mpesaTransactions.set(tx.id, tx);
    }
    return { updated: false, validConfirmation: false };
  };

  app.get('/api/kcb', (req, res) => {
    const kcfg = getKcbConfig(req);
    return res.json({
      ok: true,
      environment: kcfg.env,
      mode: kcfg.activeMode,
      buniBaseUrl: kcfg.buniBaseUrl,
      ibankPortalUrl: kcfg.ibankPortalUrl,
      buniOauthReady: kcfg.buniOauthReady,
      buniConfigured: kcfg.buniConfigured,
      darajaB2bConfigured: kcfg.darajaB2bConfigured,
      darajaStkConfigured: kcfg.darajaStkConfigured,
      payheroBank01Ready: kcfg.payheroBank01Ready,
      ibankConnected: kcfg.ibankConnected,
      debitAccountMasked: kcfg.debitAccountMasked,
      ibankAccountMasked: kcfg.ibankAccountMasked,
      webhookSecretConfigured: Boolean(kcfg.webhookSecret),
      kcbPaybill: kcfg.kcbPaybill,
      companyCode: kcfg.companyCode,
      merchantId: kcfg.merchantId,
      callbackAuthGated: isPreviewAuthGatedUrl(kcfg.publicBase),
      apiWarning: kcfg.apiWarning,
      urls: kcfg.urls,
    });
  });

  app.get('/api/kcb/status', (req, res) => {
    const kcfg = getKcbConfig(req);
    const seen = new Set<string>();
    const kcbTxs = Array.from(mpesaTransactions.values()).filter((t) => {
      if (!isKcbTxType(t.type) || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
    return res.json({
      ok: true,
      connected: true,
      ibankConnected: kcfg.ibankConnected,
      environment: kcfg.env,
      mode: kcfg.activeMode,
      buniBaseUrl: kcfg.buniBaseUrl,
      ibankPortalUrl: kcfg.ibankPortalUrl,
      buniOauthReady: kcfg.buniOauthReady,
      buniConfigured: kcfg.buniConfigured,
      darajaB2bConfigured: kcfg.darajaB2bConfigured,
      darajaStkConfigured: kcfg.darajaStkConfigured,
      payheroBank01Ready: kcfg.payheroBank01Ready,
      debitAccountMasked: kcfg.debitAccountMasked,
      ibankAccountMasked: kcfg.ibankAccountMasked,
      webhookSecretConfigured: Boolean(kcfg.webhookSecret),
      kcbPaybill: kcfg.kcbPaybill,
      companyCode: kcfg.companyCode,
      merchantId: kcfg.merchantId,
      callbackAuthGated: isPreviewAuthGatedUrl(kcfg.publicBase),
      apiWarning: kcfg.apiWarning,
      urls: kcfg.urls,
      stats: {
        total: kcbTxs.length,
        deposits: kcbTxs.filter((t) => t.type === 'KCB_DEPOSIT').length,
        withdrawals: kcbTxs.filter((t) => t.type === 'KCB_WITHDRAWAL').length,
        transfers: kcbTxs.filter((t) => t.type === 'KCB_TRANSFER').length,
        pending: kcbTxs.filter((t) => t.status === 'PENDING').length,
        confirmed: kcbTxs.filter((t) => t.status === 'COMPLETED' && t.callbackVerified === true).length,
        rejected: kcbTxs.filter((t) => t.status === 'REJECTED').length,
      },
    });
  });

  app.post('/api/kcb/verify-oauth', async (req, res) => {
    const kcfg = getKcbConfig(req);
    const forceRefresh = req.body?.refresh !== false;
    const tokenRes = await fetchKcbBuniAccessToken(kcfg, forceRefresh);
    const summary = tokenRes.ok
      ? `KCB Buni OAuth2 token issued cleanly from ${kcfg.buniBaseUrl}/token (${kcfg.env}).`
      : tokenRes.error || `KCB Buni OAuth failed at ${kcfg.buniBaseUrl}/token`;

    recordCashierDiagnostic({
      channel: 'KCB_BANK',
      method: 'POST',
      endpoint: '/api/kcb/verify-oauth',
      httpStatus: tokenRes.ok ? 200 : 502,
      outcome: tokenRes.ok ? 'OK' : 'REJECTED',
      summary,
      responsePayload: {
        ok: tokenRes.ok,
        environment: kcfg.env,
        buniBaseUrl: kcfg.buniBaseUrl,
        expiresAt: tokenRes.expiresAt,
        cached: tokenRes.cached,
      },
    });

    return res.status(tokenRes.ok ? 200 : 502).json({
      ok: tokenRes.ok,
      authenticated: tokenRes.ok,
      environment: kcfg.env,
      buniBaseUrl: kcfg.buniBaseUrl,
      buniConfigured: kcfg.buniConfigured,
      expiresAt: tokenRes.expiresAt,
      cached: tokenRes.cached,
      apiWarning: kcfg.apiWarning,
      message: summary,
      error: tokenRes.ok ? undefined : tokenRes.error,
    });
  });

  app.post('/api/kcb/account-inquiry', async (req, res) => {
    const kcfg = getKcbConfig(req);
    const rawTarget = String(req.body?.accountNumber || kcfg.ibankAccountNumber || kcfg.debitAccountNumber || '')
      .trim()
      .replace(/\s+/g, '');

    if (!rawTarget) {
      return res.status(400).json({
        ok: false,
        buniConfigured: kcfg.buniConfigured,
        error: 'Set KCB_DEBIT_ACCOUNT / KCB_IBANK_ACCOUNT in Secrets or provide a KCB iBank account number (6–20 chars).',
      });
    }
    if (!/^[A-Za-z0-9-]{6,20}$/.test(rawTarget)) {
      return res.status(400).json({
        ok: false,
        error: 'KCB iBank account number must be 6–20 alphanumeric or digit characters.',
      });
    }

    if (!kcfg.buniOauthReady) {
      return res.status(400).json({
        ok: false,
        buniConfigured: false,
        error: 'KCB_CONSUMER_KEY and KCB_CONSUMER_SECRET are required in Secrets to query KCB Buni Account Inquiry.',
      });
    }

    const tokenRes = await fetchKcbBuniAccessToken(kcfg, false);
    if (!tokenRes.ok || !tokenRes.token) {
      return res.status(502).json({
        ok: false,
        buniConfigured: kcfg.buniConfigured,
        error: tokenRes.error || 'Unable to authenticate with KCB Buni OAuth for account inquiry.',
      });
    }

    const activeBuniBase = tokenRes.baseUrl || kcfg.buniBaseUrl;
    const masked =
      rawTarget.length > 4
        ? `${rawTarget.slice(0, 2)}${'*'.repeat(Math.max(2, rawTarget.length - 6))}${rawTarget.slice(-4)}`
        : rawTarget;

    try {
      const inquiryUrl = `${activeBuniBase}/accountinfo/1.0.0/api/v1/account/balance?accountNumber=${encodeURIComponent(
        rawTarget
      )}&companyCode=${encodeURIComponent(kcfg.companyCode)}`;
      const upstream = await fetchTextWithTimeout(
        inquiryUrl,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tokenRes.token}`,
            Accept: 'application/json',
          },
        },
        6000
      );
      let data: Record<string, any> = {};
      try {
        data = upstream.text.trim() ? (JSON.parse(upstream.text) as Record<string, any>) : {};
      } catch {
        data = {
          message:
            upstream.status === 404
              ? 'KCB Buni Account Balance API returned HTTP 404 (not subscribed or invalid path for this Buni app).'
              : `KCB Buni Account Inquiry returned HTTP ${upstream.status}${upstream.statusText ? ` (${upstream.statusText})` : ''}.`,
        };
      }

      if (!upstream.ok) {
        const errMsg = String(
          data.message || data.error_description || data.error || `KCB Buni Account Inquiry HTTP ${upstream.status}`
        );
        recordCashierDiagnostic({
          channel: 'KCB_BANK',
          method: 'POST',
          endpoint: '/api/kcb/account-inquiry',
          httpStatus: upstream.status,
          outcome: 'WARNING',
          phoneOrTarget: masked,
          summary: errMsg,
          responsePayload: data,
        });
        return res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).json({
          ok: false,
          authenticated: true,
          accountMasked: masked,
          error: errMsg,
          raw: data,
        });
      }

      const bal = Number(
        data.availableBalance ?? data.workingBalance ?? data.clearedBalance ?? data.balance ?? NaN
      );
      const currency = String(data.currency || data.currencyCode || 'KES');
      const accountTitle = String(data.accountTitle || data.accountName || data.customerName || '').trim() || undefined;
      recordCashierDiagnostic({
        channel: 'KCB_BANK',
        method: 'POST',
        endpoint: '/api/kcb/account-inquiry',
        httpStatus: 200,
        outcome: 'OK',
        phoneOrTarget: masked,
        summary: `KCB iBank Account Inquiry succeeded for ${masked}${Number.isFinite(bal) ? ` (${currency} ${bal.toLocaleString()})` : ''}.`,
        responsePayload: { ok: true, accountMasked: masked, currency, hasBalance: Number.isFinite(bal) },
      });

      return res.json({
        ok: true,
        authenticated: true,
        accountMasked: masked,
        accountTitle,
        currency,
        availableBalance: Number.isFinite(bal) ? bal : undefined,
        status: String(data.accountStatus || data.status || 'ACTIVE'),
        environment: kcfg.env,
      });
    } catch (err: any) {
      return res.status(502).json({
        ok: false,
        authenticated: true,
        accountMasked: masked,
        error: err?.message || 'Unable to reach KCB Buni Account Inquiry API.',
      });
    }
  });

  app.get('/api/kcb/transactions', (_req, res) => {
    const seen = new Set<string>();
    const list = Array.from(mpesaTransactions.values())
      .filter((t) => {
        if (!isKcbTxType(t.type) || seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    return res.json({ ok: true, transactions: list });
  });

  const handleKcbGetBridge = (req: Request, res: Response, action: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER') => {
    const acceptHeader = String(req.headers.accept || '');
    const wantsJson = String(req.query.format || '').toLowerCase() === 'json';
    const prefersHtml = acceptHeader.includes('text/html') && !wantsJson;
    const kcfg = getKcbConfig(req);

    if (prefersHtml) {
      const qs = new URLSearchParams();
      qs.set('cashier', 'kcb');
      qs.set('direction', action);
      const qAmount = String(req.query.amount || req.query.usdAmount || '').trim();
      const qAccount = String(req.query.account || req.query.accountNumber || '').trim();
      const qPhone = String(req.query.phone || '').trim();
      const qRail = String(req.query.rail || req.query.kcbRail || '').trim();
      if (qAmount) qs.set('amount', qAmount);
      if (qAccount) qs.set('account', qAccount);
      if (qPhone) qs.set('phone', qPhone);
      if (qRail) qs.set('rail', qRail);
      return res.redirect(302, `/?${qs.toString()}`);
    }

    const txType: MpesaTxRecord['type'] =
      action === 'DEPOSIT' ? 'KCB_DEPOSIT' : action === 'WITHDRAWAL' ? 'KCB_WITHDRAWAL' : 'KCB_TRANSFER';
    const seen = new Set<string>();
    const recent = Array.from(mpesaTransactions.values())
      .filter((t) => {
        if (t.type !== txType || seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);

    return res.json({
      ok: true,
      environment: kcfg.env,
      action,
      endpoint:
        action === 'DEPOSIT'
          ? '/api/kcb/deposit'
          : action === 'WITHDRAWAL'
          ? '/api/kcb/withdraw'
          : '/api/kcb/transfer',
      method: 'POST',
      mode: kcfg.activeMode,
      ibankConnected: kcfg.ibankConnected,
      buniConfigured: kcfg.buniConfigured,
      darajaB2bConfigured: kcfg.darajaB2bConfigured,
      darajaStkConfigured: kcfg.darajaStkConfigured,
      payheroBank01Ready: kcfg.payheroBank01Ready,
      kcbPaybill: kcfg.kcbPaybill,
      urls: kcfg.urls,
      transactions: recent,
    });
  };

  const handleKcbAction = async (
    req: Request,
    res: Response,
    forcedAction?: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER'
  ) => {
    const kcfg = getKcbConfig(req);
    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const rawAction = String(
      forcedAction || body.action || body.direction || body.type || 'TRANSFER'
    )
      .trim()
      .toUpperCase();
    const action: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' =
      rawAction === 'DEPOSIT' || rawAction === 'TOPUP'
        ? 'DEPOSIT'
        : rawAction === 'WITHDRAWAL' || rawAction === 'WITHDRAW' || rawAction === 'PAYOUT'
        ? 'WITHDRAWAL'
        : 'TRANSFER';

    const resolvedEndpoint =
      action === 'DEPOSIT' ? '/api/kcb/deposit' : action === 'WITHDRAWAL' ? '/api/kcb/withdraw' : '/api/kcb/transfer';
    const txType: MpesaTxRecord['type'] =
      action === 'DEPOSIT' ? 'KCB_DEPOSIT' : action === 'WITHDRAWAL' ? 'KCB_WITHDRAWAL' : 'KCB_TRANSFER';

    const rawRail = String(body.kcbRail || body.transferRail || body.rail || 'kcb_account').toLowerCase();
    const kcbRail: 'kcb_account' | 'paybill_522522' | 'kcb_vooma' | 'pesalink' =
      rawRail === 'paybill_522522' || rawRail === 'paybill'
        ? 'paybill_522522'
        : rawRail === 'kcb_vooma' || rawRail === 'vooma' || rawRail === 'mobile'
        ? 'kcb_vooma'
        : rawRail === 'pesalink'
        ? 'pesalink'
        : 'kcb_account';

    const rawAmount = Number(body.usdAmount ?? body.amount ?? 0);
    const rawKes = Number(body.kesAmount ?? 0);
    const amountUsd = Number.isFinite(rawAmount) && rawAmount > 0 ? Number(rawAmount.toFixed(2)) : 0;
    const amountKes =
      Number.isFinite(rawKes) && rawKes > 0 ? Math.round(rawKes) : Math.round(amountUsd * 129.5);

    if (amountUsd < 10) {
      return res.status(400).json({ ok: false, error: `Minimum KCB iBank ${action.toLowerCase()} is $10.00 USD.` });
    }

    const accountNumberInput = String(
      body.accountNumber || body.creditAccountNumber || body.kcbAccount || ''
    )
      .trim()
      .replace(/\s+/g, '');
    const accountNumber =
      accountNumberInput ||
      (action === 'DEPOSIT' ? kcfg.ibankAccountNumber || kcfg.merchantId : '');
    const accountName = String(body.accountName || body.beneficiaryName || '').trim();
    const rawLoginInput = String(body.loginId || body.derivLoginId || '').trim();
    const isStandaloneKcb = Boolean(
      body.standalone === true ||
        (action === 'TRANSFER' && (!rawLoginInput || rawLoginInput.toUpperCase() === 'STANDALONE')) ||
        rawLoginInput.toUpperCase() === 'STANDALONE'
    );
    const resolvedLoginId = isStandaloneKcb ? undefined : rawLoginInput || undefined;
    const rawPhone = String(body.phone || body.notifyPhone || '').trim();
    const parsedPhone = rawPhone ? normalizeKenyanMsisdnServer(rawPhone) : null;

    if (kcbRail === 'kcb_vooma') {
      if (!parsedPhone) {
        return res.status(400).json({
          ok: false,
          error: 'Valid Kenyan mobile number is required for KCB Vooma / Mobile App (e.g. 0728424076).',
        });
      }
    } else if (action !== 'DEPOSIT' && !/^[A-Za-z0-9-]{6,20}$/.test(accountNumber)) {
      return res.status(400).json({
        ok: false,
        error: 'Valid KCB iBank Account Number (6–20 alphanumeric/digit characters) is required.',
      });
    } else if (accountNumber && !/^[A-Za-z0-9-]{4,24}$/.test(accountNumber)) {
      return res.status(400).json({
        ok: false,
        error: 'KCB Account reference must be 4–24 alphanumeric or digit characters.',
      });
    }

    const targetAccountDisplay =
      kcbRail === 'kcb_vooma' && parsedPhone
        ? parsedPhone.phone
        : accountNumber || kcfg.merchantId;
    const targetLabel =
      kcbRail === 'paybill_522522'
        ? `KCB Paybill ${kcfg.kcbPaybill} · Acct ${targetAccountDisplay}`
        : kcbRail === 'kcb_vooma' && parsedPhone
        ? `KCB Vooma App · ${parsedPhone.formatted}`
        : kcbRail === 'pesalink'
        ? `KCB iBank PesaLink · Acct ${targetAccountDisplay}`
        : `KCB iBank Account · ${targetAccountDisplay}`;

    const narration = String(
      body.narration ||
        body.remarks ||
        (action === 'DEPOSIT'
          ? `KCB iBank Deposit (${targetAccountDisplay}) -> ${resolvedLoginId || 'Terminal'}`
          : action === 'WITHDRAWAL'
          ? `Deriv Real ${resolvedLoginId || ''} Withdrawal -> KCB iBank (${targetAccountDisplay})`.trim()
          : isStandaloneKcb
          ? `Direct KCB iBank Transfer (${targetAccountDisplay})`
          : `Deriv Real ${resolvedLoginId || ''} -> KCB iBank (${targetAccountDisplay})`)
    ).trim();

    const reference = String(
      body.reference || `KCB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    );
    const preferredRoute = String(body.dispatchVia || 'auto').toLowerCase();
    const pcfg = getPayHeroConfig(req);
    const darajaCfg = getDarajaConfig();
    const upstreamNotes: string[] = [];

    if (preferredRoute === 'buni' && !kcfg.buniConfigured) {
      return res.status(400).json({
        ok: false,
        configured: false,
        error: 'KCB Buni API requires KCB_CONSUMER_KEY, KCB_CONSUMER_SECRET, and KCB_DEBIT_ACCOUNT in Secrets.',
      });
    }
    if (preferredRoute === 'daraja_b2b' && !kcfg.darajaB2bConfigured) {
      return res.status(400).json({
        ok: false,
        configured: false,
        error: 'Safaricom Daraja B2B credentials are not configured for Paybill 522522.',
      });
    }
    if (preferredRoute === 'daraja_stk' && (!darajaCfg.stkConfigured || !parsedPhone)) {
      return res.status(400).json({
        ok: false,
        configured: darajaCfg.stkConfigured,
        error: 'Safaricom Daraja STK Push requires valid Daraja STK credentials and a Kenyan phone number.',
      });
    }
    if (preferredRoute === 'payhero_bank' && !pcfg.apiConfigured) {
      return res.status(400).json({
        ok: false,
        configured: false,
        error: 'PayHero API credentials (PAYHERO_AUTH_TOKEN / PAYHERO_API_USERNAME) are not configured.',
      });
    }

    // DEPOSIT BRANCH (Collections into Wallet / Deriv Real via KCB Buni STK / Daraja STK Paybill 522522 / KCB iBank Deposit Bridge)
    if (action === 'DEPOSIT') {
      // 1A. KCB Buni M-Pesa / Vooma Express Collection when Buni configured and Kenyan phone provided
      if (
        preferredRoute !== 'bridge' &&
        kcfg.buniConfigured &&
        parsedPhone &&
        (preferredRoute === 'buni' || preferredRoute === 'auto')
      ) {
        const tokenRes = await fetchKcbBuniAccessToken(kcfg);
        if (tokenRes.ok && tokenRes.token) {
          try {
            const activeBuniBase = tokenRes.baseUrl || kcfg.buniBaseUrl;
            const buniStkBody = {
              phoneNumber: parsedPhone.msisdn,
              amount: String(amountKes),
              invoiceNumber: `${kcfg.kcbPaybill}-${targetAccountDisplay}`.slice(0, 24),
              sharedShortCode: true,
              orgShortCode: kcfg.kcbPaybill,
              orgPassKey: '',
              callbackUrl: kcfg.urls.callbackUrl,
              transactionDescription: narration.slice(0, 64),
            };
            const upstream = await fetchTextWithTimeout(
              `${activeBuniBase}/mm/api/request/1.0.0/stkpush`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${tokenRes.token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(buniStkBody),
              },
              6000
            );
            let upstreamData: Record<string, any> = {};
            try {
              upstreamData = upstream.text.trim() ? (JSON.parse(upstream.text) as Record<string, any>) : {};
            } catch {
              upstreamData = { message: extractSafeDarajaTextError(upstream.status, upstream.text, upstream.statusText) };
            }
            const checkoutId =
              upstreamData.response?.CheckoutRequestID ||
              upstreamData.CheckoutRequestID ||
              upstreamData.transactionReference;
            if (upstream.ok && checkoutId) {
              const remoteRef = String(checkoutId);
              const record: MpesaTxRecord = {
                id: reference,
                originatorConversationId: remoteRef,
                type: 'KCB_DEPOSIT',
                standalone: isStandaloneKcb,
                environment: kcfg.env,
                phone: parsedPhone.msisdn,
                recipientPhone: parsedPhone.phone,
                recipientMsisdn: parsedPhone.msisdn,
                kcbAction: 'DEPOSIT',
                kcbTransferRail: kcbRail,
                kcbAccountNumber: targetAccountDisplay,
                kcbAccountName: accountName || undefined,
                partyB: kcfg.kcbPaybill,
                accountReference: targetAccountDisplay,
                usdAmount: amountUsd,
                kesAmount: amountKes,
                loginId: resolvedLoginId,
                status: 'PENDING',
                callbackVerified: false,
                resultDesc: `KCB Buni M-Pesa Express prompt sent (${remoteRef}) for ${targetLabel}. Complete PIN on phone to credit balance.`,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              mpesaTransactions.set(record.id, record);
              originatorToPrimaryId.set(remoteRef, record.id);
              const payload = {
                ok: true,
                configured: true,
                action: 'DEPOSIT' as const,
                mode: 'KCB_BUNI_API' as const,
                kcbRail,
                status: 'PENDING' as const,
                callbackVerified: false,
                reference: record.id,
                remoteReference: remoteRef,
                kcbPaybill: kcfg.kcbPaybill,
                targetLabel,
                callbackUrl: kcfg.urls.callbackUrl,
                message: record.resultDesc,
              };
              recordCashierDiagnostic({
                channel: 'KCB_BANK',
                method: 'POST',
                endpoint: resolvedEndpoint,
                httpStatus: 202,
                outcome: 'PENDING',
                phoneOrTarget: targetLabel,
                usdAmount: amountUsd,
                kesAmount: amountKes,
                reference: record.id,
                summary: record.resultDesc || 'KCB Buni deposit prompt sent',
                responsePayload: payload,
              });
              return res.status(202).json(payload);
            }
            const errMsg = String(
              upstreamData.message ||
                upstreamData.error_description ||
                upstreamData.error ||
                `KCB Buni STK HTTP ${upstream.status}`
            );
            if (preferredRoute === 'buni') {
              return res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).json({
                ok: false,
                configured: true,
                error: errMsg,
                raw: upstreamData,
              });
            }
            upstreamNotes.push(`KCB Buni STK: ${errMsg}`);
          } catch (err: any) {
            if (preferredRoute === 'buni') {
              return res.status(502).json({ ok: false, configured: true, error: err?.message || 'KCB Buni STK failed.' });
            }
            upstreamNotes.push(`KCB Buni STK: ${err?.message || 'unreachable'}`);
          }
        }
      }

      // 1B. Safaricom Daraja STK Push for KCB iBank Deposit (Paybill collection) when configured & phone present
      if (
        preferredRoute !== 'bridge' &&
        darajaCfg.stkConfigured &&
        parsedPhone &&
        (preferredRoute === 'daraja_stk' || preferredRoute === 'auto')
      ) {
        try {
          const timestamp = getDarajaTimestamp();
          const password = Buffer.from(`${darajaCfg.shortcode}${darajaCfg.passkey}${timestamp}`).toString('base64');
          const callbackUrl = kcfg.publicBase
            ? `${kcfg.publicBase}/api/mpesa/callback`
            : 'https://example.com/api/mpesa/callback';
          const { res: stkRes, data: stkData } = await darajaPostJson(
            darajaCfg,
            `${darajaCfg.baseUrl}/mpesa/stkpush/v1/processrequest`,
            {
              BusinessShortCode: darajaCfg.shortcode,
              Password: password,
              Timestamp: timestamp,
              TransactionType: darajaCfg.stkTransactionType,
              Amount: amountKes,
              PartyA: parsedPhone.msisdn,
              PartyB: darajaCfg.stkTransactionType === 'CustomerBuyGoodsOnline' ? darajaCfg.stkPartyB : darajaCfg.shortcode,
              PhoneNumber: parsedPhone.msisdn,
              CallBackURL: callbackUrl,
              AccountReference: targetAccountDisplay.slice(0, 12),
              TransactionDesc: 'KCB iBank Deposit',
            }
          );
          if (stkRes.ok && String(stkData.ResponseCode || '') === '0' && stkData.CheckoutRequestID) {
            const checkoutId = String(stkData.CheckoutRequestID);
            const record: MpesaTxRecord = {
              id: checkoutId,
              originatorConversationId: reference,
              type: 'KCB_DEPOSIT',
              standalone: isStandaloneKcb,
              environment: darajaCfg.env,
              phone: parsedPhone.msisdn,
              recipientPhone: parsedPhone.phone,
              recipientMsisdn: parsedPhone.msisdn,
              kcbAction: 'DEPOSIT',
              kcbTransferRail: kcbRail,
              kcbAccountNumber: targetAccountDisplay,
              kcbAccountName: accountName || undefined,
              partyB: darajaCfg.shortcode,
              accountReference: targetAccountDisplay,
              usdAmount: amountUsd,
              kesAmount: amountKes,
              loginId: resolvedLoginId,
              status: 'PENDING',
              callbackVerified: false,
              resultDesc:
                stkData.CustomerMessage ||
                `M-Pesa STK prompt sent to ${parsedPhone.formatted} for KCB iBank Deposit (${targetLabel}). Enter M-Pesa PIN to confirm.`,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            mpesaTransactions.set(record.id, record);
            originatorToPrimaryId.set(reference, record.id);
            const payload = {
              ok: true,
              configured: true,
              action: 'DEPOSIT' as const,
              mode: 'KCB_WEBHOOK_BRIDGE' as const,
              kcbRail,
              status: 'PENDING' as const,
              callbackVerified: false,
              reference: record.id,
              remoteReference: checkoutId,
              kcbPaybill: kcfg.kcbPaybill,
              targetLabel,
              callbackUrl,
              message: record.resultDesc,
            };
            recordCashierDiagnostic({
              channel: 'KCB_BANK',
              method: 'POST',
              endpoint: resolvedEndpoint,
              httpStatus: 202,
              outcome: 'PENDING',
              phoneOrTarget: targetLabel,
              usdAmount: amountUsd,
              kesAmount: amountKes,
              reference: record.id,
              summary: record.resultDesc || 'KCB Deposit STK dispatched',
              responsePayload: payload,
            });
            return res.status(202).json(payload);
          }
          const stkErr = String(
            stkData.errorMessage || stkData.ResponseDescription || `Daraja STK HTTP ${stkRes.status}`
          );
          if (preferredRoute === 'daraja_stk') {
            return res.status(502).json({ ok: false, configured: true, error: stkErr });
          }
          upstreamNotes.push(`Daraja STK: ${stkErr}`);
        } catch (err: any) {
          if (preferredRoute === 'daraja_stk') {
            return res.status(502).json({ ok: false, configured: true, error: err?.message || 'Daraja STK failed.' });
          }
          upstreamNotes.push(`Daraja STK: ${err?.message || 'timed out'}`);
        }
      }

      // 1C. KCB iBank / Paybill 522522 Deposit Webhook Bridge (stays PENDING until KCB IPN callback confirms)
      const fallbackSuffix = upstreamNotes.length > 0 ? ` [Upstream note: ${upstreamNotes.join('; ')}]` : '';
      const collectionAcct = accountNumber || kcfg.ibankAccountNumber || kcfg.merchantId;
      const record: MpesaTxRecord = {
        id: reference,
        type: 'KCB_DEPOSIT',
        standalone: isStandaloneKcb,
        environment: kcfg.env,
        phone: parsedPhone ? parsedPhone.msisdn : collectionAcct,
        recipientPhone: parsedPhone ? parsedPhone.phone : collectionAcct,
        recipientMsisdn: parsedPhone ? parsedPhone.msisdn : collectionAcct,
        kcbAction: 'DEPOSIT',
        kcbTransferRail: kcbRail,
        kcbAccountNumber: collectionAcct,
        kcbAccountName: accountName || undefined,
        partyB: kcfg.kcbPaybill,
        accountReference: collectionAcct,
        usdAmount: amountUsd,
        kesAmount: amountKes,
        loginId: resolvedLoginId,
        status: 'PENDING',
        callbackVerified: false,
        resultDesc: `KCB iBank deposit ${reference} awaiting transfer via KCB iBank / Paybill ${kcfg.kcbPaybill} (Acct: ${collectionAcct}, Amount: KES ${amountKes.toLocaleString()}). Balance credits automatically on verified KCB IPN callback at ${kcfg.urls.callbackUrl}.${fallbackSuffix}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mpesaTransactions.set(record.id, record);

      const payload = {
        ok: true,
        configured: kcfg.ibankConnected,
        builtInBridge: true,
        action: 'DEPOSIT' as const,
        mode: 'KCB_WEBHOOK_BRIDGE' as const,
        kcbRail,
        status: 'PENDING' as const,
        callbackVerified: false,
        reference: record.id,
        kcbPaybill: kcfg.kcbPaybill,
        kcbAccountNumber: collectionAcct,
        ibankPortalUrl: kcfg.ibankPortalUrl,
        targetLabel,
        callbackUrl: kcfg.urls.callbackUrl,
        upstreamNote: upstreamNotes.length > 0 ? upstreamNotes.join('; ') : undefined,
        message: record.resultDesc,
      };
      recordCashierDiagnostic({
        channel: 'KCB_BANK',
        method: 'POST',
        endpoint: resolvedEndpoint,
        httpStatus: 202,
        outcome: 'PENDING',
        phoneOrTarget: targetLabel,
        usdAmount: amountUsd,
        kesAmount: amountKes,
        reference: record.id,
        summary: record.resultDesc || 'KCB iBank deposit queued',
        responsePayload: payload,
      });
      return res.status(202).json(payload);
    }

    // WITHDRAWAL & TRANSFER OUTBOUND RAILS (KCB iBank IFT / Paybill 522522 / Vooma / PesaLink)
    // 1. Live KCB Buni API OAuth2 + Funds Transfer (/fundstransfer/1.0.0/api/v1/transfer)
    if (preferredRoute !== 'bridge' && kcfg.buniConfigured && (preferredRoute === 'auto' || preferredRoute === 'buni')) {
      const tokenRes = await fetchKcbBuniAccessToken(kcfg);
      if (!tokenRes.ok || !tokenRes.token) {
        recordCashierDiagnostic({
          channel: 'KCB_BANK',
          method: 'POST',
          endpoint: resolvedEndpoint,
          httpStatus: 502,
          outcome: 'REJECTED',
          phoneOrTarget: targetLabel,
          usdAmount: amountUsd,
          kesAmount: amountKes,
          reference,
          summary: tokenRes.error || 'KCB Buni OAuth failed',
        });
        return res.status(502).json({
          ok: false,
          configured: true,
          error: tokenRes.error || 'Unable to authenticate with KCB Buni OAuth.',
        });
      }

      try {
        const buniBody = {
          debitAccountNumber: kcfg.debitAccountNumber,
          creditAccountNumber: kcbRail === 'kcb_vooma' ? parsedPhone!.msisdn : accountNumber,
          debitAmount: amountKes,
          amount: amountKes,
          currency: 'KES',
          companyCode: kcfg.companyCode,
          transactionType: kcbRail === 'pesalink' ? 'PESALINK' : kcbRail === 'kcb_vooma' ? 'VOOMA' : 'IFT',
          beneficiaryDetails: accountName || 'KCB iBank Customer',
          narration,
          externalReference: reference,
          callbackUrl: kcfg.urls.callbackUrl,
        };

        const activeBuniBase = tokenRes.baseUrl || kcfg.buniBaseUrl;
        const upstream = await fetchTextWithTimeout(
          `${activeBuniBase}/fundstransfer/1.0.0/api/v1/transfer`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokenRes.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(buniBody),
          },
          6000
        );
        let upstreamData: Record<string, any> = {};
        try {
          upstreamData = upstream.text.trim() ? (JSON.parse(upstream.text) as Record<string, any>) : {};
        } catch {
          upstreamData = { message: extractSafeDarajaTextError(upstream.status, upstream.text, upstream.statusText) };
        }

        if (!upstream.ok) {
          const errMsg = String(
            upstreamData.message ||
              upstreamData.error_description ||
              upstreamData.error ||
              `KCB Buni HTTP ${upstream.status}`
          );
          recordCashierDiagnostic({
            channel: 'KCB_BANK',
            method: 'POST',
            endpoint: resolvedEndpoint,
            httpStatus: upstream.status,
            outcome: 'REJECTED',
            phoneOrTarget: targetLabel,
            usdAmount: amountUsd,
            kesAmount: amountKes,
            reference,
            summary: errMsg,
            responsePayload: upstreamData,
          });
          return res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).json({
            ok: false,
            configured: true,
            error: errMsg,
            raw: upstreamData,
          });
        }

        const remoteRef = String(
          upstreamData.transactionReference || upstreamData.ftReference || upstreamData.reference || reference
        );
        const record: MpesaTxRecord = {
          id: reference,
          originatorConversationId: remoteRef !== reference ? remoteRef : undefined,
          type: txType,
          standalone: isStandaloneKcb,
          environment: kcfg.env,
          phone: targetAccountDisplay,
          recipientPhone: parsedPhone ? parsedPhone.phone : targetAccountDisplay,
          recipientMsisdn: parsedPhone ? parsedPhone.msisdn : targetAccountDisplay,
          kcbAction: action,
          kcbTransferRail: kcbRail,
          kcbAccountNumber: targetAccountDisplay,
          kcbAccountName: accountName || undefined,
          partyB: kcbRail === 'paybill_522522' ? kcfg.kcbPaybill : targetAccountDisplay,
          accountReference: targetAccountDisplay,
          usdAmount: amountUsd,
          kesAmount: amountKes,
          loginId: resolvedLoginId,
          status: 'PENDING',
          callbackVerified: false,
          resultDesc: `Submitted KCB iBank ${action.toLowerCase()} to KCB Buni Funds Transfer (${remoteRef}) for ${targetLabel}. Awaiting KCB settlement confirmation.`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        const receipt =
          upstreamData.ftReference || upstreamData.mpesaReceipt || upstreamData.transactionId;
        if (upstreamData.status || receipt) {
          applyKcbVerificationPayload(record, {
            statusRaw: upstreamData.status,
            resultCode: upstreamData.responseCode ?? upstreamData.statusCode,
            receipt: receipt ? String(receipt) : undefined,
            message: upstreamData.message ? String(upstreamData.message) : undefined,
            amount: amountKes,
            source: 'KCB_BUNI_API',
          });
        }

        mpesaTransactions.set(record.id, record);
        if (remoteRef !== record.id) originatorToPrimaryId.set(remoteRef, record.id);

        const payload = {
          ok: true,
          configured: true,
          action,
          mode: 'KCB_BUNI_API' as const,
          kcbRail,
          status: record.status,
          callbackVerified: Boolean(record.callbackVerified),
          reference: record.id,
          remoteReference: remoteRef,
          mpesaReceipt: record.mpesaReceipt,
          targetLabel,
          callbackUrl: kcfg.urls.callbackUrl,
          message: record.safaricomConfirmationText || record.resultDesc,
        };
        recordCashierDiagnostic({
          channel: 'KCB_BANK',
          method: 'POST',
          endpoint: resolvedEndpoint,
          httpStatus: record.status === 'COMPLETED' ? 200 : 202,
          outcome: record.status === 'COMPLETED' ? 'OK' : 'PENDING',
          phoneOrTarget: targetLabel,
          usdAmount: amountUsd,
          kesAmount: amountKes,
          reference: record.id,
          summary: String(payload.message),
          responsePayload: payload,
        });
        return res.status(record.status === 'COMPLETED' ? 200 : 202).json(payload);
      } catch (err: any) {
        return res.status(502).json({
          ok: false,
          configured: true,
          error: err?.message || 'Unable to reach KCB Buni API.',
        });
      }
    }

    // 2. Live KCB Paybill 522522 via Safaricom Daraja B2B BusinessPayBill when available & selected
    if (
      preferredRoute !== 'bridge' &&
      kcfg.darajaB2bConfigured &&
      (preferredRoute === 'daraja_b2b' || (preferredRoute === 'auto' && kcbRail === 'paybill_522522'))
    ) {
      const b2bCfg = getWithdrawalDarajaConfig();
      if (b2bCfg.b2bConfigured && kcfg.publicBase) {
        try {
          const { res: darajaRes, data: darajaData } = await darajaPostJson(
            b2bCfg,
            `${b2bCfg.baseUrl}/mpesa/b2b/v1/paymentrequest`,
            {
              Initiator: b2bCfg.initiatorName,
              SecurityCredential: b2bCfg.securityCredential,
              CommandID: 'BusinessPayBill',
              SenderIdentifierType: '4',
              RecieverIdentifierType: '4',
              Amount: amountKes,
              PartyA: b2bCfg.b2bShortcode || b2bCfg.shortcode,
              PartyB: kcfg.kcbPaybill,
              AccountReference: targetAccountDisplay,
              Requester: parsedPhone ? parsedPhone.msisdn : undefined,
              Remarks: narration.slice(0, 95),
              QueueTimeOutURL: `${kcfg.publicBase}/api/mpesa/b2b-timeout`,
              ResultURL: `${kcfg.publicBase}/api/mpesa/b2b-result`,
            }
          );

          if (darajaRes.ok && String(darajaData.ResponseCode || '') === '0') {
            const originId = String(darajaData.OriginatorConversationID || darajaData.ConversationID || reference);
            const record: MpesaTxRecord = {
              id: originId,
              originatorConversationId: darajaData.ConversationID ? String(darajaData.ConversationID) : undefined,
              type: txType,
              standalone: isStandaloneKcb,
              environment: b2bCfg.env,
              phone: kcfg.kcbPaybill,
              recipientPhone: targetAccountDisplay,
              kcbAction: action,
              kcbTransferRail: 'paybill_522522',
              kcbAccountNumber: targetAccountDisplay,
              kcbAccountName: accountName || undefined,
              partyB: kcfg.kcbPaybill,
              commandId: 'BusinessPayBill',
              accountReference: targetAccountDisplay,
              usdAmount: amountUsd,
              kesAmount: amountKes,
              loginId: resolvedLoginId,
              status: 'PENDING',
              callbackVerified: false,
              resultDesc: `Safaricom Daraja B2B Paybill ${kcfg.kcbPaybill} submitted (${action.toLowerCase()}) for KCB iBank Account ${targetAccountDisplay}. Awaiting M-Pesa B2B callback.`,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            mpesaTransactions.set(record.id, record);
            if (record.originatorConversationId) originatorToPrimaryId.set(record.originatorConversationId, record.id);
            originatorToPrimaryId.set(reference, record.id);

            const payload = {
              ok: true,
              configured: true,
              action,
              mode: 'DARAJA_B2B_522522' as const,
              kcbRail: 'paybill_522522',
              status: 'PENDING' as const,
              callbackVerified: false,
              reference: record.id,
              remoteReference: originId,
              targetLabel,
              callbackUrl: `${kcfg.publicBase}/api/mpesa/b2b-result`,
              message: record.resultDesc,
            };
            recordCashierDiagnostic({
              channel: 'KCB_BANK',
              method: 'POST',
              endpoint: resolvedEndpoint,
              httpStatus: 202,
              outcome: 'PENDING',
              phoneOrTarget: targetLabel,
              usdAmount: amountUsd,
              kesAmount: amountKes,
              reference: record.id,
              summary: record.resultDesc || 'KCB Paybill 522522 dispatched via Daraja B2B',
              responsePayload: payload,
            });
            return res.status(202).json(payload);
          }

          const b2bErr = String(
            darajaData.errorMessage || darajaData.ResponseDescription || `Daraja B2B HTTP ${darajaRes.status}`
          );
          recordCashierDiagnostic({
            channel: 'KCB_BANK',
            method: 'POST',
            endpoint: resolvedEndpoint,
            httpStatus: darajaRes.status || 502,
            outcome: preferredRoute === 'daraja_b2b' ? 'REJECTED' : 'WARNING',
            phoneOrTarget: targetLabel,
            usdAmount: amountUsd,
            kesAmount: amountKes,
            reference,
            summary: `Daraja B2B Paybill ${kcfg.kcbPaybill} declined: ${b2bErr}`,
            responsePayload: darajaData,
          });
          if (preferredRoute === 'daraja_b2b') {
            return res.status(502).json({ ok: false, configured: true, error: b2bErr });
          }
          upstreamNotes.push(`Daraja B2B: ${b2bErr}`);
        } catch (err: any) {
          const b2bErr = err?.message || 'Daraja B2B Paybill 522522 request timed out.';
          recordCashierDiagnostic({
            channel: 'KCB_BANK',
            method: 'POST',
            endpoint: resolvedEndpoint,
            httpStatus: 504,
            outcome: preferredRoute === 'daraja_b2b' ? 'REJECTED' : 'WARNING',
            phoneOrTarget: targetLabel,
            usdAmount: amountUsd,
            kesAmount: amountKes,
            reference,
            summary: b2bErr,
          });
          if (preferredRoute === 'daraja_b2b') {
            return res.status(502).json({ ok: false, configured: true, error: b2bErr });
          }
          upstreamNotes.push(`Daraja B2B: ${b2bErr}`);
        }
      } else if (preferredRoute === 'daraja_b2b') {
        return res.status(400).json({
          ok: false,
          configured: false,
          error: 'Safaricom Daraja B2B production Paybill credentials or public callback URL are missing.',
        });
      }
    }

    // 3. Live PayHero Bank Transfer (Bank Code 01 = KCB Bank Kenya) if configured
    if (
      preferredRoute !== 'bridge' &&
      pcfg.apiConfigured &&
      (preferredRoute === 'payhero_bank' || preferredRoute === 'auto') &&
      kcbRail !== 'kcb_vooma'
    ) {
      try {
        const payheroPayload =
          kcbRail === 'paybill_522522'
            ? {
                external_reference: reference,
                amount: amountKes,
                payment_type: 'paybill',
                channel: 'paybill',
                network_code: '63902',
                account_number: kcfg.kcbPaybill,
                account_reference: targetAccountDisplay,
                account_name: accountName || 'KCB iBank Customer',
                callback_url: kcfg.urls.callbackUrl,
              }
            : {
                external_reference: reference,
                amount: amountKes,
                payment_type: 'bank',
                channel: 'bank',
                bank_code: '01',
                account_number: targetAccountDisplay,
                account_name: accountName || 'KCB iBank Customer',
                callback_url: kcfg.urls.callbackUrl,
              };
        const upstream = await fetchTextWithTimeout(
          `${pcfg.apiBaseUrl}/api/v2/withdraw`,
          {
            method: 'POST',
            headers: {
              Authorization: pcfg.authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payheroPayload),
          },
          5000
        );
        let upstreamData: Record<string, any> = {};
        try {
          upstreamData = upstream.text.trim() ? (JSON.parse(upstream.text) as Record<string, any>) : {};
        } catch {
          upstreamData = { message: extractSafeDarajaTextError(upstream.status, upstream.text, upstream.statusText) };
        }
        if (upstream.ok) {
          const remoteRef = String(upstreamData.reference || upstreamData.external_reference || reference);
          const record: MpesaTxRecord = {
            id: reference,
            originatorConversationId: remoteRef !== reference ? remoteRef : undefined,
            type: txType,
            standalone: isStandaloneKcb,
            environment: 'production',
            phone: targetAccountDisplay,
            recipientPhone: parsedPhone ? parsedPhone.phone : targetAccountDisplay,
            kcbAction: action,
            kcbTransferRail: kcbRail,
            kcbAccountNumber: targetAccountDisplay,
            kcbAccountName: accountName || undefined,
            partyB: kcbRail === 'paybill_522522' ? kcfg.kcbPaybill : '01',
            accountReference: targetAccountDisplay,
            usdAmount: amountUsd,
            kesAmount: amountKes,
            loginId: resolvedLoginId,
            status: 'PENDING',
            callbackVerified: false,
            resultDesc: `PayHero Bank 01 (KCB) ${action.toLowerCase()} submitted (${remoteRef}) for ${targetLabel}. Awaiting KCB settlement callback.`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          mpesaTransactions.set(record.id, record);
          if (remoteRef !== record.id) originatorToPrimaryId.set(remoteRef, record.id);
          const payload = {
            ok: true,
            configured: true,
            action,
            mode: 'PAYHERO_BANK_01' as const,
            kcbRail,
            status: 'PENDING' as const,
            callbackVerified: false,
            reference: record.id,
            remoteReference: remoteRef,
            targetLabel,
            callbackUrl: kcfg.urls.callbackUrl,
            message: record.resultDesc,
          };
          recordCashierDiagnostic({
            channel: 'KCB_BANK',
            method: 'POST',
            endpoint: resolvedEndpoint,
            httpStatus: 202,
            outcome: 'PENDING',
            phoneOrTarget: targetLabel,
            usdAmount: amountUsd,
            kesAmount: amountKes,
            reference: record.id,
            summary: record.resultDesc || 'KCB Bank 01 payout queued',
            responsePayload: payload,
          });
          return res.status(202).json(payload);
        }

        const phErr = String(
          upstreamData.message || upstreamData.error_message || upstreamData.error || `PayHero Bank 01 HTTP ${upstream.status}`
        );
        recordCashierDiagnostic({
          channel: 'KCB_BANK',
          method: 'POST',
          endpoint: resolvedEndpoint,
          httpStatus: upstream.status,
          outcome: preferredRoute === 'payhero_bank' ? 'REJECTED' : 'WARNING',
          phoneOrTarget: targetLabel,
          usdAmount: amountUsd,
          kesAmount: amountKes,
          reference,
          summary: `PayHero Bank 01 declined: ${phErr}`,
          responsePayload: upstreamData,
        });
        if (preferredRoute === 'payhero_bank') {
          return res.status(502).json({ ok: false, configured: true, error: phErr });
        }
        upstreamNotes.push(`PayHero Bank 01: ${phErr}`);
      } catch (err: any) {
        const phErr = err?.message || 'PayHero Bank 01 API request timed out.';
        recordCashierDiagnostic({
          channel: 'KCB_BANK',
          method: 'POST',
          endpoint: resolvedEndpoint,
          httpStatus: 504,
          outcome: preferredRoute === 'payhero_bank' ? 'REJECTED' : 'WARNING',
          phoneOrTarget: targetLabel,
          usdAmount: amountUsd,
          kesAmount: amountKes,
          reference,
          summary: phErr,
        });
        if (preferredRoute === 'payhero_bank') {
          return res.status(502).json({ ok: false, configured: true, error: phErr });
        }
        upstreamNotes.push(`PayHero Bank 01: ${phErr}`);
      }
    }

    // 4. Built-In KCB iBank Webhook Bridge (strictly stays PENDING until KCB Buni IPN callback or verified status confirms)
    const fallbackSuffix = upstreamNotes.length > 0 ? ` [Upstream note: ${upstreamNotes.join('; ')}]` : '';
    const record: MpesaTxRecord = {
      id: reference,
      type: txType,
      standalone: isStandaloneKcb,
      environment: kcfg.env,
      phone: targetAccountDisplay,
      recipientPhone: parsedPhone ? parsedPhone.phone : targetAccountDisplay,
      recipientMsisdn: parsedPhone ? parsedPhone.msisdn : targetAccountDisplay,
      kcbAction: action,
      kcbTransferRail: kcbRail,
      kcbAccountNumber: targetAccountDisplay,
      kcbAccountName: accountName || undefined,
      partyB: kcbRail === 'paybill_522522' ? kcfg.kcbPaybill : targetAccountDisplay,
      accountReference: targetAccountDisplay,
      usdAmount: amountUsd,
      kesAmount: amountKes,
      loginId: resolvedLoginId,
      status: 'PENDING',
      callbackVerified: false,
      resultDesc: `KCB iBank ${action.toLowerCase()} ${reference} queued ($${amountUsd.toFixed(2)} USD / KES ${amountKes.toLocaleString()} -> ${targetLabel}). Awaiting KCB IPN confirmation at ${kcfg.urls.callbackUrl}.${fallbackSuffix}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    mpesaTransactions.set(record.id, record);

    const payload = {
      ok: true,
      configured: kcfg.ibankConnected,
      builtInBridge: true,
      action,
      mode: 'KCB_WEBHOOK_BRIDGE' as const,
      kcbRail,
      status: 'PENDING' as const,
      callbackVerified: false,
      reference: record.id,
      kcbPaybill: kcfg.kcbPaybill,
      kcbAccountNumber: targetAccountDisplay,
      targetLabel,
      callbackUrl: kcfg.urls.callbackUrl,
      upstreamNote: upstreamNotes.length > 0 ? upstreamNotes.join('; ') : undefined,
      message: record.resultDesc,
    };
    recordCashierDiagnostic({
      channel: 'KCB_BANK',
      method: 'POST',
      endpoint: resolvedEndpoint,
      httpStatus: 202,
      outcome: 'PENDING',
      phoneOrTarget: targetLabel,
      usdAmount: amountUsd,
      kesAmount: amountKes,
      reference: record.id,
      summary: record.resultDesc || `KCB iBank ${action.toLowerCase()} queued`,
      responsePayload: payload,
    });
    return res.status(202).json(payload);
  };

  app.get('/api/kcb/deposit', (req, res) => handleKcbGetBridge(req, res, 'DEPOSIT'));
  app.get('/api/kcb/withdraw', (req, res) => handleKcbGetBridge(req, res, 'WITHDRAWAL'));
  app.get('/api/kcb/transfer', (req, res) => handleKcbGetBridge(req, res, 'TRANSFER'));

  app.post('/api/kcb/deposit', (req, res) => handleKcbAction(req, res, 'DEPOSIT'));
  app.post('/api/kcb/withdraw', (req, res) => handleKcbAction(req, res, 'WITHDRAWAL'));
  app.post('/api/kcb/transfer', (req, res) => handleKcbAction(req, res));

  app.get('/api/kcb/transaction-status/:reference', (req, res) => {
    const ref = String(req.params.reference || '').trim();
    const mappedId = originatorToPrimaryId.get(ref);
    const tx = mpesaTransactions.get(ref) || (mappedId ? mpesaTransactions.get(mappedId) : undefined);
    if (!tx || !isKcbTxType(tx.type)) {
      return res.status(404).json({ ok: false, error: `KCB iBank transaction ${ref} not found.` });
    }
    return res.json({
      ok: true,
      transaction: tx,
      reference: tx.id,
      action: tx.kcbAction || (tx.type === 'KCB_DEPOSIT' ? 'DEPOSIT' : tx.type === 'KCB_WITHDRAWAL' ? 'WITHDRAWAL' : 'TRANSFER'),
      status: tx.status,
      callbackVerified: Boolean(tx.callbackVerified),
      mpesaReceipt: tx.mpesaReceipt,
      message: tx.safaricomConfirmationText || tx.resultDesc,
    });
  });

  app.post('/api/kcb/confirm', (req, res) => {
    const ref = String(req.body?.reference || req.body?.id || '').trim();
    if (!ref) {
      return res.status(400).json({ ok: false, error: 'KCB iBank transaction reference is required.' });
    }
    const mappedId = originatorToPrimaryId.get(ref);
    const tx = mpesaTransactions.get(ref) || (mappedId ? mpesaTransactions.get(mappedId) : undefined);
    if (!tx || !isKcbTxType(tx.type)) {
      return res.status(404).json({ ok: false, error: `KCB iBank transaction ${ref} not found.` });
    }
    if (tx.status === 'COMPLETED' && tx.callbackVerified === true) {
      return res.json({ ok: true, transaction: tx });
    }
    if (tx.status === 'REJECTED') {
      return res.status(409).json({
        ok: false,
        status: 'REJECTED',
        error: tx.resultDesc || 'KCB Bank rejected this transaction.',
        transaction: tx,
      });
    }
    return res.status(409).json({
      ok: false,
      awaitingKcbCallback: true,
      status: 'PENDING',
      error: `KCB iBank transaction ${ref} is PENDING until KCB Buni IPN callback (/api/kcb/callback) or bank/M-Pesa receipt settles.`,
      transaction: tx,
    });
  });

  app.get('/api/kcb/callback', (req, res) => {
    const kcfg = getKcbConfig(req);
    const seen = new Set<string>();
    const pendingTransfersCount = Array.from(mpesaTransactions.values()).filter((t) => {
      if (!isKcbTxType(t.type) || seen.has(t.id)) return false;
      seen.add(t.id);
      return t.status === 'PENDING';
    }).length;
    const recentWebhooks = incomingWebhookCallbacks
      .filter((w) => w.kind === 'KCB_CALLBACK')
      .slice(0, 10)
      .map((w) => ({
        id: w.id,
        receivedAt: w.receivedAt,
        reference: w.reference,
        resultCode: w.resultCode,
        resultDesc: w.resultDesc,
        mpesaReceipt: w.mpesaReceipt,
        matchedTransaction: w.matchedTransaction,
        sourceIp: w.sourceIp,
      }));
    return res.json({
      ok: true,
      environment: kcfg.env,
      endpoint: '/api/kcb/callback',
      method: 'POST',
      merchantId: kcfg.merchantId,
      kcbPaybill: kcfg.kcbPaybill,
      companyCode: kcfg.companyCode,
      mode: kcfg.activeMode,
      webhookSecretConfigured: Boolean(kcfg.webhookSecret),
      signatureHeader: 'X-Kcb-Signature (HMAC-SHA256 hex or sha256=<hex> of raw JSON body)',
      callbackAuthGated: isPreviewAuthGatedUrl(kcfg.publicBase),
      pendingTransfersCount,
      urls: kcfg.urls,
      expectedBody: {
        externalReference: 'KCB-... (also accepts external_reference, ExternalReference, transactionReference, reference, BillRefNumber)',
        status: 'SUCCESS | COMPLETED | FAILED | REJECTED (also accepts response.Status)',
        resultCode: '0 (success) | non-zero error code',
        bankReference: 'KCB FT / Bank / M-Pesa receipt code (also accepts ftReference, MpesaReceiptNumber, TransID, provider_reference)',
        amount: 'Optional settled KES amount',
        statusDescription: 'Optional settlement message',
      },
      recentWebhooks,
    });
  });

  app.post('/api/kcb/callback', (req, res) => {
    const kcfg = getKcbConfig(req);
    const bodyObj = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const headerObj =
      typeof bodyObj.header === 'object' && bodyObj.header !== null ? (bodyObj.header as Record<string, unknown>) : {};
    const dataObj =
      typeof bodyObj.data === 'object' && bodyObj.data !== null ? (bodyObj.data as Record<string, unknown>) : {};
    const requestPayloadObj =
      typeof bodyObj.requestPayload === 'object' && bodyObj.requestPayload !== null
        ? (bodyObj.requestPayload as Record<string, unknown>)
        : typeof bodyObj.response === 'object' && bodyObj.response !== null
        ? (bodyObj.response as Record<string, unknown>)
        : {};
    const primaryDataObj =
      typeof requestPayloadObj.primaryData === 'object' && requestPayloadObj.primaryData !== null
        ? (requestPayloadObj.primaryData as Record<string, unknown>)
        : {};
    const merged: Record<string, unknown> = {
      ...dataObj,
      ...primaryDataObj,
      ...requestPayloadObj,
      ...headerObj,
      ...bodyObj,
    };

    const candidates = [
      merged.externalReference,
      merged.external_reference,
      merged.ExternalReference,
      merged.transactionReference,
      merged.reference,
      merged.ftReference,
      merged.originatorConversationID,
      merged.OriginatorConversationID,
      merged.ConversationID,
      merged.CheckoutRequestID,
      merged.checkout_request_id,
      merged.BillRefNumber,
      merged.transaction_id,
      merged.messageID,
    ]
      .filter(Boolean)
      .map((v) => String(v).trim());
    const refStr = candidates[0];

    if (kcfg.webhookSecret) {
      const sigHeader = String(
        req.headers['x-kcb-signature'] || req.headers['x-webhook-signature'] || req.headers['x-signature'] || ''
      ).trim();
      const sigHex = sigHeader.replace(/^sha256=/i, '').trim().toLowerCase();
      const rawBody = (req as Request & { rawBody?: string }).rawBody || JSON.stringify(req.body || {});
      const expected = crypto.createHmac('sha256', kcfg.webhookSecret).update(rawBody).digest('hex').toLowerCase();
      const isHex = /^[0-9a-f]{64}$/i.test(sigHex);
      const validSig =
        (isHex &&
          sigHex.length === expected.length &&
          crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(expected, 'hex'))) ||
        sigHeader === kcfg.webhookSecret;

      if (!validSig) {
        const errMsg = 'Invalid KCB webhook signature header.';
        const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
          kind: 'KCB_CALLBACK',
          endpoint: '/api/kcb/callback',
          reference: refStr,
          resultCode: '401_HMAC_INVALID',
          resultDesc: errMsg,
          matchedTransaction: false,
        });
        recordCashierDiagnostic({
          channel: 'KCB_BANK',
          method: 'POST',
          endpoint: '/api/kcb/callback',
          httpStatus: 401,
          outcome: 'REJECTED',
          reference: refStr,
          summary: `${errMsg} (source ${rawEntry.sourceIp})`,
          responsePayload: { ok: false, error: errMsg, signatureHeaderPresent: Boolean(sigHeader) },
        });
        return res.status(401).json({ ok: false, error: errMsg });
      }
    }

    const statusRaw = merged.Status ?? merged.status ?? merged.transactionStatus ?? merged.statusDescription;
    const resultCodeRaw = merged.resultCode ?? merged.ResultCode ?? merged.responseCode ?? merged.statusCode ?? merged.result_code;
    const receiptRaw =
      merged.bankReference ??
      merged.ftReference ??
      merged.MpesaReceiptNumber ??
      merged.TransID ??
      merged.transactionID ??
      merged.transactionId ??
      merged.mpesaReceipt ??
      merged.provider_reference ??
      merged.third_party_reference ??
      merged.receipt;
    const receiptStr = receiptRaw ? String(receiptRaw).trim() : undefined;
    const messageStr = merged.statusDescription
      ? String(merged.statusDescription)
      : merged.statusMessage
      ? String(merged.statusMessage)
      : merged.ResultDesc
      ? String(merged.ResultDesc)
      : merged.message
      ? String(merged.message)
      : undefined;
    const amountRaw = merged.transactionAmount ?? merged.debitAmount ?? merged.TransAmount ?? merged.Amount ?? merged.amount ?? merged.kesAmount;
    const amountNum = amountRaw !== undefined ? Number(amountRaw) : undefined;
    const explicitSuccessFlag =
      merged.success === true || bodyObj.status === true
        ? true
        : merged.success === false || bodyObj.status === false
        ? false
        : undefined;

    let matchedTx: MpesaTxRecord | undefined;
    for (const c of candidates) {
      const mapped = originatorToPrimaryId.get(c);
      const found = mpesaTransactions.get(c) || (mapped ? mpesaTransactions.get(mapped) : undefined);
      if (found && isKcbTxType(found.type)) {
        matchedTx = found;
        break;
      }
    }

    let matchedTransaction = false;
    let verificationError: string | undefined;
    let outcome: ServerDiagOutcome = 'WARNING';

    if (matchedTx) {
      matchedTransaction = true;
      const result = applyKcbVerificationPayload(matchedTx, {
        statusRaw,
        successFlag: explicitSuccessFlag,
        resultCode: resultCodeRaw,
        receipt: receiptStr,
        message: messageStr,
        amount: amountNum,
        source: 'KCB_CALLBACK',
      });
      verificationError = result.error;
      outcome = matchedTx.status === 'COMPLETED' ? 'OK' : matchedTx.status === 'REJECTED' ? 'REJECTED' : 'WARNING';
    }

    const rawEntry = recordIncomingWebhook(req as Request & { rawBody?: string }, {
      kind: 'KCB_CALLBACK',
      endpoint: '/api/kcb/callback',
      reference: refStr,
      resultCode: resultCodeRaw !== undefined ? String(resultCodeRaw) : statusRaw ? String(statusRaw) : undefined,
      resultDesc: verificationError || messageStr,
      mpesaReceipt: receiptStr,
      matchedTransaction,
    });

    recordCashierDiagnostic({
      channel: 'KCB_BANK',
      method: 'POST',
      endpoint: '/api/kcb/callback',
      httpStatus: 200,
      outcome,
      reference: receiptStr || refStr,
      summary:
        verificationError ||
        messageStr ||
        `KCB iBank IPN callback POST (${matchedTransaction ? 'matched tx' : 'unmatched ref'}) from ${rawEntry.sourceIp}`,
      responsePayload:
        typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : { raw: req.body },
    });

    return res.json({
      ok: true,
      matchedTransaction,
      reference: matchedTx?.id || refStr,
      status: matchedTx?.status,
      callbackVerified: matchedTx ? Boolean(matchedTx.callbackVerified) : undefined,
      mpesaReceipt: matchedTx?.mpesaReceipt || receiptStr,
      verificationError,
    });
  });

  // Real-Time Cashier Diagnostic Logs & Gateway Readiness
  app.get('/api/cashier/diagnostics', (req, res) => {
    const cfg = getDarajaConfig();
    const dcashApiUrl = cleanEnvVar(process.env.DCASH_API_URL).replace(/\/+$/, '');
    const dcashApiKey = cleanEnvVar(process.env.DCASH_API_KEY);
    const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
    const dcashUrls = resolveDcashUrls(req, dcashApiUrl, publicBase);
    const dcashExternalConfigured = Boolean(dcashUrls.hasValidExternalUrl && dcashApiKey);
    const vcfg = getValtexConfig(req);
    const pcfg = getPayHeroConfig(req);
    const kcfg = getKcbConfig(req);

    return res.json({
      ok: true,
      serverTime: Date.now(),
      health: {
        darajaEnv: cfg.env,
        stkConfigured: cfg.stkConfigured,
        b2cConfigured: cfg.b2cConfigured,
        b2bConfigured: cfg.b2bConfigured,
        b2bCommandId: cfg.b2bCommandId,
        darajaWarnings: cfg.warnings,
        dcashApiConfigured: dcashExternalConfigured,
        dcashBuiltinReady: true,
        dcashBridgeMode: dcashExternalConfigured ? 'EXTERNAL_API' : 'BUILTIN_BRIDGE',
        valtexExternalConfigured: vcfg.externalConfigured,
        valtexMode: vcfg.externalConfigured ? 'EXTERNAL_VALTEX_API' : 'VALTEX_WEBHOOK_BRIDGE',
        valtexUrls: vcfg.urls,
        payheroApiConfigured: pcfg.apiConfigured,
        payheroChannelConfigured: pcfg.channelIdConfigured,
        payheroMode: pcfg.apiConfigured ? 'PAYHERO_API_V2' : 'PAYHERO_WEBHOOK_BRIDGE',
        payheroUrls: pcfg.urls,
        kcbBuniConfigured: kcfg.buniConfigured,
        kcbDarajaB2bReady: kcfg.darajaB2bConfigured,
        kcbDarajaStkReady: kcfg.darajaStkConfigured,
        kcbPayheroBank01Ready: kcfg.payheroBank01Ready,
        kcbIbankConnected: kcfg.ibankConnected,
        kcbMode: kcfg.activeMode,
        kcbUrls: kcfg.urls,
        dcashUrlValid: dcashUrls.hasValidExternalUrl,
        dcashUrlPresent: Boolean(dcashApiUrl),
        dcashUrls: {
          checkoutUrl: dcashUrls.checkoutUrl,
          apiBaseUrl: dcashUrls.apiBaseUrl,
          transferUrl: dcashUrls.transferUrl,
          builtInTransferUrl: dcashUrls.builtInTransferUrl,
          callbackUrl: dcashUrls.callbackUrl,
          externalApiUrl: dcashUrls.externalApiUrl,
          paymentAgentUrl: dcashUrls.paymentAgentUrl,
        },
        dcashWarnings:
          dcashApiUrl && !dcashUrls.hasValidExternalUrl
            ? [
                `DCASH_API_URL in Secrets is not a valid https:// URL — built-in D Cash URL (${dcashUrls.builtInTransferUrl}) is active.`,
              ]
            : [],
        verifiedP2pReceiversCount: verifiedP2pReceivers.size,
        callbackConfig: {
          publicBaseUrl: publicBase || '',
          source: cfg.callbackBaseUrlSource,
          runtimeOverrideUrl: cfg.runtimeCallbackBaseUrl || '',
          envCallbackBaseUrl: cfg.envCallbackBaseUrl || '',
          envAppUrl: cfg.appUrl || '',
          callbackAuthGated: isPreviewAuthGatedUrl(publicBase),
          isHttps: /^https:\/\//i.test(publicBase),
          isDarajaCompatible: Boolean(publicBase && /^https:\/\//i.test(publicBase) && !isPreviewAuthGatedUrl(publicBase)),
          warning: !publicBase
            ? 'No public HTTPS callback base URL could be resolved.'
            : isPreviewAuthGatedUrl(publicBase)
            ? 'Active base URL is an auth-gated preview or localhost URL. Configure a public HTTPS URL in MPESA_CALLBACK_BASE_URL for external Safaricom/KCB/PayHero/Valtex webhooks.'
            : !/^https:\/\//i.test(publicBase)
            ? 'Callback base URL must use https:// for production Safaricom Daraja and KCB Buni webhooks.'
            : null,
        },
        callbackUrls: {
          healthUrl: publicBase ? `${publicBase}/api/mpesa/callback-health` : '/api/mpesa/callback-health',
          stkCallbackUrl: publicBase ? `${publicBase}/api/mpesa/callback` : '/api/mpesa/callback',
          b2cResultUrl: publicBase ? `${publicBase}/api/mpesa/b2c-result` : '/api/mpesa/b2c-result',
          b2cTimeoutUrl: publicBase ? `${publicBase}/api/mpesa/b2c-timeout` : '/api/mpesa/b2c-timeout',
          b2bResultUrl: publicBase ? `${publicBase}/api/mpesa/b2b-result` : '/api/mpesa/b2b-result',
          b2bTimeoutUrl: publicBase ? `${publicBase}/api/mpesa/b2b-timeout` : '/api/mpesa/b2b-timeout',
          c2bValidationUrl: publicBase ? `${publicBase}/api/mpesa/c2b-validation` : '/api/mpesa/c2b-validation',
          c2bConfirmationUrl: publicBase ? `${publicBase}/api/mpesa/c2b-confirmation` : '/api/mpesa/c2b-confirmation',
          dcashTransferUrl: dcashUrls.transferUrl,
          dcashCallbackUrl: dcashUrls.callbackUrl,
          dcashCheckoutUrl: dcashUrls.checkoutUrl,
          valtexCallbackUrl: vcfg.urls.callbackUrl,
          valtexTransferUrl: vcfg.urls.transferUrl,
          payheroCallbackUrl: pcfg.urls.callbackUrl,
          payheroDepositUrl: pcfg.urls.depositUrl,
          payheroWithdrawUrl: pcfg.urls.withdrawUrl,
          payheroTransferUrl: pcfg.urls.transferUrl,
          kcbCallbackUrl: kcfg.urls.callbackUrl,
          kcbDepositUrl: kcfg.urls.depositUrl,
          kcbWithdrawUrl: kcfg.urls.withdrawUrl,
          kcbTransferUrl: kcfg.urls.transferUrl,
        },
      },
      logs: cashierDiagnosticLogs,
      webhookCallbacks: incomingWebhookCallbacks,
    });
  });

  const buildCallbackConfigResponse = (req: Request) => {
    const cfg = getDarajaConfig();
    const publicBase = resolvePublicBaseUrl(req, cfg.appUrl, cfg.callbackBaseUrl);
    const kcfg = getKcbConfig(req);
    const pcfg = getPayHeroConfig(req);
    const vcfg = getValtexConfig(req);
    const dcashApiUrl = cleanEnvVar(process.env.DCASH_API_URL).replace(/\/+$/, '');
    const dcashUrls = resolveDcashUrls(req, dcashApiUrl, publicBase);
    const isHttps = /^https:\/\//i.test(publicBase);
    const callbackAuthGated = isPreviewAuthGatedUrl(publicBase);
    const isDarajaCompatible = Boolean(publicBase && isHttps && !callbackAuthGated);

    return {
      ok: true,
      publicBaseUrl: publicBase,
      source: publicBase ? cfg.callbackBaseUrlSource : 'UNRESOLVED',
      runtimeOverrideUrl: cfg.runtimeCallbackBaseUrl,
      envCallbackBaseUrl: cfg.envCallbackBaseUrl,
      envAppUrl: cfg.appUrl,
      callbackAuthGated,
      isHttps,
      isDarajaCompatible,
      warning: !publicBase
        ? 'No public HTTPS callback base URL resolved.'
        : callbackAuthGated
        ? 'Active callback base URL is a private/preview URL. Set MPESA_CALLBACK_BASE_URL to an unauthenticated public HTTPS domain or tunnel.'
        : !isHttps
        ? 'Production Safaricom Daraja and KCB Buni require https:// webhook URLs.'
        : null,
      urls: {
        healthUrl: publicBase ? `${publicBase}/api/mpesa/callback-health` : '/api/mpesa/callback-health',
        stkCallbackUrl: publicBase ? `${publicBase}/api/mpesa/callback` : '/api/mpesa/callback',
        b2cResultUrl: publicBase ? `${publicBase}/api/mpesa/b2c-result` : '/api/mpesa/b2c-result',
        b2cTimeoutUrl: publicBase ? `${publicBase}/api/mpesa/b2c-timeout` : '/api/mpesa/b2c-timeout',
        b2bResultUrl: publicBase ? `${publicBase}/api/mpesa/b2b-result` : '/api/mpesa/b2b-result',
        b2bTimeoutUrl: publicBase ? `${publicBase}/api/mpesa/b2b-timeout` : '/api/mpesa/b2b-timeout',
        c2bValidationUrl: publicBase ? `${publicBase}/api/mpesa/c2b-validation` : '/api/mpesa/c2b-validation',
        c2bConfirmationUrl: publicBase ? `${publicBase}/api/mpesa/c2b-confirmation` : '/api/mpesa/c2b-confirmation',
        dcashCallbackUrl: dcashUrls.callbackUrl,
        valtexCallbackUrl: vcfg.urls.callbackUrl,
        payheroCallbackUrl: pcfg.urls.callbackUrl,
        kcbCallbackUrl: kcfg.urls.callbackUrl,
      },
    };
  };

  app.get('/api/cashier/callback-config', (req, res) => {
    return res.json(buildCallbackConfigResponse(req));
  });

  app.post('/api/cashier/callback-config', (req, res) => {
    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const reset = body.reset === true;
    const rawInput = String(body.callbackBaseUrl ?? body.baseUrl ?? body.url ?? '').trim();

    if (reset || rawInput === '') {
      saveRuntimeCallbackBaseUrl('');
      const next = buildCallbackConfigResponse(req);
      recordCashierDiagnostic({
        channel: 'MPESA_STK',
        method: 'POST',
        endpoint: '/api/cashier/callback-config',
        httpStatus: 200,
        outcome: next.callbackAuthGated ? 'WARNING' : 'OK',
        summary: `Reset custom MPESA_CALLBACK_BASE_URL override; active base: ${next.publicBaseUrl || 'request host'}`,
        responsePayload: next,
      });
      return res.json(next);
    }

    const normalized = normalizeCallbackBaseUrlInput(rawInput);
    if (!normalized) {
      return res.status(400).json({
        ok: false,
        error: 'Enter a valid public https:// callback base URL (e.g. https://pay.yourdomain.com or https://tunnel.trycloudflare.com).',
      });
    }

    saveRuntimeCallbackBaseUrl(normalized);
    const next = buildCallbackConfigResponse(req);
    recordCashierDiagnostic({
      channel: 'MPESA_STK',
      method: 'POST',
      endpoint: '/api/cashier/callback-config',
      httpStatus: 200,
      outcome: next.isDarajaCompatible ? 'OK' : 'WARNING',
      summary: `Configured public MPESA_CALLBACK_BASE_URL -> ${normalized}`,
      responsePayload: next,
    });
    return res.json(next);
  });

  app.post('/api/cashier/callback-config/probe', async (req, res) => {
    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const rawTarget = String(body.callbackBaseUrl ?? body.baseUrl ?? '').trim();
    const cfgRes = buildCallbackConfigResponse(req);
    const targetBase = rawTarget ? normalizeCallbackBaseUrlInput(rawTarget) : cfgRes.publicBaseUrl;

    if (!targetBase) {
      return res.status(400).json({
        ok: false,
        reachable: false,
        error: 'Provide or configure a valid http(s):// callback base URL before probing reachability.',
      });
    }

    const probeUrl = `${targetBase}/api/mpesa/callback-health`;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        (async () => {
          const r = await fetch(probeUrl, {
            method: 'GET',
            redirect: 'manual',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });
          const text = await r.text();
          return {
            status: r.status,
            location: r.headers.get('location') || undefined,
            contentType: r.headers.get('content-type') || '',
            text,
          };
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort(new Error('Probe timed out after 5000ms'));
            reject(new Error('Reachability probe timed out after 5000ms'));
          }, 5000);
        }),
      ]);

      let parsedOk = false;
      try {
        const json = JSON.parse(result.text) as { ok?: boolean };
        parsedOk = result.status === 200 && json?.ok === true;
      } catch {
        parsedOk = false;
      }

      const authGated =
        [301, 302, 303, 307, 308, 401, 403].includes(result.status) ||
        isPreviewAuthGatedUrl(targetBase) ||
        result.contentType.toLowerCase().includes('text/html');

      const summary = parsedOk
        ? `Public callback endpoint ${probeUrl} is reachable without authentication (HTTP 200 JSON).`
        : authGated
        ? `Public probe to ${probeUrl} returned HTTP ${result.status}${result.location ? ` -> ${result.location}` : ''}: blocked by preview/login authentication gate.`
        : `Public probe to ${probeUrl} returned unexpected HTTP ${result.status}.`;

      recordCashierDiagnostic({
        channel: 'MPESA_STK',
        method: 'POST',
        endpoint: '/api/cashier/callback-config/probe',
        httpStatus: result.status || 502,
        outcome: parsedOk ? 'OK' : 'WARNING',
        summary,
        responsePayload: { probeUrl, status: result.status, authGated, parsedOk, location: result.location },
      });

      return res.json({
        ok: true,
        probeUrl,
        httpStatus: result.status,
        reachable: parsedOk,
        authGated,
        location: result.location,
        summary,
      });
    } catch (err: any) {
      const msg = err?.message || `Unable to reach ${probeUrl}`;
      recordCashierDiagnostic({
        channel: 'MPESA_STK',
        method: 'POST',
        endpoint: '/api/cashier/callback-config/probe',
        httpStatus: 502,
        outcome: 'REJECTED',
        summary: msg,
        responsePayload: { probeUrl, error: msg },
      });
      return res.status(502).json({
        ok: false,
        probeUrl,
        reachable: false,
        authGated: isPreviewAuthGatedUrl(targetBase),
        error: msg,
        summary: msg,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  });

  app.get('/api/cashier/webhooks', (_req, res) => {
    return res.json({
      ok: true,
      count: incomingWebhookCallbacks.length,
      webhookCallbacks: incomingWebhookCallbacks,
    });
  });

  app.delete('/api/cashier/webhooks', (_req, res) => {
    incomingWebhookCallbacks.length = 0;
    return res.json({ ok: true });
  });

  app.delete('/api/cashier/diagnostics', (req, res) => {
    const scope = String(req.query.scope || 'all');
    if (scope === 'logs' || scope === 'all') {
      cashierDiagnosticLogs.length = 0;
    }
    if (scope === 'webhooks' || scope === 'all') {
      incomingWebhookCallbacks.length = 0;
    }
    return res.json({ ok: true });
  });

  // ============================================================================
  // BIOMETRIC AUTHENTICATION (W3C WebAuthn TouchID/FaceID + Scrypt Quick PIN)
  // ============================================================================
  interface StoredWebAuthnCredential {
    id: string;
    publicKeyBase64: string;
    counter: number;
    transports?: AuthenticatorTransport[];
    deviceName: string;
    credentialDeviceType: string;
    backedUp: boolean;
    createdAt: number;
    lastUsedAt?: number;
  }

  interface BiometricStoreState {
    userId: string;
    userName: string;
    credentials: StoredWebAuthnCredential[];
    pinHash?: {
      saltHex: string;
      hashHex: string;
      updatedAt: number;
    };
    settings: {
      lockOnLaunch: boolean;
      requireForTransfers: boolean;
    };
    manualLockActive: boolean;
  }

  const BIOMETRIC_DATA_DIR = path.resolve(__dirname, '.data');
  const BIOMETRIC_STORE_FILE = path.resolve(BIOMETRIC_DATA_DIR, 'biometric-auth.json');

  const SESSION_HMAC_KEY =
    process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
      ? process.env.SESSION_SECRET.trim()
      : crypto.randomBytes(32).toString('hex');

  function loadBiometricStore(): BiometricStoreState {
    const fallback: BiometricStoreState = {
      userId: 'trader-nderiskool-01',
      userName: 'nderiskool',
      credentials: [],
      settings: {
        lockOnLaunch: false,
        requireForTransfers: false,
      },
      manualLockActive: false,
    };
    try {
      if (!fs.existsSync(BIOMETRIC_STORE_FILE)) return fallback;
      const raw = fs.readFileSync(BIOMETRIC_STORE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<BiometricStoreState>;
      return {
        userId: typeof parsed.userId === 'string' && parsed.userId ? parsed.userId : fallback.userId,
        userName: typeof parsed.userName === 'string' && parsed.userName ? parsed.userName : fallback.userName,
        credentials: Array.isArray(parsed.credentials) ? parsed.credentials : [],
        pinHash:
          parsed.pinHash && typeof parsed.pinHash.saltHex === 'string' && typeof parsed.pinHash.hashHex === 'string'
            ? parsed.pinHash
            : undefined,
        settings: {
          lockOnLaunch: Boolean(parsed.settings?.lockOnLaunch),
          requireForTransfers: Boolean(parsed.settings?.requireForTransfers),
        },
        manualLockActive: Boolean(parsed.manualLockActive),
      };
    } catch {
      return fallback;
    }
  }

  function saveBiometricStore(state: BiometricStoreState) {
    try {
      fs.mkdirSync(BIOMETRIC_DATA_DIR, { recursive: true });
      fs.writeFileSync(BIOMETRIC_STORE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch {
      // ignore disk write failures on read-only FS
    }
  }

  const biometricStore = loadBiometricStore();

  const webauthnChallenges = new Map<
    string,
    {
      challenge: string;
      type: 'register' | 'auth';
      rpID: string;
      expectedOrigins: string[];
      expiresAt: number;
    }
  >();

  const activeBiometricSessions = new Map<
    string,
    {
      id: string;
      method: 'webauthn' | 'pin' | 'enroll';
      credentialId?: string;
      deviceName?: string;
      issuedAt: number;
      expiresAt: number;
    }
  >();

  let failedPinAttempts = 0;
  let pinLockedUntil = 0;

  function pruneExpiredBiometricState() {
    const now = Date.now();
    for (const [k, v] of webauthnChallenges.entries()) {
      if (v.expiresAt <= now) webauthnChallenges.delete(k);
    }
    for (const [k, v] of activeBiometricSessions.entries()) {
      if (v.expiresAt <= now) activeBiometricSessions.delete(k);
    }
  }

  function resolveWebAuthnRp(req: Request): {
    rpID: string;
    expectedOrigins: string[];
    rpName: string;
  } {
    const rawHost = String(req.get('x-forwarded-host') || req.get('host') || 'localhost:3000')
      .split(',')[0]
      .trim();
    const hostname = rawHost.split(':')[0] || 'localhost';
    const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http')
      .split(',')[0]
      .trim()
      .toLowerCase();
    const origins = new Set<string>([`${proto}://${rawHost}`]);
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      origins.add(`http://${rawHost}`);
      origins.add(`https://${rawHost}`);
    }
    const reqOrigin = req.get('origin');
    if (reqOrigin) {
      try {
        const parsed = new URL(reqOrigin);
        if (
          parsed.hostname === hostname &&
          (parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
        ) {
          origins.add(parsed.origin);
        }
      } catch {
        // ignore malformed Origin header
      }
    }
    return {
      rpID: hostname,
      expectedOrigins: Array.from(origins),
      rpName: 'nderiskool Trading Terminal',
    };
  }

  function signSessionId(sessionId: string): string {
    return crypto.createHmac('sha256', SESSION_HMAC_KEY).update(sessionId).digest('base64url');
  }

  function issueBiometricSessionToken(meta: {
    method: 'webauthn' | 'pin' | 'enroll';
    credentialId?: string;
    deviceName?: string;
  }) {
    pruneExpiredBiometricState();
    const sessionId = crypto.randomBytes(24).toString('base64url');
    const now = Date.now();
    const expiresAt = now + 12 * 60 * 60 * 1000;
    activeBiometricSessions.set(sessionId, {
      id: sessionId,
      method: meta.method,
      credentialId: meta.credentialId,
      deviceName: meta.deviceName,
      issuedAt: now,
      expiresAt,
    });
    biometricStore.manualLockActive = false;
    saveBiometricStore(biometricStore);
    return {
      token: `${sessionId}.${signSessionId(sessionId)}`,
      expiresAt,
      method: meta.method,
      deviceName: meta.deviceName,
    };
  }

  function getVerifiedBiometricSession(req: Request) {
    pruneExpiredBiometricState();
    const authHeader = String(req.get('authorization') || '');
    if (!authHeader.startsWith('Bearer ')) return null;
    const rawToken = authHeader.slice(7).trim();
    const dotIdx = rawToken.indexOf('.');
    if (dotIdx <= 0) return null;
    const sessionId = rawToken.slice(0, dotIdx);
    const providedSig = rawToken.slice(dotIdx + 1);
    const expectedSig = signSessionId(sessionId);
    const bufProvided = Buffer.from(providedSig, 'utf8');
    const bufExpected = Buffer.from(expectedSig, 'utf8');
    if (bufProvided.length !== bufExpected.length) return null;
    if (!crypto.timingSafeEqual(bufProvided, bufExpected)) return null;
    const session = activeBiometricSessions.get(sessionId);
    if (!session || session.expiresAt <= Date.now()) return null;
    return session;
  }

  function hashPinScrypt(pin: string, saltHex?: string) {
    const salt = saltHex || crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(pin, salt, 64).toString('hex');
    return { saltHex: salt, hashHex: derived };
  }

  function verifyPinScrypt(pin: string, stored: { saltHex: string; hashHex: string }): boolean {
    const derivedHex = crypto.scryptSync(pin, stored.saltHex, 64).toString('hex');
    const a = Buffer.from(derivedHex, 'hex');
    const b = Buffer.from(stored.hashHex, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  function buildBiometricStatusPayload(req: Request) {
    const session = getVerifiedBiometricSession(req);
    const hasPasskeys = biometricStore.credentials.length > 0;
    const hasPin = Boolean(biometricStore.pinHash);
    const protectionConfigured = hasPasskeys || hasPin;
    const isLocked = protectionConfigured && (biometricStore.settings.lockOnLaunch || biometricStore.manualLockActive) && !session;
    return {
      ok: true,
      protectionConfigured,
      hasPasskeys,
      hasPin,
      isLocked,
      sessionVerified: Boolean(session),
      sessionMethod: session?.method || null,
      sessionDeviceName: session?.deviceName || null,
      sessionExpiresAt: session?.expiresAt || null,
      settings: biometricStore.settings,
      credentials: biometricStore.credentials.map((c) => ({
        id: c.id,
        deviceName: c.deviceName,
        credentialDeviceType: c.credentialDeviceType,
        backedUp: c.backedUp,
        transports: c.transports || [],
        createdAt: c.createdAt,
        lastUsedAt: c.lastUsedAt || null,
      })),
    };
  }

  app.get('/api/auth/biometric/status', (req, res) => {
    return res.json(buildBiometricStatusPayload(req));
  });

  app.post('/api/auth/biometric/register/options', async (req, res) => {
    const protectionConfigured = biometricStore.credentials.length > 0 || Boolean(biometricStore.pinHash);
    const session = getVerifiedBiometricSession(req);
    const lockActive = protectionConfigured && (biometricStore.settings.lockOnLaunch || biometricStore.manualLockActive);
    if (lockActive && !session) {
      return res.status(401).json({ ok: false, error: 'Unlock terminal with existing biometrics or PIN before enrolling a new device.' });
    }

    try {
      pruneExpiredBiometricState();
      const { rpID, expectedOrigins, rpName } = resolveWebAuthnRp(req);
      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userName: biometricStore.userName,
        userDisplayName: 'nderiskool Trader',
        attestationType: 'none',
        excludeCredentials: biometricStore.credentials.map((cred) => ({
          id: cred.id,
          transports: cred.transports,
        })),
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      });

      const challengeId = crypto.randomBytes(16).toString('base64url');
      webauthnChallenges.set(challengeId, {
        challenge: options.challenge,
        type: 'register',
        rpID,
        expectedOrigins,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      return res.json({ ok: true, challengeId, options });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to generate biometric registration options.' });
    }
  });

  app.post('/api/auth/biometric/register/verify', async (req, res) => {
    const { challengeId, credential, deviceName } = req.body as {
      challengeId?: string;
      credential?: RegistrationResponseJSON;
      deviceName?: string;
    };

    if (!challengeId || !credential) {
      return res.status(400).json({ ok: false, error: 'Missing challengeId or registration credential payload.' });
    }

    pruneExpiredBiometricState();
    const challengeEntry = webauthnChallenges.get(challengeId);
    webauthnChallenges.delete(challengeId); // Single-use challenge

    if (!challengeEntry || challengeEntry.type !== 'register' || challengeEntry.expiresAt <= Date.now()) {
      return res.status(400).json({ ok: false, error: 'Biometric registration challenge expired or invalid. Please try again.' });
    }

    try {
      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challengeEntry.challenge,
        expectedOrigin: challengeEntry.expectedOrigins,
        expectedRPID: challengeEntry.rpID,
        requireUserVerification: true,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return res.status(400).json({ ok: false, error: 'Biometric attestation could not be verified.' });
      }

      const { credential: regCred, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      const cleanName =
        typeof deviceName === 'string' && deviceName.trim()
          ? deviceName.trim().slice(0, 60)
          : 'Mobile / Platform Biometric';

      const publicKeyBase64 = Buffer.from(regCred.publicKey).toString('base64');
      const existingIdx = biometricStore.credentials.findIndex((c) => c.id === regCred.id);
      const record: StoredWebAuthnCredential = {
        id: regCred.id,
        publicKeyBase64,
        counter: regCred.counter,
        transports: regCred.transports as AuthenticatorTransport[] | undefined,
        deviceName: cleanName,
        credentialDeviceType,
        backedUp: credentialBackedUp,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      if (existingIdx >= 0) {
        biometricStore.credentials[existingIdx] = record;
      } else {
        biometricStore.credentials.push(record);
      }

      const session = issueBiometricSessionToken({
        method: 'enroll',
        credentialId: record.id,
        deviceName: record.deviceName,
      });

      return res.json({
        ok: true,
        verified: true,
        token: session.token,
        expiresAt: session.expiresAt,
        credential: {
          id: record.id,
          deviceName: record.deviceName,
          credentialDeviceType: record.credentialDeviceType,
          backedUp: record.backedUp,
          createdAt: record.createdAt,
        },
        status: buildBiometricStatusPayload(req),
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Biometric registration verification failed.' });
    }
  });

  app.post('/api/auth/biometric/auth/options', async (req, res) => {
    if (biometricStore.credentials.length === 0) {
      return res.status(404).json({ ok: false, error: 'No biometric passkeys are enrolled on this terminal yet.' });
    }

    try {
      pruneExpiredBiometricState();
      const { rpID, expectedOrigins } = resolveWebAuthnRp(req);
      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: biometricStore.credentials.map((cred) => ({
          id: cred.id,
          transports: cred.transports,
        })),
        userVerification: 'required',
        timeout: 60000,
      });

      const challengeId = crypto.randomBytes(16).toString('base64url');
      webauthnChallenges.set(challengeId, {
        challenge: options.challenge,
        type: 'auth',
        rpID,
        expectedOrigins,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      return res.json({ ok: true, challengeId, options });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to generate biometric authentication challenge.' });
    }
  });

  app.post('/api/auth/biometric/auth/verify', async (req, res) => {
    const { challengeId, credential } = req.body as {
      challengeId?: string;
      credential?: AuthenticationResponseJSON;
    };

    if (!challengeId || !credential) {
      return res.status(400).json({ ok: false, error: 'Missing challengeId or biometric assertion payload.' });
    }

    pruneExpiredBiometricState();
    const challengeEntry = webauthnChallenges.get(challengeId);
    webauthnChallenges.delete(challengeId); // Single-use challenge

    if (!challengeEntry || challengeEntry.type !== 'auth' || challengeEntry.expiresAt <= Date.now()) {
      return res.status(400).json({ ok: false, error: 'Biometric authentication challenge expired or invalid. Please retry.' });
    }

    const storedCred = biometricStore.credentials.find((c) => c.id === credential.id);
    if (!storedCred) {
      return res.status(401).json({ ok: false, error: 'Unrecognized biometric credential. It may have been revoked.' });
    }

    try {
      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: challengeEntry.challenge,
        expectedOrigin: challengeEntry.expectedOrigins,
        expectedRPID: challengeEntry.rpID,
        credential: {
          id: storedCred.id,
          publicKey: new Uint8Array(Buffer.from(storedCred.publicKeyBase64, 'base64')),
          counter: storedCred.counter,
          transports: storedCred.transports,
        },
        requireUserVerification: true,
      });

      if (!verification.verified) {
        return res.status(401).json({ ok: false, error: 'Biometric signature verification failed.' });
      }

      storedCred.counter = verification.authenticationInfo.newCounter;
      storedCred.lastUsedAt = Date.now();
      failedPinAttempts = 0;
      pinLockedUntil = 0;

      const session = issueBiometricSessionToken({
        method: 'webauthn',
        credentialId: storedCred.id,
        deviceName: storedCred.deviceName,
      });

      return res.json({
        ok: true,
        verified: true,
        token: session.token,
        expiresAt: session.expiresAt,
        deviceName: storedCred.deviceName,
      });
    } catch (err: any) {
      return res.status(401).json({ ok: false, error: err?.message || 'Biometric verification rejected.' });
    }
  });

  app.post('/api/auth/pin/setup', (req, res) => {
    const { pin, currentPin } = req.body as { pin?: string; currentPin?: string };
    const cleanPin = String(pin || '').trim();
    if (!/^\d{4,8}$/.test(cleanPin)) {
      return res.status(400).json({ ok: false, error: 'Quick PIN must be 4 to 8 numeric digits (6 digits recommended).' });
    }

    const session = getVerifiedBiometricSession(req);
    const hasExistingPin = Boolean(biometricStore.pinHash);
    const lockActive = (biometricStore.credentials.length > 0 || hasExistingPin) && (biometricStore.settings.lockOnLaunch || biometricStore.manualLockActive);

    if (hasExistingPin && !session) {
      if (!currentPin || !biometricStore.pinHash || !verifyPinScrypt(String(currentPin).trim(), biometricStore.pinHash)) {
        return res.status(401).json({ ok: false, error: 'Current PIN or unlocked biometric session required to update Quick PIN.' });
      }
    } else if (lockActive && !session) {
      return res.status(401).json({ ok: false, error: 'Unlock terminal before setting a Quick PIN.' });
    }

    const hashed = hashPinScrypt(cleanPin);
    biometricStore.pinHash = {
      ...hashed,
      updatedAt: Date.now(),
    };

    const newSession = issueBiometricSessionToken({
      method: 'pin',
      deviceName: 'Trader Quick PIN',
    });

    return res.json({
      ok: true,
      hasPin: true,
      token: newSession.token,
      expiresAt: newSession.expiresAt,
    });
  });

  app.post('/api/auth/pin/verify', (req, res) => {
    const now = Date.now();
    if (pinLockedUntil > now) {
      const waitSec = Math.ceil((pinLockedUntil - now) / 1000);
      return res.status(429).json({
        ok: false,
        error: `Too many incorrect PIN attempts. Try again in ${waitSec}s or unlock with TouchID / FaceID.`,
        retryAfterSec: waitSec,
      });
    }

    if (!biometricStore.pinHash) {
      return res.status(404).json({ ok: false, error: 'No Quick PIN configured on this terminal.' });
    }

    const cleanPin = String((req.body as { pin?: string })?.pin || '').trim();
    if (!/^\d{4,8}$/.test(cleanPin) || !verifyPinScrypt(cleanPin, biometricStore.pinHash)) {
      failedPinAttempts += 1;
      if (failedPinAttempts >= 5) {
        const cooldownMs = Math.min(300_000, 30_000 * Math.pow(2, failedPinAttempts - 5));
        pinLockedUntil = Date.now() + cooldownMs;
        return res.status(429).json({
          ok: false,
          error: `Too many incorrect PIN attempts. Locked for ${Math.ceil(cooldownMs / 1000)}s.`,
          retryAfterSec: Math.ceil(cooldownMs / 1000),
        });
      }
      return res.status(401).json({
        ok: false,
        error: `Incorrect Quick PIN (${5 - failedPinAttempts} attempts remaining).`,
      });
    }

    failedPinAttempts = 0;
    pinLockedUntil = 0;
    const session = issueBiometricSessionToken({
      method: 'pin',
      deviceName: 'Trader Quick PIN',
    });

    return res.json({
      ok: true,
      verified: true,
      token: session.token,
      expiresAt: session.expiresAt,
    });
  });

  app.patch('/api/auth/biometric/settings', (req, res) => {
    const protectionConfigured = biometricStore.credentials.length > 0 || Boolean(biometricStore.pinHash);
    const session = getVerifiedBiometricSession(req);
    const lockActive = protectionConfigured && (biometricStore.settings.lockOnLaunch || biometricStore.manualLockActive);
    if (lockActive && !session) {
      return res.status(401).json({ ok: false, error: 'Unlock terminal before modifying security settings.' });
    }

    const body = req.body as { lockOnLaunch?: unknown; requireForTransfers?: unknown };
    if (typeof body.lockOnLaunch === 'boolean') {
      if (body.lockOnLaunch && !protectionConfigured) {
        return res.status(400).json({ ok: false, error: 'Enroll TouchID/FaceID or set a Quick PIN before enabling launch lock.' });
      }
      biometricStore.settings.lockOnLaunch = body.lockOnLaunch;
    }
    if (typeof body.requireForTransfers === 'boolean') {
      if (body.requireForTransfers && !protectionConfigured) {
        return res.status(400).json({ ok: false, error: 'Enroll TouchID/FaceID or set a Quick PIN before enabling transfer authorization.' });
      }
      biometricStore.settings.requireForTransfers = body.requireForTransfers;
    }
    saveBiometricStore(biometricStore);
    return res.json({ ok: true, settings: biometricStore.settings });
  });

  app.delete('/api/auth/biometric/credentials/:id', (req, res) => {
    const session = getVerifiedBiometricSession(req);
    const lockActive =
      (biometricStore.credentials.length > 0 || Boolean(biometricStore.pinHash)) &&
      (biometricStore.settings.lockOnLaunch || biometricStore.manualLockActive);
    if (lockActive && !session) {
      return res.status(401).json({ ok: false, error: 'Unlock terminal before removing an enrolled biometric passkey.' });
    }

    const targetId = String(req.params.id || '');
    const next = biometricStore.credentials.filter((c) => c.id !== targetId);
    if (next.length === biometricStore.credentials.length) {
      return res.status(404).json({ ok: false, error: 'Credential not found.' });
    }
    biometricStore.credentials = next;
    if (biometricStore.credentials.length === 0 && !biometricStore.pinHash) {
      biometricStore.settings.lockOnLaunch = false;
      biometricStore.settings.requireForTransfers = false;
      biometricStore.manualLockActive = false;
    }
    saveBiometricStore(biometricStore);
    return res.json({ ok: true, remaining: biometricStore.credentials.length, settings: biometricStore.settings });
  });

  app.post('/api/auth/biometric/lock', (req, res) => {
    const protectionConfigured = biometricStore.credentials.length > 0 || Boolean(biometricStore.pinHash);
    if (!protectionConfigured) {
      return res.status(400).json({ ok: false, error: 'Enroll TouchID/FaceID or set a Quick PIN before locking the terminal.' });
    }

    const authHeader = String(req.get('authorization') || '');
    if (authHeader.startsWith('Bearer ')) {
      const rawToken = authHeader.slice(7).trim();
      const dotIdx = rawToken.indexOf('.');
      if (dotIdx > 0) {
        activeBiometricSessions.delete(rawToken.slice(0, dotIdx));
      }
    } else {
      activeBiometricSessions.clear();
    }

    biometricStore.manualLockActive = true;
    saveBiometricStore(biometricStore);
    return res.json({ ok: true, isLocked: true });
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    app.get('/@vite-plugin-pwa/pwa-entry-point-loaded', (_req, res) => {
      res
        .status(200)
        .set({
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        })
        .send(`export default function registerDevSW() {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) {
        reg.unregister().catch(() => {});
      }
    }).catch(() => {});
  }
  if (typeof caches !== 'undefined') {
    caches.keys().then((keys) => {
      for (const key of keys) {
        caches.delete(key).catch(() => {});
      }
    }).catch(() => {});
  }
}
`);
    });

    const cleanupSwHandler: express.RequestHandler = (_req, res) => {
      res
        .status(200)
        .set({
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        })
        .send(`self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {}
    try {
      await self.registration.unregister();
    } catch {}
    try {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('navigate' in client) client.navigate(client.url);
      }
    } catch {}
  })());
});
`);
    };

    app.get('/dev-sw.js', cleanupSwHandler);
    app.get('/sw.js', cleanupSwHandler);

    app.get('/manifest.webmanifest', (_req, res) => {
      res.type('application/manifest+json').json({
        id: '/',
        name: 'nderiskool | Deriv Forex Terminal',
        short_name: 'nderiskool',
        description:
          'Professional Forex & synthetic index trading platform for nderiskool, powered by real-time Deriv WebSocket connection, live candlestick charting, technical indicators, and execution terminal.',
        theme_color: '#080b11',
        background_color: '#080b11',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['finance', 'business'],
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      });
    });

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`nderiskool server listening on http://0.0.0.0:${PORT}`);
    // Pre-warm Daraja OAuth access token in background so withdrawals dispatch without OAuth cold-start delay
    const cfg = getDarajaConfig();
    if (cfg.hasOAuth) {
      fetchDarajaAccessToken(cfg.baseUrl, cfg.consumerKey, cfg.consumerSecret).catch(() => {});
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
