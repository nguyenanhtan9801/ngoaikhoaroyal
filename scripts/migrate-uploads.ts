/**
 * Royal School - Script di chuyển tệp từ thư mục cục bộ uploads/ (proofs, students)
 * lên bucket riêng tư 'attendance-proofs' của Supabase Storage và cập nhật đường dẫn
 * trong các bảng attendance_records, students, parent_registrations.
 *
 * Cách chạy thủ công:
 *   npx tsx scripts/migrate-uploads.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const BUCKET_NAME = 'attendance-proofs';

const ALLOWED_EXTENSIONS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

function normalizeLegacyUploadPath(val: unknown): string | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (trimmed.startsWith('/uploads/proofs/')) {
    return trimmed.replace(/^\/uploads\//, '');
  }
  if (trimmed.startsWith('uploads/proofs/')) {
    return trimmed.replace(/^uploads\//, '');
  }
  if (trimmed.startsWith('/uploads/students/')) {
    return trimmed.replace(/^\/uploads\//, '');
  }
  if (trimmed.startsWith('uploads/students/')) {
    return trimmed.replace(/^uploads\//, '');
  }
  return null;
}

async function runMigration() {
  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://wobszxqzlalzcjcfbzhq.supabase.co'
  ).trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey || serviceRoleKey === 'YOUR_SUPABASE_SERVICE_ROLE_KEY') {
    console.error(
      '[ERROR] Vui lòng cấu hình SUPABASE_SERVICE_ROLE_KEY hợp lệ trong .env trước khi chạy script này.'
    );
    process.exit(1);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const report = {
    scannedFiles: 0,
    uploadedFiles: 0,
    failedUploads: 0,
    updatedAttendanceRows: 0,
    updatedStudentRows: 0,
    updatedRegistrationRows: 0,
    errors: [] as string[],
  };

  console.log('================================================================');
  console.log(' ROYAL SCHOOL - DI CHUYỂN TỆP UPLOADS/ LÊN SUPABASE STORAGE');
  console.log(` Bucket đích: ${BUCKET_NAME}`);
  console.log('================================================================');

  // 1. Quét và tải lên các file từ uploads/proofs và uploads/students
  const folders: Array<'proofs' | 'students'> = ['proofs', 'students'];
  for (const folder of folders) {
    const folderPath = path.join(UPLOADS_DIR, folder);
    if (!fs.existsSync(folderPath)) {
      console.log(`[INFO] Thư mục không tồn tại, bỏ qua: ${folderPath}`);
      continue;
    }

    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      const contentType = ALLOWED_EXTENSIONS[ext];
      if (!contentType) continue;

      report.scannedFiles += 1;
      const localFilePath = path.join(folderPath, entry.name);
      const storagePath = `${folder}/${entry.name}`;

      try {
        const buffer = await fs.promises.readFile(localFilePath);
        const { error: uploadError } = await supabaseAdmin.storage
          .from(BUCKET_NAME)
          .upload(storagePath, buffer, {
            contentType,
            upsert: true,
          });

        if (uploadError) {
          report.failedUploads += 1;
          const msg = `Lỗi upload ${storagePath}: ${uploadError.message}`;
          report.errors.push(msg);
          console.error(`  [✗] ${msg}`);
        } else {
          report.uploadedFiles += 1;
          console.log(`  [✓] Đã tải lên bucket: ${storagePath} (${buffer.length} bytes)`);
        }
      } catch (err: any) {
        report.failedUploads += 1;
        const msg = `Exception khi đọc/upload ${localFilePath}: ${err?.message || err}`;
        report.errors.push(msg);
        console.error(`  [✗] ${msg}`);
      }
    }
  }

  // 2. Cập nhật đường dẫn cũ /uploads/... trong bảng attendance_records
  try {
    const { data: attRows, error: attErr } = await supabaseAdmin
      .from('attendance_records')
      .select('*');

    if (!attErr && Array.isArray(attRows)) {
      for (const row of attRows) {
        const updates: Record<string, any> = {};
        for (const col of ['proof_url', 'proof_file_url', 'attachment_url']) {
          const nextPath = normalizeLegacyUploadPath(row[col]);
          if (nextPath) {
            updates[col] = nextPath;
          }
        }
        if (Object.keys(updates).length > 0 && row.id) {
          const { error: upErr } = await supabaseAdmin
            .from('attendance_records')
            .update(updates)
            .eq('id', row.id);
          if (!upErr) {
            report.updatedAttendanceRows += 1;
          } else {
            report.errors.push(`Lỗi cập nhật attendance_records (${row.id}): ${upErr.message}`);
          }
        }
      }
    }
  } catch (err: any) {
    report.errors.push(`Lỗi quét bảng attendance_records: ${err?.message || err}`);
  }

  // 3. Cập nhật đường dẫn cũ /uploads/... trong bảng students
  try {
    const { data: studentRows, error: stuErr } = await supabaseAdmin
      .from('students')
      .select('*');

    if (!stuErr && Array.isArray(studentRows)) {
      for (const row of studentRows) {
        const updates: Record<string, any> = {};
        for (const col of ['avatar_url', 'photo_url', 'photo_stored_at']) {
          const nextPath = normalizeLegacyUploadPath(row[col]);
          if (nextPath) {
            updates[col] = nextPath;
          }
        }
        if (Object.keys(updates).length > 0 && row.id) {
          const { error: upErr } = await supabaseAdmin
            .from('students')
            .update(updates)
            .eq('id', row.id);
          if (!upErr) {
            report.updatedStudentRows += 1;
          } else {
            report.errors.push(`Lỗi cập nhật students (${row.id}): ${upErr.message}`);
          }
        }
      }
    }
  } catch (err: any) {
    report.errors.push(`Lỗi quét bảng students: ${err?.message || err}`);
  }

  // 4. Cập nhật đường dẫn cũ /uploads/... trong bảng parent_registrations
  try {
    const { data: regRows, error: regErr } = await supabaseAdmin
      .from('parent_registrations')
      .select('*');

    if (!regErr && Array.isArray(regRows)) {
      for (const row of regRows) {
        const updates: Record<string, any> = {};
        for (const col of ['avatar_url', 'photo_url', 'proof_url', 'attachment_url']) {
          const nextPath = normalizeLegacyUploadPath(row[col]);
          if (nextPath) {
            updates[col] = nextPath;
          }
        }
        if (Object.keys(updates).length > 0 && row.id) {
          const { error: upErr } = await supabaseAdmin
            .from('parent_registrations')
            .update(updates)
            .eq('id', row.id);
          if (!upErr) {
            report.updatedRegistrationRows += 1;
          } else {
            report.errors.push(`Lỗi cập nhật parent_registrations (${row.id}): ${upErr.message}`);
          }
        }
      }
    }
  } catch (err: any) {
    report.errors.push(`Lỗi quét bảng parent_registrations: ${err?.message || err}`);
  }

  console.log('\n================================================================');
  console.log(' BÁO CÁO KẾT QUẢ DI CHUYỂN (MIGRATION REPORT)');
  console.log('================================================================');
  console.log(`- Tổng số tệp quét được trong uploads/        : ${report.scannedFiles}`);
  console.log(`- Số tệp đã tải lên bucket '${BUCKET_NAME}' : ${report.uploadedFiles}`);
  console.log(`- Số tệp tải lên thất bại                    : ${report.failedUploads}`);
  console.log(`- Bản ghi cập nhật trong attendance_records  : ${report.updatedAttendanceRows}`);
  console.log(`- Bản ghi cập nhật trong students            : ${report.updatedStudentRows}`);
  console.log(`- Bản ghi cập nhật trong parent_registrations: ${report.updatedRegistrationRows}`);
  if (report.errors.length > 0) {
    console.log('\nChi tiết lỗi:');
    for (const e of report.errors) {
      console.log(`  * ${e}`);
    }
  }
  console.log('================================================================');
}

runMigration().catch((err) => {
  console.error('[FATAL] Lỗi thực thi script migrate-uploads:', err);
  process.exit(1);
});
