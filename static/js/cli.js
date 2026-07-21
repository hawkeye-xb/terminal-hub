/**
 * Terminal Hub CLI — pure vanilla JS, zero external dependencies
 *
 * Architecture: command bar (bottom) = controller, page content area = display
 * Clicks and commands operate on the same state, synced both ways
 *
 * View model:
 *   cwd        → current directory (/, /articles, /tags/Rust …)
 *   overlay    → temporary content over the directory view (cat/help/tree/grep/open)
 *   Esc/cd ..  → exit the overlay first, then the directory
 *   history    → hard-navigation pushState snapshots; browser back/forward re-renders via popstate
 */
;(function () {
  'use strict';

  // ═══════════ Constants ═══════════

  var DIRS     = ['articles', 'projects', 'moments', 'tags', 'categories', 'series'];
  var SEC_MAP  = { articles: 'posts', projects: 'projects', moments: 'moments' };
  var THEMES   = ['green', 'amber', 'cyber'];
  var COMMANDS = ['cd', 'ls', 'cat', 'open', 'grep', 'tree', 'pwd', 'clear', 'theme', 'help'];
  var MAX_HIST = 50;

  // ═══════════ State ═══════════

  var data        = {};
  var isHome      = false;   // whether we're on the Hugo homepage (has terminal-data)
  var cwd         = '/';
  var currentList = [];      // items in the current directory listing
  var pageLinks   = [];      // links indexed on the current page

  // Overlay view stack (cat → help → Esc back to cat → Esc back to list)
  var overlayStack = [];     // stack items: { viewLabel, html, list, article }
  var hasOverlay   = false;  // whether an overlay view is active
  var viewLabel    = null;   // breadcrumb label of the current overlay (e.g. article title)
  var currentArticle = null; // article opened via cat { url, title }, used for history snapshots

  // Command history
  var cmdHistory    = [];
  var cmdHistoryPos = -1;
  var savedInput    = '';

  // Tab completion
  var compItems   = [];
  var compIndex   = -1;
  var compVisible = false;

  // Status
  var statusTimer = null;

  // ═══════════ DOM refs ═══════════

  var homeView, cmdView, pathDisplay;
  var cmdInput, cmdPrompt, compDropdown, cmdStatus;
  var themeLabel;

  // ═══════════ Boot ═══════════

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    // Parse the JSON data injected by Hugo
    var el = document.getElementById('terminal-data');
    if (el) {
      try { data = JSON.parse(el.textContent); } catch (_) {}
      isHome = true;
    }

    // Restore command history
    try { cmdHistory = JSON.parse(localStorage.getItem('th_cmd_history') || '[]'); } catch (_) { cmdHistory = []; }

    // Cache DOM references
    homeView     = document.getElementById('home-view');
    cmdView      = document.getElementById('cmd-view');
    pathDisplay  = document.getElementById('path-display');
    cmdInput     = document.getElementById('cmd-input');
    cmdPrompt    = document.getElementById('cmd-prompt');
    compDropdown = document.getElementById('cmd-completions');
    cmdStatus    = document.getElementById('cmd-status');
    themeLabel   = document.getElementById('theme-label');

    // Bind events
    cmdInput.addEventListener('keydown', onKeydown);
    cmdInput.addEventListener('input', onInput);

    // Clicking anywhere on the cmdbar focuses the input
    document.getElementById('cmdbar').addEventListener('click', function (e) {
      if (e.target.closest('#cmd-completions')) return;
      cmdInput.focus();
    });

    // Theme button
    document.getElementById('theme-toggle').addEventListener('click', function () {
      cycleTheme();
    });

    // Global click: intercept in-page navigation links
    document.addEventListener('click', onPageClick);

    // Global keyboard (Esc must be global — after clicking a page link the input loses focus)
    document.addEventListener('keydown', function (e) {
      // Esc: close completion / go back
      if (e.key === 'Escape') {
        e.preventDefault();
        if (compVisible) {
          hideComp();
        } else {
          doGoBack();
        }
        return;
      }
      // / focuses the command bar
      if (e.key === '/' && !isInputEl(document.activeElement)) {
        e.preventDefault();
        cmdInput.focus();
      }
      // q goes back on non-home pages
      if (!isHome && e.key === 'q' && !isInputEl(document.activeElement)) {
        window.history.back();
      }
    });

    // Restore theme
    var saved = localStorage.getItem('th_theme');
    if (saved && THEMES.indexOf(saved) !== -1) setTheme(saved);

    // Initial render
    updatePrompt();
    renderBreadcrumb();
    if (isHome) {
      annotateLinks(homeView);
      // Enable SPA state sync on the homepage: write the initial snapshot, listen for browser back/forward
      try { history.replaceState(snapshotState(), ''); } catch (_) {}
      window.addEventListener('popstate', onPopState);
    }

    cmdInput.focus();
  }

  // ═══════════ Keyboard ═══════════

  function onKeydown(e) {
    switch (e.key) {

      case 'Enter':
        e.preventDefault();
        if (compVisible && compIndex >= 0) {
          applyCompletion(compItems[compIndex]);
        } else {
          executeInput();
        }
        break;

      case 'Tab':
        e.preventDefault();
        if (compVisible) {
          if (e.shiftKey) {
            compIndex = (compIndex - 1 + compItems.length) % compItems.length;
          } else {
            compIndex = (compIndex + 1) % compItems.length;
          }
          renderCompDropdown();
        } else {
          doComplete();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (compVisible) {
          compIndex = (compIndex - 1 + compItems.length) % compItems.length;
          renderCompDropdown();
        } else {
          historyPrev();
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (compVisible) {
          compIndex = (compIndex + 1) % compItems.length;
          renderCompDropdown();
        } else {
          historyNext();
        }
        break;

      // Esc is handled by the global handler, not here
    }
  }

  function onInput() {
    if (compVisible) hideComp();
  }

  function isInputEl(el) {
    if (!el) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  // ═══════════ Execute ═══════════

  function executeInput() {
    var raw = cmdInput.value.trim();
    cmdInput.value = '';
    hideComp();
    if (!raw) return;

    // Save history (dedupe consecutive duplicates)
    if (cmdHistory[0] !== raw) {
      cmdHistory.unshift(raw);
      if (cmdHistory.length > MAX_HIST) cmdHistory.pop();
      try { localStorage.setItem('th_cmd_history', JSON.stringify(cmdHistory)); } catch (_) {}
    }
    cmdHistoryPos = -1;
    savedInput = '';

    // Parse
    var parts = raw.split(/\s+/);
    var cmd   = parts[0];
    var args  = parts.slice(1);

    var fn = cmds[cmd];
    if (fn) {
      fn(args);
    } else {
      flash(cmd + ': command not found', 'error');
    }
  }

  // ═══════════ Navigation Core ═══════════

  /**
   * Called before entering an overlay: push the current overlay state onto the stack
   * cat/help/tree/grep/open-list/pwd all call this at the start
   */
  function pushOverlay(label) {
    if (hasOverlay) {
      // An overlay is already active → push it (e.g. cat article → help saves the article state)
      overlayStack.push({
        viewLabel: viewLabel,
        html: cmdView.hidden ? '' : cmdView.innerHTML,
        list: currentList.slice(),
        article: currentArticle
      });
    }
    hasOverlay = true;
    viewLabel = label || null;
    renderBreadcrumb();
  }

  /**
   * Unified "back" logic (both Esc and cd .. go through here)
   * 1. Overlay on the stack → pop and restore the previous overlay view
   * 2. Overlay active but stack empty → back to the current directory view
   * 3. No overlay → go up one directory
   */
  function doGoBack() {
    if (hasOverlay) {
      if (overlayStack.length > 0) {
        // Restore the previous overlay (e.g. from help back to the cat'ed article)
        var prev = overlayStack.pop();
        viewLabel = prev.viewLabel;
        currentList = prev.list;
        currentArticle = prev.article;
        renderBreadcrumb();
        homeView.hidden = true;
        cmdView.innerHTML = prev.html;
        cmdView.hidden = false;
        annotateLinks(cmdView);
        bindListClicks();
        pushState();
        return;
      }
      // Stack empty: exit the overlay, back to the directory view
      hasOverlay = false;
      viewLabel = null;
      currentArticle = null;
      renderBreadcrumb();
      renderDirectoryView();
      pushState();
      return;
    }
    if (cwd === '/') return;
    cwd = normPath('..');
    updatePrompt();
    renderBreadcrumb();
    renderDirectoryView();
    pushState();
  }

  /** Clear the overlay stack (called on "hard navigation" like cd / navigateToHref) */
  function clearOverlay() {
    overlayStack = [];
    hasOverlay = false;
    viewLabel = null;
    currentArticle = null;
  }

  /**
   * Render the directory view for the current cwd (without overlay)
   */
  function renderDirectoryView() {
    if (cwd === '/') {
      showHomeView();
      return;
    }
    var items = getList();
    currentList = items;
    showCmdView(renderList(items, {}));
  }

  // ═══════════ Commands ═══════════

  var cmds = {};

  // ── cd ──
  cmds.cd = function (args) {
    var target = args.join(' ') || '/';
    if (target === '~' || target === '~/') target = '/';

    // cd .. → unified back logic
    if (target === '..') {
      doGoBack();
      return;
    }

    var np = normPath(target);
    if (!pathExists(np)) {
      flash('cd: ' + target + ': No such directory', 'error');
      return;
    }

    // Clear the overlay stack and enter the new directory
    clearOverlay();
    cwd = np;
    updatePrompt();
    renderBreadcrumb();
    renderDirectoryView();
    pushState();
  };

  // ── ls ──
  cmds.ls = function (args) {
    var flags = parseFlags(args, { l: false, a: false });

    if (cwd === '/') {
      // Root: list top-level directories (overlay, Esc back home)
      pushOverlay(null);

      var html = '<div class="cmd-list">';
      DIRS.forEach(function (dir) {
        var items = getItemsForDir(dir);
        var count = items.length;
        if (flags.l) {
          html += '<div class="cmd-list-item cmd-dir-entry" data-dir="' + dir + '">'
               + '<span class="cmd-title">' + dir + '/</span>'
               + '<span class="cmd-meta">' + count + ' items</span>'
               + '</div>';
        } else {
          html += '<span class="cmd-dir-inline" data-dir="' + dir + '">' + dir + '/</span>';
        }
      });
      html += '</div>';
      html += '<p class="cmd-hint"><code>cd &lt;dir&gt;</code> to enter · Esc to go back · <code>help</code> for all commands</p>';
      showCmdView(html);
      bindDirClicks();
      return;
    }

    // Non-root: show the current directory listing (the directory view itself, not an overlay)
    // Always go through clearOverlay so a stale overlayStack can't make Esc restore an outdated view
    clearOverlay();
    var items = getList();
    currentList = items;
    showCmdView(renderList(items, flags));
  };

  // ── cat ──
  cmds.cat = function (args) {
    if (!args.length) {
      flash('cat: missing argument', 'error');
      return;
    }

    // Make sure a list exists
    if (!currentList.length) currentList = getList();

    var target = args[0];
    var n = parseInt(target, 10);

    if (!isNaN(n)) {
      doCat(n);
    } else {
      var idx = currentList.findIndex(function (it) {
        return slugify(it.title) === slugify(target)
            || it.title.toLowerCase() === target.toLowerCase();
      });
      if (idx >= 0) {
        doCat(idx + 1);
      } else {
        flash('cat: ' + target + ': No such file', 'error');
      }
    }
  };

  // ── open ──
  cmds.open = function (args) {
    pageLinks = collectLinks();

    if (!args.length) {
      if (!pageLinks.length) {
        flash('No links on current page.', 'info');
        return;
      }
      // List links (overlay)
      pushOverlay(null);

      var html = '<div class="cmd-list">';
      pageLinks.forEach(function (lk, i) {
        var icon = lk.external ? ' <span class="link-ext">↗</span>' : '';
        html += '<div class="cmd-list-item cmd-link-entry" data-link="' + i + '">'
             + '<span class="cmd-num">[' + (i + 1) + ']</span>'
             + '<span class="cmd-title">' + esc(lk.text) + icon + '</span>'
             + '<span class="cmd-meta">' + esc(truncStr(lk.display, 40)) + '</span>'
             + '</div>';
      });
      html += '</div>';
      html += '<p class="cmd-hint"><code>open N</code> to open · Esc to go back</p>';
      showCmdView(html);
      bindLinkClicks();
      return;
    }

    var idx = parseInt(args[0], 10);
    if (idx >= 1 && idx <= pageLinks.length) {
      var lk = pageLinks[idx - 1];
      if (lk.external) {
        window.open(lk.href, '_blank');
        flash('Opened: ' + lk.text + ' ↗', 'info');
      } else {
        navigateToHref(lk.href);
      }
    } else {
      flash('open: invalid index', 'error');
    }
  };

  // ── grep ──
  cmds.grep = function (args) {
    var kw = args.join(' ');
    if (!kw) { flash('grep: missing pattern', 'error'); return; }

    var results = [];
    ['posts', 'projects', 'moments'].forEach(function (sec) {
      (data[sec] || []).forEach(function (it) {
        var hay = [it.title, it.summary || '', it.description || '', (it.tags || []).join(' ')].join(' ').toLowerCase();
        if (hay.indexOf(kw.toLowerCase()) !== -1) results.push(it);
      });
    });

    // grep results are an overlay
    pushOverlay('grep: ' + kw);

    currentList = results;
    if (!results.length) {
      showCmdView('<p class="empty-msg">No matches for "' + esc(kw) + '"</p>'
                + '<p class="cmd-hint">Esc to go back</p>');
    } else {
      showCmdView(renderList(results, {})
                + '<p class="cmd-hint">' + results.length + ' result(s) · Esc to go back</p>');
    }
  };

  // ── tree ──
  cmds.tree = function () {
    pushOverlay(null);

    var lines = ['<span class="t-dir">~/</span>'];
    var allDirs = [];
    DIRS.forEach(function (dir) {
      var items = getItemsForDir(dir);
      if (items.length > 0) allDirs.push({ name: dir, count: items.length });
    });

    allDirs.forEach(function (d, i) {
      var pre = i < allDirs.length - 1 ? '├── ' : '└── ';
      lines.push(pre + '<span class="t-dir">' + d.name + '/</span>  <span class="t-meta">(' + d.count + ')</span>');
    });
    showCmdView('<pre class="tree-view">' + lines.join('\n') + '</pre>'
              + '<p class="cmd-hint">Esc to go back</p>');
  };

  // ── pwd ──
  cmds.pwd = function () {
    pushOverlay(null);
    showCmdView('<p class="pwd-output">~' + esc(cwd) + '</p>'
              + '<p class="cmd-hint">Esc to go back</p>');
  };

  // ── clear ──
  cmds.clear = function () {
    clearOverlay();
    cwd = '/';
    currentList = [];
    updatePrompt();
    renderBreadcrumb();
    showHomeView();
    pushState();
  };

  // ── theme ──
  cmds.theme = function (args) {
    if (!args.length) { cycleTheme(); return; }
    var name = args[0];
    if (THEMES.indexOf(name) === -1) {
      flash('theme: unknown "' + name + '" → ' + THEMES.join(' / '), 'error');
      return;
    }
    setTheme(name);
    flash('Theme → ' + name, 'info');
  };

  // ── help ──
  cmds.help = function () {
    pushOverlay(null);

    var rows = [
      ['cd &lt;dir&gt;',       'enter directory (articles / projects / moments / tags / categories / series)'],
      ['cd ..',               'go up · Esc shortcut'],
      ['ls [-l]',             'list current directory'],
      ['cat &lt;N | name&gt;','view item N'],
      ['open',                'list all links on the current page'],
      ['open &lt;N&gt;',      'open link N'],
      ['grep &lt;keyword&gt;','search the whole site'],
      ['tree',                'directory overview'],
      ['pwd',                 'current path'],
      ['theme [name]',        'switch theme (' + THEMES.join(' / ') + ')'],
      ['clear',               'back to homepage'],
      ['help',                'show this help'],
    ];
    var html = '<div class="help-table">';
    rows.forEach(function (r) {
      html += '<div class="help-row"><code>' + r[0] + '</code><span>' + r[1] + '</span></div>';
    });
    html += '</div>';
    html += '<p class="cmd-hint">Tab to complete · ↑↓ command history · Esc to go back · / to focus the bar</p>';
    showCmdView(html);
  };

  // ═══════════ Tab Completion ═══════════

  function doComplete() {
    var input = cmdInput.value;
    var items = getCompletions(input);
    if (!items.length) return;

    if (items.length === 1) {
      applyCompletion(items[0]);
      return;
    }

    compItems = items;
    compIndex = 0;
    compVisible = true;
    renderCompDropdown();
  }

  function getCompletions(input) {
    var parts = input.split(/\s+/);
    var cmd = parts[0] || '';
    var hasSpace = input.indexOf(' ') !== -1;
    var arg = hasSpace ? input.substring(input.indexOf(' ') + 1) : '';

    if (!hasSpace) {
      return COMMANDS
        .filter(function (c) { return c.indexOf(cmd) === 0; })
        .map(function (c) { return { label: c, value: c + ' ' }; });
    }

    switch (cmd) {
      case 'cd':    return compCd(arg);
      case 'cat':   return compCat(arg);
      case 'open':  return compOpen(arg);
      case 'theme': return compTheme(arg);
      case 'ls':    return compLs(arg);
      default:      return [];
    }
  }

  function compCd(arg) {
    var targets = ['..'];
    var parts = pathParts(cwd);

    if (parts.length === 0) {
      targets = targets.concat(DIRS);
    } else if (parts[0] === 'tags' && parts.length === 1) {
      (data.tags || []).forEach(function (t) { targets.push(t.name); });
    } else if (parts[0] === 'categories' && parts.length === 1) {
      (data.categories || []).forEach(function (c) { targets.push(c.name); });
    } else if (parts[0] === 'series' && parts.length === 1) {
      (data.series || []).forEach(function (s) { targets.push(s.name); });
    }

    return targets
      .filter(function (t) { return t.toLowerCase().indexOf(arg.toLowerCase()) === 0; })
      .map(function (t) {
        var suffix = t === '..' ? '' : '/';
        return { label: t + suffix, value: 'cd ' + t };
      });
  }

  function compCat(arg) {
    if (!currentList.length) currentList = getList();
    if (!currentList.length) return [];

    return currentList
      .map(function (it, i) {
        var n = String(i + 1);
        return { label: n + ') ' + it.title, value: 'cat ' + n };
      })
      .filter(function (c) {
        if (!arg) return true;
        return c.label.toLowerCase().indexOf(arg.toLowerCase()) !== -1
            || c.value.indexOf(arg) === 0;
      });
  }

  function compOpen(arg) {
    pageLinks = collectLinks();
    if (!pageLinks.length) return [];

    return pageLinks.map(function (lk, i) {
      var n = String(i + 1);
      var icon = lk.external ? ' ↗' : '';
      return { label: n + ') ' + lk.text + icon, value: 'open ' + n };
    }).filter(function (c) {
      return !arg || c.value.indexOf('open ' + arg) === 0;
    });
  }

  function compTheme(arg) {
    return THEMES
      .filter(function (t) { return t.indexOf(arg) === 0; })
      .map(function (t) { return { label: t, value: 'theme ' + t }; });
  }

  function compLs(arg) {
    return ['-l', '-a', '-la']
      .filter(function (f) { return f.indexOf(arg) === 0; })
      .map(function (f) { return { label: f, value: 'ls ' + f }; });
  }

  function applyCompletion(item) {
    cmdInput.value = item.value;
    hideComp();
    cmdInput.focus();
  }

  function renderCompDropdown() {
    if (!compVisible || !compItems.length) { hideComp(); return; }

    var html = '';
    compItems.forEach(function (item, i) {
      var cls = i === compIndex ? 'comp-item selected' : 'comp-item';
      html += '<div class="' + cls + '" data-ci="' + i + '">' + esc(item.label) + '</div>';
    });

    compDropdown.innerHTML = html;
    compDropdown.hidden = false;

    compDropdown.querySelectorAll('.comp-item').forEach(function (el) {
      el.addEventListener('mousedown', function (e) {
        e.preventDefault();
        applyCompletion(compItems[parseInt(el.dataset.ci, 10)]);
      });
    });

    var sel = compDropdown.querySelector('.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  function hideComp() {
    compVisible = false;
    compItems = [];
    compIndex = -1;
    if (compDropdown) {
      compDropdown.hidden = true;
      compDropdown.innerHTML = '';
    }
  }

  // ═══════════ Command History ═══════════

  function historyPrev() {
    if (!cmdHistory.length) return;
    if (cmdHistoryPos === -1) savedInput = cmdInput.value;
    if (cmdHistoryPos < cmdHistory.length - 1) {
      cmdHistoryPos++;
      cmdInput.value = cmdHistory[cmdHistoryPos];
    }
  }

  function historyNext() {
    if (cmdHistoryPos <= -1) return;
    cmdHistoryPos--;
    cmdInput.value = cmdHistoryPos === -1 ? savedInput : cmdHistory[cmdHistoryPos];
  }

  // ═══════════ Path Helpers ═══════════

  function normPath(p) {
    p = (p || '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    if (p === '~') return '/';
    p = p.replace(/^~\/?/, '/');
    if (p[0] !== '/') p = (cwd === '/' ? '/' : cwd + '/') + p;

    var out = [];
    p.split('/').forEach(function (s) {
      if (s === '..') out.pop();
      else if (s && s !== '.') out.push(s);
    });
    return '/' + out.join('/');
  }

  function pathParts(p) {
    return (p || '/').split('/').filter(Boolean);
  }

  function pathExists(p) {
    var parts = pathParts(p);
    if (parts.length === 0) return true;
    if (DIRS.indexOf(parts[0]) === -1) return false;
    if (parts.length === 1) return true;
    if (parts[0] === 'tags') {
      return (data.tags || []).some(function (t) {
        return t.name.toLowerCase() === parts[1].toLowerCase();
      });
    }
    if (parts[0] === 'categories') {
      return (data.categories || []).some(function (c) {
        return c.name.toLowerCase() === parts[1].toLowerCase();
      });
    }
    if (parts[0] === 'series') {
      return (data.series || []).some(function (s) {
        return s.name.toLowerCase() === parts[1].toLowerCase();
      });
    }
    return false;
  }

  // ═══════════ Data ═══════════

  function getList() {
    var parts = pathParts(cwd);
    var dir = parts[0], sub = parts[1];

    if (dir === 'tags' && !sub) {
      return (data.tags || []).map(function (t) {
        return { title: t.name, meta: t.count + ' articles', url: null, _isDir: true };
      });
    }
    if (dir === 'tags' && sub) {
      var name = sub.toLowerCase();
      return (data.posts || []).filter(function (it) {
        return (it.tags || []).some(function (t) { return t.toLowerCase() === name; });
      });
    }
    if (dir === 'categories' && !sub) {
      return (data.categories || []).map(function (c) {
        return { title: c.name, meta: c.count + ' articles', url: null, _isDir: true };
      });
    }
    if (dir === 'categories' && sub) {
      var catName = sub.toLowerCase();
      return (data.posts || []).filter(function (it) {
        return (it.categories || []).some(function (c) { return c.toLowerCase() === catName; });
      });
    }
    if (dir === 'series' && !sub) {
      return (data.series || []).map(function (s) {
        return { title: s.name, meta: s.count + ' articles', url: null, _isDir: true };
      });
    }
    if (dir === 'series' && sub) {
      var serName = sub.toLowerCase();
      return (data.posts || []).filter(function (it) {
        return (it.series || []).some(function (s) { return s.toLowerCase() === serName; });
      });
    }
    var sec = SEC_MAP[dir];
    return (sec && data[sec]) ? data[sec] : [];
  }

  function getItemsForDir(dir) {
    if (dir === 'tags') return data.tags || [];
    if (dir === 'categories') return data.categories || [];
    if (dir === 'series') return data.series || [];
    var sec = SEC_MAP[dir];
    return (sec && data[sec]) ? data[sec] : [];
  }

  // ═══════════ cat: load and render content ═══════════

  function doCat(n, skipPush) {
    if (!n || n < 1 || n > currentList.length) {
      flash('cat: invalid index', 'error');
      return;
    }

    var item = currentList[n - 1];
    if (!item) return;

    // Directory → cd into it
    if (item._isDir) {
      cmds.cd([item.title]);
      return;
    }

    if (!item.url) {
      flash('cat: no URL', 'error');
      return;
    }

    // Overlay: show the article title in the breadcrumb
    pushOverlay(item.title);
    currentArticle = { url: item.url, title: item.title };
    if (!skipPush) pushState();
    flash('Loading...', 'info');

    fetch(item.url)
      .then(function (res) { return res.text(); })
      .then(function (html) {
        var content = extractArticle(html);
        var hint = '<p class="cmd-hint"><code>cd ..</code> / Esc back to list · <code>open</code> to view links</p>';
        showCmdView(content + hint);
        flash('', '');
      })
      .catch(function () {
        window.location.href = item.url;
      });
  }

  function extractArticle(html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var article = doc.querySelector('.article');
    if (article) return article.outerHTML;
    var main = doc.querySelector('#content, main');
    if (main) return main.innerHTML;
    return '<p>Failed to load content.</p>';
  }

  // ═══════════ Link Annotation ═══════════

  function annotateLinks(container) {
    if (!container) return;
    container.querySelectorAll('.link-badge').forEach(function (el) { el.remove(); });

    var seen = {};
    var count = 0;

    container.querySelectorAll('a[href]').forEach(function (a) {
      if (a.closest('#cmdbar') || a.closest('#path-display') || a.closest('.cmd-hint')) return;
      var href = a.getAttribute('href');
      var text = a.textContent.trim();
      if (!href || !text || text.length > 100) return;
      if (/^(javascript|#)/.test(href)) return;
      if (seen[href]) return;
      seen[href] = true;
      count++;

      var badge = document.createElement('sup');
      badge.className = 'link-badge';
      badge.textContent = '[' + count + ']';
      a.appendChild(badge);
    });
  }

  function collectLinks() {
    var container = cmdView.hidden ? homeView : cmdView;
    var links = [];
    var seen = {};

    container.querySelectorAll('a[href]').forEach(function (a) {
      if (a.closest('#cmdbar') || a.closest('#path-display') || a.closest('.cmd-hint')) return;
      if (a.closest('.cmd-list')) return;

      var href = a.getAttribute('href');
      var fullHref = a.href;
      var text = a.textContent.replace(/\[\d+\]$/, '').trim();

      if (!href || !text || text.length > 100) return;
      if (/^(javascript|#)/.test(href)) return;
      if (seen[fullHref]) return;
      seen[fullHref] = true;

      links.push({
        text: text,
        href: href,
        display: href,
        external: a.hostname !== location.hostname
      });
    });

    return links;
  }

  // ═══════════ View Switching ═══════════

  function showHomeView() {
    cmdView.hidden = true;
    cmdView.innerHTML = '';
    homeView.hidden = false;
    annotateLinks(homeView);
  }

  function showCmdView(html) {
    homeView.hidden = true;
    cmdView.innerHTML = html;
    cmdView.hidden = false;
    annotateLinks(cmdView);
    bindListClicks();
  }

  // ═══════════ Render ═══════════

  function renderList(items, flags) {
    if (!items.length) return '<p class="empty-msg">(empty)</p>';

    var html = '<div class="cmd-list">';
    items.forEach(function (it, i) {
      var suffix = it._isDir ? '/' : '';
      var metaParts = [];

      if (flags && flags.l) {
        if (it.date) metaParts.push(it.date);
        if (it.status) metaParts.push(it.status);
        if (it.words) metaParts.push(it.words + ' words');
        if (it.tags && it.tags.length) metaParts.push(it.tags.join(' · '));
        if (it.description) metaParts.push(truncStr(it.description, 30));
      } else {
        if (it.date) metaParts.push(it.date);
        if (it.status) metaParts.push(it.status);
        if (it.meta) metaParts.push(it.meta);
      }

      var meta = metaParts.join('  ');

      html += '<a class="cmd-list-item" href="' + (it.url || '#') + '" data-idx="' + i + '">'
           + '<span class="cmd-num">[' + (i + 1) + ']</span>'
           + '<span class="cmd-title">' + esc(it.title) + suffix + '</span>'
           + (meta ? '<span class="cmd-meta">' + esc(meta) + '</span>' : '')
           + '</a>';
    });
    html += '</div>';
    html += '<p class="cmd-hint">Click or <code>cat N</code> to view · Esc to go back · <code>open</code> links</p>';
    return html;
  }

  // ═══════════ Click Handlers ═══════════

  function bindListClicks() {
    cmdView.querySelectorAll('.cmd-list-item').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var idx = parseInt(el.dataset.idx, 10);
        if (isNaN(idx)) return;
        var item = currentList[idx];
        if (!item) return;
        if (item._isDir) {
          cmds.cd([item.title]);
        } else if (item.url) {
          doCat(idx + 1);
        }
      });
    });
  }

  function bindDirClicks() {
    cmdView.querySelectorAll('[data-dir]').forEach(function (el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function (e) {
        e.preventDefault();
        cmds.cd([el.dataset.dir]);
      });
    });
  }

  function bindLinkClicks() {
    cmdView.querySelectorAll('.cmd-link-entry').forEach(function (el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var idx = parseInt(el.dataset.link, 10);
        cmds.open([String(idx + 1)]);
      });
    });
  }

  // ═══════════ Bidirectional Sync (page click interception) ═══════════

  function onPageClick(e) {
    var a = e.target.closest('a');
    if (!a) return;

    // Don't intercept the cmdbar or hints
    if (a.closest('#cmdbar') || a.closest('.cmd-hint')) return;
    // Already-bound cmd-list-item
    if (a.classList.contains('cmd-list-item')) return;

    // Breadcrumb click
    if (a.closest('#path-display')) {
      e.preventDefault();
      var nav = a.dataset.nav;
      if (nav != null) {
        clearOverlay();
        cwd = nav;
        updatePrompt();
        renderBreadcrumb();
        renderDirectoryView();
      }
      return;
    }

    // External links: open in a new tab, don't intercept
    if (a.hostname && a.hostname !== location.hostname) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
      return;
    }

    // Internal links: intercept only on the homepage for SPA navigation (other pages have no terminal-data — do a real navigation to keep URLs correct)
    var href = a.getAttribute('href');
    if (isHome && href && href.startsWith('/')) {
      e.preventDefault();
      navigateToHref(href);
    }
  }

  /** Map a Hugo URL to a CLI path and navigate */
  function navigateToHref(href) {
    var parts = href.replace(/^\/|\/$/g, '').split('/');
    var dirMap = { posts: 'articles', projects: 'projects', moments: 'moments', tags: 'tags', categories: 'categories', series: 'series' };

    var section = parts[0];
    var slug = parts.slice(1).join('/');
    var dir = dirMap[section];

    // First segment is not a known section — maybe a language prefix (e.g. /zh/posts/...); try the second
    if (!dir && parts.length > 1) {
      section = parts[1];
      slug = parts.slice(2).join('/');
      dir = dirMap[section];
    }

    if (dir) {
      // Enter the matching section (hard navigation, clears the overlay stack)
      clearOverlay();
      cwd = '/' + dir;
      currentList = getList();
      updatePrompt();
      renderBreadcrumb();

      // If there is a slug, find the matching item and open it
      if (slug) {
        var match = currentList.findIndex(function (it) {
          return it.url && it.url.indexOf(slug) !== -1;
        });
        if (match >= 0) {
          doCat(match + 1);
          return;
        }
      }
      // No slug or no match — show the directory listing
      showCmdView(renderList(currentList, {}));
      pushState();
    } else {
      // Unknown section — navigate directly
      window.location.href = href;
    }
  }

  // ═══════════ History (pushState / popstate) ═══════════

  /** Restorable snapshot of the current view: directory + (optional) article open via cat */
  function snapshotState() {
    var s = { cwd: cwd };
    if (hasOverlay && currentArticle) {
      s.articleUrl = currentArticle.url;
      s.articleTitle = currentArticle.title;
    }
    return s;
  }

  /** Address-bar URL for a snapshot: real link for articles; directories map back to Hugo section / taxonomy pages */
  function urlForState(s) {
    if (s.articleUrl) return s.articleUrl;
    var parts = pathParts(s.cwd);
    if (!parts.length) return '/';
    var dir = parts[0], sub = parts[1];
    if (sub) {
      var terms = data[dir] || [];
      for (var i = 0; i < terms.length; i++) {
        if (terms[i].name.toLowerCase() === sub.toLowerCase() && terms[i].url) return terms[i].url;
      }
    }
    return '/' + (SEC_MAP[dir] || dir) + '/';
  }

  /** Push the current view into browser history, syncing the address bar */
  function pushState() {
    if (!isHome) return;
    var s = snapshotState();
    try { history.pushState(s, '', urlForState(s)); } catch (_) {}
  }

  /** popstate: re-render from the history snapshot (without pushing again) */
  function onPopState(e) {
    if (!e.state || typeof e.state.cwd !== 'string') return;
    applyState(e.state);
  }

  function applyState(s) {
    clearOverlay();
    cwd = s.cwd || '/';
    currentList = getList();
    updatePrompt();
    renderBreadcrumb();
    if (s.articleUrl) {
      for (var i = 0; i < currentList.length; i++) {
        if (currentList[i].url === s.articleUrl) {
          doCat(i + 1, true);
          return;
        }
      }
    }
    renderDirectoryView();
  }

  // ═══════════ UI Updates ═══════════

  function updatePrompt() {
    if (cmdPrompt) cmdPrompt.textContent = '~' + cwd + ' $';
  }

  function renderBreadcrumb() {
    if (!pathDisplay) return;
    var parts = pathParts(cwd);
    var html = '<a href="#" data-nav="/">~</a>';
    var acc = '';
    parts.forEach(function (p) {
      acc += '/' + p;
      html += '/<a href="#" data-nav="' + acc + '">' + p + '</a>';
    });
    // Overlay label (e.g. article title)
    if (viewLabel) {
      html += '/<span class="path-label">' + esc(viewLabel) + '</span>';
    }
    pathDisplay.innerHTML = html;
  }

  function flash(msg, type) {
    if (!cmdStatus) return;
    cmdStatus.textContent = msg;
    cmdStatus.className = 'cmd-status' + (type ? ' cmd-status-' + type : '');

    clearTimeout(statusTimer);
    if (msg) {
      statusTimer = setTimeout(function () {
        cmdStatus.textContent = '';
        cmdStatus.className = 'cmd-status';
      }, 3000);
    }
  }

  // ═══════════ Theme ═══════════

  function setTheme(name) {
    document.documentElement.setAttribute('data-theme', name);
    localStorage.setItem('th_theme', name);
    if (themeLabel) themeLabel.textContent = name;
  }

  function cycleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    var idx = THEMES.indexOf(cur);
    var next = THEMES[(idx + 1) % THEMES.length];
    setTheme(next);
    flash('Theme → ' + next, 'info');
  }

  // ═══════════ Utilities ═══════════

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function slugify(s) {
    return (s || '').toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '');
  }

  function truncStr(s, n) {
    return (s || '').length > n ? s.substring(0, n) + '…' : s;
  }

  function parseFlags(args, defaults) {
    var flags = {};
    for (var k in defaults) flags[k] = defaults[k];
    args.forEach(function (a) {
      if (a[0] !== '-') return;
      a.substring(1).split('').forEach(function (c) {
        if (c in flags) flags[c] = true;
      });
    });
    return flags;
  }

})();
