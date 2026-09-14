from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from troid_api.models import Boat

class Command(BaseCommand):
    help = 'Mark bots as offline if no heartbeat received recently'

    def handle(self, *args, **options):
        threshold = timezone.now() - timedelta(seconds=15)
        offline_bots = Boat.objects.filter(last_seen__lt=threshold, is_online=True)
        
        count = offline_bots.update(is_online=False)
        self.stdout.write(f"Marked {count} bots as offline")
