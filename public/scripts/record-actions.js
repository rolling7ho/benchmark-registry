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

  function localizeDateTime(element) {
    const date = new Date(element.dateTime);
    if (Number.isNaN(date.getTime())) return;

    try {
      const dateAndTime = new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(date);
      const timeZoneName = new Intl.DateTimeFormat('en-US', {
        timeZoneName: 'short',
      })
        .formatToParts(date)
        .find(function (part) {
          return part.type === 'timeZoneName';
        });
      element.textContent = timeZoneName
        ? `${dateAndTime} ${timeZoneName.value}`
        : dateAndTime;
    } catch {
      // Keep the server-rendered PHT value when Intl is unavailable.
    }
  }

  document
    .querySelectorAll('time[data-local-datetime]')
    .forEach(function (element) {
      localizeDateTime(element);
    });

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
