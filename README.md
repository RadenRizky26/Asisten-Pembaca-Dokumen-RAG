# Asisten Pembaca Dokumen RAG

Aplikasi RAG (Retrieval-Augmented Generation) berbasis AI untuk bertanya jawab pada berbagai format dokumen (PDF, DOCX, XLSX, PPTX).

## Fitur
- **RAG Multi-Dokumen**: Pencarian konteks lintas dokumen dengan algoritma MMR (Maximal Marginal Relevance).
- **Format Didukung**: PDF, Word, Excel, PowerPoint.
- **Streaming UI**: Respon AI dengan animasi ketik.
- **Dark/Light Mode**: Mendukung preferensi sistem.
- **Riwayat Chat**: Simpan dan kelola sesi percakapan.

## Stack Teknologi
- **Backend**: FastAPI, LangChain, Google Gemini API, PgVector.
- **Frontend**: Next.js, Tailwind CSS, React-Markdown.

## Setup
### Backend
1. Masuk ke folder `backend`.
2. Buat venv: `python -m venv env`.
3. Aktifkan venv & install dependensi: `pip install -r requirements.txt` (pastikan `requirements.txt` tersedia).
4. Buat `.env` dan isi `GOOGLE_API_KEY`.
5. Jalankan: `uvicorn main:app --reload`.

### Frontend
1. Masuk ke folder `frontend`.
2. Install dependensi: `npm install`.
3. Jalankan: `npm run dev`.

## Kontribusi
Pastikan backend berjalan di `http://localhost:8000` sebelum menjalankan frontend.
