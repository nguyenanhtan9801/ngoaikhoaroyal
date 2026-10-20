/**
 * Utility functions for text formatting and normalization across the application.
 */

/**
 * Tự động viết hoa chữ cái đầu của mỗi chữ trong Họ và Tên.
 * Ví dụ:
 * - "nguyễn văn an" -> "Nguyễn Văn An"
 * - "lê thị mỹ dung" -> "Lê Thị Mỹ Dung"
 * - "đặng quốc bảo" -> "Đặng Quốc Bảo"
 * - "NGUYỄN VĂN AN" -> "Nguyễn Văn An" (chuẩn hóa khi dán hoặc gõ CapsLock)
 * - "nguyễn đức tân (tân 2)" -> "Nguyễn Đức Tân (Tân 2)"
 * - Giữ nguyên trải nghiệm gõ phím mượt mà, không nuốt khoảng trắng.
 */
export function formatCapitalizedName(value: string): string {
  if (!value) return '';

  // Tách theo khoảng trắng để bảo toàn trải nghiệm gõ phím khi có khoảng trắng liên tiếp
  const words = value.split(' ');
  return words
    .map(word => {
      if (!word) return '';

      // Tách tiền tố ký tự đặc biệt nếu có như "(", "-", "[", v.v.
      const match = word.match(/^([(\-["]*)(\p{L})(.*)$/u);
      if (match) {
        const prefix = match[1];
        const firstChar = match[2].toUpperCase();
        let rest = match[3];

        // Nếu phần sau toàn bộ là chữ in hoa (người dùng bật CapsLock hoặc dán text ALL CAPS)
        // và độ dài > 1 ký tự, chuẩn hóa phần sau về chữ thường
        if (rest && rest === rest.toUpperCase() && rest.length > 1) {
          rest = rest.toLowerCase();
        }
        return prefix + firstChar + rest;
      }

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export const formatFullName = formatCapitalizedName;
export const capitalizeWords = formatCapitalizedName;
