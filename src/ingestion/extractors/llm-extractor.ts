import { z } from 'zod';

import { chunkDocument } from '../chunk.js';
import {
  candidateProposalSchema,
  type CandidateExtractor,
  type CandidateProposal,
  type LlmCandidateProvider,
  type NormalizedSourceDocument,
} from '../types.js';

const responseSchema = z.array(candidateProposalSchema);

export const LLM_EXTRACTION_INSTRUCTIONS = `Extract only benchmark results explicitly supported by the supplied source content.
Do not use outside knowledge. Do not infer missing dates or convert a publication date into an evaluation date.
Do not invent benchmark versions, evaluation settings, evaluator identity, provider model identifiers, or infer canonical Model Identifiers. Preserve score display text exactly.
Keep reported date separate from evaluation date. A source publication date is not an evaluation date.
Every candidate must include concise source evidence and its location. Return no candidate when evidence is insufficient.`;

/**
 * Provider-neutral boundary. Implementations must instruct their model to use
 * only supplied source evidence, leave unknown dates null, preserve score text,
 * avoid canonical-ID inference, and return no result when evidence is weak.
 */
export function createLlmExtractor(
  provider: LlmCandidateProvider,
): CandidateExtractor {
  return {
    name: 'llm-assisted',
    async extract(
      document: NormalizedSourceDocument,
    ): Promise<CandidateProposal[]> {
      const results: CandidateProposal[] = [];
      for (const chunk of chunkDocument(document)) {
        const untrusted = await provider.extractCandidates(
          chunk,
          LLM_EXTRACTION_INSTRUCTIONS,
        );
        results.push(...responseSchema.parse(untrusted));
      }
      return results;
    },
  };
}
