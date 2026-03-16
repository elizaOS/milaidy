# Other Projects

## milady-go
**Path:** `~/milady-go`
**Type:** Go backend CLI for Milady
**Stack:** Go, Cobra (CLI), chi/v5 (HTTP), Anthropic SDK (Claude), pgx/Postgres, SQLite, go-ethereum, solana-go, discordgo, telegram-bot-api
**Commands:** `make build`, `make run`, `make dev`, `make test`, `make lint`, `make build-all`
**Structure:** `cmd/milady/` (CLI), `internal/` (api, runtime, llm, connector, wallet, db, plugin, config, logging)
**Key:** Web3 wallet support (ETH + Solana), REST + WebSocket + SSE API

---

## milady-gpu
**Path:** `~/milady-gpu`
**Type:** GPU-accelerated Milady variant
**Has:** agents/, commands/, docs/, hooks/, skills/

---

## agentok
**Path:** `~/agentok`
**Type:** Electrobun-based desktop app
**Stack:** Bun, TypeScript, Electrobun

---

## rs-sdk
**Path:** `~/rs-sdk`
**Type:** Agent Runtime SDK
**Stack:** Bun, TypeScript
**Has:** sdk/, server/, bots/, mcp/ (MCP tools), scripts/, wiki/, learnings/

---

## agent-arena (`~/projects/agent-arena`)
**Type:** Competitive multi-agent simulation platform
**Stack:** Bun monorepo, TypeScript, React 19 + Vite 6 (frontend), Pixi.js (2D rendering), Zustand, GSAP, Tailwind CSS 4, WebSocket
**Packages:** `@arena/shared` (types/protocol), `@arena/server` (game engine, challenges, voting, marketplace), `@arena/client` (React UI), `@arena/sdk` (agent client)
**Game flow:** Registration → challenge phases (logic/social/economic/endurance) → voting/elimination → finale
**Commands:** `bun run dev` (port 3000), `bun run client:dev` (port 5173), `bun run build`, `bun run test`

---

## LunchTable TCG (`~/milady-projects/LunchTable-TCG`)
**Type:** White-label trading card game (humans + ElizaOS agents)
**Stack:** Bun 1.3.5, Vite 6 + React 19.2 + React Router 7, Tailwind CSS 4, Convex 1.31.6, Privy 3.12, Zustand 5.0, Framer Motion 12, Radix UI, ElizaOS 1.7.2
**Feature:** Agents stream gameplay via retake.tv; embedded as iframe in milaidy Electron app
**Rule:** Use Bun exclusively

---

## COIN (fintech super-app)
**Path:** `~/Desktop/COIN-Architecture-Blueprint.md`
**Status:** Architecture/blueprint phase
**Type:** Fintech super-app (banking, crypto, investments, payments, rewards, social)
**Stack (planned):** Next.js 15, React Native 0.76+, Expo SDK 52, Convex, Clerk, Hono microservices, Typesense, Resend, Twilio, Tailwind CSS 4, shadcn/ui, Recharts + TradingView
**Domains:** Auth (Clerk), real-time trading (WebSocket), KYC, robo-advisory (AI), fraud detection

---

## social-suit
**Path:** `~/milady-projects/social-suit`
**Type:** Social features suite

---

## trust-dashboard
**Path:** `~/milady-projects/trust-dashboard`
**Type:** Agent trust/reputation dashboard
