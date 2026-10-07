from getpass import getpass

from django.core.management.base import BaseCommand, CommandError
from troid_api.models import User


class Command(BaseCommand):
    help = 'Create an admin account for logging into the TROID frontend'

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True)
        parser.add_argument('--name', default='Administrator')

    def handle(self, *args, **options):
        email = options['email'].strip()
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError(f'A user with email {email} already exists.')

        password = getpass('Password: ')
        if len(password) < 8:
            raise CommandError('Password must be at least 8 characters.')
        if getpass('Password (again): ') != password:
            raise CommandError('Passwords do not match.')

        # User.save() hashes the plain-text password and assigns user_id.
        user = User.objects.create(
            name=options['name'],
            email=email,
            password=password,
            role='admin',
            status='active',
        )
        self.stdout.write(self.style.SUCCESS(f'Created admin {user.email} (user_id {user.user_id})'))
