export const PRODUCTS = [
  {
    id: "transparent",
    name: "Plexiglass transparent",
    shortName: "Transparent",
    description: "Transparence élevée, idéal pour protections, vitrines et projets techniques.",
    fromPrice: 19.9,
    basePriceM2: 39.9,
    typeCoefficient: 1,
    fill: "rgba(72, 214, 203, 0.18)",
    edge: "rgba(72, 214, 203, 0.18)",
    border: "rgba(72, 214, 203, 0.52)",
    shine: 0.76
  },
  {
    id: "opale",
    name: "Plexiglass opale",
    shortName: "Opale",
    description: "Diffusion douce de la lumière pour enseignes, luminaires et agencement.",
    fromPrice: 24.9,
    basePriceM2: 43.9,
    typeCoefficient: 1.16,
    fill: "rgba(245, 249, 248, 0.9)",
    edge: "rgba(210, 226, 225, 0.46)",
    border: "rgba(190, 208, 208, 0.7)",
    shine: 0.42
  },
  {
    id: "fume",
    name: "Plexiglass fumé",
    shortName: "Fumé",
    description: "Teinte élégante pour mobilier, cloisons décoratives et vitrages design.",
    fromPrice: 27.9,
    basePriceM2: 46.9,
    typeCoefficient: 1.24,
    fill: "rgba(58, 68, 72, 0.36)",
    edge: "rgba(58, 68, 72, 0.28)",
    border: "rgba(58, 68, 72, 0.4)",
    shine: 0.52
  },
  {
    id: "miroir",
    name: "Plexiglass miroir",
    shortName: "Miroir",
    description: "Effet réfléchissant léger, plus simple à poser qu'un miroir traditionnel.",
    fromPrice: 34.9,
    basePriceM2: 55.9,
    typeCoefficient: 1.42,
    fill: "linear-gradient(128deg, rgba(255,255,255,0.92), rgba(174,188,194,0.44) 34%, rgba(255,255,255,0.92) 58%, rgba(120,140,148,0.32) 82%)",
    edge: "rgba(164, 180, 186, 0.36)",
    border: "rgba(154, 172, 178, 0.58)",
    shine: 0.86
  },
  {
    id: "colore",
    name: "Plexiglass coloré",
    shortName: "Coloré",
    description: "Couleurs franches pour signalétique, décoration et réalisations créatives.",
    fromPrice: 29.9,
    basePriceM2: 49.9,
    typeCoefficient: 1.3,
    fill: "rgba(72, 214, 203, 0.38)",
    edge: "rgba(19, 169, 158, 0.28)",
    border: "rgba(19, 169, 158, 0.52)",
    shine: 0.62
  }
];

export const THICKNESS_OPTIONS = [
  { value: 2, coefficient: 0.72 },
  { value: 3, coefficient: 0.86 },
  { value: 5, coefficient: 1 },
  { value: 8, coefficient: 1.36 },
  { value: 10, coefficient: 1.58 }
];

export const COLOR_OPTIONS = [
  { id: "aqua", name: "Vert d'eau", value: "rgba(72, 214, 203, 0.44)", edge: "rgba(19, 169, 158, 0.32)", border: "rgba(19, 169, 158, 0.58)" },
  { id: "blue", name: "Bleu glacier", value: "rgba(73, 148, 213, 0.42)", edge: "rgba(35, 105, 164, 0.32)", border: "rgba(35, 105, 164, 0.54)" },
  { id: "amber", name: "Ambre", value: "rgba(228, 176, 94, 0.48)", edge: "rgba(176, 121, 43, 0.34)", border: "rgba(176, 121, 43, 0.54)" },
  { id: "rose", name: "Rose fumé", value: "rgba(224, 111, 142, 0.42)", edge: "rgba(173, 71, 99, 0.3)", border: "rgba(173, 71, 99, 0.52)" }
];

export function getProduct(type) {
  return PRODUCTS.find((product) => product.id === type) || PRODUCTS[0];
}

export function getColor(colorId) {
  return COLOR_OPTIONS.find((color) => color.id === colorId) || COLOR_OPTIONS[0];
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR"
  }).format(value);
}

export function calculatePlatePrice({ width, height, thickness, type, quantity }) {
  const product = getProduct(type);
  const thicknessOption = THICKNESS_OPTIONS.find((option) => option.value === Number(thickness)) || THICKNESS_OPTIONS[2];
  const surfaceM2 = Math.max(width, 0) * Math.max(height, 0) / 1000000;
  const unitPrice = Math.max(9.9, surfaceM2 * product.basePriceM2 * thicknessOption.coefficient * product.typeCoefficient);
  const roundedUnit = Math.round(unitPrice * 100) / 100;

  return {
    unitPrice: roundedUnit,
    totalPrice: Math.round(roundedUnit * quantity * 100) / 100,
    surfaceM2,
    product
  };
}

export function renderProductCards(root, { featured = false } = {}) {
  const products = featured ? PRODUCTS : PRODUCTS;

  root.innerHTML = products.map((product) => `
    <article class="product-card reveal">
      <div class="product-visual" role="img" aria-label="Rendu ${product.name}">
        <div class="render-sheet ${product.id === "miroir" ? "mirror" : ""}" style="--sheet-fill: ${product.fill}; --sheet-edge: ${product.edge}; --sheet-border: ${product.border};"></div>
      </div>
      <div>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
      </div>
      <strong class="product-price">À partir de ${formatCurrency(product.fromPrice)}</strong>
      <button class="button button-secondary" type="button" data-configure-product="${product.id}">Configurer</button>
    </article>
  `).join("");
}
