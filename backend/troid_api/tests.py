import importlib.util
import json
import os
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import requests
from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from . import bot_auth, mqtt_client
from .models import AuditLog, Boat, CollectionArea, DetectionEvent, Notification, Operator, Request, User


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
        self.area = CollectionArea.objects.create(name='Test Area')

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
        self.assert_roles('post', f'/api/requests/{rid}/mark_session_completed/', REQUESTER_ROLES)
        self.assert_roles('post', f'/api/requests/{rid}/submit_trash_report/', REQUESTER_ROLES, {})
        self.assert_roles('get', f'/api/requests/{rid}/bot_detections/', ('admin',))
        self.assert_roles('post', f'/api/requests/{rid}/submit_verification/', ('admin',), {})
        self.assert_roles('get', '/api/requests/post-cleanup-comparison/', ('admin',))
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
        for path in ('/api/priority-areas/', '/api/landfill-records/', '/api/recycling-records/',
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
