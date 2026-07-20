# BandAI — Track 3: Agent Society

Multi-agent music production society. Five specialist agents with distinct personas collaborate on a single brief, detect conflicts, negotiate, review quality, and synthesise a final song package.

## Run

```bash
cd bandai
cp .env.example .env
npm install
npm run build
npm start
```

## Agents

- **MAESTRO** — orchestrator and final synthesis
- **LYRA** — lyricist
- **CHORD** — music theorist
- **MIXER** — sound designer
- **CRITIC** — quality reviewer

## Files

- `src/qwenClient.ts` — Qwen Cloud client
- `src/index.ts` — full agent society pipeline + single-agent baseline
