import { BankStatementConverter } from "@/components/bank-statement-converter"

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Bank Statement Converter</h1>
          <p className="mt-2 text-lg text-gray-600">Convert your bank statement PDFs to Excel or CSV format</p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <BankStatementConverter />
        </div>
      </div>
    </div>
  )
}
