import logging
import secrets

from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import User

logger = logging.getLogger(__name__)

# Accounts in these states may not use the API once API_AUTH_ENFORCED is on.
INACTIVE_STATUSES = ('archived', 'pending')


class SessionTokenAuthentication(BaseAuthentication):
    """Authenticates `Authorization: Session <user_id>:<session_token>`, the
    token `login` issues (one active session per account).

    While API_AUTH_ENFORCED is off (the rollout's report-only phase), a bad or
    stale header is logged and the request continues as anonymous, and inactive
    accounts are logged but still authenticated, so nothing changes for users.
    """

    keyword = 'Session'

    def authenticate(self, request):
        header = request.headers.get('Authorization', '')
        scheme, _, credentials = header.partition(' ')
        if scheme != self.keyword:
            return None

        user_id, separator, token = credentials.partition(':')
        if not separator or not user_id.isdecimal() or not token:
            return self._reject(request, 'Malformed session header.')

        user = User.objects.filter(pk=user_id).first()
        if not user or not secrets.compare_digest(
            (user.session_token or '').encode(), token.encode()
        ):
            return self._reject(request, 'Your session has ended. Please sign in again.')

        if user.status in INACTIVE_STATUSES:
            if settings.API_AUTH_ENFORCED:
                raise AuthenticationFailed('This account is not active.')
            logger.warning(
                '[auth] would deny %s %s user=%s reason=account %s',
                request.method, request.path, user.pk, user.status,
            )
        return (user, token)

    def authenticate_header(self, request):
        # Makes DRF answer 401 (not 403) when credentials are missing or bad.
        return self.keyword

    def _reject(self, request, message):
        if settings.API_AUTH_ENFORCED:
            raise AuthenticationFailed(message)
        logger.warning(
            '[auth] would deny %s %s reason=%s', request.method, request.path, message,
        )
        return None
