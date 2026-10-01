import { addToCart } from "./cart.js";
import {
  COLOR_OPTIONS,
  PRODUCTS,
  THICKNESS_OPTIONS,
  calculatePlatePrice,
  formatCurrency,
  getColor,
  getProduct
} from "./products.js";

const LIMITS = {
  width: { min: 100, max: 3000 },
  height: { min: 100, max: 2000 },
  quantity: { min: 1, max: 50 }
};

function clamp(value, { min, max }) {
  return Math.min(max, Math.max(min, value));
}

function numberFromInput(input, fallback) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function buildSegmentButtons(root, name, items, getLabel, defaultValue) {
  root.innerHTML = items.map((item) => {
    const value = String(item.value ?? item.id);
    const pressed = value === String(defaultValue) ? "true" : "false";
    return `
      <button class="segment-choice" type="button" data-choice-group="${name}" data-choice-value="${value}" aria-pressed="${pressed}">
        <span>${getLabel(item)}</span>
      </button>
    `;
  }).join("");
}

function buildColorGroup(root) {
  root.innerHTML = COLOR_OPTIONS.map((color, index) => `
    <button class="swatch-choice" type="button" data-choice-group="color" data-choice-value="${color.id}" aria-pressed="${index === 0 ? "true" : "false"}" aria-label="${color.name}" title="${color.name}">
      <span style="--swatch: ${color.value};"></span>
    </button>
  `).join("");
}

function getSelectedValue(root, name) {
  return root.querySelector(`[data-choice-group="${name}"][aria-pressed="true"]`)?.getAttribute("data-choice-value");
}

function setSelectedValue(root, name, value) {
  root.querySelectorAll(`[data-choice-group="${name}"]`).forEach((choice) => {
    choice.setAttribute("aria-pressed", String(choice.getAttribute("data-choice-value") === String(value)));
  });
}

function validateState(state) {
  if (state.width < LIMITS.width.min || state.width > LIMITS.width.max) {
    return `La largeur doit être comprise entre ${LIMITS.width.min} et ${LIMITS.width.max} mm.`;
  }

  if (state.height < LIMITS.height.min || state.height > LIMITS.height.max) {
    return `La hauteur doit être comprise entre ${LIMITS.height.min} et ${LIMITS.height.max} mm.`;
  }

  if (state.quantity < LIMITS.quantity.min || state.quantity > LIMITS.quantity.max) {
    return `La quantité doit être comprise entre ${LIMITS.quantity.min} et ${LIMITS.quantity.max}.`;
  }

  return "";
}

class Configurator {
  constructor(root) {
    this.root = root;
    this.widthInput = root.querySelector("[data-config-width]");
    this.heightInput = root.querySelector("[data-config-height]");
    this.quantityInput = root.querySelector("[data-config-quantity]");
    this.priceOutput = root.querySelector("[data-config-price]");
    this.preview = root.querySelector("[data-plate-preview]");
    this.caption = root.querySelector("[data-preview-caption]");
    this.note = root.querySelector("[data-preview-note]");
    this.message = root.querySelector("[data-config-message]");
    this.colorField = root.querySelector("[data-color-field]");
    this.form = root.querySelector("[data-config-form]");

    buildSegmentButtons(root.querySelector("[data-thickness-options]"), "thickness", THICKNESS_OPTIONS, (item) => `${item.value} mm`, 5);
    buildSegmentButtons(root.querySelector("[data-type-options]"), "type", PRODUCTS, (item) => item.shortName, "transparent");
    buildColorGroup(root.querySelector("[data-color-options]"));

    this.applyQueryParameters();
    this.bindEvents();
    this.bindChoiceButtons();
    this.update();
  }

  applyQueryParameters() {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");
    if (!type || !getProduct(type)) return;

    setSelectedValue(this.root, "type", type);
  }

  bindEvents() {
    this.root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const choice = target.closest("[data-choice-group]");
      if (!choice || !this.root.contains(choice)) return;

      setSelectedValue(this.root, choice.getAttribute("data-choice-group"), choice.getAttribute("data-choice-value"));
      this.update();
    });

    this.form.addEventListener("input", () => this.update());
    this.form.addEventListener("change", () => this.update());

    this.root.querySelector("[data-quantity-decrease]").addEventListener("click", () => {
      this.quantityInput.value = String(clamp(numberFromInput(this.quantityInput, 1) - 1, LIMITS.quantity));
      this.update();
    });

    this.root.querySelector("[data-quantity-increase]").addEventListener("click", () => {
      this.quantityInput.value = String(clamp(numberFromInput(this.quantityInput, 1) + 1, LIMITS.quantity));
      this.update();
    });

    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.addCurrentConfiguration();
    });

    window.addEventListener("plexi:configure-product", (event) => {
      if (!event.detail?.type) return;
      setSelectedValue(this.root, "type", event.detail.type);
      this.update();
      this.root.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  bindChoiceButtons() {
    this.root.querySelectorAll("[data-choice-group]").forEach((choice) => {
      choice.addEventListener("click", () => {
        setSelectedValue(this.root, choice.getAttribute("data-choice-group"), choice.getAttribute("data-choice-value"));
        this.update();
      });

      choice.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setSelectedValue(this.root, choice.getAttribute("data-choice-group"), choice.getAttribute("data-choice-value"));
        this.update();
      });
    });
  }

  getState({ normalize = false } = {}) {
    const rawState = {
      width: numberFromInput(this.widthInput, 1000),
      height: numberFromInput(this.heightInput, 500),
      thickness: Number(getSelectedValue(this.root, "thickness")) || 5,
      type: getSelectedValue(this.root, "type") || "transparent",
      colorId: getSelectedValue(this.root, "color") || COLOR_OPTIONS[0].id,
      quantity: numberFromInput(this.quantityInput, 1)
    };

    if (!normalize) return rawState;

    return {
      ...rawState,
      width: Math.round(clamp(rawState.width, LIMITS.width)),
      height: Math.round(clamp(rawState.height, LIMITS.height)),
      quantity: Math.round(clamp(rawState.quantity, LIMITS.quantity))
    };
  }

  update() {
    const state = this.getState();
    const normalized = this.getState({ normalize: true });
    const validation = validateState(state);
    const product = getProduct(normalized.type);
    const isColored = normalized.type === "colore";
    const color = getColor(normalized.colorId);
    const fill = isColored ? color.value : product.fill;
    const edge = isColored ? color.edge : product.edge;
    const border = isColored ? color.border : product.border;
    const price = calculatePlatePrice(normalized);
    const ratio = clamp(normalized.width / normalized.height, { min: 0.45, max: 3.2 });
    const previewWidth = clamp(46 + ratio * 16, { min: 44, max: 82 });

    this.colorField.hidden = !isColored;
    this.message.textContent = validation;
    this.priceOutput.textContent = formatCurrency(price.totalPrice);
    this.priceOutput.classList.remove("is-updating");
    window.requestAnimationFrame(() => this.priceOutput.classList.add("is-updating"));

    this.preview.style.setProperty("--preview-ratio", String(ratio));
    this.preview.style.setProperty("--preview-width", `${previewWidth}%`);
    this.preview.style.setProperty("--preview-fill", fill);
    this.preview.style.setProperty("--preview-edge", edge);
    this.preview.style.setProperty("--preview-border", border);
    this.preview.style.setProperty("--preview-shine", String(product.shine));
    this.preview.style.setProperty("--preview-thickness", `${clamp(normalized.thickness * 2.8, { min: 8, max: 28 })}px`);

    this.caption.textContent = `${normalized.width} x ${normalized.height} x ${normalized.thickness} mm`;
    this.note.textContent = `Finition ${isColored ? color.name.toLowerCase() : product.shortName.toLowerCase()}, chants polis, rendu indicatif.`;
  }

  addCurrentConfiguration() {
    const state = this.getState({ normalize: true });
    const validation = validateState(state);
    if (validation) {
      this.message.textContent = validation;
      return;
    }

    const product = getProduct(state.type);
    const color = getColor(state.colorId);
    const isColored = state.type === "colore";
    const price = calculatePlatePrice(state);

    addToCart({
      ...state,
      unitPrice: price.unitPrice,
      colorName: isColored ? color.name : "",
      fill: isColored ? color.value : product.fill,
      border: isColored ? color.border : product.border
    });
  }
}

export function initConfigurators() {
  document.querySelectorAll("[data-configurator]").forEach((root) => {
    new Configurator(root);
  });
}
