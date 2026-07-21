# DESIGN — Visual Design & Interaction

## Color Schemes

3 built-in themes, switched via CSS variables.

### Green (default)

```css
html[data-theme="green"] {
  --bg:         #0d0d0d;
  --text:       #00ff00;
  --text-dim:   #00aa00;
  --accent:     #00ff00;
  --border:     #333333;
  --surface:    #1a1a1a;
  --glow:       rgba(0, 255, 0, 0.3);
}
```

Contrast: #00ff00 on #0d0d0d = 15.4:1 (exceeds WCAG AAA)

### Amber

```css
html[data-theme="amber"] {
  --bg:         #1a1410;
  --text:       #ffaa22;
  --text-dim:   #cc8800;
  --accent:     #ffaa22;
  --border:     #3a2a1a;
  --surface:    #2a1e14;
  --glow:       rgba(255, 170, 34, 0.3);
}
```

### Cyber

```css
html[data-theme="cyber"] {
  --bg:         #0a0e27;
  --text:       #00d9ff;
  --text-dim:   #0088cc;
  --accent:     #00ffff;
  --border:     #1a2a4a;
  --surface:    #0f1535;
  --glow:       rgba(0, 217, 255, 0.3);
}
```

---

## Typography

```css
font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', monospace;
```

| Usage | Size | Line height |
|------|------|------|
| Body | 16px | 1.6 |
| h1 | 28px | 1.3 |
| h2 | 22px | 1.4 |
| h3 | 18px | 1.4 |
| Tags/dates | 12px | 1.4 |
| CLI input | 14px | 1.4 |

Fonts are self-hosted — no Google Fonts dependency.

---

## Spacing

Based on multiples of 8px:

```css
--sp-1: 4px;
--sp-2: 8px;
--sp-3: 16px;
--sp-4: 24px;
--sp-5: 32px;
--sp-6: 48px;
```

Max content width: 800px.

---

## Page Layout

### Homepage

```
┌──────────────────────────────────────────┐
│  ~/                            [theme]   │ 48px  ← path nav + theme toggle
├──────────────────────────────────────────┤
│                                          │
│  ┌─────────┐                             │
│  │ [avatar]│  Name                        │ profile area
│  │ square  │  Title tag                   │ ~120px
│  │ 80x80   │  One-liner bio               │
│  └─────────┘  Social link icons          │
│                                          │
│  ─── PROJECTS ─────────────────────────  │
│                                          │
│  ┌──────┐  ┌──────┐  ┌──────┐           │ projects area
│  │ Proj │  │ Proj │  │ Proj │           │ ~150px
│  │  1   │  │  2   │  │  3   │           │
│  └──────┘  └──────┘  └──────┘           │
│                                          │
│  ─── RECENT ───────────────────────────  │
│                                          │
│  [date] [type] Title                     │ stream area
│  [date] [type] Title                     │ dynamic height
│  [date] [type] Title                     │
│  ...                                     │
│                                          │
│  (60px reserved at the bottom for the CLI)│
│                                          │
├──────────────────────────────────────────┤
│  > /_ (floating command bar)             │ 50px fixed
└──────────────────────────────────────────┘
```

**No sidebar.** Single centered column, max width 800px. Simple.

### Post Page (single.html)

A standard Hugo post page. Breadcrumbs on top, prev/next links at the bottom. This is where GUI-mode users land when they click a post title.

### Project Page (projects/single.html)

Project name, status, version, tech stack, description, links, related posts.

### List Page (list.html)

Post lists for categories/tags. Standard Hugo list pages.

---

## Responsive

| Breakpoint | Layout change |
|------|--------|
| < 640px (phone) | Project cards stack vertically, avatar shrinks to 60px |
| 640-1024px (tablet) | Project cards in 2 columns |
| > 1024px (desktop) | Project cards in 3 columns |

The CLI bar stays fixed at the bottom on all devices.

Minimum tap target on mobile: 44px.

---

## Components

### Project Card

```css
.project-card {
  padding: var(--sp-3);
  border: 1px solid var(--border);
  background: var(--surface);
}
.project-card:hover {
  border-color: var(--accent);
  box-shadow: 0 0 12px var(--glow);
}
```

Contents: project name, status marker (● Stable / ◐ Alpha / ○ Archive), one-line description.

### Stream Item

```css
.stream-item {
  padding: var(--sp-2) 0;
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: var(--sp-2);
}
```

Contents: `[date] [type tag] Title`. Type tags use different colors to distinguish sources.

### Tags

```css
.tag {
  padding: 2px 8px;
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-dim);
}
.tag:hover {
  color: var(--bg);
  background: var(--accent);
}
```

### Header Path Navigation

```css
.site-header {
  height: 48px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 var(--sp-3);
  border-bottom: 1px solid var(--border);
}
.path {
  font-size: 14px;
  color: var(--text-dim);
}
.path a {
  color: var(--text);
  text-decoration: none;
}
.path a:hover {
  color: var(--accent);
  text-decoration: underline;
}
```

Path example: `~/` → `~/articles` → `~/articles/rust-guide` — each segment is clickable.

### CLI Command Bar

```css
.cli-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 50px;
  background: var(--bg);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 var(--sp-3);
  z-index: 100;
}
.cli-bar::before {
  content: '> ';
  color: var(--accent);
  font-weight: bold;
}
.cli-bar input {
  flex: 1;
  background: none;
  border: none;
  color: var(--text);
  font: inherit;
  outline: none;
}
.cli-bar.active {
  box-shadow: inset 0 0 20px var(--glow);
}
```

### Command Picker Menu

```css
.cli-menu {
  position: fixed;
  bottom: 50px;
  left: 0;
  right: 0;
  max-height: 300px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  overflow-y: auto;
}
.cli-menu-item {
  padding: var(--sp-2) var(--sp-3);
  display: flex;
  justify-content: space-between;
}
.cli-menu-item.selected {
  background: var(--accent);
  color: var(--bg);
}
```

---

## Animation

Only 3 animations, all using GPU-accelerated properties:

```css
/* 1. Glow breathing when the CLI activates */
@keyframes glow-pulse {
  0%, 100% { box-shadow: inset 0 0 10px var(--glow); }
  50%      { box-shadow: inset 0 0 25px var(--glow); }
}

/* 2. Fade-in on view switch */
@keyframes fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 3. Theme switch transition */
html { transition: background-color 0.3s, color 0.3s; }
```

No typewriter effect (too flashy). No page-load animation (hurts first paint).

---

## Accessibility

- Text/background contrast > 7:1 in all themes
- Tab key reaches every interactive element
- The CLI bar has `role="search"` and an `aria-label`
- Project cards use the semantic `<article>` tag
- Images have alt text
