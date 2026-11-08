import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

function getPort(): number {
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--port' && process.argv[i + 1]) {
      return Number(process.argv[i + 1]);
    }
    if (process.argv[i].startsWith('--port=')) {
      return Number(process.argv[i].split('=')[1]);
    }
  }
  if (process.env.PORT) {
    return Number(process.env.PORT);
  }
  return 3000;
}

const PORT = getPort();

// Internal Data Directory (cho nhật ký kiểm toán nội bộ)
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ADMIN_AUDIT_LOG_FILE = path.join(DATA_DIR, 'admin_audit.log');

// Di chuyển và xóa file admin_audit.log cũ trong thư mục uploads (nếu có) để không bao giờ tồn tại trong uploads
const legacyUploadsAuditLog = path.join(UPLOADS_DIR, 'admin_audit.log');
if (fs.existsSync(legacyUploadsAuditLog)) {
  try {
    const legacyContent = fs.readFileSync(legacyUploadsAuditLog, 'utf8');
    if (legacyContent) {
      fs.appendFileSync(ADMIN_AUDIT_LOG_FILE, legacyContent, 'utf8');
    }
    fs.unlinkSync(legacyUploadsAuditLog);
  } catch {
    // ignore cleanup error
  }
}

app.set('trust proxy', 1);
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// Bỏ hoàn toàn express.static cho /uploads: mọi yêu cầu GET /uploads/... đều trả về 404
app.use('/uploads', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

function getClientIpFromReq(req: Request): string {
  return String(req.ip || 'unknown').replace(/^::ffff:/, '') || 'unknown';
}

app.get('/api/whoami', (req: Request, res: Response) => {
  const ip = getClientIpFromReq(req);
  res.json({ ip });
});

// ============================================================================
// SUPABASE ADMIN & AUTH MIDDLEWARE (Server-Side with SUPABASE_SERVICE_ROLE_KEY)
// ============================================================================
const DEFAULT_SERVER_SUPABASE_URL = 'https://deuuzrjpfcabfclwaqph.supabase.co';
const DEFAULT_SERVER_SUPABASE_KEY = 'sb_publishable_SHwnK37LokxsP9zVNFSf9Q_qCMxjlat';

const VALID_USER_ROLES = new Set<string>([
  'super_admin',
  'campus_manager',
  'academic',
  'admissions',
  'accountant',
  'teacher',
  'academic_accountant',
  'academic_admissions',
  'academic_staff',
  'admissions_staff',
]);
const VALID_USER_STATUSES = new Set<string>(['active', 'locked', 'inactive']);
const VALID_CAMPUS_IDS = new Set<string>(['all', 'pmh', 'pl', 'camp_pmh', 'camp_pl']);

// Rate limiter: tối đa 10 yêu cầu / phút / IP cho các endpoint quản trị
const ADMIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const ADMIN_RATE_LIMIT_MAX_REQUESTS = 10;
const adminRateLimitMap = new Map<string, number[]>();

// Rate limiter theo người dùng cho các endpoint xác thực (/api/upload, /api/files/proofs, /api/chat, /api/ai-analyze)
const USER_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const USER_RATE_LIMIT_MAX_REQUESTS = 30;
const userRateLimitMap = new Map<string, number[]>();

function checkAdminRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - ADMIN_RATE_LIMIT_WINDOW_MS;
  const timestamps = (adminRateLimitMap.get(ip) || []).filter(ts => ts > cutoff);
  if (timestamps.length >= ADMIN_RATE_LIMIT_MAX_REQUESTS) {
    const oldest = timestamps[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + ADMIN_RATE_LIMIT_WINDOW_MS - now) / 1000));
    adminRateLimitMap.set(ip, timestamps);
    return { allowed: false, retryAfterSec };
  }
  timestamps.push(now);
  adminRateLimitMap.set(ip, timestamps);
  return { allowed: true, retryAfterSec: 0 };
}

function checkUserRateLimit(
  userKey: string,
  maxRequests = USER_RATE_LIMIT_MAX_REQUESTS
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - USER_RATE_LIMIT_WINDOW_MS;
  const timestamps = (userRateLimitMap.get(userKey) || []).filter(ts => ts > cutoff);
  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + USER_RATE_LIMIT_WINDOW_MS - now) / 1000));
    userRateLimitMap.set(userKey, timestamps);
    return { allowed: false, retryAfterSec };
  }
  timestamps.push(now);
  userRateLimitMap.set(userKey, timestamps);
  return { allowed: true, retryAfterSec: 0 };
}

async function recordAdminEndpointAudit(params: {
  supabaseAdmin?: SupabaseClient | null;
  endpoint: string;
  actionCode: string;
  ip: string;
  callerId?: string;
  callerUsername?: string;
  callerFullName?: string;
  callerRole?: string;
  callerCampusId?: string;
  category?: 'AUTH' | 'ACADEMIC' | 'FINANCE' | 'SYSTEM';
  moduleName?: string;
  targetId?: string;
  status: 'success' | 'failed';
  description: string;
  details?: Record<string, any>;
}): Promise<void> {
  const timestamp = new Date().toISOString();
  const auditEntry = {
    id: `srv_aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp,
    endpoint: params.endpoint,
    action_code: params.actionCode,
    ip_address: params.ip,
    actor_id: params.callerId || 'anonymous',
    actor_username: params.callerUsername || 'unknown',
    actor_name: params.callerFullName || 'Unknown',
    actor_role: params.callerRole || 'super_admin',
    actor_campus: params.callerCampusId || 'all',
    target_id: params.targetId || '',
    status: params.status,
    description: params.description,
    details: params.details || {},
  };

  try {
    fs.appendFileSync(ADMIN_AUDIT_LOG_FILE, JSON.stringify(auditEntry) + '\n', 'utf8');
  } catch {
    // ignore file write errors
  }

  if (params.supabaseAdmin) {
    try {
      await params.supabaseAdmin.from('audit_logs').insert({
        id: auditEntry.id,
        timestamp: auditEntry.timestamp,
        actor_id: auditEntry.actor_id,
        actor_username: auditEntry.actor_username,
        actor_name: auditEntry.actor_name,
        actor_role: auditEntry.actor_role,
        actor_campus: auditEntry.actor_campus,
        ip_address: auditEntry.ip_address,
        action_code: auditEntry.action_code,
        category: params.category || 'SYSTEM',
        module: params.moduleName || 'Quản Trị Tài Khoản (Server API)',
        target_id: auditEntry.target_id,
        description: auditEntry.description,
        details: {
          status: auditEntry.status,
          endpoint: auditEntry.endpoint,
          ...auditEntry.details,
        },
      });
    } catch {
      // ignore if audit_logs table is not present or has different schema
    }
  }
}

function sanitizeServerSupabaseUrl(rawInput?: string | null): string {
  if (!rawInput || typeof rawInput !== 'string') return '';
  let cleaned = rawInput.trim();
  const markdownMatch =
    cleaned.match(/\((https?:\/\/[^)]+)\)/) || cleaned.match(/\[(https?:\/\/[^\]]+)\]/);
  if (markdownMatch && markdownMatch[1]) {
    cleaned = markdownMatch[1].trim();
  }
  cleaned = cleaned.replace(/^['"`]+|['"`]+$/g, '').trim();
  let prev = '';
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned
      .replace(/\/+$/, '')
      .replace(/\/rest\/v1(\/.*)?$/i, '')
      .replace(/\/realtime\/v1(\/.*)?$/i, '')
      .replace(/\/auth\/v1(\/.*)?$/i, '')
      .replace(/\/+$/, '');
  }
  return cleaned;
}

export const isLikelyValidSupabaseKey = (key: string): boolean => {
  if (!key || typeof key !== 'string') return false;
  const clean = key.trim();
  if (!clean || clean.includes('wobszxqzlalzcjcfbzhq')) return false;
  return (
    clean.startsWith('eyJ') ||
    clean.startsWith('sb_publishable_') ||
    clean.startsWith('sb_secret_')
  );
};

function getServerSupabaseAdmin(): SupabaseClient | null {
  const rawUrl =
    sanitizeServerSupabaseUrl(process.env.VITE_SUPABASE_URL) ||
    sanitizeServerSupabaseUrl(process.env.SUPABASE_URL) ||
    DEFAULT_SERVER_SUPABASE_URL;

  const supabaseUrl = rawUrl.toLowerCase().includes('wobszxqzlalzcjcfbzhq')
    ? DEFAULT_SERVER_SUPABASE_URL
    : rawUrl;

  const serviceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    DEFAULT_SERVER_SUPABASE_KEY
  ).trim();

  if (!supabaseUrl || !isLikelyValidSupabaseKey(serviceRoleKey)) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

interface AuthenticatedCaller {
  supabaseAdmin: SupabaseClient;
  callerId: string;
  callerUsername: string;
  callerFullName: string;
  callerRole: string;
  callerCampusId: string;
  clientIp: string;
}

interface AuthenticatedRequest extends Request {
  authUser?: AuthenticatedCaller;
}

async function authenticateCallerRequest(
  req: Request,
  res: Response,
  options?: {
    endpointName?: string;
    actionCode?: string;
    auditOnFailure?: boolean;
    maxRequestsPerMinute?: number;
  }
): Promise<AuthenticatedCaller | null> {
  const clientIp = getClientIpFromReq(req);
  const endpointName = options?.endpointName || req.originalUrl || req.path;
  const actionCode = options?.actionCode || 'API_AUTH_CHECK';
  const auditOnFailure = Boolean(options?.auditOnFailure);

  const supabaseAdmin = getServerSupabaseAdmin();
  const authHeader = String(req.headers.authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    if (auditOnFailure) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: endpointName,
        actionCode,
        ip: clientIp,
        status: 'failed',
        description: `Từ chối gọi ${endpointName}: Thiếu Bearer token xác thực`,
      });
    }
    res.status(401).json({ error: 'Thiếu Bearer token xác thực.' });
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    if (auditOnFailure) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: endpointName,
        actionCode,
        ip: clientIp,
        status: 'failed',
        description: `Từ chối gọi ${endpointName}: Bearer token rỗng`,
      });
    }
    res.status(401).json({ error: 'Bearer token không hợp lệ.' });
    return null;
  }

  if (!supabaseAdmin) {
    if (auditOnFailure) {
      await recordAdminEndpointAudit({
        endpoint: endpointName,
        actionCode,
        ip: clientIp,
        status: 'failed',
        description: `Lỗi gọi ${endpointName}: Máy chủ chưa được cấu hình SUPABASE_SERVICE_ROLE_KEY`,
      });
    }
    res.status(500).json({
      error: 'Máy chủ chưa được cấu hình SUPABASE_SERVICE_ROLE_KEY.',
    });
    return null;
  }

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    if (auditOnFailure) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: endpointName,
        actionCode,
        ip: clientIp,
        status: 'failed',
        description: `Từ chối gọi ${endpointName}: Token không hợp lệ hoặc đã hết hạn`,
      });
    }
    res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    return null;
  }

  const { data: callerProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, full_name, role, campus_id, status')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !callerProfile || callerProfile.status !== 'active') {
    if (auditOnFailure) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: endpointName,
        actionCode,
        ip: clientIp,
        callerId: userData.user.id,
        callerUsername: callerProfile?.username || userData.user.email || 'unknown',
        callerFullName: callerProfile?.full_name || 'Unknown',
        status: 'failed',
        description: `Từ chối gọi ${endpointName}: Hồ sơ người dùng không tồn tại hoặc không ở trạng thái active`,
      });
    }
    res.status(401).json({
      error: 'Tài khoản không hợp lệ hoặc đã bị khóa / ngưng hoạt động.',
    });
    return null;
  }

  const userRateCheck = checkUserRateLimit(
    `${userData.user.id}:${endpointName}`,
    options?.maxRequestsPerMinute ?? USER_RATE_LIMIT_MAX_REQUESTS
  );
  if (!userRateCheck.allowed) {
    res.setHeader('Retry-After', String(userRateCheck.retryAfterSec));
    res.status(429).json({
      error: `Tài khoản đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ${userRateCheck.retryAfterSec} giây.`,
    });
    return null;
  }

  const caller: AuthenticatedCaller = {
    supabaseAdmin,
    callerId: userData.user.id,
    callerUsername: String(callerProfile.username || userData.user.email || 'user'),
    callerFullName: String(callerProfile.full_name || callerProfile.username || 'User'),
    callerRole: String(callerProfile.role || ''),
    callerCampusId: String(callerProfile.campus_id || 'all'),
    clientIp,
  };

  (req as AuthenticatedRequest).authUser = caller;
  return caller;
}

/**
 * Middleware xác thực dùng chung requireAuth:
 * Kiểm tra Bearer token, supabaseAdmin.auth.getUser, profiles.status = 'active' và giới hạn tần suất theo người dùng.
 */
async function requireAuth(
  req: Request,
  res: Response,
  next: express.NextFunction
): Promise<void> {
  const caller = await authenticateCallerRequest(req, res, {
    endpointName: req.path,
    actionCode: 'AUTH_PROTECTED_ENDPOINT',
    auditOnFailure: false,
    maxRequestsPerMinute: USER_RATE_LIMIT_MAX_REQUESTS,
  });
  if (!caller) return;
  next();
}

function normalizeCampusCodeForServer(raw?: string): string {
  const clean = String(raw || 'all').trim().toLowerCase();
  if (clean === 'camp_pmh' || clean === 'pmh') return 'pmh';
  if (clean === 'camp_pl' || clean === 'pl') return 'pl';
  return clean || 'all';
}

/**
 * Các endpoint /api/admin/* BẮT BUỘC có service_role / secret key thật.
 * Nếu thiếu, getServerSupabaseAdmin() sẽ lùi về publishable key (quyền anon) khiến mọi thao tác ghi bị RLS chặn.
 */
function hasRealServiceRoleKey(): boolean {
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  return isLikelyValidSupabaseKey(key) && !key.startsWith('sb_publishable_');
}

async function verifySuperAdminRequest(
  req: Request,
  res: Response,
  endpointName: string,
  actionCode: string,
  options?: { allowCampusManager?: boolean }
): Promise<{
  supabaseAdmin: SupabaseClient;
  callerId: string;
  callerUsername: string;
  callerFullName: string;
  callerRole: string;
  callerCampusId: string;
  clientIp: string;
} | null> {
  const clientIp = getClientIpFromReq(req);
  if (!hasRealServiceRoleKey()) {
    console.error(`[${endpointName}] Thiếu SUPABASE_SERVICE_ROLE_KEY (hoặc SUPABASE_SECRET_KEY) trong biến môi trường của máy chủ.`);
    res.status(500).json({
      error:
        'Máy chủ chưa được cấu hình SUPABASE_SERVICE_ROLE_KEY nên không thể tạo/sửa tài khoản. Hãy thêm khóa này vào biến môi trường của máy chủ rồi khởi động lại.',
    });
    return null;
  }
  const rateCheck = checkAdminRateLimit(clientIp);
  if (!rateCheck.allowed) {
    await recordAdminEndpointAudit({
      endpoint: endpointName,
      actionCode,
      ip: clientIp,
      status: 'failed',
      description: `Vượt giới hạn tốc độ (Rate Limit 10 yêu cầu/phút/IP) tại ${endpointName}`,
    });
    res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
    res.status(429).json({
      error: `Quá nhiều yêu cầu từ địa chỉ IP này (tối đa 10 yêu cầu/phút). Vui lòng thử lại sau ${rateCheck.retryAfterSec} giây.`,
    });
    return null;
  }

  const caller = await authenticateCallerRequest(req, res, {
    endpointName,
    actionCode,
    auditOnFailure: true,
    maxRequestsPerMinute: ADMIN_RATE_LIMIT_MAX_REQUESTS,
  });
  if (!caller) return null;

  const isSuperAdmin = caller.callerRole === 'super_admin';
  const isAllowedCampusManager = Boolean(
    options?.allowCampusManager && caller.callerRole === 'campus_manager'
  );

  if (!isSuperAdmin && !isAllowedCampusManager) {
    await recordAdminEndpointAudit({
      supabaseAdmin: caller.supabaseAdmin,
      endpoint: endpointName,
      actionCode,
      ip: clientIp,
      callerId: caller.callerId,
      callerUsername: caller.callerUsername,
      callerFullName: caller.callerFullName,
      status: 'failed',
      description: `Từ chối phân quyền tại ${endpointName}: Người gọi (${caller.callerRole}) không đủ quyền`,
    });
    res.status(403).json({
      error: 'Từ chối truy cập: Chỉ tài khoản Super Admin hoặc Quản lý cơ sở (trong phạm vi giáo viên cơ sở mình) mới có quyền thực hiện thao tác này.',
    });
    return null;
  }

  return {
    supabaseAdmin: caller.supabaseAdmin,
    callerId: caller.callerId,
    callerUsername: caller.callerUsername,
    callerFullName: caller.callerFullName,
    callerRole: caller.callerRole,
    callerCampusId: caller.callerCampusId,
    clientIp: caller.clientIp,
  };
}

async function resolveTargetUserUuid(
  supabaseAdmin: SupabaseClient,
  rawId?: string,
  rawUsername?: string,
  rawEmail?: string
): Promise<string> {
  const candidate = String(rawId || '').trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate);
  if (isUuid) return candidate;

  const cleanUname = String(rawUsername || '').trim().toLowerCase();
  if (cleanUname) {
    const { data: foundProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('username', cleanUname)
      .maybeSingle();
    if (foundProfile?.id) {
      return String(foundProfile.id);
    }
  }

  if (rawEmail || cleanUname) {
    const cleanEmail = String(rawEmail || '').trim().toLowerCase();
    const { data: resolvedEmail } = await supabaseAdmin.rpc('resolve_login_email', {
      p_identifier: cleanUname || cleanEmail,
    });
    const lookupEmail = String(resolvedEmail || cleanEmail).trim().toLowerCase();
    if (lookupEmail) {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const matchedAuthUser = listData?.users?.find(
        u => String(u.email || '').toLowerCase() === lookupEmail
      );
      if (matchedAuthUser?.id) {
        return matchedAuthUser.id;
      }
    }
  }

  return '';
}

async function isTargetLastActiveSuperAdminOnServer(
  supabaseAdmin: SupabaseClient,
  targetUserId: string
): Promise<{ isLastActiveSuperAdmin: boolean; targetProfile: Record<string, any> | null }> {
  const { data: targetProfile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', targetUserId)
    .maybeSingle();

  if (
    !targetProfile ||
    targetProfile.role !== 'super_admin' ||
    String(targetProfile.status || '').toLowerCase() !== 'active'
  ) {
    return { isLastActiveSuperAdmin: false, targetProfile: targetProfile || null };
  }

  const { data: activeSuperAdmins } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'super_admin')
    .eq('status', 'active');

  const otherActiveAdmins = (activeSuperAdmins || []).filter(
    row => String(row.id) !== String(targetUserId)
  );

  return {
    isLastActiveSuperAdmin: otherActiveAdmins.length === 0,
    targetProfile,
  };
}

async function validateLinkedTeacherIdOnServer(
  supabaseAdmin: SupabaseClient,
  linkedTeacherId: string,
  excludeUserId?: string
): Promise<{ ok: boolean; error?: string; statusCode?: number; teacherCampus?: string }> {
  const cleanTeacherId = String(linkedTeacherId || '').trim();
  if (!cleanTeacherId) {
    return { ok: false, error: 'Thiếu mã hồ sơ giáo viên (linked_teacher_id).', statusCode: 400 };
  }

  const { data: teacherRow, error: teacherErr } = await supabaseAdmin
    .from('teachers')
    .select('id,campus_id,name')
    .eq('id', cleanTeacherId)
    .maybeSingle();

  if (teacherErr) {
    return {
      ok: false,
      error: `Không thể kiểm tra hồ sơ giáo viên (${cleanTeacherId}): ${teacherErr.message}`,
      statusCode: 400,
    };
  }

  if (!teacherRow?.id) {
    return {
      ok: false,
      error: `Không tìm thấy hồ sơ giáo viên tương ứng với mã "${cleanTeacherId}" trên bảng teachers.`,
      statusCode: 400,
    };
  }

  const { data: existingProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id,username,full_name,linked_teacher_id')
    .eq('linked_teacher_id', cleanTeacherId);

  const conflictProfile = (existingProfiles || []).find(
    p => !excludeUserId || String(p.id) !== String(excludeUserId)
  );

  if (conflictProfile) {
    return {
      ok: false,
      error: `Giáo viên này đã có tài khoản đăng nhập (@${conflictProfile.username || conflictProfile.id}). Mỗi giáo viên chỉ được phép liên kết tối đa 1 tài khoản.`,
      statusCode: 409,
    };
  }

  return {
    ok: true,
    teacherCampus: normalizeCampusCodeForServer(teacherRow.campus_id),
  };
}

app.post('/api/admin/create-user', async (req: Request, res: Response) => {
  try {
    const verified = await verifySuperAdminRequest(
      req,
      res,
      '/api/admin/create-user',
      'ADMIN_API_CREATE_USER',
      { allowCampusManager: true }
    );
    if (!verified) return;
    const {
      supabaseAdmin,
      callerId,
      callerUsername,
      callerFullName,
      callerRole,
      callerCampusId,
      clientIp,
    } = verified;

    const {
      username,
      email,
      password,
      full_name,
      phone,
      department,
      campus_id,
      role,
      status,
      linked_teacher_id,
      permissions,
    } = req.body || {};

    const cleanUsername = String(username || '').trim().toLowerCase();
    const cleanEmail = String(email || (cleanUsername ? `${cleanUsername}@royal.edu.vn` : ''))
      .trim()
      .toLowerCase();
    const cleanFullName = String(full_name || '').trim();
    const cleanPassword = String(password || '').trim();

    if (!cleanUsername || !cleanEmail || !cleanFullName) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/create-user',
        actionCode: 'ADMIN_API_CREATE_USER',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: cleanUsername,
        status: 'failed',
        description: 'Tạo người dùng thất bại: Thiếu username, email hoặc họ tên',
      });
      res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ username, email và họ tên.' });
      return;
    }

    if (cleanPassword.length < 10) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/create-user',
        actionCode: 'ADMIN_API_CREATE_USER',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: cleanUsername,
        status: 'failed',
        description: 'Tạo người dùng thất bại: Mật khẩu dưới 10 ký tự',
      });
      res.status(400).json({ error: 'Mật khẩu khởi tạo bắt buộc phải có tối thiểu 10 ký tự.' });
      return;
    }

    const rawRole = role !== undefined ? String(role).trim() : 'academic';
    const rawStatus = status !== undefined ? String(status).trim().toLowerCase() : 'active';
    const rawCampus = campus_id !== undefined ? String(campus_id).trim().toLowerCase() : 'all';

    if (!VALID_USER_ROLES.has(rawRole)) {
      res.status(400).json({ error: `Vai trò (role) không hợp lệ: "${rawRole}".` });
      return;
    }
    if (!VALID_USER_STATUSES.has(rawStatus)) {
      res.status(400).json({
        error: `Trạng thái (status) không hợp lệ: "${rawStatus}". Chỉ chấp nhận active, locked hoặc inactive.`,
      });
      return;
    }
    if (!VALID_CAMPUS_IDS.has(rawCampus)) {
      res.status(400).json({
        error: `Cơ sở (campus_id) không hợp lệ: "${rawCampus}". Chỉ chấp nhận all, pmh, pl, camp_pmh hoặc camp_pl.`,
      });
      return;
    }

    const normalizedCampus =
      rawCampus === 'camp_pmh' ? 'pmh' : rawCampus === 'camp_pl' ? 'pl' : rawCampus;
    const cleanRole = rawRole;
    const cleanStatus = rawStatus;
    const cleanLinkedTeacherId = linked_teacher_id ? String(linked_teacher_id).trim() : null;

    if (callerRole === 'campus_manager') {
      const callerNormCampus = normalizeCampusCodeForServer(callerCampusId);
      if (cleanRole !== 'teacher') {
        res.status(403).json({
          error: 'Quản lý cơ sở chỉ được phép tạo tài khoản đăng nhập cho Giáo viên thuộc cơ sở của mình.',
        });
        return;
      }
      if (callerNormCampus !== 'all' && normalizedCampus !== callerNormCampus) {
        res.status(403).json({
          error: 'Quản lý cơ sở chỉ được phép tạo tài khoản cho giáo viên thuộc cơ sở của mình.',
        });
        return;
      }
    }

    if (cleanRole === 'teacher' && !cleanLinkedTeacherId) {
      res.status(400).json({
        error: 'Tài khoản có vai trò Giáo viên (teacher) bắt buộc phải gắn với hồ sơ giáo viên (linked_teacher_id).',
      });
      return;
    }

    if (cleanLinkedTeacherId) {
      const linkCheck = await validateLinkedTeacherIdOnServer(supabaseAdmin, cleanLinkedTeacherId);
      if (!linkCheck.ok) {
        res.status(linkCheck.statusCode || 400).json({ error: linkCheck.error });
        return;
      }
      if (
        callerRole === 'campus_manager' &&
        normalizeCampusCodeForServer(callerCampusId) !== 'all' &&
        linkCheck.teacherCampus &&
        linkCheck.teacherCampus !== normalizeCampusCodeForServer(callerCampusId)
      ) {
        res.status(403).json({
          error: 'Không thể tạo tài khoản cho giáo viên thuộc cơ sở khác.',
        });
        return;
      }
    }

    const { data: createdAuth, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: cleanPassword,
      email_confirm: true,
      user_metadata: {
        username: cleanUsername,
        full_name: cleanFullName,
        role: cleanRole,
        campus_id: normalizedCampus,
        linked_teacher_id: cleanLinkedTeacherId,
      },
    });

    if (createAuthError || !createdAuth?.user) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/create-user',
        actionCode: 'ADMIN_API_CREATE_USER',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: cleanUsername,
        status: 'failed',
        description: `Lỗi tạo Auth user cho ${cleanUsername}: ${createAuthError?.message || 'Unknown'}`,
      });
      res.status(400).json({
        error: createAuthError?.message || 'Không thể tạo người dùng trên Supabase Auth.',
      });
      return;
    }

    const profileRow: Record<string, any> = {
      id: createdAuth.user.id,
      username: cleanUsername,
      full_name: cleanFullName,
      role: cleanRole,
      campus_id: normalizedCampus,
      status: cleanStatus,
      permissions: permissions && typeof permissions === 'object' ? permissions : {},
      linked_teacher_id: cleanLinkedTeacherId,
    };

    const { error: profileUpsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(profileRow, { onConflict: 'id' });

    if (profileUpsertError) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/create-user',
        actionCode: 'ADMIN_API_CREATE_USER',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: createdAuth.user.id,
        status: 'failed',
        description: `Đã tạo Auth user nhưng lỗi ghi profiles cho ${cleanUsername}: ${profileUpsertError.message}`,
      });
      res.status(500).json({
        error: 'Đã tạo Auth user nhưng lỗi ghi bảng profiles: ' + profileUpsertError.message,
      });
      return;
    }

    if (cleanStatus === 'locked' || cleanStatus === 'inactive') {
      await supabaseAdmin.auth.admin.updateUserById(createdAuth.user.id, {
        ban_duration: '876000h',
      });
    }

    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/admin/create-user',
      actionCode: 'ADMIN_API_CREATE_USER',
      ip: clientIp,
      callerId,
      callerUsername,
      callerFullName,
      targetId: createdAuth.user.id,
      status: 'success',
      description: `${callerFullName} (@${callerUsername}) đã tạo tài khoản mới ${cleanUsername} (${cleanFullName}, vai trò: ${cleanRole})`,
      details: {
        created_user_id: createdAuth.user.id,
        username: cleanUsername,
        email: cleanEmail,
        role: cleanRole,
        campus_id: normalizedCampus,
        status: cleanStatus,
        linked_teacher_id: cleanLinkedTeacherId,
      },
    });

    res.json({
      success: true,
      user: {
        ...profileRow,
        email: cleanEmail,
        phone: String(phone || '').trim(),
        department: String(department || '').trim(),
        linked_teacher_id: cleanLinkedTeacherId,
      },
    });
  } catch (err: any) {
    console.error('[Admin Create User Error]:', err);
    res.status(500).json({ error: err?.message || 'Lỗi máy chủ khi tạo người dùng mới.' });
  }
});

app.post('/api/admin/reset-password', async (req: Request, res: Response) => {
  try {
    const verified = await verifySuperAdminRequest(
      req,
      res,
      '/api/admin/reset-password',
      'ADMIN_API_RESET_PASSWORD',
      { allowCampusManager: true }
    );
    if (!verified) return;
    const {
      supabaseAdmin,
      callerId,
      callerUsername,
      callerFullName,
      callerRole,
      callerCampusId,
      clientIp,
    } = verified;

    const { id, userId, username, email, newPassword, password } = req.body || {};
    const cleanPassword = String(newPassword || password || '').trim();

    if (cleanPassword.length < 10) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/reset-password',
        actionCode: 'ADMIN_API_RESET_PASSWORD',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: String(id || userId || username || ''),
        status: 'failed',
        description: 'Đặt lại mật khẩu thất bại: Mật khẩu dưới 10 ký tự',
      });
      res.status(400).json({ error: 'Mật khẩu đặt lại bắt buộc phải có tối thiểu 10 ký tự.' });
      return;
    }

    const targetUserId = await resolveTargetUserUuid(
      supabaseAdmin,
      String(id || userId || ''),
      username,
      email
    );

    if (!targetUserId) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/reset-password',
        actionCode: 'ADMIN_API_RESET_PASSWORD',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: String(id || userId || username || ''),
        status: 'failed',
        description: 'Đặt lại mật khẩu thất bại: Không tìm thấy ID người dùng trên Supabase Auth / profiles',
      });
      res.status(404).json({ error: 'Không tìm thấy ID người dùng trên Supabase Auth / profiles.' });
      return;
    }

    if (callerRole === 'campus_manager') {
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('role,campus_id')
        .eq('id', targetUserId)
        .maybeSingle();
      const callerNormCampus = normalizeCampusCodeForServer(callerCampusId);
      const targetNormCampus = normalizeCampusCodeForServer(targetProfile?.campus_id);
      if (
        !targetProfile ||
        targetProfile.role !== 'teacher' ||
        (callerNormCampus !== 'all' && targetNormCampus !== callerNormCampus)
      ) {
        res.status(403).json({
          error: 'Quản lý cơ sở chỉ được đặt lại mật khẩu cho tài khoản Giáo viên thuộc cơ sở của mình.',
        });
        return;
      }
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
      password: cleanPassword,
    });

    if (updateError) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/reset-password',
        actionCode: 'ADMIN_API_RESET_PASSWORD',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: targetUserId,
        status: 'failed',
        description: `Đặt lại mật khẩu thất bại cho user ${targetUserId}: ${updateError.message}`,
      });
      res.status(400).json({
        error: updateError.message || 'Không thể đặt lại mật khẩu trên Supabase Auth.',
      });
      return;
    }

    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/admin/reset-password',
      actionCode: 'ADMIN_API_RESET_PASSWORD',
      ip: clientIp,
      callerId,
      callerUsername,
      callerFullName,
      targetId: targetUserId,
      status: 'success',
      description: `${callerFullName} (@${callerUsername}) đã đặt lại mật khẩu cho user ID ${targetUserId}${username ? ` (@${username})` : ''}`,
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Admin Reset Password Error]:', err);
    res.status(500).json({ error: err?.message || 'Lỗi máy chủ khi đặt lại mật khẩu.' });
  }
});

app.post('/api/admin/update-user', async (req: Request, res: Response) => {
  try {
    const verified = await verifySuperAdminRequest(
      req,
      res,
      '/api/admin/update-user',
      'ADMIN_API_UPDATE_USER',
      { allowCampusManager: true }
    );
    if (!verified) return;
    const {
      supabaseAdmin,
      callerId,
      callerUsername,
      callerFullName,
      callerRole,
      callerCampusId,
      clientIp,
    } = verified;

    const {
      id,
      userId,
      username,
      email,
      full_name,
      role,
      campus_id,
      status,
      linked_teacher_id,
      permissions,
    } = req.body || {};

    if (role !== undefined && !VALID_USER_ROLES.has(String(role).trim())) {
      res.status(400).json({ error: `Vai trò (role) không hợp lệ: "${String(role)}".` });
      return;
    }
    if (status !== undefined && !VALID_USER_STATUSES.has(String(status).trim().toLowerCase())) {
      res.status(400).json({
        error: `Trạng thái (status) không hợp lệ: "${String(status)}". Chỉ chấp nhận active, locked hoặc inactive.`,
      });
      return;
    }
    if (campus_id !== undefined && !VALID_CAMPUS_IDS.has(String(campus_id).trim().toLowerCase())) {
      res.status(400).json({
        error: `Cơ sở (campus_id) không hợp lệ: "${String(campus_id)}". Chỉ chấp nhận all, pmh, pl, camp_pmh hoặc camp_pl.`,
      });
      return;
    }

    const targetUserId = await resolveTargetUserUuid(
      supabaseAdmin,
      String(id || userId || ''),
      username,
      email
    );

    if (!targetUserId) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/update-user',
        actionCode: 'ADMIN_API_UPDATE_USER',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: String(id || userId || username || ''),
        status: 'failed',
        description: 'Cập nhật người dùng thất bại: Không tìm thấy ID người dùng trên bảng profiles',
      });
      res.status(404).json({ error: 'Không tìm thấy hồ sơ người dùng trên bảng profiles.' });
      return;
    }

    const { isLastActiveSuperAdmin, targetProfile } = await isTargetLastActiveSuperAdminOnServer(
      supabaseAdmin,
      targetUserId
    );

    if (!targetProfile) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/update-user',
        actionCode: 'ADMIN_API_UPDATE_USER',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: targetUserId,
        status: 'failed',
        description: `Cập nhật người dùng thất bại: Không tìm thấy bản ghi profiles cho ID ${targetUserId}`,
      });
      res.status(404).json({ error: 'Không tìm thấy bản ghi profiles của người dùng này.' });
      return;
    }

    const nextRole = role !== undefined ? String(role).trim() : String(targetProfile.role || '');
    const nextStatus =
      status !== undefined
        ? String(status).trim().toLowerCase()
        : String(targetProfile.status || 'active').toLowerCase();

    if (callerRole === 'campus_manager') {
      const callerNormCampus = normalizeCampusCodeForServer(callerCampusId);
      const targetNormCampus = normalizeCampusCodeForServer(targetProfile.campus_id);
      if (
        targetProfile.role !== 'teacher' ||
        nextRole !== 'teacher' ||
        (callerNormCampus !== 'all' && targetNormCampus !== callerNormCampus)
      ) {
        res.status(403).json({
          error: 'Quản lý cơ sở chỉ được phép cập nhật tài khoản Giáo viên thuộc cơ sở của mình.',
        });
        return;
      }
    }

    const nextLinkedTeacherId =
      linked_teacher_id !== undefined
        ? linked_teacher_id
          ? String(linked_teacher_id).trim()
          : null
        : targetProfile.linked_teacher_id || null;

    if (nextRole === 'teacher' && !nextLinkedTeacherId) {
      res.status(400).json({
        error: 'Tài khoản có vai trò Giáo viên (teacher) bắt buộc phải gắn với hồ sơ giáo viên (linked_teacher_id).',
      });
      return;
    }

    if (nextLinkedTeacherId) {
      const linkCheck = await validateLinkedTeacherIdOnServer(
        supabaseAdmin,
        nextLinkedTeacherId,
        targetUserId
      );
      if (!linkCheck.ok) {
        res.status(linkCheck.statusCode || 400).json({ error: linkCheck.error });
        return;
      }
    }

    // Không cho tự khóa tài khoản đang đăng nhập của chính mình
    if (
      targetUserId === callerId &&
      status !== undefined &&
      (nextStatus === 'locked' || nextStatus === 'inactive')
    ) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/update-user',
        actionCode: 'ADMIN_API_UPDATE_USER',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: targetUserId,
        status: 'failed',
        description: 'Từ chối tự khóa tài khoản đang đăng nhập của chính mình',
      });
      res.status(400).json({ error: 'Bạn không thể tự khóa tài khoản đang đăng nhập của chính mình.' });
      return;
    }

    // Kiểm tra phía server: không cho phép làm mất super_admin đang hoạt động cuối cùng
    const wouldLoseSuperAdmin =
      isLastActiveSuperAdmin && (nextRole !== 'super_admin' || nextStatus !== 'active');

    if (wouldLoseSuperAdmin) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/update-user',
        actionCode: 'ADMIN_API_UPDATE_USER',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: targetUserId,
        status: 'failed',
        description:
          'Từ chối cập nhật: Không được khóa hoặc hạ vai trò của tài khoản Super Admin đang hoạt động cuối cùng',
      });
      res.status(400).json({
        error:
          'Không thể khóa hoặc hạ vai trò của tài khoản Super Admin đang hoạt động cuối cùng! Hệ thống bắt buộc phải có ít nhất 1 Super Admin đang hoạt động.',
      });
      return;
    }

    const updatePayload: Record<string, any> = {};
    if (full_name !== undefined) {
      updatePayload.full_name = String(full_name).trim();
    }
    if (role !== undefined) {
      updatePayload.role = nextRole;
    }
    if (campus_id !== undefined) {
      const normalizedUpdateCampus = String(campus_id).trim().toLowerCase();
      updatePayload.campus_id =
        normalizedUpdateCampus === 'camp_pmh'
          ? 'pmh'
          : normalizedUpdateCampus === 'camp_pl'
          ? 'pl'
          : normalizedUpdateCampus;
    }
    if (status !== undefined) {
      updatePayload.status = nextStatus;
    }
    if (linked_teacher_id !== undefined) {
      updatePayload.linked_teacher_id = nextLinkedTeacherId;
    }
    if (permissions !== undefined && permissions && typeof permissions === 'object') {
      updatePayload.permissions = permissions;
    }

    const { data: updatedProfile, error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update(updatePayload)
      .eq('id', targetUserId)
      .select('*')
      .single();

    if (updateProfileError || !updatedProfile) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/update-user',
        actionCode: 'ADMIN_API_UPDATE_USER',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: targetUserId,
        status: 'failed',
        description: `Lỗi cập nhật bảng profiles cho user ${targetUserId}: ${updateProfileError?.message || 'Unknown'}`,
      });
      res.status(500).json({
        error: 'Không thể cập nhật bảng profiles: ' + (updateProfileError?.message || 'Lỗi không xác định'),
      });
      return;
    }

    // Khi status = 'locked' hoặc 'inactive' thì ban_duration: '876000h'; khi status = 'active' thì gỡ khóa (ban_duration: 'none')
    if (status !== undefined) {
      const banDuration =
        nextStatus === 'locked' || nextStatus === 'inactive'
          ? '876000h'
          : nextStatus === 'active'
          ? 'none'
          : undefined;

      if (banDuration) {
        const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          ban_duration: banDuration,
        });
        if (banError) {
          await recordAdminEndpointAudit({
            supabaseAdmin,
            endpoint: '/api/admin/update-user',
            actionCode: 'ADMIN_API_UPDATE_USER',
            ip: clientIp,
            callerId,
            callerUsername,
            callerFullName,
            targetId: targetUserId,
            status: 'failed',
            description: `Đã cập nhật profiles nhưng lỗi cập nhật ban_duration (${banDuration}) trên Auth cho user ${targetUserId}: ${banError.message}`,
          });
          res.status(500).json({
            error: 'Lỗi đồng bộ trạng thái khóa trên Supabase Auth: ' + banError.message,
          });
          return;
        }
      }
    }

    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/admin/update-user',
      actionCode: 'ADMIN_API_UPDATE_USER',
      ip: clientIp,
      callerId,
      callerUsername,
      callerFullName,
      targetId: targetUserId,
      status: 'success',
      description: `${callerFullName} (@${callerUsername}) đã cập nhật hồ sơ người dùng ${updatedProfile.username || targetUserId}`,
      details: {
        before: {
          full_name: targetProfile.full_name,
          role: targetProfile.role,
          campus_id: targetProfile.campus_id,
          status: targetProfile.status,
          linked_teacher_id: targetProfile.linked_teacher_id,
        },
        after: updatePayload,
      },
    });

    res.json({
      success: true,
      user: updatedProfile,
    });
  } catch (err: any) {
    console.error('[Admin Update User Error]:', err);
    res.status(500).json({ error: err?.message || 'Lỗi máy chủ khi cập nhật người dùng.' });
  }
});

app.post('/api/admin/delete-user', async (req: Request, res: Response) => {
  try {
    const verified = await verifySuperAdminRequest(
      req,
      res,
      '/api/admin/delete-user',
      'ADMIN_API_DELETE_USER',
      { allowCampusManager: true }
    );
    if (!verified) return;
    const {
      supabaseAdmin,
      callerId,
      callerUsername,
      callerFullName,
      callerRole,
      callerCampusId,
      clientIp,
    } = verified;

    const { id, userId, username, email } = req.body || {};

    const targetUserId = await resolveTargetUserUuid(
      supabaseAdmin,
      String(id || userId || ''),
      username,
      email
    );

    if (!targetUserId) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/delete-user',
        actionCode: 'ADMIN_API_DELETE_USER',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: String(id || userId || username || ''),
        status: 'failed',
        description: 'Xóa người dùng thất bại: Không tìm thấy ID người dùng trên Supabase Auth / profiles',
      });
      res.status(404).json({ error: 'Không tìm thấy ID người dùng trên Supabase Auth / profiles.' });
      return;
    }

    // Từ chối nếu xóa chính người đang gọi
    if (targetUserId === callerId) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/delete-user',
        actionCode: 'ADMIN_API_DELETE_USER',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: targetUserId,
        status: 'failed',
        description: 'Từ chối xóa người dùng: Không cho phép tự xóa tài khoản đang đăng nhập của chính mình',
      });
      res.status(400).json({ error: 'Không cho phép xóa tài khoản đang đăng nhập của chính mình!' });
      return;
    }

    // Kiểm tra phía server: từ chối nếu là super_admin đang hoạt động cuối cùng
    const { isLastActiveSuperAdmin, targetProfile } = await isTargetLastActiveSuperAdminOnServer(
      supabaseAdmin,
      targetUserId
    );

    if (callerRole === 'campus_manager') {
      const callerNormCampus = normalizeCampusCodeForServer(callerCampusId);
      const targetNormCampus = normalizeCampusCodeForServer(targetProfile?.campus_id);
      if (
        !targetProfile ||
        targetProfile.role !== 'teacher' ||
        (callerNormCampus !== 'all' && targetNormCampus !== callerNormCampus)
      ) {
        res.status(403).json({
          error: 'Quản lý cơ sở chỉ được phép xóa tài khoản Giáo viên thuộc cơ sở của mình.',
        });
        return;
      }
    }

    if (isLastActiveSuperAdmin) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/delete-user',
        actionCode: 'ADMIN_API_DELETE_USER',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: targetUserId,
        status: 'failed',
        description: 'Từ chối xóa người dùng: Đây là tài khoản Super Admin đang hoạt động cuối cùng',
      });
      res.status(400).json({
        error:
          'Không thể xóa tài khoản Super Admin đang hoạt động cuối cùng! Hệ thống bắt buộc phải có ít nhất 1 Super Admin đang hoạt động.',
      });
      return;
    }

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (deleteAuthError) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/admin/delete-user',
        actionCode: 'ADMIN_API_DELETE_USER',
        ip: clientIp,
        callerId,
        callerUsername,
        callerFullName,
        targetId: targetUserId,
        status: 'failed',
        description: `Lỗi xóa người dùng Auth ${targetUserId}: ${deleteAuthError.message}`,
      });
      res.status(400).json({
        error: 'Không thể xóa người dùng trên Supabase Auth: ' + deleteAuthError.message,
      });
      return;
    }

    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/admin/delete-user',
      actionCode: 'ADMIN_API_DELETE_USER',
      ip: clientIp,
      callerId,
      callerUsername,
      callerFullName,
      targetId: targetUserId,
      status: 'success',
      description: `${callerFullName} (@${callerUsername}) đã xóa vĩnh viễn người dùng ${targetProfile?.username || username || targetUserId}`,
      details: {
        deleted_user_id: targetUserId,
        deleted_username: targetProfile?.username || username || '',
        deleted_role: targetProfile?.role || '',
      },
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Admin Delete User Error]:', err);
    res.status(500).json({ error: err?.message || 'Lỗi máy chủ khi xóa người dùng.' });
  }
});

// Initialize GoogleGenAI SDK Server-Side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const ROYAL_POLICY_SYSTEM_PROMPT = `
Bạn là Cố Vấn Nghiệp Vụ Cấp Cao (Senior Academic & Financial Advisor) của Hệ thống Trường Song ngữ Quốc tế Hoàng Gia (Royal School - Extracurricular Department).
Bạn am hiểu sâu sắc và TUÂN THỦ TUYỆT ĐỐI các quy chế ngoại khóa sau đây:

1. QUY ĐỊNH BÁNH SỮA (Milk & Snack Ration):
   - CHỈ cấp phát khẩu phần bánh sữa chiều cho: Học sinh Royal chính khóa HỌC CA CHIỀU THỨ 2 ĐẾN THỨ 6 (khung giờ sau 16h15).
   - KHÔNG cấp phát bánh sữa cho:
     + Các lớp học vào Thứ Bảy (T7) và Chủ Nhật (CN) (bất kể học sinh Royal hay học sinh ngoài).
     + Học sinh ngoài (học sinh từ trường khác đến học ngoại khóa).
     + Các lớp ca sáng trong tuần (nếu có).

2. QUY ĐỊNH CHUYỂN LỚP GIỮA KHÓA (Mid-Term Class Transfer):
   - Giá trị còn lại của môn cũ = (Số buổi chưa học của môn cũ) x (Đơn giá 1 buổi của môn cũ).
   - TRƯỜNG HỢP A: Đơn giá môn mới <= Đơn giá môn cũ:
     + Chuyển ngang số buổi tương ứng sang lớp mới.
     + Nếu có giá trị chênh lệch dôi dư (do đơn giá rẻ hơn), số tiền chênh lệch được bảo lưu vào tài khoản học sinh trên hệ thống.
   - TRƯỜNG HỢP B: Đơn giá môn mới > Đơn giá môn cũ:
     + Quy đổi toàn bộ số tiền còn lại của môn cũ để cấn trừ vào môn mới.
     + Phụ thu học phí = (Số buổi đăng ký ở môn mới x Đơn giá môn mới) - (Giá trị còn lại môn cũ).
     + Công thức chuẩn phụ thu số buổi dôi dư = (Số buổi mới - Số buổi cũ) x Đơn giá mới (hoặc chênh lệch đơn giá x số buổi thực học).

3. QUY ĐỊNH BẢO LƯU HỌC PHÍ (Tuition Freezing / Reservation Policy):
   - ĐIỀU KIỆN TỰ ĐỘNG BẢO LƯU: Học sinh có phép nghỉ liên tiếp từ 3 buổi trở lên (kèm đơn/báo phép hợp lệ).
   - NGUYÊN TẮC TÀI CHÍNH: ĐÓNG BĂNG SỐ DƯ - TUYỆT ĐỐI KHÔNG HOÀN TIỀN MẶT trong mọi trường hợp.
   - THỜI HẠN BẢO LƯU: Đúng 1 năm (365 ngày) kể từ ngày quyết định bảo lưu có hiệu lực.
   - HƯỚNG XỬ LÝ SỐ DƯ:
     + Học sinh Royal chính khóa: Được cấn trừ số dư bảo lưu sang tiền học phí chính khóa hoặc đăng ký khóa ngoại khóa tiếp theo.
     + Học sinh ngoài: Chỉ được dùng để học tiếp các khóa ngoại khóa tại Royal School trong vòng 1 năm. Quá 1 năm số dư tự động tất toán hết hiệu lực.

4. QUY TRÌNH ĐỐI SOÁT GẠCH NỢ VIETQR:
   - Cú pháp chuẩn chuyển khoản: ROYAL [MÃ_HỌC_SINH] [MÃ_PHIẾU_HOẶC_LỚP] (Ví dụ: ROYAL RS-1002 LOP-SWIM01).
   - Quy trình: Quét mã VietQR động -> Khớp số tiền và mã học sinh trên sao kê ngân hàng -> Kế toán xác nhận gạch nợ thủ công 1-click -> Tự động cập nhật trạng thái "Đã thanh toán" & sinh biên lai/phiếu thu.

Hãy trả lời chuyên nghiệp, chuẩn mực ngôn phong sư phạm quốc tế của Royal School, rõ ràng, có căn cứ số liệu và trích dẫn điều khoản chính xác. Nếu người dùng hỏi bài toán tính tiền, hãy trình bày từng bước phép tính (Step-by-step breakdown).
`;

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // Tối đa 5 MB
const ALLOWED_UPLOAD_EXTENSIONS = new Set<string>(['.png', '.jpg', '.jpeg', '.webp', '.pdf']);
const ALLOWED_UPLOAD_MIMES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};
const PRIVATE_STORAGE_BUCKET = 'attendance-proofs';

// ============================================================================
// PUBLIC & PARENT PORTAL ENDPOINTS (Server-Side Service Role + Rate Limit + Audit)
// ============================================================================

const PUBLIC_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút
let publicCatalogCache: {
  expiresAt: number;
  data: {
    campuses: Array<Record<string, any>>;
    terms: Array<Record<string, any>>;
    subjects: Array<Record<string, any>>;
    time_slots: Array<Record<string, any>>;
  };
} | null = null;

// Bộ giới hạn tần suất (Rate Limiters) cho các endpoint công khai
const catalogIpRateMap = new Map<string, number[]>();
const parentLoginIpRateMap = new Map<string, number[]>();
const parentLoginCodeRateMap = new Map<string, number[]>();
const parentRegisterIpRateMap = new Map<string, number[]>();
const parentRegisterPhoneRateMap = new Map<string, number[]>();

function checkSlidingWindowRateLimit(
  store: Map<string, number[]>,
  key: string,
  windowMs: number,
  maxRequests: number
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = (store.get(key) || []).filter((ts) => ts > cutoff);
  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    store.set(key, timestamps);
    return { allowed: false, retryAfterSec };
  }
  timestamps.push(now);
  store.set(key, timestamps);
  return { allowed: true, retryAfterSec: 0 };
}

const FALLBACK_EPHEMERAL_PARENT_SECRET = crypto.randomBytes(32).toString('hex');
function getParentSessionSecret(): string {
  const envSecret = (process.env.PARENT_SESSION_SECRET || '').trim();
  if (envSecret && envSecret !== 'YOUR_PARENT_SESSION_SECRET') {
    return envSecret;
  }
  return FALLBACK_EPHEMERAL_PARENT_SECRET;
}

function createParentSessionToken(studentId: string, studentCode: string): string {
  const now = Date.now();
  const payload = {
    student_id: studentId,
    code: studentCode,
    iat: now,
    exp: now + 60 * 60 * 1000, // Hết hạn sau 60 phút
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getParentSessionSecret())
    .update(payloadBase64)
    .digest('base64url');
  return `${payloadBase64}.${signature}`;
}

export function verifyParentSessionToken(token: string): { student_id: string; code: string } | null {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2) return null;
    const [payloadBase64, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', getParentSessionSecret())
      .update(payloadBase64)
      .digest('base64url');
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded.exp !== 'number' || Date.now() > decoded.exp) {
      return null;
    }
    if (!decoded.student_id) return null;
    return { student_id: String(decoded.student_id), code: String(decoded.code || '') };
  } catch {
    return null;
  }
}

const DEFAULT_PUBLIC_CAMPUSES = [
  { id: 'pmh', code: 'PMH', name: 'Cơ sở Phú Mỹ Hưng (Q.7)' },
  { id: 'pl', code: 'PL', name: 'Cơ sở Phú Lâm (Q.Bình Tân)' },
];

const DEFAULT_PUBLIC_TERMS = [
  {
    id: 'term_hk2_2025_2026',
    code: 'HK2-2526',
    name: 'Học kỳ II - Năm học 2025-2026 (12 Tuần)',
    start_date: '2026-01-12',
    end_date: '2026-04-12',
    total_weeks: 12,
    status: 'open',
  },
];

const DEFAULT_PUBLIC_TIME_SLOTS = [
  {
    id: 'slot_24_pm',
    code: 'CA_24_1615',
    name: 'Thứ 2 - Thứ 4 (16:15 - 17:15)',
    start_time: '16:15',
    end_time: '17:15',
    days_of_week: ['Mon', 'Wed'],
    is_weekend: false,
    is_afternoon_weekday: true,
    campus_id: 'all',
  },
  {
    id: 'slot_35_pm',
    code: 'CA_35_1615',
    name: 'Thứ 3 - Thứ 5 (16:15 - 17:15)',
    start_time: '16:15',
    end_time: '17:15',
    days_of_week: ['Tue', 'Thu'],
    is_weekend: false,
    is_afternoon_weekday: true,
    campus_id: 'all',
  },
  {
    id: 'slot_6_pm',
    code: 'CA_6_1615',
    name: 'Thứ 6 Chuyên sâu (16:15 - 17:45)',
    start_time: '16:15',
    end_time: '17:45',
    days_of_week: ['Fri'],
    is_weekend: false,
    is_afternoon_weekday: true,
    campus_id: 'all',
  },
  {
    id: 'slot_sat_am',
    code: 'CA_T7_0830',
    name: 'Thứ 7 Cuối tuần (08:30 - 10:30)',
    start_time: '08:30',
    end_time: '10:30',
    days_of_week: ['Sat'],
    is_weekend: true,
    is_afternoon_weekday: false,
    campus_id: 'all',
  },
  {
    id: 'slot_sun_am',
    code: 'CA_CN_0830',
    name: 'Chủ Nhật Cuối tuần (08:30 - 10:30)',
    start_time: '08:30',
    end_time: '10:30',
    days_of_week: ['Sun'],
    is_weekend: true,
    is_afternoon_weekday: false,
    campus_id: 'all',
  },
];

async function getPublicCatalogData(supabaseAdmin: SupabaseClient | null) {
  const now = Date.now();
  if (publicCatalogCache && publicCatalogCache.expiresAt > now) {
    return publicCatalogCache.data;
  }

  let campuses = DEFAULT_PUBLIC_CAMPUSES;
  let terms = DEFAULT_PUBLIC_TERMS;
  let subjects: Array<Record<string, any>> = [];
  let time_slots = DEFAULT_PUBLIC_TIME_SLOTS;

  if (supabaseAdmin) {
    try {
      const [campusesRes, termsRes, subjectsRes, timeSlotsRes] = await Promise.all([
        supabaseAdmin.from('campuses').select('*'),
        supabaseAdmin.from('academic_terms').select('*').order('start_date', { ascending: true }),
        supabaseAdmin.from('campus_subject_fees').select('*'),
        supabaseAdmin.from('time_slots').select('*'),
      ]);

      if (!campusesRes.error && Array.isArray(campusesRes.data) && campusesRes.data.length > 0) {
        campuses = campusesRes.data
          .filter((c: any) => c.is_active !== false && c.status !== 'inactive')
          .map((c: any) => ({
            id: String(c.id || c.code || '').toLowerCase() === 'camp_pmh' ? 'pmh' : String(c.id || c.code || '').toLowerCase() === 'camp_pl' ? 'pl' : String(c.id || ''),
            code: String(c.code || c.id || '').toUpperCase(),
            name: String(c.name || ''),
          }));
      }

      let rawTerms = !termsRes.error && Array.isArray(termsRes.data) ? termsRes.data : [];
      if (rawTerms.length === 0) {
        const altTerms = await supabaseAdmin.from('terms').select('*');
        if (!altTerms.error && Array.isArray(altTerms.data)) {
          rawTerms = altTerms.data;
        }
      }
      if (rawTerms.length > 0) {
        terms = rawTerms.map((t: any) => ({
          id: String(t.id || ''),
          code: String(t.code || t.id || ''),
          name: String(t.name || ''),
          academic_year: String(t.academic_year || '2026-2027'),
          start_date: String(t.start_date || ''),
          end_date: String(t.end_date || ''),
          total_weeks: Number(t.total_weeks) || 12,
          status: String(t.status || 'open_enrollment'),
          is_active: t.is_active ?? (t.status === 'open_enrollment' || t.status === 'in_progress'),
          description: String(t.description || ''),
        }));
      }

      let rawSubjects = !subjectsRes.error && Array.isArray(subjectsRes.data) ? subjectsRes.data : [];
      if (rawSubjects.length === 0) {
        const altSubjects = await supabaseAdmin.from('subjects').select('*');
        if (!altSubjects.error && Array.isArray(altSubjects.data)) {
          rawSubjects = altSubjects.data;
        }
      }
      if (rawSubjects.length > 0) {
        subjects = rawSubjects
          .filter((s: any) => {
            const st = String(s.status || 'active').toLowerCase();
            return s.is_active !== false && st !== 'closed' && st !== 'inactive';
          })
          .map((s: any) => {
            const feePerSession = Number(s.fee_per_session ?? s.price_per_session ?? 150000);
            const totalSessions = Number(s.total_sessions ?? s.sessions_per_term ?? 24);
            const packageFee = Number(s.package_fee ?? s.total_fee ?? feePerSession * totalSessions);
            const rawCampus = String(s.campus_id || 'pmh').toLowerCase();
            const normalizedCampus =
              rawCampus === 'camp_pmh' ? 'pmh' : rawCampus === 'camp_pl' ? 'pl' : rawCampus;
            const slotIds = Array.isArray(s.time_slot_ids)
              ? s.time_slot_ids.map(String)
              : s.default_time_slot_id
              ? [String(s.default_time_slot_id)]
              : ['slot_24_pm', 'slot_35_pm'];
            return {
              id: String(s.id || s.subject_code || ''),
              code: String(s.code || s.subject_code || ''),
              name: String(s.name || s.subject_name || ''),
              category: String(s.category || 'Sports'),
              campus_id: normalizedCampus,
              fee_per_session: feePerSession,
              total_sessions: totalSessions,
              package_fee: packageFee,
              time_slot_ids: slotIds,
              default_time_slot_id: String(s.default_time_slot_id || slotIds[0] || 'slot_24_pm'),
            };
          });
      }

      if (!timeSlotsRes.error && Array.isArray(timeSlotsRes.data) && timeSlotsRes.data.length > 0) {
        time_slots = timeSlotsRes.data
          .filter((ts: any) => ts.is_active !== false && ts.status !== 'inactive')
          .map((ts: any) => ({
            id: String(ts.id || ''),
            code: String(ts.code || ts.id || ''),
            name: String(ts.name || ''),
            start_time: String(ts.start_time || '16:15'),
            end_time: String(ts.end_time || '17:15'),
            days_of_week: Array.isArray(ts.days_of_week) ? ts.days_of_week : ['Mon', 'Wed'],
            is_weekend: Boolean(ts.is_weekend),
            is_afternoon_weekday: ts.is_afternoon_weekday !== undefined ? Boolean(ts.is_afternoon_weekday) : !ts.is_weekend,
            campus_id: String(ts.campus_id || 'all'),
          }));
      }
    } catch (err) {
      console.warn('[Public Catalog] Fallback catalog used due to query error:', err);
    }
  }

  const catalogData = {
    campuses,
    terms,
    subjects,
    time_slots,
  };

  publicCatalogCache = {
    expiresAt: now + PUBLIC_CATALOG_CACHE_TTL_MS,
    data: catalogData,
  };

  return catalogData;
}

// 1. GET /api/public/catalog
app.get('/api/public/catalog', async (req: Request, res: Response) => {
  const clientIp = getClientIpFromReq(req);
  const rateCheck = checkSlidingWindowRateLimit(catalogIpRateMap, clientIp, 60 * 1000, 60);
  const supabaseAdmin = getServerSupabaseAdmin();

  if (!rateCheck.allowed) {
    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/public/catalog',
      actionCode: 'PUBLIC_CATALOG_RATE_LIMIT',
      ip: clientIp,
      status: 'failed',
      description: 'Vượt giới hạn tốc độ truy cập danh mục công khai (/api/public/catalog)',
    });
    res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
    res.status(429).json({
      error: `Quá nhiều yêu cầu từ địa chỉ IP này. Vui lòng thử lại sau ${rateCheck.retryAfterSec} giây.`,
    });
    return;
  }

  try {
    const catalog = await getPublicCatalogData(supabaseAdmin);
    res.json(catalog);
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể tải danh mục khóa học công khai.' });
  }
});

// 2. POST /api/parent/login
const GENERIC_PARENT_LOGIN_ERROR =
  'Thông tin không khớp. Vui lòng kiểm tra lại SĐT và Mã học sinh hoặc liên hệ Văn phòng Học vụ.';

app.post('/api/parent/login', async (req: Request, res: Response) => {
  const clientIp = getClientIpFromReq(req);
  const supabaseAdmin = getServerSupabaseAdmin();

  // Giới hạn 1: 5 lần mỗi 15 phút mỗi IP
  const ipRate = checkSlidingWindowRateLimit(parentLoginIpRateMap, clientIp, 15 * 60 * 1000, 5);
  if (!ipRate.allowed) {
    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/parent/login',
      actionCode: 'PARENT_LOGIN_RATE_LIMIT_IP',
      ip: clientIp,
      status: 'failed',
      description: 'Từ chối đăng nhập phụ huynh: Vượt giới hạn 5 lần / 15 phút theo IP',
    });
    res.setHeader('Retry-After', String(ipRate.retryAfterSec));
    res.status(429).json({
      error: `Quá nhiều lần thử tra cứu từ địa chỉ IP này (tối đa 5 lần / 15 phút). Vui lòng thử lại sau ${ipRate.retryAfterSec} giây.`,
    });
    return;
  }

  const rawPhone = String(req.body?.phone ?? '');
  const rawStudentCode = String(req.body?.studentCode ?? '');

  // Kiểm tra ký tự điều khiển
  if (/[\x00-\x1F\x7F]/.test(rawPhone) || /[\x00-\x1F\x7F]/.test(rawStudentCode)) {
    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/parent/login',
      actionCode: 'PARENT_LOGIN_INVALID_INPUT',
      ip: clientIp,
      status: 'failed',
      description: 'Từ chối đăng nhập phụ huynh: Dữ liệu đầu vào chứa ký tự điều khiển',
    });
    res.status(401).json({ error: GENERIC_PARENT_LOGIN_ERROR });
    return;
  }

  const cleanPhone = rawPhone.replace(/\D/g, '');
  const cleanCode = rawStudentCode.trim().toUpperCase();

  if (!cleanPhone || cleanPhone.length < 9 || cleanPhone.length > 12 || !cleanCode || cleanCode.length > 32) {
    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/parent/login',
      actionCode: 'PARENT_LOGIN_FAILED',
      ip: clientIp,
      targetId: cleanCode || 'unknown',
      status: 'failed',
      description: 'Tra cứu phụ huynh thất bại: Định dạng SĐT hoặc Mã học sinh không hợp lệ',
    });
    res.status(401).json({ error: GENERIC_PARENT_LOGIN_ERROR });
    return;
  }

  // Giới hạn 2: 10 lần mỗi giờ mỗi mã học sinh
  const codeRate = checkSlidingWindowRateLimit(parentLoginCodeRateMap, cleanCode, 60 * 60 * 1000, 10);
  if (!codeRate.allowed) {
    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/parent/login',
      actionCode: 'PARENT_LOGIN_RATE_LIMIT_CODE',
      ip: clientIp,
      targetId: cleanCode,
      status: 'failed',
      description: `Từ chối đăng nhập phụ huynh: Mã học sinh ${cleanCode} vượt giới hạn 10 lần / giờ`,
    });
    res.setHeader('Retry-After', String(codeRate.retryAfterSec));
    res.status(429).json({
      error: `Mã học sinh này đã được thử quá nhiều lần (tối đa 10 lần / giờ). Vui lòng thử lại sau ${codeRate.retryAfterSec} giây.`,
    });
    return;
  }

  if (!supabaseAdmin) {
    await recordAdminEndpointAudit({
      endpoint: '/api/parent/login',
      actionCode: 'PARENT_LOGIN_ERROR',
      ip: clientIp,
      targetId: cleanCode,
      status: 'failed',
      description: 'Không thể xác thực phụ huynh: Thiếu SUPABASE_SERVICE_ROLE_KEY trên server',
    });
    res.status(401).json({ error: GENERIC_PARENT_LOGIN_ERROR });
    return;
  }

  try {
    const { data: rows, error } = await supabaseAdmin
      .from('students')
      .select('*')
      .ilike('code', cleanCode)
      .limit(10);

    let candidateRows = !error && Array.isArray(rows) ? rows : [];
    if (candidateRows.length === 0) {
      const altRes = await supabaseAdmin
        .from('students')
        .select('*')
        .ilike('student_code', cleanCode)
        .limit(10);
      if (!altRes.error && Array.isArray(altRes.data)) {
        candidateRows = altRes.data;
      }
    }

    const normalizeVnPhone = (p: string): string => {
      const digits = String(p || '').replace(/\D/g, '');
      if (digits.startsWith('84') && digits.length >= 10) {
        return '0' + digits.slice(2);
      }
      return digits;
    };

    const normalizedInputPhone = normalizeVnPhone(cleanPhone);

    const matched = candidateRows.find((s: any) => {
      const rowCode = String(s.code || s.student_code || '').trim().toUpperCase();
      const rowPhone = normalizeVnPhone(String(s.parent_phone || s.phone || ''));
      const rowStatus = String(s.status || 'active').toLowerCase();
      return (
        rowCode === cleanCode &&
        rowPhone.length >= 9 &&
        rowPhone === normalizedInputPhone &&
        rowStatus !== 'inactive' &&
        rowStatus !== 'deleted'
      );
    });

    if (!matched) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/parent/login',
        actionCode: 'PARENT_LOGIN_FAILED',
        ip: clientIp,
        targetId: cleanCode,
        status: 'failed',
        description: `Tra cứu phụ huynh thất bại cho mã học sinh ${cleanCode}`,
      });
      res.status(401).json({ error: GENERIC_PARENT_LOGIN_ERROR });
      return;
    }

    const safeStudent = {
      id: String(matched.id || ''),
      code: String(matched.code || matched.student_code || cleanCode),
      name: String(matched.name || matched.full_name || ''),
      grade: String(matched.grade || matched.class_name || ''),
      dob: String(matched.dob || matched.date_of_birth || ''),
      parent_name: String(matched.parent_name || ''),
      parent_phone: String(matched.parent_phone || matched.phone || ''),
      campus_id:
        String(matched.campus_id || 'pmh').toLowerCase() === 'camp_pmh'
          ? 'pmh'
          : String(matched.campus_id || 'pmh').toLowerCase() === 'camp_pl'
          ? 'pl'
          : String(matched.campus_id || 'pmh'),
    };

    const token = createParentSessionToken(safeStudent.id, safeStudent.code);

    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/parent/login',
      actionCode: 'PARENT_LOGIN_SUCCESS',
      ip: clientIp,
      callerId: safeStudent.id,
      callerUsername: safeStudent.code,
      callerFullName: safeStudent.parent_name || safeStudent.name,
      targetId: safeStudent.id,
      status: 'success',
      description: `Phụ huynh học sinh ${safeStudent.name} (${safeStudent.code}) đăng nhập cổng phụ huynh thành công`,
    });

    res.json({
      token,
      student: safeStudent,
    });
  } catch (err: any) {
    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/parent/login',
      actionCode: 'PARENT_LOGIN_FAILED',
      ip: clientIp,
      targetId: cleanCode,
      status: 'failed',
      description: `Lỗi truy vấn khi đăng nhập phụ huynh cho mã ${cleanCode}`,
    });
    res.status(401).json({ error: GENERIC_PARENT_LOGIN_ERROR });
  }
});

// 3. POST /api/parent/register
app.post('/api/parent/register', async (req: Request, res: Response) => {
  const clientIp = getClientIpFromReq(req);
  const supabaseAdmin = getServerSupabaseAdmin();

  // Giới hạn 1: 5 lần mỗi giờ mỗi IP
  const ipRate = checkSlidingWindowRateLimit(parentRegisterIpRateMap, clientIp, 60 * 60 * 1000, 5);
  if (!ipRate.allowed) {
    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/parent/register',
      actionCode: 'PARENT_REGISTER_RATE_LIMIT_IP',
      ip: clientIp,
      status: 'failed',
      description: 'Từ chối gửi phiếu đăng ký phụ huynh: Vượt giới hạn 5 lần / giờ theo IP',
    });
    res.setHeader('Retry-After', String(ipRate.retryAfterSec));
    res.status(429).json({
      error: `Quá nhiều lượt gửi đăng ký từ địa chỉ IP này (tối đa 5 lần / giờ). Vui lòng thử lại sau ${ipRate.retryAfterSec} giây.`,
    });
    return;
  }

  const body = req.body || {};

  // Kiểm tra trường ẩn chống bot (honeypot)
  const honeypotValue = String(body.honeypot ?? body.website_url ?? '').trim();
  if (honeypotValue.length > 0) {
    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/parent/register',
      actionCode: 'PARENT_REGISTER_BOT_BLOCKED',
      ip: clientIp,
      status: 'failed',
      description: 'Từ chối đăng ký phụ huynh: Phát hiện bot điền trường ẩn (honeypot)',
    });
    res.status(400).json({ error: 'Yêu cầu không hợp lệ.' });
    return;
  }

  // Kiểm tra thời gian điền biểu mẫu tối thiểu 3 giây
  const formStartedAt = Number(body.formStartedAt ?? body.form_started_at ?? 0);
  if (!Number.isFinite(formStartedAt) || formStartedAt <= 0 || Date.now() - formStartedAt < 3000) {
    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/parent/register',
      actionCode: 'PARENT_REGISTER_TOO_FAST',
      ip: clientIp,
      status: 'failed',
      description: 'Từ chối đăng ký phụ huynh: Thời gian điền biểu mẫu dưới 3 giây',
    });
    res.status(400).json({
      error: 'Thao tác gửi biểu mẫu quá nhanh (tối thiểu 3 giây). Vui lòng kiểm tra lại thông tin trước khi gửi.',
    });
    return;
  }

  const rawStudentName = String(body.student_name ?? '').trim();
  const rawStudentDob = String(body.student_dob ?? '').trim();
  const rawCurrentGrade = String(body.current_grade ?? '').trim();
  const rawStudentCode = String(body.student_code ?? '').trim();
  const rawStudentType = String(body.student_type ?? 'royal').trim();
  const rawCampusId = String(body.campus_id ?? '').trim().toLowerCase();
  const rawTermId = String(body.term_id ?? body.term ?? '').trim();
  const rawParentName = String(body.parent_name ?? '').trim();
  const rawParentPhone = String(body.parent_phone ?? '').trim();
  const rawParentEmail = String(body.parent_email ?? '').trim();
  const rawNotes = String(body.notes ?? '').trim();
  const rawSelectedSubjects = Array.isArray(body.selected_subjects) ? body.selected_subjects : [];

  // Từ chối ký tự điều khiển
  const singleLineFields = [
    rawStudentName,
    rawStudentDob,
    rawCurrentGrade,
    rawStudentCode,
    rawStudentType,
    rawCampusId,
    rawTermId,
    rawParentName,
    rawParentPhone,
    rawParentEmail,
  ];
  if (
    singleLineFields.some((val) => /[\x00-\x1F\x7F]/.test(val)) ||
    /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(rawNotes)
  ) {
    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/parent/register',
      actionCode: 'PARENT_REGISTER_INVALID_CHARS',
      ip: clientIp,
      status: 'failed',
      description: 'Từ chối đăng ký phụ huynh: Dữ liệu chứa ký tự điều khiển không hợp lệ',
    });
    res.status(400).json({ error: 'Dữ liệu đầu vào chứa ký tự điều khiển không hợp lệ.' });
    return;
  }

  if (rawStudentName.length < 2 || rawStudentName.length > 100) {
    res.status(400).json({ error: 'Họ và tên học sinh phải từ 2 đến 100 ký tự.' });
    return;
  }
  if (rawParentName.length < 2 || rawParentName.length > 100) {
    res.status(400).json({ error: 'Họ và tên phụ huynh phải từ 2 đến 100 ký tự.' });
    return;
  }
  if (rawNotes.length > 1000) {
    res.status(400).json({ error: 'Ghi chú không được vượt quá 1000 ký tự.' });
    return;
  }

  const cleanPhone = rawParentPhone.replace(/\D/g, '');
  if (!/^(0|84)\d{8,10}$/.test(cleanPhone)) {
    res.status(400).json({ error: 'Số điện thoại phụ huynh không hợp lệ (gồm 9-11 chữ số).' });
    return;
  }

  // Giới hạn 2: 3 lần mỗi ngày mỗi số điện thoại
  const normalizedPhoneKey = cleanPhone.startsWith('84') ? '0' + cleanPhone.slice(2) : cleanPhone;
  const phoneRate = checkSlidingWindowRateLimit(
    parentRegisterPhoneRateMap,
    normalizedPhoneKey,
    24 * 60 * 60 * 1000,
    3
  );
  if (!phoneRate.allowed) {
    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/parent/register',
      actionCode: 'PARENT_REGISTER_RATE_LIMIT_PHONE',
      ip: clientIp,
      targetId: normalizedPhoneKey,
      status: 'failed',
      description: `Từ chối đăng ký phụ huynh: Số điện thoại ${normalizedPhoneKey} vượt giới hạn 3 lần / ngày`,
    });
    res.setHeader('Retry-After', String(phoneRate.retryAfterSec));
    res.status(429).json({
      error: 'Số điện thoại này đã gửi tối đa 3 phiếu đăng ký trong ngày. Vui lòng liên hệ Văn phòng Học vụ nếu cần hỗ trợ thêm.',
    });
    return;
  }

  if (rawSelectedSubjects.length === 0 || rawSelectedSubjects.length > 10) {
    res.status(400).json({ error: 'Vui lòng chọn ít nhất 1 môn ngoại khóa (tối đa 10 môn).' });
    return;
  }

  // Đối chiếu với danh mục trên server và TÍNH LẠI tổng học phí từ danh mục
  const catalog = await getPublicCatalogData(supabaseAdmin);
  const normalizedCampusId =
    rawCampusId === 'camp_pmh' ? 'pmh' : rawCampusId === 'camp_pl' ? 'pl' : rawCampusId;

  const validCampus = catalog.campuses.find(
    (c: any) => String(c.id).toLowerCase() === normalizedCampusId
  );
  if (!validCampus) {
    res.status(400).json({ error: 'Cơ sở đào tạo (campus_id) không tồn tại trong danh mục đang mở.' });
    return;
  }

  const validTerm = catalog.terms.find((t: any) => String(t.id) === rawTermId || String(t.code) === rawTermId);
  if (!validTerm) {
    res.status(400).json({ error: 'Khóa học (term) không tồn tại hoặc đã đóng đăng ký.' });
    return;
  }

  const verifiedSubjects: Array<{
    subject_id: string;
    subject_name: string;
    time_slot_id: string;
    time_slot_name: string;
    fee: number;
  }> = [];

  for (const item of rawSelectedSubjects) {
    const subId = String(item?.subject_id ?? '').trim();
    const slotId = String(item?.time_slot_id ?? '').trim();
    if (!subId || !slotId) {
      res.status(400).json({ error: 'Thông tin môn học hoặc ca học đã chọn không hợp lệ.' });
      return;
    }

    const catalogSubject = catalog.subjects.find(
      (s: any) =>
        String(s.id) === subId &&
        (String(s.campus_id) === normalizedCampusId || String(s.campus_id) === 'all')
    );
    if (!catalogSubject) {
      res.status(400).json({
        error: `Môn học "${subId}" không thuộc danh mục đang mở của cơ sở đã chọn.`,
      });
      return;
    }

    const catalogSlot = catalog.time_slots.find((ts: any) => String(ts.id) === slotId);
    if (!catalogSlot) {
      res.status(400).json({
        error: `Khung giờ học "${slotId}" không tồn tại trong danh mục đang mở.`,
      });
      return;
    }

    const allowedSlotIds: string[] = Array.isArray(catalogSubject.time_slot_ids)
      ? catalogSubject.time_slot_ids.map(String)
      : [];
    if (allowedSlotIds.length > 0 && !allowedSlotIds.includes(slotId)) {
      res.status(400).json({
        error: `Khung giờ "${catalogSlot.name}" không áp dụng cho môn "${catalogSubject.name}".`,
      });
      return;
    }

    const computedFee = Number(
      catalogSubject.package_fee ??
        Number(catalogSubject.fee_per_session || 0) * Number(catalogSubject.total_sessions || 24)
    );

    verifiedSubjects.push({
      subject_id: String(catalogSubject.id),
      subject_name: String(catalogSubject.name),
      time_slot_id: String(catalogSlot.id),
      time_slot_name: String(catalogSlot.name),
      fee: computedFee,
    });
  }

  // Tính tổng học phí trên server (ưu đãi giảm 5% khi đăng ký từ 2 môn trở lên)
  const subtotalFee = verifiedSubjects.reduce((sum, s) => sum + s.fee, 0);
  const multiSubjectDiscount =
    verifiedSubjects.length >= 2 ? Math.round(subtotalFee * 0.05) : 0;
  const serverTotalFee = Math.max(0, subtotalFee - multiSubjectDiscount);

  const regCode = `REG-${new Date().getFullYear()}-${crypto.randomInt(100000, 999999)}`;
  const regId = `reg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const createdAt = new Date().toISOString();

  if (!supabaseAdmin) {
    res.status(500).json({ error: 'Máy chủ chưa được cấu hình SUPABASE_SERVICE_ROLE_KEY.' });
    return;
  }

  try {
    const dbRow = {
      id: regId,
      reg_code: regCode,
      student_name: rawStudentName,
      student_dob: rawStudentDob || '2016-01-01',
      current_grade: rawCurrentGrade || '1A1',
      student_type: rawStudentType === 'external' ? 'external' : 'royal',
      student_code: rawStudentCode || null,
      campus_id: normalizedCampusId,
      term_id: String(validTerm.id),
      parent_name: rawParentName,
      parent_phone: normalizedPhoneKey,
      parent_email: rawParentEmail || '',
      selected_subjects: verifiedSubjects,
      total_estimated_fee: serverTotalFee,
      notes: rawNotes,
      status: 'pending',
      created_at: createdAt,
    };

    const { error: insertError } = await supabaseAdmin
      .from('parent_registrations')
      .insert(dbRow);

    if (insertError) {
      await recordAdminEndpointAudit({
        supabaseAdmin,
        endpoint: '/api/parent/register',
        actionCode: 'PARENT_REGISTER_DB_ERROR',
        ip: clientIp,
        targetId: regCode,
        status: 'failed',
        description: `Lỗi lưu phiếu đăng ký ngoại khóa ${regCode}: ${insertError.message}`,
      });
      res.status(500).json({ error: 'Không thể lưu phiếu đăng ký vào hệ thống. Vui lòng thử lại sau.' });
      return;
    }

    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/parent/register',
      actionCode: 'PARENT_REGISTER_SUCCESS',
      ip: clientIp,
      callerId: normalizedPhoneKey,
      callerUsername: rawParentName,
      callerFullName: rawParentName,
      targetId: regId,
      status: 'success',
      description: `Phụ huynh ${rawParentName} (${normalizedPhoneKey}) đã gửi phiếu đăng ký ${regCode} cho HS ${rawStudentName} (${verifiedSubjects.length} môn - ${serverTotalFee.toLocaleString('vi-VN')}đ)`,
    });

    res.json({
      id: regId,
      reg_code: regCode,
      total_estimated_fee: serverTotalFee,
      selected_subjects: verifiedSubjects,
      created_at: createdAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Lỗi máy chủ khi xử lý đăng ký ngoại khóa.' });
  }
});

// Multi-turn Gemini Chat Endpoint (Yêu cầu xác thực Bearer token hợp lệ)
app.post('/api/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const { history = [], message, enableHighThinking = false, role = 'general' } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Nội dung tin nhắn không hợp lệ.' });
      return;
    }

    let roleSpecificPrompt = ROYAL_POLICY_SYSTEM_PROMPT;
    if (role === 'accountant') {
      roleSpecificPrompt += `\n[VAI TRÒ HIỆN TẠI]: Bạn đang trao đổi với tư cách Trưởng Ban Kế toán Tài chính Royal School, tập trung cao độ vào tính toán cấn trừ, đối soát VietQR, công thức phụ thu và nguyên tắc đóng băng số dư không hoàn tiền mặt.`;
    } else if (role === 'kitchen') {
      roleSpecificPrompt += `\n[VAI TRÒ HIỆN TẠI]: Bạn đang trao đổi với tư cách Chuyên viên Điều phối Hậu cần & Bánh sữa, nhấn mạnh điều kiện cấp phát (chỉ T2-T6 ca chiều cho học sinh Royal) và kiểm soát số suất ăn chuẩn xác.`;
    } else if (role === 'academic') {
      roleSpecificPrompt += `\n[VAI TRÒ HIỆN TẠI]: Bạn đang trao đổi với tư cách Trưởng Phòng Học vụ Ngoại khóa, phụ trách mở lớp T2-CN, điều kiện bảo lưu nghỉ phép >= 3 buổi và quy trình chuyển lớp.`;
    }

    // Build contents for generateContent
    const formattedContents = [
      ...history.map((msg: { role: string; text: string }) => ({
        role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }],
      })),
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ];

    let responseText = '';

    // If High Thinking is requested, use gemini-4-argon with thinkingLevel: HIGH as required
    if (enableHighThinking) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-4-argon',
          contents: formattedContents,
          config: {
            systemInstruction: roleSpecificPrompt,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.HIGH,
            },
          },
        });
        responseText = response.text || '';
      } catch (argonErr) {
        console.warn('Fallback to gemini-3.8-flash for High Thinking due to error:', argonErr);
        // Fallback to gemini-3.8-flash with HIGH thinking
        const fallbackResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: formattedContents,
          config: {
            systemInstruction: roleSpecificPrompt,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.HIGH,
            },
          },
        });
        responseText = fallbackResponse.text || '';
      }
    } else {
      // General task using gemini-3.8-flash
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: formattedContents,
        config: {
          systemInstruction: roleSpecificPrompt,
        },
      });
      responseText = response.text || '';
    }

    res.json({ reply: responseText });
  } catch (error: any) {
    console.error('Error calling Gemini API:', error);
    res.status(500).json({
      error: 'Không thể kết nối với dịch vụ AI: ' + (error?.message || 'Lỗi chưa xác định'),
    });
  }
});

// Endpoint to analyze and generate official memorandum / receipt text (Yêu cầu xác thực Bearer token hợp lệ)
app.post('/api/ai-analyze', requireAuth, async (req: Request, res: Response) => {
  try {
    const { actionType, payload } = req.body;
    const prompt = `
Dựa trên quy chế của Royal School Extracurricular System:
Loại yêu cầu: ${actionType}
Dữ liệu chi tiết: ${JSON.stringify(payload, null, 2)}

Hãy xuất ra bản phân tích hoặc văn bản dự thảo chuẩn xác (nếu là tính chuyển lớp thì có bảng tính chi tiết từng dòng, nếu là hồ sơ bảo lưu thì có lý do, thời hạn bảo lưu 1 năm, phương án cấn trừ học phí chính khóa, nếu là đối soát thì có nhận xét khớp lệnh).
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: ROYAL_POLICY_SYSTEM_PROMPT,
      },
    });

    res.json({ result: response.text || '' });
  } catch (err: any) {
    console.error('AI analyze error:', err);
    res.status(500).json({ error: err?.message || 'Lỗi phân tích AI' });
  }
});

function verifyFileMagicBytes(buffer: Buffer, extension: string): boolean {
  if (!buffer || buffer.length < 4) return false;
  const ext = extension.toLowerCase();
  if (ext === '.png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (ext === '.webp') {
    return (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  if (ext === '.pdf') {
    return buffer.toString('ascii', 0, 4) === '%PDF';
  }
  return false;
}

// C.1 POST /api/upload: lưu tệp vào bucket riêng tư 'attendance-proofs' của Supabase Storage bằng service role
app.post('/api/upload', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).authUser;
    const supabaseAdmin = authUser?.supabaseAdmin || getServerSupabaseAdmin();
    if (!supabaseAdmin) {
      res.status(500).json({ error: 'Máy chủ chưa được cấu hình SUPABASE_SERVICE_ROLE_KEY.' });
      return;
    }

    const { fileData, fileName, folder = 'proofs' } = req.body || {};

    if (!fileData || typeof fileData !== 'string') {
      res.status(400).json({ error: 'Dữ liệu tệp không hợp lệ.' });
      return;
    }

    if (folder !== 'proofs' && folder !== 'students') {
      res.status(400).json({ error: 'Thư mục lưu trữ không hợp lệ. Chỉ chấp nhận proofs hoặc students.' });
      return;
    }

    let base64Content = fileData.trim();
    let mimeExt = '';
    let resolvedMimeType = '';

    if (base64Content.startsWith('data:')) {
      const match = base64Content.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        res.status(400).json({ error: 'Định dạng Data URL của tệp không hợp lệ.' });
        return;
      }
      const mimeType = match[1].trim().toLowerCase();
      const allowedExt = ALLOWED_UPLOAD_MIMES[mimeType];
      if (!allowedExt) {
        res.status(400).json({
          error: 'Định dạng MIME không được hỗ trợ. Chỉ chấp nhận tệp PNG, JPG, WEBP hoặc PDF.',
        });
        return;
      }
      mimeExt = allowedExt;
      resolvedMimeType = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
      base64Content = match[2].trim();
    }

    const rawFileName = String(fileName || '').trim();
    const fileExt = path.extname(rawFileName).toLowerCase();

    if (fileExt && !ALLOWED_UPLOAD_EXTENSIONS.has(fileExt)) {
      res.status(400).json({
        error: `Phần mở rộng tệp "${fileExt}" không hợp lệ. Chỉ chấp nhận .png, .jpg, .jpeg, .webp hoặc .pdf.`,
      });
      return;
    }

    if (!mimeExt && !fileExt) {
      res.status(400).json({
        error: 'Không xác định được định dạng tệp. Vui lòng tải lên tệp .png, .jpg, .webp hoặc .pdf.',
      });
      return;
    }

    if (mimeExt && fileExt) {
      const normalizedFileExt = fileExt === '.jpeg' ? '.jpg' : fileExt;
      if (normalizedFileExt !== mimeExt) {
        res.status(400).json({
          error: 'Định dạng nội dung tệp và phần mở rộng tên tệp không khớp.',
        });
        return;
      }
    }

    const finalExtension = fileExt || mimeExt;
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(finalExtension)) {
      res.status(400).json({
        error: 'Chỉ chấp nhận tệp có phần mở rộng .png, .jpg, .jpeg, .webp hoặc .pdf.',
      });
      return;
    }

    const buffer = Buffer.from(base64Content, 'base64');
    if (!buffer || buffer.length === 0) {
      res.status(400).json({ error: 'Nội dung tệp tải lên rỗng.' });
      return;
    }

    if (buffer.length > MAX_UPLOAD_SIZE_BYTES) {
      res.status(400).json({
        error: 'Kích thước tệp vượt quá giới hạn cho phép (tối đa 5 MB).',
      });
      return;
    }

    if (!verifyFileMagicBytes(buffer, finalExtension)) {
      res.status(400).json({
        error: 'Chữ ký tệp (magic bytes) không khớp với định dạng PNG, JPG, WEBP hoặc PDF.',
      });
      return;
    }

    const timestamp = Date.now();
    const baseNameWithoutExt = rawFileName
      ? path.basename(rawFileName, path.extname(rawFileName))
      : `proof_${timestamp}`;
    const safeBaseName =
      baseNameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || `proof_${timestamp}`;

    const uniqueFileName = `${timestamp}_${safeBaseName}${finalExtension}`;
    const storagePath = `${folder}/${uniqueFileName}`;
    const contentType =
      resolvedMimeType ||
      (finalExtension === '.pdf'
        ? 'application/pdf'
        : finalExtension === '.png'
        ? 'image/png'
        : finalExtension === '.webp'
        ? 'image/webp'
        : 'image/jpeg');

    const { error: uploadError } = await supabaseAdmin.storage
      .from(PRIVATE_STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      res.status(500).json({
        error: 'Không thể lưu tệp vào Supabase Storage: ' + uploadError.message,
      });
      return;
    }

    res.json({
      success: true,
      path: storagePath,
      url: storagePath,
      fileName: uniqueFileName,
      storedPath: `Supabase Bucket (${PRIVATE_STORAGE_BUCKET}): ${storagePath}`,
      size: buffer.length,
      mimeType: contentType,
    });
  } catch (err: any) {
    console.error('[Supabase Storage Upload] Error saving file:', err);
    res.status(500).json({ error: 'Không thể lưu tệp lên hệ thống: ' + (err?.message || 'Lỗi không xác định') });
  }
});

// C.2 GET /api/files/sign?path=... (requireAuth): trả về signed URL có hạn 60 phút
app.get('/api/files/sign', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).authUser;
    const supabaseAdmin = authUser?.supabaseAdmin || getServerSupabaseAdmin();
    if (!supabaseAdmin) {
      res.status(500).json({ error: 'Máy chủ chưa được cấu hình SUPABASE_SERVICE_ROLE_KEY.' });
      return;
    }

    const rawPath = String(req.query.path || '').trim();
    if (!rawPath || /[\x00-\x1F\x7F]/.test(rawPath) || rawPath.includes('..') || rawPath.includes('\\')) {
      res.status(400).json({ error: 'Đường dẫn tệp (path) không hợp lệ.' });
      return;
    }

    // Chuẩn hóa đường dẫn cũ (/uploads/proofs/... -> proofs/..., /uploads/students/... -> students/...)
    let cleanPath = rawPath.replace(/^\/+/, '');
    if (cleanPath.startsWith('uploads/')) {
      cleanPath = cleanPath.slice('uploads/'.length);
    }
    if (cleanPath.startsWith(`${PRIVATE_STORAGE_BUCKET}/`)) {
      cleanPath = cleanPath.slice(`${PRIVATE_STORAGE_BUCKET}/`.length);
    }

    if (!cleanPath.startsWith('proofs/') && !cleanPath.startsWith('students/')) {
      res.status(400).json({ error: 'Đường dẫn tệp phải thuộc thư mục proofs/ hoặc students/.' });
      return;
    }

    const ext = path.extname(cleanPath).toLowerCase();
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
      res.status(400).json({ error: 'Định dạng tệp không được phép tạo liên kết ký.' });
      return;
    }

    const { data, error } = await supabaseAdmin.storage
      .from(PRIVATE_STORAGE_BUCKET)
      .createSignedUrl(cleanPath, 3600); // Hạn 60 phút (3600 giây)

    if (error || !data?.signedUrl) {
      res.status(404).json({
        error: 'Không thể tạo liên kết truy cập tệp: ' + (error?.message || 'Không tìm thấy tệp'),
      });
      return;
    }

    res.json({
      signedUrl: data.signedUrl,
      path: cleanPath,
      expiresIn: 3600,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Lỗi tạo signed URL cho tệp.' });
  }
});

// Endpoint to list uploaded proof files in private bucket (Yêu cầu xác thực Bearer token hợp lệ)
app.get('/api/files/proofs', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).authUser;
    const supabaseAdmin = authUser?.supabaseAdmin || getServerSupabaseAdmin();
    if (!supabaseAdmin) {
      res.json({ files: [] });
      return;
    }

    const { data, error } = await supabaseAdmin.storage
      .from(PRIVATE_STORAGE_BUCKET)
      .list('proofs', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

    if (error || !Array.isArray(data)) {
      res.json({ files: [] });
      return;
    }

    const files = data
      .filter((item) => item.name && ALLOWED_UPLOAD_EXTENSIONS.has(path.extname(item.name).toLowerCase()))
      .map((item) => ({
        fileName: item.name,
        path: `proofs/${item.name}`,
        url: `proofs/${item.name}`,
        size: Number(item.metadata?.size || 0),
        createdAt: item.created_at || new Date().toISOString(),
      }));

    res.json({ files });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Lỗi đọc danh sách tệp trên Supabase Storage' });
  }
});

// ============================================================================
// GIAI ĐOẠN CHECK IN GIÁO VIÊN (PHẦN 1: MÁY CHỦ VÀ DỮ LIỆU) & BACKUP AUDIT
// ============================================================================

const RAW_CHECKIN_QR_SECRET = String(process.env.CHECKIN_QR_SECRET || '').trim();
const CHECKIN_QR_SECRET_KEY: string = (() => {
  if (
    RAW_CHECKIN_QR_SECRET &&
    RAW_CHECKIN_QR_SECRET !== 'YOUR_CHECKIN_QR_SECRET' &&
    Buffer.byteLength(RAW_CHECKIN_QR_SECRET, 'utf8') >= 32
  ) {
    return RAW_CHECKIN_QR_SECRET;
  }
  const ephemeralSecret = crypto.randomBytes(32).toString('hex');
  console.warn(
    '[CheckinQR] CẢNH BÁO: CHECKIN_QR_SECRET chưa được cấu hình hoặc ngắn hơn 32 byte. Đã sinh khóa tạm thời cho phiên khởi động này.'
  );
  return ephemeralSecret;
})();

const CHECKIN_QR_TTL_SECONDS: number = (() => {
  const parsed = Number(process.env.CHECKIN_QR_TTL_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 90;
})();

const CHECKIN_LATE_GRACE_MIN: number = (() => {
  const parsed = Number(process.env.CHECKIN_LATE_GRACE_MIN);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 5;
})();

export interface CheckinTokenPayload {
  t: string;
  iat: number;
  exp: number;
  j: string;
}

export function signCheckinToken({ teacherId }: { teacherId: string }): {
  token: string;
  payload: CheckinTokenPayload;
} {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + CHECKIN_QR_TTL_SECONDS;
  const j = crypto.randomBytes(16).toString('hex');
  const payload: CheckinTokenPayload = {
    t: String(teacherId).trim(),
    iat,
    exp,
    j,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', CHECKIN_QR_SECRET_KEY)
    .update(`RSC1.${payloadB64}`)
    .digest('base64url');
  return {
    token: `RSC1.${payloadB64}.${sigB64}`,
    payload,
  };
}

export function verifyCheckinToken(
  rawToken: string
):
  | { ok: true; payload: CheckinTokenPayload }
  | { ok: false; reason: 'invalid' | 'expired'; payload?: CheckinTokenPayload } {
  if (!rawToken || typeof rawToken !== 'string') {
    return { ok: false, reason: 'invalid' };
  }
  const parts = rawToken.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'RSC1') {
    return { ok: false, reason: 'invalid' };
  }
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) {
    return { ok: false, reason: 'invalid' };
  }

  const expectedSigB64 = crypto
    .createHmac('sha256', CHECKIN_QR_SECRET_KEY)
    .update(`RSC1.${payloadB64}`)
    .digest('base64url');

  const sigBuf = Buffer.from(sigB64, 'utf8');
  const expectedBuf = Buffer.from(expectedSigB64, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, reason: 'invalid' };
  }

  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (
      !decoded ||
      typeof decoded.t !== 'string' ||
      !decoded.t.trim() ||
      typeof decoded.iat !== 'number' ||
      typeof decoded.exp !== 'number' ||
      typeof decoded.j !== 'string' ||
      !decoded.j.trim()
    ) {
      return { ok: false, reason: 'invalid' };
    }
    const payload: CheckinTokenPayload = {
      t: decoded.t.trim(),
      iat: decoded.iat,
      exp: decoded.exp,
      j: decoded.j.trim(),
    };
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > payload.exp) {
      return { ok: false, reason: 'expired', payload };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

const CHECKIN_STAFF_ALLOWED_ROLES = new Set<string>(
  Array.from(VALID_USER_ROLES).filter(
    role =>
      role === 'super_admin' ||
      role === 'campus_manager' ||
      role === 'academic' ||
      (role.startsWith('academic_') &&
        role !== 'teacher' &&
        role !== 'accountant' &&
        role !== 'admissions')
  )
);

interface TeacherAuthenticatedRequest extends Request {
  teacherAuth?: {
    supabaseAdmin: SupabaseClient;
    callerId: string;
    callerUsername: string;
    callerFullName: string;
    callerCampusId: string;
    clientIp: string;
    teacher: {
      id: string;
      name: string;
      code: string;
      campus_id: string;
    };
  };
}

interface CheckinStaffAuthenticatedRequest extends Request {
  checkinStaff?: {
    supabaseAdmin: SupabaseClient;
    scannerId: string;
    scannerUsername: string;
    scannerFullName: string;
    scannerRole: string;
    scannerCampusId: string;
    clientIp: string;
  };
}

const teacherQrRateLimitMap = new Map<string, number[]>();
const checkinScanRateLimitMap = new Map<string, number[]>();
const checkinManualRateLimitMap = new Map<string, number[]>();
let lastNonceCleanupAt = 0;

async function requireTeacher(
  req: Request,
  res: Response,
  next: express.NextFunction
): Promise<void> {
  const clientIp = getClientIpFromReq(req);
  const supabaseAdmin = getServerSupabaseAdmin();
  const authHeader = String(req.headers.authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    res.status(401).json({ error: 'Thiếu Bearer token xác thực.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'Bearer token không hợp lệ.' });
    return;
  }
  if (!supabaseAdmin) {
    res.status(500).json({ error: 'Máy chủ chưa được cấu hình SUPABASE_SERVICE_ROLE_KEY.' });
    return;
  }

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    return;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, full_name, role, campus_id, status, linked_teacher_id')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile || profile.status !== 'active') {
    res.status(401).json({ error: 'Tài khoản không hợp lệ hoặc đã bị khóa.' });
    return;
  }

  if (profile.role !== 'teacher') {
    res.status(403).json({ error: 'Chỉ tài khoản Giáo viên mới được sử dụng chức năng này.' });
    return;
  }

  const linkedTeacherId = String(profile.linked_teacher_id || '').trim();
  if (!linkedTeacherId) {
    res.status(403).json({
      error: 'Tài khoản giáo viên chưa được liên kết với hồ sơ giáo viên (linked_teacher_id).',
    });
    return;
  }

  const { data: teacherRow, error: teacherError } = await supabaseAdmin
    .from('teachers')
    .select('id, code, name, campus_id, status')
    .eq('id', linkedTeacherId)
    .single();

  if (teacherError || !teacherRow || teacherRow.status !== 'active') {
    res.status(403).json({
      error: 'Hồ sơ giáo viên không tồn tại hoặc đang ngưng hoạt động.',
    });
    return;
  }

  (req as TeacherAuthenticatedRequest).teacherAuth = {
    supabaseAdmin,
    callerId: userData.user.id,
    callerUsername: String(profile.username || userData.user.email || 'teacher'),
    callerFullName: String(profile.full_name || teacherRow.name || 'Giáo viên'),
    callerCampusId: String(profile.campus_id || teacherRow.campus_id || 'all'),
    clientIp,
    teacher: {
      id: String(teacherRow.id),
      name: String(teacherRow.name || profile.full_name || ''),
      code: String(teacherRow.code || teacherRow.id),
      campus_id: String(teacherRow.campus_id || profile.campus_id || 'camp_pmh'),
    },
  };

  next();
}

async function requireCheckinStaff(
  req: Request,
  res: Response,
  next: express.NextFunction
): Promise<void> {
  const clientIp = getClientIpFromReq(req);
  const supabaseAdmin = getServerSupabaseAdmin();
  const authHeader = String(req.headers.authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    res.status(401).json({ error: 'Thiếu Bearer token xác thực.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'Bearer token không hợp lệ.' });
    return;
  }
  if (!supabaseAdmin) {
    res.status(500).json({ error: 'Máy chủ chưa được cấu hình SUPABASE_SERVICE_ROLE_KEY.' });
    return;
  }

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    return;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, full_name, role, campus_id, status')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile || profile.status !== 'active') {
    res.status(401).json({ error: 'Tài khoản không hợp lệ hoặc đã bị khóa.' });
    return;
  }

  const role = String(profile.role || '').trim();
  if (!CHECKIN_STAFF_ALLOWED_ROLES.has(role)) {
    res.status(403).json({
      error:
        'Từ chối truy cập: Chỉ Super Admin, Quản lý cơ sở hoặc Chuyên viên Học vụ mới có quyền thực hiện check-in giáo viên.',
    });
    return;
  }

  (req as CheckinStaffAuthenticatedRequest).checkinStaff = {
    supabaseAdmin,
    scannerId: String(profile.id),
    scannerUsername: String(profile.username || userData.user.email || 'staff'),
    scannerFullName: String(profile.full_name || profile.username || 'Nhân sự Học vụ'),
    scannerRole: role,
    scannerCampusId: String(profile.campus_id || 'all'),
    clientIp,
  };

  next();
}

function getVietnamClock(now = new Date()): {
  dateStr: string;
  timeStr: string;
  currentMinutes: number;
  weekdayIndex: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const year = partMap.year || '2026';
  const month = partMap.month || '01';
  const day = partMap.day || '01';
  let hour = Number(partMap.hour || 0);
  if (hour === 24) hour = 0;
  const minute = Number(partMap.minute || 0);

  const dateStr = `${year}-${month}-${day}`;
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const currentMinutes = hour * 60 + minute;
  const utcMidday = new Date(`${dateStr}T12:00:00Z`);
  const weekdayIndex = utcMidday.getUTCDay();

  return {
    dateStr,
    timeStr,
    currentMinutes,
    weekdayIndex,
  };
}

function parseDayTokenToWeekdayIndex(token: string): number | null {
  const clean = String(token || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!clean) return null;
  if (clean === 'CN' || clean === 'SUN' || clean === 'SUNDAY' || clean === 'T8' || clean === 'CHỦNHẬT') return 0;
  if (clean === 'T2' || clean === 'MON' || clean === 'MONDAY' || clean === '2' || clean === 'THỨ2') return 1;
  if (clean === 'T3' || clean === 'TUE' || clean === 'TUESDAY' || clean === '3' || clean === 'THỨ3') return 2;
  if (clean === 'T4' || clean === 'WED' || clean === 'WEDNESDAY' || clean === '4' || clean === 'THỨ4') return 3;
  if (clean === 'T5' || clean === 'THU' || clean === 'THURSDAY' || clean === '5' || clean === 'THỨ5') return 4;
  if (clean === 'T6' || clean === 'FRI' || clean === 'FRIDAY' || clean === '6' || clean === 'THỨ6') return 5;
  if (clean === 'T7' || clean === 'SAT' || clean === 'SATURDAY' || clean === '7' || clean === 'THỨ7') return 6;
  return null;
}

function parseTimeHmmToMinutes(rawTime?: string | null, fallbackMinutes = 16 * 60 + 30): {
  formatted: string;
  minutes: number;
} {
  const clean = String(rawTime || '').trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    const h = Math.floor(fallbackMinutes / 60);
    const m = fallbackMinutes % 60;
    return {
      formatted: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      minutes: fallbackMinutes,
    };
  }
  const h = Math.min(23, Math.max(0, Number(match[1])));
  const m = Math.min(59, Math.max(0, Number(match[2])));
  return {
    formatted: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    minutes: h * 60 + m,
  };
}

// 3) GET /api/teacher/checkin-qr (requireTeacher, giới hạn 6 lần/phút/giáo viên)
app.get('/api/teacher/checkin-qr', requireTeacher, async (req: Request, res: Response) => {
  try {
    const auth = (req as TeacherAuthenticatedRequest).teacherAuth!;
    const teacher = auth.teacher;

    const rateCheck = checkSlidingWindowRateLimit(
      teacherQrRateLimitMap,
      `teacher_qr:${teacher.id}`,
      60 * 1000,
      6
    );
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
      res.status(429).json({
        error: `Bạn đã làm mới mã QR quá nhiều lần (tối đa 6 lần/phút). Vui lòng đợi ${rateCheck.retryAfterSec} giây.`,
      });
      return;
    }

    const { token, payload } = signCheckinToken({ teacherId: teacher.id });
    const issuedAtIso = new Date(payload.iat * 1000).toISOString();
    const expiresAtIso = new Date(payload.exp * 1000).toISOString();
    const serverTimeIso = new Date().toISOString();

    res.json({
      token,
      issued_at: issuedAtIso,
      expires_at: expiresAtIso,
      refresh_in: 60,
      server_time: serverTimeIso,
      teacher: {
        id: teacher.id,
        name: teacher.name,
        code: teacher.code,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || 'Không thể khởi tạo mã QR check-in.',
    });
  }
});

// 4) POST /api/checkin/scan { qr } (requireCheckinStaff, giới hạn 30 lần/phút/người quét)
app.post('/api/checkin/scan', requireCheckinStaff, async (req: Request, res: Response) => {
  try {
    const staff = (req as CheckinStaffAuthenticatedRequest).checkinStaff!;
    const { supabaseAdmin, scannerId, scannerUsername, scannerFullName, scannerRole, scannerCampusId, clientIp } =
      staff;

    const rateCheck = checkSlidingWindowRateLimit(
      checkinScanRateLimitMap,
      `checkin_scan:${scannerId}`,
      60 * 1000,
      30
    );
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
      res.status(429).json({
        error: `Đã vượt giới hạn quét QR (tối đa 30 lần/phút). Vui lòng thử lại sau ${rateCheck.retryAfterSec} giây.`,
      });
      return;
    }

    const rawQr = String(req.body?.qr || '').trim();
    if (!rawQr) {
      res.status(400).json({ error: 'Mã QR không hợp lệ' });
      return;
    }

    // a. Xác thực token
    const verified = verifyCheckinToken(rawQr);
    if (!verified.ok) {
      const msg =
        verified.reason === 'expired'
          ? 'Mã QR đã hết hạn, nhờ giáo viên làm mới'
          : 'Mã QR không hợp lệ';
      res.status(400).json({ error: msg });
      return;
    }

    const { payload } = verified;
    const { data: teacherRow, error: teacherErr } = await supabaseAdmin
      .from('teachers')
      .select('id, code, name, campus_id, status')
      .eq('id', payload.t)
      .single();

    if (teacherErr || !teacherRow || teacherRow.status !== 'active') {
      res.status(400).json({ error: 'Mã QR không hợp lệ' });
      return;
    }

    const teacher = {
      id: String(teacherRow.id),
      name: String(teacherRow.name || ''),
      code: String(teacherRow.code || teacherRow.id),
      campus_id: String(teacherRow.campus_id || 'camp_pmh'),
    };

    const now = new Date();
    const nowIso = now.toISOString();

    // Dọn dẹp định kỳ các nonce cũ hơn 2 ngày
    if (Date.now() - lastNonceCleanupAt > 10 * 60 * 1000) {
      lastNonceCleanupAt = Date.now();
      const twoDaysAgoIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      Promise.resolve(
        supabaseAdmin.from('teacher_checkin_nonces').delete().lt('issued_at', twoDaysAgoIso)
      ).catch(() => {});
    }

    // b. Ghi jti vào teacher_checkin_nonces; nếu trùng khóa trả 409 "Mã QR này đã được dùng"
    const { error: nonceErr } = await supabaseAdmin.from('teacher_checkin_nonces').insert({
      jti: payload.j,
      teacher_id: teacher.id,
      issued_at: new Date(payload.iat * 1000).toISOString(),
      used_at: nowIso,
      used_by: scannerId,
    });

    if (nonceErr) {
      const errCode = String(nonceErr.code || '');
      const errMsg = String(nonceErr.message || '').toLowerCase();
      if (errCode === '23505' || errMsg.includes('duplicate') || errMsg.includes('unique')) {
        res.status(409).json({ error: 'Mã QR này đã được dùng' });
        return;
      }
      res.status(500).json({ error: 'Không thể lưu trạng thái mã QR: ' + nonceErr.message });
      return;
    }

    // c. Lấy ngày và giờ hiện tại theo múi giờ Asia/Ho_Chi_Minh từ đồng hồ server
    const { dateStr: todayDate, currentMinutes, weekdayIndex } = getVietnamClock(now);

    // d. Tìm các lớp hôm nay của giáo viên
    const [classesRes, slotsRes, holidaysRes, sessionStaffRes] = await Promise.all([
      supabaseAdmin
        .from('extracurricular_classes')
        .select(
          'id, code, name, campus_id, time_slot_id, days_of_week, start_date, end_date, primary_teacher_id, term_distribution, status'
        )
        .eq('status', 'active'),
      supabaseAdmin
        .from('time_slots')
        .select('id, code, name, start_time, end_time, days_of_week, status'),
      supabaseAdmin
        .from('holidays')
        .select('id, start_date, end_date, campus_id, status')
        .eq('status', 'active')
        .lte('start_date', todayDate)
        .gte('end_date', todayDate),
      Promise.resolve(
        supabaseAdmin
          .from('class_session_staff')
          .select('class_id, session_date, primary_teacher_id, assistant_teacher_ids')
          .eq('session_date', todayDate)
      ).catch(() => ({ data: null, error: null })),
    ]);

    const allActiveClasses = Array.isArray(classesRes.data) ? classesRes.data : [];
    const allSlots = Array.isArray(slotsRes.data) ? slotsRes.data : [];
    const activeHolidaysToday = Array.isArray(holidaysRes.data) ? holidaysRes.data : [];
    const sessionStaffRows = Array.isArray(sessionStaffRes?.data) ? sessionStaffRes.data : [];

    const slotById = new Map<string, any>();
    for (const s of allSlots) {
      if (s && s.id) slotById.set(String(s.id), s);
    }

    const sessionStaffByClassId = new Map<string, any>();
    for (const row of sessionStaffRows) {
      if (row && row.class_id) {
        sessionStaffByClassId.set(String(row.class_id), row);
      }
    }

    const isHolidayForCampus = (rawCampusId?: string | null): boolean => {
      const normClassCampus = normalizeCampusCodeForServer(rawCampusId || 'all');
      return activeHolidaysToday.some(h => {
        const normHolidayCampus = normalizeCampusCodeForServer(h.campus_id || 'all');
        return (
          !h.campus_id ||
          normHolidayCampus === 'all' ||
          normHolidayCampus === normClassCampus
        );
      });
    };

    const teacherClassesToday = allActiveClasses.filter(cls => {
      if (!cls || !cls.id) return false;
      if (cls.start_date && String(cls.start_date) > todayDate) return false;
      if (cls.end_date && String(cls.end_date) < todayDate) return false;
      if (isHolidayForCampus(cls.campus_id)) return false;

      const slot = cls.time_slot_id ? slotById.get(String(cls.time_slot_id)) : null;
      const rawDays: string[] =
        Array.isArray(cls.days_of_week) && cls.days_of_week.length > 0
          ? cls.days_of_week
          : Array.isArray(slot?.days_of_week)
          ? slot.days_of_week
          : [];

      const matchesWeekday = rawDays.some(
        d => parseDayTokenToWeekdayIndex(d) === weekdayIndex
      );
      if (!matchesWeekday) return false;

      const staffOverride = sessionStaffByClassId.get(String(cls.id));
      if (staffOverride) {
        const isPrimary = String(staffOverride.primary_teacher_id || '') === teacher.id;
        const isAssistant =
          Array.isArray(staffOverride.assistant_teacher_ids) &&
          staffOverride.assistant_teacher_ids.map(String).includes(teacher.id);
        return isPrimary || isAssistant;
      }

      const td = cls.term_distribution && typeof cls.term_distribution === 'object' ? cls.term_distribution : {};
      return (
        String(cls.primary_teacher_id || '') === teacher.id ||
        String(td.secondary_teacher_1 || '') === teacher.id ||
        String(td.secondary_teacher_2 || '') === teacher.id ||
        String(td.secondary_teacher_3 || '') === teacher.id
      );
    });

    const scannerCampusNorm = normalizeCampusCodeForServer(scannerCampusId);
    const isScannerAllCampus = scannerRole === 'super_admin' || scannerCampusNorm === 'all';

    const results: Array<{
      class_id: string | null;
      class_code: string;
      class_name: string;
      start: string | null;
      end: string | null;
      status: 'on_time' | 'late' | 'no_class';
      late_minutes: number;
      already: boolean;
      checked_in_at: string | null;
      skipped_reason?: string;
    }> = [];

    // g. Nếu hôm nay giáo viên không có lớp nào: ghi một dòng teacher_checkins với class_id rỗng, status = 'no_class'
    if (teacherClassesToday.length === 0) {
      const noClassId = crypto.randomUUID();
      const noClassCampus = teacher.campus_id || scannerCampusId || null;
      await supabaseAdmin.from('teacher_checkins').insert({
        id: noClassId,
        teacher_id: teacher.id,
        campus_id: noClassCampus,
        class_id: null,
        session_date: todayDate,
        checked_in_at: nowIso,
        scheduled_start: null,
        late_minutes: 0,
        status: 'no_class',
        method: 'qr',
        scanned_by: scannerId,
        scanner_name: scannerFullName,
        token_jti: payload.j,
        note: 'Không có lịch dạy hôm nay',
      });

      results.push({
        class_id: null,
        class_code: 'NO_CLASS',
        class_name: 'Không có ca dạy hôm nay',
        start: null,
        end: null,
        status: 'no_class',
        late_minutes: 0,
        already: false,
        checked_in_at: nowIso,
      });
    } else {
      for (const cls of teacherClassesToday) {
        const classId = String(cls.id);
        const classCode = String(cls.code || cls.id);
        const className = String(cls.name || classCode);
        const slot = cls.time_slot_id ? slotById.get(String(cls.time_slot_id)) : null;
        const startParsed = parseTimeHmmToMinutes(slot?.start_time, 16 * 60 + 30);
        const endParsed = parseTimeHmmToMinutes(slot?.end_time, 18 * 60);

        // e. Kiểm tra cơ sở của người quét
        const classCampusNorm = normalizeCampusCodeForServer(cls.campus_id);
        if (!isScannerAllCampus && classCampusNorm !== scannerCampusNorm) {
          results.push({
            class_id: classId,
            class_code: classCode,
            class_name: className,
            start: startParsed.formatted,
            end: endParsed.formatted,
            status: 'on_time',
            late_minutes: 0,
            already: false,
            checked_in_at: null,
            skipped_reason: 'Lớp thuộc cơ sở khác ngoài phạm vi phụ trách',
          });
          continue;
        }

        // f. Nếu đã kết thúc (giờ hiện tại > end) thì không check-in
        if (currentMinutes > endParsed.minutes) {
          results.push({
            class_id: classId,
            class_code: classCode,
            class_name: className,
            start: startParsed.formatted,
            end: endParsed.formatted,
            status: 'late',
            late_minutes: Math.max(0, currentMinutes - startParsed.minutes),
            already: false,
            checked_in_at: null,
            skipped_reason: 'Lớp học đã kết thúc',
          });
          continue;
        }

        const lateMinutes = Math.max(0, currentMinutes - startParsed.minutes);
        const status: 'on_time' | 'late' =
          lateMinutes > CHECKIN_LATE_GRACE_MIN ? 'late' : 'on_time';

        // Kiểm tra đã có bản ghi (teacher_id, class_id, session_date) chưa
        const { data: existingRow } = await supabaseAdmin
          .from('teacher_checkins')
          .select('id, status, late_minutes, checked_in_at, scheduled_start')
          .eq('teacher_id', teacher.id)
          .eq('class_id', classId)
          .eq('session_date', todayDate)
          .maybeSingle();

        if (existingRow) {
          results.push({
            class_id: classId,
            class_code: classCode,
            class_name: className,
            start: existingRow.scheduled_start || startParsed.formatted,
            end: endParsed.formatted,
            status: existingRow.status === 'late' ? 'late' : 'on_time',
            late_minutes: Number(existingRow.late_minutes || 0),
            already: true,
            checked_in_at: String(existingRow.checked_in_at || nowIso),
          });
          continue;
        }

        const newCheckinId = crypto.randomUUID();
        const { data: insertedRow, error: insertErr } = await supabaseAdmin
          .from('teacher_checkins')
          .insert({
            id: newCheckinId,
            teacher_id: teacher.id,
            campus_id: cls.campus_id || teacher.campus_id || null,
            class_id: classId,
            session_date: todayDate,
            checked_in_at: nowIso,
            scheduled_start: startParsed.formatted,
            late_minutes: lateMinutes,
            status,
            method: 'qr',
            scanned_by: scannerId,
            scanner_name: scannerFullName,
            token_jti: payload.j,
            note: null,
          })
          .select('id, status, late_minutes, checked_in_at')
          .maybeSingle();

        if (insertErr) {
          // Trường hợp race condition chạm unique (teacher_id, class_id, session_date)
          const { data: raceRow } = await supabaseAdmin
            .from('teacher_checkins')
            .select('id, status, late_minutes, checked_in_at, scheduled_start')
            .eq('teacher_id', teacher.id)
            .eq('class_id', classId)
            .eq('session_date', todayDate)
            .maybeSingle();

          if (raceRow) {
            results.push({
              class_id: classId,
              class_code: classCode,
              class_name: className,
              start: raceRow.scheduled_start || startParsed.formatted,
              end: endParsed.formatted,
              status: raceRow.status === 'late' ? 'late' : 'on_time',
              late_minutes: Number(raceRow.late_minutes || 0),
              already: true,
              checked_in_at: String(raceRow.checked_in_at || nowIso),
            });
            continue;
          }
        }

        results.push({
          class_id: classId,
          class_code: classCode,
          class_name: className,
          start: startParsed.formatted,
          end: endParsed.formatted,
          status: insertedRow?.status === 'late' ? 'late' : status,
          late_minutes: Number(insertedRow?.late_minutes ?? lateMinutes),
          already: false,
          checked_in_at: String(insertedRow?.checked_in_at || nowIso),
        });
      }
    }

    // h. Ghi audit_logs (action_code: 'TEACHER_CHECKIN_SCAN')
    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/checkin/scan',
      actionCode: 'TEACHER_CHECKIN_SCAN',
      ip: clientIp,
      callerId: scannerId,
      callerUsername: scannerUsername,
      callerFullName: scannerFullName,
      callerRole: scannerRole,
      callerCampusId: scannerCampusId,
      category: 'ACADEMIC',
      moduleName: 'Check-in Giáo Viên (QR)',
      targetId: teacher.id,
      status: 'success',
      description: `${scannerFullName} quét mã QR check-in cho giáo viên ${teacher.name} (${teacher.code}) ngày ${todayDate}`,
      details: {
        teacher_id: teacher.id,
        teacher_code: teacher.code,
        teacher_name: teacher.name,
        session_date: todayDate,
        token_jti: payload.j,
        results,
      },
    });

    const checkedInCount = results.filter(r => !r.skipped_reason && r.status !== 'no_class').length;
    const message =
      teacherClassesToday.length === 0
        ? `Giáo viên ${teacher.name} không có lịch dạy hôm nay (đã ghi nhận check-in không ca dạy).`
        : checkedInCount > 0
        ? `Đã xác nhận check-in cho giáo viên ${teacher.name} (${checkedInCount} lớp).`
        : `Không có lớp nào được check-in mới cho giáo viên ${teacher.name}.`;

    res.json({
      teacher,
      server_time: nowIso,
      results,
      message,
    });
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || 'Lỗi máy chủ khi xử lý quét mã QR check-in.',
    });
  }
});

// 5) POST /api/checkin/manual { teacher_id, class_id, session_date?, reason } (requireCheckinStaff, giới hạn 20 lần/phút)
app.post('/api/checkin/manual', requireCheckinStaff, async (req: Request, res: Response) => {
  try {
    const staff = (req as CheckinStaffAuthenticatedRequest).checkinStaff!;
    const { supabaseAdmin, scannerId, scannerUsername, scannerFullName, scannerRole, scannerCampusId, clientIp } =
      staff;

    const rateCheck = checkSlidingWindowRateLimit(
      checkinManualRateLimitMap,
      `checkin_manual:${scannerId}`,
      60 * 1000,
      20
    );
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
      res.status(429).json({
        error: `Đã vượt giới hạn check-in thủ công (tối đa 20 lần/phút). Vui lòng thử lại sau ${rateCheck.retryAfterSec} giây.`,
      });
      return;
    }

    const teacherId = String(req.body?.teacher_id || '').trim();
    const classId = String(req.body?.class_id || '').trim();
    const rawSessionDate = String(req.body?.session_date || '').trim();
    const reason = String(req.body?.reason || '').trim();

    if (!teacherId || !classId) {
      res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ teacher_id và class_id.' });
      return;
    }

    if (reason.length < 5) {
      res.status(400).json({ error: 'Lý do check-in thủ công (reason) phải có ít nhất 5 ký tự.' });
      return;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const { dateStr: todayDate, currentMinutes } = getVietnamClock(now);
    const targetDate = rawSessionDate || todayDate;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      res.status(400).json({ error: 'Định dạng ngày buổi học (session_date) không hợp lệ (YYYY-MM-DD).' });
      return;
    }

    const isManagerOrSuperAdmin =
      scannerRole === 'super_admin' || scannerRole === 'campus_manager';

    if (!isManagerOrSuperAdmin) {
      if (targetDate !== todayDate) {
        res.status(403).json({
          error: 'Chuyên viên Học vụ chỉ được phép check-in thủ công cho ngày hôm nay.',
        });
        return;
      }
    } else {
      const todayMs = new Date(`${todayDate}T00:00:00Z`).getTime();
      const targetMs = new Date(`${targetDate}T00:00:00Z`).getTime();
      const diffDays = Math.round((todayMs - targetMs) / (24 * 60 * 60 * 1000));
      if (diffDays < 0 || diffDays > 7) {
        res.status(400).json({
          error: 'Chỉ được phép chọn ngày check-in thủ công trong vòng 7 ngày gần nhất tính đến hôm nay.',
        });
        return;
      }
    }

    const [{ data: teacherRow, error: teacherErr }, { data: clsRow, error: clsErr }] =
      await Promise.all([
        supabaseAdmin
          .from('teachers')
          .select('id, code, name, campus_id, status')
          .eq('id', teacherId)
          .single(),
        supabaseAdmin
          .from('extracurricular_classes')
          .select('id, code, name, campus_id, time_slot_id, status')
          .eq('id', classId)
          .single(),
      ]);

    if (teacherErr || !teacherRow || teacherRow.status !== 'active') {
      res.status(404).json({ error: 'Không tìm thấy giáo viên hoặc giáo viên đang ngưng hoạt động.' });
      return;
    }

    if (clsErr || !clsRow) {
      res.status(404).json({ error: 'Không tìm thấy lớp học.' });
      return;
    }

    // Quy tắc cơ sở như mục 4e
    const scannerCampusNorm = normalizeCampusCodeForServer(scannerCampusId);
    const classCampusNorm = normalizeCampusCodeForServer(clsRow.campus_id);
    if (
      scannerRole !== 'super_admin' &&
      scannerCampusNorm !== 'all' &&
      classCampusNorm !== scannerCampusNorm
    ) {
      res.status(403).json({
        error: 'Từ chối thao tác: Lớp học thuộc cơ sở khác ngoài phạm vi quản lý của bạn.',
      });
      return;
    }

    let scheduledStart = '16:30';
    let scheduledEnd = '18:00';
    let startMinutes = 16 * 60 + 30;
    if (clsRow.time_slot_id) {
      const { data: slotRow } = await supabaseAdmin
        .from('time_slots')
        .select('start_time, end_time')
        .eq('id', clsRow.time_slot_id)
        .maybeSingle();
      if (slotRow) {
        const sParsed = parseTimeHmmToMinutes(slotRow.start_time, 16 * 60 + 30);
        const eParsed = parseTimeHmmToMinutes(slotRow.end_time, 18 * 60);
        scheduledStart = sParsed.formatted;
        scheduledEnd = eParsed.formatted;
        startMinutes = sParsed.minutes;
      }
    }

    // Kiểm tra đã có bản ghi (teacher_id, class_id, session_date) chưa
    const { data: existingRow } = await supabaseAdmin
      .from('teacher_checkins')
      .select('*')
      .eq('teacher_id', teacherId)
      .eq('class_id', classId)
      .eq('session_date', targetDate)
      .maybeSingle();

    if (existingRow) {
      res.json({
        teacher: {
          id: String(teacherRow.id),
          name: String(teacherRow.name || ''),
          code: String(teacherRow.code || teacherRow.id),
        },
        server_time: nowIso,
        checkin: existingRow,
        already: true,
        results: [
          {
            class_id: String(clsRow.id),
            class_code: String(clsRow.code || clsRow.id),
            class_name: String(clsRow.name || clsRow.id),
            start: existingRow.scheduled_start || scheduledStart,
            end: scheduledEnd,
            status: existingRow.status === 'late' ? 'late' : 'on_time',
            late_minutes: Number(existingRow.late_minutes || 0),
            already: true,
            checked_in_at: String(existingRow.checked_in_at || nowIso),
          },
        ],
        message: 'Lớp học này đã được check-in trước đó.',
      });
      return;
    }

    // super_admin và campus_manager được chọn ngày trong 7 ngày gần nhất (late 0);
    // Học vụ chọn hôm nay tính theo giờ server
    const lateMinutes = isManagerOrSuperAdmin
      ? 0
      : Math.max(0, currentMinutes - startMinutes);
    const status: 'on_time' | 'late' =
      lateMinutes > CHECKIN_LATE_GRACE_MIN ? 'late' : 'on_time';

    const newCheckinId = crypto.randomUUID();
    const insertPayload = {
      id: newCheckinId,
      teacher_id: teacherId,
      campus_id: clsRow.campus_id || teacherRow.campus_id || null,
      class_id: classId,
      session_date: targetDate,
      checked_in_at: nowIso,
      scheduled_start: scheduledStart,
      late_minutes: lateMinutes,
      status,
      method: 'manual' as const,
      scanned_by: scannerId,
      scanner_name: scannerFullName,
      token_jti: null,
      note: reason,
    };

    const { data: insertedRow, error: insertErr } = await supabaseAdmin
      .from('teacher_checkins')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertErr) {
      res.status(500).json({
        error: 'Không thể lưu bản ghi check-in thủ công: ' + insertErr.message,
      });
      return;
    }

    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/checkin/manual',
      actionCode: 'TEACHER_CHECKIN_MANUAL',
      ip: clientIp,
      callerId: scannerId,
      callerUsername: scannerUsername,
      callerFullName: scannerFullName,
      callerRole: scannerRole,
      callerCampusId: scannerCampusId,
      category: 'ACADEMIC',
      moduleName: 'Check-in Giáo Viên (Thủ Công)',
      targetId: teacherId,
      status: 'success',
      description: `${scannerFullName} check-in thủ công cho giáo viên ${teacherRow.name} tại lớp ${clsRow.name} (ngày ${targetDate}): ${reason}`,
      details: {
        teacher_id: teacherId,
        teacher_name: teacherRow.name,
        class_id: classId,
        class_name: clsRow.name,
        session_date: targetDate,
        late_minutes: lateMinutes,
        status,
        reason,
      },
    });

    res.json({
      teacher: {
        id: String(teacherRow.id),
        name: String(teacherRow.name || ''),
        code: String(teacherRow.code || teacherRow.id),
      },
      server_time: nowIso,
      checkin: insertedRow || insertPayload,
      already: false,
      results: [
        {
          class_id: String(clsRow.id),
          class_code: String(clsRow.code || clsRow.id),
          class_name: String(clsRow.name || clsRow.id),
          start: scheduledStart,
          end: scheduledEnd,
          status,
          late_minutes: lateMinutes,
          already: false,
          checked_in_at: String(insertedRow?.checked_in_at || nowIso),
        },
      ],
      message: `Đã check-in thủ công cho giáo viên ${teacherRow.name} tại lớp ${clsRow.name}.`,
    });
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || 'Lỗi máy chủ khi xử lý check-in thủ công.',
    });
  }
});

// 6) POST /api/admin/backup-audit { format, complete, checksum, warnings, tables: [{ name, expected, exported }] } (chỉ super_admin)
app.post('/api/admin/backup-audit', async (req: Request, res: Response) => {
  try {
    const auth = await verifySuperAdminRequest(
      req,
      res,
      '/api/admin/backup-audit',
      'BACKUP_EXPORT'
    );
    if (!auth) return;

    const { supabaseAdmin, callerId, callerUsername, callerFullName, callerRole, callerCampusId, clientIp } =
      auth;

    const format = String(req.body?.format || 'json').trim();
    const complete = Boolean(req.body?.complete);
    const checksum = String(req.body?.checksum || '').trim();
    const warnings = Array.isArray(req.body?.warnings) ? req.body.warnings.map(String) : [];
    const tablesRaw = Array.isArray(req.body?.tables) ? req.body.tables : [];

    const normalizedTables = tablesRaw.map((t: any) => ({
      name: String(t?.name || ''),
      expected: Number(t?.expected || 0),
      exported: Number(t?.exported || 0),
    }));

    const totalExpected = normalizedTables.reduce((sum: number, t: any) => sum + t.expected, 0);
    const totalExported = normalizedTables.reduce((sum: number, t: any) => sum + t.exported, 0);
    const tableSummaryText = normalizedTables
      .map((t: any) => `${t.name}: ${t.exported}/${t.expected}`)
      .join(', ');

    await recordAdminEndpointAudit({
      supabaseAdmin,
      endpoint: '/api/admin/backup-audit',
      actionCode: 'BACKUP_EXPORT',
      ip: clientIp,
      callerId,
      callerUsername,
      callerFullName,
      callerRole,
      callerCampusId,
      category: 'SYSTEM',
      moduleName: 'Sao Lưu Hệ Thống (Backup Audit)',
      targetId: checksum || format,
      status: complete ? 'success' : 'failed',
      description: `Sao lưu dữ liệu định dạng ${format.toUpperCase()} (${
        complete ? 'Hoàn tất' : 'Chưa đầy đủ'
      }) — Tổng ${totalExported}/${totalExpected} dòng [${tableSummaryText}]`,
      details: {
        format,
        complete,
        checksum,
        warnings,
        total_expected: totalExpected,
        total_exported: totalExported,
        tables: normalizedTables,
      },
    });

    res.json({
      success: true,
      format,
      complete,
      total_expected: totalExpected,
      total_exported: totalExported,
    });
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || 'Lỗi ghi nhật ký kiểm toán sao lưu dữ liệu.',
    });
  }
});

// Dev vs Prod Vite handling
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Royal School Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
