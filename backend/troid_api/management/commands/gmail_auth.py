"""One-time helper to get a Gmail API refresh token for GmailApiEmailBackend.

Usage:
    python manage.py gmail_auth --client-id ID --client-secret SECRET

Opens a Google sign-in page; sign in as the account that should send the
emails. The refresh token is printed at the end — put it in GMAIL_REFRESH_TOKEN.
"""
import secrets
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

import requests
from django.core.management.base import BaseCommand, CommandError

AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
TOKEN_URL = 'https://oauth2.googleapis.com/token'
SCOPE = 'https://www.googleapis.com/auth/gmail.send'
PORT = 8765
REDIRECT_URI = f'http://localhost:{PORT}/'


class Command(BaseCommand):
    help = 'Authorize a Gmail account and print a refresh token for sending email'

    def add_arguments(self, parser):
        parser.add_argument('--client-id', required=True)
        parser.add_argument('--client-secret', required=True)

    def handle(self, *args, **options):
        state = secrets.token_urlsafe(16)
        url = AUTH_URL + '?' + urlencode({
            'client_id': options['client_id'],
            'redirect_uri': REDIRECT_URI,
            'response_type': 'code',
            'scope': SCOPE,
            'access_type': 'offline',
            'prompt': 'consent',
            'state': state,
        })

        result = {}

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                params = parse_qs(urlparse(self.path).query)
                result['code'] = params.get('code', [None])[0]
                result['state'] = params.get('state', [None])[0]
                result['error'] = params.get('error', [None])[0]
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write(b'Done. You can close this tab and go back to the terminal.')

            def log_message(self, *args):
                pass

        self.stdout.write('Opening your browser. If it does not open, visit this URL:\n')
        self.stdout.write(url + '\n')
        webbrowser.open(url)

        server = HTTPServer(('localhost', PORT), Handler)
        # Keep serving until Google's redirect arrives (ignores stray requests
        # such as /favicon.ico).
        while not (result.get('code') or result.get('error')):
            server.handle_request()
        server.server_close()

        if result['error']:
            raise CommandError(f'Google returned an error: {result["error"]}')
        if result['state'] != state or not result['code']:
            raise CommandError('Authorization failed (missing code or state mismatch). Try again.')

        resp = requests.post(TOKEN_URL, data={
            'code': result['code'],
            'client_id': options['client_id'],
            'client_secret': options['client_secret'],
            'redirect_uri': REDIRECT_URI,
            'grant_type': 'authorization_code',
        }, timeout=15)
        if resp.status_code >= 400:
            raise CommandError(f'Token exchange failed {resp.status_code}: {resp.text}')
        refresh_token = resp.json().get('refresh_token')
        if not refresh_token:
            raise CommandError('Google did not return a refresh token. Remove the app at '
                               'https://myaccount.google.com/permissions and run this again.')

        self.stdout.write(self.style.SUCCESS('\nGMAIL_REFRESH_TOKEN=' + refresh_token))
