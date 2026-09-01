import re
import secrets
import string
from datetime import timedelta
from zoneinfo import ZoneInfo

from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from django.contrib.auth.hashers import check_password
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone

try:
    from rest_framework.routers import DefaultRouter
except ImportError:
    from rest_framework.routers import DefaultRouter

from .models import (
    Boat, DetectionEvent, User, Operator, Request, DeploymentSchedule, PriorityArea,
    LandfillRecord, RecyclingRecord, SegregationRecord,
    AuditLog, HeatmapData, Photo, StatusHistory, CollectionArea, Notification
)
from .serializers import (
    BoatSerializer, UserSerializer, OperatorSerializer, RequestSerializer,
    DeploymentScheduleSerializer, LandfillRecordSerializer, RecyclingRecordSerializer,
    SegregationRecordSerializer, AuditLogSerializer, HeatmapDataSerializer, LoginSerializer,
    CollectionAreaSerializer, NotificationSerializer, PriorityAreaSerializer
)
from .priority import check_and_schedule_priority_followup

SPECIAL_CHARS = '!@#$%^&*()-_=+?'

# DeploymentSchedule.day is a local calendar date chosen in the browser (San Fernando, La Union,
# Philippines); TIME_ZONE is UTC, so comparisons against it must be converted to local time first.
APP_TIMEZONE = ZoneInfo('Asia/Manila')


def generate_temp_password(length=12):
    all_chars = string.ascii_lowercase + string.ascii_uppercase + string.digits + SPECIAL_CHARS
    while True:
        pwd = ''.join(secrets.choice(all_chars) for _ in range(length))
        if (
            any(c.islower() for c in pwd)
            and any(c.isupper() for c in pwd)
            and any(c.isdigit() for c in pwd)
            and any(c in SPECIAL_CHARS for c in pwd)
        ):
            return pwd


def validate_password_strength(password):
    errors = []
    if len(password) < 8:
        errors.append('Password must be at least 8 characters long.')
    if not any(c.islower() for c in password):
        errors.append('Password must include a lowercase letter.')
    if not any(c.isupper() for c in password):
        errors.append('Password must include an uppercase letter.')
    if not re.search(r'[^A-Za-z0-9]', password):
        errors.append('Password must include a special character.')
    return errors


def send_temp_password_email(user, temp_password):
    """Returns True if the email backend accepted/sent the message, False if it failed.
    Errors are caught (not fail_silently) so we can report the real outcome to the caller
    instead of always claiming success."""
    subject = 'Your CENRO TROID account'
    message = (
        f'Hi {user.name},\n\n'
        f'An account has been created for you on the CENRO TROID Aquatic Management System.\n\n'
        f'Email: {user.email}\n'
        f'Temporary password: {temp_password}\n\n'
        f'For security, you will be asked to set a new password the first time you sign in.\n'
    )
    try:
        sent = send_mail(
            subject,
            message,
            getattr(settings, 'DEFAULT_FROM_EMAIL', None),
            [user.email],
            fail_silently=False,
        )
        return sent > 0
    except Exception as exc:
        print(f'[email] Failed to send temp password email to {user.email}: {exc}')
        return False


def notify_request_update(req, notif_type, title, message):
    """Creates an in-app Notification for the requester (matched by email) and
    emails them, mirroring send_temp_password_email's best-effort error handling."""
    recipient = User.objects.filter(email=req.email).first() if req.email else None
    if recipient:
        Notification.objects.create(
            recipient=recipient,
            request=req,
            notif_type=notif_type,
            title=title,
            message=message,
        )
    if req.email:
        try:
            send_mail(
                title,
                message,
                getattr(settings, 'DEFAULT_FROM_EMAIL', None),
                [req.email],
                fail_silently=False,
            )
        except Exception as exc:
            print(f'[email] Failed to send {notif_type} notification to {req.email}: {exc}')


@api_view(['POST'])
def login(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data['email']
    password = serializer.validated_data['password']
    try:
        user = User.objects.get(email=email)
        if not check_password(password, user.password):
            return Response({"error": "Invalid email or password"}, status=status.HTTP_401_UNAUTHORIZED)
        # Only one active session per account: each login mints a new token,
        # invalidating whatever session was previously active for this user.
        session_token = secrets.token_hex(16)
        user.session_token = session_token
        user.save(update_fields=['session_token'])
        return Response({
            "id": user.id,
            "user_id": user.user_id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "status": user.status,
            "location": user.location,
            "must_change_password": user.must_change_password,
            "session_token": session_token,
        })
    except User.DoesNotExist:
        return Response({"error": "Invalid email or password"}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['POST'])
def forgot_password(request):
    email = (request.data.get('email') or '').strip()
    generic_response = Response({
        'message': "If an account exists with that email, a temporary password has been sent to it."
    })
    if not email:
        return Response({'error': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        # Don't reveal whether the email exists.
        return generic_response

    temp_password = generate_temp_password()
    user.password = temp_password
    user.must_change_password = True
    user.save()
    send_temp_password_email(user, temp_password)
    return generic_response


@api_view(['POST'])
def log_detection(request):
    boat_id = request.data.get('boat_id')
    lat = request.data.get('latitude')
    lng = request.data.get('longitude')
    count = request.data.get('trash_count', 1)
    categories = request.data.get('categories', {})
    confidence = request.data.get('confidence', 0.0)
    is_verified = request.data.get('is_verified', False)

    if boat_id is None or lat is None or lng is None:
        return Response({"error": "Missing required fields"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        boat = Boat.objects.get(id=boat_id)
        boat.last_latitude = lat
        boat.last_longitude = lng
        boat.save()

        linked_request = None
        today = timezone.now().astimezone(APP_TIMEZONE).strftime('%Y-%m-%d')
        active_schedule = DeploymentSchedule.objects.filter(bot=boat, day=today).order_by('-id').first()
        if active_schedule and active_schedule.request_id:
            linked_request = Request.objects.filter(request_id=active_schedule.request_id).first()

        DetectionEvent.objects.create(
            boat=boat,
            request=linked_request,
            latitude=lat,
            longitude=lng,
            trash_count=count,
            categories=categories,
            confidence=confidence,
            is_verified=is_verified
        )
        return Response({"status": "Detection logged successfully"}, status=status.HTTP_201_CREATED)
    except Boat.DoesNotExist:
        return Response({"error": "Boat not found"}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
def get_heatmap_data(request):
    category = request.query_params.get('category')
    time_filter = request.query_params.get('time_filter', 'today')
    barangay = request.query_params.get('barangay')

    detections = DetectionEvent.objects.filter(is_verified=True)

    if barangay:
        detections = detections.filter(request__barangay__iexact=barangay)

    if category:
        detections = detections.filter(categories__has_key=category)

    if time_filter == 'today':
        from django.utils import timezone
        from datetime import timedelta
        start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        detections = detections.filter(timestamp__gte=start)
    elif time_filter == 'weekly':
        from django.utils import timezone
        from datetime import timedelta
        start = timezone.now() - timedelta(days=7)
        detections = detections.filter(timestamp__gte=start)
    elif time_filter == 'monthly':
        from django.utils import timezone
        from datetime import timedelta
        start = timezone.now() - timedelta(days=30)
        detections = detections.filter(timestamp__gte=start)

    data = []
    for d in detections:
        weight = min(d.trash_count * 0.2, 1.0)
        data.append({
            'latitude': d.latitude,
            'longitude': d.longitude,
            'weight': weight,
            'trash_count': d.trash_count,
            'categories': d.categories or {},
            'timestamp': d.timestamp,
            'boat': d.boat.name,
            'confidence': d.confidence,
        })
    return Response(data)


@api_view(['GET'])
def pending_user_count(request):
    count = User.objects.filter(status='pending').count()
    return Response({"pending_count": count})


@api_view(['GET'])
def pending_request_count(request):
    count = Request.objects.filter(status='pending').count()
    return Response({"pending_count": count})


@api_view(['GET'])
def unread_notification_count(request):
    user_id = request.query_params.get('user_id')
    count = Notification.objects.filter(recipient_id=user_id, is_read=False).count()
    return Response({"unread_count": count})


class BoatViewSet(viewsets.ModelViewSet):
    queryset = Boat.objects.all()
    serializer_class = BoatSerializer


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        temp_password = generate_temp_password()
        user = serializer.save(password=temp_password, must_change_password=True)
        email_sent = send_temp_password_email(user, temp_password)
        headers = self.get_success_headers(serializer.data)
        data = dict(serializer.data)
        data['email_sent'] = email_sent
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        user = self.get_object()
        temp_password = generate_temp_password()
        user.password = temp_password
        user.must_change_password = True
        user.save()
        email_sent = send_temp_password_email(user, temp_password)
        return Response({'status': 'password reset', 'email_sent': email_sent})

    @action(detail=True, methods=['post'], url_path='change-password')
    def change_password(self, request, pk=None):
        user = self.get_object()
        old_password = request.data.get('old_password') or ''
        new_password = request.data.get('password') or ''
        if not check_password(old_password, user.password):
            return Response({'error': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
        errors = validate_password_strength(new_password)
        if errors:
            return Response({'error': errors[0]}, status=status.HTTP_400_BAD_REQUEST)
        user.password = new_password
        user.must_change_password = False
        user.save()
        return Response({'status': 'password changed'})

    @action(detail=True, methods=['get'], url_path='session-check')
    def session_check(self, request, pk=None):
        user = self.get_object()
        token = request.query_params.get('token')
        valid = bool(token) and bool(user.session_token) and token == user.session_token
        return Response({'valid': valid})


class OperatorViewSet(viewsets.ModelViewSet):
    queryset = Operator.objects.all()
    serializer_class = OperatorSerializer

    def create(self, request, *args, **kwargs):
        email = (request.data.get('email') or '').strip()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        operator = serializer.save()

        email_sent = None
        if email:
            if User.objects.filter(email=email).exists():
                operator.delete()
                return Response({'error': f'An account with email {email} already exists.'}, status=status.HTTP_400_BAD_REQUEST)
            temp_password = generate_temp_password()
            account = User.objects.create(
                name=operator.name,
                email=email,
                role='operator',
                status='active',
                password=temp_password,
                must_change_password=True,
            )
            email_sent = send_temp_password_email(account, temp_password)
            operator.user = account
            operator.save(update_fields=['user'])

        headers = self.get_success_headers(serializer.data)
        data = self.get_serializer(operator).data
        if email:
            data = dict(data)
            data['email_sent'] = email_sent
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        operator = self.get_object()
        if operator.user:
            # An archived operator shouldn't keep mobile-app access; reactivating restores it.
            target_status = 'archived' if operator.archived else 'active'
            if operator.user.status != target_status:
                operator.user.status = target_status
                operator.user.save(update_fields=['status'])
            response.data = self.get_serializer(operator).data
        return response


class RequestViewSet(viewsets.ModelViewSet):
    queryset = Request.objects.all()
    serializer_class = RequestSerializer
    lookup_field = 'request_id'

    def get_queryset(self):
        queryset = Request.objects.all().order_by('-date_submitted')
        if self.request.query_params.get('archived') == 'true':
            return queryset.filter(archived=True)
        return queryset.filter(archived=False)

    def create(self, request, *args, **kwargs):
        photos_data = request.data.get('photos', [])
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_obj = serializer.save()
        if isinstance(photos_data, list):
            for idx, photo in enumerate(photos_data):
                Photo.objects.create(
                    request=request_obj,
                    label=photo.get('label') or '',
                    date=photo.get('date') or '',
                    photo_id=photo.get('photo_id') or (idx + 1),
                    image_data=photo.get('image_data') or '',
                )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def mayor_approve(self, request, request_id=None):
        req = self.get_object()
        if req.status != 'pending_mayor_approval':
            return Response({'error': 'Request is not pending mayor approval'}, status=status.HTTP_400_BAD_REQUEST)
        req.status = 'pending_admin_approval'
        req.save()
        StatusHistory.objects.create(
            request=req,
            label='Approved by Mayor',
            date=timezone.now(),
            actor=request.user.name if hasattr(request, 'user') and hasattr(request.user, 'name') else 'Mayor',
            role='Mayor',
            state='current'
        )
        return Response({'status': req.status})

    @action(detail=True, methods=['post'])
    def admin_approve(self, request, request_id=None):
        req = self.get_object()
        if req.status != 'pending_admin_approval':
            return Response({'error': 'Request is not pending admin approval'}, status=status.HTTP_400_BAD_REQUEST)
        req.status = 'approved'
        req.save()
        StatusHistory.objects.create(
            request=req,
            label='Approved by Admin',
            date=timezone.now(),
            actor=request.user.name if hasattr(request, 'user') and hasattr(request.user, 'name') else 'Admin',
            role='Admin',
            state='current'
        )
        notify_request_update(
            req,
            'approved',
            'Your cleanup request has been approved',
            f'Your request {req.request_id} has been approved by CENRO.',
        )
        return Response({'status': req.status})

    @action(detail=True, methods=['post'])
    def reschedule(self, request, request_id=None):
        req = self.get_object()
        if req.status not in ('pending_admin_approval', 'approved'):
            return Response({'error': 'Request is not in a state that can be rescheduled'}, status=status.HTTP_400_BAD_REQUEST)
        new_date = (request.data.get('preferred_date') or '').strip()
        new_time = (request.data.get('preferred_time') or '').strip()
        reason = (request.data.get('reason') or '').strip()
        if not new_date:
            return Response({'error': 'A new preferred date is required'}, status=status.HTTP_400_BAD_REQUEST)
        req.preferred_date = new_date
        req.preferred_time = new_time
        req.save()
        StatusHistory.objects.create(
            request=req,
            label='Rescheduled by CENRO',
            date=timezone.now(),
            actor=request.user.name if hasattr(request, 'user') and hasattr(request.user, 'name') else 'Admin',
            role='Admin',
            state='current',
            details=reason,
        )
        notify_request_update(
            req,
            'rescheduled',
            'Your cleanup request has been rescheduled',
            f'CENRO rescheduled request {req.request_id} to {new_date}{f" at {new_time}" if new_time else ""}.'
            + (f' Reason: {reason}' if reason else ''),
        )
        return Response({'status': req.status, 'preferred_date': req.preferred_date, 'preferred_time': req.preferred_time})

    @action(detail=True, methods=['post'])
    def park(self, request, request_id=None):
        req = self.get_object()
        reason = (request.data.get('reason') or '').strip()
        req.parked_from_status = req.status
        req.status = 'parked'
        req.decline_reason = reason
        req.save()
        StatusHistory.objects.create(
            request=req,
            label='Parked',
            date=timezone.now(),
            actor=request.user.name if hasattr(request, 'user') and hasattr(request.user, 'name') else 'User',
            role=request.user.role if hasattr(request, 'user') and hasattr(request.user, 'role') else 'Unknown',
            state='current',
            details=reason,
        )
        return Response({'status': req.status, 'decline_reason': req.decline_reason})

    @action(detail=True, methods=['post'])
    def unpark(self, request, request_id=None):
        req = self.get_object()
        if req.status != 'parked':
            return Response({'error': 'Request is not parked'}, status=status.HTTP_400_BAD_REQUEST)
        req.status = req.parked_from_status or 'pending_mayor_approval'
        req.parked_from_status = ''
        req.decline_reason = ''
        req.save()
        StatusHistory.objects.create(
            request=req,
            label='Unparked',
            date=timezone.now(),
            actor=request.user.name if hasattr(request, 'user') and hasattr(request.user, 'name') else 'User',
            role=request.user.role if hasattr(request, 'user') and hasattr(request.user, 'role') else 'Unknown',
            state='current',
            details='Returned to review',
        )
        return Response({'status': req.status})

    @action(detail=True, methods=['post'])
    def mark_session_completed(self, request, request_id=None):
        req = self.get_object()
        if req.status != 'approved':
            return Response({'error': 'Request is not approved'}, status=status.HTTP_400_BAD_REQUEST)
        req.status = 'processing'
        req.session_completed_at = timezone.now()
        req.save()
        StatusHistory.objects.create(
            request=req,
            label='Session Completed by CENRO',
            date=timezone.now(),
            actor=request.user.name if hasattr(request, 'user') and hasattr(request.user, 'name') else 'Admin',
            role='Admin',
            state='current',
        )
        return Response({'status': req.status, 'session_completed_at': req.session_completed_at})

    @action(detail=True, methods=['post'])
    def submit_trash_report(self, request, request_id=None):
        req = self.get_object()
        if req.status != 'processing':
            return Response({'error': 'Request is not awaiting a trash report'}, status=status.HTTP_400_BAD_REQUEST)
        req.bags = request.data.get('bags')
        req.weight_kg = request.data.get('weight_kg')
        req.non_usable_kg = request.data.get('non_usable_kg')
        req.recyclable_kg = request.data.get('recyclable_kg')
        req.trash_categories = request.data.get('trash_categories') or {}
        notes = (request.data.get('notes') or '').strip()

        schedule = DeploymentSchedule.objects.filter(request_id=req.request_id).order_by('-id').first()
        cleanup_type = schedule.cleanup_type if schedule else 'unsupported'

        req.status = 'pending_verification' if cleanup_type == 'troid_supported' else 'completed'
        req.save()
        StatusHistory.objects.create(
            request=req,
            label='Trash Report Filed by CENRO',
            date=timezone.now(),
            actor=request.user.name if hasattr(request, 'user') and hasattr(request.user, 'name') else 'Admin',
            role='Admin',
            state='current',
            details=notes,
        )
        check_and_schedule_priority_followup(req.barangay)
        if req.status == 'completed':
            notify_request_update(
                req,
                'report_filed',
                'Your cleanup request has been completed',
                f'CENRO has filed the trash collection report for request {req.request_id}.',
            )
        return Response({'status': req.status})

    @action(detail=True, methods=['get'])
    def bot_detections(self, request, request_id=None):
        req = self.get_object()
        if req.status != 'pending_verification':
            return Response({'error': 'Request is not pending verification'}, status=status.HTTP_400_BAD_REQUEST)
        # No live bot-detection feed is wired up yet, so for TROID-supported cleanups the
        # trash collection report CENRO files in is treated as the bot's detected output —
        # CENRO then reviews/corrects it in the verification step below.
        return Response({'categories': req.trash_categories or {}})

    @action(detail=False, methods=['get'], url_path='post-cleanup-comparison')
    def post_cleanup_comparison(self, request):
        """For each finished cleanup drive, compare TROID's detected trash against what
        CENRO actually confirmed. Until a live bot-detection feed exists, TROID-supported
        cleanups treat the manually filed trash collection report as the bot's detected
        output, and the CENRO-verified categories (once verified) as the confirmed count.
        Unsupported cleanups have no bot involved, so the report is just the user's count."""
        reqs = Request.objects.filter(
            archived=False, status__in=['completed', 'segregated', 'pending_verification', 'verified']
        ).exclude(trash_categories={}).select_related('collection_area')

        schedules_by_request = {
            s.request_id: s.cleanup_type
            for s in DeploymentSchedule.objects.filter(request_id__in=[r.request_id for r in reqs])
        }

        results = []
        for req in reqs:
            cleanup_type = schedules_by_request.get(req.request_id, 'unsupported')

            if cleanup_type == 'troid_supported':
                troid_categories = req.trash_categories or {}
                user_categories = req.verified_categories or {}
            else:
                troid_categories = {}
                user_categories = req.trash_categories or {}

            latitude = longitude = None
            if req.bot_id and req.bot_id.last_latitude and req.bot_id.last_longitude:
                latitude = req.bot_id.last_latitude
                longitude = req.bot_id.last_longitude

            collection_area = None
            if req.collection_area:
                collection_area = {
                    'id': req.collection_area.id,
                    'area_id': req.collection_area.area_id,
                    'name': req.collection_area.name,
                    'points': req.collection_area.points,
                    'closed': req.collection_area.closed,
                    'color': req.collection_area.color,
                }

            results.append({
                'request_id': req.request_id,
                'barangay': req.barangay or req.location_name,
                'status': req.status,
                'date_submitted': req.date_submitted,
                'latitude': latitude,
                'longitude': longitude,
                'troid_categories': troid_categories,
                'troid_total': sum(troid_categories.values()),
                'user_categories': user_categories,
                'user_total': sum(user_categories.values()),
                'bags': req.bags,
                'weight_kg': req.weight_kg,
                'collection_area': collection_area,
            })
        return Response(results)

    @action(detail=True, methods=['post'])
    def submit_verification(self, request, request_id=None):
        req = self.get_object()
        if req.status != 'pending_verification':
            return Response({'error': 'Request is not pending verification'}, status=status.HTTP_400_BAD_REQUEST)
        req.verified_categories = request.data.get('verified_categories') or {}
        req.verification_notes = (request.data.get('verification_notes') or '').strip()
        req.verified_at = timezone.now()
        req.status = 'verified'
        req.save()
        req.detection_events.update(is_verified=True)
        StatusHistory.objects.create(
            request=req,
            label='Detection Verified by CENRO',
            date=timezone.now(),
            actor=request.user.name if hasattr(request, 'user') and hasattr(request.user, 'name') else 'Admin',
            role='Admin',
            state='current',
            details=req.verification_notes,
        )
        notify_request_update(
            req,
            'verified',
            'Your cleanup request record is finalized',
            f'CENRO has verified the bot detection accuracy for request {req.request_id}. The cleanup record is now complete.',
        )
        return Response({'status': req.status})

    def destroy(self, request, *args, **kwargs):
        req = self.get_object()
        DeploymentSchedule.objects.filter(request_id=req.request_id).delete()
        req.archived = True
        req.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def restore(self, request, request_id=None):
        req = Request.objects.get(request_id=request_id)
        req.archived = False
        req.save()
        return Response({'status': req.status, 'archived': req.archived})


class NotificationViewSet(viewsets.ModelViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer

    def get_queryset(self):
        queryset = Notification.objects.all()
        user_id = self.request.query_params.get('user_id')
        if user_id:
            queryset = queryset.filter(recipient_id=user_id)
        return queryset

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notif = self.get_object()
        notif.is_read = True
        notif.save()
        return Response({'is_read': True})

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        user_id = request.data.get('user_id')
        Notification.objects.filter(recipient_id=user_id, is_read=False).update(is_read=True)
        return Response({'status': 'ok'})


class CollectionAreaViewSet(viewsets.ModelViewSet):
    queryset = CollectionArea.objects.all()
    serializer_class = CollectionAreaSerializer
    lookup_field = 'area_id'

    def get_queryset(self):
        queryset = CollectionArea.objects.all().order_by('-date_submitted')
        if self.request.query_params.get('archived') == 'true':
            queryset = queryset.filter(archived=True)
        else:
            queryset = queryset.filter(archived=False)
        barangay = self.request.query_params.get('barangay')
        if barangay:
            queryset = queryset.filter(barangay=barangay)
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)
        return queryset

    def _actor_name(self, request):
        return request.data.get('reviewed_by') or (request.user.name if hasattr(request, 'user') and hasattr(request.user, 'name') else 'Admin')

    @action(detail=True, methods=['post'])
    def approve(self, request, area_id=None):
        area = self.get_object()
        if area.status != 'pending':
            return Response({'error': 'Area is not pending approval'}, status=status.HTTP_400_BAD_REQUEST)
        area.status = 'approved'
        area.reviewed_by = self._actor_name(request)
        area.date_reviewed = timezone.now()
        area.save()
        return Response(CollectionAreaSerializer(area).data)

    @action(detail=True, methods=['post'])
    def decline(self, request, area_id=None):
        area = self.get_object()
        if area.status != 'pending':
            return Response({'error': 'Area is not pending approval'}, status=status.HTTP_400_BAD_REQUEST)
        reason = (request.data.get('reason') or '').strip()
        area.status = 'declined'
        area.decline_reason = reason
        area.reviewed_by = self._actor_name(request)
        area.date_reviewed = timezone.now()
        area.save()
        return Response(CollectionAreaSerializer(area).data)

    def destroy(self, request, *args, **kwargs):
        area = self.get_object()
        area.archived = True
        area.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeploymentScheduleViewSet(viewsets.ModelViewSet):
    queryset = DeploymentSchedule.objects.all()
    serializer_class = DeploymentScheduleSerializer


class PriorityAreaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PriorityArea.objects.order_by('-identified_at')
    serializer_class = PriorityAreaSerializer


class LandfillRecordViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = LandfillRecord.objects.all()
    serializer_class = LandfillRecordSerializer


class RecyclingRecordViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = RecyclingRecord.objects.all()
    serializer_class = RecyclingRecordSerializer


class SegregationRecordViewSet(viewsets.ModelViewSet):
    queryset = SegregationRecord.objects.all()
    serializer_class = SegregationRecordSerializer


class AuditLogViewSet(viewsets.ModelViewSet):
    queryset = AuditLog.objects.all().order_by('-id')
    serializer_class = AuditLogSerializer

    def perform_create(self, serializer):
        ip = self.request.META.get('REMOTE_ADDR') or '-'
        time_str = timezone.localtime().strftime('%b %d, %Y %I:%M %p')
        serializer.save(
            time=serializer.validated_data.get('time') or time_str,
            ip=serializer.validated_data.get('ip') or ip,
        )


class HeatmapDataViewSet(viewsets.ModelViewSet):
    queryset = HeatmapData.objects.all()
    serializer_class = HeatmapDataSerializer


router = DefaultRouter()
router.register(r'boats', BoatViewSet)
router.register(r'users', UserViewSet)
router.register(r'operators', OperatorViewSet)
router.register(r'requests', RequestViewSet)
router.register(r'deployment-schedules', DeploymentScheduleViewSet)
router.register(r'priority-areas', PriorityAreaViewSet)
router.register(r'landfill-records', LandfillRecordViewSet)
router.register(r'recycling-records', RecyclingRecordViewSet)
router.register(r'segregation-records', SegregationRecordViewSet)
router.register(r'audit-logs', AuditLogViewSet)
router.register(r'heatmap-data', HeatmapDataViewSet)
router.register(r'collection-areas', CollectionAreaViewSet)
router.register(r'notifications', NotificationViewSet)
