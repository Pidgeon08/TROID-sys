from django.core.management.base import BaseCommand
from django.utils import timezone
from troid_api.models import User
from django.contrib.auth.hashers import make_password

class Command(BaseCommand):
    help = 'Seed trial users for the application'

    def handle(self, *args, **options):
        trial_users = [
            {
                'user_id': '01260000',
                'username': 'mayor_trial',
                'password': 'trial123',
                'email': 'mayor@troid.com',
                'role': 'mayorsoffice',
                'full_name': 'Mayor Trial',
                'is_active': True,
            },
            {
                'user_id': '02260000',
                'username': 'spearhead_trial',
                'password': 'trial123',
                'email': 'spearhead@troid.com',
                'role': 'barangay',
                'full_name': 'Barangay Trial',
                'is_active': True,
            },
            {
                'user_id': '03260000',
                'username': 'admin_trial',
                'password': 'trial123',
                'email': 'admin@troid.com',
                'role': 'admin',
                'full_name': 'Admin Trial',
                'is_active': True,
            },
        ]

        for data in trial_users:
            if User.objects.filter(user_id=data['user_id']).exists():
                self.stdout.write(self.style.WARNING(f"User {data['user_id']} already exists, skipping."))
                continue

            User.objects.create(
                user_id=data['user_id'],
                username=data['username'],
                password_hash=make_password(data['password']),
                email=data['email'],
                role=data['role'],
                full_name=data['full_name'],
                is_active=data['is_active'],
                created_at=timezone.now(),
            )
            self.stdout.write(self.style.SUCCESS(f"Created trial user {data['user_id']} ({data['role']})"))

        self.stdout.write(self.style.SUCCESS('Trial users seeded successfully.'))
