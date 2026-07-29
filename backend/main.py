import os
import shutil
import re
import json
import uuid
from datetime import datetime
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
from langchain_postgres import PGVector
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
vektor_db = PGVector(
    embeddings=embeddings,
    collection_name="dokumen_rag",
    connection=os.getenv("DATABASE_URL"),
    use_jsonb=True,
)
retriever = vektor_db.as_retriever(search_kwargs={"k": 5})
llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite-preview", temperature=0.5)

# --- PERBAIKAN: INSTRUKSI PROMPT YANG SANGAT KETAT ---
template_instruksi = """
    Kamu adalah asisten AI spesialis pembaca dokumen.
    Konteks dokumen di bawah ini telah dilengkapi dengan metadata [Sumber: Nama_File, halaman X].

    ATURAN DASAR MENJAWAB (PERTANYAAN BIASA):
    1. Jawablah pertanyaan pengguna dengan SANGAT DETAIL dan akurat berdasarkan konteks.
    2. SITASI ADALAH KEWAJIBAN MUTLAK! Setiap kali kamu menuliskan fakta, pasal, penjelasan, atau data dari dokumen, kamu WAJIB menempelkan sitasi tepat di ujung kalimat tersebut.
       -> Format Sitasi yang Wajib (Inline Citation): **[Sumber: Nama_File.pdf, halaman X]**
       -> Contoh penulisan: "...diancam dengan pidana penjara paling lama sembilan tahun [Sumber: KUHP.pdf, halaman 89]."
       -> DILARANG membuat daftar pustaka terpisah di bawah. Sitasi harus menyatu di dalam paragraf/poin.
    3. JIKA pengguna HANYA BERTANYA (tidak meminta file), JAWABLAH SEPERTI BIASA. DILARANG KERAS memberikan tombol unduhan, link download, atau membuat tag dokumen di akhir jawabanmu.

    JALUR KHUSUS A (PENGGUNA MEMINTA DOWNLOAD FILE ASLI):
    - HANYA aktif jika pengguna secara sadar mengetik: "minta file asli", "download dokumennya", "berikan file pdfnya".
    - Berikan tautan ini di akhir: 📥 [Unduh Nama_File_Asli.pdf](http://localhost:8000/api/files/download/Nama_File_Asli.pdf)
    - JIKA TIDAK DIMINTA, JANGAN BERIKAN LINK INI.

    JALUR KHUSUS B (PENGGUNA MEMINTA DIBUATKAN DOKUMEN BARU):
    - HANYA aktif jika pengguna mengetik: "buatkan PDF", "jadikan file", "buatkan rangkuman ke txt".
    - PERINGATAN PENTING: Jika pengguna meminta dibuatkan PDF/File, kamu TETAP WAJIB MENJAWAB PERTANYAAN DI CHAT TERLEBIH DAHULU SECARA LENGKAP DENGAN SITASI seperti biasa. Setelah SELURUH jawaban chat selesai (termasuk sitasi), barulah di PALING BAWAH sekali kamu tambahkan tag rahasia berikut:
      <NAMA_FILE>Nama_File_Baru.pdf</NAMA_FILE>
      <ISI_DOKUMEN>
      [Tuliskan seluruh materi, rangkuman, atau data yang diminta pengguna di sini dengan lengkap dan rapi]
      </ISI_DOKUMEN>

    Konteks Dokumen:
    {context}

    Pertanyaan Pengguna: {question}

    Jawaban:
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
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    ekstensi = filename.lower().split('.')[-1]
    documents = []
    
    try:
        if ekstensi == "pdf":
            reader = PdfReader(file_path)
            for i, hal in enumerate(reader.pages):
                page_num = i + 1
                t = hal.extract_text()
                if t:
                    page_text = f"\n--- Halaman {page_num} ---\n{t}"
                    documents.append(Document(page_content=page_text, metadata={"source": filename, "page": page_num}))
        elif ekstensi == "docx":
            doc = docx.Document(file_path)
            teks_dokumen = "\n".join([p.text for p in doc.paragraphs])
            if teks_dokumen.strip():
                documents.append(Document(page_content=teks_dokumen, metadata={"source": filename}))
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
                    documents.append(Document(page_content=slide_text, metadata={"source": filename, "page": slide_num}))
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
                documents.append(Document(page_content=teks_dokumen, metadata={"source": filename}))
        
        if documents:
            pemotong = RecursiveCharacterTextSplitter(chunk_size=4000, chunk_overlap=400)
            potongan = pemotong.split_documents(documents)
            
            for chunk in potongan:
                page = chunk.metadata.get("page")
                if page is not None:
                    if "--- Halaman" not in chunk.page_content and "--- Slide" not in chunk.page_content:
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
        try:
            vektor_db.delete(where={"source": filename})
        except:
            pass
        return {"status": "sukses", "pesan": f"{filename} dihapus!"}
    except Exception as e:
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
            dokumen_relevan = vektor_db.similarity_search(query=pertanyaan.teks, k=k_val, filter=filter_dict)
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
        
        match_isi = re.search(r"<ISI_DOKUMEN>(.*?)</ISI_DOKUMEN>", jawaban, re.DOTALL)
        match_nama = re.search(r"<NAMA_FILE>(.*?)</NAMA_FILE>", jawaban)

        if match_isi and match_nama:
            isi_teks = match_isi.group(1).strip()
            nama_file_asli = match_nama.group(1).strip()
            
            nama_unik = f"{uuid.uuid4().hex[:6]}_{nama_file_asli}"
            os.makedirs("./dokumen_hasil", exist_ok=True)
            lokasi_simpan = f"./dokumen_hasil/{nama_unik}"
            
            if nama_file_asli.lower().endswith('.pdf'):
                pdf = FPDF()
                pdf.add_page()
                pdf.set_font("Arial", size=11)
                isi_teks_pdf = isi_teks.encode('latin-1', 'replace').decode('latin-1')
                pdf.multi_cell(0, 7, txt=isi_teks_pdf)
                pdf.output(lokasi_simpan)
            else:
                with open(lokasi_simpan, "w", encoding="utf-8") as f:
                    f.write(isi_teks)
            
            link_download = f"http://localhost:8000/api/generated/download/{nama_unik}"
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
# ==========================================
@app.get("/api/files/download/{filename}")
async def download_file(filename: str):
    import urllib.parse
    filename = urllib.parse.unquote(filename)
    file_path = os.path.join("./kumpulan_dokumen", filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File tidak ditemukan.")
    return FileResponse(file_path)

@app.get("/api/generated/download/{filename}")
async def download_generated_file(filename: str):
    import urllib.parse
    filename = urllib.parse.unquote(filename)
    file_path = os.path.join("./dokumen_hasil", filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File hasil tidak ditemukan.")
    return FileResponse(file_path, filename=filename)

@app.get("/api/files/preview/{filename}")
async def preview_file(filename: str):
    import urllib.parse
    filename = urllib.parse.unquote(filename)
    
    file_path = os.path.abspath(os.path.join("./kumpulan_dokumen", filename))
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File tidak ditemukan.")
        
    ekstensi = filename.lower().split('.')[-1]
    if ekstensi == "pdf":
        return FileResponse(file_path)
        
    preview_dir = os.path.abspath("./kumpulan_dokumen/preview")
    if not os.path.exists(preview_dir):
        os.makedirs(preview_dir)
        
    pdf_filename = f"{filename}.pdf"
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal convert ke PDF: {str(e)}")
    finally:
        pythoncom.CoUninitialize()
        
    if os.path.exists(pdf_path):
        return FileResponse(pdf_path)
    raise HTTPException(status_code=500, detail="File PDF tidak terbentuk.")

# ==========================================
# ENDPOINT: CHAT STREAMING (DENGAN BUFFER & ANTI-ERROR)
# ==========================================
@app.post("/api/chat/stream")
async def chat_ai_stream(pertanyaan: Pertanyaan):
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
            dokumen_relevan = vektor_db.similarity_search(query=pertanyaan.teks, k=k_val, filter=filter_dict)
        else:
            retriever_dynamic = vektor_db.as_retriever(search_type="mmr", search_kwargs={"k": k_val, "fetch_k": k_val * 2})
            dokumen_relevan = retriever_dynamic.invoke(pertanyaan.teks)
            
        konteks_dengan_sumber = "\n\n---\n\n".join(
            [f"[Sumber: {doc.metadata.get('source', 'Unknown')}, halaman {doc.metadata.get('page', 1)}]\n{doc.page_content}" for doc in dokumen_relevan]
        )
        
        history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in pertanyaan.history[-6:]]) if pertanyaan.history else ""
        full_context = f"History:\n{history_text}\n\nKonteks Dokumen:\n{konteks_dengan_sumber}"
        
        chain = prompt | current_llm | StrOutputParser()
        
        async def generate():
            import json, re
            full_response = ""
            is_generating_file = False
            buffer_stream = "" 
            
            async for chunk in chain.astream({"context": full_context, "question": pertanyaan.teks}):
                full_response += chunk
                
                # PERBAIKAN 1: Jadikan pengecekan Tidak Peduli Huruf Besar/Kecil
                response_upper = full_response.upper()
                
                if "<NAMA_FILE>" in response_upper or "<ISI_DOKUMEN>" in response_upper:
                    if not is_generating_file:
                        is_generating_file = True
                        # Kirim sisa teks normal di buffer sebelum tag agar tidak terpotong
                        if buffer_stream:
                            last_angle = buffer_stream.rfind("<")
                            if last_angle != -1:
                                safe_text = buffer_stream[:last_angle]
                                if safe_text:
                                    yield f"data: {json.dumps({'token': safe_text})}\n\n"
                            else:
                                yield f"data: {json.dumps({'token': buffer_stream})}\n\n"
                            buffer_stream = ""
                        pesan_tunggu = "\n\n*(Sedang menyusun dokumen, mohon tunggu...)*\n"
                        yield f"data: {json.dumps({'token': pesan_tunggu})}\n\n"
                    continue 
                
                if not is_generating_file:
                    buffer_stream += chunk
                    last_angle_idx = buffer_stream.rfind("<")
                    
                    if last_angle_idx != -1:
                        potential_tag = buffer_stream[last_angle_idx:].upper()
                        if "<NAMA_FILE>".startswith(potential_tag) or "<ISI_DOKUMEN>".startswith(potential_tag):
                            safe_text = buffer_stream[:last_angle_idx]
                            if safe_text:
                                yield f"data: {json.dumps({'token': safe_text})}\n\n"
                            buffer_stream = buffer_stream[last_angle_idx:] 
                        else:
                            yield f"data: {json.dumps({'token': buffer_stream})}\n\n"
                            buffer_stream = ""
                    else:
                        yield f"data: {json.dumps({'token': buffer_stream})}\n\n"
                        buffer_stream = ""

            if buffer_stream and not is_generating_file:
                yield f"data: {json.dumps({'token': buffer_stream})}\n\n"

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
                    os.makedirs("./dokumen_hasil", exist_ok=True)
                    lokasi_simpan = f"./dokumen_hasil/{nama_unik}"
                    
                    # PERBAIKAN 3: Mode "Anti-Crash". Jika PDF gagal dibuat, jadikan file TXT biasa
                    try:
                        if nama_file_asli.lower().endswith('.pdf'):
                            pdf = FPDF()
                            pdf.add_page()
                            pdf.set_font("Arial", size=11)
                            
                            # Abaikan karakter emoji/simbol aneh yang bikin PDF crash
                            isi_teks_pdf = isi_teks.encode('latin-1', 'ignore').decode('latin-1')
                            pdf.multi_cell(0, 7, txt=isi_teks_pdf)
                            pdf.output(lokasi_simpan)
                        else:
                            with open(lokasi_simpan, "w", encoding="utf-8") as f:
                                f.write(isi_teks)
                                
                        link_download = f"http://localhost:8000/api/generated/download/{nama_unik}"
                        pesan_selesai = f"\n\n✨ **Selesai!** 📥 [**Unduh {nama_file_asli} di sini**]({link_download})"
                        yield f"data: {json.dumps({'token': pesan_selesai})}\n\n"
                        
                    except Exception as e:
                        # JIKA FPDF ERROR, OTOMATIS BIKIN TXT (Fallback)
                        fallback_nama = f"Fallback_{uuid.uuid4().hex[:6]}.txt"
                        fallback_lokasi = f"./dokumen_hasil/{fallback_nama}"
                        
                        with open(fallback_lokasi, "w", encoding="utf-8") as f:
                            f.write(isi_teks)
                            
                        link_download = f"http://localhost:8000/api/generated/download/{fallback_nama}"
                        pesan_fallback = f"\n\n⚠️ *(Gagal membuat PDF karena format tidak didukung, dialihkan ke Teks)*\n📥 [**Unduh Dokumen di sini**]({link_download})"
                        yield f"data: {json.dumps({'token': pesan_fallback})}\n\n"
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