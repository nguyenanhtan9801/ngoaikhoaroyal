import React, { useState, useEffect, useRef } from 'react';
import { Calendar } from 'lucide-react';

export interface DateInputVNProps {
  value: string; // Chuỗi chuẩn ISO YYYY-MM-DD (VD: "2026-11-27")
  onChange: (isoDate: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  wrapperClassName?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  title?: string;
  id?: string;
  name?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

export const DateInputVN: React.FC<DateInputVNProps> = ({
  value,
  onChange,
  required = false,
  disabled = false,
  className = '',
  wrapperClassName = 'w-full',
  placeholder = 'DD/MM/YYYY',
  min,
  max,
  title,
  id,
  name,
  onKeyDown,
}) => {
  const hiddenDateRef = useRef<HTMLInputElement>(null);

  // Chuyển từ YYYY-MM-DD sang DD/MM/YYYY để hiển thị
  const toVNDisplay = (iso: string): string => {
    if (!iso) return '';
    const clean = iso.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return iso;
  };

  const [displayText, setDisplayText] = useState<string>(() => toVNDisplay(value));

  useEffect(() => {
    setDisplayText(toVNDisplay(value));
  }, [value]);

  // Xử lý khi người dùng gõ tay theo dạng DD/MM/YYYY (tự động chèn dấu /)
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d/]/g, '');

    // Tự động thêm dấu / sau ngày và tháng
    const digits = raw.replace(/\//g, '');
    if (digits.length === 0) {
      setDisplayText('');
      if (!required) {
        onChange('');
      }
      return;
    }

    if (digits.length <= 2) {
      raw = digits;
    } else if (digits.length <= 4) {
      raw = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    } else {
      raw = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
    }

    setDisplayText(raw);

    // Nếu nhập đủ 10 ký tự DD/MM/YYYY hợp lệ -> chuyển sang YYYY-MM-DD và gọi onChange
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
        const dt = new Date(Date.UTC(year, month - 1, day));
        if (
          dt.getUTCFullYear() === year &&
          dt.getUTCMonth() === month - 1 &&
          dt.getUTCDate() === day
        ) {
          const isoString = `${match[3]}-${match[2]}-${match[1]}`;
          onChange(isoString);
        }
      }
    }
  };

  // Mở popup lịch khi bấm icon lịch
  const handleOpenPicker = () => {
    if (disabled || !hiddenDateRef.current) return;
    try {
      if (typeof hiddenDateRef.current.showPicker === 'function') {
        hiddenDateRef.current.showPicker();
      } else {
        hiddenDateRef.current.click();
      }
    } catch {
      hiddenDateRef.current.focus();
    }
  };

  return (
    <div className={`relative flex items-center ${wrapperClassName}`}>
      {/* Ô hiển thị và nhập cứng định dạng DD/MM/YYYY */}
      <input
        type="text"
        id={id}
        name={name}
        inputMode="numeric"
        maxLength={10}
        required={required}
        disabled={disabled}
        title={title}
        placeholder={placeholder}
        value={displayText}
        onChange={handleTextChange}
        onKeyDown={onKeyDown}
        onBlur={() => setDisplayText(toVNDisplay(value))}
        className={`w-full pr-9 ${className}`}
      />

      {/* Input date ẩn dùng để bật trình chọn lịch native */}
      <input
        ref={hiddenDateRef}
        type="date"
        lang="vi"
        value={value ? value.split('T')[0] : ''}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value) {
            onChange(e.target.value);
          } else if (!required) {
            onChange('');
          }
        }}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 opacity-0 pointer-events-none w-0 h-0"
      />

      {/* Nút icon lịch bên phải */}
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpenPicker}
        title="Chọn ngày từ lịch"
        className="absolute right-2.5 p-1 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Calendar className="w-4 h-4" />
      </button>
    </div>
  );
};
