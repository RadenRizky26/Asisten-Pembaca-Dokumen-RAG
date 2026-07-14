"use client";

import { useEffect, useState } from "react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { MagnifyingGlassPlus, MagnifyingGlassMinus, CaretLeft, CaretRight, X, DownloadSimple } from "@phosphor-icons/react";

interface PDFPreviewProps {
  filename: string;
  pageNumber: number;
  onClose: () => void;
}

export default function PDFPreview({ filename, pageNumber, onClose }: PDFPreviewProps) {
  const [PDFComponent, setPDFComponent] = useState<{ Document: any; Page: any } | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [safePage, setSafePage] = useState<number>(pageNumber);
  const [scale, setScale] = useState<number>(1.0);

  // Semua format Office sekarang didukung via endpoint /preview/
  const isOfficeOrPdf = /\.(pdf|doc|docx|ppt|pptx|xls|xlsx)$/i.test(filename);
  const downloadUrl = `http://localhost:8000/api/files/download/${filename}`;

  useEffect(() => {
    if (!isOfficeOrPdf) return; 

    import("react-pdf").then((mod) => {
      mod.pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${mod.pdfjs.version}/build/pdf.worker.min.mjs`;
      setPDFComponent({ Document: mod.Document, Page: mod.Page });
    });
  }, [isOfficeOrPdf]);

  useEffect(() => {
    setSafePage(pageNumber > 0 ? pageNumber : 1);
    setScale(1.0);
  }, [pageNumber, filename]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    if (safePage > numPages) {
      setSafePage(1);
    }
  }

  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3.0));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  
  const prevPage = () => setSafePage(prev => Math.max(prev - 1, 1));
  const nextPage = () => setSafePage(prev => numPages ? Math.min(prev + 1, numPages) : prev);

  // Tampilan untuk file yang benar-benar tidak didukung
  if (!isOfficeOrPdf) {
    return (
      <div className="fixed inset-y-0 right-0 w-[400px] bg-[var(--color-surface-sidebar)] shadow-2xl border-l border-[var(--color-hairline)] flex flex-col z-50 transition-all">
        <div className="flex justify-between items-center p-4 border-b border-[var(--color-hairline-soft)] bg-[var(--color-surface-sidebar)] shrink-0">
          <h3 className="font-bold text-[15px] text-[var(--color-ink)] truncate max-w-[85%]">{filename}</h3>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition">
            <X size={18} weight="bold" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4 bg-[var(--color-canvas-soft)]">
          <div className="w-16 h-16 bg-[var(--color-canvas)] rounded-full flex items-center justify-center border border-[var(--color-hairline)]">
            <DownloadSimple size={32} className="text-[var(--color-primary)]" />
          </div>
          <div>
            <h4 className="text-[var(--color-ink)] font-bold mb-2">Pratinjau Tidak Tersedia</h4>
            <p className="text-[13px] text-[var(--color-muted)]">
              Sistem saat ini tidak mendukung pratinjau format ini. Silakan unduh file untuk melihatnya.
            </p>
          </div>
          <a 
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 bg-[var(--color-primary)] text-white px-4 py-2 rounded-md font-medium text-[13px] hover:bg-[var(--color-primary-active)] transition shadow-sm"
          >
            Unduh Dokumen
          </a>
        </div>
      </div>
    );
  }

  if (!PDFComponent) return <div className="fixed inset-y-0 right-0 w-[500px] bg-[var(--color-canvas)] border-l border-[var(--color-hairline)] p-4 flex items-center justify-center text-[var(--color-muted)]">Memuat komponen PDF...</div>;

  return (
    <div className="fixed inset-y-0 right-0 w-[600px] bg-[var(--color-surface-sidebar)] shadow-2xl border-l border-[var(--color-hairline)] flex flex-col z-50 transition-all">
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col gap-3 p-4 border-b border-[var(--color-hairline-soft)] bg-[var(--color-surface-sidebar)] shrink-0">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-[15px] text-[var(--color-ink)] truncate max-w-[70%]">{filename}</h3>
          <div className="flex items-center gap-2">
            <a href={downloadUrl} className="text-[13px] font-semibold text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-active)] px-3 py-1.5 rounded-md flex items-center gap-1 shadow-sm transition-colors" download>
              <DownloadSimple weight="bold" size={14} /> Unduh
            </a>
            <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-hairline-soft)] p-1.5 rounded transition">
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>
        
        <div className="flex justify-between items-center">
          {/* Navigasi Halaman */}
          <div className="flex items-center gap-1 bg-[var(--color-canvas)] rounded-md border border-[var(--color-hairline)] p-1">
            <button 
              onClick={prevPage} 
              disabled={safePage <= 1}
              className="p-1 text-[var(--color-ink)] disabled:opacity-30 hover:bg-[var(--color-hairline-soft)] rounded transition"
            >
              <CaretLeft size={16} weight="bold" />
            </button>
            <span className="text-[12px] font-mono text-[var(--color-muted)] px-2">
              Hal {safePage} / {numPages || "?"}
            </span>
            <button 
              onClick={nextPage} 
              disabled={numPages === null || safePage >= numPages}
              className="p-1 text-[var(--color-ink)] disabled:opacity-30 hover:bg-[var(--color-hairline-soft)] rounded transition"
            >
              <CaretRight size={16} weight="bold" />
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-[var(--color-canvas)] rounded-md border border-[var(--color-hairline)] p-1">
            <button onClick={zoomOut} className="p-1 text-[var(--color-ink)] hover:bg-[var(--color-hairline-soft)] rounded transition">
              <MagnifyingGlassMinus size={16} />
            </button>
            <span className="text-[12px] font-mono text-[var(--color-muted)] px-2 w-[50px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button onClick={zoomIn} className="p-1 text-[var(--color-ink)] hover:bg-[var(--color-hairline-soft)] rounded transition">
              <MagnifyingGlassPlus size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* PDF VIEWER */}
      <div className="flex-1 overflow-auto bg-[var(--color-canvas-soft)] relative p-4">
        <div className="w-fit mx-auto">
          <PDFComponent.Document 
            file={`http://localhost:8000/api/files/preview/${filename}`}
            onLoadSuccess={onDocumentLoadSuccess}

            onLoadError={(error: Error) => console.error("Error loading PDF Document:", error)}
            loading={<div className="flex items-center justify-center text-[13px] text-[var(--color-muted)] py-10">Mengunduh dokumen dari server...</div>}
            className="flex flex-col items-start"
          >
            <div className="shadow-md border border-[var(--color-hairline-strong)] bg-white">
              <PDFComponent.Page 
                pageNumber={safePage} 
                scale={scale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                width={500}
                onLoadError={(error: Error) => {
                  console.error("Error loading PDF Page:", error);
                  if (safePage !== 1) setSafePage(1);
                }}
              />
            </div>
          </PDFComponent.Document>
        </div>
      </div>
    </div>
  );
}
