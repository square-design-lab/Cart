/* =====================================================================
   SDL Slide Cart — slideCart.js
   A slide-out shopping-cart drawer for Squarespace 7.1 commerce sites.

   • Auto-opens and updates in real time when an item is added to cart
     (no page reload required).
   • Lets the shopper change quantity or remove items from inside the
     drawer — changes hit Squarespace's live cart API and re-render.
   • Mirrors the content of the native /cart page.

   Configure via window.sdlSlideCartSettings (see the config generator).
   Style via CSS custom properties or the .sdl-sc__* classes.
   ===================================================================== */
(function () {
  'use strict';

  if (window.__sdlSlideCartLoaded) return;      // guard against double-load
  window.__sdlSlideCartLoaded = true;

  /* ---- 1. Settings ------------------------------------------------- */
  var DEFAULTS = {
    openOnAdd: true,
    closeOnOverlayClick: true,
    closeOnEscape: true,
    cartTitle: 'Your Cart',
    emptyMessage: 'Your cart is empty.',
    checkoutLabel: 'Checkout',
    viewCartLabel: 'View Full Cart',
    drawerWidth: '420px',
    animDuration: 320,
    showItemCount: true,
    styles: {}
  };

  // Maps a config.styles key -> CSS custom property on the drawer root.
  var STYLE_VARS = {
    drawerBg: '--sdl-sc-drawer-bg',
    overlayColor: '--sdl-sc-overlay',
    borderRadius: '--sdl-sc-border-radius',
    headerBg: '--sdl-sc-header-bg',
    headerBorderColor: '--sdl-sc-header-border',
    titleColor: '--sdl-sc-title-color',
    titleFontSize: '--sdl-sc-title-size',
    closeBtnColor: '--sdl-sc-close-color',
    closeBtnSize: '--sdl-sc-close-size',
    imageRadius: '--sdl-sc-image-radius',
    itemNameColor: '--sdl-sc-item-name-color',
    itemVariantColor: '--sdl-sc-item-variant-color',
    itemPriceColor: '--sdl-sc-price-color',
    qtyBtnBg: '--sdl-sc-qty-btn-bg',
    qtyBtnColor: '--sdl-sc-qty-btn-color',
    removeColor: '--sdl-sc-remove-color',
    removeHoverColor: '--sdl-sc-remove-hover',
    subtotalBg: '--sdl-sc-subtotal-bg',
    subtotalBorderColor: '--sdl-sc-subtotal-border',
    subtotalColor: '--sdl-sc-subtotal-color',
    checkoutBg: '--sdl-sc-checkout-bg',
    checkoutColor: '--sdl-sc-checkout-color',
    checkoutBorderRadius: '--sdl-sc-checkout-radius',
    checkoutFontSize: '--sdl-sc-checkout-font-size',
    viewCartColor: '--sdl-sc-view-cart-color'
  };

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

  var CFG = deepMerge(DEFAULTS, window.sdlSlideCartSettings || {});

  /* ---- 2. Cart API ------------------------------------------------- */
  // Endpoints discovered on Squarespace 7.1 commerce:
  //   GET    /api/commerce/shopping-cart              -> { cartToken, ... } (404 when empty)
  //   GET    /api/3/commerce/cart/{cartToken}         -> rich cart w/ items
  //   POST   /api/commerce/shopping-cart/entries      -> add (native add-to-cart)
  //   PUT    /api/3/commerce/cart/{token}/items/{id}  -> { quantity }
  //   DELETE /api/3/commerce/cart/{token}/items/{id}  -> remove
  var API = {
    getCrumb: function () {
      var m = document.cookie.match(/(?:^|;)\s*crumb=([^;]+)/);
      return m ? m[1] : '';
    },
    // Returns the rich cart object, or null when the cart is empty.
    fetchCart: function () {
      return fetch('/api/commerce/shopping-cart', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
        cache: 'no-store'
      }).then(function (r) {
        if (!r.ok) return null;                 // 404 -> no cart yet
        return r.json();
      }).then(function (legacy) {
        if (!legacy || !legacy.cartToken) return null;
        return fetch('/api/3/commerce/cart/' + encodeURIComponent(legacy.cartToken), {
          headers: { Accept: 'application/json' },
          credentials: 'include',
          cache: 'no-store'
        }).then(function (r) { return r.ok ? r.json() : null; });
      }).catch(function () { return null; });
    },
    updateQty: function (token, itemId, qty) {
      return fetch('/api/3/commerce/cart/' + encodeURIComponent(token) + '/items/' + encodeURIComponent(itemId), {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
          'X-CSRF-Token': API.getCrumb()
        },
        body: JSON.stringify({ quantity: qty })
      });
    },
    removeItem: function (token, itemId) {
      return fetch('/api/3/commerce/cart/' + encodeURIComponent(token) + '/items/' + encodeURIComponent(itemId), {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'X-CSRF-Token': API.getCrumb()
        }
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
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: m.currencyCode || 'USD'
      }).format(amount);
    } catch (e) {
      return (m.currencyCode ? m.currencyCode + ' ' : '') + (m.decimalValue || amount.toFixed(2));
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function variantText(item) {
    var opts = item.variantOptions || [];
    if (!opts.length) return '';
    return opts.map(function (o) {
      if (o == null) return '';
      if (typeof o === 'string') return o;
      return o.value != null ? o.value : (o.optionValue != null ? o.optionValue : '');
    }).filter(Boolean).join(' / ');
  }

  function imageUrl(item) {
    var img = item.image;
    if (!img) return '';
    var url = img.url || (img.urls && (img.urls['100'] || img.urls['300'] || img.urls.original)) || '';
    if (!url) return '';
    // Serve a small, sharp thumbnail from the Squarespace image CDN.
    return url + (url.indexOf('?') === -1 ? '?format=300w' : '');
  }

  /* ---- 4. DOM ------------------------------------------------------ */
  var els = {};      // cached element refs
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
            '<a class="sdl-sc__checkout" href="/checkout">' + esc(CFG.checkoutLabel) + '</a>' +
            '<a class="sdl-sc__view-cart" href="/cart">' + esc(CFG.viewCartLabel) + '</a>' +
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
    els.checkout = overlay.querySelector('.sdl-sc__checkout');

    applyStyles(root);
    wireEvents();
  }

  function applyStyles(root) {
    root.style.setProperty('--sdl-sc-width', CFG.drawerWidth || '420px');
    root.style.setProperty('--sdl-sc-anim', (CFG.animDuration || 320) + 'ms');
    var s = CFG.styles || {};
    Object.keys(STYLE_VARS).forEach(function (key) {
      if (s[key] !== undefined && s[key] !== null && s[key] !== '') {
        root.style.setProperty(STYLE_VARS[key], s[key]);
      }
    });
  }

  /* ---- 5. Rendering ------------------------------------------------ */
  function renderLoading() {
    els.body.innerHTML = '<div class="sdl-sc__loading"><div class="sdl-sc__spinner"></div></div>';
    els.footer.classList.add('is-hidden');
  }

  function render() {
    var cart = state.cart;
    var items = (cart && cart.items) || [];

    if (!items.length) {
      els.body.innerHTML = '<div class="sdl-sc__empty">' + esc(CFG.emptyMessage) + '</div>';
      els.footer.classList.add('is-hidden');
      els.count.textContent = '';
      return;
    }

    var html = items.map(function (item) {
      var vt = variantText(item);
      var img = imageUrl(item);
      var canDec = item.quantity > 1;
      return '' +
        '<div class="sdl-sc__item" data-item-id="' + esc(item.id) + '">' +
          (img
            ? '<a class="sdl-sc__item-img-link" href="' + esc(item.productUrl || '#') + '">' +
                '<img class="sdl-sc__item-img" src="' + esc(img) + '" alt="' + esc(item.productName) + '" loading="lazy">' +
              '</a>'
            : '') +
          '<div class="sdl-sc__item-info">' +
            '<a class="sdl-sc__item-name" href="' + esc(item.productUrl || '#') + '">' + esc(item.productName) + '</a>' +
            (vt ? '<div class="sdl-sc__item-variant">' + esc(vt) + '</div>' : '') +
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
                '<line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
                '</svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    }).join('');

    els.body.innerHTML = html;

    els.subtotal.textContent = money(cart.subtotal || cart.grandTotal);
    els.footer.classList.remove('is-hidden');

    if (CFG.showItemCount) {
      var n = items.reduce(function (sum, it) { return sum + (it.quantity || 0); }, 0);
      els.count.textContent = ' (' + n + ')';
    }
  }

  /* ---- 6. Open / close --------------------------------------------- */
  function open() {
    if (!els.root) buildShell();
    state.open = true;
    els.overlay.classList.add('is-open');
    els.overlay.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
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

  /* ---- 7. Data refresh --------------------------------------------- */
  var refreshing = false;
  function refresh(showSpinner) {
    if (showSpinner && (!state.cart || !state.cart.items || !state.cart.items.length)) {
      renderLoading();
    }
    refreshing = true;
    return API.fetchCart().then(function (cart) {
      refreshing = false;
      state.cart = cart;
      if (els.root) render();
      syncNativeBadge(cart);
      return cart;
    });
  }

  function token() { return state.cart && state.cart.cartToken; }

  // Keep Squarespace's own header cart count in sync after in-drawer edits.
  // Our quantity/remove calls hit the cart API directly, so the native badge
  // would otherwise stay stale until a reload. We write the count ourselves
  // and flag it so our own MutationObserver ignores the change.
  function syncNativeBadge(cart) {
    var total = ((cart && cart.items) || []).reduce(function (s, it) { return s + (it.quantity || 0); }, 0);
    writingBadge = true;
    document.querySelectorAll(CART_QTY_SEL).forEach(function (el) {
      if (String(el.textContent).trim() !== String(total)) el.textContent = total;
    });
    lastCount = total;
    setTimeout(function () { writingBadge = false; }, 0);
  }

  /* ---- 8. Item mutations ------------------------------------------- */
  function setPending(itemEl, on) {
    if (itemEl) itemEl.classList.toggle('is-pending', !!on);
  }

  function changeQty(itemId, nextQty, itemEl) {
    if (state.busy || !token()) return;
    if (nextQty < 1) { removeItem(itemId, itemEl); return; }
    state.busy = true;
    setPending(itemEl, true);
    API.updateQty(token(), itemId, nextQty)
      .then(function () { return refresh(); })
      .catch(function () {})
      .then(function () { state.busy = false; });
  }

  function removeItem(itemId, itemEl) {
    if (state.busy || !token()) return;
    state.busy = true;
    setPending(itemEl, true);
    API.removeItem(token(), itemId)
      .then(function () { return refresh(); })
      .catch(function () {})
      .then(function () { state.busy = false; });
  }

  /* ---- 9. Event wiring --------------------------------------------- */
  function wireEvents() {
    // Close: overlay click
    els.overlay.addEventListener('click', function (e) {
      if (e.target === els.overlay && CFG.closeOnOverlayClick) close();
    });
    // Close: X button + item controls (event delegation)
    els.drawer.addEventListener('click', function (e) {
      var closeBtn = e.target.closest('.sdl-sc__close');
      if (closeBtn) { close(); return; }

      var ctrl = e.target.closest('[data-act]');
      if (!ctrl) return;
      var itemEl = e.target.closest('.sdl-sc__item');
      if (!itemEl) return;
      var id = itemEl.getAttribute('data-item-id');
      var act = ctrl.getAttribute('data-act');
      var current = 0;
      var item = (state.cart && state.cart.items || []).filter(function (i) { return i.id === id; })[0];
      if (item) current = item.quantity;

      if (act === 'inc') changeQty(id, current + 1, itemEl);
      else if (act === 'dec') changeQty(id, current - 1, itemEl);
      else if (act === 'remove') removeItem(id, itemEl);
    });
  }

  // ESC key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.open && CFG.closeOnEscape) close();
  });

  // Clicking any element that links/points to the cart opens the drawer.
  var CART_LINK_SEL = 'a[href="/cart"], a[href="/cart/"], a[href$="/cart"], ' +
    '.header-actions-action--cart, .sqs-custom-cart, .cart-style-icon, .sqs-cart-dropzone, ' +
    '.Cart, .Mobile-bar-menu .Cart, [data-test="cart-button"]';
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest(CART_LINK_SEL);
    if (!trigger) return;
    // Ignore clicks that originate inside our own drawer.
    if (trigger.closest('.sdl-sc-root')) return;
    e.preventDefault();
    e.stopPropagation();
    open();
  }, true);

  /* ---- 10. Detect native "Add to Cart" (real-time, no reload) ------ */
  // Rather than monkey-patching fetch/XHR (fragile: Squarespace's commerce
  // bundle captures its own references and can restore XHR.prototype), we
  // watch Squarespace's own live cart-quantity badge. Every theme keeps the
  // header count in a `.sqs-cart-quantity` element and updates it the instant
  // an item is added — no reload. When that number goes up, the shopper just
  // added something, so we open + refresh the drawer.
  var CART_QTY_SEL = '.sqs-cart-quantity, .cart-quantity-container, .icon-cart-quantity';
  var lastCount = null;
  var writingBadge = false;   // true while WE are updating the native badge

  function readBadgeCount() {
    var total = 0, found = false;
    document.querySelectorAll(CART_QTY_SEL).forEach(function (el) {
      var n = parseInt((el.textContent || '').replace(/[^0-9]/g, ''), 10);
      if (!isNaN(n)) { total = Math.max(total, n); found = true; }
    });
    return found ? total : null;
  }

  function onItemAdded() {
    if (CFG.openOnAdd) open();   // open() calls refresh()
    else refresh();              // keep the drawer in sync silently
  }

  function watchBadge() {
    lastCount = readBadgeCount();
    var scheduled = false;
    var obs = new MutationObserver(function () {
      if (writingBadge || scheduled) return;
      scheduled = true;
      // Debounce: the badge can mutate several times per update.
      setTimeout(function () {
        scheduled = false;
        var now = readBadgeCount();
        if (now === null) return;
        if (lastCount === null) { lastCount = now; return; }
        if (now > lastCount) { lastCount = now; onItemAdded(); }
        else if (now !== lastCount) { lastCount = now; if (state.open) refresh(); }
      }, 80);
    });
    obs.observe(document.body, { childList: true, characterData: true, subtree: true });
  }

  /* ---- 11. Public API + init --------------------------------------- */
  window.sdlSlideCart = {
    open: open,
    close: close,
    toggle: toggle,
    refresh: refresh,
    getCart: function () { return state.cart; },
    config: CFG
  };

  function init() {
    buildShell();
    watchBadge();
    // Prime the cart so the badge/count is correct if opened later.
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
