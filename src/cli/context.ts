/**
 * CLI context: config, SDK client, auth, output helpers
 */

import type { DeckClient } from './types/sdk';
import { Config } from './core/config';
import {
  runCheckoutFlow,
  runLoginFlow,
  DEFAULT_PORT,
} from './core/auth';
import {
  installApiErrorCapture,
  shouldLogHttpRequests,
} from './utils/api-error';
import { ExitCode, outputError } from './utils/errors';

export class Context {
  public config: Config;
  public jsonOutput = false;
  public verbose = false;
  public quiet = false;

  private deck?: DeckClient;
  private loginPromise?: Promise<string>;
  private checkoutPromise?: Promise<void>;
  /** Session flag: treat env/config secrets as absent after a 401 downgrade. */
  private ignoreStoredCredentials = false;

  constructor() {
    this.config = new Config();
  }

  async init(): Promise<void> {
    await this.config.load();
  }

  resolveApiKey(): string | undefined {
    if (this.ignoreStoredCredentials) return undefined;
    return process.env.DECKHTML_API_KEY || this.config.get('apiKey');
  }

  hasCredentials(): boolean {
    if (this.ignoreStoredCredentials) return false;
    return Boolean(this.resolveApiKey() || this.config.get('token'));
  }

  /**
   * Treat configured token/api-key as absent after they fail auth.
   * Also drops spaceId — it belongs to the authenticated user and must not
   * be sent on guest retries.
   */
  async discardStoredCredentials(): Promise<void> {
    if (this.ignoreStoredCredentials && !this.config.isConfigured()) {
      this.deck?.setSpaceId(undefined);
      return;
    }
    this.ignoreStoredCredentials = true;
    await this.config.clearAuth();
    this.deck?.setSpaceId(undefined);
  }

  async getDeck(): Promise<DeckClient> {
    const apiKey = this.resolveApiKey();
    const token = this.ignoreStoredCredentials
      ? undefined
      : this.config.get('token');
    const hasAuth = Boolean(apiKey || token);
    // spaceId is user-scoped; never attach it for guest / discarded-auth clients.
    const spaceId = hasAuth ? this.config.get('spaceId') : undefined;

    if (!this.deck) {
      await installApiErrorCapture({
        logRequests: shouldLogHttpRequests(this.verbose),
      });
      const { createDeck } = await import('@deckflow/decktools-sdk');
      this.deck = createDeck({
        root: this.config.apiBase,
        apiKey,
        token,
        spaceId,
        onUnauthorized: async () => {
          // Expired/invalid token: drop stored secrets and fail refresh so the
          // SDK retries as guest (same as credentials never existing).
          await this.discardStoredCredentials();
          throw new Error('Stored credentials are invalid');
        },
        onPaymentRequired: async () => {
          await this.ensureCheckout();
        },
      }) as unknown as DeckClient;
    }

    return this.deck;
  }

  resetDeck(): void {
    this.deck = undefined;
  }

  async ensureLoggedIn(
    port: number = DEFAULT_PORT,
    reason: 'explicit' | 'unauthorized' | 'guest-limit' = 'unauthorized'
  ): Promise<string> {
    if (this.loginPromise) {
      return this.loginPromise;
    }

    this.loginPromise = (async () => {
      const { token, spaceId } = await runLoginFlow({
        apiBase: this.config.apiBase,
        port,
        jsonOutput: this.jsonOutput,
        reason,
      });

      this.ignoreStoredCredentials = false;
      await this.config.setToken(token);
      if (spaceId) {
        await this.config.setSpaceId(spaceId);
      }

      this.resetDeck();
      if (this.deck) {
        this.deck.setToken(token);
        this.deck.setSpaceId(this.config.get('spaceId'));
      }

      return token;
    })();

    try {
      return await this.loginPromise;
    } finally {
      this.loginPromise = undefined;
    }
  }

  async ensureCheckout(port: number = DEFAULT_PORT): Promise<void> {
    if (this.checkoutPromise) {
      return this.checkoutPromise;
    }

    this.checkoutPromise = (async () => {
      const token = this.config.get('token');
      if (!token) {
        await this.ensureLoggedIn(port, 'guest-limit');
      }

      await runCheckoutFlow({
        apiBase: this.config.apiBase,
        port,
        jsonOutput: this.jsonOutput,
        token: this.config.get('token')!,
        spaceId: this.config.get('spaceId'),
      });
    })();

    try {
      await this.checkoutPromise;
    } finally {
      this.checkoutPromise = undefined;
    }
  }

  output(data: unknown, humanFormat?: (data: unknown) => string): void {
    if (this.jsonOutput) {
      console.log(JSON.stringify(data, null, 2));
    } else if (humanFormat) {
      console.log(humanFormat(data));
    } else {
      console.log(data);
    }
  }

  error(input: unknown, code = 'ERROR', exitCode: number = ExitCode.ERROR): never {
    const err =
      input instanceof Error ? input : new Error(String(input ?? 'Unknown error'));
    outputError(err, this.jsonOutput, code, { apiBase: this.config.apiBase });
    process.exit(exitCode);
  }

  fatal(code: string, message: string): never {
    this.error(new Error(message), code, ExitCode.USAGE_ERROR);
  }
}
