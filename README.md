deckhtml -h --help 查看帮助
deckhtml --version 版本信息
单线程同步任务 FLAG
deckhtml -o --output <path> 输出路径 xxx.pptx 默认同名同路径
deckhtml -v --verbose 输出详细日志到 stderr FALSE
deckhtml --quiet 只输出错误和最终结果 和--verbose冲突报错 FALSE
deckhtml --json stdout 只输出机器可读 JSON FALSE
deckhtml --report 转换报告 同输出路径出报告 不生成
deckhtml --mode <mode> 执行模式 auto|local|cloud auto: 有key云端执行无key本地执行
deckhtml --render-wait <seconds> 每页等待秒 9 等待 3 秒
deckhtml --rebuild-svg svg 重建 仅云端
deckhtml --rebuild-chart 图表重建 仅云端
deckhtml --embed-fonts 嵌入字体 仅云端 不嵌入字体
deckhtml --map-motion 动画映射 仅云端
deckhtml --format <format> 输出格式 pptx|pdf|png 默认 PPTX
deckhtml --width <pixels> Playwright 视口宽度 本地默认 1280 云端不传则服务端决定
全局运行上下文 FLAG
deckhtml --webhook <url> 回调地址 仅云端 默认 config
deckhtml --retention-hours <n> 云端文件保留小时 仅云端 默认 config
环境持久配置命令
deckhtml auth login 跳转登录
deckhtml config set api-key <key> 请求使用的 API key
deckhtml config set webhook <url> 回调地址
deckhtml config set retention-hours <n> 文件保留小时 0-99 之间 99
