// Múi giờ Việt Nam (UTC+7)
export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Lấy chuỗi ngày hiện tại chuẩn YYYY-MM-DD theo múi giờ Việt Nam (dùng cho <input type="date"> và query DB)
 */
export const getTodayVNISO = (dateObj: Date | string = new Date()): string => {
  if (typeof dateObj === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateObj.trim())) {
    return dateObj.trim();
  }
  const d = typeof dateObj === 'string' ? new Date(dateObj) : dateObj;
  const validDate = Number.isNaN(d.getTime()) ? new Date() : d;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(validDate); // Trả về "2026-11-27" chính xác theo giờ VN
};

/**
 * Cộng/trừ số ngày và trả về chuỗi YYYY-MM-DD theo múi giờ Việt Nam
 */
export const addDaysVNISO = (days: number, baseDate: Date | string = new Date()): string => {
  const baseIso = getTodayVNISO(baseDate);
  const d = new Date(`${baseIso}T12:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return getTodayVNISO();
  d.setUTCDate(d.getUTCDate() + days);
  return getTodayVNISO(d);
};

/**
 * Chuẩn hóa chuỗi ngày về YYYY-MM-DD (hỗ trợ YYYY-MM-DD, ISO datetime, hoặc DD/MM/YYYY)
 */
export const normalizeDateISO = (input?: string | Date | null): string => {
  if (!input) return '';
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? '' : getTodayVNISO(input);
  }
  const clean = String(input).trim();
  if (!clean) return '';

  const vnMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vnMatch) {
    return `${vnMatch[3]}-${vnMatch[2].padStart(2, '0')}-${vnMatch[1].padStart(2, '0')}`;
  }

  const isoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  const d = new Date(clean);
  if (!Number.isNaN(d.getTime())) {
    return getTodayVNISO(d);
  }

  return clean.split('T')[0].split(' ')[0];
};

/**
 * Định dạng ngày sang chuẩn Việt Nam: DD/MM/YYYY
 * Hỗ trợ đầu vào: "2026-11-27", "2026-11-27T10:30:00Z", Date object
 */
export const formatDateVN = (input?: string | Date | null): string => {
  if (!input) return '';
  if (typeof input === 'string') {
    const clean = input.trim();
    if (!clean) return '';
    // Nếu đã đúng chuẩn DD/MM/YYYY thì trả về luôn
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) return clean;
    // Nếu là chuỗi ISO YYYY-MM-DD (không kèm giờ) -> tách trực tiếp để tránh lệch múi giờ UTC
    const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    }
  }

  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VN_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d); // "27/11/2026"
};

/**
 * Định dạng ngày rút gọn sang chuẩn Việt Nam: DD/MM
 */
export const formatDateShortVN = (input?: string | Date | null): string => {
  const full = formatDateVN(input);
  if (!full) return '';
  const parts = full.split('/');
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return full;
};

/**
 * Định dạng giờ chuẩn 24h Việt Nam: HH:mm (VD: "16:45")
 */
export const formatTimeVN = (input?: string | Date | null): string => {
  if (!input) return '';
  if (typeof input === 'string') {
    const clean = input.trim();
    if (!clean) return '';
    const match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (match) {
      return `${match[1].padStart(2, '0')}:${match[2]}`;
    }
  }

  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VN_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(/^24:/, '00:'); // "16:45"
};

/**
 * Định dạng giờ chi tiết gồm giây chuẩn 24h Việt Nam: HH:mm:ss
 */
export const formatTimeWithSecondsVN = (input?: string | Date | null): string => {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VN_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(/^24:/, '00:');
};

/**
 * Định dạng đầy đủ Ngày & Giờ chuẩn Việt Nam: HH:mm - DD/MM/YYYY (VD: "16:45 - 27/11/2026")
 */
export const formatDateTimeVN = (input?: string | Date | null): string => {
  if (!input) return '';
  if (typeof input === 'string') {
    const clean = input.trim();
    if (!clean) return '';
    // Nếu chỉ có ngày (YYYY-MM-DD hoặc DD/MM/YYYY) không kèm giờ -> trả về DD/MM/YYYY
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean) || /^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
      return formatDateVN(clean);
    }
    const alreadyFormatted = clean.match(/^(\d{1,2}:\d{2})(?::\d{2})?\s*[-,]?\s*(\d{2}\/\d{2}\/\d{4})$/);
    if (alreadyFormatted) {
      return `${alreadyFormatted[1].padStart(5, '0')} - ${alreadyFormatted[2]}`;
    }
  }

  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);

  return `${formatTimeVN(d)} - ${formatDateVN(d)}`;
};
