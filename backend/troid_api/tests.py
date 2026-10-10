from unittest.mock import Mock, patch

import requests
from django.contrib.auth.hashers import check_password
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import AuditLog, CollectionArea, Notification, Request, User


def make_user(role, status='active', token=None):
    return User.objects.create(
        name=f'{role.title()} User',
        email=f'{role}-{status}@example.com',
        password='Test-password1',
        role=role,
        status=status,
        session_token=token or f'{role}-{status}-session',
    )


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
