import os
from supabase import create_client
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import SupabaseVectorStore
from fastapi import FastAPI, HTTPException, Header, Request
from pydantic import BaseModel
from typing import List, Optional
from auth import decode_token

app = FastAPI()

# 1. Supabase Client
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

# 2. Embeddings (Google API, bukan lokal)
embeddings = GoogleGenerativeAIEmbeddings(
    google_api_key=os.getenv("GOOGLE_API_KEY"),
    model="text-multilingual-embedding-002"
)

# 3. Vector Store
vector_store = SupabaseVectorStore(
    client=supabase,
    embedding=embeddings,
    table_name="documents",
    query_name="match_documents"
)

@app.get("/api/ping")
def ping():
    return {"status": "ok"}

# Endpoint lain akan diimplementasikan sebagai function stateless
