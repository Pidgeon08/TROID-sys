import os
import sys

from django.apps import AppConfig
from django.conf import settings


def _is_web_server():
    """True under gunicorn, or the reloaded child of `manage.py runserver`.
    Commands like migrate/collectstatic (run on every Render build) must not
    connect: they would take over the live server's MQTT session."""
    if 'gunicorn' in os.path.basename(sys.argv[0]):
        return True
    if len(sys.argv) > 1 and sys.argv[1] == 'runserver':
        return os.environ.get('RUN_MAIN') == 'true' or '--noreload' in sys.argv
    return False


class TroidApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'troid_api'

    def ready(self):
        # Off on computers sharing the live database, and during tests (core/settings.py).
        if not settings.BACKGROUND_WORKERS or not _is_web_server():
            return
        from .mqtt_client import start_mqtt_client, start_offline_checker
        start_mqtt_client()
        start_offline_checker()
