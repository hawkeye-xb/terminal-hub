/**
 * Terminal Hub CLI — 纯原生 JS，零外部依赖
 *
 * 架构：命令栏(底部) = 操控器，页面内容区 = 显示器
 * 点击和命令操作同一个状态，双向同步
 *
 * 视图模型：
 *   cwd        → 当前目录（/、/articles、/tags/Rust …）
 *   overlay    → 覆盖在目录视图上的临时内容（cat/help/tree/grep/open）
 *   Esc/cd ..  → 先退 overlay，再退目录
 *   history    → 硬导航 pushState 快照，浏览器前进/后退经 popstate 重渲染
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
  var isHome      = false;   // 是否在 Hugo 首页（有 terminal-data）
  var cwd         = '/';
  var currentList = [];      // 当前目录列表项
  var pageLinks   = [];      // 当前页面标注的链接

  // Overlay 视图覆盖栈（cat → help → Esc 回 cat → Esc 回列表）
  var overlayStack = [];     // 栈元素: { viewLabel, html, list, article }
  var hasOverlay   = false;  // 当前是否在覆盖视图
  var viewLabel    = null;   // 当前覆盖层面包屑标签（如文章标题）
  var currentArticle = null; // 当前 cat 打开的文章 { url, title }，用于 history 快照

  // 命令历史
  var cmdHistory    = [];
  var cmdHistoryPos = -1;
  var savedInput    = '';

  // Tab 补全
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
    // 解析 Hugo 注入的 JSON 数据
    var el = document.getElementById('terminal-data');
    if (el) {
      try { data = JSON.parse(el.textContent); } catch (_) {}
      isHome = true;
    }

    // 恢复命令历史
    try { cmdHistory = JSON.parse(localStorage.getItem('th_cmd_history') || '[]'); } catch (_) { cmdHistory = []; }

    // 缓存 DOM
    homeView     = document.getElementById('home-view');
    cmdView      = document.getElementById('cmd-view');
    pathDisplay  = document.getElementById('path-display');
    cmdInput     = document.getElementById('cmd-input');
    cmdPrompt    = document.getElementById('cmd-prompt');
    compDropdown = document.getElementById('cmd-completions');
    cmdStatus    = document.getElementById('cmd-status');
    themeLabel   = document.getElementById('theme-label');

    // 绑定事件
    cmdInput.addEventListener('keydown', onKeydown);
    cmdInput.addEventListener('input', onInput);

    // 点击 cmdbar 任意位置聚焦输入
    document.getElementById('cmdbar').addEventListener('click', function (e) {
      if (e.target.closest('#cmd-completions')) return;
      cmdInput.focus();
    });

    // 主题按钮
    document.getElementById('theme-toggle').addEventListener('click', function () {
      cycleTheme();
    });

    // 全局点击：拦截页面内导航链接
    document.addEventListener('click', onPageClick);

    // 全局键盘（Esc 必须全局，点击页面链接后焦点不在 input）
    document.addEventListener('keydown', function (e) {
      // Esc：关闭补全 / 后退
      if (e.key === 'Escape') {
        e.preventDefault();
        if (compVisible) {
          hideComp();
        } else {
          doGoBack();
        }
        return;
      }
      // / 聚焦命令栏
      if (e.key === '/' && !isInputEl(document.activeElement)) {
        e.preventDefault();
        cmdInput.focus();
      }
      // 非首页按 q 返回
      if (!isHome && e.key === 'q' && !isInputEl(document.activeElement)) {
        window.history.back();
      }
    });

    // 恢复主题
    var saved = localStorage.getItem('th_theme');
    if (saved && THEMES.indexOf(saved) !== -1) setTheme(saved);

    // 初始渲染
    updatePrompt();
    renderBreadcrumb();
    if (isHome) {
      annotateLinks(homeView);
      // 首页启用 SPA 状态同步：写入初始快照，监听浏览器前进/后退
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

      // Esc 由全局 handler 处理，不在这里
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

    // 保存历史（去重连续相同）
    if (cmdHistory[0] !== raw) {
      cmdHistory.unshift(raw);
      if (cmdHistory.length > MAX_HIST) cmdHistory.pop();
      try { localStorage.setItem('th_cmd_history', JSON.stringify(cmdHistory)); } catch (_) {}
    }
    cmdHistoryPos = -1;
    savedInput = '';

    // 解析
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
   * 进入覆盖层前调用：保存当前覆盖状态到栈
   * cat/help/tree/grep/open-list/pwd 都在开头调用此函数
   */
  function pushOverlay(label) {
    if (hasOverlay) {
      // 当前已有覆盖层 → 压栈保存（如 cat 文章 → help，保存文章状态）
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
   * 统一的"后退"逻辑（Esc 和 cd .. 都走这里）
   * 1. 有栈中的覆盖层 → 弹出恢复上一个覆盖视图
   * 2. 有覆盖层但栈空 → 回到当前目录视图
   * 3. 没有覆盖层 → 进入上级目录
   */
  function doGoBack() {
    if (hasOverlay) {
      if (overlayStack.length > 0) {
        // 恢复上一个覆盖层（如从 help 回到 cat 的文章）
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
      // 栈空：退出覆盖层，回到目录视图
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

  /** 清空覆盖栈（cd / navigateToHref 等"硬导航"时调用） */
  function clearOverlay() {
    overlayStack = [];
    hasOverlay = false;
    viewLabel = null;
    currentArticle = null;
  }

  /**
   * 渲染当前 cwd 对应的目录视图（不带 overlay）
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

    // cd .. → 统一后退逻辑
    if (target === '..') {
      doGoBack();
      return;
    }

    var np = normPath(target);
    if (!pathExists(np)) {
      flash('cd: ' + target + ': No such directory', 'error');
      return;
    }

    // 清除覆盖栈，进入新目录
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
      // 根目录：列出顶级目录（overlay，Esc 回首页）
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
      html += '<p class="cmd-hint"><code>cd &lt;dir&gt;</code> 进入 · Esc 返回 · <code>help</code> 查看全部命令</p>';
      showCmdView(html);
      bindDirClicks();
      return;
    }

    // 非根目录：显示当前目录列表（就是目录视图本身，不算 overlay）
    // 统一走 clearOverlay，避免 overlayStack 残留导致 Esc 恢复出过期视图
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

    // 确保有列表
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
      // 列出链接（overlay）
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
      html += '<p class="cmd-hint"><code>open N</code> 打开 · Esc 返回</p>';
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

    // grep 结果是 overlay
    pushOverlay('grep: ' + kw);

    currentList = results;
    if (!results.length) {
      showCmdView('<p class="empty-msg">No matches for "' + esc(kw) + '"</p>'
                + '<p class="cmd-hint">Esc 返回</p>');
    } else {
      showCmdView(renderList(results, {})
                + '<p class="cmd-hint">' + results.length + ' result(s) · Esc 返回</p>');
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
              + '<p class="cmd-hint">Esc 返回</p>');
  };

  // ── pwd ──
  cmds.pwd = function () {
    pushOverlay(null);
    showCmdView('<p class="pwd-output">~' + esc(cwd) + '</p>'
              + '<p class="cmd-hint">Esc 返回</p>');
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
      ['cd &lt;dir&gt;',       '进入目录 (articles / projects / moments / tags / categories / series)'],
      ['cd ..',               '返回上级 · Esc 快捷键'],
      ['ls [-l]',             '列出当前目录'],
      ['cat &lt;N | name&gt;','查看第 N 项内容'],
      ['open',                '列出当前页面所有链接'],
      ['open &lt;N&gt;',      '打开第 N 个链接'],
      ['grep &lt;keyword&gt;','全站搜索'],
      ['tree',                '目录总览'],
      ['pwd',                 '当前路径'],
      ['theme [name]',        '切换主题 (' + THEMES.join(' / ') + ')'],
      ['clear',               '回到首页'],
      ['help',                '显示此帮助'],
    ];
    var html = '<div class="help-table">';
    rows.forEach(function (r) {
      html += '<div class="help-row"><code>' + r[0] + '</code><span>' + r[1] + '</span></div>';
    });
    html += '</div>';
    html += '<p class="cmd-hint">Tab 补全 · ↑↓ 命令历史 · Esc 返回 · / 聚焦命令栏</p>';
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

  // ═══════════ cat: 加载并渲染内容 ═══════════

  function doCat(n, skipPush) {
    if (!n || n < 1 || n > currentList.length) {
      flash('cat: invalid index', 'error');
      return;
    }

    var item = currentList[n - 1];
    if (!item) return;

    // 目录 → cd 进去
    if (item._isDir) {
      cmds.cd([item.title]);
      return;
    }

    if (!item.url) {
      flash('cat: no URL', 'error');
      return;
    }

    // 覆盖层：显示文章名在面包屑
    pushOverlay(item.title);
    currentArticle = { url: item.url, title: item.title };
    if (!skipPush) pushState();
    flash('Loading...', 'info');

    fetch(item.url)
      .then(function (res) { return res.text(); })
      .then(function (html) {
        var content = extractArticle(html);
        var hint = '<p class="cmd-hint"><code>cd ..</code> / Esc 返回列表 · <code>open</code> 查看链接</p>';
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
        if (it.words) metaParts.push(it.words + ' 字');
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
    html += '<p class="cmd-hint">点击或 <code>cat N</code> 查看 · Esc 返回 · <code>open</code> 链接</p>';
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

  // ═══════════ Bidirectional Sync (页面点击拦截) ═══════════

  function onPageClick(e) {
    var a = e.target.closest('a');
    if (!a) return;

    // 不拦截 cmdbar、hint
    if (a.closest('#cmdbar') || a.closest('.cmd-hint')) return;
    // 已绑定的 cmd-list-item
    if (a.classList.contains('cmd-list-item')) return;

    // 面包屑点击
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

    // 外链：新标签打开，不拦截
    if (a.hostname && a.hostname !== location.hostname) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
      return;
    }

    // 内链：仅首页拦截做 SPA 导航（非首页没有 terminal-data，直接走真实跳转保证 URL 正确）
    var href = a.getAttribute('href');
    if (isHome && href && href.startsWith('/')) {
      e.preventDefault();
      navigateToHref(href);
    }
  }

  /** 把 Hugo URL 映射到 CLI 路径并导航 */
  function navigateToHref(href) {
    var parts = href.replace(/^\/|\/$/g, '').split('/');
    var dirMap = { posts: 'articles', projects: 'projects', moments: 'moments', tags: 'tags', categories: 'categories', series: 'series' };

    var section = parts[0];
    var slug = parts.slice(1).join('/');
    var dir = dirMap[section];

    // 第一段不是已知 section，可能是语言前缀（如 /zh/posts/...），尝试第二段
    if (!dir && parts.length > 1) {
      section = parts[1];
      slug = parts.slice(2).join('/');
      dir = dirMap[section];
    }

    if (dir) {
      // 进入对应 section（硬导航，清空覆盖栈）
      clearOverlay();
      cwd = '/' + dir;
      currentList = getList();
      updatePrompt();
      renderBreadcrumb();

      // 如果有 slug，找到对应项并打开
      if (slug) {
        var match = currentList.findIndex(function (it) {
          return it.url && it.url.indexOf(slug) !== -1;
        });
        if (match >= 0) {
          doCat(match + 1);
          return;
        }
      }
      // 没有 slug 或没找到匹配，显示目录列表
      showCmdView(renderList(currentList, {}));
      pushState();
    } else {
      // 未知 section，直接跳转
      window.location.href = href;
    }
  }

  // ═══════════ History (pushState / popstate) ═══════════

  /** 当前视图的可恢复快照：目录 + （可选）正在 cat 的文章 */
  function snapshotState() {
    var s = { cwd: cwd };
    if (hasOverlay && currentArticle) {
      s.articleUrl = currentArticle.url;
      s.articleTitle = currentArticle.title;
    }
    return s;
  }

  /** 快照对应的地址栏 URL：文章用真实链接，目录映射回 Hugo section / taxonomy 页 */
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

  /** 把当前视图压入浏览器历史，地址栏同步显示对应 URL */
  function pushState() {
    if (!isHome) return;
    var s = snapshotState();
    try { history.pushState(s, '', urlForState(s)); } catch (_) {}
  }

  /** popstate：按历史快照重新渲染（不重复压栈） */
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
    // 覆盖层标签（如文章标题）
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
