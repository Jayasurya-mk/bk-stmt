"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { UploadIcon, XIcon, FileTextIcon, AlertCircleIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface FileUploaderProps {
  file: File | null
  onFileChange: (file: File | null) => void
  maxSizeMB?: number
}

export function FileUploader({ file, onFileChange, maxSizeMB = 50 }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    setError(null)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0]
      validateAndSetFile(droppedFile)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0]
      validateAndSetFile(selectedFile)
    }
  }

  const validateAndSetFile = (file: File) => {
    // Check file type
    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file")
      return
    }

    // Check file size
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > maxSizeMB) {
      setError(`File size exceeds the maximum limit of ${maxSizeMB}MB`)
      return
    }

    // All checks passed, set the file
    onFileChange(file)
  }

  const handleRemoveFile = () => {
    onFileChange(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleBrowseClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!file ? (
        <div
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center ${
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <UploadIcon className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-medium">Drag and drop your bank statement PDF here</h3>
          <p className="mb-4 text-sm text-muted-foreground">or click the button below to browse files</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <Button type="button" onClick={handleBrowseClick} variant="outline">
            Browse Files
          </Button>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center space-x-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <FileTextIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleRemoveFile} className="h-8 w-8 rounded-full">
              <XIcon className="h-4 w-4" />
              <span className="sr-only">Remove file</span>
            </Button>
          </div>
          <div className="p-4 bg-gray-50 flex items-center justify-center">
            <div className="flex items-center space-x-2 text-sm">
              <FileTextIcon className="h-5 w-5 text-gray-500" />
              <span>PDF file ready for processing</span>
            </div>
          </div>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">
        Supported format: PDF. Maximum file size: {maxSizeMB}MB. The converter works best with text-based PDFs rather
        than scanned documents.
      </p>
    </div>
  )
}
