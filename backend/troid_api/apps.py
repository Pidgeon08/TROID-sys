from django.apps import AppConfig
from django.conf import settings


class TroidApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'troid_api'

    def ready(self):
        # Off on computers sharing the live database, and during tests (core/settings.py).
        if not settings.BACKGROUND_WORKERS:
            return
        from .mqtt_client import start_mqtt_client, start_offline_checker
        start_mqtt_client()
        start_offline_checker()
