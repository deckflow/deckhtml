interface UpdateNotifierOptions {
	pkg: { name: string; version: string };
	updateCheckInterval?: number;
	shouldNotifyInNpmScript?: boolean;
	distTag?: string;
}

interface UpdateNotifierInstance {
	update?: {
		latest: string;
		current: string;
		type: string;
		name: string;
	};
	notify(options?: {
		isGlobal?: boolean;
		defer?: boolean;
		message?: string;
		boxenOptions?: Record<string, unknown>;
	}): void;
	fetchInfo(): Promise<unknown>;
}

/**
 * 检查 npm registry 上是否有比当前版本更新的版本，若有则在终端打印升级提示。
 *
 * 使用 `update-notifier`（纯 ESM 包）实现，由于本项目编译产物是 CommonJS，
 * 这里用动态 `import()` 加载它。update-notifier 内部已处理：
 * - 缓存（默认 1 天查一次，结果写入用户配置目录）
 * - CI / 非 TTY 环境静默
 * - `NO_UPDATE_NOTIFIER` 环境变量开关
 *
 * 任何异常都被静默吞掉，升级提示绝不会影响 CLI 主流程。
 */
export async function notifyUpdate(pkg: {
	name: string;
	version: string;
}): Promise<void> {
	try {
		const mod = (await import('update-notifier')) as {
			default: (options: UpdateNotifierOptions) => UpdateNotifierInstance;
		};
		const notifier = mod.default({
			pkg,
			updateCheckInterval: 1000 * 60 * 60 * 24, // 1 天
			shouldNotifyInNpmScript: false,
		});
		// deckhtml 一般以全局方式安装（bin 字段），故提示 `npm i -g`
		notifier.notify({ isGlobal: true });
	} catch {
		// ignore: 升级提示失败不应阻塞 CLI
	}
}
