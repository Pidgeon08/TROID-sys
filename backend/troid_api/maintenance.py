"""Pausing the system while CENRO backs up or restores the data.

While an admin backs up or restores, nobody else may change anything: every change to the
API (anything but GET, HEAD and OPTIONS) is refused with 503, signing in is refused, the
robots' MQTT messages are not saved, and the website shows everyone else a "paused" screen.
Only the backup and restore themselves, signing out, and the pause's own endpoints go on.

The admin's page keeps the pause alive with a heartbeat. If it stops (the tab is closed or
the connection drops) the pause lapses after STALE_AFTER, so the system can't stay paused.
"""
from datetime import timedelta

from django.http import JsonResponse
from django.utils import timezone

STALE_AFTER = timedelta(seconds=60)
SAFE_METHODS = ('GET', 'HEAD', 'OPTIONS')
# What keeps working while paused: the pause itself, the backup and restore, signing out and
# the health check.
OPEN_PATHS = ('/api/maintenance/', '/api/backup/', '/api/logout/', '/api/health/')
VERBS = {'backup': 'backs up', 'restore': 'restores'}


def _audit(pause, action, details):
    from .models import AuditLog
    AuditLog.objects.create(
        time=timezone.localtime().strftime('%b %d, %Y %I:%M %p'), ip='-',
        user=pause.user_email[:100], role='Admin', action=action, module='Backup & Restore',
        details=details[:500], status='warning',
    )


def active_pause():
    """The pause in force, or None. A pause whose page stopped answering is ended here
    (and noted in the audit log), so the system resumes on its own."""
    from .models import SystemPause
    pause = SystemPause.objects.filter(pk=1).first()
    if pause is None:
        return None
    if timezone.now() - pause.heartbeat_at > STALE_AFTER:
        if SystemPause.objects.filter(pk=1, heartbeat_at=pause.heartbeat_at).delete()[0]:
            _audit(pause, f'{pause.get_kind_display()} stopped',
                   f'{pause.user_name} stopped responding for a minute, so the system was resumed.')
            from .realtime import broadcast_after_commit
            broadcast_after_commit('system.pause', {'active': False})
        return None
    return pause


def describe(pause):
    """What the pages are told about the pause."""
    if pause is None:
        return {'active': False}
    return {
        'active': True,
        'kind': pause.kind,
        'user_id': pause.user_id,
        'started_by': pause.user_name,
        'started_at': pause.started_at,
    }


def paused_message(pause):
    return (f'The system is paused while {pause.user_name} {VERBS.get(pause.kind, "maintains")} the data. '
            'Try again once it is finished.')


class SystemPauseMiddleware:
    """Refuses changes while the system is paused (see the module docstring)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if (request.method not in SAFE_METHODS and request.path.startswith('/api/')
                and not request.path.startswith(OPEN_PATHS)):
            pause = active_pause()
            if pause is not None:
                return JsonResponse({'error': paused_message(pause), 'paused': describe(pause)}, status=503)
        return self.get_response(request)
