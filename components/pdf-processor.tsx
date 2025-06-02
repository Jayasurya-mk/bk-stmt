"use client"

import { useEffect, useState, useRef } from "react"
import Tesseract from "tesseract.js"

// Define a type for the window with PDF.js globals
declare global {
  interface Window {
    pdfjsLib: any
  }
}

interface PdfProcessorProps {
  file: File
  onDataExtracted: (data: any[]) => void
  onError: (error: string) => void
  onProgress: (progress: number, status: string) => void
  isProcessing: boolean
  useOcr: boolean
  ocrLanguage: string
  ocrQuality: "fast" | "best"
}

export function PdfProcessor({
  file,
  onDataExtracted,
  onError,
  onProgress,
  isProcessing,
  useOcr,
  ocrLanguage,
  ocrQuality,
}: PdfProcessorProps) {
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false)
  const pdfJsLoadAttemptsRef = useRef(0)
  const loadingStatusRef = useRef("")
  const processingCancelledRef = useRef(false)
  const lastProgressUpdateRef = useRef(0)

  // Use refs to track state without causing re-renders
  const setLoadingStatus = (status: string) => {
    loadingStatusRef.current = status
  }

  // Load PDF.js from CDN
  useEffect(() => {
    if (typeof window === "undefined") return

    let cleanupRequired = false

    // Check if already loaded
    if (window.pdfjsLib && window.pdfjsLib.getDocument) {
      setPdfJsLoaded(true)
      setLoadingStatus("PDF.js library already loaded.")
      return
    }

    // Function to load PDF.js
    const loadPdfJs = () => {
      if (cleanupRequired) return

      // Clear any existing scripts to avoid conflicts
      const existingScripts = document.querySelectorAll('script[src*="pdf.js"]')
      existingScripts.forEach((script) => script.remove())

      // Track loading
      pdfJsLoadAttemptsRef.current += 1
      setLoadingStatus(`Loading PDF.js library (attempt ${pdfJsLoadAttemptsRef.current})...`)

      // Create and append the main library script
      const scriptPdfJs = document.createElement("script")
      scriptPdfJs.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
      scriptPdfJs.async = true
      scriptPdfJs.crossOrigin = "anonymous"

      scriptPdfJs.onload = () => {
        if (cleanupRequired) return

        setLoadingStatus("PDF.js main library loaded, loading worker...")

        // Create and append the worker script
        const scriptPdfJsWorker = document.createElement("script")
        scriptPdfJsWorker.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
        scriptPdfJsWorker.async = true
        scriptPdfJsWorker.crossOrigin = "anonymous"

        scriptPdfJsWorker.onload = () => {
          if (cleanupRequired) return

          // Set worker source
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
            setPdfJsLoaded(true)
            setLoadingStatus("PDF.js library and worker loaded successfully.")
            console.log("PDF.js loaded successfully")
          } else {
            setLoadingStatus("Error: PDF.js main library not available after loading")
            console.error("PDF.js main library not available after loading")
          }
        }

        scriptPdfJsWorker.onerror = (error) => {
          if (cleanupRequired) return
          setLoadingStatus("Error loading PDF.js worker script")
          console.error("Error loading PDF.js worker:", error)
        }

        document.body.appendChild(scriptPdfJsWorker)
      }

      scriptPdfJs.onerror = (error) => {
        if (cleanupRequired) return
        setLoadingStatus("Error loading PDF.js main library script")
        console.error("Error loading PDF.js:", error)
      }

      document.body.appendChild(scriptPdfJs)
    }

    // If not loaded and no attempts yet, load the library
    if (!window.pdfjsLib && pdfJsLoadAttemptsRef.current === 0) {
      loadPdfJs()
    }

    // Retry loading if previous attempts failed (max 3 attempts)
    let retryTimeout: NodeJS.Timeout | null = null
    if (!window.pdfjsLib && pdfJsLoadAttemptsRef.current > 0 && pdfJsLoadAttemptsRef.current < 3) {
      retryTimeout = setTimeout(() => {
        if (!cleanupRequired) {
          loadPdfJs()
        }
      }, 2000) // Wait 2 seconds before retrying
    }

    // After max attempts, show error
    if (!window.pdfjsLib && pdfJsLoadAttemptsRef.current >= 3) {
      onError("Failed to load PDF processing library after multiple attempts. Please refresh the page and try again.")
    }

    return () => {
      cleanupRequired = true
      if (retryTimeout) {
        clearTimeout(retryTimeout)
      }
    }
  }, [onError])

  // Process PDF when isProcessing becomes true
  useEffect(() => {
    if (!isProcessing) return

    processingCancelledRef.current = false
    let timeoutId: NodeJS.Timeout | null = null
    let cleanupRequired = false

    const processPdf = async () => {
      try {
        // Make sure PDF.js is loaded
        if (typeof window === "undefined" || !window.pdfjsLib) {
          throttledProgressUpdate(0, loadingStatusRef.current || "PDF.js library not loaded yet. Please wait...")
          return
        }

        // Set a timeout to prevent hanging
        timeoutId = setTimeout(() => {
          if (!processingCancelledRef.current && !cleanupRequired) {
            onError("Processing is taking too long. Please try again with a smaller PDF or use manual entry.")
            processingCancelledRef.current = true
          }
        }, 120000) // 2 minutes timeout

        throttledProgressUpdate(5, "Reading PDF file...")

        // Read the file as ArrayBuffer
        const arrayBuffer = await readFileAsArrayBuffer(file)
        if (processingCancelledRef.current || cleanupRequired) return

        throttledProgressUpdate(10, "Loading PDF document...")

        // Load the PDF document
        const loadingTask = window.pdfjsLib.getDocument(arrayBuffer)

        // Handle loading errors
        loadingTask.onPassword = (updatePassword: any, reason: any) => {
          onError("This PDF is password protected. Please remove the password protection and try again.")
          processingCancelledRef.current = true
        }

        loadingTask.onUnsupportedFeature = (feature: any) => {
          console.warn("Unsupported PDF feature:", feature)
        }

        const pdfDocument = await loadingTask.promise
        if (processingCancelledRef.current || cleanupRequired) return

        // Get the total number of pages
        const numPages = pdfDocument.numPages
        throttledProgressUpdate(15, `PDF loaded successfully. Found ${numPages} pages.`)

        // Check if the PDF is text-based or scanned
        const firstPage = await pdfDocument.getPage(1)
        if (processingCancelledRef.current || cleanupRequired) return

        const isScanned = await checkIfPdfIsScanned(firstPage)

        if (isScanned && useOcr) {
          throttledProgressUpdate(20, "Detected scanned PDF. Preparing OCR...")
          await processScannedPdf(pdfDocument, numPages)
        } else {
          throttledProgressUpdate(20, "Processing text-based PDF...")
          await processTextBasedPdf(pdfDocument, numPages)
        }
      } catch (error) {
        console.error("PDF processing error:", error)
        if (!processingCancelledRef.current && !cleanupRequired) {
          onError(
            `Failed to process the PDF: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`,
          )
        }
      } finally {
        // Clear the timeout
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
      }
    }

    // Throttle progress updates to prevent too many state updates
    const throttledProgressUpdate = (progress: number, status: string) => {
      const now = Date.now()
      // Only update if it's been at least 100ms since the last update or if progress is 100%
      if (now - lastProgressUpdateRef.current > 100 || progress === 100 || progress === 0) {
        onProgress(progress, status)
        lastProgressUpdateRef.current = now
      }
    }

    const processScannedPdf = async (pdfDocument: any, numPages: number) => {
      try {
        throttledProgressUpdate(25, "Converting PDF pages to images for OCR...")

        const images: string[] = []
        const maxPagesToProcess = Math.min(numPages, 10) // Limit to 10 pages for performance

        // Convert each page to an image (20% of progress from 25-45%)
        for (let i = 1; i <= maxPagesToProcess; i++) {
          if (processingCancelledRef.current || cleanupRequired) return

          const progressPerPage = 20 / maxPagesToProcess
          const currentProgress = 25 + (i - 1) * progressPerPage
          throttledProgressUpdate(currentProgress, `Converting page ${i} of ${maxPagesToProcess} to image...`)

          const page = await pdfDocument.getPage(i)
          const viewport = page.getViewport({ scale: 1.5 }) // Higher scale for better OCR

          // Create a canvas to render the page
          const canvas = document.createElement("canvas")
          const context = canvas.getContext("2d")
          canvas.height = viewport.height
          canvas.width = viewport.width

          // Render the page to the canvas
          await page.render({
            canvasContext: context!,
            viewport: viewport,
          }).promise

          // Convert the canvas to a data URL
          const imageUrl = canvas.toDataURL("image/png")
          images.push(imageUrl)

          throttledProgressUpdate(25 + (i / maxPagesToProcess) * 20, `Converted page ${i} of ${maxPagesToProcess}`)
        }

        if (processingCancelledRef.current || cleanupRequired) return
        throttledProgressUpdate(45, "Starting OCR processing...")

        // Initialize Tesseract.js worker
        const worker = await createTesseractWorker(ocrLanguage)

        // Process each page with OCR (35% of progress from 45-80%)
        const extractedText = await processImagesWithOcr(images, worker, (progress) => {
          if (processingCancelledRef.current || cleanupRequired) return
          // Map OCR progress (0-1) to our overall progress (45-80%)
          const overallProgress = 45 + Math.floor(progress * 35)
          throttledProgressUpdate(overallProgress, `Performing OCR on pages: ${Math.round(progress * 100)}%`)
        })

        if (processingCancelledRef.current || cleanupRequired) return
        throttledProgressUpdate(80, "Extracting table data from OCR results...")

        // Extract table data from OCR results for each page
        let allExtractedData: any[] = []

        for (let i = 0; i < extractedText.length; i++) {
          if (processingCancelledRef.current || cleanupRequired) return

          const progressPerPage = 15 / extractedText.length
          const currentProgress = 80 + i * progressPerPage
          throttledProgressUpdate(currentProgress, `Processing data from page ${i + 1} of ${extractedText.length}...`)

          const pageData = extractTableDataFromOcrText(extractedText[i], i + 1)
          if (pageData && pageData.length > 0) {
            allExtractedData = [...allExtractedData, ...pageData]
          }
        }

        if (processingCancelledRef.current || cleanupRequired) return
        throttledProgressUpdate(95, "Finalizing data extraction...")

        // Sort data by date if possible
        try {
          allExtractedData = sortTransactionsByDate(allExtractedData)
        } catch (error) {
          console.warn("Could not sort transactions by date:", error)
        }

        // Return the extracted data
        if (!cleanupRequired) {
          onDataExtracted(allExtractedData)
          throttledProgressUpdate(
            100,
            `Conversion complete! Extracted ${allExtractedData.length} transactions from ${maxPagesToProcess} pages.`,
          )
        }
      } catch (error) {
        console.error("OCR processing error:", error)
        if (!processingCancelledRef.current && !cleanupRequired) {
          onError("Failed to process the scanned PDF with OCR. Please try a clearer scan or a text-based PDF.")
        }
      }
    }

    const processTextBasedPdf = async (pdfDocument: any, numPages: number) => {
      try {
        let allPagesData: any[] = []
        const maxPagesToProcess = Math.min(numPages, 20) // Limit to 20 pages for performance

        // Process each page (60% of progress from 20-80%)
        for (let i = 1; i <= maxPagesToProcess; i++) {
          if (processingCancelledRef.current || cleanupRequired) return

          const progressPerPage = 60 / maxPagesToProcess
          const currentProgress = 20 + (i - 1) * progressPerPage
          throttledProgressUpdate(currentProgress, `Processing page ${i} of ${maxPagesToProcess}...`)

          const page = await pdfDocument.getPage(i)

          // Extract text content
          const textContent = await page.getTextContent()
          const pageText = textContent.items.map((item: any) => item.str).join(" ")

          // Try to extract transactions from the text
          const pageData = extractTableDataFromText(pageText, i)
          if (pageData && pageData.length > 0) {
            allPagesData = [...allPagesData, ...pageData]
          }

          throttledProgressUpdate(20 + (i / maxPagesToProcess) * 60, `Processed page ${i} of ${maxPagesToProcess}`)
        }

        if (processingCancelledRef.current || cleanupRequired) return
        throttledProgressUpdate(80, "Analyzing extracted data...")

        // If we couldn't extract structured data, try a different approach
        if (allPagesData.length === 0) {
          throttledProgressUpdate(85, "Using alternative extraction method...")
          const allText = await extractAllText(pdfDocument, maxPagesToProcess)
          const extractedData = extractTableDataFromText(allText, 1)

          if (extractedData.length > 0) {
            throttledProgressUpdate(95, "Finalizing data extraction...")

            // Sort data by date if possible
            try {
              extractedData.sort((a, b) => {
                if (a.Date && b.Date) {
                  return new Date(a.Date).getTime() - new Date(b.Date).getTime()
                }
                return 0
              })
            } catch (error) {
              console.warn("Could not sort transactions by date:", error)
            }

            if (!cleanupRequired) {
              onDataExtracted(extractedData)
              throttledProgressUpdate(
                100,
                `Conversion complete! Extracted ${extractedData.length} transactions from ${maxPagesToProcess} pages.`,
              )
            }
            return
          } else {
            throw new Error("Could not extract any transaction data from the PDF")
          }
        }

        if (processingCancelledRef.current || cleanupRequired) return
        throttledProgressUpdate(90, "Processing and organizing extracted data...")

        // Clean and normalize the data
        // Remove duplicates by comparing Date and Amount
        const uniqueTransactions = removeDuplicateTransactions(allPagesData)

        // Sort by date if available
        const sortedTransactions = sortTransactionsByDate(uniqueTransactions)

        throttledProgressUpdate(95, "Finalizing data extraction...")
        if (!cleanupRequired) {
          onDataExtracted(sortedTransactions)
          throttledProgressUpdate(
            100,
            `Conversion complete! Extracted ${sortedTransactions.length} transactions from ${maxPagesToProcess} pages.`,
          )
        }
      } catch (error) {
        console.error("Text extraction error:", error)
        if (!processingCancelledRef.current && !cleanupRequired) {
          onError("Failed to extract text from the PDF. Please try using OCR mode.")
        }
      }
    }

    // Only start processing if PDF.js is loaded
    if (pdfJsLoaded) {
      processPdf()
    } else {
      throttledProgressUpdate(0, loadingStatusRef.current || "PDF processing library is still loading. Please wait...")
    }

    // Cleanup function
    return () => {
      cleanupRequired = true
      processingCancelledRef.current = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [file, isProcessing, onDataExtracted, onError, onProgress, useOcr, ocrLanguage, ocrQuality, pdfJsLoaded])

  return null // This is a processing component, no UI needed
}

// Helper function to read file as ArrayBuffer
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// Check if a PDF is scanned (image-based) or text-based
async function checkIfPdfIsScanned(page: any): Promise<boolean> {
  try {
    // Extract text content
    const textContent = await page.getTextContent()

    // If there's very little text, it's likely a scanned PDF
    const textItems = textContent.items
    const textLength = textItems.reduce((acc: number, item: any) => acc + item.str.length, 0)

    // Threshold: if less than 100 characters on the first page, consider it scanned
    return textLength < 100
  } catch (error) {
    console.error("Error checking if PDF is scanned:", error)
    return true // Assume it's scanned if we can't determine
  }
}

// Extract all text from the PDF document
async function extractAllText(pdfDocument: any, maxPages: number): Promise<string> {
  let allText = ""

  // Get the total number of pages
  const numPages = Math.min(pdfDocument.numPages, maxPages)

  // Extract text from each page
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDocument.getPage(i)
    const textContent = await page.getTextContent()

    // Combine the text items into a single string
    const pageText = textContent.items.map((item: any) => item.str).join(" ")

    allText += pageText + "\n\n--- PAGE BREAK ---\n\n"
  }

  return allText
}

// Create and initialize a Tesseract.js worker
async function createTesseractWorker(language: string): Promise<Tesseract.Worker> {
  try {
    // Create a new worker
    const worker = await Tesseract.createWorker(language)
    return worker
  } catch (error) {
    console.error("Error creating Tesseract worker:", error)
    throw error
  }
}

// Process images with OCR
async function processImagesWithOcr(
  images: string[],
  worker: any,
  progressCallback: (progress: number) => void,
): Promise<string[]> {
  const results: string[] = []

  for (let i = 0; i < images.length; i++) {
    try {
      // Process each image with OCR
      const { data } = await worker.recognize(images[i])
      results.push(data.text)

      // Update progress
      progressCallback((i + 1) / images.length)
    } catch (error) {
      console.error(`Error processing image ${i + 1} with OCR:`, error)
      results.push("") // Add empty string for failed pages
    }
  }

  // Clean up
  await worker.terminate()

  return results
}

// Extract table data from OCR text
function extractTableDataFromOcrText(text: string, pageNum: number): any[] {
  return extractTableDataFromText(text, pageNum)
}

// Extract table data from text
function extractTableDataFromText(text: string, pageNum: number): any[] {
  const transactions: any[] = []

  try {
    // Split the text into lines
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    // Define patterns for identifying transaction data
    const datePattern =
      /\b(?:\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4})\b/i
    const amountPattern = /\$?\s*-?[\d,]+\.\d{2}/

    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip page breaks and empty lines
      if (line.includes("PAGE BREAK") || line.trim().length === 0) continue

      // Check if this line looks like a transaction row
      if (datePattern.test(line) && amountPattern.test(line)) {
        const transaction = extractTransactionFromLine(line)
        if (Object.keys(transaction).length > 0) {
          transaction.Page = pageNum
          transactions.push(transaction)
        }
      }
    }

    return transactions
  } catch (error) {
    console.error("Error extracting table data from text:", error)
    return []
  }
}

// Extract transaction data from a line using patterns
function extractTransactionFromLine(line: string): any {
  const transaction: any = {}

  // Extract date
  const datePattern =
    /\b(?:\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4})\b/i
  const dateMatch = line.match(datePattern)
  if (dateMatch) {
    transaction.Date = dateMatch[0]

    // Remove the date from the line for further processing
    line = line.replace(dateMatch[0], "")
  }

  // Extract amounts
  const amountPattern = /(\$?\s*-?[\d,]+\.\d{2})/g
  const amountMatches = [...line.matchAll(amountPattern)]

  if (amountMatches.length >= 1) {
    // Last amount is usually the balance
    transaction.Balance = amountMatches[amountMatches.length - 1][0].trim()

    // If there are multiple amounts, the previous one is usually debit or credit
    if (amountMatches.length >= 2) {
      const amount = amountMatches[amountMatches.length - 2][0].trim()

      // Determine if it's debit or credit based on the sign or position
      if (amount.includes("-") || line.toLowerCase().includes("debit")) {
        transaction.Debit = amount.replace("-", "")
      } else {
        transaction.Credit = amount
      }
    }

    // Remove all amounts from the line
    for (const match of amountMatches) {
      line = line.replace(match[0], "")
    }
  }

  // Whatever is left is the description
  transaction.Description = line.trim()

  return transaction
}

// Remove duplicate transactions
function removeDuplicateTransactions(transactions: any[]): any[] {
  const uniqueMap = new Map()

  for (const transaction of transactions) {
    // Create a key using date + amount + first few chars of description
    const dateStr = transaction.Date || ""
    const amountStr = transaction.Amount || transaction.Debit || transaction.Credit || ""
    const descStart = transaction.Description ? transaction.Description.substring(0, 10) : ""

    const key = `${dateStr}-${amountStr}-${descStart}`

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, transaction)
    }
  }

  return Array.from(uniqueMap.values())
}

// Parse various date formats
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null

  // Common date formats in bank statements
  const formats = [
    // DD/MM/YYYY
    {
      regex: /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/,
      parse: (match: RegExpMatchArray) =>
        new Date(`${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`),
    },
    // MM/DD/YYYY
    {
      regex: /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/,
      parse: (match: RegExpMatchArray) =>
        new Date(`${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`),
    },
    // YYYY/MM/DD
    {
      regex: /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/,
      parse: (match: RegExpMatchArray) =>
        new Date(`${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`),
    },
  ]

  // Try each format
  for (const format of formats) {
    const match = dateStr.match(format.regex)
    if (match) {
      try {
        const date = format.parse(match)
        if (!isNaN(date.getTime())) {
          return date
        }
      } catch (e) {
        continue
      }
    }
  }

  // Last resort - try direct parsing
  const date = new Date(dateStr)
  return !isNaN(date.getTime()) ? date : null
}

// Sort transactions by date
function sortTransactionsByDate(transactions: any[]): any[] {
  // Try to parse dates and sort
  try {
    return [...transactions].sort((a, b) => {
      if (!a.Date || !b.Date) return 0

      // Try to convert to date objects
      const dateA = parseDate(a.Date)
      const dateB = parseDate(b.Date)

      if (!dateA || !dateB) return 0

      return dateA.getTime() - dateB.getTime()
    })
  } catch (error) {
    console.error("Error sorting by date:", error)
    return transactions
  }
}
