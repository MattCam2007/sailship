/**
 * Theme Selector UI Component
 *
 * Modal interface for browsing, previewing, and applying themes.
 * Supports import/export of custom themes.
 */

import {
    getAvailableThemes,
    getActiveTheme,
    applyTheme,
    exportTheme,
    importTheme,
    deleteCustomTheme,
    resetToDefault
} from '../core/themeEngine.js';

// DOM elements
let modal, closeBtn, themeList, themePreview;
let applyBtn, exportBtn, importBtn, importFileInput, resetBtn;
let statusEl;

// Selection state
let selectedThemeName = null;

/**
 * Initialize theme selector
 * Call this once on page load
 */
export function initThemeSelector() {
    // Get DOM elements
    modal = document.getElementById('themeSelectorModal');
    closeBtn = document.getElementById('themeSelectorClose');
    themeList = document.getElementById('themeList');
    themePreview = document.getElementById('themePreview');
    applyBtn = document.getElementById('applyThemeBtn');
    exportBtn = document.getElementById('exportThemeBtn');
    importBtn = document.getElementById('importThemeBtn');
    importFileInput = document.getElementById('importThemeFile');
    resetBtn = document.getElementById('resetThemeBtn');
    statusEl = document.getElementById('themeSelectorStatus');

    if (!modal) {
        console.warn('Theme selector modal not found in DOM');
        return;
    }

    // Close button
    closeBtn?.addEventListener('click', closeThemeSelector);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeThemeSelector();
        }
    });

    // Close on ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeThemeSelector();
        }
    });

    // Apply button
    applyBtn?.addEventListener('click', handleApplyTheme);

    // Export button
    exportBtn?.addEventListener('click', handleExportTheme);

    // Import button
    importBtn?.addEventListener('click', () => {
        importFileInput?.click();
    });

    // Import file input
    importFileInput?.addEventListener('change', handleImportTheme);

    // Reset button
    resetBtn?.addEventListener('click', handleResetToDefault);
}

/**
 * Open theme selector modal
 */
export function openThemeSelector() {
    modal?.classList.add('active');
    renderThemeList();
    clearStatus();
}

/**
 * Close theme selector modal
 */
export function closeThemeSelector() {
    modal?.classList.remove('active');
    selectedThemeName = null;
    clearStatus();
}

/**
 * Render list of available themes
 */
async function renderThemeList() {
    if (!themeList) return;

    try {
        const themes = await getAvailableThemes();
        const activeTheme = getActiveTheme();
        const activeThemeName = activeTheme?.name;

        themeList.innerHTML = '';

        if (themes.length === 0) {
            themeList.innerHTML = '<div style="padding: 20px; text-align: center; color: rgba(255,255,255,0.5);">No themes available</div>';
            return;
        }

        themes.forEach(theme => {
            const item = document.createElement('div');
            item.className = 'theme-item';

            // Mark active and selected states
            if (theme.name === activeThemeName) {
                item.classList.add('active');
            }
            if (theme.name === selectedThemeName) {
                item.classList.add('selected');
            }

            // Build item HTML
            const badge = theme.builtin
                ? '<span class="theme-item-badge">BUILT-IN</span>'
                : '<span class="theme-item-badge custom">CUSTOM</span>';

            const tags = theme.tags && theme.tags.length > 0
                ? `<div class="theme-item-tags">${theme.tags.join(' • ')}</div>`
                : '';

            item.innerHTML = `
                <div class="theme-item-header">
                    <div class="theme-item-name">${theme.name}</div>
                    ${badge}
                </div>
                <div class="theme-item-desc">${theme.description || 'No description'}</div>
                ${tags}
            `;

            // Click to select
            item.addEventListener('click', () => {
                selectedThemeName = theme.name;
                renderThemeList(); // Re-render to update selection
                renderThemePreview(theme.name);
            });

            themeList.appendChild(item);
        });

        // Auto-select active theme if nothing selected
        if (!selectedThemeName && activeThemeName) {
            selectedThemeName = activeThemeName;
            renderThemePreview(activeThemeName);
        }

    } catch (err) {
        console.error('Failed to render theme list:', err);
        themeList.innerHTML = '<div style="padding: 20px; text-align: center; color: #e85d4c;">Failed to load themes</div>';
    }
}

/**
 * Render preview of selected theme
 */
async function renderThemePreview(themeName) {
    if (!themePreview) return;

    try {
        // Fetch theme data
        const themes = await getAvailableThemes();
        const themeInfo = themes.find(t => t.name === themeName);

        if (!themeInfo) {
            themePreview.innerHTML = '<div style="color: rgba(255,255,255,0.5);">Theme not found</div>';
            return;
        }

        // Load full theme definition to get colors
        // For now, show basic info
        themePreview.innerHTML = `
            <div class="theme-preview-colors">
                <div class="theme-preview-label">THEME: ${themeName}</div>
                <div style="color: rgba(255,255,255,0.6); font-size: 10px; margin-top: 10px;">
                    ${themeInfo.description || 'No description'}
                </div>
                <div style="color: rgba(255,255,255,0.5); font-size: 9px; margin-top: 10px;">
                    Author: ${themeInfo.author || 'Unknown'}
                </div>
                ${themeInfo.tags && themeInfo.tags.length > 0 ? `
                    <div style="color: rgba(76, 158, 232, 0.6); font-size: 9px; margin-top: 10px;">
                        Tags: ${themeInfo.tags.join(', ')}
                    </div>
                ` : ''}
            </div>
            <div style="color: rgba(255,255,255,0.4); font-size: 9px; margin-top: 20px;">
                Click APPLY to activate this theme
            </div>
        `;

    } catch (err) {
        console.error('Failed to render theme preview:', err);
        themePreview.innerHTML = '<div style="color: #e85d4c;">Preview unavailable</div>';
    }
}

/**
 * Handle apply theme button click
 */
async function handleApplyTheme() {
    if (!selectedThemeName) {
        showStatus('Please select a theme first', 'error');
        return;
    }

    try {
        showStatus('Applying theme...', 'success');
        await applyTheme(selectedThemeName);
        showStatus(`Theme applied: ${selectedThemeName}`, 'success');

        // Re-render to update active state
        setTimeout(() => {
            renderThemeList();
        }, 500);

    } catch (err) {
        console.error('Failed to apply theme:', err);
        showStatus(`Failed to apply theme: ${err.message}`, 'error');
    }
}

/**
 * Handle export theme button click
 */
async function handleExportTheme() {
    if (!selectedThemeName) {
        showStatus('Please select a theme first', 'error');
        return;
    }

    try {
        const jsonString = await exportTheme(selectedThemeName);

        // Create download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedThemeName.toLowerCase().replace(/\s+/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showStatus(`Theme exported: ${selectedThemeName}`, 'success');

    } catch (err) {
        console.error('Failed to export theme:', err);
        showStatus(`Failed to export theme: ${err.message}`, 'error');
    }
}

/**
 * Handle import theme file selection
 */
async function handleImportTheme(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();
        const themeName = await importTheme(text);

        showStatus(`Theme imported: ${themeName}`, 'success');

        // Re-render theme list to show imported theme
        await renderThemeList();

        // Auto-select imported theme
        selectedThemeName = themeName;
        renderThemePreview(themeName);

    } catch (err) {
        console.error('Failed to import theme:', err);
        showStatus(`Failed to import theme: ${err.message}`, 'error');
    } finally {
        // Reset file input
        importFileInput.value = '';
    }
}

/**
 * Handle reset to default button click
 */
async function handleResetToDefault() {
    const confirmed = confirm(
        'This will delete all custom themes and reset to Default Coral.\n\nAre you sure?'
    );

    if (!confirmed) return;

    try {
        resetToDefault();
        showStatus('Reset to default theme', 'success');

        // Re-render theme list
        selectedThemeName = 'Default Coral';
        await renderThemeList();
        renderThemePreview('Default Coral');

    } catch (err) {
        console.error('Failed to reset themes:', err);
        showStatus(`Failed to reset: ${err.message}`, 'error');
    }
}

/**
 * Show status message
 */
function showStatus(message, type = 'success') {
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.className = 'theme-selector-status ' + type;

    // Auto-hide after 3 seconds
    setTimeout(() => {
        clearStatus();
    }, 3000);
}

/**
 * Clear status message
 */
function clearStatus() {
    if (!statusEl) return;
    statusEl.textContent = '';
    statusEl.className = 'theme-selector-status';
}
