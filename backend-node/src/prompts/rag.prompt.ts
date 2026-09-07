export const RAG_PROMPT_TEMPLATE = `Kamu adalah asisten pembaca dokumen.
Jawab pertanyaan hanya berdasarkan konteks berikut. Jika tidak ada di konteks, katakan tidak ditemukan.

Konteks:
{context}

Pertanyaan: {question}
Jawaban:`;
