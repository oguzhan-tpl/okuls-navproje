# Okul Sınav Proje

Okul içindeki proje dağıtım ve teslim sürecini tek panelde yöneten Flask + TiDB uygulaması.

## Roller

### Alan şefi
- Öğretmen ve öğrenci hesabı oluşturur.
- Hesapları aktifleştirir veya pasifleştirir.
- Öğrenci şifrelerini yeniler.
- 9, 10, 11 ve 12. sınıf / şube kayıtlarını yönetir.
- Sistem genelindeki proje ve teslim istatistiklerini görür.

### Öğretmen
- Proje oluşturur.
- Ders, açıklama, gereksinim ve teslim tarihi tanımlar.
- Bir veya birden fazla sınıf seçer.
- Projeyi taslak olarak saklar veya yayınlar.
- Teslimleri sınıf sınıf ve öğrenci öğrenci görür.
- Teslim dosyasını indirir.
- Teslimi "Bekliyor / İncelendi" olarak işaretler ve öğretmen notu bırakır.
- Projeyi arşivleyebilir.

### Öğrenci
- Sadece kendi sınıfına açılan yayınlanmış projeleri görür.
- Proje açıklamasını ve son teslim tarihini görür.
- Dosyasını yükler.
- Teslim notu ekler.
- Süre dolmadan gönderisini güncelleyebilir.
- Kendi gönderisini indirir.
- Öğretmen notunu görür.

## Veri modeli

- users: hesap, rol, öğrenci numarası ve sınıf ilişkisi
- classrooms: sınıf ve şube kayıtları
- projects: öğretmen tarafından oluşturulan proje
- project_classes: proje ile hedef sınıflar arasındaki ilişki
- submissions: öğrenci teslimi, dosya içeriği ve inceleme durumu

Teslim dosyaları Render'ın geçici dosya sistemine bırakılmaz. Dosya içeriği TiDB içinde MEDIUMBLOB olarak saklanır. Varsayılan yükleme sınırı 16 MB'dır.

## Güvenlik ve dayanıklılık

- Şifreler hash olarak saklanır.
- Rol tabanlı yetkilendirme uygulanır.
- Form POST işlemleri CSRF korumalıdır.
- Session cookie'leri HttpOnly ve SameSite kullanır.
- Production ortamında COOKIE_SECURE=true kullanılabilir.
- Dosya adları güvenli biçimde normalize edilir.
- Sadece izin verilen dosya uzantıları kabul edilir.
- Güvenlik başlıkları ve temel CSP uygulanır.
- /healthz gerçek veritabanı bağlantısını SELECT 1 ile kontrol eder.
- SQLAlchemy bağlantı havuzu, pre-ping ve recycle ayarlarıyla düşük kaynaklı dağıtım hedeflenmiştir.

## Zaman

Kullanıcıların girdiği teslim tarihleri Europe/Istanbul saat diliminde kabul edilir ve veritabanında UTC olarak saklanır. Bu sayede Render sunucusunun saat dilimi değişse bile son teslim karşılaştırmaları tutarlı kalır.

## Yerel çalışma

Python 3.11 önerilir.

1. Sanal ortam oluşturun.
2. requirements.txt paketlerini kurun.
3. .env.example dosyasını .env olarak kopyalayın.
4. DATABASE_URL değerine TiDB bağlantınızı yazın.
5. BOOTSTRAP_CHIEF_USERNAME ve BOOTSTRAP_CHIEF_PASSWORD değerlerini verin.
6. Flask uygulamasını çalıştırın.

İlk açılışta bootstrap değişkenleri doluysa alan şefi hesabı otomatik oluşturulur.

## Render

Repo, Render Blueprint için render.yaml içerir.

Build komutu:
pip install -r requirements.txt

Start komutu:
gunicorn --workers 1 --threads 2 --timeout 120 app:app

Health check:
GET /healthz

Render üzerinde şu gizli değişkenler verilmelidir:

DATABASE_URL
BOOTSTRAP_CHIEF_USERNAME
BOOTSTRAP_CHIEF_PASSWORD

SECRET_KEY render.yaml tarafından üretilebilir. TiDB bağlantı adresini kaynak koduna yazmayın.

## Tasarım

Giriş ekranı bilinçli olarak iki bölümlüdür:
- sol: öğretmen
- sağ: öğrenci
- alan şefi: ayrı yönetim girişi

Panel tasarımında ince çizgiler, sıkı tipografi, koyu lacivert / açık gri yüzeyler ve veri odaklı listeler kullanılır. Mobil görünümde sabit alt navigasyon yoktur; sol menü açılır panel olur ve içerik normal şekilde kayar.

## Dizin

app.py
requirements.txt
Procfile
render.yaml
runtime.txt
.env.example
static/css/app.css
static/js/app.js
templates/
  auth_base.html
  login.html
  chief_login.html
  base.html
  teacher/
  student/
  chief/
.github/workflows/quality.yml
