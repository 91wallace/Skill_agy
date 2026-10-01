---
name: Termux Web CLI
description: Mobile-first interactive terminal, PTY emulator & AGY agent PWA for Android
colors:
  surface-base: "#111827"
  surface-header: "#030712"
  surface-card: "#0f172a"
  surface-card-subtle: "#1f2937"
  surface-line2: "#374151"
  border-subtle: "#374151"
  border-muted: "#4b5563"
  primary: "#22c55e"
  primary-hover: "#16a34a"
  accent-prompt: "#facc15"
  accent-ssh: "#10b981"
  accent-snippets: "#3b82f6"
  accent-clipboard: "#a855f7"
  accent-cancel: "#ef4444"
  text-primary: "#f9fafb"
  text-secondary: "#9ca3af"
  text-muted: "#6b7280"
typography:
  display:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.02em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-run:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-cancel:
    backgroundColor: "#7f1d1d"
    textColor: "#fecaca"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  card-process:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.lg}"
    padding: "0px 0px"
---

# Design System: Termux Web CLI

## Overview

**Creative North Star: "The Cybernetic Pocket Deck"**

Termux Web CLI is an uncompromising mobile terminal console designed to put workstation-grade shell manipulation and AI agent orchestration directly into a developer's pocket. It blends the high-density information architecture of classic Unix terminals with sleek, touch-responsive ergonomics tailored for mobile displays and virtual on-screen keyboards.

The aesthetic philosophy centers on dark tonal layering, crisp monospaced output, phosphor-inspired accents (luminous green for executions, amber for prompt roots, cyan for environment tabs, and violet for AI agent workflows), and fluid micro-transitions that provide immediate tactile feedback without compromising execution speed.

**Key Characteristics:**
- **Zero-Friction Ergonomics:** Pinned bottom thumb-zone for prompt entry and quick triggers; top-pinned persistent environment tabs.
- **Tonal Contrast Hierarchy:** Deep `#030712` header, `#111827` base canvas, and `#0f172a` glass-morphic cards with subtle `#374151` structural borders.
- **Dense, Humanized Terminal Flow:** Collapsible process cards with live status tickers, animated duration counters, and inline TUI session mounts.

## Colors

The palette uses a midnight dark baseline accented with focused phosphor neon tones for status, environment modes, and interactivity.

### Primary
- **Phosphor Green** (`#22c55e`): Used for primary affirmative actions (Run command button), active terminal session top borders, and connected state dots.

### Secondary
- **Amber Prompt** (`#facc15`): Used for terminal prompt lines (`[cwd]$`), directory icons, and active process processing states.
- **Emerald SSH** (`#10b981`): Used for remote SSH connection management badges and active PTY session indicators.
- **Terminal Blue** (`#3b82f6`): Used for snippet management tools, information chips, and process progress bars.
- **Agent Violet** (`#a855f7`): Used for Antigravity AI agent triggers, clipboard manager actions, and intelligence bubbles.

### Neutral
- **Deep Void Base** (`#111827`): Primary terminal canvas and background fill.
- **Header Jet** (`#030712`): Top bar and tab container background.
- **Card Slate** (`#0f172a`): Process card body and collapsible panel backgrounds.
- **Border Structural** (`#374151`): Main dividing lines, tab borders, and card outlines.
- **Text Primary** (`#f9fafb`): High-contrast white for active command text and critical logs.
- **Text Secondary** (`#9ca3af`): Dimmed gray for directory paths, past output timestamps, and inactive tab labels.

### Named Rules
**The Luminescence Rule.** High-saturation neon accents are reserved exclusively for live execution states, active environment badges, and focal interactive triggers. Backgrounds stay strictly dark and subdued.

## Typography

**Display Font:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
**Body Font:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
**Label/Mono Font:** `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`

**Character:** A high-precision monospaced core for strict character alignment in terminal logs and code blocks, paired with a clean sans-serif companion for mobile chrome, tabs, and toolbars.

### Hierarchy
- **Display** (700 weight, 14px, 1.3 line-height): Headers, modal titles, and section leadings.
- **Headline** (600 weight, 13px, 1.4 line-height): Tab titles, card status lines, and button labels.
- **Body** (400 weight, 13px, 1.5 line-height): Terminal stream outputs, command input text, and markdown paragraphs.
- **Label** (600 weight, 11px, 1.2 line-height, 0.02em letter-spacing): Process badges, timer counters, and shortcut pills.

### Named Rules
**The Monospace Sovereign Rule.** All terminal outputs, command arguments, directory paths, and code snippets must render in monospaced typography with `word-break: break-all` and `white-space: pre-wrap`.

## Layout

The layout uses a locked `100dvh` flex column architecture designed specifically to adapt dynamically to mobile virtual keyboards (`interactive-widget=resizes-content`).

- **Header Bar:** Height of ~44px, pinned top with horizontal scrollable tab strips (`no-scrollbar`).
- **Terminal Area:** Flexible center region (`flex-1 overflow-y-auto`) with 8px internal padding.
- **Footer Control Area:** Pinned bottom thumb zone with 8px horizontal scroll shortcuts and command input bar, padded with `calc(20px + env(safe-area-inset-bottom))`.
- **Modals & Sheets:** Bottom-sheet presentation with rounded top corners (`rounded-t-2xl`) sliding up from the screen bottom with backdrop blur (`backdrop-blur-sm`).

## Elevation & Depth

Depth is achieved primarily through tonal layering and subtle translucent frosted backdrops rather than heavy ambient drop shadows.

### Shadow Vocabulary
- **Card Ambient** (`box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35)`): Used on process cards and floating directory tree panels.
- **Sheet Elevation** (`box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.7)`): Used on bottom sheets and modal dialogues.

### Named Rules
**The Tonal Depth Rule.** Depth ascends from the deepest background (`#030712` header) to intermediate canvas (`#111827`), elevated cards (`#0f172a`), and interactive control surfaces (`#1f2937` / `#374151`).

## Shapes

- **Corners:**
  - Micro components (buttons, tags, input fields): `rounded-md` (6px to 8px radius).
  - Process Cards and Floating Panels: `rounded-xl` (12px radius).
  - Bottom Sheets: `rounded-t-2xl` (16px top corner radius).
  - Status Indicators & Badges: `rounded-full` (9999px).

## Components

### Buttons
- **Primary / Run Button:** Green solid background (`#22c55e`), white bold text, 6px border radius, with `active:scale-95` tactile response.
- **Cancel Button:** Dark red container (`#7f1d1d`), light red text (`#fecaca`), 6px border radius.
- **Shortcut Pills:** Dark slate background (`#374151`), rounded-md, horizontal flex with inline SVG icons.

### Process Card
- **Structure:** 2-line dual header with top ticker (`#0f172a`, 32px height) and bottom status bar (`#374151`), expandable body container (`max-height` transition).
- **Badges:** Live pulse dot (`#10b981`), execution duration timer badge, and command badge.

### Navigation / Tab Bar
- **Tab Item:** Chrome/browser style tab with 9px top corner radius, border highlight matching environment type (`#06b6d4` for Termux, `#10b981` for SSH, `#a855f7` for AGY agent).

### Inputs / Search
- **Command Input:** Dark background (`#111827`), subtle border (`#4b5563`), green focus ring (`#22c55e`), `enterkeyhint="go"`, `inputmode="text"`.

## Do's and Don'ts

### Do:
- **Do** preserve the strict `100dvh` dynamic height and `safe-area-inset-bottom` in all bottom-anchored components.
- **Do** maintain monospaced font rendering and word-wrap break protections on all command log nodes.
- **Do** provide immediate `active:scale-95` tap feedback on all touchable elements.

### Don't:
- **Don't** introduce heavy JS build steps or bundlers (Vite/Webpack) that break zero-build Termux instant execution.
- **Don't** allow horizontal page overflow or uncontrolled viewport zooming on touch devices.
- **Don't** mix non-monospaced fonts inside terminal logs, directory trees, or code blocks.
