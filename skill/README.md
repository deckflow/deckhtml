# DeckHTML skills & agent prompts

This directory packages agent instructions for HTML → PPTX conversion via `@deckflow/deckhtml`.

## Layout

```
skill/
├── README.md                 ← you are here
├── deckhtml/                 ← Cursor Agent Skill (primary)
│   ├── SKILL.md
│   ├── examples.md
│   ├── templates/
│   │   └── basic-deck.html   ← full starter deck (copy & edit)
│   └── references/
│       ├── cli.md
│       ├── html-authoring.md
│       ├── output-contract.md
│       └── troubleshooting.md
└── agent-prompts/            ← drop-in prompt snippets for other agents
    ├── convert-html-to-pptx.md
    └── review-conversion.md
```

## Install for Cursor

**Project skill** (shared with the repo):

```bash
mkdir -p .cursor/skills
ln -sfn ../../skill/deckhtml .cursor/skills/deckhtml
```

Or copy `skill/deckhtml` to `.cursor/skills/deckhtml`.

**Personal skill** (all projects):

```bash
mkdir -p ~/.cursor/skills
ln -sfn /absolute/path/to/deckhtml/skill/deckhtml ~/.cursor/skills/deckhtml
```

After install, agents should auto-discover the skill when the user asks for HTML→PPTX / deckhtml conversion. You can also say: “用 deckhtml skill 把这个 HTML 转成 PPTX”.

## Agent defaults

1. Prefer `--mode local --json`
2. Author slides as `.slide-container` at 1280×720 (or pass matching `--width`)
3. Fix HTML and re-convert when fidelity is wrong
4. Use cloud only for PDF/PNG or `--rebuild-*` / `--embed-fonts` / `--map-motion`
