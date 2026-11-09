FROM node:22-slim

WORKDIR /app

# Copy package manifest và bun.lock (nếu có)
COPY package.json bun.lock* ./

# Cài đặt đầy đủ dependencies (kể cả devDependencies vì cần để chạy vite build và tsx)
RUN npm install --no-audit --no-fund

# Copy toàn bộ mã nguồn ứng dụng
COPY . .

# Khai báo các biến môi trường lúc build (Build-time variables cho Vite)
ARG VITE_SUPABASE_URL="https://deuuzrjpfcabfclwaqph.supabase.co"
ARG VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_SHwnK37LokxsP9zVNFSf9Q_qCMxjlat"
ARG VITE_SUPABASE_ANON_KEY=""
ARG VITE_LEGACY_LOGIN="false"
ARG APP_BUILD_ID=""

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_LEGACY_LOGIN=$VITE_LEGACY_LOGIN
ENV APP_BUILD_ID=$APP_BUILD_ID

# Đóng gói giao diện tĩnh vào thư mục dist/
RUN npm run build

# Thiết lập môi trường chạy (Runtime) cho máy chủ Express (server.ts)
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
