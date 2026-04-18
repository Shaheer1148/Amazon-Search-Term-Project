# Amazon Search Term Analyzer (AI-Powered)

An enterprise-grade, full-stack Amazon PPC analytics dashboard engineered to automate raw Search Term Report processing and deliver AI-driven strategic insights.

## Overview

Analyzing raw `.xlsx` Amazon Advertising Search Term reports is incredibly tedious. This tool ingests those raw reports, processes the data through a custom parsing engine, and visualizes macroeconomic indicators alongside AI-generated optimization strategies.

### Key Features
- **Data Ingestion:** Securely parses raw Amazon Search Term excel datasets (`.xlsx` or `.csv`).
- **Macro Reporting:** Instantly visualizes core KPIs (Total Ad Spend, Total Sales, Account ACoS).
- **Intelligent Segmentation:** 
  - 🎯 **The Winners:** Identifies high-converting targets for expansion.
  - 🚨 **Bleeding Keywords:** Isolates zero-sale negative targets draining ad spend.
  - 📊 **Watchlist:** Flags terms approaching dangerous ACoS thresholds.
- **AI Virtual PPC Strategist:** Powered by Google's Gemini Pro LLM, the system reads your data array to dynamically generate an "AI Strategic Performance Audit" containing context-aware expansion recommendations, bid adjustment logic, and long-term outlook trends.
- **CSV Export:** One-click download of all processed tables for bulk uploading into Amazon Seller Central.

## Tech Stack
- **Frontend App:** React 19, TypeScript
- **Styling:** Tailwind CSS V4, Lucide React (Iconography), Framer Motion (Animations)
- **Backend API:** Node.js, Express, Vite
- **Data Engine:** XLSX (SheetJS), multer
- **AI Engine:** `@google/genai` (Strict JSON schema definitions)

## Getting Started

### Prerequisites
- Node.js (v18+)
- A valid Google Gemini API Key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/amazon-search-term-analyzer.git
   cd amazon-search-term-analyzer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the root directory based on `.env.example`:
   ```bash
   GEMINI_API_KEY="your_api_key_here"  # Or Search_Term_Project="your_api_key_here"
   ```

4. **Run the Development Server**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:3000`.

## Usage
1. Open the application.
2. Drag and drop your raw Amazon Advertising Excel report. 
3. Wait for the server to process the raw rows and hand off the arrays to the AI.
4. Review your macroeconomic metrics and read your AI Strategic Performance Audit! 

## License
MIT License
