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

    /* Teacher project class selector — visual only. */
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
      const layer = document.querySelector("[data-class-selection-layer]");
      const options = [...classPicker.querySelectorAll("[data-class-option]")];

      const selectedOptions = () =>
        options.filter((option) => option.querySelector("input")?.checked === true);

      const openMenu = () => {
        if (!menu) return;
        menu.hidden = false;
        classPicker.classList.add("is-open");
        trigger?.setAttribute("aria-expanded", "true");
      };

      const closeMenu = () => {
        if (!menu) return;
        menu.hidden = true;
        classPicker.classList.remove("is-open");
        trigger?.setAttribute("aria-expanded", "false");
      };

      const updateMeta = () => {
        const selected = selectedOptions();
        const namesText = selected.map((item) => item.dataset.className || "Sınıf");

        if (countLabel) {
          countLabel.textContent = selected.length + " sınıf seçildi";
        }
        if (triggerTitle) {
          triggerTitle.textContent =
            selected.length === 0 ? "Sınıf seçin" :
            selected.length === 1 ? namesText[0] :
            selected.length + " sınıf seçildi";
        }
        if (triggerSubtitle) {
          triggerSubtitle.textContent =
            selected.length ? namesText.join(" • ") : "Birden fazla sınıf seçebilirsiniz";
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

      const renderNames = (animateClassId = "") => {
        if (!names) return null;

        names.replaceChildren();
        let arriving = null;

        selectedOptions().forEach((option, index) => {
          if (index) {
            const divider = document.createElement("span");
            divider.className = "selected-class-name-divider";
            divider.textContent = "·";
            names.appendChild(divider);
          }

          const label = document.createElement("span");
          label.className = "selected-class-name";
          label.dataset.classId = option.dataset.classId || "";
          label.textContent = option.dataset.className || "Sınıf";

          if (animateClassId && label.dataset.classId === animateClassId) {
            label.classList.add("is-arriving");
            arriving = label;
          }

          names.appendChild(label);
        });

        return arriving;
      };

      const spawnSphere = (originElement, targetElement) => {
        if (!layer || !originElement || !targetElement) return;

        const origin = originElement.getBoundingClientRect();
        const target = targetElement.getBoundingClientRect();

        const ox = Math.round(origin.left + origin.width / 2);
        const oy = Math.round(origin.top + origin.height / 2);
        const tx = Math.round(target.left + target.width / 2);
        const ty = Math.round(target.top + target.height / 2);

        const sphere = document.createElement("span");
        sphere.className = "class-selection-sphere";
        sphere.setAttribute("aria-hidden", "true");
        layer.appendChild(sphere);

        // Paint the sphere once at its source before starting the movement.
        void sphere.offsetWidth;

        const startX = ox - 18;
        const startY = oy - 18;
        const endX = tx - 18;
        const endY = ty - 18;
        const midX = startX + Math.round((endX - startX) * 0.44);
        const dx = endX - startX;
        const dy = endY - startY;

        let animation;
        let done = false;

        const cleanup = () => {
          if (done) return;
          done = true;
          try { animation?.cancel(); } catch (_) {}
          sphere.remove();
          targetElement.classList.remove("is-arriving", "is-settling");
        };

        try {
          animation = sphere.animate(
            [
              {
                transform: `translate3d(${startX}px,${startY}px,0) scale(1)`,
                opacity: 1
              },
              {
                transform: `translate3d(${startX}px,${startY - 26}px,0) scale(1.16)`,
                opacity: 1
              },
              {
                transform: `translate3d(${startX + Math.round(dx * .10)}px,${startY - 72}px,0) scale(1.02)`,
                opacity: 1
              },
              {
                transform: `translate3d(${midX}px,${startY + Math.round(dy * .22) - 66}px,0) scale(.82)`,
                opacity: 1
              },
              {
                transform: `translate3d(${startX + Math.round(dx * .76)}px,${startY + Math.round(dy * .72) - 30}px,0) scale(.52)`,
                opacity: .86
              },
              {
                transform: `translate3d(${endX}px,${endY}px,0) scale(.12)`,
                opacity: .05
              }
            ],
            {
              duration: 980,
              easing: "cubic-bezier(.16,.86,.22,1)",
              fill: "forwards"
            }
          );

          animation.addEventListener("finish", () => {
            targetElement.classList.remove("is-arriving");
            targetElement.classList.add("is-settling");
            window.setTimeout(() => targetElement.classList.remove("is-settling"), 360);
            cleanup();
          }, { once: true });
        } catch (_) {
          window.setTimeout(cleanup, 980);
        }

        window.setTimeout(cleanup, 1200);
      };

      const selectClass = (option) => {
        const input = option.querySelector("input");
        if (!input || input.checked) return;

        const origin = option.querySelector(".class-option-check") || option;

        // Close before touching the visual target.
        closeMenu();

        input.checked = true;
        updateMeta();
        const target = renderNames(option.dataset.classId || "");

        if (!target) return;

        // The target is created first, but remains transparent while the sphere flies.
        requestAnimationFrame(() => {
          const targetRect = target.getBoundingClientRect();
          target.classList.add("is-arriving");

          // A second frame guarantees the transparent destination has its final layout.
          requestAnimationFrame(() => {
            spawnSphere(origin, {
              getBoundingClientRect: () => targetRect
            });

            window.setTimeout(() => {
              target.classList.remove("is-arriving");
              target.classList.add("is-settling");
              window.setTimeout(() => target.classList.remove("is-settling"), 360);
            }, 1000);
          });
        });
      };

      const unselectClass = (option) => {
        const input = option.querySelector("input");
        if (!input || !input.checked) return;
        input.checked = false;
        updateMeta();
        renderNames();
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
          if (input?.checked) unselectClass(option);
          else selectClass(option);
        });

        input?.addEventListener("change", (event) => {
          event.stopPropagation();
          if (input.checked) selectClass(option);
          else unselectClass(option);
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

        updateMeta();
        renderNames();
        closeMenu();
      });

      document.addEventListener("click", (event) => {
        if (!classPicker.contains(event.target)) closeMenu();
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
      });

      updateMeta();
      renderNames();
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