import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

import comtypes.client
import pythoncom

# Pustaka AI LangChain
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Pustaka Ekstraksi Dokumen
from pypdf import PdfReader
from pdf2image import convert_from_path
import pytesseract
import docx
from pptx import Presentation
import openpyxl

# Inisialisasi FastAPI
app = FastAPI(title="API Asisten Pembaca Dokumen")

# Mengizinkan Next.js (berjalan di port 3000) untuk mengakses API ini (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# INISIALISASI AI & DATABASE
# ==========================================
load_dotenv()
embeddings = HuggingFaceEmbeddings(model_name="paraphrase-multilingual-MiniLM-L12-v2")
vektor_db = Chroma(persist_directory="./database", embedding_function=embeddings)
# Peningkatan k=10 dan menggunakan search_type='mmr' untuk keragaman dokumen
retriever = vektor_db.as_retriever(search_type="mmr", search_kwargs={"k": 10, "fetch_k": 20})
llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite-preview", temperature=0.5)

template_instruksi = """
    Kamu adalah asisten AI yang cerdas, ramah, dan interaktif.
    Konteks dokumen di bawah ini telah dilengkapi dengan tag [Sumber: Nama File].

    Aturan menjawab:
    1. Berikan jawaban yang SANGAT DETAIL dan MENYELURUH.
    2. Kamu WAJIB melakukan sintesis dari SEMUA dokumen yang tersedia jika informasi tersebar. Jangan hanya terpaku pada satu dokumen saja.
    3. Kamu WAJIB menyebutkan sumber referensi secara natural di dalam penjelasanmu. Contoh: "Menurut dokumen A... dan dokumen B..." atau cantumkan "(Sumber: A.pdf, B.docx)" di akhir poin penjelasan.
    4. Gunakan format yang rapi (bullet points, paragraf, atau teks tebal) agar mudah dibaca.
    5. Jika informasi TIDAK ADA di dalam konteks, katakan: "Maaf, saya belum menemukan informasi tersebut di dalam dokumen."

    Konteks Dokumen:
    {context}

    Pertanyaan Pengguna: {question}

    Jawaban Detail beserta Referensi:
    """
prompt = ChatPromptTemplate.from_template(template_instruksi)

# ==========================================
# ENDPOINT 1: UPLOAD DOKUMEN
# ==========================================
@app.post("/api/upload")
async def upload_dokumen(file: UploadFile = File(...)):
    if not os.path.exists("./kumpulan_dokumen"):
        os.makedirs("./kumpulan_dokumen")
        
    filename = file.filename
    file_path = f"./kumpulan_dokumen/{filename}"
    
    # Simpan file fisik
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    ekstensi = filename.lower().split('.')[-1]
    teks_dokumen = ""
    
    # Ekstraksi Teks dan Chunking langsung per halaman
    try:
        potongan_global = []
        metadatas_global = []
        pemotong = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)

        if ekstensi == "pdf":
            reader = PdfReader(file_path)
            for i, hal in enumerate(reader.pages):
                page_num = i + 1
                t = hal.extract_text()
                
                # Fallback OCR jika teks kosong di halaman ini
                if not t or not t.strip():
                    try:
                        # Convert specific page (pdf2image uses 1-based indexing for first_page)
                        images = convert_from_path(file_path, first_page=page_num, last_page=page_num)
                        if images:
                            t = pytesseract.image_to_string(images[0])
                    except Exception as e:
                        print(f"OCR gagal pada halaman {page_num}: {e}")
                        t = ""

                if t and t.strip():
                    chunks = pemotong.split_text(t)
                    potongan_global.extend(chunks)
                    metadatas_global.extend([{"source": filename, "page": page_num}] * len(chunks))

        elif ekstensi == "docx":
            doc = docx.Document(file_path)
            teks_dokumen = "\n".join([p.text for p in doc.paragraphs])
            if teks_dokumen.strip():
                chunks = pemotong.split_text(teks_dokumen)
                potongan_global.extend(chunks)
                metadatas_global.extend([{"source": filename, "page": 1}] * len(chunks))

        elif ekstensi == "pptx":
            prs = Presentation(file_path)
            for i, slide in enumerate(prs.slides):
                slide_num = i + 1
                teks_slide = ""
                for shape in slide.shapes:
                    if hasattr(shape, "text") and shape.text.strip():
                        teks_slide += shape.text + "\n"
                if teks_slide.strip():
                    chunks = pemotong.split_text(teks_slide)
                    potongan_global.extend(chunks)
                    metadatas_global.extend([{"source": filename, "page": slide_num}] * len(chunks))

        elif ekstensi == "xlsx":
            wb = openpyxl.load_workbook(file_path, data_only=True)
            for sheet_idx, sheet_name in enumerate(wb.sheetnames):
                sheet = wb[sheet_name]
                teks_sheet = ""
                for baris in sheet.iter_rows(values_only=True):
                    teks_baris = ", ".join([str(sel) for sel in baris if sel is not None])
                    if teks_baris.strip(): teks_sheet += teks_baris + "\n"
                
                if teks_sheet.strip():
                    chunks = pemotong.split_text(teks_sheet)
                    potongan_global.extend(chunks)
                    metadatas_global.extend([{"source": filename, "page": sheet_idx + 1}] * len(chunks))
        
        if potongan_global:
            vektor_db.add_texts(texts=potongan_global, metadatas=metadatas_global)
            return {"status": "sukses", "pesan": f"{filename} berhasil diindeks!"}
        else:
            raise HTTPException(status_code=400, detail="Dokumen kosong atau tidak terbaca.")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
       
# ==========================================
# ENDPOINT: MELIHAT & MENGHAPUS DOKUMEN
# ==========================================
@app.get("/api/files")
async def lihat_daftar_dokumen():
    try:
        if not os.path.exists("./kumpulan_dokumen"):
            return {"files": []}
        
        # Ambil file di folder kumpulan_dokumen, kecualikan folder 'preview'
        daftar_file = [f for f in os.listdir("./kumpulan_dokumen") if os.path.isfile(os.path.join("./kumpulan_dokumen", f))]
        return {"files": daftar_file}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/files/{filename}")
async def hapus_dokumen(filename: str):
    file_path = os.path.join("./kumpulan_dokumen", filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File tidak ditemukan.")
    try:
        os.remove(file_path)
        # Hapus data dari vector db berdasarkan metadata source
        vektor_db.delete(where={"source": filename})
        return {"status": "sukses", "pesan": f"{filename} dihapus!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# ENDPOINT 2: TANYA JAWAB (CHAT)
# ==========================================
from typing import List, Optional

class Pertanyaan(BaseModel):
    teks: str
    selected_files: Optional[List[str]] = []

@app.post("/api/chat")
async def chat_ai(pertanyaan: Pertanyaan):
    try:
        filter_dict = None
        if pertanyaan.selected_files:
            if len(pertanyaan.selected_files) == 1:
                filter_dict = {"source": pertanyaan.selected_files[0]}
            else:
                filter_dict = {"source": {"$in": pertanyaan.selected_files}}
                
        if filter_dict:
            dokumen_relevan = vektor_db.similarity_search(
                query=pertanyaan.teks, 
                k=10, 
                filter=filter_dict
            )
        else:
            dokumen_relevan = retriever.invoke(pertanyaan.teks)
        
        konteks_dengan_sumber = "\n\n---\n\n".join(
            [f"[Sumber: {doc.metadata.get('source', 'Unknown')}, halaman {doc.metadata.get('page', 1)}]\n{doc.page_content}" for doc in dokumen_relevan]
        )
        
        chain = prompt | llm | StrOutputParser()
        jawaban = chain.invoke({"context": konteks_dengan_sumber, "question": pertanyaan.teks})
        
        return {"jawaban": jawaban}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from fastapi.responses import FileResponse, StreamingResponse

# ==========================================
# ENDPOINT: DOWNLOAD FILE
# ==========================================
@app.get("/api/files/download/{filename}")
async def download_file(filename: str):
    import urllib.parse
    filename = urllib.parse.unquote(filename)
    file_path = os.path.join("./kumpulan_dokumen", filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File tidak ditemukan.")
    return FileResponse(file_path)

@app.get("/api/files/preview/{filename}")

async def preview_file(filename: str):
    # Mengatasi encoded URL (e.g. Analisis%20TRAM.pptx)
    import urllib.parse
    filename = urllib.parse.unquote(filename)
    
    file_path = os.path.abspath(os.path.join("./kumpulan_dokumen", filename))
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File tidak ditemukan.")
        
    ekstensi = filename.lower().split('.')[-1]
    
    if ekstensi == "pdf":
        return FileResponse(file_path)
        
    # Buat folder preview jika belum ada
    preview_dir = os.path.abspath("./kumpulan_dokumen/preview")
    if not os.path.exists(preview_dir):
        os.makedirs(preview_dir)
        
    pdf_filename = f"{filename}.pdf"
    pdf_path = os.path.join(preview_dir, pdf_filename)
    
    # Jika sudah di-convert, langsung return
    if os.path.exists(pdf_path):
        return FileResponse(pdf_path)
        
    # Convert menggunakan comtypes (Butuh MS Office terinstall di Windows)
    try:
        pythoncom.CoInitialize()
        if ekstensi in ["doc", "docx"]:
            word = comtypes.client.CreateObject("Word.Application")
            word.Visible = False
            doc = word.Documents.Open(file_path)
            doc.SaveAs(pdf_path, FileFormat=17) # 17 = wdFormatPDF
            doc.Close()
            word.Quit()
        elif ekstensi in ["ppt", "pptx"]:
            powerpoint = comtypes.client.CreateObject("Powerpoint.Application")
            # PowerPoint tidak mengizinkan .Visible = False di beberapa versi, kita hapus
            ppt = powerpoint.Presentations.Open(file_path, WithWindow=False)
            ppt.SaveAs(pdf_path, 32) # 32 = ppSaveAsPDF
            ppt.Close()
            powerpoint.Quit()
        elif ekstensi in ["xls", "xlsx"]:
            excel = comtypes.client.CreateObject("Excel.Application")
            excel.Visible = False
            wb = excel.Workbooks.Open(file_path)
            wb.ExportAsFixedFormat(0, pdf_path) # 0 = xlTypePDF
            wb.Close(False)
            excel.Quit()
        else:
            raise HTTPException(status_code=400, detail="Format tidak didukung untuk preview.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal convert ke PDF: {str(e)}")
    finally:
        pythoncom.CoUninitialize()
        
    if os.path.exists(pdf_path):
        return FileResponse(pdf_path)
    raise HTTPException(status_code=500, detail="File PDF tidak terbentuk.")


@app.post("/api/chat/stream")
async def chat_ai_stream(pertanyaan: Pertanyaan):
    try:
        filter_dict = None
        if pertanyaan.selected_files:
            if len(pertanyaan.selected_files) == 1:
                filter_dict = {"source": pertanyaan.selected_files[0]}
            else:
                filter_dict = {"source": {"$in": pertanyaan.selected_files}}
                
        if filter_dict:
            dokumen_relevan = vektor_db.similarity_search(
                query=pertanyaan.teks, 
                k=10, 
                filter=filter_dict
            )
        else:
            dokumen_relevan = retriever.invoke(pertanyaan.teks)
        
        konteks_dengan_sumber = "\n\n---\n\n".join(
            [f"[Sumber: {doc.metadata.get('source', 'Unknown')}, halaman {doc.metadata.get('page', 1)}]\n{doc.page_content}" for doc in dokumen_relevan]
        )
        
        chain = prompt | llm | StrOutputParser()
        
        async def generate():
            async for chunk in chain.astream({"context": konteks_dengan_sumber, "question": pertanyaan.teks}):
                if chunk:
                    yield f"data: {json.dumps({'token': chunk})}\n\n"
            yield "data: [DONE]\n\n"
        
        return StreamingResponse(generate(), media_type="text/event-stream")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# MODEL DATA & STORAGE UNTUK CHAT HISTORY
# ==========================================
import json
import uuid
from datetime import datetime

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
async def list_sessions():
    return _baca_chat()

@app.post("/api/chat/sessions")
async def create_session():
    data = _baca_chat()
    baru = {
        "id": str(uuid.uuid4()),
        "title": "Percakapan baru",
        "messages": [],
        "created_at": datetime.now().isoformat()
    }
    data.insert(0, baru)
    _simpan_chat(data)
    return baru

@app.put("/api/chat/sessions/{session_id}")
async def update_session(session_id: str, body: ChatSessionModel):
    data = _baca_chat()
    for i, s in enumerate(data):
        if s["id"] == session_id:
            data[i] = {
                "id": session_id,
                "title": body.title or "Percakapan baru",
                "messages": [m.model_dump() for m in body.messages],
                "created_at": s.get("created_at", datetime.now().isoformat())
            }
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