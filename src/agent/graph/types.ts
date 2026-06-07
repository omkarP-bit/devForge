import { StoredCredentials } from '../credentials/types';
import { ComplianceViolation } from '../security/StaticSecurityScanner';
import { TrivySummary } from '../security/trivyTypes';
import { AgentContext, AgentResult } from '../types';
import { GraphNodeTiming } from './graphObservability';
import { getMaxFixAttempts } from './GraphConfig';

export const DEVFORGE_GRAPH_VERSION = 2;

export type DevForgeGraphPhase =
  | 'idle'
  | 'recommend'
  | 'security'
  | 'fix'
  | 'diagnose'
  | 'complete'
  | 'skipped';

export interface DevForgeGraphMetadata {
  startedAt: string;
  graphVersion: number;
  completedAt?: string;
  projectNamespace?: string;
}

export interface DevForgeGraphState {
  context: AgentContext;
  credentials: StoredCredentials;
  recommendationResult: AgentResult | null;
  securityResult: AgentResult | null;
  phase: DevForgeGraphPhase;
  errors: string[];
  metadata: DevForgeGraphMetadata;
  noAgent: boolean;
  fixAttempts: number;
  maxFixAttempts: number;
  fixedFiles: string[];
  violations: ComplianceViolation[];
  requiresApproval: boolean;
  approved: boolean;
  autoApprove: boolean;
  storedRecommendationIds: string[];
  skipReport: boolean;
  verbose: boolean;
  nodeTimings: GraphNodeTiming[];
  trivyViolations: ComplianceViolation[];
  trivySkipped: boolean;
  trivySummary: TrivySummary | null;
}

export function createInitialGraphState(input: {
  context: AgentContext;
  credentials: StoredCredentials;
  noAgent?: boolean;
  autoApprove?: boolean;
  skipReport?: boolean;
  verbose?: boolean;
  maxFixAttempts?: number;
}): DevForgeGraphState {
  return {
    context: input.context,
    credentials: input.credentials,
    recommendationResult: null,
    securityResult: null,
    phase: 'idle',
    errors: [],
    metadata: {
      startedAt: new Date().toISOString(),
      graphVersion: DEVFORGE_GRAPH_VERSION,
    },
    noAgent: input.noAgent ?? false,
    fixAttempts: 0,
    maxFixAttempts: input.maxFixAttempts ?? getMaxFixAttempts(),
    fixedFiles: [],
    violations: [],
    requiresApproval: false,
    approved: false,
    autoApprove: input.autoApprove ?? false,
    storedRecommendationIds: [],
    skipReport: input.skipReport ?? false,
    verbose: input.verbose ?? false,
    nodeTimings: [],
    trivyViolations: [],
    trivySkipped: false,
    trivySummary: null,
  };
}
