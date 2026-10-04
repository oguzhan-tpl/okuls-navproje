document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.querySelector("[data-sidebar]");
  const toggle = document.querySelector("[data-sidebar-toggle]");
  if (sidebar && toggle) {
    toggle.addEventListener("click", () => sidebar.classList.toggle("open"));
    document.addEventListener("click", (event) => {
      if (sidebar.classList.contains("open") && !sidebar.contains(event.target) && !toggle.contains(event.target)) {
        sidebar.classList.remove("open");
      }
    });
  }

  document.querySelectorAll("[data-confirm]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      const message = form.getAttribute("data-confirm") || "Bu işlemi yapmak istediğinize emin misiniz?";
      if (!window.confirm(message)) event.preventDefault();
    });
  });

  const roleInputs = document.querySelectorAll('input[name="role"][type="radio"]');
  const studentFields = document.querySelectorAll(".student-only");
  const syncRoleFields = () => {
    const selected = document.querySelector('input[name="role"][type="radio"]:checked')?.value;
    studentFields.forEach((field) => {
      const visible = selected === "student";
      field.style.display = visible ? "grid" : "none";
      field.querySelectorAll("input,select").forEach((input) => {
        input.disabled = !visible;
        if (visible && input.name === "student_no") input.required = true;
        if (visible && input.name === "class_id") input.required = true;
        if (!visible && input.name === "student_no") input.required = false;
        if (!visible && input.name === "class_id") input.required = false;
      });
    });
  };
  roleInputs.forEach((input) => input.addEventListener("change", syncRoleFields));
  syncRoleFields();

  const fileInput = document.querySelector("#project_file");
  const fileName = document.querySelector("[data-file-name]");
  if (fileInput && fileName) {
    fileInput.addEventListener("change", () => {
      fileName.textContent = fileInput.files?.[0]?.name || "Dosya seçilmedi";
    });
  }

  document.querySelectorAll("textarea").forEach((textarea) => {
    textarea.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        textarea.form?.requestSubmit();
      }
    });
  });
});
