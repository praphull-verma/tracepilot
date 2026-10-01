import { LeadCandidate } from '../analytics';
import { calculateFreshness, freshnessToScore } from './freshness';

export type RecommendationAction =
  | 'CONTACT_TODAY'
  | 'FOLLOW_UP_SOON'
  | 'NURTURE'
  | 'MONITOR'
  | 'LOW_PRIORITY'
  | 'REVIEW_REQUIRED';

export interface ScoreBreakdown {
  leadQuality: number;
  leadQualityMax: number;
  engagement: number;
  engagementMax: number;
  dealValue: number;
  dealValueMax: number;
  urgency: number;
  urgencyMax: number;
  recency: number;
  recencyMax: number;
  total: number;
  totalMax: number;
}

export interface LeadPriorityResult {
  leadId: string;
  externalId: string;
  name: string;
  company: string;
  score: number;
  rank: number;
  action: RecommendationAction;
  breakdown: ScoreBreakdown;
  reasons: string[];
  risks: string[];
  confidence: number;
  freshnessLevel: string;
  estimatedDealValue: number | null;
}

// Scoring weights (configurable)
const WEIGHTS = {
  leadQuality: 0.30,
  engagement: 0.25,
  dealValue: 0.20,
  urgency: 0.15,
  recency: 0.10,
};

const MAX_SCORE = 100;

export function calculateLeadPriority(
  lead: LeadCandidate,
  engagementScore?: number,
  hasNegativeSignals?: boolean
): LeadPriorityResult {
  // Lead quality (0–30)
  const leadQualityRaw = Math.min(lead.leadScore, 100) / 100;
  const leadQualityConversion = lead.conversionProbability || 0;
  const leadQuality = (leadQualityRaw * 0.7 + leadQualityConversion * 0.3) * WEIGHTS.leadQuality * MAX_SCORE;

  // Engagement (0–25)
  const rawEngagement = engagementScore !== undefined ? engagementScore : 0.5;
  const engagement = rawEngagement * WEIGHTS.engagement * MAX_SCORE;

  // Deal value (0–20)
  const dealVal = lead.estimatedDealValue || 0;
  const dealNormalized = Math.min(dealVal / 100000, 1); // cap at 100k
  const dealValue = dealNormalized * WEIGHTS.dealValue * MAX_SCORE;

  // Urgency (0–15): how long since last contact (sweet spot: 14–21 days)
  const daysSince = lead.daysSinceContact;
  let urgencyScore = 0.5;
  if (daysSince !== null) {
    if (daysSince < 7) urgencyScore = 0.2; // too soon
    else if (daysSince <= 14) urgencyScore = 0.7;
    else if (daysSince <= 21) urgencyScore = 1.0; // ideal
    else if (daysSince <= 45) urgencyScore = 0.8;
    else if (daysSince <= 90) urgencyScore = 0.4;
    else urgencyScore = 0.1; // very stale
  }
  const urgency = urgencyScore * WEIGHTS.urgency * MAX_SCORE;

  // Recency signal (0–10): last activity
  const freshness = calculateFreshness(lead.lastActivityAt);
  const recency = freshnessToScore(freshness.level) * WEIGHTS.recency * MAX_SCORE;

  // Raw total
  let total = leadQuality + engagement + dealValue + urgency + recency;

  // Apply negative signal penalty
  if (hasNegativeSignals) {
    total *= 0.7;
  }

  total = Math.round(total * 10) / 10;

  // Determine action
  let action: RecommendationAction;
  if (hasNegativeSignals && total > 60) {
    action = 'REVIEW_REQUIRED';
  } else if (total >= 80) {
    action = 'CONTACT_TODAY';
  } else if (total >= 65) {
    action = 'FOLLOW_UP_SOON';
  } else if (total >= 50) {
    action = 'NURTURE';
  } else if (total >= 35) {
    action = 'MONITOR';
  } else {
    action = 'LOW_PRIORITY';
  }

  // Build reasons
  const reasons: string[] = [];
  if (lead.leadScore >= 80) reasons.push(`High lead score (${lead.leadScore})`);
  if (dealVal >= 50000) reasons.push(`High-value opportunity ($${dealVal.toLocaleString()})`);
  if (rawEngagement >= 0.7) reasons.push('Strong engagement signals');
  if (daysSince !== null && daysSince >= 14 && daysSince <= 30)
    reasons.push(`${daysSince} days since last contact — optimal follow-up window`);
  if (lead.conversionProbability && lead.conversionProbability >= 0.7)
    reasons.push(`High conversion probability (${Math.round(lead.conversionProbability * 100)}%)`);
  if (freshness.level === 'FRESH') reasons.push('Recent activity detected');

  // Build risks
  const risks: string[] = [];
  if (hasNegativeSignals) risks.push('Negative signals detected in notes');
  if (freshness.level === 'STALE' || freshness.level === 'VERY_STALE')
    risks.push(`Data is stale (${freshness.label})`);
  if (daysSince !== null && daysSince > 60)
    risks.push('Long time since last contact — may have gone cold');
  if (!lead.estimatedDealValue) risks.push('No deal value recorded');

  // Confidence
  let confidence = 0.9;
  if (hasNegativeSignals) confidence -= 0.15;
  if (freshness.level === 'STALE') confidence -= 0.1;
  if (freshness.level === 'VERY_STALE') confidence -= 0.2;
  if (!lead.email) confidence -= 0.05;
  confidence = Math.max(0.3, Math.round(confidence * 100) / 100);

  return {
    leadId: lead.id,
    externalId: lead.externalId,
    name: lead.name,
    company: lead.company,
    score: total,
    rank: 0, // set by caller
    action,
    breakdown: {
      leadQuality: Math.round(leadQuality * 10) / 10,
      leadQualityMax: WEIGHTS.leadQuality * MAX_SCORE,
      engagement: Math.round(engagement * 10) / 10,
      engagementMax: WEIGHTS.engagement * MAX_SCORE,
      dealValue: Math.round(dealValue * 10) / 10,
      dealValueMax: WEIGHTS.dealValue * MAX_SCORE,
      urgency: Math.round(urgency * 10) / 10,
      urgencyMax: WEIGHTS.urgency * MAX_SCORE,
      recency: Math.round(recency * 10) / 10,
      recencyMax: WEIGHTS.recency * MAX_SCORE,
      total,
      totalMax: MAX_SCORE,
    },
    reasons,
    risks,
    confidence,
    freshnessLevel: freshness.level,
    estimatedDealValue: lead.estimatedDealValue,
  };
}

export function rankLeads(leads: LeadPriorityResult[]): LeadPriorityResult[] {
  return leads
    .sort((a, b) => b.score - a.score)
    .map((l, idx) => ({ ...l, rank: idx + 1 }));
}
