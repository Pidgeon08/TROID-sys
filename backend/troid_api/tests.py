import base64
import importlib.util
import json
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import requests
from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from . import backup, bot_auth, drives, live, mqtt_client, priority, views
from .drives import TRASH_ITEMS
from .models import (
    AuditLog, Boat, CollectionArea, DeploymentSchedule, DetectionEvent, LetterFile, Notification, Operator,
    Request, StatusHistory, SystemPause, User,
)


def make_user(role, status='active', token=None):
    return User.objects.create(
        name=f'{role.title()} User',
        email=f'{role}-{status}@example.com',
        password='Test-password1',
        role=role,
        status=status,
        session_token=token or f'{role}-{status}-session',
    )


def assign_operator(user, boat=None):
    """Sets the account up as an admin would in Operator Management, so it may use the app."""
    return Operator.objects.create(name=user.name, user=user, assigned_bot=boat or Boat.objects.create(name='Bot'))


def session_header(user):
    return {'HTTP_AUTHORIZATION': f'Session {user.id}:{user.session_token}'}


class SessionAuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('admin')

    @override_settings(API_AUTH_ENFORCED=True)
    def test_missing_header_is_rejected_with_401(self):
        response = self.client.get('/api/boats/')

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {'error': 'A valid session is required.'})
        self.assertEqual(response.headers['WWW-Authenticate'], 'Session')

    @override_settings(API_AUTH_ENFORCED=True)
    def test_bad_credentials_are_rejected_with_401(self):
        for header in (
            f'Session {self.admin.id}:wrong-token',
            'Session 999999:anything',
            'Session not-a-number:token',
            f'Session {self.admin.id}',
            f'Session {self.admin.id}:',
            f'Session {self.admin.id}:töken',
        ):
            with self.subTest(header=header):
                response = self.client.get('/api/boats/', HTTP_AUTHORIZATION=header)
                self.assertEqual(response.status_code, 401)

    @override_settings(API_AUTH_ENFORCED=True)
    def test_user_without_a_session_token_is_rejected(self):
        self.admin.session_token = None
        self.admin.save(update_fields=['session_token'])

        response = self.client.get('/api/boats/', HTTP_AUTHORIZATION=f'Session {self.admin.id}:None')

        self.assertEqual(response.status_code, 401)

    @override_settings(API_AUTH_ENFORCED=True)
    def test_inactive_accounts_are_rejected_with_401(self):
        for status in ('archived', 'pending'):
            with self.subTest(status=status):
                user = make_user('admin', status=status)
                response = self.client.get('/api/boats/', **session_header(user))
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.json(), {'error': 'This account is not active.'})

    @override_settings(API_AUTH_ENFORCED=True)
    def test_valid_session_is_accepted(self):
        response = self.client.get('/api/boats/', **session_header(self.admin))

        self.assertEqual(response.status_code, 200)

    @override_settings(API_AUTH_ENFORCED=True)
    def test_operators_authenticate_but_have_no_staff_access(self):
        operator = make_user('operator')

        response = self.client.get('/api/boats/', **session_header(operator))

        self.assertEqual(response.status_code, 403)

    @override_settings(API_AUTH_ENFORCED=False)
    def test_report_only_mode_logs_and_allows_unauthenticated_requests(self):
        with self.assertLogs('troid_api.permissions', 'WARNING') as logs:
            response = self.client.get('/api/boats/')

        self.assertEqual(response.status_code, 200)
        self.assertIn('[auth] would deny GET /api/boats/', logs.output[0])

    @override_settings(API_AUTH_ENFORCED=False)
    def test_report_only_mode_treats_a_stale_token_as_anonymous(self):
        with self.assertLogs('troid_api.authentication', 'WARNING') as logs:
            response = self.client.get('/api/boats/', HTTP_AUTHORIZATION=f'Session {self.admin.id}:stale')

        self.assertEqual(response.status_code, 200)
        self.assertIn('session has ended', logs.output[0])

    @override_settings(API_AUTH_ENFORCED=False)
    def test_report_only_mode_logs_but_keeps_inactive_accounts_signed_in(self):
        user = make_user('admin', status='archived')

        with self.assertLogs('troid_api.authentication', 'WARNING') as logs:
            response = self.client.get('/api/boats/', **session_header(user))

        self.assertEqual(response.status_code, 200)
        self.assertIn('account archived', logs.output[0])


@override_settings(API_AUTH_ENFORCED=True)
class LetterUploadTests(TestCase):
    PDF = base64.b64encode(b'%PDF-1.7 a letter').decode()

    def setUp(self):
        self.client = APIClient()
        self.user = make_user('barangay')

    def create(self, letter=None):
        data = {'request_type': 'Cleanup', 'request_id': 'REQ-TEST', 'cleanup_type': 'unsupported', 'location_name': 'Near the bridge'}
        if letter:
            data['letter'] = letter
        return self.client.post('/api/requests/', data, format='json', **session_header(self.user))

    def test_a_pdf_is_stored_and_can_be_read_back(self):
        response = self.create({'name': 'letter.PDF', 'data': f'data:application/pdf;base64,{self.PDF}'})

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['letter_file_name'], 'letter.pdf')
        self.assertEqual(body['letter_content_type'], 'application/pdf')
        self.assertEqual(body['letter_size'], '1 KB')
        self.assertNotIn('letter', body)

        letter = self.client.get('/api/requests/REQ-TEST/letter/', **session_header(self.user))
        self.assertEqual(letter.status_code, 200)
        self.assertEqual(letter.json(), {'file_name': 'letter.pdf', 'content_type': 'application/pdf', 'data': self.PDF})

    def test_word_files_are_accepted(self):
        for name, content, content_type in (
            ('letter.docx', b'PK\x03\x04word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
            ('letter.doc', b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1word', 'application/msword'),
        ):
            with self.subTest(name=name):
                Request.objects.all().delete()
                response = self.create({'name': name, 'data': base64.b64encode(content).decode()})

                self.assertEqual(response.status_code, 201)
                self.assertEqual(response.json()['letter_content_type'], content_type)

    def test_a_landmark_is_optional(self):
        area = CollectionArea.objects.create(name='Bridge', barangay='Poro', status='approved')
        data = {
            'request_id': 'REQ-TEST',
            'barangay': 'Poro',
            'location_name': '',
            'collection_area': area.id,
            'letter': {'name': 'real.pdf', 'data': self.PDF},
        }

        response = self.client.post('/api/requests/', data, format='json', **session_header(self.user))

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['collection_area_detail']['name'], 'Bridge')

    def test_a_letter_is_required(self):
        response = self.create()

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Request.objects.exists())

    def test_bad_files_are_rejected_and_nothing_is_saved(self):
        too_big = base64.b64encode(b'%PDF-' + b'x' * (5 * 1024 * 1024)).decode()
        for letter in (
            {'name': 'letter.txt', 'data': self.PDF},
            {'name': 'letter.exe', 'data': self.PDF},
            {'name': 'fake.pdf', 'data': base64.b64encode(b'not a pdf').decode()},
            {'name': 'fake.docx', 'data': self.PDF},
            {'name': 'letter.pdf', 'data': 'not base64!'},
            {'name': 'big.pdf', 'data': too_big},
            {'name': 'letter.pdf'},
        ):
            with self.subTest(name=letter['name']):
                self.assertEqual(self.create(letter).status_code, 400)
                self.assertFalse(Request.objects.exists())
                self.assertFalse(LetterFile.objects.exists())

    def test_clients_cannot_claim_a_letter_they_did_not_upload(self):
        data = {
            'request_id': 'REQ-TEST',
            'cleanup_type': 'unsupported',
            'location_name': 'Near the bridge',
            'letter_file_name': 'claimed.docx',
            'letter_size': '9 MB',
            'letter_content_type': 'application/msword',
            'letter': {'name': 'real.pdf', 'data': self.PDF},
        }

        response = self.client.post('/api/requests/', data, format='json', **session_header(self.user))

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['letter_file_name'], 'real.pdf')
        self.assertEqual(response.json()['letter_size'], '1 KB')
        self.assertEqual(response.json()['letter_content_type'], 'application/pdf')

    def test_listing_requests_does_not_include_the_file(self):
        self.create({'name': 'letter.pdf', 'data': self.PDF})

        listing = self.client.get('/api/requests/', **session_header(self.user))

        self.assertNotIn(self.PDF, listing.content.decode())


class RequestCleanupTypeTests(TestCase):
    """TROID-supported cleanups choose a collection area; unsupported ones only give a location."""

    def setUp(self):
        self.client = APIClient()
        self.user = make_user('barangay')
        self.admin = make_user('admin')
        self.area = CollectionArea.objects.create(name='Bridge', barangay='Poro', status='approved')

    def submit(self, **data):
        body = {'barangay': 'Poro', 'letter': {'name': 'real.pdf', 'data': LetterUploadTests.PDF}, **data}
        return self.client.post('/api/requests/', body, format='json', **session_header(self.user))

    def test_a_troid_supported_cleanup_needs_a_collection_area(self):
        for data in ({}, {'cleanup_type': 'troid_supported'}, {'cleanup_type': 'troid_supported', 'location_name': 'Bridge'}):
            with self.subTest(data=data):
                response = self.submit(**data)

                self.assertEqual(response.status_code, 400)
                self.assertIn('collection_area', response.json())
        self.assertFalse(Request.objects.exists())

        response = self.submit(cleanup_type='troid_supported', collection_area=self.area.id)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['cleanup_type'], 'troid_supported')
        self.assertEqual(response.json()['collection_area'], self.area.id)

    def test_an_unsupported_cleanup_asks_for_its_location_and_may_name_its_area(self):
        response = self.submit(cleanup_type='unsupported', location_name='   ')
        self.assertEqual(response.status_code, 400)
        self.assertIn('location_name', response.json())

        response = self.submit(cleanup_type='unsupported', location_name=' Beside the bridge ')
        self.assertEqual(response.status_code, 201)
        req = Request.objects.get()
        self.assertEqual((req.cleanup_type, req.location_name, req.collection_area), ('unsupported', 'Beside the bridge', None))

        # The area it is in, so its trash counts toward that area's priority.
        response = self.submit(cleanup_type='unsupported', location_name='Under the bridge', collection_area=self.area.id)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Request.objects.get(location_name='Under the bridge').collection_area, self.area)

    def test_status_changes_are_not_held_to_the_rule(self):
        req = Request.objects.create(status='pending_admin_approval', barangay='Poro')

        response = self.client.patch(
            f'/api/requests/{req.request_id}/', {'notes': 'Seen'}, format='json', **session_header(self.admin),
        )

        self.assertEqual(response.status_code, 200)

    def test_a_deployment_follows_the_requests_cleanup_type(self):
        boat = Boat.objects.create(name='Bot')
        unsupported = Request.objects.create(cleanup_type='unsupported', location_name='Bridge', status='approved')
        supported = Request.objects.create(collection_area=self.area, status='approved')
        for day, req, sent, saved in (
            ('2026-12-01', unsupported, 'troid_supported', 'unsupported'),
            ('2026-12-02', supported, 'unsupported', 'troid_supported'),
        ):
            with self.subTest(request=req.cleanup_type):
                response = self.client.post('/api/deployment-schedules/', {
                    'bot': boat.id, 'day': day, 'status': 'scheduled', 'label': '9:00 AM',
                    'request_id': req.request_id, 'cleanup_type': sent,
                }, format='json', **session_header(self.admin))

                self.assertEqual(response.status_code, 201)
                self.assertEqual(response.json()['cleanup_type'], saved)

    def schedule(self, req, day='2026-12-01', **data):
        return self.client.post('/api/deployment-schedules/', {
            'day': day, 'status': 'scheduled', 'label': '09:00', 'request_id': req.request_id, **data,
        }, format='json', **session_header(self.admin))

    def test_a_non_troid_cleanup_is_scheduled_without_a_bot(self):
        boat = Boat.objects.create(name='Bot')
        first = Request.objects.create(cleanup_type='unsupported', location_name='Bridge', status='approved')
        second = Request.objects.create(cleanup_type='unsupported', location_name='Plaza', status='approved')

        no_bot = self.schedule(first)
        bot_sent = self.schedule(second, bot=boat.id)

        self.assertEqual((no_bot.status_code, bot_sent.status_code), (201, 201))
        self.assertIsNone(no_bot.json()['bot'])
        self.assertIsNone(bot_sent.json()['bot'])
        # Neither takes up the bot's day.
        self.assertEqual(self.schedule(Request.objects.create(collection_area=self.area, status='approved'), bot=boat.id).status_code, 201)

    def test_a_troid_cleanup_needs_a_free_bot(self):
        boat = Boat.objects.create(name='Bot')
        req = Request.objects.create(collection_area=self.area, status='approved')
        other = Request.objects.create(collection_area=self.area, status='approved')

        response = self.schedule(req)
        self.assertEqual(response.status_code, 400)
        self.assertIn('bot', response.json())

        self.assertEqual(self.schedule(req, bot=boat.id).status_code, 201)
        self.assertEqual(self.schedule(other, bot=boat.id).status_code, 400)

    def test_rescheduling_a_troid_cleanup_onto_its_own_day_is_allowed(self):
        boat = Boat.objects.create(name='Bot')
        req = Request.objects.create(collection_area=self.area, status='approved')
        created = self.schedule(req, bot=boat.id).json()

        response = self.client.put(f"/api/deployment-schedules/{created['id']}/", {
            'bot': boat.id, 'day': '2026-12-01', 'status': 'scheduled', 'label': '10:00', 'request_id': req.request_id,
        }, format='json', **session_header(self.admin))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['label'], '10:00')

    def test_existing_requests_take_their_type_from_their_deployments(self):
        from django.apps import apps
        migration = importlib.import_module('troid_api.migrations.0043_request_cleanup_type')
        boat = Boat.objects.create(name='Bot')
        manual = Request.objects.create(status='completed')
        mixed = Request.objects.create(status='completed')
        unscheduled = Request.objects.create(status='completed')
        DeploymentSchedule.objects.create(bot=boat, day='2026-10-01', request_id=manual.request_id, cleanup_type='unsupported')
        DeploymentSchedule.objects.create(bot=boat, day='2026-10-02', request_id=mixed.request_id, cleanup_type='unsupported')
        DeploymentSchedule.objects.create(bot=boat, day='2026-10-03', request_id=mixed.request_id, cleanup_type='troid_supported')

        migration.copy_cleanup_type_from_schedules(apps, None)

        types = dict(Request.objects.values_list('request_id', 'cleanup_type'))
        self.assertEqual(types[manual.request_id], 'unsupported')
        self.assertEqual(types[mixed.request_id], 'troid_supported')
        self.assertEqual(types[unscheduled.request_id], 'troid_supported')


class CityAdminNotificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.city_admin = make_user('mayorsoffice')
        self.archived_city_admin = make_user('mayorsoffice', status='archived')
        self.barangay = make_user('barangay')
        self.admin = make_user('admin')

    def notified(self):
        return Notification.objects.filter(notif_type='awaiting_approval')

    def parked_request(self, returns_to):
        return Request.objects.create(status='parked', parked_from_status=returns_to, barangay='Poro')

    def test_a_new_request_notifies_active_city_admins_only(self):
        data = {
            'request_id': 'REQ-TEST', 'barangay': 'Poro', 'cleanup_type': 'unsupported', 'location_name': 'Near the bridge',
            'letter': {'name': 'real.pdf', 'data': LetterUploadTests.PDF},
        }

        response = self.client.post('/api/requests/', data, format='json', **session_header(self.barangay))

        self.assertEqual(response.status_code, 201)
        self.assertEqual([n.recipient for n in self.notified()], [self.city_admin])
        count = self.client.get('/api/notifications/unread-count/', **session_header(self.city_admin)).json()
        self.assertEqual(count, {'unread_count': 1})
        listed = self.client.get('/api/notifications/', **session_header(self.city_admin)).json()
        self.assertEqual(listed[0]['request_id'], 'REQ-TEST')
        self.assertIn('Poro', listed[0]['message'])

    def test_unparking_back_to_city_admin_notifies_them(self):
        req = self.parked_request('pending_mayor_approval')

        self.client.post(f'/api/requests/{req.request_id}/unpark/', **session_header(self.admin))

        self.assertEqual([n.recipient for n in self.notified()], [self.city_admin])

    def test_no_notification_when_nothing_waits_on_the_city_admin(self):
        by_cenro = self.parked_request('pending_admin_approval')
        by_city_admin = self.parked_request('pending_mayor_approval')

        self.client.post(f'/api/requests/{by_cenro.request_id}/unpark/', **session_header(self.admin))
        self.client.post(f'/api/requests/{by_city_admin.request_id}/unpark/', **session_header(self.city_admin))

        self.assertFalse(self.notified().exists())


class CenroNotificationTests(TestCase):
    """CENRO is told whenever a request starts waiting on its approval."""

    def setUp(self):
        self.client = APIClient()
        self.city_admin = make_user('mayorsoffice')
        self.admin = make_user('admin')
        self.archived_admin = make_user('admin', status='archived')

    def notified(self):
        return Notification.objects.filter(notif_type='awaiting_approval')

    def test_the_city_admins_approval_notifies_active_cenro_admins(self):
        req = Request.objects.create(status='pending_mayor_approval', barangay='Poro')

        response = self.client.post(f'/api/requests/{req.request_id}/mayor_approve/', **session_header(self.city_admin))

        self.assertEqual(response.status_code, 200)
        self.assertEqual([n.recipient for n in self.notified()], [self.admin])
        listed = self.client.get('/api/notifications/', **session_header(self.admin)).json()
        self.assertEqual(listed[0]['request_id'], req.request_id)
        self.assertIn('Poro', listed[0]['message'])

    def test_unparking_back_to_cenro_notifies_cenro_unless_cenro_did_it(self):
        by_city_admin = Request.objects.create(status='parked', parked_from_status='pending_admin_approval', barangay='Poro')
        by_cenro = Request.objects.create(status='parked', parked_from_status='pending_admin_approval', barangay='Poro')

        self.client.post(f'/api/requests/{by_city_admin.request_id}/unpark/', **session_header(self.city_admin))
        self.client.post(f'/api/requests/{by_cenro.request_id}/unpark/', **session_header(self.admin))

        self.assertEqual([(n.recipient, n.request) for n in self.notified()], [(self.admin, by_city_admin)])


def around(lat, lng, d=0.0005):
    """A small triangle (about 55 m across) centred on a point."""
    return [[lat + d, lng], [lat - d, lng - d], [lat - d, lng + d]]


# Points well inside barangays (about 400 m from their borders), and out on the water west of Poro.
IN_PORO = (16.61604, 120.28626)
IN_CATBANGEN = (16.60797, 120.31252)
SEA_500_M_OFF_PORO = [16.61828, 120.27289]
SEA_2_KM_OFF_PORO = [16.61828, 120.25789]
IN_BAUANG = [16.53, 120.33]


class CollectionAreaBoundaryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('admin')
        self.barangay = make_user('barangay')
        User.objects.filter(pk=self.barangay.pk).update(location='Poro')

    def add(self, user, **data):
        body = {'name': 'Area', 'closed': True, 'color': '#1b4de4', **data}
        return self.client.post('/api/collection-areas/', body, format='json', **session_header(user))

    def test_cenro_adds_an_area_that_is_approved_straight_away(self):
        response = self.add(self.admin, barangay='poro', points=around(*IN_PORO))

        self.assertEqual(response.status_code, 201, response.content)
        area = CollectionArea.objects.get()
        self.assertEqual((area.barangay, area.status, area.reviewed_by), ('Poro', 'approved', self.admin.name))
        self.assertIsNotNone(area.date_reviewed)

    def test_a_barangay_account_submits_for_its_own_barangay_and_waits_for_approval(self):
        response = self.add(self.barangay, barangay='Catbangen', status='approved', points=around(*IN_PORO))

        self.assertEqual(response.status_code, 201, response.content)
        area = CollectionArea.objects.get()
        self.assertEqual((area.barangay, area.status, area.reviewed_by), ('Poro', 'pending', ''))

    def test_an_area_in_another_barangay_is_refused(self):
        for user in (self.barangay, self.admin):
            with self.subTest(role=user.role):
                response = self.add(user, barangay='Poro', points=around(*IN_CATBANGEN))
                self.assertEqual(response.status_code, 400)
                self.assertIn('is in Catbangen, not Poro', response.json()['points'][0])
        self.assertFalse(CollectionArea.objects.exists())

    def test_water_near_the_barangay_is_allowed_but_not_far_out_or_another_town(self):
        near = self.add(self.admin, barangay='Poro', closed=False, points=[list(IN_PORO), SEA_500_M_OFF_PORO])
        far = self.add(self.admin, barangay='Poro', closed=False, points=[list(IN_PORO), SEA_2_KM_OFF_PORO])
        bauang = self.add(self.admin, barangay='Pagdalagan', closed=False, points=[IN_BAUANG, IN_BAUANG])

        self.assertEqual(near.status_code, 201, near.content)
        self.assertIn('Point 2 is more than 1,000 m out from Poro', far.json()['points'][0])
        self.assertIn('is in Bauang, outside San Fernando', bauang.json()['points'][0])

    def test_unknown_barangays_and_bad_shapes_are_refused(self):
        unknown = self.add(self.admin, barangay='Atlantis', points=around(*IN_PORO))
        too_few = self.add(self.admin, barangay='Poro', points=around(*IN_PORO)[:2])
        not_points = self.add(self.admin, barangay='Poro', points=[['a', 'b'], [1], True])

        self.assertIn('not a barangay of San Fernando', unknown.json()['barangay'][0])
        self.assertIn('at least 3 points', too_few.json()['points'][0])
        self.assertIn('[latitude, longitude]', not_points.json()['points'][0])

    def test_an_existing_area_can_be_renamed_even_if_drawn_before_the_boundaries(self):
        old = CollectionArea.objects.create(name='Old', barangay='Poro', points=around(*IN_CATBANGEN), status='pending')

        renamed = self.client.patch(f'/api/collection-areas/{old.area_id}/', {'name': 'Renamed', 'status': 'approved'},
                                    format='json', **session_header(self.barangay))
        moved = self.client.patch(f'/api/collection-areas/{old.area_id}/', {'points': around(*IN_CATBANGEN)},
                                  format='json', **session_header(self.barangay))

        self.assertEqual(renamed.status_code, 200)
        old.refresh_from_db()
        # The barangay account can't approve its own area.
        self.assertEqual((old.name, old.status), ('Renamed', 'pending'))
        self.assertEqual(moved.status_code, 400)

    def test_the_website_and_the_api_use_the_same_boundaries(self):
        website_copy = Path(__file__).resolve().parents[2] / 'frontend' / 'src' / 'data' / 'sanFernandoBoundaries.json'
        if not website_copy.exists():
            self.skipTest('frontend not checked out')
        self.assertEqual(website_copy.read_bytes(), (Path(__file__).resolve().parent / 'data' / 'san_fernando_boundaries.json').read_bytes())


class CollectionAreaNotificationTests(TestCase):
    """Submitting, approving and archiving an area notify the other side, linked to the area."""

    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('admin')
        self.barangay = make_user('barangay')
        self.ngo = make_user('ngo')
        self.elsewhere = User.objects.create(name='Catbangen', email='catbangen@example.com', password='x',
                                             role='barangay', status='active', location='Catbangen',
                                             session_token='catbangen-session')
        User.objects.filter(pk__in=[self.barangay.pk, self.ngo.pk]).update(location='Poro')

    def submit(self):
        response = self.client.post('/api/collection-areas/', {
            'name': 'Poro Shore', 'closed': True, 'color': '#1b4de4', 'points': around(*IN_PORO),
        }, format='json', **session_header(self.barangay))
        self.assertEqual(response.status_code, 201, response.content)
        return CollectionArea.objects.get(area_id=response.json()['area_id'])

    def test_cenro_is_told_when_a_barangay_submits_an_area(self):
        area = self.submit()

        notice = Notification.objects.get()
        self.assertEqual((notice.recipient, notice.collection_area, notice.notif_type), (self.admin, area, 'area_submitted'))
        listed = self.client.get('/api/notifications/', **session_header(self.admin)).json()
        self.assertEqual((listed[0]['area_id'], listed[0]['request_id']), (area.area_id, None))

    def test_the_barangays_accounts_are_told_when_cenro_decides(self):
        for decision, data, notif_type in (('approve', {}, 'area_approved'), ('decline', {'reason': 'Overlaps Poro Shore'}, 'area_archived')):
            with self.subTest(decision=decision):
                Notification.objects.all().delete()
                area = self.submit()
                Notification.objects.all().delete()

                response = self.client.post(f'/api/collection-areas/{area.area_id}/{decision}/', data, format='json',
                                            **session_header(self.admin))

                self.assertEqual(response.status_code, 200)
                told = Notification.objects.filter(collection_area=area, notif_type=notif_type)
                self.assertEqual(set(told.values_list('recipient', flat=True)), {self.barangay.pk, self.ngo.pk})
                if decision == 'decline':
                    self.assertIn('Overlaps Poro Shore', told.first().message)

    def test_deleting_an_area_clears_its_notifications(self):
        area = self.submit()

        response = self.client.delete(f'/api/collection-areas/{area.area_id}/', **session_header(self.barangay))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Notification.objects.filter(is_read=False).exists())

    def test_cenros_own_areas_notify_no_one(self):
        response = self.client.post('/api/collection-areas/', {
            'name': 'Poro Shore', 'barangay': 'Poro', 'closed': True, 'points': around(*IN_PORO),
        }, format='json', **session_header(self.admin))

        self.assertEqual(response.status_code, 201)
        self.assertFalse(Notification.objects.exists())


class CollectionAreaEditTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('admin')
        self.barangay = make_user('barangay')
        User.objects.filter(pk=self.barangay.pk).update(location='Poro')
        self.area = CollectionArea.objects.create(
            name='Shore', barangay='Poro', points=around(*IN_PORO), status='approved',
        )

    def patch(self, user, area=None, **data):
        area = area or self.area
        return self.client.patch(f'/api/collection-areas/{area.area_id}/', data, format='json', **session_header(user))

    def test_cenro_edits_the_details_and_who_edited_is_kept(self):
        response = self.patch(
            self.admin, name='  Poro Shore  ', description='Rocky stretch by the pier',
            water_body_type='coast', water_body_name='West Philippine Sea', hazards='Strong waves in the afternoon',
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.area.refresh_from_db()
        self.assertEqual(
            (self.area.name, self.area.water_body_type, self.area.hazards),
            ('Poro Shore', 'coast', 'Strong waves in the afternoon'),
        )
        self.assertEqual(self.area.updated_by, self.admin.name)
        self.assertIsNotNone(self.area.date_updated)
        self.assertEqual(response.json()['request_count'], 0)

    def test_bad_details_are_refused(self):
        for field, value in (('name', '   '), ('water_body_type', 'ocean'), ('color', 'blue')):
            with self.subTest(field=field):
                response = self.patch(self.admin, **{field: value})
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json())

    def test_cenro_redraws_an_area_and_moves_it_to_another_barangay(self):
        moved = self.patch(self.admin, barangay='Catbangen', points=around(*IN_CATBANGEN), closed=True)
        wrong_place = self.patch(self.admin, barangay='Poro')

        self.assertEqual(moved.status_code, 200, moved.content)
        self.area.refresh_from_db()
        self.assertEqual((self.area.barangay, self.area.points), ('Catbangen', around(*IN_CATBANGEN)))
        # The shape is still in Catbangen, so it can't be called Poro without being redrawn.
        self.assertEqual(wrong_place.status_code, 400)

    def test_a_barangay_account_cannot_move_its_area_to_another_barangay(self):
        response = self.patch(self.barangay, barangay='Catbangen', name='Mine')

        self.assertEqual(response.status_code, 200, response.content)
        self.area.refresh_from_db()
        self.assertEqual((self.area.barangay, self.area.name), ('Poro', 'Mine'))

    @override_settings(API_AUTH_ENFORCED=True)
    def test_a_barangay_account_changes_only_its_own_areas(self):
        theirs = CollectionArea.objects.create(name='Theirs', barangay='Catbangen', points=around(*IN_CATBANGEN))

        edit = self.patch(self.barangay, area=theirs, name='Taken')
        archive = self.client.delete(f'/api/collection-areas/{theirs.area_id}/', **session_header(self.barangay))
        own = self.patch(self.barangay, hazards='Slippery rocks')

        self.assertEqual((edit.status_code, archive.status_code, own.status_code), (403, 403, 200))
        theirs.refresh_from_db()
        self.assertEqual((theirs.name, theirs.archived), ('Theirs', False))

    def test_the_number_of_cleanups_sent_to_an_area_is_listed(self):
        Request.objects.create(collection_area=self.area, status='approved')
        Request.objects.create(collection_area=self.area, status='completed')
        Request.objects.create(collection_area=self.area, status='completed', archived=True)

        areas = self.client.get('/api/collection-areas/', **session_header(self.admin)).json()

        self.assertEqual([a['request_count'] for a in areas], [2])

    def test_the_requests_sent_to_an_area_can_be_listed(self):
        other = CollectionArea.objects.create(name='Other', barangay='Catbangen', points=around(*IN_CATBANGEN))
        here = Request.objects.create(collection_area=self.area, status='approved')
        Request.objects.create(collection_area=self.area, status='completed', archived=True)
        Request.objects.create(collection_area=other, status='approved')
        Request.objects.create(cleanup_type='unsupported', location_name='Market', status='approved')

        response = self.client.get('/api/requests/', {'collection_area': self.area.area_id}, **session_header(self.admin))

        self.assertEqual([r['request_id'] for r in response.json()], [here.request_id])


class RealtimeNotificationTests(TestCase):
    """Open pages refetch notifications as soon as they change, instead of waiting for the next poll."""

    def setUp(self):
        self.client = APIClient()
        self.city_admin = make_user('mayorsoffice')
        self.barangay = make_user('barangay')
        self.sent = []
        patcher = patch('troid_api.realtime._start', side_effect=lambda event, payload: self.sent.append((event, payload)))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_a_new_request_tells_the_city_admins_pages(self):
        data = {
            'request_id': 'REQ-LIVE', 'barangay': 'Poro', 'cleanup_type': 'unsupported', 'location_name': 'Near the bridge',
            'letter': {'name': 'real.pdf', 'data': LetterUploadTests.PDF},
        }
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post('/api/requests/', data, format='json', **session_header(self.barangay))

        self.assertEqual(response.status_code, 201, response.content)
        self.assertIn(('notifications.changed', {'recipients': [self.city_admin.pk]}), self.sent)

    def test_only_user_ids_are_broadcast_never_the_notification(self):
        req = Request.objects.create(email=self.barangay.email, request_id='REQ-SECRET')
        with self.captureOnCommitCallbacks(execute=True):
            views.notify_request_update(req, 'approved', 'Approved', 'Your private message')

        self.assertEqual(self.sent, [('notifications.changed', {'recipients': [self.barangay.pk]})])
        self.assertNotIn('private', str(self.sent))

    def test_reading_notifications_updates_the_users_other_pages(self):
        first = Notification.objects.create(recipient=self.barangay, title='One', message='m')
        Notification.objects.create(recipient=self.barangay, title='Two', message='m')

        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'/api/notifications/{first.pk}/mark_read/', **session_header(self.barangay))
            self.client.post('/api/notifications/mark-all-read/', {}, format='json', **session_header(self.barangay))
            # Nothing left unread, so nothing changes and nothing is sent.
            self.client.post('/api/notifications/mark-all-read/', {}, format='json', **session_header(self.barangay))

        self.assertEqual(self.sent, [('notifications.changed', {'recipients': [self.barangay.pk]})] * 2)

    def test_nothing_is_sent_until_the_change_is_saved(self):
        req = Request.objects.create(email=self.barangay.email)
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            views.notify_request_update(req, 'approved', 'Approved', 'Message')

        self.assertEqual((len(callbacks), self.sent), (1, []))


class BackupRestoreTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('admin')
        self.boat = Boat.objects.create(name='Robot', device_key='a' * 64)
        self.area = CollectionArea.objects.create(name='Poro Shore', barangay='Poro', status='approved', points=[[0, 0]] * 3)
        self.req = Request.objects.create(request_id='REQ-0001', barangay='Poro', bags=12, collection_area=self.area)
        LetterFile.objects.create(request=self.req, data='bGV0dGVy')
        AuditLog.objects.create(time='earlier', user='someone', role='Admin', action='Something before', details='',
                                module='Test', ip='-')

    def pause(self, kind, user=None):
        return self.client.post('/api/maintenance/start/', {'kind': kind}, format='json', **session_header(user or self.admin))

    def download(self, features=None):
        self.assertEqual(self.pause('backup').status_code, 200)
        response = self.client.post('/api/backup/', {'features': features or backup.FEATURE_KEYS}, format='json',
                                    **session_header(self.admin))
        self.assertEqual(response.status_code, 200)
        return response.json()

    def restore(self, payload, features=None, user=None, preview=False):
        self.pause('restore', user)
        if features is None:
            features = payload.get('features') or backup.FEATURE_KEYS if isinstance(payload, dict) else []
        path = '/api/backup/restore/preview/' if preview else '/api/backup/restore/'
        return self.client.post(path, {'backup': payload, 'features': features}, format='json',
                                **session_header(user or self.admin))

    def actions(self):
        return list(AuditLog.objects.order_by('pk').values_list('action', flat=True))

    def test_every_table_belongs_to_one_feature_but_the_audit_log(self):
        labels = [label for f in backup.FEATURES for label in f['models']]
        self.assertEqual(len(labels), len(set(labels)))
        self.assertEqual(set(labels), {m._meta.label_lower for m in backup.app_models()})
        self.assertNotIn('troid_api.auditlog', labels)
        for feature in backup.FEATURES:
            self.assertTrue(set(feature['needs']) <= set(backup.FEATURE_KEYS))

    def test_disposal_records_are_never_backed_up_or_restored(self):
        self.assertNotIn('waste_records', backup.FEATURE_KEYS)
        for label in ('troid_api.landfillrecord', 'troid_api.recyclingrecord', 'troid_api.segregationrecord'):
            self.assertIn(label, backup.NOT_BACKED_UP)
        # A backup made while they were a part still restores: the part is skipped.
        features, _ = backup.read_backup({
            'format': backup.FORMAT, 'version': 2, 'features': ['collection_areas', 'waste_records'], 'records': [
                {'model': 'troid_api.landfillrecord', 'pk': 1, 'fields': {}},
            ],
        })
        self.assertEqual(features, ['collection_areas'])

    def test_a_backup_has_the_chosen_features_and_what_they_need(self):
        Notification.objects.create(recipient=self.admin, notif_type='approved', title='Hi')

        data = self.download(['requests'])

        self.assertEqual(data['format'], 'troid-backup')
        self.assertEqual(data['features'], ['accounts', 'fleet', 'collection_areas', 'requests'])
        self.assertEqual(data['counts']['troid_api.request'], 1)
        self.assertEqual(data['counts']['troid_api.letterfile'], 1)
        models = {r['model'] for r in data['records']}
        self.assertNotIn('troid_api.notification', models)
        self.assertNotIn('troid_api.auditlog', models)
        users = [r for r in data['records'] if r['model'] == 'troid_api.user']
        self.assertTrue(all(r['fields']['session_token'] is None for r in users))
        self.assertTrue(any(r['fields']['device_key'] == 'a' * 64 for r in data['records'] if r['model'] == 'troid_api.boat'))

    def test_the_backup_is_noted_in_the_audit_log_and_the_system_resumes(self):
        self.download(['collection_areas'])

        self.assertEqual(self.actions()[-3:], ['Backup started', 'Backup created', 'Backup finished'])
        created = AuditLog.objects.get(action='Backup created')
        self.assertIn('Collection areas', created.details)
        self.assertIn('Not included: audit log', created.details)
        self.assertFalse(SystemPause.objects.exists())
        self.assertEqual(self.client.get('/api/maintenance/').json(), {'active': False})

    def test_backing_up_and_restoring_need_the_system_paused(self):
        self.assertEqual(self.client.post('/api/backup/', {'features': ['accounts']}, format='json',
                                          **session_header(self.admin)).status_code, 409)
        self.assertEqual(self.client.post('/api/backup/restore/', {'backup': {}, 'features': ['accounts']}, format='json',
                                          **session_header(self.admin)).status_code, 409)
        # A backup pause doesn't allow a restore.
        self.pause('backup')
        self.assertEqual(self.client.post('/api/backup/restore/', {'backup': {}, 'features': ['accounts']}, format='json',
                                          **session_header(self.admin)).status_code, 409)

    def test_while_paused_nobody_can_change_anything(self):
        other = make_user('barangay')
        self.pause('backup')

        status_now = self.client.get('/api/maintenance/').json()
        self.assertEqual((status_now['active'], status_now['kind'], status_now['started_by']), (True, 'backup', self.admin.name))
        refused = self.client.post('/api/requests/', {}, format='json', **session_header(other))
        self.assertEqual(refused.status_code, 503)
        self.assertIn('paused', refused.json()['error'])
        self.assertEqual(self.client.patch(f'/api/users/{other.pk}/', {'name': 'x'}, format='json',
                                           **session_header(self.admin)).status_code, 503)
        self.assertEqual(self.client.post('/api/login/', {'email': other.email, 'password': 'Test-password1'},
                                          format='json').status_code, 503)
        self.assertEqual(self.client.get('/api/requests/', **session_header(other)).status_code, 200)

        self.client.post('/api/maintenance/end/', {}, format='json', **session_header(self.admin))

        self.assertEqual(self.actions()[-2:], ['Backup started', 'Backup cancelled'])
        self.assertEqual(self.client.post('/api/login/', {'email': other.email, 'password': 'Test-password1'},
                                          format='json').status_code, 200)

    def test_a_pause_lapses_when_the_admins_page_stops(self):
        self.pause('restore')
        SystemPause.objects.update(heartbeat_at=timezone.now() - timedelta(minutes=2))

        self.assertEqual(self.client.get('/api/maintenance/').json(), {'active': False})
        self.assertEqual(self.actions()[-1], 'Restore stopped')
        self.assertFalse(SystemPause.objects.exists())

    def test_the_heartbeat_keeps_the_pause(self):
        self.pause('backup')
        SystemPause.objects.update(heartbeat_at=timezone.now() - timedelta(seconds=50))

        self.client.post('/api/maintenance/heartbeat/', {}, format='json', **session_header(self.admin))
        SystemPause.objects.update(started_at=timezone.now())

        self.assertTrue(self.client.get('/api/maintenance/').json()['active'])

    def test_only_one_admin_at_a_time(self):
        other = User.objects.create(name='Second Admin', email='second@example.com', password='Test-password1',
                                    role='admin', status='active', session_token='second-admin')
        self.pause('backup')

        self.assertEqual(self.pause('restore', other).status_code, 409)
        self.assertEqual(SystemPause.objects.get().user_id, self.admin.pk)

    def test_restore_brings_the_data_back(self):
        data = self.download()
        self.req.delete()
        Boat.objects.create(name='Added after the backup')
        make_user('barangay')

        response = self.restore(data)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['still_signed_in'])
        self.assertEqual(list(Request.objects.values_list('request_id', 'bags')), [('REQ-0001', 12)])
        self.assertEqual(LetterFile.objects.get().data, 'bGV0dGVy')
        self.assertEqual(list(Boat.objects.values_list('name', flat=True)), ['Robot'])
        self.assertFalse(User.objects.filter(role='barangay').exists())
        self.assertEqual(Request.objects.get().date_submitted, self.req.date_submitted)
        # New rows still get fresh ids, and the restore is in the audit log.
        self.assertNotEqual(Boat.objects.create(name='New').pk, self.boat.pk)
        self.assertEqual(self.actions()[-3:], ['Restore started', 'Restore completed', 'Restore finished'])
        self.assertFalse(SystemPause.objects.exists())
        self.assertEqual(self.client.get('/api/requests/', **session_header(self.admin)).status_code, 200)

    def test_retired_statuses_restore_as_completed(self):
        data = self.download()
        for record in data['records']:
            if record['model'] == 'troid_api.request':
                record['fields']['status'] = 'verified'

        response = self.restore(data)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Request.objects.get().status, 'completed')

    def test_restoring_one_feature_leaves_the_others_alone(self):
        data = self.download(['collection_areas', 'schedules'])
        CollectionArea.objects.create(name='Added later', barangay='Poro', points=[[0, 0]] * 3)
        CollectionArea.objects.filter(pk=self.area.pk).update(name='Renamed later')
        new_boat = Boat.objects.create(name='Added later too')
        self.req.bags = 99
        self.req.save()

        response = self.restore(data, ['collection_areas'])

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['features'], ['collection_areas'])
        self.assertEqual(list(CollectionArea.objects.values_list('name', flat=True)), ['Poro Shore'])
        self.assertTrue(Boat.objects.filter(pk=new_boat.pk).exists())
        self.req.refresh_from_db()
        self.assertEqual((self.req.bags, self.req.collection_area_id), (99, self.area.pk))

    def test_a_restore_needs_what_its_features_need(self):
        data = self.download(['collection_areas'])

        response = self.restore(data, ['requests'])

        self.assertEqual(response.status_code, 400)
        self.assertIn('does not have', response.json()['error'])

    def test_the_audit_log_is_never_restored_or_changed(self):
        data = self.download()
        before = list(AuditLog.objects.order_by('pk').values_list('pk', 'action'))

        self.restore(data)

        after = list(AuditLog.objects.order_by('pk').values_list('pk', 'action'))
        self.assertEqual(after[:len(before)], before)
        self.assertEqual([a for _, a in after[len(before):]], ['Restore started', 'Restore completed', 'Restore finished'])
        self.assertIn('audit log was not changed', AuditLog.objects.get(action='Restore completed').details)

    def test_preview_shows_the_changes_and_changes_nothing(self):
        data = self.download()
        Boat.objects.create(name='Added later')
        Request.objects.filter(pk=self.req.pk).update(bags=1)

        response = self.restore(data, ['fleet'], preview=True)

        self.assertEqual(response.status_code, 200)
        boats = response.json()['changes']['troid_api.boat']
        self.assertEqual((boats['in_backup'], boats['updated'], boats['removed'], boats['added']), (1, 1, 1, 0))
        self.assertEqual(response.json()['features'], ['accounts', 'fleet'])
        self.assertEqual(Boat.objects.count(), 2)
        self.assertEqual(Request.objects.get().bags, 1)
        self.assertTrue(SystemPause.objects.exists())

    @override_settings(API_AUTH_ENFORCED=True)
    def test_restoring_accounts_signs_out_everyone_else(self):
        other = make_user('barangay')
        data = self.download()

        self.restore(data, ['accounts'])

        self.assertEqual(self.client.get('/api/requests/', **session_header(other)).status_code, 401)
        self.assertEqual(self.client.get('/api/requests/', **session_header(self.admin)).status_code, 200)

    @override_settings(API_AUTH_ENFORCED=True)
    def test_restoring_other_features_keeps_everyone_signed_in(self):
        other = make_user('barangay')
        data = self.download(['collection_areas'])

        self.restore(data, ['collection_areas'])

        self.assertEqual(self.client.get('/api/requests/', **session_header(other)).status_code, 200)

    def test_a_backup_bigger_than_the_default_upload_limit_restores(self):
        LetterFile.objects.filter(request=self.req).update(data='A' * 8_000_000)
        data = self.download(['requests'])
        LetterFile.objects.all().delete()

        response = self.restore(data)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(LetterFile.objects.get().data), 8_000_000)

    def test_version_1_backups_still_restore_without_their_audit_log(self):
        data = self.download()
        old = {key: value for key, value in data.items() if key != 'features'}
        old['version'] = 1
        old['records'] = data['records'] + [{'model': 'troid_api.auditlog', 'pk': 999, 'fields': {
            'time': 'old', 'user': 'old', 'role': 'Admin', 'action': 'From the old file', 'details': '',
            'module': 'Old', 'ip': '-', 'status': 'success'}}]
        self.req.delete()

        response = self.restore(old, ['requests'])

        self.assertEqual(response.status_code, 200)
        self.assertTrue(Request.objects.filter(request_id='REQ-0001').exists())
        self.assertFalse(AuditLog.objects.filter(action='From the old file').exists())

    def test_bad_files_change_nothing(self):
        data = self.download()
        no_admin = {**data, 'records': [r for r in data['records'] if r['model'] != 'troid_api.user']}
        foreign = {**data, 'records': data['records'] + [{'model': 'auth.user', 'pk': 1, 'fields': {}}]}
        newer = {**data, 'migration': '9999_future'}
        damaged = {**data, 'records': data['records'] + [{'model': 'troid_api.boat', 'pk': 99, 'fields': {'nope': 1}}]}
        unlabelled = {key: value for key, value in data.items() if key != 'features'}
        Boat.objects.create(name='Still here')

        for name, payload in [('not a backup', {'hello': 1}), ('no admin', no_admin), ('foreign', foreign),
                              ('newer', newer), ('damaged', damaged), ('unlabelled', unlabelled)]:
            with self.subTest(name):
                response = self.restore(payload, backup.FEATURE_KEYS)
                self.assertEqual(response.status_code, 400)
                self.assertIn('error', response.json())
        self.assertTrue(Boat.objects.filter(name='Still here').exists())

    def test_the_features_list_counts_what_each_holds(self):
        response = self.client.get('/api/backup/features/', **session_header(self.admin))

        self.assertEqual(response.status_code, 200)
        features = {f['key']: f for f in response.json()['features']}
        self.assertEqual(features['requests']['needs'], ['fleet', 'collection_areas'])
        self.assertIn('detections', features['requests']['needed_by'])
        parts = {p['model']: p['count'] for p in features['requests']['parts']}
        self.assertEqual((parts['troid_api.request'], parts['troid_api.letterfile']), (1, 1))
        self.assertIn('Audit log', response.json()['not_included'])
        self.assertEqual(set(backup.RECORD_NAMES), {m._meta.label_lower for m in backup.app_models()})

    @override_settings(API_AUTH_ENFORCED=False)
    def test_admins_only_even_while_report_only(self):
        self.assertEqual(self.client.post('/api/maintenance/start/', {'kind': 'backup'}, format='json').status_code, 401)
        self.assertEqual(self.client.get('/api/backup/features/').status_code, 401)
        for role in ('mayorsoffice', 'barangay', 'ngo', 'operator'):
            with self.subTest(role=role):
                user = make_user(role)
                self.assertEqual(self.pause('backup', user).status_code, 403)
                self.assertEqual(self.client.get('/api/backup/features/', **session_header(user)).status_code, 403)
                self.assertEqual(self.client.post('/api/backup/', {'features': ['accounts']}, format='json',
                                                  **session_header(user)).status_code, 403)
        self.assertFalse(SystemPause.objects.exists())


class HealthCheckTests(TestCase):
    @override_settings(API_AUTH_ENFORCED=True)
    def test_answers_without_a_session_or_the_database(self):
        with self.assertNumQueries(0):
            response = APIClient().get('/api/health/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})


@override_settings(API_AUTH_ENFORCED=True)
class TrashReportTests(TestCase):
    """Barangay and CENRO can't finish a cleanup without the collected-garbage figures."""

    REPORT = {
        'site_type': 'river',
        'people_count': 6,
        'hours_spent': 2.5,
        'bags': 4,
        'weight_kg': 12.5,
        'non_usable_kg': 5.5,
        'recyclable_kg': 7,
        'trash_items': {'Beverage bottles (plastic)': 3, 'Beverage cans': 1},
        'notes': ' Near the bridge ',
    }

    def setUp(self):
        self.client = APIClient()
        self.barangay = make_user('barangay')
        self.req = Request.objects.create(email='requester@example.com', status='approved')

    def submit(self, data, user=None, req=None):
        req = req or self.req
        return self.client.post(
            f'/api/requests/{req.request_id}/submit_trash_report/', data, format='json',
            **session_header(user or self.barangay),
        )

    def test_barangay_and_cenro_can_finish_a_cleanup_with_the_report(self):
        for role in ('barangay', 'admin'):
            with self.subTest(role=role):
                user = self.barangay if role == 'barangay' else make_user('admin')
                req = Request.objects.create(email=f'{role}@example.com', status='approved')

                response = self.submit(self.REPORT, user=user, req=req)

                self.assertEqual(response.status_code, 200)
                req.refresh_from_db()
                self.assertEqual(req.status, 'completed')
                self.assertIsNotNone(req.session_completed_at)
                self.assertEqual((req.bags, req.weight_kg, req.non_usable_kg, req.recyclable_kg), (4, 12.5, 5.5, 7))
                self.assertEqual((req.site_type, req.people_count, req.hours_spent, req.distance_km), ('river', 6, 2.5, None))
                # Every item is kept, those left out as 0, and each TROID class counts its items.
                self.assertEqual(req.trash_items, {
                    item: {'Beverage bottles (plastic)': 3, 'Beverage cans': 1}.get(item, 0) for item in TRASH_ITEMS
                })
                self.assertEqual(req.trash_categories, {
                    'Plastic': 3, 'Metal': 1, 'Glass': 0, 'Paper/Cardboard': 0, 'Organic/Biodegradable': 0, 'Other': 0,
                })
                self.assertEqual(
                    list(req.status_history.order_by('id').values_list('label', 'details')),
                    [('Session Completed by CENRO', ''), ('Trash Report Filed by CENRO', 'Near the bridge')],
                )

    def test_each_figure_is_mandatory(self):
        for field in ('site_type', 'people_count', 'hours_spent', 'bags', 'weight_kg', 'non_usable_kg',
                      'recyclable_kg', 'trash_items'):
            with self.subTest(field=field):
                data = {k: v for k, v in self.REPORT.items() if k != field}

                response = self.submit(data)

                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json())
                self.req.refresh_from_db()
                self.assertEqual(self.req.status, 'approved')
                self.assertIsNone(self.req.session_completed_at)

    def test_invalid_figures_are_rejected(self):
        for field, value in (
            ('bags', -1), ('weight_kg', -0.1), ('weight_kg', ''), ('recyclable_kg', None),
            ('trash_items', {'Plastic': 3}), ('trash_items', {'Balloons': 'many'}),
            ('site_type', 'underwater'), ('people_count', 0), ('hours_spent', -1), ('distance_km', -2),
            ('entangled_animals', [{'animal': 'Turtle', 'condition': 'sleeping'}]),
            ('entangled_animals', [{'condition': 'alive'}]),
        ):
            with self.subTest(field=field, value=value):
                response = self.submit({**self.REPORT, field: value})

                self.assertEqual(response.status_code, 400)

    def test_zero_is_a_valid_answer(self):
        response = self.submit({
            'site_type': 'shoreline', 'people_count': 1, 'hours_spent': 0,
            'bags': 0, 'weight_kg': 0, 'non_usable_kg': 0, 'recyclable_kg': 0,
            'trash_items': {},
        })

        self.assertEqual(response.status_code, 200)

    def test_the_optional_parts_of_the_data_card_are_kept(self):
        animals = [
            {'animal': 'Sea turtle', 'condition': 'alive', 'entangled_in': 'Fishing line'},
            {'animal': 'Gull', 'condition': 'dead', 'entangled_in': ''},
        ]

        response = self.submit({**self.REPORT, 'distance_km': 1.2, 'entangled_animals': animals,
                                'peculiar_item': 'A bowling ball'})

        self.assertEqual(response.status_code, 200)
        self.req.refresh_from_db()
        self.assertEqual((self.req.distance_km, self.req.peculiar_item), (1.2, 'A bowling ball'))
        self.assertEqual(self.req.entangled_animals, animals)
        shared = self.client.get(f'/api/requests/{self.req.request_id}/', **session_header(self.barangay)).json()
        self.assertEqual(shared['entangled_animals'], animals)
        self.assertEqual(shared['people_count'], 6)

    def test_sessions_finished_before_this_rule_can_still_file_their_report(self):
        finished_at = timezone.now()
        req = Request.objects.create(email='older@example.com', status='processing', session_completed_at=finished_at)

        response = self.submit(self.REPORT, req=req)

        self.assertEqual(response.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, 'completed')
        self.assertEqual(req.session_completed_at, finished_at)
        self.assertEqual(list(req.status_history.values_list('label', flat=True)), ['Trash Report Filed by CENRO'])

    def test_a_cleanup_cannot_be_reported_twice(self):
        self.assertEqual(self.submit(self.REPORT).status_code, 200)

        self.assertEqual(self.submit(self.REPORT).status_code, 400)


class HeatmapCoverageDataTests(TestCase):
    """The Heatmap page measures coverage from where the robot actually detected trash."""

    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('admin')
        self.boat = Boat.objects.create(name='Bot')
        self.area = CollectionArea.objects.create(
            name='Area', barangay='Poro', closed=True, status='approved',
            points=[[16.616, 120.286], [16.617, 120.286], [16.617, 120.287]],
        )
        self.req = Request.objects.create(
            email='requester@example.com', status='completed', barangay='Poro',
            collection_area=self.area, bot_id=self.boat, trash_categories={'Plastic': 2},
        )

    def detect(self, lat, lng, at, request=None):
        event = DetectionEvent.objects.create(
            boat=self.boat, request=request, latitude=lat, longitude=lng, trash_count=1,
            categories={'plastic_bottle': 1}, is_verified=True,
        )
        DetectionEvent.objects.filter(pk=event.pk).update(timestamp=at)
        return event

    def heatmap(self, **params):
        return self.client.get('/api/heatmap/', params, **session_header(self.admin)).json()

    def test_comparison_lists_each_drives_detections_in_order(self):
        now = timezone.now()
        self.detect(16.6166, 120.2866, now, request=self.req)
        self.detect(16.6165, 120.2865, now - timedelta(minutes=5), request=self.req)
        self.detect(16.0, 120.0, now)  # another drive's point

        response = self.client.get('/api/requests/post-cleanup-comparison/', **session_header(self.admin))

        self.assertEqual(response.status_code, 200)
        [drive] = response.json()
        self.assertEqual(drive['bot'], self.boat.label)
        self.assertEqual(
            [(d['latitude'], d['longitude']) for d in drive['detections']],
            [(16.6165, 120.2865), (16.6166, 120.2866)],
        )
        self.assertEqual(drive['collection_area']['points'], self.area.points)

    def test_a_barangay_account_compares_only_its_own_barangays_drives(self):
        Request.objects.create(email='other@example.com', status='completed', barangay='Catbangen',
                               trash_categories={'Plastic': 1})
        poro = make_user('barangay')
        User.objects.filter(pk=poro.pk).update(location='Poro')
        nowhere = User.objects.create(name='No Barangay', email='none@example.com', role='ngo', session_token='none-session')

        mine = self.client.get('/api/requests/post-cleanup-comparison/', **session_header(poro)).json()
        none = self.client.get('/api/requests/post-cleanup-comparison/', **session_header(nowhere)).json()

        self.assertEqual([d['request_id'] for d in mine], [self.req.request_id])
        self.assertEqual(none, [])
        self.assertEqual(len(self.comparison()), 2)  # CENRO still sees every barangay

    def comparison(self):
        response = self.client.get('/api/requests/post-cleanup-comparison/', **session_header(self.admin))
        self.assertEqual(response.status_code, 200)
        return {d['request_id']: d for d in response.json()}

    def test_only_troid_supported_drives_carry_their_collection_area(self):
        unsupported = Request.objects.create(
            email='other@example.com', status='completed', barangay='Poro', cleanup_type='unsupported',
            location_name='Near the bridge', collection_area=self.area, trash_categories={'Plastic': 1},
        )

        drives = self.comparison()

        self.assertEqual(drives[self.req.request_id]['cleanup_type'], 'troid_supported')
        self.assertEqual(drives[self.req.request_id]['collection_area']['id'], self.area.id)
        self.assertEqual(drives[unsupported.request_id]['cleanup_type'], 'unsupported')
        self.assertIsNone(drives[unsupported.request_id]['collection_area'])

    def test_a_drive_the_robot_reported_from_counts_as_troid_supported(self):
        self.detect(16.6166, 120.2866, timezone.now(), request=self.req)

        drive = self.comparison()[self.req.request_id]

        self.assertEqual(drive['cleanup_type'], 'troid_supported')
        self.assertEqual(drive['collection_area']['id'], self.area.id)

    def test_collection_areas_can_be_limited_to_troid_supported_cleanups(self):
        def area(name):
            return CollectionArea.objects.create(name=name, barangay='Poro', closed=True, status='approved', points=self.area.points)

        unsupported_area, unused_area = area('Unsupported'), area('Unused')
        Request.objects.create(
            email='u@example.com', status='completed', cleanup_type='unsupported', location_name='Bridge',
            collection_area=unsupported_area,
        )

        response = self.client.get(
            '/api/collection-areas/', {'status': 'approved', 'troid_supported': 'true'}, **session_header(self.admin),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual([a['name'] for a in response.json()], ['Area'])
        all_areas = self.client.get('/api/collection-areas/', {'status': 'approved'}, **session_header(self.admin)).json()
        self.assertEqual(sorted(a['name'] for a in all_areas), ['Area', unsupported_area.name, unused_area.name])

    def test_barangay_and_ngo_accounts_only_see_their_own_barangays_points(self):
        elsewhere = Request.objects.create(email='other@example.com', status='completed', barangay='Catbangen')
        self.detect(16.6166, 120.2866, timezone.now(), request=self.req)
        self.detect(16.6080, 120.3125, timezone.now(), request=elsewhere)
        self.detect(16.0, 120.0, timezone.now())
        for role in ('barangay', 'ngo'):
            with self.subTest(role=role):
                user = make_user(role)
                User.objects.filter(pk=user.pk).update(location='poro')
                points = self.client.get(
                    '/api/heatmap/', {'barangay': 'Catbangen'}, **session_header(user),
                ).json()
                self.assertEqual([p['request'] for p in points], [self.req.request_id])

    def test_an_account_with_no_barangay_sees_no_points(self):
        self.detect(16.6166, 120.2866, timezone.now(), request=self.req)
        user = make_user('ngo')

        self.assertEqual(self.client.get('/api/heatmap/', **session_header(user)).json(), [])

    def test_heatmap_points_name_their_request(self):
        self.detect(16.6166, 120.2866, timezone.now(), request=self.req)
        self.detect(16.0, 120.0, timezone.now())

        self.assertEqual(sorted(p['request'] or '' for p in self.heatmap()), ['', self.req.request_id])

    def test_an_areas_heatmap_has_only_its_cleanups_detections(self):
        other_area = CollectionArea.objects.create(name='Other', barangay='Poro', status='approved', points=[[16.5, 120.2]] * 3)
        other_req = Request.objects.create(email='other@example.com', barangay='Poro', collection_area=other_area)
        self.detect(16.6166, 120.2866, timezone.now(), request=self.req)
        self.detect(16.5, 120.2, timezone.now(), request=other_req)
        self.detect(16.0, 120.0, timezone.now())

        points = self.heatmap(time_filter='all', collection_area=self.area.area_id)
        self.assertEqual([p['request'] for p in points], [self.req.request_id])

    def test_custom_range_filters_by_the_start_and_end_given(self):
        now = timezone.now()
        self.detect(16.1, 120.1, now - timedelta(days=10))
        self.detect(16.2, 120.2, now - timedelta(days=3))
        self.detect(16.3, 120.3, now)

        points = self.heatmap(
            time_filter='custom',
            start=(now - timedelta(days=5)).isoformat(),
            end=(now - timedelta(days=1)).isoformat(),
        )
        self.assertEqual([p['latitude'] for p in points], [16.2])

        open_ended = self.heatmap(time_filter='custom', start=(now - timedelta(days=5)).isoformat())
        self.assertEqual([p['latitude'] for p in open_ended], [16.2, 16.3])


ROLES = ('admin', 'mayorsoffice', 'barangay', 'ngo', 'operator')
STAFF_ROLES = ('admin', 'mayorsoffice', 'barangay', 'ngo')
REQUESTER_ROLES = ('admin', 'barangay', 'ngo')


@override_settings(API_AUTH_ENFORCED=True)
class EndpointRoleTests(TestCase):
    """Every role either gets in (any status but 401/403, e.g. 400 for a
    request in the wrong state) or is refused with 403."""

    def setUp(self):
        self.client = APIClient()
        self.users = {role: make_user(role) for role in ROLES}
        self.request_obj = Request.objects.create(email='requester@example.com')
        # Barangay and NGO accounts may only change their own barangay's areas.
        User.objects.filter(role__in=('barangay', 'ngo')).update(location='Poro')
        self.area = CollectionArea.objects.create(name='Test Area', barangay='Poro')

    def assert_roles(self, method, path, allowed, data=None):
        for role, user in self.users.items():
            with self.subTest(method=method, path=path, role=role):
                response = getattr(self.client, method)(path, data, format='json', **session_header(user))
                if role in allowed:
                    self.assertNotIn(response.status_code, (401, 403))
                else:
                    self.assertEqual(response.status_code, 403)
        with self.subTest(method=method, path=path, role='anonymous'):
            response = getattr(self.client, method)(path, data, format='json')
            self.assertEqual(response.status_code, 401)

    def test_boats_and_deployment_schedules(self):
        self.assert_roles('get', '/api/boats/', STAFF_ROLES)
        self.assert_roles('post', '/api/boats/', ('admin',), {})
        self.assert_roles('get', '/api/deployment-schedules/', STAFF_ROLES)
        self.assert_roles('post', '/api/deployment-schedules/', ('admin',), {})

    def test_users_and_operators_are_admin_only(self):
        target = self.users['barangay']
        self.assert_roles('get', '/api/users/', ('admin',))
        self.assert_roles('get', f'/api/users/{target.id}/', ('admin',))
        self.assert_roles('post', '/api/users/', ('admin',), {})
        self.assert_roles('put', f'/api/users/{target.id}/', ('admin',), {})
        self.assert_roles('post', f'/api/users/{target.id}/reset-password/', ('admin',))
        self.assert_roles('get', '/api/operators/', ('admin',))
        self.assert_roles('post', '/api/operators/', ('admin',), {})

    def test_requests(self):
        rid = self.request_obj.request_id
        self.assert_roles('get', '/api/requests/', STAFF_ROLES)
        self.assert_roles('get', f'/api/requests/{rid}/', STAFF_ROLES)
        self.assert_roles('post', '/api/requests/', REQUESTER_ROLES, {'request_type': 'Cleanup'})
        self.assert_roles('patch', f'/api/requests/{rid}/', ('admin',), {})
        self.assert_roles('post', f'/api/requests/{rid}/mayor_approve/', ('mayorsoffice',))
        self.assert_roles('post', f'/api/requests/{rid}/admin_approve/', ('admin',))
        self.assert_roles('post', f'/api/requests/{rid}/park/', ('admin',), {})
        self.assert_roles('post', f'/api/requests/{rid}/unpark/', ('admin', 'mayorsoffice'))
        self.assert_roles('post', f'/api/requests/{rid}/reschedule/', ('admin',), {})
        self.assert_roles('post', f'/api/requests/{rid}/submit_trash_report/', REQUESTER_ROLES, {})
        self.assert_roles('get', f'/api/requests/{rid}/letter/', STAFF_ROLES)
        self.assert_roles('get', f'/api/requests/{rid}/troid_count/', REQUESTER_ROLES)
        self.assert_roles('get', '/api/requests/post-cleanup-comparison/', REQUESTER_ROLES)
        self.assert_roles('post', f'/api/requests/{rid}/redirect-area/', ('admin',), {})
        self.assert_roles('post', f'/api/requests/{rid}/merge/', ('admin',), {})
        self.assert_roles('post', f'/api/requests/{rid}/unmerge/', ('admin',), {})
        self.assert_roles('post', f'/api/requests/{rid}/restore/', ('admin',))
        self.assert_roles('delete', f'/api/requests/{rid}/', ('admin',))

    def test_collection_areas(self):
        aid = self.area.area_id
        self.assert_roles('get', '/api/collection-areas/', STAFF_ROLES)
        self.assert_roles('post', '/api/collection-areas/', REQUESTER_ROLES, {})
        self.assert_roles('patch', f'/api/collection-areas/{aid}/', REQUESTER_ROLES, {})
        self.assert_roles('put', f'/api/collection-areas/{aid}/', ('admin',), {})
        self.assert_roles('post', f'/api/collection-areas/{aid}/approve/', ('admin',))
        self.assert_roles('post', f'/api/collection-areas/{aid}/decline/', ('admin',))
        self.assert_roles('delete', f'/api/collection-areas/{aid}/', REQUESTER_ROLES)

    def test_records_reports_and_logs(self):
        self.assert_roles('get', '/api/priority-areas/', REQUESTER_ROLES)
        for path in ('/api/landfill-records/', '/api/recycling-records/',
                     '/api/segregation-records/', '/api/heatmap-data/', '/api/audit-logs/'):
            self.assert_roles('get', path, ('admin',))
        self.assert_roles('post', '/api/segregation-records/', REQUESTER_ROLES, {})
        self.assert_roles('post', '/api/heatmap-data/', ('admin',), {})
        self.assert_roles('post', '/api/audit-logs/', STAFF_ROLES, {})
        self.assert_roles('get', '/api/heatmap/', STAFF_ROLES)
        self.assert_roles('post', '/api/log-detection/', ('admin',), {})

    def test_notifications_are_available_to_every_signed_in_role(self):
        self.assert_roles('get', '/api/notifications/', ROLES)
        self.assert_roles('get', '/api/notifications/unread-count/', ROLES)
        self.assert_roles('post', '/api/notifications/mark-all-read/', ROLES, {})
        self.assert_roles('post', '/api/notifications/', ('admin',), {})


@override_settings(API_AUTH_ENFORCED=True)
class PublicEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user('barangay')

    def test_login_and_forgot_password_need_no_session_and_ignore_a_stale_one(self):
        stale = {'HTTP_AUTHORIZATION': f'Session {self.user.id}:stale-token'}
        for headers in ({}, stale):
            with self.subTest(headers=headers):
                login = self.client.post(
                    '/api/login/', {'email': self.user.email, 'password': 'Test-password1'},
                    format='json', **headers,
                )
                self.assertEqual(login.status_code, 200)
                forgot = self.client.post(
                    '/api/forgot-password/', {'email': 'nobody@example.com'}, format='json', **headers,
                )
                self.assertEqual(forgot.status_code, 200)

    def test_session_check_answers_without_a_session(self):
        response = self.client.get(f'/api/users/{self.user.id}/session-check/?token=wrong')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'valid': False})


@override_settings(API_AUTH_ENFORCED=True)
class OwnDataTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('admin')
        self.barangay = make_user('barangay')
        self.other = make_user('ngo')

    def test_non_admins_edit_only_their_own_name_and_email(self):
        response = self.client.patch(
            f'/api/users/{self.other.id}/', {'name': 'Hijacked'}, format='json', **session_header(self.barangay),
        )
        self.assertEqual(response.status_code, 403)

        response = self.client.patch(
            f'/api/users/{self.barangay.id}/',
            {'name': 'New Name', 'role': 'admin', 'status': 'active'},
            format='json', **session_header(self.barangay),
        )
        self.assertEqual(response.status_code, 200)
        self.barangay.refresh_from_db()
        self.assertEqual(self.barangay.name, 'New Name')
        self.assertEqual(self.barangay.role, 'barangay')

    def test_admins_can_edit_other_accounts(self):
        response = self.client.patch(
            f'/api/users/{self.other.id}/', {'status': 'archived'}, format='json', **session_header(self.admin),
        )

        self.assertEqual(response.status_code, 200)
        self.other.refresh_from_db()
        self.assertEqual(self.other.status, 'archived')

    def test_password_changes_are_own_account_only_and_always_hashed(self):
        payload = {'old_password': 'Test-password1', 'password': 'pbkdf2_Sha256$1$Ab!'}
        response = self.client.post(
            f'/api/users/{self.other.id}/change-password/', payload, format='json', **session_header(self.barangay),
        )
        self.assertEqual(response.status_code, 403)

        response = self.client.post(
            f'/api/users/{self.barangay.id}/change-password/', payload, format='json', **session_header(self.barangay),
        )
        self.assertEqual(response.status_code, 200)
        self.barangay.refresh_from_db()
        self.assertNotEqual(self.barangay.password, payload['password'])
        self.assertTrue(check_password(payload['password'], self.barangay.password))

    def test_notifications_are_scoped_to_the_signed_in_user(self):
        mine = Notification.objects.create(recipient=self.barangay, notif_type='approved', title='Mine')
        theirs = Notification.objects.create(recipient=self.other, notif_type='approved', title='Theirs')
        headers = session_header(self.barangay)

        listed = self.client.get(f'/api/notifications/?user_id={self.other.id}', **headers).json()
        self.assertEqual([n['id'] for n in listed], [mine.id])

        count = self.client.get(f'/api/notifications/unread-count/?user_id={self.other.id}', **headers).json()
        self.assertEqual(count, {'unread_count': 1})

        response = self.client.post(f'/api/notifications/{theirs.id}/mark_read/', **headers)
        self.assertEqual(response.status_code, 404)

        self.client.post('/api/notifications/mark-all-read/', {'user_id': self.other.id}, format='json', **headers)
        mine.refresh_from_db()
        theirs.refresh_from_db()
        self.assertTrue(mine.is_read)
        self.assertFalse(theirs.is_read)

    def test_audit_logs_record_the_caller_and_cannot_be_changed(self):
        response = self.client.post('/api/audit-logs/', {
            'user': 'Someone Else', 'role': 'Admin', 'action': 'Test', 'details': 'Test entry', 'module': 'Test',
        }, format='json', **session_header(self.barangay))
        self.assertEqual(response.status_code, 201)
        log = AuditLog.objects.get(pk=response.json()['id'])
        self.assertEqual((log.user, log.role), (self.barangay.name, 'Barangay'))

        for method in ('put', 'patch', 'delete'):
            with self.subTest(method=method):
                response = getattr(self.client, method)(
                    f'/api/audit-logs/{log.id}/', {}, format='json', **session_header(self.admin),
                )
                self.assertEqual(response.status_code, 405)


class AccountLifecycleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user('barangay')

    def login(self, email=None, password='Test-password1'):
        return self.client.post(
            '/api/login/', {'email': email or self.user.email, 'password': password}, format='json',
        )

    def test_failed_logins_are_audited_by_the_server(self):
        response = self.login(password='wrong')

        self.assertEqual(response.status_code, 401)
        log = AuditLog.objects.get()
        self.assertEqual((log.user, log.action, log.status), (self.user.email, 'Login failed', 'failed'))

    @override_settings(API_AUTH_ENFORCED=True)
    def test_inactive_accounts_cannot_log_in_once_enforced(self):
        for status in ('archived', 'pending'):
            with self.subTest(status=status):
                self.user.status = status
                self.user.save(update_fields=['status'])
                response = self.login()
                self.assertEqual(response.status_code, 403)
                self.assertNotIn('session_token', response.json())

    @override_settings(API_AUTH_ENFORCED=False)
    def test_inactive_accounts_are_only_logged_while_report_only(self):
        self.user.status = 'archived'
        self.user.save(update_fields=['status'])

        with self.assertLogs('troid_api.views', 'WARNING'):
            response = self.login()

        self.assertEqual(response.status_code, 200)

    @override_settings(API_AUTH_ENFORCED=True)
    def test_operators_can_log_in(self):
        operator = make_user('operator')

        self.assertEqual(self.login(email=operator.email).status_code, 200)

    @override_settings(API_AUTH_ENFORCED=True)
    def test_logout_ends_the_session_on_the_server(self):
        token = self.login().json()['session_token']
        headers = {'HTTP_AUTHORIZATION': f'Session {self.user.id}:{token}'}

        self.assertEqual(self.client.post('/api/logout/', **headers).status_code, 204)
        self.assertEqual(self.client.get('/api/boats/', **headers).status_code, 401)

    def test_session_check_uses_the_header(self):
        headers = session_header(self.user)
        for enforced in (False, True):
            with self.subTest(enforced=enforced), override_settings(API_AUTH_ENFORCED=enforced):
                response = self.client.get(f'/api/users/{self.user.id}/session-check/', **headers)
                self.assertEqual(response.json(), {'valid': True})

    def test_session_check_accepts_a_url_token_only_until_enforced(self):
        url = f'/api/users/{self.user.id}/session-check/?token={self.user.session_token}'
        with override_settings(API_AUTH_ENFORCED=False):
            self.assertEqual(self.client.get(url).json(), {'valid': True})
        with override_settings(API_AUTH_ENFORCED=True):
            self.assertEqual(self.client.get(url).json(), {'valid': False})

    @override_settings(API_AUTH_ENFORCED=False)
    def test_report_only_keeps_the_old_user_id_filter_for_anonymous_callers(self):
        Notification.objects.create(recipient=self.user, notif_type='approved', title='Mine')

        with self.assertLogs('troid_api.permissions', 'WARNING'):
            response = self.client.get(f'/api/notifications/unread-count/?user_id={self.user.id}')

        self.assertEqual(response.json(), {'unread_count': 1})


class TaskStatusUpdatesTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create(
            name='Admin',
            email='admin@example.com',
            password='test-password',
            role='admin',
            session_token='valid-admin-session',
        )
        self.client = APIClient()
        self.auth_headers = {
            'HTTP_AUTHORIZATION': f'Session {self.admin.id}:{self.admin.session_token}',
        }

    @override_settings(SUPABASE_URL='https://example.supabase.co', SUPABASE_SECRET_KEY='test-secret')
    def test_requires_a_valid_admin_session(self):
        response = self.client.get('/api/task-status-updates/')

        self.assertEqual(response.status_code, 401)

    @override_settings(
        SUPABASE_URL='https://example.supabase.co', SUPABASE_SECRET_KEY='test-secret',
        API_AUTH_ENFORCED=False,
    )
    def test_stays_enforced_while_the_rest_of_the_api_is_report_only(self):
        for headers in ({}, {'HTTP_AUTHORIZATION': f'Session {self.admin.id}:stale-token'}):
            with self.subTest(headers=headers):
                response = self.client.get('/api/task-status-updates/', **headers)
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.json(), {'error': 'A valid admin session is required.'})

        mayor = make_user('mayorsoffice')
        response = self.client.get('/api/task-status-updates/', **session_header(mayor))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {'error': 'Admin access is required.'})

    @override_settings(SUPABASE_URL='https://example.supabase.co', SUPABASE_SECRET_KEY='test-secret')
    def test_rejects_non_admin_sessions(self):
        barangay_user = User.objects.create(
            name='Barangay User',
            email='barangay@example.com',
            password='test-password',
            role='barangay',
            session_token='valid-barangay-session',
        )
        response = self.client.get(
            '/api/task-status-updates/',
            HTTP_AUTHORIZATION=f'Session {barangay_user.id}:{barangay_user.session_token}',
        )

        self.assertEqual(response.status_code, 403)

    def test_cors_preflight_allows_the_session_authorization_header(self):
        response = self.client.options(
            '/api/task-status-updates/',
            HTTP_ORIGIN='http://localhost:5173',
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='GET',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='authorization',
        )

        self.assertIn('authorization', response.headers['access-control-allow-headers'].lower())

    @override_settings(SUPABASE_URL='https://example.supabase.co', SUPABASE_SECRET_KEY='test-secret')
    @patch('troid_api.views.requests.get')
    def test_forwards_filters_and_returns_supabase_count(self, get):
        upstream = Mock()
        upstream.json.return_value = [{'id': 'test-row', 'status': 'completed'}]
        upstream.headers = {'Content-Range': '0-0/17'}
        get.return_value = upstream

        response = self.client.get(
            '/api/task-status-updates/',
            {
                'status': 'completed',
                'limit': '500',
                'offset': '10',
                'since': '2026-10-01T00:00:00Z',
                'search': 'operator@example.com',
            },
            **self.auth_headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            'results': [{'id': 'test-row', 'status': 'completed'}],
            'count': 17,
        })
        kwargs = get.call_args.kwargs
        self.assertEqual(kwargs['params']['limit'], 200)
        self.assertEqual(kwargs['params']['offset'], 10)
        self.assertEqual(kwargs['params']['status'], 'eq.completed')
        self.assertEqual(kwargs['params']['received_at'], 'gt.2026-10-01T00:00:00Z')
        self.assertIn('operator_email.ilike.', kwargs['params']['or'])
        self.assertEqual(kwargs['headers']['apikey'], 'test-secret')
        self.assertEqual(kwargs['timeout'], 10)

    @override_settings(SUPABASE_URL='', SUPABASE_SECRET_KEY='')
    @patch('troid_api.views.requests.get')
    def test_reports_missing_supabase_configuration(self, get):
        response = self.client.get('/api/task-status-updates/', **self.auth_headers)

        self.assertEqual(response.status_code, 502)
        self.assertIn('not configured', response.json()['error'])
        get.assert_not_called()

    @override_settings(SUPABASE_URL='http://example.supabase.co', SUPABASE_SECRET_KEY='test-secret')
    @patch('troid_api.views.requests.get')
    def test_rejects_non_https_supabase_configuration(self, get):
        response = self.client.get('/api/task-status-updates/', **self.auth_headers)

        self.assertEqual(response.status_code, 502)
        get.assert_not_called()

    @override_settings(SUPABASE_URL='https://example.supabase.co', SUPABASE_SECRET_KEY='test-secret')
    @patch('troid_api.views.requests.get')
    def test_reports_supabase_connection_errors(self, get):
        get.side_effect = requests.ConnectionError('offline')

        response = self.client.get('/api/task-status-updates/', **self.auth_headers)

        self.assertEqual(response.status_code, 502)
        self.assertIn('Unable to fetch', response.json()['error'])


class CompanionAppTests(TestCase):
    """The TROID Companion mobile app: only active operator accounts may sign in,
    always (not just once API_AUTH_ENFORCED is on), with a session of their own."""

    def setUp(self):
        cache.clear()  # Login throttle counts live in the cache.
        self.client = APIClient()
        self.operator = make_user('operator')
        self.profile = assign_operator(self.operator)

    def login(self, email=None, password='Test-password1'):
        return self.client.post(
            '/api/companion/login/', {'email': email or self.operator.email, 'password': password}, format='json',
        )

    def signed_in_headers(self):
        token = self.login().json()['session_token']
        return {'HTTP_AUTHORIZATION': f'Companion {self.operator.id}:{token}'}

    def me(self, headers):
        return self.client.get('/api/companion/me/', **headers)

    def test_operator_signs_in_and_the_session_works(self):
        response = self.login()

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['email'], self.operator.email)
        self.assertNotIn('password', body)
        me = self.me({'HTTP_AUTHORIZATION': f'Companion {self.operator.id}:{body["session_token"]}'})
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()['id'], self.operator.id)

    def test_only_operators_assigned_by_an_admin_can_sign_in(self):
        self.profile.assigned_bot = None
        self.profile.save()
        response = self.login()
        self.assertEqual(response.status_code, 403)
        self.assertIn('assigned', response.json()['error'])

        self.profile.delete()
        self.assertEqual(self.login().status_code, 403)

    def test_unassigning_the_bot_ends_the_app_session(self):
        headers = self.signed_in_headers()

        self.client.patch(
            f'/api/operators/{self.profile.id}/', {'assigned_bot': None}, format='json',
            **session_header(make_user('admin')),
        )

        self.assertEqual(self.me(headers).status_code, 401)

    def test_email_is_case_insensitive(self):
        self.assertEqual(self.login(email=self.operator.email.upper()).status_code, 200)

    def test_wrong_password_and_unknown_email_are_refused_and_audited(self):
        for email, password in ((None, 'wrong'), ('nobody@example.com', 'Test-password1')):
            with self.subTest(email=email):
                response = self.login(email=email, password=password)
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.json(), {'error': 'Invalid email or password'})
        self.assertEqual(AuditLog.objects.filter(module='Companion App', status='failed').count(), 2)

    @override_settings(API_AUTH_ENFORCED=False)
    def test_other_roles_are_refused_even_while_report_only(self):
        for role in ('admin', 'mayorsoffice', 'barangay', 'ngo'):
            with self.subTest(role=role):
                user = make_user(role)
                response = self.login(email=user.email)
                self.assertEqual(response.status_code, 403)
                self.assertNotIn('session_token', response.json())
                user.refresh_from_db()
                self.assertIsNone(user.companion_session_token)

    @override_settings(API_AUTH_ENFORCED=False)
    def test_inactive_operators_are_refused_even_while_report_only(self):
        for status in ('archived', 'pending'):
            with self.subTest(status=status):
                self.operator.status = status
                self.operator.save(update_fields=['status'])
                response = self.login()
                self.assertEqual(response.status_code, 403)
                self.assertNotIn('session_token', response.json())

    def test_app_and_website_sessions_are_independent(self):
        website_token = self.client.post(
            '/api/login/', {'email': self.operator.email, 'password': 'Test-password1'}, format='json',
        ).json()['session_token']
        app_token = self.login().json()['session_token']

        self.operator.refresh_from_db()
        self.assertEqual(self.operator.session_token, website_token)
        self.assertEqual(self.operator.companion_session_token, app_token)

    @override_settings(API_AUTH_ENFORCED=True)
    def test_tokens_only_work_where_they_belong(self):
        app_headers = self.signed_in_headers()
        self.operator.refresh_from_db()

        self.assertEqual(self.me(session_header(self.operator)).status_code, 401)
        self.assertEqual(self.client.get('/api/notifications/unread-count/', **app_headers).status_code, 401)

    def test_bad_app_tokens_are_rejected(self):
        self.login()
        for header in (
            f'Companion {self.operator.id}:wrong-token',
            'Companion 999999:anything',
            f'Companion {self.operator.id}',
            '',
        ):
            with self.subTest(header=header):
                self.assertEqual(self.me({'HTTP_AUTHORIZATION': header}).status_code, 401)

    def test_logout_ends_the_app_session(self):
        headers = self.signed_in_headers()

        self.assertEqual(self.client.post('/api/companion/logout/', **headers).status_code, 204)
        self.assertEqual(self.me(headers).status_code, 401)

    def test_password_reset_by_an_admin_ends_the_app_session(self):
        headers = self.signed_in_headers()

        self.client.post(f'/api/users/{self.operator.id}/reset-password/', **session_header(make_user('admin')))

        self.assertEqual(self.me(headers).status_code, 401)

    def test_archiving_or_changing_role_ends_the_app_session(self):
        admin = make_user('admin')
        for change in ({'status': 'archived'}, {'status': 'pending'}, {'role': 'barangay'}):
            with self.subTest(change=change):
                User.objects.filter(pk=self.operator.pk).update(status='active', role='operator')
                headers = self.signed_in_headers()

                self.client.patch(f'/api/users/{self.operator.id}/', change, format='json', **session_header(admin))

                self.assertEqual(self.me(headers).status_code, 401)
                self.operator.refresh_from_db()
                self.assertIsNone(self.operator.companion_session_token)

    def test_archiving_the_operator_profile_ends_the_app_session(self):
        headers = self.signed_in_headers()

        self.client.patch(
            f'/api/operators/{self.profile.id}/', {'archived': True}, format='json', **session_header(make_user('admin')),
        )

        self.assertEqual(self.me(headers).status_code, 401)

    def test_temporary_password_is_changed_in_the_app(self):
        self.operator.must_change_password = True
        self.operator.save(update_fields=['must_change_password'])
        body = self.login().json()
        self.assertTrue(body['must_change_password'])
        headers = {'HTTP_AUTHORIZATION': f'Companion {self.operator.id}:{body["session_token"]}'}

        def change(old, new):
            return self.client.post(
                '/api/companion/change-password/', {'old_password': old, 'password': new}, format='json', **headers,
            )

        self.assertEqual(change('nope', 'New-password1!').status_code, 400)
        self.assertEqual(change('Test-password1', 'short').status_code, 400)
        response = change('Test-password1', 'New-password1!')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['must_change_password'])
        self.assertEqual(self.me(headers).status_code, 200)  # The app stays signed in.
        self.assertEqual(self.login(password='New-password1!').status_code, 200)

    def test_change_password_requires_an_app_session(self):
        response = self.client.post(
            '/api/companion/change-password/', {'old_password': 'Test-password1', 'password': 'New-password1!'},
            format='json',
        )

        self.assertEqual(response.status_code, 401)
        self.operator.refresh_from_db()
        self.assertTrue(check_password('Test-password1', self.operator.password))

    def test_password_guessing_is_throttled_per_account(self):
        for _ in range(5):
            self.assertEqual(self.login(password='wrong').status_code, 401)

        response = self.login(email=self.operator.email.upper())

        self.assertEqual(response.status_code, 429)
        self.assertIn('error', response.json())


@override_settings(SUPABASE_URL='https://example.supabase.co', SUPABASE_SECRET_KEY='test-secret')
class CompanionTaskStatusTests(TestCase):
    """Task status updates from the app go through the backend, which stamps the
    signed-in operator's email and writes to Supabase with the secret key."""

    URL = '/api/companion/task-status/'

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.operator = make_user('operator')
        assign_operator(self.operator)
        self.operator.companion_session_token = 'app-session'
        self.operator.save(update_fields=['companion_session_token'])
        self.headers = {'HTTP_AUTHORIZATION': f'Companion {self.operator.id}:app-session'}
        self.update = {
            'id': '3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b',
            'status': 'to_be_continued',
            'notes': '  Net 70% full  ',
            'created_at': '2026-10-10T01:41:07.000Z',
            'operator_email': 'someone-else@example.com',  # Ignored.
        }

    def post(self, body=None, **headers):
        return self.client.post(self.URL, body or self.update, format='json', **(headers or self.headers))

    @patch('troid_api.views.requests.post')
    def test_stores_the_update_under_the_signed_in_operator(self, post):
        post.return_value = Mock(ok=True, status_code=201)

        response = self.post()

        self.assertEqual(response.status_code, 201)
        url = post.call_args.args[0]
        kwargs = post.call_args.kwargs
        self.assertEqual(url, 'https://example.supabase.co/rest/v1/task_status_updates')
        self.assertEqual(kwargs['headers']['apikey'], 'test-secret')
        self.assertEqual(kwargs['json'], {
            'id': self.update['id'],
            'status': 'to_be_continued',
            'notes': 'Net 70% full',
            'operator_email': self.operator.email,
            'created_at': '2026-10-10T01:41:07+00:00',
        })

    @patch('troid_api.views.requests.post')
    def test_a_retry_of_a_stored_update_counts_as_delivered(self, post):
        post.return_value = Mock(ok=False, status_code=409, json=Mock(return_value={'code': '23505'}))

        self.assertEqual(self.post().status_code, 200)

    @patch('troid_api.views.requests.post')
    def test_supabase_failures_are_reported_as_bad_gateway(self, post):
        post.return_value = Mock(ok=False, status_code=500, text='boom', json=Mock(side_effect=ValueError))
        with self.assertLogs('troid_api.views', 'ERROR'):
            self.assertEqual(self.post().status_code, 502)

        post.side_effect = requests.ConnectionError('offline')
        self.assertEqual(self.post().status_code, 502)

    @patch('troid_api.views.requests.post')
    def test_invalid_updates_are_rejected_before_reaching_supabase(self, post):
        for change in (
            {'id': 'not-a-uuid'},
            {'status': 'done'},
            {'notes': 5},
            {'notes': 'x' * 2001},
            {'created_at': '2026-10-10T01:41:07'},
            {'created_at': 'yesterday'},
        ):
            with self.subTest(change=change):
                self.assertEqual(self.post({**self.update, **change}).status_code, 400)
        post.assert_not_called()

    @override_settings(API_AUTH_ENFORCED=False)
    @patch('troid_api.views.requests.post')
    def test_requires_an_active_operator_app_session(self, post):
        self.assertEqual(self.client.post(self.URL, self.update, format='json').status_code, 401)
        self.assertEqual(self.post(**session_header(self.operator)).status_code, 401)
        self.operator.status = 'archived'
        self.operator.save(update_fields=['status'])
        self.assertEqual(self.post().status_code, 401)
        post.assert_not_called()

    @override_settings(SUPABASE_URL='', SUPABASE_SECRET_KEY='')
    def test_reports_missing_supabase_configuration(self):
        self.assertEqual(self.post().status_code, 502)


def signed_message(boat, topic_kind, data, key=None, ts=None):
    """Builds an MQTT message the way bot/troid_monitor.py does."""
    topic = f'troid/bot/{boat.id}/{topic_kind}'
    payload = {'ts': time.time() if ts is None else ts, **data}
    payload['sig'] = bot_auth.sign(key or boat.device_key, topic, payload)
    return topic, json.dumps(payload).encode()


class BotMessageVerificationTests(TestCase):
    """Only messages signed with a bot's device key are accepted from the public broker."""

    def setUp(self):
        bot_auth._last_ts.clear()
        self.boat = Boat.objects.create(name='Real robot', device_key='a' * 64)

    def verify(self, topic, raw):
        with self.assertNoLogs('troid_api.bot_auth', 'WARNING'):
            return bot_auth.verify_bot_message(topic, raw)

    def assert_rejected(self, topic, raw):
        with self.assertLogs('troid_api.bot_auth', 'WARNING'):
            self.assertIsNone(bot_auth.verify_bot_message(topic, raw))

    def test_a_correctly_signed_message_is_accepted(self):
        boat, payload = self.verify(*signed_message(self.boat, 'heartbeat', {'battery': 80}))

        self.assertEqual(boat, self.boat)
        self.assertEqual(payload['battery'], 80)
        self.assertNotIn('sig', payload)

    def test_wrong_key_unknown_or_unkeyed_bots_are_rejected(self):
        self.assert_rejected(*signed_message(self.boat, 'heartbeat', {}, key='b' * 64))

        no_key = Boat.objects.create(name='No key')
        self.assert_rejected(*signed_message(no_key, 'heartbeat', {}, key='a' * 64))

        archived = Boat.objects.create(name='Old', device_key='c' * 64, archived=True)
        self.assert_rejected(*signed_message(archived, 'heartbeat', {}))

        topic, raw = signed_message(self.boat, 'heartbeat', {})
        self.assert_rejected(topic.replace(f'/{self.boat.id}/', '/999999/'), raw)

    def test_old_and_replayed_messages_are_rejected(self):
        self.assert_rejected(*signed_message(self.boat, 'heartbeat', {}, ts=time.time() - 600))

        message = signed_message(self.boat, 'heartbeat', {})
        self.verify(*message)
        self.assert_rejected(*message)

    def test_a_heartbeat_cannot_be_reused_as_a_detection(self):
        topic, raw = signed_message(self.boat, 'heartbeat', {'trash_count': 50, 'is_verified': True})

        self.assert_rejected(topic.replace('/heartbeat', '/detection'), raw)

    def test_messages_from_the_robot_monitor_script_are_accepted(self):
        """bot/troid_monitor.py (runs on the Pi) must sign exactly as bot_auth checks."""
        script = Path(settings.BASE_DIR).parent / 'bot' / 'troid_monitor.py'
        env = {'TROID_BOT_ID': str(self.boat.id), 'TROID_BOT_KEY': self.boat.device_key}
        with patch.dict(os.environ, env):
            spec = importlib.util.spec_from_file_location('troid_monitor', script)
            monitor = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(monitor)

        topic, text = monitor.build_message('heartbeat', {'is_active': True, 'battery': 81.5})
        boat, payload = self.verify(topic, text.encode())

        self.assertEqual(boat, self.boat)
        self.assertEqual(payload['battery'], 81.5)

    def test_tampered_and_malformed_messages_are_rejected(self):
        topic, raw = signed_message(self.boat, 'heartbeat', {'battery': 80})
        tampered = json.loads(raw)
        tampered['battery'] = 5
        self.assert_rejected(topic, json.dumps(tampered).encode())

        for raw in (b'not json', b'[]', json.dumps({'ts': time.time()}).encode(),
                    json.dumps({'ts': True, 'sig': 'x'}).encode()):
            with self.subTest(raw=raw):
                self.assert_rejected(topic, raw)
        self.assert_rejected('troid/bot/abc/heartbeat', raw)


@patch('troid_api.mqtt_client.broadcast')
class MqttHandlerTests(TestCase):
    def setUp(self):
        bot_auth._last_ts.clear()
        self.boat = Boat.objects.create(name='Real robot', device_key='a' * 64)

    def receive(self, topic, raw):
        mqtt_client._on_message(None, None, SimpleNamespace(topic=topic, payload=raw))
        self.boat.refresh_from_db()

    def test_signed_heartbeat_marks_the_bot_online(self, broadcast):
        self.receive(*signed_message(self.boat, 'heartbeat', {'is_active': True, 'battery': 76}))

        self.assertTrue(self.boat.is_online)
        self.assertTrue(self.boat.is_active)
        self.assertEqual(self.boat.battery_level, 76)
        broadcast.assert_called_once()

    def test_messages_wait_while_the_system_is_paused(self, broadcast):
        now = timezone.now()
        SystemPause.objects.create(pk=1, kind='backup', user_id=1, user_name='Admin', user_email='a@example.com',
                                   started_at=now, heartbeat_at=now)
        self.receive(*signed_message(self.boat, 'detection', {'is_verified': True, 'trash_count': 3,
                                                               'latitude': 16.6, 'longitude': 120.3}))
        self.receive(*signed_message(self.boat, 'heartbeat', {'is_active': True, 'battery': 50}))

        self.assertEqual(DetectionEvent.objects.count(), 0)
        self.assertFalse(self.boat.is_online)

        SystemPause.objects.all().delete()
        self.receive(*signed_message(self.boat, 'heartbeat', {'is_active': True, 'battery': 60}))

        self.assertEqual(DetectionEvent.objects.get().trash_count, 3)
        self.assertEqual(self.boat.battery_level, 60)
        self.assertEqual(mqtt_client._held, [])

    def test_unsigned_messages_change_nothing(self, broadcast):
        topic = f'troid/bot/{self.boat.id}/'
        with self.assertLogs('troid_api.bot_auth', 'WARNING'):
            self.receive(topic + 'heartbeat', json.dumps({'is_active': True, 'battery': 99}).encode())
            self.receive(topic + 'detection', json.dumps({'is_verified': True, 'trash_count': 9}).encode())

        self.assertFalse(self.boat.is_online)
        self.assertEqual(DetectionEvent.objects.count(), 0)
        broadcast.assert_not_called()


class DeviceKeyEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('admin')
        self.boat = Boat.objects.create(name='Real robot')
        self.url = f'/api/boats/{self.boat.id}/device-key/'

    def test_admin_gets_a_new_key_once(self):
        response = self.client.post(self.url, **session_header(self.admin))

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.boat.refresh_from_db()
        self.assertEqual(body['device_key'], self.boat.device_key)
        self.assertEqual(len(body['device_key']), 64)
        self.assertEqual(body['label'], f'TRD-{self.boat.id:03d}')
        self.assertEqual(body['topic_prefix'], f'troid/bot/{self.boat.id}/')
        self.assertTrue(AuditLog.objects.filter(action='Created robot device key').exists())

        listing = self.client.get('/api/boats/', **session_header(self.admin))
        self.assertNotIn('device_key', json.dumps(listing.json()))
        self.assertNotIn(self.boat.device_key, json.dumps(listing.json()))

    def test_a_new_key_replaces_the_old_one(self):
        first = self.client.post(self.url, **session_header(self.admin)).json()['device_key']
        second = self.client.post(self.url, **session_header(self.admin)).json()['device_key']

        self.assertNotEqual(first, second)
        bot_auth._last_ts.clear()
        with self.assertLogs('troid_api.bot_auth', 'WARNING'):
            self.assertIsNone(bot_auth.verify_bot_message(*signed_message(self.boat, 'heartbeat', {}, key=first)))

    def test_creating_a_key_unpairs_the_robot(self):
        Boat.objects.filter(id=self.boat.id).update(is_online=True, last_seen=timezone.now())

        self.client.post(self.url, **session_header(self.admin))

        listing = self.client.get('/api/boats/', **session_header(self.admin)).json()
        self.assertFalse(next(b for b in listing if b['id'] == self.boat.id)['is_online'])

    def test_bot_without_recent_heartbeat_lists_as_offline(self):
        # is_online is still True: the offline checker never ran (BACKGROUND_WORKERS=False).
        Boat.objects.filter(id=self.boat.id).update(is_online=True, last_seen=timezone.now())
        listing = lambda: {b['id']: b for b in self.client.get('/api/boats/', **session_header(self.admin)).json()}
        self.assertTrue(listing()[self.boat.id]['is_online'])

        Boat.objects.filter(id=self.boat.id).update(last_seen=timezone.now() - Boat.OFFLINE_AFTER)
        self.assertFalse(listing()[self.boat.id]['is_online'])

    @override_settings(API_AUTH_ENFORCED=False)
    def test_only_admins_even_while_report_only(self):
        self.assertEqual(self.client.post(self.url).status_code, 401)
        for role in ('mayorsoffice', 'barangay', 'ngo', 'operator'):
            with self.subTest(role=role):
                response = self.client.post(self.url, **session_header(make_user(role)))
                self.assertEqual(response.status_code, 403)
        self.boat.refresh_from_db()
        self.assertIsNone(self.boat.device_key)


class SharedEmailAccountTests(TestCase):
    """An email may have several accounts as long as only one of them isn't archived."""

    EMAIL = 'poro@example.com'

    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('admin')
        self.old = User.objects.create(
            name='Old Poro', email=self.EMAIL, password='Old-password1', role='barangay', status='archived',
            session_token='old-session',
        )

    def add_user(self, email=None, **data):
        body = {'name': 'New Poro', 'email': email or self.EMAIL, 'role': 'barangay', 'status': 'active', **data}
        with patch('troid_api.views.send_temp_password_email', return_value=True):
            return self.client.post('/api/users/', body, format='json', **session_header(self.admin))

    def set_status(self, user, status):
        return self.client.patch(f'/api/users/{user.pk}/', {'status': status}, format='json', **session_header(self.admin))

    def test_a_new_account_can_reuse_an_archived_accounts_email(self):
        response = self.add_user()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(sorted(User.objects.filter(email=self.EMAIL).values_list('status', flat=True)), ['active', 'archived'])

    def test_only_one_account_per_email_may_be_unarchived(self):
        self.assertEqual(self.add_user().status_code, 201)

        for email, status in ((self.EMAIL, 'active'), ('Poro@Example.com', 'active'), (self.EMAIL, 'pending')):
            with self.subTest(email=email, status=status):
                response = self.add_user(email=email, status=status)

                self.assertEqual(response.status_code, 400)
                self.assertIn('Archive that account first', response.json()['email'][0])
        self.assertEqual(User.objects.filter(email__iexact=self.EMAIL).count(), 2)

        # Another archived copy is fine.
        self.assertEqual(self.add_user(status='archived').status_code, 201)

    def test_an_archived_account_is_restored_only_once_its_email_is_free(self):
        new = User.objects.get(pk=self.add_user().json()['id'])

        response = self.set_status(self.old, 'active')
        self.assertEqual(response.status_code, 400)
        self.old.refresh_from_db()
        self.assertEqual(self.old.status, 'archived')

        self.assertEqual(self.set_status(new, 'archived').status_code, 200)
        self.assertEqual(self.set_status(self.old, 'active').status_code, 200)

    def test_an_email_cannot_be_changed_to_one_in_use(self):
        other = make_user('ngo')

        response = self.client.patch(f'/api/users/{other.pk}/', {'email': 'ADMIN-active@example.com'}, format='json',
                                     **session_header(self.admin))

        self.assertEqual(response.status_code, 400)

    def test_the_database_refuses_a_second_unarchived_account(self):
        from django.db import IntegrityError, transaction
        User.objects.create(name='New', email=self.EMAIL, password='x', role='barangay', status='active')

        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create(name='Another', email=self.EMAIL.upper(), password='x', role='ngo', status='pending')

    @override_settings(API_AUTH_ENFORCED=True)
    def test_signing_in_reaches_the_account_that_is_not_archived(self):
        def login(password):
            return self.client.post('/api/login/', {'email': self.EMAIL, 'password': password}, format='json')

        self.assertEqual(login('Old-password1').status_code, 403)

        new = User.objects.create(name='New', email=self.EMAIL, password='New-password1', role='barangay', status='active')

        response = login('New-password1')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['id'], new.pk)
        self.assertEqual(login('Old-password1').status_code, 401)

    @patch('troid_api.views.send_temp_password_email', return_value=True)
    def test_a_forgotten_password_is_reset_on_the_unarchived_account(self, send):
        new = User.objects.create(name='New', email=self.EMAIL, password='New-password1', role='barangay', status='active')

        self.client.post('/api/forgot-password/', {'email': self.EMAIL}, format='json')

        self.assertEqual(send.call_args.args[0].pk, new.pk)
        new.refresh_from_db()
        self.assertTrue(new.must_change_password)

    @patch('troid_api.views.send_temp_password_email', return_value=True)
    def test_operators_follow_the_same_rule(self, _send):
        self.old.role = 'operator'
        self.old.save()
        old_operator = Operator.objects.create(name='Old Op', user=self.old, archived=True)

        response = self.client.post('/api/operators/', {'name': 'New Op', 'email': self.EMAIL}, format='json',
                                    **session_header(self.admin))
        self.assertEqual(response.status_code, 201)

        response = self.client.patch(f'/api/operators/{old_operator.pk}/', {'archived': False}, format='json',
                                     **session_header(self.admin))
        self.assertEqual(response.status_code, 400)
        old_operator.refresh_from_db()
        self.old.refresh_from_db()
        self.assertTrue(old_operator.archived)
        self.assertEqual(self.old.status, 'archived')

        again = self.client.post('/api/operators/', {'name': 'Third Op', 'email': self.EMAIL}, format='json',
                                 **session_header(self.admin))
        self.assertEqual(again.status_code, 400)
        self.assertFalse(Operator.objects.filter(name='Third Op').exists())


class OperatorAccountCreationTests(TestCase):
    """Operator logins come only from an admin adding them in Operator Management."""

    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('admin')

    @override_settings(API_AUTH_ENFORCED=False)
    @patch('troid_api.views.send_temp_password_email', return_value=True)
    def test_only_admins_add_operators_even_while_report_only(self, _send):
        data = {'name': 'New Op', 'email': 'new-op@example.com'}
        self.assertEqual(self.client.post('/api/operators/', data, format='json').status_code, 401)
        for role in ('mayorsoffice', 'barangay', 'ngo', 'operator'):
            with self.subTest(role=role):
                response = self.client.post('/api/operators/', data, format='json', **session_header(make_user(role)))
                self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(email='new-op@example.com').exists())

        response = self.client.post('/api/operators/', data, format='json', **session_header(self.admin))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(User.objects.get(email='new-op@example.com').role, 'operator')

    @patch('troid_api.views.send_temp_password_email', return_value=True)
    def test_user_management_cannot_make_operator_accounts(self, _send):
        response = self.client.post(
            '/api/users/', {'name': 'X', 'email': 'x@example.com', 'role': 'operator'}, format='json',
            **session_header(self.admin),
        )
        self.assertEqual(response.status_code, 400)

        staff = make_user('ngo')
        self.client.patch(f'/api/users/{staff.id}/', {'role': 'operator'}, format='json', **session_header(self.admin))
        staff.refresh_from_db()
        self.assertEqual(staff.role, 'ngo')


class CompanionBotTests(TestCase):
    """The app shows the condition of the robot assigned to the signed-in operator."""

    def setUp(self):
        self.client = APIClient()
        self.operator = make_user('operator')
        self.operator.companion_session_token = 'app-session'
        self.operator.save(update_fields=['companion_session_token'])
        self.headers = {'HTTP_AUTHORIZATION': f'Companion {self.operator.id}:app-session'}
        self.boat = Boat.objects.create(name='Real robot', is_online=True, battery_level=64, device_key='a' * 64)

    def get(self):
        return self.client.get('/api/companion/bot/', **self.headers)

    def test_shows_the_assigned_bot(self):
        Operator.objects.create(name='Op', user=self.operator, assigned_bot=self.boat)

        bot = self.get().json()['bot']

        self.assertEqual(bot['label'], f'TRD-{self.boat.id:03d}')
        self.assertTrue(bot['is_online'])
        self.assertEqual(bot['battery_level'], 64)
        self.assertNotIn('device_key', bot)

    def test_unassigned_operators_are_refused(self):
        self.assertEqual(self.get().status_code, 401)

        # Someone else's bot doesn't count.
        Operator.objects.create(name='Me', user=self.operator)
        other = make_user('operator', status='pending')
        Operator.objects.create(name='Other', user=other, assigned_bot=self.boat)
        self.assertEqual(self.get().status_code, 401)

    def test_requires_an_app_session(self):
        self.assertEqual(self.client.get('/api/companion/bot/').status_code, 401)


class RobotPresenceTests(TestCase):
    """The website shows which operator is using a robot: the app reports while the
    operator's phone can reach their assigned robot's Pi."""

    URL = '/api/companion/bot/presence/'

    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('admin')
        self.boat = Boat.objects.create(name='Real robot')
        self.first = self.app_operator('first', 'Op A')
        self.second = self.app_operator('second', 'Op B')

    def app_operator(self, slug, name):
        user = User.objects.create(name=name, email=f'{slug}@example.com', password='Test-password1',
                                   role='operator', companion_session_token=f'{slug}-session')
        Operator.objects.create(name=name, user=user, assigned_bot=self.boat)
        return {'HTTP_AUTHORIZATION': f'Companion {user.id}:{slug}-session'}

    def report(self, headers, in_use):
        return self.client.post(self.URL, {'in_use': in_use}, format='json', **headers)

    def shown_on_website(self):
        bots = self.client.get('/api/boats/', **session_header(self.admin)).json()
        return next(b for b in bots if b['id'] == self.boat.id)

    def audits(self, action):
        return AuditLog.objects.filter(action=action).count()

    def test_start_refresh_and_stop(self):
        response = self.report(self.first, True)
        self.assertEqual(response.json(), {'bot': self.boat.label, 'in_use': True})
        bot = self.shown_on_website()
        self.assertEqual(bot['in_use_by_name'], 'Op A')
        self.assertIsNotNone(bot['in_use_since'])

        self.report(self.first, True)  # The 10-second refresh logs nothing new.
        self.assertEqual(self.audits('Started using robot'), 1)

        self.report(self.first, False)
        self.assertIsNone(self.shown_on_website()['in_use_by_name'])
        self.assertEqual(self.audits('Stopped using robot'), 1)

    def test_presence_expires_when_reports_stop(self):
        self.report(self.first, True)
        Boat.objects.filter(pk=self.boat.pk).update(in_use_seen_at=timezone.now() - Boat.IN_USE_EXPIRES_AFTER)

        bot = self.shown_on_website()
        self.assertIsNone(bot['in_use_by_name'])
        self.assertIsNone(bot['in_use_since'])

    def test_another_operator_waits_until_the_robot_is_free(self):
        self.report(self.first, True)

        response = self.report(self.second, True)
        self.assertEqual(response.json(), {'bot': self.boat.label, 'in_use': False, 'in_use_by': 'Op A'})
        self.report(self.second, False)  # Not theirs to release.
        self.assertEqual(self.shown_on_website()['in_use_by_name'], 'Op A')

        Boat.objects.filter(pk=self.boat.pk).update(in_use_seen_at=timezone.now() - Boat.IN_USE_EXPIRES_AFTER)
        self.assertTrue(self.report(self.second, True).json()['in_use'])
        self.assertEqual(self.shown_on_website()['in_use_by_name'], 'Op B')

    def test_presence_never_makes_a_switched_off_robot_look_online(self):
        long_ago = timezone.now() - Boat.OFFLINE_AFTER * 4
        Boat.objects.filter(pk=self.boat.pk).update(is_online=True, last_seen=long_ago)

        self.report(self.first, True)
        self.report(self.first, False)

        self.boat.refresh_from_db()
        self.assertEqual(self.boat.last_seen, long_ago)
        self.assertFalse(self.shown_on_website()['is_online'])

    def test_logging_out_frees_the_robot(self):
        self.report(self.first, True)

        self.assertEqual(self.client.post('/api/companion/logout/', **self.first).status_code, 204)

        self.assertIsNone(self.shown_on_website()['in_use_by_name'])
        self.assertEqual(self.audits('Stopped using robot'), 1)

    def test_rejects_bad_input_and_missing_sessions(self):
        self.assertEqual(self.client.post(self.URL, {'in_use': 'yes'}, format='json', **self.first).status_code, 400)
        self.assertEqual(self.client.post(self.URL, {'in_use': True}, format='json').status_code, 401)


@patch('troid_api.mqtt_client.broadcast')
class CleanupDriveTests(TestCase):
    """The Companion app lists an operator's cleanups and starts them; the robot's
    detections are then counted against that request for the trash report."""

    def setUp(self):
        cache.clear()
        bot_auth._last_ts.clear()
        self.client = APIClient()
        self.operator = make_user('operator')
        self.profile = assign_operator(self.operator)
        self.boat = self.profile.assigned_bot
        self.boat.device_key = 'a' * 64
        self.boat.save(update_fields=['device_key'])
        self.operator.companion_session_token = 'app-session'
        self.operator.save(update_fields=['companion_session_token'])
        self.headers = {'HTTP_AUTHORIZATION': f'Companion {self.operator.id}:app-session'}
        self.req = self.make_request('2026-11-20')

    def make_request(self, day, boat=None, status='approved', cleanup_type='troid_supported'):
        req = Request.objects.create(email='requester@example.com', status=status, barangay='Poro',
                                     location_name='River Mouth', notes='Near the bridge')
        DeploymentSchedule.objects.create(bot=boat or self.boat, day=day, label='06:00', zone='Poro',
                                          request_id=req.request_id, cleanup_type=cleanup_type)
        return req

    def listed(self):
        response = self.client.get('/api/companion/requests/', **self.headers)
        self.assertEqual(response.status_code, 200)
        return [r['request_id'] for r in response.json()['requests']]

    def start(self, req=None):
        req = req or self.req
        return self.client.post(f'/api/companion/requests/{req.request_id}/start/', format='json', **self.headers)

    def detect(self, label):
        topic, raw = signed_message(self.boat, 'detection', {
            'is_verified': True, 'latitude': 16.5, 'longitude': 120.3, 'confidence': 0.8,
            'trash_count': 1, 'categories': {label: 1},
        })
        mqtt_client._on_message(None, None, SimpleNamespace(topic=topic, payload=raw))

    def test_lists_only_cleanups_assigned_to_this_robot(self, _):
        other_bot = Boat.objects.create(name='Other')
        self.make_request('2026-11-21', boat=other_bot)
        self.make_request('2026-11-22', cleanup_type='unsupported')
        self.make_request('2026-11-23', status='completed')
        self.make_request('2026-11-24', status='pending_admin_approval')

        self.assertEqual(self.listed(), [self.req.request_id])

    def test_a_drive_in_progress_is_listed_first(self, _):
        later = self.make_request('2026-11-30', status='ongoing')

        self.assertEqual(self.listed(), [later.request_id, self.req.request_id])

    def test_overview_shows_the_schedule_and_location(self, _):
        response = self.client.get(f'/api/companion/requests/{self.req.request_id}/', **self.headers)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual((body['schedule_day'], body['schedule_time'], body['barangay'], body['location_name']),
                         ('2026-11-20', '06:00', 'Poro', 'River Mouth'))

    def letter_response(self, req):
        return self.client.get(f'/api/companion/requests/{req.request_id}/letter/', **self.headers)

    def test_assigned_operator_can_open_the_letter(self, _):
        self.req.letter_file_name = 'letter.pdf'
        self.req.letter_content_type = 'application/pdf'
        self.req.save()
        LetterFile.objects.create(request=self.req, data='JVBERi0=')

        response = self.letter_response(self.req)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(),
                         {'file_name': 'letter.pdf', 'content_type': 'application/pdf', 'data': 'JVBERi0='})

    def test_letter_of_a_cleanup_on_another_robot_is_refused(self, _):
        other = self.make_request('2026-11-21', boat=Boat.objects.create(name='Other'))
        LetterFile.objects.create(request=other, data='JVBERi0=')

        self.assertEqual(self.letter_response(other).status_code, 404)

    def test_request_without_a_letter_file_says_so(self, _):
        response = self.letter_response(self.req)

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error'], 'This request has no letter file.')

    def test_start_logs_the_time_and_marks_it_ongoing(self, _):
        response = self.start()

        self.assertEqual(response.status_code, 201)
        self.req.refresh_from_db()
        self.assertEqual(self.req.status, 'ongoing')
        self.assertIsNotNone(self.req.drive_started_at)
        self.assertEqual(self.req.bot_id, self.boat)
        self.assertEqual(self.req.operator, self.profile)
        entry = StatusHistory.objects.get(request=self.req, label='Cleanup Drive Started')
        self.assertEqual(entry.date, self.req.drive_started_at)
        self.assertEqual(entry.actor, self.operator.name)
        self.assertTrue(AuditLog.objects.filter(action='Started cleanup drive').exists())

    def test_starting_twice_keeps_the_first_time(self, _):
        self.start()
        self.req.refresh_from_db()
        first = self.req.drive_started_at

        self.assertEqual(self.start().status_code, 200)

        self.req.refresh_from_db()
        self.assertEqual(self.req.drive_started_at, first)
        self.assertEqual(StatusHistory.objects.filter(request=self.req, label='Cleanup Drive Started').count(), 1)

    def test_cant_start_someone_elses_request(self, _):
        other = self.make_request('2026-11-21', boat=Boat.objects.create(name='Other'))

        self.assertEqual(self.start(other).status_code, 404)
        other.refresh_from_db()
        self.assertEqual(other.status, 'approved')

    def test_cant_start_a_finished_request(self, _):
        done = self.make_request('2026-11-21', status='completed')

        self.assertEqual(self.start(done).status_code, 400)

    def test_cant_start_a_second_drive_while_one_is_running(self, _):
        second = self.make_request('2026-11-21')
        self.start()

        self.assertEqual(self.start(second).status_code, 409)
        second.refresh_from_db()
        self.assertEqual(second.status, 'approved')

    def test_needs_the_operators_app_session(self, _):
        for call in (self.client.get('/api/companion/requests/'),
                     self.client.get(f'/api/companion/requests/{self.req.request_id}/letter/'),
                     self.client.post(f'/api/companion/requests/{self.req.request_id}/start/')):
            self.assertIn(call.status_code, (401, 403))

    def test_detections_are_recorded_against_the_started_drive(self, _):
        # Today's schedule points elsewhere: the drive the operator started wins.
        today = timezone.now().astimezone(mqtt_client.APP_TIMEZONE).strftime('%Y-%m-%d')
        self.make_request(today)
        self.start()

        self.detect('Plastic')

        self.assertEqual(DetectionEvent.objects.get().request, self.req)

    def test_the_robots_counts_are_given_per_troid_class(self, _):
        self.start()
        for label in ('Clear plastic bottle', 'Other plastic bottle', 'Drink can', 'Plastic bottle cap',
                      'Plastic film', 'Glass bottle', 'Cigarette'):
            self.detect(label)
        admin = make_user('admin')

        response = self.client.get(f'/api/requests/{self.req.request_id}/troid_count/', **session_header(admin))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            'troid_assisted': True,
            'categories': {'Plastic': 4, 'Metal': 1, 'Glass': 1, 'Other': 1},
            'total': 7,
        })

    def test_a_cleanup_without_the_robot_gets_no_counts(self, _):
        manual = self.make_request('2026-11-21', cleanup_type='unsupported')
        admin = make_user('admin')

        body = self.client.get(f'/api/requests/{manual.request_id}/troid_count/', **session_header(admin)).json()

        self.assertFalse(body['troid_assisted'])

    def test_filing_the_report_closes_the_drive_without_a_verification_step(self, _):
        self.start()
        admin = make_user('admin')
        report = {'site_type': 'shoreline', 'people_count': 2, 'hours_spent': 3,
                  'bags': 1, 'weight_kg': 2, 'non_usable_kg': 1, 'recyclable_kg': 1,
                  'trash_items': {'Beverage bottles (plastic)': 9}, 'notes': ''}

        response = self.client.post(f'/api/requests/{self.req.request_id}/submit_trash_report/', report,
                                    format='json', **session_header(admin))

        self.assertEqual(response.status_code, 200)
        self.req.refresh_from_db()
        self.assertEqual(self.req.status, 'completed')
        self.assertEqual(self.req.trash_items['Beverage bottles (plastic)'], 9)  # The edited figure is kept.
        self.assertEqual(self.req.trash_categories['Plastic'], 9)
        self.assertIsNotNone(self.req.session_completed_at)


class TroidClassMappingTests(SimpleTestCase):
    """The robot's labels are counted under the TROID classes, as the report's items are."""

    def test_labels_map_to_troid_classes(self):
        for label, cls in (
            ('Plastic', 'Plastic'),
            ('Clear plastic bottle', 'Plastic'),
            ('Crisp packet', 'Plastic'),
            ('Six pack rings', 'Plastic'),
            ('Glass jar', 'Glass'),
            ('Drink can', 'Metal'),
            ('Food Can', 'Metal'),
            ('Metal bottle cap', 'Metal'),
            ('Pop tab', 'Metal'),
            ('Paper cup', 'Paper/Cardboard'),
            ('Other carton', 'Paper/Cardboard'),
            ('Food waste', 'Organic/Biodegradable'),
            ('Organic', 'Organic/Biodegradable'),
            ('Shoe', 'Other'),
            ('Cigarette', 'Other'),
        ):
            with self.subTest(label=label):
                self.assertEqual(drives.report_category(label), cls)

    def test_every_item_belongs_to_one_class(self):
        self.assertEqual(len(drives.TRASH_ITEMS), len(set(drives.TRASH_ITEMS)))
        self.assertEqual({cls for cls, _ in drives.TRASH_GROUPS}, set(drives.TROID_CLASSES))
        totals = drives.class_totals({'Paper bags': 2, 'Pull tabs': 3, 'Organic waste': 1})
        self.assertEqual(totals, {'Plastic': 0, 'Metal': 3, 'Glass': 0, 'Paper/Cardboard': 2,
                                  'Organic/Biodegradable': 1, 'Other': 0})


def requester(name, email, role='barangay'):
    return User.objects.create(
        name=name, email=email, password='x', role=role, status='active', location='Poro',
        session_token=f'{email}-session',
    )


@override_settings(API_AUTH_ENFORCED=True)
class RedirectCollectionAreaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('admin')
        self.owner = requester('Poro Barangay', 'poro@example.com')
        self.old_area = CollectionArea.objects.create(name='Old Spot', barangay='Poro', status='approved')
        self.new_area = CollectionArea.objects.create(name='River Mouth', barangay='Poro', status='approved')
        self.req = Request.objects.create(
            status='pending_admin_approval', email=self.owner.email, barangay='Poro', collection_area=self.old_area,
        )

    def redirect(self, req=None, **data):
        req = req or self.req
        data.setdefault('collection_area', self.new_area.pk)
        data.setdefault('reason', 'The trash drifted downstream.')
        return self.client.post(f'/api/requests/{req.request_id}/redirect-area/', data, format='json', **session_header(self.admin))

    def test_cenro_moves_the_request_and_tells_the_requester_why(self):
        response = self.redirect()

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['collection_area_detail']['name'], 'River Mouth')
        self.req.refresh_from_db()
        self.assertEqual(self.req.collection_area, self.new_area)
        step = self.req.status_history.get()
        self.assertEqual(step.label, 'Collection Area Changed by CENRO')
        self.assertIn(self.old_area.area_id, step.details)
        self.assertIn('drifted downstream', step.details)
        notice = Notification.objects.get(recipient=self.owner)
        self.assertEqual(notice.notif_type, 'area_redirected')
        self.assertIn('River Mouth', notice.message)

    def test_only_to_a_different_approved_area_with_a_reason(self):
        pending = CollectionArea.objects.create(name='Unreviewed', barangay='Poro', status='pending')
        archived = CollectionArea.objects.create(name='Old', barangay='Poro', status='approved', archived=True)
        for data in (
            {'collection_area': pending.pk},
            {'collection_area': archived.pk},
            {'collection_area': self.old_area.pk},
            {'collection_area': 'abc'},
            {'reason': '  '},
        ):
            with self.subTest(data=data):
                self.assertEqual(self.redirect(**data).status_code, 400)
        self.req.refresh_from_db()
        self.assertEqual(self.req.collection_area, self.old_area)

    def test_not_once_the_cleanup_started_or_for_unsupported_cleanups(self):
        ongoing = Request.objects.create(status='ongoing', collection_area=self.old_area)
        manual = Request.objects.create(status='approved', cleanup_type='unsupported', location_name='Bridge')
        self.assertEqual(self.redirect(ongoing).status_code, 400)
        self.assertEqual(self.redirect(manual).status_code, 400)

    def test_only_cenro_can_redirect(self):
        response = self.client.post(
            f'/api/requests/{self.req.request_id}/redirect-area/',
            {'collection_area': self.new_area.pk, 'reason': 'x'}, format='json', **session_header(self.owner),
        )
        self.assertEqual(response.status_code, 403)


@override_settings(API_AUTH_ENFORCED=True)
class ResendRequestTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.city_admin = make_user('mayorsoffice')
        self.cenro = make_user('admin')
        self.owner = requester('Poro Barangay', 'poro@example.com')
        self.other = requester('Lingsat NGO', 'ngo@example.com', role='ngo')

    def waiting(self, status='pending_mayor_approval', days=21):
        req = Request.objects.create(status=status, email=self.owner.email, barangay='Poro')
        Request.objects.filter(pk=req.pk).update(date_submitted=timezone.now() - timedelta(days=days))
        req.refresh_from_db()
        return req

    def resend(self, req, user=None):
        return self.client.post(f'/api/requests/{req.request_id}/resend/', {}, format='json', **session_header(user or self.owner))

    def test_after_20_days_it_reminds_the_city_admins(self):
        req = self.waiting()
        self.assertTrue(self.client.get(f'/api/requests/{req.request_id}/', **session_header(self.owner)).json()['can_resend'])

        response = self.resend(req)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(response.json()['can_resend'])
        req.refresh_from_db()
        self.assertIsNotNone(req.resent_at)
        self.assertEqual(req.status, 'pending_mayor_approval')
        self.assertEqual(req.status_history.get().label, 'Resent by Requester')
        notices = Notification.objects.filter(notif_type='awaiting_approval')
        self.assertEqual([n.recipient for n in notices], [self.city_admin])

    def test_waiting_on_cenro_reminds_cenro(self):
        req = self.waiting('pending_admin_approval')
        self.assertEqual(self.resend(req).status_code, 200)
        notices = Notification.objects.filter(notif_type='awaiting_approval')
        self.assertEqual([n.recipient for n in notices], [self.cenro])

    def test_not_before_20_days_and_then_20_days_after_each_resend(self):
        early = self.waiting(days=19)
        response = self.resend(early)
        self.assertEqual(response.status_code, 400)
        self.assertIn('20 days', response.json()['error'])
        self.assertFalse(Notification.objects.exists())

        req = self.waiting(days=45)
        self.assertEqual(self.resend(req).status_code, 200)
        self.assertEqual(self.resend(req).status_code, 400)
        Request.objects.filter(pk=req.pk).update(resent_at=timezone.now() - timedelta(days=20))
        self.assertEqual(self.resend(req).status_code, 200)

    def test_only_while_waiting_for_a_decision(self):
        for status in ('approved', 'parked', 'completed', 'merged'):
            with self.subTest(status=status):
                req = self.waiting(status)
                self.assertFalse(self.client.get(f'/api/requests/{req.request_id}/', **session_header(self.owner)).json()['can_resend'])
                self.assertEqual(self.resend(req).status_code, 400)

    def test_only_by_whoever_made_the_request(self):
        req = self.waiting()
        self.assertEqual(self.resend(req, self.other).status_code, 403)
        self.assertEqual(self.resend(req, self.cenro).status_code, 403)
        req.refresh_from_db()
        self.assertIsNone(req.resent_at)


@override_settings(API_AUTH_ENFORCED=True)
class MergeRequestTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('admin')
        self.poro = requester('Poro Barangay', 'poro@example.com')
        self.ngo = requester('River NGO', 'ngo@example.com', role='ngo')
        self.lingsat = requester('Lingsat Barangay', 'lingsat@example.com')
        self.area = CollectionArea.objects.create(name='River Mouth', barangay='Poro', status='approved')
        self.main = self.make('pending_admin_approval', self.poro)
        self.ngo_req = self.make('pending_mayor_approval', self.ngo)
        self.lingsat_req = self.make('approved', self.lingsat)

    def make(self, status, user, **fields):
        fields.setdefault('collection_area', self.area)
        return Request.objects.create(status=status, email=user.email, barangay='Poro', requested_by_name=user.name, **fields)

    def merge(self, *others, into=None, user=None):
        into = into or self.main
        return self.client.post(
            f'/api/requests/{into.request_id}/merge/',
            {'request_ids': [o if isinstance(o, str) else o.request_id for o in others], 'reason': 'Same stretch of river.'},
            format='json', **session_header(user or self.admin),
        )

    def detail(self, req, user=None):
        return self.client.get(f'/api/requests/{req.request_id}/', **session_header(user or self.admin)).json()

    def test_merging_keeps_each_request_and_points_it_at_the_main_one(self):
        DeploymentSchedule.objects.create(bot=Boat.objects.create(name='B'), day='2026-12-01', request_id=self.lingsat_req.request_id)

        response = self.merge(self.ngo_req, self.lingsat_req)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            sorted(m['request_id'] for m in response.json()['merged_requests']),
            sorted([self.ngo_req.request_id, self.lingsat_req.request_id]),
        )
        for req, was in ((self.ngo_req, 'pending_mayor_approval'), (self.lingsat_req, 'approved')):
            req.refresh_from_db()
            self.assertEqual(req.status, 'merged')
            self.assertEqual(req.merged_from_status, was)
            self.assertEqual(req.merged_into, self.main)
            self.assertTrue(req.status_history.filter(label=f'Merged into {self.main.request_id} by CENRO').exists())
        self.assertFalse(DeploymentSchedule.objects.filter(request_id=self.lingsat_req.request_id).exists())
        self.assertTrue(self.main.status_history.filter(label='Requests Merged by CENRO').exists())
        self.assertEqual(
            sorted(n.recipient.email for n in Notification.objects.filter(notif_type='merged')),
            ['lingsat@example.com', 'ngo@example.com'],
        )

    def test_every_party_gets_the_main_requests_updates_and_results(self):
        self.merge(self.ngo_req, self.lingsat_req)

        self.client.post(f'/api/requests/{self.main.request_id}/admin_approve/', **session_header(self.admin))

        approved = Notification.objects.filter(notif_type='approved')
        self.assertEqual(sorted(n.recipient.email for n in approved), ['lingsat@example.com', 'ngo@example.com', 'poro@example.com'])
        ngo_notice = approved.get(recipient=self.ngo)
        self.assertEqual(ngo_notice.request, self.ngo_req)
        self.assertIn(self.main.request_id, ngo_notice.message)

        Request.objects.filter(pk=self.main.pk).update(
            status='completed', bags=12, weight_kg=40.5, trash_categories={'Plastic': 30},
        )
        shared = self.detail(self.ngo_req, self.ngo)['merged_into_detail']
        self.assertEqual(shared['request_id'], self.main.request_id)
        self.assertEqual(shared['status'], 'completed')
        self.assertEqual(shared['bags'], 12)
        self.assertEqual(shared['trash_categories'], {'Plastic': 30})
        self.assertEqual(shared['collection_area_detail']['name'], 'River Mouth')
        self.assertTrue(any(step['label'] == 'Approved by Admin' for step in shared['status_history']))

    def test_one_requester_with_two_merged_requests_is_told_once(self):
        second = self.make('pending_admin_approval', self.poro)
        self.merge(second)
        Notification.objects.all().delete()

        self.client.post(f'/api/requests/{self.main.request_id}/reschedule/', {'preferred_date': '2026-12-20'}, format='json', **session_header(self.admin))

        self.assertEqual(Notification.objects.filter(recipient=self.poro).count(), 1)

    def test_only_requests_for_the_same_collection_area(self):
        elsewhere = self.make('pending_admin_approval', self.ngo, collection_area=CollectionArea.objects.create(
            name='Creek', barangay='Poro', status='approved',
        ))
        manual = self.make('pending_admin_approval', self.ngo, cleanup_type='unsupported', collection_area=None, location_name='Bridge')
        other_manual = self.make('pending_admin_approval', self.lingsat, cleanup_type='unsupported', collection_area=None, location_name='Bridge')

        response = self.merge(elsewhere)
        self.assertEqual(response.status_code, 400)
        self.assertIn('same collection area', response.json()['error'])
        self.assertEqual(self.merge(manual).status_code, 400)
        self.assertEqual(self.merge(other_manual, into=manual).status_code, 400)
        self.assertEqual(Request.objects.filter(status='merged').count(), 0)

    def test_changing_the_main_requests_area_moves_the_merged_ones_too(self):
        self.merge(self.ngo_req)
        creek = CollectionArea.objects.create(name='Creek', barangay='Poro', status='approved')

        response = self.client.post(
            f'/api/requests/{self.main.request_id}/redirect-area/',
            {'collection_area': creek.pk, 'reason': 'Trash drifted.'}, format='json', **session_header(self.admin),
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.ngo_req.refresh_from_db()
        self.assertEqual(self.ngo_req.collection_area, creek)
        self.assertTrue(self.ngo_req.status_history.filter(label='Collection Area Changed by CENRO').exists())
        self.assertTrue(Notification.objects.filter(recipient=self.ngo, notif_type='area_redirected').exists())
        self.assertEqual(self.detail(self.ngo_req)['merged_into_detail']['collection_area_detail']['name'], 'Creek')

    def test_what_cannot_be_merged(self):
        started = self.make('ongoing', self.ngo)
        manual = self.make('pending_admin_approval', self.ngo, cleanup_type='unsupported', collection_area=None, location_name='Bridge')
        archived = self.make('approved', self.ngo, archived=True)
        self.assertEqual(self.merge(self.main).status_code, 400)
        self.assertEqual(self.merge(started).status_code, 400)
        self.assertEqual(self.merge(manual).status_code, 400)
        self.assertEqual(self.merge(archived).status_code, 400)
        self.assertEqual(self.merge('REQ-NOPE').status_code, 400)
        self.assertEqual(self.merge(self.ngo_req, into=started).status_code, 400)

        self.assertEqual(self.merge(self.ngo_req).status_code, 200)
        self.assertEqual(self.merge(self.ngo_req, into=self.lingsat_req).status_code, 400)
        self.assertEqual(self.merge(self.main, into=self.lingsat_req).status_code, 400)
        self.assertEqual(self.merge(self.lingsat_req, into=self.ngo_req).status_code, 400)
        self.assertEqual(self.client.post(f'/api/requests/{self.ngo_req.request_id}/park/', {'reason': 'x'}, format='json', **session_header(self.admin)).status_code, 400)
        self.assertEqual(self.merge(self.lingsat_req, user=self.poro).status_code, 403)

    def test_unmerging_returns_it_to_where_it_was(self):
        self.merge(self.lingsat_req)

        response = self.client.post(f'/api/requests/{self.lingsat_req.request_id}/unmerge/', {}, format='json', **session_header(self.admin))

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['status'], 'approved')
        self.assertIsNone(response.json()['merged_into'])
        self.assertEqual(self.detail(self.main)['merged_requests'], [])
        self.assertTrue(Notification.objects.filter(recipient=self.lingsat, notif_type='unmerged').exists())
        self.assertEqual(self.client.post(f'/api/requests/{self.lingsat_req.request_id}/unmerge/', {}, format='json', **session_header(self.admin)).status_code, 400)

    def test_archiving_the_main_request_unmerges_the_rest(self):
        self.merge(self.ngo_req)

        self.client.delete(f'/api/requests/{self.main.request_id}/', **session_header(self.admin))

        self.ngo_req.refresh_from_db()
        self.assertEqual(self.ngo_req.status, 'pending_mayor_approval')
        self.assertIsNone(self.ngo_req.merged_into)


class PriorityAreaTests(TestCase):
    """A collection area is a priority when its average bags per cleanup over the last 30 days
    is higher than over the 30 days before."""

    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('admin')
        self.poro = CollectionArea.objects.create(name='Poro Shore', barangay='Poro', status='approved', points=[[0, 0]] * 3)
        self.catbangen = CollectionArea.objects.create(name='Catbangen River', barangay='Catbangen', status='approved',
                                                       points=[[0, 0]] * 3)

    def cleanup(self, area, bags, days_ago, **fields):
        fields.setdefault('status', 'completed')
        req = Request.objects.create(barangay=area.barangay, collection_area=area, bags=bags, **fields)
        Request.objects.filter(pk=req.pk).update(session_completed_at=timezone.now() - timedelta(days=days_ago))
        return req

    def areas(self, user=None, **params):
        response = self.client.get('/api/priority-areas/', params, **session_header(user or self.admin))
        self.assertEqual(response.status_code, 200)
        return {a['collection_area']['name']: a for a in response.json()}

    def test_more_bags_per_cleanup_than_last_month_is_a_priority(self):
        self.cleanup(self.poro, 10, 40)
        self.cleanup(self.poro, 6, 45)   # last month: 8 a cleanup
        self.cleanup(self.poro, 12, 5)
        self.cleanup(self.poro, 9, 10)   # lately: 10.5 a cleanup

        poro = self.areas()['Poro Shore']

        self.assertTrue(poro['is_priority'])
        self.assertEqual(poro['status'], 'priority')
        self.assertEqual(poro['current'], {'cleanups': 2, 'bags': 21, 'average': 10.5})
        self.assertEqual(poro['previous'], {'cleanups': 2, 'bags': 16, 'average': 8.0})
        self.assertEqual(poro['change_pct'], 31.2)

    def test_unsupported_cleanups_in_an_area_count_too(self):
        self.cleanup(self.poro, 8, 40)
        self.cleanup(self.poro, 15, 5, cleanup_type='unsupported', location_name='Beside the pier')

        poro = self.areas()['Poro Shore']

        self.assertTrue(poro['is_priority'])
        self.assertEqual(poro['current'], {'cleanups': 1, 'bags': 15, 'average': 15.0})
        self.assertIn(self.poro.id, [h['collection_area']['id'] for h in priority.hotspot_history(months=1)[-1]['hotspots']])

    def test_fewer_or_the_same_bags_per_cleanup_is_fine(self):
        self.cleanup(self.poro, 10, 40)
        self.cleanup(self.poro, 10, 5)
        self.cleanup(self.catbangen, 20, 40)
        self.cleanup(self.catbangen, 8, 5)
        self.cleanup(self.catbangen, 8, 6)

        areas = self.areas()

        self.assertEqual(areas['Poro Shore']['status'], 'steady')
        self.assertEqual(areas['Catbangen River']['status'], 'steady')
        self.assertFalse(any(a['is_priority'] for a in areas.values()))

    def test_a_rise_in_cleanups_alone_is_not_a_priority(self):
        self.cleanup(self.poro, 10, 40)
        for days_ago in (2, 4, 6, 8):
            self.cleanup(self.poro, 10, days_ago)

        self.assertEqual(self.areas()['Poro Shore']['status'], 'steady')

    def test_without_both_months_there_is_nothing_to_compare(self):
        self.cleanup(self.poro, 30, 3)
        self.cleanup(self.catbangen, 30, 45)

        areas = self.areas()

        self.assertEqual(areas['Poro Shore']['status'], 'no_baseline')
        self.assertEqual(areas['Catbangen River']['status'], 'no_recent')
        self.assertIsNone(areas['Catbangen River']['current']['average'])
        self.assertFalse(any(a['is_priority'] for a in areas.values()))

    def test_only_finished_cleanups_count(self):
        self.cleanup(self.poro, 5, 40)
        self.cleanup(self.poro, 5, 5)
        self.cleanup(self.poro, 50, 5, archived=True)
        self.cleanup(self.poro, 50, 5, status='merged')
        self.cleanup(self.poro, 50, 70)  # older than both months
        Request.objects.create(barangay='Poro', collection_area=self.poro, status='approved', bags=None)

        poro = self.areas()['Poro Shore']

        self.assertEqual((poro['current']['cleanups'], poro['previous']['cleanups']), (1, 1))
        self.assertEqual(poro['status'], 'steady')

    def test_as_of_answers_for_an_earlier_day(self):
        self.cleanup(self.poro, 4, 75)
        self.cleanup(self.poro, 12, 50)
        self.cleanup(self.poro, 2, 5)
        as_of = (timezone.now() - timedelta(days=40)).astimezone(views.APP_TIMEZONE).date().isoformat()

        self.assertEqual(self.areas()['Poro Shore']['status'], 'steady')
        self.assertEqual(self.areas(as_of=as_of)['Poro Shore']['status'], 'priority')
        self.assertEqual(self.client.get('/api/priority-areas/', {'as_of': 'soon'}, **session_header(self.admin)).status_code, 400)

    def test_barangay_accounts_see_only_their_own_areas(self):
        self.cleanup(self.poro, 5, 40)
        self.cleanup(self.poro, 9, 5)
        self.cleanup(self.catbangen, 5, 40)
        self.cleanup(self.catbangen, 9, 5)
        user = make_user('barangay')
        User.objects.filter(pk=user.pk).update(location='Poro')

        self.assertEqual(list(self.areas(user)), ['Poro Shore'])
        self.assertEqual(set(self.areas()), {'Poro Shore', 'Catbangen River'})
        self.assertEqual(list(self.areas(barangay='Catbangen')), ['Catbangen River'])
        self.assertEqual(self.areas(make_user('ngo')), {})

    def test_filing_a_trash_report_no_longer_books_a_follow_up(self):
        boat = Boat.objects.create(name='Bot')
        for days_ago in (35, 40):
            self.cleanup(self.poro, 5, days_ago)
        req = Request.objects.create(barangay='Poro', collection_area=self.poro, status='approved', bot_id=boat)

        response = self.client.post(f'/api/requests/{req.request_id}/submit_trash_report/', {
            'site_type': 'shoreline', 'people_count': 8, 'hours_spent': 4,
            'bags': 90, 'weight_kg': 300, 'non_usable_kg': 100, 'recyclable_kg': 200,
            'trash_items': {'Beverage bottles (plastic)': 90},
        }, format='json', **session_header(self.admin))

        self.assertEqual(response.status_code, 200)
        self.assertFalse(DeploymentSchedule.objects.exists())
        self.assertTrue(self.areas()['Poro Shore']['is_priority'])


class HotspotHistoryTests(TestCase):
    """A hotspot is a priority area; the history lists each month's, as they stood at its end."""

    NOW = datetime(2026, 11, 20, 12, 0, tzinfo=priority.APP_TIMEZONE)

    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('admin')
        self.poro = CollectionArea.objects.create(name='Poro Shore', barangay='Poro', status='approved',
                                                  points=[[1, 1], [1, 2], [2, 2]])
        self.catbangen = CollectionArea.objects.create(name='Catbangen River', barangay='Catbangen', status='approved',
                                                       points=[[0, 0]] * 3)

    def cleanup(self, area, bags, when):
        req = Request.objects.create(barangay=area.barangay, collection_area=area, bags=bags, status='completed')
        Request.objects.filter(pk=req.pk).update(session_completed_at=when)

    def test_each_month_lists_the_areas_that_were_hotspots_at_its_end(self):
        # September: 5 bags a cleanup. October: 12, a spike, so Poro was a hotspot at the end of October.
        self.cleanup(self.poro, 5, datetime(2026, 9, 10, tzinfo=priority.APP_TIMEZONE))
        self.cleanup(self.poro, 12, datetime(2026, 10, 20, tzinfo=priority.APP_TIMEZONE))
        # November so far: back down to 4.
        self.cleanup(self.poro, 4, datetime(2026, 11, 15, tzinfo=priority.APP_TIMEZONE))

        history = priority.hotspot_history(months=3, now=self.NOW)

        self.assertEqual([(m['month'], m['count'], m['so_far']) for m in history],
                         [('2026-09', 0, False), ('2026-10', 1, False), ('2026-11', 0, True)])
        october = history[1]['hotspots'][0]
        self.assertEqual(october['collection_area']['name'], 'Poro Shore')
        self.assertEqual(october['collection_area']['points'], [[1, 1], [1, 2], [2, 2]])
        self.assertEqual((october['previous']['average'], october['current']['average']), (5.0, 12.0))

    def test_a_barangay_only_gets_its_own_hotspots(self):
        now = timezone.now()
        for area in (self.poro, self.catbangen):
            self.cleanup(area, 3, now - timedelta(days=40))
            self.cleanup(area, 9, now - timedelta(days=5))
        barangay = make_user('barangay')
        User.objects.filter(pk=barangay.pk).update(location='Poro')

        mine = self.client.get('/api/hotspots/', {'months': 1}, **session_header(barangay)).json()
        everyone = self.client.get('/api/hotspots/', {'months': 1}, **session_header(self.admin)).json()

        self.assertEqual([h['collection_area']['name'] for h in mine['months'][0]['hotspots']], ['Poro Shore'])
        self.assertEqual(everyone['months'][0]['count'], 2)
        self.assertEqual(mine['window_days'], 30)

    def test_months_are_limited_and_checked(self):
        many = self.client.get('/api/hotspots/', {'months': 99}, **session_header(self.admin))
        bad = self.client.get('/api/hotspots/', {'months': 'lots'}, **session_header(self.admin))
        with override_settings(API_AUTH_ENFORCED=True):
            city_admin = self.client.get('/api/hotspots/', **session_header(make_user('mayorsoffice')))

        self.assertEqual(len(many.json()['months']), priority.MAX_HISTORY_MONTHS)
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(city_admin.status_code, 403)


class SampleDataRefreshTests(TestCase):
    """The local sample data is moved forward to today; nothing else is."""

    def setUp(self):
        from . import sample_data
        self.sample_data = sample_data
        self.made = timezone.now() - timedelta(days=10)
        anchor = User.objects.create(name='Sample CENRO Admin', email=sample_data.ANCHOR_EMAIL, role='admin')
        User.objects.filter(pk=anchor.pk).update(date_created=self.made)
        self.boat = Boat.objects.create(name=f'{sample_data.BOAT_PREFIX}-A')
        self.sample = Request.objects.create(notes=f'{sample_data.MARKER} test', status='approved',
                                             preferred_date='2026-11-20', drive_started_at=self.made)
        Request.objects.filter(pk=self.sample.pk).update(date_submitted=self.made)
        StatusHistory.objects.create(request=self.sample, label='Approved by Admin', date=self.made)
        self.own = Request.objects.create(notes='A real request', status='approved', preferred_date='2026-11-20')
        Request.objects.filter(pk=self.own.pk).update(date_submitted=self.made)

    def test_moves_only_the_sample_data_forward_by_its_age(self):
        own_bot = Boat.objects.create(name='Real bot')
        manual = DeploymentSchedule.objects.create(bot=None, day='2026-11-20', request_id=self.sample.request_id,
                                                   cleanup_type='unsupported')
        troid = DeploymentSchedule.objects.create(bot=self.boat, day='2026-11-21', request_id=self.sample.request_id)
        theirs = DeploymentSchedule.objects.create(bot=own_bot, day='2026-11-22', request_id=self.own.request_id)

        self.assertEqual(self.sample_data.refresh_sample_dates(), 10)

        sample, own = Request.objects.get(pk=self.sample.pk), Request.objects.get(pk=self.own.pk)
        self.assertEqual(sample.preferred_date, '2026-11-30')
        self.assertAlmostEqual((sample.date_submitted - self.made).total_seconds(), 10 * 86400, delta=1)
        self.assertAlmostEqual((sample.drive_started_at - self.made).total_seconds(), 10 * 86400, delta=1)
        self.assertAlmostEqual((StatusHistory.objects.get(request=sample).date - self.made).total_seconds(), 10 * 86400, delta=1)
        self.assertEqual((own.preferred_date, own.date_submitted), ('2026-11-20', self.made))
        days = dict(DeploymentSchedule.objects.values_list('pk', 'day'))
        self.assertEqual((days[manual.pk], days[troid.pk], days[theirs.pk]), ('2026-11-30', '2026-12-01', '2026-11-22'))
        # Now dated today, so there is nothing more to move.
        self.assertEqual(self.sample_data.refresh_sample_dates(), 0)

    def test_leaves_a_sample_booking_where_it_is_when_that_day_is_taken(self):
        # A sample cleanup someone booked on a real robot, which already has that later day taken.
        own_bot = Boat.objects.create(name='Real bot')
        DeploymentSchedule.objects.create(bot=own_bot, day='2026-11-30', request_id=self.own.request_id)
        stuck = DeploymentSchedule.objects.create(bot=own_bot, day='2026-11-20', request_id=self.sample.request_id)

        self.sample_data.refresh_sample_dates()

        self.assertEqual(DeploymentSchedule.objects.get(pk=stuck.pk).day, '2026-11-20')

    def test_does_nothing_without_sample_data(self):
        User.objects.filter(email=self.sample_data.ANCHOR_EMAIL).delete()
        self.assertEqual(self.sample_data.refresh_sample_dates(), 0)


class LiveVersionTests(TestCase):
    """Open pages notice changes without a reload: each change moves its topic's number on."""

    def setUp(self):
        self.client = APIClient()
        self.barangay = make_user('barangay')
        self.sent = []
        patcher = patch('troid_api.realtime._start', side_effect=lambda event, payload: self.sent.append((event, payload)))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.committed()

    def committed(self):
        # A real commit runs and forgets its callbacks; the test's own transaction never commits,
        # so forget the waiting ones, as a commit would.
        from django.db import transaction
        transaction.get_connection().run_on_commit.clear()

    def versions(self, user=None):
        response = self.client.get('/api/live/', **session_header(user or self.barangay))
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_a_change_moves_its_topic_once_per_transaction(self):
        before = self.versions()['versions']
        with self.captureOnCommitCallbacks(execute=True):
            req = Request.objects.create(request_id='REQ-LIVE', barangay='Poro')
            req.status = 'approved'
            req.save()
            StatusHistory.objects.create(request=req, label='Approved', date=timezone.now(), actor='CENRO', role='admin')
        after = self.versions()['versions']

        self.assertEqual(after['requests'], before['requests'] + 1)
        self.assertEqual(after['areas'], before['areas'])
        self.assertEqual(self.sent, [('data.changed', {'topics': ['requests']})])

    def test_deleting_moves_the_topic_too(self):
        area = CollectionArea.objects.create(name='Shore', barangay='Poro', points=[[0, 0]] * 3)
        self.committed()
        before = self.versions()['versions']['areas']
        with self.captureOnCommitCallbacks(execute=True):
            area.delete()
        self.assertEqual(self.versions()['versions']['areas'], before + 1)

    def test_a_rolled_back_change_moves_nothing(self):
        from django.db import transaction
        with self.captureOnCommitCallbacks(execute=True):
            try:
                with transaction.atomic():
                    CollectionArea.objects.create(name='Gone', barangay='Poro', points=[[0, 0]] * 3)
                    raise RuntimeError
            except RuntimeError:
                pass
            Request.objects.create(request_id='REQ-KEPT')
        self.assertEqual(self.sent, [('data.changed', {'topics': ['requests']})])

    def test_quiet_changes_move_nothing(self):
        boat = Boat.objects.create(name='Robot', device_key='b' * 64)
        with self.captureOnCommitCallbacks(execute=True):
            with live.quiet():
                boat.battery_level = 50
                boat.save()
        self.assertEqual(self.sent, [])

    def test_each_user_sees_only_their_own_unread_notifications(self):
        other = make_user('ngo')
        Notification.objects.create(recipient=self.barangay, title='One', message='m')
        newest = Notification.objects.create(recipient=self.barangay, title='Two', message='m')
        Notification.objects.create(recipient=self.barangay, title='Read', message='m', is_read=True)
        Notification.objects.create(recipient=other, title='Theirs', message='m')

        self.assertEqual(self.versions()['notifications'], {'unread': 2, 'latest': newest.pk})
        self.assertEqual(self.versions(other)['notifications']['unread'], 1)
