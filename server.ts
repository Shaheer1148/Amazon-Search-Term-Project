import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import * as xlsx from 'xlsx';
import { stringify } from 'csv-stringify/sync';
import cors from 'cors';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';

const app = express();
const PORT = 3000;

// Setup Multer for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

/**
 * Standardize column names and clean data
 */
function processAmazonData(buffer: Buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  let primarySheetName = '';
  let data: any[] = [];

  // 1. Multi-Sheet Handling: Identify the primary data sheet
  const coreColumns = ['Customer Search Term', 'Impressions', 'Clicks', 'Spend', 'Sales', 'Orders'];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(sheet);
    if (jsonData.length > 0) {
      const firstRowKeys = Object.keys(jsonData[0] as object);
      const matchCount = coreColumns.filter(col => 
        firstRowKeys.some(key => key.toLowerCase().includes(col.toLowerCase()))
      ).length;
      
      if (matchCount >= 3) {
        primarySheetName = sheetName;
        data = jsonData;
        break;
      }
    }
  }

  if (!data.length) {
    throw new Error('Could not identify a valid Amazon Search Term sheet.');
  }

  // 2. Robust Column Identification
  const standardizedData = data.map((row: any) => {
    const newRow: any = {};
    const rowKeys = Object.keys(row);

    // Helper to find a key that matches a pattern, prioritizing exact matches
    const findKey = (patterns: string[]) => {
      // First, try exact matches
      const exactMatch = rowKeys.find(key => {
        const k = key.toLowerCase().trim();
        return patterns.some(p => k === p.toLowerCase());
      });
      if (exactMatch) return exactMatch;

      // Then, try partial matches, but avoid common false positives
      return rowKeys.find(key => {
        const k = key.toLowerCase().trim();
        // Avoid "Sales Rank" when looking for "Sales"
        if (k.includes('rank')) return false;
        return patterns.some(p => k.includes(p.toLowerCase()));
      });
    };

    // Map columns based on common Amazon naming patterns
    const mappings = {
      search_term: findKey(['customer search term', 'search term']),
      impressions: findKey(['impressions', 'imps']),
      clicks: findKey(['clicks']),
      spend: findKey(['spend', 'cost', 'ad spend']),
      sales: findKey(['14 day total sales', 'total sales', '7 day total sales', 'sales', 'revenue']),
      conversions: findKey(['14 day total orders (#)', 'total orders', '7 day total orders', 'conversions', 'orders']),
      acos: findKey(['acos', 'advertising cost of sales'])
    };

    console.log('Column Mappings:', mappings);

    // Assign values to standardized keys
    Object.entries(mappings).forEach(([stdKey, originalKey]) => {
      if (originalKey) {
        newRow[stdKey] = row[originalKey];
      } else {
        newRow[stdKey] = 0;
      }
    });

    return newRow;
  }).filter(row => row.search_term); // Drop rows where search_term is null

  // 3. Data Cleaning & Type Casting
  const cleanedData = standardizedData.map(row => {
    const clean = { ...row };
    
    // String cleaning
    if (typeof clean.search_term === 'string') {
      clean.search_term = clean.search_term.trim();
    }

    // Numeric cleaning (handling currency/percentage symbols, commas, and other non-numeric chars)
    ['impressions', 'clicks', 'spend', 'sales', 'conversions', 'acos'].forEach(col => {
      let val = clean[col];
      if (val === undefined || val === null) {
        val = 0;
      } else if (typeof val === 'string') {
        // Remove everything except digits, dots, and minus signs
        val = val.replace(/[^\d.-]/g, '');
        val = parseFloat(val);
      } else if (typeof val !== 'number') {
        val = 0;
      }
      clean[col] = isNaN(val) ? 0 : val;
    });

    // 4. KPI Engineering
    clean.ctr = clean.impressions > 0 ? clean.clicks / clean.impressions : 0;
    clean.cvr = clean.clicks > 0 ? clean.conversions / clean.clicks : 0;
    clean.cpa = clean.conversions > 0 ? clean.spend / clean.conversions : 0;
    clean.roas = clean.spend > 0 ? clean.sales / clean.spend : 0;

    return clean;
  });

  return cleanedData;
}

/**
 * Data Processing Endpoint
 */
app.post('/api/process', (req, res, next) => {
  console.log(`[${new Date().toISOString()}] Received POST request to /api/process`);
  next();
}, upload.single('file'), async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] File upload parsed. File present: ${!!req.file}`);
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Processing data...');
    const rawCleanedData = processAmazonData(req.file.buffer);

    // Phase 1: Data Consolidation
    const consolidatedMap = new Map<string, any>();

    rawCleanedData.forEach(row => {
      const term = row.search_term;
      if (!consolidatedMap.has(term)) {
        consolidatedMap.set(term, {
          search_term: term,
          spend: 0,
          sales: 0,
          clicks: 0,
          conversions: 0
        });
      }
      const entry = consolidatedMap.get(term);
      entry.spend += row.spend;
      entry.sales += row.sales;
      entry.clicks += row.clicks;
      entry.conversions += row.conversions;
    });

    const consolidatedData = Array.from(consolidatedMap.values()).map(entry => {
      return {
        ...entry,
        acos_percentage: entry.sales > 0 ? (entry.spend / entry.sales) * 100 : null
      };
    });

    // Phase 2: Macro Account Analysis
    const totalAdSpend = consolidatedData.reduce((sum, r) => sum + r.spend, 0);
    const totalSales = consolidatedData.reduce((sum, r) => sum + r.sales, 0);
    const accountAcosPercentage = totalSales > 0 ? (totalAdSpend / totalSales) * 100 : 0;

    // Phase 3: Strategic Keyword Segmentation

    // 1. High-Converting Keywords (The Winners)
    // Criteria: Highest conversions and profitable ACOS (under account average)
    const highConvertingKeywords = consolidatedData
      .filter(kw => kw.conversions > 0 && (kw.acos_percentage !== null && kw.acos_percentage <= accountAcosPercentage))
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 10)
      .map(kw => ({
        search_term: kw.search_term,
        total_orders: kw.conversions,
        total_spend: kw.spend,
        total_sales: kw.sales,
        acos_percentage: kw.acos_percentage
      }));

    // 2. Severe Loss/Bleeding Keywords
    // Criteria: Clicks > 10 AND Orders == 0
    const bleedingKeywords = consolidatedData
      .filter(kw => kw.clicks > 10 && kw.conversions === 0)
      .map(kw => ({
        search_term: kw.search_term,
        total_clicks: kw.clicks,
        total_spend: kw.spend
      }));

    // 3. Watchlist / Keep an Eye On
    // Criteria: ACOS > 50% AND Clicks > 7
    const watchlistKeywords = consolidatedData
      .filter(kw => kw.acos_percentage !== null && kw.acos_percentage > 50 && kw.clicks > 7)
      .map(kw => ({
        search_term: kw.search_term,
        total_clicks: kw.clicks,
        total_spend: kw.spend,
        total_sales: kw.sales,
        acos_percentage: kw.acos_percentage
      }));

    // Phase 4: Required JSON Output Format
    const analysis = {
      macro_metrics: {
        total_ad_spend: totalAdSpend,
        total_sales: totalSales,
        account_acos_percentage: accountAcosPercentage
      },
      high_converting_keywords: highConvertingKeywords,
      bleeding_keywords_zero_sales: bleedingKeywords,
      watchlist_high_acos: watchlistKeywords
    };

    // Generate CSV for download (using consolidated data)
    const csvData = stringify(consolidatedData, { header: true });

    res.json({
      analysis,
      cleanedData: consolidatedData, // Return consolidated data for the table
      csvData
    });

  } catch (error: any) {
    console.error('Error processing report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Vite Integration
 */
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
