import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Kiểm tra xem lỗi từ Postgres/Supabase có phải là lỗi trùng unique constraint trên `invoice_code` (SQLSTATE 23505) hay không.
 */
export function isInvoiceCodeDuplicateError(error: any): boolean {
  if (!error) return false;
  const code = String(error?.code || error?.status || '').trim();
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  const isUniqueViolation =
    code === '23505' ||
    msg.includes('23505') ||
    msg.includes('duplicate key value violates unique constraint');
  if (!isUniqueViolation) return false;

  return (
    msg.includes('tuition_invoices_invoice_code_key') ||
    msg.includes('invoice_code')
  );
}

/**
 * Tìm số thứ tự tiếp theo an toàn (>= 1000) khi ở chế độ offline (không kết nối Supabase)
 * dựa trên các mã ngắn `INV-YYYY-xxxx` (bỏ qua mã ngẫu nhiên 6 chữ số).
 */
export function createOfflineInvoiceCodeAllocator(
  existingInvoices?: Array<{ invoice_code?: string | null }>,
  yearOverride?: number
): () => string {
  const year = yearOverride || new Date().getFullYear();
  const existingSet = new Set<string>();
  let maxShortNum = 0;

  for (const inv of existingInvoices || []) {
    const raw = String(inv?.invoice_code || '').trim();
    if (!raw) continue;
    existingSet.add(raw);
    const match = /^INV-\d{4}-(\d{1,4})$/.exec(raw);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > maxShortNum) {
        maxShortNum = n;
      }
    }
  }

  let nextNum = Math.max(1000, maxShortNum + 1);

  return () => {
    let candidate = `INV-${year}-${String(nextNum).padStart(4, '0')}`;
    while (existingSet.has(candidate)) {
      nextNum += 1;
      candidate = `INV-${year}-${String(nextNum).padStart(4, '0')}`;
    }
    existingSet.add(candidate);
    nextNum += 1;
    return candidate;
  };
}

export function generateOfflineInvoiceCode(
  existingInvoices?: Array<{ invoice_code?: string | null }>,
  yearOverride?: number
): string {
  return createOfflineInvoiceCodeAllocator(existingInvoices, yearOverride)();
}

export interface InsertInvoicesWithRetryOptions {
  upsertOnConflictId?: boolean;
  maxRetries?: number;
}

export interface InsertInvoicesWithRetryResult {
  codeById: Map<string, string>;
  insertedRows: Array<{ id: string; invoice_code: string }>;
}

/**
 * Ghi danh sách hóa đơn vào bảng `tuition_invoices` mà KHÔNG gửi `invoice_code` từ client,
 * để PostgreSQL `DEFAULT next_invoice_code()` tự cấp phát mã duy nhất, kèm `.select('id, invoice_code')`.
 * Tự động retry tối đa `maxRetries` (mặc định 3) lần nếu gặp lỗi `23505` trùng `invoice_code`.
 */
export async function insertInvoicesToSupabaseWithRetry<T extends Record<string, any>>(
  client: SupabaseClient,
  rows: T[],
  options?: InsertInvoicesWithRetryOptions
): Promise<InsertInvoicesWithRetryResult> {
  const codeById = new Map<string, string>();
  if (!rows || rows.length === 0) {
    return { codeById, insertedRows: [] };
  }

  const maxRetries = Math.max(1, options?.maxRetries ?? 3);
  const upsertOnConflictId = Boolean(options?.upsertOnConflictId);

  // Loại bỏ hoàn toàn invoice_code để Postgres DEFAULT next_invoice_code() tự sinh mã
  const cleanRows: Record<string, any>[] = rows.map((row) => {
    const { invoice_code: _omit, ...rest } = row;
    return rest;
  });

  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const query = upsertOnConflictId
      ? client.from('tuition_invoices').upsert(cleanRows, { onConflict: 'id' }).select('id, invoice_code')
      : client.from('tuition_invoices').insert(cleanRows).select('id, invoice_code');

    const { data, error } = await query;

    if (!error) {
      let insertedRows: Array<{ id: string; invoice_code: string }> = Array.isArray(data)
        ? data
            .filter((r: any) => r?.id && r?.invoice_code)
            .map((r: any) => ({ id: String(r.id), invoice_code: String(r.invoice_code) }))
        : [];

      for (const r of insertedRows) {
        codeById.set(r.id, r.invoice_code);
      }

      // Phòng hờ trường hợp PostgREST không trả đủ dòng vừa tạo
      const rowIds = rows.map((r) => String(r.id)).filter(Boolean);
      if (rowIds.length > 0 && codeById.size < rowIds.length) {
        const { data: refetched } = await client
          .from('tuition_invoices')
          .select('id, invoice_code')
          .in('id', rowIds);
        if (Array.isArray(refetched)) {
          for (const r of refetched) {
            if (r?.id && r?.invoice_code) {
              const idStr = String(r.id);
              const codeStr = String(r.invoice_code);
              codeById.set(idStr, codeStr);
              if (!insertedRows.some((x) => x.id === idStr)) {
                insertedRows.push({ id: idStr, invoice_code: codeStr });
              }
            }
          }
        }
      }

      return { codeById, insertedRows };
    }

    lastError = error;
    if (isInvoiceCodeDuplicateError(error) && attempt < maxRetries) {
      continue;
    }
    throw error;
  }

  throw lastError;
}
