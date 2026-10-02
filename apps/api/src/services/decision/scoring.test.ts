import { describe, it, expect } from 'vitest';
import { calculateLeadPriority, rankLeads } from './scoring';
import { LeadCandidate } from '../analytics';

describe('Scoring Logic', () => {
  const baseLead: LeadCandidate = {
    id: 'l-1',
    externalId: 'EXT-1',
    name: 'Test Lead',
    company: 'Test Corp',
    status: 'ACTIVE',
    leadScore: 50,
    conversionProbability: 0.5,
    daysSinceContact: null,
    estimatedDealValue: null,
    lastContactedAt: null,
    lastActivityAt: null,
  };

  it('should rank a perfect lead with CONTACT_TODAY', () => {
    const perfectLead: LeadCandidate = {
      ...baseLead,
      leadScore: 100,
      conversionProbability: 1.0,
      daysSinceContact: 14, // optimal
      estimatedDealValue: 100000,
      lastActivityAt: new Date(), // FRESH
    };

    const result = calculateLeadPriority(perfectLead, 1.0, false);
    expect(result.action).toBe('CONTACT_TODAY');
    expect(result.score).toBeGreaterThan(80);
    expect(result.breakdown.total).toBe(result.score);
  });

  it('should downgrade action to REVIEW_REQUIRED if negative signals exist and score is high', () => {
    const perfectLead: LeadCandidate = {
      ...baseLead,
      leadScore: 100,
      conversionProbability: 1.0,
      daysSinceContact: 14,
      estimatedDealValue: 100000,
      lastActivityAt: new Date(),
    };

    const result = calculateLeadPriority(perfectLead, 1.0, true); // true = hasNegativeSignals
    expect(result.action).toBe('REVIEW_REQUIRED');
    expect(result.risks).toContain('Negative signals detected in notes');
  });

  it('should return LOW_PRIORITY for a stale, low-score lead', () => {
    const badLead: LeadCandidate = {
      ...baseLead,
      leadScore: 10,
      conversionProbability: 0.1,
      daysSinceContact: 100, // very stale
      estimatedDealValue: 0,
      lastActivityAt: new Date(Date.now() - 100 * 86400000), // VERY_STALE
    };

    const result = calculateLeadPriority(badLead, 0.1, false);
    expect(result.action).toBe('LOW_PRIORITY');
    expect(result.score).toBeLessThan(35);
  });

  it('should accurately compute freshness and recency penalties', () => {
    const staleLead: LeadCandidate = {
      ...baseLead,
      lastActivityAt: new Date(Date.now() - 40 * 86400000), // STALE (>30 days)
    };

    const result = calculateLeadPriority(staleLead, 0.5, false);
    expect(result.freshnessLevel).toBe('STALE');
    expect(result.confidence).toBeLessThan(0.9); // Stale penalty applies
  });

  it('should rank leads by score in descending order', () => {
    const lead1 = calculateLeadPriority({ ...baseLead, leadScore: 20 }, 0.2);
    const lead2 = calculateLeadPriority({ ...baseLead, leadScore: 80 }, 0.8);
    const lead3 = calculateLeadPriority({ ...baseLead, leadScore: 50 }, 0.5);

    const ranked = rankLeads([lead1, lead2, lead3]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[1].score).toBeGreaterThan(ranked[2].score);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[2].rank).toBe(3);
  });
});
