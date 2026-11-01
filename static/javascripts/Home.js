/**
 * SnapQR - Interactive Dynamic QR Studio Script
 * MongoDB Backend Integration
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Inputs
  const targetUrlInput = document.getElementById('targetUrl');
  const loadingMsgInput = document.getElementById('loadingMessage');
  const loadingSubtextInput = document.getElementById('loadingSubtext');
  const redirectDelaySelect = document.getElementById('redirectDelay');
  const spinnerStyleSelect = document.getElementById('spinnerStyle');
  const qrTitleInput = document.getElementById('qrTitle');
  const fgColorInput = document.getElementById('fgColor');
  const bgColorInput = document.getElementById('bgColor');
  const fgHexLabel = document.getElementById('fgHex');
  const bgHexLabel = document.getElementById('bgHex');
  const includeLogoCheckbox = document.getElementById('includeLogo');
  const qrResolutionSelect = document.getElementById('qrResolution');
  const eccLevelSelect = document.getElementById('eccLevel');

  // DOM Elements - QR Stage & Preview
  const qrCanvas = document.getElementById('qrCanvas');
  const qrTitleDisplay = document.getElementById('qrTitleDisplay');
  const qrLogoOverlay = document.getElementById('qrLogoOverlay');
  const qrStage = document.getElementById('qrStage');
  const loadingSimulator = document.getElementById('loadingSimulator');

  // DOM Elements - Loading Simulator
  const simMessage = document.getElementById('simMessage');
  const simSubtext = document.getElementById('simSubtext');
  const simTargetUrl = document.getElementById('simTargetUrl');
  const simSpinnerContainer = document.getElementById('simSpinnerContainer');

  // DOM Elements - Saved in MongoDB Box
  const savedMongoInfo = document.getElementById('savedMongoInfo');
  const generatedShortUrlInput = document.getElementById('generatedShortUrl');
  const scanCountBadge = document.getElementById('scanCountBadge');
  const copyShortUrlBtn = document.getElementById('copyShortUrlBtn');
  const testShortUrlLink = document.getElementById('testShortUrlLink');

  // DOM Elements - Tabs & Modals
  const tabQrBtn = document.getElementById('tabQr');
  const tabLoadingBtn = document.getElementById('tabLoading');
  const toastMsg = document.getElementById('toastMsg');
  const simModal = document.getElementById('simModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalSimMessage = document.getElementById('modalSimMessage');
  const modalSimSubtext = document.getElementById('modalSimSubtext');
  const modalCountdown = document.getElementById('modalCountdown');
  const modalSpinner = document.getElementById('modalSpinner');
  const modalDestination = document.getElementById('modalDestination');

  // Buttons
  const generateBtn = document.getElementById('btnGenerate');
  const resetBtn = document.getElementById('btnReset');
  const downloadPngBtn = document.getElementById('downloadPng');
  const downloadSvgBtn = document.getElementById('downloadSvg');
  const copyLinkBtn = document.getElementById('copyLink');
  const testSimBtn = document.getElementById('testSim');
  const qrStudioForm = document.getElementById('qrStudioForm');

  if (qrStudioForm) {
    qrStudioForm.addEventListener('submit', (e) => e.preventDefault());
  }

  let currentEncodedUrl = targetUrlInput.value.trim() || 'https://snapqr.dev/showcase';
  let countdownInterval = null;

  // --- Show Toast Notification ---
  function showToast(message, isError = false) {
    if (!toastMsg) return;
    const icon = isError ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check';
    const colorClass = isError ? 'text-accent' : 'text-primary';
    toastMsg.innerHTML = `<i class="${icon} ${colorClass}"></i> ${message}`;
    toastMsg.classList.add('show');
    setTimeout(() => {
      toastMsg.classList.remove('show');
    }, 3200);
  }

  // --- Update Spinner in Preview ---
  function updateSpinnerStyle(container, style) {
    if (!container) return;
    container.innerHTML = '';
    const spinner = document.createElement('div');
    if (style === 'pulse') {
      spinner.className = 'spinner-pulse';
    } else if (style === 'orbit') {
      spinner.className = 'spinner-orbit';
    } else {
      spinner.className = 'spinner-dual-ring';
    }
    container.appendChild(spinner);
  }

  // --- Generate / Update QR Code Canvas ---
  function renderQrCode(urlToEncode = null) {
    const rawUrl = urlToEncode || currentEncodedUrl || targetUrlInput.value.trim() || 'https://snapqr.dev';
    const fgColor = fgColorInput.value || '#9FA0FF';
    const bgColor = bgColorInput.value || '#ffffff';
    const title = qrTitleInput.value.trim();
    const ecc = eccLevelSelect.value || 'H';

    // Update Title Display
    if (qrTitleDisplay) {
      if (title) {
        qrTitleDisplay.textContent = title;
        qrTitleDisplay.style.display = 'block';
      } else {
        qrTitleDisplay.style.display = 'none';
      }
    }

    // Toggle Logo Overlay
    if (qrLogoOverlay) {
      qrLogoOverlay.style.display = includeLogoCheckbox.checked ? 'flex' : 'none';
    }

    // Check if QRCode library is loaded
    if (window.QRCode && window.QRCode.toCanvas) {
      window.QRCode.toCanvas(qrCanvas, rawUrl, {
        width: 250,
        margin: 2,
        color: {
          dark: fgColor,
          light: bgColor
        },
        errorCorrectionLevel: ecc
      }, (err) => {
        if (err) console.error('QR Render Error:', err);
      });
    } else {
      // Retry once library is parsed, or fallback to Flask backend rendering
      setTimeout(() => {
        if (window.QRCode && window.QRCode.toCanvas) {
          window.QRCode.toCanvas(qrCanvas, rawUrl, {
            width: 250,
            margin: 2,
            color: { dark: fgColor, light: bgColor },
            errorCorrectionLevel: ecc
          });
        } else {
          // Robust fallback to Flask backend QR image
          const fallbackImg = new Image();
          fallbackImg.onload = () => {
            const ctx = qrCanvas.getContext('2d');
            qrCanvas.width = 250;
            qrCanvas.height = 250;
            ctx.drawImage(fallbackImg, 0, 0, 250, 250);
          };
          fallbackImg.src = `/api/download-qr?url=${encodeURIComponent(rawUrl)}&fg_color=${encodeURIComponent(fgColor)}&bg_color=${encodeURIComponent(bgColor)}&include_logo=false&resolution=250`;
        }
      }, 100);
    }

    // Update Simulator Text & Elements
    if (simMessage) {
      simMessage.textContent = loadingMsgInput.value.trim() || 'Loading your experience...';
    }
    if (simSubtext) {
      simSubtext.textContent = loadingSubtextInput.value.trim() || 'Securing connection & redirecting...';
    }
    if (simTargetUrl) {
      simTargetUrl.textContent = targetUrlInput.value.trim() || rawUrl;
    }
    updateSpinnerStyle(simSpinnerContainer, spinnerStyleSelect.value);
  }


  // --- Save to MongoDB via Flask API ---
  async function saveUrlToMongoDB() {
    const targetUrl = targetUrlInput.value.trim();
    if (!targetUrl) {
      showToast('Please enter a target URL', true);
      targetUrlInput.focus();
      return;
    }

    const payload = {
      target_url: targetUrl,
      loading_message: loadingMsgInput.value.trim(),
      loading_subtext: loadingSubtextInput.value.trim(),
      redirect_delay: parseInt(redirectDelaySelect.value, 10) || 3,
      spinner_style: spinnerStyleSelect.value || 'dual-ring',
      title: qrTitleInput.value.trim(),
      fg_color: fgColorInput.value || '#9FA0FF',
      bg_color: bgColorInput.value || '#ffffff',
      include_logo: includeLogoCheckbox.checked
    };

    if (generateBtn) {
      generateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving to MongoDB...';
      generateBtn.disabled = true;
    }

    try {
      const response = await fetch('/api/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const resData = await response.json();

      if (response.ok && resData.success) {
        currentShortId = resData.short_id;
        currentEncodedUrl = resData.short_url;

        // Render QR Code with MongoDB Redirect URL
        renderQrCode(currentEncodedUrl);

        // Display Saved Info Card
        if (savedMongoInfo && generatedShortUrlInput) {
          savedMongoInfo.classList.remove('is-hidden');
          generatedShortUrlInput.value = currentEncodedUrl;
          if (testShortUrlLink) testShortUrlLink.href = currentEncodedUrl;
          if (scanCountBadge) scanCountBadge.textContent = '0 Scans';
        }

        showToast(`Saved to MongoDB! Link: ${resData.short_url}`);

      } else {
        showToast(resData.error || 'Failed to save to database', true);
        renderQrCode(targetUrl);
      }
    } catch (err) {
      console.error('API Error:', err);
      showToast('Offline mode: QR preview refreshed for URL', false);
      renderQrCode(targetUrl);
    } finally {
      if (generateBtn) {
        generateBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate & Refresh QR';
        generateBtn.disabled = false;
      }
    }
  }

  // --- Initial Setup ---
  renderQrCode();

  // --- Real-time input updates (preview) ---
  [targetUrlInput, qrTitleInput, eccLevelSelect, qrResolutionSelect].forEach(input => {
    if (input) {
      input.addEventListener('input', () => {
        currentEncodedUrl = targetUrlInput.value.trim();
        renderQrCode();
      });
      input.addEventListener('change', () => {
        currentEncodedUrl = targetUrlInput.value.trim();
        renderQrCode();
      });
    }
  });

  [loadingMsgInput, loadingSubtextInput].forEach(input => {
    if (input) {
      input.addEventListener('input', () => {
        if (simMessage) simMessage.textContent = loadingMsgInput.value.trim() || 'Loading your experience...';
        if (simSubtext) simSubtext.textContent = loadingSubtextInput.value.trim() || 'Securing connection & redirecting...';
      });
    }
  });

  if (spinnerStyleSelect) {
    spinnerStyleSelect.addEventListener('change', () => {
      updateSpinnerStyle(simSpinnerContainer, spinnerStyleSelect.value);
    });
  }

  if (includeLogoCheckbox) {
    includeLogoCheckbox.addEventListener('change', () => renderQrCode());
  }

  // Color Pickers
  if (fgColorInput && fgHexLabel) {
    fgColorInput.addEventListener('input', (e) => {
      fgHexLabel.textContent = e.target.value.toUpperCase();
      renderQrCode();
    });
  }
  if (bgColorInput && bgHexLabel) {
    bgColorInput.addEventListener('input', (e) => {
      bgHexLabel.textContent = e.target.value.toUpperCase();
      renderQrCode();
    });
  }

  // Color Swatches
  document.querySelectorAll('.swatch-dot[data-fg]').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const color = swatch.getAttribute('data-fg');
      fgColorInput.value = color;
      fgHexLabel.textContent = color.toUpperCase();
      renderQrCode();
    });
  });

  document.querySelectorAll('.swatch-dot[data-bg]').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const color = swatch.getAttribute('data-bg');
      bgColorInput.value = color;
      bgHexLabel.textContent = color.toUpperCase();
      renderQrCode();
    });
  });


  // Tab Switcher
  if (tabQrBtn && tabLoadingBtn && qrStage && loadingSimulator) {
    tabQrBtn.addEventListener('click', () => {
      tabQrBtn.classList.add('active');
      tabLoadingBtn.classList.remove('active');
      qrStage.style.display = 'flex';
      loadingSimulator.style.display = 'none';
    });

    tabLoadingBtn.addEventListener('click', () => {
      tabLoadingBtn.classList.add('active');
      tabQrBtn.classList.remove('active');
      qrStage.style.display = 'none';
      loadingSimulator.style.display = 'block';
    });
  }

  // --- Generate / Save Button Handler ---
  if (generateBtn) {
    generateBtn.addEventListener('click', saveUrlToMongoDB);
  }

  // Copy Short URL from MongoDB Box
  if (copyShortUrlBtn && generatedShortUrlInput) {
    copyShortUrlBtn.addEventListener('click', () => {
      const url = generatedShortUrlInput.value;
      if (url) {
        navigator.clipboard.writeText(url).then(() => {
          showToast('Copied short link to clipboard!');
        }).catch(() => {
          showToast(`Link: ${url}`);
        });
      }
    });
  }

  // Reset Button
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      targetUrlInput.value = 'https://snapqr.dev/showcase';
      currentEncodedUrl = 'https://snapqr.dev/showcase';
      loadingMsgInput.value = '✨ Hold tight! Redirecting you to something special...';
      loadingSubtextInput.value = 'Powered by SnapQR • Securing your connection';
      qrTitleInput.value = 'Scan to Explore';
      fgColorInput.value = '#9FA0FF';
      fgHexLabel.textContent = '#9FA0FF';
      bgColorInput.value = '#ffffff';
      bgHexLabel.textContent = '#FFFFFF';
      includeLogoCheckbox.checked = true;
      spinnerStyleSelect.value = 'dual-ring';
      redirectDelaySelect.value = '3';
      if (savedMongoInfo) savedMongoInfo.classList.add('is-hidden');
      renderQrCode();
      showToast('Reset all options to default.');
    });
  }

  // Safe rounded rectangle drawer for HTML5 canvas
  function drawRoundedRect(ctx, x, y, width, height, radius) {
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, width, height, radius);
    } else {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }
  }

  // Trigger browser file download from Blob/DataURL
  function triggerDownload(url, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Downloaded ${filename}!`);
  }

  // Direct download fallback via Flask backend
  function downloadViaBackend(fmt = 'png') {
    const rawUrl = currentEncodedUrl || targetUrlInput.value.trim() || 'https://snapqr.dev';
    const fgColor = fgColorInput.value || '#9FA0FF';
    const bgColor = bgColorInput.value || '#ffffff';
    const resolution = qrResolutionSelect ? (qrResolutionSelect.value || '1024') : '1024';
    const includeLogo = includeLogoCheckbox ? includeLogoCheckbox.checked : true;

    const downloadUrl = `/api/download-qr?url=${encodeURIComponent(rawUrl)}&fg_color=${encodeURIComponent(fgColor)}&bg_color=${encodeURIComponent(bgColor)}&include_logo=${includeLogo}&resolution=${resolution}&format=${fmt}`;
    const filename = fmt === 'svg' ? 'snapqr-vector.svg' : 'snapqr-code.png';
    triggerDownload(downloadUrl, filename);
  }

  // Download High-Res PNG with Logo
  if (downloadPngBtn) {
    downloadPngBtn.addEventListener('click', () => {
      const rawUrl = currentEncodedUrl || targetUrlInput.value.trim() || 'https://snapqr.dev';
      const fgColor = fgColorInput.value || '#9FA0FF';
      const bgColor = bgColorInput.value || '#ffffff';
      const resolution = parseInt(qrResolutionSelect ? qrResolutionSelect.value : 1024, 10) || 1024;
      const ecc = eccLevelSelect ? eccLevelSelect.value : 'H';

      if (!window.QRCode || !window.QRCode.toCanvas) {
        downloadViaBackend('png');
        return;
      }

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = resolution;
      exportCanvas.height = resolution;

      window.QRCode.toCanvas(exportCanvas, rawUrl, {
        width: resolution,
        margin: 4,
        color: { dark: fgColor, light: bgColor },
        errorCorrectionLevel: ecc
      }, (err) => {
        if (err) {
          console.error('Canvas Export Error:', err);
          downloadViaBackend('png');
          return;
        }

        const ctx = exportCanvas.getContext('2d');

        if (includeLogoCheckbox && includeLogoCheckbox.checked) {
          const logoImg = new Image();
          const logoEl = document.querySelector('#qrLogoOverlay img');
          const logoSrc = logoEl ? logoEl.src : '/static/img/Logo.png';

          const doFinishExport = () => {
            try {
              const maxLogoSize = Math.floor(resolution * 0.22);
              const logoX = (resolution - maxLogoSize) / 2;
              const logoY = (resolution - maxLogoSize) / 2;
              const pad = Math.floor(maxLogoSize * 0.16);

              // Rounded background badge behind logo
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              drawRoundedRect(ctx, logoX - pad, logoY - pad, maxLogoSize + pad * 2, maxLogoSize + pad * 2, pad);
              ctx.fill();

              ctx.drawImage(logoImg, logoX, logoY, maxLogoSize, maxLogoSize);
              triggerDownload(exportCanvas.toDataURL('image/png'), 'snapqr-code.png');
            } catch (canvasErr) {
              console.warn('Canvas export failed, falling back to Flask backend:', canvasErr);
              downloadViaBackend('png');
            }
          };

          logoImg.onload = doFinishExport;
          logoImg.onerror = () => {
            try {
              triggerDownload(exportCanvas.toDataURL('image/png'), 'snapqr-code.png');
            } catch (e) {
              downloadViaBackend('png');
            }
          };
          logoImg.src = logoSrc;

          if (logoImg.complete && logoImg.naturalWidth > 0) {
            doFinishExport();
          }
        } else {
          try {
            triggerDownload(exportCanvas.toDataURL('image/png'), 'snapqr-code.png');
          } catch (e) {
            downloadViaBackend('png');
          }
        }
      });
    });
  }

  // Download SVG
  if (downloadSvgBtn) {
    downloadSvgBtn.addEventListener('click', () => {
      const rawUrl = currentEncodedUrl || targetUrlInput.value.trim() || 'https://snapqr.dev';
      const fgColor = fgColorInput.value || '#9FA0FF';
      const bgColor = bgColorInput.value || '#ffffff';

      if (window.QRCode && window.QRCode.toString) {
        window.QRCode.toString(rawUrl, {
          type: 'svg',
          color: { dark: fgColor, light: bgColor }
        }, (err, svgString) => {
          if (err || !svgString) {
            console.error('SVG Generation Error, falling back to Flask backend:', err);
            downloadViaBackend('svg');
            return;
          }
          const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          triggerDownload(url, 'snapqr-vector.svg');
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
      } else {
        downloadViaBackend('svg');
      }
    });
  }

  // Copy Target Link
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => {
      const url = targetUrlInput.value.trim() || 'https://snapqr.dev';
      navigator.clipboard.writeText(url).then(() => {
        showToast('Target URL copied to clipboard!');
      }).catch(() => {
        showToast(`URL: ${url}`);
      });
    });
  }

  // Test Scan Simulator Modal
  if (testSimBtn && simModal) {
    testSimBtn.addEventListener('click', () => {
      const msg = loadingMsgInput.value.trim() || 'Loading your experience...';
      const sub = loadingSubtextInput.value.trim() || 'Securing connection...';
      const dest = targetUrlInput.value.trim() || 'https://snapqr.dev';
      let delay = parseInt(redirectDelaySelect.value, 10) || 3;

      modalSimMessage.textContent = msg;
      modalSimSubtext.textContent = sub;
      modalDestination.textContent = dest;
      modalCountdown.textContent = `Redirecting in ${delay}s...`;
      updateSpinnerStyle(modalSpinner, spinnerStyleSelect.value);

      simModal.classList.add('open');

      if (countdownInterval) clearInterval(countdownInterval);

      countdownInterval = setInterval(() => {
        delay -= 1;
        if (delay > 0) {
          modalCountdown.textContent = `Redirecting in ${delay}s...`;
        } else {
          modalCountdown.textContent = `✨ Landing at destination!`;
          clearInterval(countdownInterval);
          setTimeout(() => {
            simModal.classList.remove('open');
            showToast(`Simulated arrival at: ${dest}`);
          }, 1000);
        }
      }, 1000);
    });
  }

  if (modalCloseBtn && simModal) {
    modalCloseBtn.addEventListener('click', () => {
      if (countdownInterval) clearInterval(countdownInterval);
      simModal.classList.remove('open');
    });
  }

  if (simModal) {
    simModal.addEventListener('click', (e) => {
      if (e.target === simModal) {
        if (countdownInterval) clearInterval(countdownInterval);
        simModal.classList.remove('open');
      }
    });
  }
});
