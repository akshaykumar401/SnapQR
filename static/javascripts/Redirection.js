/**
 * SnapQR - Redirection & Loading Screen Controller
 * Separated from Redirection.html
 */

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('redirectCard');
  if (!container) return;

  const targetUrl = container.getAttribute('data-target-url');
  const delaySec = parseInt(container.getAttribute('data-delay') || '3', 10);

  if (!targetUrl) return;

  const totalMs = Math.max(1, delaySec) * 1000;
  const startTime = Date.now();
  const progressFill = document.getElementById('progressFill');
  const countdownLabel = document.getElementById('countdownLabel');

  const timer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(100, (elapsed / totalMs) * 100);

    if (progressFill) {
      progressFill.style.width = progress + '%';
    }

    const remainingSec = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
    if (countdownLabel) {
      if (remainingSec > 0) {
        countdownLabel.textContent = `Redirecting in ${remainingSec}s...`;
      } else {
        countdownLabel.textContent = '✨ Opening destination now!';
      }
    }

    if (elapsed >= totalMs) {
      clearInterval(timer);
      window.location.replace(targetUrl);
    }
  }, 40);
});
