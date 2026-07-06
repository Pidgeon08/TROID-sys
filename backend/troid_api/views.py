from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.contrib.auth.hashers import check_password
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
        return Response({
            "id": user.id,
            "user_id": user.user_id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "status": user.status,
            "location": user.location,
        })
    except User.DoesNotExist:
        return Response({"error": "Invalid email or password"}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['POST'])
def log_detection(request):
    boat_id = request.data.get('boat_id')
    lat = request.data.get('latitude')
    lng = request.data.get('longitude')
    count = request.data.get('trash_count', 1)

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
            trash_count=count
        )
        return Response({"status": "Detection logged successfully"}, status=status.HTTP_201_CREATED)
    except Boat.DoesNotExist:
        return Response({"error": "Boat not found"}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
def get_heatmap_data(request):
    detections = DetectionEvent.objects.all()
    data = []
    for d in detections:
        weight = min(d.trash_count * 0.2, 1.0)
        data.append([d.latitude, d.longitude, weight])
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


class OperatorViewSet(viewsets.ModelViewSet):
    queryset = Operator.objects.all()
    serializer_class = OperatorSerializer


class RequestViewSet(viewsets.ModelViewSet):
    queryset = Request.objects.all()
    serializer_class = RequestSerializer
    lookup_field = 'request_id'

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
        req.status = 'declined'
        req.save()
        StatusHistory.objects.create(
            request=req,
            label='Declined',
            date=timezone.now(),
            actor=request.user.name if hasattr(request, 'user') and hasattr(request.user, 'name') else 'User',
            role=request.user.role if hasattr(request, 'user') and hasattr(request.user, 'role') else 'Unknown',
            state='current'
        )
        return Response({'status': req.status})


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
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer


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
