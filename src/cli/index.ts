#!/usr/bin/env node

import { Command } from 'commander';
import { logger } from '../utils/logger';
import { initCommand } from './initCommand';
import { updateCommand } from './updateCommand';
import { auditCommand } from './auditCommand';
import { agentResetCommand, agentStatusCommand } from './agentCommand';
import { cacheClearCommand, cacheStatsCommand } from './cacheCommand';
import {
  recommendationsDismissCommand,
  recommendationsListCommand,
} from './recommendationsCommand';
import { DevForgeFS } from '../utils/fs';
import { listTransactionFiles, rollbackTransaction } from '../generator/transaction';
import { AgentCache } from '../agent/cache/AgentCache';

const program = new Command();

void new AgentCache().prune().catch(() => undefined);

if (process.env.NODE_ENV === 'production' && !__dirname.includes('node_modules')) {
  logger.warn(
    'Package integrity check: DevForge is running outside node_modules in production. Verify the installation source.',
  );
}

program
  .name('devforge')
  .description('Automated CI/CD Pipeline Generator and Deployment Automation Tool')
  .version('1.0.0')
  .addHelpText(
    'after',
    `
Agent Commands:
  agent status     Show AI provider configuration
  agent reset      Reconfigure AI provider
  cache clear      Clear the LLM response cache
  cache stats      Show cache usage statistics
  recommendations  List stored pipeline recommendations
`,
  );

program
  .command('init')
  .description('Initialize a new CI/CD workflow configuration')
  .option('--dry-run', 'Simulate generation without writing files')
  .option('--force-detect', 'Skip detection cache and re-detect project')
  .option('--preview', 'Show file previews before generating')
  .option('--timing', 'Show per-phase timing information')
  .option('--verbose', 'Alias for --timing')
  .option('--no-agent', 'Skip agent logic and run in offline/v1 mode for this session')
  .option('--no-report', 'Skip printing the expected pipeline output report')
  .action(async (options) => {
    try {
      await initCommand(process.cwd(), {
        dryRun: options.dryRun ?? false,
        forceDetect: options.forceDetect ?? false,
        preview: options.preview ?? false,
        timing: options.timing ?? false,
        verbose: options.verbose ?? false,
        noAgent: options.agent === false,
        noReport: options.noReport ?? false,
      });
    } catch (err) {
      logger.error('\n✗ DevForge initialization failed');
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }
  });

program
  .command('update')
  .description('Update existing workflow files with latest template versions')
  .option('--dry-run', 'Show changes without applying them')
  .option('--no-report', 'Skip printing the expected pipeline output report')
  .action(async (options) => {
    try {
      await updateCommand(process.cwd(), {
        dryRun: Boolean(options.dryRun),
        noReport: options.noReport ?? false,
      });
    } catch (err) {
      logger.error(String(err));
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }
  });

program
  .command('audit')
  .description('Audit generated workflows for security misconfigurations')
  .option('--fix', 'Show auto-fix stub message')
  .action(async (options) => {
    try {
      await auditCommand(process.cwd(), { fix: Boolean(options.fix) });
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }
  });

program
  .command('preview')
  .description('Preview generated workflows before writing to disk')
  .action(() => {
    previewCommand();
  });

const agentCommand = program.command('agent').description('Manage DevForge AI provider');

agentCommand
  .command('status')
  .description('Show AI provider configuration and cache stats')
  .action(async () => {
    try {
      await agentStatusCommand();
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }
  });

agentCommand
  .command('reset')
  .description('Clear stored credentials and reconfigure the AI provider')
  .action(async () => {
    try {
      await agentResetCommand();
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }
  });

const cacheCommand = program.command('cache').description('Manage DevForge agent cache');

cacheCommand
  .command('clear')
  .description('Clear the agent LLM response cache')
  .action(async () => {
    try {
      await cacheClearCommand();
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }
  });

cacheCommand
  .command('stats')
  .description('Show cache usage statistics')
  .action(async () => {
    try {
      await cacheStatsCommand();
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }
  });

const recommendationsCommand = program
  .command('recommendations')
  .description('List and manage stored pipeline recommendations')
  .action(async () => {
    try {
      await recommendationsListCommand(process.cwd());
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }
  });

recommendationsCommand
  .command('dismiss <id>')
  .description('Dismiss a stored recommendation by id')
  .action(async (id: string) => {
    try {
      await recommendationsDismissCommand(process.cwd(), id);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }
  });

program
  .command('rollback')
  .description('Rollback a previous generation transaction')
  .option('--tx <file>', 'Path to transaction file (relative to project root)')
  .option('--dry-run', 'Do not modify disk; show what would be done')
  .action(async (options) => {
    const dry = Boolean(options.dryRun || options.dryrun || options['dry-run']);
    const devfs = new DevForgeFS(process.cwd(), dry);
    try {
      let txPath = options.tx as string | undefined;
      if (!txPath) {
        const files = await listTransactionFiles(devfs);
        if (!files || files.length === 0) {
          logger.info('No transaction files found under .devforge/transactions');
          return;
        }
        txPath = files.sort().pop();
      }

      if (!txPath) {
        logger.info('No transaction selected');
        return;
      }

      const messages = await rollbackTransaction(devfs, txPath);
      messages.forEach((m) => logger.info(m));
      if (dry) logger.info('Rollback dry-run complete (no disk changes made)');
      else logger.success('Rollback completed');
    } catch (err) {
      logger.error(`Rollback failed: ${String(err)}`);
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }
  });

function previewCommand(): void {
  logger.warn('Command not yet implemented');
}

program.parse(process.argv);
