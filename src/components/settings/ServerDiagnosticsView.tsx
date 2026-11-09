import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ShieldAlert,
  Server,
  KeyRound,
  Route,
  Terminal,
} from 'lucide-react';
import { ServerHealthReport, NO_EXPRESS_SERVER_MESSAGE, SERVICE_ROLE_MISSING_MESSAGE } from '../../lib/apiClient';

interface RequiredRouteSpec {
  id: string;
  method: string;
  path: string;
  shortLabel: string;
  description: string;
}

const REQUIRED_IMPORTANT_ROUTES: RequiredRouteSpec[] = [
  {
    id: 'create-user',
    method: 'POST',
    path: '/api/admin/create-user',
    shortLabel: 'create-user',
    description: 'Tạo tài khoản đăng nhập mới (Supabase Auth + profiles)',
  },
  {
    id: 'reset-password',
    method: 'POST',
    path: '/api/admin/reset-password',
    shortLabel: 'reset-password',
    description: 'Đặt lại mật khẩu người dùng qua Admin API',
  },
  {
    id: 'update-user',
    method: 'POST',
    path: '/api/admin/update-user',
    shortLabel: 'update-user',
    description: 'Cập nhật hồ sơ, vai trò, trạng thái khóa tài khoản',
  },
  {
    id: 'delete-user',
    method: 'POST',
    path: '/api/admin/delete-user',
    shortLabel: 'delete-user',
    description: 'Xóa tài khoản người dùng trên Supabase Auth',
  },
  {
    id: 'checkin/scan',
    method: 'POST',
    path: '/api/checkin/scan',
    shortLabel: 'checkin/scan',
    description: 'Quét mã QR check-in giáo viên tại cơ sở',
  },
  {
    id: 'teacher/checkin-qr',
    method: 'GET',
    path: '/api/teacher/checkin-qr',
    shortLabel: 'teacher/checkin-qr',
    description: 'Cấp mã QR động cho Cổng Giáo Viên',
  },
  {
    id: 'parent/login',
    method: 'POST',
    path: '/api/parent/login',
    shortLabel: 'parent/login',
    description: 'Tra cứu & đăng nhập Cổng Phụ Huynh',
  },
];

export const ServerDiagnosticsView: React.FC = () => {
  const [health, setHealth] = useState<ServerHealthReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);

  const runHealthCheck = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      setHttpStatus(response.status);
      const rawText = await response.text();
      let parsed: ServerHealthReport | null = null;
      try {
        const json = JSON.parse(rawText.trim());
        if (json && typeof json === 'object') {
          parsed = json as ServerHealthReport;
        }
      } catch {
        parsed = null;
      }

      if (!response.ok || !parsed || !parsed.ok) {
        setHealth(null);
        setFetchError(NO_EXPRESS_SERVER_MESSAGE);
      } else {
        setHealth(parsed);
        setFetchError(null);
      }
    } catch (err: any) {
      setHealth(null);
      setHttpStatus(0);
      setFetchError(
        err?.message
          ? `${NO_EXPRESS_SERVER_MESSAGE} (${err.message})`
          : NO_EXPRESS_SERVER_MESSAGE
      );
    } finally {
      setLastCheckedAt(new Date().toLocaleTimeString('vi-VN'));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runHealthCheck();
  }, [runHealthCheck]);

  const registeredRoutes = Array.isArray(health?.routes) ? health!.routes! : [];

  const checkRouteExists = (spec: RequiredRouteSpec): boolean => {
    if (!health?.ok) return false;
    const expectedFull = `${spec.method.toUpperCase()} ${spec.path}`.toUpperCase();
    return registeredRoutes.some(r => {
      const norm = String(r || '').trim().toUpperCase();
      return norm === expectedFull || norm.endsWith(` ${spec.path.toUpperCase()}`);
    });
  };

  const serverRespondsOk = Boolean(health?.ok && !fetchError);
  const buildOk = Boolean(health?.build);
  const serviceRoleConfigured = Boolean(health?.serviceRole?.configured);
  const serviceRoleValid = Boolean(health?.serviceRole?.valid);
  const serviceRoleOk = serviceRoleConfigured && serviceRoleValid;
  const parentSecretOk = Boolean(health?.secrets?.parentSession);
  const checkinQrSecretOk = Boolean(health?.secrets?.checkinQr);
  const legacyLoginDisabledOk = health ? health.legacyLogin === false : false;

  const routeStatuses = REQUIRED_IMPORTANT_ROUTES.map(spec => ({
    ...spec,
    present: checkRouteExists(spec),
  }));
  const allImportantRoutesOk = serverRespondsOk && routeStatuses.every(r => r.present);

  const renderBadge = (isGreen: boolean, greenText: string, redText: string) =>
    isGreen ? (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>{greenText}</span>
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
        <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
        <span>{redText}</span>
      </span>
    );

  return (
    <div className="rounded-3xl bg-[#111827]/95 border border-slate-800/90 p-6 md:p-8 backdrop-blur-md shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 shadow-lg shadow-cyan-500/10">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-extrabold text-white">
                Chẩn Đoán Máy Chủ Quản Trị (/api/health)
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Chỉ dành cho Super Admin
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Kiểm tra trực tiếp phản hồi của máy chủ Express (<code className="text-cyan-300">server.ts</code>), tính hợp lệ của khóa <code className="text-amber-300">SUPABASE_SERVICE_ROLE_KEY</code>, các khóa bí mật phiên và danh sách route quản trị mà không làm lộ giá trị bí mật.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {lastCheckedAt && (
            <span className="text-[11px] text-slate-400 font-mono">
              Lần kiểm tra cuối: {lastCheckedAt}
            </span>
          )}
          <button
            type="button"
            onClick={runHealthCheck}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-extrabold transition-all flex items-center gap-1.5 shadow-md shadow-cyan-600/25 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Đang chẩn đoán...' : 'Kiểm Tra Lại (/api/health)'}</span>
          </button>
        </div>
      </div>

      {/* Alert Banner when critical issue found */}
      {(!serverRespondsOk || !serviceRoleOk || !allImportantRoutesOk) && !loading && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-extrabold text-rose-200">
              Phát hiện vấn đề cấu hình máy chủ cần khắc phục:
            </div>
            {!serverRespondsOk && (
              <p className="text-rose-300 font-semibold">{NO_EXPRESS_SERVER_MESSAGE}</p>
            )}
            {serverRespondsOk && !allImportantRoutesOk && (
              <p className="text-rose-300 font-semibold">
                Máy chủ đang chạy bản cũ (build {health?.build || 'unknown'}), hãy phát hành lại.
              </p>
            )}
            {serverRespondsOk && !serviceRoleOk && (
              <p className="text-rose-300 font-semibold">{SERVICE_ROLE_MISSING_MESSAGE}</p>
            )}
          </div>
        </div>
      )}

      {/* Main Diagnostic Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/80">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900/95 text-slate-400 border-b border-slate-800 text-[10px] uppercase tracking-wider">
              <th className="py-3 px-4 font-bold">Hạng Mục Kiểm Tra</th>
              <th className="py-3 px-4 font-bold">Trạng Thái</th>
              <th className="py-3 px-4 font-bold">Giá Trị / Chi Tiết Chẩn Đoán</th>
              <th className="py-3 px-4 font-bold">Gợi Ý Khắc Phục</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {/* 1. Máy chủ phản hồi */}
            <tr className="hover:bg-slate-900/40">
              <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>1. Máy chủ phản hồi (GET /api/health)</span>
                </div>
              </td>
              <td className="py-3.5 px-4 whitespace-nowrap">
                {renderBadge(
                  serverRespondsOk,
                  'Xanh — Phản hồi OK',
                  `Đỏ — Lỗi (${httpStatus || 'N/A'})`
                )}
              </td>
              <td className="py-3.5 px-4 font-mono text-slate-300">
                {serverRespondsOk ? (
                  <span>
                    HTTP {httpStatus || 200} &bull; Project Ref:{' '}
                    <strong className="text-cyan-300">
                      {health?.supabaseProjectRef || 'unknown'}
                    </strong>
                  </span>
                ) : (
                  <span className="text-rose-300">{fetchError || NO_EXPRESS_SERVER_MESSAGE}</span>
                )}
              </td>
              <td className="py-3.5 px-4 text-slate-300">
                {serverRespondsOk ? (
                  <span className="text-emerald-400">Máy chủ Express đang chạy bình thường.</span>
                ) : (
                  <span>
                    Trang này đang chạy KHÔNG có máy chủ Express. Cần phát hành bằng{' '}
                    <code className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">
                      npm run build
                    </code>{' '}
                    rồi{' '}
                    <code className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">
                      npm start
                    </code>{' '}
                    (hoặc <code className="font-mono text-amber-300">npm run dev</code> khi phát triển).
                  </span>
                )}
              </td>
            </tr>

            {/* 2. Build */}
            <tr className="hover:bg-slate-900/40">
              <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>2. Build &amp; Môi trường (build / node / env)</span>
                </div>
              </td>
              <td className="py-3.5 px-4 whitespace-nowrap">
                {renderBadge(buildOk, 'Xanh — Đã nhận diện', 'Đỏ — Chưa xác định')}
              </td>
              <td className="py-3.5 px-4 font-mono text-slate-300">
                {health ? (
                  <div className="space-y-0.5">
                    <div>
                      Build: <strong className="text-amber-300">{health.build}</strong>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Node: {health.node || 'N/A'} &bull; Env: {health.env || 'N/A'}
                    </div>
                  </div>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </td>
              <td className="py-3.5 px-4 text-slate-300">
                {buildOk ? (
                  <span className="text-emerald-400">
                    Có thể đặt biến <code className="font-mono">APP_BUILD_ID</code> khi deploy để cố định mã phiên bản.
                  </span>
                ) : (
                  <span>Khởi động lại máy chủ Express để nạp thông tin build.</span>
                )}
              </td>
            </tr>

            {/* 3. Khóa Service Role hợp lệ */}
            <tr className="hover:bg-slate-900/40">
              <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>3. Khóa Service Role hợp lệ</span>
                </div>
              </td>
              <td className="py-3.5 px-4 whitespace-nowrap">
                {renderBadge(
                  serviceRoleOk,
                  'Xanh — Hợp lệ (Auth Admin OK)',
                  !serviceRoleConfigured
                    ? 'Đỏ — Chưa cấu hình khóa'
                    : 'Đỏ — Khóa sai / Lệch project'
                )}
              </td>
              <td className="py-3.5 px-4 font-mono text-slate-300">
                configured:{' '}
                <strong className={serviceRoleConfigured ? 'text-emerald-400' : 'text-rose-400'}>
                  {String(serviceRoleConfigured)}
                </strong>{' '}
                &bull; valid:{' '}
                <strong className={serviceRoleValid ? 'text-emerald-400' : 'text-rose-400'}>
                  {String(serviceRoleValid)}
                </strong>
              </td>
              <td className="py-3.5 px-4 text-slate-300">
                {serviceRoleOk ? (
                  <span className="text-emerald-400">
                    Khóa <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> hợp lệ và gọi được <code className="font-mono">auth.admin.listUsers</code>.
                  </span>
                ) : (
                  <span>
                    Lấy khóa <code className="px-1 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">service_role</code> (hoặc <code className="font-mono text-amber-300">sb_secret_...</code>) của project{' '}
                    <strong className="text-cyan-300">{health?.supabaseProjectRef || 'deuuzrjpfcabfclwaqph'}</strong> trong Supabase Dashboard &rarr; Project Settings &rarr; API, gán vào biến môi trường{' '}
                    <code className="px-1 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">SUPABASE_SERVICE_ROLE_KEY</code> trên máy chủ rồi khởi động lại.
                  </span>
                )}
              </td>
            </tr>

            {/* 4. PARENT_SESSION_SECRET */}
            <tr className="hover:bg-slate-900/40">
              <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>4. PARENT_SESSION_SECRET</span>
                </div>
              </td>
              <td className="py-3.5 px-4 whitespace-nowrap">
                {renderBadge(
                  parentSecretOk,
                  'Xanh — Đã cấu hình',
                  'Đỏ — Đang dùng khóa tạm'
                )}
              </td>
              <td className="py-3.5 px-4 font-mono text-slate-300">
                secrets.parentSession:{' '}
                <strong className={parentSecretOk ? 'text-emerald-400' : 'text-rose-400'}>
                  {String(parentSecretOk)}
                </strong>
              </td>
              <td className="py-3.5 px-4 text-slate-300">
                {parentSecretOk ? (
                  <span className="text-emerald-400">Đã cấu hình khóa ký phiên Cổng Phụ Huynh cố định.</span>
                ) : (
                  <span>
                    Cấu hình biến môi trường <code className="px-1 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">PARENT_SESSION_SECRET</code> (chuỗi ngẫu nhiên &ge; 32 ký tự) trên máy chủ để giữ phiên phụ huynh khi restart.
                  </span>
                )}
              </td>
            </tr>

            {/* 5. CHECKIN_QR_SECRET */}
            <tr className="hover:bg-slate-900/40">
              <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>5. CHECKIN_QR_SECRET</span>
                </div>
              </td>
              <td className="py-3.5 px-4 whitespace-nowrap">
                {renderBadge(
                  checkinQrSecretOk,
                  'Xanh — Đã cấu hình (>= 32B)',
                  'Đỏ — Đang dùng khóa tạm'
                )}
              </td>
              <td className="py-3.5 px-4 font-mono text-slate-300">
                secrets.checkinQr:{' '}
                <strong className={checkinQrSecretOk ? 'text-emerald-400' : 'text-rose-400'}>
                  {String(checkinQrSecretOk)}
                </strong>
              </td>
              <td className="py-3.5 px-4 text-slate-300">
                {checkinQrSecretOk ? (
                  <span className="text-emerald-400">Đã cấu hình khóa ký HMAC-SHA256 cho mã QR check-in giáo viên.</span>
                ) : (
                  <span>
                    Cấu hình biến môi trường <code className="px-1 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">CHECKIN_QR_SECRET</code> (tối thiểu 32 byte) trên máy chủ để mã QR không bị vô hiệu hóa khi restart.
                  </span>
                )}
              </td>
            </tr>

            {/* 6. legacyLogin */}
            <tr className="hover:bg-slate-900/40">
              <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>6. Chế độ Legacy Login (legacyLogin)</span>
                </div>
              </td>
              <td className="py-3.5 px-4 whitespace-nowrap">
                {renderBadge(
                  legacyLoginDisabledOk,
                  'Xanh — Đã tắt (false)',
                  'Đỏ — Đang bật (true) / Chưa rõ'
                )}
              </td>
              <td className="py-3.5 px-4 font-mono text-slate-300">
                legacyLogin:{' '}
                <strong className={legacyLoginDisabledOk ? 'text-emerald-400' : 'text-rose-400'}>
                  {health ? String(Boolean(health.legacyLogin)) : 'unknown'}
                </strong>
              </td>
              <td className="py-3.5 px-4 text-slate-300">
                {legacyLoginDisabledOk ? (
                  <span className="text-emerald-400">
                    Đang dùng chuẩn xác thực Supabase Auth + bảng <code className="font-mono">profiles</code> (không đọc <code className="font-mono">app_users</code>).
                  </span>
                ) : (
                  <span>
                    Đặt <code className="px-1 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">VITE_LEGACY_LOGIN=false</code> để tắt hoàn toàn nhánh đăng nhập cũ qua bảng <code className="font-mono">app_users</code>.
                  </span>
                )}
              </td>
            </tr>

            {/* 7. Các route quan trọng */}
            <tr className="hover:bg-slate-900/40">
              <td className="py-3.5 px-4 font-bold text-white align-top whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <Route className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>7. Các route quan trọng (7 endpoints)</span>
                </div>
              </td>
              <td className="py-3.5 px-4 align-top whitespace-nowrap">
                {renderBadge(
                  allImportantRoutesOk,
                  `Xanh — Đủ ${routeStatuses.filter(r => r.present).length}/${routeStatuses.length} route`,
                  `Đỏ — Thiếu ${routeStatuses.filter(r => !r.present).length}/${routeStatuses.length} route`
                )}
              </td>
              <td className="py-3.5 px-4 align-top">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {routeStatuses.map(r => (
                    <div
                      key={r.id}
                      className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 font-mono text-[11px] ${
                        r.present
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      }`}
                      title={r.description}
                    >
                      <span>
                        <strong>{r.method}</strong> {r.shortLabel}
                      </span>
                      {r.present ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </td>
              <td className="py-3.5 px-4 align-top text-slate-300">
                {allImportantRoutesOk ? (
                  <span className="text-emerald-400">
                    Tất cả route quản trị tài khoản, check-in QR và cổng phụ huynh đã sẵn sàng.
                  </span>
                ) : (
                  <span>
                    Máy chủ đang chạy bản cũ (build <code className="font-mono text-amber-300">{health?.build || 'unknown'}</code>) hoặc chưa khởi động <code className="font-mono text-amber-300">server.ts</code>. Hãy chạy{' '}
                    <code className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">
                      npm run build
                    </code>{' '}
                    rồi{' '}
                    <code className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">
                      npm start
                    </code>{' '}
                    để phát hành lại bản mới nhất.
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
