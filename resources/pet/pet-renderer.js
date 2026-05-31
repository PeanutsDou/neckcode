// Pet renderer — SVG/APNG animations + drag-to-move
(function() {
  'use strict';

  var container = document.getElementById('container');
  var petEl = document.getElementById('pet-svg');
  var labelEl = document.getElementById('pet-label');
  var currentTheme = 'calico';
  var currentFile = '';

  var stateLabels = {
    idle: '', thinking: 'Thinking...', working: 'Working...',
    error: 'Error', attention: 'Done!', notification: 'Waiting...',
    building: 'Building...', carrying: 'Running...', juggling: 'Juggling...',
    sleeping: 'Zzz...'
  };

  // ── React-drag asset map per theme ──
  var reactAssets = {
    clawd: 'clawd-react-drag.svg',
    calico: 'calico-react-drag.apng',
    cloudling: 'cloudling-react-drag.svg'
  };

  // Track hover state for interaction
  var prevState = 'idle';
  var prevFile = '';
  var isHovered = false;

  function isApng(file) {
    return file && file.toLowerCase().endsWith('.apng');
  }

  function setState(state, file, theme, skipHover) {
    // On hover our stored prevState tracks the real state; don't overwrite it
    if (!skipHover) {
      prevState = state;
      prevFile = file;
    }

    var themeChanged = theme !== currentTheme;
    currentTheme = theme;
    currentFile = file;

    // For APNG we need an <img> tag; for SVG we use <object>
    // The simplest approach: use <img> for everything (Chromium renders SVG in <img> fine)
    // For animated SVG that needs object, fall back
    var isApngFile = isApng(file);
    var needsObject = file.endsWith('.svg') && theme === 'clawd'; // clawd SVGs have eye-tracking that need <object>

    var src = theme + '/' + file;

    if (needsObject && petEl.tagName === 'OBJECT') {
      // Just swap data on existing object
      petEl.style.opacity = '0';
      setTimeout(function() {
        petEl.data = src;
        petEl.addEventListener('load', function() { petEl.style.opacity = '1'; }, { once: true });
        setTimeout(function() { petEl.style.opacity = '1'; }, 500);
      }, 200);
    } else if (needsObject || (petEl.tagName === 'OBJECT' && !isApngFile)) {
      // Use object element
      petEl.style.opacity = '0';
      setTimeout(function() {
        petEl.data = src;
        petEl.addEventListener('load', function() { petEl.style.opacity = '1'; }, { once: true });
        setTimeout(function() { petEl.style.opacity = '1'; }, 500);
      }, 200);
    } else {
      // Use img element for APNG or non-clawd SVGs
      if (petEl.tagName !== 'IMG') {
        var newImg = document.createElement('img');
        newImg.id = 'pet-svg';
        newImg.style.cssText = petEl.style.cssText;
        newImg.style.opacity = '0';
        petEl.parentNode.replaceChild(newImg, petEl);
        petEl = newImg;
      }
      petEl.style.opacity = '0';
      setTimeout(function() {
        petEl.src = src;
        petEl.addEventListener('load', function() { petEl.style.opacity = '1'; }, { once: true });
        setTimeout(function() { petEl.style.opacity = '1'; }, 500);
      }, 200);
    }

    // Label
    var label = stateLabels[state] || '';
    if (label) {
      labelEl.textContent = label;
      labelEl.style.opacity = '1';
      setTimeout(function() { labelEl.style.opacity = '0'; }, 2000);
    } else {
      labelEl.style.opacity = '0';
    }
  }

  // Listen for state changes from main process
  if (window.petAPI && window.petAPI.onSetState) {
    window.petAPI.onSetState(function(state, file, theme) {
      setState(String(state), String(file), String(theme));
    });
  }

  // ── Hover interaction ────────────────────────────────
  function enterHover() {
    if (isHovered) return;
    isHovered = true;
    document.body.classList.add('hovered');
    document.body.classList.remove('dragging');
    // Switch to react-drag animation for interactive feel
    var reactFile = reactAssets[currentTheme];
    if (reactFile) setState('react', reactFile, currentTheme, true);
  }

  function leaveHover() {
    if (!isHovered) return;
    isHovered = false;
    document.body.classList.remove('hovered');
    // Restore previous real state
    setState(prevState, prevFile, currentTheme, true);
  }

  container.addEventListener('mouseenter', enterHover);
  container.addEventListener('mouseleave', leaveHover);

  // ── Drag to move ──────────────────────────────────────
  var dragging = false, dragStartX = 0, dragStartY = 0;

  document.addEventListener('mousedown', function(e) {
    dragging = true;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    document.body.classList.add('dragging');
    document.body.classList.remove('hovered');
  });

  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    var dx = e.screenX - dragStartX;
    var dy = e.screenY - dragStartY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      dragStartX = e.screenX;
      dragStartY = e.screenY;
      if (window.petAPI && window.petAPI.moveWindow) {
        window.petAPI.moveWindow(dx, dy);
      }
    }
  });

  function stopDrag() {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('dragging');
  }

  document.addEventListener('mouseup', stopDrag);

  document.addEventListener('mouseleave', function() {
    stopDrag();
    leaveHover();
  });

  petEl.style.opacity = '1';

  // ── Speech bubble ─────────────────────────────────────
  var bubbleEl = document.getElementById('pet-bubble');

  if (window.petAPI && window.petAPI.onSay) {
    window.petAPI.onSay(function(text) {
      bubbleEl.textContent = text;
      bubbleEl.style.opacity = '1';
    });
  }

  // Clear bubble when returning to idle or attention (only for non-hover state)
  var _origSetState = setState;
  setState = function(state, file, theme, skipHover) {
    _origSetState(state, file, theme, skipHover);
    if (state === 'idle' || state === 'attention') {
      setTimeout(function() { bubbleEl.style.opacity = '0'; }, 2500);
    }
  };
})();
