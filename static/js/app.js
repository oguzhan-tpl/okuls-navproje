(() => {
  "use strict";

  const loader = document.querySelector("[data-app-loader]");
  const loaderTitle = document.querySelector("[data-loader-title]");
  const loaderText = document.querySelector("[data-loader-text]");
  let slowTimer = null;
  let activeForm = null;

  const hideLoader = () => {
    if (!loader) return;
    clearTimeout(slowTimer);
    loader.classList.remove("is-visible", "is-slow");
    document.documentElement.classList.remove("is-loading");
    document.body.removeAttribute("aria-busy");
    activeForm = null;
  };

  const showLoader = (form) => {
    if (!loader) return;

    activeForm = form;
    const title = form?.dataset.loadingTitle || "İşlem hazırlanıyor";
    const text = form?.dataset.loadingText || "İşleminiz güvenli şekilde uygulanıyor.";
    if (loaderTitle) loaderTitle.textContent = title;
    if (loaderText) loaderText.textContent = text;

    loader.classList.add("is-visible");
    document.documentElement.classList.add("is-loading");
    document.body.setAttribute("aria-busy", "true");

    clearTimeout(slowTimer);
    slowTimer = window.setTimeout(() => {
      if (!loader.classList.contains("is-visible")) return;
      loader.classList.add("is-slow");
      if (loaderTitle) loaderTitle.textContent = "İşlem beklenenden uzun sürüyor";
      if (loaderText) loaderText.textContent = "Sunucu yanıtı hazırlanıyor. Sayfayı kapatmayın.";
    }, 9000);
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

    /*
     * Deliberately no loader for normal navigation.
     * Only forms explicitly marked with data-loading use the operation layer.
     */
    document.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;
      if (!form.hasAttribute("data-loading")) return;
      showLoader(form);
    });

    hideLoader();
  });

  window.addEventListener("pageshow", hideLoader);
  window.addEventListener("pagehide", () => {
    clearTimeout(slowTimer);
  });

  window.addEventListener("beforeunload", () => {
    if (!activeForm) return;
    /* Keep the operation overlay during the actual document transition. */
    if (loader) loader.classList.add("is-visible");
  });
})();