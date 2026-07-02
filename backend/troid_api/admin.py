from django.contrib import admin
from .models import Boat, DetectionEvent, User, Barangay

admin.site.register(Boat)
admin.site.register(DetectionEvent)
admin.site.register(User)
admin.site.register(Barangay)
