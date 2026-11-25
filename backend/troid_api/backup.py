"""Backup and restore of the TROID data, by feature.

A backup holds the features the admin chose (see FEATURES), as one JSON document:
    {"format": "troid-backup", "version": 2, "created_at": ..., "migration": ...,
     "features": [keys], "counts": {model: rows}, "records": [Django "python" serializer records]}

A feature always comes with the features it needs (requests point at robots, operators and
collection areas, and so on), so a backup can always be restored on its own.

The audit log is never backed up, and a restore never touches it: it keeps the record of
everything, backups and restores included. Sign-in sessions are never written either, so
restoring the accounts signs everyone out (the admin who restores stays signed in if their
account is in the backup).

Restoring a feature makes its tables match the backup: rows in the backup are put back as
they were, and rows that are not in it (added after the backup) are removed, along with
what depends on them. Features that are not restored are left as they are. Older version 1
backups (the whole database) restore the same way; their audit log is skipped.
"""
from collections import Counter

from django.apps import apps
from django.core import serializers
from django.core.exceptions import FieldDoesNotExist, ValidationError
from django.core.management.color import no_style
from django.core.serializers.base import DeserializationError
from django.db import IntegrityError, connection, transaction
from django.db.migrations.recorder import MigrationRecorder
from django.utils import timezone

from . import live

FORMAT = 'troid-backup'
VERSION = 2
READABLE_VERSIONS = (1, 2)
APP = 'troid_api'
SESSION_FIELDS = {'troid_api.user': ('session_token', 'companion_session_token')}
# Never backed up, and never replaced by a restore.
NOT_BACKED_UP = {
    'troid_api.auditlog', 'troid_api.liveversion', 'troid_api.systempause',
    # Disposal & recycling records aren't part of the system's backups.
    'troid_api.landfillrecord', 'troid_api.recyclingrecord', 'troid_api.segregationrecord',
}

FEATURES = [
    {'key': 'accounts', 'label': 'User accounts',
     'description': 'Sign-in accounts for every role, with their password hashes.',
     'models': ['troid_api.user'], 'needs': []},
    {'key': 'fleet', 'label': 'Robots & operators',
     'description': "The robots, their device keys, and the operators' profiles.",
     'models': ['troid_api.boat', 'troid_api.operator'], 'needs': ['accounts']},
    {'key': 'collection_areas', 'label': 'Collection areas',
     'description': 'Every collection area, its shape and its details.',
     'models': ['troid_api.collectionarea'], 'needs': []},
    {'key': 'requests', 'label': 'Cleanup requests',
     'description': 'Requests with their letters, photos, status history and trash reports.',
     'models': ['troid_api.request', 'troid_api.letterfile', 'troid_api.photo', 'troid_api.statushistory'],
     'needs': ['fleet', 'collection_areas']},
    {'key': 'schedules', 'label': 'Deployment schedules',
     'description': 'The robots\' cleanup bookings and maintenance days.',
     'models': ['troid_api.deploymentschedule'], 'needs': ['fleet']},
    {'key': 'detections', 'label': 'Robot detections',
     'description': 'What the robots detected during cleanups (the heatmap data).',
     'models': ['troid_api.detectionevent', 'troid_api.heatmapdata'], 'needs': ['fleet', 'requests']},
    {'key': 'notifications', 'label': 'Notifications',
     'description': 'The notifications sent to every account.',
     'models': ['troid_api.notification'], 'needs': ['accounts', 'requests', 'collection_areas']},
]
FEATURE_KEYS = [f['key'] for f in FEATURES]
# Parts older backups may list that are no longer backed up; a restore skips them.
RETIRED_FEATURES = {'waste_records'}
# How each table's records are called on the Backup & Restore page.
RECORD_NAMES = {
    'troid_api.user': 'accounts', 'troid_api.boat': 'robots', 'troid_api.operator': 'operators',
    'troid_api.collectionarea': 'collection areas', 'troid_api.request': 'requests', 'troid_api.letterfile': 'letters',
    'troid_api.photo': 'photos', 'troid_api.statushistory': 'status updates',
    'troid_api.deploymentschedule': 'schedule entries', 'troid_api.detectionevent': 'detections',
    'troid_api.heatmapdata': 'heatmap points', 'troid_api.notification': 'notifications',
}


def record_name(model):
    return RECORD_NAMES.get(model._meta.label_lower, str(model._meta.verbose_name_plural))
FEATURE_BY_KEY = {f['key']: f for f in FEATURES}


class BackupError(ValueError):
    """The backup can't be made or restored; the message is shown to the admin."""


def app_models():
    """Every model a backup can hold, in the app's order."""
    return [m for m in apps.get_app_config(APP).get_models() if m._meta.label_lower not in NOT_BACKED_UP]


def latest_migration():
    return max(MigrationRecorder.Migration.objects.filter(app=APP).values_list('name', flat=True), default=None)


def with_needs(keys):
    """The features with every feature they need, in FEATURES order."""
    chosen = set()
    pending = list(keys)
    while pending:
        key = pending.pop()
        if key not in FEATURE_BY_KEY:
            raise BackupError(f'"{key}" is not a part of the system that can be backed up.')
        if key not in chosen:
            chosen.add(key)
            pending += FEATURE_BY_KEY[key]['needs']
    return [key for key in FEATURE_KEYS if key in chosen]


def feature_labels(keys):
    return [FEATURE_BY_KEY[key]['label'] for key in keys]


def _models_of(keys):
    labels = {label for key in keys for label in FEATURE_BY_KEY[key]['models']}
    return [m for m in app_models() if m._meta.label_lower in labels]


def feature_overview():
    """Every feature with what it holds now, for the admin to choose from."""
    by_label = {m._meta.label_lower: m for m in app_models()}
    needed_by = {key: [f['key'] for f in FEATURES if key in f['needs']] for key in FEATURE_KEYS}
    overview = []
    for feature in FEATURES:
        parts = [
            {'model': label, 'name': record_name(by_label[label]),
             'count': by_label[label]._base_manager.count()}
            for label in feature['models']
        ]
        overview.append({
            'key': feature['key'], 'label': feature['label'], 'description': feature['description'],
            'needs': feature['needs'], 'needed_by': needed_by[feature['key']],
            'parts': parts, 'records': sum(p['count'] for p in parts),
        })
    return overview


def export_backup(keys):
    if not keys:
        raise BackupError('Choose at least one part of the system to back up.')
    keys = with_needs(keys)
    records = []
    for model in _models_of(keys):
        records += serializers.serialize('python', model._base_manager.order_by('pk'))
    for record in records:
        for field in SESSION_FIELDS.get(record['model'], ()):
            record['fields'][field] = None
    return {
        'format': FORMAT,
        'version': VERSION,
        'created_at': timezone.now().isoformat(),
        'migration': latest_migration(),
        'features': keys,
        'counts': dict(Counter(record['model'] for record in records)),
        'records': records,
    }


# --- restoring ---------------------------------------------------------------------

def read_backup(payload):
    """Checks a backup file. Returns its features and its records (the audit log of an old
    version 1 backup left out)."""
    if not isinstance(payload, dict) or payload.get('format') != FORMAT:
        raise BackupError('This is not a TROID backup file.')
    if payload.get('version') not in READABLE_VERSIONS:
        raise BackupError('This backup was made by a different version of TROID and cannot be restored.')
    current = latest_migration()
    if payload.get('migration') and current and payload['migration'] > current:
        raise BackupError('This backup is from a newer version of TROID. Update the system before restoring it.')
    records = payload.get('records')
    if not isinstance(records, list) or not all(isinstance(r, dict) for r in records):
        raise BackupError('The backup file is damaged.')
    records = [r for r in records if r.get('model') not in NOT_BACKED_UP]
    allowed = {model._meta.label_lower for model in app_models()}
    unknown = {str(r.get('model')) for r in records} - allowed
    if unknown:
        raise BackupError(f'The backup contains data this system does not use: {", ".join(sorted(unknown))}.')
    if payload.get('version') == 1:
        features = list(FEATURE_KEYS)  # a version 1 backup holds the whole database
    else:
        features = payload.get('features')
        if isinstance(features, list):
            features = [key for key in features if key not in RETIRED_FEATURES]
        if not isinstance(features, list) or not features:
            raise BackupError('The backup file is damaged: it does not say what it holds.')
        try:
            features = with_needs(features)
        except BackupError as exc:
            raise BackupError(f'The backup file is damaged: {exc}') from exc
    return features, records


def _plan(payload, keys):
    features, records = read_backup(payload)
    if not keys:
        raise BackupError('Choose at least one part of the system to restore.')
    keys = with_needs(keys)
    missing = [key for key in keys if key not in features]
    if missing:
        raise BackupError(f'This backup does not have {", ".join(feature_labels(missing))}, which the restore needs.')
    models = _models_of(keys)
    labels = {m._meta.label_lower for m in models}
    records = [r for r in records if r['model'] in labels]
    if 'accounts' in keys and not any(
        r['model'] == 'troid_api.user'
        and isinstance(r.get('fields'), dict)
        and r['fields'].get('role') == 'admin'
        and r['fields'].get('status') == 'active'
        for r in records
    ):
        raise BackupError('The backup has no active admin account, so restoring its accounts would lock everyone out.')
    for record in records:
        for field in SESSION_FIELDS.get(record['model'], ()):
            record.setdefault('fields', {})[field] = None
    return keys, models, records


def _pks():
    return {m._meta.label_lower: set(m._base_manager.values_list('pk', flat=True)) for m in app_models()}


def _apply(models, records):
    """Makes the models' tables match the records. Returns, for every model that changed,
    how many rows were added, updated and removed (removed rows of other models are the
    ones that depended on removed rows)."""
    before = _pks()
    keep = {}
    for record in records:
        keep.setdefault(record['model'], set()).add(record.get('pk'))
    try:
        for model in reversed(models):
            label = model._meta.label_lower
            gone = sorted(before[label] - keep.get(label, set()))
            for start in range(0, len(gone), 500):
                model._base_manager.filter(pk__in=gone[start:start + 500]).delete()
        retired = set(apps.get_model('troid_api', 'Request').RETIRED_STATUSES)
        for record in records:
            fields = record.get('fields') or {}
            if record.get('model') == 'troid_api.request' and fields.get('status') in retired:
                fields['status'] = 'completed'
        with connection.constraint_checks_disabled():
            for obj in serializers.deserialize('python', records):
                obj.save()
        connection.check_constraints(table_names=[m._meta.db_table for m in app_models()])
    except (DeserializationError, FieldDoesNotExist, ValidationError, IntegrityError,
            KeyError, TypeError, ValueError, LookupError) as exc:
        raise BackupError(f'The backup file is damaged: {exc}') from exc
    after = _pks()
    restored = {m._meta.label_lower for m in models}
    changes = {}
    for model in app_models():
        label = model._meta.label_lower
        if label in restored:
            in_backup = keep.get(label, set())
            entry = {
                'name': record_name(model),
                'restored': True,
                'in_backup': len(in_backup),
                'added': len(after[label] - before[label]),
                'updated': len(in_backup & before[label]),
                'removed': len(before[label] - after[label]),
            }
        else:
            removed = len(before[label] - after[label])
            if not removed:
                continue
            entry = {'name': record_name(model), 'restored': False, 'removed': removed}
        changes[label] = entry
    return changes


class _DryRun(Exception):
    pass


def preview_restore(payload, keys):
    """What restoring these features would change, without changing anything."""
    keys, models, records = _plan(payload, keys)
    result = {}
    try:
        with transaction.atomic():
            result = {'features': keys, 'records': len(records), 'changes': _apply(models, records)}
            raise _DryRun
    except _DryRun:
        pass
    return result


@transaction.atomic
def restore_backup(payload, keys):
    """Restores these features from the backup, all or nothing. Returns what changed."""
    keys, models, records = _plan(payload, keys)
    changes = _apply(models, records)
    # Rows are restored as they are, without the usual change signals: every open page refetches.
    live.touch(*live.ALL_TOPICS)
    # Restored rows keep their ids; new rows must be numbered after them (PostgreSQL).
    with connection.cursor() as cursor:
        for sql in connection.ops.sequence_reset_sql(no_style(), models):
            cursor.execute(sql)
    return {'features': keys, 'records': len(records), 'changes': changes}
