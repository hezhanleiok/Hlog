#!/usr/bin/env node
/* HLOG 代码核查脚本：检查路径、接口与 JS 语法 */
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = process.cwd();

const requiredFiles = [
  "public/index.html",
  "public/post.html",
  "public/login.html",
  "public/register.html",
  "public/admin.html",
  "public/admin-comments.html",
  "public/admin-invites.html",
  "public/admin-profile.html",
  "public/admin-users.html",
  "functions/api/register.js",
  "functions/api/login.js",
  "functions/api/post/create.js",
  "functions/api/post/list.js",
  "functions/api/post/view.js",
  "functions/api/site/stats.js",
  "functions/api/stats.js",
  "functions/api/tag/list.js",
  "functions/api/comment/add.js",
  "functions/api/comment/list.js",
  "functions/api/comment/latest.js",
  "functions/api/admin/comment/pending.js",
  "functions/api/admin/comment/approve.js",
  "functions/api/admin/comment/delete.js",
  "functions/api/admin/comment/reply.js",
  "functions/api/admin/invitation/generate.js",
  "functions/api/admin/users/list.js",
  "functions/api/admin/users/toggle.js",
  "functions/api/user/me.js",
  "functions/api/user/update.js",
  "functions/api/user/posts.js",
  "functions/api/auth/send-code.js",
  "wrangler.toml",
  "README.md",
  "check-code.js"
];

const apiContracts = [
  { file: "functions/api/register.js", mustContain: ["onRequestPost"] },
  { file: "functions/api/login.js", mustContain: ["onRequestPost"] },
  { file: "functions/api/post/create.js", mustContain: ["onRequest"] },
  { file: "functions/api/post/list.js", mustContain: ["onRequestGet"] },
  { file: "functions/api/post/view.js", mustContain: ["onRequestGet"] },
  { file: "functions/api/site/stats.js", mustContain: ["onRequestGet"] },
  { file: "functions/api/stats.js", mustContain: ["onRequestGet"] },
  { file: "functions/api/tag/list.js", mustContain: ["onRequestGet"] },
  { file: "functions/api/comment/add.js", mustContain: ["onRequestPost"] },
  { file: "functions/api/comment/list.js", mustContain: ["onRequestGet"] },
  { file: "functions/api/comment/latest.js", mustContain: ["onRequestGet"] },
  { file: "functions/api/admin/comment/pending.js", mustContain: ["onRequestGet"] },
  { file: "functions/api/admin/comment/approve.js", mustContain: ["onRequestPost"] },
  { file: "functions/api/admin/comment/delete.js", mustContain: ["onRequestPost"] },
  { file: "functions/api/admin/comment/reply.js", mustContain: ["onRequestPost"] },
  { file: "functions/api/admin/invitation/generate.js", mustContain: ["onRequestPost"] },
  { file: "functions/api/admin/users/list.js", mustContain: ["onRequestGet"] },
  { file: "functions/api/admin/users/toggle.js", mustContain: ["onRequestPost"] },
  { file: "functions/api/user/me.js", mustContain: ["onRequestGet"] },
  { file: "functions/api/user/update.js", mustContain: ["onRequestPost"] },
  { file: "functions/api/user/posts.js", mustContain: ["onRequestGet"] },
  { file: "functions/api/auth/send-code.js", mustContain: ["onRequestPost"] }
];

const htmlApiReferences = [
  "/api/register",
  "/api/login",
  "/api/post/create",
  "/api/post/list",
  "/api/post/view",
  "/api/tag/list",
  "/api/comment/latest",
  "/api/comment/add",
  "/api/comment/list",
  "/api/stats",
  "/api/admin/comment/pending",
  "/api/admin/comment/approve",
  "/api/admin/comment/delete",
  "/api/admin/comment/reply",
  "/api/admin/invitation/generate",
  "/api/admin/users/list",
  "/api/admin/users/toggle",
  "/api/user/me",
  "/api/user/update",
  "/api/user/posts"
  ,
  "/api/auth/send-code"
];

let errorCount = 0;
let warnCount = 0;

function logError(msg) {
  errorCount += 1;
  console.error(`[ERROR] ${msg}`);
}

function logWarn(msg) {
  warnCount += 1;
  console.warn(`[WARN] ${msg}`);
}

function logInfo(msg) {
  console.log(`[INFO] ${msg}`);
}

async function exists(filePath) {
  try {
    await fs.access(path.join(ROOT, filePath));
    return true;
  } catch {
    return false;
  }
}

async function checkRequiredFiles() {
  logInfo("检查必需文件...");
  for (const f of requiredFiles) {
    if (!(await exists(f))) logError(`缺少文件: ${f}`);
  }
}

async function checkApiContracts() {
  logInfo("检查 API 导出函数...");
  for (const item of apiContracts) {
    const abs = path.join(ROOT, item.file);
    if (!(await exists(item.file))) continue;
    const content = await fs.readFile(abs, "utf8");
    for (const key of item.mustContain) {
      if (!content.includes(key)) {
        logError(`接口定义缺失: ${item.file} 未包含 ${key}`);
      }
    }
  }
}

async function checkHtmlReferences() {
  logInfo("检查前端接口引用...");
  const htmlFiles = [
    "public/index.html",
    "public/post.html",
    "public/login.html",
    "public/register.html",
    "public/admin.html",
    "public/admin-comments.html",
    "public/admin-invites.html",
    "public/admin-profile.html"
    ,"public/admin-users.html"
  ];
  const allContent = [];
  for (const hf of htmlFiles) {
    if (!(await exists(hf))) continue;
    allContent.push(await fs.readFile(path.join(ROOT, hf), "utf8"));
  }
  const merged = allContent.join("\n");
  for (const apiPath of htmlApiReferences) {
    if (!merged.includes(apiPath)) logWarn(`前端未发现接口引用: ${apiPath}`);
  }
}

async function checkJsSyntax() {
  logInfo("检查 JS 语法...");
  const jsFiles = [
    "functions/api/register.js",
    "functions/api/login.js",
    "functions/api/post/create.js",
    "functions/api/post/list.js",
    "functions/api/post/view.js",
    "functions/api/site/stats.js",
    "functions/api/stats.js",
    "functions/api/tag/list.js",
    "functions/api/comment/add.js",
    "functions/api/comment/list.js",
    "functions/api/comment/latest.js",
    "functions/api/user/me.js",
    "functions/api/user/update.js",
    "functions/api/user/posts.js",
    "functions/api/auth/send-code.js",
    "functions/api/admin/comment/pending.js",
    "functions/api/admin/comment/approve.js",
    "functions/api/admin/comment/delete.js",
    "functions/api/admin/comment/reply.js",
    "functions/api/admin/invitation/generate.js",
    "functions/api/admin/users/list.js",
    "functions/api/admin/users/toggle.js",
    "check-code.js"
  ];
  for (const f of jsFiles) {
    if (!(await exists(f))) continue;
    try {
      const abs = path.join(ROOT, f);
      const code = await fs.readFile(abs, "utf8");
      const transformed = code
        .replace(/^\s*export\s+async\s+function\s+/gm, "async function ")
        .replace(/^\s*export\s+function\s+/gm, "function ")
        .replace(/^\s*export\s+const\s+/gm, "const ")
        .replace(/^\s*export\s+default\s+/gm, "");
      new vm.Script(transformed, { filename: f });
    } catch (err) {
      logError(`语法或模块错误: ${f} -> ${String(err.message || err)}`);
    }
  }
}

async function checkWrangler() {
  logInfo("检查 wrangler.toml...");
  const file = "wrangler.toml";
  if (!(await exists(file))) return;
  const content = await fs.readFile(path.join(ROOT, file), "utf8");
  if (!content.includes('binding = "DB"')) logError('wrangler.toml 缺少 D1 绑定 "DB"');
  if (!content.includes("pages_build_output_dir")) logWarn("wrangler.toml 建议声明 pages_build_output_dir");
}

async function main() {
  await checkRequiredFiles();
  await checkApiContracts();
  await checkHtmlReferences();
  await checkJsSyntax();
  await checkWrangler();

  console.log("\n========== HLOG 检查结果 ==========");
  console.log(`Errors: ${errorCount}`);
  console.log(`Warnings: ${warnCount}`);
  if (errorCount > 0) {
    console.log("状态: FAILED");
    process.exitCode = 1;
    return;
  }
  console.log("状态: PASSED");
}

main().catch((err) => {
  logError(`检查脚本异常: ${String(err.message || err)}`);
  process.exitCode = 1;
});
