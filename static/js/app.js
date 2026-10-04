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

    /* Teacher project class selector — close first, then launch the sphere. */
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

      const getSelected = () =>
        options.filter((option) => option.querySelector("input")?.checked === true);

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

      const renderSelected = () => {
        const selected = getSelected();

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
          pills.replaceChildren();

          selected.forEach((option) => {
            const pill = document.createElement("span");
            pill.className = "selected-class-pill";
            pill.dataset.classId = option.dataset.classId || "";
            pill.innerHTML =
              '<span class="selected-class-dot"></span>' +
              '<strong></strong>';
            pill.querySelector("strong").textContent = option.dataset.className || "Sınıf";
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

      const addDestinationPill = (option) => {
        if (!pills) return null;

        const pill = document.createElement("span");
        pill.className = "selected-class-pill is-arriving";
        pill.dataset.classId = option.dataset.classId || "";
        pill.innerHTML =
          '<span class="selected-class-dot"></span>' +
          '<strong></strong>';
        pill.querySelector("strong").textContent = option.dataset.className || "Sınıf";

        pills.appendChild(pill);
        return pill;
      };

      const launchSelectionSphere = (sourceRect, targetElement, onFinish) => {
        if (!targetElement) {
          onFinish?.();
          return;
        }

        const targetRect = targetElement.getBoundingClientRect();
        const sx = sourceRect.left + sourceRect.width / 2;
        const sy = sourceRect.top + sourceRect.height / 2;
        const tx = targetRect.left + targetRect.width / 2;
        const ty = targetRect.top + targetRect.height / 2;

        const sphere = document.createElement("span");
        sphere.className = "class-selection-sphere";
        sphere.setAttribute("aria-hidden", "true");
        sphere.style.left = Math.round(sx - 16) + "px";
        sphere.style.top = Math.round(sy - 16) + "px";
        sphere.style.opacity = "1";
        sphere.style.transform = "translate3d(0,0,0) scale(1)";
        document.body.appendChild(sphere);

        // Force layout so the sphere is painted at the source before it starts moving.
        void sphere.offsetWidth;

        const dx = tx - sx;
        const dy = ty - sy;

        const animation = sphere.animate(
          [
            {
              transform: "translate3d(0,0,0) scale(1)",
              opacity: 1,
              filter: "blur(0)"
            },
            {
              transform: "translate3d(0,-18px,0) scale(1.08)",
              opacity: 1,
              filter: "blur(0)"
            },
            {
              transform: `translate3d(${Math.round(dx * 0.12)}px,-58px,0) scale(.96)`,
              opacity: 1,
              filter: "blur(0)"
            },
            {
              transform: `translate3d(${Math.round(dx * 0.42)}px,${Math.round(dy * 0.28 - 48)}px,0) scale(.76)`,
              opacity: .96,
              filter: "blur(0)"
            },
            {
              transform: `translate3d(${Math.round(dx * 0.78)}px,${Math.round(dy * 0.76 - 18)}px,0) scale(.48)`,
              opacity: .72,
              filter: "blur(.15px)"
            },
            {
              transform: `translate3d(${Math.round(dx)}px,${Math.round(dy)}px,0) scale(.22)`,
              opacity: .08,
              filter: "blur(.4px)"
            }
          ],
          {
            duration: 720,
            easing: "cubic-bezier(.16,.82,.22,1)",
            fill: "forwards"
          }
        );

        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          animation.cancel();
          sphere.remove();
          onFinish?.();
        };

        animation.addEventListener("finish", finish, { once: true });
        window.setTimeout(finish, 900);
      };

      const selectOption = (option) => {
        const input = option.querySelector("input");
        if (!input || input.checked) return;

        const sourceElement = option.querySelector(".class-option-check") || option;
        const sourceRect = sourceElement.getBoundingClientRect();

        // Close immediately. The sphere is created only after the menu is gone.
        closeMenu();

        input.checked = true;
        option.classList.add("is-selected");

        const pill = addDestinationPill(option);
        if (!pill) {
          renderSelected();
          return;
        }

        pill.classList.remove("is-arriving");

        requestAnimationFrame(() => {
          // The pill stays invisible while the sphere travels into its exact position.
          pill.classList.add("pill-awaiting");
          const destination = pill.getBoundingClientRect();

          launchSelectionSphere(sourceRect, {
            getBoundingClientRect: () => destination
          }, () => {
            pill.classList.remove("pill-awaiting");
            pill.classList.add("pill-settle");
            window.setTimeout(() => pill.classList.remove("pill-settle"), 460);
          });
        });

        // Update the surrounding status immediately without rebuilding the pill.
        if (countLabel) {
          const count = getSelected().length;
          countLabel.textContent = count + " sınıf seçildi";
        }
        if (triggerTitle) {
          const selected = getSelected();
          triggerTitle.textContent =
            selected.length === 1 ? option.dataset.className : selected.length + " sınıf seçildi";
        }
        if (triggerSubtitle) {
          triggerSubtitle.textContent = getSelected()
            .map((item) => item.dataset.className)
            .join(" • ");
        }
        if (scopeText) {
          scopeText.textContent = getSelected().length + " SINIF İÇİN YAYIN";
        }
        if (scopeSubtext) {
          scopeSubtext.textContent = "Seçilen sınıflardaki aktif öğrenciler projeyi görebilir.";
        }
      };

      const unselectOption = (option) => {
        const input = option.querySelector("input");
        if (!input || !input.checked) return;
        input.checked = false;
        renderSelected();
      };

      trigger?.addEventListener("click", (event) => {
        event.preventDefault();
        if (menu?.hidden) openMenu();
        else closeMenu();
      });

      options.forEach((option) => {
        const input = option.querySelector("input");

        option.addEventListener("click", (event) => {
          event.preventDefault();

          if (input?.checked) unselectOption(option);
          else selectOption(option);
        });

        input?.addEventListener("change", (event) => {
          event.stopPropagation();
          if (input.checked) selectOption(option);
          else unselectOption(option);
        });
      });

      selectAll?.addEventListener("click", (event) => {
        event.preventDefault();

        const allSelected =
          options.length > 0 &&
          options.every((option) => option.querySelector("input")?.checked === true);

        options.forEach((option) => {
          const input = option.querySelector("input");
          if (input) input.checked = !allSelected;
        });

        renderSelected();
        closeMenu();

        if (!allSelected && pills) {
          [...pills.querySelectorAll(".selected-class-pill")].forEach((pill, index) => {
            pill.classList.add("pill-settle");
            window.setTimeout(() => pill.classList.remove("pill-settle"), 440 + index * 35);
          });
        }
      });

      document.addEventListener("click", (event) => {
        if (!classPicker.contains(event.target)) closeMenu();
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
      });

      renderSelected();
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