import { initCameraPrompt } from "./camera.js";
import { initCart } from "./cart.js";
import { initConfigurators } from "./configurator.js";
import { renderProductCards } from "./products.js";

function initHeader() {
  const header = document.querySelector("[data-header]");
  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");

  const syncHeader = () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 12);
  };

  syncHeader();
  window.addEventListener("scroll", syncHeader, { passive: true });

  toggle?.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("nav-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav?.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLAnchorElement) {
      document.body.classList.remove("nav-open");
      toggle?.setAttribute("aria-expanded", "false");
    }
  });
}

function initReveals() {
  const nodes = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    nodes.forEach((node) => node.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  nodes.forEach((node) => observer.observe(node));
}

function initProductGrids() {
  document.querySelectorAll("[data-product-grid]").forEach((root) => {
    renderProductCards(root, { featured: root.getAttribute("data-product-grid") === "featured" });
  });
}

function initProductButtons() {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest("[data-configure-product]");
    if (!button) return;

    const type = button.getAttribute("data-configure-product");
    const configurator = document.querySelector("[data-configurator]");

    if (configurator) {
      window.dispatchEvent(new CustomEvent("plexi:configure-product", { detail: { type } }));
    } else {
      window.location.href = `configurateur.html?type=${encodeURIComponent(type)}`;
    }
  });
}

function initToasts() {
  const region = document.querySelector("[data-toast-region]");
  if (!region) return;

  window.addEventListener("plexi:toast", (event) => {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = event.detail || "Action effectuée";
    region.append(toast);

    window.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      window.setTimeout(() => toast.remove(), 180);
    }, 2600);
  });
}

function initTilt() {
  const target = document.querySelector("[data-tilt]");
  if (!target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  target.addEventListener("pointermove", (event) => {
    const rect = target.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    target.style.transform = `rotateX(${y * -3}deg) rotateY(${x * 4}deg)`;
  });

  target.addEventListener("pointerleave", () => {
    target.style.transform = "";
  });
}

function initContactMock() {
  const form = document.querySelector(".contact-form");
  form?.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("button")) {
      window.dispatchEvent(new CustomEvent("plexi:toast", { detail: "Demande préparée côté navigateur" }));
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initHeader();
  initProductGrids();
  initCart();
  initConfigurators();
  initProductButtons();
  initToasts();
  initTilt();
  initReveals();
  initContactMock();
  initCameraPrompt();
});
