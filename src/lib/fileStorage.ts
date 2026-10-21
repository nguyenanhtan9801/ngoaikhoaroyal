/**
 * Royal School - Resilient Zero-Auth Cloud & Local Storage Helper
 * Provides client-side image compression, Base64 conversion, Supabase Storage integration,
 * and direct file download without requiring teachers to authenticate with Google Drive.
 */

import { createClient } from '@supabase/supabase-js';

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

/**
 * Direct file download trigger in browser
 */
export function triggerFileDownload(fileName: string, dataUrlOrUrl: string) {
  try {
    const link = document.createElement('a');
    link.href = dataUrlOrUrl;
    link.download = fileName || 'minh_chung_vang_phep.jpg';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Lỗi khi tải file:', err);
    window.open(dataUrlOrUrl, '_blank');
  }
}

/**
 * Upload to Supabase Storage Bucket if connected
 */
export async function uploadToSupabaseBucket(
  supabaseUrl: string,
  anonKey: string,
  bucketName: string,
  path: string,
  base64Data: string,
  contentType = 'image/jpeg'
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  try {
    if (!supabaseUrl || !anonKey) {
      return { success: false, error: 'Chưa cấu hình Supabase URL hoặc Anon Key' };
    }

    const supabase = createClient(supabaseUrl, anonKey);

    // Convert Base64 data URI to Blob
    const base64Content = base64Data.split(',')[1] || base64Data;
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: contentType });

    const { data, error } = await supabase.storage.from(bucketName).upload(path, blob, {
      upsert: true,
      contentType,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const { data: publicData } = supabase.storage.from(bucketName).getPublicUrl(path);

    return {
      success: true,
      publicUrl: publicData?.publicUrl || '',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Lỗi khi upload lên Supabase Storage',
    };
  }
}

/**
 * Upload a file directly to the backend server (/api/upload)
 */
export async function uploadFileToServer(
  base64Data: string,
  fileName: string,
  folder: 'proofs' | 'students' = 'proofs'
): Promise<{
  success: boolean;
  url?: string;
  storedPath?: string;
  fileName?: string;
  size?: number;
  error?: string;
}> {
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
    return {
      success: true,
      url: data.url,
      storedPath: data.storedPath,
      fileName: data.fileName,
      size: data.size,
    };
  } catch (err: any) {
    console.warn('Server upload error, falling back to local base64:', err);
    return {
      success: false,
      error: err?.message || 'Không thể upload lên server',
      url: base64Data, // fallback
      storedPath: 'Local: Browser Base64 Storage',
      fileName,
    };
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
