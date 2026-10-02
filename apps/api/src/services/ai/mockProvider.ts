import { LLMProvider, LLMGenerateOptions, LLMStructuredOptions, EmbeddingTaskType } from './llmProvider';
import { logger } from '../../utils/logger';

/**
 * Deterministic mock LLM provider for offline/test mode.
 * Classifies based on question text keywords, not on prompt structure keywords.
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async embed(text: string, _taskType?: EmbeddingTaskType): Promise<number[]> {
    // Deterministic pseudo-embedding so cosine search still works offline
    return this.deterministicEmbedding(text);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async embedBatch(texts: string[], _taskType?: EmbeddingTaskType): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  private deterministicEmbedding(text: string): number[] {
    // 768 dimensions to match gemini-embedding-001 default
    const dim = 768;
    const result: number[] = [];
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed = (seed * 31 + text.charCodeAt(i)) % 1000000007;
    }
    for (let i = 0; i < dim; i++) {
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
      result.push((seed / 0x7fffffff) * 2 - 1);
    }
    // Normalize to unit vector for cosine similarity
    const norm = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
    return result.map((v) => v / (norm || 1));
  }

  // Classify intent from the question text, not from the structural prompt wrapper
  private detectIntent(question: string): string {
    const q = question.toLowerCase();
    if (q.includes('how many') || q.includes('count') || q.includes('total') || q.includes('pipeline value') || q.includes('statistic')) {
      return 'STATISTICS_QUERY';
    }
    if (q.includes('objection') || q.includes('what are customers saying') || q.includes('mention') || q.includes('note') || q.includes('say')) {
      return 'NOTE_ANALYSIS';
    }
    if (q.includes('churn') || q.includes('declining') || q.includes('at-risk customer') || q.includes('customer risk')) {
      return 'CUSTOMER_RISK';
    }
    if (q.includes('deal') || q.includes('pipeline') || q.includes('opportunities')) {
      return 'DEAL_ANALYSIS';
    }
    if (q.includes('hello') || q.includes('hi ') || q.includes('who are you') || q.includes('what is')) {
      return 'GENERAL_QUERY';
    }
    if (q.includes('lead') || q.includes('contact') || q.includes('priorit') || q.includes('buying signal') || q.includes('engagement')) {
      return 'LEAD_PRIORITIZATION';
    }
    return 'LEAD_PRIORITIZATION';
  }

  private generateText(prompt: string): string {
    const intent = this.detectIntent(prompt);
    switch (intent) {
      case 'LEAD_PRIORITIZATION':
        return 'Based on deterministic scoring, here are the top leads prioritized by score, engagement, and deal value. All recommendations require human approval.';
      case 'DEAL_ANALYSIS':
        return 'Pipeline analysis reveals deals across multiple stages. Overdue and stale deals are flagged for review.';
      case 'CUSTOMER_RISK':
        return 'Customers with no interactions in 60+ days show declining engagement signals. Review recommended.';
      case 'NOTE_ANALYSIS':
        return 'Business notes analysis reveals common themes including pricing objections, integration concerns, and vendor comparisons.';
      case 'STATISTICS_QUERY':
        return 'Statistical summary computed from the database. See the numbers above for exact counts and values.';
      default:
        return 'TracePilot analyzed your question using business data. Please ask a specific sales or pipeline question for evidence-backed recommendations.';
    }
  }

  private generateStructuredRaw(prompt: string): unknown {
    const intent = this.detectIntent(prompt);

    // Intent detection response
    if (this.isIntentRequest(prompt)) {
      const routeMap: Record<string, string> = {
        STATISTICS_QUERY: 'SQL',
        NOTE_ANALYSIS: 'RAG',
        CUSTOMER_RISK: 'HYBRID',
        DEAL_ANALYSIS: 'HYBRID',
        GENERAL_QUERY: 'RAG',
        LEAD_PRIORITIZATION: 'HYBRID',
      };
      const toolsMap: Record<string, string[]> = {
        STATISTICS_QUERY: ['getLeadStatistics', 'getPipelineSummary', 'getConversionStatistics'],
        NOTE_ANALYSIS: ['searchNotes'],
        CUSTOMER_RISK: ['getCustomerRiskSignals', 'searchNotes'],
        DEAL_ANALYSIS: ['getHighValueDeals', 'getPipelineSummary', 'searchNotes'],
        GENERAL_QUERY: [],
        LEAD_PRIORITIZATION: ['getTopLeads', 'calculateLeadPriority', 'searchNotes'],
      };
      return {
        intent,
        route: routeMap[intent] || 'HYBRID',
        entities: intent === 'NOTE_ANALYSIS' ? ['BusinessNote'] : intent === 'CUSTOMER_RISK' ? ['Customer'] : intent === 'DEAL_ANALYSIS' ? ['Deal'] : ['Lead'],
        requiredTools: toolsMap[intent] || [],
        confidence: 0.85,
        reasoning: `Detected ${intent} based on question keywords`,
      };
    }

    // Decision response — derive from candidates in the prompt rather than hardcoding
    if (this.isDecisionRequest(prompt)) {
      // Extract candidate IDs from the JSON blob in the prompt if present
      const candidateMatch = prompt.match(/"id"\s*:\s*"([^"]+)"/g);
      const candidateIds = candidateMatch
        ? candidateMatch.slice(0, 5).map((m) => m.replace(/"id"\s*:\s*"/, '').replace('"', ''))
        : ['L-10001', 'L-10003', 'L-10007'];

      return {
        answerSummary:
          'Based on deterministic scoring, here are the top priorities. Evidence is grounded in lead scores, deal values, and engagement signals. Human approval required before any action.',
        recommendations: candidateIds.slice(0, 3).map((id, idx) => ({
          entityId: id,
          entityName: `Lead ${id}`,
          action: idx === 0 ? 'CONTACT_TODAY' : idx === 1 ? 'CONTACT_TODAY' : 'FOLLOW_UP_SOON',
          score: 80 - idx * 5,
          reasoning: [
            'High lead score with strong engagement signals',
            'Deal value in active pipeline',
            'Optimal follow-up timing window',
          ],
          evidenceIds: [`E-LS-${id}`, `E-DV-${id}`],
          confidence: 0.85 - idx * 0.03,
          warnings: [],
        })),
        evidenceCoverage: 0.82,
        conflicts: [],
      };
    }

    // Default fallback
    return {
      intent: 'GENERAL_QUERY',
      route: 'HYBRID',
      entities: [],
      requiredTools: [],
      confidence: 0.7,
      reasoning: 'Default fallback',
    };
  }

  // Detect if the prompt is asking for intent classification
  private isIntentRequest(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    // Intent requests contain the question wrapped in quotes, not deal/lead data
    return lower.includes('analyze this business question') || lower.includes('business question:');
  }

  // Detect if the prompt is asking for recommendations
  private isDecisionRequest(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    return lower.includes('scored candidates') || lower.includes('generate evidence-backed recommendations') || lower.includes('recommendation');
  }
}
