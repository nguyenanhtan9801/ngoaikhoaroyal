# Hướng Dẫn Triển Khai Máy Chủ (Container & Google Cloud Run)

Tài liệu này hướng dẫn chi tiết cách đóng gói cả **Giao diện React (Vite)** và **Máy chủ API Express (`server.ts`)** thành một container duy nhất để khắc phục triệt để lỗi `404 Not Found` trên các đường dẫn `/api/*` (như tạo tài khoản giáo viên `/api/admin/create-user`, quét QR check-in `/api/checkin/scan`, cổng phụ huynh `/api/parent/*`).

---

## 1. Phân Biệt Biến Lúc Build (Build-time) và Biến Lúc Chạy (Runtime)

Dự án sử dụng đồng thời biến môi trường lúc đóng gói giao diện (Vite) và biến môi trường lúc chạy máy chủ Node.js (`server.ts`):

### A. Nhóm biến lúc Build (`--set-build-env-vars` / `ARG` trong `Dockerfile`)
Được Vite nhúng tĩnh vào các tệp JavaScript trong thư mục `dist/` khi chạy lệnh `npm run build`.
- **Lưu ý quan trọng:**
  - **Bất kỳ khi nào thay đổi giá trị nhóm biến này, bạn BẮT BUỘC phải chạy `npm run build` lại (build lại image).**
  - **Tuyệt đối KHÔNG bao giờ đặt khóa bí mật (`service_role`, `secret`) vào biến có tiền tố `VITE_*`** vì trình duyệt người dùng có thể đọc được.

| Tên biến | Mặc định | Ý nghĩa |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | `https://deuuzrjpfcabfclwaqph.supabase.co` | URL dự án Supabase cho trình duyệt |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_SHwnK37LokxsP9zVNFSf9Q_qCMxjlat` | Khóa công khai (Publishable/Anon) của Supabase |
| `VITE_SUPABASE_ANON_KEY` | *(tùy chọn)* | Khóa Anon JWT (nếu dùng chuẩn cũ) |
| `VITE_LEGACY_LOGIN` | `false` | Đặt `false` để chỉ dùng Supabase Auth + bảng `profiles` |
| `APP_BUILD_ID` | *(mã commit / timestamp)* | Định danh phiên bản build hiển thị tại `/api/health` |

---

### B. Nhóm biến lúc Chạy (`--set-env-vars` hoặc `--set-secrets`)
Được máy chủ Express (`server.ts`) đọc trực tiếp từ `process.env` khi container khởi động (`npm start`).
- **Lưu ý quan trọng:**
  - Khi thay đổi nhóm biến này, **không cần build lại giao diện**, chỉ cần cập nhật biến môi trường / Secret trên Cloud Run (tạo revision mới).
  - Các khóa nhạy cảm nên được lưu trong **Google Cloud Secret Manager**.

| Tên biến | Bắt buộc | Ý nghĩa |
| :--- | :---: | :--- |
| `SUPABASE_SERVICE_ROLE_KEY` | **Có** | Khóa `service_role` (hoặc `sb_secret_...`) của project `deuuzrjpfcabfclwaqph`. Bắt buộc cho `/api/admin/*`, `/api/checkin/*`, `/api/parent/*`, `/api/upload` |
| `PARENT_SESSION_SECRET` | Khuyến nghị | Chuỗi ngẫu nhiên $\ge 32$ ký tự ký HMAC-SHA256 cho phiên Cổng Phụ Huynh |
| `CHECKIN_QR_SECRET` | Khuyến nghị | Chuỗi ngẫu nhiên $\ge 32$ byte ký HMAC-SHA256 cho mã QR check-in giáo viên |
| `GEMINI_API_KEY` | Tùy chọn | Khóa gọi Gemini API cho `/api/chat` và `/api/ai-analyze` |
| `APP_URL` | Khuyến nghị | URL chính thức của ứng dụng (ví dụ: `https://ngoai-khoa.royalschool.edu.vn`) |
| `SUPABASE_URL` | Tùy chọn | URL Supabase phía server (mặc định tự đồng bộ với `VITE_SUPABASE_URL`) |

---

## 2. Kiểm Tra Đóng Gói Docker Tại Máy Cục Bộ (Local)

Dự án dùng `bun.lock` (không có `package-lock.json`), vì vậy `Dockerfile` sử dụng `npm install --no-audit --no-fund`.

```bash
# 1. Build Docker image
docker build \
  --build-arg VITE_SUPABASE_URL="https://deuuzrjpfcabfclwaqph.supabase.co" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_SHwnK37LokxsP9zVNFSf9Q_qCMxjlat" \
  --build-arg VITE_LEGACY_LOGIN="false" \
  --build-arg APP_BUILD_ID="local-$(date +%Y%m%d-%H%M)" \
  -t royal-school:latest .

# 2. Chạy thử container ở cổng 8080
docker run --rm -p 8080:8080 \
  -e SUPABASE_SERVICE_ROLE_KEY="DÁN_SERVICE_ROLE_KEY_CỦA_PROJECT_MỚI" \
  -e PARENT_SESSION_SECRET="$(openssl rand -hex 32)" \
  -e CHECKIN_QR_SECRET="$(openssl rand -hex 32)" \
  royal-school:latest
```

Mở trình duyệt tại `http://localhost:8080` (trang chủ) và `http://localhost:8080/api/health` (kiểm tra JSON chẩn đoán).

---

## 3. Triển Khai Từng Bước Lên Google Cloud Run

### Bước 1: Đăng nhập và chọn Google Cloud Project
```bash
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
```

### Bước 2: (Khuyến nghị) Tạo khóa bí mật trong Secret Manager
Lưu các khóa nhạy cảm vào Google Cloud Secret Manager để không lộ trên dòng lệnh:

```bash
printf "%s" "DÁN_SUPABASE_SERVICE_ROLE_KEY" | gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --data-file=-
printf "%s" "$(openssl rand -hex 32)" | gcloud secrets create PARENT_SESSION_SECRET --data-file=-
printf "%s" "$(openssl rand -hex 32)" | gcloud secrets create CHECKIN_QR_SECRET --data-file=-
printf "%s" "DÁN_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-
```

### Bước 3: Chạy lệnh `gcloud run deploy`
Sử dụng `--set-build-env-vars` cho các biến lúc build (`VITE_*`, `APP_BUILD_ID`) và `--set-secrets` / `--set-env-vars` cho các biến lúc chạy:

```bash
gcloud run deploy royal-school \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --port 8080 \
  --set-build-env-vars="VITE_SUPABASE_URL=https://deuuzrjpfcabfclwaqph.supabase.co,VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SHwnK37LokxsP9zVNFSf9Q_qCMxjlat,VITE_LEGACY_LOGIN=false,APP_BUILD_ID=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)" \
  --set-env-vars="SUPABASE_URL=https://deuuzrjpfcabfclwaqph.supabase.co,VITE_LEGACY_LOGIN=false,APP_URL=https://royal-school-xxx.asia-southeast1.run.app" \
  --set-secrets="SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,PARENT_SESSION_SECRET=PARENT_SESSION_SECRET:latest,CHECKIN_QR_SECRET=CHECKIN_QR_SECRET:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest"
```

*(Nếu chưa dùng Secret Manager, bạn có thể truyền trực tiếp qua `--set-env-vars="SUPABASE_SERVICE_ROLE_KEY=...,PARENT_SESSION_SECRET=...,CHECKIN_QR_SECRET=...,GEMINI_API_KEY=...,APP_URL=..."`).*

---

## 4. Ánh Xạ Tên Miền Riêng (Custom Domain Mapping) trên Cloud Run

1. Xác minh quyền sở hữu tên miền trong Google Cloud Console (**Cloud Run** $\rightarrow$ **Manage Custom Domains** $\rightarrow$ **Add Mapping**).
2. Hoặc chạy lệnh CLI:
   ```bash
   gcloud beta run domain-mappings create \
     --service royal-school \
     --domain ngoai-khoa.royalschool.edu.vn \
     --region asia-southeast1
   ```
3. Cập nhật bản ghi DNS (`CNAME` hoặc `A`/`AAAA`) tại nhà cung cấp tên miền theo đúng hướng dẫn trả về của lệnh trên. Cloud Run sẽ tự động cấp chứng chỉ SSL (HTTPS) miễn phí.
4. Sau khi tên miền hoạt động, cập nhật lại biến `APP_URL`:
   ```bash
   gcloud run services update royal-school \
     --region asia-southeast1 \
     --update-env-vars="APP_URL=https://ngoai-khoa.royalschool.edu.vn"
   ```

---

## 5. Cách Kiểm Tra `/api/health` Sau Khi Triển Khai

### Cách 1: Kiểm tra qua dòng lệnh (`curl`)
```bash
curl -s https:// TEN_MIEN_HOAC_CLOUD_RUN_URL /api/health | jq .
```
Phản hồi đạt chuẩn khi:
```json
{
  "ok": true,
  "build": "20261108...",
  "startedAt": "2026-11-08T...",
  "node": "v22...",
  "env": "production",
  "supabaseProjectRef": "deuuzrjpfcabfclwaqph",
  "serviceRole": {
    "configured": true,
    "valid": true
  },
  "secrets": {
    "parentSession": true,
    "checkinQr": true
  },
  "routes": [
    "GET /api/whoami",
    "GET /api/health",
    "POST /api/admin/create-user",
    "POST /api/admin/reset-password",
    "POST /api/admin/update-user",
    "POST /api/admin/delete-user",
    "GET /api/public/catalog",
    "POST /api/parent/login",
    "POST /api/parent/register",
    "POST /api/chat",
    "POST /api/ai-analyze",
    "POST /api/upload",
    "GET /api/files/sign",
    "GET /api/files/proofs",
    "GET /api/teacher/checkin-qr",
    "POST /api/checkin/scan",
    "POST /api/checkin/manual",
    "POST /api/admin/backup-audit"
  ],
  "legacyLogin": false
}
```
- Nếu `serviceRole.configured` hoặc `serviceRole.valid` là `false`: kiểm tra lại giá trị `SUPABASE_SERVICE_ROLE_KEY` phải thuộc đúng project `deuuzrjpfcabfclwaqph`.

### Cách 2: Kiểm tra trực tiếp trên giao diện Quản trị
Đăng nhập bằng tài khoản **Super Admin** $\rightarrow$ vào mục **Cài Đặt Hệ Thống** $\rightarrow$ bấm tab **Chẩn đoán máy chủ (`/api/health`)**. Toàn bộ 7 hạng mục hiển thị màu **Xanh** là hệ thống đã sẵn sàng 100%.

---

## 6. Triển Khai Tương Đương Trên Render hoặc Railway

Nếu không dùng Google Cloud Run, bạn có thể triển khai trực tiếp từ GitHub repository lên **Render (Web Service)** hoặc **Railway**:

1. **Loại dịch vụ:** Chọn **Web Service** (tuyệt đối **không** chọn Static Site vì Static Site không chạy `server.ts`).
2. **Runtime / Environment:** Chọn **Docker** (tự động nhận `Dockerfile` ở thư mục gốc) hoặc **Node**:
   - **Build Command (nếu chọn Node):** `npm install --no-audit --no-fund && npm run build`
   - **Start Command:** `npm start`
3. **Cấu hình biến môi trường (Environment Variables):**
   - Nhóm biến lúc build (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_LEGACY_LOGIN=false`, `APP_BUILD_ID`): bật tùy chọn *Available during build* (trên Render/Railway biến môi trường mặc định có hiệu lực cả lúc build và lúc chạy nếu khai báo `ARG` trong `Dockerfile`).
   - Nhóm biến lúc chạy (`SUPABASE_SERVICE_ROLE_KEY`, `PARENT_SESSION_SECRET`, `CHECKIN_QR_SECRET`, `GEMINI_API_KEY`, `APP_URL`): thêm vào phần Environment/Variables của dịch vụ.
4. Sau khi deploy xong, mở `<URL_DỊCH_VỤ>/api/health` để xác nhận `ok: true` và `serviceRole.valid: true`.
