import { IntentDecisionV2 } from './intent-classifier.types';

export interface IntentShadowComparison {
  differs: boolean;
  differingFields: Array<'resource' | 'operation' | 'scope' | 'selectedRoute' | 'riskLevel' | 'contextProfile'>;
}

export function compareShadowDecisions(
  executed: IntentDecisionV2,
  shadow: IntentDecisionV2,
): IntentShadowComparison {
  const differingFields: IntentShadowComparison['differingFields'] = [];
  for (const field of ['resource', 'operation', 'scope', 'selectedRoute', 'riskLevel', 'contextProfile'] as const) {
    if (executed[field] !== shadow[field]) differingFields.push(field);
  }
  return { differs: differingFields.length > 0, differingFields };
}
