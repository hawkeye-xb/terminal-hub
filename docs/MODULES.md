# MODULES — Detailed Specs for the 4 Modules

## Overview

| Module | Responsibility | Deliverables | Effort | Depends on |
|------|------|---------|-------|------|
| M1 Theme UI | CSS + Hugo templates | layouts/, assets/css/ | 5 days | — |
| M2 CLI System | Command parsing, view switching, keyboard navigation | static/js/cli.js | 4 days | M1 |
| M3 Search | Pagefind integration | static/js/search.js | 1 day | M1 |
| M4 RSS Aggregation | Data-fetch script + CI | scripts/, .github/ | 1 day | — |

M1 and M4 are independent and can run in parallel. M2 and M3 depend on M1's HTML structure.

**Total: ~11 days (1 person), ~6 days (2 people in parallel).**

---

## M1. Theme UI

### Responsibility

Implement the complete Hugo theme templates and CSS.

### Deliverables

```
layouts/
├── index.html                 # homepage
├── _default/baseof.html       # base template
├── _default/single.html       # post detail
├── _default/list.html         # list page
├── projects/single.html       # project detail
├── projects/list.html         # project list
├── partials/head.html         # <head>
├── partials/header.html       # header
├── partials/footer.html       # footer
├── partials/cli.html          # CLI bar
├── partials/profile.html      # profile area
├── partials/project-card.html # project card
├── partials/stream-item.html  # stream item
└── 404.html                   # 404 page

assets/css/
├── main.css                   # main styles
└── themes.css                 # variables for the 3 themes

static/fonts/
└── JetBrainsMono/             # font files
```

### Requirements

**Homepage (index.html)**
- Profile area: square avatar (80x80) on the left; name + title + one-liner + social links on the right
- Projects area: 3-column grid showing `content/projects/`
- Stream area: the 10 most recent items in reverse chronological order (posts and moments mixed)
- Reserve 60px at the bottom for the floating command bar

**Post detail (single.html)**
- Title, date, tags, word count
- Markdown-rendered body
- Prev/next navigation at the bottom

**Project detail (projects/single.html)**
- Project name, status, version
- Description (Markdown)
- Tech stack tags
- Links (Demo, GitHub, docs)
- Related posts (linked via the `relatedProject` param)

**CSS**
- All colors driven by CSS variables
- Responsive: breakpoints at 640px and 1024px
- No CSS framework dependency
- Final bundle < 50KB (minified)

### Acceptance Criteria

```
- [ ] `hugo server` renders the exampleSite correctly
- [ ] Homepage shows profile + 3 projects + recent content
- [ ] All 3 themes switch via config
- [ ] No horizontal scrolling on mobile (320px)
- [ ] Post pages render correctly (title, code blocks, images)
- [ ] Lighthouse Performance > 90
```

---

## M2. CLI System

### Responsibility

Implement the slash-command system: command parsing, view switching, keyboard navigation, auto-completion, history.

### Deliverables

```
static/js/cli.js              # about 400-600 lines
```

A single file. No module splitting (the project is small; splitting would add complexity).

### Requirements

**State machine**

5 states: IDLE → MENU → LIST → DETAIL → SEARCH

See the state machine diagram in VISION.md for transition rules.

**Command parsing**

Supported commands (reusing real terminal semantics):

| Command | Origin | Behavior | State transition |
|------|------|------|---------|
| `cd <dir>` | Unix | Enter directory | * → LIST (auto ls) |
| `cd ..` | Unix | Go up one level | LIST → IDLE / DETAIL → LIST |
| `cd /` / `cd ~` | Unix | Back to homepage | * → IDLE |
| `ls` | Unix | List current directory | refresh LIST |
| `cat <N>` | Unix | View item N | LIST → DETAIL |
| `grep <kw>` | Unix | Search | * → SEARCH |
| `tree` | Unix | Directory tree | show the site-wide tree |
| `pwd` | Unix | Show current path | no switch (prints path) |
| `clear` | Unix | Clear and go home | * → IDLE |
| `theme <name>` | Custom | Switch theme | no state switch |
| `help` / `man` | Unix | Show help | show help info |
| `history` | Bash | Show history | show command history |

Path navigation: `cd articles` → `cd ../projects` → `cd /`, same as a real terminal.

**Auto-completion**

- Typing `/` shows the full command menu
- Typing more filters the menu (`/a` → only `/articles`, `/about`)
- Tab completes the current selection
- ↑↓ navigates the menu

**History**

- Keep the last 30 commands in LocalStorage
- ↑↓ browses history when the input is empty

**Keyboard navigation**

| Key | IDLE | MENU | LIST | DETAIL |
|----|----------|----------|----------|------------|
| `/` | activate CLI | — | — | — |
| Esc | — | close menu | back home | back to list |
| ↑ | — | previous item | previous item | scroll up |
| ↓ | — | next item | next item | scroll down |
| ← | — | — | — | previous post |
| → | — | — | — | next post |
| Enter | — | run selection | open selection | — |
| Tab | — | complete | — | — |

**View rendering**

CLI-mode content renders inside the `#cli-view` container. The data source is the JSON Hugo injects into `window.__TERMINAL_DATA__` at build time.

List view row format: `[N] Title  date · tags`

Detail view: two implementations
1. **Simple**: `window.location.href = item.url` (navigate straight to the Hugo page)
2. **Advanced**: `fetch(item.url)`, extract the `<article>` content, and show it inside `#cli-view`

The MVP uses the simple approach; the advanced one is an optional enhancement.

### Acceptance Criteria

```
- [ ] Pressing / activates the CLI and shows the command menu
- [ ] cd articles / cd projects / cd moments enter the corresponding lists
- [ ] cd .. goes up one level, cd / goes home
- [ ] cat N opens item N
- [ ] grep <keyword> searches correctly
- [ ] Header path updates live and each segment is clickable
- [ ] Tab auto-completion works
- [ ] ↑↓ navigation works in menus and lists
- [ ] Esc behaves like cd ..
- [ ] History is saved to LocalStorage
- [ ] Commands respond in < 100ms
- [ ] JS bundle < 30KB (minified)
- [ ] No memory leaks
```

---

## M3. Search

### Responsibility

Integrate Pagefind to provide the `/search <keyword>` command.

### Deliverables

```
static/js/search.js            # about 50-80 lines
```

### Requirements

**Build-time index generation**

After the Hugo build, run `npx pagefind --site public` to generate the search index into `public/_pagefind/`.

**Runtime search**

```javascript
let pagefind = null;

export async function initSearch() {
  pagefind = await import('/_pagefind/pagefind.js');
  await pagefind.init();
}

export async function search(query) {
  if (!pagefind) await initSearch();
  const results = await pagefind.search(query);
  const items = await Promise.all(
    results.results.slice(0, 20).map(r => r.data())
  );
  return items.map(item => ({
    title: item.meta?.title || 'Untitled',
    url: item.url,
    excerpt: item.excerpt,
  }));
}
```

**CLI integration**

In cli.js:
```javascript
import { search } from './search.js';

commands.search = async (keyword) => {
  const results = await search(keyword);
  currentList = results;
  renderSearchResults(results, keyword);
  state = State.SEARCH;
};
```

Search results render in the same format as the post list and support opening via `view N`.

### Acceptance Criteria

```
- [ ] /search <keyword> returns relevant results
- [ ] Search responds in < 500ms
- [ ] Results support view N
- [ ] Shows "not found" when there are no results
- [ ] The Pagefind index is generated automatically at build time
```

---

## M4. RSS Aggregation (optional)

### Responsibility

Pull your content from other platforms via RSSHub into `data/feeds.json` and show it in the homepage "RECENT" area.

**This module is optional.** When disabled, the homepage only shows local content from `content/`.

### Deliverables

```
scripts/sync-feeds.js          # about 60 lines
.github/workflows/sync.yml     # about 25 lines
package.json                   # rss-parser dependency
```

### Requirements

**Script logic**

1. Read the RSS feed list (hardcoded in the script or read from config)
2. Fetch all feeds concurrently
3. Merge, sort, dedupe
4. Write `data/feeds.json`
5. A single failing feed must not affect the others

**Usage in Hugo templates**

```go
{{ range .Site.Data.feeds }}
  {{ partial "stream-item.html" . }}
{{ end }}
```

**GitHub Actions**

Runs every 6 hours, then commits and pushes the updated `data/feeds.json` automatically.

### Acceptance Criteria

```
- [ ] The script runs successfully and generates data/feeds.json
- [ ] Other feeds still work when one feed fails
- [ ] The GitHub Actions schedule runs correctly
- [ ] The homepage displays the aggregated content
```

---

## Inter-module Interfaces

```
M1 (Theme UI)
  ├─ Provides the HTML structure: #content, #cli-bar, #cli-menu, #cli-view
  ├─ Provides the CSS classes: .cli-bar, .cli-menu, .list-item, ...
  └─ Injects window.__TERMINAL_DATA__ on the homepage

M2 (CLI)
  ├─ Reads window.__TERMINAL_DATA__
  ├─ Manipulates the DOM of #cli-bar, #cli-menu, #cli-view
  ├─ Calls M3's search() function
  └─ Toggles #content and #cli-view visibility

M3 (Search)
  ├─ Exposes the search(query) function
  └─ Depends on the index Pagefind generates at build time

M4 (RSS aggregation)
  └─ Outputs data/feeds.json for M1's Hugo templates to read
```

No circular dependencies. M1 is the foundation, M2 is the core interaction, M3 is an enhancement, M4 is optional.
