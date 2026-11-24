"""The sample data made by `manage.py seed_sample_data`, and keeping its dates current.

The sample data is dated around the day it was made: cleanups over the past year, requests
waiting for days, cleanups booked for the coming weeks. As real days pass it would drift into
the past, so refresh_sample_dates() moves every sample record forward by the whole days since
it was made. Only sample records move (and everything about them: history, detections,
schedules, notifications); anything else in the database is left alone.

On a local SQLite database the backend does this by itself when it starts and then every hour
(see apps.py and SAMPLE_DATA_AUTO_REFRESH in core/settings.py). It never runs on Postgres.
"""
import logging
import threading
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from django.db import close_old_connections, models, transaction
from django.db.models import F, Q
from django.utils import timezone

from . import live
from .models import (
    Boat, CollectionArea, DeploymentSchedule, DetectionEvent, Notification, Request, StatusHistory, User,
)

logger = logging.getLogger(__name__)

MANILA = ZoneInfo('Asia/Manila')
MARKER = '[SAMPLE DATA]'
EMAIL_DOMAIN = 'sample.troid.local'
PASSWORD = 'Sample123!'
SUBMITTER = 'Sample Data'
BOAT_PREFIX = 'Sample TROID'
OPERATOR_PREFIX = 'SMP-'
# The sample CENRO account is made with the rest of the sample data, so the day it was
# created is the day the sample data is dated from. It moves forward with everything else.
ANCHOR_EMAIL = f'cenro@{EMAIL_DOMAIN}'
REFRESH_EVERY_SECONDS = 3600


def sample_age_days(today=None):
    """Whole days since the sample data was last dated, or None when there is none."""
    anchor = User.objects.filter(email__iexact=ANCHOR_EMAIL).values_list('date_created', flat=True).first()
    if anchor is None:
        return None
    today = today or timezone.now().astimezone(MANILA).date()
    return (today - anchor.astimezone(MANILA).date()).days


def _shift_datetimes(queryset, delta):
    fields = [f.name for f in queryset.model._meta.fields if isinstance(f, (models.DateTimeField, models.DateField))]
    if fields:
        queryset.update(**{name: F(name) + delta for name in fields})


def _shift_iso(value, delta):
    """A YYYY-MM-DD text date moved by delta; anything else is left as it is."""
    try:
        return (date.fromisoformat(value) + delta).isoformat()
    except (TypeError, ValueError):
        return value


def refresh_sample_dates(today=None):
    """Moves the sample data forward to today. Returns how many days it moved (0 if none)."""
    with transaction.atomic():
        days = sample_age_days(today)
        if not days or days < 1:
            return 0
        delta = timedelta(days=days)
        requests = list(Request.objects.filter(notes__startswith=MARKER).values_list('pk', 'request_id'))
        pks = [pk for pk, _ in requests]
        request_ids = [request_id for _, request_id in requests]
        boats = Boat.objects.filter(name__startswith=BOAT_PREFIX)
        users = User.objects.filter(email__iendswith=f'@{EMAIL_DOMAIN}')

        _shift_datetimes(Request.objects.filter(pk__in=pks), delta)
        _shift_datetimes(StatusHistory.objects.filter(request__in=pks), delta)
        _shift_datetimes(DetectionEvent.objects.filter(Q(request__in=pks) | Q(boat__in=boats)), delta)
        _shift_datetimes(Notification.objects.filter(Q(request__in=pks) | Q(recipient__in=users)), delta)
        _shift_datetimes(CollectionArea.objects.filter(submitted_by=SUBMITTER), delta)
        _shift_datetimes(boats, delta)
        _shift_datetimes(users, delta)

        for req in Request.objects.filter(pk__in=pks).only('pk', 'preferred_date'):
            moved = _shift_iso(req.preferred_date, delta)
            if moved != req.preferred_date:
                Request.objects.filter(pk=req.pk).update(preferred_date=moved)

        # Latest first, so a bot's entries never land on a day it still has booked. An entry
        # that would land on a day someone else booked for that bot is left where it is.
        schedules = DeploymentSchedule.objects.filter(Q(request_id__in=request_ids) | Q(bot__in=boats)).order_by('-day')
        for schedule in schedules:
            moved = _shift_iso(schedule.day, delta)
            if moved == schedule.day:
                continue
            if schedule.bot_id and DeploymentSchedule.objects.filter(bot_id=schedule.bot_id, day=moved).exists():
                continue
            DeploymentSchedule.objects.filter(pk=schedule.pk).update(day=moved)
        live.touch(*live.ALL_TOPICS)
        return days


def start_sample_refresher():
    """Keeps the sample data current while the local server runs: now, then every hour."""
    def run():
        while True:
            try:
                days = refresh_sample_dates()
                if days:
                    logger.info('Moved the sample data forward %s day(s) to today.', days)
                    print(f'[sample data] Moved the sample data forward {days} day(s) to today.')
            except Exception:  # never take the server down over sample data
                logger.exception('Could not move the sample data forward.')
            finally:
                close_old_connections()
            threading.Event().wait(REFRESH_EVERY_SECONDS)

    threading.Thread(target=run, name='sample-data-refresher', daemon=True).start()
