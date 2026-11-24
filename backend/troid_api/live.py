"""Tells open pages when data changed, so they show it without being reloaded.

Each kind of data (a "topic") has a version number in LiveVersion. Saving or deleting a
watched model bumps its topic's number once the change is committed; changes made in one
transaction bump each topic once. Pages ask GET /api/live/ every few seconds and refetch
what they show when a number they care about moved. The realtime relay is told as well, so
pages that can reach it hear straight away (see realtime.py).
"""

import threading
from contextlib import contextmanager

from django.db import transaction
from django.db.models import F
from django.db.models.signals import post_delete, post_save

# Model name -> topic.
TOPICS = {
    'Request': 'requests',
    'StatusHistory': 'requests',
    'LetterFile': 'requests',
    'Photo': 'requests',
    'DeploymentSchedule': 'schedules',
    'CollectionArea': 'areas',
    'Boat': 'fleet',
    'Operator': 'fleet',
    'User': 'users',
    'LandfillRecord': 'records',
    'RecyclingRecord': 'records',
    'SegregationRecord': 'records',
    'DetectionEvent': 'detections',
    'HeatmapData': 'detections',
    'AuditLog': 'audit',
}
ALL_TOPICS = sorted(set(TOPICS.values()))

_local = threading.local()


@contextmanager
def quiet():
    """Changes made inside don't bump anything, e.g. a robot's frequent status saves, which
    the realtime relay already reports."""
    _local.quiet = getattr(_local, 'quiet', 0) + 1
    try:
        yield
    finally:
        _local.quiet -= 1


def bump(*topics):
    """Moves these topics' numbers on now and tells the realtime relay."""
    from .models import LiveVersion
    from .realtime import _start

    topics = sorted(set(topics))
    for topic in topics:
        if not LiveVersion.objects.filter(topic=topic).update(version=F('version') + 1):
            LiveVersion.objects.get_or_create(topic=topic, defaults={'version': 1})
    if topics:
        _start('data.changed', {'topics': topics})


def _flush():
    topics = transaction.get_connection().__dict__.pop('_live_topics', set())
    if topics:
        bump(*topics)


def touch(*topics):
    """Bumps these topics once the current transaction is committed (straight away outside one)."""
    if getattr(_local, 'quiet', 0):
        return
    connection = transaction.get_connection()
    if not connection.in_atomic_block:
        bump(*topics)
        return
    pending = connection.__dict__.setdefault('_live_topics', set())
    # A rolled-back transaction drops its callbacks; start again if ours went with it.
    if not any(entry[1] is _flush for entry in connection.run_on_commit):
        pending.clear()
        transaction.on_commit(_flush)
    pending.update(topics)


def _changed(sender, raw=False, **kwargs):
    topic = TOPICS.get(sender.__name__)
    # raw: rows loaded as they are (fixtures, a restore), which bump once afterwards anyway.
    if topic and not raw:
        touch(topic)


def connect():
    from django.apps import apps

    for name in TOPICS:
        model = apps.get_model('troid_api', name)
        post_save.connect(_changed, sender=model, dispatch_uid=f'live-save-{name}')
        post_delete.connect(_changed, sender=model, dispatch_uid=f'live-delete-{name}')
