const menuButton = document.querySelector("#menu-button");
const menu = document.querySelector("#mobile-menu");
const island = document.querySelector("#nav-island");

function closeMenu(returnFocus = false) {
  menu.hidden = true;
  menuButton.setAttribute("aria-expanded", "false");
  if (returnFocus) menuButton.focus();
}

menuButton.addEventListener("click", () => {
  const opening = menu.hidden;
  menu.hidden = !opening;
  menuButton.setAttribute("aria-expanded", String(opening));
});

menu.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => closeMenu());
});

document.addEventListener("click", (event) => {
  if (!island.contains(event.target)) closeMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !menu.hidden) closeMenu(true);
});

// Native horizontal scrolling, with quiet supplementary controls.
const rail = document.querySelector("#story-rail");
const cards = [...rail.querySelectorAll(".story-card")];
const previous = document.querySelector("#previous-category");
const next = document.querySelector("#next-category");
const count = document.querySelector("#rail-count");
let currentIndex = 0;

function cardStep() {
  return cards[1].offsetLeft - cards[0].offsetLeft;
}

function updateRail() {
  const index = Math.max(0, Math.min(cards.length - 1, Math.round(rail.scrollLeft / cardStep())));

  if (index !== currentIndex) {
    currentIndex = index;
    count.textContent =
      String(index + 1).padStart(2, "0") + " / " + String(cards.length).padStart(2, "0");
  }

  previous.disabled = index === 0;
  next.disabled = index === cards.length - 1;
}

function moveRail(direction) {
  const target = Math.max(0, Math.min(cards.length - 1, currentIndex + direction));

  rail.scrollTo({
    left: target * cardStep(),
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

previous.addEventListener("click", () => moveRail(-1));
next.addEventListener("click", () => moveRail(1));
rail.addEventListener("scroll", updateRail, { passive: true });
window.addEventListener("resize", updateRail);

rail.addEventListener("keydown", (event) => {
  if (event.target !== rail) return;
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    moveRail(event.key === "ArrowRight" ? 1 : -1);
  }
});

// Do not fake audio playback or create a pretend checkout.
const dialog = document.querySelector("#prototype-dialog");
const dialogTitle = document.querySelector("#dialog-title");
const dialogCopy = document.querySelector("#dialog-copy");

function showPrototypeNotice(title, copy) {
  dialogTitle.textContent = title;
  dialogCopy.textContent = copy;
  dialog.showModal();
}

document.querySelectorAll("[data-intro]").forEach((button) => {
  button.addEventListener("click", () => {
    showPrototypeNotice(
      button.dataset.intro,
      "Audio isn’t connected in this visual mockup. No intro is playing.",
    );
  });
});

document.querySelector("#subscription-button").addEventListener("click", () => {
  showPrototypeNotice(
    "Start subscription",
    "This is a visual mockup. Checkout isn’t connected, and no subscription will be started.",
  );
});

dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  const outside =
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom;
  if (outside) dialog.close();
});
