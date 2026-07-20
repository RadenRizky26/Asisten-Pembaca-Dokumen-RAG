import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from typing import List, Optional

import comtypes.client
import pythoncom

# Pustaka AI LangChain
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

# Pustaka Ekstraksi Dokumen
from pypdf import PdfReader
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
    Konteks dokumen di bawah ini telah dilengkapi dengan penanda halaman seperti --- Halaman 1 ---.

    Aturan menjawab:
    1. Berikan jawaban yang SANGAT DETAIL dan MENYELURUH.
    2. Kamu WAJIB melakukan sintesis dari SEMUA dokumen yang tersedia jika informasi tersebar. Jangan hanya terpaku pada satu dokumen saja.
    3. Cari tanda --- Halaman X --- atau --- Slide X --- dalam konteks untuk menentukan referensi halaman.
    4. Kamu WAJIB menyebutkan sumber referensi secara natural di dalam penjelasanmu. Contoh: "Menurut dokumen A halaman 1... dan dokumen B slide 2..." atau cantumkan "(Sumber: A.pdf, halaman 1)" di akhir poin penjelasan.
    5. Gunakan format yang rapi (bullet points, paragraf, atau teks tebal) agar mudah dibaca.
    6. Jika informasi TIDAK ADA di dalam konteks, katakan: "Maaf, saya belum menemukan informasi tersebut di dalam dokumen."

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
    
    # Kumpulan dokumen terstruktur dengan metadata halaman
    documents = []
    
    # Ekstraksi Teks
    try:
        if ekstensi == "pdf":
            reader = PdfReader(file_path)
            for i, hal in enumerate(reader.pages):
                page_num = i + 1
                t = hal.extract_text()
                if t:
                    page_text = f"\n--- Halaman {page_num} ---\n{t}"
                    documents.append(Document(
                        page_content=page_text, 
                        metadata={"source": filename, "page": page_num}
                    ))
        elif ekstensi == "docx":
            doc = docx.Document(file_path)
            teks_dokumen = "\n".join([p.text for p in doc.paragraphs])
            if teks_dokumen.strip():
                documents.append(Document(
                    page_content=teks_dokumen, 
                    metadata={"source": filename}
                ))
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
                    documents.append(Document(
                        page_content=slide_text, 
                        metadata={"source": filename, "page": slide_num}
                    ))
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
                documents.append(Document(
                    page_content=teks_dokumen, 
                    metadata={"source": filename}
                ))
        
        if documents:
            pemotong = RecursiveCharacterTextSplitter(chunk_size=4000, chunk_overlap=400)
            potongan = pemotong.split_documents(documents)
            
            # Pastikan setiap potongan memiliki marker halaman (berguna jika teks sangat panjang dan terpecah)
            for chunk in potongan:
                page = chunk.metadata.get("page")
                if page is not None:
                    if "--- Halaman" not in chunk.page_content and "--- Slide" not in chunk.page_content:
                        # Tambahkan marker sesuai ekstensi (fallback ke Halaman)
                        tipe = "Slide" if ekstensi == "pptx" else "Halaman"
                        chunk.page_content = f"\n--- {tipe} {page} ---\n{chunk.page_content}"
                        
            vektor_db.add_documents(potongan)
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
class Pertanyaan(BaseModel):
    teks: str
    selected_files: Optional[List[str]] = None
    history: Optional[List[dict]] = None
    temperature: Optional[float] = None
    k: Optional[int] = None

@app.post("/api/chat")
async def chat_ai(pertanyaan: Pertanyaan):
    try:
        temp = pertanyaan.temperature or 0.5
        k_val = pertanyaan.k or 10
        current_llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite-preview", temperature=temp)
        
        filter_dict = None
        if pertanyaan.selected_files:
            if len(pertanyaan.selected_files) == 1:
                filter_dict = {"source": pertanyaan.selected_files[0]}
            else:
                filter_dict = {"source": {"$in": pertanyaan.selected_files}}
                
        if filter_dict:
            dokumen_relevan = vektor_db.similarity_search(
                query=pertanyaan.teks, 
                k=k_val, 
                filter=filter_dict
            )
        else:
            retriever_dynamic = vektor_db.as_retriever(search_type="mmr", search_kwargs={"k": k_val, "fetch_k": k_val * 2})
            dokumen_relevan = retriever_dynamic.invoke(pertanyaan.teks)
        
        konteks_dengan_sumber = "\n\n---\n\n".join(
            [f"[Sumber: {doc.metadata.get('source', 'Unknown')}, halaman {doc.metadata.get('page', 1)}]\n{doc.page_content}" for doc in dokumen_relevan]
        )
        
        history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in pertanyaan.history[-6:]]) if pertanyaan.history else ""
        full_context = f"History:\n{history_text}\n\nKonteks Dokumen:\n{konteks_dengan_sumber}"
        
        chain = prompt | current_llm | StrOutputParser()
        jawaban = chain.invoke({"context": full_context, "question": pertanyaan.teks})
        
        return {"jawaban": jawaban}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
        # Gunakan parameter dari frontend jika ada
        temp = pertanyaan.temperature or 0.5
        k_val = pertanyaan.k or 10
        
        # Re-inisialisasi LLM dengan temp baru
        current_llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite-preview", temperature=temp)

        filter_dict = None
        if pertanyaan.selected_files:
            if len(pertanyaan.selected_files) == 1:
                filter_dict = {"source": pertanyaan.selected_files[0]}
            else:
                filter_dict = {"source": {"$in": pertanyaan.selected_files}}
                
        if filter_dict:
            dokumen_relevan = vektor_db.similarity_search(
                query=pertanyaan.teks, 
                k=k_val, 
                filter=filter_dict
            )
        else:
            # Re-init retriever untuk k yang dinamis
            retriever_dynamic = vektor_db.as_retriever(search_type="mmr", search_kwargs={"k": k_val, "fetch_k": k_val * 2})
            dokumen_relevan = retriever_dynamic.invoke(pertanyaan.teks)
        konteks_dengan_sumber = "\n\n---\n\n".join(
            [f"[Sumber: {doc.metadata.get('source', 'Unknown')}, halaman {doc.metadata.get('page', 1)}]\n{doc.page_content}" for doc in dokumen_relevan]
        )
        
        # Format history untuk prompt
        history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in pertanyaan.history[-6:]]) if pertanyaan.history else ""
        
        full_context = f"History:\n{history_text}\n\nKonteks Dokumen:\n{konteks_dengan_sumber}"
        
        chain = prompt | current_llm | StrOutputParser()
        
        async def generate():
            async for chunk in chain.astream({"context": full_context, "question": pertanyaan.teks}):
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