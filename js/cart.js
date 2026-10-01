import { formatCurrency, getProduct } from "./products.js";

const STORAGE_KEY = "plexidesign-cart-v1";
const SHIPPING_PRICE = 9.9;
const FREE_SHIPPING_THRESHOLD = 250;

let cart = [];
let drawer = null;
let lastFocusedElement = null;

function safeParseCart(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistCart() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

function getTotals() {
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_PRICE;
  return {
    subtotal,
    shipping,
    total: subtotal + shipping,
    count: cart.reduce((sum, item) => sum + item.quantity, 0)
  };
}

function itemKey(item) {
  return [item.type, item.width, item.height, item.thickness, item.colorId || "none"].join("-");
}

function createCartItemMarkup(item) {
  const product = getProduct(item.type);
  const linePrice = item.unitPrice * item.quantity;
  const finish = item.colorName ? `${product.shortName}, ${item.colorName}` : product.shortName;

  return `
    <article class="cart-item" data-cart-item="${item.id}">
      <div class="cart-thumb" aria-hidden="true">
        <span style="--thumb-fill: ${item.fill}; --thumb-border: ${item.border};"></span>
      </div>
      <div>
        <h3>${product.name}</h3>
        <p>${item.width} x ${item.height} x ${item.thickness} mm<br>${finish}</p>
        <div class="cart-line">
          <div class="mini-quantity" aria-label="Quantité">
            <button type="button" data-cart-decrease="${item.id}" aria-label="Diminuer ${product.name}">-</button>
            <span>${item.quantity}</span>
            <button type="button" data-cart-increase="${item.id}" aria-label="Augmenter ${product.name}">+</button>
          </div>
          <strong>${formatCurrency(linePrice)}</strong>
        </div>
        <button class="remove-line" type="button" data-cart-remove="${item.id}">Supprimer</button>
      </div>
    </article>
  `;
}

function renderCart() {
  const totals = getTotals();

  document.querySelectorAll("[data-cart-count]").forEach((node) => {
    node.textContent = String(totals.count);
  });

  document.querySelectorAll("[data-cart-items]").forEach((node) => {
    node.innerHTML = cart.map(createCartItemMarkup).join("");
  });

  document.querySelectorAll("[data-cart-empty]").forEach((node) => {
    node.hidden = cart.length > 0;
  });

  document.querySelectorAll("[data-cart-summary]").forEach((node) => {
    node.hidden = cart.length === 0;
  });

  document.querySelectorAll("[data-cart-subtotal]").forEach((node) => {
    node.textContent = formatCurrency(totals.subtotal);
  });

  document.querySelectorAll("[data-cart-shipping]").forEach((node) => {
    node.textContent = totals.shipping === 0 ? "Offerte" : formatCurrency(totals.shipping);
  });

  document.querySelectorAll("[data-cart-total]").forEach((node) => {
    node.textContent = formatCurrency(totals.total);
  });
}

function openCart() {
  drawer = document.querySelector("[data-cart-drawer]");
  if (!drawer) return;

  lastFocusedElement = document.activeElement;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("cart-open");

  const closeButton = drawer.querySelector("[data-cart-close]");
  closeButton?.focus();
}

function closeCart() {
  if (!drawer) {
    drawer = document.querySelector("[data-cart-drawer]");
  }

  drawer?.classList.remove("is-open");
  drawer?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("cart-open");

  if (lastFocusedElement instanceof HTMLElement) {
    lastFocusedElement.focus();
  }
}

function updateQuantity(id, nextQuantity) {
  const item = cart.find((entry) => entry.id === id);
  if (!item) return;

  item.quantity = Math.max(1, Math.min(50, nextQuantity));
  persistCart();
  renderCart();
}

function removeItem(id) {
  cart = cart.filter((item) => item.id !== id);
  persistCart();
  renderCart();
}

export function addToCart(item) {
  const key = itemKey(item);
  const existing = cart.find((entry) => itemKey(entry) === key);

  if (existing) {
    existing.quantity = Math.min(50, existing.quantity + item.quantity);
  } else {
    cart.push({
      ...item,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`
    });
  }

  persistCart();
  renderCart();
  openCart();
  window.dispatchEvent(new CustomEvent("plexi:toast", { detail: "Produit ajouté au panier" }));
}

export function initCart() {
  cart = safeParseCart(localStorage.getItem(STORAGE_KEY));
  drawer = document.querySelector("[data-cart-drawer]");
  renderCart();

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest("[data-cart-open]")) {
      openCart();
      return;
    }

    if (target.closest("[data-cart-close]")) {
      closeCart();
      return;
    }

    const increase = target.closest("[data-cart-increase]");
    if (increase) {
      const id = increase.getAttribute("data-cart-increase");
      const item = cart.find((entry) => entry.id === id);
      if (item) updateQuantity(id, item.quantity + 1);
      return;
    }

    const decrease = target.closest("[data-cart-decrease]");
    if (decrease) {
      const id = decrease.getAttribute("data-cart-decrease");
      const item = cart.find((entry) => entry.id === id);
      if (item) updateQuantity(id, item.quantity - 1);
      return;
    }

    const remove = target.closest("[data-cart-remove]");
    if (remove) {
      removeItem(remove.getAttribute("data-cart-remove"));
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drawer?.classList.contains("is-open")) {
      closeCart();
    }
  });
}

export function getCartSnapshot() {
  return {
    items: [...cart],
    totals: getTotals()
  };
}
