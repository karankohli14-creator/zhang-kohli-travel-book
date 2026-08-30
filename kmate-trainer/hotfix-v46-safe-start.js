/* K-Mate v46 safe start for iPhone and WebKit. */
(() => {
  'use strict';
  const VERSION = '46.0.0';
  const $ = (selector) => document.querySelector(selector);

  try {
    if (localStorage.getItem('kmate-v46-safe-start-migrated') !== '1') {
      ['kmate-generated-v23', 'kmate-generation-tree-v23', 'kmate-generation-counter-v23']
        .forEach((key) => localStorage.removeItem(key));
      localStorage.setItem('kmate-v46-safe-start-migrated', '1');
    }
  } catch {}

  function boardIsOpen() {
    return document.body.classList.contains('game-mode')
      && Boolean($('#gameView') && !$('#gameView').hidden)
      && document.querySelectorAll('#board .piece').length >= 2;
  }

  function resetButton(button) {
    if (!button) return;
    button.dataset.starting = '0';
    button.dataset.kmateStarting = '0';
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = 'Generate position';
  }

  function fail(button, message) {
    resetButton(button);
    const box = $('#loadError');
    if (box) {
      box.textContent = message;
      box.hidden = false;
      box.classList.add('show');
    }
  }

  function wire() {
    window.__KMATE_V45_HOTFIX__?.sanitize?.();
    const oldButton = $('#startButton');
    if (!oldButton || oldButton.dataset.kmateV46Wired === '1') return;
    const button = oldButton.cloneNode(true);
    button.dataset.kmateV45Wired = '1';
    button.dataset.kmateV46Wired = '1';
    resetButton(button);
    oldButton.replaceWith(button);

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (button.dataset.kmateStarting === '1' || boardIsOpen()) return;
      $('#loadError')?.classList.remove('show');
      button.dataset.kmateStarting = '1';
      button.dataset.starting = '1';
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Opening board…';

      requestAnimationFrame(() => setTimeout(() => {
        try {
          const start = window.__KMATE__?.startSafe;
          if (typeof start !== 'function') throw new Error('The safe position starter did not load.');
          start();
        } catch (error) {
          console.error('K-Mate v46 start failed.', error);
          fail(button, `The board could not open: ${error?.message || 'unknown error'}`);
          return;
        }
        setTimeout(() => {
          if (boardIsOpen()) resetButton(button);
          else fail(button, 'The board did not open. Reload this page once and try again.');
        }, 2200);
      }, 0));
    });
  }

  new MutationObserver(wire).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pageshow', wire);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wire(); });
  wire();
  setInterval(wire, 1200);
  window.__KMATE_V46__ = { version: VERSION, wire, boardIsOpen };
})();
