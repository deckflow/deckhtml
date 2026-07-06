import { CHINESE_FONT_CORE_NAME_SET } from './chineseFonts.index';

export interface IsChineseFontOptions {
  /**
   * 是否先提取字体核心名（忽略 regular/bold/italic/常规/粗体 等后缀）。
   * @default true
   */
  stripStyleSuffix?: boolean;
}

function normalizeFontToken(s: string): string {
  return s
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .normalize('NFKC');
}

/** 去除字体名中常见样式后缀，仅保留核心家族名 */
export function extractCoreFontName(s: string): string {
  let x = normalizeFontToken(s);
  x = x.replace(/^\.+/, '');
  x = x.replace(/[_-]+/g, ' ');
  x = x
    .replace(
      /\b(regular|normal|roman|book|medium|semibold|demibold|bold|heavy|black|light|extralight|ultralight|thin|italic|oblique|condensed|narrow|extended|expanded|ui|w[1-9]00|w[1-9]|w0[1-9]|w[1-9][0-9]|[1-9]00w|std|variable|vf|extra)\b/g,
      ' '
    )
    .replace(/(常规体|常规|粗体|加粗|细体|斜体|中黑|中粗|特粗|标准体|标准|標準體|標準|变量|可变)/g, ' ')
    .replace(/(?:\s*(?:regular|normal|roman|book|medium|semibold|demibold|bold|heavy|black|light|extralight|ultralight|thin|italic|oblique|condensed|narrow|extended|expanded|ui|std|variable|vf|extra|[1-9]00w))+$/g, '')
    .replace(/(?:常规体|常规|粗体|加粗|细体|斜体|中黑|中粗|特粗|标准体|标准|標準體|標準|变量|可变)+$/g, '')
    .replace(/(?:\s+[blmhr])+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(?:\s+\d+(?:\.\d+)?)+$/g, '')
    .trim();
  return x;
}

/** 拆字体栈为单个家族名字符串 */
export function splitFontStack(fontStack: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let depth = 0;
  for (let i = 0; i < fontStack.length; i++) {
    const ch = fontStack[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      if (cur.trim()) parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/**
 * 判断给定字体名称（可为单个家族名或一整段 font-family 栈）是否属于中文字体。
 * 执行路径：提取核心名 -> Set.has（O(1)）
 */
export function isChineseFont(fontNameOrStack: string, options?: IsChineseFontOptions): boolean {
  const stripStyleSuffix = options?.stripStyleSuffix !== false;
  const tokens =
    fontNameOrStack.includes(',') ? splitFontStack(fontNameOrStack) : [fontNameOrStack];

  for (const raw of tokens) {
    const q = stripStyleSuffix ? extractCoreFontName(raw) : normalizeFontToken(raw);
    if (q.length < 2) continue;
    if (CHINESE_FONT_CORE_NAME_SET.has(q)) return true;
  }
  return false;
}

/** 返回栈中命中的核心名称，未命中返回 null。 */
export function matchChineseFontAlias(fontNameOrStack: string): string | null {
  const tokens =
    fontNameOrStack.includes(',') ? splitFontStack(fontNameOrStack) : [fontNameOrStack];

  for (const raw of tokens) {
    const q = extractCoreFontName(raw);
    if (q.length < 2) continue;
    if (CHINESE_FONT_CORE_NAME_SET.has(q)) return q;
  }
  return null;
}
