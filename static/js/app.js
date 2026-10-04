(() => {
  "use strict";

  const loader = document.querySelector("[data-app-loader]");
  const loaderTitle = document.querySelector("[data-loader-title]");
  const loaderText = document.querySelector("[data-loader-text]");
  const retry = document.querySelector("[data-loader-retry]");
  let navigationTimer = null;
  let slowTimer = null;
  let pendingUrl = null;

  const hideLoader = () => {
    if (!loader) return;
    clearTimeout(navigationTimer);
    clearTimeout(slowTimer);
    loader.classList.remove("is-visible", "is-slow");
    document.documentElement.classList.remove("is-loading");
    document.body.removeAttribute("aria-busy");
    pendingUrl = null;
    if (retry) retry.hidden = true;
  };

  const showLoader = (url = null) => {
    if (!loader) return;
    pendingUrl = url || window.location.href;
    loaderTitle.textContent = "Açılıyor";
    loaderText.textContent = "Çalışma alanınız hazırlanıyor.";
    if (retry) retry.hidden = true;
    loader.classList.add("is-visible");
    document.documentElement.classList.add("is-loading");
    document.body.setAttribute("aria-busy", "true");

    clearTimeout(slowTimer);
    slowTimer = window.setTimeout(() => {
      if (!loader.classList.contains("is-visible")) return;
      loader.classList.add("is-slow");
      loaderTitle.textContent = "Bağlantı yavaş";
      loaderText.textContent = "Sunucu yanıtı normalden uzun sürüyor.";
      if (retry) retry.hidden = false;
    }, 8500);
  };

  const startNavigation = (url) => {
    showLoader(url);
    clearTimeout(navigationTimer);
    navigationTimer = window.setTimeout(() => {
      hideLoader();
    }, 15000);
  };

  document.addEventListener("DOMContentLoaded", () => {
    const sidebar = document.querySelector("[data-sidebar]");
    const toggle = document.querySelector("[data-sidebar-toggle]");

    if (sidebar && toggle) {
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        sidebar.classList.toggle("open");
      });

      document.addEventListener("click", (event) => {
        if (
          sidebar.classList.contains("open") &&
          !sidebar.contains(event.target) &&
          !toggle.contains(event.target)
        ) {
          sidebar.classList.remove("open");
        }
      });

      sidebar.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => sidebar.classList.remove("open"));
      });
    }

    document.querySelectorAll("[data-confirm]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        const message =
          form.getAttribute("data-confirm") ||
          "Bu işlemi yapmak istediğinize emin misiniz?";
        if (!window.confirm(message)) event.preventDefault();
      });
    });

    const roleInputs = document.querySelectorAll(
      'input[name="role"][type="radio"]'
    );
    const studentFields = document.querySelectorAll(".student-only");
    const syncRoleFields = () => {
      const selected = document.querySelector(
        'input[name="role"][type="radio"]:checked'
      )?.value;
      studentFields.forEach((field) => {
        const visible = selected === "student";
        field.style.display = visible ? "grid" : "none";
        field.querySelectorAll("input,select").forEach((input) => {
          input.disabled = !visible;
          input.required =
            visible &&
            (input.name === "student_no" || input.name === "class_id");
        });
      });
    };
    roleInputs.forEach((input) =>
      input.addEventListener("change", syncRoleFields)
    );
    syncRoleFields();

    const fileInput = document.querySelector("#project_file");
    const fileName = document.querySelector("[data-file-name]");
    if (fileInput && fileName) {
      fileInput.addEventListener("change", () => {
        fileName.textContent =
          fileInput.files?.[0]?.name || "Dosya seçilmedi";
      });
    }

    document.querySelectorAll("textarea").forEach((textarea) => {
      textarea.addEventListener("keydown", (event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key === "Enter" &&
          textarea.form
        ) {
          event.preventDefault();
          textarea.form.requestSubmit();
        }
      });
    });

    /* Navigation loader: only real same-origin page navigations. */
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a");
      if (!link || event.defaultPrevented) return;
      if (
        link.target === "_blank" ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) return;
      if (link.hasAttribute("download")) return;

      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

      try {
        const url = new URL(link.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname.startsWith("/static/")) return;
        if (url.pathname.includes("/download")) return;

        startNavigation(url.href);
      } catch (_) {
        /* Ignore malformed links; browser will handle them normally. */
      }
    });

    document.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;
      if ((form.method || "get").toLowerCase() !== "get") {
        startNavigation(form.action || window.location.href);
      }
    });

    if (retry) {
      retry.addEventListener("click", () => {
        const target = pendingUrl || window.location.href;
        window.location.assign(target);
      });
    }

    hideLoader();
  });

  window.addEventListener("pageshow", hideLoader);
  window.addEventListener("pagehide", () => {
    clearTimeout(navigationTimer);
    clearTimeout(slowTimer);
  });
})();