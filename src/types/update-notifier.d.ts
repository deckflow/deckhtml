declare module 'update-notifier' {
	export interface UpdateNotifierOptions {
		pkg: { name: string; version: string };
		updateCheckInterval?: number;
		shouldNotifyInNpmScript?: boolean;
		distTag?: string;
	}

	export interface UpdateInfo {
		latest: string;
		current: string;
		type: 'latest' | 'major' | 'minor' | 'patch' | 'prerelease' | 'build';
		name: string;
	}

	export interface UpdateNotifier {
		update?: UpdateInfo;
		notify(options?: {
			isGlobal?: boolean;
			defer?: boolean;
			message?: string;
			boxenOptions?: Record<string, unknown>;
		}): void;
		fetchInfo(): Promise<UpdateInfo>;
	}

	function updateNotifier(options: UpdateNotifierOptions): UpdateNotifier;

	export default updateNotifier;
}
