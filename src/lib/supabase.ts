import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variable credentials
const ENV_SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const ENV_SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

let clientInstance: SupabaseClient | null = null;
let currentConfiguredUrl = '';
let currentConfiguredKey = '';

export const BUCKET_ATTENDANCE_PROOFS = 'attendance-proofs';

/**
 * Kiểm tra xem cấu hình Supabase đã được điền hợp lệ hay chưa
 */
export function isSupabaseConfigured(customUrl?: string, customKey?: string): boolean {
  const url = (customUrl || ENV_SUPABASE_URL || '').trim();
  const key = (customKey || ENV_SUPABASE_ANON_KEY || '').trim();
  return Boolean(
    url &&
    key &&
    url.startsWith('https://') &&
    url.includes('.supabase.co') &&
    key.length > 20 &&
    !url.includes('your-project-id') &&
    !key.includes('your-anon-key')
  );
}

/**
 * Lấy singleton instance của Supabase Client
 */
export function getSupabaseClient(customUrl?: string, customKey?: string): SupabaseClient | null {
  const targetUrl = (customUrl || ENV_SUPABASE_URL || '').trim();
  const targetKey = (customKey || ENV_SUPABASE_ANON_KEY || '').trim();

  if (!isSupabaseConfigured(targetUrl, targetKey)) {
    return null;
  }

  // Khởi tạo lại nếu URL hoặc Key thay đổi
  if (!clientInstance || currentConfiguredUrl !== targetUrl || currentConfiguredKey !== targetKey) {
    clientInstance = createClient(targetUrl, targetKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    currentConfiguredUrl = targetUrl;
    currentConfiguredKey = targetKey;
  }

  return clientInstance;
}

export interface ConnectionTestResult {
  connected: boolean;
  latencyMs: number;
  message: string;
  url: string;
  hasBucket: boolean;
  tablesCount?: number;
}

/**
 * Kiểm tra kết nối thực tế tới Supabase PostgreSQL & Storage Bucket
 */
export async function checkSupabaseConnection(customUrl?: string, customKey?: string): Promise<ConnectionTestResult> {
  const targetUrl = (customUrl || ENV_SUPABASE_URL || '').trim();
  const targetKey = (customKey || ENV_SUPABASE_ANON_KEY || '').trim();

  if (!isSupabaseConfigured(targetUrl, targetKey)) {
    return {
      connected: false,
      latencyMs: 0,
      message: 'Chưa điền Project URL hoặc Anon Key hợp lệ (hoặc đang dùng mẫu placeholder trong .env)',
      url: targetUrl || 'chưa cấu hình',
      hasBucket: false,
    };
  }

  const client = getSupabaseClient(targetUrl, targetKey);
  if (!client) {
    return {
      connected: false,
      latencyMs: 0,
      message: 'Không thể khởi tạo Supabase Client instance',
      url: targetUrl,
      hasBucket: false,
    };
  }

  const startTime = Date.now();
  try {
    // 1. Thử ping bảng campuses hoặc thông tin auth
    const { error: dbError } = await client
      .from('campuses')
      .select('id')
      .limit(1);

    const latencyMs = Date.now() - startTime;

    // 2. Thử kiểm tra bucket storage
    let hasBucket = false;
    try {
      const { data: buckets } = await client.storage.listBuckets();
      hasBucket = (buckets || []).some(b => b.name === BUCKET_ATTENDANCE_PROOFS || b.id === BUCKET_ATTENDANCE_PROOFS);
    } catch {
      hasBucket = false;
    }

    if (dbError && dbError.code !== 'PGRST116') {
      // Nếu bảng chưa tạo nhưng kết nối server thành công
      if (dbError.message.includes('relation "campuses" does not exist') || dbError.code === '42P01') {
        return {
          connected: true,
          latencyMs,
          message: 'Kết nối Supabase thành công! (Lưu ý: Bảng cơ sở dữ liệu chưa được khởi tạo, vui lòng chạy file SQL DDL trong SQL Editor)',
          url: targetUrl,
          hasBucket,
        };
      }
      return {
        connected: false,
        latencyMs,
        message: `Lỗi truy vấn Database: ${dbError.message}`,
        url: targetUrl,
        hasBucket,
      };
    }

    return {
      connected: true,
      latencyMs,
      message: 'Kết nối Supabase PostgreSQL & Storage thành công!',
      url: targetUrl,
      hasBucket,
    };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Date.now() - startTime,
      message: `Lỗi kết nối mạng hoặc CORS: ${err?.message || 'Không thể kết nối tới Supabase'}`,
      url: targetUrl,
      hasBucket: false,
    };
  }
}

export interface AttendanceProofMetadata {
  termId?: string;
  campusId?: string;
  classId: string;
  sessionDate: string;
  studentCode: string;
  fileName: string;
  fileType?: string;
}

export interface UploadProofResult {
  success: boolean;
  publicUrl?: string;
  storagePath?: string;
  error?: string;
}

/**
 * Tải ảnh/tệp minh chứng đơn nghỉ phép lên Supabase Storage
 * Đường dẫn chuẩn: proofs/{term_id}/{campus_id}/{class_id}/{session_date}_{student_code}_{file_name}
 */
export async function uploadAttendanceProofToSupabase(
  fileOrBase64: File | string,
  meta: AttendanceProofMetadata,
  customClient?: SupabaseClient | null
): Promise<UploadProofResult> {
  const client = customClient || getSupabaseClient();
  if (!client) {
    return {
      success: false,
      error: 'Supabase chưa được cấu hình. Vui lòng thiết lập VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY.',
    };
  }

  try {
    const cleanTerm = (meta.termId || 'term_fall_2026').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanCampus = (meta.campusId || 'pmh').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanClass = meta.classId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanDate = meta.sessionDate.replace(/[^a-zA-Z0-9_-]/g, '-');
    const cleanCode = meta.studentCode.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanName = meta.fileName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');

    // Cấu trúc đường dẫn chuẩn: proofs/{term_id}/{campus_id}/{class_id}/{session_date}_{student_code}_{file_name}
    const storagePath = `proofs/${cleanTerm}/${cleanCampus}/${cleanClass}/${cleanDate}_${cleanCode}_${cleanName}`;

    let bodyData: Blob;
    let contentType = meta.fileType || 'image/jpeg';

    if (typeof fileOrBase64 === 'string') {
      const base64Content = fileOrBase64.split(',')[1] || fileOrBase64;
      const mimeMatch = fileOrBase64.match(/data:([^;]+);base64/);
      if (mimeMatch) {
        contentType = mimeMatch[1];
      }

      const byteCharacters = atob(base64Content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      bodyData = new Blob([byteArray], { type: contentType });
    } else {
      bodyData = fileOrBase64;
      contentType = fileOrBase64.type || contentType;
    }

    // Kiểm tra dung lượng < 5MB
    if (bodyData.size > 5 * 1024 * 1024) {
      return {
        success: false,
        error: 'Tệp vượt quá dung lượng tối đa cho phép (5MB). Vui lòng nén trước khi tải lên.',
      };
    }

    const { error: uploadError } = await client.storage
      .from(BUCKET_ATTENDANCE_PROOFS)
      .upload(storagePath, bodyData, {
        upsert: true,
        contentType,
      });

    if (uploadError) {
      return {
        success: false,
        error: `Supabase Storage Upload Error: ${uploadError.message}`,
      };
    }

    const { data: publicData } = client.storage
      .from(BUCKET_ATTENDANCE_PROOFS)
      .getPublicUrl(storagePath);

    return {
      success: true,
      publicUrl: publicData.publicUrl,
      storagePath,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Lỗi khi tải tệp lên Supabase Storage',
    };
  }
}
