// js/utils.js
// Utility functions

/**
 * Show toast notification
 */
export function showToast(message, type = 'success', title = null) {
  const container = document.getElementById('toastContainer');

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const titleEl = document.createElement('div');
  titleEl.className = 'toast-title';
  titleEl.textContent = title || (type === 'success' ? 'SUCCESS' : type === 'error' ? 'ERROR' : 'WARNING');

  const messageEl = document.createElement('div');
  messageEl.className = 'toast-message';
  messageEl.textContent = message;

  toast.appendChild(titleEl);
  toast.appendChild(messageEl);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

/**
 * Show/hide loading overlay
 */
export function setLoading(isLoading, text = 'Processing transaction...') {
  const overlay = document.getElementById('loadingOverlay');
  const textEl = overlay.querySelector('.loading-text');

  if (isLoading) {
    textEl.textContent = text;
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

/**
 * Format Ethereum address (truncated)
 */
export function formatAddress(address) {
  if (!address) return '0x...';
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

/**
 * Format large numbers with commas
 */
export function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Convert wei to ether with specified decimals
 */
export function formatTokenAmount(wei, decimals = 18, displayDecimals = 2) {
  const divisor = Math.pow(10, decimals);
  const ether = parseFloat(wei) / divisor;
  return ether.toFixed(displayDecimals);
}

/**
 * Parse ether to wei
 */
export function parseTokenAmount(amount, decimals = 18) {
  const multiplier = Math.pow(10, decimals);
  return (parseFloat(amount) * multiplier).toString();
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard', 'success');
  } catch (error) {
    showToast('Failed to copy', 'error');
  }
}

/**
 * Create copy button
 */
export function createCopyButton(text) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-sm';
  btn.textContent = '📋';
  btn.title = 'Copy to clipboard';
  btn.onclick = () => copyToClipboard(text);
  return btn;
}
