"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, Copy } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface SampleDataInputProps {
  onDataSubmit: (data: any[]) => void
}

export function SampleDataInput({ onDataSubmit }: SampleDataInputProps) {
  const [inputText, setInputText] = useState("")
  const [error, setError] = useState<string | null>(null)

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
    setError(null)
  }

  const handleSubmit = () => {
    try {
      if (!inputText.trim()) {
        setError("Please enter some transaction data")
        return
      }

      // Try to parse as JSON first
      try {
        const jsonData = JSON.parse(inputText)
        if (Array.isArray(jsonData)) {
          onDataSubmit(jsonData)
          return
        } else if (typeof jsonData === "object") {
          onDataSubmit([jsonData])
          return
        }
      } catch (e) {
        // Not valid JSON, continue with CSV parsing
      }

      // Try to parse as CSV
      const lines = inputText.split("\n").filter((line) => line.trim())
      if (lines.length < 2) {
        setError("Please enter data with headers and at least one transaction")
        return
      }

      const headers = lines[0].split(",").map((header) => header.trim())
      const data = []

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((value) => value.trim())
        if (values.length !== headers.length) continue

        const row: any = {}
        for (let j = 0; j < headers.length; j++) {
          row[headers[j]] = values[j]
        }
        data.push(row)
      }

      if (data.length === 0) {
        setError("Could not parse any valid transactions from the input")
        return
      }

      onDataSubmit(data)
    } catch (error) {
      console.error("Error parsing input data:", error)
      setError("Failed to parse the input data. Please check the format and try again.")
    }
  }

  const handlePasteSampleData = () => {
    const sampleData = `Date,Description,Debit,Credit,Balance
14/04/2024,FT/0000885394301/15894005677/CR CARD PYMT,,50000.00,86540.65
15/04/2024,ACH DEBIT:TXV/G4951885,BD-UTIMF SMS,500.00,,86040.65
26/04/2024,Own Indusind CreditCard Payment/4147XXXXXXXXXX854,66463.00,,19577.65
29/04/2024,ACH DEBIT:TXV/G4538/0188,BD-UTIMF SMS,500.00,,19077.65
29/04/2024,N/N12024300880/1963/HDF/C0000240/ NATIONAL SECURITIES,,347.93,19425.58
15/05/2024,ACH DEBIT:TXV/G4608/3053,BD-UTIMF SMS,500.00,,18925.58`

    setInputText(sampleData)
    setError(null)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Manual Data Entry</CardTitle>
        <CardDescription>If you can't upload a PDF, you can manually enter your transaction data here.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <Textarea
            placeholder="Paste your transaction data in CSV format (with headers) or JSON format"
            className="min-h-[200px] font-mono text-sm"
            value={inputText}
            onChange={handleTextChange}
          />

          <div className="flex justify-between items-center">
            <Button variant="outline" size="sm" onClick={handlePasteSampleData} className="gap-2">
              <Copy className="h-4 w-4" />
              Paste Sample Data
            </Button>
            <div className="text-xs text-muted-foreground">CSV or JSON format</div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSubmit} className="w-full">
          Process Data
        </Button>
      </CardFooter>
    </Card>
  )
}
