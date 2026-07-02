from django.urls import path
from . import views

urlpatterns = [
    # ── Boats / Detection ──────────────────────────────────────────────────────
    path('log-detection/', views.log_detection, name='log-detection'),
    path('heatmap/', views.get_heatmap_data, name='get-heatmap'),

    # ── Auth ───────────────────────────────────────────────────────────────────
    path('login/', views.login, name='login'),
    path('logout/', views.logout, name='logout'),

    # ── Users ──────────────────────────────────────────────────────────────────
    # NOTE: 'users/stats/' MUST come before 'users/<user_id>/' to avoid Django
    # treating the literal string "stats" as a user_id.
    path('users/', views.users_list, name='users-list'),
    path('users/stats/', views.user_stats, name='user-stats'),
    path('users/<str:user_id>/', views.user_detail, name='user-detail'),
    path('users/<str:user_id>/reset-password/', views.reset_user_password, name='reset-user-password'),

    # ── Barangays ──────────────────────────────────────────────────────────────
    path('barangays/', views.barangays_list, name='barangays-list'),
    path('barangays/<int:barangay_id>/', views.barangay_detail, name='barangay-detail'),

    # ── Boats & Operators ──────────────────────────────────────────────────────
    path('boats/', views.boats_list, name='boats-list'),
    path('operators/', views.operators_list, name='operators-list'),

    # ── Cleanup Requests ───────────────────────────────────────────────────────
    path('requests/', views.cleanup_requests_list, name='requests-list'),
    path('requests/<int:request_id>/', views.cleanup_request_detail, name='request-detail'),

    # ── Scheduling ─────────────────────────────────────────────────────────────
    path('schedule/', views.schedule_cleanup, name='schedule-cleanup'),
    path('schedule/list/', views.scheduled_cleanups_list, name='scheduled-cleanups-list'),
    path('schedule/available-slots/', views.available_slots, name='available-slots'),
]
