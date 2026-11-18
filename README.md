# BAPI FARMA

Aplikasi kasir dan manajemen apotek full-stack berbasis React, Express, dan SQLite.

## Menjalankan Aplikasi

1. Jalankan backend:

```powershell
cd backend
npm install
npm start
```

2. Jalankan frontend pada terminal baru:

```powershell
cd frontend
npm install
npm run dev
```

3. Buka `http://localhost:5173`.

Backend tersedia di `http://localhost:3001`. Salin `.env.example` menjadi `.env` di folder backend bila ingin mengubah port atau lokasi database.

## Akun

- Username: `admin`
- Password: `admin123`

## Database

Database SQLite dibuat otomatis saat backend pertama kali dijalankan di `database/bapi-farma.db`. Data produk awal dan pengaturan toko juga dibuat otomatis.

QRIS pada aplikasi adalah simulasi lokal. Tidak terhubung dengan QRIS sungguhan atau payment gateway.
"# kka-website-kasir" 
