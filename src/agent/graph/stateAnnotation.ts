import { Annotation } from '@langchain/langgraph';
import { StoredCredentials } from '../credentials/types';
import { ComplianceViolation } from '../security/StaticSecurityScanner';
import { AgentContext, AgentResult } from '../types';
import { GraphNodeTiming } from './graphObservability';
import { DevForgeGraphMetadata, DevForgeGraphPhase } from './types';
import { getMaxFixAttempts } from './GraphConfig';

export const DevForgeGraphStateAnnotation = Annotation.Root({
  context: Annotation<AgentContext>,
  credentials: Annotation<StoredCredentials>,
  recommendationResult: Annotation<AgentResult | null>({
    reducer: (_previous, next) => next,
    default: () => null,
  }),
  securityResult: Annotation<AgentResult | null>({
    reducer: (_previous, next) => next,
    default: () => null,
  }),
  phase: Annotation<DevForgeGraphPhase>({
    reducer: (_previous, next) => next,
    default: () => 'idle',
  }),
  errors: Annotation<string[]>({
    reducer: (previous, next) => [...previous, ...next],
    default: () => [],
  }),
  metadata: Annotation<DevForgeGraphMetadata>({
    reducer: (previous, next) => ({ ...previous, ...next }),
    default: () => ({
      startedAt: new Date().toISOString(),
      graphVersion: 2,
    }),
  }),
  noAgent: Annotation<boolean>({
    reducer: (_previous, next) => next,
    default: () => false,
  }),
  fixAttempts: Annotation<number>({
    reducer: (_previous, next) => next,
    default: () => 0,
  }),
  maxFixAttempts: Annotation<number>({
    reducer: (_previous, next) => next,
    default: () => getMaxFixAttempts(),
  }),
  fixedFiles: Annotation<string[]>({
    reducer: (previous, next) => [...previous, ...next],
    default: () => [],
  }),
  violations: Annotation<ComplianceViolation[]>({
    reducer: (_previous, next) => next,
    default: () => [],
  }),
  requiresApproval: Annotation<boolean>({
    reducer: (_previous, next) => next,
    default: () => false,
  }),
  approved: Annotation<boolean>({
    reducer: (_previous, next) => next,
    default: () => false,
  }),
  autoApprove: Annotation<boolean>({
    reducer: (_previous, next) => next,
    default: () => false,
  }),
  storedRecommendationIds: Annotation<string[]>({
    reducer: (previous, next) => [...previous, ...next],
    default: () => [],
  }),
  skipReport: Annotation<boolean>({
    reducer: (_previous, next) => next,
    default: () => false,
  }),
  verbose: Annotation<boolean>({
    reducer: (_previous, next) => next,
    default: () => false,
  }),
  nodeTimings: Annotation<GraphNodeTiming[]>({
    reducer: (previous, next) => [...previous, ...next],
    default: () => [],
  }),
});

export type DevForgeGraphStateType = typeof DevForgeGraphStateAnnotation.State;
export type DevForgeGraphUpdate = typeof DevForgeGraphStateAnnotation.Update;
