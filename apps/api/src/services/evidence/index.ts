import { SearchResult } from '../retrieval';
import { LeadCandidate } from '../analytics';
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
  const notInterestedKeywords = ['not interested', 'no longer interested', 'pulled out', 'cancelled', 'going with competitor'];
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

  // Check for "not this quarter" signals vs high urgency
  const notThisQuarterKeywords = ['not this quarter', 'next quarter', 'budget cycle', 'next year'];
  const hasTimingIssue = notThisQuarterKeywords.some((kw) => allNoteText.includes(kw));

  if (hasTimingIssue) {
    conflicts.push({
      leadId: lead.id,
      field: 'timeline',
      structuredValue: 'Current priority',
      noteValue: 'Prospect mentioned future timeline in notes',
      severity: 'MEDIUM',
      description: 'Notes suggest the prospect is not ready to buy this quarter.',
      recommendation: 'Adjust urgency score downward; schedule follow-up for next quarter.',
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
    freshness: 'RECENT',
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
      freshness: 'RECENT',
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
        freshness: 'RECENT',
        supported: true,
      });
    });
  }

  // Last contact evidence
  if (lead.lastContactedAt) {
    const days = lead.daysSinceContact;
    evidence.push({
      id: `E-LC-${lead.id}`,
      sourceType: 'Interaction',
      sourceId: lead.externalId,
      field: 'lastContactedAt',
      value: `${days} days ago`,
      explanation: `Last contact was ${days} days ago — within optimal follow-up window`,
      freshness: days !== null && days <= 30 ? 'RECENT' : 'STALE',
      supported: true,
    });
  }

  // Note evidence
  notes.slice(0, 3).forEach((note, idx) => {
    const snippet = note.text.slice(0, 150);
    evidence.push({
      id: `E-NOTE-${note.id}-${idx}`,
      sourceType: note.sourceType,
      sourceId: note.sourceId,
      field: 'content',
      value: snippet + (note.text.length > 150 ? '...' : ''),
      explanation: `Business note with relevance score ${Math.round(note.similarity * 100)}%`,
      freshness: 'RECENT',
      supported: true,
    });
  });

  return evidence;
}

export function calculateEvidenceCoverage(
  evidence: EvidenceItem[],
  claimCount: number
): number {
  if (claimCount === 0) return 1;
  const supported = evidence.filter((e) => e.supported).length;
  return Math.min(supported / claimCount, 1);
}
