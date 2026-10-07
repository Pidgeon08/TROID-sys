"""Email backend that sends through the Cloudflare Worker's /send-email route.

Render's free plan blocks outbound SMTP ports (25/465/587), so Django can't
talk to Gmail directly there. The realtime Worker (cloudflare-ws/) can, so
this backend posts each fully built message to it over HTTPS and the Worker
relays it to Gmail. Existing send_mail() calls work unchanged.

Enable with:
    EMAIL_BACKEND=troid_api.email_backends.WorkerEmailBackend
It reuses REALTIME_WORKER_URL / REALTIME_WORKER_SECRET. The Gmail address and
app password live on the Worker as the SMTP_USER / SMTP_PASS secrets.
"""
import base64
from email.utils import parseaddr

import requests
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend


class WorkerEmailBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        url = f"{settings.REALTIME_WORKER_URL.rstrip('/')}/send-email"
        sent = 0
        for message in email_messages:
            recipients = message.recipients()
            if not recipients:
                continue
            try:
                resp = requests.post(
                    url,
                    json={
                        'from': parseaddr(message.from_email or settings.DEFAULT_FROM_EMAIL)[1],
                        'to': recipients,
                        'raw': base64.b64encode(message.message().as_bytes()).decode(),
                    },
                    headers={'Authorization': f'Bearer {settings.REALTIME_WORKER_SECRET}'},
                    timeout=30,
                )
                if resp.status_code >= 400:
                    raise RuntimeError(f'Email relay {resp.status_code}: {resp.text}')
                sent += 1
            except Exception:
                if not self.fail_silently:
                    raise
        return sent
