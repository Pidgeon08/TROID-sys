import re
import secrets
import string

from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.contrib.auth.hashers import check_password
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone

try:
    from rest_framework.routers import DefaultRouter
except ImportError:
    from rest_framework.routers import DefaultRouter

from .models import (
    Boat, DetectionEvent, User, Operator, Request, DeploymentSchedule,
    LandfillRecord, RecyclingRecord, SegregationRecord,
    AuditLog, HeatmapData, Photo, StatusHistory
)
from .serializers import (
    BoatSerializer, UserSerializer, OperatorSerializer, RequestSerializer,
    DeploymentScheduleSerializer, LandfillRecordSerializer, RecyclingRecordSerializer,
    SegregationRecordSerializer, AuditLogSerializer, HeatmapDataSerializer, LoginSerializer
)

SPECIAL_CHARS = '!@#$%^&*()-_=+?'


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

        DetectionEvent.objects.create(
            boat=boat,
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

    detections = DetectionEvent.objects.filter(is_verified=True)

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


class RequestViewSet(viewsets.ModelViewSet):
    queryset = Request.objects.all()
    serializer_class = RequestSerializer
    lookup_field = 'request_id'

    def get_queryset(self):
        queryset = Request.objects.all()
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
        return Response({'status': req.status})

    @action(detail=True, methods=['post'])
    def decline(self, request, request_id=None):
        req = self.get_object()
        reason = (request.data.get('reason') or '').strip()
        req.status = 'declined'
        req.decline_reason = reason
        req.save()
        StatusHistory.objects.create(
            request=req,
            label='Declined',
            date=timezone.now(),
            actor=request.user.name if hasattr(request, 'user') and hasattr(request.user, 'name') else 'User',
            role=request.user.role if hasattr(request, 'user') and hasattr(request.user, 'role') else 'Unknown',
            state='current',
            details=reason,
        )
        return Response({'status': req.status, 'decline_reason': req.decline_reason})

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


class DeploymentScheduleViewSet(viewsets.ModelViewSet):
    queryset = DeploymentSchedule.objects.all()
    serializer_class = DeploymentScheduleSerializer


class LandfillRecordViewSet(viewsets.ModelViewSet):
    queryset = LandfillRecord.objects.all()
    serializer_class = LandfillRecordSerializer


class RecyclingRecordViewSet(viewsets.ModelViewSet):
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
router.register(r'landfill-records', LandfillRecordViewSet)
router.register(r'recycling-records', RecyclingRecordViewSet)
router.register(r'segregation-records', SegregationRecordViewSet)
router.register(r'audit-logs', AuditLogViewSet)
router.register(r'heatmap-data', HeatmapDataViewSet)
