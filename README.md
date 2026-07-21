# Terminal Hub — A terminal-style personal Hugo theme

A terminal-style Hugo theme. Showcase your projects, posts, and ideas.

## Docs

| Doc | Contents |
|------|------|
| [VISION.md](docs/VISION.md) | What, why, core interactions |
| [DESIGN.md](docs/DESIGN.md) | Visual design, layout, components |
| [IMPLEMENTATION.md](docs/IMPLEMENTATION.md) | Directory structure, code samples, dev plan |
| [MODULES.md](docs/MODULES.md) | Detailed specs for the 4 modules |

## Tech Stack

- Hugo (static site generation)
- Vanilla JavaScript (interactions, < 30KB)
- Plain CSS (styles, < 50KB)
- Pagefind (full-text search)
- Cloudflare Pages (hosting)

## Quick Start

```bash
# Create a site with this theme
hugo new site my-site
cd my-site
git submodule add https://github.com/user/terminal-hub-theme themes/terminal-hub
echo 'theme = "terminal-hub"' >> hugo.toml

# Write content
hugo new posts/hello-world.md
hugo new projects/my-app.md

# Preview locally
hugo server
```

## Configuration

```toml
# hugo.toml
baseURL = "https://yoursite.com"
theme = "terminal-hub"

[params]
author = "Your Name"
bio = "Full-stack Developer"
avatar = "images/avatar.jpg"
colorScheme = "green" # green / amber / cyber

[params.social]
github = "https://github.com/you"
email = "you@example.com"
```

## License

MIT
