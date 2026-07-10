#!/usr/bin/env node

/**
 * DeckHTML CLI entry point
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Command, CommanderError } from 'commander';
import { Context } from './cli/context';
import { registerAuthCommands } from './cli/commands/auth';
import { registerConfigCommands } from './cli/commands/config';
import { registerConvertCommand } from './cli/commands/convert';
import { ExitCode, outputError } from './cli/utils/errors';

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
) as { version?: string };
const CLI_VERSION = packageJson.version ?? '0.0.0';

async function main(): Promise<void> {
  const ctx = new Context();
  await ctx.init();

  const program = new Command();

  program
    .name('deckhtml')
    .description('Convert HTML to PPTX, PDF, or PNG')
    .version(CLI_VERSION, '-V, --version', 'Show version')
    .helpOption('-h, --help', 'Show help')
    .option('--json', 'Machine-readable JSON on stdout')
    .option('-v, --verbose', 'Detailed logs to stderr')
    .option('--quiet', 'Only errors and final result')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.optsWithGlobals();
      if (opts.verbose && opts.quiet) {
        ctx.fatal('usage_error', '--quiet conflicts with --verbose');
      }
      ctx.jsonOutput = Boolean(opts.json);
      ctx.verbose = Boolean(opts.verbose);
      ctx.quiet = Boolean(opts.quiet);
    });

  registerConfigCommands(program, ctx);
  registerAuthCommands(program, ctx);
  registerConvertCommand(program, ctx);

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      if (
        error.code === 'commander.help' ||
        error.code === 'commander.helpDisplayed'
      ) {
        process.exit(error.exitCode ?? 0);
      }
      if (error.code === 'commander.version') {
        process.exit(0);
      }
    }
    outputError(
      error instanceof Error ? error : new Error(String(error)),
      ctx.jsonOutput,
      'ERROR',
      { apiBase: ctx.config.apiBase }
    );
    process.exit(ExitCode.ERROR);
  }

  const args = process.argv.slice(2);
  const hasSubcommand = args[0] === 'auth' || args[0] === 'config';
  if (args.length === 0 || (!hasSubcommand && args.every((a) => a.startsWith('-')))) {
    program.help();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(ExitCode.ERROR);
});
