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
      form.querySelectorAll("button[type=\"submit\"]").forEach((button) => {
        button.disabled = true;
        button.dataset.originalText = button.innerHTML;
        button.innerHTML = "İşleniyor";
      });
      showLoader(form);
    });

    /* Animated class selector for teacher project publishing. */
    const classPicker = document.querySelector("[data-class-picker]");
    if (classPicker) {
      const trigger = classPicker.querySelector("[data-class-trigger]");
      const menu = classPicker.querySelector("[data-class-menu]");
      const countLabel = classPicker.querySelector("[data-class-count]");
      const pills = classPicker.querySelector("[data-selected-pills]");
      const triggerTitle = classPicker.querySelector("[data-class-trigger-title]");
      const triggerSubtitle = classPicker.querySelector("[data-class-trigger-subtitle]");
      const scopeText = document.querySelector("[data-scope-text]");
      const scopeSubtext = document.querySelector("[data-scope-subtext]");
      const selectAll = classPicker.querySelector("[data-class-select-all]");
      const options = [...classPicker.querySelectorAll("[data-class-option]")];

      const renderSelected = () => {
        const selected = options.filter((option) =>
          option.querySelector("input")?.checked
        );

        if (countLabel) {
          countLabel.textContent = selected.length
            ? selected.length + " sınıf seçildi"
            : "0 sınıf seçildi";
        }

        if (triggerTitle) {
          triggerTitle.textContent =
            selected.length === 0
              ? "Sınıf seçin"
              : selected.length === 1
                ? selected[0].dataset.className
                : selected.length + " sınıf seçildi";
        }

        if (triggerSubtitle) {
          triggerSubtitle.textContent = selected.length
            ? selected.map((option) => option.dataset.className).join(" • ")
            : "Birden fazla sınıf seçebilirsiniz";
        }

        if (scopeText) {
          scopeText.textContent = selected.length
            ? selected.length + " SINIF İÇİN YAYIN"
            : "SINIF SEÇİMİ BEKLİYOR";
        }

        if (scopeSubtext) {
          scopeSubtext.textContent = selected.length
            ? "Seçilen sınıflardaki aktif öğrenciler projeyi görebilir."
            : "Projeyi yayınlamadan önce en az bir sınıf seçin.";
        }

        if (pills) {
          pills.innerHTML = "";
          selected.forEach((option) => {
            const pill = document.createElement("span");
            pill.className = "selected-class-pill";
            pill.innerHTML =
              '<span class="selected-class-dot"></span>' +
              '<strong></strong>';
            pill.querySelector("strong").textContent = option.dataset.className;
            pills.appendChild(pill);
          });
        }

        options.forEach((option) => {
          option.classList.toggle(
            "is-selected",
            option.querySelector("input")?.checked === true
          );
        });

        if (selectAll) {
          selectAll.textContent =
            selected.length === options.length && options.length
              ? "Seçimi kaldır"
              : "Tümünü seç";
        }
      };

      const closeMenu = () => {
        if (!menu) return;
        menu.hidden = true;
        classPicker.classList.remove("is-open");
        trigger?.setAttribute("aria-expanded", "false");
      };

      const openMenu = () => {
        if (!menu) return;
        menu.hidden = false;
        classPicker.classList.add("is-open");
        trigger?.setAttribute("aria-expanded", "true");
      };

      const createArrivalSlot = () => {
        if (!pills) return null;
        const slot = document.createElement("span");
        slot.className = "class-chip-arrival-slot";
        slot.setAttribute("aria-hidden", "true");
        pills.appendChild(slot);
        return slot;
      };

      const flySphereToHeader = (sourceRect, targetElement, onArrive) => {
        if (!targetElement) {
          onArrive?.();
          return;
        }

        const target = targetElement.getBoundingClientRect();
        const sourceX = sourceRect.left + sourceRect.width / 2;
        const sourceY = sourceRect.top + sourceRect.height / 2;
        const targetX = target.left + target.width / 2;
        const targetY = target.top + target.height / 2;

        const sphere = document.createElement("span");
        sphere.className = "class-selection-sphere";
        sphere.style.left = (sourceX - 16) + "px";
        sphere.style.top = (sourceY - 16) + "px";
        sphere.style.setProperty("--fly-x", (targetX - sourceX) + "px");
        sphere.style.setProperty("--fly-y", (targetY - sourceY) + "px");
        document.body.appendChild(sphere);

        requestAnimationFrame(() => sphere.classList.add("is-flying"));

        const finish = () => {
          sphere.remove();
          onArrive?.();
        };

        sphere.addEventListener("animationend", finish, { once: true });
        window.setTimeout(finish, 760);
      };

      const animateSelection = (option) => {
        if (!pills) {
          renderSelected();
          return;
        }

        const sourceRect = option.getBoundingClientRect();

        // Render the real destination first so the sphere has a precise landing point.
        renderSelected();

        const selectedPill = [...pills.querySelectorAll(".selected-class-pill")]
          .find((pill) => pill.querySelector("strong")?.textContent === option.dataset.className);

        if (!selectedPill) return;

        selectedPill.classList.add("pill-awaiting");
        const slot = createArrivalSlot();
        const target = slot || selectedPill;

        closeMenu();

        requestAnimationFrame(() => {
          flySphereToHeader(sourceRect, target, () => {
            slot?.remove();
            selectedPill.classList.remove("pill-awaiting");
            selectedPill.classList.add("pill-settle");
            window.setTimeout(() => selectedPill.classList.remove("pill-settle"), 420);
          });
        });
      };

      const syncOptionSelection = (option) => {
        const input = option.querySelector("input");
        if (!input) return;

        if (input.checked) {
          animateSelection(option);
        } else {
          renderSelected();
        }
      };

      const toggleOption = (option) => {
        const input = option.querySelector("input");
        if (!input) return;
        input.checked = !input.checked;
        syncOptionSelection(option);
      };

      options.forEach((option) => {
        option.addEventListener("click", (event) => {
          if (event.target.closest("input")) return;
          event.preventDefault();
          toggleOption(option);
        });

        option.querySelector("input")?.addEventListener("change", () => {
          syncOptionSelection(option);
        });
      });

      selectAll?.addEventListener("click", (event) => {
        event.preventDefault();
        const allSelected = options.length > 0 &&
          options.every((option) => option.querySelector("input")?.checked);

        options.forEach((option) => {
          const input = option.querySelector("input");
          if (input) input.checked = !allSelected;
        });

        if (allSelected) {
          renderSelected();
          closeMenu();
          return;
        }

        // Bulk selection uses the same visual destination but without spawning many
        // simultaneous orbs, keeping the interface smooth on lower-end devices.
        renderSelected();
        closeMenu();
        options
          .filter((option) => option.querySelector("input")?.checked)
          .forEach((option, index) => {
            const pill = [...pills.querySelectorAll(".selected-class-pill")][index];
            if (!pill) return;
            pill.classList.add("pill-settle");
            window.setTimeout(() => pill.classList.remove("pill-settle"), 460 + index * 35);
          });
      });

      document.addEventListener("click", (event) => {
        if (!classPicker.contains(event.target)) closeMenu();
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
      });

      renderSelected(false);
    }

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