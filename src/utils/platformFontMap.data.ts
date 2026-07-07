/**
 * AUTO-GENERATED in html2pptx — synced copy; do not edit by hand.
 * Source of truth: html2pptx/docs/css_generic_font_os_map_simplified.csv
 */
import type { GenericFontName, PlatformFontLang, PlatformTarget } from './platformFontMap';

export interface PlatformFontMappingEntry {
  primary: string;
  fallbacks: string[];
}

export type PlatformFontOsMap = Record<
  PlatformTarget,
  Record<PlatformFontLang, Record<GenericFontName, PlatformFontMappingEntry>>
>;

export const GENERIC_FONT_OS_MAP: PlatformFontOsMap = {
  "win": {
    "latin": {
      "serif": {
        "primary": "Times New Roman",
        "fallbacks": [
          "Cambria",
          "Georgia"
        ]
      },
      "sans-serif": {
        "primary": "Arial",
        "fallbacks": [
          "Segoe UI",
          "Calibri"
        ]
      },
      "monospace": {
        "primary": "Consolas",
        "fallbacks": [
          "Cascadia Mono",
          "Courier New"
        ]
      },
      "cursive": {
        "primary": "Segoe Script",
        "fallbacks": [
          "Comic Sans MS",
          "Brush Script MT"
        ]
      },
      "fantasy": {
        "primary": "Impact",
        "fallbacks": [
          "Papyrus",
          "Harrington"
        ]
      },
      "system-ui": {
        "primary": "Segoe UI Variable",
        "fallbacks": [
          "Segoe UI"
        ]
      },
      "ui-serif": {
        "primary": "Cambria",
        "fallbacks": [
          "Georgia",
          "Times New Roman"
        ]
      },
      "ui-sans-serif": {
        "primary": "Segoe UI Variable",
        "fallbacks": [
          "Segoe UI",
          "Arial"
        ]
      },
      "ui-monospace": {
        "primary": "Consolas",
        "fallbacks": [
          "Cascadia Mono",
          "Courier New"
        ]
      },
      "math": {
        "primary": "Cambria Math",
        "fallbacks": [
          "Segoe UI Symbol",
          "STIX Two Math"
        ]
      }
    },
    "sc": {
      "serif": {
        "primary": "SimSun",
        "fallbacks": [
          "NSimSun",
          "DengXian"
        ]
      },
      "sans-serif": {
        "primary": "Microsoft YaHei",
        "fallbacks": [
          "DengXian",
          "SimHei"
        ]
      },
      "monospace": {
        "primary": "NSimSun",
        "fallbacks": [
          "SimSun",
          "Consolas"
        ]
      },
      "cursive": {
        "primary": "KaiTi",
        "fallbacks": [
          "FangSong",
          "Microsoft YaHei"
        ]
      },
      "fantasy": {
        "primary": "Microsoft YaHei UI",
        "fallbacks": [
          "DengXian",
          "SimHei"
        ]
      },
      "system-ui": {
        "primary": "Microsoft YaHei UI",
        "fallbacks": [
          "Microsoft YaHei",
          "Segoe UI"
        ]
      },
      "ui-serif": {
        "primary": "SimSun",
        "fallbacks": [
          "NSimSun",
          "Microsoft YaHei"
        ]
      },
      "ui-sans-serif": {
        "primary": "Microsoft YaHei UI",
        "fallbacks": [
          "Microsoft YaHei",
          "DengXian"
        ]
      },
      "ui-monospace": {
        "primary": "NSimSun",
        "fallbacks": [
          "SimSun",
          "Consolas"
        ]
      },
      "math": {
        "primary": "Cambria Math",
        "fallbacks": [
          "Microsoft YaHei",
          "Segoe UI Symbol"
        ]
      }
    },
    "tc": {
      "serif": {
        "primary": "PMingLiU",
        "fallbacks": [
          "MingLiU",
          "Microsoft JhengHei"
        ]
      },
      "sans-serif": {
        "primary": "Microsoft JhengHei",
        "fallbacks": [
          "Microsoft JhengHei UI",
          "MingLiU"
        ]
      },
      "monospace": {
        "primary": "MingLiU",
        "fallbacks": [
          "PMingLiU",
          "Consolas"
        ]
      },
      "cursive": {
        "primary": "DFKai-SB",
        "fallbacks": [
          "Microsoft JhengHei",
          "PMingLiU"
        ]
      },
      "fantasy": {
        "primary": "Microsoft JhengHei UI",
        "fallbacks": [
          "Microsoft JhengHei",
          "MingLiU"
        ]
      },
      "system-ui": {
        "primary": "Microsoft JhengHei UI",
        "fallbacks": [
          "Microsoft JhengHei",
          "Segoe UI"
        ]
      },
      "ui-serif": {
        "primary": "PMingLiU",
        "fallbacks": [
          "MingLiU",
          "Microsoft JhengHei"
        ]
      },
      "ui-sans-serif": {
        "primary": "Microsoft JhengHei UI",
        "fallbacks": [
          "Microsoft JhengHei",
          "MingLiU"
        ]
      },
      "ui-monospace": {
        "primary": "MingLiU",
        "fallbacks": [
          "PMingLiU",
          "Consolas"
        ]
      },
      "math": {
        "primary": "Cambria Math",
        "fallbacks": [
          "Microsoft JhengHei",
          "Segoe UI Symbol"
        ]
      }
    },
    "jp": {
      "serif": {
        "primary": "Yu Mincho",
        "fallbacks": [
          "MS Mincho",
          "Meiryo"
        ]
      },
      "sans-serif": {
        "primary": "Yu Gothic",
        "fallbacks": [
          "Meiryo",
          "MS Gothic"
        ]
      },
      "monospace": {
        "primary": "MS Gothic",
        "fallbacks": [
          "Yu Gothic",
          "Consolas"
        ]
      },
      "cursive": {
        "primary": "Yu Mincho",
        "fallbacks": [
          "Meiryo",
          "MS Mincho"
        ]
      },
      "fantasy": {
        "primary": "Yu Gothic",
        "fallbacks": [
          "Meiryo",
          "MS Gothic"
        ]
      },
      "system-ui": {
        "primary": "Yu Gothic UI",
        "fallbacks": [
          "Yu Gothic",
          "Meiryo"
        ]
      },
      "ui-serif": {
        "primary": "Yu Mincho",
        "fallbacks": [
          "MS Mincho",
          "Meiryo"
        ]
      },
      "ui-sans-serif": {
        "primary": "Yu Gothic UI",
        "fallbacks": [
          "Yu Gothic",
          "Meiryo"
        ]
      },
      "ui-monospace": {
        "primary": "MS Gothic",
        "fallbacks": [
          "Yu Gothic",
          "Consolas"
        ]
      },
      "math": {
        "primary": "Cambria Math",
        "fallbacks": [
          "Yu Gothic",
          "Segoe UI Symbol"
        ]
      }
    },
    "kr": {
      "serif": {
        "primary": "Batang",
        "fallbacks": [
          "Malgun Gothic",
          "Gulim"
        ]
      },
      "sans-serif": {
        "primary": "Malgun Gothic",
        "fallbacks": [
          "Gulim",
          "Dotum"
        ]
      },
      "monospace": {
        "primary": "GulimChe",
        "fallbacks": [
          "DotumChe",
          "Consolas"
        ]
      },
      "cursive": {
        "primary": "Batang",
        "fallbacks": [
          "Malgun Gothic",
          "Gulim"
        ]
      },
      "fantasy": {
        "primary": "Malgun Gothic",
        "fallbacks": [
          "Gulim",
          "Dotum"
        ]
      },
      "system-ui": {
        "primary": "Malgun Gothic",
        "fallbacks": [
          "Segoe UI",
          "Gulim"
        ]
      },
      "ui-serif": {
        "primary": "Batang",
        "fallbacks": [
          "Malgun Gothic",
          "Gulim"
        ]
      },
      "ui-sans-serif": {
        "primary": "Malgun Gothic",
        "fallbacks": [
          "Gulim",
          "Dotum"
        ]
      },
      "ui-monospace": {
        "primary": "GulimChe",
        "fallbacks": [
          "DotumChe",
          "Consolas"
        ]
      },
      "math": {
        "primary": "Cambria Math",
        "fallbacks": [
          "Malgun Gothic",
          "Segoe UI Symbol"
        ]
      }
    },
    "ar": {
      "serif": {
        "primary": "Times New Roman",
        "fallbacks": [
          "Arabic Typesetting",
          "Traditional Arabic"
        ]
      },
      "sans-serif": {
        "primary": "Arial",
        "fallbacks": [
          "Segoe UI",
          "Tahoma"
        ]
      },
      "monospace": {
        "primary": "Courier New",
        "fallbacks": [
          "Arial",
          "Segoe UI"
        ]
      },
      "cursive": {
        "primary": "Arabic Typesetting",
        "fallbacks": [
          "Traditional Arabic",
          "Arial"
        ]
      },
      "fantasy": {
        "primary": "Arial",
        "fallbacks": [
          "Segoe UI",
          "Tahoma"
        ]
      },
      "system-ui": {
        "primary": "Segoe UI",
        "fallbacks": [
          "Arial",
          "Tahoma"
        ]
      },
      "ui-serif": {
        "primary": "Times New Roman",
        "fallbacks": [
          "Arabic Typesetting",
          "Traditional Arabic"
        ]
      },
      "ui-sans-serif": {
        "primary": "Segoe UI",
        "fallbacks": [
          "Arial",
          "Tahoma"
        ]
      },
      "ui-monospace": {
        "primary": "Courier New",
        "fallbacks": [
          "Consolas",
          "Arial"
        ]
      },
      "math": {
        "primary": "Cambria Math",
        "fallbacks": [
          "Segoe UI Symbol",
          "Arial"
        ]
      }
    },
    "he": {
      "serif": {
        "primary": "Times New Roman",
        "fallbacks": [
          "David",
          "FrankRuehl"
        ]
      },
      "sans-serif": {
        "primary": "Arial",
        "fallbacks": [
          "Segoe UI",
          "Tahoma"
        ]
      },
      "monospace": {
        "primary": "Courier New",
        "fallbacks": [
          "Miriam Fixed",
          "Arial"
        ]
      },
      "cursive": {
        "primary": "Arial",
        "fallbacks": [
          "Segoe UI",
          "Tahoma"
        ]
      },
      "fantasy": {
        "primary": "Arial",
        "fallbacks": [
          "Segoe UI",
          "Tahoma"
        ]
      },
      "system-ui": {
        "primary": "Segoe UI",
        "fallbacks": [
          "Arial",
          "Tahoma"
        ]
      },
      "ui-serif": {
        "primary": "Times New Roman",
        "fallbacks": [
          "David",
          "FrankRuehl"
        ]
      },
      "ui-sans-serif": {
        "primary": "Segoe UI",
        "fallbacks": [
          "Arial",
          "Tahoma"
        ]
      },
      "ui-monospace": {
        "primary": "Courier New",
        "fallbacks": [
          "Miriam Fixed",
          "Arial"
        ]
      },
      "math": {
        "primary": "Cambria Math",
        "fallbacks": [
          "Segoe UI Symbol",
          "Arial"
        ]
      }
    }
  },
  "mac": {
    "latin": {
      "serif": {
        "primary": "Times New Roman",
        "fallbacks": [
          "Georgia",
          "Times"
        ]
      },
      "sans-serif": {
        "primary": "Helvetica",
        "fallbacks": [
          "Arial",
          "SF Pro"
        ]
      },
      "monospace": {
        "primary": "Menlo",
        "fallbacks": [
          "Monaco",
          "Courier New"
        ]
      },
      "cursive": {
        "primary": "Apple Chancery",
        "fallbacks": [
          "Snell Roundhand",
          "Bradley Hand"
        ]
      },
      "fantasy": {
        "primary": "Papyrus",
        "fallbacks": [
          "Chalkboard",
          "Copperplate"
        ]
      },
      "system-ui": {
        "primary": "SF Pro",
        "fallbacks": [
          "Helvetica Neue",
          "Helvetica"
        ]
      },
      "ui-serif": {
        "primary": "New York",
        "fallbacks": [
          "Georgia",
          "Times New Roman"
        ]
      },
      "ui-sans-serif": {
        "primary": "SF Pro",
        "fallbacks": [
          "Helvetica Neue",
          "Helvetica"
        ]
      },
      "ui-monospace": {
        "primary": "SF Mono",
        "fallbacks": [
          "Menlo",
          "Monaco"
        ]
      },
      "math": {
        "primary": "STIX Two Math",
        "fallbacks": [
          "STIXGeneral",
          "Apple Symbols"
        ]
      }
    },
    "sc": {
      "serif": {
        "primary": "Songti SC",
        "fallbacks": [
          "STSong",
          "PingFang SC"
        ]
      },
      "sans-serif": {
        "primary": "PingFang SC",
        "fallbacks": [
          "Hiragino Sans GB",
          "Heiti SC"
        ]
      },
      "monospace": {
        "primary": "PingFang SC",
        "fallbacks": [
          "Menlo",
          "Hiragino Sans GB"
        ]
      },
      "cursive": {
        "primary": "Kaiti SC",
        "fallbacks": [
          "Hannotate SC",
          "PingFang SC"
        ]
      },
      "fantasy": {
        "primary": "Wawati SC",
        "fallbacks": [
          "PingFang SC",
          "Hiragino Sans GB"
        ]
      },
      "system-ui": {
        "primary": "PingFang SC",
        "fallbacks": [
          "SF Pro",
          "Hiragino Sans GB"
        ]
      },
      "ui-serif": {
        "primary": "Songti SC",
        "fallbacks": [
          "STSong",
          "PingFang SC"
        ]
      },
      "ui-sans-serif": {
        "primary": "PingFang SC",
        "fallbacks": [
          "Hiragino Sans GB",
          "Heiti SC"
        ]
      },
      "ui-monospace": {
        "primary": "PingFang SC",
        "fallbacks": [
          "Menlo",
          "SF Mono"
        ]
      },
      "math": {
        "primary": "STIX Two Math",
        "fallbacks": [
          "PingFang SC",
          "Apple Symbols"
        ]
      }
    },
    "tc": {
      "serif": {
        "primary": "Songti TC",
        "fallbacks": [
          "Apple LiSung",
          "PingFang TC"
        ]
      },
      "sans-serif": {
        "primary": "PingFang TC",
        "fallbacks": [
          "Heiti TC",
          "Hiragino Sans TC"
        ]
      },
      "monospace": {
        "primary": "PingFang TC",
        "fallbacks": [
          "Menlo",
          "Heiti TC"
        ]
      },
      "cursive": {
        "primary": "Kaiti TC",
        "fallbacks": [
          "Hannotate TC",
          "PingFang TC"
        ]
      },
      "fantasy": {
        "primary": "Wawati TC",
        "fallbacks": [
          "PingFang TC",
          "Heiti TC"
        ]
      },
      "system-ui": {
        "primary": "PingFang TC",
        "fallbacks": [
          "SF Pro",
          "Heiti TC"
        ]
      },
      "ui-serif": {
        "primary": "Songti TC",
        "fallbacks": [
          "Apple LiSung",
          "PingFang TC"
        ]
      },
      "ui-sans-serif": {
        "primary": "PingFang TC",
        "fallbacks": [
          "Heiti TC",
          "Hiragino Sans TC"
        ]
      },
      "ui-monospace": {
        "primary": "PingFang TC",
        "fallbacks": [
          "Menlo",
          "SF Mono"
        ]
      },
      "math": {
        "primary": "STIX Two Math",
        "fallbacks": [
          "PingFang TC",
          "Apple Symbols"
        ]
      }
    },
    "jp": {
      "serif": {
        "primary": "Hiragino Mincho ProN",
        "fallbacks": [
          "Yu Mincho",
          "Hiragino Sans"
        ]
      },
      "sans-serif": {
        "primary": "Hiragino Sans",
        "fallbacks": [
          "Yu Gothic",
          "Osaka"
        ]
      },
      "monospace": {
        "primary": "Osaka-Mono",
        "fallbacks": [
          "Menlo",
          "Hiragino Sans"
        ]
      },
      "cursive": {
        "primary": "Hiragino Maru Gothic ProN",
        "fallbacks": [
          "Hiragino Sans",
          "Yu Gothic"
        ]
      },
      "fantasy": {
        "primary": "Hiragino Maru Gothic ProN",
        "fallbacks": [
          "Hiragino Sans",
          "Osaka"
        ]
      },
      "system-ui": {
        "primary": "Hiragino Sans",
        "fallbacks": [
          "SF Pro",
          "Yu Gothic"
        ]
      },
      "ui-serif": {
        "primary": "Hiragino Mincho ProN",
        "fallbacks": [
          "Yu Mincho",
          "Hiragino Sans"
        ]
      },
      "ui-sans-serif": {
        "primary": "Hiragino Sans",
        "fallbacks": [
          "Yu Gothic",
          "Osaka"
        ]
      },
      "ui-monospace": {
        "primary": "Osaka-Mono",
        "fallbacks": [
          "Menlo",
          "SF Mono"
        ]
      },
      "math": {
        "primary": "STIX Two Math",
        "fallbacks": [
          "Hiragino Sans",
          "Apple Symbols"
        ]
      }
    },
    "kr": {
      "serif": {
        "primary": "AppleMyungjo",
        "fallbacks": [
          "Apple SD Gothic Neo",
          "Nanum Myeongjo"
        ]
      },
      "sans-serif": {
        "primary": "Apple SD Gothic Neo",
        "fallbacks": [
          "AppleGothic",
          "Nanum Gothic"
        ]
      },
      "monospace": {
        "primary": "Apple SD Gothic Neo",
        "fallbacks": [
          "Menlo",
          "SF Mono"
        ]
      },
      "cursive": {
        "primary": "Apple SD Gothic Neo",
        "fallbacks": [
          "AppleGothic",
          "Nanum Gothic"
        ]
      },
      "fantasy": {
        "primary": "Apple SD Gothic Neo",
        "fallbacks": [
          "AppleGothic",
          "Nanum Gothic"
        ]
      },
      "system-ui": {
        "primary": "Apple SD Gothic Neo",
        "fallbacks": [
          "SF Pro",
          "AppleGothic"
        ]
      },
      "ui-serif": {
        "primary": "AppleMyungjo",
        "fallbacks": [
          "Apple SD Gothic Neo",
          "Nanum Myeongjo"
        ]
      },
      "ui-sans-serif": {
        "primary": "Apple SD Gothic Neo",
        "fallbacks": [
          "AppleGothic",
          "Nanum Gothic"
        ]
      },
      "ui-monospace": {
        "primary": "Apple SD Gothic Neo",
        "fallbacks": [
          "Menlo",
          "SF Mono"
        ]
      },
      "math": {
        "primary": "STIX Two Math",
        "fallbacks": [
          "Apple SD Gothic Neo",
          "Apple Symbols"
        ]
      }
    },
    "ar": {
      "serif": {
        "primary": "Geeza Pro",
        "fallbacks": [
          "Al Bayan",
          "Times New Roman"
        ]
      },
      "sans-serif": {
        "primary": "SF Arabic",
        "fallbacks": [
          "Geeza Pro",
          "Arial"
        ]
      },
      "monospace": {
        "primary": "SF Mono",
        "fallbacks": [
          "Menlo",
          "Geeza Pro"
        ]
      },
      "cursive": {
        "primary": "Al Bayan",
        "fallbacks": [
          "Baghdad",
          "Geeza Pro"
        ]
      },
      "fantasy": {
        "primary": "Baghdad",
        "fallbacks": [
          "Geeza Pro",
          "Al Bayan"
        ]
      },
      "system-ui": {
        "primary": "SF Arabic",
        "fallbacks": [
          "Geeza Pro",
          "SF Pro"
        ]
      },
      "ui-serif": {
        "primary": "Geeza Pro",
        "fallbacks": [
          "Al Bayan",
          "Times New Roman"
        ]
      },
      "ui-sans-serif": {
        "primary": "SF Arabic",
        "fallbacks": [
          "Geeza Pro",
          "Arial"
        ]
      },
      "ui-monospace": {
        "primary": "SF Mono",
        "fallbacks": [
          "Menlo",
          "Geeza Pro"
        ]
      },
      "math": {
        "primary": "STIX Two Math",
        "fallbacks": [
          "Geeza Pro",
          "Apple Symbols"
        ]
      }
    },
    "he": {
      "serif": {
        "primary": "New Peninim MT",
        "fallbacks": [
          "Times New Roman",
          "Arial Hebrew"
        ]
      },
      "sans-serif": {
        "primary": "Arial Hebrew",
        "fallbacks": [
          "Helvetica",
          "SF Pro"
        ]
      },
      "monospace": {
        "primary": "Menlo",
        "fallbacks": [
          "SF Mono",
          "Arial Hebrew"
        ]
      },
      "cursive": {
        "primary": "Arial Hebrew",
        "fallbacks": [
          "New Peninim MT",
          "Helvetica"
        ]
      },
      "fantasy": {
        "primary": "Arial Hebrew",
        "fallbacks": [
          "Helvetica",
          "SF Pro"
        ]
      },
      "system-ui": {
        "primary": "Arial Hebrew",
        "fallbacks": [
          "SF Pro",
          "Helvetica"
        ]
      },
      "ui-serif": {
        "primary": "New Peninim MT",
        "fallbacks": [
          "Times New Roman",
          "Arial Hebrew"
        ]
      },
      "ui-sans-serif": {
        "primary": "Arial Hebrew",
        "fallbacks": [
          "SF Pro",
          "Helvetica"
        ]
      },
      "ui-monospace": {
        "primary": "Menlo",
        "fallbacks": [
          "SF Mono",
          "Arial Hebrew"
        ]
      },
      "math": {
        "primary": "STIX Two Math",
        "fallbacks": [
          "Arial Hebrew",
          "Apple Symbols"
        ]
      }
    }
  },
  "ios": {
    "latin": {
      "serif": {
        "primary": "Times New Roman",
        "fallbacks": [
          "Georgia",
          "Times"
        ]
      },
      "sans-serif": {
        "primary": "Helvetica Neue",
        "fallbacks": [
          "Helvetica",
          "SF Pro"
        ]
      },
      "monospace": {
        "primary": "Menlo",
        "fallbacks": [
          "Courier New",
          "SF Mono"
        ]
      },
      "cursive": {
        "primary": "Snell Roundhand",
        "fallbacks": [
          "Marker Felt",
          "Noteworthy"
        ]
      },
      "fantasy": {
        "primary": "Papyrus",
        "fallbacks": [
          "Chalkboard SE",
          "Copperplate"
        ]
      },
      "system-ui": {
        "primary": "SF Pro",
        "fallbacks": [
          "Helvetica Neue",
          "Helvetica"
        ]
      },
      "ui-serif": {
        "primary": "New York",
        "fallbacks": [
          "Georgia",
          "Times New Roman"
        ]
      },
      "ui-sans-serif": {
        "primary": "SF Pro",
        "fallbacks": [
          "Helvetica Neue",
          "Helvetica"
        ]
      },
      "ui-monospace": {
        "primary": "SF Mono",
        "fallbacks": [
          "Menlo",
          "Courier New"
        ]
      },
      "math": {
        "primary": "STIX Two Math",
        "fallbacks": [
          "Times New Roman",
          "Apple Symbols"
        ]
      }
    },
    "sc": {
      "serif": {
        "primary": "Songti SC",
        "fallbacks": [
          "STSong",
          "PingFang SC"
        ]
      },
      "sans-serif": {
        "primary": "PingFang SC",
        "fallbacks": [
          "Hiragino Sans GB",
          "Heiti SC"
        ]
      },
      "monospace": {
        "primary": "PingFang SC",
        "fallbacks": [
          "Menlo",
          "SF Mono"
        ]
      },
      "cursive": {
        "primary": "Kaiti SC",
        "fallbacks": [
          "Hannotate SC",
          "PingFang SC"
        ]
      },
      "fantasy": {
        "primary": "Wawati SC",
        "fallbacks": [
          "PingFang SC",
          "Hiragino Sans GB"
        ]
      },
      "system-ui": {
        "primary": "PingFang SC",
        "fallbacks": [
          "SF Pro",
          "Hiragino Sans GB"
        ]
      },
      "ui-serif": {
        "primary": "Songti SC",
        "fallbacks": [
          "STSong",
          "PingFang SC"
        ]
      },
      "ui-sans-serif": {
        "primary": "PingFang SC",
        "fallbacks": [
          "Hiragino Sans GB",
          "Heiti SC"
        ]
      },
      "ui-monospace": {
        "primary": "PingFang SC",
        "fallbacks": [
          "SF Mono",
          "Menlo"
        ]
      },
      "math": {
        "primary": "STIX Two Math",
        "fallbacks": [
          "PingFang SC",
          "Apple Symbols"
        ]
      }
    },
    "tc": {
      "serif": {
        "primary": "Songti TC",
        "fallbacks": [
          "Apple LiSung",
          "PingFang TC"
        ]
      },
      "sans-serif": {
        "primary": "PingFang TC",
        "fallbacks": [
          "Heiti TC",
          "Hiragino Sans TC"
        ]
      },
      "monospace": {
        "primary": "PingFang TC",
        "fallbacks": [
          "Menlo",
          "SF Mono"
        ]
      },
      "cursive": {
        "primary": "Kaiti TC",
        "fallbacks": [
          "Hannotate TC",
          "PingFang TC"
        ]
      },
      "fantasy": {
        "primary": "Wawati TC",
        "fallbacks": [
          "PingFang TC",
          "Heiti TC"
        ]
      },
      "system-ui": {
        "primary": "PingFang TC",
        "fallbacks": [
          "SF Pro",
          "Heiti TC"
        ]
      },
      "ui-serif": {
        "primary": "Songti TC",
        "fallbacks": [
          "Apple LiSung",
          "PingFang TC"
        ]
      },
      "ui-sans-serif": {
        "primary": "PingFang TC",
        "fallbacks": [
          "Heiti TC",
          "Hiragino Sans TC"
        ]
      },
      "ui-monospace": {
        "primary": "PingFang TC",
        "fallbacks": [
          "SF Mono",
          "Menlo"
        ]
      },
      "math": {
        "primary": "STIX Two Math",
        "fallbacks": [
          "PingFang TC",
          "Apple Symbols"
        ]
      }
    },
    "jp": {
      "serif": {
        "primary": "Hiragino Mincho ProN",
        "fallbacks": [
          "Yu Mincho",
          "Hiragino Sans"
        ]
      },
      "sans-serif": {
        "primary": "Hiragino Sans",
        "fallbacks": [
          "Yu Gothic",
          "Osaka"
        ]
      },
      "monospace": {
        "primary": "Hiragino Sans",
        "fallbacks": [
          "Menlo",
          "SF Mono"
        ]
      },
      "cursive": {
        "primary": "Hiragino Maru Gothic ProN",
        "fallbacks": [
          "Hiragino Sans",
          "Yu Gothic"
        ]
      },
      "fantasy": {
        "primary": "Hiragino Maru Gothic ProN",
        "fallbacks": [
          "Hiragino Sans",
          "Osaka"
        ]
      },
      "system-ui": {
        "primary": "Hiragino Sans",
        "fallbacks": [
          "SF Pro",
          "Yu Gothic"
        ]
      },
      "ui-serif": {
        "primary": "Hiragino Mincho ProN",
        "fallbacks": [
          "Yu Mincho",
          "Hiragino Sans"
        ]
      },
      "ui-sans-serif": {
        "primary": "Hiragino Sans",
        "fallbacks": [
          "Yu Gothic",
          "Osaka"
        ]
      },
      "ui-monospace": {
        "primary": "Hiragino Sans",
        "fallbacks": [
          "SF Mono",
          "Menlo"
        ]
      },
      "math": {
        "primary": "STIX Two Math",
        "fallbacks": [
          "Hiragino Sans",
          "Apple Symbols"
        ]
      }
    },
    "kr": {
      "serif": {
        "primary": "AppleMyungjo",
        "fallbacks": [
          "Apple SD Gothic Neo",
          "Nanum Myeongjo"
        ]
      },
      "sans-serif": {
        "primary": "Apple SD Gothic Neo",
        "fallbacks": [
          "AppleGothic",
          "Nanum Gothic"
        ]
      },
      "monospace": {
        "primary": "Apple SD Gothic Neo",
        "fallbacks": [
          "SF Mono",
          "Menlo"
        ]
      },
      "cursive": {
        "primary": "Apple SD Gothic Neo",
        "fallbacks": [
          "AppleGothic",
          "Nanum Gothic"
        ]
      },
      "fantasy": {
        "primary": "Apple SD Gothic Neo",
        "fallbacks": [
          "AppleGothic",
          "Nanum Gothic"
        ]
      },
      "system-ui": {
        "primary": "Apple SD Gothic Neo",
        "fallbacks": [
          "SF Pro",
          "AppleGothic"
        ]
      },
      "ui-serif": {
        "primary": "AppleMyungjo",
        "fallbacks": [
          "Apple SD Gothic Neo",
          "Nanum Myeongjo"
        ]
      },
      "ui-sans-serif": {
        "primary": "Apple SD Gothic Neo",
        "fallbacks": [
          "AppleGothic",
          "Nanum Gothic"
        ]
      },
      "ui-monospace": {
        "primary": "Apple SD Gothic Neo",
        "fallbacks": [
          "SF Mono",
          "Menlo"
        ]
      },
      "math": {
        "primary": "STIX Two Math",
        "fallbacks": [
          "Apple SD Gothic Neo",
          "Apple Symbols"
        ]
      }
    },
    "ar": {
      "serif": {
        "primary": "Geeza Pro",
        "fallbacks": [
          "Al Bayan",
          "Times New Roman"
        ]
      },
      "sans-serif": {
        "primary": "SF Arabic",
        "fallbacks": [
          "Geeza Pro",
          "Arial"
        ]
      },
      "monospace": {
        "primary": "SF Mono",
        "fallbacks": [
          "Menlo",
          "Geeza Pro"
        ]
      },
      "cursive": {
        "primary": "Al Bayan",
        "fallbacks": [
          "Baghdad",
          "Geeza Pro"
        ]
      },
      "fantasy": {
        "primary": "Baghdad",
        "fallbacks": [
          "Geeza Pro",
          "Al Bayan"
        ]
      },
      "system-ui": {
        "primary": "SF Arabic",
        "fallbacks": [
          "Geeza Pro",
          "SF Pro"
        ]
      },
      "ui-serif": {
        "primary": "Geeza Pro",
        "fallbacks": [
          "Al Bayan",
          "Times New Roman"
        ]
      },
      "ui-sans-serif": {
        "primary": "SF Arabic",
        "fallbacks": [
          "Geeza Pro",
          "Arial"
        ]
      },
      "ui-monospace": {
        "primary": "SF Mono",
        "fallbacks": [
          "Menlo",
          "Geeza Pro"
        ]
      },
      "math": {
        "primary": "STIX Two Math",
        "fallbacks": [
          "Geeza Pro",
          "Apple Symbols"
        ]
      }
    },
    "he": {
      "serif": {
        "primary": "New Peninim MT",
        "fallbacks": [
          "Times New Roman",
          "Arial Hebrew"
        ]
      },
      "sans-serif": {
        "primary": "Arial Hebrew",
        "fallbacks": [
          "Helvetica Neue",
          "SF Pro"
        ]
      },
      "monospace": {
        "primary": "Menlo",
        "fallbacks": [
          "SF Mono",
          "Arial Hebrew"
        ]
      },
      "cursive": {
        "primary": "Arial Hebrew",
        "fallbacks": [
          "New Peninim MT",
          "Helvetica Neue"
        ]
      },
      "fantasy": {
        "primary": "Arial Hebrew",
        "fallbacks": [
          "Helvetica Neue",
          "SF Pro"
        ]
      },
      "system-ui": {
        "primary": "Arial Hebrew",
        "fallbacks": [
          "SF Pro",
          "Helvetica Neue"
        ]
      },
      "ui-serif": {
        "primary": "New Peninim MT",
        "fallbacks": [
          "Times New Roman",
          "Arial Hebrew"
        ]
      },
      "ui-sans-serif": {
        "primary": "Arial Hebrew",
        "fallbacks": [
          "SF Pro",
          "Helvetica Neue"
        ]
      },
      "ui-monospace": {
        "primary": "Menlo",
        "fallbacks": [
          "SF Mono",
          "Arial Hebrew"
        ]
      },
      "math": {
        "primary": "STIX Two Math",
        "fallbacks": [
          "Arial Hebrew",
          "Apple Symbols"
        ]
      }
    }
  },
  "android": {
    "latin": {
      "serif": {
        "primary": "Noto Serif",
        "fallbacks": [
          "Droid Serif",
          "Roboto"
        ]
      },
      "sans-serif": {
        "primary": "Roboto",
        "fallbacks": [
          "Noto Sans",
          "Droid Sans"
        ]
      },
      "monospace": {
        "primary": "Droid Sans Mono",
        "fallbacks": [
          "Roboto Mono",
          "Noto Sans Mono"
        ]
      },
      "cursive": {
        "primary": "Dancing Script",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "fantasy": {
        "primary": "Roboto",
        "fallbacks": [
          "Noto Sans",
          "Droid Sans"
        ]
      },
      "system-ui": {
        "primary": "Roboto",
        "fallbacks": [
          "Noto Sans",
          "Droid Sans"
        ]
      },
      "ui-serif": {
        "primary": "Noto Serif",
        "fallbacks": [
          "Droid Serif",
          "Roboto"
        ]
      },
      "ui-sans-serif": {
        "primary": "Roboto",
        "fallbacks": [
          "Noto Sans",
          "Droid Sans"
        ]
      },
      "ui-monospace": {
        "primary": "Droid Sans Mono",
        "fallbacks": [
          "Roboto Mono",
          "Noto Sans Mono"
        ]
      },
      "math": {
        "primary": "Noto Sans Math",
        "fallbacks": [
          "Noto Sans Symbols",
          "Roboto"
        ]
      }
    },
    "sc": {
      "serif": {
        "primary": "Noto Serif CJK SC",
        "fallbacks": [
          "Noto Sans CJK SC",
          "Noto Serif"
        ]
      },
      "sans-serif": {
        "primary": "Noto Sans CJK SC",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "monospace": {
        "primary": "Noto Sans CJK SC",
        "fallbacks": [
          "Droid Sans Mono",
          "Roboto Mono"
        ]
      },
      "cursive": {
        "primary": "Noto Sans CJK SC",
        "fallbacks": [
          "Noto Serif CJK SC",
          "Roboto"
        ]
      },
      "fantasy": {
        "primary": "Noto Sans CJK SC",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "system-ui": {
        "primary": "Noto Sans CJK SC",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "ui-serif": {
        "primary": "Noto Serif CJK SC",
        "fallbacks": [
          "Noto Sans CJK SC",
          "Noto Serif"
        ]
      },
      "ui-sans-serif": {
        "primary": "Noto Sans CJK SC",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "ui-monospace": {
        "primary": "Noto Sans CJK SC",
        "fallbacks": [
          "Droid Sans Mono",
          "Roboto Mono"
        ]
      },
      "math": {
        "primary": "Noto Sans Math",
        "fallbacks": [
          "Noto Sans CJK SC",
          "Noto Sans Symbols"
        ]
      }
    },
    "tc": {
      "serif": {
        "primary": "Noto Serif CJK TC",
        "fallbacks": [
          "Noto Sans CJK TC",
          "Noto Serif"
        ]
      },
      "sans-serif": {
        "primary": "Noto Sans CJK TC",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "monospace": {
        "primary": "Noto Sans CJK TC",
        "fallbacks": [
          "Droid Sans Mono",
          "Roboto Mono"
        ]
      },
      "cursive": {
        "primary": "Noto Sans CJK TC",
        "fallbacks": [
          "Noto Serif CJK TC",
          "Roboto"
        ]
      },
      "fantasy": {
        "primary": "Noto Sans CJK TC",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "system-ui": {
        "primary": "Noto Sans CJK TC",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "ui-serif": {
        "primary": "Noto Serif CJK TC",
        "fallbacks": [
          "Noto Sans CJK TC",
          "Noto Serif"
        ]
      },
      "ui-sans-serif": {
        "primary": "Noto Sans CJK TC",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "ui-monospace": {
        "primary": "Noto Sans CJK TC",
        "fallbacks": [
          "Droid Sans Mono",
          "Roboto Mono"
        ]
      },
      "math": {
        "primary": "Noto Sans Math",
        "fallbacks": [
          "Noto Sans CJK TC",
          "Noto Sans Symbols"
        ]
      }
    },
    "jp": {
      "serif": {
        "primary": "Noto Serif CJK JP",
        "fallbacks": [
          "Noto Sans CJK JP",
          "Noto Serif"
        ]
      },
      "sans-serif": {
        "primary": "Noto Sans CJK JP",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "monospace": {
        "primary": "Noto Sans CJK JP",
        "fallbacks": [
          "Droid Sans Mono",
          "Roboto Mono"
        ]
      },
      "cursive": {
        "primary": "Noto Sans CJK JP",
        "fallbacks": [
          "Noto Serif CJK JP",
          "Roboto"
        ]
      },
      "fantasy": {
        "primary": "Noto Sans CJK JP",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "system-ui": {
        "primary": "Noto Sans CJK JP",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "ui-serif": {
        "primary": "Noto Serif CJK JP",
        "fallbacks": [
          "Noto Sans CJK JP",
          "Noto Serif"
        ]
      },
      "ui-sans-serif": {
        "primary": "Noto Sans CJK JP",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "ui-monospace": {
        "primary": "Noto Sans CJK JP",
        "fallbacks": [
          "Droid Sans Mono",
          "Roboto Mono"
        ]
      },
      "math": {
        "primary": "Noto Sans Math",
        "fallbacks": [
          "Noto Sans CJK JP",
          "Noto Sans Symbols"
        ]
      }
    },
    "kr": {
      "serif": {
        "primary": "Noto Serif CJK KR",
        "fallbacks": [
          "Noto Sans CJK KR",
          "Noto Serif"
        ]
      },
      "sans-serif": {
        "primary": "Noto Sans CJK KR",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "monospace": {
        "primary": "Noto Sans CJK KR",
        "fallbacks": [
          "Droid Sans Mono",
          "Roboto Mono"
        ]
      },
      "cursive": {
        "primary": "Noto Sans CJK KR",
        "fallbacks": [
          "Noto Serif CJK KR",
          "Roboto"
        ]
      },
      "fantasy": {
        "primary": "Noto Sans CJK KR",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "system-ui": {
        "primary": "Noto Sans CJK KR",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "ui-serif": {
        "primary": "Noto Serif CJK KR",
        "fallbacks": [
          "Noto Sans CJK KR",
          "Noto Serif"
        ]
      },
      "ui-sans-serif": {
        "primary": "Noto Sans CJK KR",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "ui-monospace": {
        "primary": "Noto Sans CJK KR",
        "fallbacks": [
          "Droid Sans Mono",
          "Roboto Mono"
        ]
      },
      "math": {
        "primary": "Noto Sans Math",
        "fallbacks": [
          "Noto Sans CJK KR",
          "Noto Sans Symbols"
        ]
      }
    },
    "ar": {
      "serif": {
        "primary": "Noto Naskh Arabic",
        "fallbacks": [
          "Noto Serif",
          "Roboto"
        ]
      },
      "sans-serif": {
        "primary": "Noto Sans Arabic",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "monospace": {
        "primary": "Noto Sans Arabic",
        "fallbacks": [
          "Droid Sans Mono",
          "Roboto"
        ]
      },
      "cursive": {
        "primary": "Noto Nastaliq Urdu",
        "fallbacks": [
          "Noto Naskh Arabic",
          "Noto Sans Arabic"
        ]
      },
      "fantasy": {
        "primary": "Noto Sans Arabic",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "system-ui": {
        "primary": "Noto Sans Arabic",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "ui-serif": {
        "primary": "Noto Naskh Arabic",
        "fallbacks": [
          "Noto Serif",
          "Roboto"
        ]
      },
      "ui-sans-serif": {
        "primary": "Noto Sans Arabic",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "ui-monospace": {
        "primary": "Noto Sans Arabic",
        "fallbacks": [
          "Droid Sans Mono",
          "Roboto"
        ]
      },
      "math": {
        "primary": "Noto Sans Math",
        "fallbacks": [
          "Noto Sans Arabic",
          "Noto Sans Symbols"
        ]
      }
    },
    "he": {
      "serif": {
        "primary": "Noto Serif Hebrew",
        "fallbacks": [
          "Noto Sans Hebrew",
          "Noto Serif"
        ]
      },
      "sans-serif": {
        "primary": "Noto Sans Hebrew",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "monospace": {
        "primary": "Noto Sans Hebrew",
        "fallbacks": [
          "Droid Sans Mono",
          "Roboto"
        ]
      },
      "cursive": {
        "primary": "Noto Sans Hebrew",
        "fallbacks": [
          "Noto Serif Hebrew",
          "Roboto"
        ]
      },
      "fantasy": {
        "primary": "Noto Sans Hebrew",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "system-ui": {
        "primary": "Noto Sans Hebrew",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "ui-serif": {
        "primary": "Noto Serif Hebrew",
        "fallbacks": [
          "Noto Sans Hebrew",
          "Noto Serif"
        ]
      },
      "ui-sans-serif": {
        "primary": "Noto Sans Hebrew",
        "fallbacks": [
          "Roboto",
          "Noto Sans"
        ]
      },
      "ui-monospace": {
        "primary": "Noto Sans Hebrew",
        "fallbacks": [
          "Droid Sans Mono",
          "Roboto"
        ]
      },
      "math": {
        "primary": "Noto Sans Math",
        "fallbacks": [
          "Noto Sans Hebrew",
          "Noto Sans Symbols"
        ]
      }
    }
  },
  "linux": {
    "latin": {
      "serif": {
        "primary": "Noto Serif",
        "fallbacks": [
          "DejaVu Serif",
          "Liberation Serif"
        ]
      },
      "sans-serif": {
        "primary": "Noto Sans",
        "fallbacks": [
          "DejaVu Sans",
          "Liberation Sans"
        ]
      },
      "monospace": {
        "primary": "Noto Sans Mono",
        "fallbacks": [
          "DejaVu Sans Mono",
          "Liberation Mono"
        ]
      },
      "cursive": {
        "primary": "Noto Sans",
        "fallbacks": [
          "Comic Neue",
          "DejaVu Sans"
        ]
      },
      "fantasy": {
        "primary": "Noto Sans",
        "fallbacks": [
          "Impact",
          "DejaVu Sans"
        ]
      },
      "system-ui": {
        "primary": "Noto Sans",
        "fallbacks": [
          "Ubuntu Sans",
          "Adwaita Sans"
        ]
      },
      "ui-serif": {
        "primary": "Noto Serif",
        "fallbacks": [
          "DejaVu Serif",
          "Liberation Serif"
        ]
      },
      "ui-sans-serif": {
        "primary": "Noto Sans",
        "fallbacks": [
          "Ubuntu Sans",
          "Adwaita Sans"
        ]
      },
      "ui-monospace": {
        "primary": "Noto Sans Mono",
        "fallbacks": [
          "Ubuntu Sans Mono",
          "DejaVu Sans Mono"
        ]
      },
      "math": {
        "primary": "Noto Sans Math",
        "fallbacks": [
          "STIX Two Math",
          "DejaVu Math TeX Gyre"
        ]
      }
    },
    "sc": {
      "serif": {
        "primary": "Noto Serif CJK SC",
        "fallbacks": [
          "Source Han Serif SC",
          "AR PL UMing CN"
        ]
      },
      "sans-serif": {
        "primary": "Noto Sans CJK SC",
        "fallbacks": [
          "Source Han Sans SC",
          "WenQuanYi Micro Hei"
        ]
      },
      "monospace": {
        "primary": "Noto Sans Mono CJK SC",
        "fallbacks": [
          "Noto Sans CJK SC",
          "DejaVu Sans Mono"
        ]
      },
      "cursive": {
        "primary": "Noto Serif CJK SC",
        "fallbacks": [
          "AR PL UKai CN",
          "Noto Sans CJK SC"
        ]
      },
      "fantasy": {
        "primary": "Noto Sans CJK SC",
        "fallbacks": [
          "WenQuanYi Micro Hei",
          "Noto Sans"
        ]
      },
      "system-ui": {
        "primary": "Noto Sans CJK SC",
        "fallbacks": [
          "Noto Sans",
          "Ubuntu Sans"
        ]
      },
      "ui-serif": {
        "primary": "Noto Serif CJK SC",
        "fallbacks": [
          "Source Han Serif SC",
          "Noto Serif"
        ]
      },
      "ui-sans-serif": {
        "primary": "Noto Sans CJK SC",
        "fallbacks": [
          "Source Han Sans SC",
          "Noto Sans"
        ]
      },
      "ui-monospace": {
        "primary": "Noto Sans Mono CJK SC",
        "fallbacks": [
          "Noto Sans CJK SC",
          "DejaVu Sans Mono"
        ]
      },
      "math": {
        "primary": "Noto Sans Math",
        "fallbacks": [
          "Noto Sans CJK SC",
          "STIX Two Math"
        ]
      }
    },
    "tc": {
      "serif": {
        "primary": "Noto Serif CJK TC",
        "fallbacks": [
          "Source Han Serif TC",
          "AR PL UMing TW"
        ]
      },
      "sans-serif": {
        "primary": "Noto Sans CJK TC",
        "fallbacks": [
          "Source Han Sans TC",
          "WenQuanYi Micro Hei"
        ]
      },
      "monospace": {
        "primary": "Noto Sans Mono CJK TC",
        "fallbacks": [
          "Noto Sans CJK TC",
          "DejaVu Sans Mono"
        ]
      },
      "cursive": {
        "primary": "Noto Serif CJK TC",
        "fallbacks": [
          "AR PL UKai TW",
          "Noto Sans CJK TC"
        ]
      },
      "fantasy": {
        "primary": "Noto Sans CJK TC",
        "fallbacks": [
          "WenQuanYi Micro Hei",
          "Noto Sans"
        ]
      },
      "system-ui": {
        "primary": "Noto Sans CJK TC",
        "fallbacks": [
          "Noto Sans",
          "Ubuntu Sans"
        ]
      },
      "ui-serif": {
        "primary": "Noto Serif CJK TC",
        "fallbacks": [
          "Source Han Serif TC",
          "Noto Serif"
        ]
      },
      "ui-sans-serif": {
        "primary": "Noto Sans CJK TC",
        "fallbacks": [
          "Source Han Sans TC",
          "Noto Sans"
        ]
      },
      "ui-monospace": {
        "primary": "Noto Sans Mono CJK TC",
        "fallbacks": [
          "Noto Sans CJK TC",
          "DejaVu Sans Mono"
        ]
      },
      "math": {
        "primary": "Noto Sans Math",
        "fallbacks": [
          "Noto Sans CJK TC",
          "STIX Two Math"
        ]
      }
    },
    "jp": {
      "serif": {
        "primary": "Noto Serif CJK JP",
        "fallbacks": [
          "Source Han Serif JP",
          "IPAMincho"
        ]
      },
      "sans-serif": {
        "primary": "Noto Sans CJK JP",
        "fallbacks": [
          "Source Han Sans JP",
          "IPAGothic"
        ]
      },
      "monospace": {
        "primary": "Noto Sans Mono CJK JP",
        "fallbacks": [
          "Noto Sans CJK JP",
          "DejaVu Sans Mono"
        ]
      },
      "cursive": {
        "primary": "Noto Serif CJK JP",
        "fallbacks": [
          "IPAMincho",
          "Noto Sans CJK JP"
        ]
      },
      "fantasy": {
        "primary": "Noto Sans CJK JP",
        "fallbacks": [
          "IPAGothic",
          "Noto Sans"
        ]
      },
      "system-ui": {
        "primary": "Noto Sans CJK JP",
        "fallbacks": [
          "Noto Sans",
          "Ubuntu Sans"
        ]
      },
      "ui-serif": {
        "primary": "Noto Serif CJK JP",
        "fallbacks": [
          "Source Han Serif JP",
          "Noto Serif"
        ]
      },
      "ui-sans-serif": {
        "primary": "Noto Sans CJK JP",
        "fallbacks": [
          "Source Han Sans JP",
          "Noto Sans"
        ]
      },
      "ui-monospace": {
        "primary": "Noto Sans Mono CJK JP",
        "fallbacks": [
          "Noto Sans CJK JP",
          "DejaVu Sans Mono"
        ]
      },
      "math": {
        "primary": "Noto Sans Math",
        "fallbacks": [
          "Noto Sans CJK JP",
          "STIX Two Math"
        ]
      }
    },
    "kr": {
      "serif": {
        "primary": "Noto Serif CJK KR",
        "fallbacks": [
          "Source Han Serif KR",
          "Nanum Myeongjo"
        ]
      },
      "sans-serif": {
        "primary": "Noto Sans CJK KR",
        "fallbacks": [
          "Source Han Sans KR",
          "Nanum Gothic"
        ]
      },
      "monospace": {
        "primary": "Noto Sans Mono CJK KR",
        "fallbacks": [
          "Noto Sans CJK KR",
          "DejaVu Sans Mono"
        ]
      },
      "cursive": {
        "primary": "Noto Serif CJK KR",
        "fallbacks": [
          "Nanum Brush Script",
          "Noto Sans CJK KR"
        ]
      },
      "fantasy": {
        "primary": "Noto Sans CJK KR",
        "fallbacks": [
          "Nanum Gothic",
          "Noto Sans"
        ]
      },
      "system-ui": {
        "primary": "Noto Sans CJK KR",
        "fallbacks": [
          "Noto Sans",
          "Ubuntu Sans"
        ]
      },
      "ui-serif": {
        "primary": "Noto Serif CJK KR",
        "fallbacks": [
          "Source Han Serif KR",
          "Noto Serif"
        ]
      },
      "ui-sans-serif": {
        "primary": "Noto Sans CJK KR",
        "fallbacks": [
          "Source Han Sans KR",
          "Noto Sans"
        ]
      },
      "ui-monospace": {
        "primary": "Noto Sans Mono CJK KR",
        "fallbacks": [
          "Noto Sans CJK KR",
          "DejaVu Sans Mono"
        ]
      },
      "math": {
        "primary": "Noto Sans Math",
        "fallbacks": [
          "Noto Sans CJK KR",
          "STIX Two Math"
        ]
      }
    },
    "ar": {
      "serif": {
        "primary": "Noto Naskh Arabic",
        "fallbacks": [
          "Noto Serif",
          "DejaVu Serif"
        ]
      },
      "sans-serif": {
        "primary": "Noto Sans Arabic",
        "fallbacks": [
          "Noto Sans",
          "DejaVu Sans"
        ]
      },
      "monospace": {
        "primary": "Noto Sans Arabic",
        "fallbacks": [
          "Noto Sans Mono",
          "DejaVu Sans Mono"
        ]
      },
      "cursive": {
        "primary": "Noto Nastaliq Urdu",
        "fallbacks": [
          "Noto Naskh Arabic",
          "Noto Sans Arabic"
        ]
      },
      "fantasy": {
        "primary": "Noto Sans Arabic",
        "fallbacks": [
          "Noto Sans",
          "DejaVu Sans"
        ]
      },
      "system-ui": {
        "primary": "Noto Sans Arabic",
        "fallbacks": [
          "Noto Sans",
          "Ubuntu Sans"
        ]
      },
      "ui-serif": {
        "primary": "Noto Naskh Arabic",
        "fallbacks": [
          "Noto Serif",
          "DejaVu Serif"
        ]
      },
      "ui-sans-serif": {
        "primary": "Noto Sans Arabic",
        "fallbacks": [
          "Noto Sans",
          "DejaVu Sans"
        ]
      },
      "ui-monospace": {
        "primary": "Noto Sans Arabic",
        "fallbacks": [
          "Noto Sans Mono",
          "DejaVu Sans Mono"
        ]
      },
      "math": {
        "primary": "Noto Sans Math",
        "fallbacks": [
          "Noto Sans Arabic",
          "STIX Two Math"
        ]
      }
    },
    "he": {
      "serif": {
        "primary": "Noto Serif Hebrew",
        "fallbacks": [
          "Noto Serif",
          "DejaVu Serif"
        ]
      },
      "sans-serif": {
        "primary": "Noto Sans Hebrew",
        "fallbacks": [
          "Noto Sans",
          "DejaVu Sans"
        ]
      },
      "monospace": {
        "primary": "Noto Sans Hebrew",
        "fallbacks": [
          "Noto Sans Mono",
          "DejaVu Sans Mono"
        ]
      },
      "cursive": {
        "primary": "Noto Sans Hebrew",
        "fallbacks": [
          "Noto Serif Hebrew",
          "Noto Sans"
        ]
      },
      "fantasy": {
        "primary": "Noto Sans Hebrew",
        "fallbacks": [
          "Noto Sans",
          "DejaVu Sans"
        ]
      },
      "system-ui": {
        "primary": "Noto Sans Hebrew",
        "fallbacks": [
          "Noto Sans",
          "Ubuntu Sans"
        ]
      },
      "ui-serif": {
        "primary": "Noto Serif Hebrew",
        "fallbacks": [
          "Noto Serif",
          "DejaVu Serif"
        ]
      },
      "ui-sans-serif": {
        "primary": "Noto Sans Hebrew",
        "fallbacks": [
          "Noto Sans",
          "DejaVu Sans"
        ]
      },
      "ui-monospace": {
        "primary": "Noto Sans Hebrew",
        "fallbacks": [
          "Noto Sans Mono",
          "DejaVu Sans Mono"
        ]
      },
      "math": {
        "primary": "Noto Sans Math",
        "fallbacks": [
          "Noto Sans Hebrew",
          "STIX Two Math"
        ]
      }
    }
  }
} as PlatformFontOsMap;
