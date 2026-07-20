"use client";

import { useEffect } from "react";

/**
 * Global table column + row resizer with persistence.
 *
 * Automatically finds all <table> elements on the page and adds drag handles
 * to their <th> elements, allowing users to resize columns by dragging the
 * vertical edge between them. Also adds row-height drag handles so users can
 * resize row heights by dragging the horizontal edge between rows.
 *
 * Universal: resizing is available to ALL logged-in users (no permission
 * gate). This is a basic table-interaction feature, not a security-relevant
 * action, so every staff member can resize tables and have their preferences
 * persisted per-browser.
 *
 * Persistence:
 * - Each table's column widths AND row heights are saved to localStorage so
 *   they survive page switches / tab changes / browser refreshes.
 * - The storage key is derived from the current URL path + the table's
 *   position in the document (nth-of-type) + the number of columns + a
 *   stable hash of the header text. This keeps different tables on the same
 *   page separate, AND keeps the same table stable across visits even if
 *   other tables are added/removed above it.
 *
 * How it works:
 * 1. On mount, scans the document for <table> elements that have <thead><th>.
 * 2. For each table:
 *    - Computes a stable storage key.
 *    - Restores saved widths from localStorage if present (otherwise captures
 *      the current <th> widths as the initial defaults).
 *    - Switches the table to `table-layout: fixed` so column widths are
 *      strictly respected (required for resizing to work in both directions).
 *    - Sets the table's width to the sum of column widths so resizing one
 *      column doesn't shrink others (the table grows/shrinks instead).
 *    - Appends an 8px-wide drag handle to the right edge of each <th> (column
 *      resize) and a handle to the bottom edge of each body row's first cell
 *      (row resize).
 * 3. After each drag, saves the new widths/heights to localStorage (debounced).
 * 4. A MutationObserver (debounced) catches tables added dynamically (page
 *    switches, dialog opens, data loads) and enhances them too.
 *
 * Opt-out: add `data-no-resize` to a <table> to skip it.
 */
const STORAGE_PREFIX = "crm-col-widths:";
const ROW_STORAGE_PREFIX = "crm-row-heights:";
const RESIZER_WIDTH = 8; // px — width of the drag handle
const ROW_RESIZER_HEIGHT = 8; // px — height of the row drag handle
const MIN_COL_WIDTH = 50; // px — minimum column width when dragging
const MIN_ROW_HEIGHT = 24; // px — minimum row height when dragging

/** Read saved column widths for a storage key. Returns null if none/invalid. */
function readSavedWidths(key: string): number[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every((n) => typeof n === "number" && n > 0)) return null;
    return parsed as number[];
  } catch {
    return null;
  }
}

/** Save column widths for a storage key (debounced via caller). */
function writeSavedWidths(key: string, widths: number[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(widths));
  } catch {
    // best-effort — localStorage may be full or disabled
  }
}

/** Read saved row heights for a storage key. Returns null if none/invalid. */
function readSavedRowHeights(key: string): number[] | null {
  try {
    const raw = localStorage.getItem(ROW_STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every((n) => typeof n === "number" && n > 0)) return null;
    return parsed as number[];
  } catch {
    return null;
  }
}

/** Save row heights for a storage key (debounced via caller). */
function writeSavedRowHeights(key: string, heights: number[]) {
  try {
    localStorage.setItem(ROW_STORAGE_PREFIX + key, JSON.stringify(heights));
  } catch {
    // best-effort — localStorage may be full or disabled
  }
}

/** Compute a stable storage key for a table based on URL + position + headers. */
function computeTableKey(table: HTMLTableElement): string {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  // Position among all <table> elements in the document (1-based). This is
  // stable across re-renders but may shift if tables are added/removed
  // above — the header-hash below disambiguates further.
  const allTables = document.querySelectorAll("table");
  let nth = 0;
  for (let i = 0; i < allTables.length; i++) {
    if (allTables[i] === table) { nth = i + 1; break; }
  }

  // Header text hash — distinguishes tables with different columns even if
  // they're at the same nth position (e.g. when a dialog table replaces a
  // page table). Uses a simple djb2 hash.
  const ths = table.querySelectorAll("thead th");
  let headerStr = "";
  ths.forEach((th) => { headerStr += (th.textContent || "").trim() + "|"; });
  let hash = 5381;
  for (let i = 0; i < headerStr.length; i++) {
    hash = ((hash << 5) + hash) + headerStr.charCodeAt(i);
    hash |= 0;
  }
  const colCount = ths.length;

  return `${path}::t${nth}::c${colCount}::h${(hash >>> 0).toString(36)}`;
}

export function TableResizer() {
  useEffect(() => {
    const processedTables = new WeakSet<HTMLTableElement>();
    // Map each table element to its storage key + a debounce timer, so we can
    // save widths after each drag without thrashing localStorage.
    const tableKeyMap = new WeakMap<HTMLTableElement, string>();
    const tableSaveTimers = new WeakMap<HTMLTableElement, ReturnType<typeof setTimeout>>();
    // Separate debounce timer for row-height saves (different data, same table).
    const tableRowSaveTimers = new WeakMap<HTMLTableElement, ReturnType<typeof setTimeout>>();

    /** Add a drag handle to a <th> if it doesn't already have one. */
    function setupTh(table: HTMLTableElement, th: HTMLTableCellElement, colIdx: number) {
      // Idempotent: skip if a resizer already exists (React may re-render
      // the <th> and remove our handle, so we re-add it on each scan).
      if (th.querySelector("[data-col-resizer]")) return;

      // The <th> needs position:relative so the handle can be absolutely
      // positioned at its right edge.
      if (getComputedStyle(th).position === "static") {
        th.style.position = "relative";
      }

      const resizer = document.createElement("div");
      resizer.setAttribute("data-col-resizer", "true");
      Object.assign(resizer.style, {
        position: "absolute",
        top: "0",
        right: `-${RESIZER_WIDTH / 2}px`,
        width: `${RESIZER_WIDTH}px`,
        height: "100%",
        cursor: "col-resize",
        userSelect: "none",
        zIndex: "10",
        backgroundColor: "transparent",
      } as Partial<CSSStyleDeclaration>);

      // Hover highlight (only when not actively dragging).
      resizer.addEventListener("mouseenter", () => {
        if (resizer.dataset.draging !== "true") {
          resizer.style.backgroundColor = "rgba(16, 185, 129, 0.35)";
        }
      });
      resizer.addEventListener("mouseleave", () => {
        if (resizer.dataset.draging !== "true") {
          resizer.style.backgroundColor = "transparent";
        }
      });

      // Start dragging.
      resizer.addEventListener("mousedown", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizer.dataset.draging = "true";
        resizer.style.backgroundColor = "rgba(16, 185, 129, 0.6)";

        const startX = e.clientX;
        const startWidth = th.offsetWidth;
        const startTableWidth = table.offsetWidth;

        // Set a global col-resize cursor so it stays consistent even when the
        // mouse moves outside the handle.
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const onMove = (ev: MouseEvent) => {
          const delta = ev.clientX - startX;
          const newWidth = Math.max(MIN_COL_WIDTH, startWidth + delta);
          th.style.width = `${newWidth}px`;
          // Grow/shrink the table by the same delta so sibling columns keep
          // their widths. If the table overflows its container, the
          // container's `overflow-x-auto` provides horizontal scrolling.
          const newTableWidth = Math.max(MIN_COL_WIDTH, startTableWidth + delta);
          table.style.width = `${newTableWidth}px`;
        };
        const onUp = () => {
          resizer.dataset.draging = "false";
          resizer.style.backgroundColor = "transparent";
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          // Persist the new widths (debounced).
          scheduleSave(table);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });

      // Prevent the click event (which fires after mouseup) from reaching the
      // <th> — e.g. don't trigger sort when the user was dragging the edge.
      resizer.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      th.appendChild(resizer);
    }

    /** Debounced save of a table's current column widths to localStorage. */
    function scheduleSave(table: HTMLTableElement) {
      const key = tableKeyMap.get(table);
      if (!key) return;
      const existing = tableSaveTimers.get(table);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        const ths = table.querySelectorAll("thead th");
        const widths = Array.from(ths).map((th) => (th as HTMLElement).offsetWidth);
        if (widths.length > 0) writeSavedWidths(key, widths);
        tableSaveTimers.delete(table);
      }, 300);
      tableSaveTimers.set(table, timer);
    }

    /** Add a horizontal drag handle to a <td> so the user can resize its row's
     *  height by dragging the bottom edge. The handle sits at the cell's bottom
     *  edge (full cell width). Since all cells in a <tr> share the row height,
     *  dragging any cell's handle resizes the whole row. */
    function setupTd(table: HTMLTableElement, td: HTMLTableCellElement) {
      // Idempotent: skip if a row resizer already exists.
      if (td.querySelector("[data-row-resizer]")) return;

      // The <td> needs position:relative so the handle can be absolutely
      // positioned at its bottom edge.
      if (getComputedStyle(td).position === "static") {
        td.style.position = "relative";
      }

      const resizer = document.createElement("div");
      resizer.setAttribute("data-row-resizer", "true");
      Object.assign(resizer.style, {
        position: "absolute",
        left: "0",
        bottom: `-${ROW_RESIZER_HEIGHT / 2}px`,
        width: "100%",
        height: `${ROW_RESIZER_HEIGHT}px`,
        cursor: "row-resize",
        userSelect: "none",
        zIndex: "10",
        backgroundColor: "transparent",
      } as Partial<CSSStyleDeclaration>);

      // Hover highlight (only when not actively dragging).
      resizer.addEventListener("mouseenter", () => {
        if (resizer.dataset.draging !== "true") {
          resizer.style.backgroundColor = "rgba(16, 185, 129, 0.35)";
        }
      });
      resizer.addEventListener("mouseleave", () => {
        if (resizer.dataset.draging !== "true") {
          resizer.style.backgroundColor = "transparent";
        }
      });

      // Start dragging the row's bottom edge.
      resizer.addEventListener("mousedown", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizer.dataset.draging = "true";
        resizer.style.backgroundColor = "rgba(16, 185, 129, 0.6)";

        const tr = td.closest("tr");
        if (!tr) {
          resizer.dataset.draging = "false";
          resizer.style.backgroundColor = "transparent";
          return;
        }
        const startY = e.clientY;
        const startHeight = tr.offsetHeight;
        // All <td>/<th> in the row get an explicit height so the resize sticks
        // (a <tr>'s height alone isn't always honored by the browser).
        const cells = Array.from(tr.querySelectorAll("td, th")) as HTMLElement[];

        // Set a global row-resize cursor so it stays consistent even when the
        // mouse moves outside the handle.
        document.body.style.cursor = "row-resize";
        document.body.style.userSelect = "none";

        const onMove = (ev: MouseEvent) => {
          const delta = ev.clientY - startY;
          const newHeight = Math.max(MIN_ROW_HEIGHT, startHeight + delta);
          // Apply to the <tr> and every cell so the height is strictly enforced.
          tr.style.height = `${newHeight}px`;
          cells.forEach((c) => { c.style.height = `${newHeight}px`; });
        };
        const onUp = () => {
          resizer.dataset.draging = "false";
          resizer.style.backgroundColor = "transparent";
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          // Persist the new row heights (debounced).
          scheduleRowSave(table);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });

      // Prevent the click event from reaching the <td> (e.g. don't open a row
      // detail when the user was dragging the edge).
      resizer.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      td.appendChild(resizer);
    }

    /** Debounced save of a table's current row heights to localStorage. */
    function scheduleRowSave(table: HTMLTableElement) {
      const key = tableKeyMap.get(table);
      if (!key) return;
      const existing = tableRowSaveTimers.get(table);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        const rows = table.querySelectorAll("tbody tr");
        const heights = Array.from(rows).map((tr) => (tr as HTMLElement).offsetHeight);
        if (heights.length > 0) writeSavedRowHeights(key, heights);
        tableRowSaveTimers.delete(table);
      }, 300);
      tableRowSaveTimers.set(table, timer);
    }

    /** Enhance a <table> with resizable columns. */
    function setupTable(table: HTMLTableElement) {
      // Opt-out via data attribute.
      if (table.hasAttribute("data-no-resize")) return;
      const ths = table.querySelectorAll("thead th");
      if (ths.length === 0) return; // skip tables without headers

      if (!processedTables.has(table)) {
        processedTables.add(table);
        table.setAttribute("data-resizable", "true");

        // Compute + cache the storage key for this table.
        const key = computeTableKey(table);
        tableKeyMap.set(table, key);

        // Try to restore saved widths; fall back to capturing the current
        // offsetWidth (computed by the browser from CSS) as defaults.
        let widths = readSavedWidths(key);
        if (!widths || widths.length !== ths.length) {
          // Capture offsetWidth BEFORE switching to fixed layout — otherwise
          // the browser may report different widths.
          widths = Array.from(ths).map((th) => (th as HTMLElement).offsetWidth);
        }
        const totalWidth = widths.reduce((s, w) => s + w, 0);

        // Fixed layout is required so column widths are strictly respected
        // (auto layout treats `width` as a suggestion and may override it).
        table.style.tableLayout = "fixed";
        table.style.width = `${totalWidth}px`;

        ths.forEach((th, i) => {
          (th as HTMLTableCellElement).style.width = `${widths![i]}px`;
        });
      }

      // Always (re)add missing column drag handles. React may remove them when
      // re-rendering the <th>'s children.
      ths.forEach((th, i) => setupTh(table, th as HTMLTableCellElement, i));

      // Restore saved row heights + add ONE row-resize drag handle per body
      // row, on its FIRST <td> only (one handle per row is enough — the user
      // grabs the first column's bottom edge to resize the whole row). Saved
      // heights are applied per-row by index; if the saved count doesn't match
      // the current row count (data changed), skip restoration (defaults remain).
      const key = tableKeyMap.get(table);
      const bodyRows = table.querySelectorAll("tbody tr");
      if (key && bodyRows.length > 0) {
        const savedHeights = readSavedRowHeights(key);
        if (savedHeights && savedHeights.length === bodyRows.length) {
          bodyRows.forEach((tr, ri) => {
            const h = savedHeights[ri];
            (tr as HTMLElement).style.height = `${h}px`;
            tr.querySelectorAll("td, th").forEach((c) => {
              (c as HTMLElement).style.height = `${h}px`;
            });
          });
        }
        // Add a row-resize handle ONLY to the first <td> of each body row.
        bodyRows.forEach((tr) => {
          const firstTd = tr.querySelector("td");
          if (firstTd) setupTd(table, firstTd as HTMLTableCellElement);
        });
      }
    }

    // ---- CSS-grid "tables" (data-grid-resizable) ----
    // Layouts like the booking View nhân viên / View khách hàng use <div>
    // grids (grid-template-columns) instead of <table>. They share the same
    // structure: a header grid-row + body grid-rows, all using the same
    // gridTemplateColumns. We enhance them the same way: column drag handles
    // on the header cells + a row drag handle on the first cell of each body
    // row. Column resizes update gridTemplateColumns on EVERY grid-row.

    /** Compute a stable storage key for a grid table (same scheme as <table>). */
    function computeGridKey(root: HTMLElement): string {
      const path = window.location.pathname.replace(/\/+$/, "") || "/";
      // Position among all [data-grid-resizable] in the document.
      const all = document.querySelectorAll("[data-grid-resizable]");
      let nth = 0;
      for (let i = 0; i < all.length; i++) {
        if (all[i] === root) { nth = i + 1; break; }
      }
      // Header text hash.
      const headerRow = root.querySelector('[data-grid-header]') || root.firstElementChild;
      const headerCells = headerRow ? headerRow.children : [];
      let headerStr = "";
      for (let i = 0; i < headerCells.length; i++) {
        headerStr += (headerCells[i].textContent || "").trim() + "|";
      }
      let hash = 5381;
      for (let i = 0; i < headerStr.length; i++) {
        hash = ((hash << 5) + hash) + headerStr.charCodeAt(i);
        hash |= 0;
      }
      const colCount = headerCells.length;
      return `${path}::g${nth}::c${colCount}::h${(hash >>> 0).toString(36)}`;
    }

    /** Find all grid-rows in a grid table (header + body rows). A grid-row is a
     *  direct child whose computed gridTemplateColumns is set (not 'none'). */
    function findGridRows(root: HTMLElement): HTMLElement[] {
      const rows: HTMLElement[] = [];
      // The header is marked [data-grid-header]; body rows are children of the
      // [data-grid-body] container. Fall back to scanning all descendants.
      const header = root.querySelector("[data-grid-header]");
      if (header) rows.push(header as HTMLElement);
      const body = root.querySelector("[data-grid-body]");
      if (body) {
        for (let i = 0; i < body.children.length; i++) {
          rows.push(body.children[i] as HTMLElement);
        }
      }
      return rows;
    }

    /** Add a column-resize drag handle to a grid header cell. `colIdx` is the
     *  0-based column index; `colWidthsRef` is the shared widths array. */
    function setupGridHeaderCell(
      root: HTMLElement,
      cell: HTMLElement,
      colIdx: number,
      rows: HTMLElement[],
      getColWidths: () => number[],
      setColWidth: (idx: number, w: number) => void,
    ) {
      if (cell.querySelector("[data-col-resizer]")) return;
      if (getComputedStyle(cell).position === "static") cell.style.position = "relative";

      const resizer = document.createElement("div");
      resizer.setAttribute("data-col-resizer", "true");
      Object.assign(resizer.style, {
        position: "absolute", top: "0", right: `-${RESIZER_WIDTH / 2}px`,
        width: `${RESIZER_WIDTH}px`, height: "100%", cursor: "col-resize",
        userSelect: "none", zIndex: "30", backgroundColor: "transparent",
      } as Partial<CSSStyleDeclaration>);
      resizer.addEventListener("mouseenter", () => {
        if (resizer.dataset.draging !== "true") resizer.style.backgroundColor = "rgba(16,185,129,0.35)";
      });
      resizer.addEventListener("mouseleave", () => {
        if (resizer.dataset.draging !== "true") resizer.style.backgroundColor = "transparent";
      });
      resizer.addEventListener("mousedown", (e: MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        resizer.dataset.draging = "true";
        resizer.style.backgroundColor = "rgba(16,185,129,0.6)";
        const startX = e.clientX;
        const colWidths = getColWidths();
        const startWidth = colWidths[colIdx] || cell.offsetWidth;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        const onMove = (ev: MouseEvent) => {
          const delta = ev.clientX - startX;
          const newWidth = Math.max(MIN_COL_WIDTH, startWidth + delta);
          setColWidth(colIdx, newWidth);
          // Rebuild gridTemplateColumns for ALL rows so they stay in sync.
          const updatedWidths = getColWidths();
          const template = updatedWidths.map((w) => `${w}px`).join(" ");
          rows.forEach((r) => { r.style.gridTemplateColumns = template; });
        };
        const onUp = () => {
          resizer.dataset.draging = "false";
          resizer.style.backgroundColor = "transparent";
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          scheduleGridSave(root);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
      resizer.addEventListener("click", (e) => e.stopPropagation());
      cell.appendChild(resizer);
    }

    /** Add a row-resize drag handle to a grid body cell's bottom edge. */
    function setupGridBodyCell(cell: HTMLElement, row: HTMLElement, root: HTMLElement) {
      if (cell.querySelector("[data-row-resizer]")) return;
      if (getComputedStyle(cell).position === "static") cell.style.position = "relative";

      const resizer = document.createElement("div");
      resizer.setAttribute("data-row-resizer", "true");
      Object.assign(resizer.style, {
        position: "absolute", left: "0", bottom: `-${ROW_RESIZER_HEIGHT / 2}px`,
        width: "100%", height: `${ROW_RESIZER_HEIGHT}px`, cursor: "row-resize",
        userSelect: "none", zIndex: "30", backgroundColor: "transparent",
      } as Partial<CSSStyleDeclaration>);
      resizer.addEventListener("mouseenter", () => {
        if (resizer.dataset.draging !== "true") resizer.style.backgroundColor = "rgba(16,185,129,0.35)";
      });
      resizer.addEventListener("mouseleave", () => {
        if (resizer.dataset.draging !== "true") resizer.style.backgroundColor = "transparent";
      });
      resizer.addEventListener("mousedown", (e: MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        resizer.dataset.draging = "true";
        resizer.style.backgroundColor = "rgba(16,185,129,0.6)";
        const startY = e.clientY;
        const startHeight = row.offsetHeight;
        const cells = Array.from(row.children) as HTMLElement[];
        document.body.style.cursor = "row-resize";
        document.body.style.userSelect = "none";
        const onMove = (ev: MouseEvent) => {
          const delta = ev.clientY - startY;
          const newHeight = Math.max(MIN_ROW_HEIGHT, startHeight + delta);
          row.style.height = `${newHeight}px`;
          cells.forEach((c) => { c.style.height = `${newHeight}px`; });
        };
        const onUp = () => {
          resizer.dataset.draging = "false";
          resizer.style.backgroundColor = "transparent";
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          scheduleGridRowSave(root);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
      resizer.addEventListener("click", (e) => e.stopPropagation());
      cell.appendChild(resizer);
    }

    /** Debounced save of a grid table's column widths. */
    function scheduleGridSave(root: HTMLElement) {
      const key = tableKeyMap.get(root);
      if (!key) return;
      const existing = tableSaveTimers.get(root);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        const rows = findGridRows(root);
        const header = rows[0];
        if (!header) return;
        const widths = Array.from(header.children).map((c) => (c as HTMLElement).offsetWidth);
        if (widths.length > 0) writeSavedWidths(key, widths);
        tableSaveTimers.delete(root);
      }, 300);
      tableSaveTimers.set(root, timer);
    }

    /** Debounced save of a grid table's row heights. */
    function scheduleGridRowSave(root: HTMLElement) {
      const key = tableKeyMap.get(root);
      if (!key) return;
      const existing = tableRowSaveTimers.get(root);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        const rows = findGridRows(root);
        // body rows = all except header (index 0)
        const heights = rows.slice(1).map((r) => r.offsetHeight);
        if (heights.length > 0) writeSavedRowHeights(key, heights);
        tableRowSaveTimers.delete(root);
      }, 300);
      tableRowSaveTimers.set(root, timer);
    }

    /** Enhance a CSS-grid "table" with resizable columns + rows. */
    function setupGridTable(root: HTMLElement) {
      if (root.hasAttribute("data-no-resize")) return;
      const rows = findGridRows(root);
      if (rows.length < 1) return;
      const header = rows[0];
      const headerCells = Array.from(header.children) as HTMLElement[];
      if (headerCells.length === 0) return;

      let key = tableKeyMap.get(root);
      if (!processedTables.has(root)) {
        processedTables.add(root);
        root.setAttribute("data-resizable", "true");
        key = computeGridKey(root);
        tableKeyMap.set(root, key);

        // Freeze columns to explicit pixel widths (capture offsetWidth before
        // overriding gridTemplateColumns). Restore saved widths if available.
        let widths = readSavedWidths(key);
        if (!widths || widths.length !== headerCells.length) {
          widths = headerCells.map((c) => c.offsetWidth);
        }
        // Hold the live widths in a closure so drag handlers can read/update.
        const colWidths = widths.slice();
        const getColWidths = () => colWidths;
        const setColWidth = (idx: number, w: number) => { colWidths[idx] = w; };
        // Apply the frozen template to EVERY grid-row so they stay in sync.
        const applyTemplate = () => {
          const template = colWidths.map((w) => `${w}px`).join(" ");
          rows.forEach((r) => { r.style.gridTemplateColumns = template; });
        };
        applyTemplate();
        // Also set the outer width so horizontal scroll works when columns grow.
        // (Only relevant when the grid is inside an overflow-auto container.)

        // Restore saved row heights.
        const savedHeights = readSavedRowHeights(key);
        if (savedHeights && savedHeights.length === rows.length - 1) {
          for (let ri = 1; ri < rows.length; ri++) {
            const h = savedHeights[ri - 1];
            const r = rows[ri];
            r.style.height = `${h}px`;
            Array.from(r.children).forEach((c) => { (c as HTMLElement).style.height = `${h}px`; });
          }
        }

        // Store the closures on the root so re-scans (React re-renders) reuse
        // the SAME colWidths array — otherwise each scan would create a new
        // array and the widths would reset to offsetWidth every time.
        (root as unknown as { __gridColWidths?: number[]; __gridGetColWidths?: () => number[]; __gridSetColWidth?: (i: number, w: number) => void; }).__gridColWidths = colWidths;
        (root as unknown as { __gridGetColWidths?: () => number[] }).__gridGetColWidths = getColWidths;
        (root as unknown as { __gridSetColWidth?: (i: number, w: number) => void }).__gridSetColWidth = setColWidth;

        // Add column drag handles to each header cell.
        headerCells.forEach((cell, ci) => {
          setupGridHeaderCell(root, cell, ci, rows, getColWidths, setColWidth);
        });
        // Add a row-resize handle to the FIRST cell of each body row.
        for (let ri = 1; ri < rows.length; ri++) {
          const firstCell = rows[ri].firstElementChild as HTMLElement | null;
          if (firstCell) setupGridBodyCell(firstCell, rows[ri], root);
        }
      } else {
        // Already processed — just re-add handles React may have removed, and
        // re-sync the gridTemplateColumns from the cached widths.
        const cached = (root as unknown as { __gridGetColWidths?: () => number[]; __gridSetColWidth?: (i: number, w: number) => void }).__gridGetColWidths;
        const setCached = (root as unknown as { __gridSetColWidth?: (i: number, w: number) => void }).__gridSetColWidth;
        if (cached && setCached) {
          const template = cached().map((w) => `${w}px`).join(" ");
          rows.forEach((r) => { r.style.gridTemplateColumns = template; });
          headerCells.forEach((cell, ci) => {
            setupGridHeaderCell(root, cell, ci, rows, cached, setCached);
          });
          for (let ri = 1; ri < rows.length; ri++) {
            const firstCell = rows[ri].firstElementChild as HTMLElement | null;
            if (firstCell) setupGridBodyCell(firstCell, rows[ri], root);
          }
        }
      }
    }

    /** Scan a root element for tables and enhance them. */
    function scan(root: ParentNode) {
      const tables = root.querySelectorAll?.("table");
      if (tables) {
        tables.forEach((t) => {
          try {
            setupTable(t as HTMLTableElement);
          } catch {
            // best-effort — skip tables that throw (e.g. detached nodes)
          }
        });
      }
      // Also enhance CSS-grid "tables" marked with data-grid-resizable.
      const grids = root.querySelectorAll?.("[data-grid-resizable]");
      if (grids) {
        grids.forEach((g) => {
          try {
            setupGridTable(g as HTMLElement);
          } catch {
            // best-effort
          }
        });
      }
    }

    // Initial scan (deferred to next tick so React has rendered tables).
    const initialTimer = setTimeout(() => scan(document), 0);

    // Debounced MutationObserver to catch dynamically-added tables (page
    // switches, dialog opens, async data loads that add <thead><th>).
    let scanTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (scanTimer) return;
      scanTimer = setTimeout(() => {
        scanTimer = null;
        scan(document);
      }, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      clearTimeout(initialTimer);
      if (scanTimer) clearTimeout(scanTimer);
    };
  }, []);

  return (
    <style>{`
      /* ===========================================================
         Column-resize visual hints (right edge of each <th>)
         - Always-visible subtle grip line so users can discover the
           drag handle.
         - Brightens to green on hover for clear "you can drag this"
           feedback.
         =========================================================== */
      table[data-resizable] thead th {
        position: relative;
      }
      table[data-resizable] thead th::after {
        content: "";
        position: absolute;
        top: 15%;
        right: 0;
        width: 3px;
        height: 70%;
        background-color: rgba(15, 23, 42, 0.16);
        border-radius: 2px;
        pointer-events: none;
        z-index: 5;
        transition: background-color 0.15s ease, width 0.15s ease;
      }
      /* Hover the <th> (or the resizer div inside it) → highlight the grip. */
      table[data-resizable] thead th:hover::after {
        background-color: rgba(16, 185, 129, 0.7);
        width: 4px;
      }
      /* Prevent content from visually overflowing when a column is resized
         very narrow — most cells already use truncate, but this is a
         safety net. */
      table[data-resizable] td > * {
        max-width: 100%;
      }
      /* ===========================================================
         Row-resize visual hints (bottom edge of each body row's FIRST
         cell — that's where the row-resize handle lives).
         =========================================================== */
      table[data-resizable] tbody td {
        position: relative;
      }
      table[data-resizable] tbody tr td:first-child::after {
        content: "";
        position: absolute;
        left: 15%;
        bottom: 0;
        width: 70%;
        height: 3px;
        background-color: rgba(15, 23, 42, 0.16);
        border-radius: 2px;
        pointer-events: none;
        z-index: 5;
        transition: background-color 0.15s ease, height 0.15s ease;
      }
      /* Hover the first cell (or the resizer inside it) → highlight. */
      table[data-resizable] tbody tr td:first-child:hover::after {
        background-color: rgba(16, 185, 129, 0.7);
        height: 4px;
      }
      /* ===========================================================
         CSS-grid "tables" (data-grid-resizable) — same grip hints.
         Vertical grip on header cells' right edge (column resize),
         horizontal grip on each body row's first cell bottom edge.
         =========================================================== */
      [data-grid-resizable] [data-grid-header] > * {
        position: relative;
      }
      [data-grid-resizable] [data-grid-header] > *::after {
        content: "";
        position: absolute;
        top: 15%;
        right: 0;
        width: 3px;
        height: 70%;
        background-color: rgba(15, 23, 42, 0.16);
        border-radius: 2px;
        pointer-events: none;
        z-index: 5;
        transition: background-color 0.15s ease, width 0.15s ease;
      }
      [data-grid-resizable] [data-grid-header] > *:hover::after {
        background-color: rgba(16, 185, 129, 0.7);
        width: 4px;
      }
      [data-grid-resizable] [data-grid-body] > * > * {
        position: relative;
      }
      [data-grid-resizable] [data-grid-body] > * > *:first-child::after {
        content: "";
        position: absolute;
        left: 15%;
        bottom: 0;
        width: 70%;
        height: 3px;
        background-color: rgba(15, 23, 42, 0.16);
        border-radius: 2px;
        pointer-events: none;
        z-index: 5;
        transition: background-color 0.15s ease, height 0.15s ease;
      }
      [data-grid-resizable] [data-grid-body] > * > *:first-child:hover::after {
        background-color: rgba(16, 185, 129, 0.7);
        height: 4px;
      }
      /* Dark-mode: the slate grip lines are hard to see on dark backgrounds,
         so switch to a light translucent grip. */
      @media (prefers-color-scheme: dark) {
        table[data-resizable] thead th::after,
        table[data-resizable] tbody tr td:first-child::after,
        [data-grid-resizable] [data-grid-header] > *::after,
        [data-grid-resizable] [data-grid-body] > * > *:first-child::after {
          background-color: rgba(255, 255, 255, 0.22);
        }
      }
    `}</style>
  );
}
