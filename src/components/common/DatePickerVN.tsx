import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';

export interface DatePickerVNProps {
  value: string; // ISO date 'YYYY-MM-DD'
  onChange: (val: string) => void;
  min?: string;
  max?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  id?: string;
  name?: string;
}

export const DatePickerVN: React.FC<DatePickerVNProps> = ({
  value,
  onChange,
  min,
  max,
  className = '',
  disabled = false,
  required = false,
  placeholder = 'DD/MM/YYYY',
  id,
  name,
}) => {
  // Chuyển đổi 'YYYY-MM-DD' sang 'DD/MM/YYYY'
  const toDisplay = (isoStr: string) => {
    if (!isoStr) return '';
    const parts = isoStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return isoStr;
  };

  // Chuyển đổi 'DD/MM/YYYY' sang 'YYYY-MM-DD'
  const toISO = (displayStr: string) => {
    if (!displayStr) return '';
    const parts = displayStr.split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y) && d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900 && y <= 2100) {
        return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
    return '';
  };

  const [textVal, setTextVal] = useState(toDisplay(value));

  useEffect(() => {
    setTextVal(toDisplay(value));
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value.replace(/[^0-9/]/g, '');
    
    // Tự động chèn dấu '/' khi gõ ngày và tháng
    if (input.length === 2 && !input.includes('/')) {
      input = `${input}/`;
    } else if (input.length === 5 && input.split('/').length === 2) {
      input = `${input}/`;
    }
    if (input.length > 10) input = input.slice(0, 10);

    setTextVal(input);

    if (input.length === 10) {
      const iso = toISO(input);
      if (iso) {
        const parsedDate = new Date(`${iso}T00:00:00`);
        if (!isNaN(parsedDate.getTime())) {
          onChange(iso);
        }
      }
    } else if (input === '') {
      onChange('');
    }
  };

  const handleBlur = () => {
    if (textVal.length === 10) {
      const iso = toISO(textVal);
      if (iso) {
        onChange(iso);
        setTextVal(toDisplay(iso));
      } else {
        setTextVal(toDisplay(value));
      }
    } else if (textVal !== '') {
      // Revert if incomplete
      setTextVal(toDisplay(value));
    }
  };

  const handleHiddenPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isoVal = e.target.value;
    if (isoVal) {
      onChange(isoVal);
      setTextVal(toDisplay(isoVal));
    }
  };

  return (
    <div className="relative flex items-center w-full">
      <input
        type="text"
        id={id}
        name={name}
        value={textVal}
        onChange={handleInputChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={`w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500 pr-10 transition-colors ${className}`}
      />
      
      {/* Nút picker ẩn kích hoạt lịch gốc nhưng hiển thị chuẩn VN */}
      <label 
        className="absolute right-3 cursor-pointer text-slate-400 hover:text-amber-400 transition-colors flex items-center justify-center p-1"
        title="Chọn ngày từ lịch"
      >
        <CalendarIcon className="w-4 h-4 pointer-events-none" />
        <input
          type="date"
          value={value || ''}
          min={min}
          max={max}
          disabled={disabled}
          onChange={handleHiddenPickerChange}
          className="absolute inset-0 opacity-0 pointer-events-auto cursor-pointer w-full h-full"
        />
      </label>
    </div>
  );
};
