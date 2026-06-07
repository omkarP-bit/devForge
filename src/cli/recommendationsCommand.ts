import chalk from 'chalk';
import { RecommendationStore, StoredRecommendation } from '../agent/RecommendationStore';
import { DevForgeFS } from '../utils/fs';

export interface RecommendationsCommandDependencies {
  fs?: DevForgeFS;
  store?: RecommendationStore;
}

export async function recommendationsListCommand(
  projectRoot: string,
  dependencies: RecommendationsCommandDependencies = {},
): Promise<void> {
  const fs = dependencies.fs ?? new DevForgeFS(projectRoot);
  const store = dependencies.store ?? new RecommendationStore(fs);
  const recommendations = await store.load();
  const summary = await store.getSummary();

  if (recommendations.length === 0) {
    console.log('');
    console.log(chalk.gray('No stored recommendations yet. Run devforge init or devforge update.'));
    console.log('');
    return;
  }

  console.log('');
  console.log(chalk.bold('DevForge Recommendations'));
  console.log(
    chalk.gray(
      `Summary: ${summary.new} new, ${summary.acted_on} acted on, ${summary.dismissed} dismissed, ${summary.critical} critical`,
    ),
  );
  console.log(chalk.gray('─'.repeat(50)));

  printStatusGroup(
    'New',
    recommendations.filter((item) => item.status === 'new'),
    formatNewItem,
  );
  printStatusGroup(
    'Acted On',
    recommendations.filter((item) => item.status === 'acted_on'),
    formatActedOnItem,
  );
  printStatusGroup(
    'Dismissed',
    recommendations.filter((item) => item.status === 'dismissed'),
    formatDismissedItem,
  );

  console.log('');
}

export async function recommendationsDismissCommand(
  projectRoot: string,
  id: string,
  dependencies: RecommendationsCommandDependencies = {},
): Promise<void> {
  const fs = dependencies.fs ?? new DevForgeFS(projectRoot);
  const store = dependencies.store ?? new RecommendationStore(fs);

  await store.dismiss(id);

  console.log('');
  console.log(chalk.green(`Dismissed recommendation ${id}`));
  console.log('');
}

function printStatusGroup(
  label: string,
  items: StoredRecommendation[],
  formatter: (item: StoredRecommendation) => string,
): void {
  if (items.length === 0) {
    return;
  }

  console.log('');
  console.log(chalk.bold(label));
  for (const item of items) {
    console.log(formatter(item));
  }
}

function formatNewItem(item: StoredRecommendation): string {
  const color = item.severity === 'critical' || item.severity === 'high' ? chalk.red : chalk.yellow;
  return color(`  [${item.severity}] ${item.title} — ${item.description} (${item.id})`);
}

function formatActedOnItem(item: StoredRecommendation): string {
  return chalk.green(`  ✓ ${item.title} — ${item.description} (${item.id})`);
}

function formatDismissedItem(item: StoredRecommendation): string {
  return chalk.gray(`  - ${item.title} — ${item.description} (${item.id})`);
}
