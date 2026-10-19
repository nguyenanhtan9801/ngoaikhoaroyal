import React, { useState } from 'react';
import { 
  X, 
  Lock, 
  User, 
  LogIn, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  ShieldCheck, 
  Sparkles,
  KeyRound,
  CheckCircle2
} from 'lucide-react';
import { AppUser } from '../types';
import { RoyalLogo } from './RoyalLogo';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: AppUser[];
  onLoginSuccess: (user: AppUser) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  users,
  onLoginSuccess,
}) => {
  if (!isOpen) return null;

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('123456');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const cleanUsername = username.trim().toLowerCase();
    const foundUser = users.find(u => u.username.toLowerCase() === cleanUsername);

    if (!foundUser || foundUser.password !== password) {
      setErrorMessage('Tên đăng nhập hoặc mật khẩu không chính xác!');
      setIsSubmitting(false);
      return;
    }

    if (foundUser.status === 'locked') {
      setErrorMessage('Tài khoản này đã bị khóa. Vui lòng liên hệ Quản trị viên cấp cao!');
      setIsSubmitting(false);
      return;
    }

    // Success
    setIsSubmitting(false);
    onLoginSuccess(foundUser);
    onClose();
  };

  const handleQuickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setErrorMessage(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-md rounded-3xl bg-[#0B0F19] border border-amber-500/35 shadow-2xl overflow-hidden text-slate-100 font-sans">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-[#0D1527] to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RoyalLogo size="sm" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base tracking-wider text-white">ROYAL SCHOOL</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                  Quản Trị
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Đăng nhập tài khoản nhân sự / học vụ</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Đóng cửa sổ"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5">
          
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            
            {/* Username */}
            <div className="space-y-1.5">
              <label className="block text-slate-300 font-semibold">
                Tên đăng nhập (Username):
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="admin"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-slate-300 font-semibold">
                  Mật khẩu:
                </label>
                <span className="text-[11px] text-slate-500 font-mono">Bảo mật</span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500 tracking-wide"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm tracking-wide shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2 transition-all transform active:scale-[0.99]"
            >
              <LogIn className="w-4 h-4 text-slate-950" />
              <span>ĐĂNG NHẬP QUẢN TRỊ</span>
            </button>
          </form>

          {/* Quick Demo Accounts Selection */}
          <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>Tài Khoản Mẫu Kiểm Thử Nhanh:</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => handleQuickFill('admin', '123456')}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 border border-amber-500/30 hover:border-amber-500/60 text-left transition-all group"
              >
                <div className="font-bold text-amber-400 group-hover:text-amber-300">admin / 123456</div>
                <div className="text-[10px] text-slate-400">Super Admin (Toàn quyền)</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('tuyensinh', 'tuyensinh@123')}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 border border-cyan-500/30 hover:border-cyan-500/60 text-left transition-all group"
              >
                <div className="font-bold text-cyan-400 group-hover:text-cyan-300">tuyensinh / tuyensinh@123</div>
                <div className="text-[10px] text-slate-400">Chuyên viên Tuyển sinh</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('ketoan', 'ketoan@123')}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 border border-emerald-500/30 hover:border-emerald-500/60 text-left transition-all group"
              >
                <div className="font-bold text-emerald-400 group-hover:text-emerald-300">ketoan / ketoan@123</div>
                <div className="text-[10px] text-slate-400">Học vụ kiêm Kế toán</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('giaovien', 'gv@123')}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 border border-purple-500/30 hover:border-purple-500/60 text-left transition-all group"
              >
                <div className="font-bold text-purple-400 group-hover:text-purple-300">giaovien / gv@123</div>
                <div className="text-[10px] text-slate-400">Giáo viên (Bóng rổ)</div>
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800/80 text-[11px] text-slate-500 text-center">
          Trường Song Ngữ Quốc Tế Hoàng Gia &bull; Hệ Thống Quản Trị Ngoại Khóa
        </div>

      </div>
    </div>
  );
};
