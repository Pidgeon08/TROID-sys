import logging

from django.conf import settings
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission

logger = logging.getLogger(__name__)

ADMIN = ('admin',)
MAYOR = ('mayorsoffice',)
REQUESTERS = ('barangay', 'ngo')
# Everyone who uses the website. Operators can sign in (the mobile app may
# use this API later) but have no staff permissions.
STAFF = ('admin', 'mayorsoffice', 'barangay', 'ngo')
ANY_ROLE = STAFF + ('operator',)
PUBLIC = None


def _would_deny(request, reason, always_enforce=False):
    """Returns True if the request must be refused. While API_AUTH_ENFORCED is
    off, the refusal is only logged so the rollout can surface gaps first."""
    if always_enforce or settings.API_AUTH_ENFORCED:
        return True
    logger.warning(
        '[auth] would deny %s %s user=%s role=%s reason=%s',
        request.method, request.path,
        getattr(request.user, 'pk', None) or '-', getattr(request.user, 'role', '-'), reason,
    )
    return False


def require(request, allowed, reason):
    """Object-level check for views (e.g. "own account only")."""
    if not allowed and _would_deny(request, reason):
        raise PermissionDenied()


class RolePermission(BasePermission):
    """Allows the signed-in user if their role is one the view permits.

    Function views get roles from `HasRole(...)`. Viewsets declare
    `read_roles`, `write_roles` and per-action `action_roles` (see
    RoleViewSetMixin). PUBLIC (None) allows anyone, signed in or not.
    """

    roles = STAFF
    always_enforce = False
    not_authenticated_message = 'A valid session is required.'
    message = 'You do not have permission to perform this action.'

    def get_roles(self, request, view):
        if hasattr(view, 'get_required_roles'):
            return view.get_required_roles()
        return self.roles

    def has_permission(self, request, view):
        roles = self.get_roles(request, view)
        if roles is PUBLIC:
            return True
        user = request.user
        if not getattr(user, 'is_authenticated', False):
            if _would_deny(request, 'not signed in', self.always_enforce):
                raise NotAuthenticated(self.not_authenticated_message)
            return True
        if user.role in roles:
            return True
        return not _would_deny(request, f'role not in {roles}', self.always_enforce)


def HasRole(*roles, always_enforce=False, not_authenticated_message=None, message=None):
    attrs = {'roles': roles, 'always_enforce': always_enforce}
    if not_authenticated_message:
        attrs['not_authenticated_message'] = not_authenticated_message
    if message:
        attrs['message'] = message
    return type('HasRole', (RolePermission,), attrs)


class RoleViewSetMixin:
    read_roles = STAFF
    write_roles = ADMIN
    action_roles = {}

    def get_required_roles(self):
        if self.action in self.action_roles:
            return self.action_roles[self.action]
        if self.request.method in SAFE_METHODS:
            return self.read_roles
        return self.write_roles
