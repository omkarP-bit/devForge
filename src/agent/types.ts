import { DevForgeConfig } from '../types';
import { LastRunMetadata } from '../generator';

export type LastRunJson = LastRunMetadata;

export interface FailureSignal {
  type: 'missing_script' | 'node_version_mismatch' | 'missing_dependency' | 'invalid_secret_ref';
  severity: 'warning' | 'error';
  message: string;
  affectedFile: string;
}

export interface AgentContext {
  config: DevForgeConfig;
  generatedFiles: string[];
  lastRunJson: LastRunJson | null;
  failureSignals: FailureSignal[];
}

export interface AgentOutputMessage {
  type: 'info' | 'success' | 'warn' | 'error';
  text: string;
}

export interface Recommendation {
  type: 'update' | 'security' | 'optimization';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  autoFixAvailable: boolean;
}

export interface AgentWarning {
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
}

export interface AgentResult {
  agentName: string;
  success: boolean;
  messages: AgentOutputMessage[];
  expectedOutputs: string[];
  recommendations: Recommendation[];
  warnings: AgentWarning[];
}
