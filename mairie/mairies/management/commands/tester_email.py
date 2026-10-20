from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Envoie un e-mail de test pour vérifier la configuration SMTP. Usage : python manage.py tester_email adresse@exemple.com"

    def add_arguments(self, parser):
        parser.add_argument('destinataire')

    def handle(self, *args, **options):
        destinataire = options['destinataire']
        if settings.EMAIL_BACKEND.endswith('console.EmailBackend'):
            self.stdout.write(self.style.WARNING(
                "SMTP non configuré (EMAIL_HOST absent du fichier .env) : l'e-mail sera seulement affiché ci-dessous."
            ))
        else:
            self.stdout.write(f'Serveur : {settings.EMAIL_HOST}:{settings.EMAIL_PORT} — compte : {settings.EMAIL_HOST_USER}')
        try:
            send_mail(
                'Test — Gestion des Stagiaires (Mairie)',
                "Ceci est un e-mail de test : la configuration d'envoi fonctionne.",
                None,
                [destinataire],
                fail_silently=False,
            )
        except Exception as exc:
            raise CommandError(f'Échec de l\'envoi : {exc}')
        self.stdout.write(self.style.SUCCESS(f'E-mail de test envoyé à {destinataire}.'))
