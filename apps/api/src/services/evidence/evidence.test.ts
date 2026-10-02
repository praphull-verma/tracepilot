import { describe, it, expect } from 'vitest';
import { detectConflicts, calculateEvidenceCoverage } from './index';
import { LeadCandidate } from '../analytics';
import { SearchResult } from '../retrieval';

describe('Evidence & Conflict Logic', () => {
  const baseLead: LeadCandidate = {
    id: 'l-1',
    externalId: 'EXT-1',
    name: 'Test',
    company: 'Corp',
    status: 'ACTIVE',
    leadScore: 85,
    daysSinceContact: null,
    estimatedDealValue: null,
    lastContactedAt: null,
    lastActivityAt: null,
  };

  it('should detect HIGH severity conflict if deal is paused but lead is ACTIVE', () => {
    const notes: SearchResult[] = [
      { id: 'n-1', sourceType: 'BusinessNote', sourceId: 'l-1', text: 'Client said the deal is paused for now.', similarity: 0.9, createdAt: new Date() },
    ];

    const conflicts = detectConflicts(baseLead, notes);
    expect(conflicts.length).toBeGreaterThan(0);
    const pauseConflict = conflicts.find((c) => c.severity === 'HIGH' && c.field === 'status');
    expect(pauseConflict).toBeDefined();
    expect(pauseConflict?.description).toContain('paused or on hold');
  });

  it('should detect HIGH severity conflict if score is high but deal is on hold', () => {
    const notes: SearchResult[] = [
      { id: 'n-1', sourceType: 'BusinessNote', sourceId: 'l-1', text: 'on hold', similarity: 0.9, createdAt: new Date() },
    ];
    // Score is 85, change status to NEW to skip the 'status' conflict rule
    const leadWithNewStatus = { ...baseLead, status: 'NEW' };
    const conflicts = detectConflicts(leadWithNewStatus, notes);
    const scoreConflict = conflicts.find((c) => c.field === 'leadScore' && c.severity === 'HIGH');
    expect(scoreConflict).toBeDefined();
  });

  it('should correctly calculate evidence coverage', () => {
    const available = new Set(['ev-1', 'ev-2', 'ev-3']);
    
    // All valid
    expect(calculateEvidenceCoverage(['ev-1', 'ev-2'], available)).toBe(1.0);
    
    // Half valid
    expect(calculateEvidenceCoverage(['ev-1', 'fake-1'], available)).toBe(0.5);
    
    // None valid
    expect(calculateEvidenceCoverage(['fake-1', 'fake-2'], available)).toBe(0.0);
    
    // Empty
    expect(calculateEvidenceCoverage([], available)).toBe(1.0);
  });
});
