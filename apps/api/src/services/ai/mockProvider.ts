import { LLMProvider, LLMGenerateOptions, LLMStructuredOptions } from './llmProvider';
import { logger } from '../../utils/logger';

/**
 * Deterministic mock LLM provider for demo/test mode.
 * Returns structured responses for known query patterns.
 */
export class MockLLMProvider implements LLMProvider {
  async generate(options: LLMGenerateOptions): Promise<string> {
    const userMsg = options.messages.find((m) => m.role === 'user')?.content || '';
    logger.debug('MockLLM generate', { prompt: userMsg.slice(0, 100) });
    return this.generateText(userMsg);
  }

  async generateStructured<T>(options: LLMStructuredOptions<T>): Promise<T> {
    const userMsg = options.messages.find((m) => m.role === 'user')?.content || '';
    logger.debug('MockLLM generateStructured', { prompt: userMsg.slice(0, 100) });
    const raw = this.generateStructuredRaw(userMsg);
    return options.schema.parse(raw);
  }

  async embed(text: string): Promise<number[]> {
    // Deterministic pseudo-embedding based on text hash
    return this.deterministicEmbedding(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  private deterministicEmbedding(text: string): number[] {
    const dim = 1536;
    const result: number[] = [];
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed = (seed * 31 + text.charCodeAt(i)) % 1000000007;
    }
    for (let i = 0; i < dim; i++) {
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
      result.push((seed / 0x7fffffff) * 2 - 1);
    }
    // Normalize
    const norm = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
    return result.map((v) => v / (norm || 1));
  }

  private generateText(prompt: string): string {
    const lower = prompt.toLowerCase();

    if (lower.includes('contact today') || lower.includes('priorit')) {
      return `Based on structured analytics and retrieved notes, here are the top 5 leads prioritized by TracePilot's scoring engine:

1. **NovaTech Systems** (L-10001) — Score: 91.4 — High deal value ($72,000), 18 days since contact, strong buying signal in notes.
2. **Apex Digital** (L-10003) — Score: 87.2 — High engagement, 14 days since contact, demo attended recently.
3. **CloudBridge Inc.** (L-10007) — Score: 83.5 — Active deal in negotiation, 21 days since contact.
4. **PrimeSoft Ltd.** (L-10012) — Score: 78.1 — Strong lead score, moderate engagement.
5. **TechCore Solutions** (L-10015) — Score: 74.6 — Recent activity, value opportunity.

All recommendations are based on verified evidence. Human approval required before action.`;
    }

    if (lower.includes('churn') || lower.includes('risk') || lower.includes('declining')) {
      return `Based on interaction patterns and customer signals, the following customers show declining engagement:

1. **GlobalTech Corp** — Last interaction 67 days ago, declining sentiment trend.
2. **Meridian Analytics** — 45-day gap, negative note detected.
3. **Fusion Systems** — Deal paused per recent note, structured stage mismatch.

Confidence reduced for customers with stale data (>60 days).`;
    }

    if (lower.includes('deal') || lower.includes('pipeline')) {
      return `Pipeline analysis reveals 3 high-value deals at risk:

1. **Deal D-1032** — $85,000 — Stage: Negotiation — Note indicates procurement pause.
2. **Deal D-1087** — $67,000 — Expected close 45 days overdue.
3. **Deal D-1104** — $52,000 — No activity in 38 days.

Recommend immediate review and stakeholder engagement.`;
    }

    if (lower.includes('objection')) {
      return `Most frequent objections found in business notes:

1. **Pricing concerns** — 34 mentions (past 30 days)
2. **Integration complexity** — 28 mentions
3. **Vendor comparison** — 22 mentions
4. **Budget cycle timing** — 19 mentions
5. **Security/compliance** — 15 mentions

Source: 118 business notes analyzed via semantic search.`;
    }

    return `TracePilot analyzed your business data and found relevant insights. The decision engine has processed structured and unstructured data to provide evidence-backed recommendations. Please review the evidence and approve recommended actions.`;
  }

  private generateStructuredRaw(prompt: string): unknown {
    const lower = prompt.toLowerCase();

    if (lower.includes('intent') || lower.includes('route')) {
      if (lower.includes('contact') || lower.includes('priorit') || lower.includes('leads')) {
        return {
          intent: 'LEAD_PRIORITIZATION',
          route: 'HYBRID',
          entities: ['Lead'],
          requiredTools: ['getTopLeads', 'calculateLeadPriority', 'searchNotes', 'getLeadEngagement'],
          confidence: 0.95,
        };
      }
      if (lower.includes('deal') || lower.includes('pipeline')) {
        return {
          intent: 'DEAL_ANALYSIS',
          route: 'HYBRID',
          entities: ['Deal'],
          requiredTools: ['getHighValueDeals', 'getPipelineSummary', 'searchNotes'],
          confidence: 0.9,
        };
      }
      if (lower.includes('objection') || lower.includes('note')) {
        return {
          intent: 'NOTE_ANALYSIS',
          route: 'RAG',
          entities: ['BusinessNote'],
          requiredTools: ['searchNotes'],
          confidence: 0.88,
        };
      }
      if (lower.includes('how many') || lower.includes('count') || lower.includes('statistic')) {
        return {
          intent: 'STATISTICS_QUERY',
          route: 'SQL',
          entities: ['Lead', 'Deal'],
          requiredTools: ['getLeadStatistics', 'getPipelineSummary'],
          confidence: 0.92,
        };
      }
      return {
        intent: 'GENERAL_QUERY',
        route: 'HYBRID',
        entities: ['Lead'],
        requiredTools: ['getLeadStatistics', 'searchNotes'],
        confidence: 0.75,
      };
    }

    if (lower.includes('decision') || lower.includes('recommendation')) {
      return {
        answerSummary: 'Based on evidence-backed analysis, here are the top recommendations.',
        recommendations: [
          {
            entityId: 'L-10001',
            entityName: 'NovaTech Systems',
            action: 'CONTACT_TODAY',
            score: 91.4,
            reasoning: [
              'High deal value at $72,000',
              'Strong recent engagement (last activity 2 days ago)',
              'Requested API integration pricing in notes',
              '18 days since last contact — optimal follow-up window',
            ],
            evidenceIds: ['E-001', 'E-002', 'E-003'],
            confidence: 0.94,
            warnings: [],
          },
          {
            entityId: 'L-10003',
            entityName: 'Apex Digital',
            action: 'CONTACT_TODAY',
            score: 87.2,
            reasoning: [
              'Attended product demo recently',
              'High engagement signals',
              '14 days since last contact',
            ],
            evidenceIds: ['E-004', 'E-005'],
            confidence: 0.89,
            warnings: [],
          },
          {
            entityId: 'L-10007',
            entityName: 'CloudBridge Inc.',
            action: 'FOLLOW_UP_SOON',
            score: 83.5,
            reasoning: [
              'Active deal in negotiation stage',
              '21 days since last contact',
              'Deal value: $55,000',
            ],
            evidenceIds: ['E-006', 'E-007'],
            confidence: 0.85,
            warnings: ['Note mentions procurement review in progress'],
          },
          {
            entityId: 'L-10012',
            entityName: 'PrimeSoft Ltd.',
            action: 'FOLLOW_UP_SOON',
            score: 78.1,
            reasoning: [
              'Strong lead score (84)',
              'Moderate recent engagement',
              'High conversion probability',
            ],
            evidenceIds: ['E-008'],
            confidence: 0.82,
            warnings: [],
          },
          {
            entityId: 'L-10015',
            entityName: 'TechCore Solutions',
            action: 'CONTACT_TODAY',
            score: 74.6,
            reasoning: [
              'Recent positive interaction',
              'Deal value: $38,000',
              'Interest in enterprise features noted',
            ],
            evidenceIds: ['E-009', 'E-010'],
            confidence: 0.78,
            warnings: ['Some data fields are stale (45 days)'],
          },
        ],
        evidenceCoverage: 0.94,
        conflicts: [
          {
            leadId: 'L-10007',
            description: 'Structured stage shows NEGOTIATION but note mentions procurement pause',
            severity: 'MEDIUM',
          },
        ],
      };
    }

    return {
      intent: 'GENERAL_QUERY',
      route: 'HYBRID',
      entities: [],
      requiredTools: [],
      confidence: 0.7,
    };
  }
}
