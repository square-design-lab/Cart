/* =====================================================================
   SDL Slide Cart — slideCart.js
   A slide-out shopping-cart drawer for Squarespace 7.1 commerce sites.

   • Auto-opens and updates in real time when an item is added (no reload).
   • Change quantity / remove items from inside the drawer.
   • Mirrors the native /cart page — and now inherits that page's
     typography and button styling AUTOMATICALLY, so it matches whatever
     theme the site uses without manual configuration.

   Configure via window.sdlSlideCartSettings (see the config generator).
   Any value you set there overrides the auto-synced one.
   ===================================================================== */
(function () {
  'use strict';

  if (window.__sdlSlideCartLoaded) return;
  window.__sdlSlideCartLoaded = true;

  /* ---- 1. Settings ------------------------------------------------- */
  var DEFAULTS = {
    openOnAdd: true,
    closeOnOverlayClick: true,
    closeOnEscape: true,
    cartTitle: 'Your Cart',
    emptyMessage: 'Your cart is empty.',
    checkoutLabel: 'Checkout',
    continueLabel: 'Continue Shopping',
    showContinueWithItems: false, // show the Continue Shopping button in the
                                  // footer when the cart has items (it is
                                  // always shown in the empty state)
    drawerWidth: '420px',
    animDuration: 320,
    showItemCount: true,
    followCartStyles: true,       // inherit /cart page typography + buttons
    styles: {}                    // explicit overrides (win over the sync)
  };

  var USER = window.sdlSlideCartSettings || {};
  var USER_STYLES = (USER && USER.styles) || {};

  function deepMerge(base, over) {
    var out = {}, k;
    for (k in base) out[k] = base[k];
    for (k in over) {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k])) {
        out[k] = deepMerge(base[k] || {}, over[k]);
      } else if (over[k] !== undefined) {
        out[k] = over[k];
      }
    }
    return out;
  }
  var CFG = deepMerge(DEFAULTS, USER);

  // Config style key -> CSS custom property. These win over the cart sync.
  var STYLE_VARS = {
    drawerBg: '--sdl-sc-drawer-bg',
    overlayColor: '--sdl-sc-overlay',
    borderRadius: '--sdl-sc-border-radius',
    headerBg: '--sdl-sc-header-bg',
    headerBorderColor: '--sdl-sc-header-border',
    closeBtnColor: '--sdl-sc-close-color',
    closeBtnSize: '--sdl-sc-close-size',
    imageRadius: '--sdl-sc-image-radius',
    titleColor: '--sdl-sc-title-color',
    titleFontSize: '--sdl-sc-title-size',
    itemNameColor: '--sdl-sc-name-color',
    itemVariantColor: '--sdl-sc-variant-color',
    itemPriceColor: '--sdl-sc-price-color',
    qtyBtnBg: '--sdl-sc-qty-btn-bg',
    qtyBtnColor: '--sdl-sc-qty-btn-color',
    removeColor: '--sdl-sc-remove-color',
    removeHoverColor: '--sdl-sc-remove-hover',
    subtotalBg: '--sdl-sc-subtotal-bg',
    subtotalBorderColor: '--sdl-sc-subtotal-border',
    subtotalColor: '--sdl-sc-subprice-color',
    checkoutBg: '--sdl-sc-checkout-bg',
    checkoutColor: '--sdl-sc-checkout-color',
    checkoutBorderRadius: '--sdl-sc-checkout-radius',
    checkoutFontSize: '--sdl-sc-checkout-size'
  };
  // CSS vars the USER explicitly set (so the cart sync won't clobber them).
  var userVarSet = {};
  Object.keys(STYLE_VARS).forEach(function (k) {
    if (USER_STYLES[k] !== undefined && USER_STYLES[k] !== null && USER_STYLES[k] !== '') {
      userVarSet[STYLE_VARS[k]] = true;
    }
  });

  /* ---- 2. Cart API ------------------------------------------------- */
  var API = {
    getCrumb: function () {
      var m = document.cookie.match(/(?:^|;)\s*crumb=([^;]+)/);
      return m ? m[1] : '';
    },
    fetchCart: function () {
      return fetch('/api/commerce/shopping-cart', {
        headers: { Accept: 'application/json' }, credentials: 'include', cache: 'no-store'
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (legacy) {
          if (!legacy || !legacy.cartToken) return null;
          return fetch('/api/3/commerce/cart/' + encodeURIComponent(legacy.cartToken), {
            headers: { Accept: 'application/json' }, credentials: 'include', cache: 'no-store'
          }).then(function (r) { return r.ok ? r.json() : null; });
        }).catch(function () { return null; });
    },
    updateQty: function (token, itemId, qty) {
      return fetch('/api/3/commerce/cart/' + encodeURIComponent(token) + '/items/' + encodeURIComponent(itemId), {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*', 'X-CSRF-Token': API.getCrumb() },
        body: JSON.stringify({ quantity: qty })
      });
    },
    removeItem: function (token, itemId) {
      return fetch('/api/3/commerce/cart/' + encodeURIComponent(token) + '/items/' + encodeURIComponent(itemId), {
        method: 'DELETE', credentials: 'include',
        headers: { Accept: 'application/json, text/plain, */*', 'X-CSRF-Token': API.getCrumb() }
      });
    }
  };

  /* ---- 3. Helpers -------------------------------------------------- */
  function money(m) {
    if (!m) return '';
    var amount = (typeof m.value === 'number')
      ? m.value / Math.pow(10, m.fractionalDigits || 2)
      : parseFloat(m.decimalValue || 0);
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: m.currencyCode || 'USD' }).format(amount);
    } catch (e) {
      return (m.currencyCode ? m.currencyCode + ' ' : '') + (m.decimalValue || amount.toFixed(2));
    }
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // Returns an array of "Name: Value" strings, one per variant option.
  function variantLines(item) {
    var opts = item.variantOptions || [];
    return opts.map(function (o) {
      if (o == null) return '';
      if (typeof o === 'string') return o;
      var name = o.name != null ? o.name : (o.optionName != null ? o.optionName : '');
      var val = o.value != null ? o.value : (o.optionValue != null ? o.optionValue : '');
      if (!val) return '';
      return name ? (name + ': ' + val) : val;
    }).filter(Boolean);
  }
  function imageUrl(item) {
    var img = item.image;
    if (!img) return '';
    var url = img.url || (img.urls && (img.urls['100'] || img.urls['300'] || img.urls.original)) || '';
    if (!url) return '';
    return url + (url.indexOf('?') === -1 ? '?format=300w' : '');
  }

  /* ---- 4. Cart-page style sync ------------------------------------- */
  // Reads the real /cart page's computed styles (in a hidden iframe) and
  // maps them onto our CSS variables, so the drawer matches the theme.
  var CACHE_KEY = 'sdlSlideCartTheme';
  var theme = {};
  var continueUrl = '/';

  function loadCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) { var t = JSON.parse(raw); theme = t.theme || {}; continueUrl = t.continueUrl || '/'; }
    } catch (e) {}
  }
  function saveCache() {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ theme: theme, continueUrl: continueUrl })); } catch (e) {}
  }
  // Has enough been captured that another iframe load is pointless?
  function themeComplete() {
    return theme.title && theme.name && theme.price && theme.variant &&
           theme.sublabel && theme.subprice && theme.checkout && theme.continue && theme.bg;
  }

  // Map a captured token object -> its CSS vars, skipping user-set ones.
  function setVars(root, map) {
    Object.keys(map).forEach(function (cssVar) {
      if (userVarSet[cssVar]) return;
      var val = map[cssVar];
      if (val != null && val !== '') root.style.setProperty(cssVar, val);
    });
  }
  function applyTheme() {
    if (!CFG.followCartStyles || !els.root) return;
    var r = els.root, t = theme;
    // Match the cart page's background across the whole drawer surface.
    if (t.bg) setVars(r, {
      '--sdl-sc-drawer-bg': t.bg, '--sdl-sc-header-bg': t.bg, '--sdl-sc-subtotal-bg': t.bg
    });
    if (t.title) setVars(r, {
      '--sdl-sc-title-font': t.title.font, '--sdl-sc-title-size': t.title.size, '--sdl-sc-title-weight': t.title.weight,
      '--sdl-sc-title-ls': t.title.ls, '--sdl-sc-title-tt': t.title.tt, '--sdl-sc-title-color': t.title.color, '--sdl-sc-title-lh': t.title.lh
    });
    if (t.name) setVars(r, {
      '--sdl-sc-name-font': t.name.font, '--sdl-sc-name-size': t.name.size, '--sdl-sc-name-weight': t.name.weight,
      '--sdl-sc-name-ls': t.name.ls, '--sdl-sc-name-tt': t.name.tt, '--sdl-sc-name-color': t.name.color, '--sdl-sc-name-lh': t.name.lh
    });
    if (t.price) setVars(r, {
      '--sdl-sc-price-font': t.price.font, '--sdl-sc-price-size': t.price.size, '--sdl-sc-price-weight': t.price.weight,
      '--sdl-sc-price-ls': t.price.ls, '--sdl-sc-price-color': t.price.color, '--sdl-sc-price-lh': t.price.lh
    });
    if (t.variant) setVars(r, {
      '--sdl-sc-variant-font': t.variant.font, '--sdl-sc-variant-size': t.variant.size, '--sdl-sc-variant-weight': t.variant.weight,
      '--sdl-sc-variant-ls': t.variant.ls, '--sdl-sc-variant-color': t.variant.color, '--sdl-sc-variant-lh': t.variant.lh
    });
    if (t.sublabel) setVars(r, {
      '--sdl-sc-sublabel-font': t.sublabel.font, '--sdl-sc-sublabel-size': t.sublabel.size, '--sdl-sc-sublabel-weight': t.sublabel.weight,
      '--sdl-sc-sublabel-ls': t.sublabel.ls, '--sdl-sc-sublabel-color': t.sublabel.color
    });
    if (t.subprice) setVars(r, {
      '--sdl-sc-subprice-font': t.subprice.font, '--sdl-sc-subprice-size': t.subprice.size, '--sdl-sc-subprice-weight': t.subprice.weight,
      '--sdl-sc-subprice-ls': t.subprice.ls, '--sdl-sc-subprice-color': t.subprice.color
    });
    if (t.checkout) setVars(r, {
      '--sdl-sc-checkout-bg': t.checkout.bg, '--sdl-sc-checkout-color': t.checkout.color, '--sdl-sc-checkout-radius': t.checkout.radius,
      '--sdl-sc-checkout-padding': t.checkout.padding, '--sdl-sc-checkout-border': t.checkout.border,
      '--sdl-sc-checkout-font': t.checkout.font, '--sdl-sc-checkout-size': t.checkout.size, '--sdl-sc-checkout-weight': t.checkout.weight,
      '--sdl-sc-checkout-ls': t.checkout.ls, '--sdl-sc-checkout-tt': t.checkout.tt
    });
    if (t.continue) setVars(r, {
      '--sdl-sc-continue-bg': t.continue.bg, '--sdl-sc-continue-color': t.continue.color, '--sdl-sc-continue-radius': t.continue.radius,
      '--sdl-sc-continue-padding': t.continue.padding, '--sdl-sc-continue-border': t.continue.border,
      '--sdl-sc-continue-font': t.continue.font, '--sdl-sc-continue-size': t.continue.size, '--sdl-sc-continue-weight': t.continue.weight,
      '--sdl-sc-continue-ls': t.continue.ls, '--sdl-sc-continue-tt': t.continue.tt
    });
    // keep config overrides on top
    applyStyles(r);
    // refresh continue-shopping links
    var links = els.overlay ? els.overlay.querySelectorAll('.sdl-sc__continue') : [];
    for (var i = 0; i < links.length; i++) links[i].setAttribute('href', continueUrl);
  }

  var syncing = false;
  function syncCartStyles() {
    if (!CFG.followCartStyles || syncing || themeComplete()) return;
    syncing = true;
    var f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:absolute;width:440px;height:640px;left:-9999px;top:-9999px;opacity:0;border:0;pointer-events:none;';
    f.src = '/cart';
    var done = false;
    function finish() { if (done) return; done = true; syncing = false; try { f.remove(); } catch (e) {} }
    f.onload = function () {
      setTimeout(function () {
        try {
          var d = f.contentDocument, w = f.contentWindow;
          if (!d || !w) return finish();
          function typo(sel) {
            var e = d.querySelector(sel); if (!e) return null; var c = w.getComputedStyle(e);
            return { font: c.fontFamily, size: c.fontSize, weight: c.fontWeight, ls: c.letterSpacing, tt: c.textTransform, color: c.color, lh: c.lineHeight };
          }
          // Read a REAL cart button so we inherit its full look (border,
          // padding, font) — not just the bare theme colours a synthetic
          // element would give.
          function readBtn(sel) {
            var e = d.querySelector(sel); if (!e) return null; var c = w.getComputedStyle(e);
            return {
              bg: c.backgroundColor, color: c.color, radius: c.borderRadius, padding: c.padding,
              border: c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor,
              font: c.fontFamily, size: c.fontSize, weight: c.fontWeight, ls: c.letterSpacing, tt: c.textTransform
            };
          }
          // Checkout (primary) and Continue (secondary) never appear on the
          // cart page at the same time, so read whichever is present and
          // derive its counterpart from the theme's accent colour.
          function deriveSecondary(p) {
            return { bg: 'transparent', color: p.bg, radius: p.radius, padding: p.padding,
              border: '1px solid ' + p.bg, font: p.font, size: p.size, weight: p.weight, ls: p.ls, tt: p.tt };
          }
          function derivePrimary(s) {
            return { bg: s.color, color: '#ffffff', radius: s.radius, padding: s.padding,
              border: '0 none transparent', font: s.font, size: s.size, weight: s.weight, ls: s.ls, tt: s.tt };
          }
          var primary = readBtn('.cart-checkout-button, .sqs-button-element--primary');
          var secondary = readBtn('.cart-continue-button');
          if (primary && !secondary) secondary = deriveSecondary(primary);
          if (secondary && !primary) primary = derivePrimary(secondary);

          // Effective page background behind the cart: walk up from the cart
          // container to the first ancestor with a non-transparent colour.
          function isTransparent(c) { return !c || c === 'transparent' || /,\s*0\)\s*$/.test(c); }
          function effectiveBg(sel) {
            var el = d.querySelector(sel);
            while (el) { var c = w.getComputedStyle(el).backgroundColor; if (!isTransparent(c)) return c; el = el.parentElement; }
            return null;
          }
          var pageBg = effectiveBg('#sqs-cart-container') || effectiveBg('#sqs-cart-root') || effectiveBg('body');

          // Merge — keep previously captured tokens if this load lacks them.
          theme.title    = typo('.cart-title')          || theme.title;
          theme.name     = typo('.cart-row-title')      || theme.name;
          theme.price    = typo('.cart-row-price')      || theme.price;
          theme.variant  = typo('.cart-row-variant')    || theme.variant;
          theme.sublabel = typo('.cart-subtotal-label') || theme.sublabel;
          theme.subprice = typo('.cart-subtotal-price') || theme.subprice;
          theme.checkout = primary   || theme.checkout;
          theme.continue = secondary || theme.continue;
          theme.bg       = pageBg    || theme.bg;
          try {
            var s = d.querySelector('#sqs-cart-root script');
            if (s) { var j = JSON.parse(s.textContent); if (j && j.continueShoppingLinkUrl) continueUrl = j.continueShoppingLinkUrl; }
          } catch (e) {}
          saveCache();
          applyTheme();
          if (els.root && state.open && state.cart && state.cart.items && state.cart.items.length) render();
        } catch (e) {}
        finish();
      }, 1200);
    };
    setTimeout(finish, 9000);
    document.body.appendChild(f);
  }

  /* ---- 5. DOM ------------------------------------------------------ */
  var els = {};
  var state = { cart: null, open: false, busy: false };

  function buildShell() {
    var root = document.createElement('div');
    root.className = 'sdl-sc-root';
    var overlay = document.createElement('div');
    overlay.className = 'sdl-sc-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<aside class="sdl-sc" role="dialog" aria-modal="true" aria-label="' + esc(CFG.cartTitle) + '">' +
        '<header class="sdl-sc__header">' +
          '<h2 class="sdl-sc__title"><span class="sdl-sc__title-text">' + esc(CFG.cartTitle) + '</span>' +
            '<span class="sdl-sc__count"></span></h2>' +
          '<button class="sdl-sc__close" type="button" aria-label="Close cart">' +
            '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true">' +
            '<line x1="1.5" y1="1.5" x2="16.5" y2="16.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
            '<line x1="16.5" y1="1.5" x2="1.5" y2="16.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
            '</svg>' +
          '</button>' +
        '</header>' +
        '<div class="sdl-sc__body" aria-live="polite"></div>' +
        '<footer class="sdl-sc__footer is-hidden">' +
          '<div class="sdl-sc__subtotal-row">' +
            '<span class="sdl-sc__subtotal-label">Subtotal</span>' +
            '<span class="sdl-sc__subtotal"></span>' +
          '</div>' +
          '<div class="sdl-sc__btns">' +
            '<a class="sdl-sc__btn sdl-sc__checkout" href="/checkout">' + esc(CFG.checkoutLabel) + '</a>' +
            (CFG.showContinueWithItems
              ? '<a class="sdl-sc__btn sdl-sc__continue" href="' + esc(continueUrl) + '">' + esc(CFG.continueLabel) + '</a>'
              : '') +
          '</div>' +
        '</footer>' +
      '</aside>';
    root.appendChild(overlay);
    document.body.appendChild(root);

    els.root = root;
    els.overlay = overlay;
    els.drawer = overlay.querySelector('.sdl-sc');
    els.body = overlay.querySelector('.sdl-sc__body');
    els.footer = overlay.querySelector('.sdl-sc__footer');
    els.subtotal = overlay.querySelector('.sdl-sc__subtotal');
    els.count = overlay.querySelector('.sdl-sc__count');

    root.style.setProperty('--sdl-sc-width', CFG.drawerWidth || '420px');
    root.style.setProperty('--sdl-sc-anim', (CFG.animDuration || 320) + 'ms');
    applyTheme();       // synced values (if cached) ...
    applyStyles(root);  // ... then explicit config overrides
    wireEvents();
  }

  function applyStyles(root) {
    var s = CFG.styles || {};
    Object.keys(STYLE_VARS).forEach(function (key) {
      if (s[key] !== undefined && s[key] !== null && s[key] !== '') {
        root.style.setProperty(STYLE_VARS[key], s[key]);
      }
    });
  }

  /* ---- 6. Rendering ------------------------------------------------ */
  function continueBtnHtml(extraClass) {
    return '<a class="sdl-sc__btn sdl-sc__continue' + (extraClass ? ' ' + extraClass : '') +
      '" href="' + esc(continueUrl) + '">' + esc(CFG.continueLabel) + '</a>';
  }

  function render() {
    var cart = state.cart;
    var items = (cart && cart.items) || [];

    if (!items.length) {
      els.body.innerHTML =
        '<div class="sdl-sc__empty">' +
          '<div class="sdl-sc__empty-msg">' + esc(CFG.emptyMessage) + '</div>' +
          continueBtnHtml() +
        '</div>';
      els.footer.classList.add('is-hidden');
      els.count.textContent = '';
      return;
    }

    var html = items.map(function (item) {
      var vlines = variantLines(item);
      var img = imageUrl(item);
      var canDec = item.quantity > 1;
      return '' +
        '<div class="sdl-sc__item" data-item-id="' + esc(item.id) + '">' +
          (img
            ? '<a class="sdl-sc__item-img-link" href="' + esc(item.productUrl || '#') + '">' +
                '<img class="sdl-sc__item-img" src="' + esc(img) + '" alt="' + esc(item.productName) + '" loading="lazy"></a>'
            : '') +
          '<div class="sdl-sc__item-info">' +
            '<a class="sdl-sc__item-name" href="' + esc(item.productUrl || '#') + '">' + esc(item.productName) + '</a>' +
            (vlines.length
              ? '<div class="sdl-sc__item-variants">' + vlines.map(function (l) {
                  return '<p class="sdl-sc__item-variant">' + esc(l) + '</p>';
                }).join('') + '</div>'
              : '') +
            '<div class="sdl-sc__price-row">' +
              '<span class="sdl-sc__price">' + money(item.itemTotal || item.unitPrice) + '</span>' +
              '<div class="sdl-sc__qty">' +
                '<button class="sdl-sc__qty-btn" type="button" data-act="dec" aria-label="Decrease quantity"' +
                  (canDec ? '' : ' disabled') + '>&minus;</button>' +
                '<span class="sdl-sc__qty-val">' + esc(item.quantity) + '</span>' +
                '<button class="sdl-sc__qty-btn" type="button" data-act="inc" aria-label="Increase quantity">+</button>' +
              '</div>' +
              '<button class="sdl-sc__remove" type="button" data-act="remove" aria-label="Remove item">' +
                '<svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
                '<line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
                '<line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    }).join('');

    els.body.innerHTML = html;
    els.subtotal.textContent = money(cart.subtotal || cart.grandTotal);
    els.footer.classList.remove('is-hidden');
    var footerCont = els.footer.querySelector('.sdl-sc__continue');
    if (footerCont) footerCont.setAttribute('href', continueUrl);

    if (CFG.showItemCount) {
      var n = items.reduce(function (sum, it) { return sum + (it.quantity || 0); }, 0);
      els.count.textContent = ' (' + n + ')';
    }
  }

  function renderLoading() {
    els.body.innerHTML = '<div class="sdl-sc__loading"><div class="sdl-sc__spinner"></div></div>';
    els.footer.classList.add('is-hidden');
  }

  /* ---- 7. Open / close --------------------------------------------- */
  function open(prefetchedCart) {
    if (!els.root) buildShell();
    state.open = true;
    els.overlay.classList.add('is-open');
    els.overlay.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    // Paint the correct contents immediately so the drawer never flashes the
    // stale "empty cart" state on the way in.
    if (prefetchedCart) {
      state.cart = prefetchedCart;
      render();
      syncNativeBadge(prefetchedCart);
    } else if (!state.cart || !state.cart.items || !state.cart.items.length) {
      renderLoading();
    }
    syncCartStyles();      // capture row/button styles now that cart likely has items
    refresh();
  }
  function close() {
    state.open = false;
    if (!els.overlay) return;
    els.overlay.classList.remove('is-open');
    els.overlay.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
  }
  function toggle() { state.open ? close() : open(); }

  /* ---- 8. Data refresh + mutations --------------------------------- */
  function refresh() {
    return API.fetchCart().then(function (cart) {
      state.cart = cart;
      if (els.root) render();
      syncNativeBadge(cart);
      return cart;
    });
  }
  function token() { return state.cart && state.cart.cartToken; }
  function setPending(itemEl, on) { if (itemEl) itemEl.classList.toggle('is-pending', !!on); }

  function changeQty(itemId, nextQty, itemEl) {
    if (state.busy || !token()) return;
    if (nextQty < 1) { removeItem(itemId, itemEl); return; }
    state.busy = true; setPending(itemEl, true);
    API.updateQty(token(), itemId, nextQty)
      .then(function () { return refresh(); }).catch(function () {})
      .then(function () { state.busy = false; });
  }
  function removeItem(itemId, itemEl) {
    if (state.busy || !token()) return;
    state.busy = true; setPending(itemEl, true);
    API.removeItem(token(), itemId)
      .then(function () { return refresh(); }).catch(function () {})
      .then(function () { state.busy = false; });
  }

  /* ---- 9. Events --------------------------------------------------- */
  function wireEvents() {
    els.overlay.addEventListener('click', function (e) {
      if (e.target === els.overlay && CFG.closeOnOverlayClick) close();
    });
    els.drawer.addEventListener('click', function (e) {
      if (e.target.closest('.sdl-sc__close')) { close(); return; }
      // Continue Shopping just closes the drawer if it points to the current page.
      var cont = e.target.closest('.sdl-sc__continue');
      if (cont) {
        var href = cont.getAttribute('href') || '/';
        if (href === location.pathname || href === location.href) { e.preventDefault(); close(); }
        return;
      }
      var ctrl = e.target.closest('[data-act]');
      if (!ctrl) return;
      var itemEl = e.target.closest('.sdl-sc__item');
      if (!itemEl) return;
      var id = itemEl.getAttribute('data-item-id');
      var act = ctrl.getAttribute('data-act');
      var cur = 0;
      var item = (state.cart && state.cart.items || []).filter(function (i) { return i.id === id; })[0];
      if (item) cur = item.quantity;
      if (act === 'inc') changeQty(id, cur + 1, itemEl);
      else if (act === 'dec') changeQty(id, cur - 1, itemEl);
      else if (act === 'remove') removeItem(id, itemEl);
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.open && CFG.closeOnEscape) close();
  });

  var CART_LINK_SEL = 'a[href="/cart"], a[href="/cart/"], a[href$="/cart"], ' +
    '.header-actions-action--cart, .sqs-custom-cart, .cart-style-icon, .sqs-cart-dropzone, ' +
    '.Cart, .Mobile-bar-menu .Cart, [data-test="cart-button"]';
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest(CART_LINK_SEL);
    if (!trigger || trigger.closest('.sdl-sc-root')) return;
    e.preventDefault();
    e.stopPropagation();
    open();
  }, true);

  /* ---- 10. Detect native add-to-cart (real-time, no reload) -------- */
  var CART_QTY_SEL = '.sqs-cart-quantity, .cart-quantity-container, .icon-cart-quantity';
  var lastCount = null;
  var writingBadge = false;

  function readBadgeCount() {
    var total = 0, found = false;
    document.querySelectorAll(CART_QTY_SEL).forEach(function (el) {
      var n = parseInt((el.textContent || '').replace(/[^0-9]/g, ''), 10);
      if (!isNaN(n)) { total = Math.max(total, n); found = true; }
    });
    return found ? total : null;
  }
  function syncNativeBadge(cart) {
    var total = ((cart && cart.items) || []).reduce(function (s, it) { return s + (it.quantity || 0); }, 0);
    writingBadge = true;
    document.querySelectorAll(CART_QTY_SEL).forEach(function (el) {
      if (String(el.textContent).trim() !== String(total)) el.textContent = total;
    });
    lastCount = total;
    setTimeout(function () { writingBadge = false; }, 0);
  }
  function onItemAdded() { if (CFG.openOnAdd) open(); else refresh(); }

  function cartQty(c) { return ((c && c.items) || []).reduce(function (s, it) { return s + (it.quantity || 0); }, 0); }

  // Primary add detection: when the shopper clicks a native Add-to-Cart button,
  // poll the cart API until the item count rises, then open + render with the
  // fresh cart. This is authoritative and works even when Squarespace's own
  // header badge is out of sync (e.g. after an item was removed through the
  // drawer, Squarespace stops updating its badge) — a case the badge
  // MutationObserver below cannot detect.
  var ADD_BTN_SEL = '.sqs-add-to-cart-button, .sqs-add-to-cart-button-inner, ' +
    '.sqs-add-to-cart-button-wrapper, [data-test="product-add-to-cart"], .product-adds-to-cart button';
  var polling = false;
  function pollForAdd(baseline) {
    if (polling) return;
    polling = true;
    var tries = 0;
    (function step() {
      if (++tries > 16) { polling = false; return; }        // give up after ~5.6s
      setTimeout(function () {
        API.fetchCart().then(function (cart) {
          if (cartQty(cart) > baseline) {
            polling = false;
            lastCount = cartQty(cart);                        // keep the observer from re-firing
            if (CFG.openOnAdd) open(cart);
            else { state.cart = cart; if (els.root) render(); syncNativeBadge(cart); }
          } else { step(); }
        }).catch(function () { step(); });
      }, 350);
    })();
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest(ADD_BTN_SEL)) return;
    pollForAdd(cartQty(state.cart));   // baseline captured before the add commits
  }, true);

  // The drawer must only auto-open for a *genuine* add. On page load
  // Squarespace hydrates its header cart badge (absent/0 -> N), which would
  // otherwise look like an "add". So we don't arm auto-open until the true
  // baseline count is known (from the cart API) and the page has settled.
  var badgeReady = false;
  function watchBadge() {
    lastCount = readBadgeCount();
    // Authoritative baseline: whatever is already in the cart is NOT an add.
    API.fetchCart().then(function (cart) {
      var total = ((cart && cart.items) || []).reduce(function (s, it) { return s + (it.quantity || 0); }, 0);
      lastCount = total;
      badgeReady = true;
    }).catch(function () { badgeReady = true; });
    // Safety net in case the fetch hangs.
    setTimeout(function () { badgeReady = true; }, 2500);

    var scheduled = false;
    var obs = new MutationObserver(function () {
      if (writingBadge || scheduled) return;
      scheduled = true;
      setTimeout(function () {
        scheduled = false;
        var now = readBadgeCount();
        if (now === null) return;
        if (lastCount === null) { lastCount = now; return; }
        if (now > lastCount) {
          lastCount = now;
          if (badgeReady) onItemAdded();   // real add only after baseline is set
        } else if (now !== lastCount) {
          lastCount = now;
          if (state.open) refresh();
        }
      }, 80);
    });
    obs.observe(document.body, { childList: true, characterData: true, subtree: true });
  }

  /* ---- 11. Public API + init --------------------------------------- */
  window.sdlSlideCart = {
    open: open, close: close, toggle: toggle, refresh: refresh,
    getCart: function () { return state.cart; }, config: CFG,
    syncStyles: syncCartStyles
  };

  function init() {
    loadCache();
    buildShell();
    watchBadge();
    syncCartStyles();   // background: capture title / buttons / continue URL early
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
