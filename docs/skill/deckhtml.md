# DeckHTML Agent Skill

> Teach coding agents to convert HTML decks to PPTX with the DeckHTML CLI.

The canonical skill lives in the repository at [`skill/deckhtml/`](../../skill/deckhtml/).

## What it covers

- When to invoke DeckHTML
- Local vs cloud mode
- HTML slide authoring conventions (`.slide-container`, viewport, stacked decks)
- CLI flags, JSON output, conversion reports
- Troubleshooting fidelity issues by fixing HTML

## Install in Cursor

```bash
mkdir -p .cursor/skills
ln -sfn ../../skill/deckhtml .cursor/skills/deckhtml
```

Personal install:

```bash
ln -sfn "$(pwd)/skill/deckhtml" ~/.cursor/skills/deckhtml
```

## Quick convert

```bash
npx -y @deckflow/deckhtml@latest deck.html -o deck.pptx --mode local --json
```

See [SKILL.md](../../skill/deckhtml/SKILL.md) for the full agent workflow.
