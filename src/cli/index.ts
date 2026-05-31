#!/usr/bin/env node

import { Command } from 'commander';
import { logger } from '../utils/logger';
import { initCommand } from './initCommand';
import { updateCommand } from './updateCommand';
import { DevForgeFS } from '../utils/fs';
import { listTransactionFiles, rollbackTransaction } from '../generator/transaction';

const program = new Command();

program
  .name('devforge')
  .description('Automated CI/CD Pipeline Generator and Deployment Automation Tool')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize a new CI/CD workflow configuration')
  .option('--dry-run', 'Simulate generation without writing files')
  .option('--force-detect', 'Skip detection cache and re-detect project')
  .option('--preview', 'Show file previews before generating')
  .action(async (options) => {
    try {
      await initCommand(process.cwd(), {
        dryRun: options.dryRun ?? false,
        forceDetect: options.forceDetect ?? false,
        preview: options.preview ?? false,
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
  .action(async (options) => {
    try {
      await updateCommand(process.cwd(), { dryRun: Boolean(options.dryRun) });
    } catch (err) {
      logger.error(String(err));
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }
  });

program
  .command('audit')
  .description('Audit generated workflows for security misconfigurations')
  .action(() => {
    auditCommand();
  });

program
  .command('preview')
  .description('Preview generated workflows before writing to disk')
  .action(() => {
    previewCommand();
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
        // choose the latest file by lexical order (timestamps in filename)
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

// updateCommand is implemented in src/cli/updateCommand.ts

function auditCommand(): void {
  logger.warn('Command not yet implemented');
}

function previewCommand(): void {
  logger.warn('Command not yet implemented');
}

// Parse command line arguments
program.parse(process.argv);
