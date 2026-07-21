# VISION — What & Why

## Positioning

A terminal-style Hugo theme, aimed at being an **open-source, reusable** standalone project.

Not a "personal-only website", but a theme "any indie developer can use out of the box".

## What Problem It Solves

Indie developers need a place to present themselves. Existing options are either too heavy (WordPress), too ugly (default Hugo themes), or too bare (plain link pages).

Terminal Hub offers:
- Terminal aesthetics, standing out from cookie-cutter white blogs
- Portfolio + posts + short-form content, all in one theme
- Slash-command interaction — a keyboard lover's paradise
- Fully static, zero ops cost

## Non-Goals

- No auto-publishing to social platforms (each platform has its own audience; posting manually fits better)
- No database (Git + Markdown is the storage)
- No backend (fully static)
- No comment system (not needed for the MVP; optional in Phase 2)

## Content Types

The theme supports 3 content types:

| Type | Directory | Description |
|------|------|------|
| Projects | `content/projects/` | Markdown showcasing indie work |
| Posts | `content/posts/` | Markdown long-form, tutorials, essays |
| Moments | `content/moments/` | Markdown or hand-maintained, microblog-style fragments |

Optional RSS aggregation is also supported: a script pulls your content from other platforms via RSSHub into `data/feeds.json` for display on the page. This is an enhancement, not a core feature.

---

## Core Interaction Model

This is the **fundamental difference** between this theme and every other Hugo theme.

### Homepage: Default View

Open the site and you see a full page:

```
┌──────────────────────────────────────────────────┐
│  ~/                                     [theme]  │ ← Header: path + theme toggle
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────┐                                    │
│  │          │  Shala Mira                        │
│  │ [avatar] │  Full-stack Developer              │
│  │          │  "Efficiency for better daydream"  │
│  └──────────┘  GitHub · Email · Twitter          │
│                                                  │
│  ─── PROJECTS ─────────────────────────────────  │
│                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │  Xisper    │ │  Storage   │ │  OSS       │   │
│  │  v1.2 ●   │ │  v0.1 ◐   │ │  15 repos  │   │
│  │  AI Voice  │ │  Smart Org │ │  2.1k ★   │   │
│  └────────────┘ └────────────┘ └────────────┘   │
│                                                  │
│  ─── RECENT ───────────────────────────────────  │
│                                                  │
│  [2026-04-13] [POST] Rust Performance Guide      │
│  [2026-04-12] [MOMENT] Indie hacking is fun      │
│  [2026-04-11] [POST] Vue 3 in Practice           │
│  [2026-04-10] [MOMENT] New desk setup            │
│                                                  │
├──────────────────────────────────────────────────┤
│  > /_ (press / to enter a command)               │
└──────────────────────────────────────────────────┘
```

Everything on the homepage is **clickable** (project cards, post titles) — this is GUI mode.

### CLI Mode: Press / to Activate

Press `/` and the bottom command bar gains focus, showing command hints:

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  (page content dims slightly)                     │
│                                                  │
├──────────────────────────────────────────────────┤
│  > _                                             │
│  ┌──────────────────────────────────────────┐    │
│  │  cd <dir>     enter directory (articles/...) │ │
│  │  ls           list current directory       │  │
│  │  cat <N>      view item N                  │  │
│  │  grep <key>   search                       │  │
│  │  tree         directory tree               │  │
│  │  pwd          current path                 │  │
│  │  clear        back to homepage             │  │
│  │  theme <name> switch theme                 │  │
│  │  help         help                         │  │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

Supports:
- Live filtering as you type (typing `c` shows `cd`, `cat`, `clear`)
- Tab completion
- Up/down arrows to select in the menu
- Enter to execute
- Esc to cancel

### Command Execution: cd + ls

After running `cd articles`, the Header path updates and the content area is replaced with the post list:

```
┌──────────────────────────────────────────────────┐
│  ~/articles                                      │ ← path updated
├──────────────────────────────────────────────────┤
│                                                  │
│  $ cd articles                                   │
│  $ ls                                            │ ← auto ls
│                                                  │
│  ARTICLES (12 total)                             │
│                                                  │
│  [1] Rust Performance Guide                      │
│      2026-04-13 · 5200 words · #Rust #performance│
│                                                  │
│  [2] Time Management for Indie Developers        │
│      2026-04-10 · 3200 words · #indie-dev         │
│                                                  │
│  [3] Vue 3 Composition API in Practice            │
│      2026-04-08 · 6800 words · #Vue #tutorial     │
│                                                  │
│  [4] Why I Chose Rust                             │
│      2026-04-05 · 2100 words · #Rust              │
│                                                  │
│  [5] 7 Tips for Building High-Performance APIs    │
│      2026-03-28 · 4500 words · #API #architecture │
│                                                  │
│  ↑↓ navigate  Enter/cat N to view  cd .. to go back│
│                                                  │
├──────────────────────────────────────────────────┤
│  > _                                             │
└──────────────────────────────────────────────────┘
```

**`cd` into a directory automatically runs `ls`**, matching the `cd dir && ls` habit from real terminals.

### Reading a Post: cat N

Type `cat 1` (or press Enter in the list) to enter reading mode:

```
┌──────────────────────────────────────────────────┐
│  ~/articles/rust-performance                     │ ← path goes deeper
├──────────────────────────────────────────────────┤
│                                                  │
│  Rust Performance Guide                           │
│  2026-04-13 · 15 min read · #Rust #performance   │
│  ─────────────────────────────────────────────── │
│                                                  │
│  ## 1. Memory Management                         │
│                                                  │
│  Rust's ownership system is one of its most       │
│  powerful features...                             │
│                                                  │
│  ```rust                                         │
│  fn main() {                                     │
│      let s = String::from("hello");              │
│      println!("{}", s);                          │
│  }                                               │
│  ```                                             │
│                                                  │
│  ## 2. Zero-Cost Abstractions                    │
│  ...                                             │
│                                                  │
│  ─────────────────────────────────────────────── │
│  ↑↓ scroll  ←→ prev/next post  cd .. back to list │
│                                                  │
│  [████████░░░░░░░░░░] 40%                        │
│                                                  │
├──────────────────────────────────────────────────┤
│  > _                                             │
└──────────────────────────────────────────────────┘
```

### State Machine Summary

```
~/ (homepage, IDLE)
  │
  ├─ click a project card → project detail page (standard Hugo single.html)
  ├─ click a post title → post page (standard Hugo single.html)
  │
  └─ press / → CLI active (MENU)
              │
              ├─ cd articles → ~/articles (LIST)
              │                  ├─ cat N → ~/articles/slug (DETAIL)
              │                  │            ├─ ↑↓ scroll
              │                  │            ├─ ←→ prev/next post
              │                  │            └─ cd .. → back to ~/articles
              │                  └─ cd .. → back to ~/
              │
              ├─ cd projects → ~/projects (LIST)
              │                  ├─ cat N → ~/projects/slug (DETAIL)
              │                  └─ cd .. → back to ~/
              │
              ├─ cd moments → ~/moments (LIST)
              │                  ├─ cat N → ~/moments/slug (DETAIL)
              │                  └─ cd .. → back to ~/
              │
              ├─ grep <kw> → search results (SEARCH)
              │                ├─ cat N → the matching item
              │                └─ cd / → back to ~/
              │
              ├─ tree → show the full directory tree
              ├─ theme <name> → switch theme (path unchanged)
              ├─ help → help info
              └─ clear / cd / → back to ~/
```

Path navigation rules (same as a real terminal):
- `cd articles` → relative path, enter a subdirectory
- `cd /` or `cd ~` → back to homepage
- `cd ..` → go up one level
- `cd ../projects` → go up one level, then into projects

### Two Modes Coexist

**Key design decision**: GUI and CLI are not mutually exclusive.

- Everything on the homepage is clickable (linking to standard Hugo-generated pages)
- The CLI offers an alternative navigation that dynamically swaps content in place
- Click navigation is standard page navigation (good for SEO)
- CLI navigation is JS-driven view switching (good for UX)
- Both paths lead to the same content

---

## Command Design: Reuse Real Terminal Semantics

Core principle: **don't invent new commands — reuse the terminal commands developers already have in muscle memory.**

### Navigation Model: The Filesystem Metaphor

The whole site is mapped to a directory tree:

```
~/                          ← homepage
├── articles/               ← post list
│   ├── rust-performance    ← a specific post
│   └── vue3-guide
├── projects/               ← project list
│   ├── xisper
│   └── storage-app
├── moments/                ← moments list
│   └── 2026-04-13-idea
└── about                   ← about page
```

### Header Shows the Current Path

The Header always shows where the user "is", like a terminal prompt:

```
homepage:  ~/
post list:  ~/articles
reading:    ~/articles/rust-performance
projects:   ~/projects
a project:  ~/projects/xisper
```

Every segment of the path is clickable and jumps back to that level.

### Full Command List

| Command | Origin | Function | Example |
|------|------|------|------|
| `ls` | Unix | List current directory | `ls` (lists all posts under ~/articles) |
| `cd <path>` | Unix | Enter directory | `cd articles`, `cd ..`, `cd /` |
| `cat <N>` | Unix | View item N | `cat 1` (opens item 1 in the list) |
| `grep <keyword>` | Unix | Search content | `grep rust` |
| `tree` | Unix | Show the full directory tree | `tree` |
| `pwd` | Unix | Show current path | `pwd` → `~/articles` |
| `clear` | Unix | Clear and go home | `clear` |
| `history` | Bash | Show command history | `history` |
| `help` | Common | Show help | `help` or `man` |
| `theme <name>` | Custom | Switch theme | `theme amber` |

### Why `cat` Instead of `view` / `less` / `open`

- `view`: vim's read-only mode — semantically right but less well known than cat
- `less`: the pager — most accurate semantically, but one character longer to type
- `open`: macOS-only — Linux users won't recognize it
- `cat`: **the best-known "print file contents" command** — 3 characters, fastest to type

Here `cat` means "print content to screen" — a perfect match.

---

## Technical Decisions

### Hugo over Astro/Next.js

Hugo is a single binary — no Node required. Fastest builds (<1s). Go templates are not elegant but good enough. As a theme project, Hugo has the most mature theme ecosystem.

### Vanilla JS over React/Vue

The CLI interaction is essentially a state machine plus DOM manipulation. Using a framework would be over-engineering. The final JS bundle stays under 30KB.

### Pagefind over Algolia

Pagefind builds its index at build time and runs fully offline. No backend, no API key, no cost.

### Cloudflare Pages over the Alternatives

Free, fast, automatic HTTPS, automatic deploys. Vercel works too — no hard dependency.

---

## Success Criteria

Functionality:
- Homepage shows profile, projects, and recent content
- All CLI commands work
- `view N` interaction is smooth
- Search finds content
- 3 themes are switchable
- Works on mobile

Performance:
- Homepage loads in < 2s
- CLI responds in < 100ms
- Lighthouse > 90

Open source:
- Others can `git clone` + tweak config and go
- The README is clear enough
- An exampleSite ships as a demo
