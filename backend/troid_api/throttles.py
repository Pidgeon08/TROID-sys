import hashlib

from rest_framework.throttling import SimpleRateThrottle


class CompanionLoginEmailThrottle(SimpleRateThrottle):
    """Limits password guesses against one account, whatever the caller's IP
    (behind Render's proxy many callers can share one address)."""

    scope = 'companion_login_email'

    def get_cache_key(self, request, view):
        email = str(request.data.get('email') or '').strip().lower()
        if not email:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': hashlib.sha256(email.encode()).hexdigest()}


class CompanionLoginIPThrottle(SimpleRateThrottle):
    """Limits one caller guessing across many accounts."""

    scope = 'companion_login_ip'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}
