from django.urls import path, include
from . import views

urlpatterns = [
    path('', include(views.router.urls)),
    path('login/', views.login, name='login'),
    path('forgot-password/', views.forgot_password, name='forgot-password'),
    path('log-detection/', views.log_detection, name='log-detection'),
    path('heatmap/', views.get_heatmap_data, name='get-heatmap'),
    path('users/pending-count/', views.pending_user_count, name='pending-user-count'),
    path('requests/pending-count/', views.pending_request_count, name='pending-request-count'),
    path('notifications/unread-count/', views.unread_notification_count, name='unread-notification-count'),
]
