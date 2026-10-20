import os
from pathlib import Path
from datetime import timedelta

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Variables locales (identifiants SMTP…) lues depuis le fichier .env à la racine du projet Django.
# Ce fichier contient des secrets : il ne doit jamais être partagé ni versionné.
try:
    from dotenv import load_dotenv

    load_dotenv(BASE_DIR / '.env')
except ImportError:
    pass


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = 'django-insecure-g&^3sjic+@4r@0l(ma2&!a)=b&$dh!vqjn@qad3dphs-yj#8&)'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True



def _ip_reseau_local():
    """Adresse IPv4 du poste sur le réseau local (aucun paquet n'est envoyé)."""
    import socket

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('10.255.255.255', 1))
            return s.getsockname()[0]
    except OSError:
        return None


IP_RESEAU_LOCAL = _ip_reseau_local()

# Hôtes autorisés : poste local + adresse sur le réseau local (accès depuis un téléphone / autre PC).
# ALLOWED_HOSTS dans .env (séparés par des virgules) permet d'en ajouter.
ALLOWED_HOSTS = ['localhost', '127.0.0.1'] + ([IP_RESEAU_LOCAL] if IP_RESEAU_LOCAL else [])
ALLOWED_HOSTS += [h.strip() for h in os.environ.get('ALLOWED_HOSTS', '').split(',') if h.strip()]


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    # Avant staticfiles : sa commande « runserver » (écoute réseau par défaut) doit être prioritaire
    'mairies',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]


ROOT_URLCONF = 'mairie.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'mairie.wsgi.application'


# Database
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}


# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': (
            'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'
        ),
    },
    {
        'NAME': (
            'django.contrib.auth.password_validation.MinimumLengthValidator'
        ),
    },
    {
        'NAME': (
            'django.contrib.auth.password_validation.CommonPasswordValidator'
        ),
    },
    {
        'NAME': (
            'django.contrib.auth.password_validation.NumericPasswordValidator'
        ),
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/

LANGUAGE_CODE = 'fr-fr'  # Passage en français pour l'interface admin

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/

STATIC_URL = 'static/'

# Media files (Fichiers téléversés : documents de stage, etc.)
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Configuration CORS pour React
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',  # Vite
    'http://localhost:3000',  # Create React App
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
]
# Application ouverte depuis un autre appareil du réseau local (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
CORS_ALLOWED_ORIGIN_REGEXES = [
    r'^http://(192\.168\.\d{1,3}|10\.\d{1,3}\.\d{1,3})\.\d{1,3}:(5173|3000)$',
    r'^http://172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}:(5173|3000)$',
]

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Modèle Utilisateur sur-mesure
AUTH_USER_MODEL = 'mairies.Utilisateur'

# ==========================================
# CONFIGURATION REST FRAMEWORK & SIMPLE JWT
# ==========================================

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    # Limite les demandes « mot de passe oublié » par adresse IP (anti-abus)
    'DEFAULT_THROTTLE_RATES': {
        'mot_de_passe_oublie': '5/hour',  # demandes de lien
        'reinitialisation_mot_de_passe': '10/hour',  # saisies du nouveau mot de passe
    },
}

# Durée de validité du lien « mot de passe oublié » (en secondes)
PASSWORD_RESET_TIMEOUT = 3600

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}
# Connexion par e-mail (API) ; le nom d'utilisateur reste accepté pour l'interface /admin de Django
AUTHENTICATION_BACKENDS = [
    'mairies.backends.EmailBackend',
    'django.contrib.auth.backends.ModelBackend',
]

# ==========================================
# ENVOI D'E-MAILS (identifiants des nouveaux comptes)
# ==========================================
# Configuration via le fichier .env (voir .env.example) ou des variables d'environnement, par ex. Gmail :
#   EMAIL_HOST=smtp.gmail.com  EMAIL_PORT=587  EMAIL_USE_TLS=1
#   EMAIL_HOST_USER=adresse@gmail.com  EMAIL_HOST_PASSWORD=<mot de passe d'application>
# Sans EMAIL_HOST, les e-mails sont affichés dans la console du serveur (mode développement).
EMAIL_HOST = os.environ.get('EMAIL_HOST', '')
if EMAIL_HOST:
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
    EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', '1') == '1'
    EMAIL_USE_SSL = os.environ.get('EMAIL_USE_SSL', '0') == '1'  # port 465
    EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
    EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
    EMAIL_TIMEOUT = 15
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
DEFAULT_FROM_EMAIL = os.environ.get(
    'DEFAULT_FROM_EMAIL', f"Mairie - Gestion des Stagiaires <{os.environ.get('EMAIL_HOST_USER') or 'noreply@mairie.local'}>"
)

# Adresse de l'application React, utilisée dans les e-mails
# Par défaut : adresse du poste sur le réseau local, pour que le lien fonctionne depuis un autre appareil
FRONTEND_URL = os.environ.get('FRONTEND_URL') or f"http://{IP_RESEAU_LOCAL or 'localhost'}:5173"
