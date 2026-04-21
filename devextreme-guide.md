# DevExtreme setup — template replication guide

This document describes how **trade-order-nexus** wires **DevExtreme** into a **Vite + React + TypeScript** app so another developer can reproduce a similar template. It covers grids, supporting packages, state handling, and how the **evaluation license banner / watermark** is dealt with.

---

## 1. Packages and versions

From the root `package.json`:

| Package            | Role                                      |
|--------------------|-------------------------------------------|
| `devextreme`       | Core UI, DataGrid, exporters, themes      |
| `devextreme-react` | React wrappers (`devextreme-react/data-grid`, etc.) |

Pinned style in this repo: **`^25.1.5`** for both (align versions).

Additional libraries used **with** DevExtreme grids in this project (export paths):

- `exceljs`, `file-saver` — Excel export customization
- `jspdf`, `jspdf-autotable` — PDF export path used by hooks
- `devextreme/excel_exporter`, `devextreme/pdf_exporter` — official export helpers

---

## 2. How DevExtreme is used architecturally

### 2.1 Theme CSS

The **Fluent / generic light** theme is loaded where grids are mounted:

- **`devextreme/dist/css/dx.light.css`** is imported in shared grid wrappers (for example `DevExtremeAdvancedWrapper`, `DevExtremeOptimizedWrapper`, and some standalone grids).

For a minimal new page, importing the theme **once** at app entry or in a single layout component avoids duplicate CSS.

### 2.2 React integration pattern

The app does **not** scatter raw `DataGrid` configuration across every page. Instead it uses:

1. **Config + hooks** — `useDevExtreme` / `useDevExtremeAdvanced` (`src/hooks/`)  
   - Load / search / export  
   - Optional **custom `StateStoring`** backed by `userPreferenceService`  
   - Excel / PDF export orchestration  

2. **Presentational wrappers** — `DevExtremeAdvancedWrapper`, `DevExtremeOptimizedWrapper` (`src/components/common/`)  
   - Compose `devextreme-react/data-grid` subcomponents: `Column`, `Paging`, `Pager`, `SearchPanel`, `HeaderFilter`, `FilterRow`, `Export`, `Toolbar`, `StateStoring`, `ColumnChooser`, `Grouping`, `Summary`, `Selection`, `MasterDetail`, `RowDragging`, etc.  
   - Map app concepts (columns, actions column, toolbar items, permissions) into grid options  

3. **Page-level “advanced” components** — e.g. feature modules build a `DevExtremeAdvancedConfig<T>` and pass columns + handlers into the wrapper.

### 2.3 State persistence and robustness

- **`src/lib/devextremeStateUtils.ts`** — `sanitizeStateStoring()` used on save (and as a safety net on load) so persisted filter / state shapes stay compatible with DevExtreme’s internals (avoids runtime errors when restored state is not arrays where the grid expects arrays).

### 2.4 Other DevExtreme React imports in the codebase

Besides `data-grid`, pages use primitives such as:

- `devextreme-react/button`, `popup`, `select-box`, `text-box`, `load-indicator` in modals and toolbars.

### 2.5 `licenseKey` on components

`DataGrid` instances in wrappers set:

```tsx
licenseKey="non-commercial-and-evaluation"
```

That value is DevExtreme’s **non-commercial / evaluation** key string used in their docs for eligible non-commercial use. **It does not remove the on-screen evaluation watermark by itself** in all builds; the project adds separate UI mitigation (below).

---

## 3. Evaluation banner / watermark — what we use and where

DevExtreme can inject a **`dx-license`** element (evaluation / redistribution notice). This repo uses a **two-layer** approach.

### 3.1 Global CSS (`src/styles/devextreme-license-fix.css`)

Imported from **`src/main.tsx`**:

- Hides **`dx-license`** and **`.dx-license`** (and descendants) with `display: none !important`, off-screen positioning, etc.
- Also targets **`[data-permanent]`** with the same hiding rules (broad: any element with that attribute globally is affected).

### 3.2 Runtime utility (`src/utils/hideDevExtremeWatermark.ts`)

Called once from **`src/App.tsx`** inside `useEffect`:

- Tries to **click** likely “close” targets inside `dx-license` (heuristic selectors).
- Falls back to **inline styles** on `dx-license` and `[data-permanent]` nodes.
- Registers a **`MutationObserver`** on `document.body` to react when the node appears later.
- Uses **`setInterval`** (~1s) as a backstop.
- Returns a **cleanup** that disconnects the observer and clears the interval.

Entry wiring:

| File            | Responsibility                                      |
|-----------------|-----------------------------------------------------|
| `src/main.tsx`  | `import './styles/devextreme-license-fix.css'`    |
| `src/App.tsx`   | `useEffect` → `hideDevExtremeWatermark()` + cleanup |

---

## 4. How “clean” is this?

### 4.1 Application architecture (grids, hooks, wrappers)

**Relatively clean and reusable for a template:**

- Centralized grid behavior (export, state, loading) in hooks.
- Wrappers keep JSX for `Column` / toolbar / state storage consistent.
- Explicit sanitization for persisted grid state is a **good production habit**.

Caveats for a greenfield template:

- Some wrappers are **large**; you may split toolbar vs. grid vs. export for clarity.
- Import **`dx.light.css` only once** per app shell if you refactor.

### 4.2 Watermark / banner mitigation

**Technically layered (CSS + JS)** and **defensive** against late-mounted nodes, but **not “clean” from a product/licensing perspective:**

- Hiding or auto-closing the evaluation notice can **conflict with DevExpress license terms** if the app is **commercial** and not covered by a proper **DevExtreme license key** and agreement.
- The **`[data-permanent]`** CSS rule is **very broad** and could hide unrelated markup if your app or a library uses that attribute for something else.
- The **`setInterval`** + observer + console logging add **ongoing DOM work**; acceptable for a small app, worth revisiting if you move to an official key and no longer need mitigation.

**Recommended “clean” approach for a serious commercial template:** purchase **DevExtreme** and configure the **official commercial license key** per [DevExpress documentation](https://js.devexpress.com/React/Documentation/Guide/Common/Licensing/). Then remove watermark-specific CSS/JS if the banner no longer appears.

---

## 5. Checklist to replicate this template elsewhere

1. **Install:** `devextreme` + `devextreme-react` (same major/minor), plus export stack if you need Excel/PDF parity (`exceljs`, `file-saver`, `jspdf`, `jspdf-autotable`).
2. **Theme:** import `devextreme/dist/css/dx.light.css` once in the shell.
3. **Grids:** copy or reimplement `useDevExtreme` / `useDevExtremeAdvanced`, `devextremeStateUtils`, and one wrapper (`DevExtremeAdvancedWrapper` pattern).
4. **License:** decide **non-commercial evaluation** vs **paid license**; set `licenseKey` (or global `config`) per DevExpress guidance for your case.
5. **Watermark:** if you still need UI mitigation after licensing, prefer the **narrowest** CSS selectors possible and avoid global `[data-permanent]` unless you own that attribute across the app.

---

## 6. Related notes in this repo

- `DEVEXTREME_LICENSE_WATERMARK_FIX.md` — problem/solution narrative for the watermark.
- `DEVEXTREME_WATERMARK_CLICK_FIX.md` — selector details for the click-to-dismiss path.

Those files overlap with this guide; this document is the **single “template replication”** summary.
