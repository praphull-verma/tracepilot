import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { prisma } from '../config/database';
import { indexDocument } from '../services/retrieval';
import { createError } from '../middleware';
import { logger } from '../utils/logger';
import { config } from '../config';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: config.uploadMaxSizeMb * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(createError('Invalid file type. Only CSV and XLSX supported.', 400, 'INVALID_FILE_TYPE'));
  },
});

function parseFile(filePath: string, ext: string): unknown[] {
  if (ext === '.csv') {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parse(content, { columns: true, skip_empty_lines: true, trim: true });
  }
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json(sheet);
}

function analyzeDataQuality(rows: unknown[], type: string) {
  const records = rows as Record<string, unknown>[];
  if (records.length === 0) return { qualityScore: 0, duplicates: 0, missingValues: 0, staleness: 0 };

  const keys = Object.keys(records[0] || {});
  let totalMissing = 0;
  const seen = new Set<string>();
  let duplicates = 0;

  for (const row of records) {
    const sig = JSON.stringify(row);
    if (seen.has(sig)) duplicates++;
    seen.add(sig);

    for (const key of keys) {
      if (row[key] === null || row[key] === undefined || row[key] === '') {
        totalMissing++;
      }
    }
  }

  const missingRate = keys.length > 0 ? totalMissing / (records.length * keys.length) : 0;
  const duplicateRate = records.length > 0 ? duplicates / records.length : 0;
  const qualityScore = Math.round((1 - missingRate * 0.5 - duplicateRate * 0.3) * 100);

  return {
    qualityScore: Math.max(0, Math.min(100, qualityScore)),
    duplicates,
    missingValues: totalMissing,
    staleness: 0,
    schema: keys,
  };
}

async function ingestLeads(rows: unknown[]): Promise<number> {
  const records = rows as Record<string, unknown>[];
  let count = 0;
  for (const row of records.slice(0, 5000)) {
    try {
      const externalId =
        String(row['id'] || row['lead_id'] || row['externalId'] || `L-${Date.now()}-${count}`);
      await prisma.lead.upsert({
        where: { externalId },
        update: {
          name: String(row['name'] || row['full_name'] || 'Unknown'),
          company: String(row['company'] || row['company_name'] || ''),
          email: row['email'] ? String(row['email']) : null,
          leadScore: parseFloat(String(row['lead_score'] || row['leadScore'] || 0)),
          status: String(row['status'] || 'NEW'),
          estimatedDealValue: row['deal_value'] ? parseFloat(String(row['deal_value'])) : null,
        },
        create: {
          externalId,
          name: String(row['name'] || row['full_name'] || 'Unknown'),
          company: String(row['company'] || row['company_name'] || ''),
          email: row['email'] ? String(row['email']) : null,
          phone: row['phone'] ? String(row['phone']) : null,
          jobTitle: row['job_title'] ? String(row['job_title']) : null,
          industry: row['industry'] ? String(row['industry']) : null,
          leadScore: parseFloat(String(row['lead_score'] || row['leadScore'] || 0)),
          status: String(row['status'] || 'NEW'),
          estimatedDealValue: row['deal_value'] ? parseFloat(String(row['deal_value'])) : null,
          source: row['source'] ? String(row['source']) : null,
        },
      });
      count++;
    } catch {
      // Skip invalid rows
    }
  }
  return count;
}

async function ingestNotes(rows: unknown[], sourceId: string): Promise<number> {
  const records = rows as Record<string, unknown>[];
  let indexed = 0;
  for (const row of records.slice(0, 1000)) {
    try {
      const note = await prisma.businessNote.create({
        data: {
          entityType: 'Lead',
          entityId: String(row['entity_id'] || row['lead_id'] || sourceId),
          title: row['title'] ? String(row['title']) : null,
          content: String(row['content'] || row['note'] || row['text'] || ''),
          author: row['author'] ? String(row['author']) : null,
          source: 'UPLOAD',
        },
      });
      await indexDocument('BusinessNote', note.id, note.content, {
        entityType: note.entityType,
        entityId: note.entityId,
      });
      indexed++;
    } catch {
      // Skip
    }
  }
  return indexed;
}

export async function uploadData(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw createError('No file uploaded', 400, 'NO_FILE');

    const ext = path.extname(req.file.originalname).toLowerCase();
    const dataType = (req.body as { type?: string }).type || 'leads';
    const rows = parseFile(req.file.path, ext);

    const quality = analyzeDataQuality(rows, dataType);
    const preview = rows.slice(0, 5);

    // Clean up
    fs.unlinkSync(req.file.path);

    const source = await prisma.dataSource.create({
      data: {
        name: req.file.originalname,
        type: dataType,
        fileName: req.file.originalname,
        rowCount: rows.length,
        qualityScore: quality.qualityScore,
        duplicates: quality.duplicates,
        missingValues: quality.missingValues,
        staleness: quality.staleness,
        status: 'PREVIEW',
        schema: quality.schema as never,
        metadata: { preview } as never,
      },
    });

    res.json({
      success: true,
      data: {
        sourceId: source.id,
        rowCount: rows.length,
        quality,
        preview,
        schema: quality.schema,
      },
    });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
}

export async function ingestData(req: Request, res: Response, next: NextFunction) {
  try {
    const { sourceId, confirm } = req.body as { sourceId: string; confirm?: boolean };
    if (!confirm) throw createError('Ingestion not confirmed', 400, 'NOT_CONFIRMED');

    const source = await prisma.dataSource.findUnique({ where: { id: sourceId } });
    if (!source) throw createError('Data source not found', 404, 'SOURCE_NOT_FOUND');

    await prisma.dataSource.update({
      where: { id: sourceId },
      data: { status: 'INGESTING' },
    });

    logger.info('Data ingestion started', { sourceId, type: source.type });

    // Async ingest
    res.json({ success: true, message: 'Ingestion started', data: { sourceId } });
  } catch (err) {
    next(err);
  }
}

export async function getDataSources(req: Request, res: Response, next: NextFunction) {
  try {
    const sources = await prisma.dataSource.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: sources });
  } catch (err) {
    next(err);
  }
}

export async function getDataSource(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const source = await prisma.dataSource.findUnique({ where: { id } });
    if (!source) throw createError('Data source not found', 404, 'SOURCE_NOT_FOUND');
    res.json({ success: true, data: source });
  } catch (err) {
    next(err);
  }
}
