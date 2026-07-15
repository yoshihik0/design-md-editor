/**
 * DESIGN.md Editor - Application Logic
 * Current schema editor and live preview
 */

// 1. Initial State
const state = {
  fileHandle: null,
  rawContent: '',
  parsedYaml: {},
  markdownBody: '',
  activeTemplate: 'saas-modern',
  editorTheme: 'dark',
  activeExportFormat: 'tailwind',
  // Typography scale UI state (not persisted into YAML directly, just the last chosen ratio)
  scaleRatio: 1.25,
  // PREVIEW.md preview paired with the active DESIGN.md
  previewFileHandle: null,
  previewMarkdown: '',
  // フォルダ接続モード: 接続中の directory handle と表示名
  directoryHandle: null,
  directoryName: null,
  serverWorkspaceName: null,
  // プレビュー用の「現在選択中のテーマ」。UIのみの状態で、YAML/rawContentには
  // 一切書き込まない。null = 既定(ライト)。
  activeDesignTheme: null,
  // カラーグルーピング（current schema: コメント区切り方式）。
  // [{ name: null | string, keys: [colorKey, ...] }, ...]。name: null は未分類。
  // colors自体には一切書き込まない、表示・シリアライズ順序のためだけのメタ情報。
  colorGroupsMeta: [],
  typographyGroupsMeta: [],
  componentGroupsMeta: [],
  templateSaveBaseName: null,
  templateArmed: false,
  templateInstantiationPromise: null,
  previewHelpMode: false,
  previewHelpMarkdown: '',
  currentDesignPath: '',
  currentPreviewPath: '',
  externalImportSourceName: null,
  scaleHelper: { base: 16, ratio: 1.25, applied: false }
};

let lastFileModifiedTime = 0;
let lastPreviewModifiedTime = 0;

// Guard used to avoid rebuilding the specific form row a user is actively
// typing / renaming in (prevents focus loss on bidirectional sync).
let activeEditingKey = null;
const openTypographyStyleKeys = new Set();
const openShadowKeys = new Set();
const openRoundedKeys = new Set();
const openSpacingKeys = new Set();
const openComponentKeys = new Set();

const PREVIEW_STORAGE_KEY = 'design_md_preview_document';
const DEFAULT_PREVIEW_PATH = 'defaults/PREVIEW.md';
const MINIMAL_DEFAULT_PREVIEW_MARKDOWN = '# デザイン適用サンプル\n\n[colors:group]\n\n[typography:group:"デザインの一貫性で素敵なユーザー体験"]\n\n[markdown:"デザインの一貫性で素敵なユーザー体験"]\n\n[border:surface:ink]\n\n[rounded:surface:ink]\n\n[shadow:surface:ink]\n\n[spacing]\n\n[components]\n';
let defaultPreviewMarkdownCache = '';
let previewSaveDebounceTimer = null;

// プレビューテーマ選択の永続化キー（YAMLには保存しない、表示専用の選択状態）
const PREVIEW_THEME_STORAGE_KEY = 'design_md_preview_theme';
const EDITOR_THEME_STORAGE_KEY = 'design_md_editor_theme';

function applyEditorTheme(theme) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  state.editorTheme = normalized;
  document.body.classList.toggle('light-theme', normalized === 'light');

  const button = document.getElementById('btn-toggle-theme');
  if (button) {
    button.innerHTML = normalized === 'light'
      ? '<i data-lucide="moon"></i>'
      : '<i data-lucide="sun"></i>';
  }
}

function restoreEditorTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(EDITOR_THEME_STORAGE_KEY);
  } catch (err) {
    // localStorage may be unavailable; retain the default dark theme.
  }
  applyEditorTheme(saved === 'light' || saved === 'dark' ? saved : 'dark');
}

const STANDARD_COLOR_DEFAULTS = {
  background: '#ffffff',
  surface: '#f4f6f8',
  text: '#1c2530',
  'text-muted': '#5b6b7c',
  primary: '#2f5fd6',
  'primary-10': '#eaeffb',
  secondary: '#5c6b7a',
  'secondary-10': '#eff0f2',
  success: '#1f7a4d',
  'success-10': '#e9f2ed',
  danger: '#c1352f',
  'danger-10': '#f9ebea',
  warning: '#9c5700',
  'warning-10': '#f5eee6',
  info: '#0f6e8c',
  'info-10': '#e7f1f4',
  link: '#2554b8',
  'link-hover': '#173a80',
  border: '#d7dde3',
  emphasis: '#a6390f',
  'emphasis-10': '#f6ebe7'
};


// ============================================================================
// 0b. Folder connect mode: state & constants
// ============================================================================
const AUTOSAVE_TOGGLE_STORAGE_KEY = 'design_md_autosave_enabled';
const AUTOSAVE_DEBOUNCE_MS = 1000;
let autoSaveEnabled = true;
let autoSaveDesignTimer = null;
let autoSavePreviewTimer = null;
let isComposingCode = false;
let isComposingPreview = false;
// IndexedDB-backed directory handle persistence
const DIR_HANDLE_DB_NAME = 'dmd-editor';
const DIR_HANDLE_DB_VERSION = 1;
const DIR_HANDLE_STORE = 'handles';
const DIR_HANDLE_KEY = 'connectedDirectory';

// ============================================================================
// 3. UI Helpers
// ============================================================================
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  const toastIcon = toast.querySelector('.toast-icon');

  toastMsg.textContent = message;

  if (type === 'error') {
    toastIcon.setAttribute('data-lucide', 'alert-circle');
    toastIcon.style.color = 'var(--editor-error)';
  } else {
    toastIcon.setAttribute('data-lucide', 'check-circle');
    toastIcon.style.color = 'var(--editor-success)';
  }

  lucide.createIcons();

  toast.classList.remove('hidden');

  if (toast.timer) clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

function clearTemplateSaveMode() {
  state.templateSaveBaseName = null;
  state.templateArmed = false;
  state.templateInstantiationPromise = null;
  state.externalImportSourceName = null;
}

async function getDefaultPreviewMarkdown() {
  if (defaultPreviewMarkdownCache) return defaultPreviewMarkdownCache;
  try {
    const response = await fetch(DEFAULT_PREVIEW_PATH, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    defaultPreviewMarkdownCache = await response.text();
  } catch (err) {
    console.warn('標準PREVIEW.mdの読み込みに失敗しました:', err);
    defaultPreviewMarkdownCache = MINIMAL_DEFAULT_PREVIEW_MARKDOWN;
  }
  return defaultPreviewMarkdownCache;
}

async function applyDefaultPreview() {
  if (autoSavePreviewTimer) {
    clearTimeout(autoSavePreviewTimer);
    autoSavePreviewTimer = null;
  }
  const text = await getDefaultPreviewMarkdown();
  state.previewFileHandle = null;
  state.urlPreviewPath = null;
  state.currentPreviewPath = '';
  state.previewMarkdown = text;
  lastPreviewModifiedTime = 0;
  urlPreviewLastText = null;
  const textarea = document.getElementById('preview-textarea');
  if (textarea) textarea.value = text;
  renderArticleSample(state.parsedYaml);
  schedulePreviewSave();
}

async function importExternalDesignText(text, sourceName) {
  if (autoSaveDesignTimer) {
    clearTimeout(autoSaveDesignTimer);
    autoSaveDesignTimer = null;
  }
  clearTemplateSaveMode();
  state.externalImportSourceName = sourceName || 'DESIGN.md';
  state.fileHandle = null;
  state.urlMdPath = null;
  state.currentDesignPath = '';
  state.rawContent = text;
  lastFileModifiedTime = 0;
  urlMdLastText = null;

  const textarea = document.getElementById('code-textarea');
  textarea.value = text;
  syncCodeToVisualForm(true);
  await applyDefaultPreview();

  const url = new URL(window.location.href);
  url.searchParams.delete('md');
  url.searchParams.delete('preview');
  history.replaceState(null, '', url);
  document.getElementById('file-status').textContent = `${state.externalImportSourceName} (外部ファイル・別名保存してください)`;
  setAutoSaveIndicator('', false);
  showToast('外部のDESIGN.mdを標準プレビューで開きました。元ファイルは変更されません');
}

function slugifyKey(key) {
  return String(key).replace(/[^a-zA-Z0-9_-]/g, '-');
}

// Reads the color out of a colorGroups (v2/pre-migration) palette entry,
// which may be a plain string or a { name, color } object — used only by
// flattenColorGroupsIntoColors() during migration (current schema).
function getPaletteEntryColor(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') return entry.color || entry.value || '';
  return '';
}

function isUiColorGroupKey(groupKey) {
  return String(groupKey || '').toLowerCase() === 'ui';
}

// ============================================================================
// 3b. Color grouping (current schema: comment-delimited groups inside the
// `colors:` block). colorGroups (v2/pre-migration) no longer exists as a
// schema concept in v3 — see §4/§4.1. Grouping is expressed purely as
// full-line comments inside `colors:`, recovered by scanning the raw YAML
// text, and re-emitted the same way on save. `state.colorGroupsMeta` is the
// single source of truth for group name/order/membership at runtime; it is
// never written into parsedYaml.colors itself.
// ============================================================================

// Reads the raw `colors:` block out of a YAML string and returns
// [{ name: null|string, keys: [...] }, ...]. name: null is the "unclassified"
// bucket (keys before the first `# <Group>` comment). Full-line comments only
// — inline comments (`ink: '#333' # note`) are never treated as a divider.
function parseColorGroupsMetaFromYamlText(yamlStr) {
  const lines = String(yamlStr || '').split(/\r?\n/);
  const startIdx = lines.findIndex(l => /^colors:\s*$/.test(l));
  if (startIdx === -1) return [];
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) { endIdx = i; break; }
  }
  const keyLineRe = /^\s*(['"]?)([A-Za-z0-9_.\-]+)\1\s*:/;
  const commentLineRe = /^\s*#\s*(.*)$/;
  const groups = [{ name: null, keys: [] }];
  for (let i = startIdx + 1; i < endIdx; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const commentMatch = line.match(commentLineRe);
    if (commentMatch) {
      groups.push({ name: commentMatch[1].trim(), keys: [] });
      continue;
    }
    const keyMatch = line.match(keyLineRe);
    if (keyMatch) groups[groups.length - 1].keys.push(keyMatch[2]);
  }
  return groups;
}

// Defensive pass, run before every render/serialize: guarantees every key in
// `colors` is accounted for exactly once (orphans -> unclassified, front of
// the list), drops stale keys that no longer exist, and always keeps exactly
// one unclassified bucket. Never fabricates named groups — and never drops
// them either: an EMPTY named group is a first-class citizen (a user just
// created it and is about to add colors into it; it round-trips as a bare
// `# <name>` comment line in the colors block).
function reconcileColorGroupsMeta(groupsMeta, colors) {
  const groups = (groupsMeta || []).map(g => ({ name: g.name, keys: (g.keys || []).slice() }));
  let unclassified = groups.find(g => g.name === null);
  if (!unclassified) {
    unclassified = { name: null, keys: [] };
    groups.unshift(unclassified);
  }
  const colorKeys = Object.keys(colors || {});
  const colorKeySet = new Set(colorKeys);
  groups.forEach(g => { g.keys = g.keys.filter(k => colorKeySet.has(k)); });
  const known = new Set(groups.flatMap(g => g.keys));
  const orphanKeys = colorKeys.filter(k => !known.has(k));
  unclassified.keys = orphanKeys.concat(unclassified.keys);
  return groups;
}

function reconcileColorGroupsMetaState() {
  state.colorGroupsMeta = reconcileColorGroupsMeta(state.colorGroupsMeta, state.parsedYaml.colors || {});
}

function ensureColorGroupsMetaGroup(groupName) {
  if (groupName === null || groupName === undefined) {
    if (!state.colorGroupsMeta.some(g => g.name === null)) state.colorGroupsMeta.unshift({ name: null, keys: [] });
    return;
  }
  if (!state.colorGroupsMeta.some(g => g.name === groupName)) state.colorGroupsMeta.push({ name: groupName, keys: [] });
}

function colorGroupsMetaAddKey(key, groupName) {
  ensureColorGroupsMetaGroup(groupName || null);
  state.colorGroupsMeta.forEach(g => { g.keys = g.keys.filter(k => k !== key); });
  const target = state.colorGroupsMeta.find(g => g.name === (groupName || null));
  (target || state.colorGroupsMeta.find(g => g.name === null)).keys.push(key);
}

function colorGroupsMetaRemoveKey(key) {
  state.colorGroupsMeta.forEach(g => { g.keys = g.keys.filter(k => k !== key); });
}

// Inserts `key` into whichever group contains `afterKey`, directly after it
// (e.g. a generated tint lands right below its source color). Falls back to
// the unclassified bucket when afterKey isn't tracked.
function colorGroupsMetaInsertKeyAfter(key, afterKey) {
  state.colorGroupsMeta.forEach(g => { g.keys = g.keys.filter(k => k !== key); });
  const host = state.colorGroupsMeta.find(g => g.keys.includes(afterKey));
  if (!host) {
    colorGroupsMetaAddKey(key, null);
    return;
  }
  host.keys.splice(host.keys.indexOf(afterKey) + 1, 0, key);
}

function colorGroupsMetaRenameKey(oldKey, newKey) {
  state.colorGroupsMeta.forEach(g => { g.keys = g.keys.map(k => (k === oldKey ? newKey : k)); });
}

function colorGroupsMetaMoveKey(key, groupName) {
  colorGroupsMetaAddKey(key, groupName || null);
}

function renameColorGroupMeta(oldName, newName) {
  const g = state.colorGroupsMeta.find(g => g.name === oldName);
  if (g) g.name = newName;
}

function deleteColorGroupMeta(name) {
  const g = state.colorGroupsMeta.find(g => g.name === name);
  if (!g) return;
  ensureColorGroupsMetaGroup(null);
  const unclassified = state.colorGroupsMeta.find(g => g.name === null);
  unclassified.keys = unclassified.keys.concat(g.keys);
  state.colorGroupsMeta = state.colorGroupsMeta.filter(gr => gr !== g);
}

function getColorGroupMeta(name) {
  return (state.colorGroupsMeta || []).find(g => g.name !== null && String(g.name) === String(name)) || null;
}

const TYPOGRAPHY_META_KEYS = new Set(['fonts', 'styles', 'scale', 'markdown']);

function getTypographyStyles(typography) {
  const t = typography || {};
  if (t.styles && typeof t.styles === 'object') return t.styles;
  const out = {};
  Object.keys(t).forEach(key => {
    if (!TYPOGRAPHY_META_KEYS.has(key) && t[key] && typeof t[key] === 'object') out[key] = t[key];
  });
  return out;
}

// Typography grouping mirrors colors (current schema): full-line comments
// among the style keys DIRECTLY under `typography:` (2-space indent) are the
// group dividers; the reserved keys (markdown/scale/fonts) are never group
// members. Back-compat read: old v3.0 files that nested styles inside a
// `styles:` sub-block get their group comments read from there (4-space
// indent) — those styles are hoisted to direct children by normalizeV3, so
// the recovered group meta lines up with the migrated keys.
function parseTypographyGroupsMetaFromYamlText(yamlStr) {
  const lines = String(yamlStr || '').split(/\r?\n/);
  const typographyIdx = lines.findIndex(l => /^typography:\s*$/.test(l));
  if (typographyIdx === -1) return [];
  let typographyEnd = lines.length;
  for (let i = typographyIdx + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) { typographyEnd = i; break; }
  }

  // Back-compat: an old-format `  styles:` sub-block — scan its 4-space lines.
  const stylesIdx = lines.slice(typographyIdx + 1, typographyEnd).findIndex(l => /^\s{2}styles:\s*$/.test(l));
  if (stylesIdx !== -1) {
    const start = typographyIdx + 1 + stylesIdx;
    const groups = [{ name: null, keys: [] }];
    for (let i = start + 1; i < typographyEnd; i++) {
      if (/^\s{0,2}\S/.test(lines[i])) break; // next typography-level key ends the styles block
      const comment = lines[i].match(/^\s{4}#\s*(.*)$/);
      if (comment) { groups.push({ name: comment[1].trim(), keys: [] }); continue; }
      const key = lines[i].match(/^\s{4}(['"]?)([A-Za-z0-9_.\-]+)\1\s*:/);
      if (key && !TYPOGRAPHY_META_KEYS.has(key[2])) groups[groups.length - 1].keys.push(key[2]);
    }
    return groups;
  }

  // Canonical (SPEC §5.2): styles as direct children of typography.
  const groups = [{ name: null, keys: [] }];
  for (let i = typographyIdx + 1; i < typographyEnd; i++) {
    const comment = lines[i].match(/^\s{2}#\s*(.*)$/);
    if (comment) { groups.push({ name: comment[1].trim(), keys: [] }); continue; }
    const key = lines[i].match(/^\s{2}(['"]?)([A-Za-z0-9_.\-]+)\1\s*:/);
    if (key && !TYPOGRAPHY_META_KEYS.has(key[2])) groups[groups.length - 1].keys.push(key[2]);
  }
  return groups;
}

function reconcileTypographyGroupsMeta(meta, styles) {
  const groups = (meta || []).map(g => ({ name: g.name, keys: (g.keys || []).slice() }));
  let unclassified = groups.find(g => g.name === null);
  if (!unclassified) { unclassified = { name: null, keys: [] }; groups.unshift(unclassified); }
  const keys = Object.keys(styles || {});
  const valid = new Set(keys);
  groups.forEach(g => { g.keys = g.keys.filter(k => valid.has(k)); });
  const known = new Set(groups.flatMap(g => g.keys));
  unclassified.keys = keys.filter(k => !known.has(k)).concat(unclassified.keys);
  return groups;
}

function inferTypographyGroupsMeta(styles) {
  const groups = [{ name: null, keys: [] }];
  Object.keys(styles || {}).forEach(key => {
    const name = String(key).split('-')[0] || null;
    let group = groups.find(g => g.name === name);
    if (!group) { group = { name, keys: [] }; groups.push(group); }
    group.keys.push(key);
  });
  return groups;
}

function typographyGroupAddKey(key, name) {
  state.typographyGroupsMeta = reconcileTypographyGroupsMeta(state.typographyGroupsMeta, getTypographyStyles(state.parsedYaml.typography));
  let group = state.typographyGroupsMeta.find(g => g.name === (name || null));
  if (!group) { group = { name: name || null, keys: [] }; state.typographyGroupsMeta.push(group); }
  state.typographyGroupsMeta.forEach(g => { g.keys = g.keys.filter(k => k !== key); });
  group.keys.push(key);
}

function buildOrderedTypographyStyles(styles, meta) {
  const groups = reconcileTypographyGroupsMeta(meta, styles);
  const ordered = {};
  groups.forEach(g => g.keys.forEach(k => { ordered[k] = styles[k]; }));
  return { ordered, meta: groups };
}

function insertTypographyGroupComments(yamlStr, meta) {
  if (!(meta || []).some(g => g.name !== null)) return yamlStr;
  const lines = yamlStr.split('\n');
  const typographyIdx = lines.findIndex(l => /^typography:\s*$/.test(l));
  if (typographyIdx === -1) return yamlStr;
  const start = typographyIdx;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) { end = i; break; }
  }
  const blocks = {};
  const metaBlocks = [];
  let current = null;
  for (let i = start + 1; i < end; i++) {
    const key = lines[i].match(/^\s{2}(['"]?)([A-Za-z0-9_.\-]+)\1\s*:/);
    if (key) {
      current = key[2];
      if (TYPOGRAPHY_META_KEYS.has(current)) { metaBlocks.push([]); blocks[current] = metaBlocks[metaBlocks.length - 1]; }
      else blocks[current] = [];
    }
    if (current && blocks[current]) blocks[current].push(lines[i]);
  }
  const body = [];
  (meta || []).forEach(g => {
    if (g.name !== null) body.push(`  # ${g.name}`);
    g.keys.forEach(k => { if (blocks[k]) body.push(...blocks[k]); });
  });
  metaBlocks.forEach(block => body.push(...block));
  return lines.slice(0, start + 1).concat(body, lines.slice(end)).join('\n');
}

function parseComponentGroupsMetaFromYamlText(yamlStr) {
  const lines = String(yamlStr || '').split(/\r?\n/);
  const start = lines.findIndex(l => /^components:\s*$/.test(l));
  if (start === -1) return [];
  const groups = [{ name: null, keys: [] }];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break;
    const comment = lines[i].match(/^\s{2}#\s*(.*)$/);
    if (comment) { groups.push({ name: comment[1].trim(), keys: [] }); continue; }
    const key = lines[i].match(/^\s{2}(['"]?)([A-Za-z0-9_.\-]+)\1\s*:/);
    if (key) groups[groups.length - 1].keys.push(key[2]);
  }
  return groups;
}

function reconcileComponentGroupsMeta(meta, components) {
  return reconcileTypographyGroupsMeta(meta, components || {});
}

function inferComponentGroupsMeta(components) {
  return inferTypographyGroupsMeta(components || {});
}

function componentGroupAddKey(key, name) {
  state.componentGroupsMeta = reconcileComponentGroupsMeta(state.componentGroupsMeta, state.parsedYaml.components || {});
  let group = state.componentGroupsMeta.find(g => g.name === (name || null));
  if (!group) { group = { name: name || null, keys: [] }; state.componentGroupsMeta.push(group); }
  state.componentGroupsMeta.forEach(g => { g.keys = g.keys.filter(k => k !== key); });
  group.keys.push(key);
}

function insertComponentGroupComments(yamlStr, meta) {
  if (!(meta || []).some(g => g.name !== null)) return yamlStr;
  const lines = yamlStr.split('\n');
  const start = lines.findIndex(l => /^components:\s*$/.test(l));
  if (start === -1) return yamlStr;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^\S/.test(lines[i])) { end = i; break; }
  const blocks = {}; let current = null;
  for (let i = start + 1; i < end; i++) {
    const key = lines[i].match(/^\s{2}(['"]?)([A-Za-z0-9_.\-]+)\1\s*:/);
    if (key) { current = key[2]; blocks[current] = []; }
    if (current) blocks[current].push(lines[i]);
  }
  const body = [];
  (meta || []).forEach(g => { if (g.name !== null) body.push(`  # ${g.name}`); g.keys.forEach(k => { if (blocks[k]) body.push(...blocks[k]); }); });
  return lines.slice(0, start + 1).concat(body, lines.slice(end)).join('\n');
}

// current schema: theme = colors[name] directly.
function getColorGroupTheme(name, colors) {
  if (colors && Object.prototype.hasOwnProperty.call(colors, name)) return colors[name];
  const meta = getColorGroupMeta(name);
  if (!meta) return null;
  const firstKey = meta.keys.find(k => colors && Object.prototype.hasOwnProperty.call(colors, k));
  return firstKey ? colors[firstKey] : null;
}

 // ---- colorGroups (v2 / pre-migration) -> colors flattening, current schema ----
// Consumes the RAW (pre-normalization) `colorGroups` object as read from YAML
// (or carried through the v1->v2->v3 chain) and folds every group into
// `colors`, returning the extended colors map plus the group metadata
// entries to append to colorGroupsMeta. The "UI" auto-generated group is
// discarded entirely (SPEC §4.1): it only ever duplicated existing colors
// keys under different names.
function flattenColorGroupsIntoColors(rawColorGroups, colors) {
  const groups = (rawColorGroups && typeof rawColorGroups === 'object') ? rawColorGroups : {};
  const outColors = Object.assign({}, colors || {});
  const canvas = baseColor(outColors, 'canvas', '#ffffff');
  const groupsMeta = [];

  Object.keys(groups).forEach(groupKey => {
    if (isUiColorGroupKey(groupKey)) return; // SPEC §4.1: UI group is discarded, never flattened
    const g = groups[groupKey] || {};
    const gSlug = slugifyKey(groupKey);
    const keys = [];

    const themeValue = (typeof g.theme === 'string' && g.theme.trim()) ? g.theme.trim() : null;
    if (themeValue) {
      const target = Object.prototype.hasOwnProperty.call(outColors, gSlug) ? `${gSlug}-theme` : gSlug;
      outColors[target] = themeValue;
      keys.push(target);
    }
    const effectiveTheme = themeValue || '#888888';

    if (Array.isArray(g.tints)) {
      g.tints.forEach(pctRaw => {
        const pct = parseInt(pctRaw, 10);
        if (!Number.isFinite(pct)) return;
        const target = `${gSlug}-${pct}`;
        const rgba = parseColorToRgba(effectiveTheme);
        const tintCss = rgbaToCss(rgba.r, rgba.g, rgba.b, pct / 100);
        outColors[target] = compositeOverBackground(tintCss, canvas);
        keys.push(target);
      });
    }

    if (Array.isArray(g.palette)) {
      g.palette.forEach((entry, idx) => {
        const color = getPaletteEntryColor(entry);
        if (!color) return;
        const isNamed = entry && typeof entry === 'object' && entry.name;
        const target = isNamed ? `${gSlug}-${slugifyKey(entry.name)}` : `${gSlug}-p${idx + 1}`;
        outColors[target] = color;
        keys.push(target);
      });
    }

    // Any other flat scalar keys directly on the group object (e.g. hand-authored
    // `product-10: "#..."` / `strong: "#..."`) — SPEC §4.1 "その他のキー".
    Object.keys(g).forEach(key => {
      if (key === 'theme' || key === 'tints' || key === 'palette') return;
      const value = g[key];
      if (typeof value !== 'string' || !value.trim()) return;
      const keySlug = slugifyKey(key);
      const target = Object.prototype.hasOwnProperty.call(outColors, keySlug) ? `${gSlug}-${keySlug}` : keySlug;
      outColors[target] = value.trim();
      keys.push(target);
    });

    if (keys.length) groupsMeta.push({ name: groupKey, keys });
  });

  return { colors: outColors, groupsMeta };
}

// ============================================================================
// 4. Color Math: hex/rgba parsing, luminance, contrast, alpha compositing
// ============================================================================
function hexToRgb(hex) {
  if (!hex) return null;
  let shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
  if (!result) return null;
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
    a: result[4] !== undefined ? parseInt(result[4], 16) / 255 : 1
  };
}

// Parses hex(6/8), rgba(), rgb() strings into {r,g,b,a}. Never throws.
function parseColorToRgba(value) {
  if (!value || typeof value !== 'string') return { r: 0, g: 0, b: 0, a: 1 };
  const v = value.trim();
  if (v.startsWith('#')) {
    const rgb = hexToRgb(v);
    return rgb || { r: 0, g: 0, b: 0, a: 1 };
  }
  const rgbaMatch = v.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
  if (rgbaMatch) {
    return {
      r: parseFloat(rgbaMatch[1]),
      g: parseFloat(rgbaMatch[2]),
      b: parseFloat(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function roundAlpha(a) {
  return Math.round(a * 100) / 100;
}

function rgbaToCss(r, g, b, a) {
  const toHex = (x) => {
    const h = Math.round(Math.max(0, Math.min(255, x))).toString(16);
    return h.length === 1 ? '0' + h : h;
  };
  if (a === undefined || a === null || a >= 1) {
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${roundAlpha(a)})`;
}

function colorValueForDisplay(value) {
  const text = String(value || '').trim();
  const match = text.match(/^rgba?\((.*)\)$/i);
  return match ? match[1].replace(/\s+/g, '') : text;
}

function colorValueFromDisplay(value) {
  const text = String(value || '').trim();
  if (/^[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+$/.test(text)) return `rgba(${text})`;
  if (/^[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+$/.test(text)) return `rgb(${text})`;
  return text;
}

// Resolve a color reference: colors-key -> direct value (#/rgba) -> fallback.
// Never throws even if ref points nowhere.
function resolveColor(ref, colors, fallback) {
  fallback = fallback || '#000000';
  if (ref === undefined || ref === null || ref === '') return fallback;
  if (typeof ref === 'string') {
    if (colors && Object.prototype.hasOwnProperty.call(colors, ref)) {
      return colors[ref];
    }
    if (ref.startsWith('#') || ref.startsWith('rgba(') || ref.startsWith('rgb(')) {
      return ref;
    }
  }
  return fallback;
}

// Alpha-composite colorValue over bgValue, returning an opaque hex/css color.
function compositeOverBackground(colorValue, bgValue) {
  const fg = parseColorToRgba(colorValue);
  if (fg.a >= 1) {
    return rgbaToCss(fg.r, fg.g, fg.b, 1);
  }
  const bg = parseColorToRgba(bgValue);
  const r = fg.r * fg.a + bg.r * (1 - fg.a);
  const g = fg.g * fg.a + bg.g * (1 - fg.a);
  const b = fg.b * fg.a + bg.b * (1 - fg.a);
  return rgbaToCss(r, g, b, 1);
}

function getLuminanceRgb(rgb) {
  let r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  r = (r <= 0.03928) ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  g = (g <= 0.03928) ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  b = (b <= 0.03928) ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

 // Contrast ratio between two colors. If either has alpha < 1, it is first
// composited onto the other's opaque background equivalent.
function getContrastRatio(colorA, colorB) {
  const rgbaA = parseColorToRgba(colorA);
  const rgbaB = parseColorToRgba(colorB);
  const opaqueB = rgbaB.a < 1 ? parseColorToRgba(compositeOverBackground(colorB, '#ffffff')) : rgbaB;
  const opaqueA = rgbaA.a < 1 ? parseColorToRgba(compositeOverBackground(colorA, rgbaToCss(opaqueB.r, opaqueB.g, opaqueB.b, 1))) : rgbaA;

  const l1 = getLuminanceRgb(opaqueA);
  const l2 = getLuminanceRgb(opaqueB);
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (brightest + 0.05) / (darkest + 0.05);
}

// ============================================================================
// 5. Import compatibility: legacy v1/v2 -> current schema
// ============================================================================
function isV2Schema(yamlData) {
  if (!yamlData || typeof yamlData !== 'object') return false;
  const t = yamlData.typography;
  if (t && (t.fonts || t.styles)) return true;
  if (yamlData.elevation && yamlData.elevation.shadows) return true;
  if (yamlData.borders && typeof yamlData.borders.radius === 'object') return true;
  return false;
}

function migrateV1ToV2(yamlData) {
  const v1 = yamlData || {};
  const c = v1.colors || {};
  const t = v1.typography || {};
  const s = v1.spacing || {};
  const b = v1.borders || {};

  const colors = {
    background: c.background || '#ffffff',
    surface: c.surface || '#f4f6f8',
    text: c.text || '#1c2530',
    'text-muted': c['text-muted'] || '#5b6b7c',
    primary: c.primary || '#2f5fd6',
    secondary: c.secondary || '#5c6b7a',
    success: c.success || '#1f7a4d',
    danger: c.danger || '#c1352f',
    warning: c.warning || '#9c5700',
    info: c.info || '#0f6e8c',
    link: c.link || '#2554b8',
    'link-hover': c['link-hover'] || '#173a80',
    border: c.border || '#d7dde3',
    emphasis: c.emphasis || '#a6390f'
  };
  // Preserve any additional v1 color keys beyond the fixed 6
  Object.keys(c).forEach(k => {
    if (!(k in colors)) colors[k] = c[k];
  });

  const extractFamily = (fontStr, fallback) => {
    if (!fontStr) return fallback;
    return String(fontStr).split(',')[0].replace(/['"]/g, '').trim() || fallback;
  };

  const headingFamily = extractFamily(t.titleFont, 'Outfit');
  const bodyFamily = extractFamily(t.bodyFont, 'Outfit');

  const systemFamilies = ['Georgia', 'Courier New', 'Arial', 'system-ui', 'sans-serif', 'serif', 'monospace', 'Times New Roman', 'Verdana'];
  const guessSource = (fam) => systemFamilies.includes(fam) ? 'system' : 'google';

  const fonts = {
    heading: { family: headingFamily, source: guessSource(headingFamily), weights: [600, 700] },
    body: { family: bodyFamily, source: guessSource(bodyFamily), weights: [400, 700] }
  };

  const base = 16;
  const ratio = 1.25;
  const round = (n) => Math.round(n);

  const styles = {
    h1: { font: 'heading', size: round(base * Math.pow(ratio, 4)), weight: 700, lineHeight: 1.25, letterSpacing: '-0.02em', color: 'text' },
    h2: { font: 'heading', size: round(base * Math.pow(ratio, 3)), weight: 700, lineHeight: 1.3, color: 'text' },
    h3: { font: 'heading', size: round(base * Math.pow(ratio, 2)), weight: 600, lineHeight: 1.4, color: 'text' },
    h4: { font: 'heading', size: round(base * ratio), weight: 600, lineHeight: 1.4, color: 'text' },
    body: { font: 'body', size: base, weight: 400, lineHeight: 1.7, color: 'text' },
    small: { font: 'body', size: 14, weight: 400, lineHeight: 1.6, color: 'text' },
    caption: { font: 'body', size: 12, weight: 400, lineHeight: 1.5, color: 'secondary' },
    strong: { weight: 700 }
  };

  const radiusSingle = (b.radius !== undefined && b.radius !== null && b.radius !== '') ? parseFloat(b.radius) : 8;
  const radius = {
    sm: Math.max(0, Math.round(radiusSingle * 0.5)),
    md: radiusSingle,
    lg: Math.round(radiusSingle * 2),
    full: 999
  };

  const spacingBase = (s.base !== undefined && s.base !== null && s.base !== '') ? parseFloat(s.base) : 8;

  const v2 = {};
  // Preserve any top-level metadata (title, version, author, description, etc.)
  Object.keys(v1).forEach(key => {
    if (!['colors', 'typography', 'spacing', 'borders', 'elevation', 'colorGroups'].includes(key)) {
      v2[key] = v1[key];
    }
  });

  v2.colors = colors;
  v2.typography = {
    fonts: fonts,
    scale: { base: base, ratio: ratio },
    styles: styles
  };
  v2.elevation = {
    shadows: {
      sm: '0 1px 2px rgba(0,0,0,0.06)',
      md: '0 4px 12px rgba(0,0,0,0.10)',
      lg: '0 12px 32px rgba(0,0,0,0.16)'
    }
  };
  v2.borders = {
    radius: radius,
    width: b.width !== undefined ? b.width : 1,
    color: b.color !== undefined ? b.color : 'secondary'
  };
  v2.spacing = { base: spacingBase };
  // colorGroups is carried through untouched (raw shape); it is only ever
  // interpreted once, by flattenColorGroupsIntoColors() during the final v3
  // normalization pass (current schema) — see normalizeV3().
  v2.colorGroups = v1.colorGroups;
  v2.themes = normalizeModes(v1.themes);

  return v2;
}

// Fill in any missing v2 substructures defensively (does not overwrite present data).
function normalizeV2(yamlData) {
  const v2 = Object.assign({}, yamlData);

  v2.colors = (yamlData.colors && typeof yamlData.colors === 'object')
    ? Object.assign({}, yamlData.colors)
    : Object.assign({}, STANDARD_COLOR_DEFAULTS);

  const typography = yamlData.typography || {};
  v2.typography = {
    fonts: Object.assign({
      heading: { family: 'Outfit', source: 'google', weights: [600, 700] },
      body: { family: 'Outfit', source: 'google', weights: [400, 700] }
    }, typography.fonts || {}),
    styles: (typography.styles && typeof typography.styles === 'object') ? Object.assign({}, typography.styles) : {
      h1: { font: 'heading', size: 40, weight: 700, lineHeight: 1.25, letterSpacing: '-0.02em', color: 'text' },
      h2: { font: 'heading', size: 32, weight: 700, lineHeight: 1.3, color: 'text' },
      h3: { font: 'heading', size: 25, weight: 600, lineHeight: 1.4, color: 'text' },
      h4: { font: 'heading', size: 20, weight: 600, lineHeight: 1.4, color: 'text' },
      body: { font: 'body', size: 16, weight: 400, lineHeight: 1.7, color: 'text' },
      small: { font: 'body', size: 14, weight: 400, lineHeight: 1.6, color: 'text' },
      caption: { font: 'body', size: 12, weight: 400, lineHeight: 1.5, color: 'secondary' },
      strong: { weight: 700 }
    }
  };
  if (typography.scale && typeof typography.scale === 'object') {
    v2.typography.scale = Object.assign({ base: 16, ratio: 1.25 }, typography.scale);
  }

  const elevation = yamlData.elevation || {};
  v2.elevation = {
    shadows: Object.assign({
      sm: '0 1px 2px rgba(0,0,0,0.06)',
      md: '0 4px 12px rgba(0,0,0,0.10)',
      lg: '0 12px 32px rgba(0,0,0,0.16)'
    }, elevation.shadows || {})
  };

  const borders = yamlData.borders || {};
  v2.borders = {
    radius: Object.assign({ sm: 4, md: 8, lg: 16, full: 999 }, (typeof borders.radius === 'object' && borders.radius !== null ? borders.radius : {})),
    width: borders.width !== undefined ? borders.width : 1,
    color: borders.color !== undefined ? borders.color : 'secondary'
  };

  v2.spacing = Object.assign({ base: 8 }, yamlData.spacing || {});

  // colorGroups (v2/pre-migration only): carried through untouched. It is
  // flattened into `colors` (and discarded) once, in normalizeV3() — see
  // flattenColorGroupsIntoColors() / current schema
  v2.colorGroups = yamlData.colorGroups;

  // themes: optional, v2-only. An absent/empty themes stays an empty object;
  // never fabricate theme entries that weren't there.
  v2.themes = normalizeModes(yamlData.themes);

  return v2;
}

// Defensive normalization for modes/themes: tolerates missing/malformed fields
// without throwing, never fabricates entries that weren't there, and never
// fills in missing color keys inside an entry (a mode's colors are a
// PARTIAL override on top of the base `colors`, so we keep it as-is). Used
// for both the v2 `themes` field and the v3 `modes` field — the shape is
// identical, only the top-level key name differs.
function normalizeModes(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(raw).forEach(modeKey => {
    const t = raw[modeKey] || {};
    const colors = (t.colors && typeof t.colors === 'object') ? Object.assign({}, t.colors) : {};
    out[modeKey] = { colors };
  });
  return out;
}

// Merges a mode's partial color overrides on top of the base colors object.
// Never mutates either input. modeName === null/undefined/'' or not found
// in modes simply returns the base colors (既定/ライト).
function getMergedThemeColors(yamlData, themeName) {
  const colors = (yamlData && yamlData.colors) || {};
  const modeGroups = (state.colorGroupsMeta || []).filter(g => String(g.name || '').startsWith('mode-'));
  const modeKeys = new Set(modeGroups.flatMap(g => g.keys || []));
  const base = {};
  Object.keys(colors).forEach(key => { if (!modeKeys.has(key)) base[key] = colors[key]; });
  if (!themeName) return base;
  const suffix = `-${themeName}`;
  const group = modeGroups.find(g => g.name === `mode-${themeName}`);
  (group ? group.keys : Object.keys(colors)).forEach(key => {
    if (key.endsWith(suffix)) base[key.slice(0, -suffix.length)] = colors[key];
  });
  return base;
}

function getFlatModeNames() {
  return (state.colorGroupsMeta || []).filter(g => String(g.name || '').startsWith('mode-')).map(g => g.name.slice(5));
}

// ============================================================================
// 5b. Preview theme switcher (display-only, never written to YAML)
// ============================================================================
function initPreviewThemeFromStorage() {
  let saved = null;
  try {
    saved = localStorage.getItem(PREVIEW_THEME_STORAGE_KEY);
  } catch (err) {
    saved = null;
  }
  state.activeDesignTheme = saved || null;
}

function savePreviewThemeToStorage() {
  try {
    if (state.activeDesignTheme) {
      localStorage.setItem(PREVIEW_THEME_STORAGE_KEY, state.activeDesignTheme);
    } else {
      localStorage.removeItem(PREVIEW_THEME_STORAGE_KEY);
    }
  } catch (err) {
    // localStorage may be unavailable; fail silently.
  }
}

// Rebuilds the <option> list of the preview theme <select> from
// state.parsedYaml.modes, preserving the current selection when still valid.
function renderPreviewThemeSelect() {
  const select = document.getElementById('preview-theme-select');
  if (!select) return;
  const themeKeys = getFlatModeNames();

  if (state.activeDesignTheme && !themeKeys.includes(state.activeDesignTheme)) {
    // The previously-selected theme no longer exists (deleted / renamed / new file loaded).
    state.activeDesignTheme = null;
    savePreviewThemeToStorage();
  }

  select.innerHTML = `<option value="">既定</option>` + themeKeys.map(k =>
    `<option value="${escapeHtml(k)}" ${k === state.activeDesignTheme ? 'selected' : ''}>${escapeHtml(k)}</option>`
  ).join('');
  select.value = state.activeDesignTheme || '';
}

// Central entry point for switching the active preview theme: persists the
// choice, then re-runs every downstream effect (CSS vars, accessibility
// panels, article sample) using the merged theme colors. Never mutates
// state.parsedYaml / rawContent.
function setActiveDesignTheme(themeName) {
  state.activeDesignTheme = themeName || null;
  savePreviewThemeToStorage();
  const select = document.getElementById('preview-theme-select');
  if (select) select.value = state.activeDesignTheme || '';
  applyTokensToCssVariables(state.parsedYaml);
  checkAccessibility(state.parsedYaml);
}

// Public entry point: guarantees the returned object is v2-shaped.
function ensureV2(yamlData) {
  if (!yamlData || typeof yamlData !== 'object') {
    return migrateV1ToV2({});
  }
  if (isV2Schema(yamlData)) {
    return normalizeV2(yamlData);
  }
  return migrateV1ToV2(yamlData);
}

// ============================================================================
// 5c. Current schema normalization
// ============================================================================
// v2 -> v3 colors key renames (current schema). Keys not listed pass through
// unchanged. Used both by the migrator and as a legacy-key fallback table for
// runtime code that reads a "core" v3 color (see baseColor()).
const V2_TO_V3_COLOR_KEY = {
  background: 'canvas',
  text: 'ink',
  'text-muted': 'ink-muted',
  border: 'hairline',
  danger: 'error'
};
const V3_COLOR_LEGACY_FALLBACK = { canvas: 'background', ink: 'text', 'ink-muted': 'text-muted', hairline: 'border', error: 'danger' };

// v2 -> v3 typography.styles key renames for the core scale slots
// (current schema). body/caption/strong keep their name.
const V2_TO_V3_STYLE_KEY = { h1: 'display-lg', h2: 'heading-lg', h3: 'heading-md', h4: 'heading-sm', small: 'body-sm' };

// The 8 markdown rendering slots (current schema) and the v3 style key each
// resolves to when typography.markdown doesn't say otherwise.
const MARKDOWN_SLOTS = ['h1', 'h2', 'h3', 'h4', 'body', 'small', 'caption', 'strong'];
const MARKDOWN_SLOT_DEFAULT_STYLE = {
  h1: 'display-lg', h2: 'heading-lg', h3: 'heading-md', h4: 'heading-sm',
  body: 'body', small: 'body-sm', caption: 'caption', strong: 'strong'
};

// Core v3 style keys (cannot be deleted from the UI). v3 renames the scale
// roles away from h1-h4/small (current schema); body/caption/strong unchanged.
const CORE_STYLE_KEYS = ['display-lg', 'heading-lg', 'heading-md', 'heading-sm', 'body', 'body-sm', 'caption', 'strong'];

const STANDARD_COLOR_DEFAULTS_V3 = {
  canvas: '#ffffff',
  surface: '#f4f6f8',
  ink: '#1c2530',
  'ink-muted': '#5b6b7c',
  primary: '#2f5fd6',
  'on-primary': '#ffffff',
  'primary-10': '#eaeffb',
  secondary: '#5c6b7a',
  'secondary-10': '#eff0f2',
  success: '#1f7a4d',
  'success-10': '#e9f2ed',
  error: '#c1352f',
  'error-10': '#f9ebea',
  warning: '#9c5700',
  'warning-10': '#f5eee6',
  info: '#0f6e8c',
  'info-10': '#e7f1f4',
  link: '#2554b8',
  'link-hover': '#173a80',
  hairline: '#d7dde3',
  emphasis: '#a6390f',
  'emphasis-10': '#f6ebe7'
};

// Reads a "core" v3 color key from a colors map, falling back to its v2 name
// if the v3 key isn't present (defensive: normalizeV3 always guarantees the
// v3 key exists, but helpers here are also called with raw/merged maps that
// may not have gone through normalization). Never throws.
function baseColor(colors, key, fallback) {
  const c = colors || {};
  if (Object.prototype.hasOwnProperty.call(c, key)) return c[key];
  const legacy = V3_COLOR_LEGACY_FALLBACK[key];
  if (legacy && Object.prototype.hasOwnProperty.call(c, legacy)) return c[legacy];
  return fallback;
}

// Resolves a markdown slot only from an explicit typography.markdown entry.
// Current DESIGN.md files must state this mapping; no visual default is inferred.
function resolveMarkdownSlotStyleKey(yamlData, slot) {
  const typography = (yamlData && yamlData.typography) || {};
  const markdown = typography.markdown || {};
  const styles = getTypographyStyles(typography);
  const assigned = markdown[slot];
  if (assigned && Object.prototype.hasOwnProperty.call(styles, assigned)) return assigned;
  return '';
}

function getMarkdownSlotAssignments(yamlData) {
  const out = {};
  MARKDOWN_SLOTS.forEach(slot => { out[slot] = resolveMarkdownSlotStyleKey(yamlData, slot); });
  return out;
}

// v3 detection (current schema): any of these signals means "already v3".
// Checked BEFORE the v2 heuristics so a native v3 file never round-trips
// through normalizeV2 (which would fabricate v2-only defaults like
// borders.radius / h1-h4 styles alongside the real v3 fields).
function detectV3(yamlData) {
  if (!yamlData || typeof yamlData !== 'object') return false;
  if (yamlData.colors && Object.prototype.hasOwnProperty.call(yamlData.colors, 'ink')) return true;
  if (yamlData.modes && typeof yamlData.modes === 'object' && Object.keys(yamlData.modes).length) return true;
  if (yamlData.typography && yamlData.typography.markdown) return true;
  if (yamlData.rounded && typeof yamlData.rounded === 'object') return true;
  return false;
}

// Converts a normalized v2 object (see normalizeV2/migrateV1ToV2) into v3
// shape (current schema). Renames colors + their references, legacy name->title,
// themes->modes, borders.radius->rounded, and generates typography.markdown.
function migrateV2ToV3(yamlData) {
  const v2 = yamlData || {};
  const v3 = {};

  if (v2.title !== undefined) v3.title = v2.title;
  else if (v2.name !== undefined) v3.title = v2.name;

  const renameColorKey = (k) => V2_TO_V3_COLOR_KEY[k] || k;
  const renameColorMap = (map) => {
    const src = map || {};
    const out = {};
    Object.keys(src).forEach(k => {
      const tintMatch = k.match(/^(.+)-(\d+)$/);
      const newKey = (tintMatch && V2_TO_V3_COLOR_KEY[tintMatch[1]])
        ? `${V2_TO_V3_COLOR_KEY[tintMatch[1]]}-${tintMatch[2]}`
        : renameColorKey(k);
      out[newKey] = src[k];
    });
    return out;
  };

  const oldColors = v2.colors || {};
  const colors = renameColorMap(oldColors);
  // on-primary auto-add (SPEC §10.2): pick whichever of black/white gives the
  // higher contrast against primary. Never overwrites an existing value.
  if (!colors['on-primary'] && colors.primary) {
    const whiteRatio = getContrastRatio('#ffffff', colors.primary);
    const blackRatio = getContrastRatio('#000000', colors.primary);
    colors['on-primary'] = whiteRatio >= blackRatio ? '#ffffff' : '#000000';
  }
  v3.colors = colors;

  // modes (was: themes) — same partial-override shape, colors renamed too.
  const oldModes = v2.themes || {};
  const modes = {};
  Object.keys(oldModes).forEach(modeKey => {
    const t = oldModes[modeKey] || {};
    modes[modeKey] = { colors: renameColorMap(t.colors || {}) };
  });
  v3.modes = modes;

  // typography.styles: rename core scale keys (h1-h4/small), keep everything
  // else as-is, and update any `color: <oldColorKey>` references. Collisions
  // (v2 already had a style literally named e.g. "display-lg") keep the old
  // key name — see SPEC §10.2.
  const oldStyles = (v2.typography || {}).styles || {};
  const styles = {};
  const appliedStyleKey = {}; // old key -> key actually used in v3.styles
  Object.keys(oldStyles).forEach(k => {
    const proposed = V2_TO_V3_STYLE_KEY[k];
    const useKey = (proposed && !Object.prototype.hasOwnProperty.call(oldStyles, proposed)) ? proposed : k;
    const st = Object.assign({}, oldStyles[k]);
    if (typeof st.color === 'string' && Object.prototype.hasOwnProperty.call(oldColors, st.color)) {
      st.color = renameColorKey(st.color);
    }
    styles[useKey] = st;
    appliedStyleKey[k] = useKey;
  });
  v3.typography = Object.assign({}, v2.typography, { styles });

  // typography.markdown: generated from the rename table above so every
  // slot points at whichever style key ended up holding that v2 role.
  const markdown = {};
  MARKDOWN_SLOTS.forEach(slot => {
    if (appliedStyleKey[slot]) markdown[slot] = appliedStyleKey[slot];
  });
  v3.typography.markdown = markdown;

  // rounded (was: borders.radius), moved to top-level.
  const oldBorders = v2.borders || {};
  v3.rounded = Object.assign({}, oldBorders.radius || {});

  // borders: width/color only; color reference renamed if it pointed at a
  // renamed colors key.
  let borderColor = oldBorders.color;
  if (typeof borderColor === 'string' && Object.prototype.hasOwnProperty.call(oldColors, borderColor)) {
    borderColor = renameColorKey(borderColor);
  }
  v3.borders = {
    width: oldBorders.width !== undefined ? oldBorders.width : 1,
    color: borderColor !== undefined ? borderColor : 'hairline'
  };

  v3.spacing = v2.spacing;
  v3.colorGroups = v2.colorGroups;

  // Carry over any remaining top-level metadata (version/author/description/
  // any custom field) untouched.
  Object.keys(v2).forEach(key => {
    if (['title', 'name', 'colors', 'themes', 'modes', 'typography', 'borders', 'colorGroups', 'spacing', 'rounded'].includes(key)) return;
    v3[key] = v2[key];
  });

  return v3;
}

// Fill in any missing v3 substructures defensively (does not overwrite
// present data; mirrors normalizeV2's role for v2). Accepts either a native
// v3 object or the output of migrateV2ToV3.
function normalizeV3(yamlData) {
  const v3 = Object.assign({}, yamlData);

  v3.colors = (yamlData.colors && typeof yamlData.colors === 'object')
    ? Object.assign({}, yamlData.colors)
    : {};

  // typography (current schema): styles are DIRECT children of typography
  // (`markdown` / `scale` are reserved keys), each style carrying `font` =
  // family name string (+ optional `source`). Three input shapes are accepted
  // and folded into that canonical form:
  //   a) canonical v3.1:  typography.<k>.font = "Outfit"（直下＋font直書き）
  //   b) fonts-ref (v2/v3.0): typography.fonts + (typography.styles|直下).<k>.font = "heading"
  //   c) interim (deprecated editor output): direct children with
  //      `family` / `weights` fields
  // `family`/`weights` are never emitted again (weights for the Google Fonts
  // loader are re-derived from each style's `weight` — see
  // collectGoogleFontRequests()); typography.fonts and any `styles:`
  // sub-block are dissolved after expansion.
  const typography = yamlData.typography || {};
  const legacyFonts = Object.assign({
    heading: { family: 'Outfit', source: 'google', weights: [600, 700] },
    body: { family: 'Outfit', source: 'google', weights: [400, 700] }
  }, typography.fonts || {});
  const hasExplicitFonts = typography.fonts && typeof typography.fonts === 'object';
  const directStyles = getTypographyStyles(typography);
  const sourceStyles = typography.styles && typeof typography.styles === 'object'
    ? typography.styles
    : directStyles;
  const normalizedStyles = {};
  Object.keys(sourceStyles).forEach(key => {
    if (TYPOGRAPHY_META_KEYS.has(key)) return; // reserved names can never be styles
    const style = Object.assign({}, sourceStyles[key] || {});
    // Resolve the final family + source for this style:
    let family = null;
    let source = style.source;
    if (typeof style.font === 'string' && style.font.trim()) {
      const ref = style.font.trim();
      // A fonts-key reference only counts as such while a fonts map is in
      // play (explicit fonts section, or the built-in heading/body defaults
      // for pre-v3.1 style sets). Otherwise `font` is already a family name.
      const fontDef = legacyFonts[ref];
      if (fontDef && (hasExplicitFonts || ref === 'heading' || ref === 'body')) {
        family = fontDef.family || 'Outfit';
        if (!source && fontDef.source) source = fontDef.source;
      } else {
        family = ref;
      }
    } else if (typeof style.family === 'string' && style.family.trim()) {
      family = style.family.trim(); // interim format
    } else {
      const roleKey = /^(display|heading)/.test(key) ? 'heading' : 'body';
      const fontDef = legacyFonts[roleKey] || {};
      family = fontDef.family || 'Outfit';
      if (!source && fontDef.source) source = fontDef.source;
    }
    delete style.font;
    delete style.family;
    delete style.weights; // dead field: never emitted (SPEC §5.2)
    delete style.source;
    const orderedStyle = { font: family };
    if (source !== undefined && source !== null && String(source).trim() !== '') orderedStyle.source = source;
    ['size', 'weight', 'lineHeight', 'letterSpacing', 'color', 'fontStyle', 'textTransform', 'fontFeature', 'textDecoration', 'fontVariationSettings'].forEach(prop => {
      if (style[prop] !== undefined) orderedStyle[prop] = style[prop];
    });
    delete style.embed;
    Object.keys(style).forEach(prop => {
      if (!Object.prototype.hasOwnProperty.call(orderedStyle, prop)) orderedStyle[prop] = style[prop];
    });
    normalizedStyles[key] = orderedStyle;
  });
  v3.typography = Object.assign({}, normalizedStyles);
  // Keep only explicit markdown assignments. Missing assignments remain
  // missing so the preview can accurately report an undefined slot.
  const markdown = Object.assign({}, typography.markdown || {});
  if (Object.keys(markdown).length) v3.typography.markdown = markdown;

  const elevation = yamlData.elevation || {};
  v3.elevation = {
    shadows: Object.assign({ none: 'none' }, elevation.shadows || {})
  };

  const borders = yamlData.borders || {};
  v3.borders = {
    width: borders.width !== undefined ? borders.width : 1,
    color: borders.color !== undefined ? borders.color : 'hairline'
  };

  v3.border = Object.assign({ none: 'none' }, (yamlData.border && typeof yamlData.border === 'object') ? yamlData.border : {});
  v3.rounded = Object.assign({ none: 0 }, (typeof yamlData.rounded === 'object' && yamlData.rounded !== null) ? yamlData.rounded : {});

  const rawSpacing = (yamlData.spacing && typeof yamlData.spacing === 'object') ? yamlData.spacing : {};
  v3.spacing = Object.assign({ none: 0 }, rawSpacing.scale || {}, rawSpacing);
  delete v3.spacing.scale;

  // colorGroups no longer exists in v3 (current schema): fold it into `colors`
  // once here (discarding an auto-generated "UI" group entirely) and stash
  // the resulting group metadata for parseDocument() to merge into
  // state.colorGroupsMeta. See flattenColorGroupsIntoColors().
  const flattenedGroups = flattenColorGroupsIntoColors(yamlData.colorGroups, v3.colors);
  v3.colors = flattenedGroups.colors;
  delete v3.colorGroups;
  if (flattenedGroups.groupsMeta.length) v3.__migratedColorGroupsMeta = flattenedGroups.groupsMeta;

  // Legacy modes/themes migrate into flat color tokens: canvas-dark, ink-dark…
  const legacyModes = normalizeModes(yamlData.modes || yamlData.themes);
  const migratedModeGroups = [];
  Object.keys(legacyModes).forEach(modeName => {
    const keys = [];
    Object.keys(legacyModes[modeName].colors || {}).forEach(baseKey => {
      const flatKey = `${baseKey}-${modeName}`;
      v3.colors[flatKey] = legacyModes[modeName].colors[baseKey];
      keys.push(flatKey);
    });
    migratedModeGroups.push({ name: `mode-${modeName}`, keys });
  });
  delete v3.modes;
  if (migratedModeGroups.length) v3.__migratedModeGroupsMeta = migratedModeGroups;

  if (yamlData.title !== undefined) v3.title = yamlData.title;
  else if (yamlData.name !== undefined) v3.title = yamlData.name;
  delete v3.name;
  delete v3.themes;

  // Stable top-level key order for serialization: title first,
  // then metadata, then the token sections in spec order, then any leftover
  // custom fields in their original relative order.
  const ordered = {};
  ['title', 'version', 'author', 'description', 'colors', 'typography', 'border', 'rounded', 'elevation', 'spacing', 'components', 'borders'].forEach(key => {
    if (v3[key] !== undefined) ordered[key] = v3[key];
  });
  Object.keys(v3).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(ordered, key)) ordered[key] = v3[key];
  });
  return ordered;
}

// Public entry point: guarantees the returned object is v3-shaped. A native
// v3 file (detectV3) is normalized directly; anything else runs the full
// v1 -> v2 -> v3 migration chain first. Always end up with a v3-shaped object.
function ensureV3(yamlData) {
  if (yamlData && typeof yamlData === 'object' && Object.keys(yamlData).length === 0) {
    return { colors: {}, typography: {}, border: {}, rounded: {}, elevation: { shadows: {} }, spacing: {}, components: {} };
  }
  if (yamlData && typeof yamlData === 'object' && detectV3(yamlData)) {
    return normalizeV3(yamlData);
  }
  return normalizeV3(migrateV2ToV3(ensureV2(yamlData)));
}

// ============================================================================
// 6. File Core Logics
// ============================================================================
async function loadTemplate(template) {
  if (!template || !template.design) return;
  try {
    const [designRes, previewRes] = await Promise.all([
      fetch(template.design, { cache: 'no-store' }),
      fetch(template.preview, { cache: 'no-store' })
    ]);
    if (!designRes.ok || !previewRes.ok) throw new Error('テンプレートのペアを読み込めません');
    const [designText, previewText] = await Promise.all([designRes.text(), previewRes.text()]);
    state.activeTemplate = template.id;
    state.externalImportSourceName = null;
    state.templateSaveBaseName = template.id;
    state.templateArmed = false;
    state.fileHandle = null;
    state.previewFileHandle = null;
    state.urlMdPath = null;
    state.urlPreviewPath = null;
    state.currentDesignPath = '';
    state.currentPreviewPath = '';
    state.rawContent = designText;
    state.previewMarkdown = previewText;
    document.getElementById('code-textarea').value = designText;
    const previewTextarea = document.getElementById('preview-textarea');
    if (previewTextarea) previewTextarea.value = previewText;
    document.getElementById('file-status').textContent = `テンプレート: design/templates/${template.id}`;
    syncCodeToVisualForm(true);
    renderArticleSample(state.parsedYaml);
    state.templateArmed = true;
    showToast(`テンプレート「${template.name || template.id}」を開きました`);
  } catch (err) {
    console.error('テンプレート読み込み失敗:', err);
    showToast('テンプレートの読み込みに失敗しました', 'error');
  }
}

async function loadTemplateList() {
  const container = document.getElementById('templates-container');
  if (!container) return;
  try {
    const res = await fetch('/__templates', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const templates = Array.isArray(data.templates) ? data.templates : [];
    container.innerHTML = templates.length ? templates.map(template => `
      <button type="button" class="template-card" data-template-id="${escapeHtml(template.id)}">
        <span class="template-info"><strong>${escapeHtml(template.name)}</strong><span>${escapeHtml(template.description || '')}</span></span>
      </button>`).join('') : '<p class="templates-intro">design/templatesにテンプレートがありません。</p>';
    container.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', () => loadTemplate(templates.find(item => item.id === card.dataset.templateId)));
    });
  } catch (err) {
    container.innerHTML = '<p class="templates-intro">テンプレート一覧を取得できません。node server.mjsで起動してください。</p>';
  }
}

function parseDocument(content) {
  try {
    const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---/m;
    const match = content.match(yamlRegex);

    let rawYaml;
    let yamlStr = '';
    if (match) {
      yamlStr = match[1];
      rawYaml = jsyaml.load(yamlStr) || {};
      state.markdownBody = content.substring(match[0].length).trim();
    } else {
      rawYaml = {};
      state.markdownBody = content.trim();
    }

    // Auto-migrate v1 -> v2 -> v3. Always end up with a v3-shaped object.
    state.parsedYaml = ensureV3(rawYaml);
    syncScaleHelperState(state.parsedYaml);

    // Color grouping (current schema): re-derive from the raw `colors:` text
    // every load, so an external edit to the comments is picked up
    // immediately. Any groups recovered from a (now-flattened) legacy
    // colorGroups section — see flattenColorGroupsIntoColors() — are appended
    // after the text-derived groups, then everything is reconciled against
    // the final colors object (orphans -> unclassified, stale keys dropped).
    const textGroups = parseColorGroupsMetaFromYamlText(yamlStr);
    const migratedGroups = state.parsedYaml.__migratedColorGroupsMeta || [];
    const migratedModeGroups = state.parsedYaml.__migratedModeGroupsMeta || [];
    delete state.parsedYaml.__migratedColorGroupsMeta;
    delete state.parsedYaml.__migratedModeGroupsMeta;
    state.colorGroupsMeta = reconcileColorGroupsMeta(textGroups.concat(migratedGroups, migratedModeGroups), state.parsedYaml.colors || {});
    const parsedTypographyGroups = parseTypographyGroupsMetaFromYamlText(yamlStr);
    const typographyStyles = getTypographyStyles(state.parsedYaml.typography);
    state.typographyGroupsMeta = parsedTypographyGroups.some(g => g.name !== null)
      ? reconcileTypographyGroupsMeta(parsedTypographyGroups, typographyStyles)
      : inferTypographyGroupsMeta(typographyStyles);
    const parsedComponentGroups = parseComponentGroupsMetaFromYamlText(yamlStr);
    state.componentGroupsMeta = parsedComponentGroups.some(g => g.name !== null)
      ? reconcileComponentGroupsMeta(parsedComponentGroups, state.parsedYaml.components || {})
      : inferComponentGroupsMeta(state.parsedYaml.components || {});

    return true;
  } catch (err) {
    console.error('YAMLパースエラー:', err);
    return false;
  }
}

function snapScaleRatio(rawRatio) {
  const presets = [1.2, 1.25, 1.333, 1.414, 1.5, 1.618];
  const ratio = Number(rawRatio) || 1.25;
  return presets.reduce((best, current) => (Math.abs(current - ratio) < Math.abs(best - ratio) ? current : best), presets[0]);
}

function deriveScaleHelperState(yamlData) {
  const typography = (yamlData && yamlData.typography) || {};
  const styles = getTypographyStyles(typography);
  if (typography.scale && typeof typography.scale === 'object') {
    return {
      base: Number(typography.scale.base) || 16,
      ratio: snapScaleRatio(typography.scale.ratio),
      applied: true
    };
  }
  const bodyKey = resolveMarkdownSlotStyleKey(yamlData, 'body');
  const h4Key = resolveMarkdownSlotStyleKey(yamlData, 'h4');
  const base = Number((styles[bodyKey] || {}).size) || 16;
  const h4 = Number((styles[h4Key] || {}).size) || Math.round(base * 1.25);
  return {
    base,
    ratio: snapScaleRatio(h4 / base),
    applied: false
  };
}

function syncScaleHelperState(yamlData) {
  state.scaleHelper = deriveScaleHelperState(yamlData);
}

function clearAppliedTypographyScale() {
  if (state.parsedYaml.typography && state.parsedYaml.typography.scale) {
    delete state.parsedYaml.typography.scale;
  }
  syncScaleHelperState(state.parsedYaml);
}

// Re-orders `colors` keys per colorGroupsMeta (unclassified first, then each
// named group's keys in order) so jsyaml.dump()'s insertion-order output
// lines the colors up for insertColorGroupComments() to annotate. Also
// returns the reconciled meta (orphans folded into unclassified, stale keys
// dropped, empty named groups preserved) so callers can persist it back
// onto state.colorGroupsMeta.
function buildOrderedColorsForSave(colors, groupsMeta) {
  const meta = reconcileColorGroupsMeta(groupsMeta, colors);
  const ordered = {};
  meta.forEach(g => { g.keys.forEach(k => { ordered[k] = colors[k]; }); });
  Object.keys(colors || {}).forEach(k => { if (!Object.prototype.hasOwnProperty.call(ordered, k)) ordered[k] = colors[k]; });
  return { ordered, meta };
}

// Post-processes jsyaml.dump() output: REBUILDS the `colors:` block body from
// the group metadata — each key's dumped line is kept verbatim (values are
// always single-line scalars: hex / rgba strings), re-emitted in meta order
// with a `  # <Group>` comment line opening each named group (SPEC-v3.md
// §2.1). An empty named group emits just its bare comment line, which
// parseColorGroupsMetaFromYamlText() reads back as an empty group — so
// freshly-created groups survive the save/reload round trip.
function insertColorGroupComments(yamlStr, meta) {
  const groups = meta || [];
  if (!groups.some(g => g.name !== null)) return yamlStr;

  const lines = yamlStr.split('\n');
  const startIdx = lines.findIndex(l => /^colors:\s*$/.test(l));
  if (startIdx === -1) return yamlStr;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) { endIdx = i; break; }
  }

  // Map each dumped colors key -> its exact line text.
  const keyLineRe = /^\s*(['"]?)([A-Za-z0-9_.\-]+)\1\s*:/;
  const lineByKey = {};
  const blockKeysInDumpOrder = [];
  for (let i = startIdx + 1; i < endIdx; i++) {
    const m = lines[i].match(keyLineRe);
    if (m) {
      lineByKey[m[2]] = lines[i];
      blockKeysInDumpOrder.push(m[2]);
    }
  }

  // Rebuild: unclassified keys first (no comment), then each named group as
  // `  # <name>` + its keys' lines. Keys somehow present in the dump but not
  // in meta (should not happen after reconcile) are appended to the front
  // (unclassified position) so nothing is ever lost.
  const emitted = new Set();
  const body = [];
  groups.forEach(g => {
    if (g.name !== null) body.push(`  # ${g.name}`);
    g.keys.forEach(k => {
      if (Object.prototype.hasOwnProperty.call(lineByKey, k) && !emitted.has(k)) {
        body.push(lineByKey[k]);
        emitted.add(k);
      }
    });
  });
  const leftovers = blockKeysInDumpOrder.filter(k => !emitted.has(k)).map(k => lineByKey[k]);

  return lines.slice(0, startIdx + 1)
    .concat(leftovers, body, lines.slice(endIdx))
    .join('\n');
}

function buildDocument() {
  try {
    const { ordered, meta } = buildOrderedColorsForSave(state.parsedYaml.colors || {}, state.colorGroupsMeta || []);
    state.colorGroupsMeta = meta;
    // typography (current schema): styles are direct children of typography,
    // emitted in group order; markdown comes after
    // the style group blocks.
    const typography = state.parsedYaml.typography || {};
    const orderedTypography = buildOrderedTypographyStyles(getTypographyStyles(typography), state.typographyGroupsMeta || []);
    state.typographyGroupsMeta = orderedTypography.meta;
    const typographyForSave = Object.assign({}, orderedTypography.ordered);
    if (typography.markdown) typographyForSave.markdown = typography.markdown;
    state.componentGroupsMeta = reconcileComponentGroupsMeta(state.componentGroupsMeta, state.parsedYaml.components || {});
    const orderedComponents = {};
    state.componentGroupsMeta.forEach(g => g.keys.forEach(k => { if (state.parsedYaml.components && state.parsedYaml.components[k]) orderedComponents[k] = state.parsedYaml.components[k]; }));
    const yamlForSave = Object.assign({}, state.parsedYaml, { colors: ordered, typography: typographyForSave });
    if (Object.keys(orderedComponents).length) yamlForSave.components = orderedComponents; else delete yamlForSave.components;
    delete yamlForSave.colorGroups;
    delete yamlForSave.modes;
    delete yamlForSave.borders;
    if (!Object.keys(yamlForSave.rounded || {}).length) delete yamlForSave.rounded;
    let yamlStr = jsyaml.dump(yamlForSave, { indent: 2, lineWidth: -1 }).trim();
    yamlStr = insertColorGroupComments(yamlStr, meta);
    yamlStr = insertTypographyGroupComments(yamlStr, state.typographyGroupsMeta);
    yamlStr = insertComponentGroupComments(yamlStr, state.componentGroupsMeta);
    const markdown = state.markdownBody.trim();
    const fullContent = `---\n${yamlStr}\n---\n\n${markdown}`;

    state.rawContent = fullContent;

    const textarea = document.getElementById('code-textarea');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const scrollTop = textarea.scrollTop;
    const hadFocus = document.activeElement === textarea;

    textarea.value = fullContent;

    if (hadFocus) {
      textarea.selectionStart = start;
      textarea.selectionEnd = end;
      textarea.scrollTop = scrollTop;
    }

    updateLineNumbers();
    scheduleAutoSaveDesign();
    renderPreviewCanvasDynamicBits(state.parsedYaml);
  } catch (err) {
    console.error('ドキュメントビルドエラー:', err);
  }
}

// Line Numbers Sync
function updateLineNumbers() {
  const textarea = document.getElementById('code-textarea');
  const lineNumbersContainer = document.getElementById('line-numbers');
  const lines = textarea.value.split('\n');

  let lineNumbersHtml = '';
  for (let i = 1; i <= lines.length; i++) {
    lineNumbersHtml += `${i}\n`;
  }

  lineNumbersContainer.textContent = lineNumbersHtml;
}

// ============================================================================
// 7. Dynamic CSS Variable Generator
// ============================================================================
// Public entry point used by ~25 call sites throughout the app. When the
// caller passes state.parsedYaml itself (the common case) and a non-default
// preview theme is currently active, we transparently apply the merged
// theme colors on top before generating CSS variables — WITHOUT mutating
// yamlData/state.parsedYaml. Explicit callers that already computed their
// own overrideColors (2nd arg) take precedence.
function applyTokensToCssVariables(yamlData, overrideColors) {
  let effectiveOverride = overrideColors;
  if (!effectiveOverride && yamlData === state.parsedYaml && state.activeDesignTheme) {
    effectiveOverride = getMergedThemeColors(yamlData, state.activeDesignTheme);
  }
  return applyTokensToCssVariablesRaw(yamlData, effectiveOverride);
}

// `overrideColors`: optional. When provided (e.g. the merged colors of the
// active preview theme), it is used in place of yamlData.colors for CSS
// variable / tint generation purposes only. It never mutates yamlData or
// state.parsedYaml — it's a pure display-only transform layer.
function applyTokensToCssVariablesRaw(yamlData, overrideColors) {
  const styleEl = document.getElementById('dynamic-tokens-style');
  const v2 = yamlData || {};
  const colors = overrideColors || v2.colors || {};
  const typography = v2.typography || {};
  const styles = getTypographyStyles(typography);
  const elevation = v2.elevation || {};
  const shadows = elevation.shadows || {};
  const borders = v2.borders || {};
  const radius = v2.rounded || borders.radius || {};
  const spacing = v2.spacing || {};

  const lines = [];

  // Colors: --color-<key>
  Object.keys(colors).forEach(key => {
    lines.push(`--color-${slugifyKey(key)}: ${colors[key]};`);
  });

  // Compatibility aliases used by the editor stylesheet.
  // --color-text / --color-background / --color-border / --color-text-muted /
  // --color-danger directly. Only emitted when the colors map itself doesn't
  // already define that exact key (e.g. a hand-authored file still using v2
  // names, or a color literally named "text").
  const LEGACY_COLOR_ALIASES = { text: 'ink', background: 'canvas', border: 'hairline', 'text-muted': 'ink-muted', danger: 'error' };
  Object.keys(LEGACY_COLOR_ALIASES).forEach(legacyKey => {
    if (Object.prototype.hasOwnProperty.call(colors, legacyKey)) return;
    const v3Key = LEGACY_COLOR_ALIASES[legacyKey];
    if (Object.prototype.hasOwnProperty.call(colors, v3Key)) {
      lines.push(`--color-${legacyKey}: ${colors[v3Key]};`);
    }
  });

  // Which of the 8 markdown slots (h1-h4/body/small/caption/strong) each
  // style key services, used below both for slot font-role defaulting and
  // for the --ts-h1-* .. --ts-strong-* slot aliases.
  const slotAssignments = getMarkdownSlotAssignments(v2);
  const headingSlotStyleKeys = new Set(['h1', 'h2', 'h3', 'h4'].map(slot => slotAssignments[slot]));

  // Text styles: --ts-<style>-size/weight/line-height/letter-spacing/color
  Object.keys(styles).forEach(key => {
    const st = styles[key] || {};
    if (st.size !== undefined) lines.push(`--ts-${slugifyKey(key)}-size: ${st.size}px;`);
    if (st.weight !== undefined) lines.push(`--ts-${slugifyKey(key)}-weight: ${st.weight};`);
    if (st.lineHeight !== undefined) lines.push(`--ts-${slugifyKey(key)}-line-height: ${st.lineHeight};`);
    if (st.letterSpacing !== undefined) lines.push(`--ts-${slugifyKey(key)}-letter-spacing: ${st.letterSpacing};`);
    if (st.fontStyle !== undefined) lines.push(`--ts-${slugifyKey(key)}-font-style: ${st.fontStyle};`);
    if (st.textTransform !== undefined) lines.push(`--ts-${slugifyKey(key)}-text-transform: ${st.textTransform};`);
    if (st.fontFeature !== undefined) lines.push(`--ts-${slugifyKey(key)}-font-feature-settings: ${st.fontFeature};`);
    if (st.textDecoration !== undefined) lines.push(`--ts-${slugifyKey(key)}-text-decoration: ${st.textDecoration};`);
    if (st.fontVariationSettings !== undefined) lines.push(`--ts-${slugifyKey(key)}-font-variation-settings: ${st.fontVariationSettings};`);
    const resolvedColor = resolveColor(st.color, colors, baseColor(colors, 'ink', '#0f172a'));
    lines.push(`--ts-${slugifyKey(key)}-color: ${resolvedColor};`);
    if (st.font) lines.push(`--ts-${slugifyKey(key)}-font: '${st.font}', ${guessGenericFallback(st)};`);
  });

  // Slot aliases used by the Markdown preview and editor stylesheet:
  // --ts-h1-* .. --ts-strong-* — emit those 8 slot names pointing at whichever
  // style key typography.markdown assigned to that slot.
  MARKDOWN_SLOTS.forEach(slot => {
    const styleKey = slotAssignments[slot];
    if (styleKey === slot) return; // already emitted above under its own name
    const st = styles[styleKey];
    if (!st) return;
    if (st.size !== undefined) lines.push(`--ts-${slot}-size: ${st.size}px;`);
    if (st.weight !== undefined) lines.push(`--ts-${slot}-weight: ${st.weight};`);
    if (st.lineHeight !== undefined) lines.push(`--ts-${slot}-line-height: ${st.lineHeight};`);
    if (st.letterSpacing !== undefined) lines.push(`--ts-${slot}-letter-spacing: ${st.letterSpacing};`);
    if (st.fontStyle !== undefined) lines.push(`--ts-${slot}-font-style: ${st.fontStyle};`);
    if (st.textTransform !== undefined) lines.push(`--ts-${slot}-text-transform: ${st.textTransform};`);
    if (st.fontFeature !== undefined) lines.push(`--ts-${slot}-font-feature-settings: ${st.fontFeature};`);
    if (st.textDecoration !== undefined) lines.push(`--ts-${slot}-text-decoration: ${st.textDecoration};`);
    if (st.fontVariationSettings !== undefined) lines.push(`--ts-${slot}-font-variation-settings: ${st.fontVariationSettings};`);
    lines.push(`--ts-${slot}-color: ${resolveColor(st.color, colors, baseColor(colors, 'ink', '#0f172a'))};`);
    if (st.font) lines.push(`--ts-${slot}-font: '${st.font}', ${guessGenericFallback(st)};`);
  });

  // Legacy font aliases (current schema): styles.css still falls back to
  // --font-title / --font-body / --font-heading. fonts廃止後は markdown 割当の
  // h1スロット（title/heading）と bodyスロット（body）のスタイルの font で出力。
  const h1Style = styles[slotAssignments.h1];
  const bodyStyle = styles[slotAssignments.body];
  if (h1Style && h1Style.font) {
    lines.push(`--font-title: '${h1Style.font}', ${guessGenericFallback(h1Style)};`);
    lines.push(`--font-heading: '${h1Style.font}', ${guessGenericFallback(h1Style)};`);
  }
  if (bodyStyle && bodyStyle.font) {
    lines.push(`--font-body: '${bodyStyle.font}', ${guessGenericFallback(bodyStyle)};`);
  }

  // Shadows: --shadow-<key>
  Object.keys(shadows).forEach(key => {
    lines.push(`--shadow-${slugifyKey(key)}: ${shadows[key]};`);
  });

  // Radius: --radius-<key> (source: top-level `rounded`, v2 back-compat: borders.radius)
  Object.keys(radius).forEach(key => {
    lines.push(`--radius-${slugifyKey(key)}: ${radius[key]}px;`);
  });
  ['xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'full'].forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(radius, key)) lines.push(`--radius-${key}: 0px;`);
  });

  // Borders: width / color
  lines.push(`--border-width: ${borders.width !== undefined ? borders.width : 1}px;`);
  lines.push(`--border-color: ${resolveColor(borders.color, colors, colors.secondary || '#94a3b8')};`);

  // Spacing
  const spacingUnit = spacing.base !== undefined ? spacing.base : 8;
  lines.push(`--spacing-unit: ${spacingUnit}px;`);
  // Named spacing tokens live directly below `spacing`.
  Object.keys(spacing).filter(key => key !== 'base').forEach(key => {
    lines.push(`--spacing-${slugifyKey(key)}: ${spacing[key]}px;`);
  });

  // Back-compat variables consumed by existing CSS
  lines.push(`--border-radius: ${radius.md !== undefined ? radius.md : 0}px;`);

  const css = `:root {\n  ${lines.join('\n  ')}\n}`;

  // .ts-<styleKey> (current schema): a class rule per typography.styles key
  // (not just the 8 fixed slots), so preview shortcodes can reference any core/custom
  // style by its real name (e.g. .ts-display-lg, .ts-eyebrow).
  const styleClassRules = Object.keys(styles).map(key => {
    const slug = slugifyKey(key);
    return `.ts-${slug} { font-family: var(--ts-${slug}-font, var(--font-body)); font-size: var(--ts-${slug}-size); font-weight: var(--ts-${slug}-weight); line-height: var(--ts-${slug}-line-height); letter-spacing: var(--ts-${slug}-letter-spacing, normal); font-style: var(--ts-${slug}-font-style, normal); text-transform: var(--ts-${slug}-text-transform, none); font-feature-settings: var(--ts-${slug}-font-feature-settings, normal); text-decoration: var(--ts-${slug}-text-decoration, none); font-variation-settings: var(--ts-${slug}-font-variation-settings, normal); color: var(--ts-${slug}-color); }`;
  }).join('\n');

  styleEl.textContent = `${css}\n${styleClassRules}`;

  // Keep Google Fonts loaded to match current font definitions
  syncGoogleFonts(styles);

  // Refresh canvas bits that need literal (non-CSS-var) text/markup regenerated
  // (typography meta labels, shadow chip list, article group blocks). Safe
  // no-op if DOM not ready yet. When an overrideColors (active theme) is in
  // effect, pass a shallow view with colors swapped so downstream renderers
  // Preview consumers use the same effective colors —
  // without mutating v2/state.parsedYaml itself.
  const previewViewData = overrideColors ? Object.assign({}, v2, { colors: colors }) : v2;
  renderPreviewCanvasDynamicBits(previewViewData);
}

function guessGenericFallback(fontDef) {
  if (!fontDef) return 'sans-serif';
  const fam = String(typeof fontDef === 'string' ? fontDef : (fontDef.font || fontDef.family || '')).toLowerCase();
  if (fam.includes('serif') && !fam.includes('sans')) return 'serif';
  if (fam.includes('mono') || fam.includes('courier') || fam.includes('code')) return 'monospace';
  return 'sans-serif';
}

// ============================================================================
// 8. Google Fonts dynamic loader (current schema)
// ============================================================================
// fonts廃止後のロード規約: styles全体から source:google のスタイルを走査し、
// family -> そのfamilyを使う各スタイルの weight 値の集合、を収集する。
function collectGoogleFontRequests(styles) {
  const byFamily = {};
  Object.keys(styles || {}).forEach(key => {
    const st = styles[key];
    if (!st || st.source !== 'google') return;
    const family = typeof st.font === 'string' ? st.font.trim() : '';
    if (!family) return;
    if (!byFamily[family]) byFamily[family] = new Set();
    const w = parseInt(st.weight, 10);
    byFamily[family].add(Number.isFinite(w) ? w : 400);
  });
  return Object.keys(byFamily).map(family => ({
    family,
    weights: Array.from(byFamily[family]).sort((a, b) => a - b)
  }));
}

function syncGoogleFonts(styles) {
  const managedIds = new Set();
  collectGoogleFontRequests(styles).forEach(req => {
    const linkId = `gfont-${slugifyKey(req.family)}`;
    managedIds.add(linkId);
    const familyParam = encodeURIComponent(req.family).replace(/%20/g, '+');
    const href = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${req.weights.join(';')}&display=swap`;

    let link = document.getElementById(linkId);
    if (link) {
      if (link.getAttribute('href') !== href) {
        link.setAttribute('href', href);
      }
    } else {
      link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = href;
      link.onerror = () => {
        // Fail silently: fallback fonts in CSS keep the UI usable.
        console.warn(`Google Fontsの読み込みに失敗しました: ${req.family}`);
      };
      document.head.appendChild(link);
    }
  });

  // Remove stale font links for families that no longer exist / no longer use google
  document.querySelectorAll('link[id^="gfont-"]').forEach(link => {
    if (!managedIds.has(link.id)) {
      link.remove();
    }
  });

  syncOtherWebFonts(styles);
}

function extractWebFontStylesheetUrl(embed) {
  const str=String(embed||'').trim();if(!str)return '';
  const href=str.match(/href=["'](https?:\/\/[^"']+)["']/i);if(href)return href[1];
  const imported=str.match(/@import\s+(?:url\()?\s*["']?(https?:\/\/[^"')\s;]+)["']?\s*\)?/i);if(imported)return imported[1];
  return /^https?:\/\/\S+$/i.test(str)?str:'';
}

function getPreviewWebFontEmbeds(){const map={};const regex=/<!--\s*webfont\s*\nfamily:\s*([^\n]+)\nembed:\s*([\s\S]*?)\n-->/gi;let match;while((match=regex.exec(state.previewMarkdown||'')))map[match[1].trim()]=match[2].trim();return map;}
function getPreviewWebFontEmbed(family){return getPreviewWebFontEmbeds()[String(family||'').trim()]||'';}
function updatePreviewWebFontEmbed(family,embed){const name=String(family||'').trim();if(!name)return;const nextEmbed=String(embed||'').trim();if(getPreviewWebFontEmbed(name)===nextEmbed)return;const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const regex=new RegExp(`\\n?<!--\\s*webfont\\s*\\nfamily:\\s*${escaped}\\nembed:\\s*[\\s\\S]*?\\n-->`,'i');const block=nextEmbed?`<!-- webfont\nfamily: ${name}\nembed: ${nextEmbed}\n-->`:'';let markdown=state.previewMarkdown||'';markdown=regex.test(markdown)?markdown.replace(regex,block):(block?`${markdown.trimEnd()}\n\n${block}\n`:markdown);state.previewMarkdown=markdown.replace(/\n{3,}$/,'\n\n');const textarea=document.getElementById('preview-textarea');if(textarea&&textarea.value!==state.previewMarkdown)textarea.value=state.previewMarkdown;schedulePreviewSave();scheduleAutoSavePreview();renderArticleSample(state.parsedYaml);}

function syncOtherWebFonts(styles) {
  const previewEmbeds=getPreviewWebFontEmbeds();const urls=new Set();Object.values(styles||{}).forEach(st=>{if(st&&st.source==='other'){const url=extractWebFontStylesheetUrl(previewEmbeds[st.font]||st.embed);if(url)urls.add(url);}});
  const managed=new Set();Array.from(urls).forEach((url,index)=>{const id=`other-font-${index}`;managed.add(id);let link=document.getElementById(id);if(!link){link=document.createElement('link');link.id=id;link.rel='stylesheet';document.head.appendChild(link);}if(link.getAttribute('href')!==url)link.setAttribute('href',url);});
  document.querySelectorAll('link[id^="other-font-"]').forEach(link=>{if(!managed.has(link.id))link.remove();});
}

// ============================================================================
// 9. Token Input Generator (current schema)
// ============================================================================
function generateVisualForm(yamlData, forceRebuild = false) {
  const container = document.getElementById('tokens-accordion');

  if (container.querySelectorAll('.accordion-section').length > 0 && !forceRebuild) {
    updateVisualFormValues(yamlData);
    return;
  }

  container.innerHTML = '';

  const sections = [
    { id: 'sec-colors', title: 'カラー (colors)', icon: 'palette', render: renderColorsSection },
    { id: 'sec-styles', title: 'タイポグラフィ (typography)', icon: 'type', render: renderStylesSection },
    { id: 'sec-border', title: 'ボーダー (border)', icon: 'frame', render: renderBorderSection },
    { id: 'sec-borders', title: 'ラウンド (rounded)', icon: 'square', render: renderBordersSection },
    { id: 'sec-shadows', title: 'シャドウ (elevation.shadows)', icon: 'layers', render: renderShadowsSection },
    { id: 'sec-spacing', title: 'スペーシング (spacing)', icon: 'expand', render: renderSpacingSection },
    { id: 'sec-components', title: 'コンポーネント (components)', icon: 'blocks', render: renderComponentsSection }
  ];

  sections.forEach((sec, idx) => {
    const activeClass = '';

    const sectionEl = document.createElement('div');
    sectionEl.className = `accordion-section ${activeClass}`;
    sectionEl.id = sec.id;

    const headerEl = document.createElement('div');
    headerEl.className = 'accordion-header';
    headerEl.innerHTML = `
      <h3><i data-lucide="${sec.icon}"></i><span>${sec.title}</span></h3>
      <i data-lucide="chevron-down" class="accordion-icon"></i>
    `;

    headerEl.addEventListener('click', () => {
      sectionEl.classList.toggle('active');
    });

    const bodyEl = document.createElement('div');
    bodyEl.className = 'accordion-body';

    sec.render(bodyEl, yamlData);

    sectionEl.appendChild(headerEl);
    sectionEl.appendChild(bodyEl);
    container.appendChild(sectionEl);
  });

  lucide.createIcons();
}

// Update existing visual form values without rebuilding DOM (avoids focus loss).
function updateVisualFormValues(yamlData) {
  const colors = yamlData.colors || {};

  // Colors: update value of existing rows; if the set of keys or the
  // grouping (colorGroupsMeta, re-derived fresh from text on every
  // parseDocument() call) changed, rebuild instead.
  const existingColorKeys = Array.from(document.querySelectorAll('#sec-colors [data-color-key]')).map(el => el.getAttribute('data-color-key'));
  const currentColorKeys = Object.keys(colors);
  const sameKeySet = existingColorKeys.length === currentColorKeys.length && existingColorKeys.every(k => currentColorKeys.includes(k));
  const colorsBodyElForGroups = document.querySelector('#sec-colors .accordion-body');
  const groupsChanged = colorsBodyElForGroups
    ? (colorsBodyElForGroups.getAttribute('data-groups-signature') || '') !== JSON.stringify(state.colorGroupsMeta || [])
    : false;
  const editingGroupName = activeEditingKey && activeEditingKey.indexOf('group:') === 0;

  if (!sameKeySet || (groupsChanged && !editingGroupName)) {
    const bodyEl = document.querySelector('#sec-colors .accordion-body');
    if (bodyEl) renderColorsSection(bodyEl, yamlData);
  } else {
    currentColorKeys.forEach(key => {
      if (key === activeEditingKey) return; // don't clobber active rename input
      const val = colors[key];
      const picker = document.getElementById(`color-picker-${slugifyKey(key)}`);
      const text = document.getElementById(`color-text-${slugifyKey(key)}`);
      const parsed = parseColorToRgba(val);
      const opaqueHex = rgbaToCss(parsed.r, parsed.g, parsed.b, 1);
      if (picker && document.activeElement !== picker) picker.value = opaqueHex;
      if (text && document.activeElement !== text) text.value = colorValueForDisplay(val);
      const alphaSlider = document.getElementById(`color-alpha-${slugifyKey(key)}`);
      if (alphaSlider && document.activeElement !== alphaSlider) alphaSlider.value = Math.round(parsed.a * 100);
    });
    // Refresh the tint generator preview since underlying values may have changed externally.
    refreshTintGenerator();
  }

  // Styles: rerender numeric fields only if not actively focused; simplest safe approach
  // is to leave existing style rows alone unless a full rebuild is requested elsewhere,
  // since most style edits already go through direct DOM handlers. We just refresh
  // read-only preview bits (scale outputs) here.
  refreshStylePreviewChips(yamlData);

  // Shadows preview refresh
  refreshShadowChips(yamlData);

  // Borders / spacing simple numeric sync
  const borders = yamlData.borders || {};
  const radius = yamlData.rounded || borders.radius || {};
  ['sm', 'md', 'lg', 'full'].forEach(k => {
    const input = document.getElementById(`radius-input-${k}`);
    if (input && document.activeElement !== input && radius[k] !== undefined) input.value = radius[k];
  });
  const widthInput = document.getElementById('border-width-input');
  if (widthInput && document.activeElement !== widthInput && borders.width !== undefined) widthInput.value = borders.width;

  const spacing = yamlData.spacing || {};
  const spacingSlider = document.getElementById('spacing-slider-base');
  const spacingLabel = document.getElementById('spacing-val-base');
  if (spacingSlider && document.activeElement !== spacingSlider && spacing.base !== undefined) {
    spacingSlider.value = spacing.base;
  }
  if (spacingLabel && spacing.base !== undefined) {
    spacingLabel.textContent = `${spacing.base}px`;
  }


  renderPreviewThemeSelect();
}

// ---- 9a. Colors section ----
function renderColorsSection(bodyEl, yamlData) {
  bodyEl.innerHTML = '';
  const baseColors = yamlData.colors || {};

  reconcileColorGroupsMetaState();
  bodyEl.setAttribute('data-groups-signature', JSON.stringify(state.colorGroupsMeta));
  const groups = state.colorGroupsMeta;
  const namedGroups = groups.filter(g => g.name !== null);

  if (!namedGroups.length) {
    // No groups defined at all: plain flat list, no extra headings
    // (current schema: "グループが1つも無いファイルでは従来どおりのフラット表示").
    const listEl = document.createElement('div');
    listEl.className = 'token-dynamic-list';
    listEl.id = 'colors-list';
    Object.keys(baseColors).forEach(key => listEl.appendChild(buildColorRow(key, baseColors[key], yamlData)));
    bodyEl.appendChild(listEl);
  } else {
    groups.forEach(g => {
      if (g.name === null && !g.keys.length) return;
      bodyEl.appendChild(buildColorGroupBlock(g, baseColors, yamlData));
    });
  }

  const actions = document.createElement('div');
  actions.className = 'color-footer-actions';
  actions.innerHTML = `<button class="btn btn-secondary btn-sm" data-action="unclassified"><i data-lucide="plus"></i><span>未分類色</span></button><button class="btn btn-secondary btn-sm" data-action="group"><i data-lucide="folder-plus"></i><span>色グループ</span></button><button class="btn btn-secondary btn-sm" data-action="mode"><i data-lucide="moon"></i><span>mode</span></button>`;
  actions.querySelector('[data-action="unclassified"]').addEventListener('click', () => {
    const key = generateUniqueKey(baseColors, 'color'); state.parsedYaml.colors[key] = '#888888'; colorGroupsMetaAddKey(key, null); buildDocument(); rerenderColorEditingSections();
  });
  actions.querySelector('[data-action="group"]').addEventListener('click', () => {
    const name = generateUniqueGroupName('group');
    ensureColorGroupsMetaGroup(name);
    buildDocument();
    rerenderColorEditingSections();
    showToast(`グループ「${name}」を追加しました`);
  });
  actions.querySelector('[data-action="mode"]').addEventListener('click', () => renderModeCreator(actions));
  bodyEl.appendChild(actions);

  renderTintGenerator(bodyEl, yamlData);

  lucide.createIcons();
}

// A single group's heading (editable name + add/delete controls) followed by
// its member color rows. `group.name === null` is the unclassified bucket:
// no heading controls, just a small label (only meaningful once at least one
// named group exists, which is the only time this function gets called for it).
function buildColorGroupBlock(group, colors, yamlData) {
  const wrap = document.createElement('div');
  wrap.className = 'color-group-block';

  if (group.name === null) {
    const label = document.createElement('div');
    label.className = 'color-group-unclassified-label ts-caption';
    label.textContent = '未分類';
    wrap.appendChild(label);
  } else {
    wrap.appendChild(String(group.name).startsWith('mode-') ? buildModeGroupHeading(group, colors) : buildColorGroupHeading(group));
  }

  const listEl = document.createElement('div');
  listEl.className = 'token-dynamic-list color-group-list';
  group.keys.forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(colors, key)) return;
    listEl.appendChild(buildColorRow(key, colors[key], yamlData));
  });
  wrap.appendChild(listEl);

  return wrap;
}

function renderModeCreator(host) {
  let creator = host.querySelector('.mode-creator');
  if (creator) { creator.remove(); return; }
  creator = document.createElement('div');
  creator.className = 'mode-creator';
  creator.innerHTML = `<input class="token-key-input" placeholder="dark" spellcheck="false"><button class="btn btn-secondary btn-sm"><i data-lucide="plus"></i><span>modeを追加</span></button>`;
  creator.querySelector('button').onclick = () => {
    const name = creator.querySelector('input').value.trim().toLowerCase();
    if (!name || state.colorGroupsMeta.some(g => g.name === `mode-${name}`)) return;
    ensureColorGroupsMetaGroup(`mode-${name}`); buildDocument(); rerenderColorEditingSections();
  };
  host.appendChild(creator); lucide.createIcons();
}

function buildModeGroupHeading(group, colors) {
  const modeName = group.name.slice(5);
  const heading = document.createElement('div');
  heading.className = 'token-row color-group-heading mode-group-heading';
  const modeKeySet = new Set((state.colorGroupsMeta || []).filter(g => String(g.name || '').startsWith('mode-')).flatMap(g => g.keys || []));
  const baseKeys = Object.keys(colors).filter(k => !modeKeySet.has(k) && !Object.prototype.hasOwnProperty.call(colors, `${k}-${modeName}`));
  heading.innerHTML = `<div class="token-row-main"><i data-lucide="folder" class="color-group-icon"></i><span class="mode-name-prefix">mode：</span><input class="token-key-input mode-group-name" value="${escapeHtml(modeName)}" spellcheck="false"><button class="btn-icon-sm btn-add-mode-color" title="上書き色を追加"><i data-lucide="plus"></i></button><button class="btn-icon-sm btn-remove-token" title="モードを削除"><i data-lucide="trash-2"></i></button></div><div class="mode-color-adder"><select class="tint-gen-select">${baseKeys.map(k=>`<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('')}</select><button class="btn-icon-sm" title="追加"><i data-lucide="plus"></i></button></div>`;
  const nameInput = heading.querySelector('.mode-group-name');
  nameInput.addEventListener('focus', () => { activeEditingKey = `group:${group.name}`; });
  nameInput.addEventListener('input', () => { activeEditingKey = `group:${group.name}`; });
  const commitModeRename = () => {
    activeEditingKey = null;
    const nextName = nameInput.value.trim().toLowerCase();
    if (!nextName || nextName === modeName) { nameInput.value = modeName; return; }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(nextName)) {
      showToast('mode名は英小文字・数字・ハイフンで入力してください', 'error');
      nameInput.value = modeName;
      return;
    }
    renameColorMode(group, modeName, nextName);
  };
  nameInput.addEventListener('blur', commitModeRename);
  nameInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); nameInput.blur(); }
    if (event.key === 'Escape') { nameInput.value = modeName; activeEditingKey = null; nameInput.blur(); }
  });
  const adder = heading.querySelector('.mode-color-adder');
  heading.querySelector('.btn-add-mode-color').onclick = () => adder.classList.toggle('is-open');
  adder.querySelector('button').onclick = () => {
    const baseKey = adder.querySelector('select').value; if (!baseKey) return;
    const flatKey = `${baseKey}-${modeName}`;
    if (!Object.prototype.hasOwnProperty.call(state.parsedYaml.colors, flatKey)) state.parsedYaml.colors[flatKey] = state.parsedYaml.colors[baseKey];
    colorGroupsMetaAddKey(flatKey, group.name); buildDocument(); rerenderColorEditingSections();
  };
  heading.querySelector('.btn-remove-token').onclick = () => {
    group.keys.forEach(k => delete state.parsedYaml.colors[k]);
    state.colorGroupsMeta = state.colorGroupsMeta.filter(g => g !== group);
    if (state.activeDesignTheme === modeName) state.activeDesignTheme = null;
    buildDocument(); rerenderColorEditingSections(); renderPreviewThemeSelect();
  };
  return heading;
}

function renameColorMode(group, oldName, newName) {
  const nextGroupName = `mode-${newName}`;
  if (state.colorGroupsMeta.some(item => item !== group && item.name === nextGroupName)) {
    showToast(`mode「${newName}」は既に存在します`, 'error');
    rerenderColorEditingSections();
    return;
  }

  const colors = state.parsedYaml.colors || {};
  const oldSuffix = `-${oldName}`;
  const keyMap = new Map();
  (group.keys || []).forEach(key => {
    if (key.endsWith(oldSuffix)) keyMap.set(key, `${key.slice(0, -oldSuffix.length)}-${newName}`);
  });
  const collision = Array.from(keyMap.values()).find(nextKey =>
    Object.prototype.hasOwnProperty.call(colors, nextKey) && !keyMap.has(nextKey)
  );
  if (collision) {
    showToast(`色「${collision}」が既にあるためmode名を変更できません`, 'error');
    rerenderColorEditingSections();
    return;
  }

  const renamedColors = {};
  Object.keys(colors).forEach(key => { renamedColors[keyMap.get(key) || key] = colors[key]; });
  state.parsedYaml.colors = renamedColors;
  group.name = nextGroupName;
  group.keys = (group.keys || []).map(key => keyMap.get(key) || key);

  const styles = getTypographyStyles(state.parsedYaml.typography || {});
  Object.values(styles).forEach(style => {
    if (style && keyMap.has(style.color)) style.color = keyMap.get(style.color);
  });
  Object.values(state.parsedYaml.components || {}).forEach(component => {
    ['backgroundColor', 'textColor', 'borderColor'].forEach(field => {
      const match = String(component?.[field] || '').match(/^\{colors\.(.+)\}$/);
      if (match && keyMap.has(match[1])) component[field] = `{colors.${keyMap.get(match[1])}}`;
    });
  });

  if (state.activeDesignTheme === oldName) {
    state.activeDesignTheme = newName;
    savePreviewThemeToStorage();
  }
  applyTokensToCssVariables(state.parsedYaml);
  checkAccessibility(state.parsedYaml);
  generateExports(state.parsedYaml);
  buildDocument();
  rerenderColorEditingSections();
  renderPreviewThemeSelect();
  showToast(`mode「${oldName}」を「${newName}」に変更しました`);
}

function buildColorGroupHeading(group) {
  const originalName = group.name;
  const slug = slugifyKey(`group-${originalName}`);

  // Reuses the same .token-row / .token-row-main / .token-key-input pattern
  // as every other editable row in this panel (colors, shadows, styles...),
  // so the group name + its two icon-button actions sit on one line and look
  // like the rest of the left panel rather than a bespoke widget.
  const heading = document.createElement('div');
  heading.className = 'token-row color-group-heading';
  heading.innerHTML = `
    <div class="token-row-main">
      <i data-lucide="folder" class="color-group-icon"></i>
      <input type="text" class="token-key-input color-group-name-input" id="group-name-${slug}" value="${escapeHtml(originalName)}" spellcheck="false">
      <button type="button" class="btn-icon-sm btn-add-color-to-group" title="このグループに色を追加">
        <i data-lucide="plus"></i>
      </button>
      <button type="button" class="btn-icon-sm btn-remove-token btn-delete-group" title="このグループを削除（所属色は未分類へ）">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `;

  const nameInput = heading.querySelector(`#group-name-${slug}`);
  nameInput.addEventListener('focus', () => { activeEditingKey = `group:${originalName}`; });
  nameInput.addEventListener('input', () => { activeEditingKey = `group:${originalName}`; });
  const commitRename = () => {
    const newName = nameInput.value.trim();
    activeEditingKey = null;
    if (!newName || newName === originalName) { nameInput.value = originalName; return; }
    if (state.colorGroupsMeta.some(g => g.name === newName)) {
      showToast(`グループ名「${newName}」は既に存在します`, 'error');
      nameInput.value = originalName;
      return;
    }
    renameColorGroupMeta(originalName, newName);
    buildDocument();
    rerenderColorEditingSections();
    showToast(`グループ「${originalName}」を「${newName}」にリネームしました`);
  };
  nameInput.addEventListener('blur', commitRename);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); }
    if (e.key === 'Escape') { nameInput.value = originalName; activeEditingKey = null; nameInput.blur(); }
  });

  heading.querySelector('.btn-add-color-to-group').addEventListener('click', () => {
    const newKey = generateUniqueKey(state.parsedYaml.colors, 'color');
    state.parsedYaml.colors[newKey] = '#888888';
    colorGroupsMetaAddKey(newKey, originalName);
    applyTokensToCssVariables(state.parsedYaml);
    checkAccessibility(state.parsedYaml);
    generateExports(state.parsedYaml);
    buildDocument();
    rerenderColorEditingSections();
  });

  heading.querySelector('.btn-delete-group').addEventListener('click', () => {
    deleteColorGroupMeta(originalName);
    buildDocument();
    rerenderColorEditingSections();
    showToast(`グループ「${originalName}」を削除しました（所属色は未分類へ）`);
  });

  return heading;
}

function generateUniqueKey(obj, prefix) {
  let i = 1;
  let key = `${prefix}-${i}`;
  while (Object.prototype.hasOwnProperty.call(obj, key)) {
    i++;
    key = `${prefix}-${i}`;
  }
  return key;
}

function generateUniqueGroupName(prefix) {
  let i = 1;
  let name = `${prefix}-${i}`;
  while (state.colorGroupsMeta.some(g => g.name === name)) {
    i++;
    name = `${prefix}-${i}`;
  }
  return name;
}

function rerenderColorEditingSections() {
  const colorsBodyEl = document.querySelector('#sec-colors .accordion-body');
  if (colorsBodyEl) {
    renderColorsSection(colorsBodyEl, state.parsedYaml);
  }

  lucide.createIcons();
}

// Shared chip+key+hex+delete row markup, used both by the
// base Colors section (buildColorRow, key is editable/renameable) and the
// per-theme override rows in the Themes section (buildThemeColorOverrideRow,
// key is fixed to a base colors key so no rename UI is shown).
// `idPrefix` namespaces the element ids so both usages can coexist in the DOM.
function buildColorRowMarkupHtml(idPrefix, key, value, options) {
  const opts = options || {};
  const parsed = parseColorToRgba(value);
  const opaqueHex = rgbaToCss(parsed.r, parsed.g, parsed.b, 1);
  const slug = slugifyKey(key);
  const keyFieldHtml = opts.keyEditable === false
    ? `<span class="token-key-label" id="${idPrefix}-key-${slug}">${escapeHtml(key)}</span>`
    : `<input type="text" class="token-key-input" id="${idPrefix}-key-${slug}" value="${escapeHtml(key)}" spellcheck="false">`;
  return `
    <div class="token-row-main">
      <div class="color-input-wrapper color-input-wrapper-compact">
        <input type="color" id="${idPrefix}-picker-${slug}" class="color-picker-native" value="${opaqueHex}">
        ${keyFieldHtml}
        <input type="text" id="${idPrefix}-text-${slug}" class="color-text-input color-text-input-compact" value="${escapeHtml(colorValueForDisplay(value))}" placeholder="#aaaaaa" spellcheck="false">
      </div>
      <button class="btn-icon-sm btn-remove-token" title="${escapeHtml(opts.removeTitle || 'この色を削除')}">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `;
}

function buildColorRow(key, value, yamlData) {
  const colors = yamlData.colors || {};
  const slug = slugifyKey(key);

  const row = document.createElement('div');
  row.className = 'token-row color-token-row';
  row.setAttribute('data-color-key', key);

  row.innerHTML = buildColorRowMarkupHtml('color', key, value);

  const keyInput = row.querySelector(`#color-key-${slug}`);
  const colorPicker = row.querySelector(`#color-picker-${slug}`);
  const colorText = row.querySelector(`#color-text-${slug}`);
  const removeBtn = row.querySelector('.btn-remove-token');

  // Group the row's action buttons (group picker + delete) into one cluster
  // so the flat list styling can hover-reveal them as a unit without
  // reflowing the row (frees that width for the color name).
  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'color-row-actions';
  removeBtn.parentNode.insertBefore(actionsWrap, removeBtn);
  actionsWrap.appendChild(removeBtn);

  // Key rename: only commit on blur/Enter (never on every keystroke)
  keyInput.addEventListener('focus', () => { activeEditingKey = key; });
  keyInput.addEventListener('input', () => { activeEditingKey = key; });
  const commitRename = () => {
    const newKey = keyInput.value.trim();
    activeEditingKey = null;
    if (!newKey || newKey === key) {
      keyInput.value = key;
      return;
    }
    if (Object.prototype.hasOwnProperty.call(state.parsedYaml.colors, newKey)) {
      showToast(`色キー「${newKey}」は既に存在します`, 'error');
      keyInput.value = key;
      return;
    }
    renameColorKey(key, newKey);
  };
  keyInput.addEventListener('blur', commitRename);
  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); keyInput.blur(); }
    if (e.key === 'Escape') { keyInput.value = key; activeEditingKey = null; keyInput.blur(); }
  });

  colorPicker.addEventListener('input', (e) => {
    const hex = e.target.value;
    colorText.value = hex;
    updateColorValue(key, hex);
    refreshTintGenerator();
  });

  colorText.addEventListener('input', (e) => {
    const val = colorValueFromDisplay(e.target.value);
    if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(val) || /^rgba?\(/.test(val)) {
      const rgba = parseColorToRgba(val);
      colorPicker.value = rgbaToCss(rgba.r, rgba.g, rgba.b, 1);
      updateColorValue(key, val);
      refreshTintGenerator();
    }
  });

  const removeColor = () => {
    delete state.parsedYaml.colors[key];
    colorGroupsMetaRemoveKey(key);
    Object.keys(state.parsedYaml.colors || {}).forEach(colorKey => {
      if (colorKey.startsWith(`${key}-`) && /-\d+$/.test(colorKey)) {
        delete state.parsedYaml.colors[colorKey];
        colorGroupsMetaRemoveKey(colorKey);
      }
    });
    applyTokensToCssVariables(state.parsedYaml);
    checkAccessibility(state.parsedYaml);
    generateExports(state.parsedYaml);
    buildDocument();
    rerenderColorEditingSections();
    showToast(`色トークン「${key}」を削除しました`);
  };

  const namedGroups = (state.colorGroupsMeta || []).filter(g => g.name !== null);
  const currentGroup = (state.colorGroupsMeta || []).find(g => g.keys.includes(key));
  const picker = document.createElement('div');
  picker.className = 'color-group-inline-picker';
  const groupChoices = [{ name: null, label: '未分類' }, ...namedGroups.map(g => ({ name: g.name, label: g.name }))];
  picker.innerHTML = `
    <button type="button" class="btn-icon-sm btn-color-group-toggle" title="移動・削除（現在: ${escapeHtml(currentGroup ? currentGroup.name : '未分類')}）" aria-expanded="false">
      <i data-lucide="move"></i>
    </button>
    <div class="color-row-menu" role="menu">
      ${groupChoices.map(choice => {
        const selected = (currentGroup ? currentGroup.name : null) === choice.name;
        return `<button type="button" data-group="${escapeHtml(choice.name || '')}" class="${selected ? 'is-current' : ''}" role="menuitem"><i data-lucide="${selected ? 'check' : 'folder'}"></i><span>${escapeHtml(choice.label)}</span></button>`;
      }).join('')}
      <button type="button" class="color-row-menu-delete" role="menuitem"><i data-lucide="trash-2"></i><span>削除</span></button>
    </div>
  `;
  const toggleBtn = picker.querySelector('.btn-color-group-toggle');
  toggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    openColorGroupMenu(picker, row, toggleBtn);
  });
  picker.querySelectorAll('[data-group]').forEach(button => button.addEventListener('click', () => {
    colorGroupsMetaMoveKey(key, button.dataset.group || null);
    buildDocument();
    rerenderColorEditingSections();
  }));
  picker.querySelector('.color-row-menu-delete').addEventListener('click', removeColor);
  actionsWrap.appendChild(picker);
  removeBtn.remove();

  return row;
}

// Only one per-row organization menu is open at a time.
let openColorGroupPickerEl = null;
function closeOpenColorGroupMenu() {
  if (!openColorGroupPickerEl) return;
  openColorGroupPickerEl.classList.remove('is-open');
  openColorGroupPickerEl.closest('.color-token-row')?.classList.remove('has-open-menu');
  openColorGroupPickerEl.querySelector('.btn-color-group-toggle')?.setAttribute('aria-expanded', 'false');
  openColorGroupPickerEl = null;
}

function openColorGroupMenu(picker, row, toggleBtn) {
  if (openColorGroupPickerEl && openColorGroupPickerEl !== picker) {
    closeOpenColorGroupMenu();
  }
  const willOpen = !picker.classList.contains('is-open');
  picker.classList.toggle('is-open', willOpen);
  row.classList.toggle('has-open-menu', willOpen);
  toggleBtn.setAttribute('aria-expanded', String(willOpen));
  openColorGroupPickerEl = willOpen ? picker : null;
  if (willOpen) {
    picker.querySelector('.color-row-menu button')?.focus();
  }
}

document.addEventListener('click', event => {
  if (openColorGroupPickerEl && !openColorGroupPickerEl.contains(event.target)) closeOpenColorGroupMenu();
});

function renameColorKey(oldKey, newKey) {
  const colors = state.parsedYaml.colors;
  const newColors = {};
  Object.keys(colors).forEach(k => {
    if (k === oldKey) {
      newColors[newKey] = colors[k];
    } else {
      newColors[k] = colors[k];
    }
  });
  state.parsedYaml.colors = newColors;

  // Update any style/border references pointing at the old key name
  const styles = getTypographyStyles(state.parsedYaml.typography || {});
  Object.keys(styles).forEach(sk => {
    if (styles[sk].color === oldKey) styles[sk].color = newKey;
  });
  colorGroupsMetaRenameKey(oldKey, newKey);
  Object.keys(state.parsedYaml.colors || {}).forEach(colorKey => {
    if (colorKey.startsWith(`${oldKey}-`) && /-\d+$/.test(colorKey)) {
      const suffix = colorKey.slice(oldKey.length);
      state.parsedYaml.colors[`${newKey}${suffix}`] = state.parsedYaml.colors[colorKey];
      delete state.parsedYaml.colors[colorKey];
      colorGroupsMetaRenameKey(colorKey, `${newKey}${suffix}`);
    }
  });

  applyTokensToCssVariables(state.parsedYaml);
  checkAccessibility(state.parsedYaml);
  generateExports(state.parsedYaml);
  buildDocument();
  rerenderColorEditingSections();
  showToast(`色トークン「${oldKey}」を「${newKey}」にリネームしました`);
}

function updateColorValue(key, value) {
  if (!state.parsedYaml.colors) state.parsedYaml.colors = {};
  state.parsedYaml.colors[key] = value;

  applyTokensToCssVariables(state.parsedYaml);
  checkAccessibility(state.parsedYaml);
  generateExports(state.parsedYaml);

  if (key === 'primary' || key === 'canvas' || key === 'background') {
  }

  buildDocument();
}

// ---- 9a-1b. Tint generator (item 3): a single consolidated control at the
// end of the Colors section. It works against the currently selected color
// scheme only (default or the active theme's merged colors), previews the
// composited color on that scheme's background, and stores the result into
// the same scheme.
let tintGenState = { source: null, pct: 10, mode: 'hex' };
let tintGeneratorOpen = false;

function getDefaultTintMode(source) {
  return 'hex';
}

function normalizeTintMode(mode, fallbackSource) {
  return mode === 'hex' || mode === 'alpha' ? mode : getDefaultTintMode(fallbackSource);
}

function buildTintValue(baseColor, pct, bg, mode) {
  const base = parseColorToRgba(baseColor);
  const tintCss = rgbaToCss(base.r, base.g, base.b, pct / 100);
  return normalizeTintMode(mode) === 'alpha' ? tintCss : compositeOverBackground(tintCss, bg);
}

function collectTintSourceOptions(yamlData) {
  const options = [];
  const colors = getMergedThemeColors(yamlData, null);
  Object.keys(colors).forEach(key => {
    options.push({ value: colors[key], label: key, source: { kind: 'color', key } });
  });
  return options;
}

// Generates the colors key used when baking a tint:
// colors key -> <key>-<pct>
// Never overwrites an existing key: appends -2, -3, ... until free.
function generateTintKeyName(source, pct, existingColors) {
  let base;
  base = `${source.key}-${pct}`;
  if (!Object.prototype.hasOwnProperty.call(existingColors, base)) return base;
  let n = 2;
  while (Object.prototype.hasOwnProperty.call(existingColors, `${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function renderTintModeSelect(mode, className) {
  const current = normalizeTintMode(mode);
  return `
    <select class="${className || 'tint-mode-select'}" aria-label="tint保存形式">
      <option value="hex" ${current === 'hex' ? 'selected' : ''}>#hex</option>
      <option value="alpha" ${current === 'alpha' ? 'selected' : ''}>rgba</option>
    </select>
  `;
}

function renderTintGenerator(bodyEl, yamlData) {
  const options = collectTintSourceOptions(yamlData);

  const wrap = document.createElement('div');
  wrap.className = 'tint-generator';
  wrap.id = 'tint-generator';

  if (options.length === 0) {
    wrap.innerHTML = `<p class="section-desc">ティントを生成できる色がありません。まず色を追加してください。</p>`;
    bodyEl.appendChild(wrap);
    return;
  }

  // Preserve previous selection if it's still valid, else default to the first option.
  let selectedIdx = 0;
  if (tintGenState.source) {
    const idx = options.findIndex(o => JSON.stringify(o.source) === JSON.stringify(tintGenState.source));
    if (idx >= 0) selectedIdx = idx;
  }
  tintGenState.source = options[selectedIdx].source;
  tintGenState.mode = normalizeTintMode(tintGenState.mode, tintGenState.source);

  wrap.innerHTML = `
    <div class="tint-generator-header">
      <h4 class="scale-helper-title"><i data-lucide="droplet"></i><span>ティント生成</span></h4>
      <button type="button" class="btn-icon-sm btn-toggle-tint-generator" title="${tintGeneratorOpen ? '設定を隠す' : '設定を表示'}" aria-expanded="${tintGeneratorOpen}"><i data-lucide="pencil"></i></button>
    </div>
    <div class="tint-generator-fields${tintGeneratorOpen ? ' is-open' : ''}">
    <div class="tint-generator-row">
      <select id="tint-gen-select" class="tint-gen-select">
        ${options.map((o, idx) => `<option value="${idx}" ${idx === selectedIdx ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
      </select>
      <div class="tint-pct-input-wrap">
        <input id="tint-gen-pct" class="tint-pct-input" type="number" inputmode="numeric" min="1" max="99" step="1" value="${tintGenState.pct}" title="tint %">
        <span class="tint-pct-suffix">%</span>
      </div>
      ${renderTintModeSelect(tintGenState.mode)}
    </div>
    <div class="tint-generator-preview-row">
      <div class="color-input-wrapper color-input-wrapper-compact">
        <div class="tint-live-chip" id="tint-gen-chip" title=""></div>
        <span class="token-key-label" id="tint-gen-name"></span>
        <input type="text" id="tint-gen-value" class="color-text-input color-text-input-compact" value="" readonly>
      </div>
      <button class="btn-icon-sm btn-tint-add" id="tint-gen-add" title="追加">
        <i data-lucide="plus"></i>
      </button>
    </div>
    </div>
  `;

  bodyEl.appendChild(wrap);

  const selectEl = wrap.querySelector('#tint-gen-select');
  const pctInput = wrap.querySelector('#tint-gen-pct');
  const chip = wrap.querySelector('#tint-gen-chip');
  const nameLabel = wrap.querySelector('#tint-gen-name');
  const valueLabel = wrap.querySelector('#tint-gen-value');
  const addBtn = wrap.querySelector('#tint-gen-add');
  const modeSelect = wrap.querySelector('.tint-mode-select');
  wrap.querySelector('.btn-toggle-tint-generator').addEventListener('click', e => {
    tintGeneratorOpen=!tintGeneratorOpen;
    wrap.querySelector('.tint-generator-fields').classList.toggle('is-open',tintGeneratorOpen);
    e.currentTarget.setAttribute('aria-expanded',String(tintGeneratorOpen));
    e.currentTarget.setAttribute('title',tintGeneratorOpen?'設定を隠す':'設定を表示');
  });

  const updatePreview = () => {
    const idx = parseInt(selectEl.value, 10);
    const opt = options[idx];
    tintGenState.source = opt.source;
    tintGenState.mode = normalizeTintMode(tintGenState.mode, opt.source);
    const bg = baseColor(getMergedThemeColors(state.parsedYaml, null), 'canvas', '#ffffff');
    const pct = tintGenState.pct;
    const tintValue = buildTintValue(opt.value, pct, bg, tintGenState.mode);
    const onBg = compositeOverBackground(tintValue, bg);
    chip.style.backgroundColor = onBg;
    chip.title = tintGenState.mode === 'alpha' ? `${tintValue} / 背景合成後 ${onBg}` : `背景合成後: ${onBg}`;
    valueLabel.value = colorValueForDisplay(tintValue);
    const existingColors = state.parsedYaml.colors || {};
    const keyPreview = generateTintKeyName(opt.source, pct, existingColors);
    nameLabel.textContent = keyPreview;
    if (modeSelect) modeSelect.value = tintGenState.mode;
    addBtn.title = `${keyPreview} としてカラーに追加`;
  };

  selectEl.addEventListener('change', () => {
    const idx = parseInt(selectEl.value, 10);
    tintGenState.source = options[idx].source;
    tintGenState.mode = getDefaultTintMode(tintGenState.source);
    updatePreview();
  });

  pctInput.addEventListener('input', () => {
    let p = parseInt(pctInput.value, 10);
    if (isNaN(p)) return;
    p = Math.max(1, Math.min(99, p));
    pctInput.value = String(p);
    tintGenState.pct = p;
    updatePreview();
  });

  if (modeSelect) {
    modeSelect.addEventListener('change', () => {
      tintGenState.mode = modeSelect.value;
      updatePreview();
    });
  }

  addBtn.addEventListener('click', () => {
    const idx = parseInt(selectEl.value, 10);
    const opt = options[idx];
    const pct = tintGenState.pct;
    const bg = baseColor(getMergedThemeColors(state.parsedYaml, activeTheme), 'canvas', '#ffffff');
    const tintValue = buildTintValue(opt.value, pct, bg, tintGenState.mode);
    const existingColors = activeTheme
      ? getMergedThemeColors(state.parsedYaml, activeTheme)
      : (state.parsedYaml.colors || {});
    const tokenName = generateTintKeyName(opt.source, pct, existingColors);
    if (!state.parsedYaml.colors) state.parsedYaml.colors = {};
    state.parsedYaml.colors[tokenName] = tintValue;
    // Grouping: the generated tint belongs with its source color — insert it
    // into the same group, immediately after the source key.
    colorGroupsMetaInsertKeyAfter(tokenName, opt.source.key);
    applyTokensToCssVariables(state.parsedYaml);
    checkAccessibility(state.parsedYaml);
    generateExports(state.parsedYaml);
    buildDocument();
    rerenderColorEditingSections();
    showToast(`「${tokenName}」(${tintValue}) をトークン化しました`);
  });

  updatePreview();
  lucide.createIcons();
}

// Re-renders the tint generator block in place (e.g. after a color value
// changes elsewhere) without rebuilding the rest of the Colors section.
function refreshTintGenerator() {
  const existing = document.getElementById('tint-generator');
  if (!existing) return;
  const parent = existing.parentNode;
  existing.remove();
  renderTintGenerator(parent, state.parsedYaml);
}

 // Parses a pasted Google Fonts embed snippet (either a full <link ...> tag or
// a bare fonts.googleapis.com/css2 URL) and extracts { family, weights }.
// Returns null if the input doesn't look like a Google Fonts reference (e.g.
// a plain font name), in which case callers should treat it as a literal
// family name instead.
function parseGoogleFontsEmbed(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  if (!str) return null;

  // Extract the URL, whether wrapped in a <link> tag or given bare.
  let url = null;
  const hrefMatch = str.match(/href=["']([^"']+)["']/i);
  if (hrefMatch) {
    url = hrefMatch[1];
  } else if (/^https?:\/\/fonts\.googleapis\.com\//i.test(str)) {
    url = str;
  }
  if (!url || !/fonts\.googleapis\.com/i.test(url)) return null;

  // family=Zen+Kaku+Gothic+New:wght@400;700  (css2 API)
  // Multiple families can appear as repeated family= params.
  const familyParams = [];
  const familyRegex = /family=([^&]+)/gi;
  let m;
  while ((m = familyRegex.exec(url)) !== null) {
    familyParams.push(m[1]);
  }
  if (familyParams.length === 0) return null;

  // Use the first family declaration.
  const raw = decodeURIComponent(familyParams[0]);
  const [namePart, axisPart] = raw.split(':');
  const family = namePart.replace(/\+/g, ' ').trim();
  if (!family) return null;

  let weights = [];
  if (axisPart) {
    // e.g. "wght@400;700" or "ital,wght@0,400;0,700;1,700"
    const wghtMatch = axisPart.match(/wght@([\d;,@]+)/i);
    if (wghtMatch) {
      const nums = wghtMatch[1].split(';').map(seg => {
        const parts = seg.split(',');
        const last = parts[parts.length - 1];
        return parseInt(last, 10);
      }).filter(n => !isNaN(n));
      weights = Array.from(new Set(nums)).sort((a, b) => a - b);
    }
  }
  if (weights.length === 0) weights = [400];

  return { family, weights };
}
// ---- 9c. Text styles section ----
function renderStylesSection(bodyEl, yamlData) {
  bodyEl.innerHTML = '';
  const typography = yamlData.typography || {};
  const styles = getTypographyStyles(typography);
  const scale = state.scaleHelper || deriveScaleHelperState(yamlData);

  // 1) Style definitions first (unclassified + named groups, flat list).
  // Mirrors the colors section: with no named groups at all, render a plain
  // flat list without the 未分類 heading.
  state.typographyGroupsMeta = reconcileTypographyGroupsMeta(state.typographyGroupsMeta, styles);
  const hasNamedStyleGroups = state.typographyGroupsMeta.some(g => g.name !== null);
  state.typographyGroupsMeta.forEach(group => {
    if (group.name === null && !group.keys.length) return;
    const block = document.createElement('div');
    block.className = 'color-group-block typography-group-block';
    if (hasNamedStyleGroups) block.appendChild(buildTypographyGroupHeading(group));
    const listEl = document.createElement('div');
    listEl.className = 'token-dynamic-list typography-group-list';
    group.keys.forEach(key => {
      if (styles[key]) listEl.appendChild(buildStyleRow(key, styles[key], yamlData.colors || {}));
    });
    block.appendChild(listEl);
    bodyEl.appendChild(block);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-secondary btn-sm btn-add-token';
  addBtn.innerHTML = '<i data-lucide="folder-plus"></i><span>グループを追加</span>';
  addBtn.addEventListener('click', addTypographyGroup);
  bodyEl.appendChild(addBtn);

  // 2) Type scale helper (below the style definitions).
  const scaleBox = document.createElement('div');
  scaleBox.className = 'typography-tool-block type-scale-helper';
  scaleBox.innerHTML = `
    <button type="button" class="scale-helper-title type-scale-toggle" aria-expanded="false"><i data-lucide="ruler"></i><span>タイプスケール補助</span><i data-lucide="chevron-down" class="type-scale-chevron"></i></button>
    <div class="type-scale-details">
    <div class="form-group-row">
      <div class="form-group type-scale-field">
        <label>base (px)</label>
        <input type="number" id="scale-base-input" value="${scale.base}" min="10" max="32">
      </div>
      <div class="form-group type-scale-field">
        <label>ratio</label>
        <select id="scale-ratio-select">
          ${[1.2, 1.25, 1.333, 1.414, 1.5, 1.618].map(r => `<option value="${r}" ${Math.abs(scale.ratio - r) < 0.001 ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="type-scale-sequence" id="type-scale-sequence"></div>
    </div>
  `;
  bodyEl.appendChild(scaleBox);
  scaleBox.querySelector('.type-scale-toggle').addEventListener('click', () => {
    const open = scaleBox.classList.toggle('is-open');
    scaleBox.querySelector('.type-scale-toggle').setAttribute('aria-expanded', String(open));
  });
  const updateScaleSequence = () => {
    const base = parseFloat(scaleBox.querySelector('#scale-base-input').value) || 16;
    const ratio = parseFloat(scaleBox.querySelector('#scale-ratio-select').value) || 1.25;
    scaleBox.querySelector('#type-scale-sequence').textContent = Array.from({ length: 6 }, (_, i) => Math.round(base * Math.pow(ratio, i))).join(' – ');
  };
  scaleBox.querySelector('#scale-base-input').addEventListener('input', updateScaleSequence);
  scaleBox.querySelector('#scale-ratio-select').addEventListener('change', updateScaleSequence);
  updateScaleSequence();

  // 3) Markdown slot assignment (bottom of the section).
  renderMarkdownSlotAssignmentBox(bodyEl, yamlData);

  lucide.createIcons();
}

function buildTypographyGroupHeading(group) {
  const heading = document.createElement('div');
  heading.className = 'token-row color-group-heading typography-group-heading';
  const label = group.name === null ? '未分類' : group.name;
  heading.innerHTML = `<div class="token-row-main">
    <i data-lucide="folder" class="typography-group-icon"></i>
    ${group.name === null
      ? '<span class="token-key-label">未分類</span>'
      : `<input class="token-key-input typography-group-name" value="${escapeHtml(label)}" spellcheck="false">`}
    <button type="button" class="btn-icon-sm btn-add-style-to-group" title="このグループに追加"><i data-lucide="plus"></i></button>
    ${group.name === null ? '' : '<button type="button" class="btn-icon-sm btn-remove-token btn-delete-style-group" title="グループを削除"><i data-lucide="trash-2"></i></button>'}
  </div>`;
  heading.querySelector('.btn-add-style-to-group').addEventListener('click', () => {
    const styles = getTypographyStyles(state.parsedYaml.typography);
    const key = generateTypographyStyleKey(styles, group.name);
    const firstKey = (group.keys || []).find(k => Object.prototype.hasOwnProperty.call(styles, k));
    const sourceStyle = firstKey ? styles[firstKey] : { font: 'Outfit', source: 'google', size: 16, weight: 400 };
    state.parsedYaml.typography[key] = JSON.parse(JSON.stringify(sourceStyle));
    typographyGroupAddKey(key, group.name);
    applyTokensToCssVariables(state.parsedYaml);
    generateExports(state.parsedYaml);
    buildDocument();
    renderStylesSection(document.querySelector('#sec-styles .accordion-body'), state.parsedYaml);
  });
  if (group.name !== null) {
    const input = heading.querySelector('.typography-group-name');
    input.addEventListener('change', () => {
      const next = input.value.trim();
      if (!next || state.typographyGroupsMeta.some(g => g !== group && g.name === next)) { input.value = group.name; return; }
      group.name = next; buildDocument();
    });
    heading.querySelector('.btn-delete-style-group').addEventListener('click', () => {
      const unclassified = state.typographyGroupsMeta.find(g => g.name === null);
      unclassified.keys.push(...group.keys);
      state.typographyGroupsMeta = state.typographyGroupsMeta.filter(g => g !== group);
      buildDocument();
      renderStylesSection(document.querySelector('#sec-styles .accordion-body'), state.parsedYaml);
    });
  }
  return heading;
}

function generateTypographyStyleKey(styles, groupName) {
  const prefix = groupName || 'style';
  const candidates = ['md', 'sm', 'xs', 'lg', 'xl'].map(suffix => `${prefix}-${suffix}`);
  const available = candidates.find(key => !Object.prototype.hasOwnProperty.call(styles, key));
  return available || generateUniqueKey(styles, prefix);
}

function addTypographyGroup() {
  let i = 1;
  let name = `group-${i}`;
  while (state.typographyGroupsMeta.some(g => g.name === name)) name = `group-${++i}`;
  state.typographyGroupsMeta.push({ name, keys: [] });
  buildDocument();
  renderStylesSection(document.querySelector('#sec-styles .accordion-body'), state.parsedYaml);
}

// ---- 9c-1. typography.markdown assignment (v3, SPEC §5.3) ----
// One <select> per markdown slot (h1-h4/body/small/caption/strong), each
// listing every direct typography token key. Writes directly to
// typography.markdown.<slot>; falls back silently if styles is empty.
function renderMarkdownSlotAssignmentBox(bodyEl, yamlData) {
  const typography = yamlData.typography || {};
  const styles = getTypographyStyles(typography);
  const styleKeys = Object.keys(styles);
  if (!styleKeys.length) return;
  const slotAssignments = getMarkdownSlotAssignments(yamlData);

  const box = document.createElement('div');
  box.className = 'typography-tool-block markdown-slot-box';
  box.innerHTML = `
    <button type="button" class="scale-helper-title markdown-slot-toggle" aria-expanded="false"><i data-lucide="link"></i><span>マークダウン (markdown)</span><i data-lucide="chevron-down" class="type-scale-chevron markdown-slot-chevron"></i></button>
    <div class="markdown-slot-list">
      ${MARKDOWN_SLOTS.map(slot => `
        <div class="markdown-slot-row">
          <span class="markdown-slot-label">${slot}</span>
          <select data-slot="${slot}">
            ${styleKeys.map(k => `<option value="${escapeHtml(k)}" ${slotAssignments[slot] === k ? 'selected' : ''}>${escapeHtml(k)}</option>`).join('')}
          </select>
        </div>
      `).join('')}
    </div>
  `;
  bodyEl.appendChild(box);

  box.querySelector('.markdown-slot-toggle').addEventListener('click', () => {
    const open = box.classList.toggle('is-open');
    box.querySelector('.markdown-slot-toggle').setAttribute('aria-expanded', String(open));
  });

  box.querySelectorAll('select[data-slot]').forEach(select => {
    select.addEventListener('change', () => {
      const slot = select.getAttribute('data-slot');
      if (!state.parsedYaml.typography.markdown) state.parsedYaml.typography.markdown = {};
      state.parsedYaml.typography.markdown[slot] = select.value;
      applyTokensToCssVariables(state.parsedYaml);
      generateExports(state.parsedYaml);
      buildDocument();
      renderPreviewCanvasDynamicBits(state.parsedYaml);
      showToast(`${slot} に「${select.value}」を割り当てました`);
    });
  });
}

function buildStyleRow(key, styleDef, colors) {
  const slug = slugifyKey(key);

  const wrap = document.createElement('div');
  wrap.className = `token-row typography-style-row${openTypographyStyleKeys.has(key) ? ' is-open' : ''}`;
  wrap.setAttribute('data-style-key', key);

  // color: select-only (SPEC: colorsキー参照 or 直値). Every colors key +
  // 「未設定」; a direct value not present in colors (hand-authored in the
  // code panel) is surfaced as an extra option so the current value always
  // shows as selected.
  const hasDirectColorValue = styleDef.color && !Object.prototype.hasOwnProperty.call(colors, styleDef.color);
  const colorOptions = [
    `<option value="" ${styleDef.color === undefined ? 'selected' : ''}>未設定</option>`,
    hasDirectColorValue ? `<option value="${escapeHtml(styleDef.color)}" selected>${escapeHtml(styleDef.color)} (直値)</option>` : '',
    Object.keys(colors).map(ck => `<option value="${escapeHtml(ck)}" ${styleDef.color === ck ? 'selected' : ''}>${escapeHtml(ck)}</option>`).join('')
  ].join('');

  wrap.innerHTML = `
    <div class="token-row-main typography-style-header">
      <input type="text" class="token-key-input" id="style-key-${slug}" value="${escapeHtml(key)}" spellcheck="false">
      <button type="button" class="btn-icon-sm btn-toggle-style-fields" title="${openTypographyStyleKeys.has(key) ? '設定を隠す' : '設定を表示'}" aria-expanded="${openTypographyStyleKeys.has(key) ? 'true' : 'false'}"><i data-lucide="pencil"></i></button>
      <button class="btn-icon-sm btn-remove-token" title="このスタイルを削除"><i data-lucide="trash-2"></i></button>
    </div>
    <div class="typography-style-fields">
      <div class="form-group-row">
        <div class="form-group">
          <label>font</label>
          <input type="text" id="style-font-${slug}" value="${escapeHtml(styleDef.font || '')}" placeholder="Outfit">
        </div>
        <div class="form-group">
          <label>source</label>
          <select id="style-source-${slug}">
            <option value="" ${!styleDef.source ? 'selected' : ''}>未設定 (system)</option>
            <option value="google" ${styleDef.source === 'google' ? 'selected' : ''}>google</option>
            <option value="system" ${styleDef.source === 'system' ? 'selected' : ''}>system</option>
            <option value="other" ${styleDef.source === 'other' ? 'selected' : ''}>その他</option>
          </select>
        </div>
      </div>
      <div class="form-group web-font-embed-field${styleDef.source === 'other' ? ' is-visible' : ''}">
        <label>embed</label>
        <textarea id="style-embed-${slug}" rows="3" placeholder='&lt;link rel="stylesheet" href="https://..."&gt;'>${escapeHtml(getPreviewWebFontEmbed(styleDef.font) || styleDef.embed || '')}</textarea>
      </div>
      <div class="form-group-row">
        <div class="form-group">
          <label>weight</label>
          <input type="number" id="style-weight-${slug}" value="${styleDef.weight !== undefined ? styleDef.weight : ''}" step="100" min="100" max="900">
        </div>
        <div class="form-group">
          <label>size (px)</label>
          <input type="number" id="style-size-${slug}" value="${styleDef.size !== undefined ? styleDef.size : ''}" min="8" max="120">
        </div>
      </div>
      <div class="form-group-row">
        <div class="form-group">
          <label>letter-spacing</label>
          <input type="text" id="style-ls-${slug}" value="${escapeHtml(styleDef.letterSpacing || '')}" placeholder="未設定 (例: -0.02em)">
        </div>
        <div class="form-group">
          <label>line-height</label>
          <input type="number" id="style-lh-${slug}" value="${styleDef.lineHeight !== undefined ? styleDef.lineHeight : ''}" step="0.05" min="0.8" max="3" placeholder="未設定">
        </div>
      </div>
      <div class="form-group">
        <label>color</label>
        <select id="style-color-${slug}">${colorOptions}</select>
      </div>
      <button type="button" class="btn-typography-more" aria-expanded="${styleDef.fontStyle || styleDef.textTransform || styleDef.fontFeature || styleDef.textDecoration || styleDef.fontVariationSettings ? 'true' : 'false'}">${styleDef.fontStyle || styleDef.textTransform || styleDef.fontFeature || styleDef.textDecoration || styleDef.fontVariationSettings ? '閉じる' : 'さらに表示'}</button>
      <div class="typography-advanced-fields${styleDef.fontStyle || styleDef.textTransform || styleDef.fontFeature || styleDef.textDecoration || styleDef.fontVariationSettings ? ' is-open' : ''}">
        <div class="form-group-row">
          <div class="form-group"><label>fontStyle</label><input type="text" id="style-font-style-${slug}" value="${escapeHtml(styleDef.fontStyle || '')}" placeholder="italic"></div>
          <div class="form-group"><label>textTransform</label><input type="text" id="style-text-transform-${slug}" value="${escapeHtml(styleDef.textTransform || '')}" placeholder="uppercase"></div>
        </div>
        <div class="form-group"><label>fontFeature</label><input type="text" id="style-font-feature-${slug}" value="${escapeHtml(styleDef.fontFeature || '')}" placeholder='"liga" 1, "kern" 1'></div>
        <div class="form-group"><label>textDecoration</label><input type="text" id="style-text-decoration-${slug}" value="${escapeHtml(styleDef.textDecoration || '')}" placeholder="underline"></div>
        <div class="form-group"><label>fontVariationSettings</label><input type="text" id="style-font-variation-${slug}" value="${escapeHtml(styleDef.fontVariationSettings || '')}" placeholder='"wght" 550'></div>
      </div>
    </div>
  `;

  const fontInput = wrap.querySelector(`#style-font-${slug}`);
  const sourceSelect = wrap.querySelector(`#style-source-${slug}`);
  const embedInput = wrap.querySelector(`#style-embed-${slug}`);
  const sizeInput = wrap.querySelector(`#style-size-${slug}`);
  const weightInput = wrap.querySelector(`#style-weight-${slug}`);
  const lhInput = wrap.querySelector(`#style-lh-${slug}`);
  const lsInput = wrap.querySelector(`#style-ls-${slug}`);
  const colorSelect = wrap.querySelector(`#style-color-${slug}`);
  const fontStyleInput = wrap.querySelector(`#style-font-style-${slug}`);
  const textTransformInput = wrap.querySelector(`#style-text-transform-${slug}`);
  const fontFeatureInput = wrap.querySelector(`#style-font-feature-${slug}`);
  const textDecorationInput = wrap.querySelector(`#style-text-decoration-${slug}`);
  const fontVariationInput = wrap.querySelector(`#style-font-variation-${slug}`);
  const toggleBtn = wrap.querySelector('.btn-toggle-style-fields');
  const originalFontFamily = String(styleDef.font || '').trim();

  wrap.querySelector('.btn-typography-more').addEventListener('click', e => {
    const advanced=wrap.querySelector('.typography-advanced-fields');const open=!advanced.classList.contains('is-open');advanced.classList.toggle('is-open',open);e.currentTarget.setAttribute('aria-expanded',String(open));e.currentTarget.textContent=open?'閉じる':'さらに表示';
  });

  toggleBtn.addEventListener('click', () => {
    const willOpen = !wrap.classList.contains('is-open');
    wrap.classList.toggle('is-open', willOpen);
    toggleBtn.setAttribute('aria-expanded', String(willOpen));
    toggleBtn.setAttribute('title', willOpen ? '設定を隠す' : '設定を表示');
    if (willOpen) openTypographyStyleKeys.add(key); else openTypographyStyleKeys.delete(key);
  });

  const commit = () => {
    const st = getTypographyStyles(state.parsedYaml.typography)[key];
    if (!st) return;
    const previousSize = st.size;
    // font/size/weight are the required fields (SPEC §5.2); the optional ones
    // (source/lineHeight/letterSpacing/color) are DELETED when emptied so they
    // never serialize as empty leftovers.
    if (fontInput.value.trim()) st.font = fontInput.value.trim(); else delete st.font;
    if (sourceSelect.value) st.source = sourceSelect.value; else delete st.source;
    const nextFontFamily = fontInput.value.trim();
    if (originalFontFamily && originalFontFamily !== nextFontFamily && getPreviewWebFontEmbed(originalFontFamily)) {
      updatePreviewWebFontEmbed(originalFontFamily, '');
    }
    if (sourceSelect.value === 'other') {
      updatePreviewWebFontEmbed(nextFontFamily, embedInput.value.trim());
    } else if (getPreviewWebFontEmbed(nextFontFamily)) {
      updatePreviewWebFontEmbed(nextFontFamily, '');
    }
    delete st.embed;
    if (sizeInput.value !== '') st.size = parseFloat(sizeInput.value); else delete st.size;
    if (weightInput.value !== '') st.weight = parseInt(weightInput.value, 10); else delete st.weight;
    if (lhInput.value !== '') st.lineHeight = parseFloat(lhInput.value); else delete st.lineHeight;
    if (lsInput.value.trim() !== '') { st.letterSpacing = lsInput.value.trim(); } else { delete st.letterSpacing; }
    if (colorSelect.value) st.color = colorSelect.value; else delete st.color;
    [[fontStyleInput,'fontStyle'],[textTransformInput,'textTransform'],[fontFeatureInput,'fontFeature'],[textDecorationInput,'textDecoration'],[fontVariationInput,'fontVariationSettings']].forEach(([input,prop])=>{const value=input.value.trim();if(value)st[prop]=value;else delete st[prop];});
    const scaleSlotAssignments = getMarkdownSlotAssignments(state.parsedYaml);
    const isScaleControlledKey = ['h1', 'h2', 'h3', 'h4', 'body'].some(slot => scaleSlotAssignments[slot] === key);
    if (isScaleControlledKey && st.size !== previousSize) {
      clearAppliedTypographyScale();
    }
    applyTokensToCssVariables(state.parsedYaml);
    generateExports(state.parsedYaml);
    buildDocument();
    const stylesBodyEl = document.querySelector('#sec-styles .accordion-body');
    if (stylesBodyEl) renderStylesSection(stylesBodyEl, state.parsedYaml);
  };

  // Pasting a Google Fonts embed (<link> tag / URL) into the font input
  // expands to family + source: google, mirroring the old fonts-section UX.
  fontInput.addEventListener('paste', (e) => {
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const parsed = parseGoogleFontsEmbed(pasted);
    if (!parsed) return; // plain family name: default paste
    e.preventDefault();
    fontInput.value = parsed.family;
    sourceSelect.value = 'google';
    commit();
    showToast(`Google Fontsの埋め込みコードから「${parsed.family}」を読み取りました`);
  });

  [fontInput, sourceSelect, embedInput, sizeInput, weightInput, lhInput, lsInput, colorSelect, fontStyleInput, textTransformInput, fontFeatureInput, textDecorationInput, fontVariationInput].forEach(el => el.addEventListener('change', commit));

  {
    const keyInput = wrap.querySelector(`#style-key-${slug}`);
    keyInput.addEventListener('focus', () => { activeEditingKey = key; });
    keyInput.addEventListener('input', () => { activeEditingKey = key; });
    const commitRename = () => {
      const newKey = keyInput.value.trim();
      activeEditingKey = null;
      if (!newKey || newKey === key) { keyInput.value = key; return; }
      if (TYPOGRAPHY_META_KEYS.has(newKey)) {
        showToast(`「${newKey}」は予約キーのためスタイル名に使えません`, 'error');
        keyInput.value = key;
        return;
      }
      if (Object.prototype.hasOwnProperty.call(getTypographyStyles(state.parsedYaml.typography), newKey)) {
        showToast(`スタイルキー「${newKey}」は既に存在します`, 'error');
        keyInput.value = key;
        return;
      }
      const styles = getTypographyStyles(state.parsedYaml.typography);
      const newStyles = {};
      Object.keys(styles).forEach(k => { newStyles[k === key ? newKey : k] = styles[k]; });
      Object.keys(styles).forEach(k => { delete state.parsedYaml.typography[k]; });
      Object.assign(state.parsedYaml.typography, newStyles);
      if (openTypographyStyleKeys.delete(key)) openTypographyStyleKeys.add(newKey);
      state.typographyGroupsMeta.forEach(g => { g.keys = g.keys.map(k => k === key ? newKey : k); });
      const markdown = state.parsedYaml.typography.markdown || {};
      Object.keys(markdown).forEach(slot => { if (markdown[slot] === key) markdown[slot] = newKey; });
      buildDocument();
      renderStylesSection(document.querySelector('#sec-styles .accordion-body'), state.parsedYaml);
      lucide.createIcons();
    };
    keyInput.addEventListener('blur', commitRename);
    keyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); keyInput.blur(); }
      if (e.key === 'Escape') { keyInput.value = key; activeEditingKey = null; keyInput.blur(); }
    });

    const removeBtn = wrap.querySelector('.btn-remove-token');
    removeBtn.addEventListener('click', () => {
      delete state.parsedYaml.typography[key];
      openTypographyStyleKeys.delete(key);
      state.typographyGroupsMeta.forEach(g => { g.keys = g.keys.filter(k => k !== key); });
      const remaining = Object.keys(getTypographyStyles(state.parsedYaml.typography));
      const markdown = state.parsedYaml.typography.markdown || {};
      Object.keys(markdown).forEach(slot => { if (markdown[slot] === key) markdown[slot] = remaining[0] || ''; });
      buildDocument();
      renderStylesSection(document.querySelector('#sec-styles .accordion-body'), state.parsedYaml);
      lucide.createIcons();
      showToast(`スタイル「${key}」を削除しました`);
    });
  }

  return wrap;
}

function refreshStylePreviewChips(yamlData) {
  const styles = getTypographyStyles(yamlData.typography || {});
  Object.keys(styles).forEach(key => {
    const chip = document.getElementById(`style-chip-${slugifyKey(key)}`);
    if (chip) chip.textContent = `${styles[key].size || '-'}px / ${styles[key].weight || '-'}`;
  });
}

// ---- 9d. Components section ----
function renderComponentsSection(bodyEl, yamlData) {
  bodyEl.innerHTML = '';
  if (!state.parsedYaml.components) state.parsedYaml.components = {};
  const components = state.parsedYaml.components;
  state.componentGroupsMeta = reconcileComponentGroupsMeta(state.componentGroupsMeta, components);
  state.componentGroupsMeta.forEach(group => {
    if (group.name === null && !group.keys.length) return;
    const block = document.createElement('div'); block.className = 'component-group-block';
    block.appendChild(buildComponentGroupHeading(group));
    const list = document.createElement('div'); list.className = 'token-dynamic-list component-group-list';
    group.keys.forEach(key => { if (components[key]) list.appendChild(buildComponentRow(key, components[key], yamlData)); });
    block.appendChild(list); bodyEl.appendChild(block);
  });
  const add = document.createElement('button'); add.className = 'btn btn-secondary btn-sm btn-add-token'; add.innerHTML = '<i data-lucide="folder-plus"></i><span>グループを追加</span>';
  add.onclick = () => { let i=1,name=`group-${i}`;while(state.componentGroupsMeta.some(g=>g.name===name))name=`group-${++i}`;state.componentGroupsMeta.push({name,keys:[]});buildDocument();renderComponentsSection(bodyEl,state.parsedYaml); };
  bodyEl.appendChild(add); lucide.createIcons();
}

function buildComponentGroupHeading(group) {
  const heading=document.createElement('div');heading.className='token-row component-group-heading';
  heading.innerHTML=`<div class="token-row-main"><i data-lucide="folder" class="component-group-icon"></i>${group.name===null?'<span class="token-key-label">未分類</span>':`<input class="token-key-input component-group-name" value="${escapeHtml(group.name)}">`}<button class="btn-icon-sm btn-add-component" title="追加"><i data-lucide="plus"></i></button>${group.name===null?'':'<button class="btn-icon-sm btn-remove-token" title="グループを削除"><i data-lucide="trash-2"></i></button>'}</div>`;
  heading.querySelector('.btn-add-component').onclick=()=>{const components=state.parsedYaml.components;const key=generateUniqueKey(components,group.name||'component');const first=(group.keys||[]).find(k=>components[k]);components[key]=first?JSON.parse(JSON.stringify(components[first])):{};componentGroupAddKey(key,group.name);buildDocument();renderComponentsSection(document.querySelector('#sec-components .accordion-body'),state.parsedYaml);};
  if(group.name!==null){const input=heading.querySelector('.component-group-name');input.onchange=()=>{const next=input.value.trim().toLowerCase();if(!next||state.componentGroupsMeta.some(g=>g!==group&&g.name===next)){input.value=group.name;return;}group.name=next;buildDocument();};heading.querySelector('.btn-remove-token').onclick=()=>{const u=state.componentGroupsMeta.find(g=>g.name===null)||{name:null,keys:[]};if(!state.componentGroupsMeta.includes(u))state.componentGroupsMeta.unshift(u);u.keys.push(...group.keys);state.componentGroupsMeta=state.componentGroupsMeta.filter(g=>g!==group);buildDocument();renderComponentsSection(document.querySelector('#sec-components .accordion-body'),state.parsedYaml);};}
  return heading;
}

function componentRefValue(value) { const m=String(value||'').match(/^\{[^.]+\.(.+)\}$/); return m?m[1]:''; }
function componentShadowRefValue(value) { const m=String(value||'').match(/^\{elevation\.shadows\.(.+)\}$/); return m?m[1]:''; }
function componentRef(section,key) { return key?`{${section}.${key}}`:undefined; }
function componentSelectOptions(entries,current){return `<option value="">未設定</option>`+entries.map(entry=>{const item=typeof entry==='string'?{key:entry,label:entry}:entry;return `<option value="${escapeHtml(item.key)}" ${item.key===current?'selected':''}>${escapeHtml(item.label)}</option>`;}).join('');}
function componentNumberValue(value) { const n=parseFloat(value); return Number.isFinite(n)?String(n):''; }

function updateComponentPreview(row, key, def, yamlData) {
  const preview=row.querySelector('.component-live-preview');
  const colors=yamlData.colors||{}, styles=getTypographyStyles(yamlData.typography||{}), borders=yamlData.border||{}, rounded=yamlData.rounded||{}, shadows=(yamlData.elevation||{}).shadows||{};
  const bgKey=componentRefValue(def.backgroundColor), textKey=componentRefValue(def.textColor), borderColorKey=componentRefValue(def.borderColor), typeKey=componentRefValue(def.typography), roundKey=componentRefValue(def.rounded), shadowKey=componentShadowRefValue(def.shadow);
  const type=styles[typeKey]||{};
  preview.textContent=key;
  preview.style.backgroundColor=colors[bgKey]||'var(--editor-surface)';
  preview.style.color=colors[textKey]||colors[type.color]||type.color||'var(--editor-text)';
  preview.style.borderRadius=`${def.rounded===0||def.rounded==='0'?0:(rounded[roundKey]!==undefined?rounded[roundKey]:0)}px`;
  preview.style.padding=def.padding||'12px 16px';
  const borderKey=componentRefValue(def.border);
  preview.style.border=borders[borderKey]||def.border||'1px solid color-mix(in srgb,var(--editor-border) 75%,transparent)';
  preview.style.borderColor=colors[borderColorKey]||'';
  preview.style.boxShadow=shadows[shadowKey]||'';
  preview.style.fontFamily=type.font?`'${type.font}', sans-serif`:'';
  preview.style.fontSize=type.size!==undefined?`${type.size}px`:'';
  preview.style.fontWeight=type.weight!==undefined?String(type.weight):'';
  preview.style.lineHeight=type.lineHeight!==undefined?String(type.lineHeight):'';
  preview.style.letterSpacing=type.letterSpacing||'';
  preview.style.fontStyle=type.fontStyle||'';
  preview.style.textTransform=type.textTransform||'';
  preview.style.fontFeatureSettings=type.fontFeature||'';
  preview.style.textDecoration=type.textDecoration||'';
  preview.style.fontVariationSettings=type.fontVariationSettings||'';
}

function buildComponentRow(key, def, yamlData) {
  const row=document.createElement('div');row.className=`token-row component-token-row${openComponentKeys.has(key)?' is-open':''}`;row.dataset.componentKey=key;
  const colorEntries=Object.keys(yamlData.colors||{});
  const styleMap=getTypographyStyles(yamlData.typography||{}),typeEntries=Object.keys(styleMap);
  const borderEntries=Object.keys(yamlData.border||{});
  const roundEntries=Object.entries(yamlData.rounded||{}).map(([k,v])=>({key:k,label:`${k} (${v}px)`}));
  const shadowEntries=Object.keys((yamlData.elevation||{}).shadows||{});
  const roundedCurrent=def.rounded===0||def.rounded==='0'?'none':componentRefValue(def.rounded);
  row.innerHTML=`<div class="token-row-main component-token-header"><input class="token-key-input component-key" value="${escapeHtml(key)}"><button class="btn-icon-sm btn-toggle-component" title="編集項目を開く"><i data-lucide="pencil"></i></button><button class="btn-icon-sm btn-remove-token" title="削除"><i data-lucide="trash-2"></i></button></div><div class="component-live-preview"></div><div class="component-token-fields"><div class="form-group"><label>backgroundColor</label><select data-field="backgroundColor">${componentSelectOptions(colorEntries,componentRefValue(def.backgroundColor))}</select></div><div class="form-group"><label>textColor</label><select data-field="textColor">${componentSelectOptions(colorEntries,componentRefValue(def.textColor))}</select></div><div class="form-group"><label>typography</label><select data-field="typography">${componentSelectOptions(typeEntries,componentRefValue(def.typography))}</select></div><div class="form-group"><label>rounded</label><select data-field="rounded">${componentSelectOptions(roundEntries,roundedCurrent)}</select></div><div class="form-group"><label>padding</label><input type="text" data-field="padding" value="${escapeHtml(def.padding||'')}" placeholder="8px 16px"></div><div class="form-group"><label>border</label><select data-field="border">${componentSelectOptions(borderEntries,componentRefValue(def.border))}</select></div><div class="form-group"><label>borderColor</label><select data-field="borderColor">${componentSelectOptions(colorEntries,componentRefValue(def.borderColor))}</select></div><div class="form-group"><label>shadow</label><select data-field="shadow">${componentSelectOptions(shadowEntries,componentShadowRefValue(def.shadow))}</select></div><div class="form-group"><label>height</label><div class="component-number-field"><input type="number" data-field="height" value="${escapeHtml(componentNumberValue(def.height))}" min="0" placeholder="48"><span>px</span></div></div><div class="form-group"><label>width</label><div class="component-number-field"><input type="number" data-field="width" value="${escapeHtml(componentNumberValue(def.width))}" min="0" placeholder="160"><span>px</span></div></div></div>`;
  row.querySelector('.btn-toggle-component').onclick=()=>{const o=!row.classList.contains('is-open');row.classList.toggle('is-open',o);row.querySelector('.btn-toggle-component').title=o?'編集項目を閉じる':'編集項目を開く';if(o)openComponentKeys.add(key);else openComponentKeys.delete(key);};
  const commit=()=>{const d=state.parsedYaml.components[key];[['backgroundColor','colors'],['textColor','colors'],['typography','typography'],['borderColor','colors'],['border','border']].forEach(([field,section])=>{const v=row.querySelector(`[data-field="${field}"]`).value;if(v)d[field]=componentRef(section,v);else delete d[field];});const roundedValue=row.querySelector('[data-field="rounded"]').value;if(roundedValue)d.rounded=componentRef('rounded',roundedValue);else delete d.rounded;const shadowValue=row.querySelector('[data-field="shadow"]').value;if(shadowValue)d.shadow=`{elevation.shadows.${shadowValue}}`;else delete d.shadow;const p=row.querySelector('[data-field="padding"]').value.trim();if(p)d.padding=p;else delete d.padding;['height','width'].forEach(field=>{const v=row.querySelector(`[data-field="${field}"]`).value;if(v!=='')d[field]=`${v}px`;else delete d[field];});updateComponentPreview(row,key,d,state.parsedYaml);buildDocument();};
  row.querySelectorAll('select,input[data-field]').forEach(el=>el.addEventListener('change',commit));
  const keyInput=row.querySelector('.component-key');keyInput.onchange=()=>{const next=keyInput.value.trim().toLowerCase();if(!next||next===key)return;if(state.parsedYaml.components[next]){keyInput.value=key;return;}const out={};Object.keys(state.parsedYaml.components).forEach(k=>out[k===key?next:k]=state.parsedYaml.components[k]);state.parsedYaml.components=out;state.componentGroupsMeta.forEach(g=>g.keys=g.keys.map(k=>k===key?next:k));if(openComponentKeys.delete(key))openComponentKeys.add(next);buildDocument();renderComponentsSection(document.querySelector('#sec-components .accordion-body'),state.parsedYaml);};
  row.querySelector('.btn-remove-token').onclick=()=>{delete state.parsedYaml.components[key];state.componentGroupsMeta.forEach(g=>g.keys=g.keys.filter(k=>k!==key));openComponentKeys.delete(key);buildDocument();renderComponentsSection(document.querySelector('#sec-components .accordion-body'),state.parsedYaml);};
  updateComponentPreview(row,key,def,yamlData);
  return row;
}

// ---- 9e. Shadows section ----
function renderShadowsSection(bodyEl, yamlData) {
  bodyEl.innerHTML = '';
  const shadows = (yamlData.elevation || {}).shadows || {};

  const listEl = document.createElement('div');
  listEl.className = 'token-dynamic-list';
  Object.keys(shadows).forEach(key => {
    listEl.appendChild(buildShadowRow(key, shadows[key]));
  });
  bodyEl.appendChild(listEl);

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-secondary btn-sm btn-add-token';
  addBtn.innerHTML = '<i data-lucide="plus"></i><span>追加</span>';
  addBtn.addEventListener('click', () => {
    const newKey = generateScaleKey(shadows, 'shadow');
    const firstKey = Object.keys(shadows).find(key => key !== 'none');
    state.parsedYaml.elevation.shadows[newKey] = firstKey ? shadows[firstKey] : '0 2px 8px rgba(0,0,0,0.1)';
    applyTokensToCssVariables(state.parsedYaml);
    buildDocument();
    renderShadowsSection(document.querySelector('#sec-shadows .accordion-body'), state.parsedYaml);
    lucide.createIcons();
  });
  bodyEl.appendChild(addBtn);
  lucide.createIcons();
}

function parseShadowString(str) {
  // naive parse: "x y blur spread color" - color may be rgba(...)/hex/named
  if (!str || typeof str !== 'string') return { x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0,0,0,0.1)' };
  const colorMatch = str.match(/(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8})/);
  const color = colorMatch ? colorMatch[0] : 'rgba(0,0,0,0.1)';
  const nums = str.replace(color, '').match(/-?[\d.]+px|-?[\d.]+/g) || [];
  const vals = nums.map(n => parseFloat(n));
  return {
    x: vals[0] !== undefined ? vals[0] : 0,
    y: vals[1] !== undefined ? vals[1] : 4,
    blur: vals[2] !== undefined ? vals[2] : 12,
    spread: vals[3] !== undefined ? vals[3] : 0,
    color
  };
}

function buildShadowRow(key, value) {
  const slug = slugifyKey(key);
  const parsed = parseShadowString(value);
  const isNone = value === 'none';
  const isDefaultNone = key === 'none';

  const row = document.createElement('div');
  row.className = `token-row shadow-token-row collapsible-token-row${openShadowKeys.has(key) ? ' is-open' : ''}`;
  row.setAttribute('data-shadow-key', key);

  row.innerHTML = `
    <div class="token-row-main collapsible-token-header">
      <input type="text" class="token-key-input" id="shadow-key-${slug}" value="${escapeHtml(key)}" spellcheck="false" ${isDefaultNone ? 'readonly' : ''}>
      ${isDefaultNone ? '' : `<button type="button" class="btn-icon-sm btn-toggle-token-details" title="詳細を表示" aria-expanded="${openShadowKeys.has(key)}"><i data-lucide="pencil"></i></button><button class="btn-icon-sm btn-remove-token" title="このシャドウを削除"><i data-lucide="trash-2"></i></button>`}
    </div>
    <div class="collapsible-token-details">
    <div class="form-group-row">
      <div class="form-group"><label>x</label><input type="number" id="shadow-x-${slug}" value="${parsed.x}" ${isNone ? 'disabled' : ''}></div>
      <div class="form-group"><label>y</label><input type="number" id="shadow-y-${slug}" value="${parsed.y}" ${isNone ? 'disabled' : ''}></div>
    </div>
    <div class="form-group-row">
      <div class="form-group"><label>blur</label><input type="number" id="shadow-blur-${slug}" value="${parsed.blur}" min="0" ${isNone ? 'disabled' : ''}></div>
      <div class="form-group"><label>spread</label><input type="number" id="shadow-spread-${slug}" value="${parsed.spread}" ${isNone ? 'disabled' : ''}></div>
    </div>
    <div class="form-group">
      <label>color</label>
      <input type="text" id="shadow-color-${slug}" value="${escapeHtml(parsed.color)}" ${isNone ? 'disabled' : ''}>
    </div>
    <div class="form-group">
      <label>raw</label>
      <input type="text" id="shadow-raw-${slug}" value="${escapeHtml(value)}" placeholder="0 4px 12px rgba(0,0,0,0.1) または none" ${isDefaultNone ? 'readonly' : ''}>
    </div>
    </div>
  `;

  const keyInput = row.querySelector(`#shadow-key-${slug}`);
  const xInput = row.querySelector(`#shadow-x-${slug}`);
  const yInput = row.querySelector(`#shadow-y-${slug}`);
  const blurInput = row.querySelector(`#shadow-blur-${slug}`);
  const spreadInput = row.querySelector(`#shadow-spread-${slug}`);
  const colorInput = row.querySelector(`#shadow-color-${slug}`);
  const rawInput = row.querySelector(`#shadow-raw-${slug}`);
  const preview = row.querySelector(`#shadow-preview-${slug}`);
  const removeBtn = row.querySelector('.btn-remove-token');
  const toggleBtn = row.querySelector('.btn-toggle-token-details');
  if (toggleBtn) toggleBtn.addEventListener('click', () => {
    const open = !row.classList.contains('is-open');
    row.classList.toggle('is-open', open);
    if (open) openShadowKeys.add(key); else openShadowKeys.delete(key);
  });

  const composeFromBuilder = () => {
    const x = parseFloat(xInput.value) || 0;
    const y = parseFloat(yInput.value) || 0;
    const blur = parseFloat(blurInput.value) || 0;
    const spread = parseFloat(spreadInput.value) || 0;
    const color = colorInput.value.trim() || 'rgba(0,0,0,0.1)';
    const str = `${x}px ${y}px ${blur}px ${spread}px ${color}`;
    rawInput.value = str;
    if (preview) preview.style.boxShadow = str;
    state.parsedYaml.elevation.shadows[key] = str;
    applyTokensToCssVariables(state.parsedYaml);
    buildDocument();
  };

  [xInput, yInput, blurInput, spreadInput, colorInput].forEach(el => {
    el.addEventListener('change', composeFromBuilder);
  });

  rawInput.addEventListener('change', () => {
    const val = rawInput.value.trim();
    state.parsedYaml.elevation.shadows[key] = val;
    if (preview) preview.style.boxShadow = val === 'none' ? 'none' : val;
    const reparsed = parseShadowString(val);
    if (val !== 'none') {
      xInput.value = reparsed.x; yInput.value = reparsed.y;
      blurInput.value = reparsed.blur; spreadInput.value = reparsed.spread;
      colorInput.value = reparsed.color;
    }
    applyTokensToCssVariables(state.parsedYaml);
    buildDocument();
  });

  keyInput.addEventListener('focus', () => { activeEditingKey = key; });
  keyInput.addEventListener('input', () => { activeEditingKey = key; });
  const commitRename = () => {
    const newKey = keyInput.value.trim().toLowerCase();
    activeEditingKey = null;
    if (!newKey || newKey === key) { keyInput.value = key; return; }
    if (Object.prototype.hasOwnProperty.call(state.parsedYaml.elevation.shadows, newKey)) {
      showToast(`シャドウキー「${newKey}」は既に存在します`, 'error');
      keyInput.value = key;
      return;
    }
    const shadows = state.parsedYaml.elevation.shadows;
    const newShadows = {};
    Object.keys(shadows).forEach(k => { newShadows[k === key ? newKey : k] = shadows[k]; });
    state.parsedYaml.elevation.shadows = newShadows;
    if (openShadowKeys.delete(key)) openShadowKeys.add(newKey);
    applyTokensToCssVariables(state.parsedYaml);
    buildDocument();
    renderShadowsSection(document.querySelector('#sec-shadows .accordion-body'), state.parsedYaml);
    lucide.createIcons();
  };
  keyInput.addEventListener('blur', commitRename);
  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); keyInput.blur(); }
    if (e.key === 'Escape') { keyInput.value = key; activeEditingKey = null; keyInput.blur(); }
  });

  if (removeBtn) removeBtn.addEventListener('click', () => {
    delete state.parsedYaml.elevation.shadows[key];
    openShadowKeys.delete(key);
    applyTokensToCssVariables(state.parsedYaml);
    buildDocument();
    renderShadowsSection(document.querySelector('#sec-shadows .accordion-body'), state.parsedYaml);
    lucide.createIcons();
    showToast(`シャドウ「${key}」を削除しました`);
  });

  return row;
}

function refreshShadowChips(yamlData) {
  const shadows = (yamlData.elevation || {}).shadows || {};
  Object.keys(shadows).forEach(key => {
    const preview = document.getElementById(`shadow-preview-${slugifyKey(key)}`);
    if (preview) preview.style.boxShadow = shadows[key] === 'none' ? 'none' : shadows[key];
  });
}

// ---- 9e. Border section ----
function renderBorderSection(bodyEl, yamlData) {
  bodyEl.innerHTML = '';
  if (!state.parsedYaml.border) state.parsedYaml.border = { none: 'none' };
  if (!Object.prototype.hasOwnProperty.call(state.parsedYaml.border, 'none')) state.parsedYaml.border = { none: 'none', ...state.parsedYaml.border };
  Object.entries(state.parsedYaml.border).forEach(([key,value]) => bodyEl.appendChild(buildBorderTokenRow(key,value)));
  const add=document.createElement('button');add.className='btn btn-secondary btn-sm btn-add-token';add.innerHTML='<i data-lucide="plus"></i><span>追加</span>';
  add.onclick=()=>{const key=generateScaleKey(state.parsedYaml.border,'border');state.parsedYaml.border[key]='1px solid';buildDocument();renderBorderSection(bodyEl,state.parsedYaml);};
  bodyEl.appendChild(add);lucide.createIcons();
}

function buildBorderTokenRow(key,value) {
  const fixed=key==='none';
  const row=document.createElement('div');row.className='token-row inline-token-row';
  row.innerHTML=`<div class="token-row-main">${fixed?'<span class="token-key-label">none</span>':`<input class="token-key-input" value="${escapeHtml(key)}">`}<input class="inline-token-value border-token-value" value="${escapeHtml(value)}" ${fixed?'readonly':''}>${fixed?'':'<button class="btn-icon-sm btn-remove-token" title="削除"><i data-lucide="trash-2"></i></button>'}</div>`;
  if(!fixed){const keyInput=row.querySelector('.token-key-input');keyInput.onchange=()=>{const next=keyInput.value.trim().toLowerCase();if(!next||next===key||state.parsedYaml.border[next]!==undefined){keyInput.value=key;return;}const out={};Object.keys(state.parsedYaml.border).forEach(k=>out[k===key?next:k]=state.parsedYaml.border[k]);state.parsedYaml.border=out;buildDocument();renderBorderSection(document.querySelector('#sec-border .accordion-body'),state.parsedYaml);};row.querySelector('.btn-remove-token').onclick=()=>{delete state.parsedYaml.border[key];buildDocument();renderBorderSection(document.querySelector('#sec-border .accordion-body'),state.parsedYaml);};}
  row.querySelector('.border-token-value').onchange=e=>{state.parsedYaml.border[key]=e.target.value.trim()||'none';buildDocument();};
  return row;
}

// ---- 9f. Rounded section ----
function renderBordersSection(bodyEl, yamlData) {
  bodyEl.innerHTML = '';
  if (!state.parsedYaml.rounded) state.parsedYaml.rounded={none:0};
  if (!Object.prototype.hasOwnProperty.call(state.parsedYaml.rounded,'none')) state.parsedYaml.rounded={none:0,...state.parsedYaml.rounded};
  Object.entries(state.parsedYaml.rounded).forEach(([key,value]) => bodyEl.appendChild(buildRoundedRow(key,value)));
  const add=document.createElement('button');add.className='btn btn-secondary btn-sm btn-add-token';add.innerHTML='<i data-lucide="plus"></i><span>追加</span>';
  add.onclick=()=>{const key=generateScaleKey(state.parsedYaml.rounded,'rounded');const first=Object.keys(state.parsedYaml.rounded).find(k=>k!=='none');state.parsedYaml.rounded[key]=first?state.parsedYaml.rounded[first]:4;buildDocument();renderBordersSection(bodyEl,state.parsedYaml);};
  bodyEl.appendChild(add);
  lucide.createIcons();
}

function buildRoundedRow(key, value) {
  const fixed=key==='none';
  const row = document.createElement('div');row.className='token-row inline-token-row';
  row.innerHTML = `<div class="token-row-main">${fixed?'<span class="token-key-label">none</span>':`<input class="token-key-input" value="${escapeHtml(key)}">`}<div class="inline-number-value"><input type="number" value="${value}" min="0" ${fixed?'readonly':''}><span>px</span></div>${fixed?'':'<button class="btn-icon-sm btn-remove-token" title="削除"><i data-lucide="trash-2"></i></button>'}</div>`;
  const valueInput = row.querySelector('input[type="number"]');
  valueInput.onchange = () => { state.parsedYaml.rounded[key]=parseFloat(valueInput.value)||0;buildDocument();applyTokensToCssVariables(state.parsedYaml); };
  if(!fixed){const keyInput=row.querySelector('.token-key-input');keyInput.onchange=()=>{const next=keyInput.value.trim().toLowerCase();if(!next||next===key||state.parsedYaml.rounded[next]!==undefined){keyInput.value=key;return;}const out={};Object.keys(state.parsedYaml.rounded).forEach(k=>out[k===key?next:k]=state.parsedYaml.rounded[k]);state.parsedYaml.rounded=out;buildDocument();renderBordersSection(document.querySelector('#sec-borders .accordion-body'),state.parsedYaml);};row.querySelector('.btn-remove-token').onclick=()=>{delete state.parsedYaml.rounded[key];buildDocument();renderBordersSection(document.querySelector('#sec-borders .accordion-body'),state.parsedYaml);};}
  return row;
}

// ---- 9g. Spacing section ----
function renderSpacingSection(bodyEl, yamlData) {
  bodyEl.innerHTML = '';
  const spacing = yamlData.spacing || {};
  if (!Object.prototype.hasOwnProperty.call(spacing, 'none')) spacing.none=0;
  Object.keys(spacing).forEach(key => bodyEl.appendChild(buildSpacingRow(key, spacing[key], key==='none')));
  const add = document.createElement('button'); add.className='btn btn-secondary btn-sm btn-add-token'; add.innerHTML='<i data-lucide="plus"></i><span>追加</span>';
  add.onclick=()=>{const key=generateScaleKey(spacing,'spacing');state.parsedYaml.spacing[key]=spacing.base??8;buildDocument();renderSpacingSection(bodyEl,state.parsedYaml);};bodyEl.appendChild(add);lucide.createIcons();
}

function generateScaleKey(map, fallback) { return ['sm','md','lg','xl','xs'].find(k => !Object.prototype.hasOwnProperty.call(map,k)) || generateUniqueKey(map,fallback); }
function buildSpacingRow(key,value,isFixed){const row=document.createElement('div');row.className='token-row inline-token-row';row.innerHTML=`<div class="token-row-main">${isFixed?'<span class="token-key-label">none</span>':`<input class="token-key-input" value="${escapeHtml(key)}">`}<div class="inline-number-value"><input type="number" value="${value}" min="0" ${isFixed?'readonly':''}><span>px</span></div>${isFixed?'':'<button class="btn-icon-sm btn-remove-token" title="削除"><i data-lucide="trash-2"></i></button>'}</div>`;const valueInput=row.querySelector('input[type="number"]');valueInput.onchange=()=>{state.parsedYaml.spacing[key]=parseFloat(valueInput.value)||0;buildDocument();applyTokensToCssVariables(state.parsedYaml);};if(!isFixed){const keyInput=row.querySelector('.token-key-input');keyInput.onchange=()=>{const next=keyInput.value.trim().toLowerCase();if(!next||next===key)return;if(state.parsedYaml.spacing[next]!==undefined){keyInput.value=key;return;}const out={};Object.keys(state.parsedYaml.spacing).forEach(k=>out[k===key?next:k]=state.parsedYaml.spacing[k]);state.parsedYaml.spacing=out;buildDocument();renderSpacingSection(document.querySelector('#sec-spacing .accordion-body'),state.parsedYaml);};row.querySelector('.btn-remove-token').onclick=()=>{delete state.parsedYaml.spacing[key];buildDocument();renderSpacingSection(document.querySelector('#sec-spacing .accordion-body'),state.parsedYaml);};}return row;}

function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================================
// 10. Sync Text Editor (Source) with visual UI elements
// ============================================================================
function syncCodeToVisualForm(forceRebuild = false) {
  const content = document.getElementById('code-textarea').value;

  if (parseDocument(content)) {
    // PREVIEW.md is the primary consumer of DESIGN.md. Render it immediately
    // after parsing so a failure in an auxiliary editor panel cannot leave the
    // canvas showing normalizeV3()'s built-in fallback tokens.
    renderArticleSample(state.parsedYaml);
    renderPreviewThemeSelect();
    applyTokensToCssVariables(state.parsedYaml);
    generateVisualForm(state.parsedYaml, forceRebuild);
    checkAccessibility(state.parsedYaml);
    generateExports(state.parsedYaml);

    document.getElementById('meta-title').value = state.parsedYaml.title || state.parsedYaml.name || '';
    document.getElementById('meta-version').value = state.parsedYaml.version || '';
    document.getElementById('meta-author').value = state.parsedYaml.author || '';
    document.getElementById('meta-description').value = state.parsedYaml.description || '';

    const renderer = document.getElementById('markdown-doc-renderer');
    if (renderer) renderer.innerHTML = marked.parse(state.markdownBody || '*仕様書の記述がありません。*');

    updateLineNumbers();
    renderPreviewCanvasDynamicBits(state.parsedYaml);
  }
}

// ============================================================================
// 11. Accessibility Audit (WCAG Contrast Ratios)
// ============================================================================
function classifyContrast(ratio) {
  if (ratio >= 7.0) {
    return { label: 'AAA', cls: 'wcag-badge-aaa' };
  } else if (ratio >= 4.5) {
    return { label: 'AA', cls: 'wcag-badge-aa' };
  } else if (ratio >= 3.0) {
    return { label: 'AA Large', cls: 'wcag-badge-aa-large' };
  }
  return { label: '不適合', cls: 'wcag-badge-fail' };
}

function isCanvasOrSurfaceKey(key) {
  return /^(?:canvas|background|surface)(?:-.+)?$/i.test(String(key || '').trim());
}

// Select the background that gives a color token its intended meaning:
// `on-primary` is evaluated on `primary`, while `*-dark` tokens are evaluated
// on both dark canvas and dark surface.  The lowest ratio is kept so a token
// cannot appear valid only because one of its intended backgrounds is easier.
function getContrastEvaluation(key, value, colors, defaultBackgrounds) {
  const normalized = String(key || '').trim().toLowerCase();
  let targets = [];

  if (normalized.startsWith('on-')) {
    const companionKey = normalized.slice(3);
    if (Object.prototype.hasOwnProperty.call(colors || {}, companionKey)) {
      targets = [{ key: companionKey, value: colors[companionKey] }];
    }
  }

  if (!targets.length && normalized.endsWith('-dark') && !isCanvasOrSurfaceKey(normalized)) {
    ['canvas-dark', 'surface-dark'].forEach(targetKey => {
      if (Object.prototype.hasOwnProperty.call(colors || {}, targetKey)) {
        targets.push({ key: targetKey, value: colors[targetKey] });
      }
    });
  }

  if (!targets.length) targets = defaultBackgrounds || [];
  if (!targets.length) targets = [{ key: 'canvas', value: '#ffffff' }];

  const results = targets.map(target => ({
    ...target,
    ratio: getContrastRatio(value, target.value)
  }));
  const worst = results.reduce((lowest, current) => current.ratio < lowest.ratio ? current : lowest, results[0]);
  return {
    ratio: worst.ratio,
    background: worst.value,
    backgroundKey: worst.key,
    label: results.map(result => result.key).join(' / ')
  };
}

// Public entry point used by many call sites. When called with
// state.parsedYaml directly and a non-default preview theme is active, the
// theme's merged colors are used for swatches/matrix/warnings instead of the
// base colors — display-only, never mutates state.parsedYaml.
function checkAccessibility(yamlData) {
  const colors = (yamlData === state.parsedYaml && state.activeDesignTheme)
    ? getMergedThemeColors(yamlData, state.activeDesignTheme)
    : (yamlData.colors || {});
  const bg = baseColor(colors, 'canvas', '#FFFFFF');
  const surface = colors.surface || '#F8FAFC';

  renderColorSwatches(colors, bg);
  renderContrastMatrix(colors, bg, surface);
  updateTokenFormWarnings(colors, bg);
}

// All colors (including user-defined) shown with contrast-on-background badges.
function renderColorSwatches(colors, bg) {
  const grid = document.getElementById('color-swatches-grid');
  if (!grid) return;

  grid.innerHTML = '';

  Object.keys(colors).forEach(key => {
    const value = colors[key];
    const isBackgroundItself = isCanvasOrSurfaceKey(key);
    const evaluation = getContrastEvaluation(key, value, colors, [{ key: 'canvas', value: bg }]);
    const onBgHex = compositeOverBackground(value, evaluation.background);
    const ratio = evaluation.ratio;
    const rating = classifyContrast(ratio);
    const suppressBadge = isBackgroundItself || isSuppressedContrastKey(key);

    const card = document.createElement('div');
    card.className = 'swatch-card';

    const contrastHtml = suppressBadge
      ? ''
      : `
        <div class="swatch-contrast-row">
          <span class="swatch-contrast-ratio">${ratio.toFixed(2)}:1</span>
          <span class="wcag-badge ${rating.cls}">${rating.label}</span>
        </div>
      `;

    card.innerHTML = `
      <div class="swatch-color" style="background-color: ${onBgHex}; ${isBackgroundItself ? 'border-bottom: 1px solid rgba(127,127,127,0.2);' : ''}"></div>
      <div class="swatch-info">
        <span class="swatch-name">${escapeHtml(key)}</span>
        <span class="swatch-value">${escapeHtml(value)}</span>
        ${contrastHtml}
      </div>
    `;

    grid.appendChild(card);
  });
}

// Combination matrix: foreground = all color tokens, background = background/surface.
function renderContrastMatrix(colors, bg, surface) {
  const grid = document.getElementById('contrast-matrix-grid');
  if (!grid) return;

  const backgrounds = [
    { key: 'canvas', label: 'canvas', value: bg },
    { key: 'surface', label: 'surface', value: surface }
  ];
  if (colors['canvas-dark']) backgrounds.push({ key: 'canvas-dark', label: 'canvas-dark', value: colors['canvas-dark'] });
  if (colors['surface-dark']) backgrounds.push({ key: 'surface-dark', label: 'surface-dark', value: colors['surface-dark'] });

  grid.innerHTML = '';

  Object.keys(colors).forEach(fgKey => {
    const normalized = fgKey.toLowerCase();
    let intendedBackgrounds = backgrounds.filter(bgDef => !bgDef.key.endsWith('-dark'));
    if (normalized.startsWith('on-') && colors[normalized.slice(3)] !== undefined) {
      intendedBackgrounds = [{ key: normalized.slice(3), label: normalized.slice(3), value: colors[normalized.slice(3)] }];
    } else if (normalized.endsWith('-dark') && !isCanvasOrSurfaceKey(normalized)) {
      intendedBackgrounds = backgrounds.filter(bgDef => bgDef.key.endsWith('-dark'));
    }
    intendedBackgrounds.forEach(bgDef => {
      if (fgKey === bgDef.key) return; // skip meaningless same-color pairs

      const fgValue = colors[fgKey];
      const ratio = getContrastRatio(fgValue, bgDef.value);
      const rating = classifyContrast(ratio);
      const displayColor = compositeOverBackground(fgValue, bgDef.value);
      const suppressBadge = isSuppressedContrastKey(fgKey) || isSuppressedContrastKey(bgDef.label);

      const cell = document.createElement('div');
      cell.className = 'matrix-cell';
      cell.innerHTML = `
        <div class="matrix-cell-sample" style="color: ${displayColor}; background-color: ${bgDef.value};">Abc 文字サンプル</div>
        <div class="matrix-cell-meta">
          <span class="matrix-cell-labels">${escapeHtml(fgKey)} / ${bgDef.label}</span>
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="matrix-cell-ratio">${ratio.toFixed(2)}:1</span>
            ${suppressBadge ? '' : `<span class="wcag-badge ${rating.cls}">${rating.label}</span>`}
          </div>
        </div>
      `;
      grid.appendChild(cell);
    });
  });
}

// Inline warnings on the color token form: flag inputs whose contrast against
// background fails AA (<4.5:1).
function updateTokenFormWarnings(colors, bg) {
  Object.keys(colors).forEach(key => {
    if (isCanvasOrSurfaceKey(key)) return;
    const slug = slugifyKey(key);
    const picker = document.getElementById(`color-picker-${slug}`);
    const inputWrap = document.getElementById(`color-text-${slug}`)?.closest('.color-input-wrapper');
    const row = document.querySelector(`#color-text-${slug}`)?.closest('.color-token-row');
    if (!picker || !row) return;

    const existingWarning = row.querySelector('.token-contrast-warning');
    if (existingWarning) existingWarning.remove();
    picker.classList.remove('has-contrast-warning');
    if (inputWrap) inputWrap.classList.remove('has-contrast-warning');

    const evaluation = getContrastEvaluation(key, colors[key], colors, [{ key: 'canvas', value: bg }]);
    const ratio = evaluation.ratio;
    const suppressWarning = isSuppressedContrastKey(key);
    if (ratio < 4.5 && !suppressWarning) {
      picker.classList.add('has-contrast-warning');
      if (inputWrap) inputWrap.classList.add('has-contrast-warning');
      const warningEl = document.createElement('div');
      warningEl.className = 'token-contrast-warning';
      warningEl.innerHTML = `<i data-lucide="alert-triangle"></i><span>${escapeHtml(evaluation.label)}とのコントラスト比 ${ratio.toFixed(2)}:1 (AA未満)</span>`;
      row.appendChild(warningEl);
    }
  });

  lucide.createIcons();
}

// ============================================================================
// 12. Preview Canvas: apply text styles (h1-h4/body/small/caption/strong) and
// shadow assignments dynamically via inline styles referencing CSS vars.
// ============================================================================
function renderPreviewCanvasDynamicBits(yamlData) {
  renderTokenDrivenParts(yamlData);
  renderArticleSample(yamlData);
}

function getPreviewSemanticColorKeys(colors) {
  const structuralKeys = new Set([
    'canvas',
    'background',
    'surface',
    'ink',
    'ink-muted',
    'hairline',
    'text',
    'text-muted',
    'border',
    'link',
    'link-hover',
    'on-primary'
  ]);
  return Object.keys(colors || {}).filter(key => {
    if (structuralKeys.has(key)) return false;
    if (/-\d+$/.test(key)) return false;
    return true;
  });
}

function findTintTokenForColor(key, colors) {
  const exact = `${key}-10`;
  if (Object.prototype.hasOwnProperty.call(colors || {}, exact)) return exact;
  return Object.keys(colors || {})
    .filter(k => k.startsWith(`${key}-`) && /-\d+$/.test(k))
    .sort((a, b) => {
      const ap = parseInt(a.match(/-(\d+)$/)[1], 10);
      const bp = parseInt(b.match(/-(\d+)$/)[1], 10);
      return ap - bp;
    })[0] || null;
}

function isSuppressedContrastKey(key) {
  const normalized = String(key || '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'surface' || normalized === 'border') return true;
  if (normalized.endsWith('-bg')) return true;
  const tintMatch = normalized.match(/-(\d+)$/);
  if (tintMatch) {
    return parseInt(tintMatch[1], 10) <= 50;
  }
  return false;
}

function getSemanticPreviewMeta(key) {
  const map = {
    primary: { label: 'Primary', icon: 'mouse-pointer-click', message: '主要操作やCTAに使う色です。' },
    secondary: { label: 'Secondary', icon: 'circle', message: '補助的な操作や控えめなUIに使う色です。' },
    success: { label: 'Success', icon: 'check-circle', message: '完了・肯定・保存成功などを示します。' },
    error: { label: 'Error', icon: 'x-circle', message: '破壊的操作やエラー表示に使います。' },
    danger: { label: 'Danger', icon: 'x-circle', message: '破壊的操作やエラー表示に使います。' },
    warning: { label: 'Warning', icon: 'alert-triangle', message: '注意や確認が必要な状態を示します。' },
    info: { label: 'Info', icon: 'info', message: '補足情報やヒントを示します。' },
    emphasis: { label: 'Emphasis', icon: 'sparkles', message: '本文中の意味的な強調に使います。' },
    accent: { label: 'Accent', icon: 'star', message: '装飾や補助的なアクセントに使います。' }
  };
  return map[key] || { label: key, icon: 'circle', message: `${key} トークンの使われ方を確認します。` };
}

// "UI" (no arg / spec === 'UI') means "core semantic colors" — independent
// of any group, so this simply falls back to whatever isn't a structural /
// tint-looking colors key.
function getUiPreviewEntries(yamlData) {
  const colors = (yamlData && yamlData.colors) || {};
  return getPreviewSemanticColorKeys(colors).map(key => {
    const meta = getSemanticPreviewMeta(key);
    return { key, name: key, color: colors[key], label: meta.label, icon: meta.icon, message: meta.message };
  });
}

function buildPreviewCardItems(yamlData) {
  const colors = (yamlData && yamlData.colors) || {};
  const namedGroups = (state.colorGroupsMeta || []).filter(g => g.name !== null && g.keys.length);
  if (namedGroups.length) {
    return namedGroups.map(g => {
      const theme = getColorGroupTheme(g.name, colors) || baseColor(colors, 'ink', '#1c2530');
      const otherKeys = g.keys.filter(k => k !== g.name);
      const paletteSummary = otherKeys.length ? otherKeys.join(' / ') : '補助色未設定';
      return {
        badge: g.name,
        title: `${g.name} パート`,
        description: `theme ${theme}。${paletteSummary}`,
        accent: theme
      };
    });
  }
  const uiEntries = getUiPreviewEntries(yamlData);
  return uiEntries.slice(0, 3).map(entry => ({
    badge: entry.label,
    title: `${entry.label} UI`,
    description: `${entry.name} (${entry.color}) を使った操作要素です。`,
    accent: entry.color
  }));
}

// Resolves a `[buttons:<name>]`/`[feedback:<name>]`-style group name argument:
// 1) a colorGroupsMeta named group (current schema comment-delimited group)
// 2) a bare colors key with the same name (so a hand-authored `part1: "#..."`
//    with no group comment still resolves to something)
// 3) otherwise: no match, render nothing (caller falls back to the UI spec).
function buildGroupButtonItems(yamlData, groupName, variant) {
  const colors = (yamlData && yamlData.colors) || {};
  const meta = getColorGroupMeta(groupName);
  let memberKeys = null;
  if (meta && meta.keys.length) {
    memberKeys = meta.keys;
  } else if (Object.prototype.hasOwnProperty.call(colors, groupName)) {
    memberKeys = [groupName];
  }
  if (!memberKeys) return [];
  const theme = getColorGroupTheme(groupName, colors) || colors[memberKeys[0]];
  const otherEntries = memberKeys
    .filter(k => k !== groupName && Object.prototype.hasOwnProperty.call(colors, k))
    .map(k => ({ name: k, color: colors[k] }));
  const items = [{ label: `${groupName} theme`, color: theme }].concat(otherEntries.slice(0, 3).map(entry => ({
    label: entry.name,
    color: entry.color
  })));
  return items.map(item => ({
    label: item.label,
    color: item.color,
    style: variant || 'strong'
  }));
}

function buildButtonPreviewItems(yamlData, sourceSpec) {
  const spec = String(sourceSpec || 'UI').trim();
  if (!spec || spec.toUpperCase() === 'UI') {
    return getUiPreviewEntries(yamlData).map(entry => ({
      label: entry.label,
      color: entry.color,
      style: 'strong'
    }));
  }
  const match = spec.match(/^(.+?)(?:-(strong|soft|outline))?$/i);
  const groupName = match ? match[1] : spec;
  const variant = match && match[2] ? match[2].toLowerCase() : 'strong';
  return buildGroupButtonItems(yamlData, groupName, variant);
}

function buildButtonPreviewHtml(items) {
  return `
    <div class="showcase-row">
      ${items.map(item => {
        const style = item.style || 'strong';
        const bg = style === 'outline' ? 'transparent' : item.color;
        const border = item.color;
        const text = style === 'outline' ? item.color : '#ffffff';
        const softBg = `color-mix(in srgb, ${item.color} 14%, var(--color-background, #ffffff))`;
        const finalBg = style === 'soft' ? softBg : bg;
        return `<button class="showcase-btn showcase-btn-token" style="--semantic-color:${escapeHtml(item.color)}; background:${escapeHtml(finalBg)}; color:${escapeHtml(text)}; border-color:${escapeHtml(border)};">${escapeHtml(item.label)}</button>`;
      }).join('')}
    </div>
  `;
}

function resolveComponentToken(yamlData, value) {
  const match=String(value||'').match(/^\{(.+)\}$/);if(!match)return value;
  let current=yamlData;for(const part of match[1].split('.'))current=current&&current[part];
  return current;
}

function parseSampleArgs(raw){return String(raw||'').split(':').map(value=>value.trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/,(_,double,single)=>double!==undefined?double:single));}
function parseTypographySampleSpec(raw){const match=String(raw||'').trim().match(/^(group|default)?(?::["']([\s\S]*)["'])?$/i);return {mode:(match&&match[1]?match[1].toLowerCase():'default'),text:(match&&match[2])||'デザインの一貫性で素敵なユーザー体験'};}
function buildUndefinedPreview(label){return `<p class="ts-caption sample-definition-missing">${escapeHtml(label)}：未定義</p>`;}
function sampleColor(yamlData,key,fallback){const colors=yamlData.colors||{},raw=String(key||'');if(colors[key]!==undefined)return colors[key];if(/^(?:#|rgba?\(|hsla?\(|var\(|color\()/i.test(raw))return raw;if(raw.startsWith('on-'))return '#ffffff';if(key==='body')return colors.ink||fallback;return fallback;}
function sampleTokenBoxBackground(yamlData,key){const value=sampleColor(yamlData,key,'');return !value||/^#fff(?:fff)?$/i.test(value)||/^rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)$/i.test(value)?'#dddddd':value;}
function getBaseComponent(yamlData,type){const found=getSampleComponents(yamlData,type)[0]?.[1];if(found)return found;const has=(section,key)=>yamlData[section]&&yamlData[section][key]!==undefined;const typography=getTypographyStyles(yamlData.typography||{});const common={border:has('border','none')?'{border.none}':undefined,rounded:has('rounded','md')?'{rounded.md}':undefined,shadow:yamlData.elevation?.shadows?.none!==undefined?'{elevation.shadows.none}':undefined};if(type==='button')return {...common,typography:typography['button-md']?'{typography.button-md}':undefined,padding:'10px 18px'};if(type==='card')return {...common,border:has('border','sm')?'{border.sm}':common.border,borderColor:(yamlData.colors||{}).hairline?'{colors.hairline}':undefined,rounded:has('rounded','lg')?'{rounded.lg}':common.rounded,padding:'20px'};if(type==='input')return {...common,border:has('border','sm')?'{border.sm}':common.border,borderColor:(yamlData.colors||{}).hairline?'{colors.hairline}':undefined,rounded:has('rounded','sm')?'{rounded.sm}':common.rounded,padding:'10px 12px'};return {...common,border:has('border','sm')?'{border.sm}':common.border,rounded:has('rounded','md')?'{rounded.md}':common.rounded,padding:'12px 16px'};}

function getSampleComponents(yamlData, sourceSpec) {
  const components=yamlData.components||{},arg=String(sourceSpec||'').trim().toLowerCase();
  if(!arg||arg==='all'||arg==='ui')return Object.entries(components);
  const matchedGroups=(state.componentGroupsMeta||[]).filter(group=>group.name&&String(group.name).toLowerCase().replace(/s$/,'')===arg.replace(/s$/,''));
  const groupKeys=new Set(matchedGroups.flatMap(group=>group.keys||[]));
  return Object.entries(components).filter(([key])=>{const normalized=key.toLowerCase();return groupKeys.has(key)||normalized===arg||normalized.startsWith(`${arg}-`)||normalized.split('-').includes(arg.replace(/s$/,''));});
}

function buildComponentSampleStyle(yamlData, def) {
  const type=resolveComponentToken(yamlData,def.typography)||{};
  const declarations={
    'background-color':resolveComponentToken(yamlData,def.backgroundColor),
    color:resolveComponentToken(yamlData,def.textColor) || (type.color ? ((yamlData.colors||{})[type.color] || type.color) : undefined),
    'font-family':type.font?`'${type.font}', ${guessGenericFallback(type)}`:undefined,
    'font-size':type.size!==undefined?`${type.size}px`:undefined,
    'font-weight':type.weight,
    'line-height':type.lineHeight,
    'letter-spacing':type.letterSpacing,
    'font-style':type.fontStyle,
    'text-transform':type.textTransform,
    'font-feature-settings':type.fontFeature,
    'text-decoration':type.textDecoration,
    'font-variation-settings':type.fontVariationSettings,
    border:resolveComponentToken(yamlData,def.border),
    'border-color':resolveComponentToken(yamlData,def.borderColor),
    'border-radius':def.rounded!==undefined?`${resolveComponentToken(yamlData,def.rounded)}px`:undefined,
    'box-shadow':resolveComponentToken(yamlData,def.shadow),
    padding:def.padding
  };
  return Object.entries(declarations).filter(([,value])=>value!==undefined&&value!==null&&value!=='').map(([prop,value])=>`${prop}:${value}`).join(';');
}

function buildComponentsPreviewHtml(yamlData, sourceSpec) {
  const entries=getSampleComponents(yamlData,sourceSpec);
  if(!entries.length)return buildUndefinedPreview('components');
  return `<div class="component-sample-grid">${entries.map(([key,def])=>{
    const style=escapeHtml(`${buildComponentSampleStyle(yamlData,def||{})};padding:${def.padding||'16px'}`);
    const meta=`${def.typography||'typography未設定'} / ${def.rounded||'rounded未設定'} / ${def.border||'border未設定'} / ${def.shadow||'shadow未設定'}`;
    if(/^button(?:-|$)/i.test(key))return `<div class="component-sample-item"><button class="component-sample-button" style="${style}">${escapeHtml(key)}</button><span>${escapeHtml(meta)}</span></div>`;
    if(/(?:input|field|form)/i.test(key))return `<div class="component-sample-item"><label class="ts-caption">${escapeHtml(key)}</label><input class="component-sample-input" style="${style}" placeholder="入力例"><span>${escapeHtml(meta)}</span></div>`;
    if(/(?:badge|tag|chip|status)/i.test(key))return `<div class="component-sample-item"><span class="component-sample-badge" style="${style}">${escapeHtml(key)}</span><span>${escapeHtml(meta)}</span></div>`;
    if(/(?:alert|feedback|message)/i.test(key))return `<div class="component-sample-item"><div class="component-sample-alert" style="${style}"><strong>${escapeHtml(key)}</strong><br><small>状態を伝えるメッセージのサンプルです。</small></div><span>${escapeHtml(meta)}</span></div>`;
    return `<div class="component-sample-item"><div class="component-sample-card" style="${style}"><strong>${escapeHtml(key)}</strong><p>背景、文字、余白、形状、奥行きを確認するサンプルです。</p></div><span>${escapeHtml(meta)}</span></div>`;
  }).join('')}</div>`;
}

function buildFeedbackPreviewHtml(yamlData, sourceSpec) {
  const spec = String(sourceSpec || 'UI').trim();
  const colors = (yamlData && yamlData.colors) || {};
  let entries;
  if (!spec || spec.toUpperCase() === 'UI') {
    entries = getUiPreviewEntries(yamlData);
  } else {
    const groupItems = buildGroupButtonItems(yamlData, spec, 'strong');
    entries = groupItems.map(item => ({
      key: item.label,
      label: item.label,
      icon: 'info',
      message: `${spec} の色の使われ方を確認します。`,
      color: item.color
    }));
  }
  return `<div class="feedback-preview-stack">${entries.map(entry => {
    const slug = slugifyKey(entry.key);
    const cssColor = Object.prototype.hasOwnProperty.call(colors, entry.key)
      ? `var(--color-${slug})`
      : entry.color;
    const tintKey = findTintTokenForColor(entry.key, colors);
    const bgEntry = tintKey ? { name: tintKey, color: colors[tintKey] } : null;
    const bgStyle = bgEntry ? bgEntry.color : 'var(--color-surface, var(--color-background))';
    const tintText = bgEntry
      ? `背景色は${bgEntry.name}:${bgEntry.color}を使用しています。`
      : '背景用tintトークンは未定義です。必要ならティント生成で追加してください。';
    return `
      <div class="showcase-alert alert-token" style="--semantic-color:${cssColor}; --semantic-bg:${bgStyle};">
        <i data-lucide="${escapeHtml(entry.icon || 'info')}" class="alert-icon"></i>
        <div class="alert-content">
          <h5 class="ts-h4">${escapeHtml(entry.label)}</h5>
          <p class="ts-small">${escapeHtml(entry.message || '')} ${escapeHtml(tintText)}</p>
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

function getSemanticEntries(yamlData){const colors=yamlData.colors||{};const group=(state.colorGroupsMeta||[]).find(item=>String(item.name||'').toLowerCase()==='semantic');const keys=group?(group.keys||[]).filter(key=>colors[key]!==undefined&&!/-\d+$/.test(key)&&!key.startsWith('on-')):[];return keys.map(key=>({key,color:colors[key],meta:getSemanticPreviewMeta(key)}));}

function resolveTypographyDefinition(yamlData,key){const styles=getTypographyStyles(yamlData.typography||{});return styles[key]||styles[`${key}-md`]||Object.entries(styles).find(([name])=>name.startsWith(`${key}-`))?.[1]||{};}
function resolveScaleToken(map,key,fallbackKey){if(map&&map[key]!==undefined)return map[key];if(map&&map[fallbackKey]!==undefined)return map[fallbackKey];const candidate=Object.keys(map||{}).find(name=>name!=='none');return candidate?map[candidate]:(map?.none??'none');}
function buildShortcodeVisualStyle(yamlData,{background,text,typography,border='md',rounded='md',shadow='md',borderColor}){const colors=yamlData.colors||{},type=resolveTypographyDefinition(yamlData,typography||'body'),borderValue=resolveScaleToken(yamlData.border||{},border,'md'),roundedValue=resolveScaleToken(yamlData.rounded||{},rounded,'md'),shadowValue=resolveScaleToken((yamlData.elevation||{}).shadows||{},shadow,'md'),bgValue=colors[background]||background||'transparent',textValue=sampleColor(yamlData,text,colors.ink||'#111'),borderColorValue=colors[borderColor]||(String(borderColor||'').startsWith('on-')?'#ffffff':borderColor)||colors.hairline||'currentColor';return [`background-color:${bgValue}`,`color:${textValue}`,type.font?`font-family:'${type.font}',${guessGenericFallback(type)}`:'',type.size!==undefined?`font-size:${type.size}px`:'',type.weight!==undefined?`font-weight:${type.weight}`:'',type.lineHeight!==undefined?`line-height:${type.lineHeight}`:'',`border:${borderValue}`,`border-color:${borderColorValue}`,`border-radius:${Number(roundedValue)||0}px`,`box-shadow:${shadowValue}`].filter(Boolean).join(';');}
function semanticOrFallbackEntries(yamlData){return getSemanticEntries(yamlData);}
function semanticTextColor(colors,entry,requested){if(requested==='semantic')return entry.color;if(requested==='body')return colors.ink||colors['ink-muted']||entry.color;if(requested){if(colors[requested]!==undefined)return colors[requested];if(/^(?:#|rgba?\(|hsla?\(|var\(|color\()/i.test(requested))return requested;if(requested.startsWith('on-'))return '#ffffff';return colors.ink||entry.color;}return colors[`on-${entry.key}`]||'#ffffff';}

function buildSemanticButtonsHtml(yamlData,spec){const [background='semantic',textKey='',border='md',rounded='md',shadow='md']=parseSampleArgs(spec);const colors=yamlData.colors||{},base=getBaseComponent(yamlData,'button'),literal=/^(?:#|rgba?\(|hsla?\(|var\(|color\()/i.test(background);const priority=['primary','secondary'].filter(key=>colors[key]!==undefined).map(key=>({key,color:colors[key],meta:getSemanticPreviewMeta(key)}));let requested;if(background==='semantic')requested=semanticOrFallbackEntries(yamlData);else{const grouped=getSampleColorGroupEntries(yamlData,background);requested=grouped.length?grouped:((colors[background]||literal)?[{key:background,color:colors[background]||background,meta:getSemanticPreviewMeta(background)}]:[]);}const entries=priority.concat(requested.filter(entry=>!priority.some(item=>item.key===entry.key)));if(!entries.length)return buildUndefinedPreview('buttons');return `<div class="semantic-button-grid">${entries.map(entry=>{const text=semanticTextColor(colors,entry,textKey);const shape=buildShortcodeVisualStyle(yamlData,{background:entry.key,text:text,typography:'button',border,rounded,shadow,borderColor:entry.key});return `<button style="${escapeHtml(buildComponentSampleStyle(yamlData,base))};${escapeHtml(shape)}">${escapeHtml(entry.key)}</button>`;}).join('')}</div>`;}

function buildFeedbackBySpec(yamlData,spec){const [background='semantic',heading='',body='',border='md',rounded='md',shadow='md']=parseSampleArgs(spec);const colors=yamlData.colors||{},entries=semanticOrFallbackEntries(yamlData);if(!entries.length)return buildUndefinedPreview('feedback');return `<div class="feedback-preview-stack">${entries.map(entry=>{const tint=findTintTokenForColor(entry.key,colors);const requestedBg=background==='semantic-tint'?(tint||'surface'):(background==='semantic'?entry.key:background);const bgValue=sampleTokenBoxBackground(yamlData,requestedBg);const headingColor=semanticTextColor(colors,entry,heading);const bodyColor=semanticTextColor(colors,entry,body||heading);const style=buildShortcodeVisualStyle(yamlData,{background:bgValue,text:headingColor,typography:'body',border,rounded,shadow,borderColor:entry.key});return `<div class="component-sample-alert" style="${escapeHtml(style)};padding:14px 16px"><strong style="color:${escapeHtml(headingColor)}">${escapeHtml(entry.key)}</strong><p style="color:${escapeHtml(bodyColor)}">${escapeHtml(entry.meta.message)}</p></div>`;}).join('')}</div>`;}

function getSampleColorGroupEntries(yamlData,groupName){const colors=yamlData.colors||{},name=String(groupName||'').trim().toLowerCase();if(name==='semantic')return semanticOrFallbackEntries(yamlData);if(!name||colors[name]!==undefined)return[];const group=(state.colorGroupsMeta||[]).find(item=>String(item.name||'').toLowerCase()===name);if(!group)return[];return (group.keys||[]).filter(key=>colors[key]!==undefined&&!key.startsWith('on-')&&!/(?:-\d+|-tint)$/i.test(key)).map(key=>({key,color:colors[key],meta:{message:`${key}を使ったカードの表示例です。`}}));}

function buildCardsBySpec(yamlData,spec){
  const [background='surface',heading='ink',body='',border='md',rounded='md',shadow='md']=parseSampleArgs(spec);
  const colors=yamlData.colors||{},base=getBaseComponent(yamlData,'card');
  if(!Object.keys(colors).length&&!Object.keys(yamlData.components||{}).length)return buildUndefinedPreview('cards');
  const requiresSemantic=[background,heading,body].some(value=>String(value||'').toLowerCase()==='semantic'||String(value||'').toLowerCase()==='semantic-tint');
  if(requiresSemantic&&!getSemanticEntries(yamlData).length)return buildUndefinedPreview('semantic');
  const tintGroup=background.match(/^(.+)-tint$/i)?.[1]||'';
  const backgroundEntries=getSampleColorGroupEntries(yamlData,tintGroup||background);
  const headingEntries=getSampleColorGroupEntries(yamlData,heading);
  const bodyEntries=getSampleColorGroupEntries(yamlData,body);
  const variants=backgroundEntries.length?backgroundEntries:(headingEntries.length?headingEntries:(bodyEntries.length?bodyEntries:[{key:'card',color:null,meta:{message:'背景、文字、余白、形状、奥行きを確認するカードです。'}}]));
  return `<div class="sample-card-grid">${variants.map((entry,index)=>{
    const headingEntry=headingEntries.find(item=>item.key===entry.key)||headingEntries[index]||null;
    const bodyEntry=bodyEntries.find(item=>item.key===entry.key)||bodyEntries[index]||null;
    const requestedBg=tintGroup?(findTintTokenForColor(entry.key,colors)||'surface'):(backgroundEntries.length?entry.key:background);
    const headingColor=headingEntry?headingEntry.color:sampleColor(yamlData,heading,colors.ink||'#111');
    const bodyColor=bodyEntry?bodyEntry.color:sampleColor(yamlData,body||heading,headingColor);
    const borderColor=colors.hairline?'hairline':(entry.key==='card'?heading:entry.key);
    const style=buildShortcodeVisualStyle(yamlData,{background:requestedBg,text:headingColor,typography:'body',border,rounded,shadow,borderColor});
    const title=entry.key==='card'?'カードタイトル':entry.key;
    const description=entry.meta?.message||`${entry.key}を使ったカードの表示例です。`;
    return `<article class="component-sample-card" style="${escapeHtml(buildComponentSampleStyle(yamlData,base))};${escapeHtml(style)};padding:0;overflow:hidden"><div class="card-body"><h4 style="color:${escapeHtml(headingColor)}">${escapeHtml(title)}</h4><p style="color:${escapeHtml(bodyColor)}">${escapeHtml(description)}</p><a href="#" style="color:${escapeHtml(headingColor)}">詳細を見る</a></div></article>`;
  }).join('')}</div>`;
}

function buildFormPreviewHtmlWithTokens(yamlData, spec, inputSpec='', buttonSpec='') {
  const data = yamlData || {};
  const colors = data.colors || {};
  const isLegacy=/[-,]/.test(String(spec||''));
  const [background='surface',text='ink',border='md',rounded='md',shadow='md']=isLegacy?[]:parseSampleArgs(spec);
  const panelStyle=buildShortcodeVisualStyle(data,{background,text,typography:'body',border,rounded,shadow,borderColor:colors.hairline?'hairline':text});
  const inputStyle=buildFormInputStyle(data,inputSpec||'surface:ink-muted:ink:md:md:md');
  const buttonStyle=buildFormButtonStyle(data,buttonSpec||'primary:on-primary:md:md:md');
  const effectiveSpec=isLegacy?String(spec):'text-名前,select-お問い合わせ種別,textarea-お問い合わせ内容,submit-送信する';
  const items = effectiveSpec.split(',').map(v => v.trim()).filter(Boolean);
  const fields = items.map(item => {
    const match = item.match(/^([^-\u30FC]+)[-\u30FC](.+)$/);
    if (!match) return null;
    const type = match[1].trim().toLowerCase();
    const label = match[2].trim();
    if (type === 'submit') {
      return `<button class="showcase-btn showcase-btn-primary" style="${escapeHtml(buttonStyle)}">${escapeHtml(label)}</button>`;
    }
    if (type === 'text') {
      return `<div class="input-preview-group"><label class="ts-small" style="color:inherit">${escapeHtml(label)}</label><input type="text" class="showcase-input" style="${escapeHtml(inputStyle)}" placeholder="${escapeHtml(label)}"></div>`;
    }
    if (type === 'select') {
      return `<div class="input-preview-group"><label class="ts-small" style="color:inherit">${escapeHtml(label)}</label><select class="showcase-select" style="${escapeHtml(inputStyle)}"><option>${escapeHtml(label)}</option></select></div>`;
    }
    if (type === 'textarea') {
      return `<div class="input-preview-group input-preview-group-full"><label class="ts-small" style="color:inherit">${escapeHtml(label)}</label><textarea class="showcase-input showcase-textarea" style="${escapeHtml(inputStyle)}" rows="3" placeholder="${escapeHtml(label)}"></textarea></div>`;
    }
    return null;
  }).filter(Boolean);
  const submit = fields.filter(html => html.startsWith('<button'));
  const controls = fields.filter(html => !html.startsWith('<button'));
  return `
    <div class="sample-form-panel" style="${escapeHtml(panelStyle)}">
      <div class="form-preview-grid">${controls.join('')}</div>
      ${submit.join('')}
    </div>
  `;
}

function buildFormInputStyle(yamlData,spec){const [background='surface',borderColor='hairline',text='ink',border='md',rounded='md',shadow='md']=parseSampleArgs(spec),colors=yamlData.colors||{},textColor=sampleColor(yamlData,text,colors.ink||'#111'),placeholderColor=colors['ink-muted']||colors['ink-mute']||textColor;return `${buildShortcodeVisualStyle(yamlData,{background,text:textColor,typography:'body',border,rounded,shadow,borderColor})};--sample-placeholder:${placeholderColor}`;}
function buildFormButtonStyle(yamlData,spec){const [background='primary',text='',border='md',rounded='md',shadow='md']=parseSampleArgs(spec),colors=yamlData.colors||{};const finalText=text?sampleColor(yamlData,text,'#ffffff'):(colors[`on-${background}`]||'#ffffff');return buildShortcodeVisualStyle(yamlData,{background,text:finalText,typography:'button',border,rounded,shadow,borderColor:background});}

function buildColorSwatchesHtml(colors, bg, options = {}) {
  const keys = (options.keys && options.keys.length ? options.keys : Object.keys(colors || {})).filter(key => Object.prototype.hasOwnProperty.call(colors || {}, key));
  if (!keys.length) {
    return '<p class="ts-caption color-groups-empty">表示できる色がありません。</p>';
  }
  return `<div class="color-swatches-grid">${keys.map(key => {
    const value = colors[key];
    const isBackgroundItself = isCanvasOrSurfaceKey(key);
    const evaluation = getContrastEvaluation(key, value, colors, [{ key: 'canvas', value: bg }]);
    const onBgHex = compositeOverBackground(value, evaluation.background);
    const ratio = evaluation.ratio;
    const rating = classifyContrast(ratio);
    const suppressBadge = isBackgroundItself || isSuppressedContrastKey(key);
    return `
      <div class="swatch-card">
        <div class="swatch-color" style="background-color:${escapeHtml(onBgHex)}; ${isBackgroundItself ? 'border-bottom: 1px solid rgba(127,127,127,0.2);' : ''}"></div>
        <div class="swatch-info">
          <span class="swatch-name">${escapeHtml(key)}</span>
          <span class="swatch-value">${escapeHtml(value)}</span>
          ${suppressBadge ? '' : `
            <div class="swatch-contrast-row">
              <span class="swatch-contrast-ratio">${ratio.toFixed(2)}:1</span>
              <span class="wcag-badge ${rating.cls}">${rating.label}</span>
            </div>
          `}
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

function buildSampleColorsHtml(yamlData, themeName) {
  const normalizedTheme = String(themeName || '').trim().toLowerCase();
  const colors = normalizedTheme && normalizedTheme !== 'default'
    ? getMergedThemeColors(yamlData, themeName)
    : (yamlData.colors || {});
  if (!Object.keys(colors).length) return buildUndefinedPreview('colors');
  const bg = baseColor(colors, 'canvas', '#ffffff');
  return buildColorSwatchesHtml(colors, bg);
}

// `[groupcolors]` / `[groupcolors:<name>]` (current schema): iterates the
// colorGroupsMeta named groups (comment-delimited groups inside `colors:`),
// showing each group's member colors. No named groups defined at all -> show
// every color as a single flat swatch grid (never renders nothing/broken).
function buildSampleGroupColorsHtml(yamlData, groupArg) {
  const colors = yamlData.colors || {};
  if (!Object.keys(colors).length) return buildUndefinedPreview('colors');
  const bg = baseColor(colors, 'canvas', '#ffffff');
  const namedGroups = (state.colorGroupsMeta || []).filter(g => g.name !== null && g.keys.length);
  if (!namedGroups.length) {
    return buildColorSwatchesHtml(colors, bg);
  }
  const arg = String(groupArg || '').trim();
  if (!arg) {
    return namedGroups.map(g => `
      <section class="sample-groupcolors-block">
        <h3>${escapeHtml(g.name)}</h3>
        ${buildColorSwatchesHtml(colors, bg, { keys: g.keys })}
      </section>
    `).join('');
  }
  const match = namedGroups.find(g => g.name === arg);
  if (!match) {
    return `<p class="ts-caption color-groups-empty">グループ「${escapeHtml(arg)}」は未定義です。</p>`;
  }
  return buildColorSwatchesHtml(colors, bg, { keys: match.keys });
}

function buildSampleColorGroupsHtml(yamlData){const colors=yamlData.colors||{};if(!Object.keys(colors).length)return buildUndefinedPreview('colors');const bg=baseColor(colors,'canvas','#ffffff');const meta=reconcileColorGroupsMeta(state.colorGroupsMeta||[],colors);return meta.filter(group=>group.keys.length).map(group=>`<section class="sample-groupcolors-block"><h3>${escapeHtml(group.name===null?'未分類':group.name)}</h3>${buildColorSwatchesHtml(colors,bg,{keys:group.keys})}</section>`).join('');}

function resolveContrastColorDefs(yamlData,spec){const colors=yamlData.colors||{},arg=String(spec||'').trim();if(!arg)return[];const group=(state.colorGroupsMeta||[]).find(item=>String(item.name||'').toLowerCase()===arg.toLowerCase());if(group)return (group.keys||[]).filter(key=>colors[key]!==undefined).map(key=>({label:key,value:colors[key]}));if(colors[arg]!==undefined)return [{label:arg,value:colors[arg]}];if(/^(?:#|rgba?\(|hsla?\(|var\(|color\()/i.test(arg))return [{label:arg,value:arg}];return[];}

function buildContrastMatrixHtml(yamlData,spec='') {
  const colors = yamlData.colors || {};
  const bg = baseColor(colors, 'canvas', '#ffffff');
  const [backgroundSpec,foregroundSpec]=parseSampleArgs(spec);
  const specifiedBackgrounds=resolveContrastColorDefs(yamlData,backgroundSpec),specifiedForegrounds=resolveContrastColorDefs(yamlData,foregroundSpec);
  const backgroundDefs = specifiedBackgrounds.length?specifiedBackgrounds:[];
  if(!backgroundDefs.length){if(bg)backgroundDefs.push({label:'canvas',value:bg});if(colors.surface&&colors.surface!==bg)backgroundDefs.push({label:'surface',value:colors.surface});Object.keys(colors).forEach(key=>{if(key==='canvas'||key==='background'||key==='surface'||!isSuppressedContrastKey(key))return;backgroundDefs.push({label:key,value:colors[key]});});}
  // Note: previously-separate colorGroups theme/palette entries are now
  // ordinary `colors` keys (current schema flattening), so the loops above/
  // below over `colors` already cover them — nothing group-specific to add.
  const foregroundDefs = specifiedForegrounds.length?specifiedForegrounds:Object.keys(colors)
    .filter(key => !['canvas', 'background', 'surface'].includes(key) && !isSuppressedContrastKey(key))
    .map(key => typeof key==='string'?({label:key,value:colors[key],suppress:false}):key);
  const uniqueBackgrounds = backgroundDefs.filter((entry, index, arr) => arr.findIndex(item => item.label === entry.label) === index);
  if (!foregroundDefs.length || !uniqueBackgrounds.length) {
    return '<p class="ts-caption color-groups-empty">比較できる配色が不足しています。</p>';
  }
  return `<div class="contrast-matrix-grid">${foregroundDefs.flatMap(fgDef => {
    return uniqueBackgrounds.map(bgDef => {
      const ratio = getContrastRatio(fgDef.value, bgDef.value);
      const rating = classifyContrast(ratio);
      const displayColor = compositeOverBackground(fgDef.value, bgDef.value);
      const suppressBadge = isSuppressedContrastKey(fgDef.label) || isSuppressedContrastKey(bgDef.label);
      return `
        <div class="matrix-cell">
          <div class="matrix-cell-sample" style="color:${escapeHtml(displayColor)}; background-color:${escapeHtml(bgDef.value)};">Abc 文字サンプル</div>
          <div class="matrix-cell-meta">
            <span class="matrix-cell-labels">${escapeHtml(fgDef.label)} / ${escapeHtml(bgDef.label)}</span>
            <div style="display:flex; align-items:center; gap:6px;">
              <span class="matrix-cell-ratio">${ratio.toFixed(2)}:1</span>
              ${suppressBadge ? '' : `<span class="wcag-badge ${rating.cls}">${rating.label}</span>`}
            </div>
          </div>
        </div>
      `;
    });
  }).join('')}</div>`;
}

// Maps PREVIEW.md definition keys to the current DESIGN.md section headings.
function resolveDefinitionHeading(definitionKey) {
  const map = {
    'concept': ['__concept__'],
    'overview': ['Overview'],
    'colors': ['Colors'],
    'typography': ['Typography'],
    'layout': ['Layout'],
    'elevation': ['Elevation & Depth'],
    'shapes': ['Shapes'],
    'components': ['Components'],
    'dos-and-donts': ["Do's and Don'ts"],
    'responsive': ['Responsive Behavior'],
    'iteration': ['Iteration Guide'],
    'known-gaps': ['Known Gaps']
  };
  return map[String(definitionKey || '').trim()] || [String(definitionKey || '').trim()];
}

function extractConceptBody(markdown) {
  const lines = String(markdown || '').split('\n');
  const body = [];
  let started = false;
  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch) {
      const text = headingMatch[2].trim();
      if (/^colors\b/i.test(text)) break;
      started = true;
    }
    if (started) body.push(line);
  }
  return body.join('\n').trim();
}

function extractMarkdownSectionBody(markdown, headingText) {
  const lines = String(markdown || '').split('\n');
  const target = String(headingText || '').trim();
  if (!target) return '';
  let collecting = false;
  let targetLevel = 0;
  const body = [];
  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      if (!collecting && text === target) {
        collecting = true;
        targetLevel = level;
        continue;
      }
      if (collecting && level <= targetLevel) {
        break;
      }
    }
    if (collecting) body.push(line);
  }
  return body.join('\n').trim();
}

function buildDefinitionHtml(definitionKey) {
  if (typeof marked === 'undefined') return '';
  const headings = resolveDefinitionHeading(definitionKey);
  let body = '';
  if (headings[0] === '__concept__') {
    body = extractConceptBody(state.markdownBody || '');
  } else {
    for (const heading of headings) {
      body = extractMarkdownSectionBody(state.markdownBody || '', heading);
      if (body) break;
    }
  }
  if (!body) return `<p class="ts-caption sample-definition-missing">DESIGN.mdに「${escapeHtml(String(definitionKey||''))}」の章が定義されていません。</p>`;
  return `<div class="sample-definition-block" data-definition-key="${escapeHtml(String(definitionKey || ''))}">${marked.parse(body)}</div>`;
}

function preprocessSampleShortcodes(markdown) {
  return String(markdown || '').replace(/^\[(components|typography|markdown|border|rounded|spacing|buttons|feedback|cards|card|form-input|form-button|form|shadow|round|sample-text|colors|groupcolors|contrast|definition)(?::([^\]]+))?\]$/gmi, (_, rawKind, arg = '') => {
    const kind=rawKind.toLowerCase();
    const safeArg = escapeHtml(arg.trim());
    if (kind === 'components') return `<div data-sample-components="${safeArg}"></div>`;
    if (kind === 'typography') return `<div class="typography-preview-block" data-sample-typography-mode="${safeArg || 'default'}"></div>`;
    if (kind === 'markdown') return `<div data-sample-markdown-map="${safeArg}"></div>`;
    if (kind === 'border') return `<div data-sample-border="${safeArg}"></div>`;
    if (kind === 'rounded') return `<div class="radius-showcase-strip" data-sample-radius="${safeArg}"></div>`;
    if (kind === 'spacing') return `<div data-sample-spacing></div>`;
    if (kind === 'buttons') return `<div data-sample-buttons="${safeArg}"></div>`;
    if (kind === 'feedback') return `<div data-sample-feedback="${safeArg}"></div>`;
    if (kind === 'cards') return `<div data-sample-cards-token="${safeArg}"></div>`;
    if (kind === 'card') return `<div data-sample-cards="${safeArg}"></div>`;
    if (kind === 'form') return `<div data-sample-form="${safeArg}"></div>`;
    if (kind === 'form-input') return `<div data-sample-form-input="${safeArg}"></div>`;
    if (kind === 'form-button') return `<div data-sample-form-button="${safeArg}"></div>`;
    if (kind === 'shadow') return `<div class="shadow-showcase-strip" data-sample-shadow="${safeArg}"></div>`;
    if (kind === 'round') return `<div class="radius-showcase-strip" data-sample-radius="${safeArg}"></div>`;
    if (kind === 'sample-text') return `<div class="typography-preview-block" data-sample-typography="${safeArg}"></div>`;
    if (kind === 'colors') return `<div data-sample-colors="${safeArg || 'default'}"></div>`;
    if (kind === 'groupcolors') return `<div data-sample-groupcolors="${safeArg}"></div>`;
    if (kind === 'contrast') return `<div data-sample-contrast="${safeArg}"></div>`;
    if (kind === 'definition') return `<div data-sample-definition="${safeArg}"></div>`;
    return _;
  });
}

function renderSampleShortcodeBlocks(container, yamlData) {
  if (!container) return;
  const safeEach = (selector, render) => {
    container.querySelectorAll(selector).forEach(el => {
      try {
        render(el);
      } catch (err) {
        console.error(`PREVIEW.md block render failed: ${selector}`, err);
        el.innerHTML = `<p class="ts-caption sample-definition-missing">${escapeHtml(selector)} の表示に失敗しました。</p>`;
      }
    });
  };
  safeEach('[data-sample-components]', el => {
    el.innerHTML=buildComponentsPreviewHtml(yamlData,el.getAttribute('data-sample-components'));
  });
  safeEach('[data-sample-typography-mode]', el => {
    const spec=parseTypographySampleSpec(el.getAttribute('data-sample-typography-mode'));renderTypographyShowcase(yamlData,el,spec.text,spec.mode);
  });
  safeEach('[data-sample-markdown-map]', el => {
    el.innerHTML=buildMarkdownAssignmentPreviewHtml(yamlData,parseTypographySampleSpec(`default:${el.getAttribute('data-sample-markdown-map')||''}`).text);
  });
  safeEach('[data-sample-border]', el => {
    renderBorderPreview(yamlData,el,el.getAttribute('data-sample-border'));
  });
  safeEach('[data-sample-spacing]', el => {
    renderSpacingPreview(yamlData,el);
  });
  safeEach('[data-sample-buttons]', el => {
    const spec=el.getAttribute('data-sample-buttons');
    el.innerHTML=spec
      ? buildSemanticButtonsHtml(yamlData,spec)
      : (getSampleComponents(yamlData,'button').length?buildComponentsPreviewHtml(yamlData,'button'):buildButtonPreviewHtml(buildButtonPreviewItems(yamlData,spec)));
  });
  safeEach('[data-sample-feedback]', el => {
    const spec=el.getAttribute('data-sample-feedback');el.innerHTML=spec&&spec.includes(':')?buildFeedbackBySpec(yamlData,spec):buildFeedbackPreviewHtml(yamlData,spec);
  });
  safeEach('[data-sample-cards-token]', el=>{el.innerHTML=buildCardsBySpec(yamlData,el.getAttribute('data-sample-cards-token'));});
  safeEach('[data-sample-cards]', el => {
    const actual=getSampleComponents(yamlData,'card');if(actual.length){el.innerHTML=buildComponentsPreviewHtml(yamlData,'card');return;}
    const cards = buildPreviewCardItems(yamlData);
    el.innerHTML = `<div class="sample-card-grid">${cards.map(card => `
      <div class="showcase-card showcase-card-shadow" style="--card-accent:${escapeHtml(card.accent)};">
        <div class="card-image-placeholder">
          <i data-lucide="layers-3" class="placeholder-icon"></i>
        </div>
        <div class="card-body">
          <span class="card-badge">${escapeHtml(card.badge)}</span>
          <h4 class="ts-h4">${escapeHtml(card.title)}</h4>
          <p class="ts-small">${escapeHtml(card.description)}</p>
        </div>
      </div>
    `).join('')}</div>`;
  });
  safeEach('[data-sample-form]', el => {
    const inputSpec=container.querySelector('[data-sample-form-input]')?.getAttribute('data-sample-form-input')||'';const buttonSpec=container.querySelector('[data-sample-form-button]')?.getAttribute('data-sample-form-button')||'';el.innerHTML = buildFormPreviewHtmlWithTokens(yamlData, el.getAttribute('data-sample-form'),inputSpec,buttonSpec);
  });
  safeEach('[data-sample-form-input],[data-sample-form-button]', el=>{el.innerHTML='';el.hidden=true;});
  safeEach('[data-sample-shadow]', el => {
    renderShadowShowcaseStrip(yamlData, el,el.getAttribute('data-sample-shadow'));
  });
  safeEach('[data-sample-radius]', el => {
    renderRadiusShowcaseStrip(yamlData, el,el.getAttribute('data-sample-radius'));
  });
  safeEach('[data-sample-typography]', el => {
    renderTypographyShowcase(yamlData, el, el.getAttribute('data-sample-typography') || '');
  });
  safeEach('[data-sample-colors]', el => {
    const mode=el.getAttribute('data-sample-colors')||'default';el.innerHTML=mode==='group'?buildSampleColorGroupsHtml(yamlData):buildSampleColorsHtml(yamlData,mode);
  });
  safeEach('[data-sample-groupcolors]', el => {
    el.innerHTML = buildSampleGroupColorsHtml(yamlData, el.getAttribute('data-sample-groupcolors') || '');
  });
  safeEach('[data-sample-contrast]', el => {
    el.innerHTML = buildContrastMatrixHtml(yamlData,el.getAttribute('data-sample-contrast'));
  });
  safeEach('[data-sample-definition]', el => {
    el.innerHTML = buildDefinitionHtml(el.getAttribute('data-sample-definition') || '');
  });
  if (window.lucide) lucide.createIcons();
}

function renderTokenDrivenParts(yamlData) {
  const colors = yamlData.colors || {};
  const uiEntries = getUiPreviewEntries(yamlData);
  const buttonContainer = document.querySelector('[data-token-buttons]');
  if (buttonContainer) {
    buttonContainer.innerHTML = uiEntries.map(entry => {
      const cssColor = Object.prototype.hasOwnProperty.call(colors, entry.key)
        ? `var(--color-${slugifyKey(entry.key)})`
        : entry.color;
      return `<button class="showcase-btn showcase-btn-token" style="--semantic-color:${cssColor}; border-color:${cssColor};">${escapeHtml(entry.label)}</button>`;
    }).join('');
  }

  const alertsContainer = document.querySelector('[data-token-alerts]');
  if (alertsContainer) {
    alertsContainer.innerHTML = uiEntries.map(entry => {
      const slug = slugifyKey(entry.key);
      const cssColor = Object.prototype.hasOwnProperty.call(colors, entry.key)
        ? `var(--color-${slug})`
        : entry.color;
      const tintKey = findTintTokenForColor(entry.key, colors);
      const tintSlug = tintKey ? slugifyKey(tintKey) : null;
      const bgStyle = tintSlug ? `var(--color-${tintSlug})` : 'var(--color-surface, var(--color-background))';
      const tintText = tintKey
        ? `背景は明示的なtintトークン「${tintKey}」です。`
        : '背景用tintトークンは未定義です。必要ならティント生成で追加してください。';
      return `
        <div class="showcase-alert alert-token" style="--semantic-color: ${cssColor}; --semantic-bg: ${bgStyle};">
          <i data-lucide="${entry.icon}" class="alert-icon"></i>
          <div class="alert-content">
            <h5 class="ts-h4">${escapeHtml(entry.label)}</h5>
            <p class="ts-small">${escapeHtml(entry.message)} ${escapeHtml(tintText)}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  const cardsContainer = document.querySelector('[data-token-cards]');
  if (cardsContainer) {
    const cards = buildPreviewCardItems(yamlData);
    cardsContainer.innerHTML = cards.map(card => `
      <div class="showcase-card showcase-card-shadow" style="--card-accent:${escapeHtml(card.accent)};">
        <div class="card-image-placeholder">
          <i data-lucide="layers-3" class="placeholder-icon"></i>
        </div>
        <div class="card-body">
          <span class="card-badge">${escapeHtml(card.badge)}</span>
          <h4 class="ts-h4">${escapeHtml(card.title)}</h4>
          <p class="ts-small">${escapeHtml(card.description)}</p>
        </div>
      </div>
    `).join('');
  }
  if (window.lucide) lucide.createIcons();
}

// ---- Article-style sample rendering ----
function renderArticleSample(yamlData) {
  const container = document.getElementById('article-sample-content');
  if (!container) return;
  if (typeof marked === 'undefined') return;

  const colors = yamlData.colors || {};
  if (state.previewHelpMode) {
    container.classList.add('preview-help-view');
    container.innerHTML = marked.parse(state.previewHelpMarkdown || '# preview.help\n\nヘルプを読み込んでいます…');
    return;
  }
  container.classList.remove('preview-help-view');
  const md = state.previewMarkdown || defaultPreviewMarkdownCache || MINIMAL_DEFAULT_PREVIEW_MARKDOWN;
  syncOtherWebFonts(getTypographyStyles(yamlData.typography || {}));

  let html;
  try {
    html = marked.parse(preprocessSampleShortcodes(md));
  } catch (err) {
    console.error('プレビューのレンダリングエラー:', err);
    html = '<p>プレビューのレンダリングに失敗しました。</p>';
  }
  container.innerHTML = html;
  renderSampleShortcodeBlocks(container, yamlData);
  if (window.lucide) lucide.createIcons();
}

async function togglePreviewHelp() {
  const button = document.getElementById('btn-toggle-preview-help');
  state.previewHelpMode = !state.previewHelpMode;
  if (state.previewHelpMode && !state.previewHelpMarkdown) {
    try {
      const response = await fetch('docs/PREVIEW-MANUAL.md', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.previewHelpMarkdown = await response.text();
    } catch (err) {
      state.previewHelpMarkdown = '# preview.help\n\nヘルプを読み込めませんでした。';
    }
  }
  if (button) {
    button.classList.toggle('active', state.previewHelpMode);
    button.setAttribute('title', state.previewHelpMode ? 'PREVIEW.mdのプレビューに戻る' : 'PREVIEW.mdの記法ヘルプを表示');
    const label = button.querySelector('span');
    if (label) label.textContent = state.previewHelpMode ? 'プレビュー' : 'preview.help';
  }
  renderArticleSample(state.parsedYaml);
  if (window.lucide) lucide.createIcons();
}

// Debounced localStorage persistence for PREVIEW.md.
function schedulePreviewSave() {
  if (previewSaveDebounceTimer) clearTimeout(previewSaveDebounceTimer);
  previewSaveDebounceTimer = setTimeout(() => {
    try {
      localStorage.setItem(PREVIEW_STORAGE_KEY, state.previewMarkdown);
    } catch (err) {
      // localStorage may be unavailable (private mode / quota); fail silently.
    }
  }, 500);
}

function renderShadowShowcaseStrip(yamlData, containerEl, spec='') {
  const container = containerEl || document.getElementById('shadow-showcase-strip');
  if (!container) return;
  const shadows = (yamlData.elevation || {}).shadows || {};
  if (!Object.keys(shadows).length) { container.innerHTML=buildUndefinedPreview('shadow'); return; }
  const [background='surface',foreground='ink']=parseSampleArgs(spec),bg=sampleTokenBoxBackground(yamlData,background),fg=sampleColor(yamlData,foreground,'#111');

  container.innerHTML = Object.keys(shadows).map(key => {
    const val = shadows[key];
    const boxShadow = val === 'none' ? 'none' : val;
    return `
      <div class="shadow-chip">
        <div class="shadow-chip-box token-visual-box" style="box-shadow:${escapeHtml(boxShadow)};background-color:${escapeHtml(bg)};color:${escapeHtml(fg)};">${escapeHtml(key)}</div>
        <span class="shadow-chip-label">${escapeHtml(key)}</span>
      </div>
    `;
  }).join('');
}

function renderRadiusShowcaseStrip(yamlData, containerEl, spec='') {
  const container = containerEl || document.getElementById('radius-showcase-strip');
  if (!container) return;
  const radius = yamlData.rounded || ((yamlData.borders || {}).radius) || {};
  const [background='surface',foreground='ink']=parseSampleArgs(spec),bg=sampleTokenBoxBackground(yamlData,background),fg=sampleColor(yamlData,foreground,'#111');
  const order = ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'full'];
  const keys = order.filter(k => radius[k] !== undefined).concat(Object.keys(radius).filter(k => !order.includes(k)));
  if (!keys.length) { container.innerHTML=buildUndefinedPreview('rounded'); return; }

  container.innerHTML = keys.map(key => {
    const px = radius[key];
    const borderRadiusCss = key === 'full' ? '999px' : `${px}px`;
    return `
      <div class="radius-chip">
        <div class="radius-chip-box token-visual-box" style="border-radius:${escapeHtml(String(borderRadiusCss))};background-color:${escapeHtml(bg)};color:${escapeHtml(fg)};">${escapeHtml(key)}</div>
        <span class="radius-chip-label">${escapeHtml(key)} / ${escapeHtml(String(px))}px</span>
      </div>
    `;
  }).join('');
}

function renderBorderPreview(yamlData,containerEl,spec=''){const borders=yamlData.border||{},colors=yamlData.colors||{},order=['none','sm','md','lg','xl'],keys=order.filter(k=>borders[k]!==undefined).concat(Object.keys(borders).filter(k=>!order.includes(k)));if(!keys.length){containerEl.innerHTML=buildUndefinedPreview('border');return;}const [background='surface',foreground='ink']=parseSampleArgs(spec),bg=sampleTokenBoxBackground(yamlData,background),fg=sampleColor(yamlData,foreground,'#111'),lineColor=colors.hairline||colors.ink||colors['ink-muted']||colors['ink-mute']||'#666666';containerEl.innerHTML=`<div class="border-token-grid">${keys.map(key=>`<div class="border-token-item"><div class="token-visual-box" style="border:${escapeHtml(String(borders[key]))};border-color:${escapeHtml(lineColor)};background-color:${escapeHtml(bg)};color:${escapeHtml(fg)}">${escapeHtml(key)}</div><span>${escapeHtml(key)} / ${escapeHtml(String(borders[key]))}</span></div>`).join('')}</div>`;}

function buildMarkdownAssignmentPreviewHtml(yamlData,previewText='デザインの一貫性で素敵なユーザー体験') {
  const typography=yamlData.typography||{},styles=getTypographyStyles(typography);
  const assignments=typography.markdown||{};
  if(!Object.keys(assignments).length)return buildUndefinedPreview('markdown');
  const background=sampleTokenBoxBackground(yamlData,'surface');
  return `<div class="markdown-assignment-preview">${MARKDOWN_SLOTS.map(slot=>{const key=assignments[slot]||'',slug=slugifyKey(key);return `<div class="markdown-assignment-item" style="background-color:${escapeHtml(background)}"><div class="markdown-assignment-meta">${escapeHtml(slot)} → ${escapeHtml(key||'未設定')}</div><div class="markdown-assignment-sample" style="font-family:var(--ts-${slug}-font,var(--font-body));font-size:var(--ts-${slug}-size);font-weight:var(--ts-${slug}-weight);line-height:var(--ts-${slug}-line-height);letter-spacing:var(--ts-${slug}-letter-spacing,normal);color:var(--ts-${slug}-color)">${escapeHtml(previewText)}</div></div>`;}).join('')}</div>`;
}

function renderSpacingPreview(yamlData,containerEl){const spacing=yamlData.spacing||{},entries=Object.entries(spacing).filter(([key])=>key!=='none'),color=(yamlData.colors||{}).primary||'#2563eb';if(!entries.length){containerEl.innerHTML=buildUndefinedPreview('spacing');return;}containerEl.innerHTML=`<div class="spacing-preview-list">${entries.map(([key,value])=>`<div><code>${escapeHtml(key)}</code><span class="spacing-preview-boxes" style="gap:${Math.max(0,Number(value)||0)}px">${'<i></i>'.repeat(4)}</span><strong>${escapeHtml(String(value))}px</strong></div>`).join('')}</div>`;containerEl.style.setProperty('--spacing-preview-color',color);}

function isFontFamilyAvailable(fontFamily) {
  const primaryFamily = String(fontFamily || '').split(',')[0].replace(/^['"]|['"]$/g, '').trim();
  if (!primaryFamily) return true;
  const alwaysAvailable = new Set(['system-ui', '-apple-system', 'blinkmacsystemfont', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy']);
  if (alwaysAvailable.has(primaryFamily.toLowerCase())) return true;

  const canvas = isFontFamilyAvailable.canvas || (isFontFamilyAvailable.canvas = document.createElement('canvas'));
  const context = canvas.getContext('2d');
  if (!context) return true;
  const sample = 'mmmmmmmmmmlliWW0123456789';
  return ['monospace', 'serif', 'sans-serif'].some(fallback => {
    context.font = `72px ${fallback}`;
    const fallbackWidth = context.measureText(sample).width;
    context.font = `72px "${primaryFamily.replace(/"/g, '\\"')}", ${fallback}`;
    return Math.abs(context.measureText(sample).width - fallbackWidth) > 0.1;
  });
}

function refreshTypographyFontWarning(container, styles) {
  const warning = container.querySelector('[data-typography-font-warning]');
  if (!warning) return;
  const families = Array.from(new Set(Object.values(styles).map(style => style && (style.fontFamily || style.font)).filter(Boolean)));
  const unavailable = families.filter(family => !isFontFamilyAvailable(family));
  warning.classList.toggle('hidden', unavailable.length === 0);
  warning.textContent = unavailable.length
    ? `指定フォントは読み込まれていません。（${unavailable.join('、')}）`
    : '';
}

function renderTypographyShowcase(yamlData, containerEl, previewText, mode='default') {
  const container = containerEl || document.getElementById('typography-showcase-list');
  if (!container) return;
  const styles = getTypographyStyles(yamlData.typography || {});
  if (!Object.keys(styles).length) { container.innerHTML=buildUndefinedPreview('typography'); return; }
  // Walk the 8 markdown slots in their canonical order (resolved to whichever
  // style key typography.markdown assigns), then append any remaining custom
  // styles that aren't covered by a slot. `strong` is skipped (inline-only).
  const slotAssignments = getMarkdownSlotAssignments(yamlData);
  const slotOrder = ['h1', 'h2', 'h3', 'h4', 'body', 'small', 'caption'];
  const seen = new Set();
  const rows = [];
  slotOrder.forEach(slot => {
    const styleKey = slotAssignments[slot];
    if (!styles[styleKey] || seen.has(styleKey)) return;
    seen.add(styleKey);
    rows.push({ tag: ['h1', 'h2', 'h3', 'h4'].includes(slot) ? slot : 'p', key: styleKey });
  });
  Object.keys(styles).forEach(key => {
    if (key === 'strong' || key === slotAssignments.strong || seen.has(key)) return;
    seen.add(key);
    rows.push({ tag: 'p', key });
  });
  const displayText = previewText || 'デザインの一貫性を伝える見本文';

  const renderRows = selectedRows => selectedRows.map(({ tag, key }) => {
    const st = styles[key];
    const fontFamily = st.fontFamily || st.font || '-';
    const fontSize = Number.parseFloat(st.size !== undefined ? st.size : st.fontSize);
    const fontWeight = st.weight !== undefined ? st.weight : st.fontWeight;
    const letterSpacing = st.letterSpacing || '-';
    return `
      <div class="type-showcase-row">
        <${tag} class="type-showcase-sample" style="font-family:${escapeHtml(fontFamily)};font-size:${Number.isFinite(fontSize)?fontSize:16}px;font-weight:${escapeHtml(String(fontWeight!==undefined?fontWeight:400))};line-height:${escapeHtml(String(st.lineHeight!==undefined?st.lineHeight:'normal'))};letter-spacing:${escapeHtml(String(st.letterSpacing!==undefined?st.letterSpacing:'normal'))};color:var(--ts-${slugifyKey(key)}-color);">${escapeHtml(displayText)}</${tag}>
        <span class="type-showcase-meta">${escapeHtml(key)} / ${escapeHtml(fontFamily)} / ${Number.isFinite(fontSize)?fontSize:'-'}px / ${fontWeight!==undefined?escapeHtml(String(fontWeight)):'-'} / line-height ${st.lineHeight || '-'} / letter-spacing ${escapeHtml(letterSpacing)}</span>
      </div>
    `;
  }).join('');
  const warningHtml='<p class="ts-caption sample-definition-missing hidden" data-typography-font-warning></p>';
  if(mode==='group'){
    const meta=reconcileTypographyGroupsMeta(state.typographyGroupsMeta||[],styles);
    container.innerHTML=warningHtml+meta.filter(group=>group.keys.length).map(group=>`<section class="typography-sample-group"><h4>${escapeHtml(group.name===null?'未分類':group.name)}</h4>${renderRows(group.keys.filter(key=>styles[key]).map(key=>({tag:'p',key})))}</section>`).join('');
  }else container.innerHTML=warningHtml+renderRows(rows);
  refreshTypographyFontWarning(container,styles);
  if(document.fonts&&document.fonts.status==='loading')document.fonts.ready.then(()=>{if(container.isConnected)refreshTypographyFontWarning(container,styles);});
}

// ============================================================================
// 13a. Style Guide HTML export (self-contained single-file HTML)
// ============================================================================
// Builds a single self-contained HTML document (inline CSS, Google Fonts via
// <link>) documenting the current DESIGN.md tokens: metadata, colors (+ WCAG
// contrast vs. background), color groups (current schema comment-delimited
// groups), typography styles, shadows, radius, spacing, and the rendered
// spec markdown body.
// Pure function of (yamlData, markdownBody) — no DOM reads — so it can be
// unit-exercised standalone (see D2 verification).
function exportCssValue(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function exportDimension(value, unit='px') {
  if (value === 'none') return '0px';
  return typeof value === 'number' || /^-?[\d.]+$/.test(String(value)) ? `${value}${unit}` : exportCssValue(value);
}

function getExportModeNames() {
  return getFlatModeNames();
}

// Export every color-dependent alias together so a standalone preview never
// inherits the editor's currently selected theme from #dynamic-tokens-style.
// The preview stylesheet still contains legacy/markdown slot consumers, so
// base and mode blocks must both override those variables explicitly.
function buildExportThemeVariableLines(yamlData, colors, styles) {
  const lines = [];
  Object.keys(colors).forEach(key => lines.push(`  --color-${slugifyKey(key)}: ${colors[key]};`));

  const legacyAliases = {
    text: 'ink',
    background: 'canvas',
    border: 'hairline',
    'text-muted': 'ink-muted',
    danger: 'error'
  };
  Object.entries(legacyAliases).forEach(([legacyKey, currentKey]) => {
    const value = baseColor(colors, currentKey, '');
    if (value !== '') lines.push(`  --color-${legacyKey}: ${value};`);
  });

  const fallbackInk = baseColor(colors, 'ink', '#111111');
  Object.keys(styles).forEach(key => {
    const st = styles[key] || {};
    lines.push(`  --ts-${slugifyKey(key)}-color: ${resolveColor(st.color, colors, fallbackInk)};`);
  });

  const assignments = getMarkdownSlotAssignments(yamlData);
  MARKDOWN_SLOTS.forEach(slot => {
    const st = styles[assignments[slot]] || {};
    lines.push(`  --ts-${slot}-color: ${resolveColor(st.color, colors, fallbackInk)};`);
  });

  lines.push(`  --border-color: ${baseColor(colors, 'hairline', '#dddddd')};`);
  return lines;
}

function buildCssVariablesExport(yamlData, selector=':root') {
  const styles=getTypographyStyles(yamlData.typography||{}),baseColors=getMergedThemeColors(yamlData,null),border=yamlData.border||{},rounded=yamlData.rounded||{},shadows=(yamlData.elevation||{}).shadows||{},spacing=yamlData.spacing||{};
  const lines=buildExportThemeVariableLines(yamlData,baseColors,styles);
  Object.keys(styles).forEach(key=>{const st=styles[key]||{},slug=slugifyKey(key);if(st.font)lines.push(`  --ts-${slug}-font: '${st.font}', ${guessGenericFallback(st)};`);if(st.size!==undefined)lines.push(`  --ts-${slug}-size: ${exportDimension(st.size)};`);if(st.weight!==undefined)lines.push(`  --ts-${slug}-weight: ${st.weight};`);if(st.lineHeight!==undefined)lines.push(`  --ts-${slug}-line-height: ${st.lineHeight};`);if(st.letterSpacing!==undefined)lines.push(`  --ts-${slug}-letter-spacing: ${st.letterSpacing};`);if(st.fontStyle)lines.push(`  --ts-${slug}-font-style: ${st.fontStyle};`);if(st.textTransform)lines.push(`  --ts-${slug}-text-transform: ${st.textTransform};`);if(st.fontFeature)lines.push(`  --ts-${slug}-font-feature-settings: ${st.fontFeature};`);if(st.textDecoration)lines.push(`  --ts-${slug}-text-decoration: ${st.textDecoration};`);if(st.fontVariationSettings)lines.push(`  --ts-${slug}-font-variation-settings: ${st.fontVariationSettings};`);});
  Object.keys(border).forEach(key=>lines.push(`  --border-${slugifyKey(key)}: ${border[key]};`));
  Object.keys(rounded).forEach(key=>lines.push(`  --rounded-${slugifyKey(key)}: ${exportDimension(rounded[key])};`));
  Object.keys(shadows).forEach(key=>lines.push(`  --shadow-${slugifyKey(key)}: ${shadows[key]};`));
  Object.keys(spacing).forEach(key=>lines.push(`  --spacing-${slugifyKey(key)}: ${exportDimension(spacing[key])};`));
  const modes=getExportModeNames().map(name=>{const colors=getMergedThemeColors(yamlData,name);return `\n[data-theme="${name}"] {\n${buildExportThemeVariableLines(yamlData,colors,styles).join('\n')}\n}`;}).join('\n');
  return `${selector} {\n${lines.join('\n')}\n}\n${modes}`;
}

function buildTailwindV4Export(yamlData) {
  const colors=getMergedThemeColors(yamlData,null),styles=getTypographyStyles(yamlData.typography||{}),border=yamlData.border||{},rounded=yamlData.rounded||{},shadows=(yamlData.elevation||{}).shadows||{},spacing=yamlData.spacing||{};
  const lines=[];
  Object.keys(colors).forEach(key=>lines.push(`  --color-${slugifyKey(key)}: ${colors[key]};`));
  Object.keys(styles).forEach(key=>{const st=styles[key]||{},slug=slugifyKey(key);if(st.font)lines.push(`  --font-${slug}: '${st.font}', ${guessGenericFallback(st)};`);if(st.size!==undefined)lines.push(`  --text-${slug}: ${exportDimension(st.size)};`);});
  Object.keys(border).forEach(key=>lines.push(`  --border-${slugifyKey(key)}: ${border[key]};`));
  Object.keys(rounded).forEach(key=>lines.push(`  --radius-${slugifyKey(key)}: ${exportDimension(rounded[key])};`));
  Object.keys(shadows).forEach(key=>lines.push(`  --shadow-${slugifyKey(key)}: ${shadows[key]};`));
  Object.keys(spacing).forEach(key=>lines.push(`  --spacing-${slugifyKey(key)}: ${exportDimension(spacing[key])};`));
  const modes=getExportModeNames().map(name=>{const merged=getMergedThemeColors(yamlData,name);return `[data-theme="${name}"] {\n${Object.keys(merged).map(key=>`  --color-${slugifyKey(key)}: ${merged[key]};`).join('\n')}\n}`;}).join('\n\n');
  return `@import "tailwindcss";\n\n@theme {\n${lines.join('\n')}\n}\n${modes?`\n${modes}\n`:''}`;
}

function componentReference(value) {
  const match=String(value||'').match(/^\{([^}]+)\}$/);return match?match[1]:'';
}

function componentCssReference(value) {
  const ref=componentReference(value);if(!ref)return exportCssValue(value);
  const parts=ref.split('.'),section=parts[0],key=parts.slice(section==='elevation'?2:1).join('-');
  if(section==='colors')return `var(--color-${slugifyKey(key)})`;
  if(section==='border')return `var(--border-${slugifyKey(key)})`;
  if(section==='rounded')return `var(--rounded-${slugifyKey(key)})`;
  if(section==='spacing')return `var(--spacing-${slugifyKey(key)})`;
  if(section==='elevation')return `var(--shadow-${slugifyKey(key)})`;
  return value;
}

function buildComponentsCssExport(yamlData) {
  const components=yamlData.components||{},blocks=Object.keys(components).map(key=>{const c=components[key]||{},lines=[];
    if(c.backgroundColor)lines.push(`  background-color: ${componentCssReference(c.backgroundColor)};`);
    if(c.textColor)lines.push(`  color: ${componentCssReference(c.textColor)};`);
    if(c.border)lines.push(`  border: ${componentCssReference(c.border)};`);
    if(c.borderColor)lines.push(`  border-color: ${componentCssReference(c.borderColor)};`);
    if(c.rounded)lines.push(`  border-radius: ${componentCssReference(c.rounded)};`);
    if(c.shadow)lines.push(`  box-shadow: ${componentCssReference(c.shadow)};`);
    if(c.padding!==undefined)lines.push(`  padding: ${c.padding};`);
    if(c.width!==undefined)lines.push(`  width: ${exportDimension(c.width)};`);
    if(c.height!==undefined)lines.push(`  height: ${exportDimension(c.height)};`);
    const typeRef=componentReference(c.typography);if(typeRef&&typeRef.startsWith('typography.')){const slug=slugifyKey(typeRef.slice(11));lines.push(`  font-family: var(--ts-${slug}-font);`,`  font-size: var(--ts-${slug}-size);`,`  font-weight: var(--ts-${slug}-weight);`,`  line-height: var(--ts-${slug}-line-height);`,`  letter-spacing: var(--ts-${slug}-letter-spacing, normal);`);}
    return `.${slugifyKey(key)} {\n${lines.join('\n')}\n}`;
  });
  return `/* Generated from DESIGN.md */\n${buildCssVariablesExport(yamlData)}\n\n${blocks.join('\n\n')}\n`;
}

function dtcgColor(value) {const rgba=parseColorToRgba(String(value));return {colorSpace:'srgb',components:[rgba.r/255,rgba.g/255,rgba.b/255],alpha:rgba.a};}
function dtcgDimension(value,unit='px'){if(typeof value==='number')return {value,unit};const match=String(value||'').match(/^(-?[\d.]+)(px|rem|em|%)?$/);return match?{value:Number(match[1]),unit:match[2]||unit}:{value:0,unit};}
function buildDtcgExport(yamlData) {
  const colors=getMergedThemeColors(yamlData,null),styles=getTypographyStyles(yamlData.typography||{}),border=yamlData.border||{},rounded=yamlData.rounded||{},shadows=(yamlData.elevation||{}).shadows||{},spacing=yamlData.spacing||{};
  const out={$schema:'https://www.designtokens.org/schemas/2025.10/format.json',color:{},typography:{},border:{},rounded:{},shadow:{},spacing:{},$extensions:{'dmd.editor':{components:yamlData.components||{},modes:{}}}};
  Object.keys(colors).forEach(key=>out.color[key]={$type:'color',$value:dtcgColor(colors[key])});
  Object.keys(styles).forEach(key=>{const st=styles[key]||{};out.typography[key]={$type:'typography',$value:{fontFamily:st.font||'system-ui',fontSize:dtcgDimension(st.size||16),fontWeight:Number(st.weight||400),letterSpacing:dtcgDimension(st.letterSpacing||0,'em'),lineHeight:Number(st.lineHeight||1.5)}};});
  Object.keys(border).forEach(key=>{const match=String(border[key]).match(/^([\d.]+)px\s+(.+)$/);out.border[key]={$extensions:{'dmd.cssValue':border[key]},width:{$type:'dimension',$value:dtcgDimension(match?Number(match[1]):0)},style:{$type:'strokeStyle',$value:match?match[2]:'solid'}};});
  Object.keys(rounded).forEach(key=>out.rounded[key]={$type:'dimension',$value:dtcgDimension(rounded[key])});
  Object.keys(shadows).forEach(key=>out.shadow[key]={$extensions:{'dmd.cssValue':shadows[key]}});
  Object.keys(spacing).forEach(key=>out.spacing[key]={$type:'dimension',$value:dtcgDimension(spacing[key])});
  getExportModeNames().forEach(name=>{const merged=getMergedThemeColors(yamlData,name),mode={};Object.keys(merged).forEach(key=>mode[key]={$type:'color',$value:dtcgColor(merged[key])});out.$extensions['dmd.editor'].modes[name]=mode;});
  return JSON.stringify(out,null,2);
}

function collectPreviewCss() {const chunks=[];Array.from(document.styleSheets).forEach(sheet=>{try{if(sheet.href&&new URL(sheet.href,location.href).origin!==location.origin)return;chunks.push(Array.from(sheet.cssRules||[]).map(rule=>rule.cssText).join('\n'));}catch(err){}});return chunks.join('\n');}
function buildPreviewHtmlExport(yamlData) {
  const container=document.getElementById('article-sample-content'),wasHelp=state.previewHelpMode,modes=getExportModeNames();
  // Shortcode renderers resolve colors into inline styles. Capture a rendered
  // article per theme so standalone theme switching stays visually accurate.
  const capture=(themeName)=>{
    const themedData=themeName?{...yamlData,colors:getMergedThemeColors(yamlData,themeName)}:yamlData;
    state.previewHelpMode=false;
    renderArticleSample(themedData);
    return container?container.innerHTML:'';
  };
  const snapshots=[{name:'default',content:capture(null)},...modes.map(name=>({name,content:capture(name)}))];
  state.previewHelpMode=wasHelp;
  const restoredData=state.activeDesignTheme?{...yamlData,colors:getMergedThemeColors(yamlData,state.activeDesignTheme)}:yamlData;
  renderArticleSample(restoredData);
  const styles=getTypographyStyles(yamlData.typography||{}),google=new Map();Object.values(styles).forEach(st=>{if(st&&st.source==='google'&&st.font){if(!google.has(st.font))google.set(st.font,new Set());google.get(st.font).add(Number(st.weight)||400);}});
  const fontLinks=Array.from(google.entries()).map(([family,weights])=>`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g,'+')}:wght@${Array.from(weights).sort((a,b)=>a-b).join(';')}&display=swap">`).join('\n');
  const otherEmbeds=Object.values(getPreviewWebFontEmbeds()).join('\n'),title=escapeHtml(yamlData.title||'Design Preview'),options=modes.map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  const articles=snapshots.map(({name,content})=>`<article class="article-sample-wrapper preview-export-article" data-preview-theme="${escapeHtml(name)}">${content}</article>`).join('\n');
  const visibility=[`.preview-export-article{display:none}.preview-export-article[data-preview-theme="default"]{display:block}`,`body[data-theme] .preview-export-article[data-preview-theme="default"]{display:none}`,...modes.map(name=>`body[data-theme="${name}"] .preview-export-article[data-preview-theme="${name}"]{display:block}`)].join('');
  return `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${title}</title>\n${fontLinks}\n${otherEmbeds}\n<style>\n${collectPreviewCss()}\n${buildCssVariablesExport(yamlData)}\nhtml,body{margin:0;min-height:100%;overflow:auto;background:var(--color-canvas,#fff);color:var(--color-ink,#111)}.preview-toolbar{position:sticky;top:0;z-index:20;display:flex;justify-content:flex-end;padding:10px 16px;background:var(--color-surface,#f5f5f5);border-bottom:1px solid var(--color-hairline,#ddd)}.preview-toolbar select{font:inherit;padding:6px 10px}.preview-shell{max-width:1120px;margin:0 auto;padding:24px}.article-sample-wrapper{padding:0}${visibility}\n</style>\n</head>\n<body>\n${modes.length?`<header class="preview-toolbar"><label>theme <select id="theme-select"><option value="">default</option>${options}</select></label></header>`:''}\n<main class="preview-shell">${articles}</main>\n${modes.length?`<script>document.getElementById('theme-select').addEventListener('change',function(){if(this.value)document.body.dataset.theme=this.value;else delete document.body.dataset.theme})<\/script>`:''}\n</body>\n</html>`;
}

function generateExports(yamlData) {
  let codeSnippet='';
  if(state.activeExportFormat==='tailwind')codeSnippet=buildTailwindV4Export(yamlData);
  if(state.activeExportFormat==='cssvars')codeSnippet=buildCssVariablesExport(yamlData);
  if(state.activeExportFormat==='compcss')codeSnippet=buildComponentsCssExport(yamlData);
  if(state.activeExportFormat==='tokensjson')codeSnippet=buildDtcgExport(yamlData);
  if(state.activeExportFormat==='previewhtml')codeSnippet=buildPreviewHtmlExport(yamlData);
  document.getElementById('export-code-block').textContent=codeSnippet;
}

const EXPORT_FORMAT_DESCRIPTIONS={
  tailwind:'Tailwind CSS v4の@theme形式でトークンを書き出します。',
  cssvars:'フレームワークを問わず利用できるCSSカスタムプロパティを書き出します。',
  compcss:'DESIGN.mdのcomponents定義から、実際に利用できるCSSクラスを書き出します。',
  tokensjson:'デザインツール間の交換に使えるDTCG 2025.10形式のDesign Tokens JSONです。',
  previewhtml:'現在のPREVIEW.mdプレビューを、エディタなしで単体表示できるHTMLに書き出します。'
};
function updateExportFormatDescription(){const element=document.getElementById('export-format-description');if(element)element.textContent=EXPORT_FORMAT_DESCRIPTIONS[state.activeExportFormat]||'';}

// ============================================================================
// 13b. Folder connect mode (Node不要でフォルダに直接読み書きする)
// ============================================================================

// ---- IndexedDB: directory handle persistence ----
// FileSystemDirectoryHandle は structured-clone 可能なため、IndexedDBに
// そのまま保存できる（localStorageは不可）。
function openHandleDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DIR_HANDLE_DB_NAME, DIR_HANDLE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DIR_HANDLE_STORE)) {
        db.createObjectStore(DIR_HANDLE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSaveDirectoryHandle(handle) {
  try {
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DIR_HANDLE_STORE, 'readwrite');
      tx.objectStore(DIR_HANDLE_STORE).put(handle, DIR_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('ディレクトリハンドルの保存に失敗しました:', err);
  }
}

async function idbLoadDirectoryHandle() {
  try {
    const db = await openHandleDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DIR_HANDLE_STORE, 'readonly');
      const req = tx.objectStore(DIR_HANDLE_STORE).get(DIR_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return null;
  }
}

async function idbClearDirectoryHandle() {
  try {
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DIR_HANDLE_STORE, 'readwrite');
      tx.objectStore(DIR_HANDLE_STORE).delete(DIR_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    // ignore
  }
}

// ---- UI helpers: header state reflecting connection status ----
function updateFolderConnectUi() {
  const label = document.getElementById('btn-connect-folder-label');
  const btn = document.getElementById('btn-connect-folder');
  const reconnectBtn = document.getElementById('btn-reconnect-folder');
  const disconnectBtn = document.getElementById('btn-disconnect-folder');
  const connectedName = state.directoryName || state.serverWorkspaceName;
  if (state.directoryHandle || state.serverWorkspaceName) {
    if (label) label.textContent = `接続中: ${connectedName}`;
    if (btn) btn.title = state.serverWorkspaceName
      ? `ローカルサーバーのプロジェクトルート「${connectedName}」へ自動接続中`
      : `フォルダ「${connectedName}」に接続中`;
    if (reconnectBtn) reconnectBtn.classList.add('hidden');
    if (disconnectBtn) disconnectBtn.classList.toggle('hidden', !!state.serverWorkspaceName && !state.directoryHandle);
  } else {
    if (label) label.textContent = 'フォルダを接続';
    if (btn) btn.title = 'index.htmlとdesignフォルダが入っているプロジェクトルートを接続します';
    if (disconnectBtn) disconnectBtn.classList.remove('hidden');
  }
}

async function detectServerWorkspace() {
  try {
    const response = await fetch('/__workspace', { cache: 'no-store' });
    if (!response.ok) return false;
    const data = await response.json();
    state.serverWorkspaceName = data.name || 'project';
    updateFolderConnectUi();
    return true;
  } catch (err) {
    state.serverWorkspaceName = null;
    return false;
  }
}

function setAutoSaveIndicator(text, pending) {
  const el = document.getElementById('autosave-indicator');
  if (!el) return;
  if (!text) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  el.classList.toggle('autosave-pending', !!pending);
  el.innerHTML = `<span class="autosave-dot">●</span><span>${escapeHtml(text)}</span>`;
}

function formatTimeHHMMSS(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Whether folder-connect (or an equivalent writable handle) autosave should be active.
function canAutoSaveDesign() {
  return autoSaveEnabled && !!(state.fileHandle || state.urlMdPath);
}
function canAutoSavePreview() {
  return autoSaveEnabled && !!(state.previewFileHandle || state.urlPreviewPath);
}

// ---- Debounced autosave (item 7/10) ----
function scheduleAutoSaveDesign() {
  if (state.templateSaveBaseName && state.templateArmed) {
    instantiateTemplatePair();
    return;
  }
  if (!canAutoSaveDesign()) return;
  if (isComposingCode) return;
  setAutoSaveIndicator('自動保存: 保留中…', true);
  if (autoSaveDesignTimer) clearTimeout(autoSaveDesignTimer);
  autoSaveDesignTimer = setTimeout(async () => {
    autoSaveDesignTimer = null;
    if (isComposingCode) { scheduleAutoSaveDesign(); return; }
    await autoSaveDesignNow();
  }, AUTOSAVE_DEBOUNCE_MS);
}

async function autoSaveDesignNow() {
  if (!state.fileHandle && !state.urlMdPath) return;
  const content = document.getElementById('code-textarea').value;
  try {
    if (state.fileHandle) {
      const writable = await state.fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      const file = await state.fileHandle.getFile();
      lastFileModifiedTime = file.lastModified;
    } else {
      urlMdSuppressUntil = Date.now() + 2500;
      await putFileToServer(state.urlMdPath, content);
      urlMdLastText = content;
    }
    setAutoSaveIndicator(`自動保存: ${formatTimeHHMMSS(new Date())}`, false);
  } catch (err) {
    console.error('自動保存失敗:', err);
    setAutoSaveIndicator('自動保存に失敗しました', false);
  }
}

function scheduleAutoSavePreview() {
  if (state.templateSaveBaseName && state.templateArmed) {
    instantiateTemplatePair();
    return;
  }
  if (!canAutoSavePreview()) return;
  if (isComposingPreview) return;
  if (autoSavePreviewTimer) clearTimeout(autoSavePreviewTimer);
  autoSavePreviewTimer = setTimeout(async () => {
    autoSavePreviewTimer = null;
    if (isComposingPreview) { scheduleAutoSavePreview(); return; }
    await autoSavePreviewNow();
  }, AUTOSAVE_DEBOUNCE_MS);
}

async function autoSavePreviewNow() {
  if (!state.previewFileHandle && !state.urlPreviewPath) return;
  const content = state.previewMarkdown || '';
  try {
    if (state.previewFileHandle) {
      const writable = await state.previewFileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      const file = await state.previewFileHandle.getFile();
      lastPreviewModifiedTime = file.lastModified;
    } else {
      urlPreviewSuppressUntil = Date.now() + 2500;
      await putFileToServer(state.urlPreviewPath, content);
      urlPreviewLastText = content;
    }
    setAutoSaveIndicator(`自動保存: ${formatTimeHHMMSS(new Date())}`, false);
  } catch (err) {
    console.error('プレビュー自動保存失敗:', err);
  }
}

// ---- Directory traversal helpers ----
// path: 'design/foo.md' や 'DESIGN.md' のようなスラッシュ区切りの相対パス。
// ディレクトリ階層を辿って getFileHandle / getDirectoryHandle する。
async function resolveFileHandleInDirectory(dirHandle, relPath, options) {
  const parts = relPath.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  let currentDir = dirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    currentDir = await currentDir.getDirectoryHandle(parts[i], { create: !!(options && options.createDirs) });
  }
  const fileName = parts[parts.length - 1];
  return currentDir.getFileHandle(fileName, { create: !!(options && options.create) });
}

async function writeCurrentWorkspaceInfo() {
  const design = state.currentDesignPath;
  const preview = state.currentPreviewPath;
  if (!design || !preview) return;
  const folder = design.includes('/') ? design.slice(0, design.lastIndexOf('/')) : '.';
  const payload = { folder, design, preview };
  try {
    if (state.directoryHandle) {
      const dmdDir = await state.directoryHandle.getDirectoryHandle('.dmd', { create: true });
      const handle = await dmdDir.getFileHandle('current.json', { create: true });
      const writable = await handle.createWritable();
      await writable.write(`${JSON.stringify(Object.assign({}, payload, { updatedAt: new Date().toISOString() }), null, 2)}\n`);
      await writable.close();
    } else {
      await fetch('/__current', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
  } catch (err) {
    console.warn('現在の作業フォルダ情報を保存できませんでした:', err);
  }
}

// Lists *.md files under the connected design folder,
// mirroring server.mjs's GET /__list output shape.
async function listMarkdownFilesFromDirectory(dirHandle, subDir) {
  const files = [];
  try {
    const sub = await dirHandle.getDirectoryHandle(subDir, { create: false });
    async function walk(directory, relative) {
      for await (const [name, handle] of directory.entries()) {
        if (subDir === 'design' && relative === '' && name === 'templates') continue;
        if (handle.kind === 'directory') {
          await walk(handle, relative ? `${relative}/${name}` : name);
        } else if (name.toLowerCase().endsWith('.md') &&
          !(subDir === 'design' && relative !== '' && name.toLowerCase() !== 'design.md')) {
          files.push(`${subDir}/${relative ? `${relative}/` : ''}${name}`);
        }
      }
    }
    await walk(sub, '');
  } catch (err) {
    // サブフォルダが無ければ空のまま
  }
  files.sort();
  return files;
}

// ---- Connect / disconnect ----
async function connectFolder(handle) {
  state.directoryHandle = handle;
  state.directoryName = handle.name;
  updateFolderConnectUi();
  await idbSaveDirectoryHandle(handle);
  await resolveInitialFilesFromDirectory();
}

async function disconnectFolder() {
  state.directoryHandle = null;
  state.directoryName = null;
  await idbClearDirectoryHandle();
  updateFolderConnectUi();
  setAutoSaveIndicator('', false);
  showToast('フォルダの接続を解除しました');
}

async function pickAndConnectFolder() {
  if (!window.showDirectoryPicker) {
    showToast('このブラウザはフォルダ接続に対応していません（Chrome/Edge推奨）', 'error');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await connectFolder(handle);
    showToast(`フォルダ「${handle.name}」に接続しました`);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('フォルダ接続失敗:', err);
      showToast('フォルダの接続に失敗しました', 'error');
    }
  }
}

// Attempts a silent reconnect on startup: if permission is already granted,
// resumes without prompting. If it's merely 'prompt', surfaces a low-key
// reconnect button (user gesture required for requestPermission).
async function tryRestoreDirectoryHandleOnStartup() {
  const handle = await idbLoadDirectoryHandle();
  if (!handle) return;
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      state.directoryHandle = handle;
      state.directoryName = handle.name;
      updateFolderConnectUi();
      await resolveInitialFilesFromDirectory();
      showToast(`フォルダ「${handle.name}」に再接続しました`);
    } else if (perm === 'prompt') {
      const reconnectBtn = document.getElementById('btn-reconnect-folder');
      if (reconnectBtn) {
        reconnectBtn.classList.remove('hidden');
        reconnectBtn.onclick = async () => {
          try {
            const granted = await handle.requestPermission({ mode: 'readwrite' });
            if (granted === 'granted') {
              reconnectBtn.classList.add('hidden');
              state.directoryHandle = handle;
              state.directoryName = handle.name;
              updateFolderConnectUi();
              await resolveInitialFilesFromDirectory();
              showToast(`フォルダ「${handle.name}」に再接続しました`);
            } else {
              showToast('フォルダへのアクセスが許可されませんでした', 'error');
            }
          } catch (err) {
            console.error('再接続失敗:', err);
            showToast('再接続に失敗しました', 'error');
          }
        };
      }
    }
    // perm === 'denied' の場合は何もしない（サイレントに従来動作へフォールバック）
  } catch (err) {
    console.warn('保存済みフォルダハンドルの検証に失敗しました:', err);
  }
}

// Resolves explicit ?md=/?preview= paths against the connected directory handle, wiring up
// state.fileHandle/previewFileHandle so the existing watcher/autosave/manual-
// save code paths just work unmodified. Tries each candidate from
// buildFileResolutionCandidates() in order until one resolves.
async function resolveInitialFilesFromDirectory() {
  if (!state.directoryHandle) return;
  const params = new URLSearchParams(window.location.search);
  const mdCandidates = buildFileResolutionCandidates(params.get('md'), 'design');
  const previewCandidates = buildFileResolutionCandidates(params.get('preview'), 'preview');

  for (const mdPath of mdCandidates) {
    try {
      const handle = await resolveFileHandleInDirectory(state.directoryHandle, mdPath, { create: false });
      if (handle) {
        state.fileHandle = handle;
        state.currentDesignPath = mdPath;
        state.urlMdPath = null;
        clearTemplateSaveMode();
        const file = await handle.getFile();
        lastFileModifiedTime = file.lastModified;
        const text = await file.text();
        state.rawContent = text;
        document.getElementById('code-textarea').value = text;
        document.getElementById('file-status').textContent = `${mdPath} (フォルダ接続)`;
        syncCodeToVisualForm(true);
        break;
      }
    } catch (err) {
      // 指定ファイルがフォルダ内に無ければ次の候補を試す
    }
  }

  if (previewCandidates.length === 0 && /\/DESIGN\.md$/i.test(state.currentDesignPath || '')) {
    previewCandidates.push(state.currentDesignPath.replace(/\/DESIGN\.md$/i, '/PREVIEW.md'));
  }

  for (const previewPath of previewCandidates) {
    try {
      const sHandle = await resolveFileHandleInDirectory(state.directoryHandle, previewPath, { create: false });
      if (sHandle) {
        state.previewFileHandle = sHandle;
        state.currentPreviewPath = previewPath;
        state.urlPreviewPath = null;
        const file = await sHandle.getFile();
        lastPreviewModifiedTime = file.lastModified;
        const text = await file.text();
        state.previewMarkdown = text;
        const sTextarea = document.getElementById('preview-textarea');
        if (sTextarea) sTextarea.value = text;
        renderArticleSample(state.parsedYaml);
        break;
      }
    } catch (err) {
      // 指定プレビューがフォルダ内に無ければ次の候補を試す
    }
  }
  await writeCurrentWorkspaceInfo();
}

// Opens a DESIGN.md-like file by relative path from the connected directory,
// mirroring loadDesignFileFromPath() but backed by a real writable handle
// (so autosave/manual-save/watcher all work), and updates the URL.
async function loadDesignFileFromDirectory(relPath) {
  try {
    clearTemplateSaveMode();
    const handle = await resolveFileHandleInDirectory(state.directoryHandle, relPath, { create: false });
    state.fileHandle = handle;
    state.currentDesignPath = relPath;
    state.urlMdPath = null;
    const file = await handle.getFile();
    lastFileModifiedTime = file.lastModified;
    const text = await file.text();
    state.rawContent = text;
    document.getElementById('code-textarea').value = text;
    document.getElementById('file-status').textContent = `${relPath} (フォルダ接続)`;
    syncCodeToVisualForm(true);

    const url = new URL(window.location.href);
    url.searchParams.set('md', relPath);
    history.replaceState(null, '', url);

    showToast(`${relPath} を読み込みました`);
    return true;
  } catch (err) {
    console.error('フォルダ内ファイル読み込み失敗:', err);
    showToast(`${relPath} の読み込みに失敗しました`, 'error');
    return false;
  }
}

async function loadPreviewFileFromDirectory(relPath, options = {}) {
  try {
    const handle = await resolveFileHandleInDirectory(state.directoryHandle, relPath, { create: false });
    state.previewFileHandle = handle;
    state.currentPreviewPath = relPath;
    state.urlPreviewPath = null;
    const file = await handle.getFile();
    lastPreviewModifiedTime = file.lastModified;
    const text = await file.text();
    state.previewMarkdown = text;
    const sTextarea = document.getElementById('preview-textarea');
    if (sTextarea) sTextarea.value = text;
    renderArticleSample(state.parsedYaml);

    const url = new URL(window.location.href);
    url.searchParams.set('preview', relPath);
    history.replaceState(null, '', url);

    showToast(`${relPath} をプレビューとして読み込みました`);
    return true;
  } catch (err) {
    console.error('フォルダ内プレビュー読み込み失敗:', err);
    if (!options.silent) showToast(`${relPath} の読み込みに失敗しました`, 'error');
    return false;
  }
}

function setupFolderConnectUi() {
  const btnConnect = document.getElementById('btn-connect-folder');
  const popover = document.getElementById('popover-folder-menu');
  const btnDisconnect = document.getElementById('btn-disconnect-folder');
  const autoSaveToggle = document.getElementById('autosave-toggle');

  // 自動保存トグルの初期値（localStorage記憶、デフォルトON）
  try {
    const saved = localStorage.getItem(AUTOSAVE_TOGGLE_STORAGE_KEY);
    autoSaveEnabled = saved === null ? true : saved === 'true';
  } catch (err) {
    autoSaveEnabled = true;
  }
  if (autoSaveToggle) autoSaveToggle.checked = autoSaveEnabled;

  if (btnConnect && popover) {
    btnConnect.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.directoryHandle || state.serverWorkspaceName) {
        // 接続中はクリックでメニュー（接続解除・自動保存トグル）を開く
        if (openPopoverEl === popover) {
          closeOpenPopover();
        } else {
          closeOpenPopover();
          popover.classList.remove('hidden');
          openPopoverEl = popover;
        }
      } else {
        pickAndConnectFolder();
      }
    });
  }

  if (btnDisconnect) {
    btnDisconnect.classList.toggle('hidden', !!state.serverWorkspaceName && !state.directoryHandle);
    btnDisconnect.addEventListener('click', (e) => {
      e.stopPropagation();
      closeOpenPopover();
      disconnectFolder();
    });
  }

  if (autoSaveToggle) {
    autoSaveToggle.addEventListener('change', (e) => {
      autoSaveEnabled = !!e.target.checked;
      try {
        localStorage.setItem(AUTOSAVE_TOGGLE_STORAGE_KEY, String(autoSaveEnabled));
      } catch (err) {
        // localStorage unavailable — ignore
      }
      if (!autoSaveEnabled) setAutoSaveIndicator('', false);
      showToast(autoSaveEnabled ? '自動保存をONにしました' : '自動保存をOFFにしました');
    });
  }
}

// ============================================================================
// 14. Local Direct Saving Logics
// ============================================================================
async function openLocalFile() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'Markdown',
          accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.md', '.txt'] }
        }],
        excludeAcceptAllOption: false,
        multiple: false
      });

      const file = await handle.getFile();
      const text = await file.text();
      await importExternalDesignText(text, file.name);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('ファイルオープン失敗:', err);
        showToast('ファイル読み込みに失敗しました', 'error');
      }
    }
  } else {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        const text = evt.target.result;
        await importExternalDesignText(text, file.name);
      };
      reader.readAsText(file);
    };
    input.click();
  }
}

async function putFileToServer(relPath, content) {
  const res = await fetch(relPath, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    body: content
  });
  // server.mjs は保存成功時に必ず204を返す。npx serve等の別サーバがPUTを
  // 200等で受け流してしまうケースを「保存成功」と誤認しないよう、204以外は
  // すべて失敗として扱う。
  if (res.status !== 204) {
    throw new Error(`HTTP ${res.status}`);
  }
  // 保存直後に同じパスをGET（no-store）し、実際に書き込まれた内容が
  // 送信した内容と一致するかを検証する。npx serve のようにPUTを200で
  // 受理しつつ実際には保存しないサーバを確実に検知するための二重チェック。
  const verifyRes = await fetch(relPath, { cache: 'no-store' });
  if (!verifyRes.ok) {
    throw new Error(`検証GET失敗: HTTP ${verifyRes.status}`);
  }
  const verifyText = await verifyRes.text();
  if (verifyText !== content) {
    throw new Error('保存内容の検証に失敗しました（サーバ側の内容が一致しません）');
  }
}

async function resolveUniqueDesignFileHandle(baseName) {
  const designDir = await state.directoryHandle.getDirectoryHandle('design', { create: true });
  let n = 1;
  while (true) {
    const fileName = n === 1 ? `${baseName}.md` : `${baseName}-${String(n).padStart(2, '0')}.md`;
    try {
      await designDir.getFileHandle(fileName, { create: false });
      n++;
    } catch (err) {
      const handle = await designDir.getFileHandle(fileName, { create: true });
      return { handle, relPath: `design/${fileName}` };
    }
  }
}

async function saveTemplateInstanceToDesignFolder(content) {
  if (!state.directoryHandle || !state.templateSaveBaseName) return false;
  const { handle, relPath } = await resolveUniqueDesignFileHandle(state.templateSaveBaseName);
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  if (autoSaveDesignTimer) { clearTimeout(autoSaveDesignTimer); autoSaveDesignTimer = null; }
  state.fileHandle = handle;
  state.urlMdPath = null;
  state.templateSaveBaseName = null;
  const file = await handle.getFile();
  lastFileModifiedTime = file.lastModified;
  document.getElementById('file-status').textContent = `${relPath} (フォルダ接続)`;
  const url = new URL(window.location.href);
  url.searchParams.set('md', relPath);
  history.replaceState(null, '', url);
  showToast(`${relPath} として保存し、編集対象を切り替えました`);
  return true;
}

async function instantiateTemplatePair() {
  if (!state.templateSaveBaseName || !state.templateArmed) return false;
  if (state.templateInstantiationPromise) return state.templateInstantiationPromise;
  const templateId = state.templateSaveBaseName;
  const designContent = document.getElementById('code-textarea').value;
  const previewContent = state.previewMarkdown || '';
  state.templateArmed = false;
  state.templateInstantiationPromise = (async () => {
    let result;
    if (state.directoryHandle) {
      const designDir = await state.directoryHandle.getDirectoryHandle('design', { create: true });
      let number = 1;
      let folderName;
      let targetDir;
      while (true) {
        folderName = `${templateId}-${String(number).padStart(3, '0')}`;
        try {
          await designDir.getDirectoryHandle(folderName, { create: false });
          number++;
        } catch (err) {
          targetDir = await designDir.getDirectoryHandle(folderName, { create: true });
          break;
        }
      }
      const designHandle = await targetDir.getFileHandle('DESIGN.md', { create: true });
      const previewHandle = await targetDir.getFileHandle('PREVIEW.md', { create: true });
      const designWritable = await designHandle.createWritable();
      await designWritable.write(designContent);
      await designWritable.close();
      const previewWritable = await previewHandle.createWritable();
      await previewWritable.write(previewContent);
      await previewWritable.close();
      state.fileHandle = designHandle;
      state.previewFileHandle = previewHandle;
      state.urlMdPath = null;
      state.urlPreviewPath = null;
      result = { folder: `design/${folderName}`, design: `design/${folderName}/DESIGN.md`, preview: `design/${folderName}/PREVIEW.md` };
      lastFileModifiedTime = (await designHandle.getFile()).lastModified;
      lastPreviewModifiedTime = (await previewHandle.getFile()).lastModified;
    } else {
      const res = await fetch('/__instantiate-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: templateId, design: designContent, preview: previewContent })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      result = await res.json();
      state.urlMdPath = result.design;
      state.urlPreviewPath = result.preview;
      urlMdLastText = designContent;
      urlPreviewLastText = previewContent;
    }
    state.templateSaveBaseName = null;
    state.currentDesignPath = result.design;
    state.currentPreviewPath = result.preview;
    document.getElementById('file-status').textContent = result.folder;
    const url = new URL(window.location.href);
    url.searchParams.set('md', result.design);
    url.searchParams.set('preview', result.preview);
    history.replaceState(null, '', url);
    await writeCurrentWorkspaceInfo();
    showToast(`${result.folder} を作成し、編集対象を切り替えました`);
    return true;
  })().catch(err => {
    state.templateArmed = true;
    console.error('テンプレートの作業フォルダ作成に失敗:', err);
    showToast('テンプレートの作業フォルダを作成できませんでした', 'error');
    return false;
  }).finally(() => { state.templateInstantiationPromise = null; });
  return state.templateInstantiationPromise;
}

async function suggestNextWorkspaceFolderName(name) {
  const cleaned = String(name || 'New-Design').replace(/-copy$/i, '').trim() || 'New-Design';
  const numbered = cleaned.match(/^(.*)-(\d{3,})$/);
  const baseName = numbered ? numbered[1] : cleaned;
  const currentNumber = numbered ? Number(numbered[2]) : 0;
  let highestNumber = currentNumber;
  let exactFolderExists = false;

  const files = await fetchFileList('design');
  if (Array.isArray(files)) {
    const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactPattern = new RegExp(`^design/${escapedBase}/DESIGN\\.md$`, 'i');
    const pattern = new RegExp(`^design/${escapedBase}-(\\d{3,})/DESIGN\\.md$`, 'i');
    files.forEach(path => {
      if (exactPattern.test(String(path))) exactFolderExists = true;
      const match = String(path).match(pattern);
      if (match) highestNumber = Math.max(highestNumber, Number(match[1]));
    });
  }

  if (!numbered && !exactFolderExists && highestNumber === 0) return baseName;
  return `${baseName}-${String(highestNumber + 1).padStart(3, '0')}`;
}

async function saveDesignAs() {
  const currentFolder = state.currentDesignPath.match(/^design\/([^/]+)\/DESIGN\.md$/i)?.[1];
  const templateFolder = state.currentDesignPath.match(/^design\/templates\/([^/]+)\/DESIGN\.md$/i)?.[1];
  let suggestionBase = currentFolder || templateFolder || 'New-Design';
  if (state.externalImportSourceName) {
    const fileStem = state.externalImportSourceName.replace(/\.(?:md|markdown|txt)$/i, '');
    const designName = String(state.parsedYaml?.title || '').trim();
    const baseName = /^design$/i.test(fileStem) && designName ? designName : fileStem;
    const safeBaseName = String(baseName || 'Imported-Design').replace(/[\\/]/g, '-').trim() || 'Imported-Design';
    suggestionBase = safeBaseName;
  }
  const suggested = await suggestNextWorkspaceFolderName(suggestionBase);
  let folderName = window.prompt('新しい作業フォルダ名を入力してください（DESIGN.mdとPREVIEW.mdをセットで保存します）', suggested);
  if (!folderName) return;
  folderName = folderName.trim();
  if (!folderName || /[\\/]/.test(folderName) || folderName === '.' || folderName === '..') {
    showToast('フォルダ名に / や \\ は使用できません', 'error');
    return;
  }
  const designContent = document.getElementById('code-textarea').value;
  const previewContent = state.previewMarkdown || '';
  try {
    let result;
    if (state.directoryHandle) {
      const designDir = await state.directoryHandle.getDirectoryHandle('design', { create: true });
      try {
        await designDir.getDirectoryHandle(folderName, { create: false });
        throw new Error('同名の作業フォルダが既にあります');
      } catch (err) {
        if (err.message === '同名の作業フォルダが既にあります') throw err;
      }
      const targetDir = await designDir.getDirectoryHandle(folderName, { create: true });
      const designHandle = await targetDir.getFileHandle('DESIGN.md', { create: true });
      const previewHandle = await targetDir.getFileHandle('PREVIEW.md', { create: true });
      const designWritable = await designHandle.createWritable();
      await designWritable.write(designContent);
      await designWritable.close();
      const previewWritable = await previewHandle.createWritable();
      await previewWritable.write(previewContent);
      await previewWritable.close();
      state.fileHandle = designHandle;
      state.previewFileHandle = previewHandle;
      state.urlMdPath = null;
      state.urlPreviewPath = null;
      lastFileModifiedTime = (await designHandle.getFile()).lastModified;
      lastPreviewModifiedTime = (await previewHandle.getFile()).lastModified;
      result = { folder: `design/${folderName}`, design: `design/${folderName}/DESIGN.md`, preview: `design/${folderName}/PREVIEW.md` };
    } else {
      const response = await fetch('/__save-as-workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName, design: designContent, preview: previewContent })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      result = body;
      state.urlMdPath = result.design;
      state.urlPreviewPath = result.preview;
      urlMdLastText = designContent;
      urlPreviewLastText = previewContent;
    }
    state.currentDesignPath = result.design;
    state.currentPreviewPath = result.preview;
    clearTemplateSaveMode();
    document.getElementById('file-status').textContent = result.folder;
    const url = new URL(window.location.href);
    url.searchParams.set('md', result.design);
    url.searchParams.set('preview', result.preview);
    history.replaceState(null, '', url);
    await writeCurrentWorkspaceInfo();
    showToast(`${result.folder}へDESIGN.mdとPREVIEW.mdを保存しました`);
  } catch (err) {
    console.error('別名保存失敗:', err);
    showToast(err.message || '別名での保存に失敗しました', 'error');
  }
}

 function downloadDocument() {
  const content = document.getElementById('code-textarea').value;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'DESIGN.md');
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast('DESIGN.mdファイルをダウンロードしました');
}

// Export names use the DESIGN.md title as a stable, readable prefix.
const EXPORT_FORMAT_SUFFIXES = {
  tailwind: 'tailwind.css',
  cssvars: 'tokens.css',
  compcss: 'components.css',
  tokensjson: 'tokens.json',
  previewhtml: 'preview.html'
};

function getExportTitleSlug() {
  const title = String(state.parsedYaml?.title || 'design-system').normalize('NFKC').trim().toLowerCase();
  return title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'design-system';
}

function getExportFilename(format) {
  const suffix = EXPORT_FORMAT_SUFFIXES[format];
  return suffix ? `${getExportTitleSlug()}.${suffix}` : 'export.txt';
}

function downloadExportCode() {
  const code = document.getElementById('export-code-block').textContent;
  const filename = getExportFilename(state.activeExportFormat);
  const mime = state.activeExportFormat === 'previewhtml' ? 'text/html;charset=utf-8' : state.activeExportFormat === 'tokensjson' ? 'application/json;charset=utf-8' : 'text/css;charset=utf-8';
  const blob = new Blob([code], { type: mime });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast(`${filename} をダウンロードしました`);
}

// ============================================================================
// 14b. PREVIEW.md preview state
// ============================================================================
function initPreviewFromStorage() {
  let saved = null;
  try {
    saved = localStorage.getItem(PREVIEW_STORAGE_KEY);
  } catch (err) {
    saved = null;
  }
  state.previewMarkdown = (saved !== null && saved !== undefined && saved !== '')
    ? saved
    : (defaultPreviewMarkdownCache || MINIMAL_DEFAULT_PREVIEW_MARKDOWN);
  const textarea = document.getElementById('preview-textarea');
  if (textarea) textarea.value = state.previewMarkdown;
}

 // ============================================================================
// 14c. File popovers (item 5): quick-open menu backed by GET /__list
// ============================================================================
let openPopoverEl = null;

// Static popovers keep their markup across opens/closes (their contents are
// authored in index.html, not regenerated each time) — only the dynamically
// populated file-list popovers should have innerHTML cleared on close.
const STATIC_POPOVER_IDS = new Set(['popover-folder-menu']);

function closeOpenPopover() {
  if (openPopoverEl) {
    openPopoverEl.classList.add('hidden');
    if (!STATIC_POPOVER_IDS.has(openPopoverEl.id)) {
      openPopoverEl.innerHTML = '';
    }
    openPopoverEl = null;
  }
}

// Fetches the file list for a given dir ('design' | 'preview'). Priority:
// 1) connected directory handle (フォルダ接続モード) 2) server.mjs GET /__list
// 3) null (unavailable — caller falls back to the native file picker).
async function fetchFileList(dir) {
  if (state.directoryHandle) {
    try {
      return await listMarkdownFilesFromDirectory(state.directoryHandle, dir);
    } catch (err) {
      // フォルダ接続中でも列挙に失敗した場合はサーバ経路にフォールバック
    }
  }
  try {
    const res = await fetch(`/__list?dir=${dir}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.files)) return null;
    return data.files;
  } catch (err) {
    return null;
  }
}

// Opens a popover under `anchorBtn`, populated with the file list for `dir`.
// `onPick(path)` is called when a file is chosen; `onOther()` when the user
// picks "その他のファイルを選択…". If the file list fetch fails entirely,
// falls straight through to `onOther()` (native file picker fallback).
async function openFilePopover(popoverEl, dir, onPick, onOther) {
  if (openPopoverEl === popoverEl) {
    closeOpenPopover();
    return;
  }
  closeOpenPopover();

  const files = await fetchFileList(dir);
  if (files === null) {
    // /__list unavailable (e.g. npx serve) — fall back directly to the picker.
    onOther();
    return;
  }

  popoverEl.innerHTML = '';

  if (files.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'file-popover-empty';
    emptyEl.textContent = `${dir}/ フォルダに.mdファイルがありません`;
    popoverEl.appendChild(emptyEl);
  } else {
    files.forEach(filePath => {
      const btn = document.createElement('button');
      btn.className = 'file-popover-item';
      btn.innerHTML = `<i data-lucide="file-text"></i><span>${escapeHtml(filePath)}</span>`;
      btn.addEventListener('click', () => {
        closeOpenPopover();
        onPick(filePath);
      });
      popoverEl.appendChild(btn);
    });
  }

  const divider = document.createElement('div');
  divider.className = 'file-popover-divider';
  popoverEl.appendChild(divider);

  const otherBtn = document.createElement('button');
  otherBtn.className = 'file-popover-item';
  otherBtn.innerHTML = `<i data-lucide="more-horizontal"></i><span>その他のファイルを選択…</span>`;
  otherBtn.addEventListener('click', () => {
    closeOpenPopover();
    onOther();
  });
  popoverEl.appendChild(otherBtn);

  popoverEl.classList.remove('hidden');
  openPopoverEl = popoverEl;
  lucide.createIcons();
}

// Loads a DESIGN.md-like file at `path` in URL read/poll mode (mirrors the
// ?md= loading path in initFromUrlParams), and updates the URL so a reload
// resumes on the same file.
async function loadDesignFileFromPath(path) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    state.fileHandle = null;
    state.urlMdPath = path;
    state.currentDesignPath = path;
    clearTemplateSaveMode();
    urlMdLastText = text;
    const textarea = document.getElementById('code-textarea');
    textarea.value = text;
    state.rawContent = text;
    syncCodeToVisualForm(true);
    document.getElementById('file-status').textContent = `${path} (URL読み込み・自動更新)`;

    const url = new URL(window.location.href);
    url.searchParams.set('md', path);
    history.replaceState(null, '', url);

    showToast(`${path} を読み込みました`);
    return true;
  } catch (err) {
    console.error('ファイル読み込み失敗:', err);
    showToast(`${path} の読み込みに失敗しました`, 'error');
    return false;
  }
}

// Loads a PREVIEW.md-like file at `path` in URL read/poll mode (mirrors the
// ?preview= loading path), and updates the URL so a reload resumes correctly.
async function loadPreviewFileFromPath(path, options = {}) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    state.previewFileHandle = null;
    state.urlPreviewPath = path;
    state.currentPreviewPath = path;
    urlPreviewLastText = text;
    state.previewMarkdown = text;
    const sTextarea = document.getElementById('preview-textarea');
    if (sTextarea) sTextarea.value = text;
    renderArticleSample(state.parsedYaml);
    schedulePreviewSave();

    const url = new URL(window.location.href);
    url.searchParams.set('preview', path);
    history.replaceState(null, '', url);

    showToast(`${path} をプレビューとして読み込みました`);
    return true;
  } catch (err) {
    console.error('プレビュー読み込み失敗:', err);
    if (!options.silent) showToast(`${path} の読み込みに失敗しました`, 'error');
    return false;
  }
}

// Picks the DESIGN.md loader appropriate for the current connection mode:
// a connected folder resolves relative paths against the directory handle
// (giving a writable handle for autosave), otherwise falls back to the
// read-only URL/poll mode used with server.mjs or plain static hosting.
async function pickDesignFileByPath(path) {
  let designLoaded;
  if (state.directoryHandle) {
    designLoaded = await loadDesignFileFromDirectory(path);
  } else {
    designLoaded = await loadDesignFileFromPath(path);
  }
  if (!designLoaded) return;

  let previewLoaded = false;
  if (/\/DESIGN\.md$/i.test(path)) {
    const previewPath = path.replace(/\/DESIGN\.md$/i, '/PREVIEW.md');
    if (state.directoryHandle) previewLoaded = await loadPreviewFileFromDirectory(previewPath, { silent: true });
    else previewLoaded = await loadPreviewFileFromPath(previewPath, { silent: true });
  }
  if (!previewLoaded) {
    await applyDefaultPreview();
    showToast('PREVIEW.mdがないため、標準プレビューを使用します');
  }
  await writeCurrentWorkspaceInfo();
}

function setupFilePopovers() {
  const btnOpenDesign = document.getElementById('btn-open-file');
  const popoverOpenDesign = document.getElementById('popover-open-design');
  if (btnOpenDesign && popoverOpenDesign) {
    btnOpenDesign.addEventListener('click', (e) => {
      e.stopPropagation();
      openFilePopover(popoverOpenDesign, 'design', pickDesignFileByPath, openLocalFile);
    });
  }

  // Close on outside click and Escape.
  document.addEventListener('click', (e) => {
    if (openPopoverEl && !openPopoverEl.contains(e.target)) {
      closeOpenPopover();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openPopoverEl) {
      closeOpenPopover();
    }
  });
}

// ============================================================================
// 15. Initializer & Event Listeners setup
// ============================================================================
function init() {
  restoreEditorTheme();
  lucide.createIcons();

  const textarea = document.getElementById('code-textarea');
  textarea.addEventListener('input', () => {
    syncCodeToVisualForm(false);
    if (!isComposingCode) scheduleAutoSaveDesign();
  });
  textarea.addEventListener('compositionstart', () => { isComposingCode = true; });
  textarea.addEventListener('compositionend', () => {
    isComposingCode = false;
    scheduleAutoSaveDesign();
  });

  textarea.addEventListener('scroll', () => {
    const lineNumbers = document.getElementById('line-numbers');
    lineNumbers.scrollTop = textarea.scrollTop;
  });

  // Sidebar Tabs Setup
  const sidebarTabs = document.querySelectorAll('.sidebar-tab');
  sidebarTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sidebarTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetId = tab.getAttribute('data-target');
      const panels = tab.closest('.workspace-sidebar').querySelectorAll('.tab-panel');
      panels.forEach(p => {
        p.classList.remove('active');
        if (p.id === targetId) p.classList.add('active');
      });
    });
  });

  // Code Panel Tabs Setup
  const codePanelTabs = document.querySelectorAll('.code-panel-tab');
  codePanelTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      codePanelTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetId = tab.getAttribute('data-target');
      const panels = tab.closest('.workspace-code').querySelectorAll('.tab-panel');
      panels.forEach(p => {
        p.classList.remove('active');
        if (p.id === targetId) p.classList.add('active');
      });
    });
  });

  // Code Panel Collapse / Expand
  const appWorkspace = document.querySelector('.app-workspace');
  const btnToggleCodePanel = document.getElementById('btn-toggle-code-panel');
  const btnCollapseCodePanel = document.getElementById('btn-collapse-code-panel');

  function collapseCodePanel() {
    appWorkspace.classList.add('code-panel-collapsed');
    if (btnToggleCodePanel) {
      btnToggleCodePanel.classList.remove('hidden');
      btnToggleCodePanel.setAttribute('title', 'コードパネルを表示');
    }
  }

  function expandCodePanel() {
    appWorkspace.classList.remove('code-panel-collapsed');
    if (btnToggleCodePanel) {
      btnToggleCodePanel.classList.add('hidden');
      btnToggleCodePanel.setAttribute('title', 'コードパネルの表示/非表示');
    }
  }

  function toggleCodePanel() {
    if (appWorkspace.classList.contains('code-panel-collapsed')) {
      expandCodePanel();
    } else {
      collapseCodePanel();
    }
  }

  if (btnToggleCodePanel) btnToggleCodePanel.addEventListener('click', toggleCodePanel);
  if (btnCollapseCodePanel) btnCollapseCodePanel.addEventListener('click', collapseCodePanel);
  expandCodePanel();

  // Export Modal Setup
  const exportModal = document.getElementById('export-modal');
  const btnOpenExport = document.getElementById('btn-open-export');
  const btnCloseExport = document.getElementById('btn-close-export');

  if (btnOpenExport) {
    btnOpenExport.addEventListener('click', () => {
      generateExports(state.parsedYaml);
      updateExportFormatDescription();
      exportModal.classList.remove('hidden');
    });
  }
  if (btnCloseExport) {
    btnCloseExport.addEventListener('click', () => {
      exportModal.classList.add('hidden');
    });
  }
  if (exportModal) {
    exportModal.addEventListener('click', (e) => {
      if (e.target === exportModal) exportModal.classList.add('hidden');
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && exportModal && !exportModal.classList.contains('hidden')) {
      exportModal.classList.add('hidden');
    }
  });

  // Metadata fields listeners (bi-directional sync to YAML).
  // `name` remains read-compatible, but current documents emit `title`.
  const metaFields = ['title', 'version', 'author', 'description'];
  metaFields.forEach(field => {
    const el = document.getElementById(`meta-${field}`);
    el.addEventListener('input', (e) => {
      state.parsedYaml[field] = e.target.value;
      if (field === 'title') delete state.parsedYaml.name;
      buildDocument();
    });
  });

  loadTemplateList();

  // Export Sub-Tabs setup
  const exportSubTabs = document.querySelectorAll('.export-tab-sub');
  exportSubTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      exportSubTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeExportFormat = tab.getAttribute('data-format');
      generateExports(state.parsedYaml);
      updateExportFormatDescription();
    });
  });

  // Action Buttons
  // Note: #btn-open-file's click handler is wired in setupFilePopovers()
  // (opens the DESIGN.md quick-pick popover, falling back to openLocalFile()
  // when GET /__list is unavailable, e.g. under npx serve).
  const btnSaveAsFile = document.getElementById('btn-save-as-file');
  if (btnSaveAsFile) btnSaveAsFile.addEventListener('click', saveDesignAs);
  document.getElementById('btn-download').addEventListener('click', downloadDocument);

  document.getElementById('btn-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(textarea.value)
      .then(() => showToast('全ソースコードをクリップボードにコピーしました'))
      .catch(() => showToast('コピーに失敗しました', 'error'));
  });

  document.getElementById('btn-copy-export').addEventListener('click', () => {
    const code = document.getElementById('export-code-block').textContent;
    navigator.clipboard.writeText(code)
      .then(() => showToast('エクスポートコードをコピーしました'))
      .catch(() => showToast('コピーに失敗しました', 'error'));
  });

  const btnDownloadExport = document.getElementById('btn-download-export');
  if (btnDownloadExport) {
    btnDownloadExport.addEventListener('click', downloadExportCode);
  }

  document.getElementById('btn-format-yaml').addEventListener('click', () => {
    buildDocument();
    showToast('YAMLフォーマットを整形しました');
  });

  // Theme Toggle (Light / Dark)
  const themeBtn = document.getElementById('btn-toggle-theme');
  themeBtn.addEventListener('click', () => {
    const nextTheme = state.editorTheme === 'light' ? 'dark' : 'light';
    applyEditorTheme(nextTheme);
    try {
      localStorage.setItem(EDITOR_THEME_STORAGE_KEY, nextTheme);
    } catch (err) {
      // localStorage unavailable — retain the theme for this session.
    }

    lucide.createIcons();
    showToast(`${nextTheme === 'light' ? 'ライト' : 'ダーク'}テーマに切り替えました`);
  });

  // Drag and Drop files
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.md')) {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        await importExternalDesignText(evt.target.result, file.name);
      };
      reader.readAsText(file);
    }
  });

  // テーマ切り替え（プレビューのみ、YAMLには保存しない）
  initPreviewThemeFromStorage();
  const previewThemeSelect = document.getElementById('preview-theme-select');
  if (previewThemeSelect) {
    previewThemeSelect.addEventListener('change', (e) => {
      setActiveDesignTheme(e.target.value || null);
    });
  }
  const btnTogglePreviewHelp = document.getElementById('btn-toggle-preview-help');
  if (btnTogglePreviewHelp) btnTogglePreviewHelp.addEventListener('click', togglePreviewHelp);

  // PREVIEW.md tab wiring — restored from localStorage if present,
  // otherwise falling back to the bundled standard preview.
  initPreviewFromStorage();
  const previewTextarea = document.getElementById('preview-textarea');
  if (previewTextarea) {
    previewTextarea.addEventListener('input', (e) => {
      state.previewMarkdown = e.target.value;
      renderArticleSample(state.parsedYaml);
      schedulePreviewSave();
      if (!isComposingPreview) scheduleAutoSavePreview();
    });
    previewTextarea.addEventListener('compositionstart', () => { isComposingPreview = true; });
    previewTextarea.addEventListener('compositionend', () => {
      isComposingPreview = false;
      scheduleAutoSavePreview();
    });
  }
  // Render the article sample once at startup (tokens already loaded via loadTemplate above).
  renderArticleSample(state.parsedYaml);

  // File popovers: DESIGN.mdを開く / プレビュータブの切り替え
  setupFilePopovers();

  // フォルダ接続モード: ヘッダのボタン・トグルの配線、および起動時の
  // サイレント再接続（権限がgranted済みなら無音、prompt扱いなら再接続ボタン表示）。
  setupFolderConnectUi();

  initApp();
}

// フォルダ接続の復帰を待ってからURLパラメータ読み込み/ウォッチャーを開始する。
// 復帰が成功していれば state.fileHandle 等が既に埋まっているため、
// initFromUrlParams() は何もしない（?md=/?preview=が無いか、フォルダ内で
// 解決できなかった場合のみ従来のURL fetchモードにフォールバックする）。
async function initApp() {
  await detectServerWorkspace();
  await tryRestoreDirectoryHandleOnStartup();

  // URL params: ?md=DESIGN.md&preview=PREVIEW.md — load files served from the
  // same origin (read-only fetch mode, polled for external changes).
  // フォルダ接続で該当ファイルが既に開かれていれば initFromUrlParams() 内の
  // ガード（!state.fileHandle / !state.previewFileHandle）で二重読み込みを防ぐ。
  await initFromUrlParams();

  startFileWatcher();
}

// ============================================================================
// 15b. URL-parameter file loading (?md=...&preview=...)
// ============================================================================
let urlMdLastText = null;
let urlPreviewLastText = null;
let urlMdSuppressUntil = 0;
let urlPreviewSuppressUntil = 0;

function resolveUrlParamPath(p) {
  if (!p) return p;
  // 拡張子がなければ .md を補完（?md=design → design.md）
  if (!/\.[a-z0-9]+$/i.test(p)) return p + '.md';
  return p;
}

// Builds the ordered list of candidate relative paths to try for the default
// DESIGN.md/PREVIEW.md file resolution: the literal given path first
// (as-is, e.g. '?md=DESIGN' -> 'DESIGN.md'), then the same filename inside
// design/ for DESIGN.md. PREVIEW.md is normally derived from the resolved
// DESIGN.md path and lives beside it. When no parameter is provided the
// Standard Web pair template is opened instead. Used identically by both the fetch/server.mjs
// resolution path and the folder-connected getFileHandle resolution path.
function buildFileResolutionCandidates(rawParam, kind) {
  const candidates = [];
  if (rawParam) {
    const resolved = resolveUrlParamPath(rawParam);
    candidates.push(resolved);
    if (kind === 'design') {
      const insideDesign = `design/${resolved}`;
      if (!candidates.includes(insideDesign)) candidates.push(insideDesign);
    }
  }
  return candidates;
}

// Tries each candidate path via fetch (no-store) until one succeeds.
// Returns { path, text } on success, or null if none of the candidates exist.
async function fetchFirstAvailable(candidates) {
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { cache: 'no-store' });
      if (!res.ok) continue;
      const text = await res.text();
      return { path: candidate, text };
    } catch (err) {
      // try next candidate
    }
  }
  return null;
}

async function initFromUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const hadMdParam = !!params.get('md');
  const hadPreviewParam = !!params.get('preview');
  if (!hadMdParam && !hadPreviewParam && !state.fileHandle && !state.previewFileHandle) {
    await loadTemplate({
      id: 'Standard-Web',
      name: 'Standard Web System',
      design: 'design/templates/Standard-Web/DESIGN.md',
      preview: 'design/templates/Standard-Web/PREVIEW.md'
    });
    return;
  }
  const mdCandidates = buildFileResolutionCandidates(params.get('md'), 'design');
  const previewCandidates = buildFileResolutionCandidates(params.get('preview'), 'preview');
  if (previewCandidates.length === 0) {
    const designPath = state.currentDesignPath || resolveUrlParamPath(params.get('md')) || '';
    if (/\/DESIGN\.md$/i.test(designPath)) {
      previewCandidates.push(designPath.replace(/\/DESIGN\.md$/i, '/PREVIEW.md'));
    }
  }

  // フォルダ接続が既にDESIGN.md/PREVIEW.mdを解決済みなら、それぞれ二重読み込み
  // しない（fileHandle/previewFileHandleが立っている＝書込可能なハンドルで
  // 開けている状態なので、読み取り専用のURL fetchモードで上書きしない）。
  if (!state.fileHandle) {
    const result = await fetchFirstAvailable(mdCandidates);
    if (result) {
      state.urlMdPath = result.path;
      state.currentDesignPath = result.path;
      urlMdLastText = result.text;
      clearTemplateSaveMode();
      const textarea = document.getElementById('code-textarea');
      textarea.value = result.text;
      state.rawContent = result.text;
      syncCodeToVisualForm(true);
      document.getElementById('file-status').textContent = `${result.path} (URL読み込み・自動更新)`;
      showToast(`${result.path} をURLから読み込みました`);
    } else if (hadMdParam) {
      showToast(`?md=${params.get('md')} の読み込みに失敗しました`, 'error');
    }
  }

  if (!state.previewFileHandle) {
    const result = await fetchFirstAvailable(previewCandidates);
    if (result) {
      state.urlPreviewPath = result.path;
      state.currentPreviewPath = result.path;
      urlPreviewLastText = result.text;
      state.previewMarkdown = result.text;
      const sTextarea = document.getElementById('preview-textarea');
      if (sTextarea) sTextarea.value = result.text;
      renderArticleSample(state.parsedYaml);
      schedulePreviewSave();
      showToast(`${result.path} をURLから読み込みました`);
    } else if (hadMdParam || hadPreviewParam || state.fileHandle) {
      await applyDefaultPreview();
      showToast('PREVIEW.mdがないため、標準プレビューを使用します');
    }
  }
  await writeCurrentWorkspaceInfo();
}

async function pollUrlLoadedFiles() {
  if (state.urlMdPath && !state.fileHandle) {
    if (Date.now() < urlMdSuppressUntil) {
      // 保存直後の猶予期間中はポーリングをスキップ（PUT中の中間状態を拾わないため）
    } else {
    try {
      const res = await fetch(state.urlMdPath, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        if (Date.now() < urlMdSuppressUntil) {
          // fetch中に保存が行われた場合の防御
        } else if (urlMdLastText !== null && text !== urlMdLastText) {
          const textarea = document.getElementById('code-textarea');
          if (text === textarea.value) {
            // 内容は既に一致している（自分の保存分など）。トースト・リロードは不要
            urlMdLastText = text;
          } else {
            urlMdLastText = text;
            textarea.value = text;
            syncCodeToVisualForm(true);
            showToast('外部でのファイル変更を検知し、自動リロードしました');
          }
        } else if (urlMdLastText === null) {
          urlMdLastText = text;
        }
      }
    } catch (err) { /* server briefly unavailable — ignore */ }
    }
  }

  if (state.urlPreviewPath && !state.previewFileHandle) {
    if (Date.now() < urlPreviewSuppressUntil) {
      // 保存直後の猶予期間中はポーリングをスキップ
    } else {
    try {
      const res = await fetch(state.urlPreviewPath, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        if (Date.now() < urlPreviewSuppressUntil) {
          // fetch中に保存が行われた場合の防御
        } else if (urlPreviewLastText !== null && text !== urlPreviewLastText) {
          if (text === state.previewMarkdown) {
            // 内容は既に一致している。トースト・リロードは不要
            urlPreviewLastText = text;
          } else {
            urlPreviewLastText = text;
            state.previewMarkdown = text;
            const sTextarea = document.getElementById('preview-textarea');
            if (sTextarea) sTextarea.value = text;
            renderArticleSample(state.parsedYaml);
            schedulePreviewSave();
            showToast('プレビューの外部変更を検知し、自動リロードしました');
          }
        } else if (urlPreviewLastText === null) {
          urlPreviewLastText = text;
        }
      }
    } catch (err) { /* ignore */ }
    }
  }
}

// ============================================================================
// 18. File Watcher (Polls local file handle for disk updates)
// ============================================================================
function startFileWatcher() {
  setInterval(async () => {
    if (state.fileHandle) {
      try {
        const file = await state.fileHandle.getFile();
        if (lastFileModifiedTime === 0) {
          lastFileModifiedTime = file.lastModified;
          return;
        }
        if (file.lastModified > lastFileModifiedTime) {
          lastFileModifiedTime = file.lastModified;
          const text = await file.text();

          if (text !== document.getElementById('code-textarea').value) {
            document.getElementById('code-textarea').value = text;
            syncCodeToVisualForm(true);
            showToast('外部でのファイル変更を検知し、自動リロードしました');
          }
        }
      } catch (err) {
        // Silently ignore access conflict errors
      }
    }

    // PREVIEW.md watcher (external edits by AI agents etc.)
    if (state.previewFileHandle) {
      try {
        const file = await state.previewFileHandle.getFile();
        if (lastPreviewModifiedTime === 0) {
          lastPreviewModifiedTime = file.lastModified;
        } else if (file.lastModified > lastPreviewModifiedTime) {
          lastPreviewModifiedTime = file.lastModified;
          const text = await file.text();
          if (text !== state.previewMarkdown) {
            state.previewMarkdown = text;
            const textarea = document.getElementById('preview-textarea');
            if (textarea) textarea.value = text;
            renderArticleSample(state.parsedYaml);
            schedulePreviewSave();
            showToast('プレビューの外部変更を検知し、自動リロードしました');
          }
        }
      } catch (err) {
        // Silently ignore access conflict errors
      }
    }

    // URL-loaded files (?md= / ?preview=) — poll via fetch
    await pollUrlLoadedFiles();

  }, 1000);
}

// Start application
window.addEventListener('DOMContentLoaded', init);
