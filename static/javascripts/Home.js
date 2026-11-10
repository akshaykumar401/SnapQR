/**
 * SnapQR - Interactive Dynamic QR Studio Script
 * MongoDB Backend Integration & Custom QR Center Branding
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

  // DOM Elements - Custom Center Branding
  const brandingPanel = document.getElementById('brandingPanel');
  const logoDropzone = document.getElementById('logoDropzone');
  const customLogoInput = document.getElementById('customLogoInput');
  const brandingThumbPreview = document.getElementById('brandingThumbPreview');
  const brandingFileName = document.getElementById('brandingFileName');
  const brandingFileInfo = document.getElementById('brandingFileInfo');
  const btnUploadLogo = document.getElementById('btnUploadLogo');
  const btnClearCustomLogo = document.getElementById('btnClearCustomLogo');
  const logoShapeSelect = document.getElementById('logoShape');
  const logoBgSelect = document.getElementById('logoBg');
  const logoSizeInput = document.getElementById('logoSize');
  const logoSizeVal = document.getElementById('logoSizeVal');
  const logoEccHint = document.getElementById('logoEccHint');
  const btnSetHighEcc = document.getElementById('btnSetHighEcc');

  // DOM Elements - QR Stage & Preview
  const qrCanvas = document.getElementById('qrCanvas');
  const qrTitleDisplay = document.getElementById('qrTitleDisplay');
  const qrLogoOverlay = document.getElementById('qrLogoOverlay');
  const qrLogoImg = document.getElementById('qrLogoImg');
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

  const DEFAULT_LOGO_SRC =
    (qrLogoImg && qrLogoImg.getAttribute('data-default-logo')) ||
    (brandingThumbPreview && brandingThumbPreview.getAttribute('data-default-logo')) ||
    '/static/img/Logo.png';
  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  const MAX_LOGO_DIMENSION = 640;

  let currentShortId = null;
  let currentEncodedUrl = targetUrlInput.value.trim() || 'https://snapqr.dev/showcase';
  let customLogoDataUrl = null;
  let defaultLogoDataUrlCache = null;
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

  // --- Branding Configuration Reader ---
  function getBrandingConfig() {
    const includeLogo = includeLogoCheckbox ? includeLogoCheckbox.checked : true;
    const logoSize = logoSizeInput ? parseInt(logoSizeInput.value, 10) || 22 : 22;
    const logoShape = logoShapeSelect ? logoShapeSelect.value || 'rounded' : 'rounded';
    const logoBg = logoBgSelect ? logoBgSelect.value || 'white' : 'white';
    const eccLevel = eccLevelSelect ? eccLevelSelect.value || 'H' : 'H';
    const bgColor = bgColorInput ? bgColorInput.value || '#ffffff' : '#ffffff';
    return {
      includeLogo,
      logoSize: Math.max(14, Math.min(28, logoSize)),
      logoShape,
      logoBg,
      eccLevel,
      badgeFill: logoBg === 'qr_bg' ? bgColor : '#ffffff',
    };
  }

  // --- Shared Logo Placement & Badge Geometry ---
  function computeLogoGeometry(qrSize, imgWidth, imgHeight, logoSizePct, logoShape) {
    const pct = Math.max(10, Math.min(32, Number(logoSizePct) || 22)) / 100;
    const maxLogo = qrSize * pct;
    const ratio = (imgWidth > 0 && imgHeight > 0) ? (imgWidth / imgHeight) : 1;

    let drawW;
    let drawH;
    if (ratio >= 1) {
      drawW = maxLogo;
      drawH = maxLogo / ratio;
    } else {
      drawH = maxLogo;
      drawW = maxLogo * ratio;
    }

    if (logoShape === 'none') {
      return {
        maxLogo,
        drawW,
        drawH,
        pad: 0,
        badgeW: drawW,
        badgeH: drawH,
        badgeRadius: 0,
        innerRadius: 0,
      };
    }

    const pad = maxLogo * 0.16;
    if (logoShape === 'circle') {
      const badgeD = maxLogo + pad * 2;
      return {
        maxLogo,
        drawW,
        drawH,
        pad,
        badgeW: badgeD,
        badgeH: badgeD,
        badgeRadius: badgeD / 2,
        innerRadius: maxLogo / 2,
      };
    }

    const badgeW = drawW + pad * 2;
    const badgeH = drawH + pad * 2;
    const badgeRadius = logoShape === 'rounded' ? Math.min(badgeW, badgeH) * 0.22 : 0;
    const innerRadius = logoShape === 'rounded' ? Math.max(0, badgeRadius - pad * 0.45) : 0;

    return {
      maxLogo,
      drawW,
      drawH,
      pad,
      badgeW,
      badgeH,
      badgeRadius,
      innerRadius,
    };
  }

  // --- Sync Branding Panel Controls & Preview Overlay ---
  function updateBrandingControlsState() {
    const cfg = getBrandingConfig();

    if (brandingPanel) {
      brandingPanel.classList.toggle('is-disabled', !cfg.includeLogo);
    }

    if (logoBgSelect) {
      logoBgSelect.disabled = !cfg.includeLogo || cfg.logoShape === 'none';
    }

    if (logoSizeVal) {
      logoSizeVal.textContent = `${cfg.logoSize}%`;
    }

    if (logoEccHint) {
      const needsHigherEcc =
        cfg.includeLogo &&
        (cfg.eccLevel === 'L' || (cfg.eccLevel === 'M' && cfg.logoSize > 22));
      logoEccHint.classList.toggle('is-hidden', !needsHigherEcc);
    }
  }

  function updateLogoOverlayPreview() {
    updateBrandingControlsState();
    const cfg = getBrandingConfig();

    if (!qrLogoOverlay || !qrLogoImg) return;

    if (!cfg.includeLogo) {
      qrLogoOverlay.style.display = 'none';
      return;
    }

    const activeSrc = customLogoDataUrl || DEFAULT_LOGO_SRC;
    if (qrLogoImg.getAttribute('src') !== activeSrc) {
      qrLogoImg.setAttribute('src', activeSrc);
    }

    qrLogoOverlay.style.display = 'flex';

    const canvasDisplaySize = (qrCanvas && qrCanvas.clientWidth) ? qrCanvas.clientWidth : 250;
    const imgW = qrLogoImg.naturalWidth || 1;
    const imgH = qrLogoImg.naturalHeight || 1;
    const geom = computeLogoGeometry(canvasDisplaySize, imgW, imgH, cfg.logoSize, cfg.logoShape);

    qrLogoOverlay.classList.toggle('no-frame', cfg.logoShape === 'none');
    qrLogoOverlay.style.width = `${Math.round(geom.badgeW)}px`;
    qrLogoOverlay.style.height = `${Math.round(geom.badgeH)}px`;
    qrLogoOverlay.style.padding = `${geom.pad.toFixed(1)}px`;

    if (cfg.logoShape === 'none') {
      qrLogoOverlay.style.background = 'transparent';
      qrLogoOverlay.style.borderRadius = '0px';
      qrLogoImg.style.borderRadius = '0px';
    } else if (cfg.logoShape === 'circle') {
      qrLogoOverlay.style.background = cfg.badgeFill;
      qrLogoOverlay.style.borderRadius = '50%';
      qrLogoImg.style.borderRadius = '50%';
    } else {
      qrLogoOverlay.style.background = cfg.badgeFill;
      qrLogoOverlay.style.borderRadius = `${geom.badgeRadius.toFixed(1)}px`;
      qrLogoImg.style.borderRadius = `${geom.innerRadius.toFixed(1)}px`;
    }
  }

  if (qrLogoImg) {
    qrLogoImg.addEventListener('load', updateLogoOverlayPreview);
  }

  // --- Process Uploaded Custom Center Branding Image ---
  function handleLogoFile(file) {
    if (!file) return;

    const validMime = file.type && file.type.startsWith('image/');
    const validExt = /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name || '');
    if (!validMime && !validExt) {
      showToast('Please select a valid image file (PNG, JPG, WebP, GIF, or SVG).', true);
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      showToast('Image is too large. Please pick an image under 5 MB.', true);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = ev.target && ev.target.result;
      if (!rawDataUrl) {
        showToast('Could not read the selected image.', true);
        return;
      }

      const img = new Image();
      img.onload = () => {
        const origW = img.naturalWidth || 512;
        const origH = img.naturalHeight || 512;
        const isSvgOrGif = /image\/(svg\+xml|gif)/i.test(file.type) || /\.(svg|gif)$/i.test(file.name || '');
        const needsResize = isSvgOrGif || Math.max(origW, origH) > MAX_LOGO_DIMENSION || rawDataUrl.length > 450000;

        let finalDataUrl = rawDataUrl;
        if (needsResize) {
          const scale = Math.min(1, MAX_LOGO_DIMENSION / Math.max(origW, origH));
          const targetW = Math.max(1, Math.round(origW * scale));
          const targetH = Math.max(1, Math.round(origH * scale));

          const tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = targetW;
          tmpCanvas.height = targetH;
          const tmpCtx = tmpCanvas.getContext('2d');
          tmpCtx.clearRect(0, 0, targetW, targetH);
          tmpCtx.drawImage(img, 0, 0, targetW, targetH);
          finalDataUrl = tmpCanvas.toDataURL('image/png');
        }

        customLogoDataUrl = finalDataUrl;
        if (brandingThumbPreview) brandingThumbPreview.src = finalDataUrl;
        if (brandingFileName) brandingFileName.textContent = file.name || 'Custom Branding Image';
        if (brandingFileInfo) brandingFileInfo.textContent = `${origW} × ${origH} px • Custom center image`;
        if (btnClearCustomLogo) btnClearCustomLogo.classList.remove('is-hidden');

        if (includeLogoCheckbox && !includeLogoCheckbox.checked) {
          includeLogoCheckbox.checked = true;
        }

        renderQrCode();
        showToast('Custom center branding image applied!');
      };

      img.onerror = () => {
        showToast('Unable to decode image. Please try a PNG, JPG, or WebP file.', true);
      };

      img.src = rawDataUrl;
    };

    reader.onerror = () => {
      showToast('Failed to read image file.', true);
    };

    reader.readAsDataURL(file);
  }

  function clearCustomLogo(silent = false) {
    customLogoDataUrl = null;
    if (customLogoInput) customLogoInput.value = '';
    if (brandingThumbPreview) brandingThumbPreview.src = DEFAULT_LOGO_SRC;
    if (brandingFileName) brandingFileName.textContent = 'Default SnapQR Logo';
    if (brandingFileInfo) brandingFileInfo.textContent = 'Click or drag & drop an image (max 5 MB)';
    if (btnClearCustomLogo) btnClearCustomLogo.classList.add('is-hidden');
    renderQrCode();
    if (!silent) {
      showToast('Reverted to default SnapQR logo.');
    }
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

    updateLogoOverlayPreview();

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
        if (err) {
          console.error('QR Render Error:', err);
        }
        updateLogoOverlayPreview();
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
          }, () => updateLogoOverlayPreview());
        } else {
          // Robust fallback to Flask backend QR image
          const fallbackImg = new Image();
          fallbackImg.onload = () => {
            const ctx = qrCanvas.getContext('2d');
            qrCanvas.width = 250;
            qrCanvas.height = 250;
            ctx.drawImage(fallbackImg, 0, 0, 250, 250);
            updateLogoOverlayPreview();
          };
          fallbackImg.src = `/api/download-qr?url=${encodeURIComponent(rawUrl)}&fg_color=${encodeURIComponent(fgColor)}&bg_color=${encodeURIComponent(bgColor)}&include_logo=false&resolution=250&ecc_level=${encodeURIComponent(ecc)}`;
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

    const cfg = getBrandingConfig();
    const payload = {
      target_url: targetUrl,
      loading_message: loadingMsgInput.value.trim(),
      loading_subtext: loadingSubtextInput.value.trim(),
      redirect_delay: parseInt(redirectDelaySelect.value, 10) || 3,
      spinner_style: spinnerStyleSelect.value || 'dual-ring',
      title: qrTitleInput.value.trim(),
      fg_color: fgColorInput.value || '#9FA0FF',
      bg_color: bgColorInput.value || '#ffffff',
      include_logo: cfg.includeLogo,
      custom_logo: customLogoDataUrl,
      logo_size: cfg.logoSize,
      logo_shape: cfg.logoShape,
      logo_bg: cfg.logoBg,
      ecc_level: cfg.eccLevel,
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

  // --- Upload & Drag/Drop Event Listeners ---
  if (btnUploadLogo && customLogoInput) {
    btnUploadLogo.addEventListener('click', (e) => {
      e.stopPropagation();
      customLogoInput.click();
    });
  }

  if (logoDropzone && customLogoInput) {
    logoDropzone.addEventListener('click', (e) => {
      if (e.target.closest('#btnClearCustomLogo') || e.target.closest('#btnUploadLogo')) return;
      customLogoInput.click();
    });

    logoDropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        customLogoInput.click();
      }
    });

    ['dragenter', 'dragover'].forEach((evtName) => {
      logoDropzone.addEventListener(evtName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        logoDropzone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'drop'].forEach((evtName) => {
      logoDropzone.addEventListener(evtName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        logoDropzone.classList.remove('is-dragover');
      });
    });

    logoDropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        handleLogoFile(files[0]);
      }
    });
  }

  if (customLogoInput) {
    customLogoInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        handleLogoFile(file);
      }
      customLogoInput.value = '';
    });
  }

  if (btnClearCustomLogo) {
    btnClearCustomLogo.addEventListener('click', (e) => {
      e.stopPropagation();
      clearCustomLogo(false);
    });
  }

  if (btnSetHighEcc && eccLevelSelect) {
    btnSetHighEcc.addEventListener('click', () => {
      eccLevelSelect.value = 'H';
      renderQrCode();
      showToast('Error correction set to High (30%).');
    });
  }

  // --- Real-time input updates (preview) ---
  if (targetUrlInput) {
    const syncTargetUrl = () => {
      currentEncodedUrl = targetUrlInput.value.trim();
      renderQrCode();
    };
    targetUrlInput.addEventListener('input', syncTargetUrl);
    targetUrlInput.addEventListener('change', syncTargetUrl);
  }

  [qrTitleInput, eccLevelSelect, qrResolutionSelect, logoShapeSelect, logoBgSelect, logoSizeInput].forEach(input => {
    if (input) {
      input.addEventListener('input', () => renderQrCode());
      input.addEventListener('change', () => renderQrCode());
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

  window.addEventListener('resize', updateLogoOverlayPreview);

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
      updateLogoOverlayPreview();
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
      currentShortId = null;
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
      if (logoShapeSelect) logoShapeSelect.value = 'rounded';
      if (logoBgSelect) logoBgSelect.value = 'white';
      if (logoSizeInput) logoSizeInput.value = '22';
      if (eccLevelSelect) eccLevelSelect.value = 'H';
      if (qrResolutionSelect) qrResolutionSelect.value = '1024';
      spinnerStyleSelect.value = 'dual-ring';
      redirectDelaySelect.value = '3';
      if (savedMongoInfo) savedMongoInfo.classList.add('is-hidden');
      clearCustomLogo(true);
      showToast('Reset all options to default.');
    });
  }

  // Safe rounded rectangle path helper for HTML5 canvas
  function drawRoundedRectPath(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    if (radius <= 0) {
      ctx.rect(x, y, width, height);
      ctx.closePath();
      return;
    }
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, width, height, radius);
    } else {
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

  // Resolve loaded center image + self-contained data URI for PNG & SVG export
  function getLogoImageForExport() {
    const src = customLogoDataUrl || DEFAULT_LOGO_SRC;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let dataUri = customLogoDataUrl || defaultLogoDataUrlCache;
        if (!dataUri) {
          try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth || 256;
            c.height = img.naturalHeight || 256;
            const cCtx = c.getContext('2d');
            cCtx.drawImage(img, 0, 0, c.width, c.height);
            dataUri = c.toDataURL('image/png');
            defaultLogoDataUrlCache = dataUri;
          } catch (e) {
            dataUri = src;
          }
        }
        resolve({ img, dataUri });
      };
      img.onerror = () => resolve({ img: null, dataUri: null });
      img.src = src;
    });
  }

  // Direct download fallback via Flask backend (POST supports custom logo payload)
  async function downloadViaBackend(fmt = 'png') {
    const rawUrl = currentEncodedUrl || targetUrlInput.value.trim() || 'https://snapqr.dev';
    const fgColor = fgColorInput.value || '#9FA0FF';
    const bgColor = bgColorInput.value || '#ffffff';
    const resolution = qrResolutionSelect ? (qrResolutionSelect.value || '1024') : '1024';
    const cfg = getBrandingConfig();
    const filename = fmt === 'svg' ? 'snapqr-vector.svg' : 'snapqr-code.png';

    try {
      const response = await fetch('/api/download-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: rawUrl,
          fg_color: fgColor,
          bg_color: bgColor,
          include_logo: cfg.includeLogo,
          custom_logo: customLogoDataUrl,
          logo_size: cfg.logoSize,
          logo_shape: cfg.logoShape,
          logo_bg: cfg.logoBg,
          ecc_level: cfg.eccLevel,
          resolution,
          format: fmt,
        }),
      });
      if (!response.ok) throw new Error('Backend download failed');
      const blob = await response.blob();
      const objUrl = URL.createObjectURL(blob);
      triggerDownload(objUrl, filename);
      setTimeout(() => URL.revokeObjectURL(objUrl), 1500);
    } catch (err) {
      const fallbackUrl = `/api/download-qr?url=${encodeURIComponent(rawUrl)}&fg_color=${encodeURIComponent(fgColor)}&bg_color=${encodeURIComponent(bgColor)}&include_logo=${cfg.includeLogo}&logo_size=${cfg.logoSize}&logo_shape=${encodeURIComponent(cfg.logoShape)}&logo_bg=${encodeURIComponent(cfg.logoBg)}&ecc_level=${encodeURIComponent(cfg.eccLevel)}&resolution=${resolution}&format=${fmt}`;
      triggerDownload(fallbackUrl, filename);
    }
  }

  // Download High-Res PNG with Center Branding Image
  if (downloadPngBtn) {
    downloadPngBtn.addEventListener('click', () => {
      const rawUrl = currentEncodedUrl || targetUrlInput.value.trim() || 'https://snapqr.dev';
      const fgColor = fgColorInput.value || '#9FA0FF';
      const bgColor = bgColorInput.value || '#ffffff';
      const resolution = parseInt(qrResolutionSelect ? qrResolutionSelect.value : 1024, 10) || 1024;
      const cfg = getBrandingConfig();

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
        errorCorrectionLevel: cfg.eccLevel
      }, async (err) => {
        if (err) {
          console.error('Canvas Export Error:', err);
          downloadViaBackend('png');
          return;
        }

        const ctx = exportCanvas.getContext('2d');

        if (cfg.includeLogo) {
          const { img: logoImg } = await getLogoImageForExport();
          if (logoImg) {
            try {
              const geom = computeLogoGeometry(
                resolution,
                logoImg.naturalWidth,
                logoImg.naturalHeight,
                cfg.logoSize,
                cfg.logoShape
              );
              const center = resolution / 2;
              const logoX = center - geom.drawW / 2;
              const logoY = center - geom.drawH / 2;

              if (cfg.logoShape === 'circle') {
                ctx.fillStyle = cfg.badgeFill;
                ctx.beginPath();
                ctx.arc(center, center, geom.badgeRadius, 0, Math.PI * 2);
                ctx.fill();

                ctx.save();
                ctx.beginPath();
                ctx.arc(center, center, geom.innerRadius, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(logoImg, logoX, logoY, geom.drawW, geom.drawH);
                ctx.restore();
              } else if (cfg.logoShape !== 'none') {
                const badgeX = center - geom.badgeW / 2;
                const badgeY = center - geom.badgeH / 2;
                ctx.fillStyle = cfg.badgeFill;
                drawRoundedRectPath(ctx, badgeX, badgeY, geom.badgeW, geom.badgeH, geom.badgeRadius);
                ctx.fill();

                ctx.save();
                drawRoundedRectPath(ctx, logoX, logoY, geom.drawW, geom.drawH, geom.innerRadius);
                ctx.clip();
                ctx.drawImage(logoImg, logoX, logoY, geom.drawW, geom.drawH);
                ctx.restore();
              } else {
                ctx.drawImage(logoImg, logoX, logoY, geom.drawW, geom.drawH);
              }
            } catch (canvasErr) {
              console.warn('Canvas export failed, falling back to Flask backend:', canvasErr);
              downloadViaBackend('png');
              return;
            }
          }
        }

        try {
          triggerDownload(exportCanvas.toDataURL('image/png'), 'snapqr-code.png');
        } catch (e) {
          downloadViaBackend('png');
        }
      });
    });
  }

  // Download SVG with Center Branding Image
  if (downloadSvgBtn) {
    downloadSvgBtn.addEventListener('click', () => {
      const rawUrl = currentEncodedUrl || targetUrlInput.value.trim() || 'https://snapqr.dev';
      const fgColor = fgColorInput.value || '#9FA0FF';
      const bgColor = bgColorInput.value || '#ffffff';
      const cfg = getBrandingConfig();

      if (window.QRCode && window.QRCode.toString) {
        window.QRCode.toString(rawUrl, {
          type: 'svg',
          errorCorrectionLevel: cfg.eccLevel,
          color: { dark: fgColor, light: bgColor }
        }, async (err, svgString) => {
          if (err || !svgString) {
            console.error('SVG Generation Error, falling back to Flask backend:', err);
            downloadViaBackend('svg');
            return;
          }

          let finalSvg = svgString;
          if (cfg.includeLogo) {
            const { img: logoImg, dataUri } = await getLogoImageForExport();
            if (logoImg && dataUri) {
              const vbMatch = finalSvg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
              const viewBoxSize = vbMatch ? parseFloat(vbMatch[1]) : 37;
              const geom = computeLogoGeometry(
                viewBoxSize,
                logoImg.naturalWidth,
                logoImg.naturalHeight,
                cfg.logoSize,
                cfg.logoShape
              );

              const center = viewBoxSize / 2;
              const logoX = (center - geom.drawW / 2).toFixed(3);
              const logoY = (center - geom.drawH / 2).toFixed(3);
              const drawW = geom.drawW.toFixed(3);
              const drawH = geom.drawH.toFixed(3);

              let overlayMarkup = '';
              if (cfg.logoShape === 'none') {
                overlayMarkup = `<image href="${dataUri}" x="${logoX}" y="${logoY}" width="${drawW}" height="${drawH}" preserveAspectRatio="xMidYMid meet" image-rendering="auto"/>`;
              } else if (cfg.logoShape === 'circle') {
                overlayMarkup =
                  `<defs><clipPath id="snapqrCenterClip"><circle cx="${center.toFixed(3)}" cy="${center.toFixed(3)}" r="${geom.innerRadius.toFixed(3)}"/></clipPath></defs>` +
                  `<circle cx="${center.toFixed(3)}" cy="${center.toFixed(3)}" r="${geom.badgeRadius.toFixed(3)}" fill="${cfg.badgeFill}"/>` +
                  `<image href="${dataUri}" x="${logoX}" y="${logoY}" width="${drawW}" height="${drawH}" preserveAspectRatio="xMidYMid meet" clip-path="url(#snapqrCenterClip)" image-rendering="auto"/>`;
              } else {
                const badgeX = (center - geom.badgeW / 2).toFixed(3);
                const badgeY = (center - geom.badgeH / 2).toFixed(3);
                const badgeW = geom.badgeW.toFixed(3);
                const badgeH = geom.badgeH.toFixed(3);
                const rAttr = geom.badgeRadius > 0
                  ? ` rx="${geom.badgeRadius.toFixed(3)}" ry="${geom.badgeRadius.toFixed(3)}"`
                  : '';
                const clipOpen = geom.innerRadius > 0
                  ? `<defs><clipPath id="snapqrCenterClip"><rect x="${logoX}" y="${logoY}" width="${drawW}" height="${drawH}" rx="${geom.innerRadius.toFixed(3)}" ry="${geom.innerRadius.toFixed(3)}"/></clipPath></defs>`
                  : '';
                const clipAttr = geom.innerRadius > 0 ? ' clip-path="url(#snapqrCenterClip)"' : '';
                overlayMarkup =
                  `${clipOpen}<rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}"${rAttr} fill="${cfg.badgeFill}"/>` +
                  `<image href="${dataUri}" x="${logoX}" y="${logoY}" width="${drawW}" height="${drawH}" preserveAspectRatio="xMidYMid meet"${clipAttr} image-rendering="auto"/>`;
              }

              finalSvg = finalSvg.replace('</svg>', `${overlayMarkup}</svg>`);
            }
          }

          const blob = new Blob([finalSvg], { type: 'image/svg+xml;charset=utf-8' });
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
