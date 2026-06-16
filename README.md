<h1 align="center">Xiaomi MiMo for Copilot Chat</h1>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=sdmapvstool.xiaomimimo-for-copilot"><img src="https://img.shields.io/badge/VS%20Code-Install%20Extension-blue?logo=visualstudiocode&style=for-the-badge" alt="Install in VS Code"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=sdmapvstool.xiaomimimo-for-copilot"><img src="https://vsmarketplacebadges.dev/version-short/sdmapvstool.xiaomimimo-for-copilot.svg?style=for-the-badge" alt="Version"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=sdmapvstool.xiaomimimo-for-copilot"><img src="https://vsmarketplacebadges.dev/installs-short/sdmapvstool.xiaomimimo-for-copilot.svg?style=for-the-badge" alt="Installs"></a>
</p>

**Pick MiMo V2.5 Pro & V2.5 from the Copilot Chat model picker — with thinking mode, vision, and agent tools.**

Love Xiaomi MiMo's reasoning capabilities but don't want to leave Copilot Chat? This extension drops **MiMo V2.5 Pro & V2.5** straight into the model selector — with **thinking mode**, **vision** (V2.5), **tool calling**, and your own API key.

## Why this extension?

- **Don't replace Copilot — power it up.** No new sidebar, no new chat UI to learn. Just new models in the picker you already use.
- **Agent mode, tool calling, instructions, MCP, skills — all of it still works.** Copilot's entire stack, now running on MiMo.
- **Prompt caching that actually works.** The extension sends `prompt_cache_hit_tokens` back to the API so MiMo can validate and continue its server-side cache — no warm-up waste, no surprise re-computation.
- **Reasoning token tracking.** Every response logs `reasoning_effort` feedback and exact reasoning token counts so you can see how much thinking the model invested.
- **MiMo V2.5 supports vision.** Drop screenshots, UI mockups, or diagrams into chat — V2.5 can see and understand them.
- **MiMo V2.5 Pro excels at deep reasoning.** Complex refactors, multi-step debugging, algorithm design — tasks that need serious thinking.
- **BYOK, pay MiMo directly.** Your API key, your bill, your rate limits. Stored in the OS keychain, never on disk.

## Features

### MiMo V2.5 Pro & V2.5 in the model picker
Both models show up alongside GPT-4o, Claude, and friends in Copilot Chat's model selector. 917K token context on both. Switch models mid-chat without losing history.

### Prompt Caching with Full Feedback Loop
Most "compatible" extensions blindly forward API responses. This one **closes the loop**: it reads `prompt_tokens_details.cached_tokens` from each response and feeds it back to the API on the next request, ensuring MiMo's server-side prompt cache stays warm across multi-turn conversations. The result — dramatically lower costs and latency on long agent sessions.

Real-world cache performance (from actual usage logs):

```
[02:10:37.592] tokens: prompt=14973 completion=130 | cache: hit=12288 rate=82% | reasoning=83 | chars/tok=3.17
[02:10:43.595] tokens: prompt=15179 completion=230 | cache: hit=14912 rate=98% | reasoning=111 | chars/tok=2.58
[02:10:48.067] tokens: prompt=17110 completion=245 | cache: hit=15168 rate=89% | reasoning=42 | chars/tok=2.23
[02:10:53.388] tokens: prompt=17635 completion=174 | cache: hit=17088 rate=97% | reasoning=77 | chars/tok=1.99
[02:11:06.325] tokens: prompt=18068 completion=521 | cache: hit=17600 rate=97% | reasoning=108 | chars/tok=1.83
[02:13:50.253] tokens: prompt=19077 completion=57  | cache: hit=18048 rate=95% | reasoning=24 | chars/tok=1.75
[02:13:53.348] tokens: prompt=19201 completion=142 | cache: hit=19072 rate=99% | reasoning=23 | chars/tok=1.69
```

Cache hit rates climb to **97–99%** on subsequent turns — meaning the model skips re-reading your entire conversation history and jumps straight to the new content.

### Thinking Mode with Reasoning Token Visibility
Full support for MiMo's `reasoning_content`. Watch the model's thought process in real-time as it tackles complex problems. Every response also reports the exact number of **reasoning tokens** consumed — so you know how much "thinking" each answer cost you.

### Vision Support (MiMo V2.5)
Drop a screenshot or UI mockup into chat and V2.5 will analyze it directly. Perfect for understanding code screenshots, design specs, and visual debugging.

### Inherits Every Copilot Capability
Because this plugs into Copilot's native provider API, you get the full stack for free:
- **Agent mode** — autonomous multi-step tasks
- **Tool calling** — file edits, terminal, workspace search, Git, tests
- **Instructions & skills** — all your `.instructions.md`, `AGENTS.md`, and skills just work
- **Prompt caching stats** — MiMo's cache hit rate logged in the output channel so you can see the savings

### Multi-Region API & Custom Endpoint Support
Choose the API endpoint that matches your subscription plan:
- Default API (no plan)
- Token Plan — China
- Token Plan — Singapore
- Token Plan — Europe (Amsterdam)
- **Custom Endpoint** — any OpenAI-compatible URL (set via `mimo-copilot.customBaseUrl`)

### Secure by Default
API key lives in VS Code's `SecretStorage` (OS keychain on macOS / Windows / Linux). Never in `settings.json`, never in your Git history.

### Zero Runtime Dependencies
Pure VS Code API + Node.js built-ins. No Python, no Docker, no local proxy server to babysit.

## Getting Started

### Prerequisites

- VS Code 1.116 or later. This extension relies on non-public Copilot Chat APIs that may break on newer VS Code versions — [report an issue](https://github.com/Sdcb/xiaomimimo-for-copilot/issues) if you hit one.
- GitHub Copilot subscription (Free / Pro / Enterprise — the free tier works)
- MiMo API key from [platform.xiaomimimo.com](https://platform.xiaomimimo.com/console/api-keys)

### Usage

1. Install from the VS Code Marketplace
2. Run **MiMo: Set API Key** from the Command Palette (`Ctrl+Shift+P`)
3. Paste your API key
4. Open Copilot Chat, click the model picker, pick **MiMo V2.5 Pro** or **MiMo V2.5**
5. That's it — chat away

## Models

| Model | Best For | Vision |
|---|---|---|
| **MiMo V2.5 Pro** | Complex refactors, agent tasks, deep reasoning, algorithm design | ❌ |
| **MiMo V2.5** | Fast everyday coding, quick edits, image analysis, UI understanding | ✅ |

Both support thinking mode, tool calling, and 917K token context.

## Settings

| Setting | Default | Description |
|---|---|---|
| `mimo-copilot.baseUrl` | `https://api.xiaomimimo.com/v1` | API endpoint — select a preset or pick 'Custom Endpoint' |
| `mimo-copilot.customBaseUrl` | ` ` | Custom endpoint URL when baseUrl is set to 'Custom Endpoint' |
| `mimo-copilot.maxTokens` | `0` | Max output tokens (`0` = API default, capped at 131072). Useful for cost control |
| `mimo-copilot.modelIdOverrides` | `{...}` | Override API model IDs — only needed for compatible third-party APIs |

## Commands

| Command | Description |
|---|---|
| `MiMo: Set API Key` | Configure your MiMo API key |
| `MiMo: Get API Key` | Open the MiMo platform to get an API key |
| `MiMo: Clear API Key` | Remove the stored API key |
| `MiMo: Open Settings` | Open MiMo extension settings |
| `MiMo: Show Logs` | View extension logs for debugging |

## License

[MIT](LICENSE)
