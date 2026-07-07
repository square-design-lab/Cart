# SDL Slide Cart

A slide-out (drawer) shopping cart for **Squarespace 7.1** commerce sites.

- Auto-opens and updates **in real time** when a product is added to the cart — no page reload.
- Lets shoppers **change quantity** or **remove items** from inside the drawer.
- Mirrors the content of the native `/cart` page (product name, image, variant, price, subtotal).
- **Inherits the `/cart` page's styling automatically** — title, product/price/variant/subtotal
  typography and the Checkout (primary) & Continue Shopping (secondary) buttons are read from
  the live cart page, so the drawer matches whatever theme the site uses. Set anything in
  `window.sdlSlideCartSettings` to override.
- Variant options are listed one per line (`Size: Small` / `Color: Orange`), like the cart page.
- Shows a **Continue Shopping** button (footer and empty state) linked to the site's own
  continue-shopping URL.
- Keeps Squarespace's own header cart count in sync after in-drawer edits.

## Files

| File | Purpose |
|------|---------|
| `slideCart.js`  | Plugin logic (drawer, cart API, real-time detection). |
| `slideCart.css` | All styling, driven by `--sdl-sc-*` custom properties. |
| `config-generator.html` | Visual tool that produces the `window.sdlSlideCartSettings` snippet. |

## How it works (for maintainers)

Squarespace 7.1 cart endpoints used:

| Action | Request |
|--------|---------|
| Read cart token | `GET /api/commerce/shopping-cart` → `{ cartToken }` (404 when empty) |
| Read rich cart  | `GET /api/3/commerce/cart/{cartToken}` → `{ items[], subtotal, grandTotal, ... }` |
| Update quantity | `PUT /api/3/commerce/cart/{cartToken}/items/{itemId}` body `{ "quantity": N }` |
| Remove item     | `DELETE /api/3/commerce/cart/{cartToken}/items/{itemId}` |

Mutations send the `X-CSRF-Token` header, read from the site's `crumb` cookie.

**Add-to-cart detection** does *not* monkey-patch `fetch`/XHR (Squarespace's commerce
bundle restores its own references). Instead it watches the native
`.sqs-cart-quantity` badge with a `MutationObserver`; when the count rises, the
shopper just added something, so the drawer opens and refreshes.

## Deploy

The `config-generator.html` install snippets load the plugin from jsDelivr:

```
https://cdn.jsdelivr.net/gh/square-design-lab/Cart@main/Slide-Cart/slideCart.js
https://cdn.jsdelivr.net/gh/square-design-lab/Cart@main/Slide-Cart/slideCart.css
```

Push `slideCart.js` and `slideCart.css` to the `main` branch of the
`square-design-lab/Cart` GitHub repo (files under the `Slide-Cart/` folder) and jsDelivr will serve them
(allow a few minutes, or purge the jsDelivr cache to force an update).

## Install on a Squarespace site

**Settings → Advanced → Code Injection → Footer:**

```html
<script>
  window.sdlSlideCartSettings = {
    cartTitle: "Your Cart",
    drawerWidth: "420px",
    styles: { checkoutBg: "#1a1a1a" }
    // ...paste the output of config-generator.html here
  };
</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/square-design-lab/Cart@main/Slide-Cart/slideCart.css">
<script src="https://cdn.jsdelivr.net/gh/square-design-lab/Cart@main/Slide-Cart/slideCart.js" defer></script>
```

If `window.sdlSlideCartSettings` is omitted, sensible defaults are used.

## Customizing styles

Every visual is a CSS variable, so you can override anything from
**Design → Custom CSS** without touching the plugin:

```css
.sdl-sc { --sdl-sc-width: 480px; }
.sdl-sc__item-name { font-weight: 700; }
.sdl-sc__checkout { --sdl-sc-checkout-bg: #6d28d9; }
```

## Public API

```js
window.sdlSlideCart.open();     // open the drawer
window.sdlSlideCart.close();    // close it
window.sdlSlideCart.toggle();
window.sdlSlideCart.refresh();  // re-fetch + re-render the cart
window.sdlSlideCart.getCart();  // current cart object
```
