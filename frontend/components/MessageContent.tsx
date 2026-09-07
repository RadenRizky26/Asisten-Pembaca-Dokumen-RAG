"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

interface MessageContentProps {
  teks: string;
  daftarFile: string[];
  showCitations: boolean;
  streaming?: boolean;
  onCitation: (file: string, page: number) => void;
}

function findRealFileName(citedName: string, daftarFile: string[]): string {
  if (daftarFile.includes(citedName)) return citedName;
  if (daftarFile.includes(`${citedName}.pdf`)) return `${citedName}.pdf`;

  const cleanCited = citedName.replace(/\*/g, "").trim().toLowerCase();

  for (const file of daftarFile) {
    if (file.toLowerCase().includes(cleanCited)) return file;
  }

  const words = cleanCited
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  for (const file of daftarFile) {
    const fileLower = file.toLowerCase();
    const matches = words.filter((w) => fileLower.includes(w));
    if (matches.length >= Math.min(2, words.length) && words.length > 0)
      return file;
  }

  return cleanCited;
}

export function MessageContent({
  teks,
  daftarFile,
  showCitations,
  streaming = false,
  onCitation,
}: MessageContentProps) {
  if (!teks) return null;

  let processedText = teks;

  if (showCitations) {
    processedText = teks.replace(
      /[[(]Sumber:\s*(.*?),\s*(?:halaman|hal)\s*([^)\]]+)[)\]]/gi,
      (match, p1, p2) => {
        const firstPageMatch = p2.match(/\d+/);
        const pageNum = firstPageMatch ? firstPageMatch[0] : "1";
        const cleanFileName = findRealFileName(p1, daftarFile);
        return ` <cite-btn file="${cleanFileName}" page="${pageNum}" raw-name="${p1}"></cite-btn> `;
      },
    );
  }

  // Sembunyikan tag XML pembuatan dokumen dari chat (karena di-handle backend)
  processedText = processedText.replace(/<NAMA_FILE>[\s\S]*?<\/NAMA_FILE>/g, "");
  processedText = processedText.replace(/<ISI_DOKUMEN>[\s\S]*?<\/ISI_DOKUMEN>/g, "");

  return (
    <div
      className={`markdown-body text-body-md text-body leading-[1.75] ${
        streaming ? "stream-cursor" : ""
      }`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={
          {
            strong: (props: any) => (
              <strong className="font-semibold text-ink" {...props} />
            ),
            ul: (props: any) => (
              <ul className="space-y-1.5 marker:text-muted" {...props} />
            ),
            ol: (props: any) => (
              <ol className="space-y-1.5 marker:text-muted" {...props} />
            ),
            "cite-btn": (props: any) => {
              if (props.file && props.page) {
                const displayText = props["raw-name"]
                  ? props["raw-name"].replace(/\*/g, "").trim()
                  : props.file;
                return (
                  <button
                    type="button"
                    onClick={() =>
                      onCitation(props.file, parseInt(props.page))
                    }
                    className="inline-block px-2 py-0.5 mx-1 mb-0.5 rounded-md text-caption-uppercase font-sans bg-primary text-white shadow-sm cursor-pointer transition-colors hover:brightness-110 align-middle"
                  >
                    {displayText} (hal {props.page})
                  </button>
                );
              }
              return null;
            },
            a: (props: any) => (
              <a
                href={props.href}
                target="_blank"
                rel="noopener noreferrer"
                {...props}
              />
            ),
          } as any
        }
      >
        {processedText}
      </ReactMarkdown>
    </div>
  );
}
