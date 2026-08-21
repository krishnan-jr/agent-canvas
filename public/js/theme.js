/**
 * Theme controller — dark (default) / light / follow-system.
 *
 * The palette lives entirely in CSS custom properties; switching themes only
 * flips `data-theme` on <html>. The inline bootstrap in index.html applies the
 * stored choice before first paint, so this module never causes a flash.
 */

const STORAGE_KEY = 'agent-canvas:theme';
const MODES = ['system', 'dark', 'light'];

const systemQuery = window.matchMedia('(prefers-color-scheme: light)');

const ICONS = {
  dark: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  light: '<circle cx="12" cy="12" r="4.2"/><path d="M12 1.8v2.4M12 19.8v2.4M4.22 4.22l1.7 1.7M18.08 18.08l1.7 1.7M1.8 12h2.4M19.8 12h2.4M4.22 19.78l1.7-1.7M18.08 5.92l1.7-1.7"/>',
  system: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8.5 21h7M12 17v4"/>',
};

const LABELS = {
  system: 'Theme: System',
  dark: 'Theme: Dark',
  light: 'Theme: Light',
};

export class ThemeManager {
  constructor() {
    this.mode = ThemeManager.storedMode();
    this.button = document.getElementById('btn-theme-toggle');

    if (this.button) {
      this.button.addEventListener('click', () => this.cycle());
    }
    systemQuery.addEventListener('change', () => {
      if (this.mode === 'system') this.apply();
    });

    this.apply();
  }

  static storedMode() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return MODES.includes(stored) ? stored : 'system';
  }

  /** The theme actually rendered for the current mode. */
  get resolved() {
    if (this.mode === 'system') return systemQuery.matches ? 'light' : 'dark';
    return this.mode;
  }

  cycle() {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    localStorage.setItem(STORAGE_KEY, this.mode);
    this.apply();
  }

  set(mode) {
    if (!MODES.includes(mode)) return;
    this.mode = mode;
    localStorage.setItem(STORAGE_KEY, mode);
    this.apply();
  }

  apply() {
    const resolved = this.resolved;
    document.documentElement.setAttribute('data-theme', resolved);

    if (this.button) {
      const icon = this.mode === 'system' ? ICONS.system : ICONS[resolved];
      this.button.innerHTML =
        `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" `
        + `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`;
      this.button.title = `${LABELS[this.mode]} — click to switch`;
      this.button.setAttribute('aria-label', LABELS[this.mode]);
    }

    // Let canvas/minimap painters re-read their colours from the stylesheet.
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: resolved, mode: this.mode } }));
  }
}

/**
 * Read a themed colour out of the stylesheet. Used by code that paints to a
 * <canvas>, where CSS variables cannot be referenced directly.
 */
export function themeColor(name, fallback = '#64748b') {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
