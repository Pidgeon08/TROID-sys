from django.apps import AppConfig


class TroidApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'troid_api'

    def ready(self):
        from .mqtt_client import start_mqtt_client, start_offline_checker
        start_mqtt_client()
        start_offline_checker()
