export const DEFAULT_SAFARICOM_PHONE = '0793950512';
export const VERIFIED_P2P_RECEIVER_PHONE = '0728424076';
export const KES_PER_USD_RATE = 129.5;

export interface NormalizedKenyanPhone {
  local: string; // e.g. 0728424076
  msisdn: string; // e.g. 254728424076
  formatted: string; // e.g. +254 728 424 076
  valid: boolean;
}

export function normalizeKenyanPhone(raw: string): NormalizedKenyanPhone {
  const digits = raw.replace(/\D/g, '');
  let national = '';

  if (digits.startsWith('254') && digits.length === 12) {
    national = digits.slice(3);
  } else if (digits.startsWith('0') && digits.length === 10) {
    national = digits.slice(1);
  } else if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) {
    national = digits;
  }

  if (national.length === 9 && (national.startsWith('7') || national.startsWith('1'))) {
    const local = `0${national}`;
    const msisdn = `254${national}`;
    const formatted = `+254 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 9)}`;
    return { local, msisdn, formatted, valid: true };
  }

  return {
    local: raw.trim() || DEFAULT_SAFARICOM_PHONE,
    msisdn: digits || '254793950512',
    formatted: raw.trim() || '+254 793 950 512',
    valid: false,
  };
}

export function detectKenyanCarrier(raw: string): string {
  const parsed = normalizeKenyanPhone(raw);
  if (!parsed.valid) return 'Invalid Kenyan Number';
  const p3 = Number(parsed.msisdn.slice(3, 6));
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
    return 'Safaricom Kenya (M-Pesa)';
  }
  if ((p3 >= 730 && p3 <= 739) || (p3 >= 750 && p3 <= 756) || (p3 >= 780 && p3 <= 789) || (p3 >= 100 && p3 <= 106)) {
    return 'Airtel Kenya (Airtel Money)';
  }
  if (p3 >= 770 && p3 <= 779) {
    return 'Telkom Kenya (T-kash)';
  }
  return 'Kenyan Mobile Wallet';
}

export function usdToKes(usd: number): number {
  return Math.round(usd * KES_PER_USD_RATE);
}

export function generateMpesaReceiptCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SK${suffix}`;
}

