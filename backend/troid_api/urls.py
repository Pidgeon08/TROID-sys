from django.urls import path, include
from . import views

urlpatterns = [
    # Listed before the router so its "<prefix>/<pk>/" routes don't capture
    # these fixed paths (e.g. "users/pending-count/" as a user with pk "pending-count").
    path('users/pending-count/', views.pending_user_count, name='pending-user-count'),
    path('requests/pending-count/', views.pending_request_count, name='pending-request-count'),
    path('notifications/unread-count/', views.unread_notification_count, name='unread-notification-count'),
    path('companion/login/', views.companion_login, name='companion-login'),
    path('companion/me/', views.companion_me, name='companion-me'),
    path('companion/change-password/', views.companion_change_password, name='companion-change-password'),
    path('companion/logout/', views.companion_logout, name='companion-logout'),
    path('companion/task-status/', views.companion_task_status, name='companion-task-status'),
    path('companion/bot/', views.companion_bot, name='companion-bot'),
    path('', include(views.router.urls)),
    path('login/', views.login, name='login'),
    path('logout/', views.logout, name='logout'),
    path('forgot-password/', views.forgot_password, name='forgot-password'),
    path('log-detection/', views.log_detection, name='log-detection'),
    path('heatmap/', views.get_heatmap_data, name='get-heatmap'),
    path('task-status-updates/', views.task_status_updates, name='task-status-updates'),
]
