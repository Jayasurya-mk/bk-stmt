import os
import re
import argparse
import logging
from datetime import datetime
from typing import List, Dict, Any, Union, Optional, Tuple

import pandas as pd
import pdfplumber
import pytesseract
from pdf2image import convert_from_path
from PIL import Image
import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("pdf_converter.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("BankStatementConverter")

class BankStatementConverter:
    """
    A class to convert bank statement PDFs to Excel or CSV format.
    Handles both text-based PDFs and scanned (image-based) PDFs.
    """
    
    def __init__(self, input_pdf: str, output_path: str, output_format: str = 'xlsx'):
        """
        Initialize the converter with input and output paths.
        
        Args:
            input_pdf: Path to the input PDF file
            output_path: Path where the output file will be saved
            output_format: Output format ('xlsx' or 'csv')
        """
        self.input_pdf = input_pdf
        self.output_path = output_path
        self.output_format = output_format
        self.is_scanned = False
        
        # Validate input file
        if not os.path.exists(input_pdf):
            raise FileNotFoundError(f"Input PDF file not found: {input_pdf}")
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    
    def is_pdf_scanned(self) -> bool:
        """
        Check if the PDF is scanned (image-based) or text-based.
        
        Returns:
            bool: True if the PDF is scanned, False otherwise
        """
        try:
            with pdfplumber.open(self.input_pdf) as pdf:
                first_page = pdf.pages[0]
                text = first_page.extract_text()
                
                # If we can extract a reasonable amount of text, it's likely text-based
                if text and len(text) > 100:
                    logger.info("PDF appears to be text-based")
                    return False
                else:
                    logger.info("PDF appears to be scanned (image-based)")
                    return True
        except Exception as e:
            logger.warning(f"Error checking if PDF is scanned: {e}")
            # If we can't determine, assume it's scanned to be safe
            return True
    
    def extract_tables_from_text_pdf(self) -> List[pd.DataFrame]:
        """
        Extract tables from a text-based PDF using pdfplumber.
        
        Returns:
            List[pd.DataFrame]: List of DataFrames containing extracted tables
        """
        all_tables = []
        
        try:
            with pdfplumber.open(self.input_pdf) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    logger.info(f"Processing page {page_num + 1} of {len(pdf.pages)}")
                    
                    # Try to extract tables using pdfplumber's built-in table extraction
                    tables = page.extract_tables()
                    
                    if tables:
                        for table_num, table in enumerate(tables):
                            # Convert table to DataFrame
                            df = pd.DataFrame(table[1:], columns=table[0])
                            df['Page'] = page_num + 1
                            df['Table'] = table_num + 1
                            all_tables.append(df)
                            logger.info(f"Extracted table {table_num + 1} from page {page_num + 1}")
                    else:
                        # If no tables found, try alternative extraction methods
                        logger.warning(f"No tables found on page {page_num + 1} using standard extraction")
                        alt_table = self._extract_table_using_lines(page)
                        if alt_table is not None:
                            alt_table['Page'] = page_num + 1
                            alt_table['Table'] = 1
                            all_tables.append(alt_table)
                            logger.info(f"Extracted table using alternative method from page {page_num + 1}")
                        else:
                            # Try text-based extraction as a last resort
                            text_table = self._extract_table_from_text(page)
                            if text_table is not None:
                                text_table['Page'] = page_num + 1
                                text_table['Table'] = 1
                                all_tables.append(text_table)
                                logger.info(f"Extracted table from text on page {page_num + 1}")
        
        except Exception as e:
            logger.error(f"Error extracting tables from text PDF: {e}")
            raise
        
        return all_tables
    
    def _extract_table_using_lines(self, page) -> Optional[pd.DataFrame]:
        """
        Alternative method to extract tables using horizontal lines as row separators.
        Useful when standard table extraction fails.
        
        Args:
            page: pdfplumber page object
            
        Returns:
            Optional[pd.DataFrame]: Extracted table as DataFrame or None if extraction fails
        """
        try:
            # Get horizontal lines
            h_lines = sorted([line["y0"] for line in page.lines if abs(line["y0"] - line["y1"]) < 1])
            
            if len(h_lines) < 3:  # Need at least header, one row, and bottom line
                return None
            
            # Extract text between each pair of horizontal lines
            rows = []
            for i in range(len(h_lines) - 1):
                y0, y1 = h_lines[i], h_lines[i+1]
                crop = page.crop((0, y0, page.width, y1))
                text = crop.extract_text()
                if text:
                    # Split text into columns based on spacing
                    row = self._split_text_into_columns(text)
                    rows.append(row)
            
            if not rows:
                return None
                
            # First row is likely the header
            header = rows[0]
            data = rows[1:]
            
            # Create DataFrame
            df = pd.DataFrame(data, columns=header)
            return df
            
        except Exception as e:
            logger.warning(f"Alternative table extraction failed: {e}")
            return None
    
    def _extract_table_from_text(self, page) -> Optional[pd.DataFrame]:
        """
        Extract table-like data from text when no actual tables are detected.
        Looks for patterns in text that might represent transactions.
        
        Args:
            page: pdfplumber page object
            
        Returns:
            Optional[pd.DataFrame]: Extracted table as DataFrame or None if extraction fails
        """
        try:
            text = page.extract_text()
            if not text:
                return None
                
            # Split text into lines
            lines = text.split('\n')
            
            # Look for lines that might be transactions (contain dates and amounts)
            transactions = []
            date_pattern = r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}'
            amount_pattern = r'\$?\s*\d{1,3}(?:,\d{3})*\.\d{2}'
            
            for line in lines:
                # Check if line contains both a date and an amount (likely a transaction)
                if re.search(date_pattern, line) and re.search(amount_pattern, line):
                    # Extract date
                    date_match = re.search(date_pattern, line)
                    date = date_match.group(0) if date_match else ""
                    
                    # Extract amounts (usually the last two numbers are amount and balance)
                    amounts = re.findall(amount_pattern, line)
                    
                    # Extract description (everything between date and first amount)
                    if date_match and amounts:
                        start_idx = date_match.end()
                        desc_end = line.find(amounts[0], start_idx)
                        if desc_end > start_idx:
                            description = line[start_idx:desc_end].strip()
                        else:
                            description = ""
                    else:
                        description = ""
                    
                    # Create transaction
                    transaction = {
                        'Date': date,
                        'Description': description,
                        'Amount': amounts[0] if amounts else "",
                        'Balance': amounts[-1] if len(amounts) > 1 else ""
                    }
                    
                    transactions.append(transaction)
            
            if transactions:
                return pd.DataFrame(transactions)
            return None
            
        except Exception as e:
            logger.warning(f"Text-based table extraction failed: {e}")
            return None
    
    def _split_text_into_columns(self, text: str) -> List[str]:
        """
        Split a line of text into columns based on spacing patterns.
        
        Args:
            text: Text line to split
            
        Returns:
            List[str]: List of column values
        """
        # Remove multiple spaces and split
        text = re.sub(r'\s{2,}', '|', text)
        return text.split('|')
    
    def extract_tables_from_scanned_pdf(self) -> List[pd.DataFrame]:
        """
        Extract tables from a scanned (image-based) PDF using OCR.
        
        Returns:
            List[pd.DataFrame]: List of DataFrames containing extracted tables
        """
        all_tables = []
        
        try:
            # Convert PDF to images
            logger.info("Converting PDF pages to images for OCR processing")
            images = convert_from_path(self.input_pdf)
            
            for page_num, image in enumerate(images):
                logger.info(f"Processing page {page_num + 1} of {len(images)} with OCR")
                
                # Preprocess image for better OCR results
                processed_image = self._preprocess_image(image)
                
                # Extract text using OCR
                text = pytesseract.image_to_string(processed_image)
                
                # Extract table structure from OCR text
                df = self._extract_table_from_ocr_text(text)
                
                if df is not None and not df.empty:
                    df['Page'] = page_num + 1
                    all_tables.append(df)
                    logger.info(f"Successfully extracted table from page {page_num + 1} using OCR")
                else:
                    logger.warning(f"Failed to extract table from page {page_num + 1} using OCR")
        
        except Exception as e:
            logger.error(f"Error extracting tables from scanned PDF: {e}")
            raise
        
        return all_tables
    
    def _preprocess_image(self, image: Image.Image) -> Image.Image:
        """
        Preprocess image for better OCR results.
        
        Args:
            image: PIL Image object
            
        Returns:
            Image.Image: Processed image
        """
        # Convert to grayscale
        gray = image.convert('L')
        
        # Convert to numpy array
        img_array = np.array(gray)
        
        # Apply threshold to make text more distinct
        # Simple thresholding as a fallback if OpenCV is not available
        binary = (img_array > 150).astype(np.uint8) * 255
        
        # Convert back to PIL Image
        processed = Image.fromarray(binary)
        
        return processed
    
    def _extract_table_from_ocr_text(self, text: str) -> Optional[pd.DataFrame]:
        """
        Extract table structure from OCR text.
        
        Args:
            text: OCR-extracted text
            
        Returns:
            Optional[pd.DataFrame]: Extracted table as DataFrame or None if extraction fails
        """
        try:
            # Split text into lines
            lines = [line.strip() for line in text.split('\n') if line.strip()]
            
            # Identify table rows (lines that likely contain transaction data)
            # For bank statements, we look for lines that contain date patterns
            date_pattern = r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}'
            amount_pattern = r'\$?\s*\d{1,3}(?:,\d{3})*\.\d{2}'
            
            table_rows = []
            header_candidates = []
            
            for i, line in enumerate(lines):
                # Check if line contains a date (likely a transaction row)
                if re.search(date_pattern, line) and re.search(amount_pattern, line):
                    table_rows.append(line)
                    
                    # The line before the first transaction might be the header
                    if not header_candidates and i > 0:
                        header_candidates.append(lines[i-1])
            
            if not table_rows:
                logger.warning("No transaction rows identified in OCR text")
                return None
            
            # Determine column positions based on the structure of transaction rows
            columns = self._determine_columns(table_rows, header_candidates)
            
            # Parse each row into columns
            data = []
            for row in table_rows:
                parsed_row = self._parse_row_into_columns(row, columns)
                if parsed_row:
                    data.append(parsed_row)
            
            if not data:
                return None
                
            # Create DataFrame
            df = pd.DataFrame(data, columns=list(columns.keys()))
            return df
            
        except Exception as e:
            logger.warning(f"Failed to extract table from OCR text: {e}")
            return None
    
    def _determine_columns(self, rows: List[str], header_candidates: List[str]) -> Dict[str, Tuple[int, int]]:
        """
        Determine column positions based on the structure of transaction rows.
        
        Args:
            rows: List of transaction rows
            header_candidates: Potential header rows
            
        Returns:
            Dict[str, Tuple[int, int]]: Dictionary mapping column names to position ranges
        """
        # Default column names for bank statements
        default_columns = ["Date", "Description", "Amount", "Balance"]
        
        # Try to extract column names from header candidates
        column_names = default_columns
        if header_candidates:
            # TODO: Implement more sophisticated header detection
            pass
        
        # Analyze the structure of transaction rows to determine column positions
        # This is a simplified approach - in a real implementation, this would be more sophisticated
        columns = {}
        
        # For this example, we'll use a simple heuristic based on common bank statement formats
        # Date is typically at the beginning
        columns["Date"] = (0, 10)
        
        # Description is typically the longest part in the middle
        columns["Description"] = (11, 50)
        
        # Amount is typically near the end
        columns["Amount"] = (51, 65)
        
        # Balance is typically at the end
        columns["Balance"] = (66, 80)
        
        return columns
    
    def _parse_row_into_columns(self, row: str, columns: Dict[str, Tuple[int, int]]) -> Dict[str, str]:
        """
        Parse a row into columns based on determined column positions.
        
        Args:
            row: Transaction row text
            columns: Dictionary mapping column names to position ranges
            
        Returns:
            Dict[str, str]: Dictionary mapping column names to values
        """
        result = {}
        
        # If the row is shorter than expected, use regex patterns instead of positions
        if len(row) < max([end for _, (_, end) in columns.items()]):
            # Extract date
            date_match = re.search(r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', row)
            if date_match:
                result["Date"] = date_match.group(0)
                row = row.replace(date_match.group(0), '', 1)
            
            # Extract amounts (last two numbers with decimal points are likely Amount and Balance)
            amount_matches = re.findall(r'\$?\s*\d{1,3}(?:,\d{3})*\.\d{2}', row)
            if len(amount_matches) >= 2:
                result["Balance"] = amount_matches[-1]
                result["Amount"] = amount_matches[-2]
                for match in amount_matches[-2:]:
                    row = row.replace(match, '', 1)
            elif len(amount_matches) == 1:
                result["Amount"] = amount_matches[0]
                row = row.replace(amount_matches[0], '', 1)
            
            # Whatever is left is the description
            result["Description"] = row.strip()
        else:
            # Use position-based extraction
            for col_name, (start, end) in columns.items():
                if start < len(row):
                    end_pos = min(end, len(row))
                    result[col_name] = row[start:end_pos].strip()
                else:
                    result[col_name] = ""
        
        return result
    
    def clean_and_normalize_data(self, tables: List[pd.DataFrame]) -> pd.DataFrame:
        """
        Clean and normalize the extracted table data.
        
        Args:
            tables: List of DataFrames containing extracted tables
            
        Returns:
            pd.DataFrame: Cleaned and normalized DataFrame
        """
        if not tables:
            logger.warning("No tables to clean and normalize")
            return pd.DataFrame()
        
        try:
            # Combine all tables
            df = pd.concat(tables, ignore_index=True)
            
            # Remove empty rows
            df = df.dropna(how='all')
            
            # Standardize column names and remove whitespace
            df.columns = [col.strip() if isinstance(col, str) else col for col in df.columns]
            
            # Identify and standardize key columns
            key_columns = {
                'date': ['date', 'transaction date', 'trans date', 'posted date'],
                'description': ['description', 'transaction', 'details', 'particulars', 'narration'],
                'amount': ['amount', 'transaction amount', 'debit', 'credit', 'withdrawal', 'deposit'],
                'balance': ['balance', 'closing balance', 'running balance']
            }
            
            # Standardize column names
            for standard_name, variations in key_columns.items():
                for col in df.columns:
                    if isinstance(col, str) and col.lower() in variations:
                        df = df.rename(columns={col: standard_name.capitalize()})
            
            # Ensure key columns exist
            for standard_name in key_columns.keys():
                if standard_name.capitalize() not in df.columns:
                    logger.warning(f"Column '{standard_name.capitalize()}' not found in extracted data")
            
            # Clean and normalize data in each column
            if 'Date' in df.columns:
                df['Date'] = df['Date'].apply(self._normalize_date)
            
            if 'Description' in df.columns:
                df['Description'] = df['Description'].apply(lambda x: str(x).strip() if pd.notna(x) else '')
            
            if 'Amount' in df.columns:
                df['Amount'] = df['Amount'].apply(self._normalize_amount)
            
            if 'Balance' in df.columns:
                df['Balance'] = df['Balance'].apply(self._normalize_amount)
            
            # Remove any temporary or helper columns
            for col in ['Page', 'Table']:
                if col in df.columns:
                    df = df.drop(columns=[col])
            
            return df
            
        except Exception as e:
            logger.error(f"Error cleaning and normalizing data: {e}")
            raise
    
    def _normalize_date(self, date_str: str) -> str:
        """
        Normalize date strings to YYYY-MM-DD format.
        
        Args:
            date_str: Date string to normalize
            
        Returns:
            str: Normalized date string
        """
        if pd.isna(date_str) or not date_str:
            return ''
        
        date_str = str(date_str).strip()
        
        # Common date formats in bank statements
        date_formats = [
            '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d',
            '%d-%m-%Y', '%m-%d-%Y', '%Y-%m-%d',
            '%d.%m.%Y', '%m.%d.%Y', '%Y.%m.%d',
            '%d/%m/%y', '%m/%d/%y', '%y/%m/%d',
            '%d-%m-%y', '%m-%d-%y', '%y-%m-%d',
            '%d.%m.%y', '%m.%d.%y', '%y.%m.%d',
        ]
        
        # Try to parse the date using different formats
        for fmt in date_formats:
            try:
                date_obj = datetime.strptime(date_str, fmt)
                return date_obj.strftime('%Y-%m-%d')
            except ValueError:
                continue
        
        # If all formats fail, try to extract date using regex
        try:
            # Extract day, month, year components
            components = re.findall(r'\d+', date_str)
            if len(components) >= 3:
                day, month, year = map(int, components[:3])
                
                # Handle 2-digit years
                if year < 100:
                    year = 2000 + year if year < 50 else 1900 + year
                
                # Validate components
                if 1 <= day <= 31 and 1 <= month <= 12 and 1900 <= year <= 2100:
                    return f"{year:04d}-{month:02d}-{day:02d}"
        except Exception:
            pass
        
        # Return original if normalization fails
        logger.warning(f"Failed to normalize date: {date_str}")
        return date_str
    
    def _normalize_amount(self, amount_str: Union[str, float]) -> float:
        """
        Normalize amount strings to float values.
        
        Args:
            amount_str: Amount string to normalize
            
        Returns:
            float: Normalized amount value
        """
        if pd.isna(amount_str) or amount_str == '':
            return 0.0
        
        # If already a number, return it
        if isinstance(amount_str, (int, float)):
            return float(amount_str)
        
        amount_str = str(amount_str).strip()
        
        # Remove currency symbols and commas
        amount_str = re.sub(r'[^\d.-]', '', amount_str)
        
        try:
            return float(amount_str)
        except ValueError:
            logger.warning(f"Failed to normalize amount: {amount_str}")
            return 0.0
    
    def export_to_file(self, df: pd.DataFrame) -> str:
        """
        Export the DataFrame to Excel or CSV file.
        
        Args:
            df: DataFrame to export
            
        Returns:
            str: Path to the exported file
        """
        try:
            if df.empty:
                logger.warning("No data to export")
                return ""
            
            if self.output_format.lower() == 'xlsx':
                df.to_excel(self.output_path, index=False, engine='openpyxl')
                logger.info(f"Data exported to Excel file: {self.output_path}")
            elif self.output_format.lower() == 'csv':
                df.to_csv(self.output_path, index=False)
                logger.info(f"Data exported to CSV file: {self.output_path}")
            else:
                raise ValueError(f"Unsupported output format: {self.output_format}")
            
            return self.output_path
            
        except Exception as e:
            logger.error(f"Error exporting data to file: {e}")
            raise
    
    def convert(self) -> str:
        """
        Convert the PDF bank statement to Excel or CSV.
        
        Returns:
            str: Path to the exported file
        """
        try:
            # Check if the PDF is scanned or text-based
            self.is_scanned = self.is_pdf_scanned()
            
            # Extract tables based on PDF type
            if self.is_scanned:
                logger.info("Using OCR to extract tables from scanned PDF")
                tables = self.extract_tables_from_scanned_pdf()
            else:
                logger.info("Extracting tables from text-based PDF")
                tables = self.extract_tables_from_text_pdf()
            
            # Clean and normalize the extracted data
            df = self.clean_and_normalize_data(tables)
            
            # Export to file
            output_path = self.export_to_file(df)
            
            return output_path
            
        except Exception as e:
            logger.error(f"Error converting PDF: {e}")
            raise

def main():
    """Main function to run the converter from command line."""
    parser = argparse.ArgumentParser(description='Convert bank statement PDF to Excel or CSV')
    parser.add_argument('input_pdf', help='Path to the input PDF file')
    parser.add_argument('output_path', help='Path where the output file will be saved')
    parser.add_argument('--format', choices=['xlsx', 'csv'], default='xlsx',
                        help='Output format (xlsx or csv, default: xlsx)')
    parser.add_argument('--verbose', action='store_true', help='Enable verbose logging')
    
    args = parser.parse_args()
    
    # Set logging level based on verbose flag
    if args.verbose:
        logger.setLevel(logging.DEBUG)
    
    try:
        converter = BankStatementConverter(args.input_pdf, args.output_path, args.format)
        output_path = converter.convert()
        
        if output_path:
            print(f"Conversion successful! Output saved to: {output_path}")
        else:
            print("Conversion failed. Check the log for details.")
            
    except Exception as e:
        print(f"Error: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    # Import cv2 only when needed (for OCR image preprocessing)
    try:
        import cv2
    except ImportError:
        logger.warning("OpenCV (cv2) not found. Image preprocessing for OCR will be limited.")
        # Define a minimal version of threshold function
        def threshold(img, thresh, maxval, type):
            return img > thresh
        cv2 = type('cv2', (), {'threshold': threshold})
    
    exit(main())
