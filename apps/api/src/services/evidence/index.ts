import { SearchResult } from '../retrieval';
import { LeadCandidate } from '../analytics';
import { calculateFreshness } from '../decision/freshness';
import { logger } from '../../utils/logger';

export interface ConflictDetection {
  leadId?: string;
  field: string;
  structuredValue: string;
  noteValue: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  recommendation: string;
}

export function detectConflicts(
  lead: LeadCandidate,
  notes: SearchResult[]
): ConflictDetection[] {
  const conflicts: ConflictDetection[] = [];
  const noteTexts = notes.map((n) => n.text.toLowerCase());
  const allNoteText = noteTexts.join(' ');

  // Check for deal pause signals vs active stage
  const pauseKeywords = ['paused', 'on hold', 'delayed', 'postponed', 'not moving forward'];
  const hasPauseSignal = pauseKeywords.some((kw) => allNoteText.includes(kw));

  if (hasPauseSignal && lead.status === 'ACTIVE') {
    conflicts.push({
      leadId: lead.id,
      field: 'status',
      structuredValue: 'ACTIVE',
      noteValue: 'Deal paused/on hold mentioned in notes',
      severity: 'HIGH',
      description: 'Lead is marked ACTIVE but notes indicate the deal is paused or on hold.',
      recommendation: 'Human review required to verify current deal status.',
    });
  }

  // Check for "not interested" signals
  const notInterestedKeywords = ['not interested', 'no longer interested', 'pulled out', 'cancelled', 'going with competitor', 'went with competitor'];
  const hasNotInterested = notInterestedKeywords.some((kw) => allNoteText.includes(kw));

  if (hasNotInterested && lead.status === 'ACTIVE') {
    conflicts.push({
      leadId: lead.id,
      field: 'status',
      structuredValue: 'ACTIVE',
      noteValue: 'Disinterest or cancellation signal in notes',
      severity: 'HIGH',
      description: 'Notes suggest the prospect is no longer interested but lead is still ACTIVE.',
      recommendation: 'Update lead status and review recommendation.',
    });
  }

  // Check for timing issue: "not this quarter" vs high urgency
  const notThisQuarterKeywords = ['not this quarter', 'next quarter', 'budget cycle', 'next year', 'budget freeze'];
  const hasTimingIssue = notThisQuarterKeywords.some((kw) => allNoteText.includes(kw));

  if (hasTimingIssue) {
    conflicts.push({
      leadId: lead.id,
      field: 'timeline',
      structuredValue: 'Current priority',
      noteValue: 'Prospect mentioned future timeline in notes',
      severity: 'MEDIUM',
      description: 'Notes suggest the prospect is not ready to buy this quarter.',
      recommendation: 'Adjust urgency score; schedule follow-up for next quarter.',
    });
  }

  // Phase 4: structured data vs notes cross-check
  // Detect NEGOTIATION/PROPOSAL stage leads with pause/freeze notes
  // (lead data doesn't carry stage, but we can infer from notes vs leadScore/status)
  if (hasPauseSignal && (lead.leadScore > 70)) {
    const existing = conflicts.find((c) => c.field === 'status' && c.severity === 'HIGH');
    if (!existing) {
      conflicts.push({
        leadId: lead.id,
        field: 'leadScore',
        structuredValue: `High score (${lead.leadScore})`,
        noteValue: 'Pause/hold signal in notes contradicts high score',
        severity: 'HIGH',
        description: `High lead score (${lead.leadScore}) conflicts with pause/hold signal in notes.`,
        recommendation: 'Verify current deal status before acting on the high score.',
      });
    }
  }

  // Positive interaction sentiment + competitor-gone note = conflict
  const competitorKeywords = ['went with competitor', 'chose competitor', 'selected another vendor'];
  const hasCompetitorLoss = competitorKeywords.some((kw) => allNoteText.includes(kw));

  if (hasCompetitorLoss && lead.status === 'ACTIVE') {
    conflicts.push({
      leadId: lead.id,
      field: 'status',
      structuredValue: 'ACTIVE',
      noteValue: 'Customer chose a competitor',
      severity: 'HIGH',
      description: 'Notes indicate customer went with a competitor but lead remains ACTIVE.',
      recommendation: 'Close this lead as LOST and analyze for win/loss learning.',
    });
  }

  logger.debug('Conflict detection', { leadId: lead.id, conflicts: conflicts.length });
  return conflicts;
}

export interface EvidenceItem {
  id: string;
  sourceType: string;
  sourceId: string;
  field: string;
  value: string;
  explanation: string;
  freshness: string;
  supported: boolean;
}

export function buildEvidence(
  lead: LeadCandidate,
  notes: SearchResult[],
  deals?: Array<{ id: string; value: number; stage: string; externalId: string }>
): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];

  // Lead score evidence
  evidence.push({
    id: `E-LS-${lead.id}`,
    sourceType: 'Lead',
    sourceId: lead.externalId,
    field: 'leadScore',
    value: String(lead.leadScore),
    explanation: `Lead quality score: ${lead.leadScore}/100`,
    // Derive freshness from lastActivityAt, not hardcoded
    freshness: calculateFreshness(lead.lastActivityAt).level,
    supported: true,
  });

  // Deal value evidence
  if (lead.estimatedDealValue) {
    evidence.push({
      id: `E-DV-${lead.id}`,
      sourceType: 'Lead',
      sourceId: lead.externalId,
      field: 'estimatedDealValue',
      value: `$${lead.estimatedDealValue.toLocaleString()}`,
      explanation: `Estimated deal value: $${lead.estimatedDealValue.toLocaleString()}`,
      freshness: calculateFreshness(lead.lastActivityAt).level,
      supported: true,
    });
  }

  // Deal records
  if (deals && deals.length > 0) {
    deals.forEach((deal) => {
      evidence.push({
        id: `E-DEAL-${deal.id}`,
        sourceType: 'Deal',
        sourceId: deal.externalId,
        field: 'dealValue',
        value: `$${deal.value.toLocaleString()} (${deal.stage})`,
        explanation: `Active deal in ${deal.stage} stage with value $${deal.value.toLocaleString()}`,
        // Deal freshness reflects when we last saw the deal update (approximated by activity)
        freshness: calculateFreshness(lead.lastActivityAt).level,
        supported: true,
      });
    });
  }

  // Last contact evidence — real days, not generic phrase
  if (lead.lastContactedAt) {
    const days = lead.daysSinceContact;
    const freshness = calculateFreshness(lead.lastContactedAt);
    const daysLabel = days !== null ? `${days} days ago` : 'unknown';
    evidence.push({
      id: `E-LC-${lead.id}`,
      sourceType: 'Interaction',
      sourceId: lead.externalId,
      field: 'lastContactedAt',
      value: daysLabel,
      // Real days count in explanation, not "within optimal window" for everyone
      explanation: `Last contact: ${daysLabel} (${freshness.label})`,
      freshness: freshness.level,
      supported: true,
    });
  }

  // Note evidence with actual snippet
  notes.slice(0, 3).forEach((note, idx) => {
    const snippet = note.text.slice(0, 150);
    evidence.push({
      id: `E-NOTE-${note.id}-${idx}`,
      sourceType: note.sourceType,
      sourceId: note.sourceId,
      field: 'content',
      value: snippet + (note.text.length > 150 ? '...' : ''),
      explanation: `Business note with relevance score ${Math.round(note.similarity * 100)}%`,
      // Notes derive freshness from their own createdAt via metadata if available
      freshness: calculateFreshness(note.createdAt).level,
      supported: true,
    });
  });

  return evidence;
}

/**
 * calculateEvidenceCoverage — share of cited evidence IDs that map to real evidence.
 * Formula: valid_cited_ids / total_cited_ids (or 1 if no claims cited).
 */
export function calculateEvidenceCoverage(
  citedIds: string[],
  availableIds: Set<string>
): number {
  if (citedIds.length === 0) return 1;
  const validCount = citedIds.filter((id) => availableIds.has(id)).length;
  return Math.min(validCount / citedIds.length, 1);
}
