from django.urls import path
from . import views

urlpatterns = [
    path('log-detection/', views.log_detection, name='log-detection'),
    path('heatmap/', views.get_heatmap_data, name='get-heatmap'),
    path('boats/', views.bots, name='boats'),
    path('boats/<int:pk>/', views.bot_detail, name='bot-detail'),
    path('users/', views.users, name='users'),
    path('users/<int:pk>/', views.user_detail, name='user-detail'),
    path('users/pending-count/', views.pending_user_count, name='pending-user-count'),
    path('operators/', views.operators, name='operators'),
    path('operators/<int:pk>/', views.operator_detail, name='operator-detail'),
    path('requests/', views.requests, name='requests'),
    path('requests/pending-count/', views.pending_request_count, name='pending-request-count'),
    path('requests/<int:pk>/', views.request_detail, name='request-detail'),
    path('deployment-schedules/', views.deployment_schedules, name='deployment-schedules'),
    path('deployment-schedules/<int:pk>/', views.deployment_schedule_detail, name='deployment-schedule-detail'),
    path('landfill-records/', views.landfill_records, name='landfill-records'),
    path('landfill-records/<int:pk>/', views.landfill_record_detail, name='landfill-record-detail'),
    path('recycling-records/', views.recycling_records, name='recycling-records'),
    path('recycling-records/<int:pk>/', views.recycling_record_detail, name='recycling-record-detail'),
    path('segregation-records/', views.segregation_records, name='segregation-records'),
    path('audit-logs/', views.audit_logs, name='audit-logs'),
    path('heatmap-data/', views.heatmap_data, name='heatmap-data'),
]
