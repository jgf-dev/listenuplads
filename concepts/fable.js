/**
 * AudioMale Fable visual exploration interactivity
 */

document.addEventListener("DOMContentLoaded", () => {
  // ---------- Navigation Menu ----------
  const menuBtn = document.querySelector("#menu-btn");
  const navMenu = document.querySelector("#nav-menu");
  const navIsland = document.querySelector("#nav-island");

  function closeMenu() {
    if (!navMenu) return;
    navMenu.classList.remove("is-open");
    navMenu.hidden = true;
    menuBtn?.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    if (!navMenu) return;
    navMenu.hidden = false;
    // Allow layout pass before adding transition class
    requestAnimationFrame(() => {
      navMenu.classList.add("is-open");
    });
    menuBtn?.setAttribute("aria-expanded", "true");
  }

  if (menuBtn && navMenu) {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = navMenu.classList.contains("is-open");
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    navMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => closeMenu());
    });

    document.addEventListener("click", (e) => {
      if (navIsland && !navIsland.contains(e.target)) {
        closeMenu();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && navMenu.classList.contains("is-open")) {
        closeMenu();
        menuBtn.focus();
      }
    });
  }

  // ---------- Audio Preview Dock & Category Play Buttons ----------
  const audioDock = document.querySelector("#audio-dock");
  const dockTitle = document.querySelector("#dock-title");
  const dockPlayBtn = document.querySelector("#dock-play-btn");
  const dockIcon = document.querySelector("#dock-icon");
  const dockCloseBtn = document.querySelector("#dock-close-btn");
  const playButtons = document.querySelectorAll(".play");

  let activePlayBtn = null;
  let isPlaying = false;

  const playPath = "M8 5v14l11-7z";
  const pausePath = "M6 19h4V5H6v14zm8-14v14h4V5h-4z";

  function setDockPlayback(playing) {
    isPlaying = playing;
    if (dockIcon) {
      dockIcon.innerHTML = `<path d="${playing ? pausePath : playPath}" />`;
    }
    if (dockPlayBtn) {
      dockPlayBtn.setAttribute("aria-label", playing ? "Pause preview" : "Play preview");
    }
    if (activePlayBtn) {
      const svgPath = activePlayBtn.querySelector("svg path");
      if (svgPath) {
        svgPath.setAttribute("d", playing ? pausePath : playPath);
      }
      activePlayBtn.classList.toggle("is-active", playing);
    }
  }

  function playTrack(btn, category) {
    if (activePlayBtn && activePlayBtn !== btn) {
      activePlayBtn.classList.remove("is-active");
      const prevPath = activePlayBtn.querySelector("svg path");
      if (prevPath) prevPath.setAttribute("d", playPath);
    }

    activePlayBtn = btn;
    if (dockTitle) dockTitle.textContent = category;
    if (audioDock) audioDock.classList.add("is-visible");
    setDockPlayback(true);
  }

  function pauseTrack() {
    setDockPlayback(false);
  }

  playButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const category = btn.dataset.category || "Story preview";
      if (activePlayBtn === btn && isPlaying) {
        pauseTrack();
      } else {
        playTrack(btn, category);
      }
    });
  });

  if (dockPlayBtn) {
    dockPlayBtn.addEventListener("click", () => {
      if (!activePlayBtn) return;
      if (isPlaying) {
        pauseTrack();
      } else {
        setDockPlayback(true);
      }
    });
  }

  if (dockCloseBtn) {
    dockCloseBtn.addEventListener("click", () => {
      pauseTrack();
      if (activePlayBtn) {
        activePlayBtn.classList.remove("is-active");
        const prevPath = activePlayBtn.querySelector("svg path");
        if (prevPath) prevPath.setAttribute("d", playPath);
        activePlayBtn = null;
      }
      if (audioDock) audioDock.classList.remove("is-visible");
    });
  }

  // ---------- Prototype Dialog Modal ----------
  const dialog = document.querySelector("#prototype-dialog");
  const subBtn = document.querySelector("#sub-button");

  if (subBtn && dialog) {
    subBtn.addEventListener("click", () => {
      dialog.showModal();
    });

    dialog.addEventListener("click", (event) => {
      const rect = dialog.getBoundingClientRect();
      const isInDialog =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!isInDialog) {
        dialog.close();
      }
    });
  }
});
