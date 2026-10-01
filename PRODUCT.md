# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Android/Termux developers and power users seeking a responsive, mobile-first interface to manage local Android environments, run command-line tools, access interactive TUI apps, and interact with an AGY AI agent directly from a mobile device.

## Product Purpose
Provide a lightweight, zero-build Progressive Web App (PWA) that exposes native Android Termux terminal capabilities, interactive PTY sessions, and continuous AI agent streaming directly to mobile browsers and standalone homescreen apps.

## Positioning
An ultra-lightweight mobile-first web interface tailored specifically for Termux with real-time WebSocket streaming, PTY/XTerm terminal emulation, native AGY AI agent bridge, and virtual keyboard ergonomics without requiring complex build steps or bundling.

## Operating Context
- Running locally inside Android Termux or accessing over local Wi-Fi / hotspot.
- Interacting via mobile touchscreens and on-screen virtual keyboards with constrained vertical space and dynamic viewport changes (`100dvh`, `interactive-widget=resizes-content`).
- Executing shell commands, interactive TUI applications (like `top`, `nano`, `htop`, `vi`), background jobs, and conversational AI coding agent tasks.

## Capabilities and Constraints
- **Zero-Build Requirement**: Vanilla HTML5, JavaScript, and Tailwind CSS (CDN) without Vite/Webpack/Babel build steps.
- **Real-Time Communication**: Bi-directional WebSockets (`ws`) handling streaming terminal output, PTY byte streams, and AGY agent chunks.
- **Mobile Ergonomics & PWA**: Dynamic viewport height handling, safe-area insets, thumb-zone controls, scroll locks, and offline service worker caching.
- **Resource Efficiency**: DOM pruning (log buffer node capping) and lightweight process management to avoid crashing on memory-constrained mobile devices.
- **Persistent Shell State**: Working directory navigation (`cd`/`cwd` tracking) and background execution resilience across connection hiccups.

## Brand Commitments
- Name: **Termux Web CLI**
- Theme: Dark terminal aesthetic (`#111827` / slate/gray palette with clean status indicators and monospaced typography).

## Evidence on Hand
- Full runnable codebase: [server.js](file:///root/projects/Skill_agy/server.js), [public/index.html](file:///root/projects/Skill_agy/public/index.html), [public/app.js](file:///root/projects/Skill_agy/public/app.js), [public/styles.css](file:///root/projects/Skill_agy/public/styles.css), [public/manifest.json](file:///root/projects/Skill_agy/public/manifest.json).
- Comprehensive architecture and history: [DOCUMENTATION.md](file:///root/projects/Skill_agy/DOCUMENTATION.md).
- Native bridges: [pty_bridge.py](file:///root/projects/Skill_agy/pty_bridge.py), [agent_bridge.py](file:///root/projects/Skill_agy/agent_bridge.py).

## Product Principles
- **Instant Readiness**: Zero build overhead; ready to run immediately with `npm start` on Termux Node.js.
- **Thumb-First Mobile UX**: Controls, shortcuts, and input areas designed specifically around one-handed mobile touch and virtual keyboards.
- **Stream Everything**: Sub-millisecond latency real-time streaming for command outputs, interactive terminal PTY, and agent thoughts.
- **Resilient by Default**: Graceful handling of mobile network disconnects, background job persistence, and automatic reconnection.

## Accessibility & Inclusion
- Mobile viewport scaling and keyboard adaptation (`inputmode`, `enterkeyhint`, touch targets >= 44px).
- High-contrast dark theme for terminal readability.
