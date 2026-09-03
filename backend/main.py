import os
import shutil
import re
import json
import uuid
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from typing import List, Optional

try:
    import comtypes.client
    import pythoncom
except ImportError:
    comtypes = None  # type: ignore
    pythoncom = None  # type: ignore

from auth import (
    hash_password, verify_password, create_access_token,
    get_optional_user, decode_token, UserPublic
)
from database.db import auto_claim_documents, auto_claim_chat_sessions, get_raw_connection
import tempfile as _tmp
import storage as _storage  # Supabase Storage (fallback lokal jika env kosong)

def bersihkan_teks(teks: str) -> str:
    if not teks:
        return teks
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", teks)

# Pustaka AI LangChain
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.embeddings import Embeddings
import httpx
from langchain_postgres import PGVector

# ponytail: local sentence-transformers (torch ~2GB) dihapus untuk Render Free.
# Ganti dengan HF Inference API gratis — no torch, httpx sudah ada.
# Upgrade path: HF_TOKEN kosong -> error jelas; set HF_TOKEN di Render.
class HuggingFaceInferenceEmbeddings(Embeddings):
    def __init__(self, model: str | None = None, api_key: str | None = None):
        self.model = model or os.getenv("HF_EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
        self.api_key = api_key or os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACEHUB_API_TOKEN") or ""
        self.url = f"https://router.huggingface.co/hf-inference/models/{self.model}"

    def _headers(self):
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def _embed(self, texts: list[str]) -> list[list[float]]:
        # HF feature-extraction: POST {"inputs": [...], "options": {"wait_for_model": true}}
        with httpx.Client(timeout=30) as c:
            r = c.post(self.url, json={"inputs": texts, "options": {"wait_for_model": True}}, headers=self._headers())
        if r.status_code == 401:
            raise RuntimeError("HF Inference 401 — set HF_TOKEN (https://huggingface.co/settings/tokens) di .env / Render Env")
        if r.status_code != 200:
            raise RuntimeError(f"HF Inference {r.status_code}: {r.text[:400]}")
        data = r.json()
        # HF returns [[float]] for single string, [[[float]]] for batch — normalisasi ke list[list[float]]
        if isinstance(data, list) and data and isinstance(data[0], (int, float)):
            return [data]  # single vector -> wrap
        return data  # type: ignore

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        # batch 32 biar tidak kena rate limit gratis
        out: list[list[float]] = []
        for i in range(0, len(texts), 32):
            out.extend(self._embed(texts[i:i+32]))
        return out

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text])[0]
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

# Pustaka Ekstraksi & Pembuatan Dokumen
from pypdf import PdfReader
import docx
from pptx import Presentation
import openpyxl
from fpdf import FPDF

# Inisialisasi FastAPI
app = FastAPI(title="API Asisten Pembaca Dokumen")

load_dotenv()

# ponytail: allow_origins=["*"]+allow_credentials=True rejected by browsers; tighten to Vercel URL when stable
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BACKEND_PUBLIC_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

@app.get("/ping")
async def ping():
    return {"status": "awake"}

# ==========================================
# INISIALISASI AI & DATABASE (LAZY)
# ==========================================

def get_vector_db():
    if not hasattr(get_vector_db, "_instance"):
        embeddings = HuggingFaceInferenceEmbeddings()
        get_vector_db._instance = PGVector(
            embeddings=embeddings,
            collection_name="dokumen_rag",
            connection=os.getenv("DATABASE_URL"),
            use_jsonb=True,
        )
    return get_vector_db._instance

# --- PERBAIKAN: INSTRUKSI PROMPT YANG SANGAT KETAT ---
# ponytail: rendered at import via BACKEND_PUBLIC_URL; if URL changes without restart, rebuild prompt
template_instruksi = f"""
    Kamu adalah asisten AI spesialis pembaca dokumen.
    Konteks dokumen di bawah ini telah dilengkapi dengan metadata [Sumber: Nama_File, halaman X].

    ATURAN DASAR MENJAWAB (PERTANYAAN BIASA):
    1. Jawablah pertanyaan pengguna dengan bahasa yang ramah, santai, dan sangat mudah dipahami (seperti menjelaskan kepada teman atau orang awam), tanpa jargon teknis yang membingungkan.
    2. Jika pengguna menanyakan rumus atau istilah teknis yang rumit, berikan analogi atau perumpamaan sederhana agar lebih mudah dimengerti.
    3. DILARANG menduplikasi penulisan variabel teknis. Sajikan dengan format yang bersih dan rapi.
    4. SITASI ADALAH KEWAJIBAN MUTLAK! Setiap kali kamu menuliskan fakta atau data dari dokumen, kamu WAJIB menempelkan sitasi tepat di ujung kalimat tersebut dalam format: **[Sumber: Nama_File.pdf, halaman X]**.
    5. JAWAB HANYA BERDASARKAN KONTEKS! Jika jawaban tidak ditemukan di dokumen, katakan dengan sopan: "Maaf, saya tidak menemukan informasi tersebut di dalam dokumen yang Anda berikan." DILARANG mengarang jawaban dari pengetahuan umum.
    6. Gunakan format LaTeX ($...$) untuk rumus agar terlihat profesional dan rapi.
    7. PENGECUALIAN UNTUK ATURAN 4 & 5: Jika pengguna HANYA meminta link download/dokumen asli tanpa menanyakan informasi teknis, abaikan aturan sitasi. Langsung berikan link unduhannya.

    JALUR KHUSUS A (PENGGUNA MEMINTA DOWNLOAD FILE ASLI):
    - HANYA aktif jika pengguna secara sadar mengetik: "minta file asli", "download dokumennya", "berikan filenya", "kirim dokumen", "kirimkan dokumen asli".
    - Berikan tautan ini di akhir: 📥 [Unduh Nama_File_Asli.pdf]({BACKEND_PUBLIC_URL}/api/files/download/Nama_File_Asli.pdf)
    - JIKA TIDAK DIMINTA, JANGAN BERIKAN LINK INI.

    JALUR KHUSUS B (PENGGUNA MEMINTA DIBUATKAN DOKUMEN BARU):
    - HANYA aktif jika pengguna mengetik: "buatkan PDF", "jadikan file", "buatkan rangkuman ke txt".
    - PERINGATAN PENTING: Jika pengguna meminta dibuatkan PDF/File, kamu TETAP WAJIB MENJAWAB PERTANYAAN DI CHAT TERLEBIH DAHULU SECARA LENGKAP DENGAN SITASI seperti biasa. Setelah SELURUH jawaban chat selesai (termasuk sitasi), barulah di PALING BAWAH sekali kamu tambahkan tag rahasia berikut:
      <NAMA_FILE>Nama_File_Baru.pdf</NAMA_FILE>
      <ISI_DOKUMEN>
      [Tuliskan seluruh materi, rangkuman, atau data yang diminta pengguna di sini dengan lengkap dan rapi]
      </ISI_DOKUMEN>

    Konteks Dokumen:
    {{context}}

    Pertanyaan Pengguna: {{question}}

    Jawaban:
"""
prompt = ChatPromptTemplate.from_template(template_instruksi)

# ==========================================
# ENDPOINT 1: UPLOAD DOKUMEN (ASYNC / BACKGROUND)
# ==========================================
UPLOAD_STATUS = {}

def _proses_dokumen(file_path: str, filename: str, user_id: Optional[str], x_session_id: Optional[str]):
    try:
        ekstensi = filename.lower().split('.')[-1]
        documents = []
        base_metadata = {"source": filename}
        if user_id:
            base_metadata["user_id"] = user_id
        if x_session_id:
            base_metadata["session_id"] = x_session_id

        if ekstensi == "pdf":
            reader = PdfReader(file_path)
            for i, hal in enumerate(reader.pages):
                page_num = i + 1
                t = hal.extract_text()
                if t:
                    page_text = f"\n--- Halaman {page_num} ---\n{t}"
                    meta = {**base_metadata, "page": page_num}
                    documents.append(Document(page_content=page_text, metadata=meta))
        elif ekstensi == "docx":
            doc = docx.Document(file_path)
            teks_dokumen = "\n".join([p.text for p in doc.paragraphs])
            if teks_dokumen.strip():
                documents.append(Document(page_content=teks_dokumen, metadata=dict(base_metadata)))
        elif ekstensi == "pptx":
            prs = Presentation(file_path)
            for i, slide in enumerate(prs.slides):
                slide_num = i + 1
                slide_text = f"\n--- Slide {slide_num} ---\n"
                has_text = False
                for shape in slide.shapes:
                    if hasattr(shape, "text") and shape.text.strip():
                        slide_text += shape.text + "\n"
                        has_text = True
                if has_text:
                    meta = {**base_metadata, "page": slide_num}
                    documents.append(Document(page_content=slide_text, metadata=meta))
        elif ekstensi == "xlsx":
            wb = openpyxl.load_workbook(file_path, data_only=True)
            teks_dokumen = ""
            for sheet_name in wb.sheetnames:
                sheet = wb[sheet_name]
                teks_dokumen += f"\n--- Sheet {sheet_name} ---\n"
                for baris in sheet.iter_rows(values_only=True):
                    teks_baris = ", ".join([str(sel) for sel in baris if sel is not None])
                    if teks_baris.strip(): 
                        teks_dokumen += teks_baris + "\n"
            if teks_dokumen.strip():
                documents.append(Document(page_content=teks_dokumen, metadata=dict(base_metadata)))

        if not documents:
            UPLOAD_STATUS[filename] = {"status": "error", "detail": "Dokumen kosong atau tidak terbaca."}
            return

        pemotong = RecursiveCharacterTextSplitter(chunk_size=4000, chunk_overlap=400)
        potongan = pemotong.split_documents(documents)

        for chunk in potongan:
            page = chunk.metadata.get("page")
            if page is not None:
                if "--- Halaman" not in chunk.page_content and "--- Slide" not in chunk.page_content:
                    tipe = "Slide" if ekstensi == "pptx" else "Halaman"
                    chunk.page_content = f"\n--- {tipe} {page} ---\n{chunk.page_content}"
            chunk.page_content = bersihkan_teks(chunk.page_content)
            chunk.metadata = {
                k: (bersihkan_teks(v) if isinstance(v, str) else v)
                for k, v in chunk.metadata.items()
            }

        get_vector_db().add_documents(potongan)
        UPLOAD_STATUS[filename] = {"status": "sukses", "detail": f"{filename} berhasil diindeks!"}
    except Exception as e:
        UPLOAD_STATUS[filename] = {"status": "error", "detail": str(e)}

@app.post("/api/upload")
async def upload_dokumen(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    x_session_id: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    filename = file.filename

    user_id = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
        payload = decode_token(token)
        if payload:
            user_id = payload.get("sub") or payload.get("id")

    try:
        data = await file.read()
        # Persist ke Supabase Storage jika aktif, fallback ke disk lokal
        if _storage.is_enabled():
            _, _, bucket_asli, _ = _storage._cfg()
            _storage.upload_bytes(bucket_asli, filename, data, file.content_type or "application/octet-stream")
            # Tulis ke /tmp untuk indexing (Render disk ephemeral, /tmp aman)
            file_path = os.path.join(_tmp.gettempdir(), filename)
            with open(file_path, "wb") as buffer:
                buffer.write(data)
        else:
            if not os.path.exists("./kumpulan_dokumen"):
                os.makedirs("./kumpulan_dokumen")
            file_path = f"./kumpulan_dokumen/{filename}"
            with open(file_path, "wb") as buffer:
                buffer.write(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menyimpan file: {str(e)}")

    UPLOAD_STATUS[filename] = {"status": "proses", "detail": f"{filename} sedang diindeks..."}
    # ponytail: Vercel serverless kills BackgroundTasks after response. Run inline for deploy.
    # Local dev can flip USE_BACKGROUND=1 to re-enable BackgroundTasks.
    if os.getenv("USE_BACKGROUND") == "1" and background_tasks is not None:
        background_tasks.add_task(_proses_dokumen, file_path, filename, user_id, x_session_id)
        return {"status": "proses", "pesan": f"{filename} sedang diproses di background."}
    _proses_dokumen(file_path, filename, user_id, x_session_id)
    result = UPLOAD_STATUS.get(filename, {"status": "sukses", "detail": "Selesai"})
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["detail"])
    return {"status": "sukses", "pesan": f"{filename} berhasil diproses."}

@app.get("/api/upload/status/{filename}")
async def upload_status(filename: str):
    status = UPLOAD_STATUS.get(filename)
    if not status:
        raise HTTPException(status_code=404, detail="Status tidak ditemukan.")
    return status
        
# ==========================================
# ENDPOINT: MELIHAT & MENGHAPUS DOKUMEN
# ==========================================
@app.get("/api/files")
async def lihat_daftar_dokumen(
    x_session_id: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    try:
        # Storage mode: list dari Supabase Storage, bukan disk
        if _storage.is_enabled():
            pass  # lanjut ke filter vector DB, daftar diambil dari bucket di bawah
        elif not os.path.exists("./kumpulan_dokumen"):
            return {"files": []}

        user_id = None
        if authorization and authorization.startswith("Bearer "):
            payload = decode_token(authorization.replace("Bearer ", ""))
            if payload:
                user_id = payload.get("sub") or payload.get("id")

        conn = get_raw_connection()
        try:
            cur = conn.cursor()
            if user_id:
                cur.execute(
                    "SELECT DISTINCT cmetadata->>'source' FROM langchain_pg_embedding WHERE cmetadata->>'user_id' = %s",
                    (user_id,),
                )
            elif x_session_id:
                cur.execute(
                    "SELECT DISTINCT cmetadata->>'source' FROM langchain_pg_embedding "
                    "WHERE cmetadata->>'session_id' = %s "
                    "AND (cmetadata->>'user_id' IS NULL OR cmetadata->>'user_id' = '')",
                    (x_session_id,),
                )
            else:
                cur.execute(
                    "SELECT DISTINCT cmetadata->>'source' FROM langchain_pg_embedding "
                    "WHERE (cmetadata->>'user_id' IS NULL OR cmetadata->>'user_id' = '') "
                    "AND (cmetadata->>'session_id' IS NULL OR cmetadata->>'session_id' = '')"
                )
            sumber_terotorisasi = {row[0] for row in cur.fetchall() if row[0]}
            cur.close()
        finally:
            conn.close()

        if _storage.is_enabled():
            _, _, bucket_asli, _ = _storage._cfg()
            try:
                bucket_files = _storage.list_objects(bucket_asli)
            except Exception as e:
                print(f"[storage] list failed: {e}")
                bucket_files = []
            # Fallback: jika bucket kosong/belum ada, tetap tampilkan sumber dari DB
            pool = set(bucket_files) if bucket_files else sumber_terotorisasi
            daftar_file = [f for f in pool if f in sumber_terotorisasi]
        else:
            daftar_file = [
                f for f in os.listdir("./kumpulan_dokumen")
                if os.path.isfile(os.path.join("./kumpulan_dokumen", f)) and f in sumber_terotorisasi
            ]
        return {"files": daftar_file}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/files/{filename}")
async def hapus_dokumen(filename: str):
    is_storage = _storage.is_enabled()
    if is_storage:
        _, _, bucket_asli, _ = _storage._cfg()
        try:
            _storage.delete_objects(bucket_asli, [filename])
        except Exception as e:
            print(f"[storage] delete {filename}: {e}")
        # tetap hapus vektor meski file bucket 404
    else:
        file_path = os.path.join("./kumpulan_dokumen", filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File tidak ditemukan.")
        try:
            os.remove(file_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    # Hapus dari database vektor agar AI "lupa"
    try:
        conn = get_raw_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM langchain_pg_embedding WHERE cmetadata->>'source' = %s", (filename,))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as db_err:
        print(f"Gagal menghapus vektor dari database: {db_err}")
    return {"status": "sukses", "pesan": f"{filename} dihapus!"}

# ==========================================
# AUTH: MODELS & ENDPOINTS
# ==========================================
class AuthRegister(BaseModel):
    email: str
    password: str
    session_id: Optional[str] = None

class AuthLogin(BaseModel):
    email: str
    password: str
    session_id: Optional[str] = None

class AuthResponse(BaseModel):
    token: str
    user: UserPublic

@app.on_event("startup")
async def init_users_table():
    try:
        conn = get_raw_connection()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        conn.commit()
        cur.close()
        conn.close()
        print("[DB] Table 'users' ready")
    except Exception as e:
        print(f"[DB] Warning: could not create users table: {e}")

@app.post("/api/auth/register", response_model=AuthResponse)
async def register(body: AuthRegister):
    conn = get_raw_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE email = %s", (body.email,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Email sudah terdaftar")

        user_id = str(uuid.uuid4())
        hashed = hash_password(body.password)
        cur.execute(
            "INSERT INTO users (id, email, password_hash) VALUES (%s, %s, %s)",
            (user_id, body.email, hashed),
        )
        conn.commit()

        if body.session_id:
            doc_count = auto_claim_documents(body.session_id, user_id)
            chat_count = auto_claim_chat_sessions(body.session_id, user_id)

        token = create_access_token({"sub": user_id, "email": body.email})
        cur.execute("SELECT created_at FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()

        return AuthResponse(
            token=token,
            user=UserPublic(id=user_id, email=body.email, created_at=str(row[0])),
        )
    except HTTPException:
        conn.close()
        raise
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auth/login", response_model=AuthResponse)
async def login(body: AuthLogin):
    conn = get_raw_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, email, password_hash, created_at FROM users WHERE email = %s", (body.email,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Email atau password salah")

        user_id, email, password_hash, created_at = row
        if not verify_password(body.password, password_hash):
            raise HTTPException(status_code=401, detail="Email atau password salah")

        if body.session_id:
            doc_count = auto_claim_documents(body.session_id, user_id)
            chat_count = auto_claim_chat_sessions(body.session_id, user_id)

        cur.close()
        conn.close()
        token = create_access_token({"sub": user_id, "email": email})
        return AuthResponse(
            token=token,
            user=UserPublic(id=user_id, email=email, created_at=str(created_at)),
        )
    except HTTPException:
        conn.close()
        raise
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/auth/me")
async def get_me(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Tidak terautentikasi")
    payload = decode_token(authorization.replace("Bearer ", ""))
    if not payload:
        raise HTTPException(status_code=401, detail="Token tidak valid")
    conn = get_raw_connection()
    try:
        cur = conn.cursor()
        user_id = payload.get("sub") or payload.get("id")
        cur.execute("SELECT id, email, created_at FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="User tidak ditemukan")
        return UserPublic(id=row[0], email=row[1], created_at=str(row[2]))
    except HTTPException:
        conn.close()
        raise
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# ENDPOINT 2: TANYA JAWAB (CHAT NON-STREAMING)
# ==========================================
class Pertanyaan(BaseModel):
    teks: str
    selected_files: Optional[List[str]] = None
    history: Optional[List[dict]] = None
    temperature: Optional[float] = None
    k: Optional[int] = None

def _build_user_filter(selected_files, user_payload, session_id):
    filter_parts = []

    if user_payload:
        user_id = user_payload.get("sub") or user_payload.get("id")
        filter_parts.append({"user_id": user_id})
        if session_id:
            filter_parts.append({"session_id": session_id})
    elif session_id:
        filter_parts.append({"session_id": session_id})

    if selected_files:
        if len(selected_files) == 1:
            filter_parts.append({"source": selected_files[0]})
        else:
            filter_parts.append({"source": {"$in": selected_files}})

    if not filter_parts:
        return None

    if len(filter_parts) == 1:
        return filter_parts[0]

    return {"$and": filter_parts}

@app.post("/api/chat")
async def chat_ai(
    pertanyaan: Pertanyaan,
    x_session_id: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    try:
        temp = pertanyaan.temperature or 0.5
        k_val = pertanyaan.k or 10
        current_llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite-preview", temperature=temp)

        user_payload = None
        if authorization and authorization.startswith("Bearer "):
            user_payload = decode_token(authorization.replace("Bearer ", ""))

        filter_dict = _build_user_filter(pertanyaan.selected_files, user_payload, x_session_id)
                
        if filter_dict:
            vector_results = get_vector_db().similarity_search(query=pertanyaan.teks, k=k_val * 3, filter=filter_dict)
            re_ranked = re_rank(pertanyaan.teks, vector_results, k=k_val)
            dokumen_relevan = re_ranked
        else:
            retriever_dynamic = get_vector_db().as_retriever(search_type="mmr", search_kwargs={"k": k_val * 3, "fetch_k": k_val * 6})
            vector_results = retriever_dynamic.invoke(pertanyaan.teks)
            re_ranked = re_rank(pertanyaan.teks, vector_results, k=k_val)
            dokumen_relevan = re_ranked

        konteks_dengan_sumber = "\n\n---\n\n".join(
            [f"[Sumber: {doc.metadata.get('source', 'Unknown')}, halaman {doc.metadata.get('page', 1)}]\n{doc.page_content}" for doc in dokumen_relevan]
        )
        
        history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in pertanyaan.history[-6:]]) if pertanyaan.history else ""
        full_context = f"History:\n{history_text}\n\nKonteks Dokumen:\n{konteks_dengan_sumber}"
        
        chain = prompt | current_llm | StrOutputParser()
        jawaban = chain.invoke({"context": full_context, "question": pertanyaan.teks})
        
        match_isi = re.search(r"<ISI_DOKUMEN>(.*?)</ISI_DOKUMEN>", jawaban, re.DOTALL)
        match_nama = re.search(r"<NAMA_FILE>(.*?)</NAMA_FILE>", jawaban)

        if match_isi and match_nama:
            isi_teks = match_isi.group(1).strip()
            nama_file_asli = match_nama.group(1).strip()
            nama_unik = f"{uuid.uuid4().hex[:6]}_{nama_file_asli}"
            # Build bytes dulu, lalu persist ke storage/ disk
            if nama_file_asli.lower().endswith('.pdf'):
                pdf = FPDF()
                pdf.add_page()
                pdf.set_font("Arial", size=11)
                isi_teks_pdf = isi_teks.encode('latin-1', 'replace').decode('latin-1')
                pdf.multi_cell(0, 7, txt=isi_teks_pdf)
                # FPDF output as bytes
                pdf_bytes = pdf.output(dest='S').encode('latin-1') if isinstance(pdf.output(dest='S'), str) else pdf.output(dest='S')
            else:
                pdf_bytes = None
            if _storage.is_enabled():
                _, _, _, bucket_hasil = _storage._cfg()
                if pdf_bytes is not None:
                    _storage.upload_bytes(bucket_hasil, nama_unik, pdf_bytes, "application/pdf")
                else:
                    _storage.upload_bytes(bucket_hasil, nama_unik, isi_teks.encode("utf-8"), "text/plain; charset=utf-8")
                # simpan juga ke /tmp agar konsisten (opsional)
                lokasi_simpan = os.path.join(_tmp.gettempdir(), nama_unik)
                if pdf_bytes is not None:
                    with open(lokasi_simpan, "wb") as f:
                        f.write(pdf_bytes)
                else:
                    with open(lokasi_simpan, "w", encoding="utf-8") as f:
                        f.write(isi_teks)
            else:
                os.makedirs("./dokumen_hasil", exist_ok=True)
                lokasi_simpan = f"./dokumen_hasil/{nama_unik}"
                if pdf_bytes is not None:
                    with open(lokasi_simpan, "wb") as f:
                        f.write(pdf_bytes)
                else:
                    with open(lokasi_simpan, "w", encoding="utf-8") as f:
                        f.write(isi_teks)
            link_download = f"{BACKEND_PUBLIC_URL}/api/generated/download/{nama_unik}"
            jawaban_bersih = re.sub(r"<NAMA_FILE>.*?</NAMA_FILE>", "", jawaban)
            jawaban_bersih = re.sub(
                r"<ISI_DOKUMEN>.*?</ISI_DOKUMEN>", 
                f"\n\n✅ **Dokumen berhasil dibuat!**\n📥 [**Klik di sini untuk mengunduh {nama_file_asli}**]({link_download})\n\n", 
                jawaban_bersih, 
                flags=re.DOTALL
            )
            jawaban = jawaban_bersih.strip()

        return {"jawaban": jawaban}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# ENDPOINT: DOWNLOAD FILE (ASLI & HASIL AI)
import logging

# Setup Logging
logging.basicConfig(
    filename='rag_performance.log',
    level=logging.INFO,
    format='%(asctime)s - %(message)s'
)


def re_rank(query: str, documents: List[Document], k: int = 3) -> List[Document]:
    # ponytail: reranker (CrossEncoder) removed for deploy — heavy model + cold start on Render Free.
    # Upgrade path: re-add sentence-transformers CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
    # and call reranker.predict(pairs) when persistent disk / paid tier available.
    if not documents:
        return []
    return documents[:k]

def _normalisasi_nama(nama: str) -> str:
    import re
    return re.sub(r"[^a-z0-9]+", " ", nama.lower()).strip()

def _resolve_file_path(filename: str, folder: str = "./kumpulan_dokumen") -> str:
    """Menemukan path file di folder, toleran terhadap beda spasi/underscore/case."""
    import urllib.parse
    filename = urllib.parse.unquote(filename)
    folder_abs = os.path.abspath(folder)
    exact = os.path.join(folder_abs, filename)
    if os.path.exists(exact):
        return exact

    target = _normalisasi_nama(filename)
    if not target:
        return exact

    semua = [n for n in os.listdir(folder_abs) if os.path.isfile(os.path.join(folder_abs, n))]
    cocok = [n for n in semua if _normalisasi_nama(n) == target]
    if len(cocok) == 1:
        return os.path.join(folder_abs, cocok[0])
    if len(cocok) > 1:
        return os.path.join(folder_abs, min(cocok, key=lambda n: len(n)))

    parsial = [n for n in semua if target in _normalisasi_nama(n) or _normalisasi_nama(n) in target]
    if parsial:
        return os.path.join(folder_abs, min(parsial, key=lambda n: len(n)))

    return exact

# ==========================================
@app.get("/api/files/download/{filename}")
async def download_file(filename: str):
    import urllib.parse
    filename = urllib.parse.unquote(filename)
    if _storage.is_enabled():
        _, _, bucket_asli, _ = _storage._cfg()
        # Coba exact dulu, fallback ke list untuk fuzzy jika tidak ketemu
        try:
            data = _storage.download_bytes(bucket_asli, filename)
            tmp_path = os.path.join(_tmp.gettempdir(), os.path.basename(filename))
            with open(tmp_path, "wb") as f:
                f.write(data)
            return FileResponse(tmp_path, filename=os.path.basename(filename))
        except FileNotFoundError:
            # fuzzy: cari yang match normalisasi
            try:
                candidates = _storage.list_objects(bucket_asli)
                target = _normalisasi_nama(filename)
                match = next((c for c in candidates if _normalisasi_nama(c) == target), None)
                if not match:
                    match = next((c for c in candidates if target in _normalisasi_nama(c) or _normalisasi_nama(c) in target), None)
                if match:
                    data = _storage.download_bytes(bucket_asli, match)
                    tmp_path = os.path.join(_tmp.gettempdir(), os.path.basename(match))
                    with open(tmp_path, "wb") as f:
                        f.write(data)
                    return FileResponse(tmp_path, filename=os.path.basename(match))
            except Exception:
                pass
            raise HTTPException(status_code=404, detail="File tidak ditemukan.")
    file_path = _resolve_file_path(filename, "./kumpulan_dokumen")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File tidak ditemukan.")
    return FileResponse(file_path, filename=os.path.basename(file_path))

@app.get("/api/generated/download/{filename}")
async def download_generated_file(filename: str):
    import urllib.parse
    filename = urllib.parse.unquote(filename)
    if _storage.is_enabled():
        _, _, _, bucket_hasil = _storage._cfg()
        try:
            data = _storage.download_bytes(bucket_hasil, filename)
            tmp_path = os.path.join(_tmp.gettempdir(), os.path.basename(filename))
            with open(tmp_path, "wb") as f:
                f.write(data)
            return FileResponse(tmp_path, filename=filename)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="File hasil tidak ditemukan.")
    file_path = os.path.join("./dokumen_hasil", filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File hasil tidak ditemukan.")
    return FileResponse(file_path, filename=filename)

@app.get("/api/files/preview/{filename}")
async def preview_file(filename: str):
    import urllib.parse
    filename = urllib.parse.unquote(filename)
    # Ambil file ke /tmp jika dari Supabase
    if _storage.is_enabled():
        _, _, bucket_asli, _ = _storage._cfg()
        try:
            data = _storage.download_bytes(bucket_asli, filename)
        except FileNotFoundError:
            # fuzzy fallback
            try:
                candidates = _storage.list_objects(bucket_asli)
                target = _normalisasi_nama(filename)
                match = next((c for c in candidates if _normalisasi_nama(c) == target), None)
                if not match:
                    match = next((c for c in candidates if target in _normalisasi_nama(c) or _normalisasi_nama(c) in target), None)
                if match:
                    filename = match
                    data = _storage.download_bytes(bucket_asli, match)
                else:
                    raise HTTPException(status_code=404, detail="File tidak ditemukan.")
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=404, detail="File tidak ditemukan.")
        file_path = os.path.join(_tmp.gettempdir(), os.path.basename(filename))
        with open(file_path, "wb") as f:
            f.write(data)
    else:
        file_path = _resolve_file_path(filename, "./kumpulan_dokumen")
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File tidak ditemukan.")

    nama_disk = os.path.basename(file_path)
    ekstensi = nama_disk.lower().split('.')[-1]
    if ekstensi == "pdf":
        return FileResponse(file_path)
    # COM hanya ada di Windows — di Render (Linux) kembalikan 501 yang jelas
    if comtypes is None or pythoncom is None:
        raise HTTPException(status_code=501, detail="Preview Office tidak tersedia di server Linux. Silakan download file.")
    preview_dir = os.path.join(_tmp.gettempdir(), "preview")
    if not os.path.exists(preview_dir):
        os.makedirs(preview_dir)

    pdf_filename = f"{nama_disk}.pdf"
    pdf_path = os.path.join(preview_dir, pdf_filename)

    if os.path.exists(pdf_path):
        return FileResponse(pdf_path)

    try:
        pythoncom.CoInitialize()
        if ekstensi in ["doc", "docx"]:
            word = comtypes.client.CreateObject("Word.Application")
            word.Visible = False
            doc = word.Documents.Open(file_path)
            doc.SaveAs(pdf_path, FileFormat=17)
            doc.Close()
            word.Quit()
        elif ekstensi in ["ppt", "pptx"]:
            powerpoint = comtypes.client.CreateObject("Powerpoint.Application")
            ppt = powerpoint.Presentations.Open(file_path, WithWindow=False)
            ppt.SaveAs(pdf_path, 32)
            ppt.Close()
            powerpoint.Quit()
        elif ekstensi in ["xls", "xlsx"]:
            excel = comtypes.client.CreateObject("Excel.Application")
            excel.Visible = False
            wb = excel.Workbooks.Open(file_path)
            wb.ExportAsFixedFormat(0, pdf_path)
            wb.Close(False)
            excel.Quit()
        else:
            raise HTTPException(status_code=400, detail="Format tidak didukung untuk preview.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal convert ke PDF: {str(e)}")
    finally:
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass

    if os.path.exists(pdf_path):
        return FileResponse(pdf_path)
    raise HTTPException(status_code=500, detail="File PDF tidak terbentuk.")

# ==========================================
# ENDPOINT: CHAT STREAMING (DENGAN BUFFER & ANTI-ERROR)
# ==========================================
@app.post("/api/chat/stream")
async def chat_ai_stream(
    pertanyaan: Pertanyaan,
    x_session_id: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    try:
        temp = pertanyaan.temperature or 0.5
        k_val = pertanyaan.k or 10
        current_llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite-preview", temperature=temp)

        user_payload = None
        if authorization and authorization.startswith("Bearer "):
            user_payload = decode_token(authorization.replace("Bearer ", ""))

        filter_dict = _build_user_filter(pertanyaan.selected_files, user_payload, x_session_id)
                
        # Inisialisasi variabel untuk diakses di generate()
        vector_results = []
        dokumen_relevan = []
        corrected = False

        filter_dict = _build_user_filter(pertanyaan.selected_files, user_payload, x_session_id)
                
        if filter_dict:
            vector_results = get_vector_db().similarity_search(query=pertanyaan.teks, k=k_val, filter=filter_dict)
            dokumen_relevan = vector_results
        else:
            retriever_dynamic = get_vector_db().as_retriever(search_type="mmr", search_kwargs={"k": k_val, "fetch_k": k_val * 2})
            vector_results = retriever_dynamic.invoke(pertanyaan.teks)
            dokumen_relevan = vector_results
            
        konteks_dengan_sumber = "\n\n---\n\n".join(
            [f"[Sumber: {doc.metadata.get('source', 'Unknown')}, halaman {doc.metadata.get('page', 1)}]\n{doc.page_content}" for doc in dokumen_relevan]
        )
        
        history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in pertanyaan.history[-6:]]) if pertanyaan.history else ""
        full_context = f"History:\n{history_text}\n\nKonteks Dokumen:\n{konteks_dengan_sumber}"
        
        # Panggil LLM untuk jawaban
        chain = prompt | current_llm | StrOutputParser()
        
        async def generate():
            import json, re
            full_response = await chain.ainvoke({"context": full_context, "question": pertanyaan.teks})
            
            # Cek apakah ini permintaan download file
            is_download_request = "/api/files/download/" in full_response
            
            # Self-Correction Loop: Verifikasi sitasi (Bypass jika request download atau penolakan konteks)
            is_corrected = False
            # Deteksi apakah AI menjawab tidak tahu atau informasi tidak ada
            is_reject_response = "maaf" in full_response.lower() and ("tidak menemukan" in full_response.lower() or "tidak terdapat" in full_response.lower())
            
            if not is_download_request and not is_reject_response and "[Sumber:" not in full_response:
                correction_prompt = ChatPromptTemplate.from_template(
                    "Jawaban ini tidak mengandung sitasi. Tolong susun ulang jawaban berikut dengan sitasi berdasarkan konteks.\n\nKonteks: {context}\n\nJawaban awal: {jawaban}"
                )
                correction_chain = correction_prompt | current_llm | StrOutputParser()
                full_response = await correction_chain.ainvoke({"context": full_context, "jawaban": full_response})
                is_corrected = True

            # Deteksi pembuatan dokumen
            is_generating_file = False
            match_isi = re.search(r"<ISI_DOKUMEN>(.*?)(?:</ISI_DOKUMEN>|$)", full_response, re.DOTALL | re.IGNORECASE)
            match_nama = re.search(r"<NAMA_FILE>(.*?)</NAMA_FILE>", full_response, re.IGNORECASE)
            
            chat_text = full_response
            if match_isi and match_nama:
                is_generating_file = True
                # Bersihkan chat_text dari tag XML sebelum distream ke user
                chat_text = re.sub(r"<NAMA_FILE>.*?</NAMA_FILE>", "", chat_text, flags=re.IGNORECASE | re.DOTALL)
                chat_text = re.sub(r"<ISI_DOKUMEN>.*?(?:</ISI_DOKUMEN>|$)", "", chat_text, flags=re.IGNORECASE | re.DOTALL)

            # Streaming response murni tanpa tag XML
            for token in chat_text:
                yield f"data: {json.dumps({'token': token})}\n\n"
            
            # ---------------------------------------------------------
            # PROSES PEMBUATAN FILE FISIK SETELAH STREAMING SELESAI
            # ---------------------------------------------------------
            if is_generating_file:
                import uuid, os
                from fpdf import FPDF
                
                # PERBAIKAN 2: Gunakan IGNORECASE dan toleransi jika AI lupa menutup tag
                match_isi = re.search(r"<ISI_DOKUMEN>(.*?)(?:</ISI_DOKUMEN>|$)", full_response, re.DOTALL | re.IGNORECASE)
                match_nama = re.search(r"<NAMA_FILE>(.*?)</NAMA_FILE>", full_response, re.IGNORECASE)
                
                if match_isi and match_nama:
                    isi_teks = match_isi.group(1).strip()
                    nama_file_asli = match_nama.group(1).strip()
                    
                    # Hapus simbol aneh dari nama file agar tidak error di Windows
                    nama_file_asli = re.sub(r'[\\/*?:"<>|]', "", nama_file_asli)
                    
                    nama_unik = f"{uuid.uuid4().hex[:6]}_{nama_file_asli}"
                    # Build bytes lalu persist ke Supabase jika aktif
                    pdf_bytes = None
                    txt_bytes = None
                    is_pdf_req = nama_unik.lower().endswith(".pdf")
                    try:
                        pdf = FPDF()
                        pdf.add_page()
                        pdf.set_font("Arial", size=11)
                        isi_teks_pdf = isi_teks.encode('latin-1', 'ignore').decode('latin-1')
                        pdf.multi_cell(0, 7, txt=isi_teks_pdf)
                        out = pdf.output(dest='S')
                        pdf_bytes = out.encode('latin-1') if isinstance(out, str) else bytes(out)
                        if _storage.is_enabled():
                            _, _, _, bucket_hasil = _storage._cfg()
                            _storage.upload_bytes(bucket_hasil, nama_unik, pdf_bytes, "application/pdf")
                        lokasi_simpan = os.path.join(_tmp.gettempdir(), nama_unik) if _storage.is_enabled() else f"./dokumen_hasil/{nama_unik}"
                        if not _storage.is_enabled():
                            os.makedirs("./dokumen_hasil", exist_ok=True)
                        with open(lokasi_simpan, "wb") as f:
                            f.write(pdf_bytes)
                        final_filename = nama_file_asli
                    except Exception as e:
                        print(f"Gagal membuat PDF, fallback ke TXT: {e}")
                        txt_bytes = isi_teks.encode("utf-8")
                        nama_txt = nama_unik.replace(".pdf", ".txt") if is_pdf_req else nama_unik
                        if _storage.is_enabled():
                            _, _, _, bucket_hasil = _storage._cfg()
                            try:
                                _storage.upload_bytes(bucket_hasil, nama_txt, txt_bytes, "text/plain; charset=utf-8")
                            except Exception as se:
                                print(f"[storage] upload hasil txt gagal: {se}")
                            lokasi_simpan = os.path.join(_tmp.gettempdir(), nama_txt)
                            with open(lokasi_simpan, "wb") as f:
                                f.write(txt_bytes)
                        else:
                            os.makedirs("./dokumen_hasil", exist_ok=True)
                            lokasi_simpan = f"./dokumen_hasil/{nama_txt}"
                            with open(lokasi_simpan, "w", encoding="utf-8") as f:
                                f.write(isi_teks)
                        final_filename = nama_file_asli.replace(".pdf", ".txt") if is_pdf_req else nama_file_asli
                        
                    link_download = f"{BACKEND_PUBLIC_URL}/api/generated/download/{os.path.basename(lokasi_simpan)}"
                    pesan_selesai = f"\n\n✨ **Selesai!** 📥 [**Unduh {final_filename} di sini**]({link_download})"
                    yield f"data: {json.dumps({'token': pesan_selesai})}\n\n"
                else:
                    # Kalau AI ngaco banget balasannya
                    pesan_gagal = "\n\n*(Sistem gagal mendeteksi format dokumen dari AI)*"
                    yield f"data: {json.dumps({'token': pesan_gagal})}\n\n"

            yield "data: [DONE]\n\n"
        
        return StreamingResponse(generate(), media_type="text/event-stream")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
       
# ==========================================
# MODEL DATA & STORAGE UNTUK CHAT HISTORY
# ==========================================
CHAT_FILE = "./chat_history.json"

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatSessionModel(BaseModel):
    id: str = ""
    title: str = "Percakapan baru"
    messages: list[ChatMessage] = []
    created_at: str = ""

def _baca_chat():
    if not os.path.exists(CHAT_FILE):
        return []
    try:
        with open(CHAT_FILE, "r") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except:
        return []

def _simpan_chat(data: list):
    with open(CHAT_FILE, "w") as f:
        json.dump(data, f, indent=2, default=str)

# ==========================================
# ENDPOINT 3: CHAT HISTORY
# ==========================================
@app.get("/api/chat/sessions")
async def list_sessions(
    x_session_id: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    all_sessions = _baca_chat()
    user_payload = None
    if authorization and authorization.startswith("Bearer "):
        user_payload = decode_token(authorization.replace("Bearer ", ""))

    if user_payload:
        user_id = user_payload.get("sub") or user_payload.get("id")
        filtered = [s for s in all_sessions if s.get("user_id") == user_id]
        return filtered
    elif x_session_id:
        filtered = [s for s in all_sessions if s.get("session_id") == x_session_id and not s.get("user_id")]
        return filtered
    else:
        return []

@app.post("/api/chat/sessions")
async def create_session(
    x_session_id: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    data = _baca_chat()
    user_payload = None
    if authorization and authorization.startswith("Bearer "):
        user_payload = decode_token(authorization.replace("Bearer ", ""))

    baru = {
        "id": str(uuid.uuid4()),
        "title": "Percakapan baru",
        "messages": [],
        "created_at": datetime.now().isoformat(),
    }
    if user_payload:
        baru["user_id"] = user_payload.get("sub") or user_payload.get("id")
    elif x_session_id:
        baru["session_id"] = x_session_id

    data.insert(0, baru)
    _simpan_chat(data)
    return baru

@app.put("/api/chat/sessions/{session_id}")
async def update_session(
    session_id: str,
    body: ChatSessionModel,
    authorization: Optional[str] = Header(None),
):
    data = _baca_chat()
    for i, s in enumerate(data):
        if s["id"] == session_id:
            updated = {
                "id": session_id,
                "title": body.title or "Percakapan baru",
                "messages": [m.model_dump() for m in body.messages],
                "created_at": s.get("created_at", datetime.now().isoformat()),
            }
            if s.get("user_id"):
                updated["user_id"] = s["user_id"]
            if s.get("session_id") and not s.get("user_id"):
                updated["session_id"] = s["session_id"]
            data[i] = updated
            _simpan_chat(data)
            return data[i]
    raise HTTPException(status_code=404, detail="Sesi tidak ditemukan.")

@app.delete("/api/chat/sessions/{session_id}")
async def delete_session(session_id: str):
    data = _baca_chat()
    baru = [s for s in data if s["id"] != session_id]
    if len(baru) == len(data):
        raise HTTPException(status_code=404, detail="Sesi tidak ditemukan.")
    _simpan_chat(baru)
    return {"status": "dihapus"}
