'use strict';
// Apply saved hub theme before first paint to avoid a flash of unstyled dark content.
try {
  if (localStorage.getItem('imktetris.theme') === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
} catch (e) {}
