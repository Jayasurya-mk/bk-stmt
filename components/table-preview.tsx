"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface TablePreviewProps {
  data: any[]
}

export function TablePreview({ data }: TablePreviewProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const rowsPerPage = 10

  if (!data || data.length === 0) {
    return <div className="text-center py-4">No data to display</div>
  }

  // Get all unique keys from the data
  const columns = Array.from(new Set(data.flatMap((item) => Object.keys(item))))

  // Sort columns to put important columns first
  const orderedColumns = [
    "Date",
    "Description",
    "Debit",
    "Credit",
    "Amount",
    "Balance",
    "Type",
    "Page",
    ...columns.filter(
      (col) => !["Date", "Description", "Debit", "Credit", "Amount", "Balance", "Type", "Page"].includes(col),
    ),
  ].filter((col) => columns.includes(col))

  // Determine which data to show based on pagination
  const startIndex = (currentPage - 1) * rowsPerPage
  const endIndex = startIndex + rowsPerPage
  const displayData = data.slice(startIndex, endIndex)
  const totalPages = Math.ceil(data.length / rowsPerPage)

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1))
  }

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
  }

  return (
    <div className="space-y-4 border rounded-md overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {orderedColumns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayData.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {orderedColumns.map((column) => (
                  <TableCell key={`${rowIndex}-${column}`}>{row[column] || ""}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="p-4 border-t flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {startIndex + 1}-{Math.min(endIndex, data.length)} of {data.length} transactions
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handlePreviousPage} disabled={currentPage === 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">
            Page {currentPage} of {totalPages}
          </span>
          <Button variant="outline" size="sm" onClick={handleNextPage} disabled={currentPage === totalPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
