import express from 'express';
import type { Request, Response } from 'express';
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

// Server-Side Uploads & Internal Data Directories
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PROOFS_DIR = path.join(UPLOADS_DIR, 'proofs');
const STUDENTS_DIR = path.join(UPLOFS_DIR_FALLBACK(), 'students');
function UPLOFS_DIR_FALLBACK() {
  return UPLOADS_DIR;
}
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(PROOFS_DIR)) fs.mkdirSync(PROOFS_DIR, { recursive: true });
if (!fs.existsSync(STUDENTS_DIR)) fs.mkdirSync(STUDENTS_DIR, { recursive: true });
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

// Tuyệt đối không phục vụ file .log và chỉ phục vụ thư mục ảnh (proofs, students)
app.use('/uploads', (req: Request, res: Response, next) => {
  if (req.path.toLowerCase().endsWith('.log')) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  next();
});
app.use(
  '/uploads/proofs',
  express.static(PROOFS_DIR, {
    dotfiles: 'deny',
    index: false,
  })
);
app.use(
  '/uploads/students',
  express.static(STUDENTS_DIR, {
    dotfiles: 'deny',
    index: false,
  })
);
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
const DEFAULT_SERVER_SUPABASE_URL = 'https://wobszxqzlalzcjcfbzhq.supabase.co';

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
        actor_role: 'super_admin',
        actor_campus: 'all',
        ip_address: auditEntry.ip_address,
        action_code: auditEntry.action_code,
        category: 'SYSTEM',
        module: 'Quản Trị Tài Khoản (Server API)',
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

function getServerSupabaseAdmin(): SupabaseClient | null {
  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    DEFAULT_SERVER_SUPABASE_URL
  ).trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
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

async function verifySuperAdminRequest(
  req: Request,
  res: Response,
  endpointName: string,
  actionCode: string
): Promise<{
  supabaseAdmin: SupabaseClient;
  callerId: string;
  callerUsername: string;
  callerFullName: string;
  clientIp: string;
} | null> {
  const clientIp = getClientIpFromReq(req);
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

  if (caller.callerRole !== 'super_admin') {
    await recordAdminEndpointAudit({
      supabaseAdmin: caller.supabaseAdmin,
      endpoint: endpointName,
      actionCode,
      ip: clientIp,
      callerId: caller.callerId,
      callerUsername: caller.callerUsername,
      callerFullName: caller.callerFullName,
      status: 'failed',
      description: `Từ chối phân quyền tại ${endpointName}: Người gọi không phải super_admin đang active`,
    });
    res.status(403).json({
      error: 'Từ chối truy cập: Chỉ tài khoản Super Admin đang hoạt động mới có quyền thực hiện thao tác này.',
    });
    return null;
  }

  return {
    supabaseAdmin: caller.supabaseAdmin,
    callerId: caller.callerId,
    callerUsername: caller.callerUsername,
    callerFullName: caller.callerFullName,
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

app.post('/api/admin/create-user', async (req: Request, res: Response) => {
  try {
    const verified = await verifySuperAdminRequest(
      req,
      res,
      '/api/admin/create-user',
      'ADMIN_API_CREATE_USER'
    );
    if (!verified) return;
    const { supabaseAdmin, callerId, callerUsername, callerFullName, clientIp } = verified;

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

    const { data: createdAuth, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: cleanPassword,
      email_confirm: true,
      user_metadata: {
        username: cleanUsername,
        full_name: cleanFullName,
        role: cleanRole,
        campus_id: normalizedCampus,
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

    const profileRow = {
      id: createdAuth.user.id,
      username: cleanUsername,
      full_name: cleanFullName,
      role: cleanRole,
      campus_id: normalizedCampus,
      status: cleanStatus,
      permissions: permissions && typeof permissions === 'object' ? permissions : {},
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
      description: `Super Admin ${callerFullName} (@${callerUsername}) đã tạo tài khoản mới ${cleanUsername} (${cleanFullName}, vai trò: ${cleanRole})`,
      details: {
        created_user_id: createdAuth.user.id,
        username: cleanUsername,
        email: cleanEmail,
        role: cleanRole,
        campus_id: normalizedCampus,
        status: cleanStatus,
      },
    });

    res.json({
      success: true,
      user: {
        ...profileRow,
        email: cleanEmail,
        phone: String(phone || '').trim(),
        department: String(department || '').trim(),
        linked_teacher_id: linked_teacher_id ? String(linked_teacher_id) : null,
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
      'ADMIN_API_RESET_PASSWORD'
    );
    if (!verified) return;
    const { supabaseAdmin, callerId, callerUsername, callerFullName, clientIp } = verified;

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
      description: `Super Admin ${callerFullName} (@${callerUsername}) đã đặt lại mật khẩu cho user ID ${targetUserId}${username ? ` (@${username})` : ''}`,
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
      'ADMIN_API_UPDATE_USER'
    );
    if (!verified) return;
    const { supabaseAdmin, callerId, callerUsername, callerFullName, clientIp } = verified;

    const { id, userId, username, email, full_name, role, campus_id, status, permissions } =
      req.body || {};

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
      description: `Super Admin ${callerFullName} (@${callerUsername}) đã cập nhật hồ sơ người dùng ${updatedProfile.username || targetUserId}`,
      details: {
        before: {
          full_name: targetProfile.full_name,
          role: targetProfile.role,
          campus_id: targetProfile.campus_id,
          status: targetProfile.status,
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
      'ADMIN_API_DELETE_USER'
    );
    if (!verified) return;
    const { supabaseAdmin, callerId, callerUsername, callerFullName, clientIp } = verified;

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
      description: `Super Admin ${callerFullName} (@${callerUsername}) đã xóa vĩnh viễn người dùng ${targetProfile?.username || username || targetUserId}`,
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

// Endpoint to upload files to Server Storage (Yêu cầu xác thực Bearer token hợp lệ, tối đa 5 MB, chỉ nhận png/jpg/webp/pdf)
app.post('/api/upload', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fileData, fileName, folder = 'proofs' } = req.body || {};

    if (!fileData || typeof fileData !== 'string') {
      res.status(400).json({ error: 'Dữ liệu tệp không hợp lệ.' });
      return;
    }

    if (folder !== 'proofs' && folder !== 'students') {
      res.status(400).json({ error: 'Thư mục lưu trữ không hợp lệ. Chỉ chấp nhận proofs hoặc students.' });
      return;
    }

    const targetFolder = folder === 'students' ? STUDENTS_DIR : PROOFS_DIR;
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
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

    // Nếu cả MIME và phần mở rộng đều có mặt, kiểm tra tính tương thích
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

    const timestamp = Date.now();
    const baseNameWithoutExt = rawFileName
      ? path.basename(rawFileName, path.extname(rawFileName))
      : `proof_${timestamp}`;
    const safeBaseName =
      baseNameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || `proof_${timestamp}`;

    const uniqueFileName = `${timestamp}_${safeBaseName}${finalExtension}`;
    const destinationPath = path.join(targetFolder, uniqueFileName);

    await fs.promises.writeFile(destinationPath, buffer);

    const relativeUrl = `/uploads/${folder}/${uniqueFileName}`;

    console.log(`[Server Storage] File saved successfully: ${destinationPath} (${buffer.length} bytes)`);

    res.json({
      success: true,
      url: relativeUrl,
      fileName: uniqueFileName,
      storedPath: `Server: ${relativeUrl}`,
      size: buffer.length,
      mimeType:
        resolvedMimeType ||
        (finalExtension === '.pdf'
          ? 'application/pdf'
          : finalExtension === '.png'
          ? 'image/png'
          : finalExtension === '.webp'
          ? 'image/webp'
          : 'image/jpeg'),
    });
  } catch (err: any) {
    console.error('[Server Storage] Error saving file to server:', err);
    res.status(500).json({ error: 'Không thể lưu tệp lên server: ' + (err?.message || 'Lỗi không xác định') });
  }
});

// Endpoint to list uploaded files in server (Yêu cầu xác thực Bearer token hợp lệ)
app.get('/api/files/proofs', requireAuth, async (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(PROOFS_DIR)) {
      res.json({ files: [] });
      return;
    }
    const files = await fs.promises.readdir(PROOFS_DIR);
    const validFiles = files.filter((file) =>
      ALLOWED_UPLOAD_EXTENSIONS.has(path.extname(file).toLowerCase())
    );
    const fileStats = await Promise.all(
      validFiles.map(async (file) => {
        const stat = await fs.promises.stat(path.join(PROOFS_DIR, file));
        return {
          fileName: file,
          url: `/uploads/proofs/${file}`,
          size: stat.size,
          createdAt: stat.birthtime,
        };
      })
    );
    res.json({ files: fileStats });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Lỗi đọc danh sách tệp trên server' });
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
