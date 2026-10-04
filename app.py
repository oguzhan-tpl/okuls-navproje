import hashlib
import os
import secrets
import threading
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from functools import wraps
from io import BytesIO
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from flask import (
    Flask, abort, flash, redirect, render_template, request,
    send_file, session, url_for
)
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, select, text
from sqlalchemy.dialects.mysql import MEDIUMBLOB
from sqlalchemy.exc import IntegrityError, OperationalError
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename


db = SQLAlchemy()

ROLES = {"chief", "teacher", "student"}
APP_TIMEZONE = ZoneInfo(os.getenv("APP_TIMEZONE", "Europe/Istanbul"))

# Veritabanı şeması artık Gunicorn worker başlarken oluşturulmaz.
# Böylece TiDB'nin DDL işlemleri Render deploy'unu kilitlemez.
_db_init_lock = threading.Lock()
_db_ready = False
_db_last_error = None
_db_last_attempt = 0.0

ALLOWED_EXTENSIONS = {
    "7z", "c", "cpp", "css", "csv", "doc", "docx", "gif", "html",
    "java", "jpeg", "jpg", "js", "json", "md", "pdf", "png", "ppt",
    "pptx", "py", "rar", "sql", "svg", "tar", "txt", "webp", "xlsx",
    "xml", "zip"
}


class Classroom(db.Model):
    __tablename__ = "osp_classrooms"

    id = db.Column(db.Integer, primary_key=True)
    grade = db.Column(db.SmallInteger, nullable=False)
    section = db.Column(db.String(10), nullable=False)
    name = db.Column(db.String(40), nullable=False, unique=True)
    active = db.Column(db.Boolean, nullable=False, default=True, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    students = db.relationship(
        "User",
        back_populates="classroom",
        foreign_keys="User.class_id",
        lazy="selectin",
    )
    __table_args__ = (
        db.UniqueConstraint("grade", "section", name="uq_classroom_grade_section"),
    )


class User(db.Model):
    __tablename__ = "osp_users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), nullable=False, unique=True, index=True)
    full_name = db.Column(db.String(120), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, index=True)
    student_no = db.Column(db.String(40), nullable=True, unique=True, index=True)
    class_id = db.Column(
        db.Integer,
        db.ForeignKey("osp_classrooms.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    active = db.Column(db.Boolean, nullable=False, default=True, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    last_login_at = db.Column(db.DateTime, nullable=True)

    classroom = db.relationship(
        "Classroom",
        back_populates="students",
        foreign_keys=[class_id],
    )
    projects = db.relationship(
        "Project",
        back_populates="teacher",
        foreign_keys="Project.teacher_id",
        lazy="selectin",
    )


class Project(db.Model):
    __tablename__ = "osp_projects"

    id = db.Column(db.Integer, primary_key=True)
    teacher_id = db.Column(
        db.Integer,
        db.ForeignKey("osp_users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    title = db.Column(db.String(180), nullable=False)
    course = db.Column(db.String(100), nullable=True)
    description = db.Column(db.Text, nullable=False)
    requirements = db.Column(db.Text, nullable=True)
    deadline = db.Column(db.DateTime, nullable=True, index=True)
    published = db.Column(db.Boolean, nullable=False, default=False, index=True)
    archived = db.Column(db.Boolean, nullable=False, default=False, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    teacher = db.relationship(
        "User",
        back_populates="projects",
        foreign_keys=[teacher_id],
    )
    submissions = db.relationship(
        "Submission",
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class Submission(db.Model):
    __tablename__ = "osp_submissions"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(
        db.Integer,
        db.ForeignKey("osp_projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_id = db.Column(
        db.Integer,
        db.ForeignKey("osp_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    original_filename = db.Column(db.String(255), nullable=False)
    stored_filename = db.Column(db.String(255), nullable=False)
    content_type = db.Column(db.String(140), nullable=True)
    file_size = db.Column(db.BigInteger, nullable=False)
    sha256 = db.Column(db.String(64), nullable=False, index=True)
    file_data = db.Column(MEDIUMBLOB, nullable=False)
    note = db.Column(db.Text, nullable=True)
    review_status = db.Column(
        db.String(20),
        nullable=False,
        default="pending",
        index=True,
    )
    teacher_note = db.Column(db.Text, nullable=True)
    submitted_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    project = db.relationship("Project", back_populates="submissions")
    student = db.relationship(
        "User",
        foreign_keys=[student_id],
        lazy="joined",
    )

    __table_args__ = (
        db.UniqueConstraint(
            "project_id",
            "student_id",
            name="uq_submission_project_student",
        ),
    )


def normalize_db_url(value: str) -> str:
    value = (value or "").strip()
    if not value:
        raise RuntimeError("DATABASE_URL ortam değişkeni tanımlı değil.")

    if value.startswith("mysql://"):
        value = "mysql+pymysql://" + value[len("mysql://"):]

    parts = urlsplit(value)
    configured_db = (os.getenv("DB_NAME", "test") or "test").strip().strip("/")
    system_databases = {"information_schema", "mysql", "performance_schema", "sys"}

    # TiDB'nin system şemalarına uygulama tabloları kurulamaz. Eski
    # bağlantılarda /sys kullanılmışsa otomatik olarak uygulama veritabanına
    # geçiriyoruz; özel bir veritabanı verilmişse ona dokunmuyoruz.
    database_name = parts.path.strip("/")
    if not database_name or database_name.lower() in system_databases:
        if configured_db.lower() in system_databases:
            configured_db = "test"
        database_name = configured_db
        parts = parts._replace(path=f"/{database_name}")

    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.setdefault("ssl_verify_cert", "true")
    query.setdefault("ssl_verify_identity", "true")
    return urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            parts.path,
            urlencode(query),
            parts.fragment,
        )
    )


def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def parse_local_datetime(value: str):
    local_value = datetime.strptime(value, "%Y-%m-%dT%H:%M").replace(tzinfo=APP_TIMEZONE)
    return local_value.astimezone(timezone.utc).replace(tzinfo=None)


def display_local_datetime(value):
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc).astimezone(APP_TIMEZONE)


def create_app():
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY=os.getenv("SECRET_KEY") or secrets.token_hex(32),
        SQLALCHEMY_DATABASE_URI=normalize_db_url(os.getenv("DATABASE_URL", "")),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SQLALCHEMY_ENGINE_OPTIONS={
            "pool_pre_ping": True,
            "pool_recycle": 280,
            "pool_size": int(os.getenv("DB_POOL_SIZE", "3")),
            "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "2")),
            "connect_args": {
                "connect_timeout": 10,
                "read_timeout": 60,
                "write_timeout": 60,
            },
        },
        MAX_CONTENT_LENGTH=int(os.getenv("MAX_UPLOAD_MB", "16")) * 1024 * 1024,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        PERMANENT_SESSION_LIFETIME=60 * 60 * 12,
    )
    db.init_app(app)

    @app.template_filter("dt")
    def format_datetime(value):
        if not value:
            return "—"
        return display_local_datetime(value).strftime("%d.%m.%Y %H:%M")

    @app.template_filter("filesize")
    def format_filesize(value):
        size = float(value or 0)
        for unit in ("B", "KB", "MB", "GB"):
            if size < 1024 or unit == "GB":
                return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
            size /= 1024
        return "—"

    @app.before_request
    def security_and_csrf():
        # CSRF token artık Flask session'ına bağlı değil. Böylece aynı hesabın
        # birden fazla sekmesinde veya deploy/restart sonrasında eski form token'ı
        # yüzünden gereksiz 400 hataları oluşmaz.
        return None

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data: https://images.unsplash.com; "
            "style-src 'self'; script-src 'self'; font-src 'self'; frame-ancestors 'self'"
        )
        if request.endpoint in {"home", "login"}:
            response.headers["Cache-Control"] = "no-store, max-age=0"
            response.headers["Pragma"] = "no-cache"
        return response

    @app.errorhandler(RequestEntityTooLarge)
    def too_large(_error):
        flash(
            f"Dosya çok büyük. İzin verilen üst sınır: "
            f"{app.config['MAX_CONTENT_LENGTH'] // 1024 // 1024} MB.",
            "error",
        )
        return redirect(request.referrer or url_for("home"))

    @app.errorhandler(404)
    def not_found(_error):
        return render_template("error.html", code=404, message="Sayfa bulunamadı."), 404

    @app.errorhandler(500)
    def server_error(_error):
        db.session.rollback()
        return render_template(
            "error.html",
            code=500,
            message="Sunucu tarafında beklenmeyen bir hata oluştu.",
        ), 500

    @app.errorhandler(OperationalError)
    def database_error(_error):
        db.session.rollback()
        return render_template(
            "error.html",
            code=503,
            message="Veri hizmeti şu anda geçici olarak kullanılamıyor.",
        ), 503

    def csrf_serializer():
        return URLSafeTimedSerializer(
            app.config["SECRET_KEY"],
            salt="okul-sinav-proje-csrf-v1",
        )

    def csrf_token():
        return csrf_serializer().dumps(
            {"nonce": secrets.token_urlsafe(18)}
        )

    def csrf_protect():
        token = (request.form.get("_csrf") or request.headers.get("X-CSRF-Token") or "").strip()
        if not token:
            flash("Güvenlik oturumu yenilendi. Lütfen işlemi tekrar gönderin.", "error")
            return False

        try:
            csrf_serializer().loads(token, max_age=60 * 60 * 12)
            return True
        except (BadSignature, SignatureExpired):
            flash("Güvenlik oturumu yenilendi. Formu yeniden açıp tekrar gönderin.", "error")
            return False

    def get_current_user():
        uid = session.get("user_id")
        if not uid:
            return None
        user = db.session.get(User, uid)
        if not user or not user.active:
            session.clear()
            return None
        return user

    app.jinja_env.globals["current_user"] = get_current_user
    app.jinja_env.globals["csrf_token"] = csrf_token

    def login_required(*roles):
        def decorator(view):
            @wraps(view)
            def wrapped(*args, **kwargs):
                user = get_current_user()
                if not user:
                    return redirect(url_for("login"))
                if roles and user.role not in roles:
                    abort(403)
                return view(*args, **kwargs)
            return wrapped
        return decorator

    def ensure_database():
        global _db_ready, _db_last_error, _db_last_attempt

        if _db_ready:
            return True, None

        # Aynı worker içindeki paralel ilk isteklerin birbirini ezmesini önler.
        with _db_init_lock:
            if _db_ready:
                return True, None

            now = time.monotonic()
            # Hatalı bir veritabanı yapılandırmasında her isteğin tekrar tekrar
            # DDL denemesine girmesini önle. 10 saniye sonra yeniden deneyebilir.
            if _db_last_error and now - _db_last_attempt < 10:
                return False, _db_last_error

            _db_last_attempt = now
            try:
                with app.app_context():
                    # TiDB üzerinde uygulama tabloları yalnızca uygulama
                    # veritabanında oluşturulur. OSP_ tablolari eski şemayla
                    # çakışmaz. normalize_db_url() /sys gibi
                    # sistem şemalarını DB_NAME (varsayılan: test) ile değiştirir.
                    db.create_all()

                    username = os.getenv("BOOTSTRAP_CHIEF_USERNAME", "").strip().lower()
                    password = os.getenv("BOOTSTRAP_CHIEF_PASSWORD", "")
                    full_name = os.getenv("BOOTSTRAP_CHIEF_NAME", "Alan Şefi").strip()

                    if username and password:
                        exists = db.session.scalar(
                            select(User.id).where(User.username == username)
                        )
                        if not exists:
                            chief = User(
                                username=username,
                                full_name=full_name or "Alan Şefi",
                                password_hash=generate_password_hash(password),
                                role="chief",
                                active=True,
                            )
                            db.session.add(chief)
                            try:
                                db.session.commit()
                            except IntegrityError:
                                db.session.rollback()

                _db_ready = True
                _db_last_error = None
                app.logger.info("Database schema is ready.")
                return True, None
            except Exception as exc:
                db.session.rollback()
                _db_last_error = str(exc)
                app.logger.exception("Database initialization failed.")
                return False, _db_last_error

    @app.before_request
    def ensure_database_for_application_requests():
        # Render'ın health check'i yalnızca process/HTTP canlılığını ölçsün.
        # Veritabanı DDL'si yüzünden deploy'un kilitlenmesini istemiyoruz.
        if request.path == "/healthz" or request.path.startswith("/static/"):
            return None

        ready, error = ensure_database()
        if ready:
            return None

        return render_template(
            "error.html",
            code=503,
            message=(
                "Veritabanı hazırlanamadı. Render/TiDB bağlantısını kontrol edin."
            ),
            debug_message=error if app.debug else None,
        ), 503

    @app.get("/healthz")
    def healthz():
        # Liveness endpoint: DB/DDL işlemi içermez. Render'ın yeni container'ı
        # portu açar açmaz sağlıklı kabul edilebilsin.
        return {"status": "ok", "service": "okuls-navproje"}, 200

    @app.get("/readyz")
    def readyz():
        ready, error = ensure_database()
        if ready:
            return {"status": "ready", "database": "ok"}, 200
        return {"status": "not_ready", "database": "error", "message": error}, 503

    @app.route("/", methods=["GET"])
    def home():
        user = get_current_user()
        if user:
            return redirect(
                {
                    "chief": url_for("chief_dashboard"),
                    "teacher": url_for("teacher_dashboard"),
                    "student": url_for("student_dashboard"),
                }[user.role]
            )
        return render_template("login.html")

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if request.method == "GET" and request.args.get("role") == "chief":
            return render_template("chief_login.html")
        if request.method == "POST":
            if not csrf_protect():
                return redirect(url_for("login"))
            role = request.form.get("role", "").strip()
            username = request.form.get("username", "").strip().lower()
            password = request.form.get("password", "")

            if role not in ROLES or not username or not password:
                flash("Kullanıcı adı, şifre ve hesap türünü eksiksiz doldurun.", "error")
                return redirect(url_for("login"))

            user = db.session.scalar(
                select(User).where(User.username == username)
            )
            if (
                not user
                or not user.active
                or user.role != role
                or not check_password_hash(user.password_hash, password)
            ):
                flash("Girdiğiniz bilgilerle eşleşen aktif bir hesap bulunamadı.", "error")
                return redirect(url_for("login"))

            session.clear()
            session["user_id"] = user.id
            session["_csrf"] = secrets.token_urlsafe(32)
            session.permanent = True
            user.last_login_at = utc_now()
            db.session.commit()

            target = {
                "chief": "chief_dashboard",
                "teacher": "teacher_dashboard",
                "student": "student_dashboard",
            }[role]
            return redirect(url_for(target))

        return redirect(url_for("home"))

    @app.post("/logout")
    def logout():
        if not csrf_protect():
            return redirect(url_for("home"))
        session.clear()
        return redirect(url_for("home"))

    @app.get("/teacher")
    @login_required("teacher")
    def teacher_dashboard():
        user = get_current_user()
        project_rows = db.session.execute(
            select(
                Project,
                func.count(Submission.id).label("submission_count"),
            )
            .outerjoin(Submission, Submission.project_id == Project.id)
            .where(Project.teacher_id == user.id, Project.archived.is_(False))
            .group_by(Project.id)
            .order_by(Project.created_at.desc())
        ).all()

        published_count = sum(1 for project, _ in project_rows if project.published)
        pending_count = db.session.scalar(
            select(func.count(Submission.id))
            .join(Project, Submission.project_id == Project.id)
            .where(
                Project.teacher_id == user.id,
                Submission.review_status == "pending",
                Project.archived.is_(False),
            )
        ) or 0
        return render_template(
            "teacher/dashboard.html",
            projects=project_rows,
            published_count=published_count,
            pending_count=pending_count,
        )

    @app.route("/teacher/projects/new", methods=["GET", "POST"])
    @login_required("teacher")
    def teacher_create_project():
        if request.method == "POST":
            csrf_protect()
            title = request.form.get("title", "").strip()
            course = request.form.get("course", "").strip()
            description = request.form.get("description", "").strip()
            requirements = request.form.get("requirements", "").strip()
            deadline_raw = request.form.get("deadline", "").strip()
            publish = request.form.get("publish") == "1"

            if not title or not description:
                flash("Proje başlığı ve açıklaması zorunludur.", "error")
                return render_template(
                    "teacher/project_form.html",
                    form=request.form,
                )

            deadline = None
            if deadline_raw:
                try:
                    deadline = parse_local_datetime(deadline_raw)
                except ValueError:
                    flash("Teslim tarihi biçimi geçersiz.", "error")
                    return render_template(
                        "teacher/project_form.html",
                        form=request.form,
                    )

            if deadline and deadline < utc_now():
                flash("Teslim tarihi geçmişte olamaz.", "error")
                return render_template(
                    "teacher/project_form.html",
                    form=request.form,
                )

            project = Project(
                teacher_id=get_current_user().id,
                title=title,
                course=course or None,
                description=description,
                requirements=requirements or None,
                deadline=deadline,
                published=publish,
                archived=False,
            )
            db.session.add(project)
            db.session.commit()
            flash(
                "Proje oluşturuldu ve "
                + ("tüm öğrencilere yayınlandı." if publish else "taslak olarak kaydedildi."),
                "success",
            )
            return redirect(url_for("teacher_project_detail", project_id=project.id))

        return render_template(
            "teacher/project_form.html",
            form={},
        )

    @app.get("/teacher/projects/<int:project_id>")
    @login_required("teacher")
    def teacher_project_detail(project_id):
        user = get_current_user()
        project = db.session.get(Project, project_id)
        if not project or project.teacher_id != user.id:
            abort(404)

        classrooms = (
            Classroom.query.filter_by(active=True)
            .order_by(Classroom.grade, Classroom.section)
            .all()
        )
        students = (
            User.query
            .filter(User.role == "student", User.active.is_(True))
            .order_by(User.class_id, User.full_name)
            .all()
        )
        submissions = Submission.query.filter_by(project_id=project.id).all()
        by_student = {item.student_id: item for item in submissions}

        grouped = []
        for classroom in classrooms:
            class_students = [s for s in students if s.class_id == classroom.id]
            grouped.append(
                {
                    "classroom": classroom,
                    "students": [
                        {"student": student, "submission": by_student.get(student.id)}
                        for student in class_students
                    ],
                }
            )

        unassigned_students = [s for s in students if s.class_id is None]
        if unassigned_students:
            grouped.append(
                {
                    "classroom": None,
                    "students": [
                        {"student": student, "submission": by_student.get(student.id)}
                        for student in unassigned_students
                    ],
                }
            )

        submitted = len(submissions)
        total_students = len(students)
        return render_template(
            "teacher/project_detail.html",
            project=project,
            grouped=grouped,
            submitted=submitted,
            total_students=total_students,
        )

    @app.post("/teacher/projects/<int:project_id>/toggle")
    @login_required("teacher")
    def teacher_project_toggle(project_id):
        if not csrf_protect():
            return redirect(request.referrer or url_for("teacher_dashboard"))
        project = db.session.get(Project, project_id)
        if not project or project.teacher_id != get_current_user().id:
            abort(404)
        if project.archived:
            flash("Arşivlenmiş proje yeniden yayınlanamaz.", "error")
            return redirect(url_for("teacher_project_detail", project_id=project.id))

        project.published = not project.published
        project.updated_at = utc_now()
        db.session.commit()
        flash("Proje durumu güncellendi.", "success")
        return redirect(url_for("teacher_project_detail", project_id=project.id))

    @app.post("/teacher/projects/<int:project_id>/archive")
    @login_required("teacher")
    def teacher_project_archive(project_id):
        csrf_protect()
        project = db.session.get(Project, project_id)
        if not project or project.teacher_id != get_current_user().id:
            abort(404)

        project.archived = True
        project.published = False
        project.updated_at = utc_now()
        db.session.commit()
        flash("Proje arşive alındı.", "success")
        return redirect(url_for("teacher_dashboard"))

    @app.post("/teacher/submissions/<int:submission_id>/review")
    @login_required("teacher")
    def teacher_review_submission(submission_id):
        if not csrf_protect():
            return redirect(request.referrer or url_for("teacher_dashboard"))
        submission = db.session.get(Submission, submission_id)
        if (
            not submission
            or submission.project.teacher_id != get_current_user().id
        ):
            abort(404)

        status = request.form.get("review_status", "pending")
        if status not in {"pending", "reviewed"}:
            status = "pending"
        submission.review_status = status
        submission.teacher_note = request.form.get("teacher_note", "").strip() or None
        submission.updated_at = utc_now()
        db.session.commit()
        flash("Teslim bilgisi güncellendi.", "success")
        return redirect(
            url_for("teacher_project_detail", project_id=submission.project_id)
        )

    @app.get("/teacher/submissions/<int:submission_id>/download")
    @login_required("teacher")
    def teacher_download_submission(submission_id):
        submission = db.session.get(Submission, submission_id)
        if (
            not submission
            or submission.project.teacher_id != get_current_user().id
        ):
            abort(404)
        return send_submission_file(submission)

    @app.get("/student")
    @login_required("student")
    def student_dashboard():
        user = get_current_user()
        active_projects = (
            Project.query
            .filter(
                Project.published.is_(True),
                Project.archived.is_(False),
            )
            .order_by(
                Project.deadline.is_(None),
                Project.deadline.asc(),
                Project.created_at.desc(),
            )
            .all()
        )
        submissions = Submission.query.filter(
            Submission.student_id == user.id
        ).all()
        by_project = {item.project_id: item for item in submissions}
        return render_template(
            "student/dashboard.html",
            projects=active_projects,
            by_project=by_project,
        )

    @app.get("/student/projects/<int:project_id>")
    @login_required("student")
    def student_project_detail(project_id):
        user = get_current_user()
        project = db.session.get(Project, project_id)
        if (
            not project
            or not project.published
            or project.archived
        ):
            abort(404)
        submission = db.session.scalar(
            select(Submission).where(
                Submission.project_id == project.id,
                Submission.student_id == user.id,
            )
        )
        return render_template(
            "student/project_detail.html",
            project=project,
            submission=submission,
            locked=bool(project.deadline and utc_now() > project.deadline),
        )

    @app.post("/student/projects/<int:project_id>/submit")
    @login_required("student")
    def student_submit(project_id):
        csrf_protect()
        user = get_current_user()
        project = db.session.get(Project, project_id)
        if (
            not project
            or not project.published
            or project.archived
            or user.class_id not in {c.id for c in project.classes}
        ):
            abort(404)

        if project.deadline and datetime.utcnow() > project.deadline:
            flash("Bu projenin teslim süresi sona erdi.", "error")
            return redirect(url_for("student_project_detail", project_id=project.id))

        upload = request.files.get("project_file")
        if not upload or not upload.filename:
            flash("Yüklenecek bir dosya seçmelisiniz.", "error")
            return redirect(url_for("student_project_detail", project_id=project.id))

        safe_name = secure_filename(upload.filename)
        if not safe_name or "." not in safe_name:
            flash("Dosya adı geçersiz.", "error")
            return redirect(url_for("student_project_detail", project_id=project.id))

        ext = safe_name.rsplit(".", 1)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            flash("Bu dosya türüne izin verilmiyor.", "error")
            return redirect(url_for("student_project_detail", project_id=project.id))

        raw = upload.read()
        if not raw:
            flash("Seçtiğiniz dosya boş.", "error")
            return redirect(url_for("student_project_detail", project_id=project.id))

        max_bytes = current_app_max_upload()
        if len(raw) > max_bytes:
            flash("Dosya boyutu izin verilen sınırı aşıyor.", "error")
            return redirect(url_for("student_project_detail", project_id=project.id))

        digest = hashlib.sha256(raw).hexdigest()
        submission = db.session.scalar(
            select(Submission).where(
                Submission.project_id == project.id,
                Submission.student_id == user.id,
            )
        )
        now = utc_now()
        if submission:
            submission.original_filename = upload.filename[:255]
            submission.stored_filename = safe_name[:255]
            submission.content_type = upload.mimetype
            submission.file_size = len(raw)
            submission.sha256 = digest
            submission.file_data = raw
            submission.note = request.form.get("note", "").strip() or None
            submission.submitted_at = submission.submitted_at
            submission.updated_at = now
            submission.review_status = "pending"
            flash("Proje dosyanız güncellendi.", "success")
        else:
            submission = Submission(
                project_id=project.id,
                student_id=user.id,
                original_filename=upload.filename[:255],
                stored_filename=safe_name[:255],
                content_type=upload.mimetype,
                file_size=len(raw),
                sha256=digest,
                file_data=raw,
                note=request.form.get("note", "").strip() or None,
                review_status="pending",
                submitted_at=now,
                updated_at=now,
            )
            db.session.add(submission)
            flash("Projeniz başarıyla teslim edildi.", "success")

        db.session.commit()
        return redirect(url_for("student_project_detail", project_id=project.id))

    @app.get("/student/submissions/<int:submission_id>/download")
    @login_required("student")
    def student_download_submission(submission_id):
        submission = db.session.get(Submission, submission_id)
        if not submission or submission.student_id != get_current_user().id:
            abort(404)
        return send_submission_file(submission)

    @app.route("/chief", methods=["GET"])
    @login_required("chief")
    def chief_dashboard():
        stats = {
            "students": db.session.scalar(
                select(func.count(User.id)).where(User.role == "student")
            ) or 0,
            "teachers": db.session.scalar(
                select(func.count(User.id)).where(User.role == "teacher")
            ) or 0,
            "classes": db.session.scalar(
                select(func.count(Classroom.id)).where(Classroom.active.is_(True))
            ) or 0,
            "projects": db.session.scalar(
                select(func.count(Project.id)).where(Project.archived.is_(False))
            ) or 0,
            "submissions": db.session.scalar(
                select(func.count(Submission.id))
            ) or 0,
        }
        recent_projects = (
            Project.query.order_by(Project.created_at.desc()).limit(8).all()
        )
        return render_template(
            "chief/dashboard.html",
            stats=stats,
            recent_projects=recent_projects,
        )

    @app.get("/chief/teachers/<int:user_id>")
    @login_required("chief")
    def chief_teacher_detail(user_id):
        teacher = db.session.get(User, user_id)
        if not teacher or teacher.role != "teacher":
            abort(404)

        projects = (
            Project.query
            .filter(Project.teacher_id == teacher.id)
            .order_by(Project.created_at.desc())
            .all()
        )
        submissions = (
            Submission.query
            .join(Project, Submission.project_id == Project.id)
            .filter(Project.teacher_id == teacher.id)
            .order_by(Submission.submitted_at.desc())
            .all()
        )

        per_project = {}
        for project in projects:
            per_project[project.id] = {
                "project": project,
                "submissions": [s for s in submissions if s.project_id == project.id],
            }

        stats = {
            "projects": len(projects),
            "published": sum(1 for p in projects if p.published and not p.archived),
            "submissions": len(submissions),
            "students": len({s.student_id for s in submissions}),
        }
        return render_template(
            "chief/teacher_detail.html",
            teacher=teacher,
            projects=projects,
            submissions=submissions,
            per_project=per_project,
            stats=stats,
        )

    @app.get("/chief/submissions/<int:submission_id>/download")
    @login_required("chief")
    def chief_download_submission(submission_id):
        submission = db.session.get(Submission, submission_id)
        if not submission:
            abort(404)
        return send_submission_file(submission)

    @app.post("/chief/users/<int:user_id>/delete")
    @login_required("chief")
    def chief_delete_user(user_id):
        if not csrf_protect():
            return redirect(request.referrer or url_for("chief_users"))
        user = db.session.get(User, user_id)
        if not user or user.role != "teacher":
            abort(404)

        project_count = db.session.scalar(
            select(func.count(Project.id)).where(Project.teacher_id == user.id)
        ) or 0

        # Teacher deletion is intentionally destructive only for that teacher's
        # projects/submissions. It never touches other teachers, students or classes.
        projects = Project.query.filter(Project.teacher_id == user.id).all()
        for project in projects:
            for submission in Submission.query.filter_by(project_id=project.id).all():
                db.session.delete(submission)
            db.session.delete(project)

        db.session.delete(user)
        try:
            db.session.commit()
            flash(
                f"{user.full_name} hesabı ve kendisine ait {project_count} proje silindi.",
                "success",
            )
        except Exception:
            db.session.rollback()
            flash("Öğretmen hesabı silinemedi; veri değişikliği geri alındı.", "error")
        return redirect(url_for("chief_users"))

    @app.route("/chief/users", methods=["GET", "POST"])
    @login_required("chief")
    def chief_users():
        classrooms = (
            Classroom.query.filter_by(active=True)
            .order_by(Classroom.grade, Classroom.section)
            .all()
        )
        if request.method == "POST":
            csrf_protect()
            role = request.form.get("role", "").strip()
            username = request.form.get("username", "").strip().lower()
            full_name = request.form.get("full_name", "").strip()
            password = request.form.get("password", "")
            student_no = request.form.get("student_no", "").strip() or None
            class_id = request.form.get("class_id", "").strip() or None

            if role not in {"teacher", "student"}:
                flash("Geçersiz hesap türü.", "error")
                return redirect(url_for("chief_users"))
            if len(username) < 3 or len(full_name) < 2 or len(password) < 8:
                flash("Kullanıcı adı, ad soyad ve en az 8 karakterlik şifre gereklidir.", "error")
                return redirect(url_for("chief_users"))
            if role == "student" and not student_no:
                flash("Öğrenci hesabı için öğrenci numarası gereklidir.", "error")
                return redirect(url_for("chief_users"))
            if role == "student" and not class_id:
                flash("Öğrenci hesabı için sınıf seçilmelidir.", "error")
                return redirect(url_for("chief_users"))

            chosen_class = db.session.get(Classroom, int(class_id)) if class_id else None
            if role == "student" and (not chosen_class or not chosen_class.active):
                flash("Seçilen sınıf aktif değil.", "error")
                return redirect(url_for("chief_users"))

            user = User(
                username=username,
                full_name=full_name,
                password_hash=generate_password_hash(password),
                role=role,
                student_no=student_no,
                class_id=chosen_class.id if chosen_class else None,
                active=True,
            )
            db.session.add(user)
            try:
                db.session.commit()
                flash("Hesap oluşturuldu.", "success")
            except IntegrityError:
                db.session.rollback()
                flash("Kullanıcı adı veya öğrenci numarası zaten kullanılıyor.", "error")
            return redirect(url_for("chief_users"))

        role_filter = request.args.get("role", "").strip()
        query = User.query.filter(User.role.in_(["teacher", "student"]))
        if role_filter in {"teacher", "student"}:
            query = query.filter(User.role == role_filter)
        users = query.order_by(User.active.desc(), User.role, User.full_name).all()
        return render_template(
            "chief/users.html",
            users=users,
            classrooms=classrooms,
            role_filter=role_filter,
        )

    @app.post("/chief/users/<int:user_id>/toggle")
    @login_required("chief")
    def chief_toggle_user(user_id):
        csrf_protect()
        user = db.session.get(User, user_id)
        if not user or user.role == "chief":
            abort(404)
        user.active = not user.active
        db.session.commit()
        flash("Hesap durumu güncellendi.", "success")
        return redirect(url_for("chief_users"))

    @app.post("/chief/users/<int:user_id>/class")
    @login_required("chief")
    def chief_change_student_class(user_id):
        csrf_protect()
        user = db.session.get(User, user_id)
        if not user or user.role != "student":
            abort(404)

        class_id_raw = request.form.get("class_id", "").strip()
        try:
            class_id = int(class_id_raw)
        except ValueError:
            class_id = 0

        classroom = db.session.get(Classroom, class_id)
        if not classroom or not classroom.active:
            flash("Geçerli ve aktif bir sınıf seçmelisiniz.", "error")
            return redirect(url_for("chief_users"))

        user.class_id = classroom.id
        db.session.commit()
        flash(f"{user.full_name} hesabı {classroom.name} sınıfına taşındı.", "success")
        return redirect(url_for("chief_users"))

    @app.post("/chief/users/<int:user_id>/reset-password")
    @login_required("chief")
    def chief_reset_password(user_id):
        csrf_protect()
        user = db.session.get(User, user_id)
        if not user or user.role == "chief":
            abort(404)
        password = request.form.get("password", "")
        if len(password) < 8:
            flash("Yeni şifre en az 8 karakter olmalıdır.", "error")
            return redirect(url_for("chief_users"))
        user.password_hash = generate_password_hash(password)
        db.session.commit()
        flash(f"{user.full_name} hesabının şifresi yenilendi.", "success")
        return redirect(url_for("chief_users"))

    @app.route("/chief/classes", methods=["GET", "POST"])
    @login_required("chief")
    def chief_classes():
        if request.method == "POST":
            csrf_protect()
            grade_raw = request.form.get("grade", "").strip()
            section = request.form.get("section", "").strip().upper()

            try:
                grade = int(grade_raw)
            except ValueError:
                grade = 0

            if grade not in {9, 10, 11, 12} or not section:
                flash("Sınıf seviyesi 9–12 arasında ve şube alanı dolu olmalıdır.", "error")
                return redirect(url_for("chief_classes"))

            name = f"{grade}/{section}"
            classroom = Classroom(grade=grade, section=section, name=name, active=True)
            db.session.add(classroom)
            try:
                db.session.commit()
                flash(f"{name} sınıfı oluşturuldu.", "success")
            except IntegrityError:
                db.session.rollback()
                flash("Bu sınıf zaten kayıtlı.", "error")
            return redirect(url_for("chief_classes"))

        classrooms = (
            Classroom.query.order_by(Classroom.active.desc(), Classroom.grade, Classroom.section)
            .all()
        )
        return render_template("chief/classes.html", classrooms=classrooms)

    @app.post("/chief/classes/<int:class_id>/toggle")
    @login_required("chief")
    def chief_toggle_class(class_id):
        csrf_protect()
        classroom = db.session.get(Classroom, class_id)
        if not classroom:
            abort(404)
        classroom.active = not classroom.active
        db.session.commit()
        flash("Sınıf durumu güncellendi.", "success")
        return redirect(url_for("chief_classes"))

    @app.route("/chief/projects", methods=["GET"])
    @login_required("chief")
    def chief_projects():
        projects = Project.query.order_by(Project.created_at.desc()).all()
        return render_template("chief/projects.html", projects=projects)

    def send_submission_file(submission):
        download_name = secure_filename(
            submission.original_filename or submission.stored_filename
        ) or "proje-dosyasi"
        return send_file(
            BytesIO(submission.file_data),
            as_attachment=True,
            download_name=download_name,
            mimetype=submission.content_type or "application/octet-stream",
            max_age=0,
        )

    def current_app_max_upload():
        return app.config["MAX_CONTENT_LENGTH"]

    return app


app = create_app()
