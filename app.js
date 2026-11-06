/* ═══ 格纸间 · Markdown 写字间 —— 自研渲染器 + 逻辑层 ═══ */
"use strict";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
window.addEventListener("error", (e) => { $("#errSink").textContent += "ERR:" + e.message + ";"; });

/* ═══════════ 自研 Markdown 渲染器 ═══════════ */
function inline(s) {
  /* 行内：代码 → 图片 → 链接 → 粗 → 斜 → 删 → 转义 */
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return "\u0000C" + (codes.length - 1) + "\u0000"; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  s = s.replace(/\u0000C(\d+)\u0000/g, (m, i) => "<code>" + codes[+i] + "</code>");
  return s;
}

function render(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  let para = [];
  const flush = () => {
    if (para.length) { out.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; }
  };
  while (i < lines.length) {
    const L = lines[i];

    /* 代码块围栏 */
    if (/^```/.test(L.trim())) {
      flush();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
      i++;
      out.push("<pre><code>" + esc(buf.join("\n")) + "</code></pre>");
      continue;
    }
    /* 标题 */
    const h = /^(#{1,4})\s+(.*)$/.exec(L);
    if (h) {
      flush();
      const lv = h[1].length;
      out.push("<h" + lv + ">" + inline(h[2].trim()) + "</h" + lv + ">");
      i++; continue;
    }
    /* 分隔线 */
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(L)) { flush(); out.push("<hr>"); i++; continue; }
    /* 引用块 */
    if (/^\s*>\s?/.test(L)) {
      flush();
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push("<blockquote>" + buf.map((b) => "<p>" + inline(b) + "</p>").join("") + "</blockquote>");
      continue;
    }
    /* 表格 */
    if (L.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      flush();
      const cells = (row) => row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
      const head = cells(L);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|")) { rows.push(cells(lines[i])); i++; }
      out.push("<table><thead><tr>" + head.map((c) => "<th>" + inline(c) + "</th>").join("") +
        "</tr></thead><tbody>" +
        rows.map((r) => "<tr>" + r.map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>").join("") +
        "</tbody></table>");
      continue;
    }
    /* 任务列表 / 无序列表 */
    if (/^\s*[-*+]\s+/.test(L)) {
      flush();
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        let t = lines[i].replace(/^\s*[-*+]\s+/, "");
        const todo = /^\[ \]\s*/.test(t);
        const done = /^\[x\]\s*/i.test(t);
        if (todo || done) t = t.replace(/^\[[ xX]\]\s*/, "");
        items.push({ t: inline(t), done });
        i++;
      }
      out.push("<ul>" + items.map((x) =>
        "<li" + (x.done ? " class='done'" : "") + ">" + (x.done ? "☑ " : "") + x.t + "</li>").join("") + "</ul>");
      continue;
    }
    /* 有序列表 */
    if (/^\s*\d+\.\s+/.test(L)) {
      flush();
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^\s*\d+\.\s+/, "")));
        i++;
      }
      out.push("<ol>" + items.map((t) => "<li>" + t + "</li>").join("") + "</ol>");
      continue;
    }
    /* 空行 */
    if (!L.trim()) { flush(); i++; continue; }
    /* 普通段落 */
    para.push(L.trim());
    i++;
  }
  flush();
  return out.join("\n");
}

/* ═══ 双栏联动 ═══ */
const editor = $("#editor");
const preview = $("#preview");
const LS_MD = "md_gridpaper_v1";

let saveTimer = null;
function update() {
  preview.innerHTML = render(editor.value);
  const v = editor.value;
  const chars = v.length;
  const words = v.trim() ? v.trim().split(/[\s,，。.!？?；;\n]+/).filter(Boolean).length : 0;
  const lines = v ? v.split("\n").length : 0;
  $("#stStats").textContent = "字 " + chars + " · 词 " + words + " · 行 " + lines;
  $("#stRead").textContent = "读完约 " + Math.max(1, Math.round(chars / 400)) + " 分钟（按 400 字/分）";
  $("#saveState").textContent = "输入中…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_MD, v); } catch {}
    $("#saveState").textContent = "已自动保存 " + new Date().toTimeString().slice(0, 5);
  }, 600);
}
editor.addEventListener("input", update);

/* ═══ 工具条插入 ═══ */
$("#toolbar").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-md]");
  if (!b) return;
  const md = b.dataset.md.replace(/^\\n/, "\n");
  const start = editor.selectionStart, end = editor.selectionEnd;
  const sel = editor.value.slice(start, end);
  let ins, caret;
  if (b.dataset.wrap) {
    ins = md + sel + md;
    caret = start + md.length + sel.length;
  } else if (b.dataset.block) {
    ins = "\n" + md + "\n";
    caret = start + ins.length;
  } else {
    const lineStart = editor.value.lastIndexOf("\n", start - 1) + 1;
    ins = md + sel;
    editor.value = editor.value.slice(0, lineStart) + md + editor.value.slice(lineStart);
    caret = start + md.length;
    editor.focus(); editor.setSelectionRange(caret, caret);
    update();
    return;
  }
  editor.value = editor.value.slice(0, start) + ins + editor.value.slice(end);
  editor.focus();
  editor.setSelectionRange(caret, caret);
  update();
});

/* ═══ 主题切换 ═══ */
$("#themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("night");
  $("#themeBtn").textContent = document.body.classList.contains("night") ? "◑ 日纸" : "◐ 夜纸";
});

/* ═══ 导出 / 复制 ═══ */
function fullHTML() {
  const style = document.querySelector("style, link");
  const cssLink = style && style.tagName === "LINK" ? style.href : "";
  return "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"UTF-8\">\n" +
    "<title>" + esc((editor.value.split("\n").find((l) => /^#\s/.test(l)) || "格纸间文稿").replace(/^#\s+/, "")) + "</title>\n" +
    "<style>\n" + Array.from(document.styleSheets[0].cssRules).map((r) => r.cssText).join("\n") +
    "\nbody{padding:40px 8%;}\n.toolbar,.paper-head,.rail{display:none;}\n.preview{padding:0;}\n</style>\n" +
    "</head>\n<body>\n<article class=\"preview\">\n" + render(editor.value) + "\n</article>\n</body>\n</html>";
}
$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([fullHTML()], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gridpaper-" + Date.now() + ".html";
  document.body.appendChild(a); a.click(); a.remove();
  $("#saveState").textContent = "已导出 HTML";
});
$("#copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(fullHTML());
    $("#saveState").textContent = "HTML 已复制";
  } catch {
    $("#saveState").textContent = "复制失败 —— 用导出代替";
  }
});

/* ═══ 初始文稿（首次访问） ═══ */
const WELCOME = `# 格纸间 · Markdown 写字间

左边是**手稿**，右边是**排印**。写着看着，两栏同步。

## 能写什么

- 标题、**粗体**、*斜体*、~~删除线~~
- \`行内代码\` 与代码块
- 引用、任务清单、表格

> 摘一行放在引用块里：
> 自研渲染器，不到两百行。

### 任务清单

- [x] 起一间写字间
- [ ] 写下今天的三千字
- [ ] 导出 HTML 存档

### 表格也能排

| 语法 | 效果 |
| --- | --- |
| \`**粗**\` | 加粗强调 |
| \`> 文\` | 引用块 |

\`\`\`
if (coffee.isEmpty()) {
  refill();       // 写作燃料
}
\`\`\`

---

改动会自动存进本机。祝落笔顺利。`;
editor.value = WELCOME;
try {
  const saved = localStorage.getItem(LS_MD);
  if (saved !== null) editor.value = saved;
} catch {}
update();
