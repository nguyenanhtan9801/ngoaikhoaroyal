import React, { useState } from 'react';

export const ROYAL_LOGO_URL = 'https://lh3.googleusercontent.com/d/11xC8O7NEeFVXgZY6p1_qdWAJ3D6iX_1E';
export const ROYAL_LOGO_BACKUP = 'https://drive.google.com/thumbnail?id=11xC8O7NEeFVXgZY6p1_qdWAJ3D6iX_1E&sz=w500';

interface RoyalLogoProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showBorder?: boolean;
}

export const RoyalLogo: React.FC<RoyalLogoProps> = ({
  className = '',
  size = 'md',
  showBorder = false,
}) => {
  const [src, setSrc] = useState<string>(ROYAL_LOGO_URL);

  const sizeClasses = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  }[size];

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 bg-transparent border-0 p-0 transition-transform ${
        showBorder ? 'border-0' : ''
      } ${sizeClasses} ${className}`}
    >
      <img
        src={src}
        alt="Royal School Logo"
        className="w-full h-full object-contain select-none"
        onError={() => {
          if (src === ROYAL_LOGO_URL) {
            setSrc(ROYAL_LOGO_BACKUP);
          }
        }}
      />
    </div>
  );
};
