/**
 * Royal School - Resilient Zero-Auth Cloud & Local Storage Helper
 * Provides client-side image compression, Base64 conversion, Supabase Storage integration,
 * and direct file download without requiring teachers to authenticate with Google Drive.
 */

import { getConfiguredSupabaseClient } from './storage';

export interface CompressedFileResult {
  base64: string;
  fileName: string;
  fileType: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  compressionRatio: number; // percentage saved, e.g. 75 (%)
  width?: number;
  height?: number;
  isPdf?: boolean;
}

/**
 * Format bytes to readable string (e.g. 1.2 MB, 345 KB)
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Client-side Image Compression down to < 500KB with canvas resize
 */
export async function compressAndConvertToBase64(
  file: File,
  maxDimension = 1200,
  targetMaxKB = 450
): Promise<CompressedFileResult> {
  const originalSizeBytes = file.size;
  const fileName = file.name;
  const isPdf = file.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');

  // Handle PDF: Read directly as base64 without canvas resize
  if (isPdf) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const compressedSizeBytes = Math.round((base64.length * 3) / 4);
        resolve({
          base64,
          fileName,
          fileType: 'application/pdf',
          originalSizeBytes,
          compressedSizeBytes,
          compressionRatio: 0,
          isPdf: true,
        });
      };
      reader.onerror = () => reject(new Error('Không thể đọc file PDF'));
      reader.readAsDataURL(file);
    });
  }

  // Handle Images (JPG, PNG, WebP)
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Scale down if larger than maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Không thể khởi tạo Canvas 2D'));
        }

        // Draw white background in case of transparent PNG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Try JPEG with quality 0.82 first
        let quality = 0.82;
        let compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        let approxSize = Math.round((compressedBase64.length * 3) / 4);

        // If still > targetMaxKB (450KB), step down quality
        if (approxSize > targetMaxKB * 1024) {
          quality = 0.68;
          compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          approxSize = Math.round((compressedBase64.length * 3) / 4);
        }

        if (approxSize > targetMaxKB * 1024) {
          quality = 0.55;
          compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          approxSize = Math.round((compressedBase64.length * 3) / 4);
        }

        const ratio = Math.max(0, Math.round(((originalSizeBytes - approxSize) / originalSizeBytes) * 100));

        resolve({
          base64: compressedBase64,
          fileName,
          fileType: 'image/jpeg',
          originalSizeBytes,
          compressedSizeBytes: approxSize,
          compressionRatio: ratio,
          width,
          height,
          isPdf: false,
        });
      };
      img.onerror = () => reject(new Error('Định dạng ảnh không hợp lệ'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh'));
    reader.readAsDataURL(file);
  });
}

const signedUrlCache = new Map<string, { signedUrl: string; expiresAt: number }>();

/**
 * Kiểm tra xem chuỗi có phải đường dẫn trong bucket riêng tư ('proofs/...', 'students/...' hoặc '/uploads/...') không
 */
export function isPrivateStoragePath(pathOrUrl?: string | null): boolean {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return false;
  const trimmed = pathOrUrl.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || /^https?:\/\//i.test(trimmed)) {
    return false;
  }
  const clean = trimmed.replace(/^\/+/, '');
  return (
    clean.startsWith('proofs/') ||
    clean.startsWith('students/') ||
    clean.startsWith('uploads/proofs/') ||
    clean.startsWith('uploads/students/') ||
    clean.startsWith('attendance-proofs/')
  );
}

/**
 * Lấy signed URL (có hạn 60 phút) từ endpoint bảo vệ /api/files/sign?path=...
 */
export async function resolveSignedFileUrl(pathOrUrl?: string | null): Promise<string> {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return '';
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return '';
  if (!isPrivateStoragePath(trimmed)) {
    return trimmed;
  }

  let normalizedPath = trimmed.replace(/^\/+/, '');
  if (normalizedPath.startsWith('uploads/')) {
    normalizedPath = normalizedPath.slice('uploads/'.length);
  }
  if (normalizedPath.startsWith('attendance-proofs/')) {
    normalizedPath = normalizedPath.slice('attendance-proofs/'.length);
  }

  const cached = signedUrlCache.get(normalizedPath);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.signedUrl;
  }

  try {
    const authHeaders = await getAuthBearerHeaders();
    const res = await fetch(`/api/files/sign?path=${encodeURIComponent(normalizedPath)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...authHeaders,
      },
    });
    if (!res.ok) {
      return '';
    }
    const data = await res.json();
    if (data?.signedUrl) {
      // Cache trong 50 phút (signed URL sống 60 phút)
      signedUrlCache.set(normalizedPath, {
        signedUrl: data.signedUrl,
        expiresAt: Date.now() + 50 * 60 * 1000,
      });
      return data.signedUrl;
    }
  } catch {
    // ignore network error
  }
  return '';
}

/**
 * Direct file download trigger in browser (tự động lấy signed URL nếu là đường dẫn bucket)
 */
export async function triggerFileDownload(fileName: string, dataUrlOrUrl: string) {
  try {
    const resolvedUrl = isPrivateStoragePath(dataUrlOrUrl)
      ? await resolveSignedFileUrl(dataUrlOrUrl)
      : dataUrlOrUrl;
    if (!resolvedUrl) return;
    const link = document.createElement('a');
    link.href = resolvedUrl;
    link.download = fileName || 'minh_chung_vang_phep.jpg';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Lỗi khi tải file:', err);
  }
}

/**
 * Upload to Private Supabase Storage Bucket via Server Endpoint (/api/upload)
 */
export async function uploadToSupabaseBucket(
  _supabaseUrl: string,
  _anonKey: string,
  _bucketName: string,
  path: string,
  base64Data: string,
  _contentType = 'image/jpeg'
): Promise<{ success: boolean; publicUrl?: string; path?: string; error?: string }> {
  const folder: 'proofs' | 'students' = path.startsWith('students/') ? 'students' : 'proofs';
  const fileName = path.split('/').pop() || `file_${Date.now()}.jpg`;
  const result = await uploadFileToServer(base64Data, fileName, folder);
  return {
    success: result.success,
    publicUrl: result.path || result.url,
    path: result.path || result.url,
    error: result.error,
  };
}

/**
 * Lấy header Authorization: Bearer <access_token> từ phiên đăng nhập Supabase Auth hiện tại
 */
export async function getAuthBearerHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = getConfiguredSupabaseClient();
    if (!supabase) return {};
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (accessToken) {
      return { Authorization: `Bearer ${accessToken}` };
    }
  } catch {
    // ignore session lookup error
  }
  return {};
}

/**
 * Upload a file directly to the backend server (/api/upload -> bucket 'attendance-proofs')
 */
export async function uploadFileToServer(
  base64Data: string,
  fileName: string,
  folder: 'proofs' | 'students' = 'proofs'
): Promise<{
  success: boolean;
  path?: string;
  url?: string;
  storedPath?: string;
  fileName?: string;
  size?: number;
  error?: string;
}> {
  try {
    const authHeaders = await getAuthBearerHeaders();
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        fileData: base64Data,
        fileName,
        folder,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}: Upload failed`);
    }

    const data = await res.json();
    const bucketPath = data.path || data.url;
    return {
      success: true,
      path: bucketPath,
      url: bucketPath,
      storedPath: data.storedPath,
      fileName: data.fileName,
      size: data.size,
    };
  } catch (err: any) {
    console.warn('Server upload error:', err);
    return {
      success: false,
      error: err?.message || 'Không thể upload lên server',
      fileName,
    };
  }
}

/**
 * Lấy danh sách file minh chứng trên server (/api/files/proofs) kèm Bearer token
 */
export async function fetchServerProofFiles(): Promise<{
  files: { fileName: string; url: string; size: number; createdAt: string }[];
  error?: string;
}> {
  try {
    const authHeaders = await getAuthBearerHeaders();
    const res = await fetch('/api/files/proofs', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...authHeaders,
      },
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return { files: data.files || [] };
  } catch (err: any) {
    return { files: [], error: err?.message || 'Không thể tải danh sách tệp minh chứng' };
  }
}

/**
 * Gọi /api/chat kèm Bearer token
 */
export async function sendAuthenticatedChatMessage(payload: {
  history?: { role: string; text: string }[];
  message: string;
  enableHighThinking?: boolean;
  role?: string;
}): Promise<{ reply?: string; error?: string }> {
  try {
    const authHeaders = await getAuthBearerHeaders();
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data.error || `HTTP ${res.status}` };
    }
    return { reply: data.reply || '' };
  } catch (err: any) {
    return { error: err?.message || 'Không thể kết nối /api/chat' };
  }
}

/**
 * Gọi /api/ai-analyze kèm Bearer token
 */
export async function requestAuthenticatedAiAnalyze(payload: {
  actionType: string;
  payload: Record<string, any>;
}): Promise<{ result?: string; error?: string }> {
  try {
    const authHeaders = await getAuthBearerHeaders();
    const res = await fetch('/api/ai-analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data.error || `HTTP ${res.status}` };
    }
    return { result: data.result || '' };
  } catch (err: any) {
    return { error: err?.message || 'Không thể kết nối /api/ai-analyze' };
  }
}

/**
 * Generate a demo sample medical certificate image in Base64 for admin storage testing
 */
export function generateSampleMedicalCertificateBase64(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background Paper
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 600, 800);

  // Border & Header Band
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 560, 760);

  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(20, 20, 560, 80);

  // Header Text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BỆNH VIỆN NHI ĐỒNG 1 - TP. HỒ CHÍ MINH', 300, 50);
  ctx.font = '12px sans-serif';
  ctx.fillText('KHOA KHÁM BỆNH & CẤP CỨU NHI KHOA', 300, 75);

  // Document Title
  ctx.fillStyle = '#b91c1c';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('GIẤY XÁC NHẬN NGHỈ HỌC ĐIỀU TRỊ', 300, 140);

  // Body content
  ctx.fillStyle = '#334155';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';

  const lines = [
    'Họ và tên bệnh nhi: Nguyễn Hoàng Nam',
    'Ngày sinh: 15/08/2016 (10 tuổi) - Giới tính: Nam',
    'Trường: Trường Song Ngữ Quốc Tế Hoàng Gia (Royal School PMH)',
    'Chẩn đoán: Viêm họng cấp, sốt siêu vi (J02.9)',
    'Chỉ định y khoa: Cho phép nghỉ học tĩnh dưỡng, tránh vận động mạnh',
    'Thời gian chỉ định nghỉ: 03 ngày (kèm toa thuốc kháng sinh/hạ sốt)',
    'Lời dặn của Bác sĩ: Uống nhiều nước, bù điện giải, tái khám sau 3 ngày.',
  ];

  let y = 190;
  lines.forEach((line) => {
    ctx.fillText(line, 50, y);
    y += 35;
  });

  // Table header for medications
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(50, 460, 500, 30);
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('STT', 60, 480);
  ctx.fillText('Tên thuốc & Hàm lượng', 110, 480);
  ctx.fillText('Cách dùng', 350, 480);

  // Medications
  ctx.font = '12px sans-serif';
  ctx.fillText('1. Hapacol 250mg (Paracetamol)', 110, 515);
  ctx.fillText('1 gói x 3 lần khi sốt > 38.5°C', 350, 515);

  ctx.fillText('2. Cốm Oresol 245ml', 110, 545);
  ctx.fillText('Pha 1 gói với 200ml nước đun sôi', 350, 545);

  ctx.fillText('3. Siro Ho Prospan 100ml', 110, 575);
  ctx.fillText('5ml x 3 lần sau ăn', 350, 575);

  // Signature & Hospital Seal
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';
  ctx.font = 'italic 12px sans-serif';
  ctx.fillText('TP. Hồ Chí Minh, ngày 14 tháng 09 năm 2026', 420, 640);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('BÁC SĨ ĐIỀU TRỊ', 420, 660);

  // Red hospital stamp mockup
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(420, 715, 38, 0, 2 * Math.PI);
  ctx.stroke();

  ctx.fillStyle = '#dc2626';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('BỆNH VIỆN NHI ĐỒNG', 420, 710);
  ctx.fillText('★ ĐÃ DUYỆT ★', 420, 725);

  return canvas.toDataURL('image/jpeg', 0.85);
}
