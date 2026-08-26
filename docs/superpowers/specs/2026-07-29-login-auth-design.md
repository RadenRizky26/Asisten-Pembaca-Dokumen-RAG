# Login & Auto-Merge Auth Design

## 1. Schema Database

### Table `users` (Baru)
| Column | Type | Keterangan |
|--------|------|------------|
| id | UUID (PK) | Primary key |
| email | VARCHAR(255), UNIQUE, NOT NULL | Email user |
| password_hash | TEXT, NOT NULL | Hash bcrypt |
| created_at | TIMESTAMP | Default now() |

### Table `langchain_pg_embedding` (Existing, dimodifikasi via JSONB metadata)
- Menambahkan field di kolom `cmetadata` (jsonb):
  - `user_id`: UUID atau null (untuk user terdaftar)
  - `session_id`: String atau null (untuk guest/session)

### Chat History (File JSON)
- Struktur session ditambah field:
  - `user_id`: UUID atau null
  - `session_id`: String atau null

## 2. Auth Flow (Email/Password)

- **Register**: POST `/api/auth/register` `{ email, password }`
  - Hash password dengan bcrypt
  - Simpan user ke table `users`
  - Buat JWT token
  - Auto-claim dokumen guest berdasarkan `X-Session-Id`
- **Login**: POST `/api/auth/login` `{ email, password }`
  - Verifikasi password
  - Buat JWT token
  - Auto-claim dokumen guest berdasarkan `X-Session-Id`
- **Me**: GET `/api/auth/me` `(Authorization: Bearer <token>)`
  - Return user info

## 3. Auto-Merge (Guest to User)

Saat register atau login berhasil:
1. Backend membaca header `X-Session-Id` dari request
2. Cari semua record di `langchain_pg_embedding` dengan `cmetadata->>'session_id'` = session_id
3. Update `cmetadata` dengan menambahkan `"user_id": "<user_uuid>"` menggunakan JSONB `||`
4. Cari semua chat session dengan `session_id` yang sama di `chat_history.json`
5. Update `user_id` pada session tersebut

## 4. RAG Query Scoping

Semua query RAG difilter:
- Untuk user login: `cmetadata->>'user_id' = '<id>' OR (cmetadata->>'user_id' IS NULL AND cmetadata->>'session_id' = '<session_id>')`
- Untuk guest (tidak login): `cmetadata->>'session_id' = '<session_id>' OR (cmetadata->'user_id' IS NULL AND cmetadata->'session_id' IS NULL)`

## 5. Guest Identification

- Frontend generate UUID sessionId saat pertama load
- Disimpan di `localStorage` dengan key `guest_session_id`
- Dikirim sebagai header `X-Session-Id` di semua API request
- Jika user login, `Authorization: Bearer <token>` juga dikirim

## 6. Dependencies Baru

Backend:
- `pyjwt` → Membuat & validasi JWT token
- `passlib[bcrypt]` → Hashing password
- `python-multipart` → Form data parsing

Frontend:
- Tidak ada dependency baru (fetch API built-in)
