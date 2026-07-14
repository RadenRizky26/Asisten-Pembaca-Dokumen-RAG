import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

interface TypingTextProps {
  text: string;
  formatJawabanAI: (teks: string) => any;
}


export default function TypingText({ text, formatJawabanAI }: TypingTextProps) {
  const [displayedText, setDisplayedText] = useState("");
  const currentIndexRef = useRef(0);

  useEffect(() => {
    // Reset jika teks kosong (sesi baru)
    if (text.length === 0) {
      setDisplayedText("");
      currentIndexRef.current = 0;
      return;
    }

    // Interval untuk menambahkan karakter satu per satu
    const interval = setInterval(() => {
      if (currentIndexRef.current < text.length) {
        // Ambil 1 atau 2 karakter sekaligus agar tidak terlalu lambat tapi tetap ada efek ngetik
        const charsToAdd = text.slice(currentIndexRef.current, currentIndexRef.current + 2);
        setDisplayedText((prev) => prev + charsToAdd);
        currentIndexRef.current += charsToAdd.length;
      }
    }, 15); // Kecepatan: 15ms per 2 karakter (cukup smooth)

    return () => clearInterval(interval);
  }, [text]);

  return <>{formatJawabanAI(displayedText)}</>;
}
