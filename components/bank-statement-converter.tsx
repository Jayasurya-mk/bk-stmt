"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { FileUploader } from "@/components/file-uploader"
import { TablePreview } from "@/components/table-preview"
import { SampleDataInput } from "@/components/sample-data-input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { InfoIcon, Loader2, Download, Settings2, FileTextIcon, UploadIcon, RefreshCw, AlertCircle } from "lucide-react"
import * as XLSX from "xlsx"
import { PdfProcessor } from "@/components/pdf-processor"

export function BankStatementConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [outputFormat, setOutputFormat] = useState<"xlsx" | "csv">("xlsx")
  const [isProcessing, setIsProcessing] = useState(false)
  const [extractedData, setExtractedData] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("upload")
  const [inputMethod, setInputMethod] = useState("upload")
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingStatus, setProcessingStatus] = useState("")
  const [useOcr, setUseOcr] = useState(true)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [ocrLanguage, setOcrLanguage] = useState("eng")
  const [ocrQuality, setOcrQuality] = useState<"fast" | "best">("fast")
  const [pdfLibraryLoaded, setPdfLibraryLoaded] = useState(false)
  const [loadingLibrary, setLoadingLibrary] = useState(false)

  // Use refs for timeout to avoid state updates
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastProgressUpdateRef = useRef<number>(0)

  // Check if PDF.js is loaded
  useEffect(() => {
    if (typeof window === "undefined") return

    let intervalId: NodeJS.Timeout | null = null

    const checkPdfJsLoaded = () => {
      if (window.pdfjsLib && window.pdfjsLib.getDocument) {
        setPdfLibraryLoaded(true)
        setLoadingLibrary(false)
        // Clear interval once loaded
        if (intervalId) {
          clearInterval(intervalId)
        }
      }
    }

    // Check immediately
    checkPdfJsLoaded()

    // Only set interval if not loaded yet
    if (!window.pdfjsLib || !window.pdfjsLib.getDocument) {
      intervalId = setInterval(checkPdfJsLoaded, 1000)
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [])

  // Set a global timeout to prevent processing from hanging
  useEffect(() => {
    if (isProcessing) {
      // Clear any existing timeout
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current)
      }

      // Set a timeout to cancel processing if it takes too long
      processingTimeoutRef.current = setTimeout(() => {
        setIsProcessing(false)
        setError(
          "Processing timed out. The PDF might be too large or complex. Please try a smaller file or use manual entry.",
        )
        setProcessingProgress(0)
        setProcessingStatus("")
      }, 180000) // 3 minutes timeout
    }

    return () => {
      // Clean up timeout on unmount or when isProcessing changes
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current)
        processingTimeoutRef.current = null
      }
    }
  }, [isProcessing])

  const handleFileChange = useCallback((selectedFile: File | null) => {
    setFile(selectedFile)
    setExtractedData(null)
    setError(null)
    setProcessingProgress(0)
    setProcessingStatus("")
  }, [])

  const handleFormatChange = useCallback((format: string) => {
    setOutputFormat(format as "xlsx" | "csv")
  }, [])

  const handleExtractedData = useCallback((data: any[]) => {
    if (!data || data.length === 0) {
      setError("No transaction data could be extracted. Please try using manual entry instead.")
      setIsProcessing(false)
      setProcessingProgress(0)
      setProcessingStatus("")
      return
    }

    setExtractedData(data)
    setIsProcessing(false)
    setProcessingProgress(100)
    setProcessingStatus(`Successfully extracted ${data.length} transactions!`)
    setActiveTab("preview")
  }, [])

  const handleManualDataSubmit = useCallback((data: any[]) => {
    setExtractedData(data)
    setActiveTab("preview")
  }, [])

  const handleExtractionError = useCallback((errorMessage: string) => {
    setError(errorMessage)
    setIsProcessing(false)
    setProcessingProgress(0)
    setProcessingStatus("")
  }, [])

  // Throttle progress updates to prevent too many state updates
  const handleProgressUpdate = useCallback((progress: number, status: string) => {
    const now = Date.now()
    // Only update if it's been at least 100ms since the last update or if progress is 100%
    if (now - lastProgressUpdateRef.current > 100 || progress === 100) {
      setProcessingProgress(progress)
      setProcessingStatus(status)
      lastProgressUpdateRef.current = now

      // Reset the timeout on progress updates
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current)
        processingTimeoutRef.current = setTimeout(() => {
          setIsProcessing(false)
          setError(
            "Processing timed out. The PDF might be too large or complex. Please try a smaller file or use manual entry.",
          )
          setProcessingProgress(0)
          setProcessingStatus("")
        }, 180000) // 3 minutes timeout
      }
    }
  }, [])

  const handleExtract = useCallback(() => {
    if (!file) return

    setError(null)

    // Check if the file is too large
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > 20) {
      setError(
        "The file is quite large (over 20MB) and might cause performance issues. Processing may take longer than usual.",
      )
    }

    // Check if PDF.js is loaded before starting
    if (!pdfLibraryLoaded && typeof window !== "undefined" && (!window.pdfjsLib || !window.pdfjsLib.getDocument)) {
      setLoadingLibrary(true)
      setProcessingStatus("Loading PDF processing library. Please wait...")
      setProcessingProgress(0)

      // Try again after a short delay
      setTimeout(() => {
        if (typeof window !== "undefined" && window.pdfjsLib && window.pdfjsLib.getDocument) {
          setPdfLibraryLoaded(true)
          setLoadingLibrary(false)
          setIsProcessing(true)
        } else {
          setError("PDF processing library could not be loaded. Please refresh the page and try again.")
          setLoadingLibrary(false)
        }
      }, 3000)
    } else {
      // Library is loaded, proceed with processing
      setIsProcessing(true)
      setProcessingProgress(0)
      setProcessingStatus("Preparing to process PDF...")
    }
  }, [file, pdfLibraryLoaded])

  const handleCancelProcessing = useCallback(() => {
    setIsProcessing(false)
    setProcessingProgress(0)
    setProcessingStatus("Processing cancelled.")
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current)
      processingTimeoutRef.current = null
    }
  }, [])

  const handleRetryLibraryLoad = useCallback(() => {
    setError(null)
    setLoadingLibrary(true)
    setProcessingStatus("Reloading PDF processing library...")

    // Add PDF.js script elements directly
    if (typeof window !== "undefined") {
      // Remove any existing scripts first
      const existingScripts = document.querySelectorAll('script[src*="pdf.js"]')
      existingScripts.forEach((script) => script.remove())

      // Load main library
      const scriptPdfJs = document.createElement("script")
      scriptPdfJs.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
      scriptPdfJs.async = true
      scriptPdfJs.onload = () => {
        // Load worker
        const scriptPdfJsWorker = document.createElement("script")
        scriptPdfJsWorker.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
        scriptPdfJsWorker.async = true
        scriptPdfJsWorker.onload = () => {
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
            setPdfLibraryLoaded(true)
            setLoadingLibrary(false)
            setProcessingStatus("PDF library loaded successfully. Ready to process.")
          }
        }
        document.body.appendChild(scriptPdfJsWorker)
      }
      document.body.appendChild(scriptPdfJs)

      // Set a timeout to check if loading succeeded
      setTimeout(() => {
        if (!window.pdfjsLib || !window.pdfjsLib.getDocument) {
          setError("Failed to load PDF processing library. Please try a different browser or enable JavaScript.")
          setLoadingLibrary(false)
        }
      }, 5000)
    }
  }, [])

  const handleExport = useCallback(() => {
    if (!extractedData || extractedData.length === 0) return

    try {
      // Create a worksheet from the data
      const ws = XLSX.utils.json_to_sheet(extractedData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Bank Statement")

      // Generate the file content
      if (outputFormat === "xlsx") {
        // For XLSX, use the browser-compatible method
        const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" })
        saveAsFile(
          new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          "bank_statement.xlsx",
        )
      } else {
        // For CSV, convert to string and create a blob
        const csvContent = XLSX.utils.sheet_to_csv(ws)
        saveAsFile(new Blob([csvContent], { type: "text/csv;charset=utf-8;" }), "bank_statement.csv")
      }
    } catch (error) {
      console.error("Export error:", error)
      setError(`Failed to export data: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`)
    }
  }, [extractedData, outputFormat])

  // Helper function to save a blob as a file
  const saveAsFile = useCallback((blob: Blob, filename: string) => {
    // Create a URL for the blob
    const url = URL.createObjectURL(blob)

    // Create a temporary link element
    const link = document.createElement("a")
    link.href = url
    link.download = filename

    // Append to the document, click it, and remove it
    document.body.appendChild(link)
    link.click()

    // Clean up
    setTimeout(() => {
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }, 100)
  }, [])

  const handleSwitchToUpload = useCallback(() => {
    setInputMethod("upload")
  }, [])

  const handleSwitchToManual = useCallback(() => {
    setInputMethod("manual")
  }, [])

  const handleToggleAdvancedOptions = useCallback(() => {
    setShowAdvancedOptions((prev) => !prev)
  }, [])

  const handleOcrChange = useCallback((checked: boolean) => {
    setUseOcr(checked)
  }, [])

  const handleOcrQualityChange = useCallback((quality: string) => {
    setOcrQuality(quality as "fast" | "best")
  }, [])

  return (
    <div className="space-y-6">
      {file && isProcessing && (
        <PdfProcessor
          file={file}
          onDataExtracted={handleExtractedData}
          onError={handleExtractionError}
          onProgress={handleProgressUpdate}
          isProcessing={isProcessing}
          useOcr={useOcr}
          ocrLanguage={ocrLanguage}
          ocrQuality={ocrQuality}
        />
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload">Input Data</TabsTrigger>
          <TabsTrigger value="preview" disabled={!extractedData}>
            Preview & Export
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="space-y-6">
          <Alert className="bg-blue-50 border-blue-200">
            <InfoIcon className="h-4 w-4 text-blue-600" />
            <AlertTitle>Bank Statement Converter</AlertTitle>
            <AlertDescription>
              Upload your bank statement PDF or manually enter your transaction data to convert it to Excel or CSV
              format.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <Button
              variant={inputMethod === "upload" ? "default" : "outline"}
              className="flex-1 gap-2"
              onClick={handleSwitchToUpload}
            >
              <UploadIcon className="h-4 w-4" />
              Upload PDF
            </Button>
            <Button
              variant={inputMethod === "manual" ? "default" : "outline"}
              className="flex-1 gap-2"
              onClick={handleSwitchToManual}
            >
              <FileTextIcon className="h-4 w-4" />
              Manual Entry
            </Button>
          </div>

          {inputMethod === "upload" ? (
            <>
              <FileUploader file={file} onFileChange={handleFileChange} maxSizeMB={50} />

              {file && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-6">
                    <div className="space-y-2">
                      <Label>Output Format</Label>
                      <RadioGroup value={outputFormat} onValueChange={handleFormatChange} className="flex space-x-4">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="xlsx" id="xlsx" />
                          <Label htmlFor="xlsx">Excel (.xlsx)</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="csv" id="csv" />
                          <Label htmlFor="csv">CSV (.csv)</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="use-ocr">Enable OCR for Scanned PDFs</Label>
                        <Switch id="use-ocr" checked={useOcr} onCheckedChange={handleOcrChange} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Automatically detect and process scanned documents using OCR
                      </p>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <button
                      type="button"
                      onClick={handleToggleAdvancedOptions}
                      className="flex items-center text-sm text-muted-foreground hover:text-foreground"
                    >
                      <Settings2 className="h-4 w-4 mr-1" />
                      {showAdvancedOptions ? "Hide" : "Show"} Advanced OCR Options
                    </button>

                    {showAdvancedOptions && (
                      <div className="mt-4 p-4 border rounded-md space-y-4 bg-gray-50">
                        <div className="space-y-2">
                          <Label htmlFor="ocr-language">OCR Language</Label>
                          <select
                            id="ocr-language"
                            value={ocrLanguage}
                            onChange={(e) => setOcrLanguage(e.target.value)}
                            className="w-full p-2 border rounded-md"
                            disabled={!useOcr}
                          >
                            <option value="eng">English</option>
                            <option value="fra">French</option>
                            <option value="deu">German</option>
                            <option value="spa">Spanish</option>
                            <option value="ita">Italian</option>
                          </select>
                          <p className="text-xs text-muted-foreground">Select the primary language of your document</p>
                        </div>

                        <div className="space-y-2">
                          <Label>OCR Quality</Label>
                          <RadioGroup
                            value={ocrQuality}
                            onValueChange={handleOcrQualityChange}
                            className="flex space-x-4"
                            disabled={!useOcr}
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="fast" id="fast" />
                              <Label htmlFor="fast">Fast (Lower quality, quicker processing)</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="best" id="best" />
                              <Label htmlFor="best">Best (Higher quality, slower processing)</Label>
                            </div>
                          </RadioGroup>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    {!isProcessing ? (
                      <Button
                        onClick={handleExtract}
                        disabled={isProcessing || loadingLibrary}
                        className="w-full sm:w-auto"
                      >
                        {loadingLibrary ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading Library...
                          </>
                        ) : (
                          "Extract Data"
                        )}
                      </Button>
                    ) : (
                      <Button onClick={handleCancelProcessing} variant="destructive" className="w-full sm:w-auto">
                        Cancel Processing
                      </Button>
                    )}

                    {error && error.includes("PDF processing library") && (
                      <Button onClick={handleRetryLibraryLoad} variant="outline" className="w-full sm:w-auto gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Reload PDF Library
                      </Button>
                    )}
                  </div>

                  {(isProcessing || loadingLibrary) && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{processingStatus}</span>
                        {processingProgress > 0 && <span>{processingProgress}%</span>}
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full"
                          style={{ width: `${processingProgress || 10}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {!file && (
                <Alert className="mt-4">
                  <InfoIcon className="h-4 w-4" />
                  <AlertTitle>Having trouble uploading?</AlertTitle>
                  <AlertDescription>
                    If you're having trouble uploading a PDF, you can switch to Manual Entry mode to enter your
                    transaction data directly.
                  </AlertDescription>
                </Alert>
              )}
            </>
          ) : (
            <SampleDataInput onDataSubmit={handleManualDataSubmit} />
          )}
        </TabsContent>
        <TabsContent value="preview" className="space-y-6">
          {extractedData && (
            <>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Extracted Data</h2>
                  <p className="text-sm text-muted-foreground">
                    {extractedData.length} transactions{" "}
                    {inputMethod === "upload" ? "extracted from your bank statement" : "entered manually"}
                    {extractedData.some((item) => item.Page) && " across multiple pages"}
                  </p>
                </div>
                <Button onClick={handleExport} className="gap-2">
                  <Download className="h-4 w-4" />
                  Export to {outputFormat.toUpperCase()}
                </Button>
              </div>
              <TablePreview data={extractedData} />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
