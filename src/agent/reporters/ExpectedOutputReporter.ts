import Table from 'cli-table3';
import { buildExpectedOutputsFromConfig } from '../agents/RecommendationAgent';
import { AgentResult } from '../types';
import { DevForgeConfig } from '../../types';

const TABLE_WIDTH = 46;
const CONTENT_WIDTH = TABLE_WIDTH - 4;

const BOX_CHARS = {
  top: '═',
  'top-mid': '╤',
  'top-left': '╔',
  'top-right': '╗',
  bottom: '═',
  'bottom-mid': '╧',
  'bottom-left': '╚',
  'bottom-right': '╝',
  left: '║',
  'left-mid': '╠',
  mid: '═',
  'mid-mid': '╣',
  right: '║',
  'right-mid': '╢',
  middle: '║',
};

export class ExpectedOutputReporter {
  async report(result: AgentResult, config: DevForgeConfig): Promise<void> {
    const output = renderExpectedOutputReport(result, config);
    if (output.length === 0) {
      return;
    }

    console.log('');
    console.log(output);
    console.log('');
  }
}

export function renderExpectedOutputReport(result: AgentResult, config: DevForgeConfig): string {
  const outputs = resolveExpectedOutputs(result, config);
  const sections: string[] = [renderOutputTable(outputs)];

  const criticalSection = renderCriticalRecommendations(result);
  if (criticalSection) {
    sections.push(criticalSection);
  }

  return sections.join('\n');
}

export function resolveExpectedOutputs(result: AgentResult, config: DevForgeConfig): string[] {
  if (result.expectedOutputs.length > 0) {
    return result.expectedOutputs;
  }

  return buildExpectedOutputsFromConfig(config);
}

function renderOutputTable(outputs: string[]): string {
  const table = new Table({
    chars: BOX_CHARS,
    colWidths: [CONTENT_WIDTH],
    style: {
      head: [],
      border: [],
      'padding-left': 1,
      'padding-right': 1,
    },
  });

  table.push([centerText('What your pipeline will do', CONTENT_WIDTH - 2)]);

  for (const [index, output] of outputs.entries()) {
    table.push([`${index + 1}. ${output}`]);
  }

  return table.toString();
}

function renderCriticalRecommendations(result: AgentResult): string {
  const critical = result.recommendations.filter(
    (recommendation) => recommendation.severity === 'critical',
  );

  if (critical.length === 0) {
    return '';
  }

  return critical
    .map((recommendation) => `⚠ Critical: ${recommendation.title} — ${recommendation.description}`)
    .join('\n');
}

function centerText(value: string, width: number): string {
  if (value.length >= width) {
    return value;
  }

  const totalPadding = width - value.length;
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return `${' '.repeat(leftPadding)}${value}${' '.repeat(rightPadding)}`;
}
