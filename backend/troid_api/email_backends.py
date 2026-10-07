"""Email backend that sends through Brevo's HTTPS API.

Render's free plan blocks outbound SMTP ports (25/465/587), so Gmail SMTP
can't be used there. This backend lets the existing send_mail() calls work
unchanged by posting each message to Brevo over HTTPS instead.

Enable with:
    EMAIL_BACKEND=troid_api.email_backends.BrevoEmailBackend
    BREVO_API_KEY=<key from Brevo -> SMTP & API -> API Keys>
DEFAULT_FROM_EMAIL must be a sender verified in Brevo.
"""
from email.utils import parseaddr

import requests
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email'


class BrevoEmailBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        api_key = getattr(settings, 'BREVO_API_KEY', '')
        if not api_key:
            if not self.fail_silently:
                raise ValueError('BREVO_API_KEY is not set.')
            return 0

        sent = 0
        for message in email_messages:
            from_name, from_email = parseaddr(message.from_email or settings.DEFAULT_FROM_EMAIL)
            payload = {
                'sender': {'name': from_name or from_email, 'email': from_email},
                'to': [{'email': addr} for addr in message.to],
                'subject': message.subject,
                'textContent': message.body,
            }
            if message.cc:
                payload['cc'] = [{'email': addr} for addr in message.cc]
            if message.bcc:
                payload['bcc'] = [{'email': addr} for addr in message.bcc]
            for content, mimetype in getattr(message, 'alternatives', []):
                if mimetype == 'text/html':
                    payload['htmlContent'] = content

            try:
                resp = requests.post(
                    BREVO_SEND_URL,
                    json=payload,
                    headers={'api-key': api_key, 'accept': 'application/json'},
                    timeout=15,
                )
                if resp.status_code >= 400:
                    raise RuntimeError(f'Brevo API {resp.status_code}: {resp.text}')
                sent += 1
            except Exception:
                if not self.fail_silently:
                    raise
        return sent
