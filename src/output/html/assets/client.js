// testglass HTML レポートのクライアントスクリプト（依存なし・単一ファイルに埋め込まれる）
(function () {
  "use strict";

  var payload = JSON.parse(document.getElementById("testglass-data").textContent);
  var spec = payload.spec;
  var ruleMeta = {};
  payload.rules.forEach(function (r) {
    ruleMeta[r.id] = r;
  });

  /** 判定：テストについた警告のうち最も重いもの */
  var VERDICT = { error: "要修正", warn: "要確認", ok: "問題なし" };

  var MODIFIER = {
    skip: { label: "スキップ", title: ".skip / .fixme：実行されない" },
    only: { label: "only", title: ".only：このテストだけが実行される" },
    todo: { label: "未実装", title: ".todo：名前だけで中身がない" },
    each: { label: "データ駆動", title: "it.each など：データの数だけ実行時に生成される" },
  };

  /** Playwright の操作名 → 表示 */
  var VERBS = {
    goto: "開く",
    reload: "再読み込み",
    goBack: "戻る",
    goForward: "進む",
    click: "クリック",
    dblclick: "ダブルクリック",
    tap: "タップ",
    fill: "入力",
    type: "入力",
    pressSequentially: "入力",
    insertText: "入力",
    press: "キー入力",
    down: "キー押下",
    up: "キー解放",
    check: "チェック",
    uncheck: "チェック解除",
    setChecked: "チェック設定",
    selectOption: "選択",
    selectText: "テキスト選択",
    hover: "ホバー",
    focus: "フォーカス",
    blur: "フォーカス解除",
    clear: "クリア",
    setInputFiles: "ファイル指定",
    dragTo: "ドラッグ",
    dragAndDrop: "ドラッグ",
    move: "マウス移動",
    wheel: "スクロール",
    waitForTimeout: "待機",
  };

  // ---------------------------------------------------------------- 保存（失敗しても動く）
  function load(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }

  // ---------------------------------------------------------------- DOM ヘルパー
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === "text") node.textContent = v;
        else if (k === "class") node.className = v;
        else node.setAttribute(k, v === true ? "" : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  // ---------------------------------------------------------------- 表示テーマ
  var THEMES = ["auto", "light", "dark"];
  var THEME_LABEL = { auto: "表示: OS の設定に従う", light: "表示: ライト", dark: "表示: ダーク" };
  // 固定の SVG（データは含まない）
  var THEME_ICON = {
    auto: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" stroke="none"/></svg>',
    light:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>',
    dark: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z"/></svg>',
  };
  var themeBtn = document.getElementById("theme");
  var theme = load("testglass-theme") || "auto";
  if (THEMES.indexOf(theme) < 0) theme = "auto";
  function applyTheme() {
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    themeBtn.innerHTML = THEME_ICON[theme];
    themeBtn.title = THEME_LABEL[theme];
  }
  applyTheme();
  themeBtn.addEventListener("click", function () {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    applyTheme();
    save("testglass-theme", theme);
  });

  // ---------------------------------------------------------------- 集計
  function verdictOf(test) {
    var v = "ok";
    test.warnings.forEach(function (w) {
      if (w.severity === "error") v = "error";
      else if (v === "ok") v = "warn";
    });
    return v;
  }
  function uniqueRules(warnings) {
    var seen = {};
    return warnings.filter(function (w) {
      if (seen[w.rule]) return false;
      seen[w.rule] = true;
      return true;
    });
  }

  var entries = [];
  spec.files.forEach(function (file) {
    file.tests.forEach(function (test) {
      entries.push({ file: file, test: test, verdict: verdictOf(test) });
    });
  });
  /** 判定ごと・指摘の種類ごとの件数。framework を指定するとそのフレームワークだけを数える */
  function tally(framework) {
    var counts = { all: 0, error: 0, warn: 0, ok: 0 };
    var byRule = {};
    entries.forEach(function (e) {
      if (framework && e.file.framework !== framework) return;
      counts.all++;
      counts[e.verdict]++;
      uniqueRules(e.test.warnings).forEach(function (w) {
        var r = (byRule[w.rule] = byRule[w.rule] || { n: 0, verdict: "warn" });
        r.n++;
        if (w.severity === "error") r.verdict = "error";
      });
    });
    return { counts: counts, byRule: byRule };
  }
  var total = tally("").counts;

  // ---------------------------------------------------------------- 見出し
  var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(spec.generatedAt);
  var lead = document.getElementById("lead");
  [
    m ? m[1] + "." + m[2] + "." + m[3] + " " + m[4] + ":" + m[5] : spec.generatedAt,
    spec.files.length + " files",
    total.all + " tests",
    "静的解析（テストは実行していない）",
  ].forEach(function (text, i) {
    if (i) lead.appendChild(el("span", { class: "sep", text: "·" }));
    lead.appendChild(document.createTextNode(text));
  });

  var state = { verdict: "all", q: "", framework: "", rule: "" };

  // 指摘の種類ごとの件数（判定ごとに1行。クリックで絞り込み）
  var chips = document.getElementById("rules");
  var chipButtons = [];
  function renderChips(byRule) {
    chips.textContent = "";
    chipButtons = [];
    var found = payload.rules
      .filter(function (r) {
        return byRule[r.id];
      })
      .sort(function (a, b) {
        return byRule[b.id].n - byRule[a.id].n;
      });
    if (!found.length) chips.appendChild(el("p", { class: "chips-none", text: "指摘なし" }));
    ["error", "warn"].forEach(function (verdict) {
      var inRow = found.filter(function (r) {
        return byRule[r.id].verdict === verdict;
      });
      if (!inRow.length) return;
      var items = el("div", { class: "rule-items" });
      inRow.forEach(function (r) {
        var chip = el(
          "button",
          { type: "button", class: "chip", "aria-pressed": "false", title: r.description + "（" + r.id + "）" },
          [el("span", { class: "n", text: String(byRule[r.id].n) }), r.label],
        );
        chip.addEventListener("click", function () {
          setRule(state.rule === r.id ? "" : r.id);
        });
        chip._rule = r.id;
        chipButtons.push(chip);
        items.appendChild(chip);
      });
      chips.appendChild(
        el("div", { class: "rule-row " + verdict }, [
          el("span", { class: "rule-verdict", text: VERDICT[verdict] }),
          items,
        ]),
      );
    });
  }

  // ---------------------------------------------------------------- ツールバー
  var judge = document.getElementById("judge");
  var judgeButtons = [];
  [
    ["all", "すべて"],
    ["error", "要修正"],
    ["warn", "要確認"],
    ["ok", "問題なし"],
  ].forEach(function (j) {
    var n = el("span", { class: "n" });
    var btn = el("button", { type: "button", "aria-pressed": "false" }, [j[1], n]);
    btn.addEventListener("click", function () {
      state.verdict = j[0];
      update();
    });
    btn._verdict = j[0];
    btn._n = n;
    judgeButtons.push(btn);
    judge.appendChild(btn);
  });

  function renderJudgeCounts(counts) {
    judgeButtons.forEach(function (b) {
      var v = b._verdict;
      b._n.className = "n" + (counts[v] && (v === "error" || v === "warn") ? " " + v : "");
      b._n.textContent = String(counts[v]);
    });
  }

  /** 件数の表示を、選んでいるフレームワークに合わせて作り直す */
  var countedFramework = null;
  function renderCounts() {
    if (countedFramework === state.framework) return;
    countedFramework = state.framework;
    var t = tally(state.framework);
    // 選んでいた指摘がこのフレームワークに無ければ、その絞り込みを外す
    if (state.rule && !t.byRule[state.rule]) state.rule = "";
    renderJudgeCounts(t.counts);
    renderChips(t.byRule);
  }

  var qInput = document.getElementById("q");

  // フレームワークごとのタブ（2種類以上あるときだけ出す）
  var fwNav = document.getElementById("framework");
  var fwButtons = [];
  var byFramework = {};
  entries.forEach(function (e) {
    byFramework[e.file.framework] = (byFramework[e.file.framework] || 0) + 1;
  });
  var frameworks = Object.keys(byFramework).sort();
  if (frameworks.length >= 2) {
    fwNav.hidden = false;
    [["", "すべて", total.all]]
      .concat(
        frameworks.map(function (fw) {
          return [fw, fw, byFramework[fw]];
        }),
      )
      .forEach(function (f) {
        var btn = el("button", { type: "button", "aria-pressed": "false" }, [
          f[1],
          el("span", { class: "n", text: String(f[2]) }),
        ]);
        btn.addEventListener("click", function () {
          state.framework = f[0];
          update();
        });
        btn._framework = f[0];
        fwButtons.push(btn);
        fwNav.appendChild(btn);
      });
  }

  function setRule(id) {
    state.rule = id;
    update();
  }

  // ---------------------------------------------------------------- 本文
  var results = document.getElementById("results");
  var rows = [];
  var sections = [];

  function renderStep(text) {
    var depth = /^ */.exec(text)[0].length / 2;
    var body = text.trim();
    var li = el("li", {
      class: depth ? "nested" : null,
      style: depth > 1 ? "margin-left:" + (depth - 1) * 1.2 + "em" : null,
    });
    var mm = /^mock: (.*)$/.exec(body);
    if (mm) {
      li.appendChild(el("span", { class: "verb", text: "モック", title: "本物の代わりの部品を用意している" }));
      li.appendChild(el("code", { text: mm[1] }));
      return li;
    }
    mm = /^(?:(keyboard|mouse|touchscreen)\.)?([A-Za-z]+)(?: (.*))?$/.exec(body);
    if (mm && VERBS[mm[2]]) {
      li.appendChild(
        el("span", {
          class: "verb" + (mm[2] === "waitForTimeout" ? " wait" : ""),
          text: VERBS[mm[2]],
          title: (mm[1] ? mm[1] + "." : "") + mm[2],
        }),
      );
      if (mm[3]) li.appendChild(el("code", { text: mm[3] }));
      return li;
    }
    // コードそのままの手順は等幅、test.step のタイトルなどの文章はそのまま
    li.appendChild(/[();={}]|=>/.test(body) ? el("code", { text: body }) : document.createTextNode(body));
    return li;
  }

  function renderCase(entry, no) {
    var t = entry.test;
    var isTodo = t.modifiers.indexOf("todo") >= 0;
    var btn = el("button", {
      type: "button",
      class: "no-btn",
      "aria-expanded": "false",
      "aria-label": no + " の詳細を開く",
      text: no,
    });

    var mods = t.modifiers.length
      ? el(
          "span",
          { class: "mods" },
          t.modifiers.map(function (mod) {
            var info = MODIFIER[mod] || { label: mod, title: mod };
            return el("span", { class: "m-" + mod, title: info.title, text: info.label });
          }),
        )
      : null;

    var steps = t.steps.length
      ? el("ol", { class: "steps" }, t.steps.map(renderStep))
      : el("span", { class: "nil", text: "—" });
    var asserts = t.assertions.length
      ? el(
          "ul",
          { class: "asserts" },
          t.assertions.map(function (a) {
            return el("li", null, [el("code", { text: a.text })]);
          }),
        )
      : el("span", { class: isTodo ? "nil" : "nil bad", text: isTodo ? "未実装" : "なし" });

    var judgeCell = el("td", { class: "judge-cell", "data-label": "判定" }, [
      el("div", { class: "verdict " + entry.verdict, text: VERDICT[entry.verdict] }),
    ]);
    if (t.warnings.length) {
      judgeCell.appendChild(
        el(
          "ul",
          { class: "findings" },
          uniqueRules(t.warnings).map(function (w) {
            var meta = ruleMeta[w.rule];
            return el("li", { title: w.message, text: meta ? meta.label : w.rule });
          }),
        ),
      );
    }

    var tr = el("tr", { class: "case v-" + entry.verdict, id: "t-" + t.id }, [
      el("td", { class: "no" }, [btn]),
      el("td", { "data-label": "テスト名" }, [mods, el("span", { class: "title", text: t.title })]),
      el("td", { "data-label": "手順" }, [steps]),
      el("td", { "data-label": "期待結果" }, [asserts]),
      judgeCell,
    ]);
    var detail = el("tr", { class: "detail", hidden: true });
    var rendered = false;

    function setOpen(open) {
      if (open && !rendered) {
        rendered = true;
        detail.appendChild(el("td", { colspan: "5" }, [renderDetail(entry)]));
      }
      detail.hidden = !open;
      tr.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", String(open));
    }
    tr.addEventListener("click", function (ev) {
      // 文字を選択しているときは開閉しない
      if (ev.target !== btn && String(window.getSelection && window.getSelection()).length) return;
      setOpen(detail.hidden);
    });
    return { tr: tr, detail: detail, setOpen: setOpen };
  }

  function renderDetail(entry) {
    var t = entry.test;
    var assertLines = {};
    t.assertions.forEach(function (a) {
      assertLines[a.line] = true;
    });
    var warnLines = {};
    t.warnings.forEach(function (w) {
      if (w.line && w.line !== t.location.line) {
        warnLines[w.line] = w.severity === "error" || warnLines[w.line] === "error" ? "error" : "warn";
      }
    });

    var lineNodes = {};
    var pre = el("pre", { class: "source" });
    t.source.split("\n").forEach(function (text, i) {
      var ln = t.location.line + i;
      var cls = "line" + (warnLines[ln] ? " is-" + warnLines[ln] : assertLines[ln] ? " is-assert" : "");
      var node = el("div", { class: cls }, [
        el("span", { class: "ln", text: String(ln) }),
        el("span", { class: "code", text: text }),
      ]);
      lineNodes[ln] = node;
      pre.appendChild(node);
    });
    function jumpTo(ln) {
      var node = lineNodes[ln];
      if (!node) return;
      node.scrollIntoView({ block: "center", behavior: "smooth" });
      node.classList.add("flash");
      setTimeout(function () {
        node.classList.remove("flash");
      }, 1200);
    }

    var children = [];
    if (t.warnings.length) {
      var issues = el("div", { class: "issues" });
      t.warnings.forEach(function (w) {
        var meta = ruleMeta[w.rule];
        var title = el("div", { class: "issue-title" }, [
          meta ? meta.label : w.rule,
          el("span", { class: "rule-id", text: w.rule }),
        ]);
        if (w.line && lineNodes[w.line]) {
          var link = el("button", { type: "button", class: "link", text: w.line + " 行目 →" });
          link.addEventListener("click", function () {
            jumpTo(w.line);
          });
          title.appendChild(link);
        }
        var body = el("div", null, [title, el("p", { text: w.message })]);
        if (meta) {
          body.appendChild(
            el("dl", null, [
              el("dt", { text: "理由" }),
              el("dd", { text: meta.why }),
              el("dt", { text: "対処" }),
              el("dd", { text: meta.fix }),
            ]),
          );
        }
        issues.appendChild(
          el("div", { class: "issue" }, [el("div", { class: "sev " + w.severity, text: VERDICT[w.severity] }), body]),
        );
      });
      children.push(el("section", null, [el("h3", { class: "label", text: "指摘" }), issues]));
    }

    children.push(
      el("section", null, [
        el("div", { class: "source-head" }, [
          el("h3", { class: "label", text: "ソース" }),
          el("span", { class: "loc mono", text: entry.file.path + ":" + t.location.line }),
          el("span", { class: "legend" }, [
            el("span", null, [el("i", { class: "l-assert" }), "検証している行"]),
            el("span", null, [el("i", { class: "l-warn" }), "指摘のある行"]),
          ]),
        ]),
        pre,
      ]),
    );
    var body = el("div", { class: "detail-body" }, children);
    // 詳細の中のクリックで行が閉じないようにする
    body.addEventListener("click", function (ev) {
      ev.stopPropagation();
    });
    return body;
  }

  var byFile = {};
  entries.forEach(function (e) {
    (byFile[e.file.path] = byFile[e.file.path] || []).push(e);
  });

  spec.files.forEach(function (file, fi) {
    var fileEntries = byFile[file.path] || [];
    var fileNo = fi + 1;
    var nErr = 0;
    var nWarn = 0;
    fileEntries.forEach(function (e) {
      if (e.verdict === "error") nErr++;
      if (e.verdict === "warn") nWarn++;
    });
    var meta = el("span", { class: "meta" }, [
      file.framework,
      " · ",
      el("span", { class: "n", text: String(fileEntries.length) }),
      " tests",
    ]);
    if (nErr) meta.appendChild(el("span", null, [" · ", el("span", { class: "error", text: "要修正 " + nErr })]));
    if (nWarn) meta.appendChild(el("span", null, [" · ", el("span", { class: "warn", text: "要確認 " + nWarn })]));
    var section = el("section", { class: "file" }, [
      el("div", { class: "file-head" }, [el("h2", { class: "mono", text: file.path }), meta]),
    ]);

    var fileRows = [];
    if (!fileEntries.length) {
      section.appendChild(el("p", { class: "file-empty", text: "テストが見つからない" }));
    } else {
      var tbody = el("tbody");
      var prevKey = null;
      var group = null;
      fileEntries.forEach(function (entry, ti) {
        var t = entry.test;
        var key = JSON.stringify(t.suites);
        if (key !== prevKey) {
          prevKey = key;
          var header = null;
          if (t.suites.length) {
            var cell = el("td", { colspan: "5" });
            t.suites.forEach(function (s, i) {
              if (i) cell.appendChild(el("span", { class: "sep", text: "/" }));
              cell.appendChild(document.createTextNode(s));
            });
            header = el("tr", { class: "group" }, [cell]);
            tbody.appendChild(header);
          }
          group = { header: header, rows: [] };
        }
        var c = renderCase(entry, fileNo + "-" + (ti + 1));
        tbody.appendChild(c.tr);
        tbody.appendChild(c.detail);
        var search = [file.path, t.suites.join(" "), t.title]
          .concat(
            t.steps,
            t.assertions.map(function (a) {
              return a.text;
            }),
            t.warnings.map(function (w) {
              return w.message + " " + w.rule + " " + (ruleMeta[w.rule] ? ruleMeta[w.rule].label : "");
            }),
          )
          .join("\n")
          .toLowerCase();
        var row = { c: c, search: search, entry: entry, group: group, visible: true };
        group.rows.push(row);
        fileRows.push(row);
        rows.push(row);
      });
      var table = el("table", { class: "spec" }, [
        el("colgroup", null, [
          el("col", { class: "c-no" }),
          el("col", { class: "c-title" }),
          el("col", { class: "c-steps" }),
          el("col", { class: "c-asserts" }),
          el("col", { class: "c-judge" }),
        ]),
        el("thead", null, [
          el("tr", null, [
            el("th", { text: "項番" }),
            el("th", { text: "テスト名" }),
            el("th", { text: "手順" }),
            el("th", { text: "期待結果" }),
            el("th", { text: "判定" }),
          ]),
        ]),
        tbody,
      ]);
      section.appendChild(el("div", { class: "table-wrap" }, [table]));
    }
    sections.push({ node: section, rows: fileRows });
    results.appendChild(section);
  });

  var resetBtn = el("button", { type: "button", class: "link", text: "絞り込みを解除" });
  resetBtn.addEventListener("click", function () {
    state.verdict = "all";
    state.q = "";
    qInput.value = "";
    state.framework = "";
    setRule("");
  });
  var noResults = el("p", { class: "no-results", hidden: true }, ["該当するテストはない", resetBtn]);
  results.appendChild(noResults);

  // ---------------------------------------------------------------- 絞り込み

  function matches(row) {
    var e = row.entry;
    if (state.verdict !== "all" && e.verdict !== state.verdict) return false;
    if (state.framework && e.file.framework !== state.framework) return false;
    if (
      state.rule &&
      !e.test.warnings.some(function (w) {
        return w.rule === state.rule;
      })
    )
      return false;
    if (state.q) {
      var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < terms.length; i++) if (row.search.indexOf(terms[i]) < 0) return false;
    }
    return true;
  }

  function update() {
    renderCounts();
    var shown = 0;
    rows.forEach(function (row) {
      row.visible = matches(row);
      row.c.tr.hidden = !row.visible;
      if (!row.visible) row.c.detail.hidden = true;
      else if (row.c.tr.classList.contains("is-open")) row.c.detail.hidden = false;
      if (row.visible) shown++;
    });
    rows.forEach(function (row) {
      var g = row.group;
      if (g.header)
        g.header.hidden = !g.rows.some(function (r) {
          return r.visible;
        });
    });
    var filtering = state.verdict !== "all" || !!(state.q || state.framework || state.rule);
    sections.forEach(function (section) {
      // テストの無いファイルは、絞り込んでいないときだけ表示する
      section.node.hidden = section.rows.length
        ? !section.rows.some(function (r) {
            return r.visible;
          })
        : filtering;
    });
    noResults.hidden = shown > 0;
    judgeButtons.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b._verdict === state.verdict));
    });
    chipButtons.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b._rule === state.rule));
    });
    fwButtons.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b._framework === state.framework));
    });
  }

  qInput.addEventListener("input", function () {
    state.q = qInput.value.trim();
    update();
  });
  document.getElementById("expand").addEventListener("click", function () {
    rows.forEach(function (r) {
      if (r.visible) r.c.setOpen(true);
    });
  });
  document.getElementById("collapse").addEventListener("click", function () {
    rows.forEach(function (r) {
      r.c.setOpen(false);
    });
  });

  update();

  // #t-<id> で開いたときは、そのテストを展開してスクロールする
  function openFromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    rows.forEach(function (r) {
      if ("t-" + r.entry.test.id === id) {
        r.c.tr.hidden = false;
        r.c.setOpen(true);
        r.c.tr.scrollIntoView({ block: "start" });
      }
    });
  }
  window.addEventListener("hashchange", openFromHash);
  openFromHash();
})();
