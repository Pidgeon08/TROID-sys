"""Email backend that sends through the Gmail API over HTTPS.

Render's free plan blocks outbound SMTP ports (25/465/587), so Gmail SMTP
can't be used there. This backend lets the existing send_mail() calls work
unchanged by sending each message through the Gmail API instead.

Enable with:
    EMAIL_BACKEND=troid_api.email_backends.GmailApiEmailBackend
    GMAIL_CLIENT_ID=...
    GMAIL_CLIENT_SECRET=...
    GMAIL_REFRESH_TOKEN=...   (get it with: python manage.py gmail_auth)
DEFAULT_FROM_EMAIL must be the Gmail account that authorized the token.
"""
import base64
import threading
import time

import requests
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

TOKEN_URL = 'https://oauth2.googleapis.com/token'
SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

# Access tokens last ~1 hour; share one across requests instead of
# refreshing for every email.
_token_lock = threading.Lock()
_cached_token = {'value': None, 'expires_at': 0}


def _get_access_token():
    with _token_lock:
        if _cached_token['value'] and time.time() < _cached_token['expires_at'] - 60:
            return _cached_token['value']
        resp = requests.post(TOKEN_URL, data={
            'client_id': settings.GMAIL_CLIENT_ID,
            'client_secret': settings.GMAIL_CLIENT_SECRET,
            'refresh_token': settings.GMAIL_REFRESH_TOKEN,
            'grant_type': 'refresh_token',
        }, timeout=15)
        if resp.status_code >= 400:
            raise RuntimeError(f'Gmail token refresh failed {resp.status_code}: {resp.text}')
        data = resp.json()
        _cached_token['value'] = data['access_token']
        _cached_token['expires_at'] = time.time() + data.get('expires_in', 3600)
        return _cached_token['value']


class GmailApiEmailBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        if not (settings.GMAIL_CLIENT_ID and settings.GMAIL_CLIENT_SECRET and settings.GMAIL_REFRESH_TOKEN):
            if not self.fail_silently:
                raise ValueError('GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN must be set.')
            return 0

        sent = 0
        for message in email_messages:
            try:
                raw = base64.urlsafe_b64encode(message.message().as_bytes()).decode()
                resp = requests.post(
                    SEND_URL,
                    json={'raw': raw},
                    headers={'Authorization': f'Bearer {_get_access_token()}'},
                    timeout=15,
                )
                if resp.status_code >= 400:
                    raise RuntimeError(f'Gmail API {resp.status_code}: {resp.text}')
                sent += 1
            except Exception:
                if not self.fail_silently:
                    raise
        return sent
