"""Whole-database backup and restore of the TROID data (everything in the troid_api app).

A backup is one JSON document:
    {"format": "troid-backup", "version": 1, "created_at": ..., "migration": ...,
     "counts": {model: rows}, "records": [Django "python" serializer records]}

Sign-in sessions are never written to a backup, so restoring one signs everyone
out (the admin who restores it stays signed in if their account is in it).
"""
from collections import Counter

from django.apps import apps
from django.core import serializers
from django.core.management.color import no_style
from django.core.exceptions import FieldDoesNotExist, ValidationError
from django.core.serializers.base import DeserializationError
from django.db import IntegrityError, connection, transaction
from django.db.migrations.recorder import MigrationRecorder
from django.utils import timezone

FORMAT = 'troid-backup'
VERSION = 1
APP = 'troid_api'
SESSION_FIELDS = {'troid_api.user': ('session_token', 'companion_session_token')}


class BackupError(ValueError):
    """The file can't be restored; the message is shown to the admin."""


def app_models():
    return list(apps.get_app_config(APP).get_models())


def latest_migration():
    return max(MigrationRecorder.Migration.objects.filter(app=APP).values_list('name', flat=True), default=None)


def export_backup():
    records = []
    for model in app_models():
        records += serializers.serialize('python', model._base_manager.order_by('pk'))
    for record in records:
        for field in SESSION_FIELDS.get(record['model'], ()):
            record['fields'][field] = None
    return {
        'format': FORMAT,
        'version': VERSION,
        'created_at': timezone.now().isoformat(),
        'migration': latest_migration(),
        'counts': dict(Counter(record['model'] for record in records)),
        'records': records,
    }


def _validated_records(payload):
    if not isinstance(payload, dict) or payload.get('format') != FORMAT:
        raise BackupError('This is not a TROID backup file.')
    if payload.get('version') != VERSION:
        raise BackupError('This backup was made by a different version of TROID and cannot be restored.')
    current = latest_migration()
    if payload.get('migration') and current and payload['migration'] > current:
        raise BackupError('This backup is from a newer version of TROID. Update the system before restoring it.')
    records = payload.get('records')
    if not isinstance(records, list) or not all(isinstance(r, dict) for r in records):
        raise BackupError('The backup file is damaged.')
    allowed = {model._meta.label_lower for model in app_models()}
    unknown = {str(r.get('model')) for r in records} - allowed
    if unknown:
        raise BackupError(f'The backup contains data this system does not use: {", ".join(sorted(unknown))}.')
    if not any(
        r['model'] == 'troid_api.user'
        and isinstance(r.get('fields'), dict)
        and r['fields'].get('role') == 'admin'
        and r['fields'].get('status') == 'active'
        for r in records
    ):
        raise BackupError('The backup has no active admin account, so restoring it would lock everyone out.')
    for record in records:
        for field in SESSION_FIELDS.get(record['model'], ()):
            record.setdefault('fields', {})[field] = None
    return records


@transaction.atomic
def restore_backup(payload):
    """Replaces every TROID table with the backup's rows, all or nothing.
    Returns the number of records restored."""
    records = _validated_records(payload)
    models = app_models()
    try:
        for model in models:
            model._base_manager.all().delete()
        with connection.constraint_checks_disabled():
            for obj in serializers.deserialize('python', records):
                obj.save()
        connection.check_constraints(table_names=[model._meta.db_table for model in models])
    except (DeserializationError, FieldDoesNotExist, ValidationError, IntegrityError,
            KeyError, TypeError, ValueError, LookupError) as exc:
        raise BackupError(f'The backup file is damaged: {exc}') from exc
    # Restored rows keep their ids; new rows must be numbered after them (PostgreSQL).
    with connection.cursor() as cursor:
        for sql in connection.ops.sequence_reset_sql(no_style(), models):
            cursor.execute(sql)
    return len(records)
