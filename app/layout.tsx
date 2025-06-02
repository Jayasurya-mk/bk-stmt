import type React from "react"
import "@/app/globals.css"
import { ThemeProvider } from "@/components/theme-provider"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Bank Statement Converter</title>
        <meta name="description" content="Convert bank statement PDFs to Excel or CSV format" />
        {/* Preload PDF.js scripts */}
        <link
          rel="preload"
          href="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
          as="script"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
          as="script"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {/* Preload script for PDF.js */}
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  // Pre-load PDF.js library
                  if (typeof window !== 'undefined' && !window.pdfjsLib) {
                    try {
                      const scriptPdfJs = document.createElement('script');
                      scriptPdfJs.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                      scriptPdfJs.async = false;
                      scriptPdfJs.onload = function() {
                        const scriptPdfJsWorker = document.createElement('script');
                        scriptPdfJsWorker.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                        scriptPdfJsWorker.async = false;
                        scriptPdfJsWorker.onload = function() {
                          if (window.pdfjsLib) {
                            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                            console.log('PDF.js preloaded successfully');
                          }
                        };
                        document.body.appendChild(scriptPdfJsWorker);
                      };
                      document.body.appendChild(scriptPdfJs);
                    } catch (e) {
                      console.error('Error preloading PDF.js:', e);
                    }
                  }
                })();
              `,
            }}
          />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}

export const metadata = {
      generator: 'v0.dev'
    };
