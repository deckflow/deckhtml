import { Command } from 'commander';
import { Context } from '../context';

export function registerConfigCommands(program: Command, ctx: Context): void {
  const config = program.command('config').description('Manage persistent configuration');

  config
    .command('set')
    .description('Set a configuration value')
    .argument('<key>', 'api-key | webhook | retention-hours')
    .argument('<value>', 'Configuration value')
    .action(async (key: string, value: string) => {
      try {
        switch (key) {
          case 'api-key':
            await ctx.config.setApiKey(value);
            ctx.output(
              { key, message: 'API key set successfully' },
              () => 'API key set successfully'
            );
            break;
          case 'webhook':
            await ctx.config.set('webhook', value);
            ctx.output(
              { key, value, message: 'Webhook set successfully' },
              () => `Webhook set to ${value}`
            );
            break;
          case 'retention-hours': {
            const hours = parseInt(value, 10);
            if (!Number.isFinite(hours) || hours < 0 || hours > 99) {
              throw new Error('retention-hours must be between 0 and 99');
            }
            await ctx.config.set('retentionHours', hours);
            ctx.output(
              { key, value: hours, message: 'Retention hours set successfully' },
              () => `Retention hours set to ${hours}`
            );
            break;
          }
          default:
            throw new Error(
              `Unknown config key: ${key}. Supported: api-key, webhook, retention-hours`
            );
        }
      } catch (error) {
        ctx.error(error);
      }
    });

  config
    .command('show')
    .description('Show current configuration')
    .action(() => {
      try {
        const allConfig = ctx.config.all();
        const display = { ...allConfig };
        if (display.apiKey && !ctx.jsonOutput) {
          display.apiKey = `${display.apiKey.slice(0, 8)}...`;
        }
        if (display.token && !ctx.jsonOutput) {
          display.token = `${display.token.slice(0, 8)}...`;
        }
        ctx.output(display, (data) =>
          Object.entries(data as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${v ?? '(not set)'}`)
            .join('\n')
        );
      } catch (error) {
        ctx.error(error);
      }
    });
}
