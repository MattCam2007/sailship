/**
 * UI Components - Expandable panels and tabs
 */

/**
 * Initialize an expandable panel
 * @param {string} panelId - ID of the panel element
 * @param {boolean} defaultExpanded - Initial state (default: true)
 * @returns {Object} Panel control object with expand/collapse/toggle methods
 */
export function initExpandablePanel(panelId, defaultExpanded = true) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const header = panel.querySelector('.panel-header');
    const content = panel.querySelector('.panel-content');

    if (!header || !content) {
        console.warn(`[UI] Panel ${panelId} missing header or content`);
        return;
    }

    // Add expand indicator
    const indicator = document.createElement('span');
    indicator.className = 'expand-indicator';
    indicator.textContent = defaultExpanded ? '▼' : '►';
    header.insertBefore(indicator, header.firstChild);

    // Set initial state
    panel.classList.toggle('collapsed', !defaultExpanded);

    // Prevent rapid toggling with animation flag
    let isAnimating = false;

    // Click handler
    header.addEventListener('click', () => {
        if (isAnimating) return;

        const isExpanded = !panel.classList.contains('collapsed');
        panel.classList.toggle('collapsed', isExpanded);
        indicator.textContent = isExpanded ? '►' : '▼';
        savePanelState(panelId, !isExpanded);

        // Lock toggling during animation (300ms transition)
        isAnimating = true;
        setTimeout(() => { isAnimating = false; }, 300);
    });

    return {
        expand: () => { panel.classList.remove('collapsed'); indicator.textContent = '▼'; },
        collapse: () => { panel.classList.add('collapsed'); indicator.textContent = '►'; },
        toggle: () => header.click()
    };
}

/**
 * Save panel state to localStorage
 * @param {string} panelId - Panel ID
 * @param {boolean} expanded - Expanded state
 */
function savePanelState(panelId, expanded) {
    try {
        const state = JSON.parse(localStorage.getItem('panelState') || '{}');
        state[panelId] = expanded;
        localStorage.setItem('panelState', JSON.stringify(state));
    } catch (e) {
        // localStorage unavailable
    }
}

/**
 * Load panel state from localStorage
 * @param {string} panelId - Panel ID
 * @returns {boolean|undefined} Expanded state, or undefined if not saved
 */
export function loadPanelState(panelId) {
    try {
        const state = JSON.parse(localStorage.getItem('panelState') || '{}');
        return state[panelId];
    } catch (e) {
        return undefined;
    }
}

/**
 * Initialize a tab group
 * @param {string} containerId - ID of the container element
 * @param {string|null} defaultTab - Default tab to activate
 * @returns {Object} Tab control object with activateTab method
 */
export function initTabGroup(containerId, defaultTab = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const tabs = container.querySelectorAll('.tab-btn');
    const panels = container.querySelectorAll('.tab-panel');

    let isAnimating = false;

    function activateTab(tabId) {
        if (isAnimating) return;

        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
        panels.forEach(p => p.classList.toggle('active', p.id === `${tabId}Panel`));
        saveTabState(containerId, tabId);

        // Lock tab switching during animation (200ms fade in)
        isAnimating = true;
        setTimeout(() => { isAnimating = false; }, 200);
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => activateTab(tab.dataset.tab));
    });

    // Set initial tab
    const savedTab = loadTabState(containerId);
    const initialTab = savedTab || defaultTab || tabs[0]?.dataset.tab;
    if (initialTab) {
        // Don't lock on initial load
        isAnimating = false;
        activateTab(initialTab);
        isAnimating = false;
    }

    return { activateTab };
}

/**
 * Save tab state to localStorage
 * @param {string} containerId - Container ID
 * @param {string} tabId - Active tab ID
 */
function saveTabState(containerId, tabId) {
    try {
        const state = JSON.parse(localStorage.getItem('tabState') || '{}');
        state[containerId] = tabId;
        localStorage.setItem('tabState', JSON.stringify(state));
    } catch (e) {
        // localStorage unavailable
    }
}

/**
 * Load tab state from localStorage
 * @param {string} containerId - Container ID
 * @returns {string|undefined} Active tab ID, or undefined if not saved
 */
function loadTabState(containerId) {
    try {
        const state = JSON.parse(localStorage.getItem('tabState') || '{}');
        return state[containerId];
    } catch (e) {
        return undefined;
    }
}
