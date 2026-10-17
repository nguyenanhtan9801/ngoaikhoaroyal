export interface VietQRParams {
  bankName: string;
  bankAccount: string;
  bankOwner: string;
  amount: number;
  studentCode: string;
  className: string;
  invoiceCode?: string;
}

export function getBankCode(bankName: string): string {
  const upper = bankName.toUpperCase();
  if (upper.includes('VIETCOMBANK') || upper.includes('VCB')) return 'VCB';
  if (upper.includes('BIDV')) return 'BIDV';
  if (upper.includes('TECHCOMBANK') || upper.includes('TCB')) return 'TCB';
  if (upper.includes('VIETINBANK') || upper.includes('CTG')) return 'ICB';
  if (upper.includes('MBBANK') || upper.includes('MB')) return 'MB';
  if (upper.includes('ACB')) return 'ACB';
  if (upper.includes('VPBANK') || upper.includes('VPB')) return 'VPB';
  if (upper.includes('TPBANK') || upper.includes('TPB')) return 'TPB';
  return 'VCB';
}

export function generateVietQRUrl(params: VietQRParams): string {
  const bankCode = getBankCode(params.bankName);
  const cleanAccount = params.bankAccount.replace(/\s+/g, '');
  // Standard format required by prompt: HP [Mã_HV] [Tên_Lớp]
  const cleanClassName = params.className.split('-')[0].trim().substring(0, 15);
  const memo = `HP ${params.studentCode} ${cleanClassName}`.substring(0, 50);
  
  const encodedMemo = encodeURIComponent(memo);
  const encodedAccountName = encodeURIComponent(params.bankOwner);
  const amount = Math.max(0, Math.round(params.amount));

  return `https://img.vietqr.io/image/${bankCode}-${cleanAccount}-compact2.png?amount=${amount}&addInfo=${encodedMemo}&accountName=${encodedAccountName}`;
}
