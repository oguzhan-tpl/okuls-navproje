(() => {
  "use strict";

  /* OSP heartbeat: active browser tabs quietly touch /healthz every 4 minutes. */
  let ospHeartbeatTimer = null;
  let ospHeartbeatBusy = false;

  const ospHeartbeat = () => {
    if (ospHeartbeatBusy || document.hidden) return;
    ospHeartbeatBusy = true;

    fetch("/healthz?ts=" + Date.now(), {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "X-OSP-Heartbeat": "1" },
      keepalive: true
    })
      .catch(() => {})
      .finally(() => {
        ospHeartbeatBusy = false;
      });
  };

  const startOspHeartbeat = () => {
    if (ospHeartbeatTimer !== null) return;
    ospHeartbeatTimer = window.setInterval(ospHeartbeat, 4 * 60 * 1000);
  };

  const stopOspHeartbeat = () => {
    if (ospHeartbeatTimer === null) return;
    window.clearInterval(ospHeartbeatTimer);
    ospHeartbeatTimer = null;
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopOspHeartbeat();
      return;
    }

    ospHeartbeat();
    startOspHeartbeat();
  });

  ospHeartbeat();
  startOspHeartbeat();

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

    /* Teacher project class selector — visual only. No network/database work here. */
    const classPicker = document.querySelector("[data-class-picker]");
    if (classPicker) {
      const trigger = classPicker.querySelector("[data-class-trigger]");
      const menu = classPicker.querySelector("[data-class-menu]");
      const countLabel = classPicker.querySelector("[data-class-count]");
      const names = classPicker.querySelector("[data-selected-pills]");
      const triggerTitle = classPicker.querySelector("[data-class-trigger-title]");
      const triggerSubtitle = classPicker.querySelector("[data-class-trigger-subtitle]");
      const scopeText = document.querySelector("[data-scope-text]");
      const scopeSubtext = document.querySelector("[data-scope-subtext]");
      const selectAll = classPicker.querySelector("[data-class-select-all]");
      const options = [...classPicker.querySelectorAll("[data-class-option]")];
      const selectionLayer =
        document.querySelector("[data-class-selection-layer]") || document.body;

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

      const updateText = () => {
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

      const renderClassNames = () => {
        if (!names) return;
        names.replaceChildren();

        getSelected().forEach((option, index) => {
          if (index > 0) {
            const divider = document.createElement("span");
            divider.className = "selected-class-name-divider";
            divider.textContent = "·";
            names.appendChild(divider);
          }

          const label = document.createElement("span");
          label.className = "selected-class-name";
          label.dataset.classId = option.dataset.classId || "";
          label.textContent = option.dataset.className || "Sınıf";
          names.appendChild(label);
        });
      };

      const refreshVisualState = () => {
        updateText();
        renderClassNames();
      };

      const createSphere = (sourceRect) => {
        const sphere = document.createElement("span");
        sphere.className = "class-selection-sphere";
        sphere.setAttribute("aria-hidden", "true");
        selectionLayer.appendChild(sphere);
        void sphere.offsetWidth;

        return {
          sphere,
          sourceX: Math.round(sourceRect.left + sourceRect.width / 2 - 18),
          sourceY: Math.round(sourceRect.top + sourceRect.height / 2 - 18)
        };
      };

      const animateSphere = (sourceRect, destinationRect, onFinish) => {
        const { sphere, sourceX, sourceY } = createSphere(sourceRect);

        const destX = Math.round(destinationRect.left + destinationRect.width / 2 - 18);
        const destY = Math.round(destinationRect.top + destinationRect.height / 2 - 18);

        const dx = destX - sourceX;
        const dy = destY - sourceY;

        const keyframes = [
          {
            transform: `translate3d(${sourceX}px,${sourceY}px,0) scale(1)`,
            opacity: 1,
            filter: "blur(0)"
          },
          {
            transform: `translate3d(${sourceX}px,${sourceY - 22}px,0) scale(1.12)`,
            opacity: 1,
            filter: "blur(0)"
          },
          {
            transform: `translate3d(${sourceX + Math.round(dx * .12)}px,${sourceY - 76}px,0) scale(1)`,
            opacity: 1,
            filter: "blur(0)"
          },
          {
            transform: `translate3d(${sourceX + Math.round(dx * .38)}px,${sourceY + Math.round(dy * .18) - 58}px,0) scale(.86)`,
            opacity: .98,
            filter: "blur(0)"
          },
          {
            transform: `translate3d(${sourceX + Math.round(dx * .72)}px,${sourceY + Math.round(dy * .68) - 26}px,0) scale(.58)`,
            opacity: .82,
            filter: "blur(.1px)"
          },
          {
            transform: `translate3d(${destX}px,${destY}px,0) scale(.16)`,
            opacity: .05,
            filter: "blur(.45px)"
          }
        ];

        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          try { animation?.cancel(); } catch (_) {}
          sphere.remove();
          onFinish?.();
        };

        let animation;
        try {
          animation = sphere.animate(keyframes, {
            duration: 900,
            easing: "cubic-bezier(.12,.82,.22,1)",
            fill: "forwards"
          });
          animation.addEventListener("finish", finish, { once: true });
        } catch (_) {
          // Browser fallback: keep the sphere visible briefly rather than silently failing.
          window.setTimeout(finish, 900);
        }

        window.setTimeout(finish, 1050);
      };

      const selectOption = (option) => {
        const input = option.querySelector("input");
        if (!input || input.checked) return;

        const sourceElement = option.querySelector(".class-option-check") || option;
        const sourceRect = sourceElement.getBoundingClientRect();

        // 1) Menu closes immediately.
        closeMenu();

        // 2) Selection changes locally.
        input.checked = true;
        option.classList.add("is-selected");

        // 3) Create only the final plain text label. No pill/bead visuals.
        refreshVisualState();

        const target = names?.lastElementChild;
        if (!target) return;

        // Reserve the target's final space before measuring the flight destination.
        target.classList.add("selected-class-name-arriving");
        const destinationRect = target.getBoundingClientRect();

        // Hide only the final text while the real sphere is travelling.
        target.classList.add("selected-class-name-hidden");

        requestAnimationFrame(() => {
          animateSphere(sourceRect, destinationRect, () => {
            target.classList.remove("selected-class-name-hidden");
            target.classList.add("selected-class-name-settle");
            window.setTimeout(
              () => target.classList.remove("selected-class-name-settle"),
              440
            );
          });
        });
      };

      const unselectOption = (option) => {
        const input = option.querySelector("input");
        if (!input || !input.checked) return;
        input.checked = false;
        refreshVisualState();
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
          event.preventDefault();
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

        refreshVisualState();
        closeMenu();
      });

      document.addEventListener("click", (event) => {
        if (!classPicker.contains(event.target)) closeMenu();
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
      });

      refreshVisualState();
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