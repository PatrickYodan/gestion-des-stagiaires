from django.contrib.staticfiles.management.commands.runserver import Command as StaticfilesRunserver


class Command(StaticfilesRunserver):
    """« python manage.py runserver » écoute sur toutes les interfaces (0.0.0.0) au lieu de 127.0.0.1,
    pour que l'application soit utilisable depuis un autre appareil du réseau local.
    Une adresse explicite reste possible : python manage.py runserver 127.0.0.1:8000"""

    default_addr = '0.0.0.0'
