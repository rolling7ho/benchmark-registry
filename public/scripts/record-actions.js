/* global document, navigator, window */

(function () {
  'use strict';

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (!copied) throw new Error('Copy command was rejected.');
  }

  function showResult(button, label) {
    const defaultLabel = button.dataset.defaultLabel || button.textContent;
    button.textContent = label;
    window.setTimeout(function () {
      button.textContent = defaultLabel;
    }, 1800);
  }

  document.addEventListener('click', async function (event) {
    const button = event.target.closest(
      'button[data-copy-value], button[data-share-url]',
    );
    if (!button) return;

    try {
      if (button.dataset.copyValue) {
        await copyText(button.dataset.copyValue);
        showResult(button, 'Copied');
        return;
      }

      const url = button.dataset.shareUrl;
      if (navigator.share) {
        await navigator.share({ title: button.dataset.shareTitle, url: url });
        return;
      }
      await copyText(url);
      showResult(button, 'URL copied');
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      showResult(button, 'Copy failed');
    }
  });
})();
